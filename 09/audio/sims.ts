// 09 / Membrane, the simulations run once: each strike of the hide (and the universe's membrane) is simulated in a
// worker of its own, all at once, and kept in .cache/ under a hash of membrane.ts and what was asked of it, so a render
// after a change to the mix doesn't simulate anything again.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';

const DIR = new URL('./.cache/', import.meta.url);
const SRC = readFileSync(new URL('./membrane.ts', import.meta.url), 'utf8');

export type Arrays = Record<string, Float32Array>;
export interface Result { meta: Record<string, unknown>; a: Arrays }

/** a job: what to run (strike, universe, felt), its spec; its key hashes the code, the spec and any signals in it */
export interface Job { kind: 'strike' | 'universe' | 'felt'; spec: unknown }
export function keyOf(j: Job) {
  const h = createHash('sha1').update(SRC).update(j.kind);
  h.update(JSON.stringify(j.spec, (_k, v) => (v instanceof Float32Array ? `f32:${v.length}` : v)));
  const walk = (v: unknown) => {
    if (v instanceof Float32Array) h.update(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(j.spec);
  return `${j.kind}-${h.digest('hex').slice(0, 16)}`;
}

export function save(path: URL, meta: Record<string, unknown>, a: Arrays) {
  const names = Object.keys(a), head = Buffer.from(JSON.stringify({ meta, arrays: names.map((n) => [n, a[n].length]) }));
  const len = Buffer.alloc(4); len.writeUInt32LE(head.length);
  writeFileSync(path, Buffer.concat([len, head, ...names.map((n) => Buffer.from(a[n].buffer, a[n].byteOffset, a[n].byteLength))]));
}
export function load(path: URL): Result {
  const b = readFileSync(path), hl = b.readUInt32LE(0), head = JSON.parse(b.subarray(4, 4 + hl).toString());
  let o = 4 + hl;
  const a: Arrays = {};
  for (const [n, len] of head.arrays as [string, number][]) {
    const f = new Float32Array(len);
    new Uint8Array(f.buffer).set(b.subarray(o, o + len * 4)); o += len * 4;
    a[n] = f;
  }
  return { meta: head.meta, a };
}

/** run the jobs not yet cached in parallel workers; every job's result, in order */
export async function run(jobs: Job[], log = (s: string) => console.log(s)): Promise<Result[]> {
  mkdirSync(DIR, { recursive: true });
  const paths = jobs.map((j) => new URL(`${keyOf(j)}.bin`, DIR));
  const todo = jobs.map((j, i) => ({ j, i })).filter(({ i }) => !existsSync(paths[i]));
  const lanes = Math.max(1, Math.min(todo.length, availableParallelism() - 1));
  let next = 0;
  const lane = async () => {
    while (next < todo.length) {
      const { j, i } = todo[next++];
      const t0 = performance.now();
      await new Promise<void>((res, rej) => {
        const w = new Worker(new URL('./worker.ts', import.meta.url), { workerData: { job: j, path: paths[i].href } });
        w.once('message', () => res());
        w.once('error', rej);
        w.once('exit', (c) => { if (c !== 0) rej(new Error(`worker exited ${c}`)); });
      });
      log(`  simulated ${keyOf(j)} in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
    }
  };
  await Promise.all(Array.from({ length: lanes }, lane));
  return paths.map(load);
}
