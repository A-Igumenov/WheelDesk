// Stopwatch screen: total time large, current lap below, last laps listed.
import { formatStopwatch } from "../core/stopwatch";
import { COLOR, FONT } from "./theme";

export interface StopwatchView {
  elapsed: number;
  lap: number;
  laps: number[];
  running: boolean;
  lapLabel: string;
  hint: string;
}

export function drawStopwatch(ctx: CanvasRenderingContext2D, w: number, h: number, v: StopwatchView): boolean {
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  ctx.font = "700 44px Inter, sans-serif";
  ctx.fillStyle = v.running ? COLOR.text : COLOR.textDim;
  ctx.fillText(formatStopwatch(v.elapsed), w / 2, 40);

  ctx.font = FONT.value;
  ctx.fillStyle = COLOR.accent;
  ctx.fillText(`${v.lapLabel} ${v.laps.length + 1}   ${formatStopwatch(v.lap)}`, w / 2, 78);

  // Previous laps, newest first, in a ruled list.
  const top = 96;
  const rowH = 19;
  const rows = Math.floor((h - top - 26) / rowH);
  ctx.font = FONT.small;
  for (let i = 0; i < Math.min(rows, v.laps.length); i++) {
    const n = v.laps.length - i;
    const y = top + i * rowH + rowH / 2;
    if (i % 2 === 0) {
      ctx.fillStyle = "rgba(0,0,0,0.035)";
      ctx.fillRect(16, y - rowH / 2, w - 32, rowH);
    }
    ctx.fillStyle = COLOR.textDim;
    ctx.textAlign = "left";
    ctx.fillText(`${v.lapLabel} ${n}`, 24, y);
    ctx.fillStyle = COLOR.text;
    ctx.textAlign = "right";
    ctx.fillText(formatStopwatch(v.laps[n - 1]), w - 24, y);
  }

  ctx.fillStyle = COLOR.textDim;
  ctx.textAlign = "center";
  ctx.font = FONT.small;
  ctx.fillText(v.hint, w / 2, h - 12);
  return v.running;
}
