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
function fixture(stage = 1, weapons = ['sword'], seedBase = 123456) {
  let now = 0, frame, snapshot, scene, camera, world, updates = 0, disposedWorlds = 0, renders = 0, buildPlot = null;
  const events = [], snapshots = [], modules = new Map();
  class Renderer {
    shadowMap = {}; capabilities = { getMaxAnisotropy: () => 1 };
    setPixelRatio() {} setSize() {} dispose() {}
    render(value, view) { scene = value; camera = view; renders++; }
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
      Date: class extends Date { static now() { return seedBase + Math.floor(now); } },
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
  const engine = api.createTroyGame(canvas, { onReady() {}, onUpdate: value => { snapshot = value; snapshots.push(value); }, onEvent: event => events.push(event), onTalk() {}, onBuildPlot: id => { buildPlot = id; engine.pause(); } }, undefined, stage, weapons);
  const jump = seconds => { now += seconds * 1000; frame(now); };
  const advance = seconds => { for (let remaining = seconds; remaining > 1e-8;) { const dt = Math.min(.02, remaining); jump(dt); remaining -= dt; } };
  jump(.01);
  return {
    engine, api, events, snapshots, jump, advance,
    get state() { return snapshot; }, get scene() { return scene; }, get world() { return world; }, get camera() { return camera; },
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
    assert.equal(first.firstRaid, 12); assert.equal(first.interval, 14); assert.equal(first.aliveCap, 24); assert.equal(first.bossHealth, 36);
    assert.equal(last.interval, 8); assert.equal(last.aliveCap, 32); assert.equal(last.hpBonus, 4); assert.equal(last.bossHealth, 80);
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
    f.engine.start(1); assert.equal(f.state.nextRaid, 12); assert.equal(f.state.stage, 1);
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

test('only seeded lucky deaths leave loot, corpses fade, and bow damage happens on impact', () => {
  const f = fixture();
  try {
    f.engine.start(1); f.jump(12.01); for (const enemy of f.raiders) enemy.position.set(43, 0, -36);
    const archers = f.raiders.filter(enemy => enemy.userData.enemyKind === 'archer');
    const killWithSword = enemy => {
      for (let hit = 0; hit < 4; hit++) { if (hit || f.state.kills) f.advance(.4); enemy.position.set(f.hero.position.x + 1, 0, f.hero.position.z); f.engine.attack(); }
    };
    killWithSword(archers[0]); assert.equal(f.state.kills, 1); assert.equal(f.scene.children.filter(object => object.userData.weaponKind).length, 0, 'first seeded roll misses');
    killWithSword(archers[1]); assert.equal(f.state.kills, 2);
    const corpse = f.scene.getObjectByName('fallen-archer'); assert.ok(corpse, 'defeated raider remains visible during its fall');
    const drop = f.scene.children.find(object => object.userData.weaponKind === 'bow'); assert.ok(drop, 'second seeded roll drops the matching bow'); assert.equal(f.state.weapons.length, 1);
    f.advance(.3); assert.ok(Math.abs(corpse.rotation.z) > .2); assert.ok(corpse.parent, 'death is animated instead of an immediate disappearance');
    f.teleport(drop.position.x, drop.position.z); assert.equal(f.state.nearest.kind, 'loot'); f.engine.interact();
    assert.equal(f.state.weapon, 'bow'); assert.equal(f.state.weapons.length, 2); assert.ok(f.hero.getObjectByName('Equipped bow').visible);
    f.advance(.4); assert.equal(corpse.parent, null, 'corpse is disposed after its short fade');
    const skirmisher = f.raiders.find(enemy => enemy.userData.enemyKind === 'skirmisher'); skirmisher.position.set(f.hero.position.x + 8, 0, f.hero.position.z);
    const before = f.state.kills; f.engine.attack(); assert.equal(f.state.kills, before); assert.ok(f.scene.getObjectByName('friendly-arrow'));
    f.advance(.06); assert.equal(f.state.kills, before, 'a launched bow shot does not cause instant damage');
    f.advance(.6); assert.equal(f.state.kills, before, 'four HP withstands one two-damage arrow');
    skirmisher.position.set(f.hero.position.x + 8, 0, f.hero.position.z); f.engine.attack(); assert.equal(f.state.kills, before); f.advance(.4); assert.equal(f.state.kills, before + 1);
    f.engine.start(2, ['sword', 'bow', 'hammer']); f.engine.cycleWeapon(1); assert.equal(f.state.weapon, 'bow'); f.engine.cycleWeapon(1); assert.equal(f.state.weapon, 'hammer');
    assert.equal(f.state.weapons.length, 3); f.engine.start(3); assert.equal(f.state.weapons.length, 3, 'carried unlocks survive the next expedition');
  } finally { f.engine.destroy(); }
});

test('hammer has a slower area strike and knocks tougher surviving raiders back', () => {
  const f = fixture(1, ['sword', 'hammer']);
  try {
    f.engine.start(1); f.engine.selectWeapon('hammer'); f.jump(12.01);
    for (const enemy of f.raiders) enemy.position.set(43, 0, -36);
    const brute = f.raiders.find(enemy => enemy.userData.enemyKind === 'brute');
    const skirmishers = f.raiders.filter(enemy => enemy.userData.enemyKind === 'skirmisher');
    const nearby = () => { brute.position.set(f.hero.position.x + 1.5, 0, f.hero.position.z); skirmishers.filter(enemy => enemy.userData.enemyKind).forEach(enemy => enemy.position.set(f.hero.position.x + 2.5, 0, f.hero.position.z + .4)); };
    nearby(); const before = brute.position.distanceTo(f.hero.position); f.engine.attack(); assert.equal(f.state.kills, 0); assert.ok(brute.position.distanceTo(f.hero.position) > before + 1);
    assert.ok(f.scene.getObjectByName('combat-impact')); f.engine.attack(); assert.equal(f.state.kills, 0);
    f.advance(.7); nearby(); f.engine.attack(); assert.equal(f.state.kills, 0, 'heavy attack has a longer cooldown');
    f.advance(.4); nearby(); f.engine.attack(); assert.equal(f.state.kills, skirmishers.length, 'two hammer hits defeat four-HP skirmishers');
    assert.ok(brute.userData.enemyKind, 'nine-HP brute survives six hammer damage');
    f.advance(1.1); nearby(); f.engine.attack(); assert.equal(f.state.kills, skirmishers.length + 1);
  } finally { f.engine.destroy(); }
});

test('cannon towers launch visible shells and score kills only after explosive impact', () => {
  const f = fixture();
  try {
    f.engine.start(1);
    const home = f.map.plots[0]; f.teleport(home.x, home.z); assert.equal(f.engine.buildAtPlot(home.id, 'house'), true);
    const plot = f.map.plots[1]; f.teleport(plot.x, plot.z); assert.equal(f.engine.buildAtPlot(plot.id, 'tower'), true); f.advance(.9);
    f.engine.pause(); f.engine.resume(); // Refresh the ten-hertz snapshot before aligning the raid frame.
    f.jump(12.001 - (120 - f.state.timeLeft)); for (const enemy of f.raiders) enemy.position.set(-43, 0, -36);
    const target = f.raiders.find(enemy => enemy.userData.enemyKind === 'skirmisher'); target.position.set(f.hero.position.x + .8, 0, f.hero.position.z); f.engine.attack(); target.position.set(plot.x + 10, 0, plot.z + 8);
    f.advance(.02); const shell = f.scene.getObjectByName('cannon-shell'); assert.ok(shell); assert.equal(f.state.kills, 0);
    const y = shell.position.y; f.advance(.12); assert.equal(f.state.kills, 0, 'muzzle flash and shot launch do not instantly kill'); assert.notEqual(shell.position.y, y);
    f.advance(1.05); assert.ok(f.state.kills >= 1, 'shell explosion applies real damage and kill credit');
    assert.equal(f.scene.children.filter(object => object.userData.weaponKind).length, 0, 'a cannon kill also rolls loot instead of guaranteeing it');
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
    if (120 - f.state.timeLeft < 12.01) f.jump(12.01 - (120 - f.state.timeLeft)); for (const enemy of f.raiders) enemy.position.set(43, 0, -36);
    const skirmisher = f.raiders.find(enemy => enemy.userData.enemyKind === 'skirmisher'); skirmisher.position.set(theron.position.x + 1, 0, theron.position.z);
    f.engine.commandCompanion({ character: 'theron', action: 'fight' }); f.advance(4.8); assert.ok(f.state.kills >= 1, 'helper attacks earn normal kill credit');
    f.engine.commandCompanion({ character: 'mira', action: 'follow' }); assert.equal(f.state.companions.find(item => item.character === 'mira').action, 'follow');
  } finally { f.engine.destroy(); }
});

test('denser raids use four/nine HP and bounded regular populations plus one boss slot', () => {
  const f = fixture();
  try {
    f.engine.start(1); f.jump(12.01); assert.equal(f.state.wave, 1); assert.equal(f.state.enemies, 6);
    assert.equal(new Set(f.state.enemyPositions.map(enemy => enemy.kind)).size, 3);
    assert.ok(f.state.nextRaid > 13.9 && f.state.nextRaid < 14);
    for (const enemy of f.raiders) enemy.position.set(42, 0, -36);
    const skirmishers = f.raiders.filter(enemy => enemy.userData.enemyKind === 'skirmisher');
    for (let hit = 0; hit < 4; hit++) {
      if (hit) f.advance(.4); skirmishers.forEach((enemy, i) => enemy.position.set(f.hero.position.x + .8, 0, f.hero.position.z + i * .25));
      f.engine.attack(); if (hit < 3) assert.equal(f.state.kills, 0, 'skirmishers survive three sword cuts');
    }
    assert.equal(f.state.kills, skirmishers.length);
    const brute = f.raiders.find(enemy => enemy.userData.enemyKind === 'brute');
    for (let hit = 0; hit < 9; hit++) {
      f.advance(.4); brute.position.set(f.hero.position.x + 1, 0, f.hero.position.z); f.engine.attack();
      if (hit < 8) assert.equal(f.state.kills, skirmishers.length, 'brute survives eight sword cuts');
    }
    assert.equal(f.state.kills, skirmishers.length + 1);
    f.engine.start(12); f.jump(12.01);
    for (let wave = 0; wave < 12; wave++) {
      for (const enemy of f.raiders) enemy.position.set(42, 0, -36); f.jump(8);
      assert.ok(f.state.enemyPositions.filter(enemy => enemy.kind !== 'boss').length <= 32); assert.ok(f.state.enemies <= 33);
    }
    assert.equal(f.state.enemyPositions.filter(enemy => enemy.kind !== 'boss').length, 32);
    assert.equal(f.state.enemyPositions.filter(enemy => enemy.kind === 'boss').length, 1, 'boss gets an additional slot even at the regular cap');
    assert.equal(f.state.bossEnemy.maxHealth, 80); assert.ok(f.state.wave >= 12); assert.ok(f.state.enemyPositions.every(enemy => Number.isFinite(enemy.x) && Number.isFinite(enemy.z)));
  } finally { f.engine.destroy(); }
});

test('archers telegraph locked aim, pause their windup, and fire physical arrows the hero can dodge', () => {
  const f = fixture();
  try {
    f.engine.start(1); f.jump(12.01);
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

test('seeded weapon drops are reproducible and occur for roughly 28% of kills', () => {
  const f = fixture();
  try {
    let seed = 1234, drops = 0; const sequence = [];
    for (let i = 0; i < 10000; i++) { const result = f.api.rollWeaponDrop(seed); seed = result.seed; if (result.dropped) drops++; if (i < 12) sequence.push(result.dropped); }
    assert.ok(drops > 2700 && drops < 2900); assert.ok(sequence.includes(true) && sequence.includes(false));
    seed = 1234; for (const expected of sequence) { const result = f.api.rollWeaponDrop(seed); assert.equal(result.dropped, expected); seed = result.seed; }
  } finally { f.engine.destroy(); }
});

test('large frames keep the deadline, bound catch-up and lose without a defeated boss', () => {
  const f = fixture();
  try {
    f.engine.start(1); let count = f.updates; f.jump(10);
    assert.ok(Math.abs(f.state.timeLeft - 110) < 1e-8); assert.ok(f.updates - count <= 6);
    f.engine.pause(); f.jump(50); assert.ok(Math.abs(f.state.timeLeft - 110) < 1e-8); f.engine.resume();
    count = f.updates; f.jump(111); assert.equal(f.state.phase, 'ended'); assert.equal(f.state.outcome, 'fallen'); assert.equal(f.state.timeLeft, 0); assert.equal(f.state.health, 0); assert.equal(f.state.finaleTime, 0);
    assert.equal(f.updates, count, 'a deadline loss never triggers a horse collapse'); assert.equal(f.state.bossEnemy, null, 'a stalled frame does not spawn a boss after the deadline');
    f.engine.attack(); f.engine.interact(); f.jump(2); assert.equal(f.state.score, 0);
    f.engine.destroy(); f.engine.destroy(); const renders = f.renders; f.jump(1); assert.equal(f.renders, renders);
  } finally { f.engine.destroy(); }
});

test('boss arrives once at thirty seconds, is reachable and visible across maps, pauses and resets', () => {
  const f = fixture();
  try {
    for (let stage = 1; stage <= 4; stage++) {
      f.engine.start(stage); assert.equal(f.state.boss, 'waiting'); assert.equal(f.state.bossEnemy, null);
      f.jump(89.8); assert.equal(f.state.bossEnemy, null);
      for (const enemy of f.raiders) enemy.position.set(43, 0, -36);
      f.advance(.3); const bosses = f.raiders.filter(enemy => enemy.userData.enemyKind === 'boss');
      assert.equal(bosses.length, 1); assert.equal(f.state.boss, 'active'); assert.equal(f.state.bossEnemy.name, 'Achaean Warlord');
      const boss = bosses[0], distance = boss.position.distanceTo(f.hero.position);
      assert.ok(distance >= 10 && distance <= 14, `stage ${stage} has a safe nearby arrival distance (${distance})`);
      assert.ok(f.api.canOccupyTroyPosition(boss.position.x, boss.position.z, f.world.colliders, .5, f.map.bounds));
      const projected = boss.position.clone().add(new THREE.Vector3(0, 1.3, 0)).project(f.camera);
      assert.ok(Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1 && projected.z > -1 && projected.z < 1, `stage ${stage} arrival is visible`);
      assert.ok(boss.children[0].scale.y > 2, 'boss silhouette is substantially larger than ordinary raiders');
      assert.match(f.state.hint, /Warlord/, 'arrival message survives simultaneous raid warnings');
      f.engine.pause(); const position = boss.position.clone(), health = f.state.bossEnemy.health, time = f.state.timeLeft;
      f.engine.attack(); f.engine.dodge(); f.jump(50); assert.equal(f.state.timeLeft, time); assert.equal(f.state.bossEnemy.health, health); assert.equal(position.distanceTo(boss.position), 0);
      f.engine.resume(); f.advance(.15); assert.equal(f.raiders.filter(enemy => enemy.userData.enemyKind === 'boss').length, 1);
      f.engine.start(stage); assert.equal(boss.parent, null, 'reset disposes the previous boss'); assert.equal(f.state.bossEnemy, null); assert.equal(f.state.boss, 'waiting');
    }
  } finally { f.engine.destroy(); }
});

test('boss slam warns, freezes while paused, resists hammer interruptions and can be dodged', () => {
  const f = fixture(1, ['sword', 'hammer']);
  try {
    f.engine.start(); f.jump(90.01); for (const enemy of f.raiders) if (enemy.userData.enemyKind !== 'boss') enemy.position.set(43, 0, -36);
    const boss = f.raiders.find(enemy => enemy.userData.enemyKind === 'boss'); assert.ok(boss);
    boss.position.set(f.hero.position.x + 3.1, 0, f.hero.position.z);
    const ring = boss.children.find(child => child.geometry?.type === 'RingGeometry');
    for (let i = 0; i < 120 && !ring.visible; i++) f.advance(.02);
    assert.ok(ring.visible); assert.equal(f.state.health, 100); assert.equal(ring.scale.x, 1, 'full damage radius is visible throughout windup');
    f.engine.selectWeapon('hammer'); const position = boss.position.clone(); f.engine.attack();
    assert.equal(f.state.bossEnemy.health, 33); assert.equal(boss.position.distanceTo(position), 0, 'hammer cannot push the boss away');
    f.advance(.1); assert.ok(ring.visible, 'hammer cannot cancel the slam windup');
    f.engine.pause(); const time = f.state.timeLeft; f.jump(20); assert.equal(f.state.timeLeft, time); assert.ok(ring.visible); assert.equal(f.state.health, 100);
    f.engine.resume(); f.advance(1.15); assert.equal(f.state.health, 70, 'unanswered slam deals thirty damage'); assert.ok(f.scene.getObjectByName('combat-impact'));
    for (let i = 0; i < 120 && !ring.visible; i++) f.advance(.02);
    assert.ok(ring.visible); f.advance(.82); const health = f.state.health;
    f.engine.dodge(); f.advance(.55); assert.equal(f.state.health, health, 'timed dodge avoids the heavy slam');
  } finally { f.engine.destroy(); }
});

test('boss rounds a blocking plot corner instead of stalling within melee distance', () => {
  const f = fixture();
  try {
    f.engine.start(); const plot = f.map.plots[0]; f.teleport(plot.x, plot.z); assert.equal(f.engine.buildAtPlot(plot.id, 'house'), true);
    f.jump(90.01 - (120 - f.state.timeLeft)); for (const enemy of f.raiders) if (enemy.userData.enemyKind !== 'boss') enemy.position.set(43, 0, -36);
    const boss = f.raiders.find(enemy => enemy.userData.enemyKind === 'boss'); assert.ok(boss);
    const building = f.world.colliders.find(collider => collider.x === plot.x && collider.z === plot.z); assert.ok(building);
    f.hero.position.set(plot.x + building.w / 2 + .6, 0, plot.z + building.d / 2 - 1);
    boss.position.set(plot.x + building.w / 2 - 1, 0, plot.z + building.d / 2 + .6); const start = boss.position.clone();
    assert.ok(f.api.canOccupyTroyPosition(start.x, start.z, f.world.colliders, .5, f.map.bounds));
    f.advance(1.5); assert.ok(boss.position.distanceTo(start) > .6, 'boss navigates around the obstruction even inside its nominal attack radius');
    assert.ok(f.api.canOccupyTroyPosition(boss.position.x, boss.position.z, f.world.colliders, .38, f.map.bounds));
    f.engine.commandCompanion({ character: 'mira', action: 'fight' }); const mira = f.scene.getObjectByName('mira');
    boss.position.copy(f.hero.position); mira.position.copy(start); const before = mira.position.clone(); f.advance(.7);
    assert.ok(mira.position.distanceTo(before) > .1, 'a ranged helper repositions for a clear shot instead of staying behind cover');
  } finally { f.engine.destroy(); }
});

test('defeating the enraged boss credits exactly one kill and preserves the full horse finale', () => {
  const f = fixture(1, ['sword', 'hammer']);
  try {
    f.engine.start(); f.engine.selectWeapon('hammer'); f.jump(90.01);
    const boss = f.raiders.find(enemy => enemy.userData.enemyKind === 'boss'); assert.ok(boss);
    for (let hit = 0; hit < 12; hit++) {
      // Isolate real weapon damage from the crowd while allowing cooldown and AI clocks to run.
      for (const enemy of f.raiders) enemy.position.set(43, 0, -36);
      if (hit) f.advance(1.08);
      boss.position.set(f.hero.position.x + 3, 0, f.hero.position.z); f.engine.attack();
      if (hit === 5) { assert.equal(f.state.bossEnemy.health, 18); f.advance(.02); assert.ok(f.events.some(event => /enraged/.test(event.message))); }
      if (hit < 11) assert.equal(f.state.kills, 0);
    }
    assert.equal(f.state.boss, 'defeated'); assert.equal(f.state.bossEnemy, null); assert.equal(f.state.kills, 1); assert.equal(f.state.combatScore, 35); assert.equal(f.state.score, 35);
    assert.equal(f.scene.children.filter(object => object.userData.weaponKind).length, 0, 'the boss also uses the unlucky first28% roll');
    assert.match(f.state.hint, /Warlord defeated/); assert.ok(f.scene.getObjectByName('fallen-boss'));
    for (const enemy of f.raiders) enemy.position.set(43, 0, -36); f.advance(.8); assert.equal(f.scene.getObjectByName('fallen-boss'), undefined);
    f.jump(f.state.timeLeft + .2); assert.equal(f.state.phase, 'disaster'); assert.equal(f.state.finaleTime, 0);
    assert.equal(f.scene.children.filter(object => object.userData.weaponKind).length, 0); assert.equal(f.scene.getObjectByName('hostile-arrow'), undefined);
    const count = f.updates; f.jump(8.9); assert.equal(f.state.phase, 'disaster'); assert.ok(f.updates - count <= 6);
    f.jump(.2); assert.equal(f.state.phase, 'ended'); assert.equal(f.state.outcome, 'legend'); assert.equal(f.state.finaleTime, 9); assert.equal(f.state.score, 235);
    const score = f.state.score; f.engine.attack(); f.jump(2); assert.equal(f.state.score, score); assert.equal(f.state.kills, 1);
  } finally { f.engine.destroy(); }
});

test('quitting paused play emits one loss and preserves earned rewards and weapons', () => {
  const f = fixture(1, ['sword', 'bow']);
  try {
    const ready = f.state; f.engine.endRun(); assert.equal(f.state, ready, 'quitting the opening menu is a no-op');
    f.engine.start(); const plot = f.map.plots[0]; f.teleport(plot.x, plot.z); assert.equal(f.engine.buildAtPlot(plot.id, 'house'), true);
    const landmark = f.map.landmarks[0]; f.teleport(landmark.x, landmark.z); f.engine.interact();
    const earned = f.state.score, elapsed = f.state.timeLeft, weapons = JSON.stringify(f.state.weapons); assert.ok(earned > 0);
    f.engine.dodge(); f.engine.pause(); const snapshots = f.snapshots.length;
    f.engine.endRun(); f.engine.endRun();
    assert.equal(f.snapshots.length, snapshots + 1, 'repeated quit calls do not create duplicate completion transitions');
    assert.equal(f.state.phase, 'ended'); assert.equal(f.state.outcome, 'fallen'); assert.equal(f.state.health, 0); assert.equal(f.state.paused, false);
    assert.equal(f.state.timeLeft, elapsed); assert.equal(f.state.score, earned); assert.equal(JSON.stringify(f.state.weapons), weapons);
    f.engine.attack(); f.engine.interact(); f.engine.resume(); f.jump(15); assert.equal(f.state.score, earned); assert.equal(f.state.timeLeft, elapsed);
  } finally { f.engine.destroy(); }
});

test('return to menu clears a finished battle without emitting playing or allowing an active run reset', () => {
  const f = fixture(1, ['sword', 'bow', 'hammer']);
  try {
    f.engine.start(); const seed = f.state.seed, count = f.snapshots.length;
    f.engine.returnToMenu(4, ['sword']); assert.equal(f.state.phase, 'playing'); assert.equal(f.state.seed, seed); assert.equal(f.snapshots.length, count, 'active runs must be explicitly ended first');
    f.engine.commandCompanion({ character: 'mira', action: 'fight' }); f.engine.commandCompanion({ character: 'theron', action: 'build', building: 'house' });
    f.jump(90.01); const boss = f.raiders.find(enemy => enemy.userData.enemyKind === 'boss'); assert.ok(boss);
    f.engine.selectWeapon('bow'); f.engine.attack(); const arrow = f.scene.getObjectByName('friendly-arrow'); assert.ok(arrow);
    const previousWorld = f.world.root, previousAdvisor = f.scene.getObjectByName('mira');
    f.engine.pause(); f.engine.endRun(); const ending = f.state.ending, before = f.snapshots.length, eventCount = f.events.length;
    assert.equal(arrow.parent, null, 'quitting clears in-flight projectiles immediately');
    f.engine.returnToMenu(3, ['sword', 'bow', 'hammer']);
    assert.equal(f.snapshots.length, before + 1); assert.equal(f.snapshots.at(-1).phase, 'ready', 'reset exposes no transient playing state');
    assert.equal(f.events.length, eventCount, 'returning produces no raid or start notices');
    assert.equal(f.state.phase, 'ready'); assert.equal(f.state.stage, 3); assert.equal(f.state.timeLeft, 120); assert.equal(f.state.score, 0); assert.equal(f.state.health, 100);
    assert.equal(f.state.paused, false); assert.equal(f.state.boss, 'waiting'); assert.equal(f.state.bossEnemy, null); assert.equal(f.state.enemyPositions.length, 0);
    assert.equal(f.state.buildings.length, 0); assert.equal(f.state.attackCooldown, 0); assert.equal(f.state.dodgeCooldown, 0); assert.equal(f.state.wave, 0); assert.equal(f.state.hint, ''); assert.equal(f.state.nearest, null);
    assert.equal(JSON.stringify(f.state.weapons), JSON.stringify(['sword', 'bow', 'hammer'])); assert.equal(f.state.weapon, 'sword');
    assert.ok(f.state.companions.every(companion => companion.action === 'idle')); assert.equal(boss.parent, null); assert.equal(previousWorld.parent, null); assert.equal(previousAdvisor.parent, null);
    assert.equal(f.scene.children.filter(object => object.userData.weaponKind).length, 0);
    const camera = f.camera.position.clone(), player = f.hero.position.clone(), menu = f.state;
    f.engine.setInput('forward', true); f.engine.setControllerInput({ x: 1, y: 1, lookX: 1, lookY: 1, sprint: true }); f.jump(30);
    assert.equal(f.state.timeLeft, 120); assert.equal(f.state.productionTime, 0); assert.equal(f.hero.position.distanceTo(player), 0); assert.equal(f.camera.position.distanceTo(camera), 0, 'menu keeps the wide camera still');
    f.engine.start(); assert.equal(f.state.phase, 'playing'); assert.equal(f.state.stage, menu.stage); assert.equal(f.state.weapons.length, 3); assert.notEqual(f.state.ending, ending, 'last completed ending remains excluded');
    const spawn = f.hero.position.clone(); f.advance(.2); assert.equal(f.hero.position.distanceTo(spawn), 0, 'opening menu input does not leak into the new run');
    assert.equal(f.state.boss, 'waiting'); assert.equal(f.state.score, 0); assert.equal(f.state.buildings.length, 0);
  } finally { f.engine.destroy(); }
});

test('quitting a paused horse finale finalizes the earned victory exactly once', () => {
  const f = fixture(1, ['sword', 'hammer']);
  try {
    f.engine.start(); f.engine.selectWeapon('hammer'); f.jump(90.01); const boss = f.raiders.find(enemy => enemy.userData.enemyKind === 'boss'); assert.ok(boss);
    for (let hit = 0; hit < 12; hit++) {
      for (const enemy of f.raiders) enemy.position.set(43, 0, -36); if (hit) f.advance(1.08);
      boss.position.set(f.hero.position.x + 3, 0, f.hero.position.z); f.engine.attack();
    }
    assert.equal(f.state.boss, 'defeated'); f.jump(f.state.timeLeft + .2); assert.equal(f.state.phase, 'disaster');
    f.advance(.6); f.engine.pause(); const score = f.state.score, count = f.snapshots.length, updates = f.updates;
    f.engine.returnToMenu(); assert.equal(f.state.phase, 'disaster', 'a cinematic cannot be silently discarded');
    f.engine.endRun(); f.engine.endRun();
    assert.equal(f.snapshots.length, count + 1); assert.equal(f.state.phase, 'ended'); assert.equal(f.state.outcome, 'legend'); assert.equal(f.state.finaleTime, 9);
    assert.equal(f.state.score, score + 200); assert.equal(f.state.survivalScore, 200); assert.equal(f.state.kills, 1); assert.equal(f.state.paused, false); assert.equal(f.updates, updates + 1, 'the final collapse is applied once');
    f.jump(20); assert.equal(f.state.score, score + 200);
    f.engine.returnToMenu(2, ['sword', 'hammer']); assert.equal(f.state.phase, 'ready'); assert.equal(f.state.stage, 2); assert.equal(f.state.weapons.length, 2);
    f.engine.destroy(); const ended = f.snapshots.length; f.engine.endRun(); f.engine.returnToMenu(); assert.equal(f.snapshots.length, ended);
  } finally { f.engine.destroy(); }
});
