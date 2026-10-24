// Reading text on the screen (Notes, calendar event details): word-wrapped
// lines, scrolled line by line with the wheel.
import { COLOR, FONT } from "./theme";

export const TEXT_LINE_H = 19;
const PAD = 10;

/** Wraps paragraphs to the width; long words are broken. */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const out: string[] = [];
  for (const para of text.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n")) {
    if (!para.trim()) {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of para.split(/(\s+)/)) {
      if (!word) continue;
      const next = line + word;
      if (ctx.measureText(next).width <= width) {
        line = next;
        continue;
      }
      if (line.trim()) out.push(line.trimEnd());
      line = /^\s+$/.test(word) ? "" : word;
      // A word wider than the line: cut it.
      while (ctx.measureText(line).width > width && line.length > 1) {
        let n = line.length - 1;
        while (n > 1 && ctx.measureText(line.slice(0, n)).width > width) n--;
        out.push(line.slice(0, n));
        line = line.slice(n);
      }
    }
    out.push(line.trimEnd());
  }
  while (out.length && !out[out.length - 1]) out.pop();
  return out;
}

export interface TextPage {
  /** Optional bold heading lines on top (event title). */
  heading?: string;
  text: string;
  /** First visible line; clamped by the draw. */
  scroll: number;
}

interface Cache {
  key: string;
  lines: { text: string; bold: boolean }[];
}
const cache = new WeakMap<TextPage, Cache>();

/** Draws the page; returns the number of lines that can still scroll (for clamping). */
export function drawTextPage(ctx: CanvasRenderingContext2D, w: number, h: number, page: TextPage): number {
  const width = w - 2 * PAD - 8;
  const key = `${w}|${page.heading ?? ""}|${page.text}`;
  let c = cache.get(page);
  if (!c || c.key !== key) {
    const lines: Cache["lines"] = [];
    if (page.heading) {
      ctx.font = FONT.title.replace("13px", "15px");
      for (const l of wrapText(ctx, page.heading, width)) lines.push({ text: l, bold: true });
      lines.push({ text: "", bold: false });
    }
    ctx.font = FONT.value;
    for (const l of wrapText(ctx, page.text, width)) lines.push({ text: l, bold: false });
    c = { key, lines };
    cache.set(page, c);
  }
  const rows = Math.floor((h - 8) / TEXT_LINE_H);
  const maxScroll = Math.max(0, c.lines.length - rows);
  page.scroll = Math.max(0, Math.min(maxScroll, page.scroll));
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  for (let i = 0; i < rows && page.scroll + i < c.lines.length; i++) {
    const l = c.lines[page.scroll + i];
    ctx.font = l.bold ? FONT.title.replace("13px", "15px") : FONT.value;
    ctx.fillStyle = COLOR.text;
    ctx.fillText(l.text, PAD, 4 + TEXT_LINE_H * i + TEXT_LINE_H / 2);
  }
  if (maxScroll > 0) {
    // Scroll bar.
    const trackH = h - 8;
    const thumbH = Math.max(18, (trackH * rows) / c.lines.length);
    const y = 4 + ((trackH - thumbH) * page.scroll) / maxScroll;
    ctx.fillStyle = COLOR.scrollTrack;
    ctx.fillRect(w - 7, 4, 4, trackH);
    ctx.fillStyle = COLOR.scrollThumb;
    ctx.fillRect(w - 7, y, 4, thumbH);
  }
  return maxScroll;
}
