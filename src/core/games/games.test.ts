import { describe, expect, it } from "vitest";
import { BrickGame } from "./brick";
import { makeRound, points, quizPool } from "./quiz";
import type { Track } from "../library";

describe("Bricks", () => {
  it("launches, breaks bricks, scores and loses a life when the ball drops", () => {
    const g = new BrickGame();
    expect(g.phase).toBe("ready");
    g.move(100);
    expect(g.paddleX).toBe(g.w - g.paddleW);
    g.move(-100);
    expect(g.paddleX).toBe(0);
    g.move(10);
    g.action();
    expect(g.phase).toBe("playing");
    const total = g.bricks.length;
    // Let it run; the paddle stays put, so the ball eventually falls.
    for (let i = 0; i < 2000 && g.phase === "playing"; i++) g.step(0.05);
    expect(g.bricks.filter((b) => !b.alive).length).toBeGreaterThan(0);
    expect(g.score).toBeGreaterThan(0);
    expect(g.bricks.length).toBe(total);
    if (g.phase === "ready") expect(g.lives).toBe(2);
  });

  it("pauses and continues with the centre button", () => {
    const g = new BrickGame();
    g.action();
    g.action();
    expect(g.phase).toBe("paused");
    const y = g.ball.y;
    g.step(0.5);
    expect(g.ball.y).toBe(y);
    g.action();
    expect(g.phase).toBe("playing");
  });
});

describe("Music Quiz", () => {
  const tr = (n: number, title: string, ms = 180_000): Track => ({
    path: `/m/${n}.mp3`, title, artist: "A", albumArtist: "", album: "X", genre: "", composer: "",
    trackNo: n, discNo: 1, year: 0, durationMs: ms, compilation: false,
  });

  it("asks about long songs with distinct titles, four options with the answer among them", () => {
    const pool = quizPool([tr(1, "One"), tr(2, "Two"), tr(3, "two "), tr(4, "Three"), tr(5, "Four"), tr(6, "Short", 5000), tr(7, "Five")]);
    expect(pool.map((t) => t.title)).toEqual(["One", "Two", "Three", "Four", "Five"]);
    const used = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const r = makeRound(pool, used)!;
      expect(r.options).toHaveLength(4);
      expect(new Set(r.options).size).toBe(4);
      expect(r.options).toContain(r.track);
      expect(r.startMs).toBeLessThan(r.track.durationMs - 10_000);
    }
    expect(used.size).toBe(5);
    expect(makeRound(pool.slice(0, 3), new Set())).toBeNull();
  });

  it("gives more points for quicker answers", () => {
    expect(points(10)).toBeGreaterThan(points(2));
    expect(points(0)).toBe(10);
  });
});
