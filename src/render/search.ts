// Search screen: the typed text at the top, a live preview of matches, and
// the letter strip at the bottom that the wheel moves along.
import { fit } from "./screen";
import { COLOR, FONT } from "./theme";

export interface SearchView {
  query: string;
  chars: string[];
  index: number;
  count: number;
  preview: { label: string; kind: string }[];
  hint: string;
  emptyLabel: string;
  now: number;
}

const PAD = 10;
const STRIP_H = 40;
const CELL = 26;

export function drawSearch(ctx: CanvasRenderingContext2D, w: number, h: number, v: SearchView): boolean {
  ctx.textBaseline = "middle";

  // Query box with a blinking cursor.
  const boxY = 8;
  const boxH = 28;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(PAD, boxY, w - 2 * PAD, boxH);
  ctx.strokeStyle = COLOR.titleLine;
  ctx.lineWidth = 1;
  ctx.strokeRect(PAD + 0.5, boxY + 0.5, w - 2 * PAD - 1, boxH - 1);
  ctx.font = FONT.row;
  ctx.fillStyle = COLOR.text;
  ctx.textAlign = "left";
  const shown = fitTail(ctx, v.query.replace(/ /g, " "), w - 2 * PAD - 70);
  ctx.fillText(shown, PAD + 8, boxY + boxH / 2 + 1);
  if (Math.floor(v.now / 530) % 2 === 0) {
    const cx = PAD + 9 + ctx.measureText(shown).width;
    ctx.fillStyle = COLOR.accent;
    ctx.fillRect(cx, boxY + 6, 2, boxH - 12);
  }
  ctx.font = FONT.small;
  ctx.fillStyle = COLOR.textDim;
  ctx.textAlign = "right";
  if (v.query.trim()) ctx.fillText(String(v.count), w - PAD - 8, boxY + boxH / 2 + 1);

  // Preview of the first matches.
  const listY = boxY + boxH + 8;
  const rowH = 21;
  const rows = Math.floor((h - STRIP_H - 18 - listY) / rowH);
  if (!v.query.trim()) {
    ctx.textAlign = "center";
    ctx.fillStyle = COLOR.textDim;
    ctx.fillText(v.hint, w / 2, listY + rowH);
  } else if (v.preview.length === 0) {
    ctx.textAlign = "center";
    ctx.font = FONT.value;
    ctx.fillStyle = COLOR.textDim;
    ctx.fillText(v.emptyLabel, w / 2, listY + rowH);
  } else {
    v.preview.slice(0, rows).forEach((p, i) => {
      const y = listY + i * rowH + rowH / 2;
      ctx.font = FONT.small;
      ctx.fillStyle = COLOR.textDim;
      ctx.textAlign = "right";
      const kw = ctx.measureText(p.kind).width;
      ctx.fillText(p.kind, w - PAD, y);
      ctx.font = FONT.value;
      ctx.fillStyle = COLOR.text;
      ctx.textAlign = "left";
      ctx.fillText(fit(ctx, p.label, w - 2 * PAD - kw - 10), PAD, y);
    });
  }

  // Letter strip.
  const stripY = h - STRIP_H;
  ctx.fillStyle = COLOR.titleBg;
  ctx.fillRect(0, stripY, w, STRIP_H);
  ctx.fillStyle = COLOR.titleLine;
  ctx.fillRect(0, stripY, w, 1);
  const visible = Math.floor(w / CELL);
  const half = Math.floor(visible / 2);
  const cx0 = w / 2 - half * CELL;
  ctx.font = FONT.row;
  ctx.textAlign = "center";
  for (let k = -half; k <= half; k++) {
    const i = v.index + k;
    if (i < 0 || i >= v.chars.length) continue;
    const x = cx0 + (k + half) * CELL;
    const y = stripY + STRIP_H / 2 + 1;
    if (k === 0) {
      ctx.fillStyle = COLOR.accent;
      ctx.beginPath();
      ctx.moveTo(x - CELL / 2 + 1, stripY + 5);
      ctx.lineTo(x + CELL / 2 - 6, stripY + 5);
      ctx.lineTo(x + CELL / 2 - 1, stripY + 10);
      ctx.lineTo(x + CELL / 2 - 1, stripY + STRIP_H - 5);
      ctx.lineTo(x - CELL / 2 + 1, stripY + STRIP_H - 5);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = k === 0 ? COLOR.textOnAccent : Math.abs(k) > half - 2 ? COLOR.textDisabled : COLOR.text;
    const ch = v.chars[i];
    if (ch === " ") {
      // Space: an open box.
      ctx.fillRect(x - 6, y + 4, 12, 2);
      ctx.fillRect(x - 6, y, 2, 6);
      ctx.fillRect(x + 4, y, 2, 6);
    } else {
      ctx.fillText(ch, x, y);
    }
  }
  return true; // cursor blinks
}

/** Keeps the end of the text visible (what is being typed). */
function fitTail(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText("…" + s).width > maxWidth) s = s.slice(1);
  return "…" + s;
}

/** Which letter cell a click at x hits, relative to the selected one (0 = selected). */
export function stripOffsetAt(x: number, y: number, w: number, h: number): number | null {
  if (y < h - STRIP_H) return null;
  const visible = Math.floor(w / CELL);
  const half = Math.floor(visible / 2);
  const k = Math.round((x - (w / 2 - half * CELL)) / CELL) - half;
  return Math.abs(k) <= half ? k : null;
}
