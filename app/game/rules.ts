export const MISSION_SECONDS = 90;
export const SHARD_TARGET = 12;
export const LANES = [-5, 0, 5] as const;
export const MAX_SHIELD = 100;
export const HAZARD_DAMAGE = 25;

export type GamePhase = "ready" | "playing" | "paused" | "won" | "lost";
export type DirectiveEvent = "calm" | "storm" | "riches" | "turbo" | "repair";
export type GameDirective = { event: DirectiveEvent; message?: string };
export type GameSnapshot = {
  phase: GamePhase;
  score: number;
  shards: number;
  shield: number;
  speed: number;
  distance: number;
  timeLeft: number;
  combo: number;
  event: string;
  boost: number;
};

export const DIRECTIVE_LABELS: Record<DirectiveEvent, string> = {
  calm: "Stillwater passage",
  storm: "Ion storm",
  riches: "Crystal bloom",
  turbo: "Slipstream surge",
  repair: "Shield restored",
};

export function initialSnapshot(): GameSnapshot {
  return {
    phase: "ready",
    score: 0,
    shards: 0,
    shield: MAX_SHIELD,
    speed: 0,
    distance: 0,
    timeLeft: MISSION_SECONDS,
    combo: 1,
    event: "The awakening",
    boost: 100,
  };
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** A mission succeeds only after the full expedition and its shard objective. */
export function missionOutcome(shield: number, timeLeft: number, shards: number): "won" | "lost" | null {
  if (shield <= 0) return "lost";
  if (timeLeft <= 0) return shards >= SHARD_TARGET ? "won" : "lost";
  return null;
}
