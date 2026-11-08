// 09 / Membrane, a strike made into the drum's voice: what the simulation heard (the pressure at two points in front,
// the back face's push, two pickups on the hide, the head's force) mixed the way you'd hear the drum standing near it.
//
// The front: the Rayleigh pressure, its sub a few dB under the body (felt more than heard down there, and it costs
// the most headroom). The back: the hide's back face pushes the air in the shell, which is a
// short wide tube open at the far end, so it rings at its quarter wave (≈ 78 Hz, and the odd multiples above, each
// round trip losing some out of the open end); that comes round the shell to you late and dark. The pickups: the hide's
// own motion, all its modes, the ones that hardly radiate too (a close listener feels them). The slap: the leather
// head meeting the hide, heard off the head (the rate its force changes, rung through the leather). Last a little
// warmth, a soft saturation of the low end, so the boom's harmonics carry where the fundamental can't.
import { type Result } from './sims.ts';
import { SR, Biquad, filt, rng, type Stereo, stereo } from './dsp.ts';

/** the scale from pascals to full scale (the small strokes peak near −8 dBFS before the mix) */
const PA = 0.02;
const RHO_AIR = 1.2;

/** the shell's air: a tube of round trip D samples, its far end open (a reflection of −g, losing highs) */
function shell(x: Float32Array, f = 78, g = 0.74, lossHz = 900) {
  const D = Math.round(SR / (2 * f)), y = new Float32Array(x.length), lp = Math.exp((-2 * Math.PI * lossHz) / SR);
  let z = 0;
  for (let n = 0; n < x.length; n++) {
    const fb = n >= D ? y[n - D] : 0;
    z = fb + lp * (z - fb);
    y[n] = x[n] - g * z;
  }
  return y;
}

export interface VoiceOpts { seed: number; slap?: number; pick?: number; back?: number; warm?: number; shelf?: number }
export function voice(r: Result, o: VoiceOpts): Stereo {
  const { frontL, frontR, back, pick1, pick2, force } = r.a;
  const n = frontL.length, out = stereo(n);
  // the front
  for (let i = 0; i < n; i++) { out.l[i] = frontL[i] * PA; out.r[i] = frontR[i] * PA; }
  // (the sub a little under the body: the boom is felt more than heard down there, and it costs the most headroom)
  const shelf = o.shelf ?? -3;
  if (shelf) for (const ch of [out.l, out.r]) filt(ch, new Biquad('lowshelf', 70, 0.7, shelf));
  // the back: the shell's air (the back face pushes the other way), round the shell to the front
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) b[i] = (-RHO_AIR / (4 * Math.PI * 2.4)) * back[i] * PA;
  const tube = filt(shell(b), new Biquad('lp', 380, 0.6), new Biquad('hp', 28, 0.7), new Biquad('lowshelf', 70, 0.7, o.shelf ?? -3));
  const delay = Math.round(0.0046 * SR), gb = o.back ?? 0.7;
  for (let i = delay; i < n; i++) { out.l[i] += tube[i - delay] * gb; out.r[i] += tube[i - delay] * gb * 0.92; }
  // the pickups (the hide's velocity, m/s), a little to each side
  const gp = (o.pick ?? 1) * 0.8;
  const p1 = filt(pick1.slice(), new Biquad('lp', 2400, 0.7), new Biquad('hp', 150, 0.6), new Biquad('lowshelf', 300, 0.7, -4));
  const p2 = filt(pick2.slice(), new Biquad('lp', 2400, 0.7), new Biquad('hp', 150, 0.6), new Biquad('lowshelf', 300, 0.7, -4));
  for (let i = 0; i < n; i++) { out.l[i] += (0.8 * p1[i] + 0.35 * p2[i]) * gp; out.r[i] += (0.35 * p1[i] + 0.8 * p2[i]) * gp; }
  // the slap: the leather's knock heard off the head itself, its pressure following the rate the contact force
  // changes (the contact's own spectrum, tilted up), above the boom, rung through the leather and the head's stuffing
  // for a few milliseconds (a short burst of resonant noise: the same energy as a click, a far lower crest)
  const gs = (o.slap ?? 1) * 0.15, r0 = rng(o.seed);
  const m = Math.min(n, Math.round(0.04 * SR)), src = new Float32Array(m);
  // (the force smoothed a little first: on the grid its first touch is a step, which no leather is)
  const f = filt(force.slice(0, m), new Biquad('lp', 4500, 0.6), new Biquad('lp', 4500, 0.6));
  for (let i = 1; i < m; i++) src[i] = ((f[i] - f[i - 1]) * SR) / 1e5;
  filt(src, new Biquad('hp', 650, 0.7), new Biquad('hp', 650, 0.7));
  const L = Math.round(0.012 * SR), leather = new Float32Array(L);
  let en = 0;
  for (let i = 0; i < L; i++) { leather[i] = (r0() * 2 - 1) * Math.exp(-i / (0.0028 * SR)) * (1 - Math.exp(-i / 8)); en += leather[i] * leather[i]; }
  filt(leather, new Biquad('bp', 2400, 0.55), new Biquad('peak', 900, 1.2, 4));
  for (let i = 0; i < L; i++) leather[i] /= Math.sqrt(en);
  const slap = new Float32Array(m + L);
  for (let i = 0; i < m; i++) { const x = src[i]; if (x !== 0) for (let j = 0; j < L; j++) slap[i + j] += x * leather[j]; }
  for (let i = 0; i < slap.length && i < n; i++) { const v = slap[i] * gs; out.l[i] += v; out.r[i] += v * 0.94; }
  // warmth: the low end saturated softly, its new harmonics added back
  const gw = o.warm ?? 0.5;
  if (gw > 0) for (const ch of [out.l, out.r]) {
    const lo = filt(ch.slice(), new Biquad('lp', 160, 0.7));
    for (let i = 0; i < n; i++) { const x = lo[i]; lo[i] = 0.8 * x * x + (Math.tanh(x * 2.2) / 2.2 - x); }
    filt(lo, new Biquad('hp', 75, 0.7), new Biquad('lp', 900, 0.7));
    for (let i = 0; i < n; i++) ch[i] += lo[i] * gw;
  }
  // (the last few tens of milliseconds faded, should the ring still be going)
  const fadeN = Math.round(0.08 * SR);
  for (let i = 0; i < fadeN; i++) { const g = i / fadeN; out.l[n - 1 - i] *= g; out.r[n - 1 - i] *= g; }
  return out;
}
