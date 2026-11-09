// 09 / Membrane: the score everything follows — the sketch's picture (main.ts) and its sound (audio/render.ts).
//
// Film time t runs 0..LOOP and wraps (the loop). Story time is the world's own clock: it runs with film time except
// from the great stroke on, where time dilates — the rate falls to a two-hundredth as the beater comes down and holds
// there for seconds while the hide takes it and its rings crawl out across it, then lifts, not all the way: to a
// dreamlike third of the world's pace, which it keeps to the end (ten seconds after the stroke), where it comes back in
// the dark of the loop's wrap.
// Everything physical (the membrane, the beater, the locks, the motes) moves in story time; the camera and the cosmos
// move in film time.
//
// The drumming: a slow ceremonial pulse (three strokes, each stronger than the last, and louder), the wind-up, and
// the great stroke — the last. After it nothing is struck again: the hide and our universe's membrane ripple on, the
// hide thinned to a veil on the world inside the drum, deepening to the end, which fades to black (the loop's seam).

import { STYLE } from './style.ts';

/** seconds from the great stroke to the fade (the style's: 'a' 9.1) */
const AFTER = STYLE.after;
const GREAT = 10.9;
export const LOOP = Math.round((GREAT + AFTER + 2.0) * 10) / 10;

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

// (a style may strike the pulse twice instead of three times: the first a little later, harder, the gap longer)
export const STROKES: Stroke[] = STYLE.pulses === 2 ? [
  { t: 2.4, v: 4.0, at: [-0.25, 0.06] },
  { t: 6.6, v: 6.0, at: [-0.27, 0.04] },
  { t: GREAT, v: 12.5, at: [-0.2, 0.1], big: true },
] : [
  { t: 1.8, v: 3.0, at: [-0.26, 0.05] },
  { t: 4.2, v: 4.4, at: [-0.24, 0.07] },
  { t: 6.6, v: 6.0, at: [-0.27, 0.04] },
  { t: GREAT, v: 12.5, at: [-0.2, 0.1], big: true },
];
export const BIG = STROKES.find((s) => s.big)!;

// ---------------------------------------------------------------- time dilation
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** the slowest the world runs (at the stroke), and the dream pace it lifts to and keeps after */
export const SLOWEST = 0.005, DREAM = 0.35;
/** when the dilation sets in, bottoms out, starts to lift, reaches the dream pace, and when time comes back (in the
 *  dark of the loop's seam) — film seconds. It snaps in late — a speed ramp: the downswing whips through at the
 *  world's own speed and time falls away under it in the last few tenths of a second before contact, so the beater
 *  is still visibly travelling as it meets the hide — holds deep for three seconds, and lifts slowly */
export const DILATE = { from: GREAT - 0.65, deep: GREAT + 0.02,
  lift: GREAT + (STYLE.slow ? STYLE.slow.lift : (STYLE.orbit ? 0.82 : 0.33) * AFTER), dream: GREAT + (STYLE.slow ? STYLE.slow.dream : (STYLE.orbit ? 0.98 : 0.74) * AFTER),
  back: GREAT + AFTER + 0.4, home: GREAT + AFTER + 1.4 };

/** the world's rate against film time: 1 normally, SLOWEST at the deepest, DREAM after. Falls and rises
 *  log-smoothly, so the slowing reads as an exponential settling, not a ramp */
export function rate(t: number): number {
  const ls = Math.log(SLOWEST), ld = Math.log(STYLE.slow ? STYLE.slow.pace : DREAM);
  // (smootherstep: the rate's slope and its own slope both 0 at each end, so nothing moving through a turn of the
  // clock jerks — a smoothstep's corner in its curvature kinked the beater as time reached its dream pace)
  const s5 = (a: number, b: number) => { const x = Math.min(1, Math.max(0, (t - a) / (b - a))); return x * x * x * (x * (x * 6 - 15) + 10); };
  const down = s5(DILATE.from, DILATE.deep);
  const up = s5(DILATE.lift, DILATE.dream);
  const back = s5(DILATE.back, DILATE.home);
  return Math.exp((ls * (1 - up) + ld * up) * down * (1 - back));
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
  windup: 7.05,
  /** the downswing starts (story time from here to contact is a real downswing's ~0.2 s) */
  swing: 0,   // filled below
  /** the close look at the hide ends as time starts to lift: the camera draws back round her, the shock leaves the drum */
  shock: GREAT + 0.363 * AFTER,
  /** time at its dream pace, the veil wide open: the trip, deepening to the end */
  trip: GREAT + 0.615 * AFTER,
  /** the fade to black, and the black of the loop's seam */
  fade: GREAT + AFTER, black: GREAT + AFTER + 1.3,
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
