// "Bricks": knock out the wall with a ball; the wheel moves the paddle.
// Pure game state and physics (no drawing), in screen-body coordinates.

export const BRICK_COLS = 8;
export const BRICK_ROWS = 5;

export interface Brick {
  x: number;
  y: number;
  w: number;
  h: number;
  row: number;
  alive: boolean;
}

export type BrickPhase = "ready" | "playing" | "paused" | "lost" | "won";

export class BrickGame {
  readonly w: number;
  readonly h: number;
  paddleX: number;
  readonly paddleW = 54;
  readonly paddleY: number;
  ball = { x: 0, y: 0, vx: 0, vy: 0, r: 4 };
  bricks: Brick[] = [];
  lives = 3;
  score = 0;
  level = 1;
  phase: BrickPhase = "ready";

  constructor(w = 320, h = 218) {
    this.w = w;
    this.h = h;
    this.paddleY = h - 16;
    this.paddleX = (w - this.paddleW) / 2;
    this.buildWall();
    this.resetBall();
  }

  private buildWall(): void {
    const gap = 3;
    const top = 24;
    const bw = (this.w - gap * (BRICK_COLS + 1)) / BRICK_COLS;
    const bh = 10;
    this.bricks = [];
    for (let r = 0; r < BRICK_ROWS; r++) {
      for (let c = 0; c < BRICK_COLS; c++) {
        this.bricks.push({ x: gap + c * (bw + gap), y: top + r * (bh + gap), w: bw, h: bh, row: r, alive: true });
      }
    }
  }

  private resetBall(): void {
    this.ball.x = this.paddleX + this.paddleW / 2;
    this.ball.y = this.paddleY - this.ball.r - 1;
    this.ball.vx = 0;
    this.ball.vy = 0;
  }

  get speed(): number {
    return 150 + (this.level - 1) * 25;
  }

  /** Wheel: positive ticks move right. */
  move(ticks: number): void {
    this.paddleX = Math.max(0, Math.min(this.w - this.paddleW, this.paddleX + ticks * 14));
    if (this.phase === "ready") this.resetBall();
  }

  /** Centre button: launch, continue after a pause, or start over. */
  action(): void {
    if (this.phase === "ready") {
      this.phase = "playing";
      this.ball.vx = this.speed * 0.45;
      this.ball.vy = -this.speed;
    } else if (this.phase === "paused") this.phase = "playing";
    else if (this.phase === "playing") this.phase = "paused";
    else if (this.phase === "lost") {
      this.lives = 3;
      this.score = 0;
      this.level = 1;
      this.buildWall();
      this.phase = "ready";
      this.resetBall();
    } else if (this.phase === "won") {
      this.level++;
      this.buildWall();
      this.phase = "ready";
      this.resetBall();
    }
  }

  /** Advances `dt` seconds (in small steps so the ball never skips a brick). */
  step(dt: number): void {
    if (this.phase !== "playing") return;
    let left = Math.min(dt, 0.1);
    while (left > 0) {
      const d = Math.min(left, 0.008);
      left -= d;
      this.tick(d);
      if (this.phase !== "playing") return;
    }
  }

  private tick(d: number): void {
    const b = this.ball;
    b.x += b.vx * d;
    b.y += b.vy * d;
    if (b.x < b.r) {
      b.x = b.r;
      b.vx = Math.abs(b.vx);
    } else if (b.x > this.w - b.r) {
      b.x = this.w - b.r;
      b.vx = -Math.abs(b.vx);
    }
    if (b.y < b.r) {
      b.y = b.r;
      b.vy = Math.abs(b.vy);
    }
    // Paddle: the further from its centre, the steeper the bounce.
    if (b.vy > 0 && b.y + b.r >= this.paddleY && b.y + b.r <= this.paddleY + 8 && b.x >= this.paddleX - b.r && b.x <= this.paddleX + this.paddleW + b.r) {
      const hit = (b.x - (this.paddleX + this.paddleW / 2)) / (this.paddleW / 2);
      const angle = Math.max(-1, Math.min(1, hit)) * (Math.PI / 3);
      b.vx = this.speed * Math.sin(angle);
      b.vy = -this.speed * Math.cos(angle);
      b.y = this.paddleY - b.r;
    }
    for (const k of this.bricks) {
      if (!k.alive) continue;
      if (b.x + b.r < k.x || b.x - b.r > k.x + k.w || b.y + b.r < k.y || b.y - b.r > k.y + k.h) continue;
      k.alive = false;
      this.score += (BRICK_ROWS - k.row) * 10;
      // Bounce off the side that was hit least deep.
      const dx = Math.min(Math.abs(b.x + b.r - k.x), Math.abs(k.x + k.w - (b.x - b.r)));
      const dy = Math.min(Math.abs(b.y + b.r - k.y), Math.abs(k.y + k.h - (b.y - b.r)));
      if (dx < dy) b.vx = -b.vx;
      else b.vy = -b.vy;
      if (this.bricks.every((x) => !x.alive)) this.phase = "won";
      break;
    }
    if (b.y - b.r > this.h) {
      this.lives--;
      this.phase = this.lives > 0 ? "ready" : "lost";
      this.resetBall();
    }
  }
}
