// The camera after the great stroke, checked without the GPU: held on the struck point, drawn back a little, then the
// flight in — past her left side and onto the hide's axis, into the glass — never jumping a frame, never inside her
// (her posed bones, as the film poses her, with room for her regalia), the beater, the drum's shell or the ground,
// never past the hide's face; and time coming back toward its own pace as it flies in.
//   node 09/lab/run.mjs 09/lab/camera.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadHero } from '../../src/rig/hero/asset';
import { HeroRig } from '../../src/rig/hero/rig';
import { fitHands } from '../../src/rig/town/hands';
import * as solve from '../../src/rig/body/solve';
import type { V3 } from '../../src/rig/hero/math';
import { shot, ORBIT } from '../camera';
import { rate, LOOP, ACT, BIG, story } from '../score';
import { moment, drive } from '../perform';
import { STYLE } from '../style';

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
const B = asset.bones;

const segDist = (p: V3, a: V3, b: V3) => {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const u = Math.max(0, Math.min(1, (ab[0] * ap[0] + ab[1] * ap[1] + ab[2] * ap[2]) / Math.max(1e-9, ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2)));
  return Math.hypot(ap[0] - ab[0] * u, ap[1] - ab[1] * u, ap[2] - ab[2] * u);
};
const drag = { yaw: 0, pitch: 0 };
const O = [0, 1.06, 0];
const FPS = 60, GO = BIG.t + STYLE.fly.go, IN = BIG.t + STYLE.fly.in;
let prev: number[] | null = null, lastStep = 0, maxJump = 0, minHer = Infinity, herAt = 0, herBone = '', minBeater = Infinity, minY = Infinity;
let maxX = -Infinity, minShell = Infinity, maxRate = 0, endRate = 0;
let lastS = -1;
for (let f = 0; f <= Math.round(ACT.fade * FPS); f++) {
  const t = f / FPS, s = story(t);
  const M = moment(s);
  drive(rig, M, s, lastS < 0 ? 1 / FPS : Math.max(1e-5, s - lastS));
  lastS = s;
  if (process.env.JOINTS && [13.5, 14.5, 15.5, 16.0, 16.5, 17.0, 17.5, 18.5, 20.5].some((x) => Math.abs(x - t) < 0.5 / FPS)) {
    const j = (n: string, end: 'head' | 'tail' = 'head') => rig.skinPoint(asset.index[n], B[asset.index[n]][end]).map((v) => +v.toFixed(2));
    console.log(t.toFixed(1), 'eye', shot(t, drag).eye.map((v) => +v.toFixed(2)), 'uarmL', j('uarmL'), j('uarmL', 'tail'), 'handL', j('handL'), j('handL', 'tail'), 'head', j('head', 'tail'), 'chest', j('chest'), 'handR', j('handR'), 'beater', M.beater.head.map((v) => +v.toFixed(2)));
  }
  if (t < ORBIT.pull - 1) continue;
  const e = shot(t, drag).eye as V3;
  if (prev) {
    const st = Math.hypot(e[0] - prev[0], e[1] - prev[1], e[2] - prev[2]);
    // (a jump: a frame's step far off the one before it — the speed itself may be anything smooth)
    if (lastStep > 0.002) maxJump = Math.max(maxJump, Math.abs(st - lastStep));
    lastStep = st;
  }
  prev = e;
  if (t < ORBIT.pull + 1) continue;
  // her: every bone (the legs too), the regalia standing off her by up to ~0.18 m
  for (let i = 0; i < B.length; i++) {
    const a = rig.skinPoint(i, B[i].head), b = rig.skinPoint(i, B[i].tail);
    const d = segDist(e, a, b);
    if (d < minHer) { minHer = d; herAt = t; herBone = B[i].name; }
  }
  minBeater = Math.min(minBeater, segDist(e, M.beater.hand, M.beater.head));
  minY = Math.min(minY, e[1]);
  // the drum: in front of the hide's face, and clear of its shell's rim (radius 0.85 + its lap and lacing) where it's
  // near enough the hide's plane to meet it
  maxX = Math.max(maxX, e[0]);
  const rr = Math.hypot(e[1] - O[1], e[2] - O[2]);
  if (e[0] > -0.15) minShell = Math.min(minShell, Math.abs(rr - 0.9));
  if (t >= GO) { maxRate = Math.max(maxRate, rate(t)); endRate = rate(t); }
}
const at = (t: number) => shot(t, drag).eye.map((v) => +v.toFixed(3));
console.log(JSON.stringify({ LOOP, GO, IN, pulledBack: at(GO), flownIn: at(IN), minHer: +minHer.toFixed(3), herAt: +herAt.toFixed(2), herBone,
  minBeater: +minBeater.toFixed(3), minY: +minY.toFixed(3), maxX: +maxX.toFixed(3), minShell: +minShell.toFixed(3), maxJump, endRate }, null, 2));
assert(minHer > 0.3, 'clear of her bones by 0.3 m (room for her regalia)');
assert(minBeater > 0.25, 'clear of the beater');
assert(minY > 0.9, 'above the summit');
assert(maxX < -0.05, 'never through the hide: held in front of its face');
assert(minShell > 0.08, 'clear of the drum shell\'s rim');
assert(Math.hypot(at(IN)[0], at(IN)[1] - O[1], at(IN)[2]) < 0.12, 'at the glass by the flight\'s end');
assert(maxJump < 0.004, 'no frame jumps (a frame\'s step never far off the last)');
assert(endRate > 0.8 && maxRate < 0.86, 'time back to near its own pace by the fade');
