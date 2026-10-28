import { describe, expect, it } from "vitest";
import { Library, compareNames, formatTime, shuffled, shuffledByAlbum, type Track } from "./library";

const t = (title: string, album: string, trackNo: number, discNo = 1, artist = "A"): Track => ({
  path: `/${album}/${discNo}-${trackNo}`, title, artist, albumArtist: "", album, genre: "", composer: "",
  trackNo, discNo, year: 0, durationMs: 1000, compilation: false,
});

describe("library", () => {
  it("sorts naturally and ignores a leading 'The'", () => {
    const names = ["The Zoo", "track 10", "Apple", "track 2"].sort(compareNames);
    expect(names).toEqual(["Apple", "track 2", "track 10", "The Zoo"]);
  });

  it("orders album tracks by disc then track", () => {
    const lib = new Library([t("b", "X", 1, 2), t("c", "X", 2, 1), t("a", "X", 1, 1)]);
    expect(lib.albums()[0].tracks.map((x) => x.title)).toEqual(["a", "c", "b"]);
  });

  it("keeps compilations together across artists", () => {
    const a = { ...t("one", "Hits", 1, 1, "P"), compilation: true };
    const b = { ...t("two", "Hits", 2, 1, "Q"), compilation: true };
    const lib = new Library([a, b]);
    expect(lib.albums()).toHaveLength(1);
    expect(lib.compilations()).toHaveLength(1);
  });

  it("shuffles without losing songs and can force the first one", () => {
    const items = [1, 2, 3, 4, 5, 6];
    const s = shuffled(items, 4);
    expect(s[0]).toBe(4);
    expect([...s].sort()).toEqual(items);
  });

  it("album shuffle keeps album order and starts at the chosen song", () => {
    const tracks = [t("a1", "A", 1), t("a2", "A", 2), t("b1", "B", 1), t("b2", "B", 2)];
    const q = shuffledByAlbum(tracks, tracks[1]);
    expect(q.map((x) => x.title).slice(0, 3)).toEqual(["a2", "b1", "b2"]);
    expect(q).toHaveLength(4);
  });

  it("formats times", () => {
    expect(formatTime(65_000)).toBe("1:05");
    expect(formatTime(3_725_000)).toBe("1:02:05");
  });
});

import { fold, matches, searchLibrary } from "./search";

describe("search", () => {
  it("ignores case and accents and matches word starts", () => {
    expect(fold("Žalgiris Ёлка")).toBe("zalgiris елка");
    expect(matches("jur neb", "Jurga – Nebijok")).toBe(true);
    expect(matches("zal", "Žalgiris")).toBe(true);
    expect(matches("кор", "Наташа Королёва")).toBe(true);
    expect(matches("ога", "Наташа Королёва")).toBe(false);
    expect(matches("", "anything")).toBe(false);
  });

  it("finds artists, albums and songs", () => {
    const lib = new Library([t("Nebijok", "Laiškai", 1, 1, "Jurga"), t("Kitas", "Laiškai", 2, 1, "Jurga"), t("Jura", "Jūra", 1, 1, "B")]);
    const r = searchLibrary(lib, "JUR");
    expect(r.artists.map((a) => a.name)).toEqual(["Jurga"]);
    expect(r.albums.map((a) => a.name)).toEqual(["Jūra", "Laiškai"]);
    expect(r.songs.map((s) => s.title)).toEqual(["Jura", "Kitas", "Nebijok"]);
  });
});

import { formatStopwatch, Stopwatch } from "./stopwatch";

describe("stopwatch", () => {
  it("runs, laps, stops and resets into a log", () => {
    let now = 0;
    const sw = new Stopwatch(() => now, () => 1_700_000_000_000);
    expect(sw.isReset).toBe(true);
    sw.toggle();
    now = 1500;
    sw.lap();
    now = 4000;
    expect(sw.currentLap()).toBe(2500);
    sw.toggle(); // stop
    now = 9000; // time passes while stopped
    expect(sw.elapsed()).toBe(4000);
    expect(sw.reset()).toEqual({ started: 1_700_000_000_000, laps: [1500, 2500] });
    expect(sw.isReset).toBe(true);
    expect(sw.reset()).toBeNull();
  });

  it("formats hundredths", () => {
    expect(formatStopwatch(62_345)).toBe("1:02.34");
    expect(formatStopwatch(3_723_450)).toBe("1:02:03.45");
  });
});

import { cityName, formatOffset, zonedTime } from "./clocks";

describe("clocks", () => {
  it("gives wall-clock time in another zone", () => {
    const t = zonedTime("Asia/Tokyo", Date.UTC(2026, 9, 18, 12, 30, 15));
    expect([t.hours, t.minutes, t.seconds, t.day]).toEqual([21, 30, 15, 18]);
    expect(cityName("America/New_York")).toBe("New York");
    expect(cityName("Etc/Somewhere_Else")).toBe("Somewhere Else");
    expect(formatOffset(-330)).toBe("−5:30");
    expect(formatOffset(120)).toBe("+2");
  });
});

import { afterFiring, dueAlarms, newAlarm } from "./alarms";

describe("alarms", () => {
  it("go off once in their minute and follow the repeat rule", () => {
    const a = { ...newAlarm(1), hour: 7, minute: 30, repeat: "weekdays" as const };
    const monday = new Date(2026, 9, 19, 7, 30, 10);
    const saturday = new Date(2026, 9, 24, 7, 30, 10);
    expect(dueAlarms([a], monday)).toHaveLength(1);
    expect(dueAlarms([a], saturday)).toHaveLength(0);
    const fired = afterFiring(a, monday);
    expect(dueAlarms([fired], new Date(2026, 9, 19, 7, 30, 40))).toHaveLength(0);
    expect(fired.on).toBe(true);
    expect(afterFiring({ ...a, repeat: "once" }, monday).on).toBe(false);
  });

  it("new alarms start at the next quarter hour", () => {
    const n = newAlarm(1, new Date(2026, 0, 1, 23, 50));
    expect([n.hour, n.minute]).toEqual([0, 0]);
  });
});
