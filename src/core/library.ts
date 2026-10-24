// In-memory music library with the indexes the Music menu needs. Built once per
// scan result; lists are sorted the way the original sorts them (case-insensitive,
// "The " ignored, numbers in natural order).

export interface Track {
  path: string;
  title: string;
  artist: string;
  albumArtist: string;
  album: string;
  genre: string;
  composer: string;
  trackNo: number;
  discNo: number;
  year: number;
  durationMs: number;
  compilation: boolean;
  /** ReplayGain level (dB) from the file's tags. */
  gainDb?: number | null;
}

export interface Album {
  key: string;
  name: string;
  artist: string;
  compilation: boolean;
  tracks: Track[];
}

export interface Group {
  name: string;
  tracks: Track[];
}

export const UNKNOWN_ARTIST = "\u0000artist";
export const UNKNOWN_ALBUM = "\u0000album";
export const UNKNOWN_GENRE = "\u0000genre";
export const UNKNOWN_COMPOSER = "\u0000composer";

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

/** Sort key: drops a leading "The " like the original. Unknowns go last. */
export function sortKey(s: string): string {
  if (s.startsWith("\u0000")) return "￿";
  return s.replace(/^the\s+/i, "").trim();
}

export function compareNames(a: string, b: string): number {
  return collator.compare(sortKey(a), sortKey(b));
}

export function artistOf(t: Track): string {
  return t.artist || t.albumArtist || UNKNOWN_ARTIST;
}

export function albumArtistOf(t: Track): string {
  return t.albumArtist || t.artist || UNKNOWN_ARTIST;
}

export function albumKeyOf(t: Track): string {
  // Compilations group by album only, so various artists stay one album.
  const who = t.compilation ? "" : albumArtistOf(t).toLowerCase();
  return `${who}\u001f${(t.album || UNKNOWN_ALBUM).toLowerCase()}`;
}

/** Album order: disc, then track number, then title. */
export function compareInAlbum(a: Track, b: Track): number {
  return (a.discNo || 1) - (b.discNo || 1) || (a.trackNo || 9999) - (b.trackNo || 9999) || compareNames(a.title, b.title);
}

function groupBy(tracks: Track[], key: (t: Track) => string): Group[] {
  const map = new Map<string, Group>();
  for (const t of tracks) {
    const k = key(t);
    const id = k.toLowerCase();
    let g = map.get(id);
    if (!g) map.set(id, (g = { name: k, tracks: [] }));
    g.tracks.push(t);
  }
  return [...map.values()].sort((a, b) => compareNames(a.name, b.name));
}

function albumsOf(tracks: Track[]): Album[] {
  const map = new Map<string, Album>();
  for (const t of tracks) {
    const key = albumKeyOf(t);
    let a = map.get(key);
    if (!a) {
      a = { key, name: t.album || UNKNOWN_ALBUM, artist: albumArtistOf(t), compilation: t.compilation, tracks: [] };
      map.set(key, a);
    }
    a.tracks.push(t);
  }
  const list = [...map.values()];
  for (const a of list) a.tracks.sort(compareInAlbum);
  return list.sort((a, b) => compareNames(a.name, b.name) || compareNames(a.artist, b.artist));
}

export class Library {
  readonly tracks: Track[];
  private cache = new Map<string, unknown>();

  constructor(tracks: Track[], readonly version = 0) {
    this.tracks = tracks;
  }

  private memo<T>(key: string, build: () => T): T {
    if (!this.cache.has(key)) this.cache.set(key, build());
    return this.cache.get(key) as T;
  }

  get isEmpty(): boolean {
    return this.tracks.length === 0;
  }

  songs(): Track[] {
    return this.memo("songs", () => [...this.tracks].sort((a, b) => compareNames(a.title, b.title) || compareNames(artistOf(a), artistOf(b))));
  }

  albums(): Album[] {
    return this.memo("albums", () => albumsOf(this.tracks));
  }

  artists(): Group[] {
    return this.memo("artists", () => groupBy(this.tracks, artistOf));
  }

  genres(): Group[] {
    return this.memo("genres", () => groupBy(this.tracks, (t) => t.genre || UNKNOWN_GENRE));
  }

  composers(): Group[] {
    return this.memo("composers", () => groupBy(this.tracks.filter((t) => t.composer), (t) => t.composer));
  }

  compilations(): Album[] {
    return this.memo("compilations", () => this.albums().filter((a) => a.compilation));
  }

  audiobooks(): Track[] {
    return this.memo("audiobooks", () =>
      this.songs().filter((t) => /\.m4b$/i.test(t.path) || /audiobook/i.test(t.genre)),
    );
  }

  /** Albums made from a subset of tracks (an artist's, a genre's). */
  albumsIn(tracks: Track[]): Album[] {
    return albumsOf(tracks);
  }

  /** Every track of a set in album order (album, then disc/track). */
  inAlbumOrder(tracks: Track[]): Track[] {
    return albumsOf(tracks).flatMap((a) => a.tracks);
  }

  /** Same album as `t` (for artwork shared by an album). */
  albumOf(t: Track): Album | undefined {
    return this.albums().find((a) => a.key === albumKeyOf(t));
  }
}

/** Fisher–Yates shuffle; `first` (if given) is moved to the front. */
export function shuffled<T>(items: T[], first?: T, rnd: () => number = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  if (first !== undefined) {
    const i = a.indexOf(first);
    if (i > 0) [a[0], a[i]] = [a[i], a[0]];
  }
  return a;
}

/** Shuffle by album: album order is random, songs keep album order. */
export function shuffledByAlbum(tracks: Track[], first?: Track, rnd: () => number = Math.random): Track[] {
  const albums = albumsOf(tracks);
  let order = shuffled(albums, undefined, rnd);
  if (first) {
    const key = albumKeyOf(first);
    const own = order.find((a) => a.key === key);
    if (own) {
      order = [own, ...order.filter((a) => a !== own)];
      const start = own.tracks.indexOf(first);
      return [...own.tracks.slice(start), ...order.slice(1).flatMap((a) => a.tracks), ...own.tracks.slice(0, start)];
    }
  }
  return order.flatMap((a) => a.tracks);
}

export function formatTime(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}
