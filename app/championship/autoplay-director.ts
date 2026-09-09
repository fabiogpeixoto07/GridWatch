export type ChampionshipPlaybackMode = "manual" | "auto";
export type ChampionshipPresentation = "race-results" | "standings";

export const CHAMPIONSHIP_PRESENTATION_DURATION_MS: Record<ChampionshipPresentation, number> = {
  "race-results": 8_000,
  standings: 6_000,
};

export type AutoplayDirectorSnapshot = {
  paused: boolean;
  pending: boolean;
  remainingMs: number;
};

type Timer = ReturnType<typeof setTimeout>;

/** Owns presentation deadlines so championship flow never leaves orphaned UI timers. */
export class ChampionshipAutoplayDirector {
  private timer: Timer | null = null;
  private callback: (() => void) | null = null;
  private deadline = 0;
  private remainingMs = 0;
  private paused = false;

  constructor(private readonly now: () => number = () => performance.now()) {}

  schedule(delayMs: number, callback: () => void) {
    this.clearPending();
    this.callback = callback;
    this.remainingMs = Math.max(0, delayMs);
    if (!this.paused) this.arm();
  }

  pause() {
    if (this.paused) return;
    this.paused = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
      this.remainingMs = Math.max(0, this.deadline - this.now());
    }
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    if (this.callback) this.arm();
  }

  skip() {
    const callback = this.callback;
    this.clearPending();
    callback?.();
  }

  clear() {
    this.clearPending();
  }

  cancel() {
    this.clearPending();
    this.paused = false;
  }

  snapshot(): AutoplayDirectorSnapshot {
    const remainingMs = this.timer === null
      ? this.remainingMs
      : Math.max(0, this.deadline - this.now());
    return { paused: this.paused, pending: this.callback !== null, remainingMs };
  }

  private arm() {
    if (!this.callback) return;
    if (this.remainingMs <= 0) {
      queueMicrotask(() => this.skip());
      return;
    }
    this.deadline = this.now() + this.remainingMs;
    this.timer = setTimeout(() => this.skip(), this.remainingMs);
  }

  private clearPending() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.callback = null;
    this.deadline = 0;
    this.remainingMs = 0;
  }
}
