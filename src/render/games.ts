// Drawing for Extras → Games.
import type { BrickGame } from "../core/games/brick";
import { COLOR, FONT } from "./theme";

const ROW_COLORS = ["#c0392b", "#d35400", "#c9a227", "#27ae60", "#2a5bd7"];

function centreText(ctx: CanvasRenderingContext2D, text: string, w: number, y: number, font: string, color: string): void {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, y);
}

export function drawBrick(
  ctx: CanvasRenderingContext2D, w: number, h: number, g: BrickGame,
  text: { score: string; lives: string; level: string; ready: string; paused: string; lost: string; won: string },
): void {
  ctx.fillStyle = "#15171a";
  ctx.fillRect(0, 0, w, h);
  // Status line.
  ctx.font = FONT.small;
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#d9dadc";
  ctx.textAlign = "left";
  ctx.fillText(`${text.score} ${g.score}`, 6, 10);
  ctx.textAlign = "center";
  ctx.fillText(`${text.level} ${g.level}`, w / 2, 10);
  ctx.textAlign = "right";
  ctx.fillText(`${text.lives} ${Math.max(0, g.lives)}`, w - 6, 10);

  for (const b of g.bricks) {
    if (!b.alive) continue;
    ctx.fillStyle = ROW_COLORS[b.row % ROW_COLORS.length];
    ctx.beginPath();
    const c = 3;
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x + b.w - c, b.y);
    ctx.lineTo(b.x + b.w, b.y + c);
    ctx.lineTo(b.x + b.w, b.y + b.h);
    ctx.lineTo(b.x, b.y + b.h);
    ctx.closePath();
    ctx.fill();
  }
  // Paddle with chamfered ends.
  ctx.fillStyle = "#e8e9eb";
  ctx.beginPath();
  ctx.moveTo(g.paddleX + 4, g.paddleY);
  ctx.lineTo(g.paddleX + g.paddleW - 4, g.paddleY);
  ctx.lineTo(g.paddleX + g.paddleW, g.paddleY + 4);
  ctx.lineTo(g.paddleX + g.paddleW, g.paddleY + 7);
  ctx.lineTo(g.paddleX, g.paddleY + 7);
  ctx.lineTo(g.paddleX, g.paddleY + 4);
  ctx.closePath();
  ctx.fill();
  // Ball: a small diamond.
  const b = g.ball;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(b.x, b.y - b.r - 1);
  ctx.lineTo(b.x + b.r + 1, b.y);
  ctx.lineTo(b.x, b.y + b.r + 1);
  ctx.lineTo(b.x - b.r - 1, b.y);
  ctx.closePath();
  ctx.fill();

  const msg = { ready: text.ready, paused: text.paused, lost: text.lost, won: text.won, playing: "" }[g.phase];
  if (msg) {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, h / 2 + 8, w, 30);
    centreText(ctx, msg, w, h / 2 + 23, FONT.value, "#ffffff");
  }
}

export interface QuizView {
  question: string;
  round: string;
  options: string[];
  selected: number;
  /** Answer shown: index of the right option and of the chosen one. */
  reveal: { right: number; chosen: number } | null;
  /** 0–1 time left. */
  timeLeft: number;
  score: string;
  /** Final screen text instead of a question. */
  result: string[] | null;
}

export function drawQuiz(ctx: CanvasRenderingContext2D, w: number, h: number, v: QuizView): void {
  if (v.result) {
    v.result.forEach((line, i) =>
      centreText(ctx, line, w, h / 2 - 30 + i * 28, i === 1 ? "700 28px Inter, sans-serif" : FONT.value, i === 1 ? COLOR.accent : COLOR.text),
    );
    return;
  }
  ctx.font = FONT.small;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = COLOR.textDim;
  ctx.fillText(v.round, 10, 12);
  ctx.textAlign = "right";
  ctx.fillText(v.score, w - 10, 12);
  centreText(ctx, v.question, w, 34, FONT.value, COLOR.text);
  // Time bar.
  ctx.fillStyle = COLOR.scrollTrack;
  ctx.fillRect(10, 50, w - 20, 6);
  ctx.fillStyle = v.timeLeft > 0.3 ? COLOR.accent : "#c0392b";
  ctx.fillRect(10, 50, (w - 20) * Math.max(0, v.timeLeft), 6);

  const rowH = 32;
  v.options.forEach((o, i) => {
    const y = 66 + i * (rowH + 4);
    let bg: string = i === v.selected ? COLOR.accent : "#ffffff";
    let fg: string = i === v.selected ? COLOR.textOnAccent : COLOR.text;
    if (v.reveal) {
      if (i === v.reveal.right) {
        bg = "#2e8b57";
        fg = "#ffffff";
      } else if (i === v.reveal.chosen) {
        bg = "#c0392b";
        fg = "#ffffff";
      } else {
        bg = "#ffffff";
        fg = COLOR.textDim;
      }
    }
    const c = 6;
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(10, y);
    ctx.lineTo(w - 10 - c, y);
    ctx.lineTo(w - 10, y + c);
    ctx.lineTo(w - 10, y + rowH);
    ctx.lineTo(10, y + rowH);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = COLOR.titleLine;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = FONT.value;
    ctx.fillStyle = fg;
    ctx.textAlign = "left";
    let text = o;
    if (ctx.measureText(text).width > w - 40) {
      let n = text.length;
      while (n > 1 && ctx.measureText(text.slice(0, n) + "…").width > w - 40) n--;
      text = text.slice(0, n) + "…";
    }
    ctx.fillText(text, 20, y + rowH / 2 + 1);
  });
}
