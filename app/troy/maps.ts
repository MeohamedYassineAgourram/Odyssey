import type { CityMap, Material, RunState } from './types';

const THEMES = [
  { theme: 'coast', name: 'The Sapphire Coast', subtitle: 'Harbour quarters, sea cliffs and forgotten lighthouse stores.', districts: [[0, 21], [-28, 19], [28, 19], [-25, -14], [25, -14]], home: 0, landmarks: ['The Old Lighthouse', 'Sunken King’s Lookout', 'Mariner’s Treasury', 'The Saltwind Shrine'] },
  { theme: 'desert', name: 'The Amber Oasis', subtitle: 'Sandstone courtyards surround an ancient oasis and buried vaults.', districts: [[-22, 22], [24, 22], [0, -5], [-31, -20], [31, -20]], home: 0, landmarks: ['The Sunken Obelisk', 'Caravanserai Cache', 'The Moonwell', 'The Golden Steps'] },
  { theme: 'forest', name: 'The Emerald Vale', subtitle: 'Woodland boroughs, green terraces and shrines beneath the canopy.', districts: [[-29, 21], [0, 17], [29, 18], [-21, -18], [22, -14]], home: 1, landmarks: ['The Elder Grove', 'The Mossbound Archive', 'Ranger’s Retreat', 'The Silver Spring'] },
  { theme: 'highland', name: 'The Stormbound Heights', subtitle: 'Slate strongholds, winding high roads and eagle watchposts.', districts: [[-28, 20], [26, 23], [0, -5], [-31, -21], [32, -18]], home: 1, landmarks: ['The Eagle’s Watch', 'The Thunder Cairn', 'The Lost Observatory', 'The Wind Bell'] },
] as const;

const cityCache = new Map<string, CityMap>();

/** A city is a reproducible expedition: stage selects its biome; seed reshapes its districts. */
export function createCityMap(stage = 1, seed = 1): CityMap {
  const level = Number.isFinite(stage) ? Math.max(1, Math.min(10_000, Math.floor(stage))) : 1;
  const cleanSeed = Number.isFinite(seed) ? (Math.abs(Math.trunc(seed)) >>> 0) || 1 : 1;
  const cacheKey = `${level}:${cleanSeed}`;
  const cached = cityCache.get(cacheKey); if (cached) return cached;
  let hash = cleanSeed;
  hash = (Math.imul(hash ^ level, 1597334677) ^ 3812015801) >>> 0;
  const random = () => { hash = (Math.imul(hash, 1664525) + 1013904223) >>> 0; return hash / 4294967296; };
  const definition = THEMES[(level - 1) % THEMES.length];
  const mirror = random() < .5 ? -1 : 1;
  // Small, bounded offsets keep six-lot neighbourhoods apart while changing every expedition.
  const districts = definition.districts.map(([x, z]) => ({ x: mirror * (x + (Math.floor(random() * 3) - 1) * 1.5), z: z + (Math.floor(random() * 3) - 1) * 1.5 }));
  const home = districts[definition.home];
  const spawn = { x: home.x - mirror * 5.1, z: home.z + 12.1 };
  const bounds = { minX: -50, maxX: 50, minZ: -43, maxZ: 43 };
  const gate = { x: 0, z: -39 };
  const positions = districts.flatMap(d => [-8.4, 0, 8.4].flatMap(dz => [-5.1, 5.1].map(dx => ({ x: d.x + dx, z: d.z + dz }))));
  positions.sort((a, b) => Math.hypot(a.x - spawn.x, a.z - spawn.z) - Math.hypot(b.x - spawn.x, b.z - spawn.z));
  const plots = positions.map((position, i) => ({ id: `p${i + 1}`, ...position }));
  const materialKinds: Material[] = ['wood', 'stone', 'bronze'];
  const resources = districts.flatMap((d, district) => materialKinds.map((resource, i) => ({ id: `${resource}-district-${district + 1}`, resource, x: d.x + (i === 1 ? 1.35 : i === 0 ? -1.35 : 0), z: d.z + (i - 1) * 5.1, amount: resource === 'bronze' ? 2 : 3 })));
  const landmarks = [[-43, 33], [43, 33], [-43, -33], [43, -33]].map(([x, z], i) => ({ id: `landmark-${i + 1}`, name: definition.landmarks[i], x: x * mirror, z, reward: { wood: 5 + i % 2 * 2, stone: 4 + (i + 1) % 2 * 2, bronze: 2 + (i > 1 ? 1 : 0) } }));
  const advisors = [{ id: 'theron' as const, x: home.x + mirror * 1.8, z: home.z + 12.5 }, { id: 'mira' as const, x: home.x - mirror * 1.8, z: home.z + 12.5 }];
  // Find broad connected routes around ALL finished buildings, not just today's empty plots.
  const step = 1.5, columns = 65, rows = 55;
  const origin = { x: -48, z: -40.5 };
  const cell = (x: number, z: number) => ({ x: Math.max(0, Math.min(columns - 1, Math.round((x - origin.x) / step))), z: Math.max(0, Math.min(rows - 1, Math.round((z - origin.z) / step))) });
  const index = (x: number, z: number) => z * columns + x;
  const point = (i: number) => ({ x: origin.x + i % columns * step, z: origin.z + Math.floor(i / columns) * step });
  const blocked = new Uint8Array(columns * rows);
  for (let i = 0; i < blocked.length; i++) { const p = point(i); if (plots.some(plot => Math.abs(p.x - plot.x) < 3.55 && Math.abs(p.z - plot.z) < 3.55)) blocked[i] = 1; }
  const connected = new Set<number>();
  const startCell = cell(gate.x, gate.z); connected.add(index(startCell.x, startCell.z));
  const segments = new Map<string, { x: number; z: number; w: number; d: number }>();
  const connect = (destination: { x: number; z: number }) => {
    const end = cell(destination.x, destination.z), target = index(end.x, end.z);
    if (blocked[target]) return;
    const previous = new Int32Array(blocked.length).fill(-1), queue = new Int32Array(blocked.length);
    let head = 0, tail = 0; queue[tail++] = target; previous[target] = target; let found = -1;
    while (head < tail) {
      const current = queue[head++]; if (connected.has(current)) { found = current; break; }
      const x = current % columns, z = Math.floor(current / columns);
      for (const [dx, dz] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
        const nx = x + dx, nz = z + dz; if (nx < 0 || nx >= columns || nz < 0 || nz >= rows) continue;
        const next = index(nx, nz); if (blocked[next] || previous[next] !== -1) continue;
        previous[next] = current; queue[tail++] = next;
      }
    }
    if (found < 0) return;
    let current = found;
    while (current !== target) {
      const next = previous[current], a = point(current), b = point(next), key = [Math.min(current, next), Math.max(current, next)].join(':');
      segments.set(key, { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, w: Math.abs(a.x - b.x) + 2.35, d: Math.abs(a.z - b.z) + 2.35 });
      connected.add(current); connected.add(next); current = next;
    }
  };
  // Connecting district axes first keeps the visual street plan readable; corners become expeditions.
  for (const d of districts) { connect({ x: d.x, z: d.z - 12 }); connect({ x: d.x, z: d.z + 12 }); }
  connect(spawn); landmarks.forEach(connect);
  const roads = [...segments.values()];
  const map: CityMap = { id: `${definition.theme}-${level}-${cleanSeed}`, name: definition.name, subtitle: definition.subtitle, theme: definition.theme, bounds, spawn, gate, plots, resources, advisors, landmarks, roads };
  for (const items of [plots, resources, advisors, landmarks, roads]) { items.forEach(item => Object.freeze(item)); Object.freeze(items); }
  landmarks.forEach(landmark => Object.freeze(landmark.reward));
  Object.freeze(bounds); Object.freeze(spawn); Object.freeze(gate); Object.freeze(map);
  cityCache.set(cacheKey, map);
  if (cityCache.size > 24) cityCache.delete(cityCache.keys().next().value!);
  return map;
}

export const getCityMap = (state: Pick<RunState, 'stage' | 'seed'>): CityMap => createCityMap(state.stage, state.seed);
