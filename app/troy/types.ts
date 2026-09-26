export type Material = 'wood' | 'stone' | 'bronze';
export type Materials = Record<Material, number>;
export type BuildingKind = 'house' | 'farm' | 'tower' | 'temple';
export type EndingKind = 'stampede' | 'firestorm' | 'ambush' | 'earthquake';
export type TroyPhase = 'ready' | 'playing' | 'disaster' | 'ended';
export type CharacterId = 'lyra' | 'mira' | 'theron';
export type Blueprint = { id: BuildingKind; name: string; description: string; cost: Materials; points: number };
export type Plot = { id: string; x: number; z: number };
export type PlacedBuilding = { plotId: string; kind: BuildingKind; builtAt: number };
export type Mission = { id: string; title: string; description: string; target: number; metric: 'buildings' | 'gathered' | 'kills' | BuildingKind; reward: Materials; points: number };
export type MissionProgress = Mission & { progress: number; completed: boolean };
export type RunState = {
  seed: number; phase: TroyPhase; timeLeft: number; health: number; materials: Materials;
  buildings: PlacedBuilding[]; gathered: number; kills: number; completedMissions: string[];
  constructionScore: number; missionScore: number; combatScore: number; survivalScore: number; score: number;
  ending: EndingKind; finaleTime: number; productionTime: number; outcome: 'none' | 'legend' | 'fallen';
};
export type Interaction = { id: string; kind: 'plot' | 'resource' | 'advisor'; title: string; description: string; available: boolean; character?: CharacterId };
export type TroySnapshot = RunState & {
  paused: boolean; selected: BuildingKind; nearest: Interaction | null; player: { x: number; z: number };
  stamina: number; enemies: number; attackCooldown: number; dodgeCooldown: number; wave: number; hint: string;
};
export type ControllerInput = { x: number; y: number; lookX: number; lookY: number; sprint: boolean };
export type TroyEngine = {
  start(): void; pause(): void; resume(): void; interact(): void; attack(): void; dodge(): void;
  selectBuilding(kind: BuildingKind): void; cycleBuilding(direction: number): void; markSupplies(): void;
  setInput(action: 'forward' | 'backward' | 'left' | 'right' | 'sprint', pressed: boolean): void;
  setControllerInput(input: ControllerInput): void; setMuted(muted: boolean): void; destroy(): void;
};
export type TroyCallbacks = {
  onReady(): void; onUpdate(state: TroySnapshot): void;
  onEvent(event: { type: string; message: string }): void; onTalk(character: CharacterId): void;
};
