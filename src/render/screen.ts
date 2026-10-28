// Draws the 320×240 display: title bar, list rows, scroll bar, split artwork pane
// and the horizontal slide used when moving between menus.
import type { MenuItem, Navigator, View } from "../core/navigator";
import { COLOR, FONT, ROW_H, SCREEN, SPLIT_W, TITLE_H } from "./theme";

export interface Slide {
  kind: "push" | "pop";
  from: View;
  to: View;
  start: number;
}

export const SLIDE_MS = 220;

export interface ScreenState {
  slide: Slide | null;
  isPlaying: boolean;
  /** Library scan running: a small spinner in the title bar. */
  busy: boolean;
  /** Selected row blinks until this time (added to On-The-Go). */
  flashUntil: number;
  dimmed: boolean;
  now: number;
  /** Album art for the split main menu; null draws the built-in pattern. */
  art: CanvasImageSource | null;
}

const ease = (p: number) => 1 - Math.pow(1 - p, 3);

export function drawScreen(ctx: CanvasRenderingContext2D, nav: Navigator, st: ScreenState): boolean {
  const { x, y, w, h } = SCREEN;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.translate(x, y);

  ctx.fillStyle = COLOR.screenBg;
  ctx.fillRect(0, 0, w, h);

  let animating = false;
  const body = { y: TITLE_H, h: h - TITLE_H };

  if (st.slide) {
    const p = Math.min(1, (st.now - st.slide.start) / SLIDE_MS);
    const e = ease(p);
    const dir = st.slide.kind === "push" ? -1 : 1;
    drawView(ctx, nav, st.slide.from, dir * e * w, body, st);
    drawView(ctx, nav, st.slide.to, dir * (e - 1) * w, body, st);
    drawTitle(ctx, p < 0.5 ? st.slide.from.screen.title : st.slide.to.screen.title, st);
    animating = p < 1 || st.busy;
    if (!animating) st.slide = null;
  } else {
    animating = drawView(ctx, nav, nav.current, 0, body, st) || st.busy || st.now < st.flashUntil;
    drawTitle(ctx, nav.current.screen.title, st);
  }

  if (st.dimmed) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
  return animating;
}

function drawTitle(ctx: CanvasRenderingContext2D, title: string, st: ScreenState): void {
  const w = SCREEN.w;
  ctx.fillStyle = COLOR.titleBg;
  ctx.fillRect(0, 0, w, TITLE_H);
  ctx.fillStyle = COLOR.titleLine;
  ctx.fillRect(0, TITLE_H - 1, w, 1);

  ctx.font = FONT.title;
  ctx.fillStyle = COLOR.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(fit(ctx, title, w - (titleClock ? 190 : 120)), w / 2, TITLE_H / 2 + 1);

  // Play state indicator (angular triangle) while something is playing.
  if (st.isPlaying) {
    ctx.fillStyle = COLOR.accent;
    ctx.beginPath();
    ctx.moveTo(8, 6);
    ctx.lineTo(17, 11);
    ctx.lineTo(8, 16);
    ctx.closePath();
    ctx.fill();
  }
  if (st.busy) {
    // Rotating square: scan in progress.
    ctx.save();
    ctx.translate(st.isPlaying ? 30 : 13, TITLE_H / 2);
    ctx.rotate((st.now / 400) % (Math.PI * 2));
    ctx.strokeStyle = COLOR.textDim;
    ctx.lineWidth = 1.6;
    ctx.strokeRect(-4, -4, 8, 8);
    ctx.restore();
  }
  if (titleClock) {
    const text = titleClock();
    if (text) {
      ctx.font = FONT.small;
      ctx.textAlign = "right";
      ctx.fillStyle = COLOR.text;
      ctx.fillText(text, w - 36, TITLE_H / 2 + 1);
    }
  }
  drawBattery(ctx, w - 30, 6);
}

/** Settings → Date & Time → Time in Title: the time next to the battery. */
let titleClock: (() => string) | null = null;
export function setTitleClock(fn: (() => string) | null): void {
  titleClock = fn;
}

function drawBattery(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.strokeStyle = COLOR.text;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, 20, 9);
  ctx.fillStyle = COLOR.text;
  ctx.fillRect(x + 21, y + 3, 2, 4);
  ctx.fillStyle = "#3c9a4a";
  ctx.fillRect(x + 2, y + 2, 17, 6);
}

function drawView(
  ctx: CanvasRenderingContext2D,
  nav: Navigator,
  view: View,
  dx: number,
  body: { y: number; h: number },
  st: ScreenState,
): boolean {
  const fullW = SCREEN.w;
  if (view.screen.draw) {
    ctx.save();
    ctx.translate(dx, body.y);
    ctx.beginPath();
    ctx.rect(0, 0, fullW, body.h);
    ctx.clip();
    const anim = view.screen.draw(ctx, fullW, body.h, st.now);
    ctx.restore();
    return anim;
  }
  const items = nav.items(view);
  const listW = view.screen.split ? SPLIT_W : fullW;

  ctx.save();
  ctx.translate(dx, body.y);
  ctx.beginPath();
  ctx.rect(0, 0, fullW, body.h);
  ctx.clip();

  if (view.screen.split) drawArt(ctx, listW, 0, fullW - listW, body.h, st.art);

  if (items.length === 0) {
    ctx.font = FONT.row;
    ctx.fillStyle = COLOR.textDim;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(view.screen.empty ?? "", listW / 2, body.h / 2);
    ctx.restore();
    return false;
  }

  const rows = nav.rowsFor(view);
  const scroll = items.length > rows;
  const rowW = scroll ? listW - 9 : listW;

  for (let i = 0; i < rows; i++) {
    const idx = view.top + i;
    const item = items[idx];
    if (!item) break;
    let selected = idx === view.selected;
    if (selected && st.now < st.flashUntil && Math.floor((st.flashUntil - st.now) / 110) % 2 === 1) selected = false;
    drawRow(ctx, item, 0, i * ROW_H, rowW, selected);
  }

  if (scroll) drawScrollBar(ctx, listW - 7, 2, 5, rows * ROW_H - 4, view.top, rows, items.length);
  ctx.restore();
  return false;
}

function drawRow(ctx: CanvasRenderingContext2D, item: MenuItem, x: number, y: number, w: number, selected: boolean): void {
  if (selected) {
    // Flat bar with a chamfered right end: the angular signature of this design.
    ctx.fillStyle = COLOR.accent;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w - 8, y);
    ctx.lineTo(x + w, y + 8);
    ctx.lineTo(x + w, y + ROW_H);
    ctx.lineTo(x, y + ROW_H);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = COLOR.accentDark;
    ctx.fillRect(x, y + ROW_H - 2, w, 2);
  }

  const off = item.disabled;
  const fg = off
    ? selected ? COLOR.textDisabledOnAccent : COLOR.textDisabled
    : selected ? COLOR.textOnAccent : COLOR.text;
  const dim = off ? fg : selected ? COLOR.textOnAccent : COLOR.textDim;
  let right = x + w - 9;

  if (item.chevron) {
    drawChevron(ctx, right - 5, y + ROW_H / 2, fg);
    right -= 16;
  }
  if (item.checked) {
    drawCheck(ctx, right - 10, y + ROW_H / 2, fg);
    right -= 20;
  }

  ctx.textBaseline = "middle";
  let valueW = 0;
  if (item.value) {
    ctx.font = FONT.value;
    ctx.fillStyle = dim;
    ctx.textAlign = "right";
    const v = fit(ctx, item.value, w * 0.42);
    valueW = ctx.measureText(v).width + 10;
    ctx.fillText(v, right, y + ROW_H / 2 + 1);
  }

  ctx.font = FONT.row;
  ctx.fillStyle = fg;
  ctx.textAlign = "left";
  ctx.fillText(fit(ctx, item.label, right - x - 10 - valueW), x + 9, y + ROW_H / 2 + 1);
}

function drawChevron(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.2;
  ctx.lineJoin = "miter";
  ctx.beginPath();
  ctx.moveTo(cx - 3, cy - 6);
  ctx.lineTo(cx + 3, cy);
  ctx.lineTo(cx - 3, cy + 6);
  ctx.stroke();
}

function drawCheck(ctx: CanvasRenderingContext2D, cx: number, cy: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.2;
  ctx.lineJoin = "miter";
  ctx.beginPath();
  ctx.moveTo(cx - 6, cy);
  ctx.lineTo(cx - 2, cy + 5);
  ctx.lineTo(cx + 6, cy - 6);
  ctx.stroke();
}

function drawScrollBar(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  top: number, rows: number, count: number,
): void {
  ctx.fillStyle = COLOR.scrollTrack;
  ctx.fillRect(x, y, w, h);
  const thumbH = Math.max(14, (h * rows) / count);
  const thumbY = y + ((h - thumbH) * top) / Math.max(1, count - rows);
  ctx.fillStyle = COLOR.scrollThumb;
  ctx.fillRect(x, thumbY, w, thumbH);
}

/** Right half of the main menu: album art, or a geometric pattern when there is none. */
function drawArt(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, art: CanvasImageSource | null): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  if (art) {
    const size = Math.max(w, h);
    ctx.drawImage(art, x + (w - size) / 2, y + (h - size) / 2, size, size);
  } else {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, "#22252b");
    g.addColorStop(1, "#3b4250");
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    const cx = x + w / 2;
    const cy = y + h / 2;
    for (let i = 6; i >= 1; i--) {
      const r = i * 17;
      ctx.fillStyle = i % 2 ? "rgba(42,91,215,0.55)" : "rgba(255,255,255,0.06)";
      ctx.beginPath();
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r, cy);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(x, y, 1, h);
  ctx.restore();
}

/** Ellipsises text to fit maxWidth using the current font. */
export function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (maxWidth <= 0) return "";
  if (ctx.measureText(text).width <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(text.slice(0, mid) + "…").width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + "…";
}
