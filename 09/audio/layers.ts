// 09 / Membrane, everything round the drum: the seed pods, the beater's whoosh, the bed under the loop, the shock
// leaving the drum, the shimmer and the foam of universes.
//
// The pods hang on cords from the shell and the stand, each a pendulum: a stroke jerks them (the seeds inside rattle at
// once, a few ms after the hide), then they swing, and the seeds rattle again at every turn of the swing, less each
// time. A seed's knock is a tiny burst of noise, rung through its pod's shell (two resonances, a dried pod's), placed
// where the pod hangs. The great stroke's pods go on in slow motion: knocks spread thin over seconds, pitched far down
// and rung long, glassy.
//
// The bed is a loop by construction: every oscillator's frequency a whole number of cycles in 26 s, every noise
// periodic and filtered twice round. It sits on the drum's own fundamental (measured from the simulation), its
// harmonics and fifth soft over it; it closes to a muffled near-silence as time stretches away and opens after.
import { SR, Biquad, SVF, filt, noise, rng, gauss, curve, granular, type Stereo, stereo, type Buf, smooth, twice, readAt } from './dsp.ts';
import { LOOP, rate, story, BIG, ACT } from '../score.ts';

const N = Math.round(LOOP * SR);
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- the seed pods
interface Pod { period: number; f1: number; q1: number; f2: number; q2: number; pan: number; shell: boolean; seeds: number }
const PODS: Pod[] = (() => {
  const r = rng(404), pods: Pod[] = [];
  for (let k = 0; k < 15; k++) {
    const shell = k >= 8, cord = shell ? 0.16 + 0.2 * r() : 0.18 + 0.12 * r();
    pods.push({
      period: TAU * Math.sqrt((cord + 0.05) / 9.81), shell,
      f1: 1100 + 1500 * r(), q1: 4 + 5 * r(), f2: 2900 + 3200 * r(), q2: 5 + 6 * r(),
      pan: shell ? -0.15 + 0.9 * (r() - 0.5) : (k < 4 ? -0.75 : 0.55) + 0.25 * (r() - 0.5),
      seeds: 14 + Math.floor(r() * 18),
    });
  }
  return pods;
})();
const pan = (p: number) => [Math.cos(((p + 1) * Math.PI) / 4), Math.sin(((p + 1) * Math.PI) / 4)];

/** the pods' rattle after a stroke of speed v (its contact at sample 0) */
export function rattle(v: number, seed: number, big = false): Stereo {
  const dur = big ? 3.2 : 2.4, n = Math.round(dur * SR), out = stereo(n), r = rng(seed);
  const hard = Math.pow(v / 4, 1.3);
  for (const p of PODS) {
    const exc = new Float32Array(n);
    const td = (p.shell ? 0.004 : 0.016) + 0.012 * r(), swing = (big ? 1.6 : 1) * Math.min(1.5, v / 4) * (p.shell ? 1 : 0.7);
    const tau = 0.7 + 0.5 * r(), ph = r() * 0.2;
    for (let i = Math.round(td * SR); i < n; i++) {
      const t = i / SR - td;
      const jolt = Math.exp(-t / (big ? 0.09 : 0.05)) * (p.shell ? 1 : 0.6);
      const turn = Math.pow(Math.abs(Math.sin((TAU * t) / p.period + ph)), 8) * Math.exp(-t / tau) * swing * 0.5;
      const intensity = jolt + turn;
      const rateHz = p.seeds * (jolt * 60 + turn * 30) * (big ? 1.5 : 1);
      if (r() < (rateHz * hard) / SR) {
        const a = intensity * (0.3 + 0.7 * r()) * (r() < 0.08 ? 2 : 1), len = 3 + Math.floor(r() * 9);
        for (let j = 0; j < len && i + j < n; j++) exc[i + j] += a * (r() * 2 - 1) * Math.exp(-j / 2.5);
      }
    }
    const y1 = filt(exc.slice(), new Biquad('bp', p.f1, p.q1)), y2 = filt(exc.slice(), new Biquad('bp', p.f2, p.q2));
    const y3 = filt(exc.slice(), new Biquad('hp', 6500, 0.7));
    const [gl, gr] = pan(p.pan);
    for (let i = 0; i < n; i++) { const y = y1[i] * 1.0 + y2[i] * 0.7 + y3[i] * 0.3; out.l[i] += y * gl; out.r[i] += y * gr; }
  }
  return out;
}

/** the great stroke's pods in slow motion: knocks spread over seconds, pitched down, rung long */
export function slowRattle(seed: number): Stereo {
  const dur = 7, n = Math.round(dur * SR), out = stereo(n), r = rng(seed);
  let t = 0.05;
  while (t < dur - 1.5) {
    const density = 16 * Math.exp(-t / 1.4) + 1.5 * Math.exp(-t / 3.5);
    t += -Math.log(1 - r()) / density;
    const p = PODS[Math.floor(r() * PODS.length)], i0 = Math.round(t * SR);
    const a = (0.35 + 0.65 * r()) * Math.exp(-t / 2.6), [gl, gr] = pan(p.pan * 1.3);
    // a knock rung through the pod a long way down: two decaying partials, a soft start
    const f1 = p.f1 * (0.3 + 0.1 * r()), f2 = p.f2 * (0.28 + 0.08 * r()), d1 = 0.05 + 0.12 * r(), d2 = 0.03 + 0.06 * r();
    const len = Math.round(0.8 * SR), p1 = r() * TAU, p2 = r() * TAU;
    for (let j = 0; j < len && i0 + j < n; j++) {
      const s = j / SR, att = 1 - Math.exp(-s / 0.003);
      const y = a * att * (Math.sin(TAU * f1 * s + p1) * Math.exp(-s / d1) + 0.6 * Math.sin(TAU * f2 * s + p2) * Math.exp(-s / d2));
      out.l[i0 + j] += y * gl; out.r[i0 + j] += y * gr;
    }
  }
  return out;
}

// ---------------------------------------------------------------- the beater through the air
/** the head's whoosh on a downswing: its speed in story time over `swing` story seconds before contact, heard in film
 *  time — as time dilates the whoosh slows, its pitch falls (not all the way: we still have to hear it) and it fades
 *  into the hush */
export function whoosh(t: number, v: number, swing: number, seed: number, gain = 1): { at: number; s: Stereo } {
  const S = story(t), r = rng(seed);
  // (the film time the swing started)
  let t0 = t - swing;
  if (rate(t) < 0.999) { let lo = 0, hi = t; for (let k = 0; k < 50; k++) { const m = (lo + hi) / 2; if (story(m) < S - swing) lo = m; else hi = m; } t0 = lo; }
  const n = Math.round((t - t0 + 0.06) * SR), out = stereo(n);
  const sv = new SVF(1.3), sv2 = new SVF(2.2);
  let pink = 0, pinkR = 0;
  for (let i = 0; i < n; i++) {
    const tf = t0 + i / SR, x = Math.min(1, Math.max(0, (story(tf) - (S - swing)) / swing));
    const speed = v * Math.pow(x, 1.6), rt = rate(tf);
    const fc = (260 + 2400 * (speed / 9.5)) * Math.pow(rt, 0.42);
    const level = Math.pow(speed / 9.5, 2) * Math.pow(rt, 0.45) * (tf > t ? Math.exp(-(tf - t) / 0.012) : 1);
    pink = 0.97 * pink + 0.03 * (r() * 2 - 1); pinkR = 0.6 * (r() * 2 - 1) + 0.4 * pink;
    const y = sv.tick(pinkR, fc, 1) * 1.0 + sv2.tick(pinkR, fc * 2.4, 1) * 0.35;
    const p = -0.5 + 0.5 * x;
    const [gl, gr] = pan(p);
    out.l[i] = y * level * gain * gl; out.r[i] = y * level * gain * gr;
  }
  return { at: t0, s: out };
}

// ---------------------------------------------------------------- the bed
/** a frequency rounded to a whole number of cycles in the loop */
const whole = (f: number) => Math.round(f * LOOP) / LOOP;

export function bed(f0: number, seed: number): Stereo {
  const out = stereo(N), r = rng(seed), root = whole(f0);
  // its shape over the loop: a breath in through the wind-up, near-silence as time stretches away, opening as the
  // universe answers and wider through the trip, settled again under the fade so the loop closes
  const B = BIG.t, W = ACT.windup;
  const level = curve([[0, 1], [W, 1], [W + 1.75, 1.2], [W + 2.65, 1.0], [B - 0.9, 0.16], [B - 0.3, 0.045], [B + 0.02, 0.04], [B + 1.5, 0.3], [B + 4, 0.9], [ACT.shock, 1.15], [ACT.trip, 1.3], [ACT.fade - 2, 1.35], [ACT.black, 1.0], [LOOP, 1]]);
  const bright = curve([[0, 1000], [W, 1000], [W + 2.15, 1300], [W + 2.65, 1000], [B - 0.8, 170], [B - 0.25, 105], [B + 0.02, 105], [B + 1.5, 300], [B + 4, 900], [ACT.shock, 1500], [ACT.trip, 1700], [ACT.fade - 2, 1800], [ACT.black, 1000], [LOOP, 1000]]);
  const partials: [number, number, number][] = [[1, 0.55, 1], [1.5, 0.22, 2], [2, 0.42, 1], [3, 0.3, 3], [4, 0.17, 2], [5, 0.09, 1], [6, 0.07, 3], [8, 0.035, 2]];
  const pad = stereo(N);
  for (const [m, a, beat] of partials) {
    const f = whole(root * m);
    for (const d of [-1, 0, 1]) {
      const fq = f + (d * beat) / LOOP, ph = r() * TAU, lfo = 1 + Math.floor(r() * 3), lph = r() * TAU, p = d * 0.6 + (r() - 0.5) * 0.3;
      const [gl, gr] = pan(p), w = (TAU * fq) / SR, wl = (TAU * lfo) / N;
      for (let i = 0; i < N; i++) {
        const y = a * Math.sin(w * i + ph) * (0.75 + 0.25 * Math.sin(wl * i + lph)) / 3;
        pad.l[i] += y * gl; pad.r[i] += y * gr;
      }
    }
  }
  // air: periodic noise, high and soft, breathing over the loop
  const air = stereo(N);
  for (const ch of [air.l, air.r]) {
    const z = noise(N, r);
    twice(z, (y) => filt(y, new Biquad('bp', 4200, 0.5), new Biquad('lowshelf', 1500, 0.7, -12)));
    for (let i = 0; i < N; i++) ch[i] = z[i] * 0.05 * (0.7 + 0.3 * Math.sin((TAU * 2 * i) / N + 1.3));
  }
  // the pad through a lowpass that closes and opens with the loop; the air goes with it, more steeply
  for (const [ch, o] of [[pad.l, out.l], [pad.r, out.r]] as [Buf, Buf][]) {
    const y = ch.slice();
    twice(y, (z) => { const s = new SVF(0.6); for (let i = 0; i < z.length; i++) { const t = (i % N) / SR; z[i] = s.tick(z[i], bright(t), 0) * level(t); } });
    for (let i = 0; i < N; i++) o[i] += y[i];
  }
  for (let i = 0; i < N; i++) {
    const t = i / SR, g = level(t) * Math.min(1.4, Math.pow(bright(t) / 1000, 2));
    out.l[i] += air.l[i] * g; out.r[i] += air.r[i] * g;
  }
  return out;
}

/** the wind-up's breath: soft air rising as she draws the beater back and up */
export function breath(seed: number): { at: number; s: Stereo } {
  const t0 = ACT.windup + 0.05, t1 = t0 + 3.1, n = Math.round((t1 - t0) * SR), out = stereo(n), r = rng(seed);
  const svl = new SVF(1.1), svr = new SVF(1.1);
  for (let i = 0; i < n; i++) {
    const t = t0 + i / SR, x = smooth(t0, t0 + 2.3, t);
    const g = x * x * (1 - smooth(t0 + 2.4, t1, t)), fc = 280 + 700 * x;
    out.l[i] = svl.tick(gauss(r), fc, 1) * g; out.r[i] = svr.tick(gauss(r), fc * 1.07, 1) * g;
  }
  return { at: t0, s: out };
}

// ---------------------------------------------------------------- the great stroke's weight
/** a sub drop: a sine falling from `f1` to `f2` (Hz), decaying */
export function subDrop(f1: number, f2: number, seconds: number, decay: number): Buf {
  const n = Math.round(seconds * SR), y = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, f = f2 + (f1 - f2) * Math.exp(-t / (seconds * 0.3));
    ph += (TAU * f) / SR;
    y[i] = Math.sin(ph) * (1 - Math.exp(-t / 0.004)) * Math.exp(-t / decay);
  }
  const fadeN = Math.round(0.3 * SR);
  for (let i = 0; i < fadeN; i++) y[n - 1 - i] *= i / fadeN;
  return y;
}

/** the shock leaving the drum: a blast of air falling from bright to deep, wide, with a low thump under it */
export function shock(seed: number): Stereo {
  const n = Math.round(4 * SR), out = stereo(n), r = rng(seed);
  const sl = new SVF(0.9), sr = new SVF(0.9);
  const sub = subDrop(42, 24, 4, 1.2);
  for (let i = 0; i < n; i++) {
    const t = i / SR, env = (1 - Math.exp(-t / 0.035)) * Math.exp(-t / 0.75), fc = 90 + 2600 * Math.exp(-t / 0.35);
    out.l[i] = sl.tick(gauss(r), fc, 0) * env * 0.6 + sub[i] * 0.55;
    out.r[i] = sr.tick(gauss(r), fc * 0.93, 0) * env * 0.6 + sub[i] * 0.55;
  }
  return out;
}

// ---------------------------------------------------------------- the cosmos
/** the shimmer: the universe's membrane pitched up two, three and four octaves (and the fifths between), chorused,
 *  some grains backwards */
export function shimmer(src: Stereo, seed: number): Stereo {
  const r = rng(seed), out = stereo(src.l.length);
  const voices: [number, number, number][] = [[4, 0.45, 0.2], [4.012, 0.35, 0.35], [6, 0.45, 0.3], [8, 0.45, 0.45], [7.985, 0.35, 0.5], [12, 0.3, 0.4], [16, 0.22, 0.5]];
  for (const [ratio, g, back] of voices) {
    for (const [s, o] of [[src.l, out.l], [src.r, out.r]] as [Buf, Buf][]) {
      const y = granular(s, ratio, r, { grain: 0.11, overlap: 4, jitter: 0.04, back });
      for (let i = 0; i < y.length; i++) o[i] += y[i] * g;
    }
  }
  // chorus: each side read through a slowly wandering delay
  for (const [ch, rate0, depth] of [[out.l, 0.21, 0.006], [out.r, 0.27, 0.007]] as [Buf, number, number][]) {
    const x = ch.slice();
    for (let i = 0; i < ch.length; i++) {
      const d = (0.012 + depth * Math.sin((TAU * rate0 * i) / SR)) * SR;
      ch[i] = 0.6 * x[i] + 0.55 * readAt(x, i - d);
    }
    filt(ch, new Biquad('hp', 320, 0.7), new Biquad('highshelf', 5000, 0.7, -4), new Biquad('lp', 9000, 0.7));
  }
  return out;
}

/** the foam: other universes, each a small membrane of its own ringing once (a few of a membrane's modes, its ratios),
 *  pitched on the drum's harmonics, popping up through the foam */
export function foam(f0: number, seed: number): Stereo {
  const out = stereo(N), r = rng(seed);
  const RATIOS = [1, 1.594, 2.136, 2.296, 2.653, 2.918, 3.156], AMPS = [1, 0.62, 0.42, 0.36, 0.28, 0.2, 0.14];
  const HARM = [4, 5, 6, 8, 10, 12, 16];
  // (they start popping as the worlds open, more and more through the trip, and stop under the fade)
  const B = BIG.t, end = ACT.fade + 0.4;
  const dens = curve([[0, 0], [B + 2, 0], [B + 4, 2.5], [ACT.trip, 4], [ACT.fade - 3, 6.5], [end, 3], [end + 0.01, 0], [LOOP, 0]]);
  let t = B + 2;
  while (t < end) {
    const d = Math.max(0.2, dens(t));
    t += -Math.log(1 - r()) / d;
    if (r() * 6 > dens(t)) continue;
    const base = f0 * HARM[Math.floor(r() * HARM.length)] * (1 + (r() - 0.5) * 0.004), i0 = Math.round(t * SR);
    const tau = 0.35 + 1.2 * r(), att = 0.012 + 0.03 * r(), a = 0.05 + 0.08 * r(), [gl, gr] = pan((r() * 2 - 1) * 0.85);
    const len = Math.round(Math.min(4, tau * 5) * SR);
    for (let m = 0; m < RATIOS.length; m++) {
      const f = base * RATIOS[m];
      if (f > 9000) continue;
      const am = a * AMPS[m] * (0.6 + 0.8 * r()), dm = tau / Math.pow(RATIOS[m], 0.8), ph = r() * TAU, w = (TAU * f) / SR;
      for (let j = 0; j < len; j++) {
        const s = j / SR, y = am * Math.sin(w * j + ph) * (1 - Math.exp(-s / att)) * Math.exp(-s / dm);
        const k = (i0 + j) % N;
        out.l[k] += y * gl; out.r[k] += y * gr;
      }
    }
  }
  return out;
}

