// 09 / Membrane, the soundtrack: node 09/audio/render.ts writes film/09.wav (48 kHz, 24-bit, exactly one 26 s loop)
// and 09/assets/membrane.m4a (the same, AAC, for the live page), and prints what it measured.
//
// It follows the score (../score.ts) as the picture does. The drum is simulated, not sampled: every stroke is the hide
// (membrane.ts, the picture's physics with a real drum's losses) struck by a modelled beater at the stroke's speed and
// place, heard in front and through the shell (voice.ts), with the pods rattling after it (layers.ts). The great
// stroke at 9.6 s, where time runs at a hundredth, is a film's slow-motion hit rather than a hit slowed down a hundred
// times (which you couldn't hear): a reversed swell into it, the beater's whoosh slowing, the strike with copies of
// itself an octave and two down and a sub under them, and its ring kept at pitch but stretched, the hide simulated with
// its losses cut as far as time is slowed, so it rings on through the cosmos and dies as time comes back. Then the
// universe's membrane, a second, vast simulation, pushed by the drum's ring and by the ripples the picture shows
// crossing it; the shimmer and the foam of other universes out past it; everything gathered back in; the pulse.
//
// It's a loop by construction: everything is laid into one loop's length with its tail wrapped round onto the start
// (the 25.4 s stroke's ring is under the 1.2 s one), the reverbs' tails folded back the same way, the bed made of
// whole cycles, the master's filters and limiter run twice round. The simulations are cached (sims.ts, .cache/).
// STEMS=<dir> also writes each layer on its own.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { STROKES, BIG, LOOP, ACT, rate } from '../score.ts';
import { HIDE, COSMOS, type StrikeSpec, type UniverseSpec, type Drive } from './membrane.ts';
import { run } from './sims.ts';
import { voice } from './voice.ts';
import { rattle, slowRattle, whoosh, bed, breath, subDrop, shock, shimmer, foam } from './layers.ts';
import { hall, cosmic, reverb, master, limit } from './space.ts';
import {
  SR, Biquad, filt, fft, addWrapped, varispeed, convolve, curve, peak, rms, truePeak, kweight, loudnessProfile, writeWav,
  type Stereo, stereo, type Buf, todb,
} from './dsp.ts';

const T0 = performance.now();
const N = Math.round(LOOP * SR);
const ROOT = new URL('../../', import.meta.url);
const WAV = fileURLToPath(new URL('film/09.wav', ROOT)), M4A = fileURLToPath(new URL('09/assets/membrane.m4a', ROOT));
const log = (s: string) => console.log(s);
const secs = () => ((performance.now() - T0) / 1000).toFixed(1);

/** the mix: each layer's level, its sends to the hall and the cosmos (the returns at the end) */
const MIX = {
  stroke: [1.5, 0.36, 0.03], rattle: [1.2, 0.25, 0.02], whoosh: [2.0, 0.15, 0],
  big: [0.62, 0.22, 0.18], octave: [0.4, 0.12, 0.16], octave2: [0.28, 0, 0.1], sub: [0.22, 0, 0.05],
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
const RING = 10.6;
const slowed: [number, number][] = [];
for (let i = 0; i <= RING * 100; i++) { const r = rate(BIG.t + i * 0.01); slowed.push([Math.max(0.1, Math.sqrt(r)), Math.pow(r, 0.3)]); }
const strikeSpecs: StrikeSpec[] = STROKES.map((s) => ({ v: s.v, at: s.at, K, seconds: s.big ? RING : 3.4, loss: s.big ? slowed : undefined }));
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
const voices: Stereo[] = STROKES.map((s, i) => voice(sims[i], { seed: 11 + i, slap: s.big ? 1.3 : 1 }));
STROKES.forEach((s, i) => {
  if (s.big) return;
  place('drum', voices[i], s.t, ...MIX.stroke);
  place('rattle', rattle(s.v, 100 + i), s.t, ...MIX.rattle);
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
for (let i = 0; i < big.l.length; i++) { const g = settleRing(i / SR); big.l[i] *= g; big.r[i] *= g; }
place('big', big, BIG.t, ...MIX.big);
// its weight: the strike an octave down and two down (cut short, they're the blow, not the ring), a sub falling under
const head = (s: Stereo, seconds: number) => both(s, (x) => fadeOut(x.slice(0, Math.round(seconds * SR)), seconds * 0.6));
const decaying = (x: Buf, tau: number) => { for (let i = 0; i < x.length; i++) x[i] *= Math.exp(-i / SR / tau); return x; };
const oct = both(head(big, 2.4), (x) => decaying(filt(varispeed(x, 0.5), new Biquad('lp', 520, 0.7)), 0.38));
const oct2 = both(head(big, 1.8), (x) => decaying(filt(varispeed(x, 0.25), new Biquad('hp', 23, 0.7), new Biquad('lp', 240, 0.7)), 0.6));
place('big', oct, BIG.t, ...MIX.octave);
place('big', oct2, BIG.t, ...MIX.octave2);
const sub = subDrop(54, 29, 4, 1.05);
place('big', { l: sub, r: sub }, BIG.t, ...MIX.sub);
place('rattle', rattle(BIG.v, 150, true), BIG.t, ...MIX.bigRattle);
place('rattle', slowRattle(160), BIG.t + 0.06, ...MIX.slowRattle);
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
  envelope(sw, t0, curve([[t0, 0], [8.95, 0], [9.1, 0.03], [9.2, 0.08], [9.3, 0.19], [9.4, 0.43], [9.47, 0.78], [BIG.t - 0.1, 1], [BIG.t - 0.065, 0]]));
  place('big', sw, t0, ...MIX.swell);
}
// the shock leaving the drum
place('air', shock(230), ACT.shock, ...MIX.shock);

// ---------------------------------------------------------------- the universe's membrane
log('the universe');
const U0 = 10.6, U1 = 24.8;
const dec = (x: Buf) => { const y = filt(x.slice(), new Biquad('lp', 4200, 0.7), new Biquad('lp', 4200, 0.7)), out = new Float32Array(Math.floor(y.length / 4)); for (let i = 0; i < out.length; i++) out[i] = y[i * 4]; return out; };
const uSR = COSMOS.sr;
const drives: Drive[] = [];
{
  // the drum's ring, feeding it from the shock on
  const from = Math.round((U0 - BIG.t) * SR), ring = dec(bigMono.slice(from));
  for (let i = 0; i < ring.length; i++) ring[i] *= 400 * Math.min(1, i / (0.8 * uSR));
  drives.push({ at: [0.05, -0.08], rad: 0.06, signal: ring });
  // the ripples the picture shows crossing it (main.ts's waves): each a swell of the strike an octave down
  // (the picture's ripple events, main.ts's G.waves: the first two now start where the shock's front first meets the
  // wall, at 12.55 and 13.5)
  const WAVES: [number, number, number, number][] = [[1, 0.02, 0, ACT.cosmos + 0.15], [0.95, 0.25, 0.1, ACT.cosmos + 1.1], [0.9, -0.3, -0.2, ACT.cosmos + 2.6]];
  const blow = dec(varispeed(fadeOut(bigMono.slice(0, Math.round(1.1 * SR)), 0.6), 0.5));
  for (const [a, x, y, t] of WAVES) {
    const lead = Math.round((t - U0 - 0.25) * uSR), sig = new Float32Array(lead + blow.length);
    for (let i = 0; i < blow.length; i++) sig[lead + i] = blow[i] * a * 2600 * (1 - Math.exp(-i / (0.22 * uSR)));
    drives.push({ at: [x * 1.6, y * 1.6], rad: 0.09, signal: sig });
  }
}
const uLoss: [number, number][] = [];
const g0 = curve([[U0, 1], [ACT.home, 1], [ACT.settle, 7], [U1, 10]]), g1 = curve([[U0, 1], [ACT.home, 1], [ACT.settle, 3], [U1, 4]]);
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
log(`  universe's loudest mode near ${peakHz(cosmosU.l, 12, 200, Math.round((ACT.cosmos - U0) * SR), SR * 2).toFixed(1)} Hz`);
envelope(cosmosU, U0, curve([[U0, 0], [11.3, 0.7], [ACT.cosmos, 1], [ACT.home, 1], [ACT.settle, 0.7], [U1, 0]]));
place('cosmos', cosmosU, U0, ...MIX.universe);
// the shimmer as the foam of universes ripples, and the same drawn back in, backwards, on the way home
{
  const a = Math.round((14 - U0) * SR), b = Math.round((21.6 - U0) * SR);
  const src = { l: cosmosU.l.slice(a, b), r: cosmosU.r.slice(a, b) };
  const sh = shimmer(src, 300);
  envelope(sh, 14, curve([[14, 0], [15.2, 0.55], [16.6, 1], [ACT.home, 0.85], [20.3, 0.2], [21.6, 0]]));
  const g = 1 / Math.max(peak(sh.l), peak(sh.r));
  place('shimmer', sh, 14, MIX.shimmer[0] * g, MIX.shimmer[1], MIX.shimmer[2]);
  const c = Math.round((ACT.foam - 14) * SR), d = Math.round((ACT.home - 14) * SR), len = d - c, back = stereo(len);
  for (let i = 0; i < len; i++) { back.l[i] = sh.r[d - 1 - i]; back.r[i] = sh.l[d - 1 - i]; }
  // (it comes to rest as the camera does, fading under the bed rather than cut)
  const t0 = ACT.settle + 0.15 - len / SR;
  envelope(back, t0, curve([[t0, 0], [19.4, 0.1], [20.9, 0.8], [ACT.settle - 0.3, 1], [ACT.settle + 0.15, 0]]));
  place('shimmer', back, t0, MIX.gather[0] * g, MIX.gather[1], MIX.gather[2]);
}
place('shimmer', foam(F0, 310), 0, ...MIX.foam);

// ---------------------------------------------------------------- the bed
log('the bed');
place('bed', bed(F0, 400), 0, ...MIX.bed);

// ---------------------------------------------------------------- space, the master
log(`the rooms (${secs()} s)`);
const wetH = reverb(sendH, IR_H), wetC = reverb(sendC, IR_C);
// the drum's and the great stroke's buses held at their peaks (clean look-ahead limiting, slow enough to keep the boom's
// shape), so the master hardly has to touch them
const busRed: string[] = [];
for (const [g, under, ahead, release] of [['drum', 4, 0.008, 0.25], ['big', 4, 0.01, 0.4]] as [Group, number, number, number][]) {
  const s = groups.get(g)!, c = Math.max(peak(s.l), peak(s.r)) * Math.pow(10, -under / 20);
  busRed.push(`${g} ${limit(s, c, { ahead, release }).toFixed(1)} dB`);
}
for (const [w, g] of [[wetH, MIX.returns[0]], [wetC, MIX.returns[1]]] as [Stereo, number][]) for (let i = 0; i < N; i++) { w.l[i] *= g; w.r[i] *= g; }
const mix = stereo(N);
for (const s of [...groups.values(), wetH, wetC]) for (let i = 0; i < N; i++) { mix.l[i] += s.l[i]; mix.r[i] += s.r[i]; }
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
  const PARTS: [string, number, number][] = [['pulse', 0, 5.25], ['wind-up', 5.25, 7.9], ['dilate', 7.9, 9.6], ['stroke', 9.6, 10.9], ['shock', 10.9, 12.4],
    ['cosmos', 12.4, 15], ['foam', 15, 18.6], ['home', 18.6, 21.5], ['settle', 21.5, 23.5], ['pulse', 23.5, 26]];
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
  const cut = (tr: Float32Array) => Array.from({ length: 52 }, (_, k) => { let m = 1; for (let i = k * SR / 2; i < (k + 1) * SR / 2; i++) m = Math.min(m, tr[i]); return (-20 * Math.log10(m)).toFixed(0); }).join(' ');
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
