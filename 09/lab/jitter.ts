// The live page's shake, measured: her pose and strands run on uneven frame times (a live page's, `--dt` pattern) and
// on an even 240 Hz clock, the same film time span; at each live frame, how far each track's velocity strays from the
// even run's at that moment (rms, m/s) — a shake the film (even 1/60 steps) never shows.
//
//   node 09/lab/run.mjs 09/lab/jitter.ts [--from 2 --to 9] [--fps 45] [--spread 0.35]
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadHero } from '../../src/rig/hero/asset';
import { HeroRig } from '../../src/rig/hero/rig';
import { fitHands } from '../../src/rig/town/hands';
import * as solve from '../../src/rig/body/solve';
import type { V3 } from '../../src/rig/hero/math';
import { moment, drive } from '../perform';
import { story } from '../score';
import { Hair, STRAND } from '../hair';

const argv = process.argv.slice(2);
const flag = (k: string, d: string) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1]; };
const FROM = Number(flag('from', '1')), TO = Number(flag('to', '9'));
const FPS = Number(flag('fps', '45')), SPREAD = Number(flag('spread', '0.35'));

const netFetch = globalThis.fetch;
globalThis.fetch = (async (u: RequestInfo | URL) => {
  const s = String(u);
  return s.startsWith('file:') ? new Response(readFileSync(fileURLToPath(s))) : netFetch(u);
}) as typeof fetch;
HeroRig.bodyKit = solve;
HeroRig.armContinuity = true; HeroRig.armSpring = 30;
const asset = await loadHero(pathToFileURL('09/assets/shaman_hi.bin.gz').href);
fitHands(asset);
const B = asset.bones, I = asset.index;

/** one run over [FROM, TO] at the given film times: each track's positions at each of `at` */
function run(times: number[], at: Set<number>) {
  const rig = new HeroRig(asset); rig.female = true;
  const hair = new Hair(rig);
  const joint = (n: string, end: 'head' | 'tail' = 'head') => () => rig.skinPoint(I[n], B[I[n]][end]);
  const tips = (k: number) => () => {
    const pts = hair.strands.pts; let x = 0, y = 0, z = 0, c = 0;
    hair.kinds.forEach((kk, ch) => { if (kk !== k) return; const o = (hair.strands.start(ch) + hair.specs[ch].n - 1) * 4; x += pts[o]; y += pts[o + 1]; z += pts[o + 2]; c++; });
    return [x / c, y / c, z / c] as V3;
  };
  const lockTip0 = () => { const ch = hair.kinds.indexOf(STRAND.lock); const pts = hair.strands.pts, o = (hair.strands.start(ch) + hair.specs[ch].n - 1) * 4; return [pts[o], pts[o + 1], pts[o + 2]] as V3; };
  const TR: [string, () => V3][] = [['clavL', joint('clavL', 'tail')], ['clavR', joint('clavR', 'tail')], ['uarmL', joint('uarmL', 'tail')],
    ['uarmR', joint('uarmR', 'tail')], ['neck', joint('neck')], ['head', joint('head', 'tail')], ['chest', joint('chest')],
    ['locks(mean tip)', tips(STRAND.lock)], ['one lock tip', lockTip0], ['sash tip', tips(STRAND.sash)]];
  const out = new Map<number, V3[]>();
  let last = -1;
  for (const t of times) {
    const s = story(t);
    const ds = last < 0 ? 1e-5 : Math.max(1e-5, s - last);
    const M = moment(s);
    drive(rig, M, s, ds);
    if (last < 0) hair.settle(2.5);
    hair.step(ds, s, M.hit);
    last = s;
    if (at.has(t)) out.set(t, TR.map(([, f]) => f()));
  }
  return { names: TR.map(([n]) => n), out };
}

// the live frame times: uneven around 1/FPS (a seeded spread), a long frame now and then
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const live: number[] = [];
for (let t = FROM - 1; t < TO; ) { live.push(t); t += (1 / FPS) * (1 + SPREAD * (2 * rnd() - 1)) * (rnd() < 0.03 ? 2.5 : 1); }
const liveRun = run(live, new Set(live));
// the even run at the same moments: 240 Hz plus each live moment
const even = [...new Set([...Array.from({ length: Math.ceil((TO - FROM + 1) * 240) }, (_, i) => FROM - 1 + i / 240), ...live])].sort((a, b) => a - b);
const evenRun = run(even, new Set(live));
const evenFixed = (() => { const ts: number[] = []; for (let t = FROM - 1; t < TO; t += 1 / 60) ts.push(t); return { ts, r: run(ts, new Set(ts)) }; })();

const vel = (r: Map<number, V3[]>, ts: number[], k: number) => ts.slice(1).map((t, i) => { const a = r.get(ts[i])![k], b = r.get(t)![k], dt = t - ts[i]; return [(b[0] - a[0]) / dt, (b[1] - a[1]) / dt, (b[2] - a[2]) / dt] as V3; });
const meas = live.filter((t) => t >= FROM);
const fixedMeas = evenFixed.ts.filter((t) => t >= FROM);
console.log(`live: ${meas.length} frames over ${FROM}..${TO} s at ~${FPS} fps ±${SPREAD * 100}%; rms velocity error (m/s) against an even 240 Hz run, and the film's own (even 1/60) for scale:`);
console.log('track               live-vs-even   pos err (mm)   film 1/60 frame-to-frame accel rms   live accel rms');
liveRun.names.forEach((n, k) => {
  const vl = vel(liveRun.out, meas, k), ve = vel(evenRun.out, meas, k);
  const err = Math.sqrt(vl.reduce((a, v, i) => a + (v[0] - ve[i][0]) ** 2 + (v[1] - ve[i][1]) ** 2 + (v[2] - ve[i][2]) ** 2, 0) / vl.length);
  const perr = Math.sqrt(meas.reduce((a, t) => { const p = liveRun.out.get(t)![k], q = evenRun.out.get(t)![k]; return a + (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2; }, 0) / meas.length) * 1000;
  const acc = (v: V3[], ts: number[]) => Math.sqrt(v.slice(1).reduce((a, x, i) => { const dt = (ts[i + 2] - ts[i]) / 2; return a + ((x[0] - v[i][0]) / dt) ** 2 + ((x[1] - v[i][1]) / dt) ** 2 + ((x[2] - v[i][2]) / dt) ** 2; }, 0) / (v.length - 1));
  const af = acc(vel(evenFixed.r.out, fixedMeas, k), fixedMeas), al = acc(vl, meas);
  console.log(`${n.padEnd(20)}${err.toFixed(3).padStart(10)}   ${perr.toFixed(2).padStart(10)}   ${af.toFixed(1).padStart(22)}   ${al.toFixed(1).padStart(18)}`);
});
