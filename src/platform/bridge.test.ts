import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS, inTauri, listVolumes, loadSettings, resolveLibrarySource, saveSettings } from "./bridge";

const entries = new Map<string, string>();
beforeEach(() => {
  entries.clear();
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("browser demo persistence", () => {
  it("uses demo mode and defaults when there is no saved configuration", async () => {
    expect(inTauri()).toBe(false); expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(await resolveLibrarySource()).toBeNull();
  });
  it("round-trips resume, lock, EQ and library source", async () => {
    const settings = { ...DEFAULT_SETTINGS, language: "lt" as const, locked: true, lockCode: "1234",
      eqCustom: [1, 2, 3, 4, 5, 0, -1, -2, -3, -4],
      librarySource: { volumeId: "demo-usb", relativePath: "Music/Albums" },
      resume: { kind: "tracks" as const, paths: ["/music/A.mp3"], index: 0, positionMs: 12345, playing: false } };
    await saveSettings(settings); expect(await loadSettings()).toEqual(settings);
    expect((await resolveLibrarySource())?.path).toContain("Music/Albums");
  });
  it("merges older configurations with new defaults and tolerates corrupt data", async () => {
    entries.set("wheeldesk.settings", '{"language":"ru"}');
    expect(await loadSettings()).toMatchObject({ language: "ru", crossfade: false, resume: null });
    entries.set("wheeldesk.settings", "{broken"); expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
  it("survives unavailable browser storage", async () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("quota"); } });
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
    await expect(saveSettings(DEFAULT_SETTINGS)).resolves.toBeUndefined();
  });
  it("resolves only available demo volumes", async () => {
    const volumes = await listVolumes(); expect(volumes.some((v) => v.kind === "removable")).toBe(true);
    expect(await resolveLibrarySource({ volumeId: "gone", relativePath: "Music" })).toBeNull();
  });
});
