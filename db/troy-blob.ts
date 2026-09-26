import { createHash } from 'node:crypto';
import { BlobPreconditionFailedError, get, put } from '@vercel/blob';
import { RequestError } from '../app/lib/api-guard';
import { serverEnv } from '../app/lib/server-env';
import { ENDINGS, WEAPONS } from '../app/troy/config';
import { applyRunResult, calculateXP, EMPTY_PROFILE, getRank, type ProgressProfile, type XPBreakdown } from '../app/troy/progression';
import type { RunState } from '../app/troy/types';

type Receipt = { xpAwarded: XPBreakdown; rankUp: boolean };
type Campaign = { version: 1; profile: ProgressProfile; receipts: Record<string, Receipt> };
type SavedRun = Receipt & { profile: ProgressProfile };
const MAX_BYTES = 8_388_608;
const MAX_ATTEMPTS = 12;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export function blobProgressEnabled(): boolean {
  return serverEnv('VERCEL') === '1' || serverEnv('TROY_STORAGE') === 'vercel-blob';
}

function pathname(userId: string): string {
  return `troy/campaigns/v1/${createHash('sha256').update(userId).digest('hex')}.json`;
}

function credentials(abortSignal: AbortSignal) {
  const token = serverEnv('BLOB_READ_WRITE_TOKEN');
  return { ...(token ? { token } : {}), abortSignal };
}

function campaignFrom(value: unknown): Campaign {
  if (!record(value) || value.version !== 1 || !record(value.profile) || !record(value.receipts)) throw new Error('Invalid stored campaign.');
  const profile = value.profile;
  if (!['xp', 'best', 'total', 'runs', 'clears', 'stage'].every(key => count(profile[key]))
    || Number(profile.stage) < 1 || Number(profile.stage) > 10_000
    || !Array.isArray(profile.weapons) || !profile.weapons.includes('sword') || profile.weapons.length > 3
    || profile.weapons.some(weapon => !WEAPONS.some(item => item.id === weapon))
    || !Array.isArray(profile.endings) || profile.endings.some(ending => typeof ending !== 'string' || !Object.hasOwn(ENDINGS, ending))
    || (profile.lastEnding !== undefined && (typeof profile.lastEnding !== 'string' || !Object.hasOwn(ENDINGS, profile.lastEnding)))) throw new Error('Invalid stored profile.');
  for (const [runId, receipt] of Object.entries(value.receipts)) {
    if (!UUID.test(runId) || !record(receipt) || typeof receipt.rankUp !== 'boolean' || !record(receipt.xpAwarded)
      || !['buildings', 'combat', 'contracts', 'exploration', 'survival', 'total'].every(key => count(receipt.xpAwarded && (receipt.xpAwarded as Record<string, unknown>)[key]))) throw new Error('Invalid stored receipt.');
  }
  return value as Campaign;
}

async function readCampaign(path: string, signal: AbortSignal): Promise<{ campaign: Campaign; etag?: string }> {
  // Bypass the CDN: stale reads must never decide which XP total to overwrite.
  const result = await get(path, { access: 'private', useCache: false, ...credentials(signal) });
  if (!result) return { campaign: { version: 1, profile: structuredClone(EMPTY_PROFILE), receipts: {} } };
  if (result.statusCode !== 200 || !result.blob.etag || result.blob.size > MAX_BYTES) throw new Error('Campaign storage returned an invalid response.');
  const reader = result.stream.getReader(), decoder = new TextDecoder();
  let bytes = 0, content = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) { await reader.cancel(); throw new Error('Campaign document is too large.'); }
      content += decoder.decode(value, { stream: true });
    }
    content += decoder.decode();
  } finally { reader.releaseLock(); }
  return { campaign: campaignFrom(JSON.parse(content)), etag: result.blob.etag };
}

export async function readBlobProgress(userId: string): Promise<ProgressProfile> {
  return (await readCampaign(pathname(userId), AbortSignal.timeout(12_000))).campaign.profile;
}

export async function saveBlobRun(userId: string, runId: string, state: RunState): Promise<SavedRun> {
  if (!UUID.test(runId)) throw new RequestError('A valid run ID is required.');
  const path = pathname(userId), signal = AbortSignal.timeout(12_000);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { campaign, etag } = await readCampaign(path, signal);
    const previous = campaign.receipts[runId];
    // A retry can arrive after a later city was cleared. Its award remains the
    // original receipt while its profile reflects the newest saved campaign.
    if (previous) return { profile: campaign.profile, ...previous };
    if (state.stage !== campaign.profile.stage) throw new RequestError('This city has already advanced. Reload your expedition before starting another run.', 409);
    const profile = applyRunResult(campaign.profile, state);
    if (profile === campaign.profile) throw new RequestError('Only completed runs can earn experience.');
    const receipt: Receipt = {
      xpAwarded: calculateXP(state),
      rankUp: getRank(campaign.profile.xp).floor !== getRank(profile.xp).floor,
    };
    const next = campaignFrom({ version: 1, profile, receipts: { ...campaign.receipts, [runId]: receipt } });
    const content = JSON.stringify(next);
    if (Buffer.byteLength(content) > MAX_BYTES) throw new Error('Campaign document is too large.');
    try {
      // The profile and receipt are one atomic object. Existing objects require
      // their read ETag; first writes forbid overwrite, so neither race loses XP.
      await put(path, content, {
        access: 'private', contentType: 'application/json', addRandomSuffix: false,
        allowOverwrite: Boolean(etag), ...(etag ? { ifMatch: etag } : {}),
        cacheControlMaxAge: 60, ...credentials(signal),
      });
      return { profile, ...receipt };
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError) continue;
      // The SDK exposes first-create conflicts as a general Blob error. Confirm
      // that another write now exists instead of guessing from an error string.
      // This also handles a successful create whose response was interrupted.
      if (!etag && (await readCampaign(path, signal)).etag) continue;
      throw error;
    }
  }
  throw new RequestError('Another save is still finishing. Retry to keep your experience.', 503);
}
