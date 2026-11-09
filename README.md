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

## People, rigs and sound

A day can have people in it. `src/rig` is Boulder's character runtime, lifted (its HeroRig: the whole-body solver,
the arm fit, finger IK, verlet chains, the face): a person is built in Blender by Boulder's town pipeline from a spec
in the day's folder (09/character: `zsh 09/character/build.sh` → `09/assets/<who>_{hi,lo}.bin.gz`), loaded with
`loadHero` and posed each frame by a `BodyGoal`. Beside it, `src/rig/strike.ts` (a stroke planner for anything swung
at a surface: the whip of a downswing, contact, the rebound, the kinetic chain's phases, a hammer grip's hand goal),
`src/rig/strands.ts` (strands rooted on bones: locks, bead strings, cords) and `src/rig/track.ts` (quintic keyed
tracks), all also in Boulder. `HeroRig.armContinuity` keeps an elbow from flipping frame to frame, and
`HeroRig.armSpring` (rad/s) makes its swivel follow the best one as a critically damped spring, so its speed never
changes in a frame. 09/grip.ts holds the beater in the hand the rig really posed (fixed in the hand bone, turned onto
the stroke's plan only round contact), so it never floats off the fingers where an arm can't reach its goal.
`node 09/lab/run.mjs` measures a day's motion for jerk without the GPU (and `09/lab/{arms,elbow,beat,grip}.ts`: reach
and bend, one joint frame by frame, the beater's plan, the grip's error). Skinning in
WGSL is weft's (`#include "weft/skin"`).

A day with sound opens at its threshold (src/sketch.ts buildHud, src/sketch.css `.begin-*`): the day's number, its
name, its sentence over a darkened still of the piece, a round Begin button rippling slowly (the day's accent), the
day's tellings to choose from, Sound on. Begin (the gesture a browser needs before it plays sound) bursts a ring out
over the page and starts the piece from zero with its sound; the HUD comes up after. Sound can be muted; Space pauses.
The picture follows the audio clock, including buffering. Switching Live / Film pauses the other audio source.

`--q 'cam=x,y,z,tx,ty,tz,fov'` (render.mjs) passes the page parameters through: 09 takes a fixed camera, for looking,
and `veil=0..1` / `trip=0..1` to hold the hide's thinning and the trip (the world inside the drum, 09/inner.wgsl;
`inner=1` shows only that world wherever the hide's thinned). A
stateful sketch's stills want `--q 'lead=3'`: each still's last 3 s stepped first, uncaptured, so its simulations (09's
hide) are where the film would have them. 09/design holds its look references (`node 09/design/refs.mjs`: Codex's
image generation, handed the concepts and a frame of the film); `refs.mjs realm,realm_mid,realm_near` paints the other
realm's three layers (a deep scene, two of glowing things on black), saved as 09/assets/realm-*.webp and parallaxed
inside the drum by 09/inner.wgsl.

09's tellings (the threshold's chips, the HUD's Style menu) are Orbit · 360°, Original, Vision, Abyss, Cathedral,
Nocturne, Dawn, Lumen and Mycelium. Choosing one reloads at the threshold with its own timing, realm, grade, light and
sound. Direct links use `?style=<id>`.
All realm layers and browser soundtracks are bundled for production by `09/media.ts`.

Orbit is bullet time with the camera as a dancer (09/camera.ts `orbitPose`): from the instant of the great stroke,
close on the struck point, it steps back into a spiral, goes once all the way round her and the drum (wide and high
behind the drum) and on to behind her, about 413° in all, and drifts in toward the glass, every channel one smooth
curve, never stopping; the world holds at 1/200 through the turn. The universe's membrane there opens on a dimension of
its own (design/beyond, painted by `refs.mjs beyond_far,beyond_mid,beyond_near`): three wide layers on spheres round the
dais at their own distances (so they slide against each other as the camera goes round), refracted through the
ripples with a colour split, through the tears and a little through the whole membrane. 29.4 s.

```bash
STYLE=orbit node --experimental-strip-types 09/audio/render.ts  # matching WAV + browser M4A
STYLE=orbit node 09/lab/run.mjs 09/lab/orbit.ts                 # closure, clearance, continuity and slow-motion checks
node tools/render.mjs 09 --tag -orbit --q style=orbit          # 1080 square, 60fps, 2× supersampled
```

Render another style with the same commands and its ID. `09/audio/render.ts` writes `film/09-<style>.wav` and
`09/assets/membrane-<style>.m4a` (`a` uses the original unsuffixed names). The renderer picks the soundtrack from
`--q style=<id>`, independently of the output tag; `--audio <path>` can override it.

## The films

`tools/render.mjs` starts a dev server of its own (no reloads, so editing while it films can't break it) and opens the
day in headless Chrome (WebGPU on Metal, muted) at `?render`: the loop is stepped exactly 1/fps a frame from u = 0,
each frame read back from the swapchain at 2× (weft's `Capture`) and posted raw to the server's film sink
(vite.config.ts), which pipes it into ffmpeg: lanczos down to 1080×1080, an optional HUD (`--hud`; clean picture by default), x264 `-preset slow -crf 15` (capped at 18 Mbit/s), `+faststart`. Camera, simulation and capture use deterministic frame steps and a fixed random seed.
Final approved MP4s go in `/Users/eric/videos/my creations/codevember/renders/`; render logs, probes and intermediate
files stay in `film/`.

Posting one, so the gallery tile and the day's Film tab play it (they look it up in footage.json by the day, `--id 04`):

```bash
node ~/codeprojects/footage/publish.mjs film/04.mp4 --id 04 --title "04 / Gyre" --sub "…" --poster-at 4
```

Then commit `public/footage/footage.json` and deploy. The films live on R2 (the footage standard,
~/codeprojects/footage), never in git or the deploy; `/codevember/footage/` is the footage page.

## Deploying

`tools/deploy.sh` builds into `deploy/vercel/codevember/` and deploys it as the `codevember` Vercel project, its files
under `/codevember/`; the portfolio (PortfolioII's vercel.json) rewrites `ericlevin.dev/codevember/*` to it.
