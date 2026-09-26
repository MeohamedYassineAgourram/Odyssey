import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import Module, { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test, { after } from 'node:test';

const compiled = mkdtempSync(join(tmpdir(), 'troy-progress-tests-'));
after(() => rmSync(compiled, { recursive: true, force: true }));
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '--strict', '--target', 'ES2022', '--module', 'commonjs', '--moduleResolution', 'node', '--lib', 'esnext,dom', '--types', 'node', '--skipLibCheck', '--esModuleInterop', '--outDir', compiled, 'app/api/troy/progress/route.ts', 'app/troy/progression.ts', 'worker-configuration.d.ts'], { stdio: 'pipe' });
const require = createRequire(import.meta.url);
const runtime = { DB: undefined };
const originalLoad = Module._load;
let api;
try {
  Module._load = function (id, parent, isMain) {
    if (id === 'cloudflare:workers') return { env: runtime };
    if (id.startsWith('drizzle-orm')) return originalLoad.call(this, require.resolve(id), parent, isMain);
    return originalLoad.call(this, id, parent, isMain);
  };
  api = require(join(compiled, 'app/api/troy/progress/route.js'));
} finally { Module._load = originalLoad; }
const { EMPTY_PROFILE, RANKS, getRank, getRankLadder, calculateXP, applyRunResult } = require(join(compiled, 'app/troy/progression.js'));
const { createRun, advanceRun, buildAt, recordKill, gather, discoverLandmark, takeDamage } = require(join(compiled, 'app/troy/rules.js'));
const { initializeProgress, readProgress, saveRun } = require(join(compiled, 'db/troy-progress.js'));

// The adapter executes the production prepared SQL against real SQLite. Its batch
// is one transaction, like D1, so a failure cannot split receipt/profile updates.
class SQLiteD1 {
  constructor() { this.sql = new DatabaseSync(':memory:'); this.failOn = ''; }
  prepare(sql) {
    const make = (bindings = []) => ({
      sql, bindings,
      bind: (...values) => make(values),
      run: async () => this.execute(sql, bindings),
      all: async () => this.execute(sql, bindings),
      first: async () => this.execute(sql, bindings).results[0] ?? null,
    });
    return make();
  }
  execute(sql, bindings) {
    if (this.failOn && sql.includes(this.failOn)) throw new Error('Injected database outage');
    const statement = this.sql.prepare(sql);
    const results = statement.all(...bindings).map(row => ({ ...row }));
    return { success: true, results, meta: {} };
  }
  async batch(statements) {
    this.sql.exec('BEGIN IMMEDIATE');
    try {
      const results = statements.map(statement => this.execute(statement.sql, statement.bindings));
      this.sql.exec('COMMIT');
      return results;
    } catch (error) { this.sql.exec('ROLLBACK'); throw error; }
  }
}

const completed = (stage = 1, survived = true) => {
  let state = { ...createRun(19, undefined, stage), materials: { wood: 100, stone: 100, bronze: 100 } };
  for (const [index, kind] of ['house', 'farm', 'tower', 'temple'].entries()) state = buildAt(state, `p${index + 1}`, kind);
  for (let i = 0; i < 8; i++) { state = recordKill(state); state = gather(state, 'wood', 3); }
  state = discoverLandmark(state, 'landmark-1');
  return survived ? advanceRun(advanceRun(state, 120), 9) : takeDamage(state, 100);
};

test('XP includes all activity, defeats keep earned XP, and only survival advances the city', () => {
  const legend = completed(), fallen = completed(1, false), earned = calculateXP(legend);
  assert.deepEqual(calculateXP(createRun(1)), { buildings: 0, combat: 0, contracts: 0, exploration: 0, survival: 0, total: 0 });
  assert.equal(earned.buildings, 4 * 15);
  assert.equal(earned.combat, 8 * 8);
  assert.equal(earned.contracts, legend.completedMissions.length * 25);
  assert.equal(earned.exploration, 35);
  assert.equal(earned.survival, 150);
  assert.equal(earned.total, earned.buildings + earned.combat + earned.contracts + earned.exploration + earned.survival);
  const initial = Object.freeze({ ...EMPTY_PROFILE, endings: Object.freeze([]) });
  const defeat = applyRunResult(initial, fallen);
  assert.equal(defeat.xp, earned.total - 150);
  assert.equal(defeat.stage, 1);
  assert.equal(defeat.runs, 1);
  assert.equal(defeat.clears, 0);
  assert.equal(defeat.total, 0);
  assert.deepEqual(defeat.endings, []);
  const clear = applyRunResult(defeat, legend);
  assert.equal(clear.stage, 2);
  assert.equal(clear.runs, 2);
  assert.equal(clear.clears, 1);
  assert.equal(clear.total, legend.score);
  assert.equal(clear.best, legend.score);
  assert.deepEqual(clear.endings, [legend.ending]);
  assert.equal(applyRunResult(clear, legend), clear, 'stale cities cannot advance the profile again');
  assert.equal(initial.xp, 0);
});

test('rank ladder has nineteen increasing divisions, exact promotion boundaries and capped progress', () => {
  assert.equal(RANKS.length, 19);
  assert.equal(getRank(0).label, 'Recruit I');
  assert.equal(getRank(299).label, 'Recruit I');
  assert.equal(getRank(300).label, 'Recruit II');
  assert.equal(getRank(300).progress, 0);
  assert.equal(getRank(150).progress, .5);
  assert.equal(getRank(-100).progress, 0);
  assert.equal(getRank(NaN).label, 'Recruit I');
  assert.equal(getRank(1_000_000).name, 'Immortal');
  assert.equal(getRank(1_000_000).next, null);
  assert.equal(getRank(1_000_000).progress, 1);
  for (let i = 1; i < RANKS.length; i++) assert.ok(RANKS[i].floor > RANKS[i - 1].floor);
  assert.equal(getRankLadder().length, RANKS.length);
  assert.ok(calculateXP(completed()).total >= 300, 'an active first clear can earn the first promotion');
});

test('generated migration and runtime initialization produce matching SQLite tables', async () => {
  const runtimeDb = new SQLiteD1(), migrated = new DatabaseSync(':memory:');
  try {
    await initializeProgress(runtimeDb);
    migrated.exec(readFileSync('drizzle/0000_violet_cable.sql', 'utf8').replaceAll('--> statement-breakpoint', ''));
    for (const table of ['troy_profiles', 'troy_run_receipts']) {
      assert.deepEqual(runtimeDb.sql.prepare(`PRAGMA table_info(${table})`).all().map(row => ({ ...row })), migrated.prepare(`PRAGMA table_info(${table})`).all().map(row => ({ ...row })));
    }
    const plan = runtimeDb.sql.prepare('EXPLAIN QUERY PLAN SELECT * FROM troy_run_receipts WHERE user_id = ?').all('player');
    assert.match(plan.map(row => row.detail).join(' '), /idx_troy_run_receipts_user_id/);
  } finally { runtimeDb.sql.close(); migrated.close(); }
});

test('atomic receipts persist outcomes once, isolate players, and tolerate concurrent duplicate retries', async () => {
  const db = new SQLiteD1();
  try {
    await initializeProgress(db);
    const state = completed(), runId = randomUUID();
    assert.deepEqual(await readProgress(db, 'alice'), EMPTY_PROFILE);
    const results = await Promise.all(Array.from({ length: 8 }, () => saveRun(db, 'alice', runId, state)));
    assert.ok(results.every(result => result.profile.xp === calculateXP(state).total));
    assert.ok(results.every(result => result.rankUp));
    assert.equal((await readProgress(db, 'alice')).runs, 1);
    assert.equal((await readProgress(db, 'alice')).stage, 2);
    assert.deepEqual(await readProgress(db, 'bob'), EMPTY_PROFILE);
    await assert.rejects(saveRun(db, 'bob', runId, state), /already advanced/);
    await assert.rejects(saveRun(db, 'alice', randomUUID(), state), /already advanced/);
    const retry = await saveRun(db, 'alice', runId, state);
    assert.equal(retry.profile.runs, 1, 'old-stage retry returns its original receipt');
    const fallen = completed(2, false);
    const next = await saveRun(db, 'alice', randomUUID(), fallen);
    assert.equal(next.profile.stage, 2);
    assert.equal(next.profile.clears, 1);
    assert.equal(next.profile.runs, 2);
    assert.equal(next.profile.xp, calculateXP(state).total + calculateXP(fallen).total);
    assert.equal(next.profile.total, state.score);
    const receipts = db.sql.prepare('SELECT COUNT(*) AS count FROM troy_run_receipts').get();
    assert.equal(receipts.count, 2);
  } finally { db.sql.close(); }
});

test('database interruption rolls back receipt and XP together so retry awards exactly once', async () => {
  const db = new SQLiteD1();
  try {
    await initializeProgress(db);
    const state = completed(), runId = randomUUID();
    await readProgress(db, 'alice');
    db.failOn = 'UPDATE troy_profiles';
    await assert.rejects(saveRun(db, 'alice', runId, state), /outage/);
    db.failOn = '';
    assert.equal((await readProgress(db, 'alice')).xp, 0);
    assert.equal(db.sql.prepare('SELECT COUNT(*) AS count FROM troy_run_receipts').get().count, 0);
    const saved = await saveRun(db, 'alice', runId, state);
    assert.equal(saved.profile.runs, 1);
    assert.equal(saved.profile.xp, calculateXP(state).total);
  } finally { db.sql.close(); }
});

let requestId = 0;
const request = (body, headers = {}, method = 'POST') => new Request('https://troy.example/api/troy/progress', {
  method, headers: { 'content-type': 'application/json', origin: 'https://troy.example', 'cf-connecting-ip': `progress-test-${++requestId}`, ...headers },
  ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
});

test('progress API stores private identity, secure anonymous cookies, and idempotent run receipts', async () => {
  const db = new SQLiteD1(); runtime.DB = db;
  try {
    const get = await api.GET(request(undefined, {}, 'GET'));
    assert.equal(get.status, 200);
    assert.deepEqual((await get.json()).profile, EMPTY_PROFILE);
    assert.match(get.headers.get('set-cookie'), /HttpOnly/);
    assert.match(get.headers.get('set-cookie'), /Secure/);
    assert.match(get.headers.get('set-cookie'), /SameSite=Strict/);
    const cookie = get.headers.get('set-cookie').split(';')[0];
    const body = { runId: randomUUID(), state: { ...completed(), player: { x: 0, z: 0 }, paused: false } };
    const first = await api.POST(request(body, { cookie }));
    assert.equal(first.status, 200);
    assert.equal(first.headers.get('cache-control'), 'no-store');
    const saved = await first.json();
    assert.equal(saved.profile.stage, 2);
    assert.equal(saved.xpAwarded.total, calculateXP(body.state).total);
    const duplicate = await (await api.POST(request(body, { cookie }))).json();
    assert.deepEqual(duplicate, saved);
    const signedIn = { 'oai-authenticated-user-id': 'private-sites-player', cookie };
    assert.deepEqual((await (await api.GET(request(undefined, signedIn, 'GET'))).json()).profile, EMPTY_PROFILE, 'platform identity takes precedence over anonymous cookie');
    assert.equal((await api.POST(request({ ...body, runId: randomUUID() }, signedIn))).status, 200);
    assert.equal((await (await api.GET(request(undefined, signedIn, 'GET'))).json()).profile.stage, 2);
    assert.equal((await (await api.GET(request(undefined, { cookie }, 'GET'))).json()).profile.runs, 1);
  } finally { runtime.DB = undefined; db.sql.close(); }
});

test('progress validation rejects fabricated scores, inconsistent completion, unsafe context, and origin abuse', async () => {
  const db = new SQLiteD1(); runtime.DB = db;
  try {
    const state = completed(), body = { runId: randomUUID(), state };
    for (const invalid of [
      { ...body, runId: 'guess' }, { ...body, state: { ...state, phase: 'playing' } },
      { ...body, state: { ...state, score: state.score + 1000 } }, { ...body, state: { ...state, kills: 501 } },
      { ...body, state: { ...state, stage: 0 } }, { ...body, state: { ...state, health: 0 } },
      { ...body, state: { ...state, timeLeft: 1 } }, { ...body, state: { ...state, finaleTime: 8 } },
      { ...body, state: { ...state, ending: '__proto__' } }, { ...body, state: { ...state, completedMissions: [] } },
      { ...body, state: { ...state, explored: ['landmark-1', 'landmark-1'] } },
      { ...body, state: { ...state, buildings: [...state.buildings, state.buildings[0]] } },
      { ...body, state: { ...state, buildings: [{ plotId: 'p31', kind: 'house', builtAt: 0 }] } },
      { ...body, state: { ...state, materials: { ...state.materials, wood: Infinity } } },
    ]) assert.equal((await api.POST(request(invalid))).status, 400);
    assert.equal((await api.POST(request(body, { origin: 'https://elsewhere.example' }))).status, 403);
    assert.equal((await api.GET(request(undefined, { 'sec-fetch-site': 'cross-site' }, 'GET'))).status, 403);
    assert.equal((await api.POST(request(body, { 'content-type': 'text/plain' }))).status, 415);
    assert.equal((await api.POST(request({ ...body, excess: 'x'.repeat(25000) }))).status, 413);
    assert.equal((await api.POST(request({ runId: randomUUID(), state: completed(2) }))).status, 409);
    assert.equal(db.sql.prepare('SELECT COUNT(*) AS count FROM troy_run_receipts').get().count, 0);
  } finally { runtime.DB = undefined; db.sql.close(); }
});

test('missing database returns explicit 503 and never pretends to persist progress', async () => {
  runtime.DB = undefined;
  const get = await api.GET(request(undefined, {}, 'GET'));
  const post = await api.POST(request({ runId: randomUUID(), state: completed() }));
  assert.equal(get.status, 503);
  assert.equal(post.status, 503);
  assert.equal(get.headers.get('set-cookie'), null);
  assert.match((await post.json()).error, /could not be saved/);
});
