export interface OpenArtwork {
  imageUrl: string;
  sourceUrl: string;
  artist: string;
  credit: string;
  license: string;
  licenseUrl: string;
  album: string;
  releaseDate: string;
  releaseUrl: string;
}
const keyOf = (artist: string, title: string) => `${artist.trim().toLowerCase()}\u001f${title.trim().toLowerCase()}`;

/** Bounded on-screen lookup queue. It never crawls the library in the background. */
export class OpenArtworkStore {
  private entries = new Map<string, OpenArtwork | null | "loading">();
  private waiting: { key: string; artist: string; title: string }[] = [];
  private running = 0;
  constructor(private loader: (artist: string, title: string) => Promise<OpenArtwork | null>, private redraw: () => void) {}
  get(artist: string, title: string): OpenArtwork | null {
    if (!artist.trim() || !title.trim()) return null;
    const key = keyOf(artist, title);
    if (!this.entries.has(key)) {
      this.entries.set(key, "loading");
      this.waiting.push({ key, artist, title });
      if (this.waiting.length > 16) this.entries.delete(this.waiting.shift()!.key);
      this.pump();
    }
    return this.peek(artist, title);
  }
  peek(artist: string, title: string): OpenArtwork | null {
    const value = this.entries.get(keyOf(artist, title));
    return value && value !== "loading" ? value : null;
  }
  credits(): OpenArtwork[] {
    return [...this.entries.values()].filter((v): v is OpenArtwork => !!v && v !== "loading");
  }
  private pump(): void {
    while (this.running < 2 && this.waiting.length) {
      const job = this.waiting.pop()!;
      this.running++;
      this.loader(job.artist, job.title).catch(() => null).then((result) => {
        this.entries.set(job.key, result);
        while (this.entries.size > 128) {
          const evict = [...this.entries].find(([key, v]) => key !== job.key && v !== "loading");
          if (!evict) break;
          this.entries.delete(evict[0]);
        }
        this.redraw();
      }).finally(() => { this.running--; this.pump(); });
    }
  }
}
export function artworkInfo(art: OpenArtwork): string {
  return `${art.album} (${art.releaseDate})\nMusicBrainz: ${art.releaseUrl}\n\n${art.artist}\n${art.credit}\n${art.license}\n${art.licenseUrl}\nWikimedia Commons: ${art.sourceUrl}\n\nOriginal file unchanged; displayed resized/cropped. Earliest known official album in available MusicBrainz recording data; not a guarantee of a complete historical discography.`;
}
