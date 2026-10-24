// Click wheel maths. The same numbers are used for mouse drag, touch and pen,
// so the "feel" does not depend on OS scroll settings.

/** Degrees of rotation per list step. 24 steps per revolution. */
export const DEG_PER_TICK = 15;

/** Steps faster than this (ms) count as a fast spin and get accelerated. */
const FAST_SPIN_MS = 45;
/** Acceleration only kicks in for long lists, like on the original. */
const ACCEL_MIN_ITEMS = 50;

/** Signed smallest difference b - a in degrees, in (-180, 180]. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % 360;
  if (d <= -180) d += 360;
  if (d > 180) d -= 360;
  return d;
}

/** Angle in degrees of point (x, y) around centre (cx, cy); 0 = up, clockwise positive. */
export function angleOf(cx: number, cy: number, x: number, y: number): number {
  const rad = Math.atan2(x - cx, cy - y);
  const deg = (rad * 180) / Math.PI;
  return deg < 0 ? deg + 360 : deg;
}

/**
 * Accumulates rotation and emits whole ticks. Keeps the remainder so slow
 * rotation is never lost between pointer events.
 */
export class WheelTracker {
  private lastAngle: number | null = null;
  private acc = 0;
  private lastTickAt = 0;
  /** Total absolute rotation since start(), used to tell a tap from a spin. */
  travelled = 0;

  start(angle: number): void {
    this.lastAngle = angle;
    this.acc = 0;
    this.travelled = 0;
  }

  /** Feed a new pointer angle; returns signed ticks (already accelerated). */
  move(angle: number, now: number, listLength: number): number {
    if (this.lastAngle === null) {
      this.start(angle);
      return 0;
    }
    const d = angleDelta(this.lastAngle, angle);
    this.lastAngle = angle;
    this.travelled += Math.abs(d);
    this.acc += d;
    const ticks = Math.trunc(this.acc / DEG_PER_TICK);
    if (ticks === 0) return 0;
    this.acc -= ticks * DEG_PER_TICK;
    const fast = now - this.lastTickAt < FAST_SPIN_MS;
    this.lastTickAt = now;
    return accelerate(ticks, fast, listLength);
  }

  end(): void {
    this.lastAngle = null;
    this.acc = 0;
  }
}

export function accelerate(ticks: number, fast: boolean, listLength: number): number {
  if (!fast || listLength < ACCEL_MIN_ITEMS) return ticks;
  const factor = listLength >= 1000 ? 4 : listLength >= 200 ? 3 : 2;
  return ticks * factor;
}

/**
 * Turns mouse-wheel / touchpad deltas into ticks. `pixelsPerTick` is the per-OS
 * calibration value (touchpads on macOS report much larger, inertial deltas).
 */
export class ScrollTracker {
  private acc = 0;
  constructor(public pixelsPerTick: number) {}

  feed(deltaY: number): number {
    this.acc += deltaY;
    const ticks = Math.trunc(this.acc / this.pixelsPerTick);
    this.acc -= ticks * this.pixelsPerTick;
    return ticks;
  }
}
