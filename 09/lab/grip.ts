// The beater held by her real hand: the grip and the shaft fixed in her right hand's bone (from a frame where it's
// where it's asked), against the stroke's planned grip and shaft, frame by frame — how far the beater would be from
// the hand if placed from the plan, and where.
//   node 09/lab/run.mjs 09/lab/grip.ts [--step 0.25]
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadHero } from '../../src/rig/hero/asset';
import { HeroRig } from '../../src/rig/hero/rig';
import { fitHands } from '../../src/rig/town/hands';
import * as solve from '../../src/rig/body/solve';
import { moment, drive, BEATER } from '../perform';
import { story, LOOP } from '../score';
import { GripHold, aimAt } from '../grip';
const argv = process.argv.slice(2);
const flag = (k: string, d: string) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1]; };
const STEP = Number(flag('step', '0.25'));
const netFetch = globalThis.fetch;
globalThis.fetch = (async (u: RequestInfo | URL) => { const s = String(u); return s.startsWith('file:') ? new Response(readFileSync(fileURLToPath(s))) : netFetch(u); }) as typeof fetch;
HeroRig.bodyKit = solve; HeroRig.armContinuity = true; HeroRig.armSpring = 30;
const asset = await loadHero(pathToFileURL('09/assets/shaman_hi.bin.gz').href);
fitHands(asset);
const rig = new HeroRig(asset); rig.female = true;
const hold = new GripHold(rig);
let last = -1, worst = 0, worstT = 0;
for (let pass = 0; pass < 2; pass++) for (let n = 0; n < LOOP * 60; n++) {
  const t = n / 60, s = story(t);
  const ds = last < 0 ? 1 / 60 : Math.max(1e-5, s - last); last = s;
  const M = moment(s); drive(rig, M, s, ds);
  if (!hold.calibrated && pass === 0 && t >= 0.3) hold.calibrate(M.beater);
  if (!hold.calibrated) continue;
  const g = hold.place(M.beater, aimAt(M.beater.since));
  if (pass === 0) continue;
  const e = Math.hypot(...[0, 1, 2].map((k) => g.planErr[k]));
  const he = Math.hypot(...[0, 1, 2].map((k) => g.head[k] - M.beater.head[k]));
  if (e > worst) { worst = e; worstT = t; }
  if (Math.abs(t / STEP - Math.round(t / STEP)) < 1e-6) console.log(`${t.toFixed(2).padStart(6)} ${M.beater.phase.padEnd(8)} plan→hand ${(e * 100).toFixed(1).padStart(5)} cm   head off plan ${(he * 100).toFixed(1).padStart(5)} cm`);
}
console.log(`worst plan→hand ${(worst * 100).toFixed(1)} cm at ${worstT.toFixed(2)}`);
void BEATER;
