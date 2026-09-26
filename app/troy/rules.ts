import { BLUEPRINTS, ENDINGS, FINALE_DURATION, MISSIONS, RUN_DURATION } from './config';
import { createCityMap } from './maps';
import type { BuildingKind, EndingKind, Material, Materials, Mission, MissionProgress, RunState } from './types';

const MATERIALS: Material[] = ['wood', 'stone', 'bronze'];
const PRODUCTION_INTERVAL = 8;
const add = (value: number, amount: number) => Math.min(Number.MAX_SAFE_INTEGER, value + amount);
const score = (state: RunState): RunState => ({ ...state, score: state.constructionScore + state.missionScore + state.combatScore + state.survivalScore + state.expeditionScore });

export function getRunMissions(state: Pick<RunState, 'seed' | 'stage'>): Mission[] {
  const bonus: Mission[] = [
    { id: 'explorer', title: 'Beyond the city walls', description: 'Discover two landmarks.', metric: 'explored', target: 2, reward: { wood: 6, stone: 5, bronze: 2 }, points: 130 },
    { id: 'vanguard', title: 'Hold the frontier', description: 'Defeat eight raiders.', metric: 'kills', target: 8, reward: { wood: 5, stone: 6, bronze: 3 }, points: 150 },
    { id: 'sacred-city', title: 'A city of wonders', description: 'Raise two temples.', metric: 'temple', target: 2, reward: { wood: 6, stone: 6, bronze: 3 }, points: 160 },
    { id: 'caravan', title: 'Supply the expedition', description: 'Collect from eight deposits.', metric: 'gathered', target: 8, reward: { wood: 7, stone: 5, bronze: 3 }, points: 140 },
  ];
  const offset = ((state.seed >>> 3) + state.stage - 1) % bonus.length;
  return [...MISSIONS, bonus[offset], bonus[(offset + 1) % bonus.length]].map(mission => ({ ...mission, reward: { ...mission.reward } }));
}

function metric(state: RunState, mission: Mission): number {
  if (mission.metric === 'buildings') return state.buildings.length;
  if (mission.metric === 'gathered') return state.gathered;
  if (mission.metric === 'kills') return state.kills;
  if (mission.metric === 'explored') return state.explored.length;
  return state.buildings.filter(building => building.kind === mission.metric).length;
}

function rewardMissions(state: RunState): RunState {
  const completed = new Set(state.completedMissions);
  const materials = { ...state.materials };
  let missionScore = state.missionScore;
  for (const mission of getRunMissions(state)) {
    if (completed.has(mission.id) || metric(state, mission) < mission.target) continue;
    completed.add(mission.id);
    missionScore += mission.points;
    for (const material of MATERIALS) materials[material] = add(materials[material], mission.reward[material]);
  }
  return score({ ...state, materials, missionScore, completedMissions: [...completed] });
}

export function createRun(seed: number, previousEnding?: EndingKind, stage = 1): RunState {
  const cleanSeed = Number.isFinite(seed) ? (Math.abs(Math.trunc(seed)) >>> 0) || 1 : 1;
  // An integer avalanche keeps adjacent seeds from cycling through the endings.
  let hash = cleanSeed;
  hash = Math.imul(hash ^ (hash >>> 16), 0x21f0aaad);
  hash = Math.imul(hash ^ (hash >>> 15), 0x735a2d97);
  hash = (hash ^ (hash >>> 15)) >>> 0;
  const endings = (Object.keys(ENDINGS) as EndingKind[]).filter(ending => ending !== previousEnding);
  return {
    seed: cleanSeed, stage: Number.isFinite(stage) ? Math.max(1, Math.min(10_000, Math.floor(stage))) : 1, phase: 'playing', timeLeft: RUN_DURATION, health: 100,
    materials: { wood: 3, stone: 2, bronze: 0 }, buildings: [], gathered: 0, kills: 0, completedMissions: [],
    explored: [], expeditionScore: 0, constructionScore: 0, missionScore: 0, combatScore: 0, survivalScore: 0, score: 0,
    ending: endings[Math.floor(hash / 0x100000000 * endings.length)],
    finaleTime: 0, productionTime: 0, outcome: 'none',
  };
}

export function advanceRun(state: RunState, dt: number): RunState {
  if ((state.phase !== 'playing' && state.phase !== 'disaster') || !Number.isFinite(dt) || dt <= 0) return state;
  const elapsed = Math.min(dt, RUN_DURATION);
  if (state.phase === 'disaster') {
    const finaleTime = Math.min(FINALE_DURATION, state.finaleTime + elapsed);
    if (finaleTime < FINALE_DURATION) return { ...state, finaleTime };
    return score({ ...state, phase: 'ended', finaleTime, outcome: 'legend', survivalScore: 200 });
  }
  const remaining = Math.max(0, state.timeLeft - elapsed);
  const timeLeft = remaining < 1e-9 ? 0 : remaining;
  const played = state.timeLeft - timeLeft;
  const before = RUN_DURATION - state.timeLeft;
  const after = RUN_DURATION - timeLeft;
  let wood = state.materials.wood;
  let health = state.health;
  for (const building of state.buildings) {
    // Age each building separately so a newly built yard cannot produce retroactively.
    const cycles = Math.floor((after - building.builtAt + 1e-9) / PRODUCTION_INTERVAL)
      - Math.floor((before - building.builtAt + 1e-9) / PRODUCTION_INTERVAL);
    if (building.kind === 'farm') wood = add(wood, cycles);
    if (building.kind === 'temple') health = Math.min(100, health + cycles * 4);
  }
  // Stop at the phase boundary: a background-tab jump must still show the full finale.
  return {
    ...state, timeLeft, health, materials: { ...state.materials, wood },
    productionTime: (state.productionTime + played) % PRODUCTION_INTERVAL,
    phase: timeLeft === 0 ? 'disaster' : 'playing', finaleTime: 0,
  };
}

export function buildingCostReason(state: RunState, kind: BuildingKind, plotId?: string): string | null {
  if (state.phase !== 'playing') return 'Construction has ended.';
  const blueprint = BLUEPRINTS.find(item => item.id === kind);
  if (!blueprint) return 'Choose a known blueprint.';
  const plots = createCityMap(state.stage, state.seed).plots;
  if (plotId !== undefined) {
    if (!plots.some(plot => plot.id === plotId)) return 'Choose a marked building plot.';
    if (state.buildings.some(building => building.plotId === plotId)) return 'This plot is already built.';
  } else if (state.buildings.length >= plots.length) return 'Every building plot is occupied.';
  const missing = MATERIALS.filter(material => state.materials[material] < blueprint.cost[material])
    .map(material => `${blueprint.cost[material] - state.materials[material]} ${material === 'wood' ? 'timber' : material}`);
  return missing.length ? `Need ${missing.join(', ')}.` : null;
}

export function canBuild(state: RunState, kind: BuildingKind, plotId?: string): boolean {
  return buildingCostReason(state, kind, plotId) === null;
}

export function buildAt(state: RunState, plotId: string, kind: BuildingKind): RunState {
  if (!canBuild(state, kind, plotId)) return state;
  const blueprint = BLUEPRINTS.find(item => item.id === kind)!;
  const materials = Object.fromEntries(MATERIALS.map(material => [material, state.materials[material] - blueprint.cost[material]])) as Materials;
  return rewardMissions({
    ...state, materials, constructionScore: state.constructionScore + blueprint.points,
    buildings: [...state.buildings, { plotId, kind, builtAt: RUN_DURATION - state.timeLeft }],
  });
}

export function gather(state: RunState, resource: Material, amount: number): RunState {
  if (state.phase !== 'playing' || !MATERIALS.includes(resource) || !Number.isFinite(amount) || amount < 1) return state;
  return rewardMissions({
    ...state, gathered: add(state.gathered, 1),
    materials: { ...state.materials, [resource]: add(state.materials[resource], Math.floor(amount)) },
  });
}

export function recordKill(state: RunState): RunState {
  if (state.phase !== 'playing') return state;
  return rewardMissions({ ...state, kills: add(state.kills, 1), combatScore: add(state.combatScore, 35) });
}

export function discoverLandmark(state: RunState, id: string): RunState {
  if (state.phase !== 'playing' || state.explored.includes(id)) return state;
  const landmark = createCityMap(state.stage, state.seed).landmarks.find(item => item.id === id);
  if (!landmark) return state;
  const materials = { ...state.materials };
  for (const material of MATERIALS) materials[material] = add(materials[material], landmark.reward[material]);
  return rewardMissions({ ...state, materials, explored: [...state.explored, id], expeditionScore: state.expeditionScore + 75 });
}

export function takeDamage(state: RunState, amount: number): RunState {
  if (state.phase !== 'playing' || !Number.isFinite(amount) || amount <= 0) return state;
  const health = Math.max(0, state.health - amount);
  return score({ ...state, health, phase: health === 0 ? 'ended' : 'playing', outcome: health === 0 ? 'fallen' : 'none', survivalScore: 0 });
}

export function getMissions(state: RunState): MissionProgress[] {
  return getRunMissions(state).map(mission => ({ ...mission, progress: Math.min(mission.target, metric(state, mission)), completed: state.completedMissions.includes(mission.id) }));
}
