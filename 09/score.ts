// 09 / Membrane: the score everything follows — the sketch's picture (main.ts) and its sound (audio/render.ts).
//
// Film time t runs 0..LOOP and wraps (the loop). Story time is the world's own clock: it runs with film time except
// around the great stroke, where time dilates — the rate falls to a hundredth as the beater comes down, holds there
// while the hide takes it and the ripples run, and comes back up as the universes answer. Everything physical (the
// membrane, the beater, the locks, the motes) moves in story time; the camera and the cosmos move in film time.
//
// The drumming: a slow ceremonial pulse (three strokes, each a little stronger), the wind-up, the great stroke, the
// long answer, and the pulse taken up again — the last two strokes are the first two of the next loop.

export const LOOP = 26;

export interface Stroke {
  /** film time of contact */
  t: number;
  /** the beater head's speed into the hide at contact, m/s */
  v: number;
  /** where on the hide (its frame: x across, y up, metres from the centre) */
  at: [number, number];
  /** the great one */
  big?: boolean;
}

export const STROKES: Stroke[] = [
  { t: 1.2, v: 3.2, at: [-0.26, 0.05] },
  { t: 3.0, v: 3.7, at: [-0.24, 0.07] },
  { t: 4.8, v: 4.3, at: [-0.27, 0.04] },
  { t: 9.6, v: 9.5, at: [-0.2, 0.1], big: true },
  { t: 23.6, v: 2.9, at: [-0.25, 0.06] },
  { t: 25.4, v: 3.0, at: [-0.26, 0.05] },
];
export const BIG = STROKES.find((s) => s.big)!;

// ---------------------------------------------------------------- time dilation
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** the slowest the world runs (at the stroke) */
export const SLOWEST = 0.01;
/** when the dilation sets in, bottoms out, starts to lift, and is gone (film seconds) */
export const DILATE = { from: 7.9, deep: 9.35, lift: 11.6, gone: 20.5 };

/** the world's rate against film time: 1 normally, SLOWEST at the deepest. Falls and rises log-smoothly, so the
 *  slowing reads as an exponential settling, not a ramp */
export function rate(t: number): number {
  const ls = Math.log(SLOWEST);
  const down = smooth(DILATE.from, DILATE.deep, t);
  const up = smooth(DILATE.lift, DILATE.gone, t);
  return Math.exp(ls * down * (1 - up));
}

// story time: the integral of the rate, tabulated once (fine steps; the loop's total is a little under LOOP)
const STEP = 1 / 2400;
const N = Math.ceil(LOOP / STEP) + 1;
const table = new Float64Array(N);
for (let i = 1; i < N; i++) {
  const a = (i - 1) * STEP, b = i * STEP;
  table[i] = table[i - 1] + (rate(a) + 4 * rate((a + b) / 2) + rate(b)) * STEP / 6;
}
/** story time elapsed in one loop */
export const STORY_LOOP = table[N - 1];
/** story time at film time t (t in [0, LOOP)) */
export function story(t: number): number {
  const x = Math.min(Math.max(t, 0), LOOP) / STEP;
  const i = Math.min(N - 2, Math.floor(x));
  return table[i] + (table[i + 1] - table[i]) * (x - i);
}
/** film time at story time s (the inverse, by bisection on the table) */
export function film(s: number): number {
  let lo = 0, hi = N - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (table[m] < s) lo = m; else hi = m; }
  const f = (s - table[lo]) / Math.max(1e-12, table[hi] - table[lo]);
  return (lo + f) * STEP;
}

// ---------------------------------------------------------------- the act's beats (film seconds)
export const ACT = {
  /** after the third stroke she draws all the way back: the wind-up */
  windup: 5.25,
  /** the downswing starts (story time from here to contact is a real downswing's ~0.2 s) */
  swing: 0,   // filled below
  /** the shock leaves the drum, the camera pulls away */
  shock: 10.9,
  /** the great membrane answers */
  cosmos: 12.4,
  /** the foam of universes: the camera out past our membrane */
  foam: 15.0,
  /** the way back in */
  home: 18.6,
  /** back at the drum, the pulse taken up again */
  settle: 21.5,
};
ACT.swing = film(story(BIG.t) - 0.19);

/** the stroke before film time t, and after it (wrapping round the loop), with the story time since and until */
export function around(t: number) {
  const s = story(t);
  let prev = STROKES[STROKES.length - 1], next = STROKES[0];
  let since = s - story(prev.t) + STORY_LOOP, until = story(next.t) - s + (t > next.t ? STORY_LOOP : 0);
  for (let i = 0; i < STROKES.length; i++) {
    if (STROKES[i].t <= t) { prev = STROKES[i]; since = s - story(prev.t); }
  }
  for (let i = STROKES.length - 1; i >= 0; i--) {
    if (STROKES[i].t > t) { next = STROKES[i]; until = story(next.t) - s; }
  }
  return { prev, next, since, until };
}
