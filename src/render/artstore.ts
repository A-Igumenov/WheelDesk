// Loads album artwork on demand (one image per album), at most two at a time,
// and asks for a redraw when an image arrives.
import { albumKeyOf, type Track } from "../core/library";

type Entry = HTMLImageElement | null | "loading";

export class ArtStore {
  private entries = new Map<string, Entry>();
  private waiting: Track[] = [];
  private running = 0;

  constructor(
    private readonly loader: (t: Track) => Promise<string | null>,
    private readonly onLoad: () => void,
    private readonly concurrency = 2,
  ) {}

  get(t: Track): CanvasImageSource | null {
    const key = albumKeyOf(t);
    const e = this.entries.get(key);
    if (e === undefined) {
      this.entries.set(key, "loading");
      this.waiting.push(t);
      this.pump();
      return null;
    }
    return e instanceof HTMLImageElement ? e : null;
  }

  /** Remote fallback waits until the local file/folder lookup has completed. */
  settled(t: Track): boolean {
    const key = albumKeyOf(t);
    return this.entries.has(key) && this.entries.get(key) !== "loading";
  }

  /** Forget everything (new library). */
  clear(): void {
    this.entries.clear();
    this.waiting = [];
  }

  private pump(): void {
    while (this.running < this.concurrency && this.waiting.length) {
      // Newest request first: what is on screen now matters most.
      const t = this.waiting.pop()!;
      const key = albumKeyOf(t);
      this.running++;
      this.loader(t)
        .then((url) => (url ? decode(url) : null))
        .catch(() => null)
        .then((img) => {
          this.entries.set(key, img);
          if (img) this.onLoad();
        })
        .finally(() => {
          this.running--;
          this.pump();
        });
    }
  }
}

function decode(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
