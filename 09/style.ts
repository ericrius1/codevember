// 09 / Membrane's telling, its numbers in one place: two strokes, then the great one; the slowed moment held to the
// end while the camera draws back round to behind her; the glass opening on an ocean's way down without end, and our
// universe's membrane torn open on the deep (cosmos.wgsl deepSky). Filmed 16:9.
export const STYLE = {
  /** seconds from the great stroke to the fade */
  after: 11.5,
  /** the slowed moment's shape (seconds after the great stroke): time held all but stopped till `lift`, easing up to
   *  `pace` (of the world's rate) by `dream`, and held there to the end — so she draws the beater back still slowed */
  slow: { lift: 2.0, dream: 4.6, pace: 0.16 },
  /** the grade: saturation (from the great stroke on), exposure, bloom, the sky's hue drift (×), how cool the depths go
   *  under water */
  grade: { sat: 1.05, exp: 1, bloom: 1.1, drift: 0.4, cool: 1.1 },
  /** the sky: how far it's torn open on the deep at most (0..1), how far the trip heaves it (×), and how far the deep
   *  shows through the whole membrane (× its opening) */
  sky: { reveal: 0.95, heave: 1.3, through: 0.55 },
  /** the struck hide's glass: how clear it gets (0..1) */
  glass: 0.98,
  /** the realm's light spilling out through the glass onto her and the dais: its colour, and how strong (× the trip) */
  light: [0.85, 0.65, 1.0] as [number, number, number], spill: 1.6,
  /** the light pouring out of the glass toward us (post.wgsl's rays): how strong (× the trip) */
  rays: 0.8,
};
