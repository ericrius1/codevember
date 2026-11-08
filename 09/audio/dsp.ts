// 09 / Membrane, the sound's toolkit: everything the render needs, written here so it needs no packages. Seeded noise,
// the filters (RBJ biquads for the fixed ones, a TPT state-variable filter for the swept ones), an FFT and the
// convolution built on it, reading a buffer at fractional positions (for pitching and stretching), a granular pitch
// shifter, envelopes, a BS.1770 loudness meter, and a WAV writer.
//
// The loop: everything here is made to close on itself. A buffer of one loop's length is periodic; a causal process
// (a filter, the limiter) run on it twice round and kept from the second lap has the state it would have had from the
// loop before, so its output is periodic too (`twice`); a convolution's tail past the loop is folded back onto its
// start (`fold`).
import { writeFileSync } from 'node:fs';

export const SR = 48000;
export type Buf = Float32Array;
export interface Stereo { l: Buf; r: Buf }

export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
export const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const todb = (x: number) => 20 * Math.log10(Math.max(1e-12, x));
export const stereo = (n: number): Stereo => ({ l: new Float32Array(n), r: new Float32Array(n) });

// ---------------------------------------------------------------- noise
/** a seeded uniform [0, 1) generator (mulberry32) */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export type Rand = () => number;
export const gauss = (r: Rand) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
export function noise(n: number, r: Rand): Buf { const b = new Float32Array(n); for (let i = 0; i < n; i++) b[i] = r() * 2 - 1; return b; }

// ---------------------------------------------------------------- filters
export type Kind = 'lp' | 'hp' | 'bp' | 'peak' | 'lowshelf' | 'highshelf' | 'notch';
/** an RBJ cookbook biquad, transposed direct form II, its state kept between runs */
export class Biquad {
  b0 = 1; b1 = 0; b2 = 0; a1 = 0; a2 = 0; z1 = 0; z2 = 0;
  constructor(kind: Kind, f: number, q = 0.7071, gainDb = 0, sr = SR) { this.set(kind, f, q, gainDb, sr); }
  set(kind: Kind, f: number, q = 0.7071, gainDb = 0, sr = SR) {
    const w = (2 * Math.PI * clamp(f, 1, sr * 0.49)) / sr, cw = Math.cos(w), sw = Math.sin(w), al = sw / (2 * q);
    const A = Math.pow(10, gainDb / 40);
    let b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;
    switch (kind) {
      case 'lp': b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
      case 'hp': b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
      case 'bp': b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
      case 'notch': b0 = 1; b1 = -2 * cw; b2 = 1; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; break;
      case 'peak': b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cw; a2 = 1 - al / A; break;
      case 'lowshelf': {
        const s = 2 * Math.sqrt(A) * al;
        b0 = A * (A + 1 - (A - 1) * cw + s); b1 = 2 * A * (A - 1 - (A + 1) * cw); b2 = A * (A + 1 - (A - 1) * cw - s);
        a0 = A + 1 + (A - 1) * cw + s; a1 = -2 * (A - 1 + (A + 1) * cw); a2 = A + 1 + (A - 1) * cw - s; break;
      }
      case 'highshelf': {
        const s = 2 * Math.sqrt(A) * al;
        b0 = A * (A + 1 + (A - 1) * cw + s); b1 = -2 * A * (A - 1 + (A + 1) * cw); b2 = A * (A + 1 + (A - 1) * cw - s);
        a0 = A + 1 - (A - 1) * cw + s; a1 = 2 * (A - 1 - (A + 1) * cw); a2 = A + 1 - (A - 1) * cw - s; break;
      }
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
    return this;
  }
  run(x: Buf, from = 0, to = x.length) {
    const { b0, b1, b2, a1, a2 } = this;
    let z1 = this.z1, z2 = this.z2;
    for (let i = from; i < to; i++) {
      const v = x[i], y = b0 * v + z1;
      z1 = b1 * v - a1 * y + z2; z2 = b2 * v - a2 * y;
      x[i] = y;
    }
    this.z1 = z1; this.z2 = z2;
    return x;
  }
  tick(v: number) { const y = this.b0 * v + this.z1; this.z1 = this.b1 * v - this.a1 * y + this.z2; this.z2 = this.b2 * v - this.a2 * y; return y; }
}
/** filter in place with a chain of biquads */
export function filt(x: Buf, ...fs: Biquad[]) { for (const f of fs) f.run(x); return x; }

/** a TPT state-variable filter (Zavalishin) whose cutoff (Hz) can move every sample: lp / bp / hp out */
export class SVF {
  ic1 = 0; ic2 = 0; q: number; sr: number;
  constructor(q = 0.7071, sr = SR) { this.q = q; this.sr = sr; }
  tick(v: number, f: number, mode: 0 | 1 | 2) {
    const g = Math.tan((Math.PI * clamp(f, 5, this.sr * 0.45)) / this.sr), k = 1 / this.q;
    const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    const v3 = v - this.ic2, v1 = a1 * this.ic1 + a2 * v3, v2 = this.ic2 + a2 * this.ic1 + a3 * v3;
    this.ic1 = 2 * v1 - this.ic1; this.ic2 = 2 * v2 - this.ic2;
    return mode === 0 ? v2 : mode === 1 ? v1 : v - k * v1 - v2;
  }
}
/** run a causal process on a periodic buffer twice round and keep the second lap: its state at the start is what the
 *  loop before left it, so the result is periodic too */
export function twice(x: Buf, process: (y: Buf) => void) {
  const n = x.length, y = new Float32Array(2 * n);
  y.set(x, 0); y.set(x, n);
  process(y);
  x.set(y.subarray(n));
  return x;
}

// ---------------------------------------------------------------- FFT, convolution
const twiddles = new Map<number, { c: Float64Array; s: Float64Array; rev: Uint32Array }>();
function plan(n: number) {
  let p = twiddles.get(n);
  if (p) return p;
  const c = new Float64Array(n / 2), s = new Float64Array(n / 2), rev = new Uint32Array(n);
  for (let i = 0; i < n / 2; i++) { c[i] = Math.cos((2 * Math.PI * i) / n); s[i] = -Math.sin((2 * Math.PI * i) / n); }
  const bits = Math.log2(n);
  for (let i = 0; i < n; i++) { let r = 0, x = i; for (let b = 0; b < bits; b++) { r = (r << 1) | (x & 1); x >>= 1; } rev[i] = r >>> 0; }
  p = { c, s, rev };
  twiddles.set(n, p);
  return p;
}
/** in-place radix-2 FFT (inverse: conjugate twiddles, scaled by 1/n) */
export function fft(re: Float64Array, im: Float64Array, inverse = false) {
  const n = re.length, { c, s, rev } = plan(n);
  for (let i = 0; i < n; i++) {
    const j = rev[i];
    if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  const sg = inverse ? -1 : 1;
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1, step = n / size;
    for (let st = 0; st < n; st += size) {
      for (let j = 0, k = 0; j < half; j++, k += step) {
        const wr = c[k], wi = sg * s[k];
        const a = st + j, b = a + half;
        const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}
const pow2 = (n: number) => { let p = 1; while (p < n) p <<= 1; return p; };
/** a mono signal through a stereo impulse response (one FFT for both of its channels: x real, so the inverse of
 *  X·(Hl + i·Hr) is yl + i·yr) */
export function convolve(x: Buf, ir: Stereo): Stereo {
  const n = pow2(x.length + ir.l.length);
  const xr = new Float64Array(n), xi = new Float64Array(n), hr = new Float64Array(n), hi = new Float64Array(n);
  for (let i = 0; i < x.length; i++) xr[i] = x[i];
  for (let i = 0; i < ir.l.length; i++) { hr[i] = ir.l[i]; hi[i] = ir.r[i]; }
  fft(xr, xi); fft(hr, hi);
  for (let i = 0; i < n; i++) {
    const a = xr[i], b = xi[i], c = hr[i], d = hi[i];
    xr[i] = a * c - b * d; xi[i] = a * d + b * c;
  }
  fft(xr, xi, true);
  const len = x.length + ir.l.length - 1, out = stereo(len);
  for (let i = 0; i < len; i++) { out.l[i] = xr[i]; out.r[i] = xi[i]; }
  return out;
}
/** add src into a loop-length buffer from sample `at`, wrapping round (so a tail past the loop's end lands on its start) */
export function addWrapped(dst: Buf, src: Buf, at: number, gain = 1) {
  const n = dst.length;
  let j = ((Math.round(at) % n) + n) % n;
  for (let i = 0; i < src.length; i++) { dst[j] += src[i] * gain; if (++j === n) j = 0; }
}
/** fold a long buffer onto a loop of n samples */
export function fold(src: Buf, n: number): Buf { const out = new Float32Array(n); addWrapped(out, src, 0); return out; }

// ---------------------------------------------------------------- reading between samples
/** a cubic (Catmull-Rom) read at a fractional position, zero outside */
export function readAt(x: Buf, p: number) {
  const i = Math.floor(p), f = p - i;
  const g = (k: number) => (k >= 0 && k < x.length ? x[k] : 0);
  const y0 = g(i - 1), y1 = g(i), y2 = g(i + 1), y3 = g(i + 2);
  return y1 + 0.5 * f * (y2 - y0 + f * (2 * y0 - 5 * y1 + 4 * y2 - y3 + f * (3 * (y1 - y2) + y3 - y0)));
}
/** played at `speed` (0.5: an octave down and twice as long), band-limited first when sped up */
export function varispeed(x: Buf, speed: number): Buf {
  let src = x;
  if (speed > 1) { src = x.slice(); filt(src, new Biquad('lp', (SR / 2 / speed) * 0.9, 0.7), new Biquad('lp', (SR / 2 / speed) * 0.9, 0.7)); }
  const n = Math.floor(x.length / speed), out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = readAt(src, i * speed);
  return out;
}
/** a granular pitch shift that keeps the time: Hann grains read at `ratio` from a source that advances at 1×, some
 *  of them read backwards (`back`), their starts jittered */
export function granular(x: Buf, ratio: number, r: Rand, opts: { grain?: number; overlap?: number; jitter?: number; back?: number } = {}): Buf {
  const G = Math.round((opts.grain ?? 0.09) * SR), hop = Math.round(G / (opts.overlap ?? 4)), jit = (opts.jitter ?? 0.03) * SR;
  const out = new Float32Array(x.length);
  const win = new Float32Array(G);
  for (let i = 0; i < G; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / G);
  const norm = 2 / (opts.overlap ?? 4);
  for (let t = 0; t < x.length; t += hop) {
    const rev = r() < (opts.back ?? 0);
    const start = t + (r() * 2 - 1) * jit;
    for (let i = 0; i < G && t + i < x.length; i++) {
      const p = rev ? start + (G - i) * ratio : start + i * ratio - G * (ratio - 1) * 0.5;
      out[t + i] += readAt(x, p) * win[i] * norm;
    }
  }
  return out;
}

// ---------------------------------------------------------------- envelopes, measuring
/** piecewise-smooth envelope through [time, value] points (smoothstep between them, held outside) */
export function curve(points: [number, number][]) {
  return (t: number) => {
    if (t <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
      const [t1, v1] = points[i];
      if (t <= t1) { const [t0, v0] = points[i - 1]; return lerp(v0, v1, smooth(t0, t1, t)); }
    }
    return points[points.length - 1][1];
  };
}
export function peak(x: Buf) { let p = 0; for (let i = 0; i < x.length; i++) p = Math.max(p, Math.abs(x[i])); return p; }
export function rms(x: Buf, from = 0, to = x.length) { let s = 0; for (let i = from; i < to; i++) s += x[i] * x[i]; return Math.sqrt(s / Math.max(1, to - from)); }

/** the BS.1770 K-weighting (48 kHz), run twice round when it's a loop */
export function kweight(x: Buf, loop = true) {
  const y = x.slice();
  const st1 = new Biquad('lp', 1000), st2 = new Biquad('lp', 1000);
  Object.assign(st1, { b0: 1.53512485958697, b1: -2.69169618940638, b2: 1.19839281085285, a1: -1.69065929318241, a2: 0.73248077421585 });
  Object.assign(st2, { b0: 1, b1: -2, b2: 1, a1: -1.99004745483398, a2: 0.99007225036621 });
  if (loop) twice(y, (z) => { st1.run(z); st2.run(z); }); else { st1.run(y); st2.run(y); }
  return y;
}
const lk = (e: number) => -0.691 + 10 * Math.log10(Math.max(1e-20, e));
/** BS.1770-4 integrated loudness (LUFS) of a stereo buffer at 48 kHz (gated: −70 absolute, −10 relative) */
export function lufs(s: Stereo, loop = true) {
  const L = kweight(s.l, loop), R = kweight(s.r, loop);
  const B = Math.round(0.4 * SR), H = Math.round(0.1 * SR), blocks: number[] = [];
  for (let st = 0; st + B <= L.length; st += H) {
    let e = 0;
    for (let i = st; i < st + B; i++) e += L[i] * L[i] + R[i] * R[i];
    blocks.push(e / B);
  }
  const abs = blocks.filter((e) => lk(e) > -70);
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  const rel = lk(mean(abs)) - 10;
  return lk(mean(abs.filter((e) => lk(e) > rel)));
}
/** short-term loudness (LUFS) every `hop` seconds over `win`-second windows, round the loop */
export function loudnessProfile(s: Stereo, win = 3, hop = 1) {
  const L = kweight(s.l), R = kweight(s.r), n = L.length, W = Math.round(win * SR), out: number[] = [];
  for (let t = 0; t < n; t += Math.round(hop * SR)) {
    let e = 0;
    for (let i = 0; i < W; i++) { const j = (t - (W >> 1) + i + n) % n; e += L[j] * L[j] + R[j] * R[j]; }
    out.push(lk(e / W));
  }
  return out;
}
/** the true peak, near enough: 4× oversampled with a windowed sinc */
export function truePeak(x: Buf) {
  const taps = 16, os = 4;
  let p = 0;
  for (let i = 0; i < x.length; i++) {
    p = Math.max(p, Math.abs(x[i]));
    for (let k = 1; k < os; k++) {
      const f = k / os;
      let v = 0;
      for (let j = -taps + 1; j <= taps; j++) {
        const n = i + j, d = j - f;
        if (n < 0 || n >= x.length) continue;
        const w = 0.5 + 0.5 * Math.cos((Math.PI * d) / taps);
        v += x[n] * (Math.sin(Math.PI * d) / (Math.PI * d)) * w;
      }
      p = Math.max(p, Math.abs(v));
    }
  }
  return p;
}

// ---------------------------------------------------------------- files
/** a 24-bit PCM WAV, TPDF-dithered */
export function writeWav(path: string, s: Stereo, sr = SR) {
  const n = s.l.length, bytes = n * 2 * 3, buf = Buffer.alloc(44 + bytes);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + bytes, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 6, 28); buf.writeUInt16LE(6, 32); buf.writeUInt16LE(24, 34);
  buf.write('data', 36); buf.writeUInt32LE(bytes, 40);
  const r = rng(24);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (const ch of [s.l, s.r]) {
      const v = Math.round(clamp(ch[i], -1, 1) * 8388607 + (r() - r()));
      buf.writeIntLE(clamp(v, -8388608, 8388607), o, 3); o += 3;
    }
  }
  writeFileSync(path, buf);
}
