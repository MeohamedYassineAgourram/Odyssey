import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

// Explicitly run this command to spend Google credits and regenerate these assets.
// Official API: https://ai.google.dev/gemini-api/docs/image-generation
// https://ai.google.dev/gemini-api/docs/structured-output
const root = resolve(import.meta.dirname, '..');
const local = await readFile(resolve(root, '.env'), 'utf8').catch(() => '');
const fromFile = name => local.split(/\r?\n/).find(line => line.startsWith(`${name}=`))?.slice(name.length + 1).trim().replace(/^['"]|['"]$/g, '');
const key = process.env.GEMINI_API_KEY || fromFile('GEMINI_API_KEY');
if (!key) throw new Error('Set GEMINI_API_KEY in the server environment first.');
const mode = process.argv[2];
if (!['missions', 'sky', 'all'].includes(mode)) throw new Error('Usage: node scripts/generate-resources.mjs missions|sky|all');
const endpoint = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const directory = resolve(root, 'public/generated');
await mkdir(directory, { recursive: true });
const manifestPath = resolve(directory, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8').catch(() => '{"assets":[]}'));
async function generate(body, timeout) {
  const response = await fetch(endpoint, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ ...body, store: false }), signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) {
    const failure = await response.json().catch(() => null);
    const message = String(failure?.error?.message || failure?.message || 'Generation failed').replaceAll(key, '[redacted]');
    throw new Error(`Google ${response.status}: ${message}`);
  }
  const result = await response.json();
  if (result.status !== 'completed') throw new Error(`Generation did not complete (${result.status || 'unknown'}).`);
  return { result, parts: (result.steps || []).filter(step => step.type === 'model_output').flatMap(step => step.content || []) };
}
async function record(asset) {
  manifest.assets = [...manifest.assets.filter(item => item.path !== asset.path), { ...asset, generatedAt: new Date().toISOString(), provider: 'Google Gemini' }];
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}
if (mode === 'missions' || mode === 'all') {
  const model = 'gemini-3.8-flash';
  const prompt = `Write exactly three distinct selectable missions for ECHO SHIFT, a premium 3D hovercraft game. Setting: an endless dark teal ocean, floating basalt ruins, luminous cyan crystals and ancient lime circular portals. Voice: restrained, evocative science fiction radio, no jokes or marketing cliches. Each mission has a lowercase kebab-case id, a two or three-word title (at most 26 characters), a briefing addressed to the pilot (at most 150 characters), and one event chosen from calm, storm, riches. Use one calm mission, one storm mission, one riches mission. The game always lasts 90 seconds, requires collecting at least 12 shards and surviving with shield remaining; do not invent enemies, items, maps or unsupported mechanics. The chosen event lasts the first 15 seconds only. Calm clears distant hazards and slows down, storm increases hazards and storm weather, riches doubles shard pickup and turns distant hazards into crystals. Make each briefing describe its supported starting event accurately and mention the 12-shard survival objective. Output only the requested JSON.`;
  const schema = { type: 'object', properties: { missions: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, briefing: { type: 'string' }, event: { type: 'string', enum: ['calm', 'storm', 'riches'] } }, required: ['id', 'title', 'briefing', 'event'], additionalProperties: false } } }, required: ['missions'], additionalProperties: false };
  const { result, parts } = await generate({ model, input: prompt, generation_config: { max_output_tokens: 1800, thinking_level: 'low' }, response_format: { type: 'text', mime_type: 'application/json', schema } }, 45000);
  const pack = JSON.parse(parts.filter(p => p.type === 'text').map(p => p.text).join(''));
  if (!Array.isArray(pack.missions) || pack.missions.length !== 3 || !pack.missions.every(m => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(m.id) && typeof m.title === 'string' && m.title.length <= 36 && typeof m.briefing === 'string' && m.briefing.length <= 180 && ['calm', 'storm', 'riches'].includes(m.event)) || new Set(pack.missions.map(m => m.id)).size !== 3 || new Set(pack.missions.map(m => m.event)).size !== 3) throw new Error('Generated missions failed game constraints. Existing assets were preserved.');
  await writeFile(resolve(root, 'app/game/generated-missions.json'), JSON.stringify(pack, null, 2) + '\n');
  await record({ path: 'app/game/generated-missions.json', model, prompt, usage: result.usage });
  console.log(JSON.stringify({ generated: 'missions', model, titles: pack.missions.map(m => m.title) }));
}
if (mode === 'sky' || mode === 'all') {
  const model = 'gemini-3.1-flash-image';
  const prompt = `Generate an ultra-wide panoramic sky texture for the playable 3D game ECHO SHIFT. Sky only, no ground or ocean. Atmospheric science-fiction dawn sky, muted deep teal and ink-blue zenith transitioning smoothly into hazy dusty peach and pale desaturated mint near the bottom horizon. Elegant long wispy clouds, layered volumetric cloud banks far in the distance, subtle faint aurora, soft ambient light. High-end stylized 3D game environment art, painterly but physically plausible atmospheric detail. The composition is a continuous horizon panorama, horizon kept entirely at the bottom edge. No sun disk (the game renders its own sun), no buildings, islands, terrain, spaceships, planets, circles, portals, characters, typography, logos, UI or watermark. Avoid overly bright highlights, saturated purple, star fields and hard outlines. Quiet detailed sky, subtle variations, low contrast so in-game cyan crystals and lime portals stay legible. Both left and right edges should match seamlessly. Image is used as a distant sky sphere backdrop.`;
  const { result, parts } = await generate({ model, input: prompt, response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: '21:9', image_size: '2K' } }, 180000);
  const asset = parts.findLast(part => part.type === 'image' && part.data);
  if (!asset || asset.mime_type !== 'image/jpeg') throw new Error('Google did not return a JPEG image. Existing sky was preserved.');
  const bytes = Buffer.from(asset.data, 'base64');
  if (bytes.length < 10000 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('Generated JPEG was invalid.');
  await writeFile(resolve(directory, 'drift-sky.jpg'), bytes);
  await record({ path: 'public/generated/drift-sky.jpg', model, prompt, usage: result.usage });
  console.log(JSON.stringify({ generated: 'sky', model, bytes: bytes.length }));
}
