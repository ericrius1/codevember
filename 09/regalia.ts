// Her regalia, laid on her at run time (the ceremonial dress's layers the Blender build doesn't make):
//   - cards anchored to points of her mesh (their bind position, normal, bones and weights taken from the DNC1
//     vertex there) and skinned on the GPU by the same bones: a mantle of beetle-wing scales and leaves over her
//     shoulders, chest and back; tiers of long scales down the skirt, shingled; glowing flowers in the vines; a crown
//     of leaves round her head.
//   - strands (src/rig/strands.ts) rooted on her bones: rope locks with glass and gold beads down her back, the
//     headdress's fibre-optic filaments with their glowing tips, seed pods on cords from the mantle's front, the
//     sash's two tails.
import type { Kit, RenderPass, StorageBuffer, UniformBuffer } from '@ericrius1/weft';
import type { HeroAsset } from '../src/rig/hero/asset';
import type { HeroRig } from '../src/rig/hero/rig';
import { Strands, type ChainSpec, type Capsule } from '../src/rig/strands';
import { type V3, norm, cross, add, scale, sub } from '../src/rig/hero/math';
import regaliaShader from './regalia.wgsl';

interface Anchor { p: V3; n: V3; mat: number; bones: number; weights: number }
/** every vertex of her mesh as an anchor: its bind position and normal, its material, its bones and weights (packed) */
function anchorsOf(a: HeroAsset): Anchor[] {
  const h = a.header, v = a.verts, n = h.verts, S = h.stride;
  const dv = new DataView(v.buffer, v.byteOffset, v.byteLength);
  const out: Anchor[] = [];
  for (let i = 0; i < n; i++) {
    const o = i * S;
    const q = [dv.getUint16(o, true), dv.getUint16(o + 2, true), dv.getUint16(o + 4, true)];
    const p: V3 = [0, 1, 2].map((k) => h.qmin[k] + (q[k] / 65535) * (h.qmax[k] - h.qmin[k])) as V3;
    const nn: V3 = norm([dv.getInt8(o + 8) / 127, dv.getInt8(o + 9) / 127, dv.getInt8(o + 10) / 127]);
    out.push({ p, n: nn, mat: dv.getUint16(o + 6, true) & 255, bones: dv.getUint32(o + 16, true), weights: dv.getUint32(o + 20, true) });
  }
  return out;
}
/** a seeded random */
function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

const CARD_BYTES = 64;
const KIND = { scale: 0, leaf: 1, gold: 2, flower: 3 };

export class Regalia {
  readonly U: UniformBuffer<any>;
  private cards: StorageBuffer; private nCards: number;
  private ptsBuf: StorageBuffer; private segs: StorageBuffer; private nSegs: number;
  private beadsBuf: StorageBuffer; private nBeads: number;
  readonly strands: Strands;
  private caps: Capsule[] = [];

  constructor(readonly kit: Kit, readonly rig: HeroRig, readonly dq: StorageBuffer) {
    const asset = rig.asset;
    const A = anchorsOf(asset);
    const B = asset.bones, I = asset.index;
    const rand = rng(9);
    const list: { a: Anchor; L: number; W: number; kind: number; lift: number; out: number; hue: number }[] = [];
    // ---------------------------------------------------------------- the mantle: over the shoulders, chest, back
    const neckY = B[I.neck].head[1], shY = B[I.uarmL].head[1], shX = Math.abs(B[I.uarmL].head[0]);
    const top = neckY + 0.02, bottom = shY - 0.2;
    const picked: V3[] = [];
    const tooClose = (p: V3, d: number) => picked.some((q) => (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2 < d * d);
    const tunic = A.filter((a) => (a.mat === 1 || a.mat === 5) && a.p[1] > bottom && a.p[1] < top && Math.abs(a.p[0]) < shX + 0.07);
    for (let tries = 0; tries < 9000 && picked.length < 520; tries++) {
      const a = tunic[Math.floor(rand() * tunic.length)];
      // (not up the front of the neck: the collar shows)
      if (a.p[1] > neckY - 0.02 && a.p[2] > 0 && Math.abs(a.p[0]) < 0.07) continue;
      if (tooClose(a.p, 0.024)) continue;
      picked.push(a.p);
      const u = (a.p[1] - bottom) / (top - bottom);
      const r = rand();
      const kind = r < 0.68 ? KIND.scale : r < 0.95 ? KIND.leaf : KIND.flower;
      list.push({ a, kind, L: kind === KIND.leaf ? 0.13 + 0.05 * rand() : 0.1 + 0.04 * rand() + 0.04 * (1 - u), W: kind === KIND.flower ? 0.016 : kind === KIND.leaf ? 0.03 : 0.028,
        lift: 0.18 + 0.15 * rand(), out: 0.008 + 0.012 * (1 - u), hue: rand() });
    }
    // ---------------------------------------------------------------- the skirt: tiers of long scales, shingled
    const skirt = A.filter((a) => a.mat === 2);
    let ymin = 9, ymax = -9;
    for (const a of skirt) { ymin = Math.min(ymin, a.p[1]); ymax = Math.max(ymax, a.p[1]); }
    const tier = 0.155;
    for (let y = ymax - 0.06, k = 0; y > ymin + 0.12; y -= tier, k++) {
      const row = skirt.filter((a) => Math.abs(a.p[1] - y) < 0.012);
      if (!row.length) continue;
      const bins = new Map<number, Anchor>();
      const nb = 62;
      for (const a of row) {
        const az = Math.atan2(a.p[0], a.p[2]);
        const b = Math.floor(((az / (Math.PI * 2)) + 0.5 + (k % 2) * 0.5 / nb) * nb) % nb;
        const best = bins.get(b);
        if (!best || Math.abs(best.p[1] - y) > Math.abs(a.p[1] - y)) bins.set(b, a);
      }
      for (const a of bins.values()) {
        const r = rand();
        list.push({ a, kind: r < 0.9 ? KIND.scale : r < 0.97 ? KIND.leaf : KIND.flower, L: tier * 1.28, W: 0.036, lift: 0.04 + 0.05 * rand(), out: 0.006 + 0.002 * k, hue: rand() });
      }
    }
    // ---------------------------------------------------------------- the crown of leaves (on her head's bone)
    const eye = asset.header.eye;
    const Hc: V3 = [0, eye.y + 0.035, eye.z - 0.085];
    const headBone = I.head;
    for (let k = 0; k < 34; k++) {
      const az = (k / 34) * Math.PI * 2 + 0.1 * rand();
      if (Math.abs(Math.atan2(Math.sin(az), Math.cos(az))) < 0.5) continue;
      const el = 0.45 + 0.25 * rand();
      const d: V3 = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
      const p = add(Hc, scale(d, 0.112));
      list.push({ a: { p, n: d, mat: 0, bones: headBone, weights: 255 }, kind: KIND.leaf, L: 0.11 + 0.06 * rand(), W: 0.028, lift: 1.75 + 0.35 * rand(), out: 0.0, hue: rand() });
    }
    // ---------------------------------------------------------------- packed for the GPU
    this.nCards = list.length;
    const buf = new ArrayBuffer(list.length * CARD_BYTES);
    const f = new Float32Array(buf), u = new Uint32Array(buf);
    list.forEach((c, i) => {
      const o = i * 16;
      f.set([c.a.p[0], c.a.p[1], c.a.p[2], c.L, c.a.n[0], c.a.n[1], c.a.n[2], c.W], o);
      u.set([c.a.bones >>> 0, c.a.weights >>> 0, c.kind, Math.floor(rand() * 65535)], o + 8);
      f.set([c.lift, c.out, c.hue, 0], o + 12);
    });
    this.cards = kit.storage({ label: 'regalia.cards', data: buf });

    // ---------------------------------------------------------------- the strands
    const specs: ChainSpec[] = [];
    const kinds: number[] = [];
    const bp = (bone: number, p: V3) => rig.skinPoint(bone, p);
    const bd = (bone: number, d: V3) => norm(rig.skinDir(bone, d));
    // rope locks from the back of her head
    for (let k = 0; k < 30; k++) {
      const az = Math.PI * (0.55 + 0.9 * (k % 10) / 9) + 0.05 * rand();
      const el = -0.3 + 0.26 * Math.floor(k / 10) + 0.08 * rand();
      const d: V3 = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
      const p = add(Hc, scale(d, 0.112));
      const rest = norm(add(d, [0, -1.4, 0]));
      const n = 9 + Math.floor(rand() * 4);
      specs.push({ root: () => ({ p: bp(headBone, p), dir: bd(headBone, rest) }), n, seg: 0.058, stiff: 0.06, falloff: 3, r0: 0.0092, r1: 0.007, grav: 1, drag: 2.2, follow: 0.85 });
      kinds.push(0);
    }
    // the headdress's filaments: a ring over her crown, springing up and out
    for (let k = 0; k < 52; k++) {
      const az = (k / 52) * Math.PI * 2;
      const front = Math.cos(az);
      const el = 0.42 + 0.15 * rand() - 0.1 * front;
      const d: V3 = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
      const p = add(Hc, scale(d, 0.115));
      const rest = norm(add(d, [0, 0.55 + 0.3 * rand(), -0.2]));
      specs.push({ root: () => ({ p: bp(headBone, p), dir: bd(headBone, rest) }), n: 9, seg: 0.05 + 0.02 * rand() - 0.015 * Math.max(0, front), stiff: 0.22, falloff: 1.6, r0: 0.0022, r1: 0.0013, grav: 0.7, drag: 3.0, follow: 0.25 });
      kinds.push(rand() < 0.5 ? 1 : 4);
    }
    // seed pods on cords from the mantle's front and sides
    const chest = I.chest;
    for (let k = 0; k < 16; k++) {
      const az = -1.25 + 2.5 * (k / 15);
      const y = bottom + 0.02 + 0.03 * Math.cos(az * 2);
      const tun = tunic.reduce((best, a) => {
        const da = Math.abs(Math.atan2(a.p[0], a.p[2]) - az) + Math.abs(a.p[1] - y) * 4;
        return da < best.d ? { a, d: da } : best;
      }, { a: tunic[0], d: 1e9 }).a;
      const p = add(tun.p, scale(tun.n, 0.02));
      specs.push({ root: () => ({ p: bp(chest, p), dir: [0, -1, 0] }), n: 5, seg: 0.035 + 0.015 * rand(), stiff: 0.02, r0: 0.0022, r1: 0.0022, grav: 1, drag: 1.2, follow: 1 });
      kinds.push(2);
    }
    // the sash's two tails from its knot in front
    const pel = I.pelvis;
    for (const sx of [-1, 1]) {
      const front = A.filter((a) => a.mat === 7 && Math.abs(a.p[0] - sx * 0.03) < 0.02 && a.p[2] > 0).sort((a, b) => b.p[2] - a.p[2])[0];
      const p = front ? add(front.p, [0, -0.01, 0.012]) : [sx * 0.03, 0.95, 0.15] as V3;
      specs.push({ root: () => ({ p: bp(pel, p), dir: bd(pel, norm([sx * 0.15, -1, 0.15])) }), n: 10, seg: 0.058, stiff: 0.05, r0: 0.018, r1: 0.016, grav: 1, drag: 2.5, follow: 1 });
      kinds.push(3);
    }
    this.strands = new Strands(specs);
    // segments: each link of each chain, its kind and where along it
    const segs: number[] = [];
    specs.forEach((s, c) => {
      const o = this.strands.start(c);
      for (let i = 0; i < s.n - 1; i++) {
        const ta = Math.round((i / (s.n - 1)) * 65535), tb = Math.round(((i + 1) / (s.n - 1)) * 65535);
        segs.push(o + i, o + i + 1, kinds[c], ta | (tb << 16));
      }
    });
    this.nSegs = segs.length / 4;
    this.segs = kit.storage({ label: 'regalia.segs', data: new Uint32Array(segs) });
    // beads: glass and gold on the locks, a pod at each cord's end, a light at each filament's tip
    const beads: number[] = [];
    specs.forEach((s, c) => {
      const o = this.strands.start(c), k = kinds[c];
      if (k === 0) for (let i = 3; i < s.n - 1; i += 3) beads.push(o + i, rand() < 0.3 ? 1 : 0, Math.round((0.012 + 0.003 * rand()) * 10000), Math.floor(rand() * 65535));
      if (k === 1 || k === 4) beads.push(o + s.n - 1, 3, Math.round(0.0065 * 10000), k === 4 ? 60000 : 1000);
      if (k === 2) beads.push(o + s.n - 1, 2, Math.round(0.016 * 10000), Math.floor(rand() * 65535));
    });
    this.nBeads = beads.length / 4;
    this.beadsBuf = kit.storage({ label: 'regalia.beads', data: new Uint32Array(beads) });
    this.ptsBuf = kit.storage({ label: 'regalia.points', size: this.strands.pts.byteLength, usage: ['storage', 'copy-dst'] });
    this.U = kit.uniforms(regaliaShader.structs.RegU, 'regalia');
  }

  /** the body's capsules this frame (what the strands keep out of) */
  private body() {
    const r = this.rig, B = r.asset.bones, I = r.asset.index;
    const j = (n: string, end: 'head' | 'tail' = 'head') => r.skinPoint(I[n], B[I[n]][end]);
    const eye = r.asset.header.eye;
    const hc = r.skinPoint(I.head, [0, eye.y + 0.035, eye.z - 0.085]);
    this.caps = [
      { a: hc, b: hc, r: 0.115 },
      { a: j('neck'), b: j('head'), r: 0.065 },
      { a: j('chest'), b: j('neck'), r: 0.14 },
      { a: j('spine'), b: j('chest'), r: 0.13 },
      { a: j('pelvis'), b: j('spine'), r: 0.14 },
      { a: j('uarmL'), b: j('farmL'), r: 0.06 }, { a: j('uarmR'), b: j('farmR'), r: 0.06 },
      { a: j('clavL'), b: j('uarmL'), r: 0.07 }, { a: j('clavR'), b: j('uarmR'), r: 0.07 },
      { a: j('thighL'), b: j('shinL'), r: 0.1 }, { a: j('thighR'), b: j('shinR'), r: 0.1 },
    ];
  }

  /** a step on the story clock: the breeze, and the great stroke's shock (`shock`: its origin, how hard it's pushing
   *  now, m/s²) */
  step(ds: number, shock: { o: V3; a: number } | null, fwd: V3, t: number, flash: number, pulse: number, push: number) {
    this.body();
    const breeze = (p: V3): V3 => [0.25 * Math.sin(t * 0.7 + p[1] * 3), 0.05 * Math.sin(t * 1.1 + p[0] * 4), 0.2 * Math.cos(t * 0.5 + p[2] * 3)];
    const sh = shock && shock.a > 0 ? (p: V3): V3 => {
      const d = sub(p, shock.o);
      const l = Math.hypot(d[0], d[1], d[2]) || 1;
      const k = shock.a / (1 + l * l * 0.6);
      return scale(norm(add(d, [0, 0.3 * l, 0])), k);
    } : null;
    this.strands.step(ds, this.caps, breeze, sh);
    this.ptsBuf.write(this.strands.pts);
    this.U.set({ look: [t, push, flash, pulse] as never, fwd: [...fwd, 0] as never });
  }

  /** let the strands hang where the body is now (a still, a jump in time): `seconds` of their own settling */
  settle(seconds: number, fwd: V3, t: number) {
    for (let i = 0; i < Math.round(seconds * 60); i++) { this.body(); this.strands.step(1 / 60, this.caps, () => [0, 0, 0], null); }
    this.ptsBuf.write(this.strands.pts);
    void fwd; void t;
  }

  draw(pass: RenderPass) {
    const bind = { R: this.U, DQ: this.dq, cards: this.cards, pts: this.ptsBuf, segs: this.segs, beads: this.beadsBuf } as never;
    pass.draw(regaliaShader, { label: 'regalia.cards', vertex: 'vsCard', fragment: 'fsCard', cull: 'none', count: 6 * 2 * 6, instances: this.nCards, bind });
    pass.draw(regaliaShader, { label: 'regalia.strands', vertex: 'vsTube', fragment: 'fsTube', cull: 'none', count: 6 * 8, instances: this.nSegs, bind });
    pass.draw(regaliaShader, { label: 'regalia.beads', vertex: 'vsBead', fragment: 'fsBead', cull: 'back', count: 6 * 8 * 6, instances: this.nBeads, bind });
  }
}
void cross;
