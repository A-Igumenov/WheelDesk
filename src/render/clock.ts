// Full-screen clock: an octagonal analog face (the device's angular style)
// with the city, digital time and date beside it.
import type { ZonedTime } from "../core/clocks";
import { fit } from "./screen";
import { COLOR, FONT, octagon } from "./theme";

export interface ClockView {
  city: string;
  time: ZonedTime;
  dateLabel: string;
  offsetLabel: string;
  /** Night (20:00–06:59) draws a dark face, like the original. */
  night: boolean;
}

export function drawClock(ctx: CanvasRenderingContext2D, w: number, h: number, v: ClockView): boolean {
  const r = 82;
  const cx = 18 + r;
  const cy = h / 2;
  const face = v.night ? "#24272d" : "#ffffff";
  const ink = v.night ? "#e8e9eb" : COLOR.text;

  octagon(ctx, cx, cy, r + 4);
  ctx.fillStyle = v.night ? "#0f1013" : COLOR.titleLine;
  ctx.fill();
  octagon(ctx, cx, cy, r);
  ctx.fillStyle = face;
  ctx.fill();

  // Hour marks: bars at 12/3/6/9, short ticks elsewhere.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const long = i % 3 === 0;
    const r1 = r - (long ? 16 : 9);
    const r2 = r - 4;
    ctx.strokeStyle = ink;
    ctx.lineWidth = long ? 4 : 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.sin(a) * r1, cy - Math.cos(a) * r1);
    ctx.lineTo(cx + Math.sin(a) * r2, cy - Math.cos(a) * r2);
    ctx.stroke();
  }

  const t = v.time;
  const hand = (frac: number, len: number, width: number, color: string) => {
    const a = frac * Math.PI * 2;
    const dx = Math.sin(a);
    const dy = -Math.cos(a);
    // Angular, tapered hand: a long thin kite.
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(cx + dx * len, cy + dy * len);
    ctx.lineTo(cx - dy * width, cy + dx * width);
    ctx.lineTo(cx - dx * 10, cy - dy * 10);
    ctx.lineTo(cx + dy * width, cy - dx * width);
    ctx.closePath();
    ctx.fill();
  };
  hand(((t.hours % 12) + t.minutes / 60) / 12, r * 0.52, 4.5, ink);
  hand((t.minutes + t.seconds / 60) / 60, r * 0.78, 3.2, ink);
  hand(t.seconds / 60, r * 0.86, 1.2, COLOR.accent);
  octagon(ctx, cx, cy, 4.5);
  ctx.fillStyle = COLOR.accent;
  ctx.fill();

  // Text column.
  const tx = cx + r + 18;
  const tw = w - tx - 10;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = COLOR.text;
  ctx.font = FONT.row;
  ctx.fillText(fit(ctx, v.city, tw), tx, cy - 44);
  ctx.font = "700 30px Inter, sans-serif";
  ctx.fillText(`${String(t.hours).padStart(2, "0")}:${String(t.minutes).padStart(2, "0")}`, tx, cy - 8);
  ctx.font = FONT.small;
  ctx.fillStyle = COLOR.textDim;
  ctx.fillText(fit(ctx, v.dateLabel, tw), tx, cy + 22);
  ctx.fillText(fit(ctx, v.offsetLabel, tw), tx, cy + 40);
  return true; // second hand moves
}
