// Stopwatch state. It keeps running while you use other menus or listen to
// music, like the original. Time comes from a clock passed in, so tests can
// drive it.

export interface StopwatchLog {
  started: number;
  laps: number[];
}

export class Stopwatch {
  running = false;
  private accumulated = 0;
  private startedAt = 0;
  /** Elapsed time at the last lap mark. */
  private lapMark = 0;
  laps: number[] = [];
  /** Wall-clock time of the first start (for the log). */
  private wallStart = 0;

  constructor(
    private readonly clock: () => number = () => performance.now(),
    private readonly wall: () => number = () => Date.now(),
  ) {}

  elapsed(): number {
    return this.accumulated + (this.running ? this.clock() - this.startedAt : 0);
  }

  currentLap(): number {
    return this.elapsed() - this.lapMark;
  }

  get isReset(): boolean {
    return !this.running && this.elapsed() === 0;
  }

  /** ⏯: start or stop. */
  toggle(): void {
    if (this.running) {
      this.accumulated = this.elapsed();
      this.running = false;
    } else {
      if (this.isReset) this.wallStart = this.wall();
      this.startedAt = this.clock();
      this.running = true;
    }
  }

  /** ●: a lap while running. */
  lap(): void {
    if (!this.running) return;
    const now = this.elapsed();
    this.laps.push(now - this.lapMark);
    this.lapMark = now;
  }

  /** ● while stopped: back to zero; returns the finished session for the log. */
  reset(): StopwatchLog | null {
    if (this.running || this.isReset) return null;
    const log = { started: this.wallStart, laps: [...this.laps, this.elapsed() - this.lapMark] };
    this.accumulated = 0;
    this.lapMark = 0;
    this.laps = [];
    return log;
  }
}

/** 1:02.34 or 1:02:03.45 (hundredths). */
export function formatStopwatch(ms: number): string {
  const cs = Math.floor(Math.max(0, ms) / 10);
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  const two = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(s)}.${two(c)}` : `${m}:${two(s)}.${two(c)}`;
}
