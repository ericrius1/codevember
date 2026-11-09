// Films a day's loop: node tools/render.mjs 04 [--size 1080] [--aspect 16:9] [--ss 2] [--fps 60] [--stills 0,0.25,0.5] [--q 'k=v&…'] [--tag x]
// Headless Chrome (WebGPU on Metal or D3D12, muted) opens the day in render mode on a dev server of its own, which steps the
// loop exactly 1/fps a frame from u = 0, reads every frame back from the swapchain at size × ss and posts it raw to
// the server's film sink (vite.config.ts): ffmpeg scales it down (lanczos), lays the HUD over and writes
// film/<day>.mp4. --stills writes film/<day>-still-<i>.png at those phases
// instead, and a contact sheet of them, film/<day>-sheet.png.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, renameSync } from 'node:fs';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const flag = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1]; };
const day = argv.find((a, i) => /^\d\d$/.test(a) && !argv[i - 1]?.startsWith('--'));
if (!day) { console.error('usage: node tools/render.mjs <day, e.g. 04> [--size 1080] [--ss 2] [--fps 60] [--stills 0,0.5]'); process.exit(1); }
const size = Number(flag('size', 1080)), ss = Number(flag('ss', 2)), fps = Number(flag('fps', 60)), stills = flag('stills', null);
// (--tag: the outputs named film/<day><tag>… — renders running side by side don't overwrite each other)
const name = day + (flag('tag', '') ?? '').replace(/[^\w.-]/g, '');
// its own dev server, without reloads (RENDER=1, vite.config.ts), on a port of its own
const PORT = Number(process.env.RENDER_PORT ?? 5191 + Math.floor(Math.random() * 200));
const ORIGIN = `http://localhost:${PORT}`;
// (vite's own script under this node, not node_modules/.bin's shell shim: the same on macOS and Windows)
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'ignore', env: { ...process.env, RENDER: '1', PORT: String(PORT) } });
process.on('exit', () => server.kill());
const up = () => fetch(`${ORIGIN}/codevember/`).then((r) => r.ok).catch(() => false);
for (let i = 0; i < 120 && !(await up()); i++) await new Promise((r) => setTimeout(r, 250));

const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--mute-audio', '--enable-unsafe-webgpu', '--enable-gpu', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : []), '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
// (--aspect w:h: the frame that shape, its height the size — 16:9 at 1080 is 1920×1080; square by default)
const [aw, ah] = (flag('aspect', '1:1') ?? '1:1').split(':').map(Number);
const width = Math.round((size * aw) / ah / 2) * 2;
const page = await browser.newPage({ viewport: { width, height: size }, deviceScaleFactor: ss });
await page.addInitScript(() => { let seed = 902026; Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; });
page.on('pageerror', (e) => console.error('page:', e.stack ?? e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.error(`page ${m.type()}:`, m.text()); });
const q = new URLSearchParams({ render: '', size: String(size), ss: String(ss), fps: String(fps), name });
if (stills) q.set('stills', stills);
if (argv.includes('--hud')) q.set('hud', '1');
// (--q 'a=1&b=2': more of the page's own parameters, a debug camera say)
for (const [k, v] of new URLSearchParams(flag('q', ''))) q.set(k, v);
await page.goto(`${ORIGIN}/codevember/${day}/?${q}`);
const t0 = Date.now();
let last = '';
for (;;) {
  const r = await page.evaluate(() => window.__render ?? null);
  if (r?.status === 'done') {
    if (r.code) throw new Error(`ffmpeg failed: ${r.code}`);
    if (r.out) console.log(`${r.out}: ${r.frames} frames in ${r.seconds.toFixed(0)} s (ffmpeg ${r.code})`);
    else console.log(`${r.stills} stills`);
    break;
  }
  if (r?.status && r.status !== last) { last = r.status; process.stdout.write(`\r${last}   `); }
  if (Date.now() - t0 > 3 * 3600e3) throw new Error('timed out');
  await new Promise((ok) => setTimeout(ok, 1000));
}
await browser.close();
server.kill();
// the day's sound (film/<day>.wav, one loop long, made by the day's own tools): laid under the film, AAC
const soundtrack = flag('audio', `film/${day}.wav`);
if (!stills && existsSync(soundtrack)) {
  const out = `film/${name}.mp4`, tmp = `film/${name}.av.mp4`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', out, '-stream_loop', '-1', '-i', soundtrack, '-map', '0:v', '-map', '1:a',
    '-c:v', 'copy', '-bsf:v', 'h264_metadata=sample_aspect_ratio=1/1:video_full_range_flag=0:colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', tmp]);
  renameSync(tmp, out);
  console.log(`${out}: with ${soundtrack}`);
}
if (stills && stills.split(',').length > 1) {
  const n = stills.split(',').length, cols = Math.min(n, 4);
  const ins = Array.from({ length: n }, (_, i) => ['-i', `film/${name}-still-${i}.png`]).flat();
  const tw = Math.round((540 * aw) / ah / 2) * 2;
  const tiles = Array.from({ length: n }, (_, i) => `[${i}:v]scale=${tw}:540:flags=lanczos[s${i}]`).join(';');
  const lay = Array.from({ length: n }, (_, i) => `${(i % cols) * tw}_${Math.floor(i / cols) * 540}`).join('|');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...ins, '-filter_complex', `${tiles};${Array.from({ length: n }, (_, i) => `[s${i}]`).join('')}xstack=inputs=${n}:layout=${lay}`, `film/${name}-sheet.png`]);
  console.log(`film/${name}-sheet.png`);
}
