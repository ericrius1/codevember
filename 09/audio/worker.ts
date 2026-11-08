// 09 / Membrane, one simulation in a worker of its own (sims.ts hands it the job and where to keep the result).
import { parentPort, workerData } from 'node:worker_threads';
import { strike, universe, feltFor, type StrikeSpec, type UniverseSpec } from './membrane.ts';
import { save } from './sims.ts';

const { job, path } = workerData as { job: { kind: string; spec: unknown }; path: string };
const url = new URL(path);
if (job.kind === 'strike') {
  const r = strike(job.spec as StrikeSpec);
  save(url, { sr: r.sr, contact: r.contact, courant: r.courant },
    { frontL: r.front[0], frontR: r.front[1], back: r.back, pick1: r.pick[0], pick2: r.pick[1], force: r.force });
} else if (job.kind === 'universe') {
  const r = universe(job.spec as UniverseSpec);
  save(url, { sr: r.sr, courant: r.courant }, { p0: r.pick[0], p1: r.pick[1], p2: r.pick[2], p3: r.pick[3], acc: r.acc });
} else if (job.kind === 'felt') {
  const s = job.spec as { ms: number; v: number; at: [number, number] };
  save(url, { K: feltFor(s.ms, s.v, s.at) }, {});
}
parentPort!.postMessage('done');
