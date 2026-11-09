// 09 / Membrane, the soundtrack: node 09/audio/render.ts writes film/09.wav (48 kHz, 24-bit, exactly one loop, score.ts LOOP)
// and 09/assets/membrane.m4a (the same, AAC, for the live page), and prints what it measured.
//
// It follows the score (../score.ts) as the picture does. The drum is simulated, not sampled: every stroke is the hide
// (membrane.ts, the picture's physics with a real drum's losses) struck by a modelled beater at the stroke's speed and
// place, heard in front and through the shell (voice.ts), with the pods rattling after it (layers.ts); the pulse's
// three each harder and louder than the last. The great stroke at 10.9 s, the last, where time runs at a
// two-hundredth, is a film's slow-motion hit rather than a hit slowed down two hundred times (which you couldn't hear):
// a reversed swell into it, the beater's whoosh slowing, the strike with copies of itself an octave and two down and a
// sub under them, and its ring kept at pitch but stretched, the hide simulated with its losses cut as far as time is
// slowed, so it rings on through the cosmos. Under it all, from the first stroke, the universe's membrane, a second,
// vast simulation, pushed by each stroke's ring and by the ripples the picture shows crossing it. From the moment the
// beater lands everything is heard as if from under water — low, muffled, wandering — till the dark of the loop's end.
//
// It's a loop by construction: everything is laid into one loop's length with its tail wrapped round onto the start,
// the reverbs' tails folded back the same way, the bed made of whole cycles, the master's filters and limiter run
// twice round; the trip falls away into the fade at its end, the bed carrying on across the seam. The simulations are
// cached (sims.ts, .cache/).
// STEMS=<dir> also writes each layer on its own.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { STROKES, BIG, LOOP, ACT, rate } from '../score.ts';
import { shot } from '../camera.ts';
import { struckPoint } from '../stage.ts';
import { HIDE, COSMOS, type StrikeSpec, type UniverseSpec, type Drive } from './membrane.ts';
import { run } from './sims.ts';
import { voice } from './voice.ts';
import { rattle, whoosh, bed, breath, subDrop, shock } from './layers.ts';
import { hall, cosmic, reverb, master, limit } from './space.ts';
import {
  SR, Biquad, SVF, twice, smooth, filt, fft, addWrapped, varispeed, convolve, curve, peak, rms, truePeak, kweight, loudnessProfile, writeWav,
  type Stereo, stereo, type Buf, todb,
} from './dsp.ts';

const T0 = performance.now();
const N = Math.round(LOOP * SR);
const ROOT = new URL('../../', import.meta.url);
// Every style has its own picture-locked WAV and live AAC; style a keeps the original filenames.
const WAV = fileURLToPath(new URL('film/09.wav', ROOT)), M4A = fileURLToPath(new URL('09/assets/membrane.m4a', ROOT));
const log = (s: string) => console.log(s);
const secs = () => ((performance.now() - T0) / 1000).toFixed(1);

/** the mix: each layer's level, its sends to the hall and the cosmos (the returns at the end) */
const MIX = {
  stroke: [1.5, 0.36, 0.03], rattle: [1.2, 0.25, 0.02], whoosh: [2.0, 0.15, 0],
  big: [0.9, 0.22, 0.2], octave: [0.64, 0.12, 0.18], octave2: [0.5, 0, 0.12], sub: [0.46, 0, 0.06],
  bigRattle: [0.34, 0.3, 0.12], slowRattle: [0.2, 0.1, 0.5], bigWhoosh: [1, 0.2, 0.3], breath: [0.06, 0.2, 0.2],
  swell: [0.75, 0, 0.04], shock: [0.5, 0.08, 0.35],
  universe: [0.4, 0, 0.22], shimmer: [0.29, 0.05, 0.55], gather: [0.2, 0, 0.5], foam: [0.6, 0.15, 0.4], bed: [0.18, 0, 0.2],
  returns: [0.55, 0.24],
} as const;

// ---------------------------------------------------------------- the simulations
log('the felt, the strikes');
const [felt] = await run([{ kind: 'felt', spec: { ms: 8.5, v: STROKES[0].v, at: STROKES[0].at } }], log);
const K = felt.meta.K as number;
// the great stroke's losses: cut as far as time is slowed (σ0 by √rate, the high modes' less), back as it returns
const RING = ACT.black - BIG.t;
const slowed: [number, number][] = [];
for (let i = 0; i <= RING * 100; i++) { const r = rate(BIG.t + i * 0.01); slowed.push([Math.max(0.1, Math.sqrt(r)), Math.pow(r, 0.3)]); }
// (the felt's contact model holds to about 10 m/s — past it its force spikes, and at 12 it blows up — so the great
// stroke is struck there in the simulation; its weight past that is the layers under it)
const SIM_V_MAX = 9.8;
const strikeSpecs: StrikeSpec[] = STROKES.map((s) => ({ v: Math.min(s.v, SIM_V_MAX), at: s.at, K, seconds: s.big ? RING : 3.4, loss: s.big ? slowed : undefined }));
const sims = await run(strikeSpecs.map((spec) => ({ kind: 'strike' as const, spec })), log);
log(`  (${secs()} s)`);

// ---------------------------------------------------------------- measuring a strike
function spectrum(x: Buf, from: number, len: number) {
  const n = 1 << Math.ceil(Math.log2(len)), re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < len; i++) re[i] = (x[from + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / len));
  fft(re, im);
  const m = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) m[i] = Math.hypot(re[i], im[i]);
  return { m, df: SR / n };
}
/** the strongest peak between f0 and f1 (Hz), refined by a parabola through its neighbours */
function peakHz(x: Buf, f0: number, f1: number, from = 0, len = SR * 2) {
  const { m, df } = spectrum(x, from, len);
  let b = Math.ceil(f0 / df);
  for (let i = b; i < f1 / df; i++) if (m[i] > m[b]) b = i;
  const a = Math.log(m[b - 1]), c = Math.log(m[b]), d = Math.log(m[b + 1]);
  return (b + (0.5 * (a - d)) / (a - 2 * c + d)) * df;
}
/** a band's level (dB) in 0.25 s windows, and the T60 its decay implies */
function decay(x: Buf, f0: number, f1: number, from: number, to: number) {
  const pts: [number, number][] = [];
  for (let t = from; t < to; t += 0.25) {
    const { m, df } = spectrum(x, Math.round(t * SR), SR / 5);
    let e = 0;
    for (let i = Math.floor(f0 / df); i < f1 / df; i++) e += m[i] * m[i];
    pts.push([t, 10 * Math.log10(e + 1e-30)]);
  }
  const n = pts.length, mx = pts.reduce((s, p) => s + p[0], 0) / n, my = pts.reduce((s, p) => s + p[1], 0) / n;
  const slope = pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
  return -60 / slope;
}
const first = sims[0];
const F0 = peakHz(first.a.frontL, 30, 60);
log(`  hide: ${HIDE.n} cells across, 8λ²+64μ² = ${(first.meta.courant as number).toFixed(3)} (≤ 4); felt K = ${K.toExponential(3)} N/m^2.4`);
log(`  fundamental ${F0.toFixed(2)} Hz; (1,1) ${peakHz(first.a.pick1, 62, 80).toFixed(1)} Hz, (0,2) ${peakHz(first.a.frontL, 95, 110).toFixed(1)} Hz`);
log(`  T60: 40–50 Hz ${decay(first.a.frontL, 40, 50, 0.3, 2.8).toFixed(2)} s, 60–120 Hz ${decay(first.a.pick1, 60, 120, 0.3, 2.3).toFixed(2)} s, 200–400 Hz ${decay(first.a.pick1, 200, 400, 0.2, 1.4).toFixed(2)} s`);
STROKES.forEach((s, i) => {
  const c = sims[i].meta.contact as { off: number; peakF: number; comp: number; push: number };
  log(`  stroke ${s.t.toFixed(1)} s, ${s.v} m/s: contact ${(c.off * 1000).toFixed(2)} ms, peak force ${c.peakF.toFixed(0)} N, felt ${(c.comp * 1000).toFixed(1)} mm, hide pushed ${(c.push * 1000).toFixed(1)} mm`);
});
{
  const b = sims[STROKES.indexOf(BIG)].a.frontL;
  const at = (t: number) => todb(rms(b, Math.round(t * SR), Math.round((t + 0.2) * SR)) / rms(b, 0, Math.round(0.2 * SR)));
  log(`  the great stroke's ring (re its first 0.2 s): +2 s ${at(2).toFixed(0)} dB, +5 s ${at(5).toFixed(0)} dB, +8 s ${at(8).toFixed(0)} dB, +10 s ${at(10).toFixed(0)} dB; pitch at +0.1 s ${peakHz(b, 30, 60, Math.round(0.02 * SR), SR / 2).toFixed(2)} Hz, at +4 s ${peakHz(b, 30, 60, 4 * SR, SR * 2).toFixed(2)} Hz`);
}

// ---------------------------------------------------------------- the buses
type Group = 'drum' | 'big' | 'rattle' | 'air' | 'bed' | 'cosmos' | 'shimmer';
const groups = new Map<Group, Stereo>();
const sendH = new Float32Array(N), sendC = new Float32Array(N);
const mono = (s: Stereo) => { const m = new Float32Array(s.l.length); for (let i = 0; i < m.length; i++) m[i] = 0.5 * (s.l[i] + s.r[i]); return m; };
/** lay a sound into the loop at film time t (wrapping), with sends to the hall and the cosmos */
function place(g: Group, s: Stereo, t: number, gain: number, hallSend = 0, cosmicSend = 0) {
  if (!groups.has(g)) groups.set(g, stereo(N));
  const bus = groups.get(g)!, at = Math.round(t * SR);
  addWrapped(bus.l, s.l, at, gain); addWrapped(bus.r, s.r, at, gain);
  if (hallSend || cosmicSend) { const m = mono(s); if (hallSend) addWrapped(sendH, m, at, gain * hallSend); if (cosmicSend) addWrapped(sendC, m, at, gain * cosmicSend); }
}
const envelope = (s: Stereo, t0: number, f: (t: number) => number) => {
  for (let i = 0; i < s.l.length; i++) { const g = f(t0 + i / SR); s.l[i] *= g; s.r[i] *= g; }
  return s;
};
const fadeOut = (x: Buf, seconds: number) => { const f = Math.round(seconds * SR); for (let i = 0; i < f; i++) x[x.length - 1 - i] *= i / f; return x; };
const both = (s: Stereo, fn: (x: Buf) => Buf): Stereo => ({ l: fn(s.l), r: fn(s.r) });

log('the strokes');
/** when a stroke is heard: its contact, and the sound's way from the struck point to where we stand (the camera, at
 *  343 m/s) — a few milliseconds from close by, a dozen from across the dais; the eye knows the difference */
const heard = (s: (typeof STROKES)[number]) => {
  const e = shot(s.t, { yaw: 0, pitch: 0 }).eye, p = struckPoint(s);
  return s.t + Math.hypot(e[0] - p[0], e[1] - p[1], e[2] - p[2]) / 343;
};
STROKES.forEach((s) => log(`  stroke at ${s.t} s heard ${((heard(s) - s.t) * 1000).toFixed(1)} ms after its contact`));
const voices: Stereo[] = STROKES.map((s, i) => voice(sims[i], { seed: 11 + i, slap: s.big ? 1.3 : 1 }));
// (each of the pulse louder than the last: the harder stroke's own louder ring, and a little more on top)
const PULSE_GAIN = [0.9, 1.18];
STROKES.forEach((s, i) => {
  if (s.big) return;
  const g = PULSE_GAIN[i] ?? 1;
  place('drum', voices[i], heard(s), MIX.stroke[0] * g, MIX.stroke[1], MIX.stroke[2]);
  place('rattle', rattle(s.v, 100 + i), heard(s), MIX.rattle[0] * g, MIX.rattle[1], MIX.rattle[2]);
  const w = whoosh(s.t, s.v, 0.24, 200 + i);
  place('air', w.s, w.at, ...MIX.whoosh);
});

// ---------------------------------------------------------------- the great stroke
log('the great stroke');
const big = voices[STROKES.indexOf(BIG)];
const bigMono = mono(big);
// (the blow at full weight, then the stretched ring settling under it: its level falls as a real ring's would for the
// first moments, then holds, decaying only as the slowed hide does)
const settleRing = (t: number) => 0.26 + 0.74 * Math.exp(-t / 0.22);
// (and gone with the picture, into the dark)
for (let i = 0; i < big.l.length; i++) { const g = settleRing(i / SR) * (1 - smooth(ACT.fade - BIG.t, RING - 0.05, i / SR)); big.l[i] *= g; big.r[i] *= g; }
place('big', big, heard(BIG), ...MIX.big);
// its weight: the strike an octave down and two down (cut short, they're the blow, not the ring), a sub falling under
const head = (s: Stereo, seconds: number) => both(s, (x) => fadeOut(x.slice(0, Math.round(seconds * SR)), seconds * 0.6));
const decaying = (x: Buf, tau: number) => { for (let i = 0; i < x.length; i++) x[i] *= Math.exp(-i / SR / tau); return x; };
const oct = both(head(big, 2.4), (x) => decaying(filt(varispeed(x, 0.5), new Biquad('lp', 520, 0.7)), 0.38));
const oct2 = both(head(big, 1.8), (x) => decaying(filt(varispeed(x, 0.25), new Biquad('hp', 23, 0.7), new Biquad('lp', 240, 0.7)), 0.6));
place('big', oct, heard(BIG), ...MIX.octave);
place('big', oct2, heard(BIG), ...MIX.octave2);
const sub = subDrop(54, 26, 6, 1.6);
place('big', { l: sub, r: sub }, heard(BIG), ...MIX.sub);
// the downswing's whoosh, slowing as time does
const bw = whoosh(BIG.t, BIG.v, 0.26, 210);
place('air', bw.s, bw.at, ...MIX.bigWhoosh);
const br = breath(220);
place('air', br.s, br.at, ...MIX.breath);
// the swell into it: the strike's own reverb in the cosmos, backwards, ending as the beater meets the hide
const IR_H = hall(), IR_C = cosmic();
{
  const dry = bigMono.slice(0, Math.round(1.2 * SR));
  fadeOut(dry, 0.5);
  const wet = convolve(dry, IR_C), len = Math.round(1.75 * SR), sw = stereo(len);
  for (let i = 0; i < len; i++) {
    const j = len - 1 - i;
    sw.l[i] = wet.l[j] * 0.9 + (dry[j] ?? 0) * 0.3; sw.r[i] = wet.r[j] * 0.9 + (dry[j] ?? 0) * 0.3;
  }
  // (it ends a breath before the blow: a moment sucked out of the air, then the hit)
  const t0 = BIG.t - 0.065 - len / SR;
  // (and it grows as an exponential does, the reverb's own shape backwards being flat)
  const B = BIG.t;
  for (const ch of [sw.l, sw.r]) filt(ch, new Biquad('lp', 1200, 0.7), new Biquad('lp', 1200, 0.7));
  envelope(sw, t0, curve([[t0, 0], [B - 0.65, 0], [B - 0.5, 0.03], [B - 0.4, 0.08], [B - 0.3, 0.19], [B - 0.2, 0.43], [B - 0.13, 0.78], [B - 0.1, 1], [B - 0.065, 0]]));
  place('big', sw, t0, ...MIX.swell);
}
// the shock leaving the drum
{
  // (the shock leaving the drum: deep, its brightness taken off — it's heard from under water)
  const sk = shock(230);
  for (const ch of [sk.l, sk.r]) filt(ch, new Biquad('lp', 420, 0.7), new Biquad('lp', 420, 0.7));
  place('air', sk, ACT.shock, ...MIX.shock);
}

// ---------------------------------------------------------------- the universe's membrane
log('the universe');
// (from the first stroke to the fade: the great stroke rings it for good)
const U0 = STROKES[0].t - 0.2, U1 = ACT.black;
const dec = (x: Buf) => { const y = filt(x.slice(), new Biquad('lp', 4200, 0.7), new Biquad('lp', 4200, 0.7)), out = new Float32Array(Math.floor(y.length / 4)); for (let i = 0; i < out.length; i++) out[i] = y[i * 4]; return out; };
const uSR = COSMOS.sr;
const drives: Drive[] = [];
{
  // (the pulse's strokes are ordinary ones: the universe doesn't answer them, only the great stroke)
  // the great stroke's ring, feeding it from the moment it lands (the wall struck with the hide)
  {
    const lead = Math.round((BIG.t - U0) * uSR), ring = dec(bigMono);
    const sig = new Float32Array(lead + ring.length);
    for (let j = 0; j < ring.length; j++) sig[lead + j] = ring[j] * 400 * Math.min(1, j / (0.4 * uSR));
    drives.push({ at: [0.05, -0.08], rad: 0.06, signal: sig });
  }
  // the ripples the picture shows crossing it (main.ts's waves: the great stroke's three, the trip's two): each a
  // swell of the strike an octave down
  const WAVES: [number, number, number, number][] = [[1, 0.02, 0, BIG.t + 0.02], [0.8, 0.25, 0.1, BIG.t + 2.2], [0.7, -0.3, -0.2, BIG.t + 5.5],
    [0.65, -0.4, 0.35, ACT.trip + 1.5], [0.7, 0.3, -0.4, ACT.trip + 9]];
  const blow = dec(varispeed(fadeOut(bigMono.slice(0, Math.round(1.1 * SR)), 0.6), 0.5));
  for (const [a, x, y, t] of WAVES) {
    const lead = Math.round((t - U0 - 0.25) * uSR), sig = new Float32Array(lead + blow.length);
    for (let i = 0; i < blow.length; i++) sig[lead + i] = blow[i] * a * 2600 * (1 - Math.exp(-i / (0.22 * uSR)));
    drives.push({ at: [x * 1.6, y * 1.6], rad: 0.09, signal: sig });
  }
}
const uLoss: [number, number][] = [];
const g0 = curve([[U0, 1], [ACT.fade - 1, 1], [U1, 6]]), g1 = curve([[U0, 1], [ACT.fade - 1, 1], [U1, 3]]);
for (let t = U0; t <= U1; t += 0.01) uLoss.push([g0(t), g1(t)]);
const uSpec: UniverseSpec = { seconds: U1 - U0, drives, loss: uLoss };
const [uni] = await run([{ kind: 'universe', spec: uSpec }], log);
log(`  universe: 8λ²+64μ² = ${(uni.meta.courant as number).toFixed(3)}, fundamental ≈ ${(2.405 * COSMOS.c / (2 * Math.PI * COSMOS.radius)).toFixed(1)} Hz`);
const cosmosU: Stereo = (() => {
  const { p0, p1, p2, p3, acc } = uni.a;
  const a = peak(acc) || 1, n = p0.length, l = new Float32Array(n), r = new Float32Array(n);
  const pk = Math.max(peak(p0), peak(p1), peak(p2), peak(p3)) || 1;
  // (heard as mid and side: the four points and the whole membrane's push together in the middle, their differences
  // at the sides, less than the middle, so it stays whole in mono where low modes have the points in opposite phase)
  for (let i = 0; i < n; i++) {
    const mid = (p0[i] + p1[i] + p2[i] + p3[i]) / (2 * pk) + (0.5 * acc[i]) / a, side = (0.6 * (p0[i] - p1[i]) + 0.35 * (p2[i] - p3[i])) / (2 * pk);
    l[i] = mid + side; r[i] = mid - side;
  }
  const up = (x: Buf) => filt(varispeed(x, uSR / SR), new Biquad('lp', 2600, 0.7), new Biquad('lp', 2600, 0.7), new Biquad('hp', 16, 0.7), new Biquad('lowshelf', 60, 0.7, -4));
  const s = { l: up(l), r: up(r) }, g = 1 / Math.max(peak(s.l), peak(s.r));
  for (let i = 0; i < s.l.length; i++) { s.l[i] *= g; s.r[i] *= g; }
  return s;
})();
log(`  universe's loudest mode near ${peakHz(cosmosU.l, 12, 200, Math.round((BIG.t + 1 - U0) * SR), SR * 2).toFixed(1)} Hz`);
// (under the pulse as each stroke's answer, swelling with the great stroke, full through the trip, gone under the fade)
envelope(cosmosU, U0, curve([[U0, 0], [U0 + 0.3, 0.75], [BIG.t, 0.8], [BIG.t + 1.5, 1], [ACT.fade, 1], [ACT.black - 0.1, 0]]));
place('cosmos', cosmosU, U0, ...MIX.universe);
// ---------------------------------------------------------------- the bed
log('the bed');
place('bed', bed(F0, 400), 0, ...MIX.bed);

// ---------------------------------------------------------------- space, the master
log(`the rooms (${secs()} s)`);
const wetH = reverb(sendH, IR_H), wetC = reverb(sendC, IR_C);
// the drum's and the great stroke's buses held at their peaks (clean look-ahead limiting, slow enough to keep the boom's
// shape), so the master hardly has to touch them
const busRed: string[] = [];
// (the pulse's bus only just: its loudest stroke must stay its loudest)
for (const [g, under, ahead, release] of [['drum', 1.5, 0.008, 0.25], ['big', 4, 0.01, 0.4]] as [Group, number, number, number][]) {
  const s = groups.get(g)!, c = Math.max(peak(s.l), peak(s.r)) * Math.pow(10, -under / 20);
  busRed.push(`${g} ${limit(s, c, { ahead, release }).toFixed(1)} dB`);
}
for (const [w, g] of [[wetH, MIX.returns[0]], [wetC, MIX.returns[1]]] as [Stereo, number][]) for (let i = 0; i < N; i++) { w.l[i] *= g; w.r[i] *= g; }
const mix = stereo(N);
for (const s of [...groups.values(), wetH, wetC]) for (let i = 0; i < N; i++) { mix.l[i] += s.l[i]; mix.r[i] += s.r[i]; }
// under water: from the moment the beater lands, everything heard as if from under water — a resonant lowpass
// diving as it lands (the blow's first hundredths still through, then only its depth), wandering low through the
// slowed moment and the trip, opening again in the dark at the loop's end (run twice round: the loop closes)
{
  const B = BIG.t;
  const cut = curve([[0, 18000], [B - 0.03, 18000], [B + 0.02, 2600], [B + 0.3, 560], [B + 3, 440], [ACT.trip, 600], [ACT.fade, 480], [ACT.black, 700], [ACT.black + 0.4, 18000], [LOOP, 18000]]);
  for (const ch of [mix.l, mix.r]) twice(ch, (z) => {
    const a = new SVF(1.15), b = new SVF(0.8);
    for (let i = 0; i < z.length; i++) {
      const t = (i % N) / SR, c = cut(t), fc = c < 17000 ? c * (1 + 0.14 * Math.sin(t * 1.7) + 0.08 * Math.sin(t * 4.3 + 1)) : c;
      z[i] = b.tick(a.tick(z[i], fc, 0), fc * 1.2, 0);
    }
  });
}
log('the master');
const M = master(mix, -14, -1.5);
const out = M.out;
// (what DC the low end's soft clip left, taken out: a constant, so the loop is still a loop)
for (const ch of [out.l, out.r]) { let m = 0; for (let i = 0; i < N; i++) m += ch[i]; m /= N; for (let i = 0; i < N; i++) ch[i] -= m; }

// ---------------------------------------------------------------- what it measures
const tp = Math.max(truePeak(out.l), truePeak(out.r));
let dcL = 0, dcR = 0;
for (let i = 0; i < N; i++) { dcL += out.l[i]; dcR += out.r[i]; }
log(`\nmaster: gain ${todb(M.gain).toFixed(1)} dB, ${M.lufs.toFixed(2)} LUFS, peak ${todb(M.peak).toFixed(2)} dBFS, true peak ≈ ${todb(tp).toFixed(2)} dBTP, limiting ${M.reduction.toFixed(1)} dB at most, the low end's soft clip ${M.lowClip.toFixed(1)} dB at most (the buses before it: ${busRed.join(', ')}), DC ${(dcL / N).toExponential(1)} / ${(dcR / N).toExponential(1)}`);
// each layer's loudness through each part of the act (ungated, with the master's gain; the master's own last)
{
  const B = BIG.t;
  const PARTS: [string, number, number][] = [['stroke 1', 1.2, 3.8], ['stroke 2', 3.9, 6.3], ['stroke 3', 6.4, ACT.windup], ['wind-up', ACT.windup, B - 0.7], ['dilate', B - 0.7, B],
    ['great', B, B + 2], ['slowed', B + 2, ACT.shock], ['lift', ACT.shock, ACT.trip], ['trip', ACT.trip, ACT.fade], ['fade', ACT.fade, LOOP]];
  const rows: [string, Stereo, number][] = [...[...groups].map(([g, s]) => [g, s, M.gain] as [string, Stereo, number]), ['hall', wetH, M.gain], ['cosmic', wetC, M.gain], ['MASTER', out, 1]];
  log('  ' + ''.padEnd(8) + PARTS.map(([p]) => p.padStart(8)).join(''));
  for (const [name, s, g] of rows) {
    const L = kweight(s.l), R = kweight(s.r);
    const cells = PARTS.map(([, a, b]) => {
      let e = 0;
      for (let i = Math.round(a * SR); i < Math.round(b * SR); i++) e += L[i] * L[i] + R[i] * R[i];
      return (-0.691 + 10 * Math.log10(Math.max(1e-20, (e * g * g) / ((b - a) * SR)))).toFixed(1).padStart(8);
    });
    log('  ' + name.padEnd(8) + cells.join('') + `   peak ${todb(Math.max(peak(s.l), peak(s.r)) * g).toFixed(1)}`);
  }
  // and how alike its two sides are (1: mono, 0: unrelated, below 0: out of phase — trouble when summed to mono)
  log('  L/R correlation');
  for (const [name, s] of rows) {
    const cells = PARTS.map(([, a, b]) => {
      let ll = 0, rr = 0, lr = 0;
      for (let i = Math.round(a * SR); i < Math.round(b * SR); i++) { ll += s.l[i] * s.l[i]; rr += s.r[i] * s.r[i]; lr += s.l[i] * s.r[i]; }
      return (ll * rr > 0 ? lr / Math.sqrt(ll * rr) : 0).toFixed(2).padStart(8);
    });
    log('  ' + name.padEnd(8) + cells.join(''));
  }
}
{
  // where the limiters work: their deepest gain reduction (dB) in each half second
  const cut = (tr: Float32Array) => Array.from({ length: Math.round(LOOP * 2) }, (_, k) => { let m = 1; for (let i = k * SR / 2; i < Math.min(tr.length, (k + 1) * SR / 2); i++) m = Math.min(m, tr[i]); return (-20 * Math.log10(m)).toFixed(0); }).join(' ');
  log('  limiting by half second, all: ' + cut(M.trace));
}
const prof = loudnessProfile(out);
log('short-term loudness (3 s windows), each second: ' + prof.map((v, i) => `${i}:${v.toFixed(0)}`).join(' '));
// the seam: the step (and the bend) from the last sample to the first, ranked among every other step in the loop — a
// click would be up at the top
for (const [name, x] of [['L', out.l], ['R', out.r]] as [string, Buf][]) {
  const step = (i: number) => Math.abs(x[i] - x[(i - 1 + N) % N]), bend = (i: number) => Math.abs(x[(i + 1) % N] - 2 * x[i] + x[(i - 1 + N) % N]);
  const s0 = step(0), b0 = bend(0);
  let below = 0, belowB = 0, sum = 0;
  for (let i = 1; i < N; i++) { const d = step(i); sum += d; if (d < s0) below++; if (bend(i) < b0) belowB++; }
  log(`  seam ${name}: last ${x[N - 1].toFixed(5)} → first ${x[0].toFixed(5)}, step ${s0.toExponential(2)} (mean step ${(sum / (N - 1)).toExponential(2)}; ${(100 * below / (N - 1)).toFixed(1)}th percentile), bend at the ${(100 * belowB / (N - 1)).toFixed(1)}th`);
}

// ---------------------------------------------------------------- the files
mkdirSync(new URL('film/', ROOT), { recursive: true });
// (STEMS=<dir>: each layer as it went into the master, at the master's gain, for listening to one at a time)
if (process.env.STEMS) {
  mkdirSync(process.env.STEMS, { recursive: true });
  for (const [g, s] of [...groups, ['hall', wetH], ['cosmic', wetC]] as [string, Stereo][]) {
    writeWav(`${process.env.STEMS}/${g}.wav`, { l: s.l.map((v) => v * M.gain), r: s.r.map((v) => v * M.gain) });
  }
}
writeWav(WAV, out);
/** ffmpeg's own meter, to check ours: integrated loudness and true peak */
const ebu = (p: string) => {
  const e = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', p, '-af', 'ebur128=peak=true', '-f', 'null', '-']).stderr.toString();
  return { I: Number(e.match(/I:\s+(-?[\d.]+) LUFS/g)?.pop()?.split(/\s+/)[1]), TP: Number(e.match(/Peak:\s+(-?[\d.]+) dBFS/g)?.pop()?.split(/\s+/)[1]) };
};
// the AAC: its coding noise can push the peaks between samples up a little; while it goes past −1 dBTP, encode it
// again a little quieter
const encode = (trim: number) => execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', WAV, ...(trim ? ['-af', `volume=${trim.toFixed(2)}dB`] : []), '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-movflags', '+faststart', M4A]);
let trim = 0;
for (; trim > -1.5; trim -= 0.15) { encode(trim); if (ebu(M4A).TP <= -1) break; }
const probe = (p: string) => execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=sample_rate,channels,bit_rate', '-of', 'compact', p]).toString().trim().replace(/\n/g, ' | ');
log(`\nwrote ${WAV}: ${probe(WAV)}`);
log(`wrote ${M4A}: ${probe(M4A)}${trim ? ` (${trim.toFixed(2)} dB, the encoder's overshoot taken back)` : ''}`);
for (const p of [WAV, M4A]) { const m = ebu(p); log(`  ffmpeg ebur128 ${p.split('/').pop()}: ${m.I} LUFS, true peak ${m.TP} dBTP`); }
log(`rendered in ${secs()} s`);
