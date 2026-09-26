import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import * as THREE from 'three';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const sourceCache = new Map();

// Exercise the actual engine, geometry, rules and world. Only browser/WebGL I/O is
// stubbed; advancing frames still executes real movement, AI and collision code.
function fixture(stage = 1, weapons = ['sword']) {
  let now = 0, frame, snapshot, scene, world, updates = 0, disposedWorlds = 0, renders = 0, buildPlot = null;
  const events = [], modules = new Map();
  class Renderer {
    shadowMap = {}; capabilities = { getMaxAnisotropy: () => 1 };
    setPixelRatio() {} setSize() {} dispose() {}
    render(value) { scene = value; renders++; }
  }
  class TextureLoader { load() { return new THREE.Texture(); } }
  const three = { ...THREE, WebGLRenderer: Renderer, TextureLoader };
  const load = filename => {
    filename = path.resolve(filename);
    if (modules.has(filename)) return modules.get(filename).exports;
    const loadedModule = { exports: {} }; modules.set(filename, loadedModule);
    let compiled = sourceCache.get(filename);
    if (!compiled) {
      compiled = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
      sourceCache.set(filename, compiled);
    }
    const localRequire = name => name === 'three' ? three : name.startsWith('.') ? load(path.resolve(path.dirname(filename), `${name}.ts`)) : require(name);
    vm.runInNewContext(compiled, {
      module: loadedModule, exports: loadedModule.exports, require: localRequire, console,
      Date: class extends Date { static now() { return 123456 + Math.floor(now); } },
      Math: Object.assign(Object.create(Math), { random: () => .371 }),
      window: { devicePixelRatio: 1, addEventListener() {}, removeEventListener() {} },
      document: { hidden: false, addEventListener() {}, removeEventListener() {} },
      performance: { now: () => now }, requestAnimationFrame: callback => (frame = callback, 1), cancelAnimationFrame() {},
      ResizeObserver: class { observe() {} disconnect() {} }, queueMicrotask: callback => callback(),
    }, { filename });
    if (filename.endsWith('/troy/world.ts')) {
      const create = loadedModule.exports.createTroyWorld;
      loadedModule.exports.createTroyWorld = (...args) => {
        world = create(...args); const update = world.update, dispose = world.dispose;
        world.update = (...values) => { updates++; return update(...values); };
        world.dispose = () => { disposedWorlds++; dispose(); };
        return world;
      };
    }
    return loadedModule.exports;
  };
  const api = load('app/troy/engine.ts'), maps = load('app/troy/maps.ts');
  const canvas = { getBoundingClientRect: () => ({ width: 1440, height: 900 }), addEventListener() {}, removeEventListener() {}, setPointerCapture() {} };
  const engine = api.createTroyGame(canvas, { onReady() {}, onUpdate: value => { snapshot = value; }, onEvent: event => events.push(event), onTalk() {}, onBuildPlot: id => { buildPlot = id; engine.pause(); } }, undefined, stage, weapons);
  const jump = seconds => { now += seconds * 1000; frame(now); };
  const advance = seconds => { for (let remaining = seconds; remaining > 1e-8;) { const dt = Math.min(.02, remaining); jump(dt); remaining -= dt; } };
  jump(.01);
  return {
    engine, api, events, jump, advance,
    get state() { return snapshot; }, get scene() { return scene; }, get world() { return world; },
    get buildPlot() { return buildPlot; },
    get map() { return maps.createCityMap(snapshot.stage, snapshot.seed); },
    get updates() { return updates; }, get disposedWorlds() { return disposedWorlds; }, get renders() { return renders; },
    get hero() { return scene.getObjectByName('lyra'); },
    get raiders() { return scene.children.filter(object => object.userData.enemyKind); },
    teleport(x, z) { scene.getObjectByName('lyra').position.set(x, 0, z); advance(.12); },
  };
}

test('difficulty remains bounded and collision supports large maps and swept arrows', () => {
  const f = fixture();
  try {
    const first = f.api.getRaidDifficulty(1), last = f.api.getRaidDifficulty(10000);
    assert.equal(first.firstRaid, 18); assert.equal(first.interval, 20); assert.equal(first.aliveCap, 14);
    assert.equal(last.interval, 10); assert.equal(last.aliveCap, 18); assert.equal(last.hpBonus, 2);
    assert.equal(JSON.stringify(last), JSON.stringify(f.api.getRaidDifficulty(12)));
    assert.equal(f.api.distanceToSegment(0, 0, -4, 0, 4, 0), 0, 'fast arrow crossing is detected');
    assert.equal(f.api.distanceToSegment(0, 3, -4, 0, 4, 0), 3, 'sideways dodge clears the trajectory');
    assert.equal(f.api.canOccupyTroyPosition(40, 30, [], .38, f.map.bounds), true);
    assert.equal(f.api.canOccupyTroyPosition(50, 0, [], .38, f.map.bounds), false);
    assert.equal(f.api.canOccupyTroyPosition(NaN, 0, [], .38, f.map.bounds), false);
  } finally { f.engine.destroy(); }
});

test('new stages rebuild the correct city, discover treasure once, and release the previous world', () => {
  const f = fixture(3);
  try {
    assert.equal(f.state.stage, 3); assert.equal(f.map.theme, 'forest');
    f.engine.start(1); assert.equal(f.state.nextRaid, 18); assert.equal(f.state.stage, 1);
    const plot = f.map.plots[0]; f.engine.selectBuilding('temple'); f.teleport(plot.x, plot.z); f.engine.interact();
    assert.equal(f.buildPlot, plot.id, 'an unaffordable selected design still opens the dashboard'); assert.equal(f.state.paused, true);
    assert.equal(f.engine.buildAtPlot(plot.id, 'temple'), false); assert.equal(f.engine.buildAtPlot(f.map.plots[20].id, 'house'), false, 'remote construction is rejected');
    assert.equal(f.engine.buildAtPlot(plot.id, 'house'), true, 'explicit affordable design can be built while the dashboard pauses play');
    assert.equal(f.engine.buildAtPlot(plot.id, 'house'), false, 'an occupied plot cannot be charged twice'); f.engine.resume();
    assert.equal(f.state.buildings.length, 1); assert.equal(f.state.score, 160);
    assert.ok(f.api.canOccupyTroyPosition(f.state.player.x, f.state.player.z, f.world.colliders, .38, f.map.bounds), 'new construction moves the player clear of its walls');
    const landmark = f.map.landmarks[0]; f.teleport(landmark.x, landmark.z); assert.equal(f.state.nearest.kind, 'landmark'); f.engine.interact();
    assert.equal(f.state.expeditionScore, 75); assert.ok(f.state.explored.includes(landmark.id));
    f.engine.interact(); assert.equal(f.state.expeditionScore, 75, 'exploration reward cannot be repeated');
    const node = f.map.resources[0]; f.teleport(node.x, node.z); f.engine.interact(); assert.equal(f.state.gathered, 1); f.engine.interact(); assert.equal(f.state.gathered, 1);
    f.engine.pause(); const time = f.state.timeLeft; f.engine.markSupplies(); f.jump(15); assert.equal(f.state.timeLeft, time); assert.ok(f.events.some(event => event.type === 'oracle'));
    f.engine.resume(); f.jump(7.1); f.engine.interact(); assert.equal(f.state.gathered, 2);
    const previousRoot = f.world.root; f.engine.start(2);
    assert.equal(f.map.theme, 'desert'); assert.equal(f.state.stage, 2); assert.equal(f.state.buildings.length, 0); assert.equal(f.state.explored.length, 0); assert.equal(f.state.enemyPositions.length, 0);
    assert.equal(f.disposedWorlds, 2); assert.ok(!f.scene.children.includes(previousRoot));
    assert.equal(f.state.player.x, f.map.spawn.x); assert.equal(f.state.player.z, f.map.spawn.z);
  } finally { f.engine.destroy(); }
});

test('falling raiders leave real weapon pickups and bow damage happens only on impact', () => {
  const f = fixture();
  try {
    f.engine.start(1); f.jump(18.01); for (const enemy of f.raiders) enemy.position.set(43, 0, -36);
    const archer = f.raiders.find(enemy => enemy.userData.enemyKind === 'archer'); archer.position.set(f.hero.position.x + 1, 0, f.hero.position.z);
    f.engine.attack(); f.advance(.4); f.engine.attack(); assert.equal(f.state.kills, 1);
    const corpse = f.scene.getObjectByName('fallen-archer'); assert.ok(corpse, 'defeated raider remains visible during its fall');
    const drop = f.scene.children.find(object => object.userData.weaponKind === 'bow'); assert.ok(drop); assert.equal(f.state.weapons.length, 1);
    f.advance(.3); assert.ok(Math.abs(corpse.rotation.z) > .2); assert.ok(corpse.parent, 'death is animated instead of an immediate disappearance');
    f.teleport(drop.position.x, drop.position.z); assert.equal(f.state.nearest.kind, 'loot'); f.engine.interact();
    assert.equal(f.state.weapon, 'bow'); assert.equal(f.state.weapons.length, 2); assert.ok(f.hero.getObjectByName('Equipped bow').visible);
    f.advance(.4); assert.equal(corpse.parent, null, 'corpse is disposed after its short fade');
    const skirmisher = f.raiders.find(enemy => enemy.userData.enemyKind === 'skirmisher'); skirmisher.position.set(f.hero.position.x + 8, 0, f.hero.position.z);
    const before = f.state.kills; f.engine.attack(); assert.equal(f.state.kills, before); assert.ok(f.scene.getObjectByName('friendly-arrow'));
    f.advance(.06); assert.equal(f.state.kills, before, 'a launched bow shot does not cause instant damage');
    f.advance(.4); assert.equal(f.state.kills, before + 1);
    const duplicate = f.scene.children.find(object => object.userData.weaponKind === 'sword'); f.teleport(duplicate.position.x, duplicate.position.z); f.engine.interact(); assert.equal(f.state.weapons.length, 2, 'duplicate drops do not consume another inventory slot');
    f.engine.start(2, ['sword', 'bow', 'hammer']); f.engine.cycleWeapon(1); assert.equal(f.state.weapon, 'bow'); f.engine.cycleWeapon(1); assert.equal(f.state.weapon, 'hammer');
    assert.equal(f.state.weapons.length, 3); f.engine.start(3); assert.equal(f.state.weapons.length, 3, 'carried unlocks survive the next expedition');
  } finally { f.engine.destroy(); }
});

test('hammer has a slower powerful area strike and knocks surviving brutes back', () => {
  const f = fixture(1, ['sword', 'hammer']);
  try {
    f.engine.start(1); f.engine.selectWeapon('hammer'); f.jump(18.01);
    for (const enemy of f.raiders) enemy.position.set(43, 0, -36);
    const brute = f.raiders.find(enemy => enemy.userData.enemyKind === 'brute'); brute.position.set(f.hero.position.x + 1.5, 0, f.hero.position.z);
    for (const enemy of f.raiders.filter(enemy => enemy.userData.enemyKind === 'skirmisher')) enemy.position.set(f.hero.position.x + 2.5, 0, f.hero.position.z + .4);
    const before = brute.position.distanceTo(f.hero.position); f.engine.attack(); assert.equal(f.state.kills, 2); assert.ok(brute.position.distanceTo(f.hero.position) > before + 1);
    assert.ok(f.scene.getObjectByName('combat-impact')); f.engine.attack(); assert.equal(f.state.kills, 2);
    f.advance(.7); f.engine.attack(); assert.equal(f.state.kills, 2, 'heavy attack has a longer cooldown');
    f.advance(.4); f.engine.attack(); assert.equal(f.state.kills, 3);
  } finally { f.engine.destroy(); }
});

test('cannon towers launch visible shells and score kills only after explosive impact', () => {
  const f = fixture();
  try {
    f.engine.start(1);
    const home = f.map.plots[0]; f.teleport(home.x, home.z); assert.equal(f.engine.buildAtPlot(home.id, 'house'), true);
    const plot = f.map.plots[1]; f.teleport(plot.x, plot.z); assert.equal(f.engine.buildAtPlot(plot.id, 'tower'), true); f.advance(.9);
    f.engine.pause(); f.engine.resume(); // Refresh the ten-hertz snapshot before aligning the raid frame.
    f.jump(18.001 - (120 - f.state.timeLeft)); for (const enemy of f.raiders) enemy.position.set(-43, 0, -36);
    const target = f.raiders.find(enemy => enemy.userData.enemyKind === 'skirmisher'); target.position.set(plot.x + 10, 0, plot.z + 8);
    f.advance(.02); const shell = f.scene.getObjectByName('cannon-shell'); assert.ok(shell); assert.equal(f.state.kills, 0);
    const y = shell.position.y; f.advance(.12); assert.equal(f.state.kills, 0, 'muzzle flash and shot launch do not instantly kill'); assert.notEqual(shell.position.y, y);
    f.advance(1.05); assert.ok(f.state.kills >= 1, 'shell explosion applies real damage and kill credit');
    assert.ok(f.scene.children.some(object => object.userData.weaponKind === 'sword'));
  } finally { f.engine.destroy(); }
});

test('companion orders queue during chat pause, walk and animate, pay for builds, and fight', () => {
  const f = fixture();
  try {
    f.engine.start(1); const theron = f.scene.getObjectByName('theron'), original = theron.position.clone();
    f.engine.pause(); assert.equal(f.engine.commandCompanion({ character: 'theron', action: 'build', building: 'house' }).accepted, true);
    f.jump(15); assert.equal(f.state.buildings.length, 0); assert.equal(theron.position.distanceTo(original), 0);
    f.engine.resume(); f.advance(5.8); assert.equal(f.state.buildings.length, 0, 'building requires walking and six seconds of visible work'); assert.ok(theron.position.distanceTo(original) > 1);
    assert.ok(theron.getObjectByName('Equipped hammer').visible);
    f.advance(2.2); assert.equal(f.state.buildings.length, 1); assert.equal(f.state.materials.wood, 4); assert.equal(f.state.materials.stone, 4); assert.equal(f.state.materials.bronze, 1);
    f.engine.commandCompanion({ character: 'theron', action: 'build', building: 'temple' }); f.advance(7);
    assert.equal(f.state.buildings.length, 1, 'helper cannot build an unaffordable temple for free'); assert.match(f.state.companions.find(item => item.character === 'theron').description, /Waiting for materials/);
    f.engine.commandCompanion({ character: 'theron', action: 'follow' }); f.advance(.3);
    f.jump(18.01 - (120 - f.state.timeLeft)); for (const enemy of f.raiders) enemy.position.set(43, 0, -36);
    const skirmisher = f.raiders.find(enemy => enemy.userData.enemyKind === 'skirmisher'); skirmisher.position.set(theron.position.x + 1, 0, theron.position.z);
    f.engine.commandCompanion({ character: 'theron', action: 'fight' }); f.advance(2.7); assert.ok(f.state.kills >= 1, 'helper attacks earn normal kill credit');
    f.engine.commandCompanion({ character: 'mira', action: 'follow' }); assert.equal(f.state.companions.find(item => item.character === 'mira').action, 'follow');
  } finally { f.engine.destroy(); }
});

test('frequent mixed raids and melee have real health differences and bounded enemy populations', () => {
  const f = fixture();
  try {
    f.engine.start(1); f.jump(18.01); assert.equal(f.state.wave, 1); assert.equal(f.state.enemies, 4);
    assert.equal(new Set(f.state.enemyPositions.map(enemy => enemy.kind)).size, 3);
    assert.ok(f.state.nextRaid > 19.9 && f.state.nextRaid < 20);
    const p = f.hero.position.clone();
    for (const enemy of f.raiders) enemy.position.set(42, 0, -36);
    const skirmishers = f.raiders.filter(enemy => enemy.userData.enemyKind === 'skirmisher');
    skirmishers.forEach((enemy, i) => enemy.position.set(p.x + .8, 0, p.z + i * .25));
    f.engine.attack(); assert.equal(f.state.kills, 0); f.engine.attack(); assert.equal(f.state.kills, 0, 'cooldown prevents attack spam');
    f.advance(.4); f.engine.attack(); assert.equal(f.state.kills, 2, 'two cuts defeat both nearby skirmishers');
    const brute = f.raiders.find(enemy => enemy.userData.enemyKind === 'brute'); brute.position.set(f.hero.position.x + 1, 0, f.hero.position.z);
    for (let hit = 0; hit < 3; hit++) { f.advance(.4); f.engine.attack(); assert.equal(f.state.kills, 2, 'brute survives the first three sword hits'); }
    f.advance(.4); f.engine.attack(); assert.equal(f.state.kills, 3);
    f.engine.start(12); f.jump(12);
    for (let wave = 0; wave < 9; wave++) { for (const enemy of f.raiders) enemy.position.set(42, 0, -36); f.jump(10); assert.ok(f.state.enemies <= 18); }
    assert.ok(f.state.wave >= 9); assert.ok(f.state.enemyPositions.every(enemy => Number.isFinite(enemy.x) && Number.isFinite(enemy.z)));
  } finally { f.engine.destroy(); }
});

test('archers telegraph locked aim, pause their windup, and fire physical arrows the hero can dodge', () => {
  const f = fixture();
  try {
    f.engine.start(1); f.jump(18.01);
    for (const enemy of f.raiders) enemy.position.set(43, 0, -35);
    const archer = f.raiders.find(enemy => enemy.userData.enemyKind === 'archer');
    archer.position.set(f.hero.position.x + 8, 0, f.hero.position.z + 2);
    f.advance(.4);
    let aim;
    for (let i = 0; i < 220; i++) { f.advance(.02); aim = f.scene.children.find(object => object.name === 'archer-aim' && object.visible); if (aim) break; }
    assert.ok(aim, 'nearby visible archer shows an aiming line before firing');
    assert.equal(f.state.health, 100); assert.equal(f.scene.children.filter(object => object.name === 'hostile-arrow').length, 0);
    f.engine.pause(); const time = f.state.timeLeft; const positions = Array.from(aim.geometry.attributes.position.array); f.jump(20);
    assert.equal(f.state.timeLeft, time); assert.deepEqual(Array.from(aim.geometry.attributes.position.array), positions);
    f.engine.resume();
    let arrow;
    for (let i = 0; i < 120; i++) { f.advance(.02); arrow = f.scene.children.find(object => object.name === 'hostile-arrow'); if (arrow) break; }
    assert.ok(arrow, 'ranged attack creates a moving projectile'); assert.equal(f.state.health, 100, 'launch does not deal instant damage');
    for (let i = 0; i < 60 && arrow.parent && arrow.position.distanceTo(f.hero.position) > 3; i++) f.advance(.02);
    f.engine.dodge(); const before = f.state.health; f.advance(.65); assert.equal(f.state.health, before, 'dodge evades the arrow');
    assert.ok(f.state.dodgeCooldown > 0 && f.state.dodgeCooldown < 1);
    f.hero.position.set(positions[3], 0, positions[5]); archer.position.set(f.hero.position.x + 8, 0, f.hero.position.z + 2);
    f.advance(4); assert.ok(f.state.health < before, 'a later arrow damages a stationary, unguarded hero');
  } finally { f.engine.destroy(); }
});

test('large frames keep the real deadline, bound catch-up, freeze pause and preserve the full finale', () => {
  const f = fixture();
  try {
    f.engine.start(1); let count = f.updates; f.jump(10);
    assert.ok(Math.abs(f.state.timeLeft - 110) < 1e-8); assert.ok(f.updates - count <= 6);
    f.engine.pause(); f.jump(50); assert.ok(Math.abs(f.state.timeLeft - 110) < 1e-8); f.engine.resume();
    f.jump(111); assert.equal(f.state.phase, 'disaster'); assert.equal(f.state.finaleTime, 0); assert.equal(f.state.health, 100);
    count = f.updates; f.jump(8.9); assert.equal(f.state.phase, 'disaster'); assert.ok(f.updates - count <= 6);
    f.jump(.2); assert.equal(f.state.phase, 'ended'); assert.equal(f.state.outcome, 'legend'); assert.equal(f.state.finaleTime, 9); assert.equal(f.state.score, 200);
    f.engine.attack(); f.engine.interact(); f.jump(2); assert.equal(f.state.score, 200);
    f.engine.destroy(); f.engine.destroy(); const renders = f.renders; f.jump(1); assert.equal(f.renders, renders);
  } finally { f.engine.destroy(); }
});
