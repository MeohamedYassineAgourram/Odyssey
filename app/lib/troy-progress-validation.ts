import { RequestError } from './api-guard';
import { BLUEPRINTS, BOSS_ARRIVAL, ENDINGS, FINALE_DURATION, RUN_DURATION, WEAPONS } from '../troy/config';
import { createCityMap } from '../troy/maps';
import { getMissions, getRunMissions } from '../troy/rules';
import type { BuildingKind, EndingKind, Materials, RunState, WeaponKind } from '../troy/types';

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function number(value: unknown, field: string, maximum: number, integer = true): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > maximum || (integer && !Number.isInteger(value))) throw new RequestError(`Invalid ${field}.`);
  return value;
}
function strings(value: unknown, field: string, maximum: number): string[] {
  if (!Array.isArray(value) || value.length > maximum || value.some(item => typeof item !== 'string' || item.length > 80) || new Set(value).size !== value.length) throw new RequestError(`Invalid ${field}.`);
  return value as string[];
}

// This is bounded personal PvE progression, not a competitive anti-cheat system.
// Recompute every reward from validated gameplay facts, never trust client totals.
export function validatedRun(value: unknown): RunState {
  if (!object(value) || value.phase !== 'ended' || !['legend', 'fallen'].includes(String(value.outcome))) throw new RequestError('Only completed runs can earn experience.');
  const seed = number(value.seed, 'seed', 0xffffffff), stage = number(value.stage, 'stage', 10_000);
  if (seed < 1 || stage < 1) throw new RequestError('Invalid expedition seed or stage.');
  const map = createCityMap(stage, seed);
  const timeLeft = number(value.timeLeft, 'timeLeft', RUN_DURATION, false), health = number(value.health, 'health', 100, false);
  const finaleTime = number(value.finaleTime, 'finaleTime', FINALE_DURATION, false);
  const legacyBoss = value.boss === undefined;
  const boss = legacyBoss ? value.outcome === 'legend' ? 'defeated' : timeLeft <= BOSS_ARRIVAL ? 'active' : 'waiting' : value.boss;
  if (!['waiting', 'active', 'defeated'].includes(String(boss))) throw new RequestError('Invalid warlord state.');
  if ((boss === 'waiting' && timeLeft <= BOSS_ARRIVAL) || (boss !== 'waiting' && timeLeft > BOSS_ARRIVAL)) throw new RequestError('Warlord state does not match the clock.');
  if (value.outcome === 'legend' && (timeLeft !== 0 || health <= 0 || finaleTime !== FINALE_DURATION || boss !== 'defeated')) throw new RequestError('A city clear requires defeating the warlord and surviving the full finale.');
  if (value.outcome === 'fallen' && (health !== 0 || finaleTime !== 0 || (timeLeft === 0 && boss !== 'active'))) throw new RequestError('Invalid fallen run.');
  if (typeof value.ending !== 'string' || !Object.hasOwn(ENDINGS, value.ending)) throw new RequestError('Unknown ending.');
  if (!object(value.materials)) throw new RequestError('Invalid materials.');
  const materials = {} as Materials;
  for (const material of ['wood', 'stone', 'bronze'] as const) materials[material] = number(value.materials[material], `materials.${material}`, 10_000);
  if (!Array.isArray(value.buildings) || value.buildings.length > map.plots.length) throw new RequestError('Invalid buildings.');
  const buildings = value.buildings.map(item => {
    if (!object(item) || typeof item.plotId !== 'string' || !map.plots.some(plot => plot.id === item.plotId)
      || typeof item.kind !== 'string' || !BLUEPRINTS.some(plan => plan.id === item.kind)) throw new RequestError('Unknown building or plot.');
    return { plotId: item.plotId, kind: item.kind as BuildingKind, builtAt: number(item.builtAt, 'builtAt', RUN_DURATION - timeLeft, false) };
  });
  if (new Set(buildings.map(building => building.plotId)).size !== buildings.length) throw new RequestError('Duplicate building plot.');
  const explored = strings(value.explored, 'explored', map.landmarks.length);
  if (explored.some(id => !map.landmarks.some(landmark => landmark.id === id))) throw new RequestError('Unknown landmark.');
  const missions = getRunMissions({ seed, stage });
  const weapons = strings(value.weapons ?? ['sword'], 'weapons', 3) as WeaponKind[];
  if (!weapons.includes('sword') || weapons.some(kind => !WEAPONS.some(item => item.id === kind))) throw new RequestError('Unknown weapon inventory.');
  const weapon = value.weapon ?? 'sword';
  if (typeof weapon !== 'string' || !weapons.includes(weapon as WeaponKind)) throw new RequestError('The equipped weapon must be owned.');
  const completedMissions = strings(value.completedMissions, 'completedMissions', missions.length);
  if (completedMissions.some(id => !missions.some(mission => mission.id === id))) throw new RequestError('Unknown contract.');
  const state: RunState = {
    seed, stage, phase: 'ended', outcome: value.outcome as 'legend' | 'fallen', ending: value.ending as EndingKind,
    health, timeLeft, finaleTime, materials, buildings, explored, completedMissions, weapons, weapon: weapon as WeaponKind, boss: boss as RunState['boss'],
    gathered: number(value.gathered, 'gathered', 500), kills: number(value.kills, 'kills', 500),
    productionTime: number(value.productionTime, 'productionTime', 8, false),
    constructionScore: buildings.reduce((sum, building) => sum + BLUEPRINTS.find(plan => plan.id === building.kind)!.points, 0),
    combatScore: 0, missionScore: 0, expeditionScore: explored.length * 75, survivalScore: value.outcome === 'legend' ? 200 : 0, score: 0,
  };
  // Older clients had no boss or guaranteed kill. Preserve their exact earned
  // rewards; all explicit boss victories must include the ordinary kill credit.
  if (!legacyBoss && boss === 'defeated' && state.kills < 1) throw new RequestError('A defeated warlord must count as a kill.');
  const earned = getMissions(state).filter(mission => mission.progress >= mission.target).map(mission => mission.id);
  if (earned.length !== completedMissions.length || earned.some(id => !completedMissions.includes(id))) throw new RequestError('Contract completion does not match the run.');
  state.missionScore = missions.filter(mission => completedMissions.includes(mission.id)).reduce((sum, mission) => sum + mission.points, 0);
  state.combatScore = state.kills * 35;
  state.score = state.constructionScore + state.missionScore + state.combatScore + state.expeditionScore + state.survivalScore;
  for (const field of ['constructionScore', 'combatScore', 'missionScore', 'expeditionScore', 'survivalScore', 'score'] as const) {
    if (number(value[field], field, 50_000) !== state[field]) throw new RequestError(`Invalid ${field}.`);
  }
  return state;
}

