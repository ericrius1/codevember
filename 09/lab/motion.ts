// The motion's own critic: runs her (the score, the strokes, the rig, her strands) frame by frame on the film's clock
// without the GPU, and measures how smooth it is — every joint's and the beater's velocity, acceleration and jerk in
// film time, the one-frame spikes (a pose that jumps, a velocity that kinks) ranked with where in the stroke they fall,
// and the strands' tips' motion against their roots. It draws what it measured: a chart of every track's acceleration
// over the loop, and onion skins of her (seen from the drum's side, the swing's plane) through the stroke windows.
//
//   node 09/lab/run.mjs [--fps 60] [--from 0 --to 26] [--out dir]
//
// (run.mjs bundles this with esbuild — the .wgsl imports as text — and runs it in node.)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';
import { loadHero } from '../../src/rig/hero/asset';
import { HeroRig } from '../../src/rig/hero/rig';
import { fitHands } from '../../src/rig/town/hands';
import * as solve from '../../src/rig/body/solve';
import type { V3 } from '../../src/rig/hero/math';
import { moment, drive } from '../perform';
import { LOOP, story, STORY_LOOP, STROKES } from '../score';
import { Hair, STRAND } from '../hair';

const argv = process.argv.slice(2);
const flag = (k: string, d: string) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1]; };
const FPS = Number(flag('fps', '60'));
const OUT = flag('out', 'film/lab');
const FROM = Number(flag('from', '0')), TO = Number(flag('to', String(LOOP)));
mkdirSync(OUT, { recursive: true });

// (node's fetch reads file: URLs)
const netFetch = globalThis.fetch;
globalThis.fetch = (async (u: RequestInfo | URL) => {
  const s = String(u);
  return s.startsWith('file:') ? new Response(readFileSync(fileURLToPath(s))) : netFetch(u);
}) as typeof fetch;

HeroRig.bodyKit = solve;
HeroRig.armContinuity = true; HeroRig.armSpring = 30;
const asset = await loadHero(pathToFileURL('09/assets/shaman_hi.bin.gz').href);
fitHands(asset);
const rig = new HeroRig(asset);
rig.female = true;
const hair = new Hair(rig);
const B = asset.bones, I = asset.index;

// ---------------------------------------------------------------- what's tracked
const joint = (n: string, end: 'head' | 'tail' = 'head') => () => rig.skinPoint(I[n], B[I[n]][end]);
let M = moment(0);
const TRACKS: [string, () => V3][] = [
  ['beater', () => M.beater.head], ['grip', () => M.beater.hand],
  ['handR', joint('handR')], ['elbowR', joint('farmR')], ['shoulderR', joint('uarmR')],
  ['handL', joint('handL')], ['elbowL', joint('farmL')],
  ['head', joint('head', 'tail')], ['chest', joint('chest')], ['pelvis', joint('pelvis')],
  ['kneeL', joint('shinL')], ['kneeR', joint('shinR')], ['footL', joint('footL')], ['footR', joint('footR')],
];
const chains = hair.kinds.map((k, c) => ({ k, c, o: hair.strands.start(c), n: hair.specs[c].n }));

// ---------------------------------------------------------------- the run: one loop to warm, then the measured one
const frames = Math.round(LOOP * FPS);
const P: V3[][] = TRACKS.map(() => []);
const tipRel: Record<number, V3[][]> = {};
for (const k of Object.values(STRAND)) tipRel[k] = [];
const skel: V3[][] = [];
const BONES = ['pelvis', 'spine', 'chest', 'neck', 'head', 'clavL', 'uarmL', 'farmL', 'handL', 'clavR', 'uarmR', 'farmR', 'handR', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'];
let last = -1;
for (let pass = 0; pass < 2; pass++) {
  for (let f = 0; f < frames; f++) {
    const t = f / FPS;
    const s = story(t);
    const jumped = last < 0;
    // (as main.ts: across the loop's wrap the story clock runs on)
    const wrapped = last > STORY_LOOP - 0.5 && s < 0.5;
    const s0 = last >= 0 && s >= last ? last : wrapped ? s - (STORY_LOOP - last) : Math.max(0, s - 1 / FPS);
    const ds = Math.max(1e-5, s - s0);
    last = s;
    M = moment(s);
    drive(rig, M, s, ds);
    if (jumped) hair.settle(2.5);
    hair.step(ds, s, M.hit);
    if (pass === 0) continue;
    TRACKS.forEach(([, fn], i) => P[i].push(fn()));
    for (const k of Object.values(STRAND)) {
      const pts = hair.strands.pts;
      tipRel[k].push(chains.filter((c) => c.k === k).map((c) => {
        const a = c.o * 4, b = (c.o + c.n - 1) * 4;
        return [pts[b] - pts[a], pts[b + 1] - pts[a + 1], pts[b + 2] - pts[a + 2]] as V3;
      }));
    }
    skel.push(BONES.flatMap((n) => [rig.skinPoint(I[n], B[I[n]].head), rig.skinPoint(I[n], B[I[n]].tail)]).concat([M.beater.hand, M.beater.head]));
  }
  last = -1e9; // (the measured loop runs on from the warm one: no settle)
  last = story(LOOP - 1 / FPS);
}

// ---------------------------------------------------------------- derivatives (film time)
const n = frames;
const at = (arr: V3[], i: number) => arr[(i + n) % n];
const d1 = (arr: V3[]) => arr.map((_, i) => at(arr, i + 1).map((v, k) => (v - at(arr, i - 1)[k]) * FPS / 2) as V3);
const d2 = (arr: V3[]) => arr.map((_, i) => at(arr, i + 1).map((v, k) => (v - 2 * at(arr, i)[k] + at(arr, i - 1)[k]) * FPS * FPS) as V3);
const mag = (v: V3) => Math.hypot(v[0], v[1], v[2]);
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1]; };
const phaseAt = (t: number) => {
  const s = story(t);
  let best = STROKES[0], bd = 1e9;
  for (const k of STROKES) for (const w of [-STORY_LOOP, 0, STORY_LOOP]) { const d = s - (story(k.t) + w); if (Math.abs(d) < Math.abs(bd)) { bd = d; best = k; } }
  return `${best.big ? 'BIG' : 'stroke@' + best.t}${bd >= 0 ? '+' : ''}${bd.toFixed(3)}s(story)`;
};

const report: string[] = [];
const events: { name: string; f: number; a: number; med: number; jump: number }[] = [];
const series: { name: string; acc: number[]; vel: number[] }[] = [];
report.push(`frames ${n} @ ${FPS} fps, loop ${LOOP} s (story ${STORY_LOOP.toFixed(3)} s)`);
report.push('track        peak|v| m/s   peak|a| m/s²  (at t)     rms|a|   rms|jerk|   spikes(>4× local median & >3 m/s²)');
TRACKS.forEach(([name], i) => {
  const v = d1(P[i]), a = d2(P[i]);
  const am = a.map(mag), vm = v.map(mag);
  const jm = a.map((_, k) => mag(at(a, k + 1).map((x, j) => (x - at(a, k - 1)[j]) * FPS / 2) as V3));
  let pk = 0; am.forEach((x, k) => { if (x > am[pk]) pk = k; });
  let spikes = 0;
  am.forEach((x, k) => {
    const win: number[] = [];
    for (let d = -6; d <= 6; d++) if (Math.abs(d) > 1) win.push(am[(k + d + n) % n]);
    const med = median(win);
    if (x > 4 * med && x - med > 3) { spikes++; events.push({ name, f: k, a: x, med, jump: x - med }); }
  });
  const rms = (xs: number[]) => Math.sqrt(xs.reduce((s, x) => s + x * x, 0) / xs.length);
  report.push(`${name.padEnd(12)} ${Math.max(...vm).toFixed(2).padStart(8)}   ${am[pk].toFixed(1).padStart(10)}  (${(pk / FPS).toFixed(2)})  ${rms(am).toFixed(2).padStart(8)}  ${rms(jm).toFixed(0).padStart(9)}   ${spikes}`);
  series.push({ name, acc: am, vel: vm });
});
// the strands: their tips against their roots (the head's own motion taken out)
report.push('\nstrands: tip − root, film time');
report.push('kind        rms|a| m/s²   p99|a|   rms|jerk| m/s³');
for (const [kn, k] of Object.entries(STRAND)) {
  const per = tipRel[k];
  if (!per.length || !per[0].length) continue;
  const all: number[] = [], jerks: number[] = [];
  for (let c = 0; c < per[0].length; c++) {
    const tr = per.map((fr) => fr[c]);
    const a = d2(tr);
    a.forEach((x) => all.push(mag(x)));
    a.forEach((_, i) => jerks.push(mag(at(a, i + 1).map((x, j) => (x - at(a, i - 1)[j]) * FPS / 2) as V3)));
  }
  const rms = (xs: number[]) => Math.sqrt(xs.reduce((s, x) => s + x * x, 0) / xs.length);
  const p99 = [...all].sort((a, b) => a - b)[Math.floor(all.length * 0.99)];
  report.push(`${kn.padEnd(10)} ${rms(all).toFixed(2).padStart(10)}   ${p99.toFixed(2).padStart(7)}   ${rms(jerks).toFixed(0).padStart(9)}`);
  series.push({ name: `tips:${kn}`, acc: per.map((fr, i) => { let s = 0; fr.forEach((_, c) => { const tr = per; const a0 = tr[(i - 1 + n) % n][c], a1 = tr[i][c], a2 = tr[(i + 1) % n][c]; s += mag([0, 1, 2].map((j) => (a2[j] - 2 * a1[j] + a0[j]) * FPS * FPS) as V3); }); return s / fr.length; }), vel: [] });
}
// the worst spikes
events.sort((a, b) => b.jump - a.jump);
report.push('\nworst one-frame spikes (acceleration far above its neighbours: a jump in pose, a kink in velocity)');
const seen = new Set<string>();
for (const e of events) {
  const key = `${e.name}:${Math.round(e.f / 6)}`;
  if (seen.has(key)) continue;
  seen.add(key);
  report.push(`  ${e.name.padEnd(10)} t=${(e.f / FPS).toFixed(3)}  |a| ${e.a.toFixed(1)} vs ${e.med.toFixed(1)} around   ${phaseAt(e.f / FPS)}`);
  if (seen.size >= 40) break;
}
writeFileSync(`${OUT}/motion.txt`, report.join('\n') + '\n');
console.log(report.join('\n'));

// ---------------------------------------------------------------- pictures (a tiny PNG writer)
function png(w: number, h: number, rgb: Uint8Array, path: string) {
  const crcT = new Int32Array(256).map((_, k) => { let c = k; for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (b: Uint8Array) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (type: string, data: Uint8Array) => {
    const b = new Uint8Array(12 + data.length), dv = new DataView(b.buffer);
    dv.setUint32(0, data.length); b.set(Buffer.from(type), 4); b.set(data, 8); dv.setUint32(8 + data.length, crc(b.subarray(4, 8 + data.length)));
    return b;
  };
  const raw = new Uint8Array((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (w * 3 + 1) + 1);
  const ihdr = new Uint8Array(13); const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w); dv.setUint32(4, h); ihdr.set([8, 2, 0, 0, 0], 8);
  writeFileSync(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array())]));
}
class Canvas {
  px: Uint8Array;
  constructor(readonly w: number, readonly h: number, bg = [12, 10, 18]) { this.px = new Uint8Array(w * h * 3); for (let i = 0; i < w * h; i++) this.px.set(bg, i * 3); }
  dot(x: number, y: number, c: number[], a = 1) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const o = (y * this.w + x) * 3;
    for (let k = 0; k < 3; k++) this.px[o + k] = this.px[o + k] * (1 - a) + c[k] * a;
  }
  line(x0: number, y0: number, x1: number, y1: number, c: number[], a = 1) {
    const L = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let i = 0; i <= L; i++) this.dot(x0 + (x1 - x0) * i / L, y0 + (y1 - y0) * i / L, c, a);
  }
  save(p: string) { png(this.w, this.h, this.px, p); }
}
// the chart: each track's |a| over the loop (log scale), the strokes marked
{
  const W = 1560, rowH = 70, H = rowH * series.length + 30;
  const cv = new Canvas(W, H);
  const xOf = (f: number) => (f / n) * W;
  for (const k of STROKES) { const x = xOf(Math.round(k.t * FPS)); cv.line(x, 0, x, H, k.big ? [140, 60, 60] : [60, 60, 90]); }
  for (let s = 0; s <= LOOP; s++) cv.line(xOf(s * FPS), H - 30, xOf(s * FPS), H - 22, [120, 120, 120]);
  series.forEach((sr, r) => {
    const y0 = r * rowH + rowH - 4;
    cv.line(0, y0, W, y0, [40, 40, 50]);
    const yOf = (a: number) => y0 - Math.max(0, Math.log10(1 + a)) / 3.2 * (rowH - 8);
    for (let f = 1; f < sr.acc.length; f++) cv.line(xOf(f - 1), yOf(sr.acc[f - 1]), xOf(f), yOf(sr.acc[f]), [120 + (r * 47) % 135, 200, 160 + (r * 31) % 95]);
    // its name as a colour key: a short bar
    cv.line(4, y0 - rowH + 12, 4 + 8 * sr.name.length, y0 - rowH + 12, [230, 200, 120]);
  });
  cv.save(`${OUT}/accel.png`);
  writeFileSync(`${OUT}/accel-rows.txt`, series.map((s, i) => `${i}: ${s.name}`).join('\n') + '\n');
}
// onion skins: her seen from her right side (looking along -z: x right toward the drum, y up), a window of frames
function onion(name: string, t0: number, t1: number, every = 2) {
  const W = 900, H = 900, cx = 520, cy = 860, sc = 330;
  const cv = new Canvas(W, H);
  const X = (p: V3) => cx + (p[0]) * sc, Y = (p: V3) => cy - p[1] * sc;
  // the hide: a line at x = 0 from y = 0.21 to 1.91
  cv.line(X([0, 0, 0]), Y([0, 0.21, 0]), X([0, 0, 0]), Y([0, 1.91, 0]), [200, 120, 60]);
  cv.line(0, Y([0, 0, 0]), W, Y([0, 0, 0]), [60, 60, 70]);
  const f0 = Math.round(t0 * FPS), f1 = Math.round(t1 * FPS);
  for (let f = f0; f <= f1; f += every) {
    const k = (f - f0) / Math.max(1, f1 - f0);
    const sk = skel[(f + n) % n];
    const col = [80 + 175 * k, 120 + 60 * (1 - k), 255 - 175 * k];
    for (let b = 0; b < BONES.length; b++) cv.line(X(sk[b * 2]), Y(sk[b * 2]), X(sk[b * 2 + 1]), Y(sk[b * 2 + 1]), col, 0.35);
    const hand = sk[BONES.length * 2], head = sk[BONES.length * 2 + 1];
    cv.line(X(hand), Y(hand), X(head), Y(head), [255, 220, 120], 0.6);
    cv.dot(X(head), Y(head), [255, 255, 255]);
  }
  // the beater head's path, every frame, its dots spaced by its speed
  for (let f = f0; f <= f1; f++) { const sk = skel[(f + n) % n]; const h = sk[BONES.length * 2 + 1]; cv.dot(X(h), Y(h), [255, 90, 90]); }
  cv.save(`${OUT}/onion-${name}.png`);
}
if (argv.includes('--onion')) {
  onion('pulse', 0.2, 1.9, 2);
  onion('third', 3.9, 6.0, 2);
  onion('windup', 5.0, 8.4, 3);
  onion('big', 8.4, 11.0, 2);
  onion('after', 11.0, 24.0, 8);
}
void FROM; void TO;
