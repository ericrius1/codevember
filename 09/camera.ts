// The camera's path through the loop (film time): wide on the dais, in round her as she winds up, down at the hide for
// the great stroke, then out — up over the drum after the shock, out through our universe's membrane, far out to see
// the foam of universes and the membrane round them — and home again to where it started.
//
// The eye's keys are taken about the drum as (azimuth, elevation, log distance) and run through a Catmull-Rom spline,
// so the zooms out by thousands go exponentially (each second the same factor), as a fall does; the target's keys are
// splined in log distance from the drum the same way.
import { LOOP } from './score';
import type { V3 } from '../src/rig/hero/math';

interface Key { t: number; eye: V3; at: V3; fov: number }
const KEYS: Key[] = [
  { t: 0.0, eye: [-3.7, 1.85, -3.3], at: [-0.32, 1.12, 0.22], fov: 36 },
  { t: 2.2, eye: [-3.3, 1.7, -2.9], at: [-0.32, 1.14, 0.24], fov: 35 },
  { t: 3.9, eye: [-0.12, 1.66, 1.32], at: [-0.8, 1.58, 0.22], fov: 30 },
  { t: 5.1, eye: [-0.55, 1.72, 1.95], at: [-0.8, 1.55, 0.25], fov: 36 },
  { t: 6.4, eye: [-3.0, 1.45, 1.4], at: [-0.6, 1.45, 0.3], fov: 40 },
  { t: 7.8, eye: [-1.5, 1.35, 1.45], at: [-0.3, 1.45, 0.4], fov: 42 },
  { t: 8.9, eye: [-0.55, 1.3, 1.15], at: [0.0, 1.42, 0.38], fov: 44 },
  { t: 9.6, eye: [-0.38, 1.36, 0.92], at: [0.0, 1.42, 0.4], fov: 46 },
  { t: 10.8, eye: [-0.55, 1.55, 1.05], at: [0.0, 1.35, 0.3], fov: 50 },
  { t: 12.2, eye: [-2.4, 3.2, 2.8], at: [4.0, 1.5, 0.2], fov: 50 },
  { t: 13.6, eye: [-18, 12, 20], at: [110, 10, 0], fov: 56 },
  { t: 14.6, eye: [60, 20, -30], at: [240, 10, 0], fov: 54 },
  { t: 15.7, eye: [300, 90, -160], at: [-480, 0, 0], fov: 56 },
  { t: 16.9, eye: [1500, 700, -1500], at: [-480, 0, 0], fov: 50 },
  { t: 18.3, eye: [7000, 4200, -11000], at: [-480, 0, 0], fov: 50 },
  { t: 19.6, eye: [-500, 180, -700], at: [0, 1, 0], fov: 48 },
  { t: 20.8, eye: [-14, 6, -15], at: [-0.3, 1.1, 0.2], fov: 42 },
  { t: 22.6, eye: [-4.2, 2.1, -3.8], at: [-0.32, 1.12, 0.22], fov: 37 },
  { t: 26.0, eye: [-3.7, 1.85, -3.3], at: [-0.32, 1.12, 0.22], fov: 36 },
];
// (the spline's pivot: the drum's middle)
const O: V3 = [0, 1.06, 0];

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
// the keys as polar, azimuths unwrapped along the path
const EYE: Polar[] = []; const AT: Polar[] = [];
KEYS.forEach((k, i) => { EYE.push(toPolar(k.eye, i ? EYE[i - 1][0] : undefined)); AT.push(toPolar(k.at, i ? AT[i - 1][0] : undefined)); });

/** centripetal-free plain Catmull-Rom over non-uniform keys (time-scaled tangents) */
function spline(vals: number[][], i: number, u: number, k: number): number {
  const n = vals.length;
  const p0 = vals[Math.max(0, i - 1)][k], p1 = vals[i][k], p2 = vals[Math.min(n - 1, i + 1)][k], p3 = vals[Math.min(n - 1, i + 2)][k];
  const t0 = KEYS[Math.max(0, i - 1)].t, t1 = KEYS[i].t, t2 = KEYS[Math.min(n - 1, i + 1)].t, t3 = KEYS[Math.min(n - 1, i + 2)].t;
  const h = t2 - t1;
  const m1 = ((p2 - p0) / Math.max(1e-3, t2 - t0)) * h, m2 = ((p3 - p1) / Math.max(1e-3, t3 - t1)) * h;
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * p1 + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * p2 + (u3 - u2) * m2;
}

/** where the camera is at film time t (and the user's drag on top) */
export function shot(t: number, orbit: { yaw: number; pitch: number }) {
  const tt = ((t % LOOP) + LOOP) % LOOP;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].t <= tt) i++;
  const u = (tt - KEYS[i].t) / (KEYS[i + 1].t - KEYS[i].t);
  const e: Polar = [0, 1, 2].map((k) => spline(EYE, i, u, k)) as Polar;
  const a: Polar = [0, 1, 2].map((k) => spline(AT, i, u, k)) as Polar;
  e[0] += orbit.yaw; e[1] = Math.max(-1.2, Math.min(1.4, e[1] + orbit.pitch));
  const fov = KEYS[i].fov + (KEYS[i + 1].fov - KEYS[i].fov) * (u * u * (3 - 2 * u));
  return { eye: fromPolar(e), at: fromPolar(a), fov };
}
