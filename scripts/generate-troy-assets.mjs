import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { normalizeCompletedWav } from '../app/lib/wav.js';
// Explicit execution generates missing assets and spends provider credits.
const root = resolve(import.meta.dirname, '..');
const env = await readFile(resolve(root, '.env'), 'utf8').catch(() => '');
const value = name => process.env[name] || env.split(/\r?\n/).find(line => line.startsWith(`${name}=`))?.slice(name.length + 1).trim().replace(/^['"]|['"]$/g, '');
const directory = resolve(root, 'public/troy');
await mkdir(directory, { recursive: true });
const manifest = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8').catch(() => '{"assets":[]}'));
const jobs = [
  { name: 'cover.jpg', model: 'gemini-3.1-flash-image', prompt: 'Original cinematic game key art, landscape 16:9, no typography or logos. TROY: a beautiful ancient Greek coastal city being built from scratch against impossible odds. On the right third a courageous young Greek female city founder with olive skin, dark braided hair, bronze bracers, ivory linen tunic and rich teal cape holds a rolled architectural plan and a bronze sword at her hip. She surveys marble construction sites, partly built Doric temples, terracotta houses, slender stone watchtowers, timber cranes and golden dust in sunlight. A mysterious enormous wooden Trojan Horse waits beyond the distant gate, barely noticed, ominous but with playful adventure tone. Turquoise Aegean sea, olive trees, warm peach sunset, fine painterly realistic stylized 3D game art, gorgeous materials, bronze-gold highlights. Left third dark teal atmospheric negative space suitable for overlay heading. Rich depth, cinematic lighting, sophisticated detail. No volcano, no modern elements, no recognizable copyrighted game characters, no letters or watermark.' },
  { name: 'intro.wav', model: 'default', text: 'Troy begins with us. Raise a house, finish contracts, and build as much as you can before the bell. Raiders are coming. Keep your sword close, and be careful what you let through the gates.' },
];
await Promise.all(jobs.map(async job => {
  const path = resolve(directory, job.name);
  if (await readFile(path).then(() => true).catch(() => false)) { console.log(`Preserved ${job.name}`); return; }
  let bytes;
  if (job.text) {
    const response = await fetch('https://api.gradium.ai/api/post/speech/tts', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': value('GRADIUM_API_KEY') }, body: JSON.stringify({ text: job.text, voice_id: value('GRADIUM_VOICE_ID') || 'YTpq7expH9539ERJ', model_name: job.model, output_format: 'wav', only_audio: true }), signal: AbortSignal.timeout(90000) });
    if (!response.ok) throw new Error(`Gradium HTTP ${response.status}`);
    bytes = normalizeCompletedWav(new Uint8Array(await response.arrayBuffer()));
  } else {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': value('GEMINI_API_KEY') }, body: JSON.stringify({ model: job.model, input: job.prompt, store: false, response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: '16:9', image_size: '2K' } }), signal: AbortSignal.timeout(240000) });
    if (!response.ok) throw new Error(`Google HTTP ${response.status}`);
    const result = await response.json();
    const part = (result.steps || []).filter(s => s.type === 'model_output').flatMap(s => s.content || []).findLast(p => p.type === 'image' && p.data);
    if (!part) throw new Error('No completed image returned');
    bytes = Buffer.from(part.data, 'base64');
  }
  await writeFile(path, bytes);
  manifest.assets = [...manifest.assets.filter(a => a.path !== job.name), { path: job.name, model: job.model, provider: job.text ? 'Gradium' : 'Google', prompt: job.prompt || job.text, bytes: bytes.length, generatedAt: new Date().toISOString() }];
  console.log(`Generated ${job.name}: ${bytes.length} bytes`);
}));
await writeFile(resolve(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
