import { describe, it, expect, vi } from "vitest";
import { OpenArtworkStore, artworkInfo, type OpenArtwork } from "./openart";
const art: OpenArtwork = { imageUrl: "https://upload.wikimedia.org/cover.jpg", sourceUrl: "https://commons.wikimedia.org/wiki/File:Cover.jpg", artist: "Artist", credit: "Cover creator", license: "CC-BY-SA-4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/", album: "Debut", releaseDate: "1970", releaseUrl: "https://musicbrainz.org/release-group/123" };
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
describe("libre original album artwork", () => {
  it("deduplicates lookups, retains attribution and redraws", async () => {
    const load = vi.fn(async () => art), redraw = vi.fn();
    const store = new OpenArtworkStore(load, redraw);
    expect(store.get(" Artist ", "Song")).toBeNull(); store.get("artist", "song");
    await flush(); expect(load).toHaveBeenCalledOnce(); expect(store.peek("artist", "song")).toBe(art); expect(redraw).toHaveBeenCalledOnce();
    expect(artworkInfo(art)).toContain(art.sourceUrl); expect(artworkInfo(art)).toContain(art.licenseUrl); expect(artworkInfo(art)).toContain("Cover creator");
  });
  it("keeps playback-facing lookups safe on failure and missing metadata", async () => {
    const load = vi.fn(async () => { throw new Error("offline"); });
    const store = new OpenArtworkStore(load, () => {});
    store.get("", "Song"); expect(load).not.toHaveBeenCalled();
    store.get("Artist", "Song"); await flush(); expect(store.get("Artist", "Song")).toBeNull(); expect(load).toHaveBeenCalledOnce();
  });
  it("limits concurrent requests to two and continues the queue", async () => {
    const done: ((a: OpenArtwork | null) => void)[] = [];
    const load = vi.fn(() => new Promise<OpenArtwork | null>((resolve) => done.push(resolve)));
    const store = new OpenArtworkStore(load, () => {});
    for (const title of ["a", "b", "c", "d"]) store.get("Artist", title);
    expect(load).toHaveBeenCalledTimes(2); done[0](null); await flush(); expect(load).toHaveBeenCalledTimes(3);
    done[1](null); await flush(); expect(load).toHaveBeenCalledTimes(4); done[2](null); done[3](null); await flush();
  });
  it("does not reuse another song's original album", async () => {
    const load = vi.fn(async (_artist: string, title: string) => ({ ...art, album: title }));
    const store = new OpenArtworkStore(load, () => {}); store.get("Artist", "First");store.get("Artist", "Second");await flush();
    expect(store.peek("Artist", "First")!.album).toBe("First");expect(store.peek("Artist", "Second")!.album).toBe("Second");
  });
});
