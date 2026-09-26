import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';

const compiled = mkdtempSync(join(tmpdir(), 'oracle-gamepad-tests-'));
after(() => rmSync(compiled, { recursive: true, force: true }));
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '--strict', '--target', 'ES2022', '--module', 'commonjs', '--lib', 'esnext,dom', '--types', 'node', '--skipLibCheck', '--outDir', compiled, 'app/oracle/gamepad.ts', 'app/oracle/controller-ui.ts'], { stdio: 'pipe' });
const require = createRequire(import.meta.url);
const { readStick, createControllerDecoder, startController } = require(join(compiled, 'gamepad.js'));
const { activateControllerTarget, controllerTargets, navigateControllerMenu } = require(join(compiled, 'controller-ui.js'));
const pad = ({ axes = [0, 0, 0, 0], held = [], index = 0, id = 'Xbox Wireless Controller', mapping = 'standard' } = {}) => ({
  index, id, mapping, connected: true, axes,
  buttons: Array.from({ length: 17 }, (_, index) => ({ pressed: held.includes(index), value: held.includes(index) ? 1 : 0 })),
});
const neutral = { moveX: 0, moveY: 0, lookX: 0, lookY: 0, sprint: false, pressed: [], navigate: null, navigationActive: false };
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} should equal ${expected}`);

test('radial dead zone removes drift, preserves analog speed and bounds diagonal movement', () => {
  assert.deepEqual(readStick(.1, -.1), { x: 0, y: 0 });
  close(readStick(.59, 0).x, .5);
  const diagonal = readStick(1, -1);
  close(Math.hypot(diagonal.x, diagonal.y), 1);
  close(diagonal.x, -diagonal.y);
  assert.deepEqual(readStick(NaN, Infinity), { x: 0, y: 0 });
  close(readStick(20, 0).x, 1);
  const decoder = createControllerDecoder();
  const frame = decoder.read(pad({ axes: [.59, -.59, 1, -1], held: [7] }), 0);
  assert.ok(frame.moveY > 0, 'up on the left stick moves forward');
  assert.ok(frame.lookX > 0 && frame.lookY < 0);
  assert.equal(frame.sprint, true);
  assert.equal(decoder.read(pad({ held: [10] }), 1).sprint, true);
});

test('face, shoulder and menu buttons fire once, and held connect/resume buttons must be released', () => {
  const decoder = createControllerDecoder();
  assert.deepEqual(decoder.read(pad({ held: [0, 9] }), 0).pressed, []);
  assert.deepEqual(decoder.read(pad({ held: [0, 9] }), 16).pressed, []);
  decoder.read(pad(), 32);
  const names = ['a', 'b', 'x', 'y', 'lb', 'rb', 'view', 'menu', 'up', 'down', 'left', 'right'];
  const all = pad({ held: [0, 1, 2, 3, 4, 5, 8, 9, 12, 13, 14, 15] });
  assert.deepEqual(decoder.read(all, 48).pressed, names);
  assert.deepEqual(decoder.read(all, 64).pressed, []);
  decoder.reset();
  assert.deepEqual(decoder.read(all, 80).pressed, []);
  decoder.read(pad(), 96);
  assert.deepEqual(decoder.read(pad({ held: [0] }), 112).pressed, ['a']);
});

test('menu navigation steps immediately then repeats at controlled intervals', () => {
  const decoder = createControllerDecoder();
  decoder.read(pad(), 0);
  const down = pad({ axes: [0, 1, 0, 0] });
  assert.equal(decoder.read(down, 10).navigate, 'down');
  assert.equal(decoder.read(down, 359).navigate, null);
  assert.equal(decoder.read(down, 360).navigate, 'down');
  assert.equal(decoder.read(down, 499).navigate, null);
  assert.equal(decoder.read(down, 500).navigate, 'down');
  assert.equal(decoder.read(pad({ held: [14] }), 501).navigate, 'left');
  decoder.reset();
  assert.equal(decoder.read(down, 700).navigate, null);
  assert.equal(decoder.read(down, 1400).navigate, null);
  decoder.read(pad(), 1410);
  assert.equal(decoder.read(pad({ axes: [0, -1, 0, 0] }), 1420).navigate, 'up');
});

test('held D-pad remains navigation-active between repeats and across decoder resets', () => {
  const decoder = createControllerDecoder();
  decoder.read(pad(), 0);
  const down = pad({ held: [13] });
  assert.equal(decoder.read(down, 10).navigate, 'down');
  const between = decoder.read(down, 20);
  assert.equal(between.navigate, null);
  assert.equal(between.navigationActive, true);
  assert.equal(between.moveX, 0);
  assert.equal(between.moveY, 0);
  decoder.reset();
  const resumed = decoder.read(down, 30);
  assert.equal(resumed.navigate, null);
  assert.equal(resumed.navigationActive, true);
  assert.equal(decoder.read(pad(), 40).navigationActive, false);
  assert.equal(decoder.read(pad({ axes: [1, 0, 0, 0] }), 50).navigationActive, true);
});

function browserHarness() {
  const originals = new Map(['window', 'document', 'navigator', 'requestAnimationFrame', 'cancelAnimationFrame'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const window = new EventTarget(), document = new EventTarget();
  document.hidden = false;
  let pads = [], nextId = 0, denied = false;
  const frames = new Map();
  const values = { window, document, navigator: { getGamepads: () => { if (denied) throw new Error('Unavailable'); return pads; } }, requestAnimationFrame: callback => { const id = ++nextId; frames.set(id, callback); return id; }, cancelAnimationFrame: id => frames.delete(id) };
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  return {
    window, document, setPads(value) { pads = value; }, deny(value) { denied = value; },
    tick(now) { const pending = [...frames.values()]; frames.clear(); for (const callback of pending) callback(now); },
    scheduled() { return frames.size; },
    restore() { for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } },
  };
}

test('polling neutralizes hidden/disconnected controllers, re-arms on resume and cleans up', () => {
  const browser = browserHarness();
  const frames = [], connections = [];
  let disconnects = 0;
  const stop = startController({ onFrame: frame => frames.push(frame), onConnection: info => connections.push(info), onDisconnect: () => disconnects++ });
  try {
    browser.tick(0);
    assert.deepEqual(frames.at(-1), neutral);
    assert.equal(connections.length, 0);
    browser.setPads([pad()]); browser.tick(10);
    browser.setPads([pad({ axes: [1, 0, 0, 0], held: [0] })]); browser.tick(20);
    assert.equal(frames.at(-1).moveX, 1);
    assert.deepEqual(frames.at(-1).pressed, ['a']);
    assert.deepEqual(connections, [{ connected: true, name: 'Xbox controller' }]);
    browser.document.hidden = true;
    browser.document.dispatchEvent(new Event('visibilitychange'));
    assert.deepEqual(frames.at(-1), neutral);
    browser.tick(30);
    assert.equal(disconnects, 0);
    browser.document.hidden = false;
    browser.document.dispatchEvent(new Event('visibilitychange')); browser.tick(40);
    assert.deepEqual(frames.at(-1).pressed, []);
    assert.equal(frames.at(-1).navigate, null);
    browser.setPads([]); browser.tick(50); browser.tick(60);
    assert.deepEqual(frames.at(-1), neutral);
    assert.equal(disconnects, 1);
    assert.deepEqual(connections.at(-1), { connected: false, name: '' });
    browser.setPads([pad({ held: [0] })]); browser.tick(70);
    assert.deepEqual(frames.at(-1).pressed, []);
    browser.deny(true); browser.tick(80);
    assert.deepEqual(frames.at(-1), neutral);
    assert.equal(disconnects, 1, 'an API access failure is not a physical disconnect');
    stop();
    assert.equal(browser.scheduled(), 0);
    const count = frames.length;
    browser.window.dispatchEvent(new Event('blur'));
    browser.document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(frames.length, count, 'cleanup removes listeners');
  } finally { stop(); browser.restore(); }
});

test('standard pads switch only on new activity and expose a generic device name', () => {
  const browser = browserHarness();
  const connections = [], frames = [];
  const stop = startController({ onFrame: frame => frames.push(frame), onConnection: info => connections.push(info), onDisconnect() {} });
  try {
    browser.setPads([pad({ mapping: '' })]); browser.tick(0);
    assert.equal(connections.length, 0);
    browser.setPads([pad(), pad({ index: 1, id: 'Vendor device fingerprint' })]); browser.tick(10);
    browser.setPads([pad(), pad({ index: 1, id: 'Vendor device fingerprint', held: [0] })]); browser.tick(20);
    assert.deepEqual(connections.at(-1), { connected: true, name: 'Game controller' });
    assert.deepEqual(frames.at(-1).pressed, [], 'switching controllers cannot confirm a menu accidentally');
    browser.setPads([pad(), pad({ index: 1, id: 'Vendor device fingerprint' })]); browser.tick(30); browser.tick(40);
    assert.equal(connections.length, 2, 'idle pads do not steal selection');
  } finally { stop(); browser.restore(); }
});

test('an unavailable browser Gamepad API yields neutral input without throwing', () => {
  const browser = browserHarness();
  try {
    delete globalThis.navigator.getGamepads;
    const frames = [];
    const stop = startController({ onFrame: frame => frames.push(frame), onConnection() { assert.fail('no controller connected'); }, onDisconnect() { assert.fail('no controller disconnected'); } });
    assert.deepEqual(frames, [neutral]);
    assert.equal(browser.scheduled(), 0);
    stop();
  } finally { browser.restore(); }
});

test('blur clears movement immediately; focus and disconnect events cannot replay held actions', () => {
  const browser = browserHarness();
  const frames = [];
  let disconnects = 0;
  const stop = startController({ onFrame: frame => frames.push(frame), onConnection() {}, onDisconnect() { disconnects++; } });
  try {
    browser.setPads([pad()]); browser.tick(0);
    browser.setPads([pad({ axes: [0, -1, 1, 0], held: [0, 7] })]); browser.tick(10);
    assert.equal(frames.at(-1).moveY, 1);
    browser.window.dispatchEvent(new Event('blur'));
    assert.deepEqual(frames.at(-1), neutral);
    browser.tick(20);
    assert.deepEqual(frames.at(-1), neutral);
    browser.window.dispatchEvent(new Event('focus')); browser.tick(30);
    assert.deepEqual(frames.at(-1).pressed, []);
    assert.equal(frames.at(-1).navigate, null);
    browser.setPads([]);
    const event = new Event('gamepaddisconnected');
    Object.defineProperty(event, 'gamepad', { value: { index: 0 } });
    browser.window.dispatchEvent(event);
    assert.deepEqual(frames.at(-1), neutral);
    assert.equal(disconnects, 1);
    browser.tick(40);
    assert.equal(disconnects, 1, 'the subsequent poll must not report the same disconnect twice');
  } finally { stop(); browser.restore(); }
});

test('menu navigation skips unavailable controls and wraps across buttons and ration checkboxes', () => {
  const browser = browserHarness();
  try {
    const element = (options = {}) => ({
      dataset: {}, disabled: false, clicks: 0,
      getClientRects() { return this.hidden ? [] : [{}]; },
      closest() { return this.inert ? {} : null; },
      removeAttribute() { delete this.dataset.padFocus; },
      focus() { browser.document.activeElement = this; },
      scrollIntoView() {}, click() { this.clicks++; }, ...options,
    });
    const close = element(), disabled = element({ disabled: true }), hidden = element({ hidden: true }), inert = element({ inert: true }), ration = element();
    const nodes = [close, disabled, hidden, inert, ration];
    browser.document.querySelectorAll = () => nodes.filter(node => node.dataset.padFocus);
    const scope = { querySelectorAll: () => nodes.filter(node => !node.disabled) };
    assert.deepEqual(controllerTargets(scope), [close, ration]);
    navigateControllerMenu(scope, 'up');
    assert.equal(browser.document.activeElement, ration);
    navigateControllerMenu(scope, 'right');
    assert.equal(browser.document.activeElement, close);
    navigateControllerMenu(scope, 'down');
    assert.equal(browser.document.activeElement, ration);
    activateControllerTarget(scope);
    assert.equal(ration.clicks, 1);
    assert.equal(close.clicks, 0);
  } finally { browser.restore(); }
});

test('a missing or newly disabled menu selection restores focus without activating a different action', () => {
  const browser = browserHarness();
  try {
    const element = () => ({
      dataset: {}, disabled: false, clicks: 0,
      getClientRects() { return [{}]; }, closest() { return null; },
      removeAttribute() { delete this.dataset.padFocus; },
      focus() { browser.document.activeElement = this; },
      scrollIntoView() {}, click() { this.clicks++; },
    });
    const close = element(), repair = element();
    const nodes = [close, repair];
    browser.document.querySelectorAll = () => nodes.filter(node => node.dataset.padFocus);
    const scope = { querySelectorAll: () => nodes.filter(node => !node.disabled) };
    activateControllerTarget(scope);
    assert.equal(close.clicks, 0, 'the initial A establishes a selection');
    assert.equal(close.dataset.padFocus, 'true');
    navigateControllerMenu(scope, 'down');
    repair.disabled = true; // The final beacon build disables this action on the next render.
    activateControllerTarget(scope);
    assert.equal(close.clicks, 0, 'A must not unexpectedly close the journal');
    assert.equal(repair.clicks, 0);
    assert.equal(close.dataset.padFocus, 'true');
    assert.equal(repair.dataset.padFocus, undefined);
    activateControllerTarget(scope);
    assert.equal(close.clicks, 1, 'a subsequent explicit A activates the now-visible selection');
  } finally { browser.restore(); }
});
