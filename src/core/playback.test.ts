import { beforeEach, describe, expect, it, vi } from "vitest";
import { Playback, splitStreamTitle, VOLUME_STEP } from "./playback";
import type { Track } from "./library";
import { playerCmd, playerLoad, type Station } from "../platform/bridge";

vi.mock("../platform/bridge", () => ({ playerCmd: vi.fn(), playerLoad: vi.fn() }));

const track = (name: string): Track => ({
  path: `/music/${name}.mp3`, title: name, artist: "Artist", albumArtist: "Artist", album: "Album",
  genre: "Rock", composer: "", trackNo: 1, discNo: 1, year: 2026, durationMs: 180_000,
  compilation: false, gainDb: -3,
});
const station = (slug: string, streamUrl: string | null = null): Station => ({
  slug, name: slug, country: "Lietuva", countryCode: "LT", genre: "", description: "", pageUrl: "", streamUrl, image: null,
});

beforeEach(() => vi.clearAllMocks());

describe("playback transport and resume", () => {
  it("ignores empty queues and transport before a queue exists", () => {
    const p = new Playback();
    p.playList([], 0, "off"); p.restore([], 0, 100, true); p.shuffleAll([]);
    p.toggle(); p.next(); p.prev(); p.seekBy(100);
    expect(p.hasQueue).toBe(false);
    expect(playerLoad).not.toHaveBeenCalled(); expect(playerCmd).not.toHaveBeenCalled();
  });

  it("restores the selected song, paused state, position and gain without reordering", () => {
    const queue = [track("A"), track("B")];
    const p = new Playback();
    p.restore(queue, 1, 42_000, false);
    expect(p.current).toEqual(queue[1]);
    expect(p.state).toMatchObject({ positionMs: 42_000, playing: false, index: 1, queueLen: 2 });
    expect(playerLoad).toHaveBeenCalledWith([
      { path: queue[0].path, durationMs: 180_000, gainDb: -3 },
      { path: queue[1].path, durationMs: 180_000, gainDb: -3 },
    ], 1, false);
    expect(playerCmd).toHaveBeenCalledWith("seekTo", 42_000);
  });

  it.each([-10, 50])("clamps restored index %s to available tracks", (index) => {
    const p = new Playback(); const queue = [track("A"), track("B")];
    p.restore(queue, index, 0, true);
    expect(p.current).toBe(queue[index < 0 ? 0 : 1]);
    expect(playerCmd).not.toHaveBeenCalled();
  });

  it("bounds optimistic seeking and sends relative transport commands", () => {
    const p = new Playback(); p.playList([track("A")], 0, "off");
    p.seekBy(-1000); expect(p.state.positionMs).toBe(0);
    p.seekBy(999_999); expect(p.state.positionMs).toBe(180_000);
    p.next(); p.prev(); p.toggle();
    expect(playerCmd).toHaveBeenCalledWith("next"); expect(playerCmd).toHaveBeenCalledWith("prev");
    expect(p.state.playing).toBe(false);
    vi.mocked(playerCmd).mockClear(); p.pause(); expect(playerCmd).not.toHaveBeenCalled();
    p.toggle(); p.pause(); expect(playerCmd).toHaveBeenLastCalledWith("pause");
  });

  it("starts a preview at its requested offset and forwards Repeat", () => {
    const p = new Playback(); p.preview(track("Quiz"), 15_000); p.setRepeat("one");
    expect(p.state.positionMs).toBe(15_000);
    expect(playerCmd).toHaveBeenCalledWith("seekTo", 15_000);
    expect(playerCmd).toHaveBeenCalledWith("repeat", undefined, "one");
  });

  it("caps current and future volume and quantizes ordinary volume steps", () => {
    const p = new Playback(); p.setVolume(1); p.setLimit(0.4);
    expect(p.state.volume).toBeLessThanOrEqual(0.4);
    expect(p.setVolume(10)).toBe(0.4); expect(p.setVolume(-1)).toBe(0);
    p.setLimit(9); expect(p.setVolume(VOLUME_STEP * 2.1)).toBe(VOLUME_STEP * 2);
    p.setLimit(-1); expect(p.state.volume).toBe(0);
  });
});

describe("radio asynchronous ordering and failure", () => {
  it("does not start a late station after the user has started a local song", async () => {
    let resolve!: (s: Station) => void;
    const p = new Playback(() => new Promise((done) => { resolve = done; }));
    const pending = p.playStation([station("slow")], 0);
    expect(p.state.buffering).toBe(true);
    p.playList([track("Local")], 0, "off");
    resolve(station("slow", "https://example.test/slow")); await pending;
    expect(p.current?.title).toBe("Local"); expect(p.radio).toBeNull();
    expect(playerLoad).toHaveBeenCalledTimes(1);
  });

  it("the latest station wins when lookups finish out of order", async () => {
    const resolvers = new Map<string, (s: Station) => void>();
    const p = new Playback((s) => new Promise((done) => resolvers.set(s.slug, done)));
    const stations = [station("old"), station("new")];
    const old = p.playStation(stations, 0); const latest = p.playStation(stations, 1);
    resolvers.get("new")!(station("new", "https://example.test/new")); await latest;
    resolvers.get("old")!(station("old", "https://example.test/old")); await old;
    expect(p.station?.slug).toBe("new");
    expect(playerLoad).toHaveBeenCalledExactlyOnceWith([{ path: "https://example.test/new", durationMs: 0, stream: true }], 0, true);
  });

  it("reports an unavailable stream and stops buffering after lookup failure", async () => {
    const p = new Playback(async () => { throw new Error("offline"); });
    await p.playStation([station("missing")], 0);
    expect(p.state).toMatchObject({ playing: false, buffering: false, error: "Stream not found" });
    expect(playerLoad).not.toHaveBeenCalled();
  });

  it("wraps station selection and disallows seeking a live stream", async () => {
    const p = new Playback();
    await p.playStation([station("A", "https://example.test/a"), station("B", "https://example.test/b")], -1);
    expect(p.station?.slug).toBe("B"); expect(p.current).toBeNull(); expect(p.hasQueue).toBe(true);
    p.seekBy(3000); expect(playerCmd).not.toHaveBeenCalled();
    p.next(); expect(p.station?.slug).toBe("A");
    p.prev(); expect(p.station?.slug).toBe("B");
  });

  it.each(["A - B", "A – B", "A — B", "A | B"])("extracts metadata from %s", (value) => {
    expect(splitStreamTitle(value)).toEqual({ artist: "A", title: "B" });
  });
  it.each([null, "", "Station", "A - reklama", "A - http://example.test", "A - "])("rejects non-song metadata %s", (value) => {
    expect(splitStreamTitle(value)).toBeNull();
  });
});
