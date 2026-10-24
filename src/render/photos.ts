// Photos: loading pictures from disk with a small memory budget, the
// thumbnail grid and the full-screen photo with its cross-fade.
import { COLOR, FONT } from "./theme";

const THUMB = 96;
const MAX_FULL = 4;

/** Loads photos on demand; keeps small thumbnails and only a few full images. */
export class PhotoStore {
  private thumbs = new Map<string, HTMLCanvasElement | null>();
  private full = new Map<string, HTMLImageElement | null>();
  private loading = new Set<string>();

  constructor(
    private readonly urlOf: (path: string) => string,
    private readonly onLoad: () => void,
  ) {}

  private load(path: string, keepFull: boolean): void {
    if (this.loading.has(path)) return;
    this.loading.add(path);
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      this.loading.delete(path);
      this.thumbs.set(path, makeThumb(img));
      if (keepFull) this.keepFull(path, img);
      this.onLoad();
    };
    img.onerror = () => {
      this.loading.delete(path);
      this.thumbs.set(path, null);
      if (keepFull) this.full.set(path, null);
      this.onLoad();
    };
    img.src = this.urlOf(path);
  }

  private keepFull(path: string, img: HTMLImageElement): void {
    this.full.delete(path);
    this.full.set(path, img);
    while (this.full.size > MAX_FULL) this.full.delete(this.full.keys().next().value!);
  }

  /** Square thumbnail; undefined while loading, null if the file cannot be shown. */
  thumb(path: string): HTMLCanvasElement | null | undefined {
    const t = this.thumbs.get(path);
    if (t === undefined) this.load(path, false);
    return t;
  }

  photo(path: string): HTMLImageElement | null | undefined {
    const f = this.full.get(path);
    if (f === undefined) {
      this.load(path, true);
      return undefined;
    }
    // Most recently used goes to the end.
    this.full.delete(path);
    this.full.set(path, f);
    return f;
  }

  /** Starts loading the next photo of a slideshow ahead of time. */
  preload(path: string): void {
    if (!this.full.has(path)) this.load(path, true);
  }
}

function makeThumb(img: HTMLImageElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = THUMB;
  c.height = THUMB;
  const g = c.getContext("2d")!;
  // Centre crop to a square, like the original's grid.
  const s = Math.min(img.naturalWidth, img.naturalHeight);
  g.imageSmoothingQuality = "high";
  g.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, THUMB, THUMB);
  return c;
}

export const GRID_COLS = 4;
export const GRID_ROWS = 3;

export function gridCell(w: number, h: number): { size: number; gap: number; x0: number; y0: number } {
  const gap = 6;
  const size = Math.floor(Math.min((w - gap * (GRID_COLS + 1)) / GRID_COLS, (h - gap * (GRID_ROWS + 1)) / GRID_ROWS));
  const x0 = Math.round((w - (size * GRID_COLS + gap * (GRID_COLS - 1))) / 2);
  const y0 = Math.round((h - (size * GRID_ROWS + gap * (GRID_ROWS - 1))) / 2);
  return { size, gap, x0, y0 };
}

export function drawPhotoGrid(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  v: { paths: string[]; selected: number; top: number; store: PhotoStore },
): boolean {
  const { size, gap, x0, y0 } = gridCell(w, h);
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const i = (v.top + r) * GRID_COLS + c;
      if (i >= v.paths.length) continue;
      const x = x0 + c * (size + gap);
      const y = y0 + r * (size + gap);
      const t = v.store.thumb(v.paths[i]);
      if (t) ctx.drawImage(t, x, y, size, size);
      else {
        ctx.fillStyle = t === null ? "#e9d6d6" : COLOR.scrollTrack;
        ctx.fillRect(x, y, size, size);
      }
      if (i === v.selected) {
        ctx.strokeStyle = COLOR.accent;
        ctx.lineWidth = 4;
        ctx.strokeRect(x - 1, y - 1, size + 2, size + 2);
      }
    }
  }
  // Scroll position on the right edge.
  const rows = Math.ceil(v.paths.length / GRID_COLS);
  if (rows > GRID_ROWS) {
    const th = Math.max(16, ((h - 8) * GRID_ROWS) / rows);
    const y = 4 + ((h - 8 - th) * v.top) / (rows - GRID_ROWS);
    ctx.fillStyle = COLOR.scrollTrack;
    ctx.fillRect(w - 5, 4, 3, h - 8);
    ctx.fillStyle = COLOR.scrollThumb;
    ctx.fillRect(w - 5, y, 3, th);
  }
  return false;
}

function fit(img: HTMLImageElement, w: number, h: number) {
  const s = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * s;
  const dh = img.naturalHeight * s;
  return { x: (w - dw) / 2, y: (h - dh) / 2, w: dw, h: dh };
}

/** Full photo on black; `prev` fades out over `fade` (0–1) when given. Returns true while fading. */
export function drawPhoto(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  v: { img: HTMLImageElement | null | undefined; prev?: HTMLImageElement | null; fade: number; caption: string; playing: boolean },
): boolean {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  if (v.prev && v.fade < 1) {
    const r = fit(v.prev, w, h);
    ctx.globalAlpha = 1 - v.fade;
    ctx.drawImage(v.prev, r.x, r.y, r.w, r.h);
    ctx.globalAlpha = 1;
  }
  if (v.img) {
    const r = fit(v.img, w, h);
    ctx.globalAlpha = v.prev ? v.fade : 1;
    ctx.drawImage(v.img, r.x, r.y, r.w, r.h);
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = "#9a9ea5";
    ctx.font = FONT.value;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(v.img === null ? "×" : "…", w / 2, h / 2);
  }
  if (v.caption) {
    ctx.font = FONT.small;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const tw = ctx.measureText(v.caption).width;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, h - 20, tw + 16 + (v.playing ? 14 : 0), 20);
    ctx.fillStyle = "#fff";
    let x = 6;
    if (v.playing) {
      ctx.beginPath();
      ctx.moveTo(x, h - 15);
      ctx.lineTo(x + 8, h - 10);
      ctx.lineTo(x, h - 5);
      ctx.closePath();
      ctx.fill();
      x += 14;
    }
    ctx.fillText(v.caption, x, h - 10);
  }
  return !!v.prev && v.fade < 1;
}
