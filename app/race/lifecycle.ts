export type RaceStatus = "ready" | "grid-draw" | "countdown" | "racing" | "paused" | "finished";

const transitions: Record<RaceStatus, ReadonlySet<RaceStatus>> = {
  ready: new Set(["ready", "grid-draw", "countdown"]),
  "grid-draw": new Set(["ready", "countdown"]),
  countdown: new Set(["ready", "grid-draw", "countdown", "racing"]),
  racing: new Set(["ready", "racing", "paused", "finished"]),
  paused: new Set(["ready", "racing", "paused"]),
  finished: new Set(["ready", "grid-draw", "finished"]),
};

export function canTransitionRace(from: RaceStatus, to: RaceStatus) {
  return transitions[from].has(to);
}

export function transitionRace(from: RaceStatus, to: RaceStatus): RaceStatus {
  if (!canTransitionRace(from, to)) throw new Error(`Invalid race transition: ${from} -> ${to}`);
  return to;
}
