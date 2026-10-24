// "Music Quiz": a song from the library plays from a random point; pick its
// title out of four before the time runs out.
import type { Track } from "../library";

export const QUIZ_ROUNDS = 10;
export const QUIZ_SECONDS = 10;

export interface QuizRound {
  track: Track;
  /** Four titles, one of them the right one. */
  options: Track[];
  /** Where the song starts playing (ms). */
  startMs: number;
}

/** Songs that can be asked about: long enough, and with distinct titles. */
export function quizPool(tracks: Track[]): Track[] {
  const seen = new Set<string>();
  return tracks.filter((t) => {
    const key = t.title.trim().toLowerCase();
    if (!key || seen.has(key) || t.durationMs < 20_000) return false;
    seen.add(key);
    return true;
  });
}

export function makeRound(pool: Track[], used: Set<string>, rnd: () => number = Math.random): QuizRound | null {
  if (pool.length < 4) return null;
  const fresh = pool.filter((t) => !used.has(t.path));
  const from = fresh.length ? fresh : pool;
  const track = from[Math.floor(rnd() * from.length)];
  used.add(track.path);
  const others = pool.filter((t) => t !== track);
  const options: Track[] = [track];
  while (options.length < 4) {
    const o = others.splice(Math.floor(rnd() * others.length), 1)[0];
    options.push(o);
  }
  // Shuffle so the answer is not always first.
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  const room = Math.max(0, track.durationMs - QUIZ_SECONDS * 1000 - 5000);
  return { track, options, startMs: Math.floor(5000 * Math.min(1, track.durationMs / 60_000) + rnd() * room * 0.8) };
}

/** Points for a right answer: quicker answers score more. */
export function points(secondsLeft: number): number {
  return 10 + Math.max(0, Math.round(secondsLeft * 9));
}
