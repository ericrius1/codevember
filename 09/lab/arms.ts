// How far each arm reaches against its length, and the elbow's bend, through the loop — where an arm's at full stretch
// its fit is singular and the elbow kinks; and the left hand's goal against where the hand really got to.
//   node 09/lab/run.mjs 09/lab/arms.ts [--from 0 --to 6 --step 0.05]
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
const FROM = Number(flag('from', '0')), TO = Number(flag('to', '6')), STEP = Number(flag('step', '0.05'));
const netFetch = globalThis.fetch;
globalThis.fetch = (async (u: RequestInfo | URL) => { const s = String(u); return s.startsWith('file:') ? new Response(readFileSync(fileURLToPath(s))) : netFetch(u); }) as typeof fetch;
HeroRig.bodyKit = solve; HeroRig.armContinuity = true; HeroRig.armSpring = 30;
const asset = await loadHero(pathToFileURL('09/assets/shaman_hi.bin.gz').href);
fitHands(asset);
const rig = new HeroRig(asset); rig.female = true;
const B = asset.bones, I = asset.index;
const P = (n: string) => rig.skinPoint(I[n], B[I[n]].head);
const d = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const f = (x: number) => x.toFixed(2).padStart(6);
let last = -1;
console.log('   t   | L reach  bend°  goalErr | R reach  bend° | pelvisY  chestX');
for (let t = Math.max(0, FROM - 1); t <= TO + 1e-9; t += 1 / 60) {
  const s = story(t);
  const ds = last < 0 ? 1 / 60 : Math.max(1e-5, s - last); last = s;
  const M = moment(s);
  drive(rig, M, s, ds);
  if (t < FROM || Math.abs(t / STEP - Math.round(t / STEP)) > 1e-3) continue;
  const row = [] as string[];
  for (const side of ['L', 'R']) {
    const sh = P('uarm' + side), el = P('farm' + side), ha = P('hand' + side);
    const L = d(sh, el) + d(el, ha), r = d(sh, ha) / L;
    const a: V3 = [sh[0] - el[0], sh[1] - el[1], sh[2] - el[2]], b: V3 = [ha[0] - el[0], ha[1] - el[1], ha[2] - el[2]];
    const ang = Math.acos((a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (Math.hypot(...a) * Math.hypot(...b))) * 180 / Math.PI;
    row.push(`${f(r)} ${f(180 - ang)}`);
    if (side === 'L') { const g = (M.goal.hands[0].goal as any).palm as V3; row.push(f(d(g, ha))); }
  }
  console.log(`${t.toFixed(2).padStart(6)} | ${row[0]} ${row[1]}  | ${row[2]}  | ${f(P('pelvis')[1])} ${f(P('chest')[0])}`);
}
