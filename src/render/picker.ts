// Digit fields set with the wheel: alarm time (HH:MM) and the screen-lock
// combination (four digits). The selected field is the accent box.
import { COLOR, FONT } from "./theme";

export interface PickerView {
  fields: string[];
  index: number;
  /** Text between fields (":" for time, "" for a combination). */
  separator: string;
  /** Hide entered digits (combination). */
  masked?: boolean;
  caption: string;
  hint: string;
  /** Red message under the fields (wrong combination). */
  error?: string;
  /** Lock icon above the fields. */
  lock?: boolean;
}

export function drawPicker(ctx: CanvasRenderingContext2D, w: number, h: number, v: PickerView): boolean {
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  let top = 30;
  if (v.lock) {
    // Angular padlock.
    const cx = w / 2;
    ctx.strokeStyle = COLOR.textDim;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx - 11, 32);
    ctx.lineTo(cx - 11, 20);
    ctx.lineTo(cx - 6, 14);
    ctx.lineTo(cx + 6, 14);
    ctx.lineTo(cx + 11, 20);
    ctx.lineTo(cx + 11, 32);
    ctx.stroke();
    ctx.fillStyle = COLOR.textDim;
    ctx.fillRect(cx - 17, 32, 34, 24);
    ctx.fillStyle = COLOR.screenBg;
    ctx.fillRect(cx - 2, 40, 4, 9);
    top = 68;
  }
  ctx.font = FONT.value;
  ctx.fillStyle = COLOR.text;
  ctx.fillText(v.caption, w / 2, top);

  const boxW = 46;
  const boxH = 56;
  const sepW = v.separator ? 18 : 10;
  const total = v.fields.length * boxW + (v.fields.length - 1) * sepW;
  let x = (w - total) / 2;
  const y = top + 18;
  ctx.font = "700 32px Inter, sans-serif";
  v.fields.forEach((f, i) => {
    const sel = i === v.index;
    const c = 8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + boxW - c, y);
    ctx.lineTo(x + boxW, y + c);
    ctx.lineTo(x + boxW, y + boxH);
    ctx.lineTo(x, y + boxH);
    ctx.closePath();
    ctx.fillStyle = sel ? COLOR.accent : "#ffffff";
    ctx.fill();
    ctx.strokeStyle = sel ? COLOR.accentDark : COLOR.titleLine;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = sel ? COLOR.textOnAccent : COLOR.text;
    const text = v.masked && i < v.index ? "•" : f;
    ctx.fillText(text, x + boxW / 2, y + boxH / 2 + 1);
    x += boxW;
    if (i < v.fields.length - 1) {
      ctx.fillStyle = COLOR.text;
      if (v.separator) ctx.fillText(v.separator, x + sepW / 2, y + boxH / 2 - 2);
      x += sepW;
    }
  });

  if (v.error) {
    ctx.font = FONT.small;
    ctx.fillStyle = "#b3261e";
    ctx.fillText(v.error, w / 2, y + boxH + 18);
  }
  ctx.font = FONT.small;
  ctx.fillStyle = COLOR.textDim;
  ctx.fillText(v.hint, w / 2, h - 14);
  return false;
}
