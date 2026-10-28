// The only place the UI talks to the OS. Inside Tauri it calls the Rust side;
// in a plain browser (vite dev, screenshots) it falls back to a demo library and
// a simulated player so the whole UI can still be exercised.
import type { Lang } from "../core/strings";
import type { Track } from "../core/library";
import type { Alarm } from "../core/alarms";
import { convertFileSrc } from "@tauri-apps/api/core";

export type ResumeState =
  | { kind: "tracks"; paths: string[]; index: number; positionMs: number; playing: boolean }
  | { kind: "radio"; slug: string; playing: boolean; country?: string | null; genre?: string | null };

export type VolumeKind = "system" | "internal" | "removable" | "network";

export interface Volume {
  /** Stable id (volume GUID / filesystem UUID); survives drive-letter or mount changes. */
  id: string;
  label: string;
  mountPoint: string;
  kind: VolumeKind;
  totalBytes: number;
  availableBytes: number;
}

export interface LibrarySource {
  volumeId: string;
  /** Folder inside the volume, relative to its mount point ("" = whole volume). */
  relativePath: string;
}

export interface ResolvedSource {
  volume: Volume;
  path: string;
}

export type ShuffleMode = "off" | "songs" | "albums";
export type RepeatMode = "off" | "one" | "all";

export interface Settings {
  language: Lang;
  shuffle: ShuffleMode;
  repeat: RepeatMode;
  eqPreset: string;
  /** The user's own EQ curve (10 bands, dB). */
  eqCustom: number[];
  /** Highest volume allowed (1 = no limit). */
  volumeLimit: number;
  /** Combination that locks the Volume Limit ("" = not locked). */
  volumeLimitCode: string;
  /** Items on the main menu (Settings is always there). */
  mainMenu: string[];
  /** Music menu items switched off. */
  musicMenuHidden: string[];
  /** Folder shown in Extras → Notes ("" = not chosen). */
  notesFolder: string;
  /** Calendar files (.ics) in Extras → Calendars. */
  calendars: string[];
  /** 24-hour clock (false = 12-hour with AM/PM). */
  clock24: boolean;
  /** Current time in the title bar. */
  timeInTitle: boolean;
  /** Folder shown in Photos ("" = not chosen). */
  photosFolder: string;
  slideSecs: number;
  slideRepeat: boolean;
  slideShuffle: boolean;
  slideFade: boolean;
  /** What was playing when the app was closed, to carry on from there. */
  resume: ResumeState | null;
  clicker: boolean;
  soundCheck: boolean;
  crossfade: boolean;
  /** 0 = always on. */
  backlightSecs: number;
  /** Playback volume 0–1. */
  volume: number;
  /** Menus can also be clicked with the mouse (off by default). */
  mouseControl: boolean;
  /** Playlist files imported from the computer. */
  playlists: string[];
  /** On-The-Go list (file paths, in order). */
  onTheGo: string[];
  /** Playlists made on the player ("New Playlist 1"...). */
  savedPlaylists: { name: string; paths: string[] }[];
  /** Stopwatch sessions: start time (ms since 1970) and laps (ms). */
  stopwatchLogs: { started: number; laps: number[] }[];
  /** Played songs, newest first. */
  history: HistoryEntry[];
  /** World clocks (IANA time zones); empty = this computer's zone. */
  clocks: string[];
  alarms: Alarm[];
  /** Screen-lock combination (4 digits); "" = not set. */
  lockCode: string;
  /** The screen is locked (stays locked after a restart). */
  locked: boolean;
  librarySource: LibrarySource | null;
}

export interface HistoryEntry {
  /** Start time, ms since 1970. */
  at: number;
  /** File path, or the stream address for radio. */
  path: string;
  title: string;
  artist: string;
  album: string;
  /** Radio station name; "" for library songs. */
  station: string;
  /** Catalogue id of the station, to tune in again from History. */
  stationId?: string;
}

export const DEFAULT_SETTINGS: Settings = {
  language: "en",
  shuffle: "off",
  repeat: "off",
  eqPreset: "Off",
  eqCustom: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  volumeLimit: 1,
  volumeLimitCode: "",
  mainMenu: ["music", "photos", "podcasts", "extras", "shuffle-songs"],
  musicMenuHidden: [],
  notesFolder: "",
  calendars: [],
  clock24: true,
  timeInTitle: false,
  photosFolder: "",
  slideSecs: 3,
  slideRepeat: false,
  slideShuffle: false,
  slideFade: true,
  resume: null,
  clicker: true,
  soundCheck: false,
  crossfade: false,
  backlightSecs: 10,
  volume: 0.7,
  mouseControl: false,
  playlists: [],
  onTheGo: [],
  savedPlaylists: [],
  stopwatchLogs: [],
  history: [],
  clocks: [],
  alarms: [],
  lockCode: "",
  locked: false,
  librarySource: null,
};

export interface QueueItem {
  path: string;
  durationMs: number;
  /** Live internet stream. */
  stream?: boolean;
  /** Other addresses of the same stream, tried when one does not play. */
  alternates?: string[];
  /** ReplayGain level in dB (Sound Check). */
  gainDb?: number | null;
}

export interface Station {
  slug: string;
  name: string;
  genre: string;
  description: string;
  pageUrl: string;
  streamUrl: string | null;
  image: string | null;
  /** All known stream addresses (streamUrl first). */
  streams?: string[];
}

export interface PlayerState {
  playing: boolean;
  index: number | null;
  queueLen: number;
  positionMs: number;
  durationMs: number;
  volume: number;
  path: string | null;
  error: string | null;
  /** Live stream connecting / buffering. */
  buffering: boolean;
  /** Live stream: latest "Artist - Title" sent by the station. */
  streamTitle: string | null;
}

export interface ScanProgress {
  root: string;
  done: number;
  total: number;
}

export const inTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

async function listen<T>(event: string, cb: (payload: T) => void): Promise<() => void> {
  const { listen } = await import("@tauri-apps/api/event");
  return listen<T>(event, (e) => cb(e.payload));
}

// ------------------------------------------------------------------ settings

const LS_KEY = "wheeldesk.settings";

export async function loadSettings(): Promise<Settings> {
  if (inTauri()) return { ...DEFAULT_SETTINGS, ...(await invoke<Settings>("get_settings")) };
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  if (inTauri()) return invoke("save_settings", { settings });
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable: keep in memory only */
  }
}

// ------------------------------------------------------------------ drives and folders

const DEMO_VOLUMES: Volume[] = [
  { id: "demo-system", label: "System", mountPoint: "/", kind: "system", totalBytes: 512e9, availableBytes: 200e9 },
  { id: "demo-usb", label: "MUSIC_USB", mountPoint: "/media/music", kind: "removable", totalBytes: 64e9, availableBytes: 12e9 },
];

export async function listVolumes(): Promise<Volume[]> {
  if (inTauri()) return invoke<Volume[]>("list_volumes");
  return DEMO_VOLUMES;
}

export async function resolveLibrarySource(source?: LibrarySource): Promise<ResolvedSource | null> {
  if (inTauri()) return invoke<ResolvedSource | null>("resolve_library_source", { source: source ?? null });
  const s = source ?? (await loadSettings()).librarySource;
  const v = s && DEMO_VOLUMES.find((x) => x.id === s.volumeId);
  return v ? { volume: v, path: joinPath(v.mountPoint, s!.relativePath.split("/").filter(Boolean)) } : null;
}

export async function listDirs(path: string): Promise<string[]> {
  if (inTauri()) return invoke<string[]>("list_dirs", { path });
  await new Promise((r) => setTimeout(r, 150));
  return path.split(/[\\/]/).filter(Boolean).length < 2 ? ["Albums", "Downloads", "Music", "Podcasts"] : [];
}

/** Joins folder names onto a mount point with that OS's separator. */
export function joinPath(base: string, parts: string[]): string {
  const sep = base.includes("\\") ? "\\" : "/";
  let out = base;
  for (const p of parts) out = out.endsWith(sep) ? out + p : out + sep + p;
  return out;
}

// ------------------------------------------------------------------ playlists

export interface DirListing {
  dirs: string[];
  playlists: string[];
}

export interface MissingEntry {
  location: string;
  fileName: string;
  title: string;
  artist: string;
  position: number;
}

export interface PlaylistFile {
  path: string;
  name: string;
  /** [position in the playlist, track] */
  tracks: [number, Track][];
  missing: MissingEntry[];
}

export async function listPlaylistDir(path: string): Promise<DirListing> {
  if (inTauri()) return invoke<DirListing>("list_playlist_dir", { path });
  await new Promise((r) => setTimeout(r, 100));
  return path.split(/[\\/]/).filter(Boolean).length < 2
    ? { dirs: ["Music", "Playlists"], playlists: ["Mėgstamos.m3u"] }
    : { dirs: [], playlists: ["Kelionei.m3u8", "Vakarėlis.pls"] };
}

export interface FileListing {
  dirs: string[];
  files: string[];
}

const DEMO_NOTE = `Sveiki! Tai užrašų pavyzdys.

Užrašai rodomi iš pasirinkto aplanko (.txt, .md). Ratuku slenkama eilutėmis, ⏮ ⏭ – puslapiais.

Привет! Русский текст тоже читается.`;

const DEMO_ICS = (() => {
  const d = new Date();
  const ymd = (x: Date) => `${x.getFullYear()}${String(x.getMonth() + 1).padStart(2, "0")}${String(x.getDate()).padStart(2, "0")}`;
  const t = ymd(d);
  const n = ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 3));
  return [
    "BEGIN:VCALENDAR",
    "BEGIN:VEVENT", "UID:a", `DTSTART:${t}T100000`, `DTEND:${t}T113000`, "SUMMARY:Komandos susitikimas", "LOCATION:Vilnius", "DESCRIPTION:Aptarti naują versiją.", "END:VEVENT",
    "BEGIN:VEVENT", "UID:b", `DTSTART;VALUE=DATE:${n}`, "SUMMARY:Gimtadienis", "RRULE:FREQ=YEARLY", "END:VEVENT",
    "BEGIN:VEVENT", "UID:c", `DTSTART:${t}T180000`, "DURATION:PT1H", "SUMMARY:Treniruotė", "RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR", "END:VEVENT",
    "END:VCALENDAR",
  ].join("\n");
})();

export async function listFiles(path: string, exts: string[]): Promise<FileListing> {
  if (inTauri()) return invoke<FileListing>("list_files", { path, exts });
  await new Promise((r) => setTimeout(r, 80));
  const top = !/(Notes|Calendars|Receptai|Photos)[\\/]?$/.test(path);
  if (exts.length === 0) return top ? { dirs: ["Photos"], files: [] } : { dirs: ["Kelionė", "Šeima"], files: [] };
  if (exts.includes("ics")) return top ? { dirs: ["Calendars"], files: [] } : { dirs: [], files: ["Darbas.ics", "Šeima.ics"] };
  return top ? { dirs: ["Notes"], files: [] } : { dirs: ["Receptai"], files: ["Sveiki.txt", "Pirkiniai.md"] };
}

export async function findFiles(path: string, exts: string[]): Promise<string[]> {
  if (inTauri()) return invoke<string[]>("find_files", { path, exts });
  await new Promise((r) => setTimeout(r, 80));
  const n = /Kelion/.test(path) ? 5 : 14;
  return Array.from({ length: n }, (_, i) => `${path}/demo-${String(i + 1).padStart(2, "0")}.jpg`);
}

/** Browser preview: a generated picture per demo photo. */
function demoPhoto(path: string): string {
  const n = Number(/(\d+)\.jpg$/.exec(path)?.[1] ?? 1);
  const c = document.createElement("canvas");
  c.width = 480;
  c.height = 320;
  const g = c.getContext("2d")!;
  const hue = (n * 47) % 360;
  const grad = g.createLinearGradient(0, 0, 480, 320);
  grad.addColorStop(0, `hsl(${hue},55%,62%)`);
  grad.addColorStop(1, `hsl(${(hue + 60) % 360},50%,30%)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 480, 320);
  g.fillStyle = "rgba(255,255,255,0.85)";
  g.beginPath();
  g.moveTo(0, 320);
  g.lineTo(150 + n * 9, 150);
  g.lineTo(260, 240);
  g.lineTo(340, 170);
  g.lineTo(480, 320);
  g.fill();
  g.font = "700 64px Inter, sans-serif";
  g.fillText(String(n), 24, 80);
  return c.toDataURL("image/jpeg", 0.8);
}

export function photoUrl(path: string): string {
  if (inTauri()) return convertFileSrc(path);
  return demoPhoto(path);
}

export async function readText(path: string): Promise<string> {
  if (inTauri()) return invoke<string>("read_text", { path });
  return path.toLowerCase().endsWith(".ics") ? DEMO_ICS : DEMO_NOTE;
}

export async function readPlaylist(path: string): Promise<PlaylistFile> {
  if (inTauri()) return invoke<PlaylistFile>("read_playlist", { path });
  const name = path.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, "");
  return {
    path, name, tracks: [],
    missing: ["Northern Lights", "Copper Wires", "Paper Boats"].map((album, i) => ({
      location: `C:\\Music\\${album}\\0${i + 1}.mp3`, fileName: `0${i + 1}.mp3`, title: "", artist: "", position: i,
    })),
  };
}

// ------------------------------------------------------------------ library

export async function libraryCached(root: string): Promise<Track[]> {
  if (inTauri()) return invoke<Track[]>("library_cached", { root });
  return [];
}

export async function scanLibrary(root: string, onProgress: (p: ScanProgress) => void): Promise<Track[]> {
  if (inTauri()) {
    const un = await listen<ScanProgress>("scan-progress", (p) => {
      if (p.root === root) onProgress(p);
    });
    try {
      return await invoke<Track[]>("scan_library", { root });
    } finally {
      un();
    }
  }
  const tracks = demoTracks(root);
  for (let i = 0; i <= tracks.length; i += 20) {
    onProgress({ root, done: Math.min(i, tracks.length), total: tracks.length });
    await new Promise((r) => setTimeout(r, 40));
  }
  return tracks;
}

export async function getArt(t: Track, online: boolean): Promise<string | null> {
  if (inTauri()) {
    return invoke<string | null>("get_art", { path: t.path, artist: t.albumArtist || t.artist, album: t.album, online });
  }
  return null;
}

function demoTracks(root: string): Track[] {
  const albums: [string, string, string, number][] = [
    ["Northern Lights", "Aurora Fields", "Ambient", 2019],
    ["Copper Wires", "The Signal Path", "Electronic", 2021],
    ["Paper Boats", "Lina Vale", "Folk", 2016],
    ["Midnight Transit", "The Signal Path", "Electronic", 2023],
    ["Old Town Rain", "Kestutis Band", "Rock", 2014],
    ["Glass Harbor", "Lina Vale", "Folk", 2020],
  ];
  const words = ["Morning", "Echoes", "Static", "River", "Lanterns", "Drift", "Hollow", "Signal", "Embers", "Tides", "Satellite", "Quiet"];
  const out: Track[] = [];
  albums.forEach(([album, artist, genre, year], ai) => {
    for (let n = 1; n <= 9; n++) {
      const title = `${words[(ai * 5 + n) % words.length]} ${["I", "Song", "Again", "Lines", "Light"][n % 5]}`;
      out.push({
        path: `${root}/${artist}/${album}/${String(n).padStart(2, "0")} ${title}.mp3`,
        title, artist, albumArtist: artist, album, genre, composer: n % 3 === 0 ? "R. Composer" : "",
        trackNo: n, discNo: 1, year, durationMs: 150000 + ((ai * 37 + n * 53) % 120) * 1000, compilation: false,
      });
    }
  });
  return out;
}

// ------------------------------------------------------------------ radio

const DEMO_STATIONS: [string, string, string, string][] = [
  ["neringa-fm", "Neringa FM", "Pop", "Pajūrio ir Kuršių nerijos nuotaikos radijo stotis."],
  ["ziniu-radijas", "Žinių radijas", "Pokalbiai", "Naujienos, pokalbiai ir komentarai."],
  ["gold-fm", "Gold FM", "Retro", "Aukso fondo hitai."],
  ["lietus", "Lietus", "Lietuviška", "Lietuviška muzika visą parą."],
  ["lrt-opus", "LRT Opus", "Alternatyvi", "Alternatyvioji ir nepriklausoma muzika."],
  ["relax-fm", "Relax FM", "Rami muzika", "Rami muzika darbui ir poilsiui."],
];

export async function radioStations(): Promise<Station[]> {
  if (inTauri()) return invoke<Station[]>("radio_stations");
  await new Promise((r) => setTimeout(r, 200));
  return DEMO_STATIONS.map(([slug, name, genre]) => ({
    slug, name, genre, description: "", pageUrl: `https://fm.lt/${slug}`, streamUrl: null, image: null,
  }));
}

// ------------------------------------------------------------ station catalogue

export interface CatalogCount {
  id: string;
  count: number;
}

export interface StationFilter {
  country: string | null;
  genre: string | null;
}

/** Browser preview: a small made-up catalogue with the same shape. */
const DEMO_CATALOG: { st: Station; country: string; genres: string[] }[] = (() => {
  const rows: [string, string, string, string[]][] = [
    ["Neringa FM", "LT", "pop", ["pop"]], ["Žinių radijas", "LT", "news", ["news"]], ["Gold FM", "LT", "oldies", ["oldies", "pop"]],
    ["LRT Opus", "LT", "alternative", ["alternative"]], ["Relax FM", "LT", "chill", ["chill"]], ["LRT Klasika", "LT", "classical", ["classical", "culture"]],
    ["Jazz Radio Berlin", "DE", "jazz", ["jazz"]], ["Rock Antenne", "DE", "rock", ["rock"]], ["Deutschlandfunk", "DE", "news", ["news", "culture"]],
    ["Radio Nova", "FR", "world", ["world", "dance"]], ["FIP", "FR", "jazz", ["jazz", "world"]], ["KEXP", "US", "alternative", ["alternative", "rock"]],
    ["WNYC", "US", "news", ["news"]], ["Smooth Jazz 24", "US", "jazz", ["jazz", "chill"]], ["Radio Polskie", "PL", "pop", ["pop"]],
  ];
  return rows.map(([name, country, genre, genres], i) => ({
    country, genres,
    st: { slug: `demo-${i}`, name, genre, description: `${genres.join(", ")} · ${country}`, pageUrl: "", streamUrl: `demo://${i}`, image: null },
  }));
})();

function demoMatch(e: (typeof DEMO_CATALOG)[number], f: StationFilter): boolean {
  return (!f.country || e.country === f.country) && (!f.genre || e.genres.includes(f.genre));
}

function demoCounts(keys: string[]): CatalogCount[] {
  const m = new Map<string, number>();
  for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
  return [...m].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count);
}

export async function radioCountries(genre: string | null): Promise<CatalogCount[]> {
  if (inTauri()) return invoke<CatalogCount[]>("radio_countries", { genre });
  return demoCounts(DEMO_CATALOG.filter((e) => demoMatch(e, { country: null, genre })).map((e) => e.country));
}

export async function radioGenres(country: string | null): Promise<CatalogCount[]> {
  if (inTauri()) return invoke<CatalogCount[]>("radio_genres", { country });
  return demoCounts(DEMO_CATALOG.filter((e) => demoMatch(e, { country, genre: null })).flatMap((e) => e.genres));
}

export async function radioCatalog(f: StationFilter): Promise<Station[]> {
  if (inTauri()) return invoke<Station[]>("radio_catalog", { country: f.country, genre: f.genre });
  await new Promise((r) => setTimeout(r, 60));
  return DEMO_CATALOG.filter((e) => demoMatch(e, f)).map((e) => ({ ...e.st })).sort((a, b) => a.name.localeCompare(b.name));
}

export async function radioStation(id: string): Promise<Station | null> {
  if (inTauri()) return invoke<Station | null>("radio_station", { id });
  return DEMO_CATALOG.find((e) => e.st.slug === id)?.st ?? null;
}

export async function radioResolve(station: Station, fresh = false): Promise<Station> {
  if (inTauri()) return invoke<Station>("radio_resolve", { station, fresh });
  const d = DEMO_STATIONS.find((x) => x[0] === station.slug);
  return { ...station, description: d?.[3] ?? "", streamUrl: `demo://${station.slug}` };
}

export async function songCover(artist: string, title: string): Promise<string | null> {
  if (inTauri()) return invoke<string | null>("song_cover", { artist, title });
  return null;
}

// ------------------------------------------------------------------ player

export async function onPlayerState(cb: (s: PlayerState) => void): Promise<() => void> {
  if (inTauri()) return listen<PlayerState>("player-state", cb);
  demo.listener = cb;
  return () => {
    demo.listener = null;
  };
}

export async function playerLoad(queue: QueueItem[], index: number, play: boolean): Promise<void> {
  if (inTauri()) return invoke("player_load", { queue, index, play });
  demo.load(queue, index, play);
}

export type PlayerCmd = "toggle" | "pause" | "next" | "prev" | "stop" | "seekTo" | "seekBy" | "volume" | "repeat" | "eq" | "soundcheck" | "crossfade";

export async function playerCmd(cmd: PlayerCmd, value?: number, text?: string): Promise<void> {
  if (inTauri()) return invoke("player_cmd", { cmd, value: value ?? null, text: text ?? null });
  demo.cmd(cmd, value, text);
}

/** Browser stand-in for the Rust player: advances time, follows repeat rules. */
const demo = {
  listener: null as ((s: PlayerState) => void) | null,
  queue: [] as QueueItem[],
  repeat: "off" as RepeatMode,
  s: { playing: false, index: null, queueLen: 0, positionMs: 0, durationMs: 0, volume: 0.7, path: null, error: null, buffering: false, streamTitle: null } as PlayerState,
  timer: 0 as number | undefined,
  emit() {
    this.listener?.({ ...this.s });
  },
  start(i: number, play: boolean) {
    const q = this.queue[i];
    const title = q.stream ? "Andrius Mamontovas - Laivai" : null;
    Object.assign(this.s, { index: i, path: q.path, durationMs: q.durationMs, positionMs: 0, playing: play, streamTitle: title });
    this.emit();
  },
  load(queue: QueueItem[], index: number, play: boolean) {
    this.queue = queue;
    this.s.queueLen = queue.length;
    this.start(index, play);
    if (!this.timer) {
      const id = setInterval(() => {
        if (!this.s.playing) return;
        this.s.positionMs += 250;
        const live = this.queue[this.s.index ?? 0]?.stream;
        if (!live && this.s.positionMs >= this.s.durationMs) this.advance(false);
        this.emit();
      }, 250);
      // In Node (tests) the demo timer must not keep the process alive.
      (id as unknown as { unref?: () => void }).unref?.();
      this.timer = id as unknown as number;
    }
  },
  advance(user: boolean) {
    const i = this.s.index ?? 0;
    if (this.repeat === "one" && !user) return this.start(i, true);
    if (i + 1 < this.queue.length) return this.start(i + 1, this.s.playing || !user);
    if (this.repeat !== "off") return this.start(0, true);
    Object.assign(this.s, { playing: false, positionMs: 0, index: 0 });
  },
  cmd(cmd: PlayerCmd, value?: number, text?: string) {
    if (cmd === "toggle" && this.s.index !== null) this.s.playing = !this.s.playing;
    else if (cmd === "pause") this.s.playing = false;
    else if (cmd === "next") this.advance(true);
    else if (cmd === "prev") {
      const i = this.s.index ?? 0;
      if (this.s.positionMs > 3000 || i === 0) this.s.positionMs = 0;
      else this.start(i - 1, this.s.playing);
    } else if (cmd === "seekTo") this.s.positionMs = Math.max(0, value ?? 0);
    else if (cmd === "seekBy") this.s.positionMs = Math.min(this.s.durationMs, Math.max(0, this.s.positionMs + (value ?? 0)));
    else if (cmd === "volume") this.s.volume = Math.min(1, Math.max(0, value ?? 0.7));
    else if (cmd === "repeat") this.repeat = (text as RepeatMode) ?? "off";
    this.emit();
  },
};

// ------------------------------------------------------------------ window

/** The tray menu's Quit: the UI saves its state and then quits. */
export async function onAppQuit(cb: () => void): Promise<() => void> {
  if (!inTauri()) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen("app-quit", cb);
}

/** Shows the window again if it is hidden in the tray. */
export async function showWindow(): Promise<void> {
  if (inTauri()) await invoke("show_window").catch(() => {});
}

export async function windowAction(action: "drag" | "minimize" | "close"): Promise<void> {
  if (!inTauri()) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const w = getCurrentWindow();
  if (action === "drag") await w.startDragging();
  else if (action === "minimize") {
    // To the tray next to the clock; a plain minimize where there is no tray.
    const hidden = await invoke<boolean>("hide_to_tray").catch(() => false);
    if (!hidden) await w.minimize();
  } else await invoke("quit_app").catch(() => w.close());
}
