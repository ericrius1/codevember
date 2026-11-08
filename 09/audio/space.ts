// 09 / Membrane, the space and the master bus. Two synthetic rooms: a big hall for the drum (≈ 3.4 s, early
// reflections off near walls, the highs dying first) and a far longer, darker one for the cosmos (≈ 12 s, slow to
// build, the highs gone in a few seconds). Each is noise split into bands, every band given its own decay, the two
// channels different noise above the bass (so it's wide) and the same in it (so it's whole in mono). A send through one
// is a convolution, its tail past the loop folded back onto the start. The master: a rumble filter, a soft clip on the
// low end alone, a look-ahead limiter over all that watches the peaks between samples too (run twice round the loop,
// so its state at the start is the end's), and the gain that puts the whole at the loudness asked for.
import { SR, Biquad, filt, rng, gauss, convolve, fold, twice, lufs, peak, type Stereo, stereo, type Buf } from './dsp.ts';

interface Band { lo: number; hi: number; t60: number; gain: number }
interface Room { seconds: number; bands: Band[]; predelay: number; attack: number; early: number; seed: number }

function room(o: Room): Stereo {
  const n = Math.round(o.seconds * SR), ir = stereo(n), r = rng(o.seed), pre = Math.round(o.predelay * SR);
  // the two sides' noise: shared in the bass (a room is one coherent space down there, a wavelength wider than the
  // distance between your ears), apart above it
  const shared = new Float32Array(n), own = [new Float32Array(n), new Float32Array(n)];
  for (let i = 0; i < n; i++) { shared[i] = gauss(r); own[0][i] = gauss(r); own[1][i] = gauss(r); }
  [ir.l, ir.r].forEach((ch, c) => {
    for (const b of o.bands) {
      const together = b.hi > 0 && b.hi <= 250 ? 0.92 : b.hi > 0 && b.hi <= 1000 ? 0.5 : 0.15, apart = Math.sqrt(1 - together * together);
      const x = new Float32Array(n);
      for (let i = 0; i < n; i++) x[i] = together * shared[i] + apart * own[c][i];
      if (b.lo > 0) filt(x, new Biquad('hp', b.lo, 0.7), new Biquad('hp', b.lo, 0.7));
      if (b.hi > 0) filt(x, new Biquad('lp', b.hi, 0.7), new Biquad('lp', b.hi, 0.7));
      for (let i = 0; i < n - pre; i++) {
        const t = i / SR;
        ch[i + pre] += x[i] * b.gain * Math.exp((-6.91 * t) / b.t60) * (1 - Math.exp(-t / o.attack));
      }
    }
    // early reflections: a few dozen taps in the first ~90 ms, thinning
    for (let k = 0; k < o.early; k++) {
      const t = 0.004 + Math.pow(r(), 1.6) * 0.085, a = (r() < 0.5 ? -1 : 1) * (0.5 + r()) * Math.exp(-t / 0.05);
      ch[Math.round(t * SR)] += a * 6;
    }
    // (the very end faded)
    const f = Math.round(0.2 * SR);
    for (let i = 0; i < f; i++) ch[n - 1 - i] *= i / f;
  });
  let e = 0;
  for (let i = 0; i < n; i++) e += ir.l[i] * ir.l[i] + ir.r[i] * ir.r[i];
  const g = 1 / Math.sqrt(e / 2);
  for (let i = 0; i < n; i++) { ir.l[i] *= g; ir.r[i] *= g; }
  return ir;
}

export const hall = () => room({
  seconds: 5.5, predelay: 0.022, attack: 0.012, early: 36, seed: 31,
  bands: [
    { lo: 0, hi: 220, t60: 3.9, gain: 1.0 }, { lo: 220, hi: 1000, t60: 3.4, gain: 0.9 },
    { lo: 1000, hi: 4000, t60: 2.4, gain: 0.6 }, { lo: 4000, hi: 0, t60: 1.3, gain: 0.35 },
  ],
});
export const cosmic = () => room({
  seconds: 17, predelay: 0.06, attack: 0.38, early: 0, seed: 77,
  bands: [
    { lo: 0, hi: 160, t60: 14, gain: 1.0 }, { lo: 160, hi: 700, t60: 12, gain: 0.85 },
    { lo: 700, hi: 2200, t60: 8, gain: 0.5 }, { lo: 2200, hi: 6000, t60: 4.5, gain: 0.25 }, { lo: 6000, hi: 0, t60: 2.4, gain: 0.1 },
  ],
});

/** a loop's send through a room: the wet, folded onto the loop */
export function reverb(send: Buf, ir: Stereo): Stereo {
  const w = convolve(send, ir);
  return { l: fold(w.l, send.length), r: fold(w.r, send.length) };
}

// ---------------------------------------------------------------- the master bus
// the three points between samples, for the true peak (8-tap windowed sincs)
const PHASES = [0.25, 0.5, 0.75].map((f) => {
  const k = new Float32Array(8);
  for (let j = 0; j < 8; j++) { const d = j - 3 - f, w = 0.5 + 0.5 * Math.cos((Math.PI * d) / 4.5); k[j] = (Math.sin(Math.PI * d) / (Math.PI * d)) * w; }
  return k;
});

/** a stereo-linked look-ahead limiter on a loop (in place): the gain each sample needs (from its true peak, the points
 *  between samples too, if asked), its minimum over the look-ahead, released slowly, then smoothed over the look-ahead
 *  (so it's already down when the peak arrives). Run twice round. Returns the deepest gain reduction (dB) */
export function limit(s: Stereo, ceiling: number, o: { ahead?: number; release?: number; truePeak?: boolean; trace?: Float32Array } = {}) {
  const n = s.l.length, L = Math.round((o.ahead ?? 0.003) * SR), release = o.release ?? 0.16;
  const l2 = new Float32Array(2 * n), r2 = new Float32Array(2 * n);
  l2.set(s.l); l2.set(s.l, n); r2.set(s.r); r2.set(s.r, n);
  const need = new Float32Array(2 * n);
  for (let i = 0; i < 2 * n; i++) {
    let p = Math.max(Math.abs(l2[i]), Math.abs(r2[i]));
    if (o.truePeak && i >= 3 && i < 2 * n - 4) {
      for (const k of PHASES) {
        let a = 0, b = 0;
        for (let j = 0; j < 8; j++) { a += l2[i - 3 + j] * k[j]; b += r2[i - 3 + j] * k[j]; }
        p = Math.max(p, Math.abs(a), Math.abs(b));
      }
    }
    // (a peak between i and i+1 needs the gain down at both)
    need[i] = Math.min(need[i] || 1, p > ceiling ? ceiling / p : 1);
    if (o.truePeak && i + 1 < 2 * n) need[i + 1] = p > ceiling ? ceiling / p : 1;
  }
  // the minimum over [i, i + L] (a monotone deque)
  const mn = new Float32Array(2 * n), dq = new Int32Array(2 * n);
  let h = 0, t = 0;
  for (let i = 2 * n - 1; i >= 0; i--) {
    while (t > h && need[dq[t - 1]] >= need[i]) t--;
    dq[t++] = i;
    while (dq[h] > i + L) h++;
    mn[i] = need[dq[h]];
  }
  const rel = Math.exp(-1 / (release * SR));
  let g = 1;
  const env = new Float32Array(2 * n);
  for (let i = 0; i < 2 * n; i++) { g = mn[i] < g ? mn[i] : mn[i] + (g - mn[i]) * rel; env[i] = g; }
  // smoothed by a box of the look-ahead's length over the past (each env value already covers the L samples ahead of
  // it, so the average is all the way down by the peak)
  let acc = 0, deepest = 1;
  for (let i = 0; i < 2 * n; i++) {
    acc += env[i]; if (i >= L) acc -= env[i - L];
    if (i >= n) { const gg = acc / L; s.l[i - n] = l2[i] * gg; s.r[i - n] = r2[i] * gg; deepest = Math.min(deepest, gg); if (o.trace) o.trace[i - n] = gg; }
  }
  return -20 * Math.log10(deepest);
}

export interface Mastered { out: Stereo; gain: number; lufs: number; peak: number; reduction: number; lowClip: number; trace: Float32Array }
/** the master bus on a loop: rumble filter, gain, the low end (under 90 Hz, split off by a Linkwitz–Riley crossover)
 *  rounded off by a soft clip of its own (the sub's peaks are what cost the headroom; rounding them adds harmonics an
 *  octave and a twelfth up, under the boom, where a small speaker can say it), then the true-peak limiter over all;
 *  the gain found so it measures `target` LUFS */
export function master(mix: Stereo, target = -14, ceilingDb = -2): Mastered {
  const ceiling = Math.pow(10, ceilingDb / 20), n = mix.l.length;
  const pre = { l: mix.l.slice(), r: mix.r.slice() };
  for (const ch of [pre.l, pre.r]) twice(ch, (y) => filt(y, new Biquad('hp', 21, 0.6), new Biquad('hp', 21, 0.9)));
  // the crossover: LR4 (two Butterworths in series each way), its two halves summing flat
  const split = (x: Buf) => {
    const lo = x.slice(), hi = x.slice();
    twice(lo, (y) => filt(y, new Biquad('lp', 90, 0.7071), new Biquad('lp', 90, 0.7071)));
    twice(hi, (y) => filt(y, new Biquad('hp', 90, 0.7071), new Biquad('hp', 90, 0.7071)));
    return [lo, hi];
  };
  const [ll, lh] = split(pre.l), [rl, rh] = split(pre.r);
  const knee = 0.5 * ceiling, top = 0.8 * ceiling;
  const round = (x: number) => { const a = Math.abs(x); return a <= knee ? x : Math.sign(x) * (knee + (top - knee) * Math.tanh((a - knee) / (top - knee))); };
  let gain = Math.pow(10, (target - lufs(pre)) / 20);
  let out: Stereo = pre, L = 0, red = 0, clip = 1;
  const trace = new Float32Array(n);
  for (let it = 0; it < 8; it++) {
    out = stereo(n);
    clip = 1;
    for (let i = 0; i < n; i++) {
      const a = ll[i] * gain, b = rl[i] * gain, ra = round(a), rb = round(b);
      if (Math.abs(a) > knee) clip = Math.max(clip, Math.abs(a / ra));
      if (Math.abs(b) > knee) clip = Math.max(clip, Math.abs(b / rb));
      out.l[i] = ra + lh[i] * gain; out.r[i] = rb + rh[i] * gain;
    }
    red = limit(out, ceiling, { truePeak: true, ahead: 0.005, release: 0.12, trace });
    L = lufs(out);
    if (Math.abs(L - target) < 0.04) break;
    gain *= Math.pow(10, (target - L) / 20);
  }
  return { out, gain, lufs: L, peak: Math.max(peak(out.l), peak(out.r)), reduction: red, lowClip: 20 * Math.log10(clip), trace };
}
