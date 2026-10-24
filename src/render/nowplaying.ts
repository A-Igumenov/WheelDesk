// Drawing for the two picture screens: Now Playing and Cover Flow.
// Both draw inside the screen body (below the title bar).
import type { Track } from "../core/library";
import { formatTime } from "../core/library";
import type { RepeatMode, ShuffleMode } from "../platform/bridge";
import { fit } from "./screen";
import { COLOR, FONT } from "./theme";

export type NowPlayingMode = "progress" | "volume" | "scrub";

export interface NowPlayingView {
  track: Track | null;
  artist: string;
  album: string;
  index: number;
  total: number;
  positionMs: number;
  durationMs: number;
  playing: boolean;
  volume: number;
  mode: NowPlayingMode;
  art: CanvasImageSource | null;
  repeat: RepeatMode;
  shuffle: ShuffleMode;
  ofLabel: string;
  emptyLabel: string;
  error: string | null;
  /** Album art fills the screen; the progress bar stays on top of it. */
  fullArt?: boolean;
}

const PAD = 12;

/** Where the artwork sits on Now Playing (screen body coordinates). */
export const ART_RECT = { x: PAD, y: 26, s: 118 } as const;

export function inArt(x: number, y: number): boolean {
  return x >= ART_RECT.x && x <= ART_RECT.x + ART_RECT.s && y >= ART_RECT.y && y <= ART_RECT.y + ART_RECT.s;
}

/**
 * Artwork over the whole screen (cover-cropped), with a dark band at the top
 * for the title and one at the bottom for the bar. Returns the bar's y.
 */
function drawFullArt(ctx: CanvasRenderingContext2D, w: number, h: number, art: CanvasImageSource | null, title: string, sub: string): number {
  if (art) {
    const iw = (art as HTMLImageElement).naturalWidth || (art as HTMLImageElement).width || w;
    const ih = (art as HTMLImageElement).naturalHeight || (art as HTMLImageElement).height || h;
    const scale = Math.max(w / iw, h / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.drawImage(art, (w - dw) / 2, (h - dh) / 2, dw, dh);
  } else {
    drawArtOrPlaceholder(ctx, 0, (h - w) / 2, w, null);
  }
  let g = ctx.createLinearGradient(0, 0, 0, 52);
  g.addColorStop(0, "rgba(0,0,0,0.72)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, 52);
  g = ctx.createLinearGradient(0, h - 70, 0, h);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(0.45, "rgba(0,0,0,0.6)");
  g.addColorStop(1, "rgba(0,0,0,0.82)");
  ctx.fillStyle = g;
  ctx.fillRect(0, h - 70, w, 70);

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = FONT.row;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(fit(ctx, title, w - 2 * PAD), PAD, 14);
  ctx.font = FONT.small;
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.fillText(fit(ctx, sub, w - 2 * PAD), PAD, 33);
  return h - 38;
}

export function drawNowPlaying(ctx: CanvasRenderingContext2D, w: number, h: number, v: NowPlayingView): void {
  ctx.textBaseline = "middle";
  if (!v.track) {
    ctx.font = FONT.row;
    ctx.fillStyle = COLOR.textDim;
    ctx.textAlign = "center";
    ctx.fillText(v.emptyLabel, w / 2, h / 2);
    return;
  }

  if (v.fullArt) {
    const barY = drawFullArt(ctx, w, h, v.art, v.track.title, [v.artist, v.album].filter(Boolean).join(" — "));
    if (v.mode === "volume") drawVolume(ctx, PAD, barY, w - 2 * PAD, v.volume, true);
    else drawProgress(ctx, PAD, barY, w - 2 * PAD, v, true);
    return;
  }

  // "3 of 25" and the repeat / shuffle indicators.
  ctx.font = FONT.small;
  ctx.fillStyle = COLOR.textDim;
  ctx.textAlign = "left";
  ctx.fillText(`${v.index + 1} ${v.ofLabel} ${v.total}`, PAD, 13);
  let ix = w - PAD;
  if (v.repeat !== "off") {
    drawRepeat(ctx, ix - 16, 13, v.repeat === "one");
    ix -= 24;
  }
  if (v.shuffle !== "off") drawShuffle(ctx, ix - 16, 13);

  // Artwork.
  const art = { x: PAD, y: 26, s: 118 };
  drawArtOrPlaceholder(ctx, art.x, art.y, art.s, v.art);

  // Title, artist, album.
  const tx = art.x + art.s + 14;
  const tw = w - tx - PAD;
  ctx.textAlign = "left";
  ctx.fillStyle = COLOR.text;
  ctx.font = FONT.row;
  const lines = wrap(ctx, v.track.title, tw, 2);
  lines.forEach((line, i) => ctx.fillText(line, tx, 44 + i * 19));
  let y = 44 + lines.length * 19 + 6;
  ctx.font = FONT.value;
  ctx.fillText(fit(ctx, v.artist, tw), tx, y);
  ctx.fillStyle = COLOR.textDim;
  ctx.fillText(fit(ctx, v.album, tw), tx, y + 20);

  // Bottom bar: progress, scrubber or volume.
  const barY = h - 46;
  if (v.mode === "volume") drawVolume(ctx, PAD, barY, w - 2 * PAD, v.volume);
  else drawProgress(ctx, PAD, barY, w - 2 * PAD, v);

  if (v.error) {
    ctx.font = FONT.small;
    ctx.fillStyle = "#b3261e";
    ctx.textAlign = "center";
    ctx.fillText(fit(ctx, v.error, w - 2 * PAD), w / 2, h - 8);
  }
}

function drawProgress(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, v: NowPlayingView, light = false): void {
  const p = v.durationMs > 0 ? Math.min(1, v.positionMs / v.durationMs) : 0;
  const h = 10;
  angularBar(ctx, x, y, w, h, light ? "rgba(255,255,255,0.32)" : COLOR.scrollTrack);
  if (v.mode === "scrub") {
    // Scrubber: a diamond rides the bar.
    ctx.fillStyle = COLOR.accent;
    angularBar(ctx, x, y, w * p, h, "rgba(42,91,215,0.35)");
    const cx = x + w * p;
    ctx.beginPath();
    ctx.moveTo(cx, y - 5);
    ctx.lineTo(cx + 9, y + h / 2);
    ctx.lineTo(cx, y + h + 5);
    ctx.lineTo(cx - 9, y + h / 2);
    ctx.closePath();
    ctx.fillStyle = COLOR.accent;
    ctx.fill();
  } else if (p > 0) {
    angularBar(ctx, x, y, Math.max(6, w * p), h, COLOR.accent);
  }
  ctx.font = FONT.small;
  ctx.fillStyle = light ? "#ffffff" : COLOR.text;
  ctx.textAlign = "left";
  ctx.fillText(formatTime(v.positionMs), x, y + h + 15);
  ctx.textAlign = "right";
  ctx.fillText(`-${formatTime(Math.max(0, v.durationMs - v.positionMs))}`, x + w, y + h + 15);
}

/** Volume Limit set in Settings; drawn as a mark on every volume bar. */
let volumeLimitMark = 1;
export function setVolumeLimitMark(limit: number): void {
  volumeLimitMark = limit;
}

export function drawVolume(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, vol: number, light = false, limit = volumeLimitMark): void {
  const iconW = 22;
  const ink = light ? "#ffffff" : COLOR.text;
  speaker(ctx, x + 2, y + 5, 0, ink);
  speaker(ctx, x + w - 18, y + 5, 2, ink);
  const bx = x + iconW;
  const bw = w - 2 * iconW;
  angularBar(ctx, bx, y, bw, 10, light ? "rgba(255,255,255,0.32)" : COLOR.scrollTrack);
  if (vol > 0) angularBar(ctx, bx, y, Math.max(6, bw * vol), 10, COLOR.accent);
  if (limit < 1) {
    // Limit mark: a small wedge above and below the bar.
    const lx = Math.round(bx + bw * limit);
    ctx.fillStyle = light ? "#ffffff" : COLOR.text;
    ctx.fillRect(lx - 1, y - 4, 2, 18);
    ctx.beginPath();
    ctx.moveTo(lx - 4, y - 6);
    ctx.lineTo(lx + 4, y - 6);
    ctx.lineTo(lx, y - 2);
    ctx.closePath();
    ctx.fill();
  }
}

function speaker(ctx: CanvasRenderingContext2D, x: number, y: number, waves: number, ink: string = COLOR.text): void {
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.moveTo(x, y - 3);
  ctx.lineTo(x + 4, y - 3);
  ctx.lineTo(x + 9, y - 7);
  ctx.lineTo(x + 9, y + 7);
  ctx.lineTo(x + 4, y + 3);
  ctx.lineTo(x, y + 3);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.5;
  for (let i = 1; i <= waves; i++) {
    ctx.beginPath();
    ctx.moveTo(x + 10 + i * 3, y - 2 - i * 2);
    ctx.lineTo(x + 12 + i * 3, y);
    ctx.lineTo(x + 10 + i * 3, y + 2 + i * 2);
    ctx.stroke();
  }
}

/** Bar with a chamfered right end, matching the menu highlight. */
function angularBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  if (w <= 0) return;
  const c = Math.min(5, w);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w - c, y);
  ctx.lineTo(x + w, y + c);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.fill();
}

function drawRepeat(ctx: CanvasRenderingContext2D, x: number, y: number, one: boolean): void {
  ctx.strokeStyle = COLOR.textDim;
  ctx.lineWidth = 1.6;
  ctx.strokeRect(x, y - 4, 14, 8);
  ctx.fillStyle = COLOR.textDim;
  ctx.beginPath();
  ctx.moveTo(x + 14, y - 8);
  ctx.lineTo(x + 18, y - 4);
  ctx.lineTo(x + 14, y);
  ctx.closePath();
  ctx.fill();
  if (one) {
    ctx.font = "700 8px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("1", x + 7, y + 1);
  }
}

function drawShuffle(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.strokeStyle = COLOR.textDim;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x, y - 4);
  ctx.lineTo(x + 14, y + 4);
  ctx.moveTo(x, y + 4);
  ctx.lineTo(x + 14, y - 4);
  ctx.stroke();
}

export function drawArtOrPlaceholder(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, art: CanvasImageSource | null): void {
  if (art) {
    ctx.drawImage(art, x, y, s, s);
  } else {
    const g = ctx.createLinearGradient(x, y, x + s, y + s);
    g.addColorStop(0, "#2b2f37");
    g.addColorStop(1, "#46506a");
    ctx.fillStyle = g;
    ctx.fillRect(x, y, s, s);
    // Angular eighth note.
    const cx = x + s / 2;
    const cy = y + s / 2;
    const u = s / 10;
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.beginPath();
    ctx.moveTo(cx - 2.2 * u, cy + 1.2 * u);
    ctx.lineTo(cx - 0.4 * u, cy + 1.2 * u);
    ctx.lineTo(cx - 0.4 * u, cy + 3 * u);
    ctx.lineTo(cx - 2.2 * u, cy + 3 * u);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(cx - 0.9 * u, cy - 3 * u, 0.5 * u, 4.4 * u);
    ctx.beginPath();
    ctx.moveTo(cx - 0.4 * u, cy - 3 * u);
    ctx.lineTo(cx + 2 * u, cy - 1.6 * u);
    ctx.lineTo(cx + 2 * u, cy - 0.6 * u);
    ctx.lineTo(cx - 0.4 * u, cy - 2 * u);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
}

/** Splits text into at most `max` lines that fit `width`; the last one is ellipsised. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number, max: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(test).width <= width || !line) {
      line = test;
    } else {
      lines.push(line);
      line = words[i];
      if (lines.length === max - 1) {
        line = words.slice(i).join(" ");
        break;
      }
    }
  }
  lines.push(line);
  return lines.slice(0, max).map((l) => fit(ctx, l, width));
}

// ------------------------------------------------------------------ Cover Flow

export interface CoverFlowView {
  count: number;
  index: number;
  name: (i: number) => string;
  artist: (i: number) => string;
  art: (i: number) => CanvasImageSource | null;
  emptyLabel: string;
}

export function drawCoverFlow(ctx: CanvasRenderingContext2D, w: number, h: number, v: CoverFlowView): void {
  ctx.fillStyle = "#16171a";
  ctx.fillRect(0, 0, w, h);
  ctx.textBaseline = "middle";
  if (v.count === 0) {
    ctx.font = FONT.row;
    ctx.fillStyle = "#b9bcc2";
    ctx.textAlign = "center";
    ctx.fillText(v.emptyLabel, w / 2, h / 2);
    return;
  }
  const big = 126;
  const small = 84;
  const cy = 12 + big / 2;
  // Neighbours first so the centre cover sits on top.
  for (const d of [-3, 3, -2, 2, -1, 1]) {
    const i = v.index + d;
    if (i < 0 || i >= v.count) continue;
    const off = Math.sign(d) * (big / 2 + 14 + (Math.abs(d) - 1) * 34);
    const x = w / 2 + off - small / 2;
    const y = cy - small / 2 + 10;
    ctx.save();
    // Slanted sides, the angular take on the 3D flow.
    ctx.transform(1, d < 0 ? 0.18 : -0.18, 0, 1, 0, d < 0 ? -0.18 * x : 0.18 * (x + small));
    drawArtOrPlaceholder(ctx, x, y, small, v.art(i));
    ctx.fillStyle = `rgba(0,0,0,${0.3 + 0.15 * (Math.abs(d) - 1)})`;
    ctx.fillRect(x, y, small, small);
    ctx.restore();
  }
  drawArtOrPlaceholder(ctx, w / 2 - big / 2, 12, big, v.art(v.index));

  ctx.textAlign = "center";
  ctx.font = FONT.row;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(fit(ctx, v.name(v.index), w - 24), w / 2, h - 44);
  ctx.font = FONT.value;
  ctx.fillStyle = "#b9bcc2";
  ctx.fillText(fit(ctx, v.artist(v.index), w - 24), w / 2, h - 22);
}

// ------------------------------------------------------------------ Radio

export interface RadioView {
  station: string;
  genre: string;
  description: string;
  /** What the station sends now ("Artist - Title"), or a status text. */
  nowText: string;
  index: number;
  total: number;
  listenedMs: number;
  playing: boolean;
  buffering: boolean;
  volume: number;
  volumeMode: boolean;
  art: CanvasImageSource | null;
  ofLabel: string;
  liveLabel: string;
  error: string | null;
  fullArt?: boolean;
}

const MARQUEE_PX_PER_S = 32;
const MARQUEE_GAP = 48;

/** Text that scrolls when it does not fit. Returns true while it is moving. */
export function drawMarquee(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, now: number): boolean {
  const tw = ctx.measureText(text).width;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y - 12, w, 24);
  ctx.clip();
  ctx.textAlign = "left";
  if (tw <= w) {
    ctx.fillText(text, x, y);
    ctx.restore();
    return false;
  }
  // Pause briefly at the start of every loop so the beginning can be read.
  const loop = tw + MARQUEE_GAP;
  const t = (now / 1000) * MARQUEE_PX_PER_S;
  const pause = MARQUEE_PX_PER_S * 1.5;
  const phase = t % (loop + pause);
  const off = Math.max(0, phase - pause);
  ctx.fillText(text, x - off, y);
  ctx.fillText(text, x - off + loop, y);
  ctx.restore();
  return true;
}

export function drawRadio(ctx: CanvasRenderingContext2D, w: number, h: number, now: number, v: RadioView): boolean {
  ctx.textBaseline = "middle";
  if (v.fullArt) {
    const barY = drawFullArt(ctx, w, h, v.art, v.station, "");
    // The station's song text scrolls in the subtitle line.
    ctx.font = FONT.small;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    const moving = drawMarquee(ctx, v.nowText, PAD, 33, w - 2 * PAD, now);
    if (v.volumeMode) {
      drawVolume(ctx, PAD, barY, w - 2 * PAD, v.volume, true);
    } else {
      angularBar(ctx, PAD, barY, w - 2 * PAD, 10, "rgba(255,255,255,0.32)");
      if (v.playing && !v.buffering) {
        const span = w - 2 * PAD - 14;
        ctx.fillStyle = COLOR.accent;
        ctx.fillRect(PAD + ((now / 40) % span), barY, 14, 10);
      }
      ctx.font = FONT.small;
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "left";
      ctx.fillText(formatTime(v.listenedMs), PAD, barY + 25);
      ctx.textAlign = "right";
      ctx.fillText(v.liveLabel, w - PAD, barY + 25);
    }
    return moving || v.playing || v.buffering;
  }

  // "LIVE" badge and "3 of 20".
  ctx.font = FONT.small;
  const badge = v.liveLabel;
  const bw = ctx.measureText(badge).width + 12;
  ctx.fillStyle = v.playing && !v.buffering ? "#c62f2f" : COLOR.textDim;
  ctx.beginPath();
  ctx.moveTo(PAD, 5);
  ctx.lineTo(PAD + bw - 4, 5);
  ctx.lineTo(PAD + bw, 9);
  ctx.lineTo(PAD + bw, 21);
  ctx.lineTo(PAD, 21);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.fillText(badge, PAD + 6, 13.5);
  ctx.fillStyle = COLOR.textDim;
  ctx.textAlign = "right";
  ctx.fillText(`${v.index + 1} ${v.ofLabel} ${v.total}`, w - PAD, 13);

  const art = { x: PAD, y: 26, s: 118 };
  drawArtOrPlaceholder(ctx, art.x, art.y, art.s, v.art);

  const tx = art.x + art.s + 14;
  const tw = w - tx - PAD;
  ctx.textAlign = "left";
  ctx.fillStyle = COLOR.text;
  ctx.font = FONT.row;
  ctx.fillText(fit(ctx, v.station, tw), tx, 40);

  ctx.font = FONT.value;
  ctx.fillStyle = COLOR.accent;
  let moving = drawMarquee(ctx, v.nowText, tx, 63, tw, now);

  ctx.fillStyle = COLOR.textDim;
  ctx.font = FONT.small;
  ctx.fillText(fit(ctx, v.genre, tw), tx, 84);
  if (v.description) {
    const lines = wrap(ctx, v.description, tw, 3);
    lines.forEach((line, i) => ctx.fillText(line, tx, 104 + i * 15));
  }

  const barY = h - 46;
  if (v.volumeMode) {
    drawVolume(ctx, PAD, barY, w - 2 * PAD, v.volume);
  } else {
    // Live bar: full, with a moving notch while audio flows.
    angularBar(ctx, PAD, barY, w - 2 * PAD, 10, COLOR.scrollTrack);
    if (v.playing && !v.buffering) {
      angularBar(ctx, PAD, barY, w - 2 * PAD, 10, "rgba(42,91,215,0.35)");
      const span = w - 2 * PAD - 14;
      const x = PAD + ((now / 40) % span);
      ctx.fillStyle = COLOR.accent;
      ctx.fillRect(x, barY, 14, 10);
      moving = true;
    }
    ctx.font = FONT.small;
    ctx.fillStyle = COLOR.text;
    ctx.textAlign = "left";
    ctx.fillText(formatTime(v.listenedMs), PAD, barY + 25);
    ctx.textAlign = "right";
    ctx.fillText(v.liveLabel, w - PAD, barY + 25);
  }

  if (v.error) {
    ctx.font = FONT.small;
    ctx.fillStyle = "#b3261e";
    ctx.textAlign = "center";
    ctx.fillText(fit(ctx, v.error, w - 2 * PAD), w / 2, h - 8);
  }
  return moving || v.buffering;
}
