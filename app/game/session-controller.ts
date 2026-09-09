type Timer = ReturnType<typeof setTimeout>;

/** Owns all phase-scoped deadlines; changing phase invalidates callbacks from the old phase. */
export class SessionController {
  private generation = 0;
  private timers = new Map<string, Timer>();

  enterPhase() {
    this.generation += 1;
    this.cancelAll();
    return this.generation;
  }

  schedule(key: string, delayMs: number, callback: () => void) {
    this.cancel(key);
    const generation = this.generation;
    const timer = setTimeout(() => {
      this.timers.delete(key);
      if (generation === this.generation) callback();
    }, Math.max(0, delayMs));
    this.timers.set(key, timer);
  }

  cancel(key: string) {
    const timer = this.timers.get(key);
    if (timer !== undefined) clearTimeout(timer);
    this.timers.delete(key);
  }

  cancelAll() {
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
  }

  dispose() {
    this.generation += 1;
    this.cancelAll();
  }
}
