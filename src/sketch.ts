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
  /** how to play with it (the HUD's second line) */
  hint?: string;
  /** whole loops run before filming starts (a stateful sketch's warm-up) */
  warm?: number;
  /** loops in the film (default: enough for ~15 s) */
  filmLoops?: number;
  /** the page and the HUD: background, text, accent */
  colors: { bg: string; fg: string; accent?: string };
  /** the loop's sound (a file exactly one loop long): a Sound button in the HUD, and while it plays the loop's clock
   *  is the sound's, so the picture keeps time with it; the film plays it too */
  audio?: string;
  /** the film's id on the footage page (public/footage/footage.json), if not the day's own number */
  filmId?: string;
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

  // (no WebGPU, or the piece couldn't be built on this GPU — a phone's smaller limits: the film instead, its Begin
  // playing it, so the threshold never hangs on "Loading")
  const filmInstead = (e: unknown) => {
    console.error(e);
    if (render) throw e;
    document.body.classList.add('nogpu');
    hud.setMode('film');
    hud.say(`This one needs WebGPU (${(e as Error)?.message ?? e}). Here's the film.`);
    hud.begin(async () => { hud.started = true; setTimeout(() => hud.hush(), 4000); await hud.playFilm(); });
    hud.sound((on) => { hud.film.muted = !on; });
  };
  let kit: Kit;
  try {
    // (an HDR film, ?render&hdr: a float canvas whatever the display, its frames read back at 16 bits a channel)
    kit = await createKit(canvas, { maxPixelRatio: render ? ss : 2, ...(render && params.has('hdr') ? { hdr: 'force' as const } : {}) });
  } catch (e) { filmInstead(e); return; }

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

  let frameFn: FrameFn;
  try {
    frameFn = await setup(ctx);
    await kit.ready();
  } catch (e) { canvas.remove(); filmInstead(e); return; }

  let t = 0, n = 0, paused = false;
  const sound = meta.audio && !render && !params.has('perf') ? new Audio(meta.audio) : null;
  const controlled = render || params.has('perf') || params.has('u');
  let begun = !sound || controlled, previewDrawn = false, drawnSize = '';
  const playSound = () => {
    if (!sound || !hud.soundOn || paused || !begun || hud.mode !== 'live') return Promise.resolve();
    sound.currentTime = t % meta.loop;
    return sound.play();
  };
  if (sound) {
    sound.loop = true; sound.preload = 'auto'; sound.className = 'sketch-audio';
    document.body.append(sound);
    hud.soundState(true);
    hud.sound((on) => {
      hud.film.muted = !on;
      if (!on) sound.pause();
      else playSound().catch(() => { hud.soundState(false); hud.say('Sound could not start. Tap Sound to try again.'); });
    });
    if (!controlled) hud.begin(async () => {
      t = 0; n = 0; paused = false; begun = true; hud.started = true;
      if (hud.mode === 'film') await hud.playFilm(); else await playSound();
    });
  }
  hud.onModeChange = (mode) => {
    sound?.pause();
    if (mode === 'live') playSound().catch(() => hud.soundState(false));
  };
  if (render || params.has('perf')) kit.manual = true;
  (window as any).__kit = kit;
  kit.loop(({ dt }) => {
    const frameSize = kit.size.render.join('x');
    if (!controlled && (!begun || paused || hud.mode === 'film')) {
      // One quiet preview; the performance and simulation wait for the user's gesture.
      if (hud.mode === 'live' && (!previewDrawn || drawnSize !== frameSize)) {
        const heldTime = begun ? t : 0.65;
        kit.run(frameFn({ t: heldTime, u: heldTime / meta.loop, dt: 0, frame: n }));
        previewDrawn = true; drawnSize = frameSize;
      }
      return;
    }
    if (render) t = (n / fps) % meta.loop;
    else if (params.has('u')) t = Number(params.get('u')) * meta.loop;
    else {
      if (sound && hud.soundOn) {
        // Buffering freezes picture with audio instead of allowing the clocks to drift.
        if (sound.readyState < 2 || sound.paused) return;
        // (the picture's clock follows the sound's smoothly: an audio element's currentTime moves in uneven steps and
        // now and then a hair backwards, which the world's physics feel as jolts — a lock of hair snapping back to
        // rest. So it runs on the frame clock, eased toward the sound's time, never back; it jumps with the sound only
        // when they're far apart: a seek, a stall)
        const at = sound.currentTime % meta.loop;
        let err = at - t;
        if (err > meta.loop / 2) err -= meta.loop; else if (err < -meta.loop / 2) err += meta.loop;
        t = Math.abs(err) > 0.25 ? at : (t + Math.max(0, dt + err * Math.min(1, dt * 4))) % meta.loop;
      } else t = (t + dt) % meta.loop;
      if (!pointer.down) { const k = 1 - Math.exp(-dt * 1.6); orbit.yaw -= orbit.yaw * k; orbit.pitch -= orbit.pitch * k; }
    }
    n++;
    kit.run(frameFn({ t, u: t / meta.loop, dt: render ? 1 / fps : dt, frame: n }));
    previewDrawn = true; drawnSize = frameSize;
  });

  addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement)?.closest('button, select, input, textarea, [contenteditable]')) return;
    if (e.code === 'Space' && begun) {
      e.preventDefault();
      if (hud.mode === 'film') { if (hud.film.paused) hud.film.play().catch(() => {}); else hud.film.pause(); return; }
      paused = !paused;
      if (paused) sound?.pause(); else playSound().catch(() => hud.soundState(false));
    }
    if (e.key === 'f' && hud.film.getAttribute('src')) hud.setMode(hud.mode === 'film' ? 'live' : 'film');
  });
  document.body.classList.add('ready');

  if (render) await film(kit, meta, fps, Number(params.get('size') ?? 1080), (k) => (n = k));
}

// ---------------------------------------------------------------- render mode
async function film(kit: Kit, meta: SketchMeta, fps: number, size: number, setN: (n: number) => void) {
  const name = new URLSearchParams(location.search).get('name') ?? pad(meta.day);
  const post = (path: string, body?: BodyInit) => fetch(`/__render/${path}`, { method: 'POST', body }).then((r) => { if (!r.ok) throw new Error(`${path}: ${r.status}`); return r; });
  const status = (s: string) => ((window as any).__render = { ...(window as any).__render, status: s });
  const cap = new Capture(kit);
  const perLoop = Math.round(meta.loop * fps);
  // stills at the given phases (u, comma separated), for a look without filming
  const stills = new URLSearchParams(location.search).get('stills');
  if (stills) {
    const us = stills.split(',').map(Number);
    // (lead=<s>: the frames before each still stepped first, uncaptured — what a stateful sketch's simulation needs to
    // be where the film would have it)
    const lead = Math.round(Number(new URLSearchParams(location.search).get('lead') ?? 0) * fps);
    for (let k = 0; k < us.length; k++) {
      const at = Math.round(us[k] * perLoop);
      if (lead > 0) {
        setN(Math.max(0, at - lead));
        for (let i = 0; i < Math.min(lead, at); i++) { kit.step(1 / fps); if (i % 30 === 0) await kit.queue.onSubmittedWorkDone(); }
      }
      setN(at);
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
  // (the HUD is hidden when filming, so nothing on the page has asked for its font yet; and its @font-face rules
  // arrive with the stylesheet's @import, which may not have yet)
  const withHud = new URLSearchParams(location.search).get('hud') === '1';
  if (withHud) {
    for (let i = 0; i < 200 && ![...document.fonts].some((f) => f.family.includes('IBM Plex Mono')); i++) await new Promise((r) => setTimeout(r, 25));
    await Promise.all(['500 17px "IBM Plex Mono"', '400 14px "IBM Plex Mono"'].map((f) => document.fonts.load(f)));
    await post(`hud?name=${name}`, await hudPng(meta, size));
  }
  const [w, h] = kit.size.canvas;
  // (an HDR film: the sketch's last pass writes the HLG signal, BT.2020, to the float canvas; each frame goes to the
  // sink as 16-bit RGB)
  const hdr = new URLSearchParams(location.search).has('hdr');
  if (hdr && !kit.hdr.enabled) throw new Error('no float canvas here: an HDR film needs one');
  await post(`start?name=${name}&w=${w}&h=${h}&fps=${fps}&size=${size}&hud=${withHud ? 1 : 0}&hdr=${hdr ? 1 : 0}`);
  const ws = new WebSocket(`${location.origin.replace(/^http/, 'ws')}/__render/frames`);
  ws.binaryType = 'arraybuffer';
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });
  const sent = () => new Promise<void>((ok, no) => { ws.onmessage = (e) => (e.data === 'ok' ? ok() : no(new Error(String(e.data)))); });
  const t0 = performance.now();
  for (let i = 0; i < total; i++) {
    const data = hdr ? await stepHdr(kit, 1 / fps) : (await cap.step(1 / fps)).data;
    const ack = sent();
    ws.send(data);
    await ack;
    if (i % 30 === 0) status(`frame ${i}/${total}`);
  }
  ws.close();
  const r = await (await post('end')).json();
  (window as any).__render = { status: 'done', out: r.out, code: r.code, frames: total, seconds: (performance.now() - t0) / 1000 };
}

/** one frame stepped by hand and read back from the float canvas as 16-bit RGB (rgb48le), top row first: the signal as
 *  the last pass wrote it, 0..1 */
let halfTo16: Uint16Array | null = null;
async function stepHdr(kit: Kit, dt: number): Promise<Uint16Array> {
  if (!halfTo16) {
    halfTo16 = new Uint16Array(65536);
    for (let i = 0; i < 65536; i++) {
      const e = (i >> 10) & 31, m = i & 1023;
      const v = i & 0x8000 ? 0 : e === 0 ? m * 2 ** -24 : e === 31 ? (m ? 0 : 1) : (1 + m / 1024) * 2 ** (e - 15);
      halfTo16[i] = Math.round(Math.min(1, v) * 65535);
    }
  }
  kit.step(dt);
  const tex = kit.context.getCurrentTexture();
  const w = tex.width, h = tex.height, row = Math.ceil((w * 8) / 256) * 256;
  const buf = kit.device.createBuffer({ label: 'capture.hdr', size: row * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const enc = kit.device.createCommandEncoder({ label: 'capture.hdr' });
  enc.copyTextureToBuffer({ texture: tex }, { buffer: buf, bytesPerRow: row }, [w, h]);
  kit.queue.submit([enc.finish()]);
  await buf.mapAsync(GPUMapMode.READ);
  const src = new Uint16Array(buf.getMappedRange()), out = new Uint16Array(w * h * 3), t = halfTo16;
  for (let y = 0, d = 0; y < h; y++) {
    for (let x = 0, q = (y * row) / 2; x < w; x++, q += 4) { out[d++] = t[src[q]]; out[d++] = t[src[q + 1]]; out[d++] = t[src[q + 2]]; }
  }
  buf.unmap();
  buf.destroy();
  return out;
}

/** the film's HUD: the title top left, the address bottom left, as a transparent PNG the size of the film */
async function hudPng(meta: SketchMeta, size: number): Promise<Blob> {
  // (a canvas in the document: an OffscreenCanvas doesn't see the page's web fonts)
  const c = document.createElement('canvas'), g = c.getContext('2d')!;
  c.width = c.height = size;
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
  return new Promise<Blob>((ok) => c.toBlob((b) => ok(b!), 'image/png'));
}
function spaced(g: CanvasRenderingContext2D, text: string, x: number, y: number, track: number) {
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

interface Film { id: string; video: string; small?: string | null; poster: string }
function buildHud(meta: SketchMeta) {
  const el = document.createElement('div');
  el.className = 'hud';
  el.innerHTML = `
    <div class="tl">
      <div class="title"><a href="../">CODEVEMBER 2026</a> / ${pad(meta.day)} / ${meta.title.toUpperCase()}</div>
      <div class="hint">${meta.hint ?? 'Drag to turn · Space to pause'}</div>
    </div>
    <div class="tr">
      ${meta.audio ? '<button class="sound" aria-pressed="false" hidden>Sound</button>' : ''}
      <div class="seg" role="tablist">
        <button data-mode="live" class="on">Live</button><button data-mode="film" disabled>Film</button>
      </div>
    </div>
    <div class="br"><a href="../">All days</a></div>
    <div class="msg"></div>`;
  document.body.append(el);
  // the way in: a day with sound waits at its threshold for a gesture (browsers won't play sound before one) — only the
  // day's name and a drum of a button rippling slowly; struck, it ripples out over the whole page and opens on the
  // piece, starting from its beginning with its sound
  const gate = document.createElement('div'); gate.className = 'begin-gate';
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  gate.innerHTML = `
    <div class="begin-card">
      <div class="begin-kicker">Codevember 2026 <span>·</span> ${pad(meta.day)}</div>
      <h1 class="begin-title">${esc(meta.title)}</h1>
      <button class="begin-drum" disabled aria-label="Begin"><i class="ring"></i><i class="ring"></i><i class="ring"></i><span class="begin-label">Loading</span></button>
    </div>`;
  const showGate = !!meta.audio && !['render', 'perf', 'u'].some((k) => new URLSearchParams(location.search).has(k));
  if (showGate) { document.body.append(gate); document.body.classList.add('gated'); }
  const video = document.createElement('video');
  Object.assign(video, { loop: true, muted: true, playsInline: true, preload: 'none' });
  video.className = 'film';
  document.body.append(video);
  const buttons = [...el.querySelectorAll<HTMLButtonElement>('.seg button')];
  const soundBtn = el.querySelector<HTMLButtonElement>('.sound');
  let filmLoaded = (_ok: boolean) => {};
  const api = {
    film: video,
    /** resolves once the film's posted (true) or known not to be (false) */
    filmReady: new Promise<boolean>((r) => (filmLoaded = r)),
    soundOn: !!meta.audio,
    started: !showGate,
    onModeChange: (_mode: 'live' | 'film') => {},
    begin(cb: () => Promise<void>) {
      const button = gate.querySelector<HTMLButtonElement>('.begin-drum')!;
      const label = button.querySelector('.begin-label')!;
      button.disabled = false; label.textContent = 'Begin';
      button.addEventListener('click', () => {
        if (button.disabled) return;
        button.disabled = true;
        // (struck: its ripple runs out over the page as the threshold fades and the piece comes up — at once, whatever
        // the sound does: a phone may refuse it or be slow to load it, and Begin must never just sit there. The
        // sound's play() is called inside this tap, before anything's awaited, or iOS counts it as no gesture)
        gate.classList.add('leaving'); document.body.classList.remove('gated');
        setTimeout(() => gate.remove(), 1400);
        cb().catch((e) => {
          console.error(e);
          api.soundState(false); api.say('Sound could not start. Tap Sound to try again.');
          setTimeout(() => api.hush(), 5000);
        });
      });
    },
    /** the film from where it is, with sound if it's on and allowed, else muted (a phone always lets a muted film
     *  play); play() is called before anything's awaited when the film's already listed, so a tap counts */
    async playFilm() {
      if (!video.getAttribute('src') && !(await api.filmReady)) throw new Error('no film');
      video.muted = !api.soundOn;
      try { await video.play(); } catch (e) {
        if (video.muted) throw e;
        api.soundState(false); await video.play();
        api.say('Tap Sound for sound.'); setTimeout(() => api.hush(), 4000);
      }
    },
    /** the Sound button: shown, calling back with on/off */
    sound(cb: (on: boolean) => void) {
      if (!soundBtn) return;
      soundBtn.hidden = false;
      soundBtn.addEventListener('click', () => { api.soundState(!api.soundOn); cb(api.soundOn); });
    },
    soundState(on: boolean) {
      api.soundOn = on; video.muted = !on;
      soundBtn?.classList.toggle('on', on); soundBtn?.setAttribute('aria-pressed', String(on));
      if (soundBtn) soundBtn.textContent = on ? 'Sound on' : 'Sound off';
    },
    mode: 'live' as 'live' | 'film',
    setMode(m: 'live' | 'film') {
      api.mode = m;
      document.body.classList.toggle('filming', m === 'film');
      for (const b of buttons) b.classList.toggle('on', b.dataset.mode === m);
      if (m === 'film' && video.src && api.started) video.play().catch(() => {}); else video.pause();
      api.onModeChange(m);
    },
    say(s: string) { const m = el.querySelector('.msg')!; m.textContent = s; m.classList.add('on'); },
    hush() { el.querySelector('.msg')!.classList.remove('on'); },
  };
  for (const b of buttons) b.addEventListener('click', () => api.setMode(b.dataset.mode as 'live' | 'film'));
  // the film, if it's been posted (public/footage/footage.json: id is the day)
  fetch(`${import.meta.env.BASE_URL}footage/footage.json`).then((r) => r.json()).then((list: Film[]) => {
    const f = list.find((x) => x.id === (meta.filmId ?? pad(meta.day)));
    if (!f) return filmLoaded(false);
    // (a phone gets the lighter copy)
    video.src = f.small && matchMedia('(max-width: 900px), (pointer: coarse)').matches ? f.small : f.video;
    video.poster = f.poster;
    buttons[1].disabled = false;
    if (api.mode === 'film' && api.started) video.play().catch(() => {});
    filmLoaded(true);
  }).catch(() => filmLoaded(false));
  api.soundState(api.soundOn);
  if (new URLSearchParams(location.search).get('mode') === 'film') api.setMode('film');
  return api;
}
