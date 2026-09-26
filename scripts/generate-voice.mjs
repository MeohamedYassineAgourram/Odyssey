import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { normalizeCompletedWav } from '../app/lib/wav.js';

// Explicit invocation generates the mission pack's briefings using Gradium.
// https://docs.gradium.ai/guides/text-to-speech-rest
const root = resolve(import.meta.dirname, '..');
const local = await readFile(resolve(root, '.env'), 'utf8').catch(() => '');
const setting = name => process.env[name] || local.split(/\r?\n/).find(line => line.startsWith(`${name}=`))?.slice(name.length + 1).trim().replace(/^['"]|['"]$/g, '');
const key = setting('GRADIUM_API_KEY');
if (!key) throw new Error('Set GRADIUM_API_KEY in the server environment first.');
const voice = setting('GRADIUM_VOICE_ID') || 'YTpq7expH9539ERJ';
const model = setting('GRADIUM_MODEL') || 'default';
const { missions } = JSON.parse(await readFile(resolve(root, 'app/game/generated-missions.json'), 'utf8'));
const directory = resolve(root, 'public/generated/voices');
await mkdir(directory, { recursive: true });
const manifest = { provider: 'Gradium', model, voice, generatedAt: new Date().toISOString(), assets: [] };
for (const mission of missions) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(mission.id) || typeof mission.briefing !== 'string' || mission.briefing.length > 180) throw new Error('Invalid mission input.');
  const text = `${mission.title}. ${mission.briefing}`;
  const response = await fetch('https://api.gradium.ai/api/post/speech/tts', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key },
    body: JSON.stringify({ text, voice_id: voice, model_name: model, output_format: 'wav', only_audio: true }),
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gradium ${response.status}: ${body.replaceAll(key, '[redacted]').slice(0, 500)}`);
  }
  const audio = Buffer.from(await response.arrayBuffer());
  if (audio.length < 44 || audio.subarray(0, 4).toString() !== 'RIFF' || audio.subarray(8, 12).toString() !== 'WAVE') throw new Error('Gradium returned invalid WAV data.');
  normalizeCompletedWav(audio);
  const path = `${mission.id}.wav`;
  await writeFile(resolve(directory, path), audio);
  manifest.assets.push({ path, text, bytes: audio.length });
  await writeFile(resolve(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({ generated: path, bytes: audio.length }));
}
