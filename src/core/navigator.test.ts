import { describe, expect, it } from "vitest";
import { Navigator } from "./navigator";
import { buildRoot, type MenuContext } from "./menus";
import { Library, type Track } from "./library";
import { Playback, splitStreamTitle } from "./playback";
import { DEFAULT_SETTINGS, type Settings, type Station } from "../platform/bridge";

const station = (slug: string, name: string, genre: string): Station => ({
  slug, name, genre, description: "", pageUrl: `https://fm.lt/${slug}`, streamUrl: null, image: null,
});

function track(p: Partial<Track> & { title: string }): Track {
  return {
    path: `/m/${p.artist ?? "x"}/${p.album ?? "y"}/${p.title}.mp3`,
    artist: "", albumArtist: "", album: "", genre: "", composer: "",
    trackNo: 0, discNo: 0, year: 0, durationMs: 180000, compilation: false,
    ...p,
  };
}

const TRACKS: Track[] = [
  track({ title: "Second", artist: "The Band", album: "Debut", trackNo: 2, genre: "Rock" }),
  track({ title: "First", artist: "The Band", album: "Debut", trackNo: 1, genre: "Rock" }),
  track({ title: "Alone", artist: "The Band", album: "Later", trackNo: 1, genre: "Rock" }),
  track({ title: "Zebra", artist: "Anna", album: "Solo", trackNo: 1, genre: "Pop", composer: "Anna K." }),
  track({ title: "untagged file" }),
];

const ymd = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

const CATALOG = [
  { country: "LT", st: { ...station("lrt-opus", "LRT Opus", "alternative"), streamUrl: "https://stream.example/opus.mp3" } },
  { country: "LT", st: { ...station("neringa-fm", "Neringa FM", "pop"), streamUrl: "https://stream.example/neringa.mp3" } },
  { country: "DE", st: { ...station("jazz-b", "Jazz Berlin", "jazz"), streamUrl: "https://stream.example/jazz.mp3" } },
];

function makeCtx(over: Partial<MenuContext> = {}): MenuContext {
  const ctx: MenuContext = {
    settings: { ...DEFAULT_SETTINGS },
    volumes: [
      { id: "a", label: "System", mountPoint: "C:\\", kind: "system", totalBytes: 5e11, availableBytes: 1e11 },
      { id: "b", label: "USB", mountPoint: "E:\\", kind: "removable", totalBytes: 6.4e10, availableBytes: 1e10 },
    ],
    library: new Library(TRACKS, 1),
    scan: { active: false, done: 0, total: 0 },
    playback: new Playback(async (s) => ({ ...s, streamUrl: `https://stream.example/${s.slug}.mp3`, description: "Aprašas" })),
    appVersion: "0.2.0",
    art: () => null,
    radioCountries: async (genre) => (genre === "jazz" ? [{ id: "DE", count: 1 }] : [{ id: "LT", count: 2 }, { id: "DE", count: 1 }]),
    radioGenres: async (country) =>
      country === "LT" ? [{ id: "pop", count: 1 }, { id: "alternative", count: 1 }] : [{ id: "pop", count: 1 }, { id: "jazz", count: 1 }, { id: "alternative", count: 1 }],
    radioCatalog: async (f) =>
      CATALOG.filter((c) => (!f.country || c.country === f.country) && (!f.genre || c.st.genre === f.genre)).map((c) => ({ ...c.st })),
    radioStation: async (id) => CATALOG.find((c) => c.st.slug === id)?.st ?? null,
    image: () => null,
    songArt: () => null,
    listPlaylistDir: async (path) =>
      path === "E:\\" ? { dirs: ["Lists"], playlists: ["Top.m3u"] } : { dirs: [], playlists: ["Kelionei.m3u8"] },
    readPlaylist: async (path) => ({
      path,
      name: "Top",
      tracks: [[1, TRACKS[3]]],
      missing: [
        { location: "C:\\x\\First.mp3", fileName: "First.mp3", title: "", artist: "", position: 0 },
        { location: "C:\\x\\gone.mp3", fileName: "gone.mp3", title: "Gone Song", artist: "Nobody", position: 2 },
      ],
    }),
    listDirs: async (path) => (path === "E:\\" ? ["Music", "Backup"] : []),
    listFiles: async (path, exts) =>
      path === "E:\\"
        ? { dirs: ["Docs"], files: exts.includes("ics") ? ["Darbas.ics"] : ["Sveiki.txt"] }
        : { dirs: [], files: ["Kitas.txt"] },
    findFiles: async (path) => [`${path}\\a.jpg`, `${path}\\b.jpg`],
    photoUrl: (p) => p,
    readText: async (path) =>
      path.endsWith(".ics")
        ? `BEGIN:VEVENT\nDTSTART:${ymd(new Date())}T090000\nSUMMARY:Susitikimas\nEND:VEVENT`
        : "Labas\nantra eilutė",
    chooseSource(volume, parts) {
      ctx.update({ librarySource: { volumeId: volume.id, relativePath: parts.join("/") } });
    },
    update(patch: Partial<Settings>) {
      ctx.settings = { ...ctx.settings, ...patch };
    },
    resetSettings() {
      ctx.settings = { ...DEFAULT_SETTINGS };
    },
    refresh() {},
    beep() {},
    ...over,
  };
  return ctx;
}

const labels = (nav: Navigator) => nav.items().map((i) => i.label);
const goTo = (nav: Navigator, label: string) => {
  const idx = labels(nav).indexOf(label);
  if (idx < 0) throw new Error(`no ${label} in ${labels(nav).join(", ")}`);
  nav.rotate(idx - nav.current.selected);
  return nav.select();
};
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("main menu", () => {
  it("matches the original order; Now Playing only once something is queued", () => {
    const ctx = makeCtx();
    const nav = new Navigator(buildRoot(ctx));
    expect(labels(nav)).toEqual(["Music", "Photos", "Podcasts", "Extras", "Settings", "Shuffle Songs"]);
    goTo(nav, "Shuffle Songs");
    expect(nav.current.screen.id).toBe("nowplaying");
    expect(ctx.playback.queue).toHaveLength(TRACKS.length);
    nav.back();
    expect(labels(nav).at(-1)).toBe("Now Playing");
  });
});

describe("wheel navigation", () => {
  it("does not wrap past either end", () => {
    const nav = new Navigator(buildRoot(makeCtx()));
    expect(nav.rotate(-1).kind).toBe("none");
    nav.rotate(100);
    expect(nav.current.selected).toBe(5);
    expect(nav.rotate(1).kind).toBe("none");
  });

  it("scrolls the window so the selection stays visible", () => {
    const nav = new Navigator(buildRoot(makeCtx()));
    goTo(nav, "Settings");
    nav.rotate(12);
    expect(nav.current.selected).toBe(12);
    expect(nav.current.top).toBe(5);
    nav.rotate(-12);
    expect(nav.current.top).toBe(0);
  });

  it("MENU goes back one level and keeps the parent selection", () => {
    const nav = new Navigator(buildRoot(makeCtx()));
    goTo(nav, "Extras");
    expect(nav.depth).toBe(2);
    expect(nav.back().kind).toBe("pop");
    expect(labels(nav)[nav.current.selected]).toBe("Extras");
    expect(nav.back().kind).toBe("none");
  });
});

describe("music browsing", () => {
  it("lists artists ignoring 'The', unknowns last", () => {
    const nav = new Navigator(buildRoot(makeCtx()));
    goTo(nav, "Music");
    goTo(nav, "Artists");
    expect(labels(nav)).toEqual(["Anna", "The Band", "Unknown Artist"]);
  });

  it("artist → All Songs + albums → songs in track order", () => {
    const nav = new Navigator(buildRoot(makeCtx()));
    goTo(nav, "Music");
    goTo(nav, "Artists");
    goTo(nav, "The Band");
    expect(labels(nav)).toEqual(["All Songs", "Debut", "Later"]);
    goTo(nav, "Debut");
    expect(labels(nav)).toEqual(["First", "Second"]);
  });

  it("choosing a song plays that list from that song and opens Now Playing", () => {
    const ctx = makeCtx();
    const nav = new Navigator(buildRoot(ctx));
    goTo(nav, "Music");
    goTo(nav, "Albums");
    goTo(nav, "Debut");
    const ev = goTo(nav, "Second");
    expect(ev.kind).toBe("push");
    expect(nav.current.screen.id).toBe("nowplaying");
    expect(ctx.playback.queue.map((t) => t.title)).toEqual(["First", "Second"]);
    expect(ctx.playback.state.index).toBe(1);
    // MENU returns to the song list; playback is not touched.
    nav.back();
    expect(nav.current.screen.title).toBe("Debut");
    expect(ctx.playback.state.playing).toBe(true);
  });

  it("shuffle setting puts the chosen song first", () => {
    const ctx = makeCtx();
    ctx.settings.shuffle = "songs";
    const nav = new Navigator(buildRoot(ctx));
    goTo(nav, "Music");
    goTo(nav, "Songs");
    goTo(nav, "Zebra");
    expect(ctx.playback.queue[0].title).toBe("Zebra");
    expect(ctx.playback.state.index).toBe(0);
  });

  it("Songs, Genres and Composers", () => {
    const nav = new Navigator(buildRoot(makeCtx()));
    goTo(nav, "Music");
    goTo(nav, "Songs");
    expect(labels(nav)).toEqual(["Alone", "First", "Second", "untagged file", "Zebra"]);
    nav.back();
    goTo(nav, "Genres");
    expect(labels(nav)).toEqual(["Pop", "Rock", "Unknown Genre"]);
    nav.back();
    goTo(nav, "Composers");
    expect(labels(nav)).toEqual(["Anna K."]);
  });

  it("Now Playing: wheel changes volume, centre switches to scrubbing", () => {
    const ctx = makeCtx();
    const nav = new Navigator(buildRoot(ctx));
    goTo(nav, "Shuffle Songs");
    const v0 = ctx.playback.state.volume;
    nav.rotate(4);
    const v1 = ctx.playback.state.volume;
    expect(v1).toBeGreaterThan(v0 + 3 / 32);
    expect(ctx.settings.volume).toBe(v1);
    nav.select(); // scrubber
    nav.rotate(3);
    expect(ctx.playback.state.positionMs).toBeGreaterThan(0);
    expect(ctx.playback.state.volume).toBe(v1);
  });

  it("shows scan progress while the library is empty", () => {
    const ctx = makeCtx({ library: new Library([], 0), scan: { active: true, done: 50, total: 200 } });
    const nav = new Navigator(buildRoot(ctx));
    goTo(nav, "Music");
    goTo(nav, "Songs");
    expect(nav.items()).toHaveLength(0);
    expect(nav.current.screen.empty).toBe("Scanning… 25%");
  });
});

describe("settings", () => {
  it("cycles Shuffle in place like the original", () => {
    const ctx = makeCtx();
    const nav = new Navigator(buildRoot(ctx));
    goTo(nav, "Settings");
    goTo(nav, "Shuffle");
    expect(ctx.settings.shuffle).toBe("songs");
    nav.select();
    expect(ctx.settings.shuffle).toBe("albums");
    nav.select();
    expect(ctx.settings.shuffle).toBe("off");
    expect(nav.depth).toBe(2);
  });

  it("the whole menu is implemented: no grey items left", () => {
    const ctx = makeCtx();
    const nav = new Navigator(buildRoot(ctx));
    expect(nav.items().filter((i) => i.disabled)).toEqual([]);
    for (const m of ["Music", "Extras", "Settings"]) {
      goTo(nav, m);
      expect(nav.items().filter((i) => i.disabled).map((i) => i.id)).toEqual(m === "Settings" ? [] : []);
      nav.back();
    }
    goTo(nav, "Settings");
    goTo(nav, "Legal");
    expect(nav.current.screen.id).toBe("legal");
    nav.home();
    goTo(nav, "Extras");
    goTo(nav, "Games");
    expect(labels(nav)).toEqual(["Bricks", "Music Quiz"]);
  });

  it("EQ: a preset is chosen from the list, the editor saves a Custom curve", () => {
    const ctx = makeCtx();
    const nav = new Navigator(buildRoot(ctx));
    goTo(nav, "Settings");
    goTo(nav, "EQ");
    expect(labels(nav).slice(0, 3)).toEqual(["Custom", "Off", "Acoustic"]);
    goTo(nav, "Rock");
    expect(ctx.settings.eqPreset).toBe("Rock");
    expect(nav.current.screen.id).toBe("settings");
    expect(nav.items().find((i) => i.id === "eq")!.value).toBe("Rock");
    goTo(nav, "EQ");
    goTo(nav, "Custom");
    expect(nav.current.screen.id).toBe("eq-edit");
    // Joystick/arrow up raises the band (not "up the list").
    expect(nav.current.screen.upIsMore).toBe(true);
    nav.rotate(4); // first band +2 dB on top of Rock's +5
    expect(ctx.settings.eqPreset).toBe("Custom");
    expect(ctx.settings.eqCustom[0]).toBe(7);
    nav.select();
    nav.rotate(-100);
    expect(ctx.settings.eqCustom[1]).toBe(-12);
    for (let i = 0; i < 9; i++) nav.select();
    expect(nav.current.screen.id).toBe("eq");
  });

  it("Volume Limit caps the volume and can be locked with a combination", () => {
    const ctx = makeCtx();
    const nav = new Navigator(buildRoot(ctx));
    ctx.playback.setVolume(1);
    goTo(nav, "Settings");
    goTo(nav, "Volume Limit");
    expect(nav.current.screen.id).toBe("limit-edit");
    nav.rotate(-8); // 100% → 75%
    expect(ctx.settings.volumeLimit).toBe(0.75);
    expect(ctx.playback.state.volume).toBe(0.75);
    expect(ctx.playback.setVolume(1)).toBe(0.75);
    nav.select();
    expect(labels(nav)).toEqual(["Done", "Lock Volume Limit"]);
    goTo(nav, "Lock Volume Limit");
    for (const d of [1, 2, 3, 4]) {
      nav.rotate(d);
      nav.select();
    }
    expect(ctx.settings.volumeLimitCode).toBe("1234");
    expect(nav.current.screen.id).toBe("settings");
    expect(nav.items().find((i) => i.id === "volumelimit")!.value).toBe("75%");
    // Locked: the combination is asked first; a wrong one keeps the limit.
    goTo(nav, "Volume Limit");
    expect(nav.current.screen.id).toBe("limit-unlock");
    for (let i = 0; i < 4; i++) nav.select();
    expect(nav.current.screen.id).toBe("limit-unlock");
    for (const d of [1, 2, 3, 4]) {
      nav.rotate(d);
      nav.select();
    }
    expect(nav.current.screen.id).toBe("limit-edit");
    nav.rotate(100);
    nav.select();
    goTo(nav, "Remove Lock");
    expect(ctx.settings.volumeLimit).toBe(1);
    expect(ctx.settings.volumeLimitCode).toBe("");
    expect(nav.current.screen.id).toBe("settings");
  });

  it("Main Menu and Music Menu choose what is shown", () => {
    const ctx = makeCtx();
    const nav = new Navigator(buildRoot(ctx));
    goTo(nav, "Settings");
    goTo(nav, "Main Menu");
    expect(nav.items().find((i) => i.label === "Artists")!.value).toBe("Off");
    goTo(nav, "Artists");
    goTo(nav, "Photos");
    goTo(nav, "Stopwatch");
    nav.home();
    expect(labels(nav)).toEqual(["Music", "Artists", "Podcasts", "Extras", "Stopwatch", "Settings", "Shuffle Songs"]);
    goTo(nav, "Settings");
    goTo(nav, "Music Menu");
    goTo(nav, "Cover Flow");
    goTo(nav, "Composers");
    nav.home();
    goTo(nav, "Music");
    expect(labels(nav)).not.toContain("Cover Flow");
    expect(labels(nav)).not.toContain("Composers");
    expect(labels(nav)[0]).toBe("Playlists");
    nav.home();
    goTo(nav, "Settings");
    goTo(nav, "Main Menu");
    goTo(nav, "Reset Menu");
    nav.home();
    expect(labels(nav)).toEqual(["Music", "Photos", "Podcasts", "Extras", "Settings", "Shuffle Songs"]);
  });

  it("Notes: choose a folder, open a note", async () => {
    const ctx = makeCtx();
    const nav = new Navigator(buildRoot(ctx));
    goTo(nav, "Extras");
    goTo(nav, "Notes");
    expect(labels(nav)).toEqual(["Choose Folder…"]);
    goTo(nav, "Choose Folder…");
    goTo(nav, "USB");
    labels(nav);
    await flush();
    expect(labels(nav)).toEqual(["Use This Folder", "Docs"]);
    goTo(nav, "Use This Folder");
    expect(ctx.settings.notesFolder).toBe("E:\\");
    expect(nav.current.screen.id).toBe("extras");
    goTo(nav, "Notes");
    labels(nav);
    await flush();
    expect(labels(nav)).toEqual(["Docs", "Sveiki", "Choose Folder…"]);
    goTo(nav, "Sveiki");
    expect(nav.current.screen.title).toBe("Sveiki");
    expect(nav.current.screen.draw).toBeDefined();
  });

  it("Calendars: add a file, see the month and today's events", async () => {
    const ctx = makeCtx();
    const nav = new Navigator(buildRoot(ctx));
    goTo(nav, "Extras");
    goTo(nav, "Calendars");
    expect(labels(nav)).toEqual(["Add Calendar File…"]);
    goTo(nav, "Add Calendar File…");
    goTo(nav, "USB");
    labels(nav);
    await flush();
    goTo(nav, "Darbas.ics");
    expect(ctx.settings.calendars).toEqual(["E:\\Darbas.ics"]);
    expect(nav.current.screen.id).toBe("calendars");
    expect(labels(nav)).toEqual(["Darbas", "Add Calendar File…", "Remove Calendar"]);
    goTo(nav, "Darbas");
    await flush();
    nav.select();
    expect(labels(nav)).toEqual(["09:00  Susitikimas"]);
    nav.back();
    nav.rotate(1);
    nav.select();
    expect(labels(nav)).toEqual([]);
  });

  it("Date & Time: 24-hour clock and Time in Title", () => {
    const ctx = makeCtx();
    const nav = new Navigator(buildRoot(ctx));
    goTo(nav, "Settings");
    goTo(nav, "Date & Time");
    expect(labels(nav)).toEqual(["Time", "Date", "Time Zone", "24-Hour Clock", "Time in Title", "Set by this computer"]);
    goTo(nav, "24-Hour Clock");
    expect(ctx.settings.clock24).toBe(false);
    goTo(nav, "Time in Title");
    expect(ctx.settings.timeInTitle).toBe(true);
  });

  it("Photos: choose a folder, albums, grid and photo", async () => {
    const ctx = makeCtx();
    const nav = new Navigator(buildRoot(ctx));
    goTo(nav, "Photos");
    expect(labels(nav)).toEqual(["Slideshow Settings", "Choose Folder…"]);
    goTo(nav, "Choose Folder…");
    goTo(nav, "USB");
    goTo(nav, "Use This Folder");
    expect(ctx.settings.photosFolder).toBe("E:\\");
    expect(nav.current.screen.id).toBe("main");
    goTo(nav, "Photos");
    labels(nav);
    await flush();
    expect(labels(nav)).toEqual(["All Photos", "Docs", "Slideshow Settings", "Choose Folder…"]);
    goTo(nav, "All Photos");
    expect(nav.current.screen.id).toBe("photos-all");
  });

  it("Audio Crossfade switches on and off", () => {
    const ctx = makeCtx();
    const nav = new Navigator(buildRoot(ctx));
    goTo(nav, "Settings");
    goTo(nav, "Audio Crossfade");
    expect(ctx.settings.crossfade).toBe(true);
  });

  it("Sound Check switches on and off", () => {
    const ctx = makeCtx();
    const nav = new Navigator(buildRoot(ctx));
    goTo(nav, "Settings");
    goTo(nav, "Sound Check");
    expect(ctx.settings.soundCheck).toBe(true);
    expect(nav.items().find((i) => i.id === "soundcheck")!.value).toBe("On");
  });

  it("Library Source: drive → folder → Use This Folder, back to Settings", async () => {
    const ctx = makeCtx();
    const nav = new Navigator(buildRoot(ctx));
    goTo(nav, "Settings");
    goTo(nav, "Library Source");
    goTo(nav, "USB");
    expect(labels(nav)).toEqual(["Use This Folder", "Loading…"]);
    await flush();
    expect(labels(nav)).toEqual(["Use This Folder", "Music", "Backup"]);
    goTo(nav, "Music");
    await flush();
    const ev = goTo(nav, "Use This Folder");
    expect(ev.kind).toBe("pop");
    expect(nav.current.screen.id).toBe("settings");
    expect(ctx.settings.librarySource).toEqual({ volumeId: "b", relativePath: "Music" });
    expect(nav.items().find((i) => i.id === "source")!.value).toBe("Music");
  });

  it("switches language", () => {
    const ctx = makeCtx();
    const nav = new Navigator(buildRoot(ctx));
    goTo(nav, "Settings");
    goTo(nav, "Language");
    goTo(nav, "Lietuvių");
    nav.back();
    expect(labels(nav)[0]).toBe("Muzika");
  });
});

describe("radio (Podcasts)", () => {
  it("filters the world catalogue by country, then genre", async () => {
    const nav = new Navigator(buildRoot(makeCtx()));
    goTo(nav, "Podcasts");
    expect(labels(nav)).toEqual(["Countries", "Genres"]);
    goTo(nav, "Countries");
    expect(nav.current.screen.empty).toBe("Loading…");
    labels(nav);
    await flush();
    expect(labels(nav)).toEqual(["Germany", "Lithuania"]);
    expect(nav.items()[1].value).toBe("2");
    goTo(nav, "Lithuania");
    labels(nav);
    await flush();
    expect(labels(nav)).toEqual(["All Stations", "Pop", "Alternative & Indie"]);
    goTo(nav, "All Stations");
    labels(nav);
    await flush();
    expect(labels(nav)).toEqual(["LRT Opus", "Neringa FM"]);
    expect(nav.items()[0].value).toBe("Alternative & Indie");
  });

  it("filters by genre, then country; All Countries lists every station of the genre", async () => {
    const nav = new Navigator(buildRoot(makeCtx()));
    goTo(nav, "Podcasts");
    goTo(nav, "Genres");
    labels(nav);
    await flush();
    goTo(nav, "Jazz");
    labels(nav);
    await flush();
    expect(labels(nav)).toEqual(["All Countries", "Germany"]);
    goTo(nav, "Germany");
    labels(nav);
    await flush();
    expect(labels(nav)).toEqual(["Jazz Berlin"]);
    expect(nav.current.screen.title).toBe("Germany · Jazz");
  });

  it("choosing a station tunes in and opens Now Playing; next goes to the next station; it is remembered", async () => {
    const ctx = makeCtx();
    const nav = new Navigator(buildRoot(ctx));
    goTo(nav, "Podcasts");
    goTo(nav, "Countries");
    labels(nav);
    await flush();
    goTo(nav, "Lithuania");
    labels(nav);
    await flush();
    goTo(nav, "All Stations");
    labels(nav);
    await flush();
    goTo(nav, "LRT Opus");
    expect(nav.current.screen.id).toBe("nowplaying");
    expect(ctx.playback.station?.name).toBe("LRT Opus");
    expect(ctx.playback.radio?.filter).toEqual({ country: "LT", genre: null });
    ctx.playback.next();
    expect(ctx.playback.station?.name).toBe("Neringa FM");
    expect(ctx.playback.radio?.filter).toEqual({ country: "LT", genre: null });
    // Recent Stations come from History.
    ctx.settings.history = [{ at: Date.now(), path: "https://stream.example/jazz.mp3", title: "x", artist: "", album: "", station: "Jazz Berlin", stationId: "jazz-b" }];
    nav.home();
    goTo(nav, "Podcasts");
    goTo(nav, "Recent Stations");
    goTo(nav, "Jazz Berlin");
    await flush();
    expect(ctx.playback.station?.name).toBe("Jazz Berlin");
    // Music from the library replaces the radio.
    nav.home();
    goTo(nav, "Music");
    goTo(nav, "Songs");
    goTo(nav, "Zebra");
    expect(ctx.playback.radio).toBeNull();
  });

  it("reads song titles sent by stations", () => {
    expect(splitStreamTitle("Jurga - Nebijok")).toEqual({ artist: "Jurga", title: "Nebijok" });
    expect(splitStreamTitle("Земфира – Искала")).toEqual({ artist: "Земфира", title: "Искала" });
    expect(splitStreamTitle("Neringa FM")).toBeNull();
    expect(splitStreamTitle("Reklama - www.radio.lt")).toBeNull();
  });
});

describe("mouse control", () => {
  it("is off by default and can be switched on in Settings", () => {
    const ctx = makeCtx();
    const nav = new Navigator(buildRoot(ctx));
    goTo(nav, "Settings");
    expect(nav.items().find((i) => i.id === "mouse")!.value).toBe("Off");
    goTo(nav, "Mouse Control");
    expect(ctx.settings.mouseControl).toBe(true);
  });

  it("clicking a visible row opens it, also when scrolled", () => {
    const nav = new Navigator(buildRoot(makeCtx()));
    nav.clickRow(4); // Settings
    expect(nav.current.screen.id).toBe("settings");
    nav.rotate(19); // scrolled to the end: top row is index 9 (EQ)
    nav.clickRow(4); // Language
    expect(nav.current.screen.title).toBe("Language");
    expect(nav.clickRow(40).kind).toBe("none");
  });

  it("clicking the progress bar seeks", () => {
    const ctx = makeCtx();
    const nav = new Navigator(buildRoot(ctx));
    goTo(nav, "Music");
    goTo(nav, "Songs");
    goTo(nav, "Alone");
    nav.click(12 + 148, 218 - 46 + 5, 320, 218); // middle of the bar
    expect(ctx.playback.state.positionMs).toBeCloseTo(90000, -3);
  });
});

describe("Russian", () => {
  it("can switch the whole menu to Russian", () => {
    const ctx = makeCtx();
    const nav = new Navigator(buildRoot(ctx));
    goTo(nav, "Settings");
    goTo(nav, "Language");
    goTo(nav, "Русский");
    nav.back();
    expect(labels(nav)).toEqual(["Музыка", "Фото", "Подкасты", "Дополнения", "Настройки", "Перемешать песни"]);
  });
});

describe("search", () => {
  it("types with the wheel and centre, deletes with ⏮, opens results with ⏭", () => {
    const ctx = makeCtx();
    const nav = new Navigator(buildRoot(ctx));
    goTo(nav, "Music");
    goTo(nav, "Search");
    expect(nav.current.screen.id).toBe("search");
    nav.rotate(25); // A → Z
    nav.select();
    nav.rotate(-21); // Z → E
    nav.select(); // "ZE"
    nav.text("x");
    expect(nav.button("prev").kind).toBe("moved"); // delete "X"
    const ev = nav.button("next");
    expect(ev.kind).toBe("push");
    expect(nav.current.screen.title).toBe("Results");
    expect(labels(nav)).toEqual(["Zebra"]);
    expect(nav.items()[0].value).toBe("Song");
    goTo(nav, "Zebra");
    expect(ctx.playback.current?.title).toBe("Zebra");
  });

  it("keyboard typing finds artists and albums", () => {
    const nav = new Navigator(buildRoot(makeCtx()));
    goTo(nav, "Music");
    goTo(nav, "Search");
    for (const ch of "band") nav.text(ch);
    nav.text("\n");
    expect(labels(nav)).toEqual(["The Band", "Debut", "Later", "Alone", "First", "Second"]);
  });
});

describe("On-The-Go", () => {
  it("holding the centre adds songs, albums and artists; save and clear", () => {
    const ctx = makeCtx();
    const nav = new Navigator(buildRoot(ctx));
    goTo(nav, "Music");
    goTo(nav, "Songs");
    nav.rotate(4); // Zebra
    expect(nav.hold().kind).toBe("held");
    nav.back();
    goTo(nav, "Albums");
    nav.rotate(-10); // Debut
    expect(nav.hold().kind).toBe("held");
    expect(nav.current.screen.id).toBe("albums"); // holding does not open it
    nav.back();
    goTo(nav, "Playlists");
    expect(labels(nav)).toEqual(["On-The-Go", "Import from PC…"]);
    goTo(nav, "On-The-Go");
    expect(labels(nav)).toEqual(["Zebra", "First", "Second", "Save Playlist", "Clear Playlist"]);
    const ev = goTo(nav, "Save Playlist");
    expect(ev.kind).toBe("pop");
    expect(ctx.settings.onTheGo).toEqual([]);
    expect(labels(nav)).toEqual(["On-The-Go", "New Playlist 1", "Import from PC…"]);
    goTo(nav, "New Playlist 1");
    expect(labels(nav)).toEqual(["Zebra", "First", "Second", "Remove Playlist"]);
    goTo(nav, "Remove Playlist");
    expect(labels(nav)).toEqual(["Cancel", "Remove Playlist"]);
    goTo(nav, "Remove Playlist");
    expect(nav.current.screen.id).toBe("playlists");
    expect(ctx.settings.savedPlaylists).toEqual([]);
  });

  it("empty On-The-Go explains how to add songs; hold does nothing on settings", () => {
    const nav = new Navigator(buildRoot(makeCtx()));
    goTo(nav, "Music");
    goTo(nav, "Playlists");
    goTo(nav, "On-The-Go");
    expect(nav.items()).toEqual([]);
    expect(nav.current.screen.empty).toBe("Hold ▸ on a song to add it");
    nav.home();
    goTo(nav, "Settings");
    expect(nav.hold().kind).toBe("none");
  });
});

describe("full-screen artwork", () => {
  it("double-click on the artwork toggles it; the bar still seeks", () => {
    const ctx = makeCtx();
    const nav = new Navigator(buildRoot(ctx));
    goTo(nav, "Music");
    goTo(nav, "Songs");
    goTo(nav, "Alone");
    expect(nav.doubleClick(200, 60, 320, 218).kind).toBe("none"); // beside the artwork
    expect(nav.doubleClick(60, 80, 320, 218).kind).toBe("moved"); // on it
    nav.click(12 + 148, 218 - 38 + 5, 320, 218); // bar in full-screen mode
    expect(ctx.playback.state.positionMs).toBeCloseTo(90000, -3);
    expect(nav.doubleClick(250, 100, 320, 218).kind).toBe("moved"); // anywhere: back
  });
});

describe("History", () => {
  it("lists played songs newest first with their time, plays and clears", () => {
    const ctx = makeCtx();
    const now = Date.now();
    ctx.settings.history = [
      { at: now - 60_000, path: TRACKS[3].path, title: "Zebra", artist: "Anna", album: "Solo", station: "" },
      { at: now - 86_400_000 - 1000, path: "https://s/x", title: "Laivai", artist: "Andrius Mamontovas", album: "", station: "Neringa FM" },
      { at: now - 86_400_000 * 3, path: "/gone.mp3", title: "Gone", artist: "", album: "", station: "" },
    ];
    const nav = new Navigator(buildRoot(ctx));
    goTo(nav, "Extras");
    goTo(nav, "History");
    expect(labels(nav)).toEqual(["Zebra", "Laivai", "Gone", "Clear History"]);
    expect(nav.items()[0].value).toMatch(/^\d\d:\d\d$/);
    expect(nav.items()[1].value).toMatch(/^Yesterday \d\d:\d\d$/);
    expect(nav.items()[2].disabled).toBe(true); // file no longer in the library
    goTo(nav, "Laivai");
    expect(ctx.playback.station?.name).toBe("Neringa FM");
    nav.back();
    goTo(nav, "Zebra");
    expect(ctx.playback.current?.title).toBe("Zebra");
    nav.back();
    goTo(nav, "Clear History");
    goTo(nav, "Clear History");
    expect(ctx.settings.history).toEqual([]);
    expect(nav.current.screen.id).toBe("extras");
  });
});

describe("Clocks", () => {
  it("shows this computer's clock, adds and removes cities", () => {
    const ctx = makeCtx();
    const nav = new Navigator(buildRoot(ctx));
    goTo(nav, "Extras");
    goTo(nav, "Clocks");
    expect(labels(nav)).toHaveLength(2);
    expect(labels(nav)[1]).toBe("Add Clock");
    goTo(nav, "Add Clock");
    goTo(nav, "Asia");
    goTo(nav, "Tokyo");
    expect(nav.current.screen.id).toBe("clocks");
    expect(ctx.settings.clocks.at(-1)).toBe("Asia/Tokyo");
    expect(labels(nav)).toContain("Tokyo");
    expect(nav.items().find((i) => i.label === "Tokyo")!.value).toMatch(/^\d\d:\d\d$/);
    goTo(nav, "Tokyo");
    expect(nav.current.screen.draw).toBeDefined();
    nav.select(); // options
    goTo(nav, "Delete Clock");
    expect(nav.current.screen.id).toBe("clocks");
    expect(labels(nav)).not.toContain("Tokyo");
  });
});

describe("Alarms", () => {
  it("create, set time with the wheel, change repeat, ring and dismiss", () => {
    const ctx = makeCtx();
    const beeps: boolean[] = [];
    ctx.beep = (on) => beeps.push(on);
    const nav = new Navigator(buildRoot(ctx));
    goTo(nav, "Extras");
    goTo(nav, "Alarms");
    goTo(nav, "Create Alarm");
    expect(ctx.settings.alarms).toHaveLength(1);
    goTo(nav, "Time");
    nav.text("7"); // hour 7
    nav.rotate(30); // minutes field
    const ev = nav.select();
    expect(ev.kind).toBe("pop");
    expect(ctx.settings.alarms[0].hour).toBe(7);
    goTo(nav, "Repeat");
    goTo(nav, "Weekdays");
    expect(ctx.settings.alarms[0].repeat).toBe("weekdays");
    // Goes off: the app opens the ringing screen.
    nav.push(ctx.screens!.alarmRinging(ctx.settings.alarms[0]));
    expect(beeps).toEqual([true]);
    expect(labels(nav)).toEqual(["Dismiss", "Snooze"]);
    goTo(nav, "Snooze");
    expect(beeps[0]).toBe(true);
    expect(beeps.at(-1)).toBe(false);
    expect(ctx.settings.alarms).toHaveLength(2);
    expect(ctx.settings.alarms[1].repeat).toBe("once");
  });
});

describe("Screen Lock", () => {
  it("asks for a combination first, then locks until it is entered", () => {
    const ctx = makeCtx();
    const nav = new Navigator(buildRoot(ctx));
    goTo(nav, "Extras");
    goTo(nav, "Screen Lock");
    goTo(nav, "Lock");
    for (const d of "1234") nav.text(d); // set combination
    expect(ctx.settings.lockCode).toBe("1234");
    expect(ctx.settings.locked).toBe(true);
    expect(nav.current.screen.id).toBe("locked");
    // MENU, ⏯ and wrong codes do not get out.
    expect(nav.back().kind).toBe("moved");
    expect(nav.button("play").kind).toBe("moved");
    for (const d of "9999") nav.text(d);
    expect(nav.current.screen.id).toBe("locked");
    for (const d of "1234") nav.text(d);
    expect(ctx.settings.locked).toBe(false);
    expect(nav.current.screen.id).toBe("screenlock");
  });
});

describe("stopwatch menu", () => {
  it("⏯ is taken by the timer, ⏮ ⏭ are left to the music", () => {
    const nav = new Navigator(buildRoot(makeCtx()));
    goTo(nav, "Extras");
    goTo(nav, "Stopwatch");
    goTo(nav, "Timer");
    expect(nav.button("play").kind).toBe("moved");
    expect(nav.button("next").kind).toBe("none");
  });
});

describe("playlists", () => {
  it("imports a playlist file from the PC and plays it in order", async () => {
    const ctx = makeCtx();
    const nav = new Navigator(buildRoot(ctx));
    goTo(nav, "Music");
    goTo(nav, "Playlists");
    goTo(nav, "Import from PC…");
    goTo(nav, "USB");
    expect(labels(nav)).toEqual([]); // loading (the screen asks when first drawn)
    expect(nav.current.screen.empty).toBe("Loading…");
    await flush();
    expect(labels(nav)).toEqual(["Lists", "Top.m3u"]);
    const ev = goTo(nav, "Top.m3u");
    expect(ev.kind).toBe("pop");
    expect(nav.current.screen.id).toBe("playlists");
    expect(ctx.settings.playlists).toEqual(["E:\\Top.m3u"]);
    expect(labels(nav)).toContain("Top");

    goTo(nav, "Top");
    nav.items();
    await flush();
    // Missing "First.mp3" is matched in the library by file name; "Gone Song" stays grey.
    expect(labels(nav)).toEqual(["First", "Zebra", "Gone Song", "Remove Playlist"]);
    expect(nav.items()[2].disabled).toBe(true);
    goTo(nav, "Zebra");
    expect(ctx.playback.queue.map((x) => x.title)).toEqual(["First", "Zebra"]);
    expect(ctx.playback.state.index).toBe(1);

    nav.back();
    goTo(nav, "Remove Playlist");
    expect(ctx.settings.playlists).toEqual([]);
    expect(nav.current.screen.id).toBe("playlists");
  });

  it("offers Import from PC", () => {
    const nav = new Navigator(buildRoot(makeCtx()));
    goTo(nav, "Music");
    goTo(nav, "Playlists");
    expect(labels(nav)).toContain("Import from PC…");
  });
});
