import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import Module, { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';

const compiled = mkdtempSync(join(tmpdir(), 'troy-blob-tests-'));
after(() => rmSync(compiled, { recursive: true, force: true }));
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '--strict', '--target', 'ES2022', '--module', 'commonjs', '--moduleResolution', 'node', '--lib', 'esnext,dom', '--types', 'node', '--skipLibCheck', '--esModuleInterop', '--outDir', compiled, 'app/api/troy/progress/route.ts', 'worker-configuration.d.ts'], { stdio: 'pipe' });

class PreconditionFailed extends Error {}
class BlobStore {
  blobs = new Map();
  reads = 0;
  writes = 0;
  conflicts = 0;
  failRead = false;
  failWrite = false;
  failAfterWrite = false;
  forceConflicts = false;
  async get(path, options) {
    assert.equal(options.access, 'private');
    assert.equal(options.useCache, false);
    assert.ok(options.abortSignal instanceof AbortSignal);
    assert.equal(options.token, 'test-only');
    assert.match(path, /^troy\/campaigns\/v1\/[0-9a-f]{64}\.json$/);
    this.reads++;
    if (this.failRead) throw new Error('Read unavailable');
    const stored = this.blobs.get(path);
    // Capture before yielding to simulate overlapping serverless reads.
    await Promise.resolve();
    return stored ? {
      statusCode: 200,
      stream: new Response(stored.content).body,
      blob: { etag: stored.etag, size: Buffer.byteLength(stored.content) },
    } : null;
  }
  async put(path, content, options) {
    assert.equal(options.access, 'private');
    assert.equal(options.addRandomSuffix, false);
    assert.equal(options.contentType, 'application/json');
    assert.ok(options.abortSignal instanceof AbortSignal);
    assert.equal(options.token, 'test-only');
    await Promise.resolve();
    if (this.failWrite) throw new Error('Write unavailable');
    const stored = this.blobs.get(path);
    if (options.ifMatch) {
      assert.equal(options.allowOverwrite, true);
      if (this.forceConflicts || stored?.etag !== options.ifMatch) {
        this.conflicts++;
        throw new PreconditionFailed();
      }
    } else {
      assert.equal(options.allowOverwrite, false);
      if (stored) { this.conflicts++; throw new Error('Blob already exists'); }
    }
    this.writes++;
    this.blobs.set(path, { content, etag: `"revision-${this.writes}"` });
    if (this.failAfterWrite) { this.failAfterWrite = false; throw new Error('Response interrupted after commit'); }
    return { etag: `"revision-${this.writes}"` };
  }
}

const require = createRequire(import.meta.url), originalLoad = Module._load;
let store = new BlobStore(), api, persistence;
try {
  Module._load = function (id, parent, isMain) {
    if (id === 'cloudflare:workers') return { env: {} };
    if (id === '@vercel/blob') return { get: (...args) => store.get(...args), put: (...args) => store.put(...args), BlobPreconditionFailedError: PreconditionFailed };
    if (id.startsWith('drizzle-orm')) return originalLoad.call(this, require.resolve(id), parent, isMain);
    return originalLoad.call(this, id, parent, isMain);
  };
  api = require(join(compiled, 'app/api/troy/progress/route.js'));
  persistence = require(join(compiled, 'db/troy-blob.js'));
} finally { Module._load = originalLoad; }
const { readBlobProgress, saveBlobRun } = persistence;
const { EMPTY_PROFILE, calculateXP } = require(join(compiled, 'app/troy/progression.js'));
const { createRun, takeDamage, collectWeapon, recordKill, advanceRun, defeatBoss } = require(join(compiled, 'app/troy/rules.js'));
const { guardRequest } = require(join(compiled, 'app/lib/api-guard.js'));
const fallen = (stage = 1) => takeDamage(recordKill(collectWeapon(createRun(9, undefined, stage), 'bow')), 100);
const legend = (stage = 1) => advanceRun(advanceRun(defeatBoss(advanceRun(createRun(9, undefined, stage), 90)), 30), 9);
let requestNumber = 0;
const request = (body, headers = {}, method = 'POST') => new Request('https://troy.example/api/troy/progress', {
  method, headers: { 'content-type': 'application/json', origin: 'https://troy.example', 'x-vercel-forwarded-for': `203.0.113.${++requestNumber}`, ...headers },
  ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
});
const freshStore = () => {
  store = new BlobStore();
  process.env.VERCEL = '1';
  process.env.BLOB_READ_WRITE_TOKEN = 'test-only';
  delete process.env.TROY_STORAGE;
};

test('private Blob campaigns preserve XP, weapons, and player isolation without exposing storage identifiers', async () => {
  freshStore();
  assert.deepEqual(await readBlobProgress('alice'), EMPTY_PROFILE);
  assert.equal(store.writes, 0, 'a new empty campaign needs no speculative write');
  const id = randomUUID(), saved = await saveBlobRun('alice', id, fallen());
  assert.equal(saved.profile.runs, 1);
  assert.equal(saved.profile.xp, calculateXP(fallen()).total);
  assert.deepEqual(saved.profile.weapons, ['sword', 'bow']);
  assert.deepEqual(await readBlobProgress('alice'), saved.profile);
  assert.deepEqual(await readBlobProgress('bob'), EMPTY_PROFILE);
  await saveBlobRun('bob', id, legend());
  assert.equal((await readBlobProgress('bob')).stage, 2);
  assert.equal((await readBlobProgress('alice')).stage, 1);
  assert.equal(store.blobs.size, 2);
});

test('overlapping first saves award a duplicate receipt exactly once and old retries retain their original award', async () => {
  freshStore();
  const id = randomUUID(), state = legend();
  const results = await Promise.all(Array.from({ length: 8 }, () => saveBlobRun('alice', id, state)));
  assert.ok(results.every(result => result.profile.runs === 1 && result.profile.stage === 2));
  assert.equal(store.writes, 1);
  assert.ok(store.conflicts > 0);
  const next = await saveBlobRun('alice', randomUUID(), legend(2));
  const retry = await saveBlobRun('alice', id, state);
  assert.equal(retry.profile.stage, 3);
  assert.equal(retry.profile.xp, next.profile.xp);
  assert.deepEqual(retry.xpAwarded, results[0].xpAwarded);
  assert.equal(retry.rankUp, results[0].rankUp);
  assert.equal(store.writes, 2);
});

test('ETag retries retain every concurrent fallen run while competing city clears advance once', async () => {
  freshStore();
  await saveBlobRun('alice', randomUUID(), fallen());
  await Promise.all(Array.from({ length: 8 }, () => saveBlobRun('alice', randomUUID(), fallen())));
  const profile = await readBlobProgress('alice');
  assert.equal(profile.runs, 9);
  assert.equal(profile.xp, 9 * calculateXP(fallen()).total);
  assert.ok(store.conflicts > 0);
  const clears = await Promise.allSettled([saveBlobRun('alice', randomUUID(), legend()), saveBlobRun('alice', randomUUID(), legend())]);
  assert.equal(clears.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(clears.find(result => result.status === 'rejected').reason.status, 409);
  assert.equal((await readBlobProgress('alice')).stage, 2);
  assert.equal((await readBlobProgress('alice')).runs, 10);
  await assert.rejects(saveBlobRun('alice', randomUUID(), fallen()), { status: 409 });
});

test('failed and interrupted writes cannot split a profile from its receipt or award retries twice', async () => {
  freshStore();
  const id = randomUUID();
  store.failWrite = true;
  await assert.rejects(saveBlobRun('alice', id, fallen()), /unavailable/);
  assert.equal(store.blobs.size, 0);
  store.failWrite = false;
  store.failAfterWrite = true;
  const created = await saveBlobRun('alice', id, fallen());
  assert.equal(created.profile.runs, 1, 'first-create response loss is confirmed by rereading its receipt');
  assert.equal(store.writes, 1);
  const nextId = randomUUID();
  store.failAfterWrite = true;
  await assert.rejects(saveBlobRun('alice', nextId, fallen()), /interrupted/);
  const retried = await saveBlobRun('alice', nextId, fallen());
  assert.equal(retried.profile.runs, 2);
  assert.equal(retried.profile.xp, 2 * calculateXP(fallen()).total);
  assert.equal(store.writes, 2);
});

test('CAS contention is bounded and corrupt storage never resets or overwrites an existing campaign', async () => {
  freshStore();
  await saveBlobRun('alice', randomUUID(), fallen());
  const original = [...store.blobs.values()][0].content;
  store.forceConflicts = true;
  await assert.rejects(saveBlobRun('alice', randomUUID(), fallen()), { status: 503 });
  assert.equal(store.conflicts, 12);
  assert.equal(store.writes, 1);
  assert.equal([...store.blobs.values()][0].content, original);
  store.forceConflicts = false;
  for (const content of ['{broken', '{"version":1,"profile":{},"receipts":{}}']) {
    store.blobs.set([...store.blobs.keys()][0], { content, etag: 'corrupt' });
    await assert.rejects(readBlobProgress('alice'));
    await assert.rejects(saveBlobRun('alice', randomUUID(), fallen()));
  }
  assert.equal(store.writes, 1);
});

test('public Vercel API selects Blob, ignores spoofed platform identity, and keeps secure anonymous cookies', async () => {
  freshStore();
  const initial = await api.GET(request(undefined, { 'oai-authenticated-user-id': 'forged' }, 'GET'));
  assert.equal(initial.status, 200);
  const cookieHeader = initial.headers.get('set-cookie');
  assert.match(cookieHeader, /HttpOnly/);
  assert.match(cookieHeader, /Secure/);
  assert.match(cookieHeader, /SameSite=Strict/);
  const cookie = cookieHeader.split(';')[0], body = { runId: randomUUID(), state: legend() };
  const saved = await api.POST(request(body, { cookie, 'oai-authenticated-user-id': 'forged' }));
  assert.equal(saved.status, 200);
  assert.equal(saved.headers.get('cache-control'), 'no-store');
  const result = await saved.json();
  assert.equal(result.profile.stage, 2);
  const read = await api.GET(request(undefined, { cookie, 'oai-authenticated-user-id': 'another-forged-user' }, 'GET'));
  assert.deepEqual((await read.json()).profile, result.profile);
  delete process.env.VERCEL;
  process.env.TROY_STORAGE = 'vercel-blob';
  const local = await api.GET(request(undefined, { cookie, 'oai-authenticated-user-id': 'local-forgery' }, 'GET'));
  assert.deepEqual((await local.json()).profile, result.profile, 'native local Blob mode also ignores Sites identity headers');
  assert.equal((await api.POST(request({ ...body, state: { ...body.state, score: 0 } }, { cookie }))).status, 400);
  assert.equal((await api.POST(request(body, { cookie, origin: 'https://attacker.example' }))).status, 403);
  assert.equal((await api.POST(request({ ...body, excess: 'x'.repeat(25000) }, { cookie }))).status, 413);
  assert.equal(store.writes, 1);
});

test('storage outages return explicit 503 with no cookie or fake saved campaign', async () => {
  freshStore();
  store.failRead = true;
  const get = await api.GET(request(undefined, {}, 'GET'));
  const post = await api.POST(request({ runId: randomUUID(), state: fallen() }));
  assert.equal(get.status, 503);
  assert.equal(post.status, 503);
  assert.equal(get.headers.get('set-cookie'), null);
  assert.equal(post.headers.get('set-cookie'), null);
  assert.match((await post.json()).error, /could not be saved/);
  assert.equal(store.writes, 0);
  delete process.env.VERCEL;
  process.env.TROY_STORAGE = 'vercel-blob';
  assert.equal(persistence.blobProgressEnabled(), true);
});

test('rate limiting trusts only the active platform client-IP header and never partitions paid calls by cookie', () => {
  freshStore();
  const first = { 'x-vercel-forwarded-for': '203.0.113.210', 'cf-connecting-ip': 'spoofed-cf-ip', cookie: `troy-player=${randomUUID()}` };
  guardRequest(request(undefined, first, 'GET'), 'blob-test-provider', 1);
  assert.throws(() => guardRequest(request(undefined, { ...first, cookie: `troy-player=${randomUUID()}`, 'cf-connecting-ip': 'another-spoofed-ip' }, 'GET'), 'blob-test-provider', 1), { status: 429 });
  assert.doesNotThrow(() => guardRequest(request(undefined, { ...first, 'x-vercel-forwarded-for': '203.0.113.211' }, 'GET'), 'blob-test-provider', 1));
  delete process.env.VERCEL;
  const site = { 'cf-connecting-ip': '203.0.113.212' };
  guardRequest(request(undefined, site, 'GET'), 'blob-test-sites', 1);
  assert.throws(() => guardRequest(request(undefined, { ...site, 'x-vercel-forwarded-for': 'untrusted' }, 'GET'), 'blob-test-sites', 1), { status: 429 });
});
