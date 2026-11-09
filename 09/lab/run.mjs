// Bundles a lab script (esbuild: the shaders as text) and runs it in node:
//   node 09/lab/run.mjs [script.ts, default 09/lab/motion.ts] [its flags]
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { basename } from 'node:path';

const args = process.argv.slice(2);
const entry = args[0]?.endsWith('.ts') ? args.shift() : '09/lab/motion.ts';
mkdirSync('node_modules/.cache/lab', { recursive: true });
const out = `node_modules/.cache/lab/${basename(entry, '.ts')}.mjs`;
await build({
  entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', target: 'node22', outfile: out,
  loader: { '.wgsl': 'text' }, logLevel: 'warning', external: ['node:*'],
});
const r = spawnSync(process.execPath, [out, ...args], { stdio: 'inherit' });
process.exit(r.status ?? 1);
