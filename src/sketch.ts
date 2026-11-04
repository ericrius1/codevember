// The harness every day's sketch runs in: the canvas, the clock, the HUD, the film beside the live piece, and render
// mode, which films the loop frame by frame.
//
// A sketch is a seamless loop: its frame function gets t in [0, loop) seconds and u = t / loop in [0, 1), and the frame
// at u = 1 must be the frame at u = 0. Live, t runs on the clock (Space pauses, a drag turns the view and lets it settle
// back). In render mode (?render, driven by tools/render.mjs) t steps exactly 1/fps a frame from 0, every frame is read
// back from the swapchain and posted raw to the dev server's film sink (vite.config.ts), which supersamples it down
// into an mp4 with the HUD laid over.
import { Capture, createKit, type Camera, type Kit, type RunEntry } from '@ericrius1/weft';
import './sketch.css';

export interface SketchMeta {
  day: number;
  title: string;
  /** seconds per loop */
  loop: number;
  /** a line under the title */
  note?: string;
  /** how to play with it (the HUD's second line) */
  hint?: string;
  /** whole loops run before filming starts (a stateful sketch's warm-up) */
  warm?: number;
  /** loops in the film (default: enough for ~15 s) */
  filmLoops?: number;
  /** the page and the HUD: background, text, accent */
  colors: { bg: string; fg: string; accent?: string };
}

export interface Ctx {
  kit: Kit;
  meta: SketchMeta;
  params: URLSearchParams;
  render: boolean;
  /** the view's turn from a drag, radians (settles back to 0 when let go; always 0 when filming) */
  orbit: { yaw: number; pitch: number };
  /** the pointer over the canvas: uv 0..1 (y down), held */
  pointer: { u: number; v: number; down: boolean };
  /** frames the camera so a square of the given vertical fov always fits, whatever the window's shape */
  fit(cam: Camera, fovDeg: number): void;
}

export interface FrameArgs { t: number; u: number; dt: number; frame: number }
export type FrameFn = (f: FrameArgs) => RunEntry[];

const pad = (n: number) => String(n).padStart(2, '0');

export async function sketch(meta: SketchMeta, setup: (ctx: Ctx) => Promise<FrameFn> | FrameFn) {
  const params = new URLSearchParams(location.search);
  const render = params.has('render');
  const fps = Number(params.get('fps') ?? 60);
  const ss = Number(params.get('ss') ?? 2);
  const root = document.documentElement;
  root.style.setProperty('--bg', meta.colors.bg);
  root.style.setProperty('--fg', meta.colors.fg);
  root.style.setProperty('--accent', meta.colors.accent ?? meta.colors.fg);
  document.title = `${pad(meta.day)} / ${meta.title} — Codevember 2026`;
  if (render) document.body.classList.add('render');

  const canvas = document.createElement('canvas');
  canvas.id = 'stage';
  document.body.append(canvas);
  const hud = buildHud(meta);

  let kit: Kit;
  try {
    kit = await createKit(canvas, { maxPixelRatio: render ? ss : 2 });
  } catch (e) {
    document.body.classList.add('nogpu');
    hud.setMode('film');
    hud.say(`This one needs WebGPU (${(e as Error).message}). Here's the film.`);
    return;
  }

  const orbit = { yaw: 0, pitch: 0 };
  const pointer = { u: 0.5, v: 0.5, down: false };
  const ctx: Ctx = {
    kit, meta, params, render, orbit, pointer,
    fit(cam, fovDeg) {
      const [w, h] = kit.size.render, aspect = w / h, half = Math.tan((fovDeg * Math.PI) / 360);
      cam.fovY = 2 * Math.atan(aspect < 1 ? half / aspect : half);
    },
  };
  if (!render) bindPointer(canvas, ctx);

  const frameFn = await setup(ctx);
  await kit.ready();

  let t = 0, n = 0, paused = false;
  // (?perf: stepped by hand like a film, for tools/perf.mjs to time)
  if (render || params.has('perf')) kit.manual = true;
  (window as any).__kit = kit;
  kit.loop(({ dt }) => {
    if (render) t = (n / fps) % meta.loop;
    else if (params.has('u')) t = Number(params.get('u')) * meta.loop;
    else {
      if (!paused) t = (t + dt) % meta.loop;
      // let a turned view settle back
      if (!pointer.down) { const k = 1 - Math.exp(-dt * 1.6); orbit.yaw -= orbit.yaw * k; orbit.pitch -= orbit.pitch * k; }
    }
    n++;
    kit.run(frameFn({ t, u: t / meta.loop, dt: render ? 1 / fps : dt, frame: n }));
  });

  addEventListener('keydown', (e) => {
    if (e.code === 'Space') { paused = !paused; e.preventDefault(); }
    if (e.key === 'f') hud.setMode(hud.mode === 'film' ? 'live' : 'film');
  });
  document.body.classList.add('ready');

  if (render) await film(kit, meta, fps, Number(params.get('size') ?? 1080), () => n, (k) => (n = k));
}

// ---------------------------------------------------------------- render mode
async function film(kit: Kit, meta: SketchMeta, fps: number, size: number, getN: () => number, setN: (n: number) => void) {
  const name = new URLSearchParams(location.search).get('name') ?? pad(meta.day);
  const post = (path: string, body?: BodyInit) => fetch(`/__render/${path}`, { method: 'POST', body }).then((r) => { if (!r.ok) throw new Error(`${path}: ${r.status}`); return r; });
  const status = (s: string) => ((window as any).__render = { ...(window as any).__render, status: s });
  const cap = new Capture(kit);
  const perLoop = Math.round(meta.loop * fps);
  // stills at the given phases (u, comma separated), for a look without filming
  const stills = new URLSearchParams(location.search).get('stills');
  if (stills) {
    const us = stills.split(',').map(Number);
    for (let k = 0; k < us.length; k++) {
      setN(Math.round(us[k] * perLoop));
      const img = await cap.step(1 / fps);
      const c = new OffscreenCanvas(img.width, img.height);
      c.getContext('2d')!.putImageData(img, 0, 0);
      await post(`still?name=${name}&i=${k}`, await c.convertToBlob({ type: 'image/png' }));
    }
    (window as any).__render = { status: 'done', stills: us.length };
    return;
  }
  // warm-up loops (whole ones, so the film still starts at u = 0)
  setN(0);
  for (let i = 0; i < (meta.warm ?? 0) * perLoop; i++) { kit.step(1 / fps); if (i % 30 === 0) await kit.queue.onSubmittedWorkDone(); }
  setN((meta.warm ?? 0) * perLoop);
  const loops = meta.filmLoops ?? Math.max(1, Math.round(15 / meta.loop));
  const total = loops * perLoop;
  await document.fonts.ready;
  await post(`hud?name=${name}`, await hudPng(meta, size));
  const [w, h] = kit.size.canvas;
  await post(`start?name=${name}&w=${w}&h=${h}&fps=${fps}&size=${size}`);
  const t0 = performance.now();
  for (let i = 0; i < total; i++) {
    const img = await cap.step(1 / fps);
    await post('frame', img.data);
    if (i % 30 === 0) status(`frame ${i}/${total}`);
  }
  const r = await (await post('end')).json();
  (window as any).__render = { status: 'done', out: r.out, code: r.code, frames: total, seconds: (performance.now() - t0) / 1000, getN };
}

/** the film's HUD: the title top left, the address bottom left, as a transparent PNG the size of the film */
async function hudPng(meta: SketchMeta, size: number): Promise<Blob> {
  const c = new OffscreenCanvas(size, size), g = c.getContext('2d')!;
  const s = size / 1080, m = 44 * s;
  g.fillStyle = meta.colors.fg;
  g.textBaseline = 'top';
  g.font = `500 ${17 * s}px "IBM Plex Mono", ui-monospace, monospace`;
  g.globalAlpha = 0.86;
  spaced(g, `CODEVEMBER 2026 / ${pad(meta.day)} / ${meta.title.toUpperCase()}`, m, m, 1.6 * s);
  g.globalAlpha = 0.5;
  g.font = `400 ${14 * s}px "IBM Plex Mono", ui-monospace, monospace`;
  g.textBaseline = 'alphabetic';
  spaced(g, 'ericlevin.dev/codevember', m, size - m, 0.6 * s);
  return c.convertToBlob({ type: 'image/png' });
}
function spaced(g: OffscreenCanvasRenderingContext2D, text: string, x: number, y: number, track: number) {
  for (const ch of text) { g.fillText(ch, x, y); x += g.measureText(ch).width + track; }
}

// ---------------------------------------------------------------- the page
function bindPointer(canvas: HTMLCanvasElement, ctx: Ctx) {
  let last: [number, number] | null = null;
  canvas.addEventListener('pointerdown', (e) => { last = [e.clientX, e.clientY]; ctx.pointer.down = true; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    ctx.pointer.u = (e.clientX - r.left) / r.width;
    ctx.pointer.v = (e.clientY - r.top) / r.height;
    if (!last) return;
    const k = 3.2 / Math.min(r.width, r.height);
    ctx.orbit.yaw -= (e.clientX - last[0]) * k;
    ctx.orbit.pitch = Math.max(-0.6, Math.min(0.5, ctx.orbit.pitch + (e.clientY - last[1]) * k));
    last = [e.clientX, e.clientY];
  });
  const up = () => { last = null; ctx.pointer.down = false; };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
}

interface Film { id: string; video: string; poster: string }
function buildHud(meta: SketchMeta) {
  const el = document.createElement('div');
  el.className = 'hud';
  el.innerHTML = `
    <div class="tl">
      <div class="title"><a href="../">CODEVEMBER 2026</a> / ${pad(meta.day)} / ${meta.title.toUpperCase()}</div>
      <div class="hint">${meta.hint ?? 'Drag to turn · Space to pause'}</div>
    </div>
    <div class="tr">
      <div class="seg" role="tablist">
        <button data-mode="live" class="on">Live</button><button data-mode="film" disabled>Film</button>
      </div>
    </div>
    <div class="bl">${meta.note ? `<span>${meta.note}</span>` : ''}</div>
    <div class="br"><a href="../">All days</a></div>
    <div class="msg"></div>`;
  document.body.append(el);
  const video = document.createElement('video');
  Object.assign(video, { loop: true, muted: true, playsInline: true, preload: 'none' });
  video.className = 'film';
  document.body.append(video);
  const buttons = [...el.querySelectorAll<HTMLButtonElement>('.seg button')];
  const api = {
    mode: 'live' as 'live' | 'film',
    setMode(m: 'live' | 'film') {
      api.mode = m;
      document.body.classList.toggle('filming', m === 'film');
      for (const b of buttons) b.classList.toggle('on', b.dataset.mode === m);
      if (m === 'film' && video.src) video.play().catch(() => {}); else video.pause();
    },
    say(s: string) { const m = el.querySelector('.msg')!; m.textContent = s; m.classList.add('on'); },
  };
  for (const b of buttons) b.addEventListener('click', () => api.setMode(b.dataset.mode as 'live' | 'film'));
  // the film, if it's been posted (public/footage/footage.json: id is the day)
  fetch(`${import.meta.env.BASE_URL}footage/footage.json`).then((r) => r.json()).then((list: Film[]) => {
    const f = list.find((x) => x.id === pad(meta.day));
    if (!f) return;
    video.src = f.video;
    video.poster = f.poster;
    buttons[1].disabled = false;
    if (api.mode === 'film') video.play().catch(() => {});
  }).catch(() => {});
  if (new URLSearchParams(location.search).get('mode') === 'film') api.setMode('film');
  return api;
}
