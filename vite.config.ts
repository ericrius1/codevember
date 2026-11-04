import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { weft } from '@ericrius1/weft/vite';

// Codevember: the gallery (index.html), a page per day (01/ … 30/, each its own sketch), and the footage page
// (public/footage, the films on R2). Served at ericlevin.dev/codevember/ (the portfolio rewrites it here).
const root = import.meta.dirname;
const days = readdirSync(root).filter((d) => /^\d\d$/.test(d) && existsSync(join(root, d, 'index.html')));

// The film sink: a page in render mode (?render) posts raw RGBA frames here and they go straight into ffmpeg, no
// files in between: supersampled frames scaled down (lanczos) to the film's size, the HUD laid over, x264.
//   POST /__render/hud?name=      the HUD, a transparent PNG at the film's size
//   POST /__render/start?name=&w=&h=&fps=&size=
//   POST /__render/frame          one frame, w*h*4 bytes, top row first
//   POST /__render/end            → { out }
function renderSink(): Plugin {
  const dir = resolve(root, 'film');
  let ff: ChildProcess | null = null, done: Promise<number> | null = null, out = '';
  const body = (req: IncomingMessage) => new Promise<Buffer>((ok) => { const c: Buffer[] = []; req.on('data', (b) => c.push(b)); req.on('end', () => ok(Buffer.concat(c))); });
  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const q = (k: string) => url.searchParams.get(k) ?? '';
    const name = q('name').replace(/[^\w.-]/g, '') || 'film';
    mkdirSync(dir, { recursive: true });
    const hud = join(dir, `${name}-hud.png`);
    if (url.pathname === '/still') { writeFileSync(join(dir, `${name}-still-${q('i')}.png`), await body(req)); res.end('ok'); return; }
    if (url.pathname === '/hud') { writeFileSync(hud, await body(req)); res.end('ok'); return; }
    if (url.pathname === '/start') {
      const [w, h, fps, size] = ['w', 'h', 'fps', 'size'].map((k) => Number(q(k)));
      out = join(dir, `${name}.mp4`);
      const hasHud = existsSync(hud);
      const filter = `[0:v]scale=${size}:${size}:flags=lanczos+accurate_rnd+full_chroma_int,format=rgba[v]` +
        (hasHud ? `;[v][1:v]overlay=0:0:format=auto,format=yuv420p[o]` : `;[v]format=yuv420p[o]`);
      ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${h}`, '-r', String(fps), '-i', '-',
        ...(hasHud ? ['-i', hud] : []), '-filter_complex', filter, '-map', '[o]',
        '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-maxrate', '18M', '-bufsize', '36M', '-profile:v', 'high', '-tune', 'film',
        '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
      done = new Promise((ok) => ff!.on('close', (c) => ok(c ?? 1)));
      res.end('ok');
      return;
    }
    if (url.pathname === '/frame') {
      const b = await body(req);
      if (!ff?.stdin) { res.statusCode = 409; res.end('not started'); return; }
      if (!ff.stdin.write(b)) await new Promise((ok) => ff!.stdin!.once('drain', ok));
      res.end('ok');
      return;
    }
    if (url.pathname === '/end') {
      ff?.stdin?.end();
      const code = await done;
      ff = null;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ out, code }));
      return;
    }
    res.statusCode = 404; res.end();
  };
  return {
    name: 'codevember-render-sink',
    configureServer(server) { server.middlewares.use('/__render', (req, res) => { if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; } handle(req, res); }); },
  };
}

export default defineConfig({
  base: '/codevember/',
  plugins: [weft(), renderSink()],
  // (tools/render.mjs runs its own server with RENDER=1: no reloads, so editing while a film renders can't break it)
  server: process.env.RENDER ? { port: Number(process.env.PORT), strictPort: true, hmr: false, watch: null } : { port: Number(process.env.PORT ?? 5190) },
  build: {
    target: 'esnext',
    rollupOptions: { input: Object.fromEntries([['main', resolve(root, 'index.html')], ...days.map((d) => [d, resolve(root, d, 'index.html')])]) },
  },
});
