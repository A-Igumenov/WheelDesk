import { afterEach, describe, expect, it } from "vitest";
import { afterFiring, dueAlarms, newAlarm, type AlarmRepeat } from "./alarms";
import { bandLabel, eqGains, EQ_BANDS, EQ_PRESETS, normalizeCurve } from "./eq";
import { cityName, formatOffset, zonedTime } from "./clocks";
import { formatHM, formatTime, isClock24, setClock24 } from "./timefmt";
import { formatStopwatch, Stopwatch } from "./stopwatch";
import { Library, type Track } from "./library";
import { resultCount, searchLibrary } from "./search";

afterEach(() => setClock24(true));

describe("alarm calendar boundaries", () => {
  it.each([
    ["weekdays", 23, true], ["weekdays", 24, false], ["weekdays", 25, false],
    ["weekends", 23, false], ["weekends", 24, true], ["weekends", 25, true],
    ["daily", 24, true], ["once", 25, true],
  ] as [AlarmRepeat, number, boolean][])("%s on October %s is due: %s", (repeat, day, expected) => {
    const now = new Date(2026, 9, day, 8, 15, 32);
    const alarm = { ...newAlarm(1, now), hour: 8, minute: 15, repeat };
    expect(dueAlarms([alarm], now).length > 0).toBe(expected);
    expect(dueAlarms([{ ...alarm, on: false }], now)).toEqual([]);
    expect(dueAlarms([alarm], new Date(2026, 9, day, 8, 16))).toEqual([]);
  });
  it("fires daily again next day but never twice in the same minute", () => {
    const now = new Date(2026, 9, 24, 9, 0);
    const alarm = { ...newAlarm(1, now), hour: 9, minute: 0, repeat: "daily" as const };
    const fired = afterFiring(alarm, now);
    expect(alarm.lastFired).toBe(0);
    expect(dueAlarms([fired], new Date(2026, 9, 24, 9, 0, 59))).toEqual([]);
    expect(dueAlarms([fired], new Date(2026, 9, 25, 9, 0))).toEqual([fired]);
    expect(afterFiring({ ...alarm, repeat: "once" }, now).on).toBe(false);
  });
  it("rounds a new alarm across midnight", () => {
    expect(newAlarm(7, new Date(2026, 9, 24, 23, 59))).toMatchObject({ id: 7, hour: 0, minute: 0 });
  });
});

describe("EQ input safety", () => {
  it("normalizes missing, non-finite, excessive and short custom curves", () => {
    expect(normalizeCurve([Infinity, NaN, 99, -99, 2])).toEqual([0, 0, 12, -12, 2, 0, 0, 0, 0, 0]);
    expect(eqGains("Custom", undefined)).toEqual(Array(10).fill(0));
    expect(eqGains("unknown", [12])).toEqual(Array(10).fill(0));
  });
  it.each(EQ_PRESETS)("%s is a bounded ten-band curve and callers cannot mutate the preset", (preset) => {
    const first = eqGains(preset, undefined); const snapshot = [...first];
    expect(first).toHaveLength(EQ_BANDS.length);
    expect(first.every((x) => Number.isFinite(x) && Math.abs(x) <= 12)).toBe(true);
    first[0] = 100;
    expect(eqGains(preset, undefined)).toEqual(snapshot);
  });
  it("labels frequency units", () => {
    expect([32, 500, 1000, 16000].map(bandLabel)).toEqual(["32", "500", "1k", "16k"]);
  });
});

describe("clock and stopwatch edge cases", () => {
  it("handles midnight, noon and shared time format", () => {
    expect(formatHM(0, 5, false)).toBe("12:05 AM"); expect(formatHM(12, 5, false)).toBe("12:05 PM");
    setClock24(false); expect(isClock24()).toBe(false);
    expect(formatTime(new Date(2026, 9, 24, 23, 9))).toBe("11:09 PM");
    expect(formatHM(0, 5, true)).toBe("00:05");
  });
  it("uses the IANA DST transition independently of the host timezone", () => {
    expect(zonedTime("Europe/Vilnius", Date.parse("2026-10-25T00:59:00Z"))).toMatchObject({ hours: 3, minutes: 59, day: 25 });
    expect(zonedTime("Europe/Vilnius", Date.parse("2026-10-25T01:00:00Z"))).toMatchObject({ hours: 3, minutes: 0, day: 25 });
    expect(zonedTime("Asia/Kolkata", Date.parse("2026-01-01T00:00:00Z"))).toMatchObject({ hours: 5, minutes: 30 });
    expect(formatOffset(330)).toBe("+5:30"); expect(formatOffset(-210)).toBe("−3:30");
    expect(formatOffset(0)).toBe("±0"); expect(cityName("America/Port_of_Spain")).toBe("Port of Spain");
  });
  it("excludes paused time, preserves session start and isolates returned logs", () => {
    let now = 0; const sw = new Stopwatch(() => now, () => 1234);
    expect(sw.reset()).toBeNull(); sw.lap(); expect(sw.laps).toEqual([]);
    sw.toggle(); now = 1000; sw.lap(); expect(sw.reset()).toBeNull();
    now = 1500; sw.toggle(); now = 10_000; expect(sw.elapsed()).toBe(1500);
    sw.toggle(); now = 10_500; sw.toggle();
    const log = sw.reset()!; expect(log).toEqual({ started: 1234, laps: [1000, 1000] });
    expect(sw.isReset).toBe(true); log.laps.push(99); expect(sw.laps).toEqual([]);
    expect(formatStopwatch(-10)).toBe("0:00.00"); expect(formatStopwatch(3_723_450)).toBe("1:02:03.45");
  });
});

describe("search result bounds", () => {
  it("limits each category, rejects empty queries and does not invent transliteration", () => {
    const tracks: Track[] = Array.from({ length: 5 }, (_, i) => ({
      path: `/${i}`, title: `Jurga ${i}`, artist: `Jurga ${i}`, albumArtist: "", album: `Jurga ${i}`,
      genre: "", composer: "", trackNo: 1, discNo: 1, year: 0, durationMs: 1000, compilation: false,
    }));
    const lib = new Library(tracks); const result = searchLibrary(lib, "jur", 2);
    expect([result.artists.length, result.albums.length, result.songs.length]).toEqual([2, 2, 2]);
    expect(resultCount(result)).toBe(6); expect(resultCount(searchLibrary(lib, "  "))).toBe(0);
    expect(resultCount(searchLibrary(lib, "Юрга"))).toBe(0);
  });
});
