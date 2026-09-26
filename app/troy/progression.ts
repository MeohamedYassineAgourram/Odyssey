import type { EndingKind, RunState } from './types';

export type ProgressProfile = {
  xp: number; best: number; total: number; runs: number; clears: number; stage: number;
  endings: EndingKind[]; lastEnding?: EndingKind;
};
export type XPBreakdown = { buildings: number; combat: number; contracts: number; exploration: number; survival: number; total: number };
export type Rank = { name: string; division: string; label: string; floor: number; next: number | null; progress: number; color: string };
export const EMPTY_PROFILE: ProgressProfile = { xp: 0, best: 0, total: 0, runs: 0, clears: 0, stage: 1, endings: [] };
const names = ['Recruit', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Immortal'];
const colors = ['#a5b5b0', '#c99462', '#c3d5df', '#f3ca70', '#76d4cb', '#a9baff', '#f28db6'];
const thresholds = [0, 300, 700, 1200, 1800, 2500, 3300, 4200, 5200, 6500, 8000, 9800, 12000, 14500, 17500, 21000, 25000, 30000, 36000];
export const RANKS: ReadonlyArray<Omit<Rank, 'progress'>> = thresholds.map((floor, index) => {
  const tier = Math.min(6, Math.floor(index / 3)), name = names[tier], division = tier === 6 ? '' : ['I', 'II', 'III'][index % 3];
  return { name, division, label: `${name}${division ? ` ${division}` : ''}`, floor, next: thresholds[index + 1] ?? null, color: colors[tier] };
});

export function getRankLadder(): { label: string; floor: number; color: string }[] {
  return RANKS.map(({ label, floor, color }) => ({ label, floor, color }));
}

export function getRank(xp: number): Rank {
  const amount = Number.isFinite(xp) ? Math.max(0, xp) : 0;
  const rank = [...RANKS].reverse().find(item => amount >= item.floor)!;
  return { ...rank, progress: rank.next === null ? 1 : Math.min(1, (amount - rank.floor) / (rank.next - rank.floor)) };
}

export function calculateXP(state: RunState): XPBreakdown {
  if (state.phase !== 'ended') return { buildings: 0, combat: 0, contracts: 0, exploration: 0, survival: 0, total: 0 };
  const parts = {
    buildings: state.buildings.length * 15, combat: state.kills * 8,
    contracts: state.completedMissions.length * 25, exploration: state.explored.length * 35,
    survival: state.outcome === 'legend' ? 150 : 0,
  };
  return { ...parts, total: Object.values(parts).reduce((sum, value) => sum + value, 0) };
}

export function applyRunResult(profile: ProgressProfile, state: RunState): ProgressProfile {
  if (state.phase !== 'ended' || state.outcome === 'none' || state.stage !== profile.stage) return profile;
  const survived = state.outcome === 'legend';
  return {
    xp: profile.xp + calculateXP(state).total, best: survived ? Math.max(profile.best, state.score) : profile.best,
    total: profile.total + (survived ? state.score : 0), runs: profile.runs + 1,
    clears: profile.clears + Number(survived), stage: Math.min(10_000, profile.stage + Number(survived)),
    endings: survived ? [...new Set([...profile.endings, state.ending])] : [...profile.endings],
    lastEnding: state.ending,
  };
}
