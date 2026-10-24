// Geometry and colours of the device. Everything is in logical pixels; the canvas
// is scaled by devicePixelRatio, so the picture is the same on every OS.

/**
 * The player is drawn in an oblique (cabinet) projection: the front face stays
 * flat and undistorted, the top and right edges recede up and to the right.
 * FRONT is the front face; DEPTH is the receding edge vector.
 */
export const FRONT = { x: 0, y: 12, w: 360, h: 600 } as const;
export const DEPTH = { dx: 20, dy: 12 } as const;
export const DEVICE = { w: FRONT.w + DEPTH.dx, h: FRONT.y + FRONT.h } as const;

export const SCREEN = { x: 20, y: FRONT.y + 32, w: 320, h: 240 } as const;
export const TITLE_H = 22;
export const ROW_H = 27;
export const SPLIT_W = 168;

export const WHEEL = { cx: 180, cy: FRONT.y + 444, outer: 128, inner: 46 } as const;

/** Window controls drawn on the front face (frameless window on all OSes). */
export const WIN_BTN = {
  size: 14,
  y: FRONT.y + 9,
  minimizeX: FRONT.w - 44,
  closeX: FRONT.w - 24,
} as const;

/**
 * Volume keys on the right side face. t0..t1 is how far across the face (0 =
 * front edge, 1 = back edge); upY/downY/h are heights on the front edge.
 */
export const VOL_BTN = { t0: 0.1, t1: 0.9, h: 64, upY: FRONT.y + 52, downY: FRONT.y + 128 } as const;

/** A point on the right side face: `t` across it (0–1), `y` measured at the front edge. */
export function sidePoint(t: number, y: number): { x: number; y: number } {
  return { x: FRONT.x + FRONT.w + t * DEPTH.dx, y: y - t * DEPTH.dy };
}

/** Inverse of sidePoint: where a canvas point lies on the side face (t outside 0–1 = not on it). */
export function onSide(x: number, y: number): { t: number; y: number } {
  const t = (x - (FRONT.x + FRONT.w)) / DEPTH.dx;
  return { t, y: y + t * DEPTH.dy };
}

// Inter is bundled with Latin, Latin-Extended (Lithuanian) and Cyrillic glyphs;
// the generic fallback only covers scripts beyond those (e.g. CJK titles).
export const FONT = {
  row: "600 15px Inter, sans-serif",
  title: "700 13px Inter, sans-serif",
  value: "500 14px Inter, sans-serif",
  wheel: "700 12px Inter, sans-serif",
  small: "600 12px Inter, sans-serif",
} as const;

/** Sample text that makes the browser load every Inter subset we draw with. */
export const FONT_PRELOAD_SAMPLE = "Aa ĄąČčĘęĖėĮįŠšŲųŪūŽž АаБбЯяЁёЫыЪъ ІіЇїЄєҐґ";

export const COLOR = {
  chassis: "#2b2d31",
  chassisEdge: "#3a3d42",
  chassisShade: "#1d1e21",
  bezel: "#0c0c0d",
  screenBg: "#fbfbfa",
  titleBg: "#dfe1e4",
  titleLine: "#8d9197",
  text: "#111214",
  textDim: "#6a6e75",
  textDisabled: "#a9adb3",
  textDisabledOnAccent: "rgba(255,255,255,0.55)",
  textOnAccent: "#ffffff",
  accent: "#2a5bd7",
  accentDark: "#1d47b0",
  scrollTrack: "#d6d8db",
  scrollThumb: "#7b8088",
  wheel: "#3a3c41",
  wheelEdge: "#4a4d53",
  wheelLabel: "#d9dadc",
  wheelPressed: "#55585f",
  center: "#2f3135",
  centerEdge: "#45484e",
  winBtn: "#55585f",
  winBtnHover: "#c94a3f",
} as const;

/** Regular octagon path centred on (cx, cy) with circumradius r, flat edges up/down/left/right. */
export function octagon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI / 8) * (2 * i + 1);
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}
