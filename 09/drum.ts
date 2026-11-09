// The great drum and the dais it stands on: built here (MeshBuilder), the hide simulated on the GPU (membrane.wgsl),
// all drawn by drum.wgsl.
//
// The drum stands on its edge with its hide facing -x (toward her), its centre at DRUM.c; a deep shell behind the hide
// carved in a band (rim.jpg round it), the hide lapped over the bearing edge and laced to it, an open back crossed by
// a star of cords, two roots for a stand, seed pods hanging on cords. The dais: a disc of dark stone with glowing rings,
// a rock under it hanging roots into the void.
import { MeshBuilder, type Kit, type RenderPass, type StorageBuffer, type Texture, type UniformBuffer, type RunEntry, type Compute, type PingPong, MipChain } from '@ericrius1/weft';
import type { V3 } from '../src/rig/hero/math';
import drumShader from './drum.wgsl';
import membraneShader from './membrane.wgsl';

import { DRUM, DAIS } from './stage';
export { DRUM, DAIS };

// the hide's physics: a real hide's wave speed (its tension over its mass), its stiffness, its losses
const N = 256;
const C_WAVE = 100;           // m/s (f01 = 2.405 c / 2π R ≈ 45 Hz)
const KAPPA = 0.16;           // m²/s (bending stiffness; with λ² below, inside the scheme's bound 8λ² + 64μ² ≤ 4)
const SIGMA0 = 55;            // 1/s on the membrane's clock (its visual decay)
const SIGMA1 = 0.004;         // m²/s (the high modes' extra loss)
const K_MAX = 64;
/** the membrane's clock against film time: never faster than MEMBRANE_PACE (so ripples can be seen at all), and in
 *  the dilated moment slower than the world itself (MEMBRANE_DEEP of its rate) — at a hundredth of time a wave would
 *  still cross the hide in under a second; at this it crawls, its rings spreading from the beater and back off the rim
 *  over seconds, which is what the close-up is for */
export const MEMBRANE_PACE = 0.08, MEMBRANE_DEEP = 0.4;
export const membranePace = (rate: number) => Math.min(MEMBRANE_PACE, MEMBRANE_DEEP * rate);

const H = (2 * DRUM.r) / N;
const DT = (0.42 * H) / C_WAVE;

/** the beater's head on the hide at a moment: its centre (world) and radius */
export type HeadAt = (story: number) => { c: V3; r: number } | null;

function teardrop(b: MeshBuilder, at: V3, len: number, rad: number, phase: number, mat: number, col: number[]) {
  // a pod: a lathe about its hanging line, every vertex carrying (its phase, the cord's top) in uv for the sway
  const prof: [number, number][] = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; prof.push([rad * Math.sin(Math.PI * Math.pow(t, 0.8)) * (0.6 + 0.4 * t), -len * t]); }
  const seg = 14, base = b.vertexCount;
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    for (let k = 0; k < prof.length; k++) {
      const [r, y] = prof[k], [r0, y0] = prof[Math.max(0, k - 1)], [r1, y1] = prof[Math.min(prof.length - 1, k + 1)];
      const dr = r1 - r0, dy = y1 - y0, l = Math.hypot(dr, dy) || 1;
      b.vertex([at[0] + c * r, at[1] + y, at[2] + s * r], [(c * -dy) / l, dr / l, (s * -dy) / l], [phase, at[1] + 0.25], [...col, 1], mat);
    }
  }
  const P = prof.length;
  for (let i = 0; i < seg; i++) for (let k = 0; k < P - 1; k++) { const a = base + i * P + k, c = a + P; b.tri(a, c, a + 1).tri(a + 1, c, c + 1); }
}

export class Drum {
  private body: { vertices: StorageBuffer; indices: StorageBuffer; count: number };
  private hide: { vertices: StorageBuffer; indices: StorageBuffer; count: number };
  readonly U: UniformBuffer<any>;
  private SU: UniformBuffer<any>;
  private contacts: UniformBuffer<any>[] = [];
  private sim: PingPong<Texture>;
  private steps: RunEntry[] = [];
  private K = 0;
  private acc = 0;
  hideTex!: Texture; rimTex!: Texture;

  constructor(readonly kit: Kit) {
    // ---------------------------------------------------------------- the body
    const b = new MeshBuilder();
    const R = DRUM.r, Dp = DRUM.depth, [cx, cy, cz] = DRUM.c;
    b.push().translate(cx, cy, cz).rotateZ(-Math.PI / 2);
    // (local y is the drum's axis toward its back: world +x; local x is world -y, local z world z)
    const dark = [0.16, 0.06, 0.035];
    b.setColor(dark, 1).lathe([[R + 0.03, 0.018], [R + 0.056, 0.03], [R + 0.062, 0.055], [R + 0.05, 0.07]], 160);
    b.setColor([1, 1, 1], 0).lathe([[R + 0.05, 0.07], [R + 0.05, Dp - 0.07]], 160);
    b.setColor(dark, 1).lathe([[R + 0.05, Dp - 0.07], [R + 0.062, Dp - 0.055], [R + 0.056, Dp - 0.03], [R + 0.03, Dp]], 160);
    b.setColor(dark, 1).lathe([[R + 0.03, Dp], [R + 0.008, Dp]], 160);
    b.setColor([0.1, 0.04, 0.025], 1).lathe([[R + 0.008, Dp], [R + 0.004, 0.02]], 160);
    // the hide lapped over the bearing edge
    b.setColor([0.5, 0.3, 0.12], 6).lathe([[R - 0.004, -0.002], [R + 0.012, -0.012], [R + 0.03, -0.01], [R + 0.042, 0.006], [R + 0.044, 0.024]], 160);
    b.pop();
    // the lacing: a loop of cord over the lap every 10°, and a star of cords across the open back
    const ring = (a: number, r: number, x: number): V3 => [cx + x, cy + Math.cos(a) * r, cz + Math.sin(a) * r];
    b.setColor([0.42, 0.3, 0.16], 3);
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      b.tube([ring(a, R + 0.0, -0.004), ring(a, R + 0.035, -0.02), ring(a, R + 0.068, 0.02), ring(a, R + 0.064, 0.085)], 0.006, 6);
    }
    const star = 9;
    for (let i = 0; i < star; i++) {
      const a0 = (i / star) * Math.PI * 2, a1 = ((i + 4) / star) * Math.PI * 2;
      b.tube([ring(a0, R + 0.01, Dp - 0.01), ring((a0 + a1) / 2 + 0.2, R * 0.22, Dp + 0.03), ring(a1, R + 0.01, Dp - 0.01)], 0.009, 6);
    }
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      b.tube([ring(a, R + 0.064, 0.085), ring(a + 0.12, R + 0.07, Dp * 0.5), ring(a + 0.24, R + 0.064, Dp - 0.06)], 0.0045, 5);
    }
    // the stand: two roots rising from the dais to cradle the shell, their own roots splayed on the stone
    b.setColor([0.3, 0.12, 0.05], 2);
    for (const sx of [-1, 1]) {
      const az = sx * 0.62, bx = cx + Dp * 0.5;
      const top = ring(Math.PI + az, R + 0.06, Dp * 0.5);
      const foot: V3 = [bx + sx * 0.1, 0.0, cz + sx * 0.78];
      const path: V3[] = [];
      for (let i = 0; i <= 16; i++) {
        const t = i / 16;
        const mid: V3 = [bx, 0.35, cz + sx * 0.82];
        const p0 = foot, p1 = mid, p2 = top;
        const u = 1 - t;
        path.push([p0[0] * u * u + p1[0] * 2 * u * t + p2[0] * t * t, p0[1] * u * u + p1[1] * 2 * u * t + p2[1] * t * t, p0[2] * u * u + p1[2] * 2 * u * t + p2[2] * t * t]);
      }
      b.tube(path, (t) => 0.085 - 0.045 * t, 12);
      // (the cradle: along the shell's underside toward the bottom)
      const cr: V3[] = [];
      for (let i = 0; i <= 10; i++) cr.push(ring(Math.PI + az * (1 - i / 10) * 1.0, R + 0.075, Dp * (0.15 + 0.7 * ((i * 7) % 10) / 10)));
      b.tube([top, ring(Math.PI + az * 0.5, R + 0.07, Dp * 0.3), ring(Math.PI, R + 0.07, Dp * 0.5)], 0.045, 10);
      void cr;
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 1.6 - 0.8 + (sx > 0 ? 0 : Math.PI);
        const L = 0.35 + 0.15 * ((k * 37) % 5) / 5;
        b.tube([foot, [foot[0] + Math.cos(a) * L * 0.5, 0.03, foot[2] + Math.sin(a) * L * 0.5], [foot[0] + Math.cos(a + 0.3) * L, 0.0, foot[2] + Math.sin(a + 0.3) * L]], (t) => 0.035 * (1 - t) + 0.005, 8);
      }
      // seed pods on cords from the root's crook
      for (let k = 0; k < 4; k++) {
        const t = 0.45 + k * 0.1;
        const p = path[Math.round(t * 16)];
        const hang = 0.18 + 0.12 * ((k * 3) % 4) / 4;
        b.setColor([0.42, 0.3, 0.16], 3).tube([p, [p[0], p[1] - hang, p[2]]], 0.003, 4);
        teardrop(b, [p[0], p[1] - hang, p[2]], 0.09, 0.03, k * 1.7 + sx, 4, [0.32, 0.17, 0.07]);
        b.setColor([0.3, 0.12, 0.05], 2);
      }
    }
    // pods from the shell's lower flanks
    for (let k = 0; k < 7; k++) {
      const a = Math.PI * 0.6 + (k / 6) * Math.PI * 0.8;
      const p = ring(a, R + 0.07, Dp * (0.2 + 0.6 * ((k * 5) % 7) / 7));
      const hang = 0.16 + 0.2 * ((k * 3) % 5) / 5;
      b.setColor([0.42, 0.3, 0.16], 3).tube([p, [p[0], p[1] - hang, p[2]]], 0.003, 4);
      teardrop(b, [p[0], p[1] - hang, p[2]], 0.08, 0.026, k * 2.3, 4, [0.3, 0.16, 0.06]);
    }
    // ---------------------------------------------------------------- the dais
    const [dx, , dz] = DAIS.c, DR = DAIS.r;
    b.push().translate(dx, 0, dz);
    b.setColor([0.07, 0.06, 0.075], 5).lathe([[0.001, 0], [DR - 0.1, 0], [DR - 0.02, -0.02], [DR + 0.02, -0.08], [DR + 0.02, -0.16]], 128);
    b.setColor([0.05, 0.045, 0.05], 7).lathe([[DR + 0.02, -0.16], [DR - 0.1, -0.34], [DR * 0.8, -0.6], [DR * 0.5, -1.1], [DR * 0.25, -1.6], [0.05, -2.1], [0.001, -2.2]], 64);
    b.pop();
    // roots hanging from under it into the void
    b.setColor([0.06, 0.04, 0.035], 7);
    for (let k = 0; k < 22; k++) {
      const a = k * 2.399, r0 = DR * (0.35 + 0.6 * ((k * 7) % 11) / 11);
      const x = dx + Math.cos(a) * r0, z = dz + Math.sin(a) * r0;
      const y0 = -0.3 - (1 - r0 / DR) * 1.2;
      const L = 1.2 + 2.5 * ((k * 5) % 9) / 9;
      const path: V3[] = [];
      for (let i = 0; i <= 8; i++) { const t = i / 8; path.push([x + Math.sin(t * 3 + k) * 0.15 * t, y0 - L * t, z + Math.cos(t * 2.5 + k) * 0.15 * t]); }
      b.tube(path, (t) => 0.05 * (1 - t) + 0.004, 7);
    }
    const mb = b.upload(kit, 'drum.body');
    this.body = { vertices: mb.vertices, indices: mb.indices, count: mb.count };
    // ---------------------------------------------------------------- the hide: a polar grid at rest (a, b), uv on the sim
    const hb = new MeshBuilder();
    const RINGS = 110, SEG = 220;
    hb.vertex([0, 0, 0], [0, 0, 1], [0.5, 0.5]);
    for (let i = 1; i <= RINGS; i++) {
      const r = (i / RINGS) * R;
      for (let j = 0; j < SEG; j++) {
        const a = (j / SEG) * Math.PI * 2, x = Math.cos(a) * r, y = Math.sin(a) * r;
        hb.vertex([x, y, 0], [0, 0, 1], [0.5 + x / (2 * R), 0.5 + y / (2 * R)]);
      }
    }
    for (let j = 0; j < SEG; j++) hb.tri(0, 1 + j, 1 + ((j + 1) % SEG));
    for (let i = 1; i < RINGS; i++) {
      const o0 = 1 + (i - 1) * SEG, o1 = 1 + i * SEG;
      for (let j = 0; j < SEG; j++) { const j1 = (j + 1) % SEG; hb.tri(o0 + j, o1 + j, o1 + j1).tri(o0 + j, o1 + j1, o0 + j1); }
    }
    this.hide = hb.upload(kit, 'drum.hide');
    // ---------------------------------------------------------------- the simulation
    this.sim = kit.pingpong((i) => kit.texture({ label: `hide.sim${i}`, format: 'rg32float', size: [N, N], usage: ['sample', 'storage', 'copy-dst'] }), 'hide.sim');
    this.SU = kit.uniforms(membraneShader.structs.SimU, 'hide.sim');
    const lam2 = ((C_WAVE * DT) / H) ** 2, mu2 = ((KAPPA * DT) / (H * H)) ** 2;
    this.SU.set({ sim: [R, H, lam2, mu2] as never, sim2: [SIGMA0 * DT, (2 * SIGMA1 * DT) / (H * H), 0, 0] as never });
    for (let i = 0; i < K_MAX; i++) {
      const u = kit.uniforms(membraneShader.structs.Contact, `hide.contact${i}`);
      this.contacts.push(u);
      const step = kit.compute(membraneShader, {
        label: `hide.step${i}`, entry: 'step', bind: { D: this.SU, C: u, simIn: this.sim.read, simOut: this.sim.write } as never, threads: [N, N],
        enabled: () => i < this.K,
      }) as Compute;
      const sw = kit.action(() => { if (i < this.K) this.sim.flip(); }, `hide.swap${i}`);
      this.steps.push(step, sw);
    }
    this.propU = kit.uniforms(drumShader.structs.PropU, 'drum.prop');
    this.propU.set({ model: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as never });
    this.U = kit.uniforms(drumShader.structs.DrumU, 'drum');
    this.U.set({ sim: [R, H, lam2, mu2] as never, sim2: [0, 0, 0, Number(new URLSearchParams(globalThis.location?.search ?? '').get('hidegain') ?? 1)] as never, center: [...DRUM.c, 0] as never, look: [3, 1, 0, 1] as never });
  }

  async loadTextures() {
    const load = async (url: string) => {
      const name = url.split('/').pop()!;
      const blob = await (await fetch(url)).blob();
      const bmp = await createImageBitmap(blob);
      const t = this.kit.texture({ label: name, format: 'rgba8unorm', size: [bmp.width, bmp.height], mips: 'full', usage: ['sample', 'copy-dst', 'render'] });
      t.writeImage(bmp);
      // (its mips made once their pipeline's compiled: a run before then is passed over, and they'd stay black)
      const mips = new MipChain(this.kit, t);
      await this.kit.ready([mips]);
      this.kit.run([mips]);
      return t;
    };
    [this.hideTex, this.rimTex] = await Promise.all([load(new URL('./assets/hide.jpg', import.meta.url).href), load(new URL('./assets/rim.jpg', import.meta.url).href)]);
  }

  /** this frame's steps of the hide: as many as the membrane's clock moved (film dt × membranePace(rate)), each
   *  with where the beater's head was at that instant (its story time, spread over the frame's) */
  advance(dtFilm: number, rate: number, story0: number, story1: number, head: HeadAt) {
    const dSigma = Math.min(dtFilm, 0.1) * membranePace(rate);
    this.acc += dSigma;
    const K = Math.min(K_MAX, Math.floor(this.acc / DT));
    this.acc -= K * DT;
    if (this.acc > DT * 4) this.acc = 0;
    this.K = K;
    const [cx, cy, cz] = DRUM.c;
    for (let i = 0; i < K; i++) {
      const s = story0 + ((i + 1) / K) * (story1 - story0);
      const h = head(s);
      let k = [0, 0, 0, 0];
      if (h) {
        const front = h.c[0] + h.r - cx;
        if (front > -0.003) k = [h.c[2] - cz, h.c[1] - cy, front, h.r];
      }
      this.contacts[i].set({ k: k as never });
    }
  }
  /** the sim's steps, for the frame's run list */
  get run(): RunEntry[] { return this.steps; }

  /** what every draw of drum.wgsl binds (the beater's own model matrix stands in for the drum's draws) */
  bindings() { return { D: this.U, simTex: this.sim.read, hideTex: this.hideTex, rimTex: this.rimTex, PM: this.propU }; }
  propU!: UniformBuffer<any>;

  draw(pass: RenderPass) {
    const bind = this.bindings();
    pass.draw(drumShader, { label: 'drum.body', vertex: 'vsBody', fragment: 'fsBody', cull: 'none', count: this.body.count,
      indices: { buffer: this.body.indices, format: 'uint32' }, bind: { ...bind, verts: this.body.vertices } as never });
    pass.draw(drumShader, { label: 'drum.hide', vertex: 'vsHide', fragment: 'fsHide', cull: 'none', count: this.hide.count,
      indices: { buffer: this.hide.indices, format: 'uint32' }, bind: { ...bind, verts: this.hide.vertices } as never });
  }
  /** the drum's look this frame: the inner light's flicker, the time */
  look(t: number, glow: number, rock = 0) {
    this.U.set({ look: [3, glow, t, 0.85 + 0.15 * Math.sin(t * 7.1) * Math.sin(t * 3.3)] as never, center: [...DRUM.c, rock] as never });
  }
}

/** the beater: a carved shaft, a cord-wrapped grip, a padded leather head netted with cord — built about its grip
 *  (the middle of the fist) with the shaft along +y to the head's centre at `reach`; posed each frame from the hand */
export class Beater {
  private mesh: { vertices: StorageBuffer; indices: StorageBuffer; count: number };
  readonly U: UniformBuffer<any>;
  constructor(readonly kit: Kit, readonly reach: number, readonly headR: number) {
    const b = new MeshBuilder();
    const shaft: V3[] = [];
    for (let i = 0; i <= 20; i++) shaft.push([0, -0.13 + (i / 20) * (reach - headR * 0.4 + 0.13), 0]);
    b.setColor([0.16, 0.07, 0.035], 8).tube(shaft, (t) => 0.0175 - 0.004 * t + 0.003 * Math.exp(-t * 30), 14);
    b.push().translate(0, -0.13, 0).setColor([0.2, 0.09, 0.04], 8).sphere(0.024, 12, 8).pop();
    // the grip's cord
    b.setColor([0.45, 0.32, 0.16], 3);
    for (let i = 0; i < 9; i++) {
      const y = -0.07 + i * 0.016, ring: V3[] = [];
      for (let k = 0; k <= 16; k++) { const a = (k / 16) * Math.PI * 2; ring.push([Math.cos(a) * 0.0195, y + (k / 16) * 0.012, Math.sin(a) * 0.0195]); }
      b.tube(ring, 0.0035, 5);
    }
    // the head and its net of cord
    b.push().translate(0, reach, 0).setColor([0.42, 0.26, 0.13], 9).sphere(headR, 28, 20).pop();
    b.setColor([0.3, 0.2, 0.1], 3);
    for (let m = 0; m < 6; m++) {
      const az = (m / 6) * Math.PI, ring: V3[] = [];
      for (let k = 0; k <= 32; k++) { const a = (k / 32) * Math.PI * 2; ring.push([Math.cos(a) * Math.cos(az) * headR * 1.01, reach + Math.sin(a) * headR * 1.01, Math.cos(a) * Math.sin(az) * headR * 1.01]); }
      b.tube(ring, 0.0028, 4);
    }
    const ring: V3[] = [];
    for (let k = 0; k <= 32; k++) { const a = (k / 32) * Math.PI * 2; ring.push([Math.cos(a) * headR * 0.72, reach - headR * 0.7, Math.sin(a) * headR * 0.72]); }
    b.tube(ring, 0.006, 5);
    this.mesh = b.upload(kit, 'beater');
    this.U = kit.uniforms(drumShader.structs.PropU, 'beater');
  }
  /** placed: its grip at `hand`, its shaft along `shaft` (unit), turned so `side` is its x */
  place(hand: V3, shaft: V3, side: V3) {
    const y = shaft;
    let x = sub3(side, scale3(y, dot3(side, y)));
    const l = Math.hypot(x[0], x[1], x[2]) || 1;
    x = [x[0] / l, x[1] / l, x[2] / l];
    const z: V3 = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
    this.U.set({ model: [x[0], x[1], x[2], 0, y[0], y[1], y[2], 0, z[0], z[1], z[2], 0, hand[0], hand[1], hand[2], 1] as never });
  }
  draw(pass: RenderPass, drum: Drum) {
    pass.draw(drumShader, { label: 'beater', vertex: 'vsProp', fragment: 'fsBody', cull: 'none', count: this.mesh.count,
      indices: { buffer: this.mesh.indices, format: 'uint32' }, bind: { ...drum.bindings(), PM: this.U, verts: this.mesh.vertices } as never });
  }
}
const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale3 = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
