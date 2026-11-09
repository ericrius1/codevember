// 09 / Membrane's telling, its numbers in one place: two strokes, then the great one; the slowed moment, the camera
// drawn back a little to her, the drum and the torn membrane round them; then, the glass all but wholly open, the
// flight in through it — over her shoulder and into the drum's world, flown down through it like a portal as time
// comes back toward its own pace, and leaping at the last; the glass opening on a deep blue without end, a living lattice
// of gardens folded through a fourth dimension (inner.wgsl), and our universe's membrane torn open on the deep
// (cosmos.wgsl deepSky). Filmed 16:9.
export const STYLE = {
  /** seconds from the great stroke to the fade */
  after: 10.5,
  /** the slowed moment's shape (seconds after the great stroke): time held all but stopped till `lift`, easing up to
   *  `pace` (of the world's rate) by `dream`; then, as the camera flies in through the glass, coming back from `back`
   *  to `home` of the world's own pace by `full`, and held there to the fade */
  slow: { lift: 2.0, dream: 4.6, pace: 0.16, back: 4.6, full: 9.5, home: 0.85 },
  /** the flight in (seconds after the great stroke): the camera leaves its pull-back as the glass has all but spread
   *  over the hide (`go`), reaches the glass (`in`: the realm fills the frame); inside, the flight through the realm
   *  (m/s) at `in` and as its last second starts (`hyper`), where it leaps: `speedEnd` by the fade, and on up into the
   *  dark */
  fly: { go: 3.6, in: 6.9, hyper: 9.5, speedIn: 1.1, speedCruise: 2.4, speedEnd: 60 },
  /** the grade: saturation (from the great stroke on), exposure, bloom, the sky's hue drift (×), how cool the depths go
   *  under water */
  grade: { sat: 1.05, exp: 1, bloom: 1.1, drift: 0.4, cool: 1.1 },
  /** the sky: how far it's torn open on the deep at most (0..1), how far the trip heaves it (×), and how far the deep
   *  shows through the whole membrane (× its opening) */
  sky: { reveal: 0.95, heave: 1.3, through: 0.55 },
  /** the struck hide's glass: how clear it gets (0..1) */
  glass: 0.98,
  /** the realm's light spilling out through the glass onto her and the dais: its colour, and how strong (× the trip) */
  light: [0.42, 0.62, 1.0] as [number, number, number], spill: 1.6,
  /** the light pouring out of the glass toward us (post.wgsl's rays): how strong (× the trip) */
  rays: 0.8,
};
