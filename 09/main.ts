// 09 / Membrane. A shaman strikes a great drum on a mountain's summit torn up and floating in the void: two slow
// strokes, the hide ringing, then the wind-up and the great stroke, the last: the downswing whips through and time falls
// away under it to a two-hundredth as it lands, her arm driving on through, the hide takes it and its rings crawl out
// across it, the universe's membrane ripples with it at once and tears open on the deep beyond it (cosmos.wgsl), and
// the hide turns to glass on an ocean's way down without end (inner.wgsl). Time lifts only to a dream's pace and stays
// there; the camera draws back round to behind her as she watches, and it all fades to black.
//
// Her: Boulder's town pipeline built her (09/character), Boulder's rig poses her (src/rig: the body solver, the arm
// fit, the fingers), the strokes are src/rig/strike.ts's. The hide: a membrane simulated on the GPU (membrane.wgsl),
// the beater's head pushing into it. Her headdress: ornaments.ts; her strands: hair.ts. The cosmos: cosmos.wgsl. The
// sound: audio/ (a simulated hide, rendered offline). The motion's own measure: lab/ (node 09/lab/run.mjs).
import { FrameBudget, type RunEntry } from '@ericrius1/weft';
import { day } from '../src/days';
import { sketch } from '../src/sketch';
import { LOOP, story, rate, BIG, ACT, STORY_LOOP } from './score';
import { Shaman } from './shaman';
import { STYLE } from './style';
import { soundtrack } from './media';
import { Drum, Beater, DRUM, membranePace } from './drum';
import { moment, BEATER, strokes, drive, struckAt } from './perform';
import { GripHold, aimAt } from './grip';
import { shot } from './camera';
import { Regalia } from './regalia';
import cosmosShader from './cosmos.wgsl';
import postShader from './post.wgsl';
import type { V3 } from '../src/rig/hero/math';

const BLOOM = 7;
const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const scale3 = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

sketch({ ...day(9), loop: LOOP, filmLoops: 1, warm: 1, hint: 'Space to pause · drag to turn', audio: new URLSearchParams(location.search).has('render') ? undefined : soundtrack() }, async (ctx) => {
  const { kit } = ctx;
  const G = kit.uniforms(cosmosShader.structs.Globals, 'globals');
  kit.setGlobals(G);

  // ---------------------------------------------------------------- the scene's targets
  const hdr = kit.texture({ label: 'hdr', format: 'rgba16float', size: 'render', usage: ['render', 'sample'] });
  const depth = kit.texture({ label: 'depth', format: 'depth32float', size: 'render', usage: ['render', 'sample'] });
  const bloom = kit.texture({ label: 'bloom', format: 'rgba16float', size: 'render', scale: 0.5, mips: BLOOM, usage: ['render', 'sample'] });

  const shaman = await Shaman.load(kit);
  // the beater fixed in her hand: posed a few frames at a moment when her hand's where the stroke asks, then held
  const hold = new GripHold(shaman.rig);
  { const s0 = story(0.3); for (let i = 0; i < 4; i++) drive(shaman.rig, moment(s0), s0, 1 / 60); hold.calibrate(moment(s0).beater); }
  const drum = new Drum(kit);
  await drum.loadTextures();
  const beater = new Beater(kit, BEATER.reach, BEATER.headR);
  const regalia = new Regalia(kit, shaman.rig, shaman.dq);
  const K = kit.uniforms(cosmosShader.structs.CosmosU, 'cosmos');

  // ---------------------------------------------------------------- passes
  // the sky: by far the frame's costliest pass once the membrane's open (the deep's shells marched through on every
  // pixel). Live on a dense screen (a Retina laptop's, two pixels a point) it's drawn at half the size, a texel of it a
  // point, and lifted into the scene; filmed (supersampled anyway), or on a plain screen, at full size in the scene
  const perf = ctx.params.has('perf');
  // (the deep's slow fields, made once a frame for all its shells before the sky reads them: cosmos.wgsl fsDeepFields)
  const deepA = kit.texture({ label: 'deep.fields.a', format: 'rgba16float', size: [256, 128 * 18], usage: ['render', 'sample'] });
  const deepB = kit.texture({ label: 'deep.fields.b', format: 'rgba16float', size: [256, 128 * 18], usage: ['render', 'sample'] });
  const deepPass = kit.pass({ label: 'deep.fields', color: [{ target: deepA, clear: [0, 0, 0, 0] }, { target: deepB, clear: [0, 0, 0, 0] }] });
  deepPass.fullscreen(cosmosShader, { label: 'deep.fields', fragment: 'fsDeepFields' });
  const skyScale = ctx.render ? 1 : Number(ctx.params.get('sky') ?? (Math.min(devicePixelRatio, 2) >= 1.5 ? 0.5 : 1));
  const skyTex = skyScale < 1 ? kit.texture({ label: 'sky', format: 'rgba16float', size: 'render', scale: skyScale, usage: ['render', 'sample'] }) : null;
  const skyPass = skyTex ? kit.pass({ label: 'sky', color: [{ target: skyTex, clear: [0, 0, 0, 1] }] }) : null;
  skyPass?.fullscreen(cosmosShader, { label: 'sky', fragment: 'fsSky', bind: { K, deepA, deepB } as never });
  const scene = kit.pass({ label: 'scene', color: [{ target: hdr, clear: [0, 0, 0, 1] }], depth: { target: depth, clear: 0 } });
  if (skyTex) scene.fullscreen(cosmosShader, { label: 'sky.up', fragment: 'fsSkyUp', bind: { skyTex } as never });
  else scene.fullscreen(cosmosShader, { label: 'sky', fragment: 'fsSky', bind: { K, deepA, deepB } as never });
  // live, the resolution follows the frames (it steps down only when they run late: a fanless laptop warming, a big
  // window), never when filming or timing (?perf), or held (?fixed)
  if (!ctx.render && !perf && !ctx.params.has('fixed')) kit.autoRes = new FrameBudget(15, { min: 0.6, max: 1, step: 0.2, byPace: true });
  drum.draw(scene);
  beater.draw(scene, drum);
  shaman.draw(scene);
  regalia.draw(scene);
  // (live on a dense screen, the world inside the glass marched at half the size too, and the hide's down in fewer
  // shells — ?fuzzShells=n)
  if (skyTex) drum.live(skyScale, Number(ctx.params.get('fuzzShells') ?? 6));
  const front = kit.pass({ label: 'scene.hide', color: [{ target: hdr, clear: false }], depth: { target: depth, clear: false } });
  drum.drawHide(front);

  const P = kit.uniforms(postShader.structs.PostU, 'post');
  const PF = kit.uniforms(postShader.structs.PostU, 'post.first');
  const post: RunEntry[] = [];
  for (let i = 0; i < BLOOM; i++) {
    const p = kit.pass({ label: `bloom.down${i}`, color: [{ target: bloom.mip(i), clear: [0, 0, 0, 1] }] });
    p.fullscreen(postShader, { fragment: 'fs_down', bind: { P: i === 0 ? PF : P, src: i === 0 ? hdr : bloom.mip(i - 1), bloomTex: bloom.mip(BLOOM - 1) } as never });
    post.push(p);
  }
  for (let i = BLOOM - 2; i >= 0; i--) {
    const p = kit.pass({ label: `bloom.up${i}`, color: [{ target: bloom.mip(i), clear: false }] });
    p.fullscreen(postShader, { fragment: 'fs_up', blend: 'add', bind: { P, src: bloom.mip(i + 1), bloomTex: bloom.mip(BLOOM - 1) } as never });
    post.push(p);
  }
  const out = kit.pass({ label: 'final', color: [{ target: 'screen', clear: [0, 0, 0, 1] }] });
  out.fullscreen(postShader, { fragment: 'fs_final', bind: { P, src: hdr, bloomTex: bloom.mip(0) } as never,
    constants: { HDR: 0, P3: 0, ...(skyTex ? { ZOOM_TAPS: 10, RAY_TAPS: 16 } : {}) } as never });

  // ---------------------------------------------------------------- the world, each frame
  // (?cam=x,y,z,tx,ty,tz,fov: a fixed camera, for looking at her poses)
  const cq = ctx.params.get('cam')?.split(',').map(Number);
  const camOverride = cq && cq.length >= 6 ? { eye: [cq[0], cq[1], cq[2]] as V3, at: [cq[3], cq[4], cq[5]] as V3, fov: cq[6] ?? 40 } : null;
  const cam = kit.camera;
  cam.near = 0.03;
  let lastStory = -1;
  // our universe's wall: a bubble round the dais, its centre off behind her so the shock reaches it first behind the
  // drum (the rings' heart), a little over 80 m out there and two hundred behind her
  const W: V3 = [-55, 8, 0];
  // the wall's ripples run on a clock of their own: steady before, slowed with time at the great stroke (the wall and
  // the hide ripple together, in the same slowed moment), and slowed to the end. Tabulated once.
  const big = BIG.t;
  const domePace = (x: number) => 0.75 - 0.53 * smooth(big - 0.25, big + 0.2, x);
  const DOME_STEP = 1 / 120, dome = new Float64Array(Math.ceil(LOOP / DOME_STEP) + 2);
  for (let i = 1; i < dome.length; i++) dome[i] = dome[i - 1] + domePace((i - 0.5) * DOME_STEP) * DOME_STEP;
  const domeAt = (x: number) => { const f = Math.max(0, x) / DOME_STEP, i = Math.min(dome.length - 2, Math.floor(f)); return dome[i] + (dome[i + 1] - dome[i]) * (f - i); };
  // the ripple events on the wall (G.waves): the pulse's strokes are ordinary ones (the wall doesn't answer them); the
  // great stroke sends three at once and after (the wall struck with the hide), the trip two more from far round
  const WAVES: number[][] = [
    [...scale3(norm3([0.99, -0.12, 0]), 1.05), domeAt(big + 0.02)],
    [...scale3(norm3([0.95, 0.15, 0.12]), 0.8), domeAt(big + 2.2)],
    [...scale3(norm3([0.9, -0.3, -0.2]), 0.7), domeAt(big + 5.5)],
    [...scale3(norm3([-0.55, 0.55, 0.62]), 0.6), domeAt(ACT.trip - 0.5)],
    [...scale3(norm3([0.25, 0.85, -0.45]), 0.6), domeAt(ACT.trip + 2)],
  ];
  while (WAVES.length < 8) WAVES.push([1, 0, 0, -1]);
  const WR = 140;
  const FRONT_NEAR = WR - Math.hypot(W[0] - DRUM.c[0], W[1] - DRUM.c[1], W[2] - DRUM.c[2]);
  // the glass: the hide turns clear behind the great stroke's ripple as it spreads from where it was struck, at the
  // hide's own wave speed on its own clock (drum.ts membranePace, tabulated here), almost wholly, for good (the pulse's
  // strokes don't open it)
  const MEM_STEP = 1 / 240, mem = new Float64Array(Math.ceil(LOOP / MEM_STEP) + 2);
  for (let i = 1; i < mem.length; i++) mem[i] = mem[i - 1] + membranePace(rate((i - 0.5) * MEM_STEP)) * MEM_STEP;
  const memAt = (x: number) => { const f = Math.max(0, x) / MEM_STEP, i = Math.min(mem.length - 2, Math.floor(f)); return mem[i] + (mem[i + 1] - mem[i]) * (f - i); };
  const [bigA, bigB] = struckAt(BIG);
  const glassAt = (t: number) => t < big
    ? { amount: 0, front: [0, 0, 0] as [number, number, number] }
    : { amount: STYLE.glass, front: [bigA, bigB, 100 * 0.92 * (memAt(t) - memAt(big))] as [number, number, number] };
  // the trip: 0 till the great stroke, deepening to the end
  const tripAt = (t: number) => Math.pow(smooth(big, ACT.fade, t), 0.75);
  // the great stroke's ripple through the whole picture (the rim light, the wall's troughs), held
  const rippleAt = (t: number) => smooth(big, big + 0.8, t);
  // the fade: in from black at the loop's start, out to it at its end
  const fadeAt = (t: number) => smooth(0, 0.9, t) * (1 - smooth(ACT.fade, ACT.black, t));
  // (?veil=0..1 and ?trip=0..1 hold the hide's thinning and the trip there, for looking at the world inside)
  const veilQ = ctx.params.has('veil') ? Number(ctx.params.get('veil')) : null;
  const tripQ = ctx.params.has('trip') ? Number(ctx.params.get('trip')) : null;

  return ({ t, dt }) => {
    const r = rate(t);
    const s = story(t);
    // (the story clock across a frame: the previous frame's, or a frame's worth back if the loop wrapped)
    // (a clock a hair behind the last frame's is no jump: it holds still, so nothing snaps back to rest)
    const back = lastStory >= 0 && s < lastStory && lastStory - s < 0.05;
    const jumped = lastStory < 0 || s < lastStory - 0.05 && lastStory - s < STORY_LOOP * 0.5 || Math.abs(s - lastStory) > 0.5 && !(lastStory > STORY_LOOP - 0.5 && s < 0.5);
    // (across the loop's wrap the story clock runs on: its step is what's left of the last loop and this one's start)
    const wrapped = lastStory > STORY_LOOP - 0.5 && s < 0.5;
    const s0 = back ? s : lastStory >= 0 && s >= lastStory && s - lastStory < 0.5 ? lastStory : wrapped ? s - (STORY_LOOP - lastStory) : Math.max(0, s - dt * r);
    if (!back) lastStory = s;
    const ds = Math.max(1e-5, s - s0);
    // ---------------------------------------------------------------- her
    const M = moment(s);
    drive(shaman.rig, M, s, ds);
    // the great stroke's light up her arm, her lines' pulse
    const sinceBig = s - story(BIG.t);
    shaman.look.armLight = sinceBig > 0 ? Math.min(1, sinceBig / 0.05) : 0;
    if (sinceBig > 0.06) shaman.look.armLight = 0;
    shaman.look.lines = 1 + 1.5 * M.flash;
    shaman.sync();
    // her regalia's strands: the great stroke's shock blows them back off her, in slowed time
    const sb = story(BIG.t);
    const fwd: V3 = [-Math.sin(M.goal.yaw), 0, -Math.cos(M.goal.yaw)];
    // (a jump in time — a still, a scrub, the loop's first frame — lets them settle where she is first)
    if (jumped) regalia.settle(2.5);
    regalia.step(ds, M.hit, fwd, s, M.flash, M.flash, M.push);
    const bs = M.beater;
    const held = hold.place(bs, aimAt(bs.since));
    beater.place(held.hand, held.shaft, held.side);
    // ---------------------------------------------------------------- the hide: its steps through this frame
    drum.advance(dt, r, s0, s, (sk) => {
      const x = strokes.at(sk).st;
      return { c: x.head, r: BEATER.headR };
    });
    drum.look(s, 1, M.rock);
    const trip = tripQ ?? tripAt(t);
    const gl = glassAt(t);
    // (the hide breathes slowly, on a steady clock of its own: in film time its rings ran on at the world's pace as
    // everything else held slowed, and swelled to the end)
    drum.glass(veilQ ?? gl.amount, t, veilQ !== null ? [0, 0, 9] : gl.front, trip, t, 0.0032 * trip * trip, 0.3 * t);
    // ---------------------------------------------------------------- the light, the shock, the cosmos
    // the shock's front: barely moving through the dilated moment, then racing out as time lifts
    const shockR = t > big ? 0.5 * Math.pow(t - big, 1.5) + 40 * Math.pow(Math.max(0, t - ACT.shock), 2) : 0;
    const deep = Math.log(Math.max(r, 1e-4)) / Math.log(0.01);
    const deepK = Math.min(1, deep);
    const cam0 = camOverride ?? shot(t, ctx.orbit);
    cam.lookAt(cam0.eye, cam0.at);
    ctx.fit(cam, cam0.fov);
    const rip = rippleAt(t);
    // the deep beyond: the membrane tearing open behind the great stroke's front as it sweeps the dome, and staying open
    // (wide open at first, then held a little less: the membrane's own film and its rings over it through the trip)
    const reveal = smooth(big + 0.3, big + 3.5, t) * (1 - 0.12 * smooth(big + 3.5, ACT.trip, t)) * STYLE.sky.reveal;
    // (the sky's colour drifting while time's out of joint, wandering further as the trip deepens — the sky's alone: the
    // stage keeps its own)
    // (never far: past ±0.45 rad the violets go olive)
    const drift = (0.2 * deepK * Math.sin(t * 0.7) + 0.32 * Math.sin((t - big) * 0.4) * smooth(big, big + 4, t)) * STYLE.grade.drift;
    // (its light on her and the drum: the rim and the ambient take the deep's colours)
    const mixc = (a: number[], b: number[], k: number) => a.map((x, i) => x + (b[i] - x) * k);
    G.set({
      clock: [t, s, r, t / LOOP] as never,
      key: [-0.55, 0.62, -0.5, 1.9] as never, keyCol: [0.8, 0.74, 1.0, 0.3] as never,
      // (the drum's own light, and from the great stroke the realm's spilling out through the glass in its own colour)
      drumLight: [-0.4, DRUM.c[1], DRUM.c[2], 1.2 + 0.45 * M.flash + STYLE.spill * trip] as never,
      drumCol: [...mixc([1.0, 0.55, 0.22], STYLE.light, smooth(big, big + 3, t)), M.flash] as never,
      rimCol: [...mixc([0.45, 0.3, 0.9], [0.32, 0.78, 0.82], reveal), 0.35 + 0.6 * rip + 0.15 * reveal] as never,
      ambient: [...mixc([0.09, 0.06, 0.15], [0.07, 0.11, 0.16], 0.6 * reveal), 0.7 + 0.08 * reveal] as never,
      drum: [...DRUM.c, DRUM.r] as never, hit: [...M.hit, M.press] as never,
      shock: [...M.hit, shockR] as never, shock2: [t > big ? Math.exp(-(t - big) * 0.15) * 0.7 * smooth(big + 0.5, big + 1.3, t) : 0, 0.04 + shockR * 0.04, deepK, t > big ? Math.exp(-(t - big) * 0.2) : 0] as never,
      cosmos: [1, 0.3 + 0.7 * rip, trip * STYLE.sky.heave, drift] as never,
      wall: [...W, WR] as never,
      waves: WAVES as never,
      glow: [M.flash, 0, 0, 0] as never,
    });
    K.set({ open: [reveal, 0.0003 * (1 + 0.5 * trip), domeAt(t), 0] as never,
      front: [big + 0.02, FRONT_NEAR, 18 + 22 * smooth(big + 1, big + 5, t), 1.0] as never,
      // (the deep's shells: fewer live than filmed; ?deep=1 shows the deep alone)
      deep: [0.045, STYLE.sky.through * smooth(big + 0.3, big + 4, t), ctx.render ? 18 : 14, ctx.params.has('deep') ? 1 : 0] as never });
    // ---------------------------------------------------------------- the lens
    // the shock's ring on screen: where its origin projects, the angle its front subtends (gone once it's past us)
    const ce = cam0.eye, fw = norm3(sub3(cam0.at, ce)), rt = norm3(cross3(fw, [0, 1, 0])), upv = cross3(rt, fw);
    const toH = sub3(M.hit, ce), dH = Math.hypot(toH[0], toH[1], toH[2]);
    const zf = dot3(toH, fw), th = Math.tan((cam.fovY) / 2), asp = kit.size.render[0] / kit.size.render[1];
    const sx = 0.5 + (dot3(toH, rt) / Math.max(zf, 1e-3)) / (th * asp) * 0.5, sy = 0.5 - (dot3(toH, upv) / Math.max(zf, 1e-3)) / th * 0.5;
    const ringA = shockR > 0 && shockR < dH ? Math.atan(shockR / dH) / th * 0.5 : 0;
    const ringK = t > big && zf > 0 && ringA > 0 ? Math.exp(-(t - big) * 0.35) * (1 - Math.min(1, shockR / dH) ** 4) : 0;
    // (the hide's middle on screen, for the light pouring out of the glass)
    const toD = sub3(DRUM.c, ce), pz = dot3(toD, fw);
    const px = 0.5 + (dot3(toD, rt) / Math.max(pz, 1e-3)) / (th * asp) * 0.5, py = 0.5 - (dot3(toD, upv) / Math.max(pz, 1e-3)) / th * 0.5;
    const gr = STYLE.grade;
    P.set({ look: [fadeAt(t) * gr.exp, (0.9 + 0.35 * trip) * gr.bloom, 1.2, 0.02] as never,
      look2: [0.2 + 1.2 * deepK * deepK + 0.8 * trip, 0.015 * deepK * deepK * deepK, 0.55 + 0.1 * trip, (1.0 + 0.2 * deepK + 0.12 * trip) * (1 + (gr.sat - 1) * smooth(big, big + 3, t))] as never,
      grade: [gr.cool, 0, 0, 0] as never,
      rays: [px, py, pz > 0 ? STYLE.rays * trip : 0, 0.55] as never,
      shock: [sx, sy, ringA, ringK * 0.9] as never,
      misc: [0, 0.1 * trip * trip * Math.sin(t * 0.23) * gr.drift, smooth(big - 0.05, big + 1.5, t) * (0.8 + 0.5 * trip), 0] as never });
    PF.set({ look: [1.0, 0.9, 1.2, 0.035] as never, look2: [0, 0, 0, 1] as never, shock: [0.5, 0.5, 0, 0] as never, misc: [1, 0, 0, 0] as never, grade: [1, 0, 0, 0] as never, rays: [0, 0, 0, 0] as never });
    // (the world inside marched only once the glass is opening)
    const inner = drum.innerPass && (veilQ ?? gl.amount) > 0.001 ? [drum.innerPass] : [];
    const deepRun = reveal > 0.001 || STYLE.sky.through * smooth(big + 0.3, big + 4, t) > 0.002 ? [deepPass] : [];
    return skyPass ? [...drum.run, ...deepRun, skyPass, scene, ...inner, front, ...post, out] : [...drum.run, ...deepRun, scene, front, ...post, out];
  };
});
