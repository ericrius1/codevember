// 09 / Membrane. A shaman strikes a great drum on a dais floating in the void: three slow strokes, the wind-up, the
// great stroke — time dilates to a hundredth as it lands, the hide takes it and ripples, the shock leaves the drum,
// and the membrane of our universe ripples with it, the other universes showing through; out past it the foam of
// universes ripples too, and the membrane round them all; then back home, the pulse taken up again.
//
// Her: Boulder's town pipeline built her (09/character), Boulder's rig poses her (src/rig: the body solver, the arm
// fit, the fingers), the strokes are src/rig/strike.ts's. The hide: a membrane simulated on the GPU (membrane.wgsl),
// the beater's head pushing into it. The cosmos: cosmos.wgsl. The sound: audio/ (a simulated hide, rendered offline).
import { type RunEntry } from '@ericrius1/weft';
import { day } from '../src/days';
import { sketch } from '../src/sketch';
import { LOOP, story, rate, BIG, ACT, DILATE, STORY_LOOP } from './score';
import { Shaman } from './shaman';
import { Drum, Beater, DRUM } from './drum';
import { moment, BEATER, strokes } from './perform';
import { shot } from './camera';
import { Regalia } from './regalia';
import cosmosShader from './cosmos.wgsl';
import postShader from './post.wgsl';
import motesShader from './motes.wgsl';
import type { V3 } from '../src/rig/hero/math';

const BLOOM = 7;
const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

sketch({ ...day(9), filmLoops: 1, warm: 1, hint: 'Sound on, for the drum · Space to pause · drag to turn', audio: new URL('./assets/membrane.m4a', import.meta.url).href }, async (ctx) => {
  const { kit } = ctx;
  const G = kit.uniforms(cosmosShader.structs.Globals, 'globals');
  kit.setGlobals(G);

  // ---------------------------------------------------------------- the scene's targets
  const hdr = kit.texture({ label: 'hdr', format: 'rgba16float', size: 'render', usage: ['render', 'sample'] });
  const depth = kit.texture({ label: 'depth', format: 'depth32float', size: 'render', usage: ['render', 'sample'] });
  const bloom = kit.texture({ label: 'bloom', format: 'rgba16float', size: 'render', scale: 0.5, mips: BLOOM, usage: ['render', 'sample'] });

  const shaman = await Shaman.load(kit);
  const drum = new Drum(kit);
  await drum.loadTextures();
  const beater = new Beater(kit, BEATER.reach, BEATER.headR);
  const regalia = new Regalia(kit, shaman.rig, shaman.dq);
  const K = kit.uniforms(cosmosShader.structs.CosmosU, 'cosmos');

  // ---------------------------------------------------------------- passes
  const scene = kit.pass({ label: 'scene', color: [{ target: hdr, clear: [0, 0, 0, 1] }], depth: { target: depth, clear: 0 } });
  scene.fullscreen(cosmosShader, { label: 'sky', fragment: 'fsSky', bind: { K } as never });
  drum.draw(scene);
  beater.draw(scene, drum);
  shaman.draw(scene);
  regalia.draw(scene);
  const MU = kit.uniforms(motesShader.structs.MoteU, 'motes');
  scene.draw(motesShader, { label: 'motes', vertex: 'vsMote', fragment: 'fsMote', count: 6, instances: 900 + 3200, bind: { MU } as never,
    blend: 'add', depthWrite: false, depthCompare: 'greater' });

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
    constants: { HDR: 0, P3: 0 } as never });

  // ---------------------------------------------------------------- the world, each frame
  // (?cam=x,y,z,tx,ty,tz,fov: a fixed camera, for looking at her poses)
  const cq = ctx.params.get('cam')?.split(',').map(Number);
  const camOverride = cq && cq.length >= 6 ? { eye: [cq[0], cq[1], cq[2]] as V3, at: [cq[3], cq[4], cq[5]] as V3, fov: cq[6] ?? 40 } : null;
  const cam = kit.camera;
  cam.near = 0.03;
  let lastStory = -1;
  const W: V3 = [-480, 0, 0];
  const WR = 600;

  return ({ t, dt }) => {
    const r = rate(t);
    const s = story(t);
    // (the story clock across a frame: the previous frame's, or a frame's worth back if the loop wrapped)
    const jumped = lastStory < 0 || s < lastStory - 1e-6 && lastStory - s < STORY_LOOP * 0.5 || Math.abs(s - lastStory) > 0.5 && !(lastStory > STORY_LOOP - 0.5 && s < 0.5);
    const s0 = lastStory >= 0 && s >= lastStory && s - lastStory < 0.5 ? lastStory : Math.max(0, s - dt * r);
    lastStory = s;
    const ds = Math.max(1e-5, s - s0);
    // ---------------------------------------------------------------- her
    const M = moment(s);
    shaman.rig.update({
      dt: ds, time: s, pos: [M.goal.at[0], 0, M.goal.at[2]], yaw: M.goal.yaw, vel: [0, 0, 0], speed: 0, running: false, onGround: true,
      wade: 0, landImpact: 0, pose: { mode: 'idle', target: [0, 0, 0], intensity: 0, t: 0 }, look: M.goal.look ?? null, wind: [0, 0, 0],
      ground: () => 0, body: { goal: M.goal, w: 1 },
    });
    // the great stroke's light up her arm, her lines' pulse
    const sinceBig = s - story(BIG.t);
    shaman.look.armLight = sinceBig > 0 ? Math.min(1, sinceBig / 0.05) : 0;
    if (sinceBig > 0.06) shaman.look.armLight = 0;
    shaman.look.lines = 1 + 1.5 * M.flash;
    shaman.sync();
    // her regalia's strands: the great stroke's shock blows them back off her, in slowed time
    const sb = story(BIG.t);
    const shockA = s > sb && s < sb + 0.03 ? 900 * (1 - (s - sb) / 0.03) : 0;
    const fwd: V3 = [-Math.sin(M.goal.yaw), 0, -Math.cos(M.goal.yaw)];
    // (a jump in time — a still, a scrub, the loop's first frame — lets them settle where she is first)
    if (jumped) regalia.settle(2.5, fwd, s);
    regalia.step(ds, { o: M.hit, a: shockA }, fwd, s, M.flash, M.flash, s > sb ? Math.exp(-(s - sb) * 1.2) * 0.9 : 0);
    const bs = M.beater;
    beater.place(bs.hand, bs.shaft, [0, 0, 1]);
    // ---------------------------------------------------------------- the hide: its steps through this frame
    drum.advance(dt, r, s0, s, (sk) => {
      const x = strokes.at(sk).st;
      return { c: x.head, r: BEATER.headR };
    });
    drum.look(s, 1);
    // ---------------------------------------------------------------- the light, the shock, the cosmos
    const big = BIG.t;
    // the shock's front: barely moving through the dilated moment, then racing out as time comes back
    const shockR = t > big ? 0.5 * Math.pow(t - big, 1.5) + 70 * Math.pow(Math.max(0, t - ACT.shock), 2) : 0;
    const dil = 1 - Math.log(r) / Math.log(0.01) * -1;
    const deep = Math.log(Math.max(r, 1e-4)) / Math.log(0.01);
    const cam0 = camOverride ?? shot(t, ctx.orbit);
    cam.lookAt(cam0.eye, cam0.at);
    ctx.fit(cam, cam0.fov);
    const camD = Math.hypot(cam0.eye[0] - DRUM.c[0], cam0.eye[1] - DRUM.c[1], cam0.eye[2] - DRUM.c[2]);
    const inside = Math.hypot(cam0.eye[0] - W[0], cam0.eye[1] - W[1], cam0.eye[2] - W[2]) < WR;
    const cosmosRipple = smooth(ACT.cosmos - 1.2, ACT.cosmos + 0.5, t) * (1 - smooth(21, 24.5, t));
    G.set({
      clock: [t, s, r, t / LOOP] as never,
      key: [-0.55, 0.62, -0.5, 1.9] as never, keyCol: [0.8, 0.74, 1.0, 0.3] as never,
      drumLight: [-0.4, DRUM.c[1], DRUM.c[2], 1.2 + 1.0 * M.flash] as never, drumCol: [1.0, 0.55, 0.22, M.flash] as never,
      rimCol: [0.45, 0.3, 0.9, 0.35 + 0.6 * cosmosRipple] as never, ambient: [0.09, 0.06, 0.15, 0.7] as never,
      drum: [...DRUM.c, DRUM.r] as never, hit: [...M.hit, M.press] as never,
      shock: [...M.hit, shockR] as never, shock2: [t > big ? Math.exp(-(t - big) * 0.25) * 0.7 : 0, 0.04 + shockR * 0.04, deep, t > big ? Math.exp(-(t - big) * 0.3) : 0] as never,
      cosmos: [cosmosRipple, 0.3 + 0.7 * cosmosRipple, smooth(ACT.foam - 1, ACT.foam + 2, t), 0.25 * deep * Math.sin(t * 0.7)] as never,
      wall: [...W, WR] as never,
      waves: [[1, 0.02, 0, ACT.cosmos - 0.6], [0.95, 0.25, 0.1, ACT.cosmos + 0.9], [0.9, -0.3, -0.2, ACT.cosmos + 2.6], [1, 0, 0, -1]] as never,
      glow: [M.flash, 0, 0, 0] as never,
    });
    void dil;
    K.set({ view: [camD, smooth(ACT.foam - 2, ACT.foam, t) * (1 - smooth(ACT.home, ACT.home + 1.5, t)), smooth(ACT.foam + 1, ACT.foam + 3, t), inside ? 1 : 0] as never,
      spark: [...DRUM.c, 1] as never });
    // the motes: the sparks' own clock (the membrane's pace: they spray slowly through the dilation, then fly)
    let burstAge = 0;
    if (t > big) { const n = 40; for (let k = 0; k < n; k++) { const tk = big + (t - big) * (k + 0.5) / n; burstAge += Math.min(rate(tk), 0.08) * 14 * (t - big) / n; } }
    const blow = t > big ? 1.6 * (1 - Math.exp(-shockR * 0.8)) * Math.exp(-(t - big) * 0.32) : 0;
    MU.set({ t: [s, STORY_LOOP, burstAge, t > big ? 1 : 0] as never, burst: [...M.hit, blow] as never });
    // ---------------------------------------------------------------- the lens
    // the shock's ring on screen: where its origin projects, the angle its front subtends (gone once it's past us)
    const ce = cam0.eye, fw = norm3(sub3(cam0.at, ce)), rt = norm3(cross3(fw, [0, 1, 0])), upv = cross3(rt, fw);
    const toH = sub3(M.hit, ce), dH = Math.hypot(toH[0], toH[1], toH[2]);
    const zf = dot3(toH, fw), th = Math.tan((cam.fovY) / 2), asp = kit.size.render[0] / kit.size.render[1];
    const sx = 0.5 + (dot3(toH, rt) / Math.max(zf, 1e-3)) / (th * asp) * 0.5, sy = 0.5 - (dot3(toH, upv) / Math.max(zf, 1e-3)) / th * 0.5;
    const ringA = shockR > 0 && shockR < dH ? Math.atan(shockR / dH) / th * 0.5 : 0;
    const ringK = t > big && zf > 0 && ringA > 0 ? Math.exp(-(t - big) * 0.35) * (1 - Math.min(1, shockR / dH) ** 4) : 0;
    P.set({ look: [1.0, 0.9, 1.2, 0.035] as never, look2: [0.4 + 3 * deep * deep, 0.07 * deep * deep * deep, 0.55, 1.0 + 0.2 * deep] as never,
      shock: [sx, sy, ringA, ringK * 0.9] as never, misc: [0, 0, 0, 0] as never });
    PF.set({ look: [1.0, 0.9, 1.2, 0.035] as never, look2: [0, 0, 0, 1] as never, shock: [0.5, 0.5, 0, 0] as never, misc: [1, 0, 0, 0] as never });
    void STORY_LOOP; void DILATE;
    return [...drum.run, scene, ...post, out];
  };
});
