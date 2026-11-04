# Codevember 2026

A sketch a day through November, in pure WebGPU on [weft](https://github.com/ericrius1/weft) (not loom). Each one is a
seamless loop, live in the browser and filmed for sharing. **[ericlevin.dev/codevember](https://www.ericlevin.dev/codevember/)**

```bash
npm install
npm run dev                      # http://localhost:5190/codevember/  (a day: /codevember/04/)
npm run typecheck
node tools/render.mjs 04         # the film: film/04.mp4, 1080×1080, 60 fps, 2× supersampled
node tools/render.mjs 04 --stills 0,0.25,0.5,0.75   # stills at those phases + film/04-sheet.png, for a look
npm run deploy                   # build and deploy (tools/deploy.sh)
```

## A day

```
src/days.ts      ← every day's title, sentence, loop length and colours (the gallery and the day's page read it)
04/index.html    the page (copy one)
04/main.ts       sketch(day(4), setup): setup builds the passes once and returns the frame function
04/*.wgsl        its shaders (#include "weft/frame", "weft/fullscreen", "weft/output"…)
```

`sketch()` (src/sketch.ts) is the harness: the canvas, the HUD (title, Live / Film), a drag that turns the view and
lets it settle back (`ctx.orbit`), Space to pause, `f` for the film, and render mode. The frame function gets `t` in
`[0, loop)` seconds and `u = t / loop`: **the frame at u = 1 must be the frame at u = 0**. Anything periodic in u closes
the loop; a stateful simulation sets `warm` (whole loops run before filming) and has to come back round by itself.
`ctx.fit(cam, fov)` keeps a square of that fov in view whatever the window's shape (the films are square). `?u=0.3`
freezes the clock at a phase; `?debug` (or backquote) is weft's overlay, with sliders from the WGSL `@range`s.

box3d.js (isaac-mason) and pmndrs/math are fair game when a day wants physics or the maths.

## The films

`tools/render.mjs` starts a dev server of its own (no reloads, so editing while it films can't break it) and opens the
day in headless Chrome (WebGPU on Metal, muted) at `?render`: the loop is stepped exactly 1/fps a frame from u = 0,
each frame read back from the swapchain at 2× (weft's `Capture`) and posted raw to the server's film sink
(vite.config.ts), which pipes it into ffmpeg: lanczos down to 1080×1080, the HUD laid over (a PNG the page draws in
its own fonts), x264 `-preset slow -crf 15` (capped at 18 Mbit/s), `+faststart`. Square at 1080 for X; a 16 s loop
is ~20–35 MB.

Posting one, so the gallery tile and the day's Film tab play it (they look it up in footage.json by the day, `--id 04`):

```bash
node ~/codeprojects/footage/publish.mjs film/04.mp4 --id 04 --title "04 / Gyre" --sub "…" --poster-at 4
```

Then commit `public/footage/footage.json` and deploy. The films live on R2 (the footage standard,
~/codeprojects/footage), never in git or the deploy; `/codevember/footage/` is the footage page.

## Deploying

`tools/deploy.sh` builds into `deploy/vercel/codevember/` and deploys it as the `codevember` Vercel project, its files
under `/codevember/`; the portfolio (PortfolioII's vercel.json) rewrites `ericlevin.dev/codevember/*` to it.
