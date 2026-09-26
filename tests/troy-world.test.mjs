import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const moduleURL = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const mapsURL = moduleURL(compile('../app/troy/maps.ts'));
const configURL = moduleURL(compile('../app/troy/config.ts'));
const source = compile('../app/troy/world.ts')
  .replace("from 'three'", `from '${import.meta.resolve('three')}'`)
  .replace("from 'three/addons/utils/BufferGeometryUtils.js'", `from '${import.meta.resolve('three/addons/utils/BufferGeometryUtils.js')}'`)
  .replace("from './config'", `from '${configURL}'`)
  .replace("from './maps'", `from '${mapsURL}'`);
const { createCityMap } = await import(mapsURL);
const { createTroyWorld } = await import(moduleURL(source));
const makeState = (map, stage, ending = 'stampede') => ({ seed: 47, stage, phase: 'playing', explored: [], ending, finaleTime: 0, buildings: map.plots.map((p, i) => ({ plotId: p.id, kind: ['house', 'farm', 'tower', 'temple'][i % 4], builtAt: 0 })) });
const release = world => {
  const geometries = new Set(), materials = new Set();
  world.root.traverse(o => { if (o.isMesh) { geometries.add(o.geometry); for (const material of Array.isArray(o.material) ? o.material : [o.material]) materials.add(material); if (o.isInstancedMesh) o.dispose(); } });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); world.dispose();
};

// Flood the real collision map after all buildings exist. This catches accidental road,
// scenery and district bottlenecks that checking point distances alone would miss.
function reachablePoints(map, colliders) {
  const step = 1, cols = 101, rows = 87;
  const clear = (x, z) => !colliders.some(c => Math.abs(x - c.x) < c.w / 2 + .42 && Math.abs(z - c.z) < c.d / 2 + .42);
  const startX = Math.round(map.spawn.x - map.bounds.minX), startZ = Math.round(map.spawn.z - map.bounds.minZ);
  const queue = [[startX, startZ]], seen = new Set([startZ * cols + startX]);
  assert.ok(clear(map.spawn.x, map.spawn.z), 'spawn remains outside finished buildings and scenery');
  for (let head = 0; head < queue.length; head++) {
    const [x, z] = queue[head];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz, key = nz * cols + nx;
      if (nx < 1 || nx >= cols - 1 || nz < 1 || nz >= rows - 1 || seen.has(key) || !clear(map.bounds.minX + nx * step, map.bounds.minZ + nz * step)) continue;
      seen.add(key); queue.push([nx, nz]);
    }
  }
  return queue.map(([x, z]) => ({ x: map.bounds.minX + x * step, z: map.bounds.minZ + z * step }));
}

test('expedition maps are large, deterministic, immutable and vary by stage and seed', () => {
  const names = new Set(), plans = new Set();
  for (let stage = 1; stage <= 4; stage++) {
    for (const seed of [1, 47, 1234]) {
      const map = createCityMap(stage, seed); names.add(map.theme); plans.add(JSON.stringify(map.plots));
      assert.equal(map, createCityMap(stage, seed), 'hot gameplay lookups use cached maps');
      assert.ok(Object.isFrozen(map) && Object.isFrozen(map.plots) && Object.isFrozen(map.landmarks[0].reward));
      assert.ok((map.bounds.maxX - map.bounds.minX) * (map.bounds.maxZ - map.bounds.minZ) >= 4 * 46 * 37);
      assert.equal(map.plots.length, 30); assert.equal(map.resources.length, 15); assert.equal(map.landmarks.length, 4);
      assert.equal(map.plots[0].id, 'p1'); assert.ok(Math.hypot(map.plots[0].x - map.spawn.x, map.plots[0].z - map.spawn.z) < 4);
      for (const p of [...map.plots, ...map.resources, ...map.advisors, ...map.landmarks, map.spawn, map.gate]) assert.ok(p.x > map.bounds.minX && p.x < map.bounds.maxX && p.z > map.bounds.minZ && p.z < map.bounds.maxZ);
      for (let a = 0; a < map.plots.length; a++) for (let b = a + 1; b < map.plots.length; b++) assert.ok(Math.abs(map.plots[a].x - map.plots[b].x) > 5 || Math.abs(map.plots[a].z - map.plots[b].z) > 5, 'plot foundations do not overlap');
    }
  }
  assert.equal(names.size, 4); assert.ok(plans.size >= 10);
  assert.equal(createCityMap(5, 1).theme, 'coast');
  assert.equal(createCityMap(NaN, NaN), createCityMap(1, 1));
});

test('each fully built city retains routes to every resource, landmark, advisor and gate', () => {
  for (let stage = 1; stage <= 4; stage++) {
    const map = createCityMap(stage, 47), world = createTroyWorld(map), state = makeState(map, stage);
    const originalColliders = world.colliders.length;
    try {
      world.sync(state); assert.equal(world.colliders.length, originalColliders + 30);
      const reachable = reachablePoints(map, world.colliders);
      for (const target of [...map.resources, ...map.landmarks, ...map.advisors, map.gate]) assert.ok(reachable.some(p => Math.hypot(p.x - target.x, p.z - target.z) < 2), `${map.theme}: unreachable ${target.id ?? 'gate'}`);
      state.explored = [map.landmarks[0].id]; world.sync(state);
      assert.equal(world.root.getObjectByName(`Unclaimed landmark ${map.landmarks[0].id}`).visible, false);
      assert.equal(world.root.getObjectByName(`Unclaimed landmark ${map.landmarks[1].id}`).visible, true);
      state.phase = 'ready'; state.buildings = []; state.explored = []; world.sync(state);
      assert.equal(world.colliders.length, originalColliders);
      assert.equal(world.root.children.filter(o => o.name.startsWith('Unbuilt foundation') && o.visible).length, 30);
    } finally { release(world); }
  }
});

test('all four finales destroy all thirty plots in every biome and reset without accumulating objects', () => {
  for (let stage = 1; stage <= 4; stage++) {
    const map = createCityMap(stage, 47), world = createTroyWorld(map), initialCount = world.root.children.length;
    try {
      for (const ending of ['stampede', 'firestorm', 'ambush', 'earthquake']) {
        const state = makeState(map, stage, ending); world.sync(state);
        for (let frame = 0; frame <= 90; frame++) { state.phase = 'disaster'; state.finaleTime = frame / 10; world.update(frame / 10, .1, state, false); }
        const city = world.root.children.filter(o => o.name.startsWith('Constructed'));
        assert.equal(city.length, 30); assert.ok(city.every(o => !o.visible), `${map.theme}/${ending}: every building must fall by nine seconds`);
        world.root.traverse(o => assert.ok([...o.position, ...o.scale, o.rotation.x, o.rotation.y, o.rotation.z].every(Number.isFinite)));
        world.reset(); assert.equal(world.root.children.length, initialCount);
      }
    } finally { release(world); }
  }
});
