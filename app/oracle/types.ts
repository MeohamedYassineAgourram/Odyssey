export type Resource = 'food' | 'water' | 'herbs' | 'wood';
export type Inventory = Record<Resource, number>;
export type CharacterId = 'lyra' | 'mira' | 'theron';
export type WorldPhase = 'ready' | 'scavenge' | 'shelter' | 'won' | 'lost';
export type Nearby = { id: string; label: string; kind: 'resource' | 'companion' | 'shelter'; resource?: Resource; description: string };
export type WorldSnapshot = {
  phase: WorldPhase; timeLeft: number; inventory: Inventory; companions: CharacterId[];
  nearest: Nearby | null; player: { x: number; z: number }; stamina: number; paused: boolean;
};
export type GatherResult = { escaped: boolean; inventory: Inventory; companions: CharacterId[] };
export type ControllerInput = { x: number; y: number; lookX: number; lookY: number; sprint: boolean };
export type OracleEngine = {
  start(): void; pause(): void; resume(): void; interact(): void;
  setInput(action: 'forward' | 'backward' | 'left' | 'right' | 'sprint', pressed: boolean): void;
  setControllerInput(input: ControllerInput): void;
  setShelter(day: number, companions: CharacterId[]): void; setOutcome(won: boolean): void;
  markSupplies(): void; setMuted(muted: boolean): void; destroy(): void;
};
export type OracleCallbacks = { onReady(): void; onUpdate(state: WorldSnapshot): void; onEvent(event: { type: string; message: string }): void; onGatherEnd(result: GatherResult): void };
export type CampChoice = { id: string; label: string; description: string; cost?: Partial<Inventory>; gain?: Partial<Inventory>; health?: number; morale?: number; signal?: number };
export type CampEvent = { id: string; title: string; text: string; choices: CampChoice[] };
export type CampState = { day: number; inventory: Inventory; companions: CharacterId[]; health: number; morale: number; signal: number; log: string[]; outcome: 'playing' | 'won' | 'lost'; chosen: boolean; event: CampEvent };
