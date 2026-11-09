// One arm frame by frame over a window: the hand's goal, the elbow and hand as solved, the elbow's acceleration.
//   node 09/lab/run.mjs 09/lab/elbow.ts [--side L] [--from 2.7 --to 3.0]
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadHero } from '../../src/rig/hero/asset';
import { HeroRig } from '../../src/rig/hero/rig';
import { fitHands } from '../../src/rig/town/hands';
import * as solve from '../../src/rig/body/solve';
import type { V3 } from '../../src/rig/hero/math';
import { moment, drive } from '../perform';
import { story } from '../score';
const argv = process.argv.slice(2);
const flag = (k: string, d: string) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1]; };
const SIDE = flag('side', 'L'), FROM = Number(flag('from', '2.7')), TO = Number(flag('to', '3.0'));
const netFetch = globalThis.fetch;
globalThis.fetch = (async (u: RequestInfo | URL) => { const s = String(u); return s.startsWith('file:') ? new Response(readFileSync(fileURLToPath(s))) : netFetch(u); }) as typeof fetch;
HeroRig.bodyKit = solve; HeroRig.armContinuity = true; HeroRig.armSpring = 30;
const asset = await loadHero(pathToFileURL('09/assets/shaman_hi.bin.gz').href);
fitHands(asset);
const rig = new HeroRig(asset); rig.female = true;
const B = asset.bones, I = asset.index;
const P = (n: string) => rig.skinPoint(I[n], B[I[n]].head);
const f = (v: V3) => v.map((x) => x.toFixed(3).padStart(7)).join('');
let last = -1; const E: V3[] = [];
for (let n = Math.round((FROM - 1) * 60); n <= Math.round(TO * 60); n++) {
  const t = n / 60, s = story(t);
  const ds = last < 0 ? 1 / 60 : Math.max(1e-5, s - last); last = s;
  const M = moment(s); drive(rig, M, s, ds);
  const el = P(flag('bone', 'farm' + SIDE)); E.push(el);
  if (t < FROM) continue;
  const k = E.length - 1, a = k >= 2 ? Math.hypot(...[0, 1, 2].map((j) => (E[k][j] - 2 * E[k - 1][j] + E[k - 2][j]) * 3600)) : 0;
  const g = M.goal.hands[SIDE === 'L' ? 0 : 1].goal as any;
  console.log(`${t.toFixed(3)}  goal${f(g.palm)}  elbow${f(el)}  hand${f(P('hand' + SIDE))}  shoulder${f(P('uarm' + SIDE))}  |a|${a.toFixed(0).padStart(5)}`);
}
