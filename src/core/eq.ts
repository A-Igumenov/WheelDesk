// EQ presets in the same order as the original device's EQ list. The band
// curves are our own (10 bands, dB); "Custom" is the user's own curve, set
// band by band in the EQ editor.

export const EQ_BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;
export const EQ_MAX_DB = 12;
export const CUSTOM = "Custom";

type Curve = readonly [number, number, number, number, number, number, number, number, number, number];

const CURVES = {
  Off: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  Acoustic: [4.5, 4.5, 3.5, 1, 1.5, 1.5, 3, 3.5, 3, 2],
  "Bass Booster": [5.5, 4.5, 3.5, 2.5, 1, 0, 0, 0, 0, 0],
  "Bass Reducer": [-5.5, -4.5, -3.5, -2.5, -1, 0, 0, 0, 0, 0],
  Classical: [4.5, 3.5, 3, 2.5, -1.5, -1.5, 0, 2, 3, 3.5],
  Dance: [3.5, 6.5, 5, 0, 2, 3.5, 5, 4.5, 3.5, 0],
  Deep: [5, 3.5, 1.5, 1, 3, 2.5, 1.5, -2, -3.5, -4.5],
  Electronic: [4.5, 4, 1.5, 0, -2, 2, 1, 1.5, 4, 5],
  Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  "Hip Hop": [5, 4, 1.5, 3, -1, -1, 1.5, -0.5, 2, 3],
  Jazz: [4, 3, 1.5, 2, -1.5, -1.5, 0, 1.5, 3, 3.5],
  Latin: [4.5, 3, 0, 0, -1.5, -1.5, -1.5, 0, 3, 4.5],
  Loudness: [6, 4, 0, 0, -2, 0, -1, -5, 5, 1],
  Lounge: [-3, -1.5, -0.5, 1.5, 4, 2.5, 0, -1.5, 2, 1],
  Piano: [3, 2, 0, 2.5, 3, 1.5, 3.5, 4.5, 3, 3.5],
  Pop: [-1.5, -1, 0, 2, 4, 4, 2, 0, -1, -1.5],
  "R&B": [2.5, 7, 5.5, 1.5, -2.5, -1.5, 2.5, 3, 3, 3.5],
  Rock: [5, 4, 3, 1.5, -0.5, -1, 0.5, 2.5, 3.5, 4.5],
  "Small Speakers": [5.5, 4, 3.5, 2.5, 1.5, 0, -1.5, -2.5, -3.5, -4],
  "Spoken Word": [-3.5, -0.5, 0, 0.5, 3.5, 4.5, 5, 4, 2.5, 0],
  "Treble Booster": [0, 0, 0, 0, 0, 1, 2.5, 3.5, 4.5, 5.5],
  "Treble Reducer": [0, 0, 0, 0, 0, -1, -2.5, -3.5, -4.5, -5.5],
  "Vocal Booster": [-1.5, -3, -3, 1.5, 3.5, 3.5, 3, 1.5, 0, -1.5],
} satisfies Record<string, Curve>;

export const EQ_PRESETS = Object.keys(CURVES) as (keyof typeof CURVES)[];

/** Band gains for a preset name (Custom uses the user's curve; unknown names are flat). */
export function eqGains(preset: string, custom: readonly number[] | undefined): number[] {
  if (preset === CUSTOM) return normalizeCurve(custom);
  const c = (CURVES as Record<string, Curve>)[preset];
  return c ? [...c] : EQ_BANDS.map(() => 0);
}

/** Ten finite gains within ±12 dB. */
export function normalizeCurve(v: readonly number[] | undefined): number[] {
  return EQ_BANDS.map((_, i) => {
    const x = Number(v?.[i] ?? 0);
    return Number.isFinite(x) ? Math.max(-EQ_MAX_DB, Math.min(EQ_MAX_DB, x)) : 0;
  });
}

export function bandLabel(hz: number): string {
  return hz >= 1000 ? `${hz / 1000}k` : String(hz);
}
