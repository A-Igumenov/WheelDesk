// Month view of Calendars: a 7-column grid, the selected day in the accent
// colour, a small mark under days that have events.
import { COLOR, FONT } from "./theme";

export interface MonthView {
  /** Any day in the month to show; the selected day. */
  selected: Date;
  today: Date;
  /** Day numbers (1–31) of the shown month that have events. */
  busy: Set<number>;
  monthTitle: string;
  /** Short weekday names starting with Monday. */
  weekdays: string[];
  /** One line under the grid (first event of the selected day). */
  footer: string;
}

export function drawMonth(ctx: CanvasRenderingContext2D, w: number, h: number, v: MonthView): boolean {
  const y0 = 22;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.font = FONT.title;
  ctx.fillStyle = COLOR.text;
  ctx.fillText(v.monthTitle, w / 2, 12);

  const cols = 7;
  const cellW = Math.floor((w - 12) / cols);
  const x0 = Math.round((w - cellW * cols) / 2);
  ctx.font = "600 10px Inter, sans-serif";
  ctx.fillStyle = COLOR.textDim;
  v.weekdays.forEach((d, i) => ctx.fillText(d, x0 + cellW * i + cellW / 2, y0 + 6));

  const year = v.selected.getFullYear();
  const month = v.selected.getMonth();
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7; // Monday first
  const days = new Date(year, month + 1, 0).getDate();
  const rows = Math.ceil((lead + days) / 7);
  const gridTop = y0 + 14;
  const cellH = Math.min(26, Math.floor((h - gridTop - 26) / rows));

  for (let d = 1; d <= days; d++) {
    const idx = lead + d - 1;
    const cx = x0 + (idx % 7) * cellW;
    const cy = gridTop + Math.floor(idx / 7) * cellH;
    const sel = d === v.selected.getDate();
    const isToday = d === v.today.getDate() && month === v.today.getMonth() && year === v.today.getFullYear();
    if (sel) {
      const c = 5;
      ctx.fillStyle = COLOR.accent;
      ctx.beginPath();
      ctx.moveTo(cx + 2, cy + 1);
      ctx.lineTo(cx + cellW - 2 - c, cy + 1);
      ctx.lineTo(cx + cellW - 2, cy + 1 + c);
      ctx.lineTo(cx + cellW - 2, cy + cellH - 1);
      ctx.lineTo(cx + 2, cy + cellH - 1);
      ctx.closePath();
      ctx.fill();
    } else if (isToday) {
      ctx.strokeStyle = COLOR.accent;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cx + 2.5, cy + 1.5, cellW - 5, cellH - 3);
    }
    const weekend = idx % 7 >= 5;
    ctx.font = isToday || sel ? "700 13px Inter, sans-serif" : "500 13px Inter, sans-serif";
    ctx.fillStyle = sel ? COLOR.textOnAccent : weekend ? COLOR.textDim : COLOR.text;
    ctx.fillText(String(d), cx + cellW / 2, cy + cellH / 2 - 2);
    if (v.busy.has(d)) {
      ctx.fillStyle = sel ? COLOR.textOnAccent : COLOR.accent;
      ctx.fillRect(cx + cellW / 2 - 4, cy + cellH - 6, 8, 2.5);
    }
  }

  ctx.fillStyle = COLOR.titleLine;
  ctx.fillRect(0, h - 22, w, 1);
  ctx.font = FONT.small;
  ctx.textAlign = "left";
  ctx.fillStyle = v.footer ? COLOR.text : COLOR.textDim;
  let footer = v.footer;
  if (ctx.measureText(footer).width > w - 16) {
    let n = footer.length;
    while (n > 1 && ctx.measureText(footer.slice(0, n) + "…").width > w - 16) n--;
    footer = footer.slice(0, n) + "…";
  }
  ctx.fillText(footer, 8, h - 11);
  return false;
}
