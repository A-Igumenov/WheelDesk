// EQ editor: ten vertical band sliders. The selected band is the accent bar;
// the wheel moves its gain, the centre button goes to the next band.
import { bandLabel, EQ_BANDS, EQ_MAX_DB } from "../core/eq";
import { COLOR, FONT } from "./theme";

export interface EqView {
  gains: number[];
  index: number;
  hint: string;
}

export function drawEq(ctx: CanvasRenderingContext2D, w: number, h: number, v: EqView): boolean {
  const left = 30;
  const right = w - 12;
  const top = 34;
  const bottom = h - 48;
  const mid = (top + bottom) / 2;
  const scale = (bottom - top) / 2 / EQ_MAX_DB;
  const step = (right - left) / EQ_BANDS.length;

  // Selected band value on top.
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.font = FONT.value;
  ctx.fillStyle = COLOR.text;
  const g = v.gains[v.index] ?? 0;
  ctx.fillText(`${bandLabel(EQ_BANDS[v.index])} Hz   ${g > 0 ? "+" : ""}${g.toFixed(1)} dB`, w / 2, 16);

  // Scale: +12 / 0 / −12 lines.
  ctx.font = FONT.small;
  ctx.textAlign = "right";
  for (const db of [EQ_MAX_DB, 0, -EQ_MAX_DB]) {
    const y = mid - db * scale;
    ctx.fillStyle = COLOR.textDim;
    ctx.fillText(db > 0 ? `+${db}` : String(db), left - 5, y);
    ctx.strokeStyle = db === 0 ? COLOR.titleLine : COLOR.scrollTrack;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, Math.round(y) + 0.5);
    ctx.lineTo(right, Math.round(y) + 0.5);
    ctx.stroke();
  }

  // Bars from the 0 dB line, angular tops.
  EQ_BANDS.forEach((hz, i) => {
    const x = left + i * step + step * 0.22;
    const bw = step * 0.56;
    const gain = v.gains[i] ?? 0;
    const y = mid - gain * scale;
    const sel = i === v.index;
    ctx.fillStyle = sel ? COLOR.accent : COLOR.scrollThumb;
    ctx.beginPath();
    const c = Math.min(4, Math.abs(y - mid));
    if (gain >= 0) {
      ctx.moveTo(x, mid);
      ctx.lineTo(x, y);
      ctx.lineTo(x + bw - c, y);
      ctx.lineTo(x + bw, y + c);
      ctx.lineTo(x + bw, mid);
    } else {
      ctx.moveTo(x, mid);
      ctx.lineTo(x, y);
      ctx.lineTo(x + bw - c, y);
      ctx.lineTo(x + bw, y - c);
      ctx.lineTo(x + bw, mid);
    }
    ctx.closePath();
    ctx.fill();
    // Handle on the bar end.
    ctx.fillStyle = sel ? COLOR.accentDark : COLOR.text;
    ctx.fillRect(x - 1, Math.round(y) - 1.5, bw + 2, 3);

    ctx.textAlign = "center";
    ctx.fillStyle = sel ? COLOR.accent : COLOR.textDim;
    ctx.font = sel ? "700 11px Inter, sans-serif" : "500 11px Inter, sans-serif";
    ctx.fillText(bandLabel(hz), x + bw / 2, bottom + 12);
  });

  ctx.font = FONT.small;
  ctx.textAlign = "center";
  ctx.fillStyle = COLOR.textDim;
  ctx.fillText(v.hint, w / 2, h - 14);
  return false;
}
