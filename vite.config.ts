import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { WebSocketServer } from 'ws';
import { weft } from '@ericrius1/weft/vite';

// Codevember: the gallery (index.html), a page per day (01/ … 30/, each its own sketch), and the footage page
// (public/footage, the films on R2). Served at ericlevin.dev/codevember/ (the portfolio rewrites it here).
const root = import.meta.dirname;
const days = readdirSync(root).filter((d) => /^\d\d$/.test(d) && existsSync(join(root, d, 'index.html')));

// The film sink: a page in render mode (?render) posts raw RGBA frames here and they go straight into ffmpeg, no
// files in between: supersampled frames scaled down (lanczos) to the film's size, the HUD laid over, x264.
//   POST /__render/hud?name=      the HUD, a transparent PNG at the film's size
//   POST /__render/start?name=&w=&h=&fps=&size=[&hdr=1]   (hdr: the frames 16-bit RGB, w*h*6 bytes, an HLG signal in
//                                 BT.2020 → 10-bit HEVC)
//   WS   /__render/frames         the frames, each a binary message of w*h*4 bytes, top row first, answered 'ok' once
//                                 ffmpeg has taken it (a fetch POST of one 2160² frame takes over a second in Chrome;
//                                 a WebSocket message, a few tens of ms)
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
      const hasHud = q('hud') === '1' && existsSync(hud);
      // (the film's height is its size; its width follows the frame's own shape — square, or 16:9 with render.mjs --aspect)
      const outW = Math.round((size * w) / h / 2) * 2;
      const gop = String(Math.round(fps * 2));
      if (q('hdr') === '1') {
        // an HDR film: the frames come as 16-bit RGB already the HLG signal in BT.2020 (the sketch's last pass); 10-bit
        // HEVC, tagged so, hvc1 for Apple's players
        ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb48le', '-s', `${w}x${h}`, '-r', String(fps), '-i', '-',
          '-vf', `scale=${outW}:${size}:flags=lanczos+accurate_rnd+full_chroma_int:out_color_matrix=bt2020:out_range=tv,setsar=1,format=yuv420p10le`,
          '-c:v', 'libx265', '-preset', 'slow', '-crf', '17', '-maxrate', '14M', '-bufsize', '28M', '-tag:v', 'hvc1',
          '-x265-params', `colorprim=bt2020:transfer=arib-std-b67:colormatrix=bt2020nc:range=limited:repeat-headers=1:keyint=${gop}:min-keyint=${gop}:scenecut=0:log-level=error`,
          '-color_range', 'tv', '-colorspace', 'bt2020nc', '-color_primaries', 'bt2020', '-color_trc', 'arib-std-b67', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
      } else {
        const filter = `[0:v]scale=${outW}:${size}:flags=lanczos+accurate_rnd+full_chroma_int,setsar=1,format=rgba[v]` +
          (hasHud ? `;[v][1:v]overlay=0:0:format=auto,format=yuv420p[o]` : `;[v]format=yuv420p[o]`);
        ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${h}`, '-r', String(fps), '-i', '-',
          ...(hasHud ? ['-i', hud] : []), '-filter_complex', filter, '-map', '[o]',
          '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-maxrate', '18M', '-bufsize', '36M', '-profile:v', 'high', '-tune', 'film',
          '-g', gop, '-keyint_min', gop, '-sc_threshold', '0', '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
      }
      done = new Promise((ok) => ff!.on('close', (c) => ok(c ?? 1)));
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
    configureServer(server) {
      server.middlewares.use('/__render', (req, res) => { if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; } handle(req, res); });
      const wss = new WebSocketServer({ noServer: true, maxPayload: 512 << 20 });
      wss.on('connection', (ws) => ws.on('message', async (data: Buffer) => {
        if (!ff?.stdin) { ws.send('not started'); return; }
        if (!ff.stdin.write(data)) await new Promise((ok) => ff!.stdin!.once('drain', ok));
        ws.send('ok');
      }));
      server.httpServer?.on('upgrade', (req, socket, head) => {
        if (req.url?.endsWith('/__render/frames')) wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
      });
    },
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
