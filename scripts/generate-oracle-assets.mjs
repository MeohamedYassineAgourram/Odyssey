import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { normalizeCompletedWav } from '../app/lib/wav.js';

// Explicit execution spends provider credits. Secrets are never written to the manifest.
const root = resolve(import.meta.dirname, '..');
const env = await readFile(resolve(root, '.env'), 'utf8').catch(() => '');
const value = name => process.env[name] || env.split(/\r?\n/).find(line => line.startsWith(`${name}=`))?.slice(name.length + 1).trim().replace(/^['"]|['"]$/g, '');
const directory = resolve(root, 'public/oracle');
await mkdir(directory, { recursive: true });
const jobs = [
  { name: 'cover.jpg', aspect: '16:9', prompt: 'Original cinematic game key art for THE LAST ORACLE, no text or lettering. A young Greek woman courier with dark braided hair, ivory linen tunic, teal cloak and bronze bracers stands on a white marble sanctuary terrace overlooking an ancient Mediterranean village and turquoise sea. A distant volcanic island sends a dramatic ash plume into a luminous apricot sunset. Olive trees, bougainvillea, terracotta rooftops, Greek columns, small ships. Sophisticated stylized realistic painted game art, warm sun rays, atmospheric perspective, richly detailed stone and fabric, fine film grain. Hero on right third, uncluttered dark blue teal shadow on left third suitable for overlay title. Wide cinematic composition, original characters and setting, no modern elements, no copied franchise iconography.' },
  { name: 'lyra.jpg', aspect: '1:1', prompt: 'Original premium game character portrait, head and shoulders of Lyra, a courageous 25-year-old ancient Greek female courier, olive skin, hazel eyes, dark braided hair loosely tied back, ivory linen tunic, teal wool cloak with bronze clasp, small scratch on cheek. Quiet resolve, looking toward viewer. Painterly realistic 3D game concept art, Greek antiquity, bronze and teal palette, warm rim light, detailed skin and fabric, softly blurred dark teal background. No text, no logos, no frame. All original design.' },
  { name: 'mira.jpg', aspect: '1:1', prompt: 'Original premium game character portrait, head and shoulders of Mira, a kind but resolute 42-year-old ancient Greek female healer, warm olive skin, green eyes, curly chestnut hair gathered with an ivory cloth band, sage green linen robe and modest bronze pendant, sprig of medicinal herbs in hand. Looking toward viewer. Painterly realistic 3D game concept art, bronze and sage palette, warm rim light, detailed skin and fabric, softly blurred dark teal background. No text, no logos, no frame. All original design.' },
  { name: 'theron.jpg', aspect: '1:1', prompt: 'Original premium game character portrait, head and shoulders of Theron, a weathered 55-year-old ancient Greek shipwright, sun-tanned olive skin, short curly silver-black hair, short greying beard, strong brows, ochre linen tunic and leather shoulder strap, trustworthy wry expression. Looking toward viewer. Painterly realistic 3D game concept art, bronze and ochre palette, warm rim light, detailed skin and fabric, softly blurred dark teal background. No text, no logos, no frame. All original design.' },
  { name: 'marble.jpg', aspect: '1:1', prompt: 'Seamlessly tileable texture of warm pale ivory ancient Greek limestone and marble paving, delicate subtle beige weathering and fine natural veins, evenly illuminated orthographic top down PBR albedo texture, flat no perspective, no cast shadows, no border, no objects or text. Restrained small-scale detail suitable for 3D game sanctuary architecture.' },
  { name: 'sky.jpg', aspect: '21:9', prompt: 'Continuous panoramic sky texture for an ancient Mediterranean 3D game at late golden hour. Sky only. Soft faded blue upper sky, luminous apricot and warm golden haze toward bottom horizon, fine long wispy cloud banks and atmospheric delicate clouds. Natural quiet painterly realism. No sun disc, ground, buildings, sea, mountain, text or logos. Left and right edges should match seamlessly. Horizon entirely at bottom edge. Sophisticated muted atmosphere, low contrast.' },
  { name: 'music-explore.mp3', music: true, prompt: 'Instrumental only, no voices or lyrics. A 30 second seamless looping game exploration score for an original ancient Greek island survival adventure. Evocative plucked lyre and ancient harp ostinato, warm low cello drone, airy wooden flute, restrained hand drums building a gentle sense of urgency. Noble, mysterious, sunlit Mediterranean atmosphere with approaching danger. 105 BPM, D Dorian. Clear melody, cinematic polished recording, no modern electronic synths, no loud trailer hits. Loop-friendly opening and ending on the same suspended chord with sustained ambience. Original composition.' },
  { name: 'music-sanctuary.mp3', music: true, prompt: 'Instrumental only, no voices or lyrics. A 30 second seamless looping cinematic sanctuary theme for an original ancient Greek survival game. Intimate plucked lyre, soft ancient harp, breathy wooden flute, warm low bowed strings, distant soft frame drum. Peaceful and poignant hope after a catastrophe, flickering fire beneath a starry Mediterranean sky. 70 BPM, D Dorian, delicate sparse melody and long atmospheric breaths. Polished organic acoustic recording, no synths, no copied melodies. Loop-friendly ending and beginning share the same gentle drone. Original composition.' },
  { name: 'intro.wav', voice: true, text: 'The mountain is waking. I have one minute to gather food, water, herbs, and timber. Mira and Theron are still in the village. I must bring them to the sanctuary before the ash arrives.' },
];
const mode = process.argv[2] || 'all';
const selected = jobs.filter(job => mode === 'all' || mode === job.name || mode === (job.music ? 'music' : job.voice ? 'voice' : 'images'));
if (!selected.length) throw new Error('Use all, images, music, voice, or a specific asset filename.');
const manifestPath = resolve(directory, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8').catch(() => '{"assets":[]}'));
async function generate(job) {
  const path = resolve(directory, job.name);
  if (await readFile(path).then(() => true).catch(() => false)) { console.log(`Preserved ${job.name}`); return; }
  let bytes;
  const model = job.voice ? 'default' : job.music ? 'lyria-3-clip-preview' : 'gemini-3.1-flash-image';
  if (job.voice) {
    const response = await fetch('https://api.gradium.ai/api/post/speech/tts', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': value('GRADIUM_API_KEY') }, body: JSON.stringify({ text: job.text, voice_id: value('GRADIUM_VOICE_ID') || 'YTpq7expH9539ERJ', model_name: model, output_format: 'wav', only_audio: true }), signal: AbortSignal.timeout(90000) });
    if (!response.ok) throw new Error(`Gradium HTTP ${response.status}`);
    bytes = normalizeCompletedWav(new Uint8Array(await response.arrayBuffer()));
  } else {
    const body = { model, input: job.prompt, store: false, ...(!job.music ? { response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: job.aspect, image_size: '2K' } } : {}) };
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': value('GEMINI_API_KEY') }, body: JSON.stringify(body), signal: AbortSignal.timeout(240000) });
    if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(`Google HTTP ${response.status}: ${String(error?.error?.message || error?.message || '').slice(0,500).replaceAll(value('GEMINI_API_KEY'), '[redacted]')}`); }
    const result = await response.json();
    const part = (result.steps || []).filter(step => step.type === 'model_output').flatMap(step => step.content || []).findLast(part => part.type === (job.music ? 'audio' : 'image') && part.data);
    if (!part) throw new Error(`No ${job.music ? 'audio' : 'image'} returned (${result.status})`);
    bytes = Buffer.from(part.data, 'base64');
    if (bytes.length < 5000) throw new Error('Returned asset unexpectedly small');
  }
  await writeFile(path, bytes);
  manifest.assets = [...manifest.assets.filter(asset => asset.path !== job.name), { path: job.name, provider: job.voice ? 'Gradium' : 'Google', model, prompt: job.prompt || job.text, generatedAt: new Date().toISOString(), bytes: bytes.length }];
  console.log(`Generated ${job.name} (${bytes.length} bytes) with ${model}`);
}
// Three bounded workers keep API usage modest; manifest is saved after all workers finish.
let cursor = 0;
await Promise.all(Array.from({ length: Math.min(3, selected.length) }, async () => {
  while (cursor < selected.length) {
    const job = selected[cursor++];
    try { await generate(job); } catch (error) { console.error(`${job.name}: ${error.message}`); process.exitCode = 1; }
  }
}));
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
