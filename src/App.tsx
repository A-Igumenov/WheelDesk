import { useEffect, useRef, useState } from "react";
import { Navigator } from "./core/navigator";
import { buildRoot, type MenuContext } from "./core/menus";
import { Library } from "./core/library";
import { Playback, splitStreamTitle } from "./core/playback";
import { DeviceView } from "./render/device";
import { setVolumeLimitMark } from "./render/nowplaying";
import { setTitleClock } from "./render/screen";
import { formatTime, setClock24 } from "./core/timefmt";
import { ArtStore } from "./render/artstore";
import { OpenArtworkStore, artworkInfo } from "./core/openart";
import { AlarmTone } from "./render/clicker";
import { afterFiring, dueAlarms } from "./core/alarms";
import { eqGains } from "./core/eq";
import { radioCountries } from "./core/radio";
import { fold } from "./core/search";
import { DEVICE, FONT_PRELOAD_SAMPLE } from "./render/theme";
import {
  DEFAULT_SETTINGS,
  getArt,
  openArtwork,
  joinPath,
  libraryCached,
  listDirs,
  listPlaylistDir,
  listVolumes,
  loadSettings,
  onPlayerState,
  playerCmd,
  radioResolve,
  radioStations,
  readPlaylist,
  listFiles,
  readText,
  showWindow,
  onAppQuit,
  findFiles,
  photoUrl,
  resolveLibrarySource,
  saveSettings,
  scanLibrary,
  windowAction,
  type HistoryEntry,
  type Settings,
  type ResumeState,
  type Station,
  type Volume,
} from "./platform/bridge";

/** History keeps this many played songs. */
const HISTORY_MAX = 500;
/** At most this many songs of the queue are remembered for the next start. */
const RESUME_MAX = 3000;
/** How often the song position is saved while playing. */
const RESUME_SAVE_MS = 10_000;

/** What is playing now, in the form saved for the next start. */
function resumeOf(pb: Playback): ResumeState | null {
  const st = pb.station;
  if (st) return { kind: "radio", slug: st.slug, playing: pb.state.playing || pb.state.buffering };
  if (!pb.hasQueue || pb.state.index === null) return null;
  // Keep a window around the current song for very long queues.
  const from = Math.max(0, Math.min(pb.state.index - RESUME_MAX / 2, pb.queue.length - RESUME_MAX));
  const paths = pb.queue.slice(from, from + RESUME_MAX).map((t) => t.path);
  return { kind: "tracks", paths, index: pb.state.index - from, positionMs: pb.state.positionMs, playing: pb.state.playing };
}

/** Sends the chosen EQ curve to the audio engine. */
function sendEq(s: Settings): void {
  void playerCmd("eq", undefined, eqGains(s.eqPreset, s.eqCustom).join(","));
}
let lastHistoryKey = "";

/** The song that is playing now as a history entry; null when nothing is playing yet. */
function historyEntryFor(pb: Playback): HistoryEntry | null {
  const s = pb.state;
  if (!s.playing || s.buffering) return null;
  const st = pb.station;
  if (st) {
    const song = splitStreamTitle(s.streamTitle);
    return {
      at: Date.now(),
      path: st.streamUrl ?? st.pageUrl,
      title: song ? song.title : s.streamTitle || st.name,
      artist: song ? song.artist : "",
      album: "",
      station: st.name,
    };
  }
  const tr = pb.current;
  if (!tr) return null;
  return { at: Date.now(), path: tr.path, title: tr.title, artist: tr.artist, album: tr.album, station: "" };
}

const APP_VERSION = "1.3.0";
/** Side-button volume step (1/16 of the range, like the wheel's 2 ticks). */
const VOLUME_BUTTON_STEP = 1 / 16;
/** Fast-forward / rewind while a skip button is held: step and interval. */
const SEEK_STEP_MS = 4000;
const SEEK_EVERY_MS = 200;

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let view: DeviceView | undefined;
    let saveTimer: number | undefined;
    let seekTimer: number | undefined;
    let cancelled = false;
    let scanSeq = 0;
    const cleanups: (() => void)[] = [];

    (async () => {
      // The bundled font must be ready before the first canvas paint, including
      // its Lithuanian (Latin-Extended) and Cyrillic parts: a canvas does not
      // load font subsets by itself.
      await Promise.all(
        ["600 15px Inter", "700 13px Inter", "500 14px Inter", "600 12px Inter", "700 12px Inter", "700 8px Inter"].map((f) =>
          document.fonts.load(f, FONT_PRELOAD_SAMPLE),
        ),
      );
      const [settings, volumes] = await Promise.all([loadSettings(), listVolumes()]);
      if (cancelled || !canvasRef.current) return;

      const playback = new Playback(radioResolve);
      const alarmTone = new AlarmTone();
      cleanups.push(() => alarmTone.stop());
      playback.state = { ...playback.state, volume: settings.volume };
      const redraw = () => view?.invalidate();
      const art = new ArtStore((t) => getArt(t, true), redraw);

      // Images by URL (station pictures, song covers found online).
      const images = new Map<string, HTMLImageElement | null | "loading">();
      const image = (url: string): CanvasImageSource | null => {
        const e = images.get(url);
        if (e === undefined) {
          images.set(url, "loading");
          const img = new Image();
          img.onload = () => {
            images.set(url, img);
            redraw();
          };
          img.onerror = () => images.set(url, null);
          img.src = url;
          return null;
        }
        return e instanceof HTMLImageElement ? e : null;
      };
      const openCovers = new OpenArtworkStore(openArtwork, redraw);
      const songArt = (artist: string, title: string): CanvasImageSource | null => {
        const cover = openCovers.get(artist, title);
        return cover ? image(cover.imageUrl) : null;
      };

      const ctx: MenuContext = {
        settings,
        volumes,
        library: new Library([], 0),
        scan: { active: false, done: 0, total: 0 },
        playback,
        appVersion: APP_VERSION,
        art: (t) => art.get(t),
        radio: { stations: null },
        image,
        songArt,
        nowPlayingArt: (track) => art.get(track) || (art.settled(track) ? songArt(track.artist || track.albumArtist, track.title) : null),
        artworkInfo: (artist, title) => {
          const cover = openCovers.peek(artist, title);
          return cover ? artworkInfo(cover) : null;
        },
        artworkCredit: (artist, title) => {
          const cover = openCovers.peek(artist, title);
          return cover ? `Wikimedia Commons · ${cover.license} · i` : null;
        },
        artworkNotices: () => openCovers.credits().map(artworkInfo).join("\n\n────────\n\n"),
        listDirs,
        listPlaylistDir,
        readPlaylist,
        listFiles,
        readText,
        findFiles,
        photoUrl,
        chooseSource(volume: Volume, parts: string[]) {
          ctx.update({ librarySource: { volumeId: volume.id, relativePath: parts.join("/") } });
          void loadLibrary(joinPath(volume.mountPoint, parts));
        },
        update(patch: Partial<Settings>) {
          const before = ctx.settings;
          ctx.settings = { ...ctx.settings, ...patch };
          if (patch.repeat && patch.repeat !== before.repeat) playback.setRepeat(patch.repeat);
          if (patch.eqPreset !== undefined || patch.eqCustom !== undefined) {
            if (ctx.settings.eqPreset !== before.eqPreset || ctx.settings.eqCustom !== before.eqCustom) sendEq(ctx.settings);
          }
          if (patch.volumeLimit !== undefined) setVolumeLimitMark(ctx.settings.volumeLimit);
          if (patch.clock24 !== undefined) setClock24(ctx.settings.clock24 !== false);
          if (patch.timeInTitle !== undefined) setTitleClock(ctx.settings.timeInTitle ? () => formatTime(new Date()) : null);
          if (patch.crossfade !== undefined && patch.crossfade !== before.crossfade) {
            void playerCmd("crossfade", ctx.settings.crossfade ? 1 : 0);
          }
          if (patch.soundCheck !== undefined && patch.soundCheck !== before.soundCheck) {
            void playerCmd("soundcheck", ctx.settings.soundCheck ? 1 : 0);
          }
          window.clearTimeout(saveTimer);
          saveTimer = window.setTimeout(() => void saveSettings(ctx.settings), 300);
          redraw();
        },
        resetSettings() {
          // Library source and volume survive a settings reset.
          // A locked Volume Limit survives a reset too (only its combination unlocks it).
          const s = ctx.settings;
          const keepLimit = s.volumeLimitCode ? { volumeLimit: s.volumeLimit, volumeLimitCode: s.volumeLimitCode } : {};
          ctx.update({ ...DEFAULT_SETTINGS, librarySource: s.librarySource, volume: s.volume, ...keepLimit });
          playback.setLimit(ctx.settings.volumeLimit);
          nav.home();
        },
        refresh: redraw,
        beep: (on) => (on ? alarmTone.start() : alarmTone.stop()),
      };

      /** Shows the cached index at once, then rescans in the background. */
      async function loadLibrary(root: string) {
        const seq = ++scanSeq;
        art.clear();
        const cached = await libraryCached(root);
        if (seq !== scanSeq) return;
        ctx.library = new Library(cached, seq * 2);
        ctx.scan = { active: true, done: 0, total: 0 };
        tryResumeTracks();
        redraw();
        try {
          const tracks = await scanLibrary(root, (p) => {
            if (seq !== scanSeq) return;
            ctx.scan = { active: true, done: p.done, total: p.total };
            redraw();
          });
          if (seq !== scanSeq) return;
          ctx.library = new Library(tracks, seq * 2 + 1);
          tryResumeTracks();
        } catch (e) {
          setError(`Scan failed: ${e}`);
        } finally {
          if (seq === scanSeq) ctx.scan = { ...ctx.scan, active: false };
          redraw();
        }
      }

      const nav = new Navigator(buildRoot(ctx));

      // ---- Carry on after a restart: remember what plays, bring it back on start.
      let resumeKey = "";
      let resumeSavedAt = 0;
      let resumed = false;
      const rememberPlace = (force: boolean) => {
        // Do not overwrite the saved place before it was used, unless the user
        // already started something else.
        if (!resumed) {
          if (!playback.state.playing) return;
          resumed = true;
        }
        const r = resumeOf(playback);
        if (!r) return;
        const key = r.kind === "radio" ? `r|${r.slug}|${r.playing}` : `t|${r.paths.length}|${r.paths[r.index]}|${r.playing}`;
        const now = Date.now();
        if (!force && key === resumeKey && now - resumeSavedAt < RESUME_SAVE_MS) return;
        resumeKey = key;
        resumeSavedAt = now;
        ctx.update({ resume: r });
      };
      const showNowPlaying = () => {
        if (!ctx.screens || nav.current.screen.id === "locked" || nav.depth > 1) return;
        nav.push(ctx.screens.nowPlaying());
        redraw();
      };
      const tryResumeTracks = () => {
        const r = ctx.settings.resume;
        if (resumed || !r || r.kind !== "tracks") return;
        const byPath = new Map(ctx.library.tracks.map((t) => [t.path, t]));
        if (byPath.size === 0) return;
        const current = r.paths[r.index];
        const queue = r.paths.map((p) => byPath.get(p)).filter((t): t is NonNullable<typeof t> => !!t);
        resumed = true;
        if (queue.length === 0) return;
        const idx = Math.max(0, queue.findIndex((t) => t.path === current));
        const sameSong = queue[idx]?.path === current;
        playback.restore(queue, idx, sameSong ? r.positionMs : 0, r.playing);
        if (r.playing) showNowPlaying();
      };
      const tryResumeRadio = (list: Station[]) => {
        const r = ctx.settings.resume;
        if (resumed || !r || r.kind !== "radio") return;
        resumed = true;
        // Older versions used fm.lt slugs; migrate those by station name.
        const legacyName = fold(r.slug.replace(/-/g, " "));
        const station = list.find((st) => st.slug === r.slug)
          ?? list.find((st) => st.countryCode === "LT" && fold(st.name) === legacyName);
        if (!station || !r.playing) return;
        const countryStations = radioCountries(list).find((country) => country.name === station.country)!.stations;
        void playback.playStation(countryStations, countryStations.indexOf(station));
        showNowPlaying();
      };
      if (!ctx.settings.resume) resumed = true;
      /** Close: save where the music is, then quit. */
      const quitSaving = async () => {
        rememberPlace(true);
        window.clearTimeout(saveTimer);
        await saveSettings(ctx.settings).catch(() => {});
        await windowAction("close");
      };
      // Quit from the tray menu: same, the Rust side waits for this.
      cleanups.push(await onAppQuit(() => void quitSaving()));

      cleanups.push(
        await onPlayerState((s) => {
          playback.update(s);
          rememberPlace(false);
          const entry = historyEntryFor(playback);
          if (entry) {
            const key = `${entry.station}\u001f${entry.path}\u001f${entry.title}\u001f${s.index}`;
            if (key !== lastHistoryKey) {
              lastHistoryKey = key;
              ctx.update({ history: [entry, ...ctx.settings.history].slice(0, HISTORY_MAX) });
            }
          }
          redraw();
        }),
      );
      setClock24(settings.clock24 !== false);
      setTitleClock(settings.timeInTitle ? () => formatTime(new Date()) : null);
      playback.limit = settings.volumeLimit ?? 1;
      setVolumeLimitMark(playback.limit);
      void playerCmd("volume", Math.min(settings.volume, playback.limit));
      sendEq(settings);
      void playerCmd("crossfade", settings.crossfade ? 1 : 0);
      void playerCmd("soundcheck", settings.soundCheck ? 1 : 0);
      playback.setRepeat(settings.repeat);

      view = new DeviceView(canvasRef.current, nav, {
        clickerOn: () => ctx.settings.clicker,
        backlightSecs: () => ctx.settings.backlightSecs,
        isPlaying: () => playback.state.playing,
        busy: () => ctx.scan.active,
        menuArt: () => {
          if (playback.current) return art.get(playback.current);
          const st = playback.station;
          if (!st) return null;
          const song = splitStreamTitle(playback.state.streamTitle);
          return (song && songArt(song.artist, song.title)) || (st.image ? image(st.image) : null);
        },
        mouseControl: () => ctx.settings.mouseControl,
        onVolume: (dir) => {
          const v = playback.setVolume(playback.state.volume + dir * VOLUME_BUTTON_STEP);
          ctx.update({ volume: v });
          return v;
        },
        onTransport: (button, long) => {
          if (button === "play") {
            if (!long) playback.toggle();
            return;
          }
          if (!long) {
            if (button === "next") playback.next();
            else playback.prev();
            return;
          }
          // Held: fast-forward / rewind until released.
          window.clearInterval(seekTimer);
          const dir = button === "next" ? 1 : -1;
          seekTimer = window.setInterval(() => playback.seekBy(dir * SEEK_STEP_MS), SEEK_EVERY_MS);
        },
        onTransportRelease: () => window.clearInterval(seekTimer),
        onWindow: (a) => void (a === "close" ? quitSaving() : windowAction(a)),
      });

      // The catalogue already contains stream URLs: do not launch thousands of
      // website/metadata lookups in the background.
      void radioStations().then((list) => {
        if (cancelled) return;
        ctx.radio.stations = list;
        tryResumeRadio(list);
        redraw();
      }).catch(() => {
        if (cancelled) return;
        ctx.radio.stations = [];
        redraw();
      });

      // Locked when the app was closed: stays locked.
      if (ctx.settings.locked && ctx.settings.lockCode && ctx.screens) {
        nav.push(ctx.screens.lock());
        redraw();
      }

      // Alarms: checked every few seconds; a ringing alarm opens its screen.
      let shownMinute = -1;
      const alarmTimer = window.setInterval(() => {
        const now = new Date();
        // Clock in the title bar: redraw when the minute changes.
        if (ctx.settings.timeInTitle && now.getMinutes() !== shownMinute) {
          shownMinute = now.getMinutes();
          redraw();
        }
        const due = dueAlarms(ctx.settings.alarms, now);
        if (due.length === 0 || !ctx.screens) return;
        ctx.update({ alarms: ctx.settings.alarms.map((a) => (due.some((d) => d.id === a.id) ? afterFiring(a, now) : a)) });
        // Also over the lock screen: dismissing it returns to the lock.
        nav.push(ctx.screens.alarmRinging(due[0]));
        void showWindow();
        redraw();
      }, 2000);
      cleanups.push(() => window.clearInterval(alarmTimer));

      // Remembered library: found again by volume id even if the drive letter changed.
      const resolved = await resolveLibrarySource(settings.librarySource ?? undefined);
      if (resolved && !cancelled) void loadLibrary(resolved.path);
    })().catch((e) => setError(String(e)));

    return () => {
      cancelled = true;
      window.clearTimeout(saveTimer);
      window.clearInterval(seekTimer);
      cleanups.forEach((c) => c());
      view?.dispose();
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{ width: DEVICE.w, height: DEVICE.h, display: "block", touchAction: "none" }}
      />
      {error && (
        <pre className="fatal" onClick={() => setError(null)}>
          {error}
        </pre>
      )}
    </>
  );
}
