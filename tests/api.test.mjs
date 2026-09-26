import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { normalizeCompletedWav } from '../app/lib/wav.js';

const compiled = mkdtempSync(join(tmpdir(), 'echo-shift-tests-'));
after(() => rmSync(compiled, { recursive: true, force: true }));
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '--target', 'ES2022', '--module', 'commonjs', '--moduleResolution', 'node', '--lib', 'esnext,dom', '--types', 'node', '--skipLibCheck', '--esModuleInterop', '--allowJs', '--outDir', compiled, 'app/api/director/route.ts', 'app/api/voice/route.ts', 'app/api/status/route.ts', 'app/game/rules.ts'], { stdio: 'pipe' });
const require = createRequire(import.meta.url);
const { POST: director } = require(join(compiled, 'api/director/route.js'));
const { POST: voice } = require(join(compiled, 'api/voice/route.js'));
const { GET: status } = require(join(compiled, 'api/status/route.js'));
const { missionOutcome } = require(join(compiled, 'game/rules.js'));
const request = (body, origin = 'http://localhost:3000') => new Request('http://localhost:3000/api/director', {
  method: 'POST', headers: { 'content-type': 'application/json', origin }, body: JSON.stringify(body),
});

// Provider credentials are replaced only within this test process.
for (const key of ['GEMINI_API_KEY', 'GRADIUM_API_KEY', 'DEVIN_API_KEY']) delete process.env[key];

test('completed streaming WAV lengths preserve PCM samples and intervening chunks', () => {
  const streaming = Buffer.from('52494646ffffffff57415645666d7420100000000100010080bb000000770100020010004a554e4b040000006b65657064617461ffffffff01000200', 'hex');
  const expected = Buffer.from(streaming);
  expected.writeUInt32LE(expected.length - 8, 4);
  expected.writeUInt32LE(4, 52);
  // A pooled buffer has a nonzero byte offset, as generated assets often do.
  assert.deepEqual(normalizeCompletedWav(streaming), expected);
  assert.deepEqual(normalizeCompletedWav(streaming), expected);
  const malformed = Buffer.from(expected);
  malformed.writeUInt32LE(0xffffffff, 4);
  malformed.writeUInt32LE(0xffffffff, 52);
  malformed.writeUInt32LE(1000, 40);
  const untouched = Buffer.from(malformed);
  assert.deepEqual(normalizeCompletedWav(malformed), untouched);
});

test('mission boundaries require survival, enough shards, and completed extraction time', () => {
  assert.equal(missionOutcome(0, 0, 12), 'lost');
  assert.equal(missionOutcome(0, 90, 0), 'lost');
  assert.equal(missionOutcome(100, 0, 11), 'lost');
  assert.equal(missionOutcome(1, 0, 12), 'won');
  assert.equal(missionOutcome(100, 1, 12), null);
});

test('director, provider contracts, and unavailable behavior', async () => {
  assert.deepEqual(await (await status()).json(), { gemini: false, gradium: false, devin: false });
  for (const [message, event] of [['chaos please', 'storm'], ['make it rain shards', 'riches'], ['go faster', 'turbo'], ['repair my shield', 'repair'], ['make it easy', 'calm']]) {
    const result = await (await director(request({ message }))).json();
    assert.equal(result.event, event);
    assert.equal(result.source, 'local');
    assert.equal(typeof result.reason, 'string');
  }
  assert.equal((await director(request({ message: 'storm' }, 'https://unrelated.example'))).status, 403);
  assert.equal((await director(request({ message: '' }))).status, 400);
  assert.equal((await director(request({ message: 'x'.repeat(5000) }))).status, 413);
  assert.equal((await director(request({ message: 'storm', context: { shield: 'oops' } }))).status, 400);
  assert.equal((await voice(request({ text: 'Hello, pilot.' }))).status, 503);

  process.env.GEMINI_API_KEY = 'test-only';
  let observed;
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, init) => {
      observed = { url, headers: init.headers, body: JSON.parse(init.body) };
      return Response.json({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: JSON.stringify({ event: 'riches', message: 'Follow the shards, pilot.' }) }] }] });
    };
    const result = await (await director(request({ message: 'Treasure hunt please' }))).json();
    assert.equal(result.source, 'gemini');
    assert.equal(result.event, 'riches');
    assert.equal(observed.url, 'https://generativelanguage.googleapis.com/v1beta/interactions');
    assert.equal(observed.body.store, false);
    assert.deepEqual(observed.body.response_format.schema.properties.event.enum, ['calm', 'storm', 'riches', 'turbo', 'repair']);
    globalThis.fetch = async () => Response.json({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: '{"event":"unsupported","message":"no"}' }] }] });
    assert.equal((await (await director(request({ message: 'go faster' }))).json()).source, 'local');
    globalThis.fetch = async () => { throw new Error('Offline'); };
    assert.equal((await (await director(request({ message: 'go faster' }))).json()).event, 'turbo');

    process.env.GRADIUM_API_KEY = 'test-only';
    globalThis.fetch = async (url, init) => {
      observed = { url, body: JSON.parse(init.body) };
      const wav = new Uint8Array(44);
      wav.set(new TextEncoder().encode('RIFF'), 0);
      wav.set(new TextEncoder().encode('WAVE'), 8);
      return new Response(wav);
    };
    const audio = await voice(request({ text: 'Follow the shards.' }));
    assert.equal(audio.status, 200);
    assert.equal(audio.headers.get('content-type'), 'audio/wav');
    assert.equal(observed.url, 'https://api.gradium.ai/api/post/speech/tts');
    assert.equal(observed.body.only_audio, true);
    globalThis.fetch = async () => Response.json({ error: 'not audio' });
    assert.equal((await voice(request({ text: 'Hello.' }))).status, 503);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GRADIUM_API_KEY;
  }
});
