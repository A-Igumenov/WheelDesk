// UI-side view of playback: which tracks or which radio station is playing and
// what the Rust player last reported. Starting a list applies the Shuffle
// setting the way the original does; everything else goes to the player.
import { shuffled, shuffledByAlbum, type Track } from "./library";
import {
  playerCmd,
  playerLoad,
  type PlayerState,
  type RepeatMode,
  type ShuffleMode,
  type Station,
  type StationFilter,
} from "../platform/bridge";

export const VOLUME_STEP = 1 / 32;

export interface RadioState {
  stations: Station[];
  index: number;
  /** Which part of the catalogue the stations came from (for resuming). */
  filter?: StationFilter;
}

export class Playback {
  queue: Track[] = [];
  /** Set while a radio station (rather than the music library) is playing. */
  radio: RadioState | null = null;
  state: PlayerState = {
    playing: false, index: null, queueLen: 0, positionMs: 0, durationMs: 0, volume: 0.7,
    path: null, error: null, buffering: false, streamTitle: null,
  };
  /** Bumped per station start, so a slow lookup cannot start an old station. */
  private radioSeq = 0;

  constructor(private readonly resolveStation: (s: Station, fresh: boolean) => Promise<Station> = async (s) => s) {}

  /** True once something has been queued: the main menu then shows "Now Playing". */
  get hasQueue(): boolean {
    return this.state.index !== null && (this.queue.length > 0 || this.radio !== null);
  }

  get current(): Track | null {
    if (this.radio) return null;
    const i = this.state.index;
    return i === null ? null : this.queue[i] ?? null;
  }

  get station(): Station | null {
    return this.radio ? this.radio.stations[this.radio.index] ?? null : null;
  }

  update(s: PlayerState): void {
    this.state = s;
  }

  /** Plays `list` starting at `index`, honouring the Shuffle setting. */
  playList(list: Track[], index: number, shuffle: ShuffleMode): void {
    if (list.length === 0) return;
    this.radio = null;
    this.radioSeq++;
    const first = list[Math.max(0, Math.min(index, list.length - 1))];
    let queue = list;
    let start = list.indexOf(first);
    if (shuffle === "songs") {
      queue = shuffled(list, first);
      start = 0;
    } else if (shuffle === "albums") {
      queue = shuffledByAlbum(list, first);
      start = 0;
    }
    this.queue = queue;
    // Optimistic state so the Now Playing screen is right before the first event.
    this.state = {
      ...this.state, index: start, queueLen: queue.length, positionMs: 0, durationMs: first.durationMs,
      path: first.path, playing: true, buffering: false, streamTitle: null, error: null,
    };
    void playerLoad(queue.map((t) => ({ path: t.path, durationMs: t.durationMs, gainDb: t.gainDb ?? null })), start, true);
  }

  /** Brings back the queue from the last run: same song, same place, playing or paused. */
  restore(queue: Track[], index: number, ms: number, play: boolean): void {
    if (queue.length === 0) return;
    const i = Math.max(0, Math.min(index, queue.length - 1));
    this.radio = null;
    this.radioSeq++;
    this.queue = queue;
    const t = queue[i];
    this.state = {
      ...this.state, index: i, queueLen: queue.length, positionMs: ms, durationMs: t.durationMs,
      path: t.path, playing: play, buffering: false, streamTitle: null, error: null,
    };
    void playerLoad(queue.map((q) => ({ path: q.path, durationMs: q.durationMs, gainDb: q.gainDb ?? null })), i, play);
    if (ms > 0) void playerCmd("seekTo", ms);
  }

  /** Plays one song from `ms` (Music Quiz). */
  preview(track: Track, ms: number): void {
    this.playList([track], 0, "off");
    this.state = { ...this.state, positionMs: ms };
    if (ms > 0) void playerCmd("seekTo", ms);
  }

  pause(): void {
    if (!this.state.playing) return;
    this.state = { ...this.state, playing: false };
    void playerCmd("pause");
  }

  /** "Shuffle Songs" from the main menu: every song, random order. */
  shuffleAll(all: Track[]): void {
    if (all.length === 0) return;
    this.playList(shuffled(all), 0, "off");
  }

  /** Tunes in to stations[index]; its stream address is looked up first if needed. */
  async playStation(stations: Station[], index: number, filter?: StationFilter): Promise<void> {
    if (stations.length === 0) return;
    const i = ((index % stations.length) + stations.length) % stations.length;
    const seq = ++this.radioSeq;
    this.queue = [];
    this.radio = { stations, index: i, filter: filter ?? (this.radio?.stations === stations ? this.radio.filter : undefined) };
    this.state = {
      ...this.state, index: 0, queueLen: 1, positionMs: 0, durationMs: 0, path: null,
      playing: true, buffering: true, streamTitle: null, error: null,
    };
    let st = stations[i];
    if (!st.streamUrl) {
      try {
        st = await this.resolveStation(st, false);
        stations[i] = st;
      } catch {
        /* handled below */
      }
    }
    if (seq !== this.radioSeq) return;
    if (!st.streamUrl) {
      this.state = { ...this.state, playing: false, buffering: false, error: "Stream not found" };
      return;
    }
    const alternates = (st.streams ?? []).filter((u) => u !== st.streamUrl);
    void playerLoad([{ path: st.streamUrl, durationMs: 0, stream: true, alternates }], 0, true);
  }

  toggle(): void {
    if (!this.hasQueue) return;
    this.state = { ...this.state, playing: !this.state.playing };
    void playerCmd("toggle");
  }

  next(): void {
    if (this.radio) void this.playStation(this.radio.stations, this.radio.index + 1);
    else if (this.hasQueue) void playerCmd("next");
  }

  prev(): void {
    if (this.radio) void this.playStation(this.radio.stations, this.radio.index - 1);
    else if (this.hasQueue) void playerCmd("prev");
  }

  seekBy(ms: number): void {
    if (!this.hasQueue || this.radio) return;
    const pos = Math.max(0, Math.min(this.state.durationMs, this.state.positionMs + ms));
    this.state = { ...this.state, positionMs: pos };
    void playerCmd("seekBy", ms);
  }

  /** Volume Limit from Settings: the volume never goes above it. */
  limit = 1;

  setLimit(limit: number): void {
    this.limit = Math.max(0, Math.min(1, limit));
    if (this.state.volume > this.limit) this.setVolume(this.limit);
  }

  setVolume(v: number): number {
    const vol = Math.max(0, Math.min(this.limit, 1, Math.round(v / VOLUME_STEP) * VOLUME_STEP));
    this.state = { ...this.state, volume: vol };
    void playerCmd("volume", vol);
    return vol;
  }

  setRepeat(r: RepeatMode): void {
    void playerCmd("repeat", undefined, r);
  }
}

/** "Artist - Title" as stations send it; null for jingles, ads and station names. */
export function splitStreamTitle(s: string | null): { artist: string; title: string } | null {
  if (!s) return null;
  const text = s.trim();
  for (const sep of [" - ", " – ", " — ", " | "]) {
    const i = text.indexOf(sep);
    if (i > 0) {
      const artist = text.slice(0, i).trim();
      const title = text.slice(i + sep.length).trim();
      const lower = text.toLowerCase();
      if (!artist || !title) return null;
      if (["reklama", "www.", "http", ".lt", "eteryje", "on air", "jingle"].some((w) => lower.includes(w))) return null;
      return { artist, title };
    }
  }
  return null;
}
