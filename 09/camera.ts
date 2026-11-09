// The camera's path through the loop (film time). The pulse on her left side: wide, a slow arc in, nearly still as
// each stroke lands; her face from three-quarters in front between the second and third; back out to see her whole
// body coil as she winds up, pushing in slowly; then, as the downswing whips and time falls away, the swoop down to
// the struck point, arriving with the contact — and held on the hide, creeping back along it as its rings run out.
// As time comes back: a slow rise and pull-back that never leaves the dais's realm, round and low behind her, her
// raised arms a silhouette against the membrane as it opens on the worlds beyond; and home.
//
// The eye's keys are taken about the drum as (azimuth, elevation, log distance), the target's the same way, the field
// of view as its log; each channel is a periodic monotone cubic through its keys (it can't overshoot, and holds still
// between equal keys), eased by a short Gaussian in time (its acceleration continuous through every key and across
// the loop's seam).
import { LOOP } from './score';
import type { V3 } from '../src/rig/hero/math';

interface Key { t: number; eye: V3; at: V3; fov: number }
// (the spline's pivot: the drum's middle)
const O: V3 = [0, 1.06, 0];
/** a point about the drum: azimuth (deg, from +x toward +z), elevation (deg), distance (m) */
const pol = (az: number, el: number, r: number): V3 => {
  const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180;
  return [O[0] + Math.cos(e) * Math.cos(a) * r, O[1] + Math.sin(e) * r, O[2] + Math.cos(e) * Math.sin(a) * r];
};
// (she faces +x, her right side toward +z; her face at about (-0.83, 1.6, 0.2); the pulse strikes the hide near
// (0, 1.43, 0.38))
/** a point about her: angle round her (deg, from +x — her front — toward +z, her right), elevation, distance */
const HER: V3 = [-0.84, 1.1, 0.2];
const her = (az: number, el: number, r: number): V3 => {
  const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180;
  return [HER[0] + Math.cos(e) * Math.cos(a) * r, HER[1] + Math.sin(e) * r, HER[2] + Math.cos(e) * Math.sin(a) * r];
};
// (on her left: from her right her beater's shaft stands between us and her face, and from her front-right we'd be
// behind the hide's plane, its face turned away)
const KEYS: Key[] = [
  // the pulse: wide behind her left shoulder, the hide's face beyond her; drifting in, nearly still through each stroke
  // (behind her plane the hide is seen at 50–60° from its normal and the line to the struck point clears her by half a
  // metre; from her front-left we'd be in the hide's plane, the drum edge-on, the strokes landing on nothing)
  { t: 0.0, eye: her(-125, 11, 4.6), at: [-0.4, 1.25, 0.15], fov: 36 },
  { t: 1.35, eye: her(-116, 10, 3.95), at: [-0.38, 1.3, 0.2], fov: 36 },
  { t: 3.0, eye: her(-108, 9, 3.05), at: [-0.36, 1.38, 0.24], fov: 36 },
  { t: 3.25, eye: her(-107, 9, 3.0), at: [-0.36, 1.38, 0.24], fov: 36 },
  { t: 4.75, eye: her(-100, 10, 2.45), at: [-0.36, 1.42, 0.26], fov: 37 },
  { t: 5.0, eye: her(-99, 10, 2.42), at: [-0.36, 1.42, 0.26], fov: 37 },
  // the wind-up: out a little to her whole body, the beater rising high over her, her left arm reaching at the drum —
  // then one slow push in toward her and the hide as she coils
  { t: 6.4, eye: her(-96, 8, 3.25), at: [-0.5, 1.48, 0.22], fov: 42 },
  { t: 8.8, eye: her(-92, 9, 2.45), at: [-0.42, 1.52, 0.26], fov: 42 },
  // the swoop: down to the struck point as the downswing whips and time falls away, arriving with the contact; the
  // hide seen across, its rings running toward us
  { t: 9.6, eye: [-0.45, 1.42, -0.6], at: [0.0, 1.42, 0.36], fov: 46 },
  // held on the hide while its rings run out, creeping back along it
  { t: 10.6, eye: [-0.5, 1.46, -0.76], at: [0.0, 1.38, 0.3], fov: 47 },
  { t: 11.6, eye: [-0.62, 1.55, -1.02], at: [0.0, 1.32, 0.2], fov: 48 },
  // up past the drum as the shock's front meets the wall behind it and sweeps out round the dome (the drum low in
  // the frame's corner)
  { t: 12.5, eye: [-1.3, 1.3, -2.35], at: [2.0, 3.0, 0.5], fov: 50 },
  // the rise as time comes back, round behind her, low: her raised arms against the worlds opening beyond
  { t: 13.2, eye: her(-112, 6, 2.9), at: [-0.1, 2.0, 0.15], fov: 46 },
  { t: 14.9, eye: her(-150, 2, 4.4), at: [1.0, 2.5, 0.15], fov: 48 },
  { t: 16.7, eye: her(-176, -1, 5.3), at: [2.0, 2.6, 0.15], fov: 48 },
  { t: 18.2, eye: her(-190, 1, 5.3), at: [1.8, 2.5, 0.25], fov: 47 },
  // and home as it heals
  { t: 20.1, eye: her(-170, 8, 4.9), at: [0.2, 1.6, 0.2], fov: 41 },
  { t: 22.6, eye: her(-140, 11, 4.7), at: [-0.38, 1.27, 0.15], fov: 37 },
  { t: 26.0, eye: her(-125, 11, 4.6), at: [-0.4, 1.25, 0.15], fov: 36 },
];

type Polar = [number, number, number];
function toPolar(p: V3, prevAz?: number): Polar {
  const d = [p[0] - O[0], p[1] - O[1], p[2] - O[2]];
  const r = Math.max(1e-3, Math.hypot(d[0], d[1], d[2]));
  let az = Math.atan2(d[2], d[0]);
  if (prevAz !== undefined) while (az - prevAz > Math.PI) az -= Math.PI * 2;
  if (prevAz !== undefined) while (prevAz - az > Math.PI) az += Math.PI * 2;
  return [az, Math.asin(d[1] / r), Math.log(r)];
}
function fromPolar(q: Polar): V3 {
  const r = Math.exp(q[2]);
  return [O[0] + Math.cos(q[1]) * Math.cos(q[0]) * r, O[1] + Math.sin(q[1]) * r, O[2] + Math.cos(q[1]) * Math.sin(q[0]) * r];
}

/** a channel through the keys: a monotone cubic (Fritsch–Carlson: no overshoot, still between equal keys) over the
 *  non-uniform keys, made periodic (it runs on across the loop's seam; an azimuth that goes once round carries on
 *  round), then eased by a Gaussian in time so its acceleration has no corners at the keys */
class Channel {
  private n: number;
  constructor(private ts: number[], private ys: number[], private L: number, private drift = 0, private sigma = 0.16) { this.n = ts.length; }
  private key(i: number) {
    const n = this.n, k = Math.floor(i / n), j = i - k * n;
    return { t: this.ts[j] + k * this.L, y: this.ys[j] + k * this.drift };
  }
  private slope(i: number) {
    const a = this.key(i - 1), b = this.key(i), c = this.key(i + 1);
    const d0 = (b.y - a.y) / (b.t - a.t), d1 = (c.y - b.y) / (c.t - b.t);
    if (d0 * d1 <= 0) return 0;
    // (the weighted harmonic mean: Fritsch–Butland, monotone over uneven spacing)
    const h0 = b.t - a.t, h1 = c.t - b.t, w0 = 2 * h1 + h0, w1 = h1 + 2 * h0;
    return (w0 + w1) / (w0 / d0 + w1 / d1);
  }
  /** the curve itself at any t (not wrapped) */
  raw(tt: number) {
    const n = this.n, k = Math.floor(tt / this.L), x = tt - k * this.L;
    let i = n - 1;
    while (i > 0 && this.ts[i] > x) i--;
    const p1 = this.key(i), p2 = this.key(i + 1);
    const h = p2.t - p1.t, u = (x - p1.t) / h;
    const m1 = this.slope(i) * h, m2 = this.slope(i + 1) * h;
    const u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * p1.y + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * p2.y + (u3 - u2) * m2 + k * this.drift;
  }
  at(t: number) {
    let s = 0, w = 0;
    for (let j = -10; j <= 10; j++) {
      const d = (j / 10) * 3 * this.sigma, k = Math.exp(-0.5 * (d / this.sigma) ** 2);
      s += this.raw(t + d) * k; w += k;
    }
    return s / w;
  }
}

// the keys as polar (azimuths unwrapped along the path), each channel its own
const keys = KEYS.slice(0, -1);
const ts = keys.map((k) => k.t);
function channels(get: (k: Key) => V3) {
  const P: Polar[] = [];
  KEYS.forEach((k, i) => P.push(toPolar(get(k), i ? P[i - 1][0] : undefined)));
  const end = P[P.length - 1];
  return [0, 1, 2].map((c) => new Channel(ts, P.slice(0, -1).map((p) => p[c]), LOOP, c === 0 ? end[0] - P[0][0] : 0));
}
const EYE = channels((k) => k.eye);
const AT = channels((k) => k.at);
const FOV = new Channel(ts, keys.map((k) => Math.log(k.fov)), LOOP);

/** where the camera is at film time t (and the user's drag on top) */
export function shot(t: number, orbit: { yaw: number; pitch: number }) {
  const tt = ((t % LOOP) + LOOP) % LOOP;
  const e = EYE.map((s) => s.at(tt)) as Polar;
  const a = AT.map((s) => s.at(tt)) as Polar;
  e[0] += orbit.yaw; e[1] = Math.max(-1.2, Math.min(1.4, e[1] + orbit.pitch));
  return { eye: fromPolar(e), at: fromPolar(a), fov: Math.exp(FOV.at(tt)) };
}
