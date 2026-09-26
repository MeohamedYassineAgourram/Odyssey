export type Material = 'wood' | 'stone' | 'bronze';
export type Materials = Record<Material, number>;
export type BuildingKind = 'house' | 'farm' | 'tower' | 'temple';
export type EndingKind = 'stampede' | 'firestorm' | 'ambush' | 'earthquake';
export type TroyPhase = 'ready' | 'playing' | 'disaster' | 'ended';
export type CharacterId = 'lyra' | 'mira' | 'theron';
export type WeaponKind = 'sword' | 'bow' | 'hammer';
export type CompanionOrder = { character: 'theron' | 'mira'; action: 'fight' | 'build' | 'follow'; building?: BuildingKind };
export type CompanionStatus = { character: 'theron' | 'mira'; action: 'idle' | 'fight' | 'build' | 'follow'; description: string };
export type Blueprint = { id: BuildingKind; name: string; description: string; cost: Materials; points: number };
export type Plot = { id: string; x: number; z: number };
export type ResourceNode = { id: string; resource: Material; x: number; z: number; amount: number };
export type Landmark = { id: string; name: string; x: number; z: number; reward: Materials };
export type CityMap = {
  id: string; name: string; subtitle: string; theme: 'coast' | 'desert' | 'forest' | 'highland';
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  spawn: { x: number; z: number }; gate: { x: number; z: number };
  plots: Plot[]; resources: ResourceNode[];
  advisors: { id: 'theron' | 'mira'; x: number; z: number }[];
  landmarks: Landmark[]; roads: { x: number; z: number; w: number; d: number }[];
};
export type PlacedBuilding = { plotId: string; kind: BuildingKind; builtAt: number };
export type Mission = { id: string; title: string; description: string; target: number; metric: 'buildings' | 'gathered' | 'kills' | 'explored' | BuildingKind; reward: Materials; points: number };
export type MissionProgress = Mission & { progress: number; completed: boolean };
export type RunState = {
  seed: number; stage: number; phase: TroyPhase; timeLeft: number; health: number; materials: Materials;
  buildings: PlacedBuilding[]; gathered: number; kills: number; completedMissions: string[];
  explored: string[]; expeditionScore: number;
  weapons: WeaponKind[]; weapon: WeaponKind;
  constructionScore: number; missionScore: number; combatScore: number; survivalScore: number; score: number;
  ending: EndingKind; finaleTime: number; productionTime: number; outcome: 'none' | 'legend' | 'fallen';
};
export type Interaction = { id: string; kind: 'plot' | 'resource' | 'advisor' | 'landmark' | 'loot'; title: string; description: string; available: boolean; character?: CharacterId };
export type TroySnapshot = RunState & {
  paused: boolean; selected: BuildingKind; nearest: Interaction | null; player: { x: number; z: number };
  stamina: number; enemies: number; attackCooldown: number; dodgeCooldown: number; wave: number; hint: string;
  nextRaid: number; enemyPositions: { x: number; z: number; kind: 'skirmisher' | 'brute' | 'archer' }[];
  companions: CompanionStatus[];
};
export type ControllerInput = { x: number; y: number; lookX: number; lookY: number; sprint: boolean };
export type TroyEngine = {
  start(stage?: number, weapons?: WeaponKind[]): void; pause(): void; resume(): void; interact(): void; attack(): void; dodge(): void;
  buildAtPlot(plotId: string, kind: BuildingKind): boolean;
  selectWeapon(kind: WeaponKind): void; cycleWeapon(direction: number): void;
  commandCompanion(order: CompanionOrder): { accepted: boolean; message: string };
  selectBuilding(kind: BuildingKind): void; cycleBuilding(direction: number): void; markSupplies(): void;
  setInput(action: 'forward' | 'backward' | 'left' | 'right' | 'sprint', pressed: boolean): void;
  setControllerInput(input: ControllerInput): void; setMuted(muted: boolean): void; destroy(): void;
};
export type TroyCallbacks = {
  onReady(): void; onUpdate(state: TroySnapshot): void;
  onEvent(event: { type: string; message: string }): void; onTalk(character: CharacterId): void;
  onBuildPlot?(plotId: string): void;
};
