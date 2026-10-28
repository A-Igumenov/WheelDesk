// Volume Limit screen: the highest volume allowed, set with the wheel.
import { drawVolume } from "./nowplaying";
import { COLOR, FONT } from "./theme";

export function drawVolumeLimit(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  v: { limit: number; caption: string; hint: string; locked: boolean },
): boolean {
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.font = FONT.value;
  ctx.fillStyle = COLOR.text;
  ctx.fillText(v.caption, w / 2, 40);
  ctx.font = "700 32px Inter, sans-serif";
  ctx.fillText(v.limit >= 1 ? "100%" : `${Math.round(v.limit * 100)}%`, w / 2, 86);
  drawVolume(ctx, 16, 128, w - 32, v.limit, false, 1);
  if (v.locked) {
    // Small angular padlock under the bar.
    const cx = w / 2;
    ctx.strokeStyle = COLOR.textDim;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx - 6, 160);
    ctx.lineTo(cx - 6, 154);
    ctx.lineTo(cx - 3, 151);
    ctx.lineTo(cx + 3, 151);
    ctx.lineTo(cx + 6, 154);
    ctx.lineTo(cx + 6, 160);
    ctx.stroke();
    ctx.fillStyle = COLOR.textDim;
    ctx.fillRect(cx - 9, 160, 18, 13);
  }
  ctx.font = FONT.small;
  ctx.fillStyle = COLOR.textDim;
  ctx.fillText(v.hint, w / 2, h - 14);
  return false;
}
