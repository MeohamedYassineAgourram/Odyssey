import { getD1 } from '../../../../db';
import { initializeProgress, readProgress, saveRun } from '../../../../db/troy-progress';
import { errorResponse, guardRequest, json, readJson, RequestError } from '../../../lib/api-guard';
import { readBlobProgress, saveBlobRun, blobProgressEnabled } from '../../../../db/troy-blob';
import { serverEnv } from '../../../lib/server-env';
import { validatedRun } from '../../../lib/troy-progress-validation';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function identity(request: Request): { id: string; cookie?: string } {
  const signedIn = serverEnv('VERCEL') || blobProgressEnabled() ? undefined : request.headers.get('oai-authenticated-user-id')?.trim();
  if (signedIn && signedIn.length <= 256) return { id: `oai:${signedIn}` };
  const existing = request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith('troy-player='))?.slice('troy-player='.length);
  if (existing && UUID.test(existing)) return { id: `anonymous:${existing}` };
  const id = crypto.randomUUID();
  return { id: `anonymous:${id}`, cookie: `troy-player=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}` };
}

function reply(body: unknown, cookie?: string): Response {
  const response = json(body);
  if (cookie) response.headers.set('Set-Cookie', cookie);
  return response;
}

export async function GET(request: Request): Promise<Response> {
  try {
    guardRequest(request, 'troy-progress-read', 90);
    const player = identity(request);
    if (blobProgressEnabled()) return reply({ profile: await readBlobProgress(player.id) }, player.cookie);
    const db = getD1();
    await initializeProgress(db);
    return reply({ profile: await readProgress(db, player.id) }, player.cookie);
  } catch (error) {
    if (error instanceof RequestError) return errorResponse(error);
    return json({ error: 'Saved progress is temporarily unavailable. Please retry.' }, 503);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    guardRequest(request, 'troy-progress-save', 30);
    const body = await readJson(request, 24_576);
    if (typeof body.runId !== 'string' || !UUID.test(body.runId)) throw new RequestError('A valid run ID is required.');
    const state = validatedRun(body.state);
    const player = identity(request);
    if (blobProgressEnabled()) return reply(await saveBlobRun(player.id, body.runId, state), player.cookie);
    const db = getD1();
    await initializeProgress(db);
    return reply(await saveRun(db, player.id, body.runId, state), player.cookie);
  } catch (error) {
    if (error instanceof RequestError) return errorResponse(error);
    return json({ error: 'Your run could not be saved yet. Retry to keep your experience.' }, 503);
  }
}
