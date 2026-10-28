// Menu state machine. Pure logic with no DOM, so it behaves identically on every OS
// and can be tested by scripted wheel/button sequences.

export interface MenuItem {
  id: string;
  label: string;
  /** Shows the ">" chevron: selecting it opens a deeper screen. */
  chevron?: boolean;
  /** Right-aligned value, used by Settings rows ("Off", "Songs", ...). */
  value?: string;
  /** Check mark, used by single-choice lists such as EQ presets. */
  checked?: boolean;
  open?: () => Screen;
  run?: () => void;
  /** After run(), go back one level (single-choice lists like EQ return to Settings). */
  closeAfter?: boolean;
  /** After run(), go back to the screen with this id (e.g. folder browser → Settings). */
  closeTo?: string;
  /** Not available yet: drawn grey, the centre button does nothing. */
  disabled?: boolean;
  /** Holding the centre button (On-The-Go); true when something happened. */
  hold?: () => boolean;
}

export interface Screen {
  id: string;
  title: string;
  /** Items are rebuilt on every read so values and visibility stay current. */
  items: () => MenuItem[];
  /** Text shown when the list is empty. */
  empty?: string;
  /** Main menu style: list on the left half, artwork on the right half. */
  split?: boolean;
  /** Custom screen (Now Playing): draws itself below the title bar. Returns true while animating. */
  draw?: (ctx: CanvasRenderingContext2D, w: number, h: number, now: number) => boolean;
  /** Vertical sliders (EQ, volume limit): joystick/arrow "up" means more, not up the list. */
  upIsMore?: boolean;
  /** Custom wheel handling; return true when handled. */
  onRotate?: (ticks: number) => boolean;
  /** Custom centre-button handling: true when handled, a screen to open, or "back" to leave. */
  onSelect?: () => boolean | Screen | "back";
  /** MENU on this screen: true = handled here (the screen stays, e.g. the lock screen). */
  onBack?: () => boolean;
  /** A one-off step (a picker): when a screen above it closes with "back", it closes too. */
  transient?: boolean;
  /** Custom ⏮ ⏭ ⏯ handling (instead of playback control): true when handled, or a screen to open. */
  onButton?: (b: "prev" | "next" | "play") => boolean | Screen;
  /** Typed text from the keyboard ("\b" = Backspace, "\n" = Enter): true when handled, a screen to open, or "back". */
  onText?: (ch: string) => boolean | Screen | "back";
  /** Mouse double-click inside the screen body; true when handled. */
  onDoubleClick?: (x: number, y: number, w: number, h: number) => boolean;
  /** Custom mouse click inside the screen body (x, y relative to it). */
  onClick?: (x: number, y: number, w: number, h: number) => boolean | Screen;
}

export interface View {
  screen: Screen;
  selected: number;
  top: number;
}

export type NavEvent =
  | { kind: "moved" }
  | { kind: "push"; from: View; to: View }
  | { kind: "pop"; from: View; to: View }
  | { kind: "run"; item: MenuItem }
  | { kind: "held" }
  | { kind: "none" };

export const VISIBLE_ROWS_FULL = 8;

export class Navigator {
  private stack: View[];

  constructor(root: Screen, private readonly visibleRows = VISIBLE_ROWS_FULL) {
    this.stack = [{ screen: root, selected: 0, top: 0 }];
  }

  get current(): View {
    return this.stack[this.stack.length - 1];
  }

  get depth(): number {
    return this.stack.length;
  }

  items(view: View = this.current): MenuItem[] {
    return view.screen.items();
  }

  /** Positive ticks = clockwise = down the list. The list does not wrap, like the original. */
  rotate(ticks: number): NavEvent {
    if (ticks === 0) return { kind: "none" };
    const view = this.current;
    if (view.screen.onRotate) return view.screen.onRotate(ticks) ? { kind: "moved" } : { kind: "none" };
    const count = this.items(view).length;
    if (count === 0) return { kind: "none" };
    const next = clamp(view.selected + ticks, 0, count - 1);
    if (next === view.selected) return { kind: "none" };
    view.selected = next;
    this.keepVisible(view, count);
    return { kind: "moved" };
  }

  select(): NavEvent {
    const view = this.current;
    if (view.screen.onSelect) {
      const r = view.screen.onSelect();
      if (r === "back") return this.leave();
      if (typeof r === "object") return this.push(r);
      return r ? { kind: "moved" } : { kind: "none" };
    }
    const item = this.items(view)[view.selected];
    if (!item || item.disabled) return { kind: "none" };
    if (item.open) {
      const to: View = { screen: item.open(), selected: 0, top: 0 };
      this.stack.push(to);
      return { kind: "push", from: view, to };
    }
    if (item.run) {
      item.run();
      if (item.closeTo) return this.popTo(item.closeTo);
      if (item.closeAfter && this.stack.length > 1) return this.back();
      this.normalize();
      return { kind: "run", item };
    }
    return { kind: "none" };
  }

  /** Mouse click on a visible list row (0 = top row on screen): selects it and opens it. */
  clickRow(row: number): NavEvent {
    const view = this.current;
    const index = view.top + row;
    if (index < 0 || index >= this.items(view).length) return { kind: "none" };
    view.selected = index;
    return this.select();
  }

  /** ⏮ ⏭ ⏯ on a screen that uses them itself (Search); "none" = normal playback control. */
  button(b: "prev" | "next" | "play"): NavEvent {
    const fn = this.current.screen.onButton;
    if (!fn) return { kind: "none" };
    const r = fn(b);
    if (typeof r === "object") return this.push(r);
    return r ? { kind: "moved" } : { kind: "none" };
  }

  /** Closes the current screen and any one-off steps (pickers) under it. */
  leave(): NavEvent {
    const ev = this.back(true);
    let popped = false;
    while (this.stack.length > 1 && this.current.screen.transient) {
      this.stack.pop();
      this.normalize();
      popped = true;
    }
    if (popped && ev.kind === "pop") return { kind: "pop", from: ev.from, to: this.current };
    return ev;
  }

  /** Keyboard text on a screen with text input (Search). */
  text(ch: string): NavEvent {
    const fn = this.current.screen.onText;
    if (!fn) return { kind: "none" };
    const r = fn(ch);
    if (r === "back") return this.leave();
    if (typeof r === "object") return this.push(r);
    return r ? { kind: "moved" } : { kind: "none" };
  }

  /** Mouse double-click on the screen (Now Playing: full-screen artwork). */
  doubleClick(x: number, y: number, w: number, h: number): NavEvent {
    const fn = this.current.screen.onDoubleClick;
    return fn && fn(x, y, w, h) ? { kind: "moved" } : { kind: "none" };
  }

  /** Mouse click on a custom screen (Now Playing, Cover Flow). */
  click(x: number, y: number, w: number, h: number): NavEvent {
    const fn = this.current.screen.onClick;
    if (!fn) return { kind: "none" };
    const r = fn(x, y, w, h);
    if (typeof r === "object") return this.push(r);
    return r ? { kind: "moved" } : { kind: "none" };
  }

  /** Centre button held down on the selected row (adds it to On-The-Go). */
  hold(): NavEvent {
    const view = this.current;
    if (view.screen.draw) return { kind: "none" };
    const item = this.items(view)[view.selected];
    if (!item || item.disabled || !item.hold) return { kind: "none" };
    return item.hold() ? { kind: "held" } : { kind: "none" };
  }

  /** MENU button: one level up. Does nothing at the root. */
  back(force = false): NavEvent {
    if (this.stack.length <= 1) return { kind: "none" };
    if (!force && this.current.screen.onBack?.()) return { kind: "moved" };
    const from = this.stack.pop()!;
    this.normalize();
    return { kind: "pop", from, to: this.current };
  }

  /** Opens a screen directly (e.g. Now Playing after choosing a song). */
  push(screen: Screen): NavEvent {
    const from = this.current;
    const to: View = { screen, selected: 0, top: 0 };
    this.stack.push(to);
    return { kind: "push", from, to };
  }

  /** Goes back to the nearest screen with this id; stays put if there is none. */
  popTo(id: string): NavEvent {
    const idx = this.stack.map((v) => v.screen.id).lastIndexOf(id);
    if (idx < 0 || idx === this.stack.length - 1) return { kind: "none" };
    const from = this.current;
    this.stack.length = idx + 1;
    this.normalize();
    return { kind: "pop", from, to: this.current };
  }

  /** Jump back to the root, as after a reset. */
  home(): void {
    this.stack.length = 1;
    this.normalize();
  }

  /** Re-clamps the selection after the item list changed (e.g. "Now Playing" appeared). */
  normalize(view: View = this.current): void {
    const count = this.items(view).length;
    view.selected = count === 0 ? 0 : clamp(view.selected, 0, count - 1);
    this.keepVisible(view, count);
  }

  rowsFor(_view: View): number {
    return this.visibleRows;
  }

  private keepVisible(view: View, count: number): void {
    const rows = this.rowsFor(view);
    if (view.selected < view.top) view.top = view.selected;
    if (view.selected >= view.top + rows) view.top = view.selected - rows + 1;
    view.top = clamp(view.top, 0, Math.max(0, count - rows));
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
