// Library search used by Music → Search. Matching ignores case and accents,
// and every typed word must start a word in the artist, album or title
// ("nat kor" finds "Наташа Королёва" only via Cyrillic letters, "jur neb" finds
// "Jurga – Nebijok").
import type { Album, Group, Library, Track } from "./library";

/** Letters on the search wheel: space, Latin, Lithuanian, Cyrillic, digits. */
export const SEARCH_CHARS: string[] = [
  " ",
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  ..."ĄČĘĖĮŠŲŪŽ",
  ..."АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ",
  ..."0123456789",
];

/** Lower case, accents removed (š→s, ё→е), so typing without diacritics still finds. */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ё/g, "е")
    .replace(/й/g, "и");
}

function words(s: string): string[] {
  return fold(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** True when every query word starts some word of `text`. */
export function matches(query: string, text: string): boolean {
  const q = words(query);
  if (q.length === 0) return false;
  const w = words(text);
  return q.every((qw) => w.some((tw) => tw.startsWith(qw)));
}

export interface SearchResults {
  artists: Group[];
  albums: Album[];
  songs: Track[];
}

export const EMPTY_RESULTS: SearchResults = { artists: [], albums: [], songs: [] };

export function searchLibrary(lib: Library, query: string, limit = 200): SearchResults {
  if (!query.trim()) return EMPTY_RESULTS;
  return {
    artists: lib.artists().filter((g) => matches(query, g.name)).slice(0, limit),
    albums: lib.albums().filter((a) => matches(query, `${a.name} ${a.artist}`)).slice(0, limit),
    songs: lib.songs().filter((t) => matches(query, `${t.title} ${t.artist} ${t.album}`)).slice(0, limit),
  };
}

export function resultCount(r: SearchResults): number {
  return r.artists.length + r.albums.length + r.songs.length;
}
