// The whole device lives on one canvas: chassis, screen and wheel. Hit-testing,
// timing and drawing are ours, so behaviour does not depend on the OS webview.
import { drawVolume } from "./nowplaying";
import type { NavEvent, Navigator } from "../core/navigator";
import { angleOf, ScrollTracker, WheelTracker } from "../core/wheel";
import { COLOR, DEPTH, DEVICE, FONT, FRONT, octagon, onSide, ROW_H, SCREEN, sidePoint, SPLIT_W, TITLE_H, VOL_BTN, WHEEL, WIN_BTN } from "./theme";
import { drawScreen, type ScreenState } from "./screen";
import { Clicker } from "./clicker";

export type WheelButton = "menu" | "prev" | "next" | "play" | "center";

export interface DeviceHooks {
  clickerOn(): boolean;
  backlightSecs(): number;
  isPlaying(): boolean;
  /** Library scan running (title bar spinner). */
  busy(): boolean;
  /** Artwork for the right half of the main menu. */
  menuArt(): CanvasImageSource | null;
  /** Transport buttons; navigation buttons are handled here. `long` = held down. */
  onTransport(button: "prev" | "next" | "play", long: boolean): void;
  /** A held transport button was let go (ends fast-forward / rewind). */
  onTransportRelease(button: "prev" | "next" | "play"): void;
  /** Settings → Mouse Control: menus react to clicks on the screen. */
  mouseControl(): boolean;
  /** Side volume buttons: one step up (+1) or down (-1); returns the new volume 0–1. */
  onVolume(dir: 1 | -1): number;
  onWindow(action: "drag" | "minimize" | "close"): void;
}

/** A spin shorter than this (degrees) is treated as a press on the wheel. */
const TAP_MAX_DEG = 6;
const LONG_PRESS_MS = 600;
/** Holding the centre button this long adds the row to On-The-Go. */
const HOLD_MS = 700;
const FLASH_MS = 660;
/** Centre joystick: inner core radius (play/pause) and list auto-repeat. */
const CORE_R = 17;
const JOY_REPEAT_DELAY_MS = 380;
const JOY_REPEAT_EVERY_MS = 85;

export type JoyZone = "up" | "down" | "left" | "right" | "core";

/** Which part of the centre button was pressed (centre coordinates). */
export function joystickZone(dx: number, dy: number): JoyZone {
  if (Math.hypot(dx, dy) <= CORE_R) return "core";
  if (Math.abs(dy) >= Math.abs(dx)) return dy < 0 ? "up" : "down";
  return dx < 0 ? "left" : "right";
}
/** Volume buttons: auto-repeat while held, and how long the volume bar stays up. */
const VOL_REPEAT_DELAY_MS = 400;
const VOL_REPEAT_EVERY_MS = 110;
const VOL_OVERLAY_MS = 1500;

/** Mouse-wheel calibration per OS (pixels per list step). */
function scrollCalibration(): number {
  const p = typeof navigator !== "undefined" ? navigator.userAgent : "";
  return /Mac/i.test(p) ? 28 : 50;
}

export class DeviceView {
  private ctx: CanvasRenderingContext2D;
  private st: ScreenState = { slide: null, isPlaying: false, busy: false, flashUntil: 0, dimmed: false, now: 0, art: null };
  /** Centre button: hold timer and whether the hold already acted. */
  private centreTimer: number | undefined;
  private centreHeld = false;
  private enterDown = false;
  private frame = 0;
  private wheel = new WheelTracker();
  private scroll = new ScrollTracker(scrollCalibration());
  private clicker = new Clicker();
  private drag: { button: WheelButton; pointerId: number; downAt: number; longFired: boolean } | null = null;
  private longTimer: number | undefined;
  private pressed: WheelButton | null = null;
  /** Centre joystick part currently held. */
  private joy: JoyZone | null = null;
  /** Last left press on the screen, to recognise a double-click. */
  private lastScreenDown = { t: 0, x: 0, y: 0 };
  private joyTimer: number | undefined;
  private lastInput = performance.now();
  private hoverClose = false;
  private volPressed: 1 | -1 | 0 = 0;
  private volTimer: number | undefined;
  private volOverlay = { value: 0, until: 0 };
  private disposers: (() => void)[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    private nav: Navigator,
    private hooks: DeviceHooks,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas not available");
    this.ctx = ctx;
    this.resize();
    this.bind();
    this.invalidate();
  }

  dispose(): void {
    cancelAnimationFrame(this.frame);
    window.clearTimeout(this.longTimer);
    window.clearTimeout(this.volTimer);
    window.clearInterval(this.volTimer);
    window.clearTimeout(this.centreTimer);
    window.clearTimeout(this.joyTimer);
    window.clearInterval(this.joyTimer);
    this.disposers.forEach((d) => d());
  }

  /** Request a redraw on the next animation frame. */
  invalidate = (): void => {
    if (this.frame) return;
    this.frame = requestAnimationFrame(this.draw);
  };

  // ---------------------------------------------------------------- input

  private bind(): void {
    const c = this.canvas;
    const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement | Window, ev: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      el.addEventListener(ev, fn as EventListener, opts);
      this.disposers.push(() => el.removeEventListener(ev, fn as EventListener));
    };
    on(c, "pointerdown", (e) => this.pointerDown(e));
    on(c, "pointermove", (e) => this.pointerMove(e));
    on(c, "pointerup", (e) => this.pointerUp(e));
    on(c, "pointercancel", () => this.cancelDrag());
    on(c, "wheel", (e) => this.mouseWheel(e), { passive: false });
    on(c, "contextmenu", (e) => e.preventDefault());
    on(window, "keydown", (e) => this.key(e));
    on(window, "keyup", (e) => {
      if (e.key === "Enter" && this.enterDown) {
        this.enterDown = false;
        this.endCentreHold();
        this.invalidate();
      }
    });
    on(window, "resize", () => { this.resize(); this.invalidate(); });
    const id = window.setInterval(() => this.invalidate(), 1000);
    this.disposers.push(() => window.clearInterval(id));
  }

  private toLocal(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * DEVICE.w) / r.width, y: ((e.clientY - r.top) * DEVICE.h) / r.height };
  }

  private zoneAt(x: number, y: number): "center" | "ring" | "screen" | "minimize" | "close" | "volup" | "voldown" | "chassis" {
    const inBtn = (bx: number) => x >= bx && x <= bx + WIN_BTN.size && y >= WIN_BTN.y && y <= WIN_BTN.y + WIN_BTN.size;
    if (inBtn(WIN_BTN.closeX)) return "close";
    if (inBtn(WIN_BTN.minimizeX)) return "minimize";
    // Side buttons get a generous hit area towards the screen edge.
    // Side keys sit on the receding right face: test in that face's coordinates.
    const side = onSide(x, y);
    if (side.t >= VOL_BTN.t0 - 0.12 && side.t <= 1.05) {
      if (side.y >= VOL_BTN.upY - 3 && side.y <= VOL_BTN.upY + VOL_BTN.h + 3) return "volup";
      if (side.y >= VOL_BTN.downY - 3 && side.y <= VOL_BTN.downY + VOL_BTN.h + 3) return "voldown";
    }
    const d = Math.hypot(x - WHEEL.cx, y - WHEEL.cy);
    if (d <= WHEEL.inner) return "center";
    if (d <= WHEEL.outer) return "ring";
    if (x >= SCREEN.x && x <= SCREEN.x + SCREEN.w && y >= SCREEN.y && y <= SCREEN.y + SCREEN.h) return "screen";
    return "chassis";
  }

  private ringButton(x: number, y: number): WheelButton {
    const a = angleOf(WHEEL.cx, WHEEL.cy, x, y);
    if (a >= 315 || a < 45) return "menu";
    if (a < 135) return "next";
    if (a < 225) return "play";
    return "prev";
  }

  private pointerDown(e: PointerEvent): void {
    const { x, y } = this.toLocal(e);
    const zone = this.zoneAt(x, y);
    if (zone === "close" || zone === "minimize") {
      this.hooks.onWindow(zone);
      return;
    }
    if (zone === "volup" || zone === "voldown") {
      if (e.button !== 0) return;
      this.canvas.setPointerCapture(e.pointerId);
      this.wake();
      const dir = zone === "volup" ? 1 : -1;
      this.volPressed = dir;
      this.volumeStep(dir);
      this.volTimer = window.setTimeout(() => {
        this.volTimer = window.setInterval(() => this.volumeStep(dir), VOL_REPEAT_EVERY_MS);
      }, VOL_REPEAT_DELAY_MS);
      return;
    }
    if (zone === "screen" && e.button === 0) {
      // Double-click on the screen (works with or without Mouse Control).
      const now = performance.now();
      const prev = this.lastScreenDown;
      this.lastScreenDown = { t: now, x, y };
      if (now - prev.t < 420 && Math.hypot(x - prev.x, y - prev.y) < 10) {
        this.lastScreenDown = { t: 0, x: 0, y: 0 };
        const ev = this.nav.doubleClick(x - SCREEN.x, y - SCREEN.y - TITLE_H, SCREEN.w, SCREEN.h - TITLE_H);
        if (ev.kind !== "none") {
          this.wake();
          this.invalidate();
          return;
        }
      }
    }
    if (zone === "screen" && this.hooks.mouseControl()) {
      this.wake();
      this.screenClick(x - SCREEN.x, y - SCREEN.y, e.button);
      return;
    }
    if (zone === "chassis" || zone === "screen") {
      if (e.button === 0) this.hooks.onWindow("drag");
      return;
    }
    if (e.button !== 0) return;
    this.canvas.setPointerCapture(e.pointerId);
    this.wake(); // the first touch also acts, like the original

    if (zone === "center") {
      // The centre button is a joystick: up/down move in the list (repeating
      // while held), left = MENU, right = open (hold = On-The-Go), middle = ⏯.
      this.pressed = "center";
      const j = joystickZone(x - WHEEL.cx, y - WHEEL.cy);
      this.joy = j;
      if (j === "up" || j === "down") {
        const dir = j === "up" ? -1 : 1;
        this.vertical(dir);
        this.joyTimer = window.setTimeout(() => {
          this.joyTimer = window.setInterval(() => this.vertical(dir), JOY_REPEAT_EVERY_MS);
        }, JOY_REPEAT_DELAY_MS);
      } else if (j === "left") {
        this.press("menu");
      } else if (j === "core") {
        this.press("play");
      } else {
        this.startCentreHold();
      }
      this.invalidate();
      return;
    }
    const button = this.ringButton(x, y);
    this.drag = { button, pointerId: e.pointerId, downAt: performance.now(), longFired: false };
    this.wheel.start(angleOf(WHEEL.cx, WHEEL.cy, x, y));
    this.pressed = button;
    if (button !== "menu") {
      this.longTimer = window.setTimeout(() => {
        // Screens that use the buttons themselves (Search) get no fast-forward.
        if (this.drag && this.wheel.travelled < TAP_MAX_DEG && !this.nav.current.screen.onButton) {
          this.drag.longFired = true;
          this.hooks.onTransport(button as "prev" | "next" | "play", true);
        }
      }, LONG_PRESS_MS);
    }
    this.invalidate();
  }

  private pointerMove(e: PointerEvent): void {
    const { x, y } = this.toLocal(e);
    const hover = this.zoneAt(x, y) === "close";
    if (hover !== this.hoverClose) { this.hoverClose = hover; this.invalidate(); }
    if (!this.drag || e.pointerId !== this.drag.pointerId) return;
    const ticks = this.wheel.move(angleOf(WHEEL.cx, WHEEL.cy, x, y), performance.now(), this.nav.items().length);
    if (this.wheel.travelled >= TAP_MAX_DEG && this.pressed) {
      this.pressed = null;
      window.clearTimeout(this.longTimer);
      this.invalidate();
    }
    if (ticks) this.rotate(ticks);
  }

  private pointerUp(e: PointerEvent): void {
    window.clearTimeout(this.longTimer);
    if (this.volPressed) {
      this.stopVolumeRepeat();
      return;
    }
    if (this.pressed === "center") {
      this.pressed = null;
      window.clearTimeout(this.joyTimer);
      window.clearInterval(this.joyTimer);
      if (this.joy === "right") this.endCentreHold();
      this.joy = null;
      this.invalidate();
      return;
    }
    const d = this.drag;
    this.drag = null;
    this.wheel.end();
    this.pressed = null;
    this.invalidate();
    if (!d || e.pointerId !== d.pointerId) return;
    if (d.longFired) {
      if (d.button !== "menu" && d.button !== "center") this.hooks.onTransportRelease(d.button);
      return;
    }
    if (this.wheel.travelled < TAP_MAX_DEG) this.press(d.button);
  }

  /**
   * Mouse control: left click on a row opens it, on the title bar goes back;
   * right click anywhere on the screen is MENU. Custom screens get the click.
   */
  private screenClick(x: number, y: number, button: number): void {
    if (this.st.slide) return; // ignore clicks while the menu is sliding
    if (button === 2 || (button === 0 && y < TITLE_H)) {
      this.handle(this.nav.back());
      this.invalidate();
      return;
    }
    if (button !== 0) return;
    const view = this.nav.current;
    const by = y - TITLE_H;
    if (view.screen.draw) {
      this.handle(this.nav.click(x, by, SCREEN.w, SCREEN.h - TITLE_H));
    } else if (!(view.screen.split && x > SPLIT_W)) {
      this.handle(this.nav.clickRow(Math.floor(by / ROW_H)));
    }
    this.invalidate();
  }

  private stopVolumeRepeat(): void {
    window.clearTimeout(this.volTimer);
    window.clearInterval(this.volTimer);
    this.volPressed = 0;
    this.invalidate();
  }

  private startCentreHold(): void {
    window.clearTimeout(this.centreTimer);
    this.centreHeld = false;
    this.centreTimer = window.setTimeout(() => {
      const ev = this.nav.hold();
      if (ev.kind !== "none") {
        this.centreHeld = true;
        this.handle(ev);
        this.invalidate();
      }
    }, HOLD_MS);
  }

  private endCentreHold(): void {
    window.clearTimeout(this.centreTimer);
    if (!this.centreHeld) this.handle(this.nav.select());
    this.centreHeld = false;
  }

  /** One volume step from the side buttons or keys; shows the volume bar. */
  volumeStep(dir: 1 | -1): void {
    const v = this.hooks.onVolume(dir);
    if (v !== this.volOverlay.value || performance.now() > this.volOverlay.until) this.click();
    this.volOverlay = { value: v, until: performance.now() + VOL_OVERLAY_MS };
    this.invalidate();
  }

  private cancelDrag(): void {
    window.clearTimeout(this.longTimer);
    window.clearTimeout(this.joyTimer);
    window.clearInterval(this.joyTimer);
    window.clearTimeout(this.centreTimer);
    if (this.pressed === "center") this.pressed = null;
    this.joy = null;
    this.stopVolumeRepeat();
    this.drag = null;
    this.pressed = null;
    this.wheel.end();
    this.invalidate();
  }

  private mouseWheel(e: WheelEvent): void {
    e.preventDefault();
    this.wake();
    const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    const ticks = this.scroll.feed(px);
    if (ticks) this.rotate(ticks);
  }

  private key(e: KeyboardEvent): void {
    // Screens with text input (Search): letters type, Backspace deletes.
    if (this.nav.current.screen.onText && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const ch = e.key === "Backspace" ? "\b" : e.key === "Enter" ? "\n" : e.key.length === 1 ? e.key : null;
      if (ch !== null && ch !== "+" && ch !== "-") {
        const ev = this.nav.text(ch);
        if (ev.kind !== "none") {
          e.preventDefault();
          this.wake();
          this.handle(ev);
          this.invalidate();
          return;
        }
      }
    }
    const map: Record<string, () => void> = {
      ArrowDown: () => this.vertical(1),
      ArrowUp: () => this.vertical(-1),
      Enter: () => {
        // Keyboard: Enter held down works like holding the centre button.
        if (e.repeat || this.enterDown) return;
        this.enterDown = true;
        this.startCentreHold();
      },
      Escape: () => this.press("menu"),
      Backspace: () => this.press("menu"),
      " ": () => this.press("play"),
      ArrowLeft: () => this.press("prev"),
      ArrowRight: () => this.press("next"),
      "+": () => this.volumeStep(1),
      "=": () => this.volumeStep(1),
      "-": () => this.volumeStep(-1),
      _: () => this.volumeStep(-1),
      AudioVolumeUp: () => this.volumeStep(1),
      AudioVolumeDown: () => this.volumeStep(-1),
    };
    const fn = map[e.key];
    if (!fn) return;
    e.preventDefault();
    this.wake();
    fn();
  }

  // ---------------------------------------------------------------- actions

  private rotate(ticks: number): void {
    const ev = this.nav.rotate(ticks);
    if (ev.kind === "moved") this.click();
    this.invalidate();
  }

  private vertical(direction: number): void {
    this.rotate(this.nav.current.screen.verticalIncreases ? -direction : direction);
  }

  press(button: WheelButton): void {
    if (button === "center") this.handle(this.nav.select());
    else if (button === "menu") this.handle(this.nav.back());
    else {
      // Screens may use ⏮ ⏭ themselves (Search); otherwise they control playback.
      const ev = this.nav.button(button);
      if (ev.kind !== "none") this.handle(ev);
      else this.hooks.onTransport(button, false);
    }
    this.invalidate();
  }

  private handle(ev: NavEvent): void {
    if (ev.kind === "none") return;
    this.click();
    if (ev.kind === "held") this.st.flashUntil = performance.now() + FLASH_MS;
    if (ev.kind === "push" || ev.kind === "pop") {
      this.st.slide = { kind: ev.kind, from: ev.from, to: ev.to, start: performance.now() };
    }
  }

  private click(): void {
    if (this.hooks.clickerOn()) this.clicker.tick();
  }

  /** Resets the backlight timer; returns true if the screen was dimmed. */
  private wake(): boolean {
    const was = this.st.dimmed;
    this.lastInput = performance.now();
    this.st.dimmed = false;
    if (was) this.invalidate();
    return was;
  }

  // ---------------------------------------------------------------- drawing

  private resize(): void {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(DEVICE.w * dpr);
    this.canvas.height = Math.round(DEVICE.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private draw = (now: number): void => {
    this.frame = 0;
    const ctx = this.ctx;
    const secs = this.hooks.backlightSecs();
    this.st.dimmed = secs > 0 && now - this.lastInput > secs * 1000;
    this.st.isPlaying = this.hooks.isPlaying();
    this.st.busy = this.hooks.busy();
    this.st.art = this.hooks.menuArt();
    this.st.now = now;

    this.drawChassis(ctx);
    let animating = drawScreen(ctx, this.nav, this.st);
    if (now < this.volOverlay.until) {
      this.drawVolumeOverlay(ctx, this.volOverlay.value);
      animating = true;
    }
    this.drawWheel(ctx);
    if (animating) this.invalidate();
  };

  private drawChassis(ctx: CanvasRenderingContext2D): void {
    const { w, h } = DEVICE;
    // The window is transparent: only the player body is drawn.
    ctx.clearRect(0, 0, w, h);
    const { x: fx, y: fy, w: fw, h: fh } = FRONT;
    const { dx, dy } = DEPTH;
    const cc = 12; // chamfer of the left front corners
    const poly = (pts: [number, number][]) => {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts.slice(1)) ctx.lineTo(p[0], p[1]);
      ctx.closePath();
    };

    // Top face: lit from above, the lightest side.
    poly([[fx + cc, fy], [fx + cc + dx, fy - dy], [fx + fw + dx, fy - dy], [fx + fw, fy]]);
    let g = ctx.createLinearGradient(0, fy - dy, 0, fy);
    g.addColorStop(0, "#4b4f56");
    g.addColorStop(1, "#3e4147");
    ctx.fillStyle = g;
    ctx.fill();

    // Right side face: in shade, darker towards the bottom.
    poly([[fx + fw, fy], [fx + fw + dx, fy - dy], [fx + fw + dx, fy + fh - dy - cc], [fx + fw + dx - dx * 0.5, fy + fh - dy * 0.5], [fx + fw, fy + fh]]);
    g = ctx.createLinearGradient(fx + fw, 0, fx + fw + dx, 0);
    g.addColorStop(0, "#1f2124");
    g.addColorStop(1, "#16171a");
    ctx.fillStyle = g;
    ctx.fill();
    // Back edge of the side face.
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(fx + fw + dx - 0.5, fy - dy);
    ctx.lineTo(fx + fw + dx - 0.5, fy + fh - dy - cc);
    ctx.stroke();

    // Front face.
    poly([[fx + cc, fy], [fx + fw, fy], [fx + fw, fy + fh], [fx + cc, fy + fh], [fx, fy + fh - cc], [fx, fy + cc]]);
    g = ctx.createLinearGradient(0, fy, 0, fy + fh);
    g.addColorStop(0, COLOR.chassisEdge);
    g.addColorStop(0.05, COLOR.chassis);
    g.addColorStop(1, COLOR.chassisShade);
    ctx.fillStyle = g;
    ctx.fill();

    // Edges where the faces meet: a bright top edge, a soft right edge.
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.beginPath();
    ctx.moveTo(fx + cc, fy + 0.5);
    ctx.lineTo(fx + fw, fy + 0.5);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.10)";
    ctx.beginPath();
    ctx.moveTo(fx + fw - 0.5, fy);
    ctx.lineTo(fx + fw - 0.5, fy + fh);
    ctx.moveTo(fx + fw, fy);
    ctx.lineTo(fx + fw + dx, fy - dy);
    ctx.stroke();

    // Screen bezel with chamfered corners.
    const b = 5;
    const { x, y, w: sw, h: sh } = SCREEN;
    const c = 7;
    ctx.fillStyle = COLOR.bezel;
    ctx.beginPath();
    ctx.moveTo(x - b + c, y - b);
    ctx.lineTo(x + sw + b - c, y - b);
    ctx.lineTo(x + sw + b, y - b + c);
    ctx.lineTo(x + sw + b, y + sh + b - c);
    ctx.lineTo(x + sw + b - c, y + sh + b);
    ctx.lineTo(x - b + c, y + sh + b);
    ctx.lineTo(x - b, y + sh + b - c);
    ctx.lineTo(x - b, y - b + c);
    ctx.closePath();
    ctx.fill();

    // Volume keys on the side face, drawn in its perspective: each key is a
    // slanted slab that stands out of the face towards the viewer's right.
    for (const [ky, dir] of [[VOL_BTN.upY, 1], [VOL_BTN.downY, -1]] as const) {
      const pressed = this.volPressed === dir;
      const t0 = VOL_BTN.t0;
      const t1 = VOL_BTN.t1;
      const kh = VOL_BTN.h;
      const ch = 6; // chamfer along the key's height
      const face = (lift: number) => {
        // `lift` moves the key outwards (to the right) from the side face.
        const p = (t: number, yy: number) => {
          const q = sidePoint(t, yy);
          return [q.x + lift, q.y] as [number, number];
        };
        return [p(t0, ky + ch), p(t0 + 0.2, ky), p(t1 - 0.2, ky), p(t1, ky + ch), p(t1, ky + kh - ch), p(t1 - 0.2, ky + kh), p(t0 + 0.2, ky + kh), p(t0, ky + kh - ch)];
      };
      const lift = pressed ? 0.5 : 2.5;
      // Recess in the side face.
      poly(face(0).map(([px, py]) => [px - 1, py + 1] as [number, number]));
      ctx.fillStyle = "#0e0f11";
      ctx.fill();
      // Key thickness: the strip between the face and the raised key.
      const base = face(0);
      const top = face(lift);
      ctx.fillStyle = "#2a2c30";
      for (let i = 0; i < base.length; i++) {
        const j = (i + 1) % base.length;
        poly([base[i], base[j], top[j], top[i]]);
        ctx.fill();
      }
      // Key top.
      poly(top);
      const kg = ctx.createLinearGradient(top[0][0], top[1][1], top[3][0], top[4][1]);
      kg.addColorStop(0, pressed ? COLOR.wheelPressed : "#4d5057");
      kg.addColorStop(1, pressed ? COLOR.wheelPressed : "#34363b");
      ctx.fillStyle = kg;
      ctx.fill();
      ctx.strokeStyle = COLOR.wheelEdge;
      ctx.lineWidth = 1;
      ctx.stroke();
      // + and − drawn on the key in the same perspective (skewed bars).
      const mid = sidePoint((t0 + t1) / 2, ky + kh / 2);
      ctx.save();
      ctx.translate(mid.x + lift, mid.y);
      ctx.transform(1, -DEPTH.dy / DEPTH.dx, 0, 1, 0, 0);
      ctx.fillStyle = COLOR.wheelLabel;
      const arm = Math.max(4, ((t1 - t0) * DEPTH.dx) / 2 - 3);
      ctx.fillRect(-arm, -1.6, arm * 2, 3.2);
      if (dir === 1) ctx.fillRect(-1.6, -arm - 1, 3.2, arm * 2 + 2);
      ctx.restore();
    }

    // Window controls.
    const s = WIN_BTN.size;
    ctx.fillStyle = COLOR.winBtn;
    ctx.fillRect(WIN_BTN.minimizeX + 3, WIN_BTN.y + s - 5, s - 6, 2);
    ctx.strokeStyle = this.hoverClose ? COLOR.winBtnHover : COLOR.winBtn;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(WIN_BTN.closeX + 3, WIN_BTN.y + 3);
    ctx.lineTo(WIN_BTN.closeX + s - 3, WIN_BTN.y + s - 3);
    ctx.moveTo(WIN_BTN.closeX + s - 3, WIN_BTN.y + 3);
    ctx.lineTo(WIN_BTN.closeX + 3, WIN_BTN.y + s - 3);
    ctx.stroke();
  }

  /** Volume bar over the bottom of the screen, on any menu. */
  private drawVolumeOverlay(ctx: CanvasRenderingContext2D, v: number): void {
    const h = 34;
    const x = SCREEN.x;
    const y = SCREEN.y + SCREEN.h - h;
    const w = SCREEN.w;
    ctx.save();
    ctx.fillStyle = "rgba(251,251,250,0.96)";
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = COLOR.titleLine;
    ctx.fillRect(x, y, w, 1);
    drawVolume(ctx, x + 10, y + 12, w - 20, v);
    ctx.restore();
  }

  private drawWheel(ctx: CanvasRenderingContext2D): void {
    const { cx, cy, outer, inner } = WHEEL;

    octagon(ctx, cx, cy, outer + 2);
    ctx.fillStyle = COLOR.wheelEdge;
    ctx.fill();
    octagon(ctx, cx, cy, outer);
    const g = ctx.createLinearGradient(0, cy - outer, 0, cy + outer);
    g.addColorStop(0, "#41444a");
    g.addColorStop(1, COLOR.wheel);
    ctx.fillStyle = g;
    ctx.fill();

    // Pressed quadrant feedback.
    const p = this.pressed;
    if (p && p !== "center") {
      const start = { menu: -135, next: -45, play: 45, prev: 135 }[p];
      ctx.save();
      octagon(ctx, cx, cy, outer);
      ctx.clip();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, outer * 1.2, (start * Math.PI) / 180, ((start + 90) * Math.PI) / 180);
      ctx.closePath();
      ctx.fillStyle = COLOR.wheelPressed;
      ctx.fill();
      ctx.restore();
    }

    // Labels.
    const off = outer - 26;
    ctx.fillStyle = COLOR.wheelLabel;
    ctx.font = FONT.wheel;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("MENU", cx, cy - off);
    drawSkip(ctx, cx + off, cy, 1);
    drawSkip(ctx, cx - off, cy, -1);
    drawPlayPause(ctx, cx, cy + off);

    // Centre button.
    octagon(ctx, cx, cy, inner + 2);
    ctx.fillStyle = COLOR.centerEdge;
    ctx.fill();
    octagon(ctx, cx, cy, inner);
    ctx.fillStyle = COLOR.center;
    ctx.fill();

    // Joystick: the pressed part lights up.
    const j = p === "center" ? this.joy : null;
    if (j) {
      ctx.save();
      octagon(ctx, cx, cy, inner);
      ctx.clip();
      ctx.fillStyle = COLOR.wheelPressed;
      if (j === "core") {
        octagon(ctx, cx, cy, CORE_R);
        ctx.fill();
      } else {
        const a = { right: 0, down: 90, left: 180, up: 270 }[j] * (Math.PI / 180);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, inner * 1.3, a - Math.PI / 4, a + Math.PI / 4);
        ctx.closePath();
        ctx.fill();
        octagon(ctx, cx, cy, CORE_R);
        ctx.fillStyle = COLOR.center;
        ctx.fill();
      }
      ctx.restore();
    }

    // Small angular marks for the four directions and the core ring.
    ctx.fillStyle = "rgba(217,218,220,0.45)";
    const m = inner - 11;
    const tri = (x: number, y: number, dx: number, dy: number) => {
      ctx.beginPath();
      ctx.moveTo(x + dx * 4, y + dy * 4);
      ctx.lineTo(x - dy * 4 - dx * 2, y + dx * 4 - dy * 2);
      ctx.lineTo(x + dy * 4 - dx * 2, y - dx * 4 - dy * 2);
      ctx.closePath();
      ctx.fill();
    };
    tri(cx, cy - m, 0, -1);
    tri(cx, cy + m, 0, 1);
    tri(cx - m, cy, -1, 0);
    tri(cx + m, cy, 1, 0);
    octagon(ctx, cx, cy, CORE_R);
    ctx.strokeStyle = "rgba(217,218,220,0.25)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function drawSkip(ctx: CanvasRenderingContext2D, x: number, y: number, dir: 1 | -1): void {
  ctx.beginPath();
  for (const o of [-6, 1]) {
    const bx = x + dir * o;
    ctx.moveTo(bx - dir * 1, y - 5);
    ctx.lineTo(bx + dir * 6, y);
    ctx.lineTo(bx - dir * 1, y + 5);
    ctx.closePath();
  }
  ctx.fill();
  ctx.fillRect(dir === 1 ? x + 7 : x - 9, y - 5, 2, 10);
}

function drawPlayPause(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.beginPath();
  ctx.moveTo(x - 10, y - 5);
  ctx.lineTo(x - 2, y);
  ctx.lineTo(x - 10, y + 5);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(x + 2, y - 5, 2.5, 10);
  ctx.fillRect(x + 6.5, y - 5, 2.5, 10);
}
