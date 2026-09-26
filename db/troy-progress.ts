import type { D1Database } from '@cloudflare/workers-types';
import { RequestError } from '../app/lib/api-guard';
import { calculateXP, getRank, type ProgressProfile, type XPBreakdown } from '../app/troy/progression';
import type { EndingKind, RunState } from '../app/troy/types';

// Keep runtime initialization aligned with the generated migration. Each prepare
// contains one statement; D1 batch executes all receipt/profile mutations atomically.
export const PROFILE_SCHEMA = `CREATE TABLE IF NOT EXISTS troy_profiles (
  user_id TEXT PRIMARY KEY NOT NULL, xp INTEGER NOT NULL DEFAULT 0,
  best INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0,
  runs INTEGER NOT NULL DEFAULT 0, clears INTEGER NOT NULL DEFAULT 0,
  stage INTEGER NOT NULL DEFAULT 1, endings TEXT NOT NULL DEFAULT '[]',
  last_ending TEXT, updated_at INTEGER NOT NULL DEFAULT 0
)`;
export const RECEIPT_SCHEMA = `CREATE TABLE IF NOT EXISTS troy_run_receipts (
  run_id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, stage INTEGER NOT NULL,
  xp INTEGER NOT NULL, xp_before INTEGER NOT NULL, breakdown TEXT NOT NULL,
  score INTEGER NOT NULL, ending TEXT NOT NULL, outcome TEXT NOT NULL,
  applied INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
)`;

type ProfileRow = { user_id: string; xp: number; best: number; total: number; runs: number; clears: number; stage: number; endings: string; last_ending: EndingKind | null };
type ReceiptRow = { run_id: string; user_id: string; xp: number; xp_before: number; breakdown: string; applied: number };

const profileFrom = (row: ProfileRow): ProgressProfile => ({
  xp: row.xp, best: row.best, total: row.total, runs: row.runs, clears: row.clears,
  stage: row.stage, endings: JSON.parse(row.endings) as EndingKind[],
  ...(row.last_ending ? { lastEnding: row.last_ending } : {}),
});

export async function initializeProgress(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare(PROFILE_SCHEMA), db.prepare(RECEIPT_SCHEMA),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_troy_run_receipts_user_id ON troy_run_receipts(user_id)'),
  ]);
}

export async function readProgress(db: D1Database, userId: string): Promise<ProgressProfile> {
  await db.prepare('INSERT OR IGNORE INTO troy_profiles (user_id) VALUES (?)').bind(userId).run();
  const row = await db.prepare('SELECT * FROM troy_profiles WHERE user_id = ?').bind(userId).first<ProfileRow>();
  if (!row) throw new Error('Progress profile unavailable.');
  return profileFrom(row);
}

export async function saveRun(db: D1Database, userId: string, runId: string, state: RunState): Promise<{ profile: ProgressProfile; xpAwarded: XPBreakdown; rankUp: boolean }> {
  const xp = calculateXP(state), now = Date.now();
  // The stage predicate applies only to NEW receipts. Retrying an old run still
  // returns its receipt after the player has advanced to another city.
  const result = await db.batch([
    db.prepare('INSERT OR IGNORE INTO troy_profiles (user_id) VALUES (?)').bind(userId),
    db.prepare(`INSERT OR IGNORE INTO troy_run_receipts
      (run_id, user_id, stage, xp, xp_before, breakdown, score, ending, outcome, created_at)
      SELECT ?, user_id, ?, ?, xp, ?, ?, ?, ?, ? FROM troy_profiles WHERE user_id = ? AND stage = ?`)
      .bind(runId, state.stage, xp.total, JSON.stringify(xp), state.score, state.ending, state.outcome, now, userId, state.stage),
    db.prepare(`UPDATE troy_profiles AS p SET
      xp = p.xp + r.xp,
      best = CASE WHEN r.outcome = 'legend' THEN MAX(p.best, r.score) ELSE p.best END,
      total = p.total + CASE WHEN r.outcome = 'legend' THEN r.score ELSE 0 END,
      runs = p.runs + 1, clears = p.clears + CASE WHEN r.outcome = 'legend' THEN 1 ELSE 0 END,
      stage = MIN(10000, p.stage + CASE WHEN r.outcome = 'legend' THEN 1 ELSE 0 END),
      endings = CASE WHEN r.outcome = 'legend' AND NOT EXISTS (SELECT 1 FROM json_each(p.endings) WHERE value = r.ending)
        THEN json_insert(p.endings, '$[#]', r.ending) ELSE p.endings END,
      last_ending = r.ending, updated_at = ?
      FROM troy_run_receipts AS r WHERE p.user_id = ? AND r.user_id = p.user_id AND r.run_id = ? AND r.applied = 0`)
      .bind(now, userId, runId),
    db.prepare('UPDATE troy_run_receipts SET applied = 1 WHERE run_id = ? AND user_id = ? AND applied = 0').bind(runId, userId),
    db.prepare('SELECT * FROM troy_profiles WHERE user_id = ?').bind(userId),
    db.prepare('SELECT * FROM troy_run_receipts WHERE run_id = ? AND user_id = ?').bind(runId, userId),
  ]);
  const profile = result[4].results[0] as ProfileRow | undefined;
  const receipt = result[5].results[0] as ReceiptRow | undefined;
  if (!receipt || !profile) throw new RequestError('This city has already advanced. Reload your expedition before starting another run.', 409);
  return {
    profile: profileFrom(profile), xpAwarded: JSON.parse(receipt.breakdown) as XPBreakdown,
    rankUp: getRank(receipt.xp_before).floor !== getRank(receipt.xp_before + receipt.xp).floor,
  };
}
