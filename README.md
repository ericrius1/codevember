# Codevember 2026

A sketch a day through November, in pure WebGPU on [weft](https://github.com/ericrius1/weft) (not loom). Each one is a
seamless loop, live in the browser and filmed for sharing. **[ericlevin.dev/codevember](https://www.ericlevin.dev/codevember/)**

```bash
npm install
npm run dev                      # http://localhost:5190/codevember/  (a day: /codevember/04/)
npm run typecheck
node tools/render.mjs 04         # the film: film/04.mp4, 1080×1080, 60 fps, 2× supersampled
node tools/render.mjs 04 --aspect 16:9   # 1920×1080 instead (height = --size; the camera's fit keeps the fov vertical)
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

A day with sound opens at its threshold (src/sketch.ts buildHud, src/sketch.css `.begin-*`): only the day's number and
name over a darkened still of the piece, and a round Begin button rippling slowly in the day's accent. Begin (the gesture a browser needs before it plays sound) bursts a ring out
over the page and starts the piece from zero with its sound; the HUD comes up after. Sound can be muted; Space pauses.
The picture follows the audio clock, including buffering. Switching Live / Film pauses the other audio source.

`--q 'cam=x,y,z,tx,ty,tz,fov'` (render.mjs) passes the page parameters through: 09 takes a fixed camera, for looking,
and `veil=0..1` / `trip=0..1` to hold the hide's thinning and the trip (the world inside the drum, 09/inner.wgsl;
`inner=1` shows only that world wherever the hide's thinned). A
stateful sketch's stills want `--q 'lead=3'`: each still's last 3 s stepped first, uncaptured, so its simulations (09's
hide) are where the film would have them. 09/design holds its look references (`node 09/design/refs.mjs`: Codex's
image generation, handed the concepts and a frame of the film); `refs.mjs ocean_ring,ocean_wall,ocean_core` paints the
realm inside the drum (design/realms/ocean, its three layers), and `dais,dais_top,dais_rock` the summit she stands on.

09 is one telling, filmed 16:9 (its numbers in `09/style.ts`). The pulse is struck twice — ordinary strokes: the
universe's membrane doesn't answer them and the hide doesn't open — then the great stroke, struck hard: the heavy beater
rebounds off the hide and her hand flows back up after it, let go with rather than braked (strike.ts `after`). Time
falls to a two-hundredth under it, eases after two seconds to a dream's pace, and as the camera flies in comes slowly
back to 0.85 of its own by the fade (score.ts `rate`). The camera holds on the struck point as the glass opens, draws
back a little to her, the drum and the torn membrane round them; then, the glass all but wholly open (STYLE.fly), it
flies in — wide of her left side, banking onto the hide's axis, into the glass — and the drum's world fills the frame,
flown down through like a portal, faster as time comes back (09/camera.ts; the flight and the portal in main.ts and
drum.wgsl). `node 09/lab/run.mjs 09/lab/camera.ts` checks the path against her posed bones, the beater and the drum. Our universe's membrane tears open on the deep (cosmos.wgsl
`deepSky`): not a painting but shells out to forever, each a third again as far and its strands a third again as large,
long strands of light (sea-teal, deep blue, leaf-green) flowing each shell its own way and strands of dark that hide all
behind them, a cold light far down past the drum. The glass opens on a deep ocean without end (inner.wgsl `deepWay`,
design/realms/ocean, painted by Codex): a way down ribbed with rings of bioluminescent veils and coral, flown down for
ever, and between the rings a volume marched through front to back (`wayMedium`) — torn veils of glowing dust from
ridged spiral noise, darker where they thicken, lit by a light deep down the axis — its feeling of glowing depth after
the volumetric nebulae of fragcoord.xyz and Duke's "Dusty nebula 4" (shadertoy.com/view/MsVXWW, CC BY-NC-SA 3.0). She
stands on a summit (summit.ts): a mountain's top torn up and floating, its top a carved stone circle
(assets/dais-top.webp), ragged cliffs in strata to an inverted spire (assets/dais-rock.webp), roots hanging into the
void, standing stones on its far side, shards drifting round it — painted by Codex (design/summit-concept.jpg). 24.4 s.

```bash
node --experimental-strip-types 09/audio/render.ts   # the soundtrack: film/09.wav + 09/assets/membrane.m4a
node 09/lab/run.mjs 09/lab/camera.ts                 # the flight in: clear of her, the beater and the drum; no jumps
node 09/lab/run.mjs 09/lab/motion.ts                 # her motion's jerks, ranked
node tools/render.mjs 09 --aspect 16:9               # film/09.mp4, 1920×1080, 60fps, 2× supersampled
node ~/codeprojects/footage/publish.mjs film/09.mp4 --id 09-infinite …   # its footage id stays 09-infinite
```

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
