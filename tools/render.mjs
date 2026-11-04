// Films a day's loop: node tools/render.mjs 04 [--size 1080] [--ss 2] [--fps 60] [--stills 0,0.25,0.5]
// Headless Chrome (WebGPU on Metal, muted) opens the day in render mode on a dev server of its own, which steps the
// loop exactly 1/fps a frame from u = 0, reads every frame back from the swapchain at size × ss and posts it raw to
// the server's film sink (vite.config.ts): ffmpeg scales it down (lanczos), lays the HUD over and writes
// film/<day>.mp4. --stills writes film/<day>-still-<i>.png at those phases
// instead, and a contact sheet of them, film/<day>-sheet.png.
import { spawn, execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const flag = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1]; };
const day = argv.find((a, i) => /^\d\d$/.test(a) && !argv[i - 1]?.startsWith('--'));
if (!day) { console.error('usage: node tools/render.mjs <day, e.g. 04> [--size 1080] [--ss 2] [--fps 60] [--stills 0,0.5]'); process.exit(1); }
const size = Number(flag('size', 1080)), ss = Number(flag('ss', 2)), fps = Number(flag('fps', 60)), stills = flag('stills', null);
// its own dev server, without reloads (RENDER=1, vite.config.ts), on a port of its own
const PORT = Number(process.env.RENDER_PORT ?? 5191 + Math.floor(Math.random() * 200));
const ORIGIN = `http://localhost:${PORT}`;
const server = spawn('node_modules/.bin/vite', [], { stdio: 'ignore', env: { ...process.env, RENDER: '1', PORT: String(PORT) } });
process.on('exit', () => server.kill());
const up = () => fetch(`${ORIGIN}/codevember/`).then((r) => r.ok).catch(() => false);
for (let i = 0; i < 120 && !(await up()); i++) await new Promise((r) => setTimeout(r, 250));

const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--mute-audio', '--enable-unsafe-webgpu', '--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: ss });
page.on('pageerror', (e) => console.error('page:', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.error(`page ${m.type()}:`, m.text()); });
const q = new URLSearchParams({ render: '', size: String(size), ss: String(ss), fps: String(fps), name: day });
if (stills) q.set('stills', stills);
await page.goto(`${ORIGIN}/codevember/${day}/?${q}`);
const t0 = Date.now();
let last = '';
for (;;) {
  const r = await page.evaluate(() => window.__render ?? null);
  if (r?.status === 'done') {
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
if (stills && stills.split(',').length > 1) {
  const n = stills.split(',').length, cols = Math.min(n, 4);
  const ins = Array.from({ length: n }, (_, i) => ['-i', `film/${day}-still-${i}.png`]).flat();
  const tiles = Array.from({ length: n }, (_, i) => `[${i}:v]scale=540:540:flags=lanczos[s${i}]`).join(';');
  const lay = Array.from({ length: n }, (_, i) => `${(i % cols) * 540}_${Math.floor(i / cols) * 540}`).join('|');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...ins, '-filter_complex', `${tiles};${Array.from({ length: n }, (_, i) => `[s${i}]`).join('')}xstack=inputs=${n}:layout=${lay}`, `film/${day}-sheet.png`]);
  console.log(`film/${day}-sheet.png`);
}
