import type { Blueprint, EndingKind, Material, Mission, Plot, WeaponKind } from './types';
export const RUN_DURATION = 120;
export const FINALE_DURATION = 9;
export const BOSS_ARRIVAL = 30;
export const WEAPONS: { id: WeaponKind; name: string; description: string }[] = [
  { id: 'sword', name: 'Bronze sword', description: 'A reliable blade for close combat.' },
  { id: 'bow', name: 'Hunter’s bow', description: 'Keep your distance and strike from range.' },
  { id: 'hammer', name: 'War hammer', description: 'Heavy blows for enemies crowding around you.' },
];
export const BLUEPRINTS: Blueprint[] = [
  { id: 'house', name: 'Trojan house', description: 'Raise a home. A fast, affordable foundation for your legend.', cost: { wood: 3, stone: 1, bronze: 0 }, points: 100 },
  { id: 'farm', name: 'Timber yard', description: 'Produces 1 timber every 8 seconds. Build early to grow faster.', cost: { wood: 2, stone: 2, bronze: 0 }, points: 140 },
  { id: 'tower', name: 'Cannon tower', description: 'A mounted cannon automatically blasts nearby raiders.', cost: { wood: 3, stone: 3, bronze: 1 }, points: 230 },
  { id: 'temple', name: 'Temple of Troy', description: 'A glorious landmark. Restores 4 health every 8 seconds.', cost: { wood: 4, stone: 4, bronze: 2 }, points: 400 },
];
export const PLOTS: Plot[] = [
  { id: 'p1', x: -5.5, z: 8 }, { id: 'p2', x: 5.5, z: 8 },
  { id: 'p3', x: -5.5, z: 1 }, { id: 'p4', x: 5.5, z: 1 },
  { id: 'p5', x: -5.5, z: -6 }, { id: 'p6', x: 5.5, z: -6 },
  { id: 'p7', x: -13.5, z: 8 }, { id: 'p8', x: 13.5, z: 8 },
  { id: 'p9', x: -13.5, z: 1 }, { id: 'p10', x: 13.5, z: 1 },
  { id: 'p11', x: -13.5, z: -6 }, { id: 'p12', x: 13.5, z: -6 },
];
export const RESOURCE_NODES: { id: string; resource: Material; x: number; z: number; amount: number }[] = [
  { id: 'wood-west', resource: 'wood', x: -19, z: 9, amount: 3 },
  { id: 'wood-north', resource: 'wood', x: -8, z: -12, amount: 3 },
  { id: 'stone-east', resource: 'stone', x: 19, z: 3, amount: 3 },
  { id: 'stone-north', resource: 'stone', x: 8, z: -12, amount: 3 },
  { id: 'bronze-south', resource: 'bronze', x: 1.5, z: 15, amount: 2 },
  { id: 'bronze-west', resource: 'bronze', x: -19, z: -5, amount: 2 },
];
export const ADVISORS = [{ id: 'theron' as const, x: -3, z: 14 }, { id: 'mira' as const, x: 3, z: -12 }];
export const MISSIONS: Mission[] = [
  { id: 'first-home', title: 'A city begins with one home', description: 'Build a Trojan house.', metric: 'house', target: 1, reward: { wood: 4, stone: 3, bronze: 1 }, points: 60 },
  { id: 'supply-lines', title: 'Open the supply lines', description: 'Collect from 3 resource deposits.', metric: 'gathered', target: 3, reward: { wood: 3, stone: 3, bronze: 2 }, points: 60 },
  { id: 'growing-troy', title: 'Three roofs, one dream', description: 'Construct 3 buildings of any kind.', metric: 'buildings', target: 3, reward: { wood: 4, stone: 4, bronze: 1 }, points: 90 },
  { id: 'industry', title: 'The wheels of industry', description: 'Build a timber yard.', metric: 'farm', target: 1, reward: { wood: 2, stone: 3, bronze: 1 }, points: 70 },
  { id: 'watch', title: 'Eyes on the horizon', description: 'Build a cannon tower.', metric: 'tower', target: 1, reward: { wood: 3, stone: 4, bronze: 1 }, points: 80 },
  { id: 'defender', title: 'Not without a fight', description: 'Defeat 3 raiders with weapons, allies, or towers.', metric: 'kills', target: 3, reward: { wood: 5, stone: 4, bronze: 2 }, points: 100 },
  { id: 'district', title: 'A city worth remembering', description: 'Construct 6 buildings.', metric: 'buildings', target: 6, reward: { wood: 4, stone: 4, bronze: 2 }, points: 140 },
  { id: 'glory', title: 'A monument to impossible hope', description: 'Complete a temple.', metric: 'temple', target: 1, reward: { wood: 4, stone: 3, bronze: 1 }, points: 150 },
];
export const ENDINGS: Record<EndingKind, { title: string; subtitle: string }> = {
  stampede: { title: 'The gift grew legs.', subtitle: 'Nobody asked why the horse was still growing.' },
  firestorm: { title: 'Some gifts come pre-lit.', subtitle: 'The horse was less of a peace offering. More of a furnace.' },
  ambush: { title: 'One horse. Too many guests.', subtitle: 'The invitation clearly said plus one.' },
  earthquake: { title: 'A city on borrowed ground.', subtitle: 'The horse knocked. The foundations answered.' },
};
