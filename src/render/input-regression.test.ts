import { describe, expect, it, vi } from "vitest";
import { Navigator } from "../core/navigator";
import { drawScreen, SLIDE_MS, type ScreenState } from "./screen";
import { DeviceView } from "./device";
import { TITLE_H } from "./theme";

const canvasContext = () => new Proxy({}, {
  get: (_target, key) => key === "measureText" ? () => ({ width: 10 }) : () => {},
  set: () => true,
}) as CanvasRenderingContext2D;

function device(nav: Navigator, st: ScreenState) {
  // Exercise actual input methods without a native window/audio device.
  const view = Object.create(DeviceView.prototype) as any;
  Object.assign(view, { nav, st, hooks: { clickerOn: () => false }, invalidate: vi.fn() });
  return view;
}

function state(nav: Navigator, busy: boolean): ScreenState {
  return { slide: { kind: "push", from: nav.current, to: nav.current, start: 0 },
    busy, now: SLIDE_MS + 1, isPlaying: false, flashUntil: 0, dimmed: false, art: null };
}

describe("screen input regressions", () => {
  it.each([true, false])("finishes transition during scan=%s and accepts selection/back", (busy) => {
    const run = vi.fn();
    const nav = new Navigator({ id: "root", title: "Root", items: () => [
      { id: "disk", label: "Disk", open: () => ({ id: "disk", title: "Disk", items: () => [
        { id: "song", label: "Song", run },
      ] }) },
    ] });
    const transition = nav.select();
    const st = state(nav, busy);
    if (transition.kind === "push") st.slide = { ...transition, start: 0 };
    expect(drawScreen(canvasContext(), nav, st)).toBe(busy);
    expect(st.slide).toBeNull();
    const view = device(nav, st);
    view.screenClick(20, TITLE_H + 10, 0);
    expect(run).toHaveBeenCalledOnce();
    view.screenClick(10, 5, 0);
    expect(nav.current.screen.id).toBe("root");
  });

  it("keeps an unfinished transition active", () => {
    const nav = new Navigator({ id: "root", title: "Root", items: () => [] });
    const st = state(nav, true);
    st.now = SLIDE_MS / 2;
    expect(drawScreen(canvasContext(), nav, st)).toBe(true);
    expect(st.slide).not.toBeNull();
  });

  it("up increases EQ and down decreases; rotation retains its direction", () => {
    let gain = 0;
    const nav = new Navigator({ id: "eq-edit", title: "EQ", items: () => [],
      verticalIncreases: true, onRotate: (ticks) => { gain += ticks * .5; return true; } });
    const view = device(nav, state(nav, false));
    view.vertical(-1);
    expect(gain).toBe(.5);
    view.vertical(1);
    expect(gain).toBe(0);
    view.rotate(1);
    expect(gain).toBe(.5);
  });

  it("up/down retain normal list selection direction", () => {
    const nav = new Navigator({ id: "list", title: "List", items: () => [
      { id: "a", label: "A" }, { id: "b", label: "B" },
    ] });
    const view = device(nav, state(nav, false));
    view.vertical(1);
    expect(nav.current.selected).toBe(1);
    view.vertical(-1);
    expect(nav.current.selected).toBe(0);
  });
});
