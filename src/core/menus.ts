// Menu tree. Structure and order follow the original 6th-gen device; additions
// are "Import from PC…" under Playlists and "Library Source" (with a folder
// browser) under Settings.
import type { MenuItem, Screen } from "./navigator";
import { translator, type Lang, type StringKey } from "./strings";
import {
  type Album,
  type Group,
  type Library,
  type Track,
  artistOf,
  shuffled,
  UNKNOWN_ALBUM,
  UNKNOWN_ARTIST,
  UNKNOWN_GENRE,
} from "./library";
import { splitStreamTitle, type Playback } from "./playback";
import { joinPath, type CatalogCount, type DirListing, type FileListing, type StationFilter, type HistoryEntry, type PlaylistFile, type Settings, type Station, type Volume } from "../platform/bridge";
import { drawCoverFlow, drawNowPlaying, drawRadio, inArt, type NowPlayingMode } from "../render/nowplaying";
import { drawSearch, stripOffsetAt } from "../render/search";
import { drawStopwatch } from "../render/stopwatch";
import { formatStopwatch, Stopwatch } from "./stopwatch";
import { drawClock } from "../render/clock";
import { drawPicker } from "../render/picker";
import { drawEq } from "../render/eq";
import { drawVolumeLimit } from "../render/limit";
import { drawTextPage, TEXT_LINE_H, type TextPage } from "../render/textpage";
import { drawMonth } from "../render/calendar";
import { drawBrick, drawQuiz } from "../render/games";
import { BrickGame } from "./games/brick";
import { makeRound, points, quizPool, QUIZ_ROUNDS, QUIZ_SECONDS, type QuizRound } from "./games/quiz";
import { drawPhoto, drawPhotoGrid, gridCell, GRID_COLS, GRID_ROWS, PhotoStore } from "../render/photos";
import { formatTime, isClock24 } from "./timefmt";
import { addDays, dayStart, occurrences, parseIcs, type CalEvent, type Occurrence } from "./ics";
import { CUSTOM, EQ_BANDS, EQ_MAX_DB, EQ_PRESETS, eqGains } from "./eq";
import { alarmTime, newAlarm, REPEATS, type Alarm } from "./alarms";
import { CITIES, cityName, formatOffset, hhmm, localZone, offsetFromLocal, REGIONS, zonedTime } from "./clocks";
import { EMPTY_RESULTS, resultCount, SEARCH_CHARS, searchLibrary, type SearchResults } from "./search";

export interface ScanStatus {
  active: boolean;
  done: number;
  total: number;
}

export interface MenuContext {
  settings: Settings;
  volumes: Volume[];
  library: Library;
  scan: ScanStatus;
  playback: Playback;
  appVersion: string;
  /** Artwork for a track's album; null until loaded (loading starts on first ask). */
  art(track: Track): CanvasImageSource | null;
  /** World station catalogue (Podcasts): filters by country and genre. */
  radioCountries(genre: string | null): Promise<CatalogCount[]>;
  radioGenres(country: string | null): Promise<CatalogCount[]>;
  radioCatalog(f: StationFilter): Promise<Station[]>;
  radioStation(id: string): Promise<Station | null>;
  /** Any image by URL (station pictures); null until loaded. */
  image(url: string): CanvasImageSource | null;
  /** Cover for the song a station is playing; null until found. */
  songArt(artist: string, title: string): CanvasImageSource | null;
  listDirs(path: string): Promise<string[]>;
  /** Folders and playlist files (Import from PC). */
  listPlaylistDir(path: string): Promise<DirListing>;
  /** Sub-folders and files with these extensions (Notes, Calendars). */
  listFiles(path: string, exts: string[]): Promise<FileListing>;
  /** A text file's content, decoded. */
  readText(path: string): Promise<string>;
  /** Files under a folder at all levels (Photos). */
  findFiles(path: string, exts: string[]): Promise<string[]>;
  /** URL the screen can load a photo file from. */
  photoUrl(path: string): string;
  /** Reads a playlist file (each time it is opened, so edits on the PC show). */
  readPlaylist(path: string): Promise<PlaylistFile>;
  /** The user picked a library folder: remember it and scan it. */
  chooseSource(volume: Volume, parts: string[]): void;
  update(patch: Partial<Settings>): void;
  resetSettings(): void;
  /** Redraw after async data arrived. */
  refresh(): void;
  /** Alarm beeping on or off. */
  beep(on: boolean): void;
  /** Screens the app opens by itself (an alarm going off, the lock after a restart); set by buildRoot. */
  screens?: { alarmRinging(a: Alarm): Screen; lock(): Screen; nowPlaying(): Screen };
}

const BACKLIGHT_STEPS = [0, 2, 5, 10, 15, 20, 30];
/** Wheel seconds per tick while scrubbing, as a fraction of the song (at least 2 s). */
const SCRUB_FRACTION = 1 / 80;
const MODE_TIMEOUT_MS = { volume: 1500, scrub: 4000 } as const;

/** Items that can be on the main menu, in their menu order. */
export const MAIN_MENU_CHOICES = [
  "music", "coverflow", "playlists", "artists", "albums", "compilations", "songs", "genres", "composers",
  "audiobooks", "search", "photos", "podcasts", "extras", "alarms", "clocks", "history", "stopwatch",
  "screenlock", "shuffle-songs",
] as const;
export const DEFAULT_MAIN_MENU: string[] = ["music", "photos", "podcasts", "extras", "shuffle-songs"];

/** Settings → Legal: who made what this app is built from. */
const LEGAL_TEXT = `Original idea and first author: Aleksandr Igumenov.
MIT License · Copyright (c) 2026 Aleksandr Igumenov and WheelDesk contributors. Free to use, study, change and share; keep the copyright and licence notice.

An independent click-wheel music player for Windows, Linux and macOS. Not affiliated with, endorsed or sponsored by any device maker; its look and every menu are its own versions.

Built with open-source software:
• Tauri — MIT / Apache-2.0
• React — MIT
• rodio, cpal — MIT / Apache-2.0
• Symphonia (audio decoding) — MPL-2.0
• lofty (tags) — MIT / Apache-2.0
• sysinfo, walkdir, rayon, serde, ureq, encoding_rs — MIT / Apache-2.0
• Inter typeface — SIL Open Font License 1.1

Online information (open sources, used only when needed):
• Radio station catalogue — Radio Browser community archive (built in)
• Album and song covers — MusicBrainz / Cover Art Archive, TheAudioDB, Wikipedia
Covers and station logos belong to their owners and are shown for identification only.

Music, photos, notes and calendars are read from your own drives and never sent anywhere.`;

export function buildRoot(ctx: MenuContext): Screen {
  const t = (k: StringKey) => translator(ctx.settings.language)(k);

  const display = (name: string): string =>
    name === UNKNOWN_ARTIST ? t("unknownArtist")
      : name === UNKNOWN_ALBUM ? t("unknownAlbum")
      : name === UNKNOWN_GENRE ? t("unknownGenre")
      : name;

  /** Items cached until the library or language changes (lists can be 20 000 long). */
  const memo = (build: () => MenuItem[]): (() => MenuItem[]) => {
    let key = "";
    let items: MenuItem[] = [];
    return () => {
      const k = `${ctx.library.version}|${ctx.settings.language}`;
      if (k !== key) {
        items = build();
        key = k;
      }
      return items;
    };
  };

  /** A menu item whose screen is not built yet: shown grey and inert. */
  const sub = (id: string, key: StringKey, screen: () => Screen): MenuItem => ({
    id,
    label: t(key),
    chevron: true,
    open: screen,
  });

  /** Empty-list text for music screens: scanning progress or "No music". */
  const musicEmpty = (fallback: StringKey = "noMusic"): string => {
    if (!ctx.scan.active) return t(fallback);
    const pct = ctx.scan.total > 0 ? ` ${Math.floor((100 * ctx.scan.done) / ctx.scan.total)}%` : "";
    return `${t("scanning")}${pct}`;
  };

  const musicScreen = (id: string, title: string, build: () => MenuItem[], fallback: StringKey = "noMusic"): Screen => {
    const items = memo(build);
    return {
      id,
      title,
      items,
      get empty() {
        return musicEmpty(fallback);
      },
    };
  };

  // ---------------------------------------------------------------- Now Playing

  /** Full-screen artwork on Now Playing; remembered while the app runs. */
  let fullArt = false;

  const nowPlaying = (): Screen => {
    let mode: NowPlayingMode = "progress";
    let modeUntil = 0;
    const setMode = (m: NowPlayingMode) => {
      mode = m;
      modeUntil = m === "progress" ? 0 : performance.now() + MODE_TIMEOUT_MS[m];
    };
    return {
      id: "nowplaying",
      get title() {
      return t("nowPlaying");
    },
      items: () => [],
      onRotate: (ticks) => {
        const pb = ctx.playback;
        if (!pb.hasQueue) return false;
        if (mode === "scrub" && !pb.radio) {
          const step = Math.max(2000, pb.state.durationMs * SCRUB_FRACTION);
          pb.seekBy(ticks * step);
          setMode("scrub");
        } else {
          const before = pb.state.volume;
          const vol = pb.setVolume(before + ticks / 32);
          ctx.update({ volume: vol });
          setMode("volume");
          if (vol === before) return false;
        }
        return true;
      },
      onDoubleClick: (x, y) => {
        // Double-click on the artwork: artwork over the whole screen, and back.
        if (!fullArt && !inArt(x, y)) return false;
        fullArt = !fullArt;
        return true;
      },
      onClick: (x, y, w, h) => {
        // Mouse: clicking the progress bar jumps there (not for live radio).
        const pb = ctx.playback;
        const barY = fullArt ? h - 38 : h - 46;
        if (pb.radio || !pb.hasQueue || y < barY - 10 || y > barY + 22) return false;
        const frac = Math.max(0, Math.min(1, (x - 12) / (w - 24)));
        const dur = pb.state.durationMs || pb.current?.durationMs || 0;
        pb.seekBy(frac * dur - pb.state.positionMs);
        return true;
      },
      onSelect: () => {
        // Centre button: progress → scrubber → progress, like the original (not for live radio).
        if (ctx.playback.radio) return false;
        setMode(mode === "scrub" ? "progress" : "scrub");
        return true;
      },
      draw: (c, w, h, now) => {
        if (modeUntil && now > modeUntil) setMode("progress");
        const pb = ctx.playback;
        const st = pb.station;
        if (pb.radio && st) {
          const song = splitStreamTitle(pb.state.streamTitle);
          const art = (song && ctx.songArt(song.artist, song.title)) || (st.image ? ctx.image(st.image) : null);
          const nowText = pb.state.buffering
            ? t("connecting")
            : pb.state.streamTitle || st.name;
          return drawRadio(c, w, h, now, {
            fullArt,
            station: st.name,
            genre: !st.genre || st.genre === "other" ? "" : genreName(st.genre),
            description: st.description,
            nowText,
            index: pb.radio.index,
            total: pb.radio.stations.length,
            listenedMs: pb.state.positionMs,
            playing: pb.state.playing,
            buffering: pb.state.buffering,
            volume: pb.state.volume,
            volumeMode: mode === "volume",
            art,
            ofLabel: t("of"),
            liveLabel: t("live"),
            error: pb.state.error === "Stream not found" ? t("streamNotFound")
              : pb.state.error && /no audio/i.test(pb.state.error) ? t("noAudio") : pb.state.error,
          }) || mode !== "progress";
        }
        const tr = pb.current;
        drawNowPlaying(c, w, h, {
          fullArt,
          track: tr,
          artist: tr ? display(tr.artist || tr.albumArtist || UNKNOWN_ARTIST) : "",
          album: tr ? display(tr.album || UNKNOWN_ALBUM) : "",
          index: pb.state.index ?? 0,
          total: pb.queue.length,
          positionMs: pb.state.positionMs,
          durationMs: pb.state.durationMs || tr?.durationMs || 0,
          playing: pb.state.playing,
          volume: pb.state.volume,
          mode,
          art: tr ? ctx.art(tr) : null,
          repeat: ctx.settings.repeat,
          shuffle: ctx.settings.shuffle,
          ofLabel: t("of"),
          emptyLabel: t("nothingPlaying"),
          error: pb.state.error && /no audio/i.test(pb.state.error) ? t("noAudio") : pb.state.error,
        });
        return mode !== "progress";
      },
    };
  };

  // ---------------------------------------------------------------- On-The-Go

  /** Library tracks by file path (to turn saved paths back into songs). */
  let pathIndex: { version: number; map: Map<string, Track> } = { version: -1, map: new Map() };
  const byPath = (): Map<string, Track> => {
    if (pathIndex.version !== ctx.library.version) {
      pathIndex = { version: ctx.library.version, map: new Map(ctx.library.tracks.map((tr) => [tr.path, tr])) };
    }
    return pathIndex.map;
  };
  const tracksFor = (paths: string[]): Track[] =>
    paths.map((p) => byPath().get(p)).filter((tr): tr is Track => tr !== undefined);

  /** Holding the centre button adds songs to the On-The-Go list. */
  const addToOtg = (tracks: Track[]): boolean => {
    if (tracks.length === 0) return false;
    ctx.update({ onTheGo: [...ctx.settings.onTheGo, ...tracks.map((tr) => tr.path)] });
    return true;
  };

  /** A song row: plays `list` from this song and opens Now Playing. */
  const songItem = (list: Track[], i: number, label?: string): MenuItem => ({
    id: `song-${i}`,
    label: label ?? list[i].title,
    hold: () => addToOtg([list[i]]),
    open: () => {
      ctx.playback.playList(list, i, ctx.settings.shuffle);
      return nowPlaying();
    },
  });

  const songsScreen = (id: string, title: string, list: () => Track[], fallback: StringKey = "noMusic"): Screen =>
    musicScreen(id, title, () => {
      const l = list();
      return l.map((_, i) => songItem(l, i));
    }, fallback);

  // ---------------------------------------------------------------- Music

  const albumScreen = (a: Album): Screen => songsScreen(`album-${a.key}`, display(a.name), () => a.tracks);

  const albumsScreen = (id: string, title: string, list: () => Album[]): Screen =>
    musicScreen(id, title, () =>
      list().map((a, i) => ({
        id: `a${i}`, label: display(a.name), chevron: true, hold: () => addToOtg(a.tracks), open: () => albumScreen(a),
      })),
    );

  /** One artist: "All Songs" (when there is more than one album), then albums. */
  const artistScreen = (g: Group): Screen =>
    musicScreen(`artist-${g.name}`, display(g.name), () => {
      const albums = ctx.library.albumsIn(g.tracks);
      const items: MenuItem[] = albums.map((a, i) => ({
        id: `a${i}`,
        label: display(a.name),
        chevron: true,
        hold: () => addToOtg(a.tracks),
        open: () => albumScreen(a),
      }));
      if (albums.length > 1) {
        const all = ctx.library.inAlbumOrder(g.tracks);
        items.unshift({
          id: "all",
          label: t("allSongs"),
          chevron: true,
          hold: () => addToOtg(all),
          open: () => songsScreen(`artist-all-${g.name}`, display(g.name), () => all),
        });
      }
      return items;
    });

  const artistsScreen = (id: string, title: string, list: () => Group[]): Screen =>
    musicScreen(id, title, () =>
      list().map((g, i) => ({
        id: `r${i}`, label: display(g.name), chevron: true,
        hold: () => addToOtg(ctx.library.inAlbumOrder(g.tracks)), open: () => artistScreen(g),
      })),
    );

  const genreScreen = (g: Group): Screen =>
    musicScreen(`genre-${g.name}`, display(g.name), () => {
      const artists = groupArtists(g.tracks);
      const items: MenuItem[] = artists.map((a, i) => ({
        id: `r${i}`,
        label: display(a.name),
        chevron: true,
        hold: () => addToOtg(ctx.library.inAlbumOrder(a.tracks)),
        open: () => artistScreen(a),
      }));
      if (artists.length > 1) {
        items.unshift({
          id: "all",
          label: t("allSongs"),
          chevron: true,
          open: () => songsScreen(`genre-all-${g.name}`, display(g.name), () => ctx.library.inAlbumOrder(g.tracks)),
        });
      }
      return items;
    });

  const groupArtists = (tracks: Track[]): Group[] => {
    const byName = new Map<string, Group>();
    for (const tr of tracks) {
      const n = artistOf(tr);
      let g = byName.get(n.toLowerCase());
      if (!g) byName.set(n.toLowerCase(), (g = { name: n, tracks: [] }));
      g.tracks.push(tr);
    }
    const all = ctx.library.artists();
    const order = new Map(all.map((g, i) => [g.name.toLowerCase(), i]));
    return [...byName.values()].sort((a, b) => (order.get(a.name.toLowerCase()) ?? 0) - (order.get(b.name.toLowerCase()) ?? 0));
  };

  const coverFlow = (): Screen => {
    let index = 0;
    const albums = () => ctx.library.albums();
    return {
      id: "coverflow",
      get title() {
      return t("coverFlow");
    },
      items: () => [],
      onRotate: (ticks) => {
        const n = albums().length;
        const next = Math.max(0, Math.min(n - 1, index + ticks));
        if (next === index) return false;
        index = next;
        return true;
      },
      onSelect: () => {
        const a = albums()[index];
        return a ? albumScreen(a) : false;
      },
      onClick: (x, y, w) => {
        // Mouse: the centre cover opens its album, side covers scroll towards them.
        const half = 63;
        const n = albums().length;
        if (n === 0) return false;
        if (Math.abs(x - w / 2) <= half && y <= 12 + 2 * half) {
          const a = albums()[index];
          return a ? albumScreen(a) : false;
        }
        const step = Math.abs(x - w / 2) > half + 50 ? 2 : 1;
        const next = Math.max(0, Math.min(n - 1, index + (x < w / 2 ? -step : step)));
        if (next === index) return false;
        index = next;
        return true;
      },
      draw: (c, w, h) => {
        const list = albums();
        index = Math.min(index, Math.max(0, list.length - 1));
        drawCoverFlow(c, w, h, {
          count: list.length,
          index,
          name: (i) => display(list[i].name),
          artist: (i) => display(list[i].artist),
          art: (i) => ctx.art(list[i].tracks[0]),
          emptyLabel: musicEmpty(),
        });
        return false;
      },
    };
  };

  // ---------------------------------------------------------------- Search

  const searchResultsScreen = (query: string, r: SearchResults): Screen =>
    musicScreen(`search-${query}`, t("searchResults"), () => [
      ...r.artists.map((g, i) => ({
        id: `ra${i}`, label: display(g.name), value: t("artistKind"), chevron: true, open: () => artistScreen(g),
      })),
      ...r.albums.map((a, i) => ({
        id: `rb${i}`, label: display(a.name), value: t("albumKind"), chevron: true, open: () => albumScreen(a),
      })),
      ...r.songs.map((_, i) => ({ ...songItem(r.songs, i), value: t("songKind") })),
    ], "noResults");

  /**
   * Search, as on the original: the wheel moves along the letters, the centre
   * button types the letter, ⏮ deletes, ⏭ shows the results. Matches update
   * as you type. The keyboard can type directly.
   */
  const searchScreen = (): Screen => {
    let query = "";
    let index = 1; // "A"
    let results: SearchResults = EMPTY_RESULTS;
    let resultsFor = "";
    let libVersion = -1;
    const current = () => {
      if (resultsFor !== query || libVersion !== ctx.library.version) {
        results = searchLibrary(ctx.library, query);
        resultsFor = query;
        libVersion = ctx.library.version;
      }
      return results;
    };
    const type = (ch: string) => {
      if (query.length < 40) query += ch;
      return true;
    };
    const del = () => {
      if (!query) return false;
      query = query.slice(0, -1);
      return true;
    };
    const showResults = (): Screen | boolean => (query.trim() ? searchResultsScreen(query, current()) : false);
    return {
      id: "search",
      get title() {
        return t("search");
      },
      items: () => [],
      onRotate: (ticks) => {
        const next = Math.max(0, Math.min(SEARCH_CHARS.length - 1, index + ticks));
        if (next === index) return false;
        index = next;
        return true;
      },
      onSelect: () => type(SEARCH_CHARS[index]),
      onButton: (b) => (b === "prev" ? del() || true : b === "next" ? showResults() || true : false),
      onText: (ch) => {
        if (ch === "\b") return del();
        if (ch === "\n") return showResults();
        if (/^[\p{L}\p{N} ]$/u.test(ch)) return type(ch.toUpperCase());
        return false;
      },
      onClick: (x, y, w, h) => {
        const k = stripOffsetAt(x, y, w, h);
        if (k === null) return showResults();
        if (k === 0) return type(SEARCH_CHARS[index]);
        index = Math.max(0, Math.min(SEARCH_CHARS.length - 1, index + k));
        return true;
      },
      draw: (c, w, h, now) => {
        const r = current();
        const preview = [
          ...r.artists.map((g) => ({ label: display(g.name), kind: t("artistKind") })),
          ...r.albums.map((a) => ({ label: display(a.name), kind: t("albumKind") })),
          ...r.songs.map((s) => ({ label: s.title, kind: t("songKind") })),
        ].slice(0, 8);
        return drawSearch(c, w, h, {
          query,
          chars: SEARCH_CHARS,
          index,
          count: resultCount(r),
          preview,
          hint: t("searchHint"),
          emptyLabel: ctx.library.isEmpty ? musicEmpty() : t("noResults"),
          now,
        });
      },
    };
  };

  const playlistName = (path: string) => (path.split(/[\\/]/).pop() ?? path).replace(/\.[^.]+$/, "");

  /** Import from PC: drive → folders → playlist file. */
  const importFolder = (vol: Volume, parts: string[]): Screen => {
    let listing: DirListing | null = null;
    let requested = false;
    const path = joinPath(vol.mountPoint, parts);
    return {
      id: `import-${vol.id}-${parts.join("/")}`,
      title: parts.length ? parts[parts.length - 1] : vol.label,
      get empty() {
        return listing === null ? t("loading") : t("noPlaylistFiles");
      },
      items: () => {
        if (!requested) {
          requested = true;
          ctx.listPlaylistDir(path).then(
            (l) => {
              listing = l;
              ctx.refresh();
            },
            () => {
              listing = { dirs: [], playlists: [] };
              ctx.refresh();
            },
          );
        }
        if (!listing) return [];
        const items: MenuItem[] = listing.dirs.map((d) => ({
          id: `d-${d}`,
          label: d,
          chevron: true,
          open: () => importFolder(vol, [...parts, d]),
        }));
        for (const f of listing.playlists) {
          const full = joinPath(vol.mountPoint, [...parts, f]);
          items.push({
            id: `f-${f}`,
            label: f,
            checked: ctx.settings.playlists.includes(full),
            closeTo: "playlists",
            run: () => {
              if (!ctx.settings.playlists.includes(full)) ctx.update({ playlists: [...ctx.settings.playlists, full] });
            },
          });
        }
        return items;
      },
    };
  };

  const importDrives = (): Screen => ({
    id: "import",
    get title() {
      return t("importFromPc");
    },
    empty: t("noDrives"),
    items: () =>
      ctx.volumes.map((v) => ({ id: `vol-${v.id}`, label: v.label, chevron: true, open: () => importFolder(v, []) })),
  });

  /**
   * An imported playlist, read from disk when opened. Songs whose path does not
   * exist here (another PC, another drive letter) are matched to the library by
   * file name or by artist and title; the rest are shown grey.
   */
  const playlistScreen = (path: string): Screen => {
    let name = playlistName(path);
    let failed = false;
    let requested = false;
    let built: MenuItem[] | null = null;
    const norm = (x: string) => x.trim().toLowerCase();
    const build = (pl: PlaylistFile): MenuItem[] => {
      const byFile = new Map<string, Track>();
      const byName = new Map<string, Track>();
      for (const tr of ctx.library.tracks) {
        byFile.set(norm(tr.path.split(/[\\/]/).pop() ?? ""), tr);
        byName.set(`${norm(tr.artist)}\u001f${norm(tr.title)}`, tr);
      }
      const rows: { pos: number; track?: Track; label: string }[] = pl.tracks.map(([pos, tr]) => ({ pos, track: tr, label: tr.title }));
      for (const m of pl.missing) {
        const tr = byFile.get(norm(m.fileName)) ?? (m.title ? byName.get(`${norm(m.artist)}\u001f${norm(m.title)}`) : undefined);
        rows.push({ pos: m.position, track: tr, label: tr?.title ?? (m.title || m.fileName.replace(/\.[^.]+$/, "")) });
      }
      rows.sort((a, b) => a.pos - b.pos);
      const playable = rows.filter((r) => r.track).map((r) => r.track!);
      let k = 0;
      const items: MenuItem[] = rows.map((r, i) =>
        r.track ? songItem(playable, k++, r.label) : { id: `missing-${i}`, label: r.label, disabled: true },
      );
      items.push({
        id: "remove",
        label: t("removePlaylist"),
        closeTo: "playlists",
        run: () => ctx.update({ playlists: ctx.settings.playlists.filter((p) => p !== path) }),
      });
      return items;
    };
    return {
      id: `playlist-${path}`,
      get title() {
        return name;
      },
      get empty() {
        return failed ? t("noMusic") : t("loading");
      },
      items: () => {
        if (!requested) {
          requested = true;
          ctx.readPlaylist(path).then(
            (pl) => {
              name = pl.name || name;
              built = build(pl);
              ctx.refresh();
            },
            () => {
              failed = true;
              built = [
                {
                  id: "remove",
                  label: t("removePlaylist"),
                  closeTo: "playlists",
                  run: () => ctx.update({ playlists: ctx.settings.playlists.filter((p) => p !== path) }),
                },
              ];
              ctx.refresh();
            },
          );
        }
        return built ?? [];
      },
    };
  };

  /** Confirmation, like the original: Cancel first so a slip does no harm. */
  const confirm = (id: string, key: StringKey, action: () => void, to?: string): Screen => ({
    id,
    get title() {
      return t(key);
    },
    items: () => [
      { id: "cancel", label: t("cancel"), closeAfter: true, run: () => {} },
      { id: "ok", label: t(key), ...(to ? { closeTo: to } : { closeAfter: true }), run: action },
    ],
  });

  const nextPlaylistName = (): string => {
    const base = t("newPlaylist");
    const used = new Set(ctx.settings.savedPlaylists.map((p) => p.name));
    let n = 1;
    while (used.has(`${base} ${n}`)) n++;
    return `${base} ${n}`;
  };

  /** On-The-Go: songs added by holding the centre button; save or clear. */
  const onTheGo = (): Screen => ({
    id: "otg",
    get title() {
      return t("onTheGo");
    },
    get empty() {
      return t("otgHint");
    },
    items: () => {
      const list = tracksFor(ctx.settings.onTheGo);
      if (list.length === 0) return [];
      return [
        ...list.map((_, i) => songItem(list, i)),
        {
          id: "save",
          label: t("savePlaylist"),
          closeTo: "playlists",
          run: () =>
            ctx.update({
              savedPlaylists: [...ctx.settings.savedPlaylists, { name: nextPlaylistName(), paths: [...ctx.settings.onTheGo] }],
              onTheGo: [],
            }),
        },
        {
          id: "clear",
          label: t("clearPlaylist"),
          chevron: true,
          open: () => confirm("otg-clear", "clearPlaylist", () => ctx.update({ onTheGo: [] }), "playlists"),
        },
      ];
    },
  });

  const savedPlaylistScreen = (name: string): Screen =>
    musicScreen(`saved-${name}`, name, () => {
      const pl = ctx.settings.savedPlaylists.find((p) => p.name === name);
      const list = pl ? tracksFor(pl.paths) : [];
      return [
        ...list.map((_, i) => songItem(list, i)),
        {
          id: "remove",
          label: t("removePlaylist"),
          chevron: true,
          open: () =>
            confirm("saved-remove", "removePlaylist", () =>
              ctx.update({ savedPlaylists: ctx.settings.savedPlaylists.filter((p) => p.name !== name) }), "playlists"),
        },
      ];
    });

  const playlists = (): Screen => ({
    id: "playlists",
    get title() {
      return t("playlists");
    },
    items: () => [
      sub("otg", "onTheGo", onTheGo),
      ...ctx.settings.savedPlaylists.map((p, i) => ({
        id: `sp-${i}`,
        label: p.name,
        chevron: true,
        hold: () => addToOtg(tracksFor(p.paths)),
        open: () => savedPlaylistScreen(p.name),
      })),
      ...ctx.settings.playlists.map((p, i) => ({
        id: `pl-${i}`,
        label: playlistName(p),
        chevron: true,
        hold: () => {
          // Imported files are read on demand; add once read.
          ctx.readPlaylist(p).then((pl) => addToOtg(pl.tracks.map(([, tr]) => byPath().get(tr.path) ?? tr)), () => {});
          return true;
        },
        open: () => playlistScreen(p),
      })),
      sub("import", "importFromPc", importDrives),
    ],
  });

  /** Every Music menu entry; Settings → Music Menu chooses which are shown. */
  const musicEntries = (): MenuItem[] => {
      const lib = ctx.library;
      return [
        sub("coverflow", "coverFlow", coverFlow),
        sub("playlists", "playlists", playlists),
        sub("artists", "artists", () => artistsScreen("artists", t("artists"), () => lib.artists())),
        sub("albums", "albums", () => albumsScreen("albums", t("albums"), () => lib.albums())),
        sub("compilations", "compilations", () => albumsScreen("compilations", t("compilations"), () => lib.compilations())),
        sub("songs", "songs", () => songsScreen("songs", t("songs"), () => lib.songs())),
        sub("genres", "genres", () =>
          musicScreen("genres", t("genres"), () =>
            lib.genres().map((g, i) => ({
              id: `g${i}`, label: display(g.name), chevron: true,
              hold: () => addToOtg(lib.inAlbumOrder(g.tracks)), open: () => genreScreen(g),
            })),
          ),
        ),
        sub("composers", "composers", () =>
          musicScreen("composers", t("composers"), () =>
            lib.composers().map((g, i) => ({
              id: `c${i}`,
              label: g.name,
              chevron: true,
              hold: () => addToOtg(lib.inAlbumOrder(g.tracks)),
              open: () => songsScreen(`composer-${g.name}`, g.name, () => lib.inAlbumOrder(g.tracks)),
            })),
          ),
        ),
        sub("audiobooks", "audiobooks", () => songsScreen("audiobooks", t("audiobooks"), () => lib.audiobooks(), "noAudiobooks")),
        sub("search", "search", searchScreen),
      ];
  };

  const music = (): Screen => ({
    id: "music",
    get title() {
      return t("music");
    },
    items: () => {
      const hidden = ctx.settings.musicMenuHidden ?? [];
      return musicEntries().filter((i) => !hidden.includes(i.id));
    },
  });

  // ---------------------------------------------------------------- Radio (Podcasts)

  /** A list that is loaded once when first shown, then redraws. */
  const lazy = <T,>(load: () => Promise<T>) => {
    let value: T | null = null;
    let failed = false;
    let started = false;
    return {
      get(): T | null {
        if (!started) {
          started = true;
          load().then(
            (v) => {
              value = v;
              ctx.refresh();
            },
            () => {
              failed = true;
              ctx.refresh();
            },
          );
        }
        return value;
      },
      get failed() {
        return failed;
      },
    };
  };

  let regionNames: Intl.DisplayNames | null = null;
  let regionLang = "";
  const countryName = (code: string): string => {
    if (!code) return t("unknownCountry");
    const lang = ctx.settings.language;
    if (regionLang !== lang) {
      regionLang = lang;
      try {
        regionNames = new Intl.DisplayNames([lang], { type: "region" });
      } catch {
        regionNames = null;
      }
    }
    try {
      return regionNames?.of(code) ?? code;
    } catch {
      return code;
    }
  };
  const genreName = (g: string): string => {
    const key = `genre_${g}` as StringKey;
    const text = t(key);
    return text === key ? g : text;
  };
  const byName = (a: string, b: string) => a.localeCompare(b, ctx.settings.language);

  /** Stations of one country and/or genre; choosing one tunes in. */
  const stationsScreen = (filter: StationFilter): Screen => {
    const list = lazy(() => ctx.radioCatalog(filter));
    let items: MenuItem[] | null = null;
    return {
      id: `stations-${filter.country ?? "*"}-${filter.genre ?? "*"}`,
      get title() {
        if (filter.country && filter.genre) return `${countryName(filter.country)} · ${genreName(filter.genre)}`;
        return filter.country ? countryName(filter.country) : filter.genre ? genreName(filter.genre) : t("allStations");
      },
      get empty() {
        return list.get() === null && !list.failed ? t("loading") : t("noStations");
      },
      items: () => {
        const stations = list.get();
        if (!stations) return [];
        // Built once: lists can hold thousands of stations.
        items ??= stations.map((st, i) => ({
          id: `st-${st.slug}`,
          label: st.name,
          value: filter.genre || st.genre === "other" ? "" : genreName(st.genre),
          get checked() {
            return ctx.playback.radio !== null && ctx.playback.station?.slug === st.slug;
          },
          open: () => {
            void ctx.playback.playStation(stations, i, filter);
            return nowPlaying();
          },
        }));
        return items;
      },
    };
  };

  /** Countries (of a genre, if chosen); "All Countries" first when a genre is set. */
  const countriesScreen = (genre: string | null): Screen => {
    const list = lazy(() => ctx.radioCountries(genre));
    return {
      id: `countries-${genre ?? "*"}`,
      get title() {
        return genre ? genreName(genre) : t("countries");
      },
      get empty() {
        return list.get() === null && !list.failed ? t("loading") : t("noStations");
      },
      items: () => {
        const counts = list.get();
        if (!counts) return [];
        const items: MenuItem[] = [];
        if (genre) {
          const total = counts.reduce((a, c) => a + c.count, 0);
          items.push({ id: "all", label: t("allCountries"), value: String(total), chevron: true, open: () => stationsScreen({ country: null, genre }) });
        }
        const sorted = [...counts].sort((a, b) => (!a.id ? 1 : !b.id ? -1 : byName(countryName(a.id), countryName(b.id))));
        for (const c of sorted) {
          items.push({
            id: `c-${c.id || "none"}`,
            label: countryName(c.id),
            value: String(c.count),
            chevron: true,
            open: () => (genre ? stationsScreen({ country: c.id, genre }) : genresScreen(c.id)),
          });
        }
        return items;
      },
    };
  };

  /** Genres (in a country, if chosen); "All Stations" first when a country is set. */
  const genresScreen = (country: string | null): Screen => {
    const list = lazy(() => ctx.radioGenres(country));
    return {
      id: `genres-${country ?? "*"}`,
      get title() {
        return country !== null ? countryName(country) : t("genres");
      },
      get empty() {
        return list.get() === null && !list.failed ? t("loading") : t("noStations");
      },
      items: () => {
        const counts = list.get();
        if (!counts) return [];
        const items: MenuItem[] = [];
        if (country !== null) {
          items.push({ id: "all", label: t("allStations"), chevron: true, open: () => stationsScreen({ country, genre: null }) });
        }
        for (const g of counts) {
          items.push({
            id: `g-${g.id}`,
            label: genreName(g.id),
            value: String(g.count),
            chevron: true,
            open: () => (country !== null ? stationsScreen({ country, genre: g.id }) : countriesScreen(g.id)),
          });
        }
        return items;
      },
    };
  };

  /** A station from History or the recent list: looked up in the catalogue, else played as remembered. */
  const playRemembered = (id: string | undefined, name: string, url: string) => {
    const fallback: Station = { slug: id ?? url, name, genre: "", description: "", pageUrl: "", streamUrl: url, image: null };
    if (!id) {
      void ctx.playback.playStation([fallback], 0);
      return;
    }
    void ctx.radioStation(id).then(
      (st) => ctx.playback.playStation([st ?? fallback], 0),
      () => ctx.playback.playStation([fallback], 0),
    );
  };

  const recentStations = () => {
    const seen = new Set<string>();
    const out: HistoryEntry[] = [];
    for (const e of ctx.settings.history) {
      if (!e.station) continue;
      const key = e.stationId ?? e.station;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(e);
      if (out.length >= 30) break;
    }
    return out;
  };

  const recentScreen = (): Screen => ({
    id: "recent-stations",
    get title() {
      return t("recentStations");
    },
    empty: t("noStations"),
    items: () =>
      recentStations().map((e, i) => ({
        id: `r${i}`,
        label: e.station,
        open: () => {
          playRemembered(e.stationId, e.station, e.path);
          return nowPlaying();
        },
      })),
  });

  /** Podcasts = internet radio from the world catalogue, filtered by country and genre. */
  const podcasts = (): Screen => ({
    id: "podcasts",
    get title() {
      return t("radioTitle");
    },
    items: () => {
      const items: MenuItem[] = [
        { id: "countries", label: t("countries"), chevron: true, open: () => countriesScreen(null) },
        { id: "genres", label: t("genres"), chevron: true, open: () => genresScreen(null) },
      ];
      if (recentStations().length) items.push({ id: "recent", label: t("recentStations"), chevron: true, open: recentScreen });
      return items;
    },
  });

  // ---------------------------------------------------------------- Extras

  // Keeps running while you are elsewhere in the menus.
  const stopwatch = new Stopwatch();

  const stopwatchTimer = (): Screen => ({
    id: "stopwatch-timer",
    get title() {
      return t("stopwatch");
    },
    items: () => [],
    onRotate: () => false,
    onButton: (b) => {
      if (b !== "play") return false; // ⏮ ⏭ still control the music
      stopwatch.toggle();
      return true;
    },
    onSelect: () => {
      if (stopwatch.running) {
        stopwatch.lap();
        return true;
      }
      const log = stopwatch.reset();
      if (!log) return false;
      ctx.update({ stopwatchLogs: [log, ...ctx.settings.stopwatchLogs].slice(0, 20) });
      return true;
    },
    onClick: (_x, y, _w, h) => {
      // Mouse: upper half starts/stops, lower half is the centre button.
      if (y < h / 2) {
        stopwatch.toggle();
        return true;
      }
      return stopwatchTimer().onSelect!() as boolean;
    },
    draw: (c, w, h) =>
      drawStopwatch(c, w, h, {
        elapsed: stopwatch.elapsed(),
        lap: stopwatch.currentLap(),
        laps: stopwatch.laps,
        running: stopwatch.running,
        lapLabel: t("lap"),
        hint: t("stopwatchHint"),
      }),
  });

  const logLabel = (started: number): string => {
    const d = new Date(started);
    const two = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
  };

  const stopwatchLog = (started: number): Screen => ({
    id: `stopwatch-log-${started}`,
    title: logLabel(started),
    items: () => {
      const log = ctx.settings.stopwatchLogs.find((l) => l.started === started);
      if (!log) return [];
      const total = log.laps.reduce((a, b) => a + b, 0);
      return [
        { id: "total", label: t("total"), value: formatStopwatch(total) },
        ...log.laps.map((ms, i) => ({ id: `lap${i}`, label: `${t("lap")} ${i + 1}`, value: formatStopwatch(ms) })),
      ];
    },
  });

  const stopwatchMenu = (): Screen => ({
    id: "stopwatch",
    get title() {
      return t("stopwatch");
    },
    items: () => {
      const logs = ctx.settings.stopwatchLogs;
      const items: MenuItem[] = [
        {
          id: "timer",
          label: t("timer"),
          value: stopwatch.isReset ? "" : formatStopwatch(stopwatch.elapsed()).replace(/\.\d\d$/, ""),
          chevron: true,
          open: stopwatchTimer,
        },
        ...logs.map((l) => ({
          id: `log-${l.started}`,
          label: logLabel(l.started),
          value: formatStopwatch(l.laps.reduce((a, b) => a + b, 0)).replace(/\.\d\d$/, ""),
          chevron: true,
          open: () => stopwatchLog(l.started),
        })),
      ];
      if (logs.length) {
        items.push({
          id: "clear",
          label: t("clearLogs"),
          chevron: true,
          open: () => confirm("stopwatch-clear", "clearLogs", () => ctx.update({ stopwatchLogs: [] }), "stopwatch"),
        });
      }
      return items;
    },
  });

  // ---------------------------------------------------------------- History

  const locale = () => ({ en: "en-GB", lt: "lt-LT", ru: "ru-RU" })[ctx.settings.language];

  /** "14:32", "Yesterday 14:32", "15 Oct 14:32": the time scale of the list. */
  const whenLabel = (at: number, now = Date.now()): string => {
    const d = new Date(at);
    const time = formatTime(d);
    const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const days = Math.round((startOfDay(new Date(now)) - startOfDay(d)) / 86400000);
    if (days === 0) return time;
    if (days === 1) return `${t("yesterday")} ${time}`;
    const opts: Intl.DateTimeFormatOptions =
      d.getFullYear() === new Date(now).getFullYear() ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" };
    return `${d.toLocaleDateString(locale(), opts)} ${time}`;
  };

  /**
   * History: every song that started playing, newest first, with when it
   * played. Library songs play again from there; radio songs tune the station.
   * The list updates while it is open.
   */
  const historyScreen = (): Screen => ({
    id: "history",
    get title() {
      return t("history");
    },
    get empty() {
      return t("noHistory");
    },
    items: () => {
      const entries = ctx.settings.history;
      if (entries.length === 0) return [];
      const lib = byPath();
      const tracks: Track[] = [];
      const pos = new Map<HistoryEntry, number>();
      for (const e of entries) {
        const tr = !e.station ? lib.get(e.path) : undefined;
        if (tr) {
          pos.set(e, tracks.length);
          tracks.push(tr);
        }
      }
      const items: MenuItem[] = entries.map((e, i) => {
        const label = e.station ? `${e.title}` : e.title;
        const base = { id: `h${i}-${e.at}`, label, value: whenLabel(e.at) };
        if (e.station) {
          return { ...base, open: () => { playRemembered(e.stationId, e.station, e.path); return nowPlaying(); } };
        }
        const k = pos.get(e);
        if (k === undefined) return { ...base, disabled: true };
        // Played again in history order (oldest of the rest last), like a playlist.
        return { ...songItem(tracks, k, label), id: base.id, value: base.value };
      });
      items.push({
        id: "clear",
        label: t("clearHistory"),
        chevron: true,
        open: () => confirm("history-clear", "clearHistory", () => ctx.update({ history: [] }), "extras"),
      });
      return items;
    },
  });

  // ---------------------------------------------------------------- Clocks

  const clockZones = (): string[] => (ctx.settings.clocks.length ? ctx.settings.clocks : [localZone()]);

  const dateLabel = (zone: string): string =>
    new Date().toLocaleDateString(locale(), { timeZone: zone, weekday: "long", day: "numeric", month: "long" });

  /** Region → city; `onPick` adds a clock or replaces one. */
  const cityPicker = (onPick: (zone: string) => void): Screen => ({
    id: "clock-regions",
    get title() {
      return t("addClock");
    },
    items: () =>
      REGIONS.map((r) => ({
        id: r,
        label: t(r),
        chevron: true,
        open: (): Screen => ({
          id: `clock-region-${r}`,
          title: t(r),
          items: () =>
            CITIES[r].map((c) => ({
              id: c.zone,
              label: c.name,
              value: hhmm(zonedTime(c.zone, Date.now())),
              closeTo: "clocks",
              run: () => onPick(c.zone),
            })),
        }),
      })),
  });

  const clockFace = (index: number): Screen => ({
    id: `clock-${index}`,
    get title() {
      return cityName(clockZones()[index] ?? localZone());
    },
    items: () => [],
    onRotate: () => false,
    // ▸ / centre: options for this clock.
    onSelect: () => clockOptions(index),
    onClick: () => clockOptions(index),
    draw: (c, w, h) => {
      const zone = clockZones()[index] ?? localZone();
      const time = zonedTime(zone, Date.now());
      const off = offsetFromLocal(zone, Date.now());
      return drawClock(c, w, h, {
        city: cityName(zone),
        time,
        dateLabel: dateLabel(zone),
        offsetLabel: off === 0 ? t("localTime") : formatOffset(off),
        night: time.hours >= 20 || time.hours < 7,
      });
    },
  });

  const setClocks = (zones: string[]) => ctx.update({ clocks: zones });

  const clockOptions = (index: number): Screen => ({
    id: `clock-options-${index}`,
    get title() {
      return cityName(clockZones()[index] ?? localZone());
    },
    items: () => [
      {
        id: "change",
        label: t("changeCity"),
        chevron: true,
        open: () => cityPicker((zone) => { const z = [...clockZones()]; z[index] = zone; setClocks(z); }),
      },
      ...(clockZones().length > 1
        ? [{ id: "delete", label: t("deleteClock"), closeTo: "clocks", run: () => setClocks(clockZones().filter((_, i) => i !== index)) }]
        : []),
    ],
  });

  const clocks = (): Screen => ({
    id: "clocks",
    get title() {
      return t("clocks");
    },
    items: () => [
      ...clockZones().map((zone, i) => ({
        id: `clock-${i}-${zone}`,
        label: cityName(zone),
        value: hhmm(zonedTime(zone, Date.now())),
        chevron: true,
        open: () => clockFace(i),
      })),
      { id: "add", label: t("addClock"), chevron: true, open: () => cityPicker((zone) => setClocks([...clockZones(), zone])) },
    ],
  });

  // ---------------------------------------------------------------- Pickers

  /**
   * Digit fields set with the wheel; ▸ (or centre) moves to the next field,
   * the last one finishes. Keyboard digits type directly.
   */
  const pickerScreen = (o: {
    id: string;
    title: () => string;
    caption: () => string;
    values: number[];
    max: number[];
    pad: number;
    separator: string;
    masked?: boolean;
    lock?: boolean;
    modal?: boolean;
    done: (values: number[]) => "back" | "retry" | Screen | void;
    error?: () => string;
  }): Screen => {
    let index = 0;
    const values = [...o.values];
    let showError = false;
    const advance = (): boolean | Screen | "back" => {
      if (index < values.length - 1) {
        index++;
        return true;
      }
      const r = o.done(values);
      if (r === "retry") {
        index = 0;
        values.fill(0);
        showError = true;
        return true;
      }
      if (r && typeof r === "object") return r;
      return "back";
    };
    return {
      id: o.id,
      get title() {
        return o.title();
      },
      items: () => [],
      transient: !o.modal,
      onBack: o.modal ? () => true : undefined,
      onButton: o.modal ? () => true : undefined,
      onRotate: (ticks) => {
        const m = o.max[index] + 1;
        values[index] = (((values[index] + ticks) % m) + m) % m;
        showError = false;
        return true;
      },
      onSelect: advance,
      onText: (ch) => {
        if (!/^\d$/.test(ch)) return false;
        values[index] = Math.min(o.max[index], Number(ch));
        return advance();
      },
      draw: (c, w, h) =>
        drawPicker(c, w, h, {
          fields: values.map((v) => String(v).padStart(o.pad, "0")),
          index,
          separator: o.separator,
          masked: o.masked,
          caption: o.caption(),
          hint: t("pickerHint"),
          error: showError ? o.error?.() : undefined,
          lock: o.lock,
        }),
    };
  };

  // ---------------------------------------------------------------- Screen Lock

  const lockScreen = (): Screen =>
    pickerScreen({
      id: "locked",
      title: () => t("screenLock"),
      caption: () => t("enterCombination"),
      values: [0, 0, 0, 0],
      max: [9, 9, 9, 9],
      pad: 1,
      separator: "",
      lock: true,
      modal: true,
      error: () => t("wrongCombination"),
      done: (v) => {
        if (v.join("") !== ctx.settings.lockCode) return "retry";
        ctx.update({ locked: false });
        return "back";
      },
    });

  const setCombination = (then?: () => Screen): Screen =>
    pickerScreen({
      id: "set-combination",
      title: () => t("setCombination"),
      caption: () => t("newCombination"),
      values: (ctx.settings.lockCode || "0000").split("").map(Number),
      max: [9, 9, 9, 9],
      pad: 1,
      separator: "",
      done: (v) => {
        ctx.update({ lockCode: v.join("") });
        return then ? then() : "back";
      },
    });

  const lockNow = (): Screen => {
    ctx.update({ locked: true });
    return lockScreen();
  };

  const screenLock = (): Screen => ({
    id: "screenlock",
    get title() {
      return t("screenLock");
    },
    items: () => [
      {
        id: "lock",
        label: t("lock"),
        // Without a combination yet, set one first, then lock.
        open: () => (ctx.settings.lockCode ? lockNow() : setCombination(lockNow)),
      },
      { id: "set", label: t("setCombination"), chevron: true, open: () => setCombination() },
    ],
  });

  // ---------------------------------------------------------------- Files (Notes, Calendars)
  const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path;
  const baseName = (path: string) => fileName(path).replace(/\.[^.]+$/, "");

  /** Loads a folder listing once and redraws when it arrives. */
  const lazyListing = (path: string, exts: string[]) => {
    let listing: FileListing | null = null;
    let requested = false;
    return () => {
      if (!requested) {
        requested = true;
        ctx.listFiles(path, exts).then(
          (l) => {
            listing = l;
            ctx.refresh();
          },
          () => {
            listing = { dirs: [], files: [] };
            ctx.refresh();
          },
        );
      }
      return listing;
    };
  };

  /** Drive list → folders → files; `pickFolder` adds "Use This Folder", `pickFile` makes files selectable. */
  const browseFiles = (o: {
    id: string;
    exts: string[];
    pickFolder?: (path: string) => void;
    pickFile?: (path: string) => void;
    closeTo: string;
    emptyKey: StringKey;
  }): Screen => {
    const folder = (vol: Volume, parts: string[]): Screen => {
      const path = joinPath(vol.mountPoint, parts);
      const get = lazyListing(path, o.exts);
      return {
        id: `${o.id}-${vol.id}-${parts.join("/")}`,
        title: parts.length ? parts[parts.length - 1] : vol.label,
        get empty() {
          return get() === null ? t("loading") : t(o.emptyKey);
        },
        items: () => {
          const l = get();
          const items: MenuItem[] = [];
          if (o.pickFolder) {
            items.push({ id: "use", label: t("useThisFolder"), closeTo: o.closeTo, run: () => o.pickFolder!(path) });
          }
          if (!l) return items;
          for (const d of l.dirs) items.push({ id: `d-${d}`, label: d, chevron: true, open: () => folder(vol, [...parts, d]) });
          if (o.pickFile) {
            for (const f of l.files) {
              items.push({ id: `f-${f}`, label: f, closeTo: o.closeTo, run: () => o.pickFile!(joinPath(vol.mountPoint, [...parts, f])) });
            }
          }
          return items;
        },
      };
    };
    return {
      id: o.id,
      get title() {
        return t("chooseFolder");
      },
      empty: t("noDrives"),
      items: () => ctx.volumes.map((v) => ({ id: `vol-${v.id}`, label: v.label, chevron: true, open: () => folder(v, []) })),
    };
  };

  // ---------------------------------------------------------------- Notes
  const NOTE_EXTS = ["txt", "md", "text", "log", "csv"];

  /** A text page that scrolls with the wheel. */
  const textScreen = (id: string, title: string, load: () => Promise<{ heading?: string; text: string }>): Screen => {
    const page: TextPage = { text: "", scroll: 0 };
    let state: "loading" | "ok" | "error" = "loading";
    load().then(
      (r) => {
        page.heading = r.heading;
        page.text = r.text;
        state = "ok";
        ctx.refresh();
      },
      () => {
        state = "error";
        ctx.refresh();
      },
    );
    let maxScroll = 0;
    return {
      id,
      title,
      items: () => [],
      onRotate: (ticks) => {
        const next = Math.max(0, Math.min(maxScroll, page.scroll + ticks));
        if (next === page.scroll) return false;
        page.scroll = next;
        return true;
      },
      onButton: (b) => {
        if (b === "play") return false;
        // ⏮ ⏭ page up / down.
        const rows = Math.floor(200 / TEXT_LINE_H) - 1;
        page.scroll = Math.max(0, Math.min(maxScroll, page.scroll + (b === "next" ? rows : -rows)));
        return true;
      },
      onSelect: () => "back",
      draw: (c, w, h) => {
        if (state !== "ok") {
          c.textAlign = "center";
          c.textBaseline = "middle";
          c.font = "500 14px Inter, sans-serif";
          c.fillStyle = "#6a6e75";
          c.fillText(state === "loading" ? t("loading") : t("cannotOpen"), w / 2, h / 2);
          return false;
        }
        maxScroll = drawTextPage(c, w, h, page);
        return false;
      },
    };
  };

  const notesScreen = (dir?: string): Screen => {
    const root = dir === undefined;
    const path = dir ?? ctx.settings.notesFolder ?? "";
    const get = path ? lazyListing(path, NOTE_EXTS) : () => ({ dirs: [], files: [] });
    return {
      id: root ? "notes" : `notes-${path}`,
      get title() {
        return root ? t("notes") : fileName(path);
      },
      get empty() {
        return get() === null ? t("loading") : t("noNotes");
      },
      items: () => {
        const l = get();
        const items: MenuItem[] = [];
        if (l) {
          for (const d of l.dirs) items.push({ id: `d-${d}`, label: d, chevron: true, open: () => notesScreen(joinPath(path, [d])) });
          for (const f of l.files) {
            const full = joinPath(path, [f]);
            items.push({
              id: `f-${f}`, label: baseName(f), chevron: true,
              open: () => textScreen(`note-${full}`, baseName(f), async () => ({ text: await ctx.readText(full) })),
            });
          }
        }
        if (root) {
          items.push({
            id: "choose", label: t("chooseFolder"), chevron: true,
            value: path ? fileName(path) : undefined,
            open: () => browseFiles({
              id: "notes-browse", exts: NOTE_EXTS, closeTo: "extras", emptyKey: "noNotes",
              pickFolder: (p) => ctx.update({ notesFolder: p }),
            }),
          });
        }
        return items;
      },
    };
  };

  // ---------------------------------------------------------------- Photos
  const PHOTO_EXTS = ["jpg", "jpeg", "png", "gif", "webp", "bmp"];
  let photoStore: PhotoStore | null = null;
  const photos = () => (photoStore ??= new PhotoStore((p) => ctx.photoUrl(p), () => ctx.refresh()));
  const SLIDE_SECS = [2, 3, 5, 10, 20];
  const FADE_MS = 600;

  const emptyText = (c: CanvasRenderingContext2D, w: number, h: number, text: string) => {
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = "500 14px Inter, sans-serif";
    c.fillStyle = "#6a6e75";
    c.fillText(text, w / 2, h / 2);
  };

  /** One photo full screen; the wheel goes through them, ⏯ starts/stops the slideshow. */
  const photoScreen = (all: string[], start: number, slideshow: boolean): Screen => {
    let order = all;
    let index = start;
    if (slideshow && ctx.settings.slideShuffle) {
      order = shuffled(all, all[start]);
      index = 0;
    }
    let playing = slideshow;
    let shownAt = performance.now();
    let prev: string | null = null;
    let fadeStart = 0;
    const go = (to: number, fade: boolean) => {
      const n = order.length;
      if (to < 0 || to >= n) {
        if (!playing || !ctx.settings.slideRepeat) {
          playing = false;
          return false;
        }
        to = ((to % n) + n) % n;
      }
      prev = fade && ctx.settings.slideFade !== false ? order[index] : null;
      fadeStart = performance.now();
      index = to;
      shownAt = performance.now();
      return true;
    };
    return {
      id: "photo",
      get title() {
        return `${index + 1} / ${order.length}`;
      },
      items: () => [],
      onRotate: (ticks) => go(index + Math.sign(ticks), false),
      onButton: (b) => {
        if (b === "play") {
          playing = !playing;
          shownAt = performance.now();
          return true;
        }
        return go(index + (b === "next" ? 1 : -1), playing);
      },
      onSelect: () => "back",
      onClick: (x, _y, w) => go(index + (x < w / 2 ? -1 : 1), false),
      draw: (c, w, h, now) => {
        const store = photos();
        const secs = ctx.settings.slideSecs ?? 3;
        if (playing && now - shownAt >= secs * 1000) go(index + 1, true);
        if (playing) store.preload(order[(index + 1) % order.length]);
        const fade = prev ? Math.min(1, (now - fadeStart) / FADE_MS) : 1;
        const prevImg = prev ? store.photo(prev) : null;
        if (fade >= 1) prev = null;
        const name = order[index].split(/[\\/]/).pop() ?? "";
        drawPhoto(c, w, h, { img: store.photo(order[index]), prev: prevImg, fade, caption: name, playing });
        // Keep drawing while the slideshow runs or a fade is in progress.
        return playing || fade < 1;
      },
    };
  };

  /** Thumbnail grid of a folder's photos (all levels). */
  const gridScreen = (id: string, title: string, folder: string): Screen => {
    let paths: string[] | null = null;
    let requested = false;
    let selected = 0;
    let top = 0;
    const load = () => {
      if (requested) return;
      requested = true;
      ctx.findFiles(folder, PHOTO_EXTS).then(
        (p) => {
          paths = p;
          ctx.refresh();
        },
        () => {
          paths = [];
          ctx.refresh();
        },
      );
    };
    const select = (i: number) => {
      if (!paths || paths.length === 0) return false;
      const next = Math.max(0, Math.min(paths.length - 1, i));
      if (next === selected) return false;
      selected = next;
      const row = Math.floor(selected / GRID_COLS);
      if (row < top) top = row;
      if (row >= top + GRID_ROWS) top = row - GRID_ROWS + 1;
      return true;
    };
    return {
      id,
      title,
      items: () => [],
      onRotate: (ticks) => select(selected + ticks),
      onSelect: () => (paths && paths.length ? photoScreen(paths, selected, false) : false),
      onButton: (b) => {
        if (!paths || paths.length === 0) return false;
        if (b === "play") return photoScreen(paths, selected, true);
        return select(selected + (b === "next" ? 1 : -1) * GRID_COLS * GRID_ROWS);
      },
      onClick: (x, y, w, h) => {
        if (!paths) return false;
        const { size, gap, x0, y0 } = gridCell(w, h);
        const col = Math.floor((x - x0) / (size + gap));
        const row = Math.floor((y - y0) / (size + gap));
        if (col < 0 || col >= GRID_COLS || row < 0 || row >= GRID_ROWS) return false;
        const i = (top + row) * GRID_COLS + col;
        if (i >= paths.length) return false;
        if (i === selected) return photoScreen(paths, i, false);
        selected = i;
        return true;
      },
      draw: (c, w, h) => {
        load();
        if (!paths) emptyText(c, w, h, t("loading"));
        else if (paths.length === 0) emptyText(c, w, h, t("noPhotos"));
        else drawPhotoGrid(c, w, h, { paths, selected, top, store: photos() });
        return false;
      },
    };
  };

  const slideshowSettings = (): Screen => ({
    id: "slideshow-settings",
    get title() {
      return t("slideshowSettings");
    },
    items: () => {
      const s = ctx.settings;
      const secs = s.slideSecs ?? 3;
      return [
        {
          id: "time", label: t("timePerSlide"), value: `${secs} ${t("seconds")}`, chevron: true,
          open: () => choiceList("time-per-slide", "timePerSlide", SLIDE_SECS.map((v) => ({ value: v, label: `${v} ${t("seconds")}` })),
            () => ctx.settings.slideSecs ?? 3, (v) => ctx.update({ slideSecs: v })),
        },
        { id: "repeat", label: t("repeat"), value: onOff(!!s.slideRepeat), run: () => ctx.update({ slideRepeat: !s.slideRepeat }) },
        { id: "shuffle", label: t("shufflePhotos"), value: onOff(!!s.slideShuffle), run: () => ctx.update({ slideShuffle: !s.slideShuffle }) },
        { id: "fade", label: t("transitions"), value: onOff(s.slideFade !== false), run: () => ctx.update({ slideFade: s.slideFade === false }) },
      ];
    },
  });

  const photosScreen = (): Screen => {
    const root = ctx.settings.photosFolder ?? "";
    const get = root ? lazyListing(root, []) : () => ({ dirs: [], files: [] });
    return {
      id: "photos",
      get title() {
        return t("photos");
      },
      items: () => {
        const items: MenuItem[] = [];
        const folder = ctx.settings.photosFolder ?? "";
        if (folder) {
          items.push({ id: "all", label: t("allPhotos"), chevron: true, open: () => gridScreen("photos-all", t("allPhotos"), folder) });
          for (const d of get()?.dirs ?? []) {
            items.push({ id: `album-${d}`, label: d, chevron: true, open: () => gridScreen(`photos-${d}`, d, joinPath(folder, [d])) });
          }
        }
        items.push({ id: "slides", label: t("slideshowSettings"), chevron: true, open: slideshowSettings });
        items.push({
          id: "choose", label: t("chooseFolder"), chevron: true, value: folder ? fileName(folder) : undefined,
          open: () => browseFiles({
            id: "photos-browse", exts: [], closeTo: "main", emptyKey: "noPhotos",
            pickFolder: (p) => ctx.update({ photosFolder: p }),
          }),
        });
        return items;
      },
    };
  };

  // ---------------------------------------------------------------- Games
  const brickScreen = (): Screen => {
    const game = new BrickGame();
    let last = 0;
    return {
      id: "game-bricks",
      get title() {
        return t("bricks");
      },
      items: () => [],
      onRotate: (ticks) => {
        game.move(ticks);
        return true;
      },
      onSelect: () => {
        game.action();
        return true;
      },
      onButton: (b) => {
        if (b === "play") {
          if (game.phase === "playing" || game.phase === "paused") game.action();
          return true;
        }
        return false;
      },
      onClick: () => {
        game.action();
        return true;
      },
      draw: (c, w, h, now) => {
        if (last) game.step((now - last) / 1000);
        last = now;
        drawBrick(c, w, h, game, {
          score: t("score"), lives: t("lives"), level: t("level"),
          ready: t("pressToStart"), paused: t("paused"), lost: t("gameOver"), won: t("levelDone"),
        });
        if (game.phase !== "playing") last = 0;
        return game.phase === "playing";
      },
    };
  };

  const quizScreen = (): Screen => {
    const pool = quizPool(ctx.library.tracks);
    const used = new Set<string>();
    let roundNo = 0;
    let score = 0;
    let right = 0;
    let round: QuizRound | null = null;
    let selected = 0;
    let startedAt = 0;
    let reveal: { right: number; chosen: number; at: number } | null = null;
    let finished = false;
    const next = () => {
      if (roundNo >= QUIZ_ROUNDS) {
        finished = true;
        round = null;
        ctx.playback.pause();
        return;
      }
      round = makeRound(pool, used);
      if (!round) {
        finished = true;
        return;
      }
      roundNo++;
      selected = 0;
      reveal = null;
      startedAt = performance.now();
      ctx.playback.preview(round.track, round.startMs);
    };
    const answer = (i: number) => {
      if (!round || reveal) return;
      const r = round.options.indexOf(round.track);
      const left = Math.max(0, QUIZ_SECONDS - (performance.now() - startedAt) / 1000);
      if (i === r) {
        score += points(left);
        right++;
      }
      reveal = { right: r, chosen: i, at: performance.now() };
    };
    if (pool.length >= 4) next();
    else finished = true;
    return {
      id: "game-quiz",
      get title() {
        return t("musicQuiz");
      },
      items: () => [],
      onRotate: (ticks) => {
        if (!round || reveal) return false;
        const n = Math.max(0, Math.min(3, selected + ticks));
        if (n === selected) return false;
        selected = n;
        return true;
      },
      onSelect: () => {
        if (finished) {
          if (pool.length < 4) return "back";
          roundNo = 0;
          score = 0;
          right = 0;
          used.clear();
          finished = false;
          next();
          return true;
        }
        if (reveal) {
          next();
          return true;
        }
        answer(selected);
        return true;
      },
      onBack: () => {
        ctx.playback.pause();
        return false;
      },
      onClick: (_x, y) => {
        if (finished || !round) return false;
        const i = Math.floor((y - 66) / 36);
        if (i < 0 || i > 3) return false;
        selected = i;
        answer(i);
        return true;
      },
      draw: (c, w, h, now) => {
        if (finished) {
          drawQuiz(c, w, h, {
            question: "", round: "", options: [], selected: 0, reveal: null, timeLeft: 0, score: "",
            result: pool.length < 4 ? [t("quizNeedsSongs"), "", ""] : [t("quizDone"), String(score), `${right} / ${QUIZ_ROUNDS} · ${t("pressToPlayAgain")}`],
          });
          return false;
        }
        if (!round) return false;
        const elapsed = (now - startedAt) / 1000;
        if (!reveal && elapsed >= QUIZ_SECONDS) answer(-1);
        // After showing the answer for a moment, the next round starts by itself.
        if (reveal && now - reveal.at > 2500) next();
        if (!round) return true;
        drawQuiz(c, w, h, {
          question: t("whichSong"),
          round: `${roundNo} / ${QUIZ_ROUNDS}`,
          options: round.options.map((o) => (o.artist ? `${o.title} – ${o.artist}` : o.title)),
          selected,
          reveal,
          timeLeft: reveal ? 0 : Math.max(0, 1 - elapsed / QUIZ_SECONDS),
          score: `${t("score")} ${score}`,
          result: null,
        });
        return true;
      },
    };
  };

  const gamesScreen = (): Screen => ({
    id: "games",
    get title() {
      return t("games");
    },
    items: () => [
      { id: "bricks", label: t("bricks"), chevron: true, open: brickScreen },
      { id: "quiz", label: t("musicQuiz"), chevron: true, open: quizScreen },
    ],
  });

  // ---------------------------------------------------------------- Legal
  const legalScreen = (): Screen =>
    textScreen("legal", t("legal"), async () => ({ heading: `WheelDesk ${ctx.appVersion}`, text: LEGAL_TEXT }));

  // ---------------------------------------------------------------- Calendars
  const loadEvents = async (paths: string[]): Promise<CalEvent[]> => {
    const all = await Promise.all(
      paths.map((p) => ctx.readText(p).then((txt) => parseIcs(txt, baseName(p)), () => [] as CalEvent[])),
    );
    return all.flat();
  };

  const timeText = formatTime;
  const occLabel = (o: Occurrence) => `${o.event.allDay ? t("allDay") : timeText(o.start)}  ${o.event.summary || "—"}`;

  const eventScreen = (o: Occurrence): Screen => {
    const e = o.event;
    const date = o.start.toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const when = e.allDay ? t("allDay") : `${timeText(o.start)} – ${timeText(o.end)}`;
    const lines = [date, when];
    if (e.location) lines.push(e.location);
    if (e.calendar) lines.push(`${t("calendar")}: ${e.calendar}`);
    if (e.description) lines.push("", e.description);
    return textScreen(`event-${e.uid}-${o.start.getTime()}`, t("event"), async () => ({ heading: e.summary || "—", text: lines.join("\n") }));
  };

  const dayScreen = (events: CalEvent[], day: Date): Screen => ({
    id: `day-${day.getTime()}`,
    get title() {
      return day.toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" });
    },
    empty: t("noEvents"),
    items: () =>
      occurrences(events, day, addDays(day, 1)).map((o, i) => ({
        id: `e${i}`, label: occLabel(o), chevron: true, open: () => eventScreen(o),
      })),
  });

  const monthScreen = (title: string, paths: string[]): Screen => {
    let selected = dayStart(new Date());
    let events: CalEvent[] | null = null;
    loadEvents(paths).then((e) => {
      events = e;
      ctx.refresh();
    });
    let busyKey = "";
    let busy = new Set<number>();
    const busyDays = () => {
      const key = `${selected.getFullYear()}-${selected.getMonth()}-${events?.length ?? -1}`;
      if (key !== busyKey && events) {
        busyKey = key;
        const from = new Date(selected.getFullYear(), selected.getMonth(), 1);
        const to = new Date(selected.getFullYear(), selected.getMonth() + 1, 1);
        busy = new Set();
        for (const o of occurrences(events, from, to)) {
          // Mark every day the event covers within this month.
          for (let d = dayStart(o.start < from ? from : o.start); d < o.end && d < to; d = addDays(d, 1)) busy.add(d.getDate());
        }
      }
      return busy;
    };
    const weekdays = Array.from({ length: 7 }, (_, i) =>
      new Date(2024, 0, 1 + i).toLocaleDateString(locale(), { weekday: "short" }).replace(".", "").slice(0, 2),
    );
    return {
      id: `month-${paths.join("|")}`,
      title,
      items: () => [],
      onRotate: (ticks) => {
        selected = addDays(selected, ticks);
        return true;
      },
      onButton: (b) => {
        if (b === "play") {
          selected = dayStart(new Date());
          return true;
        }
        const d = selected.getDate();
        const m = selected.getMonth() + (b === "next" ? 1 : -1);
        const last = new Date(selected.getFullYear(), m + 1, 0).getDate();
        selected = new Date(selected.getFullYear(), m, Math.min(d, last));
        return true;
      },
      onSelect: () => (events ? dayScreen(events, selected) : false),
      onClick: (x, y, w, h) => {
        // Mouse: click a day cell.
        const cellW = Math.floor((w - 12) / 7);
        const x0 = Math.round((w - cellW * 7) / 2);
        const first = new Date(selected.getFullYear(), selected.getMonth(), 1);
        const lead = (first.getDay() + 6) % 7;
        const days = new Date(selected.getFullYear(), selected.getMonth() + 1, 0).getDate();
        const rows = Math.ceil((lead + days) / 7);
        const gridTop = 36;
        const cellH = Math.min(26, Math.floor((h - gridTop - 26) / rows));
        const col = Math.floor((x - x0) / cellW);
        const row = Math.floor((y - gridTop) / cellH);
        const d = row * 7 + col - lead + 1;
        if (col < 0 || col > 6 || row < 0 || d < 1 || d > days) return false;
        const day = new Date(selected.getFullYear(), selected.getMonth(), d);
        if (day.getTime() === selected.getTime() && events) return dayScreen(events, day);
        selected = day;
        return true;
      },
      draw: (c, w, h) => {
        const todays = events ? occurrences(events, selected, addDays(selected, 1)) : [];
        const footer = events === null ? t("loading") : todays.length ? occLabel(todays[0]) + (todays.length > 1 ? `  (+${todays.length - 1})` : "") : t("noEvents");
        const mt = selected.toLocaleDateString(locale(), { month: "long", year: "numeric" });
        return drawMonth(c, w, h, {
          selected,
          today: new Date(),
          busy: busyDays(),
          monthTitle: mt.charAt(0).toUpperCase() + mt.slice(1),
          weekdays,
          footer,
        });
      },
    };
  };

  const calendarsScreen = (): Screen => ({
    id: "calendars",
    get title() {
      return t("calendars");
    },
    items: () => {
      const cals = ctx.settings.calendars ?? [];
      const items: MenuItem[] = [];
      if (cals.length > 1) items.push({ id: "all", label: t("allCalendars"), chevron: true, open: () => monthScreen(t("allCalendars"), cals) });
      for (const p of cals) items.push({ id: `cal-${p}`, label: baseName(p), chevron: true, open: () => monthScreen(baseName(p), [p]) });
      items.push({
        id: "add", label: t("addCalendar"), chevron: true,
        open: () => browseFiles({
          id: "cal-browse", exts: ["ics"], closeTo: "calendars", emptyKey: "noIcsFiles",
          pickFile: (p) => {
            if (!cals.includes(p)) ctx.update({ calendars: [...(ctx.settings.calendars ?? []), p] });
          },
        }),
      });
      if (cals.length) {
        items.push({
          id: "remove", label: t("removeCalendar"), chevron: true,
          open: () => ({
            id: "cal-remove",
            get title() {
              return t("removeCalendar");
            },
            items: () => (ctx.settings.calendars ?? []).map((p) => ({
              id: `rm-${p}`, label: baseName(p), closeAfter: true,
              run: () => ctx.update({ calendars: (ctx.settings.calendars ?? []).filter((x) => x !== p) }),
            })),
          }),
        });
      }
      return items;
    },
  });

  // ---------------------------------------------------------------- Alarms

  const repeatLabel = (r: Alarm["repeat"]) => t(r);

  const alertLabel = (alert: string): string => {
    if (alert === "beep") return t("beep");
    if (alert === "shuffle") return t("shuffleSongs");
    if (alert.startsWith("pl:")) return alert.slice(3);
    if (alert.startsWith("imp:")) return playlistName(alert.slice(4));
    return alert;
  };

  const alarmById = (id: number) => ctx.settings.alarms.find((a) => a.id === id);
  const setAlarm = (id: number, patch: Partial<Alarm>) =>
    ctx.update({ alarms: ctx.settings.alarms.map((a) => (a.id === id ? { ...a, ...patch } : a)) });

  const alarmTimePicker = (id: number): Screen => {
    const a = alarmById(id)!;
    return pickerScreen({
      id: `alarm-time-${id}`,
      title: () => t("alarmTime"),
      caption: () => t("alarm"),
      values: [a.hour, a.minute],
      max: [23, 59],
      pad: 2,
      separator: ":",
      done: (v) => {
        setAlarm(id, { hour: v[0], minute: v[1], on: true, lastFired: 0 });
      },
    });
  };

  const alarmEditor = (id: number): Screen => ({
    id: `alarm-${id}`,
    get title() {
      const a = alarmById(id);
      return a ? alarmTime(a) : t("alarm");
    },
    items: () => {
      const a = alarmById(id);
      if (!a) return [];
      const options = (key: StringKey, list: { value: string; label: string }[], current: string, apply: (v: string) => void): Screen => ({
        id: `alarm-${id}-${key}`,
        get title() {
          return t(key);
        },
        items: () => list.map((o, i) => ({ id: `o${i}`, label: o.label, checked: o.value === current, closeAfter: true, run: () => apply(o.value) })),
      });
      const alerts = [
        { value: "beep", label: t("beep") },
        { value: "shuffle", label: t("shuffleSongs") },
        ...ctx.settings.savedPlaylists.map((p) => ({ value: `pl:${p.name}`, label: p.name })),
        ...ctx.settings.playlists.map((p) => ({ value: `imp:${p}`, label: playlistName(p) })),
      ];
      return [
        { id: "on", label: t("alarm"), value: a.on ? t("on") : t("off"), run: () => setAlarm(id, { on: !a.on, lastFired: 0 }) },
        { id: "time", label: t("alarmTime"), value: alarmTime(a), chevron: true, open: () => alarmTimePicker(id) },
        {
          id: "repeat", label: t("repeat"), value: repeatLabel(a.repeat), chevron: true,
          open: () => options("repeat", REPEATS.map((r) => ({ value: r, label: repeatLabel(r) })), a.repeat, (v) => setAlarm(id, { repeat: v as Alarm["repeat"] })),
        },
        {
          id: "alert", label: t("alert"), value: alertLabel(a.alert), chevron: true,
          open: () => options("alert", alerts, a.alert, (v) => setAlarm(id, { alert: v })),
        },
        {
          id: "delete", label: t("deleteAlarm"), chevron: true,
          open: () => confirm(`alarm-del-${id}`, "deleteAlarm", () => ctx.update({ alarms: ctx.settings.alarms.filter((x) => x.id !== id) }), "alarms"),
        },
      ];
    },
  });

  const alarms = (): Screen => ({
    id: "alarms",
    get title() {
      return t("alarms");
    },
    items: () => [
      {
        id: "create",
        label: t("createAlarm"),
        chevron: true,
        open: () => {
          const id = Math.max(0, ...ctx.settings.alarms.map((a) => a.id)) + 1;
          ctx.update({ alarms: [...ctx.settings.alarms, newAlarm(id)] });
          return alarmEditor(id);
        },
      },
      ...ctx.settings.alarms.map((a) => ({
        id: `alarm-${a.id}`,
        label: `${alarmTime(a)}  ${repeatLabel(a.repeat)}`,
        value: a.on ? t("on") : t("off"),
        chevron: true,
        open: () => alarmEditor(a.id),
      })),
    ],
  });

  /** Starts an alarm's sound: a beep, Shuffle Songs or a playlist. */
  const startAlert = (a: Alarm) => {
    const pb = ctx.playback;
    if (a.alert === "shuffle" && !ctx.library.isEmpty) return pb.shuffleAll(ctx.library.tracks);
    if (a.alert.startsWith("pl:")) {
      const pl = ctx.settings.savedPlaylists.find((p) => p.name === a.alert.slice(3));
      const list = pl ? tracksFor(pl.paths) : [];
      if (list.length) return pb.playList(list, 0, ctx.settings.shuffle);
    }
    if (a.alert.startsWith("imp:")) {
      ctx.readPlaylist(a.alert.slice(4)).then(
        (pl) => {
          const list = pl.tracks.map(([, tr]) => byPath().get(tr.path) ?? tr);
          if (list.length) pb.playList(list, 0, ctx.settings.shuffle);
          else ctx.beep(true);
        },
        () => ctx.beep(true),
      );
      return;
    }
    ctx.beep(true);
  };

  /** Shown when an alarm goes off: Dismiss, or Snooze for 9 minutes. */
  const alarmRinging = (a: Alarm): Screen => {
    startAlert(a);
    return {
      id: `ringing-${a.id}`,
      get title() {
        return `${t("alarm")} ${alarmTime(a)}`;
      },
      onBack: () => {
        ctx.beep(false);
        return false;
      },
      items: () => [
        { id: "dismiss", label: t("dismiss"), closeAfter: true, run: () => ctx.beep(false) },
        {
          id: "snooze",
          label: t("snooze"),
          value: "9 min",
          closeAfter: true,
          run: () => {
            ctx.beep(false);
            const at = new Date(Date.now() + 9 * 60000);
            const id = Math.max(0, ...ctx.settings.alarms.map((x) => x.id)) + 1;
            ctx.update({ alarms: [...ctx.settings.alarms, { ...a, id, hour: at.getHours(), minute: at.getMinutes(), repeat: "once", on: true, lastFired: 0 }] });
          },
        },
      ],
    };
  };

  ctx.screens = { alarmRinging, lock: lockScreen, nowPlaying };

  const extrasEntries = (): MenuItem[] => [
    sub("alarms", "alarms", alarms),
    sub("calendars", "calendars", calendarsScreen),
    sub("clocks", "clocks", clocks),
    sub("history", "history", historyScreen),
    sub("games", "games", gamesScreen),
    sub("notes", "notes", () => notesScreen()),
    sub("screenlock", "screenLock", screenLock),
    sub("stopwatch", "stopwatch", stopwatchMenu),
  ];

  const extras = (): Screen => ({
    id: "extras",
    get title() {
      return t("extras");
    },
    items: extrasEntries,
  });

  // ---------------------------------------------------------------- Settings

  const onOff = (v: boolean) => (v ? t("on") : t("off"));

  const cycle = <T,>(values: readonly T[], current: T): T =>
    values[(values.indexOf(current) + 1) % values.length];

  const choiceList = <T,>(
    id: string,
    key: StringKey,
    options: readonly { value: T; label: string }[],
    current: () => T,
    apply: (v: T) => void,
  ): Screen => ({
    id,
    get title() {
      return t(key);
    },
    items: () =>
      options.map((o, i) => ({
        id: `${id}-${i}`,
        label: o.label,
        checked: o.value === current(),
        closeAfter: true,
        run: () => apply(o.value),
      })),
  });

  // ---------------------------------------------------------------- Date & Time
  /** The computer keeps the time; here it is shown and how it reads is chosen. */
  const dateTimeScreen = (): Screen => ({
    id: "datetime",
    get title() {
      return t("dateTime");
    },
    items: () => {
      const now = new Date();
      const zone = localZone();
      const off = -now.getTimezoneOffset();
      const gmt = `GMT${off >= 0 ? "+" : "−"}${Math.floor(Math.abs(off) / 60)}${Math.abs(off) % 60 ? ":" + String(Math.abs(off) % 60).padStart(2, "0") : ""}`;
      return [
        { id: "time", label: t("time"), value: formatTime(now) },
        { id: "date", label: t("date"), value: now.toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" }) },
        { id: "zone", label: t("timeZone"), value: `${cityName(zone)} ${gmt}` },
        { id: "24h", label: t("clock24"), value: onOff(isClock24()), run: () => ctx.update({ clock24: !isClock24() }) },
        { id: "title", label: t("timeInTitle"), value: onOff(!!ctx.settings.timeInTitle), run: () => ctx.update({ timeInTitle: !ctx.settings.timeInTitle }) },
        { id: "note", label: t("setByComputer"), disabled: true },
      ];
    },
  });

  // ---------------------------------------------------------------- Volume Limit
  const LIMIT_STEP = 1 / 32;
  const limitLabel = () => {
    const l = ctx.settings.volumeLimit ?? 1;
    const pct = l >= 1 ? t("off") : `${Math.round(l * 100)}%`;
    return pct;
  };
  const setLimit = (l: number) => {
    ctx.update({ volumeLimit: l });
    ctx.playback.setLimit(l);
  };

  const limitDone = (): Screen => ({
    id: "limit-done",
    get title() {
      return t("volumeLimit");
    },
    transient: true,
    items: () => [
      { id: "done", label: t("done"), closeTo: "settings", run: () => {} },
      ctx.settings.volumeLimitCode
        ? { id: "unlock", label: t("removeLock"), closeTo: "settings", run: () => ctx.update({ volumeLimitCode: "" }) }
        : {
            id: "lock", label: t("lockVolumeLimit"), chevron: true,
            open: () =>
              pickerScreen({
                id: "limit-code",
                title: () => t("setCombination"),
                caption: () => t("newCombination"),
                values: [0, 0, 0, 0],
                max: [9, 9, 9, 9],
                pad: 1,
                separator: "",
                done: (v) => {
                  ctx.update({ volumeLimitCode: v.join("") });
                  return "back";
                },
              }),
          },
    ],
  });

  const limitEditor = (): Screen => ({
    id: "limit-edit",
    upIsMore: true,
    get title() {
      return t("volumeLimit");
    },
    transient: true,
    items: () => [],
    onRotate: (ticks) => {
      const cur = ctx.settings.volumeLimit ?? 1;
      const next = Math.max(LIMIT_STEP, Math.min(1, Math.round((cur + ticks * LIMIT_STEP) / LIMIT_STEP) * LIMIT_STEP));
      if (next === cur) return false;
      setLimit(next);
      return true;
    },
    onSelect: () => limitDone(),
    onClick: (x, _y, w) => {
      const l = (x - 38) / (w - 76);
      setLimit(Math.max(LIMIT_STEP, Math.min(1, Math.round(l / LIMIT_STEP) * LIMIT_STEP)));
      return true;
    },
    draw: (c, w, h) =>
      drawVolumeLimit(c, w, h, {
        limit: ctx.settings.volumeLimit ?? 1,
        caption: t("maxVolume"),
        hint: t("limitHint"),
        locked: !!ctx.settings.volumeLimitCode,
      }),
  });

  /** Locked limit: the combination first. */
  const volumeLimit = (): Screen =>
    ctx.settings.volumeLimitCode
      ? pickerScreen({
          id: "limit-unlock",
          title: () => t("volumeLimit"),
          caption: () => t("enterCombination"),
          values: [0, 0, 0, 0],
          max: [9, 9, 9, 9],
          pad: 1,
          separator: "",
          lock: true,
          error: () => t("wrongCombination"),
          done: (v) => (v.join("") === ctx.settings.volumeLimitCode ? limitEditor() : "retry"),
        })
      : limitEditor();

  // ---------------------------------------------------------------- EQ
  const eqName = (p: string) => (p === CUSTOM ? t("eqCustom") : p === "Off" ? t("off") : p);

  /** Band editor: starts from the curve now in use and saves it as Custom. */
  const eqEditor = (): Screen => {
    let index = 0;
    const gains = eqGains(ctx.settings.eqPreset, ctx.settings.eqCustom);
    const save = () => ctx.update({ eqPreset: CUSTOM, eqCustom: [...gains] });
    const move = (d: number) => {
      index = Math.max(0, Math.min(EQ_BANDS.length - 1, index + d));
      return true;
    };
    return {
      id: "eq-edit",
      upIsMore: true,
      get title() {
        return t("eqCustom");
      },
      items: () => [],
      onRotate: (ticks) => {
        const v = Math.max(-EQ_MAX_DB, Math.min(EQ_MAX_DB, gains[index] + ticks * 0.5));
        if (v === gains[index]) return false;
        gains[index] = v;
        save();
        return true;
      },
      onSelect: () => (index < EQ_BANDS.length - 1 ? move(1) : "back"),
      onButton: (b) => (b === "prev" ? move(-1) : b === "next" ? move(1) : false),
      onText: (ch) => {
        if (ch === "0") {
          gains[index] = 0;
          save();
          return true;
        }
        return false;
      },
      onClick: (x, y, w, h) => {
        // Mouse: click a band column to pick it; its height sets the gain.
        const left = 30;
        const col = Math.floor(((x - left) / (w - 12 - left)) * EQ_BANDS.length);
        if (col < 0 || col >= EQ_BANDS.length) return false;
        index = col;
        const top = 34;
        const bottom = h - 48;
        const db = ((top + bottom) / 2 - y) / ((bottom - top) / 2 / EQ_MAX_DB);
        if (y >= top - 6 && y <= bottom + 6) {
          gains[index] = Math.max(-EQ_MAX_DB, Math.min(EQ_MAX_DB, Math.round(db * 2) / 2));
          save();
        }
        return true;
      },
      draw: (c, w, h) => drawEq(c, w, h, { gains, index, hint: t("eqHint") }),
    };
  };

  const eqScreen = (): Screen => ({
    id: "eq",
    get title() {
      return t("eq");
    },
    items: () => [
      {
        id: "eq-custom", label: t("eqCustom"), chevron: true, checked: ctx.settings.eqPreset === CUSTOM,
        open: eqEditor,
      },
      ...EQ_PRESETS.map((p) => ({
        id: `eq-${p}`,
        label: eqName(p),
        checked: ctx.settings.eqPreset === p,
        closeAfter: true,
        run: () => ctx.update({ eqPreset: p }),
      })),
    ],
  });

  const backlightLabel = (s: number) => (s === 0 ? t("always") : `${s} ${t("seconds")}`);

  const fmtBytes = (b: number) =>
    b >= 1e12 ? `${(b / 1e12).toFixed(1)} TB` : `${Math.round(b / 1e9)} GB`;

  const sourceLabel = (): string => {
    const src = ctx.settings.librarySource;
    if (!src) return t("off");
    const vol = ctx.volumes.find((v) => v.id === src.volumeId);
    if (!vol) return "—";
    const last = src.relativePath.split("/").filter(Boolean).pop();
    return last ?? vol.label;
  };

  /** Folder browser inside a drive: "Use This Folder" first, then sub-folders. */
  const folderScreen = (vol: Volume, parts: string[]): Screen => {
    let dirs: string[] | null = null;
    let requested = false;
    const path = joinPath(vol.mountPoint, parts);
    return {
      id: `folder-${vol.id}-${parts.join("/")}`,
      title: parts.length ? parts[parts.length - 1] : vol.label,
      items: () => {
        if (!requested) {
          requested = true;
          ctx.listDirs(path).then((d) => {
            dirs = d;
            ctx.refresh();
          }, () => {
            dirs = [];
            ctx.refresh();
          });
        }
        const items: MenuItem[] = [
          { id: "use", label: t("useThisFolder"), closeTo: "settings", run: () => ctx.chooseSource(vol, parts) },
        ];
        if (dirs === null) items.push({ id: "loading", label: t("loading") });
        else for (const d of dirs) items.push({ id: `d-${d}`, label: d, chevron: true, open: () => folderScreen(vol, [...parts, d]) });
        return items;
      },
    };
  };

  const librarySource = (): Screen => ({
    id: "library-source",
    get title() {
      return t("librarySource");
    },
    empty: t("noDrives"),
    items: () =>
      ctx.volumes.map((v) => ({
        id: `vol-${v.id}`,
        label: v.label,
        value: fmtBytes(v.totalBytes),
        checked: ctx.settings.librarySource?.volumeId === v.id,
        chevron: true,
        open: () => folderScreen(v, []),
      })),
  });

  const about = (): Screen => ({
    id: "about",
    get title() {
      return t("about");
    },
    items: () => {
      const songs = ctx.scan.active
        ? `${ctx.scan.done}/${ctx.scan.total || "…"}`
        : String(ctx.library.tracks.length);
      return [
        { id: "songs", label: t("songs"), value: songs },
        { id: "albums", label: t("albums"), value: String(ctx.library.albums().length) },
        { id: "source", label: t("librarySource"), value: sourceLabel() },
        { id: "version", label: t("version"), value: ctx.appVersion },
      ];
    },
  });

  const reset = (): Screen => ({
    id: "reset",
    get title() {
      return t("resetSettings");
    },
    items: () => [
      { id: "cancel", label: t("cancel"), closeAfter: true, run: () => {} },
      { id: "reset", label: t("reset"), closeAfter: true, run: () => ctx.resetSettings() },
    ],
  });

  const settings = (): Screen => ({
    id: "settings",
    get title() {
      return t("settings");
    },
    items: () => {
      const s = ctx.settings;
      const shuffleLabel = { off: t("off"), songs: t("songs"), albums: t("albums") }[s.shuffle];
      const repeatLabel = { off: t("off"), one: t("one"), all: t("all") }[s.repeat];
      return [
        sub("about", "about", about),
        { id: "shuffle", label: t("shuffle"), value: shuffleLabel, run: () => ctx.update({ shuffle: cycle(["off", "songs", "albums"] as const, s.shuffle) }) },
        { id: "repeat", label: t("repeat"), value: repeatLabel, run: () => ctx.update({ repeat: cycle(["off", "one", "all"] as const, s.repeat) }) },
        sub("mainmenu", "mainMenu", mainMenuSettings),
        sub("musicmenu", "musicMenu", musicMenuSettings),
        { id: "volumelimit", label: t("volumeLimit"), value: limitLabel(), chevron: true, open: volumeLimit },
        {
          id: "backlight", label: t("backlight"), value: backlightLabel(s.backlightSecs), chevron: true,
          open: () => choiceList("backlight", "backlight",
            BACKLIGHT_STEPS.map((v) => ({ value: v, label: backlightLabel(v) })),
            () => ctx.settings.backlightSecs, (v) => ctx.update({ backlightSecs: v })),
        },
        { id: "crossfade", label: t("audioCrossfade"), value: onOff(s.crossfade), run: () => ctx.update({ crossfade: !s.crossfade }) },
        { id: "soundcheck", label: t("soundCheck"), value: onOff(s.soundCheck), run: () => ctx.update({ soundCheck: !s.soundCheck }) },
        { id: "eq", label: t("eq"), value: eqName(s.eqPreset), chevron: true, open: eqScreen },
        { id: "clicker", label: t("clicker"), value: onOff(s.clicker), run: () => ctx.update({ clicker: !s.clicker }) },
        { id: "mouse", label: t("mouseControl"), value: onOff(s.mouseControl), run: () => ctx.update({ mouseControl: !s.mouseControl }) },
        sub("datetime", "dateTime", dateTimeScreen),
        {
          id: "language", label: t("language"), chevron: true,
          open: () => choiceList<Lang>("language", "language",
            [{ value: "en", label: "English" }, { value: "lt", label: "Lietuvių" }, { value: "ru", label: "Русский" }],
            () => ctx.settings.language, (v) => ctx.update({ language: v })),
        },
        { id: "source", label: t("librarySource"), value: sourceLabel(), chevron: true, open: librarySource },
        sub("legal", "legal", legalScreen),
        sub("reset", "resetSettings", reset),
      ];
    },
  });

  // ---------------------------------------------------------------- Main menu
  const shuffleSongsItem = (): MenuItem =>
    ctx.library.isEmpty
      ? { id: "shuffle-songs", label: t("shuffleSongs"), run: () => {} }
      : {
          id: "shuffle-songs",
          label: t("shuffleSongs"),
          open: () => {
            ctx.playback.shuffleAll(ctx.library.tracks);
            return nowPlaying();
          },
        };

  /** Everything that can be put on the main menu, in menu order (Settings is always there). */
  const mainEntries = (): MenuItem[] => {
    const byId = new Map([...musicEntries(), ...extrasEntries()].map((i) => [i.id, i]));
    return MAIN_MENU_CHOICES.map((id) => {
      if (id === "music") return sub("music", "music", music);
      if (id === "photos") return sub("photos", "photos", photosScreen);
      if (id === "podcasts") return sub("podcasts", "podcasts", podcasts);
      if (id === "extras") return sub("extras", "extras", extras);
      if (id === "shuffle-songs") return shuffleSongsItem();
      return byId.get(id)!;
    });
  };

  const menuToggle = (
    id: string,
    key: StringKey,
    entries: () => MenuItem[],
    isOn: (id: string) => boolean,
    toggle: (id: string) => void,
    reset: () => void,
  ): Screen => ({
    id,
    get title() {
      return t(key);
    },
    items: () => [
      ...entries().map((e) => ({ id: `mm-${e.id}`, label: e.label, value: onOff(isOn(e.id)), run: () => toggle(e.id) })),
      { id: "mm-reset", label: t("resetMenu"), run: reset },
    ],
  });

  const mainMenuSettings = (): Screen =>
    menuToggle(
      "mainmenu-edit", "mainMenu", mainEntries,
      (id) => mainMenuIds().includes(id),
      (id) => {
        const cur = mainMenuIds();
        ctx.update({ mainMenu: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
      },
      () => ctx.update({ mainMenu: [...DEFAULT_MAIN_MENU] }),
    );

  const musicMenuSettings = (): Screen =>
    menuToggle(
      "musicmenu-edit", "musicMenu", musicEntries,
      (id) => !(ctx.settings.musicMenuHidden ?? []).includes(id),
      (id) => {
        const cur = ctx.settings.musicMenuHidden ?? [];
        ctx.update({ musicMenuHidden: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
      },
      () => ctx.update({ musicMenuHidden: [] }),
    );

  const mainMenuIds = (): string[] => ctx.settings.mainMenu ?? DEFAULT_MAIN_MENU;

  return {
    id: "main",
    get title() {
      return t("appTitle");
    },
    split: true,
    items: () => {
      const on = mainMenuIds();
      const items = mainEntries().filter((e) => on.includes(e.id));
      // Settings always stays, just before Shuffle Songs like the original.
      const at = items.findIndex((e) => e.id === "shuffle-songs");
      items.splice(at < 0 ? items.length : at, 0, sub("settings", "settings", settings));
      if (ctx.playback.hasQueue) items.push(sub("nowplaying", "nowPlaying", nowPlaying));
      return items;
    },
  };
}
