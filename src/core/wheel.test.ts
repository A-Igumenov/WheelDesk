import { describe, expect, it } from "vitest";
import { accelerate, angleDelta, angleOf, ScrollTracker, WheelTracker } from "./wheel";

describe("angles", () => {
  it("measures clockwise from the top", () => {
    expect(angleOf(0, 0, 0, -10)).toBeCloseTo(0);
    expect(angleOf(0, 0, 10, 0)).toBeCloseTo(90);
    expect(angleOf(0, 0, 0, 10)).toBeCloseTo(180);
    expect(angleOf(0, 0, -10, 0)).toBeCloseTo(270);
  });

  it("takes the short way across 0°", () => {
    expect(angleDelta(350, 10)).toBe(20);
    expect(angleDelta(10, 350)).toBe(-20);
  });
});

describe("WheelTracker", () => {
  it("emits one tick per 15° and keeps the remainder", () => {
    const w = new WheelTracker();
    w.start(0);
    expect(w.move(10, 0, 10)).toBe(0);
    expect(w.move(20, 100, 10)).toBe(1);
    expect(w.move(29, 200, 10)).toBe(0);
    expect(w.move(36, 300, 10)).toBe(1);
  });

  it("counts counter-clockwise as negative", () => {
    const w = new WheelTracker();
    w.start(10);
    expect(w.move(340, 0, 10)).toBe(-2);
  });

  it("accelerates fast spins only in long lists", () => {
    expect(accelerate(1, true, 10)).toBe(1);
    expect(accelerate(1, true, 120)).toBe(2);
    expect(accelerate(-1, true, 5000)).toBe(-4);
    expect(accelerate(1, false, 5000)).toBe(1);
  });
});

describe("ScrollTracker", () => {
  it("accumulates small touchpad deltas", () => {
    const s = new ScrollTracker(40);
    expect(s.feed(15)).toBe(0);
    expect(s.feed(30)).toBe(1);
    expect(s.feed(-90)).toBe(-2);
  });
});

import { joystickZone } from "../render/device";

describe("centre joystick", () => {
  it("splits the centre button into core and four directions", () => {
    expect(joystickZone(0, 0)).toBe("core");
    expect(joystickZone(5, -8)).toBe("core");
    expect(joystickZone(3, -35)).toBe("up");
    expect(joystickZone(-4, 30)).toBe("down");
    expect(joystickZone(-30, 6)).toBe("left");
    expect(joystickZone(33, -10)).toBe("right");
  });
});
