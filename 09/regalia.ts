// Her regalia, laid on her at run time (the ceremonial dress's layers the Blender build doesn't make):
//   - cards anchored to points of her mesh (their bind position, normal, bones and weights taken from the DNC1
//     vertex there) and skinned on the GPU by the same bones: a mantle of beetle-wing scales and leaves over her
//     shoulders, chest and back; tiers of long scales down the skirt, shingled; glowing flowers in the vines; a crown
//     of leaves round her head.
//   - strands (hair.ts, on src/rig/strands.ts) rooted on her bones: rope locks with glass and gold beads, gold coils and
//     bone pins down her back, bead strings from her diadem's temples, seed pods on cords from the mantle's front, the
//     sash's two tails.
//   - her headdress (ornaments.ts): the diadem, its seed-stone, the nimbus.
import type { Kit, RenderPass, StorageBuffer, UniformBuffer } from '@ericrius1/weft';
import type { HeroAsset } from '../src/rig/hero/asset';
import type { HeroRig } from '../src/rig/hero/rig';
import { Hair, anchorsOf, rng, fitBand, onBand, type Anchor } from './hair';
import { Ornaments } from './ornaments';
import { type V3, norm } from '../src/rig/hero/math';
import regaliaShader from './regalia.wgsl';

const CARD_BYTES = 64;
const KIND = { scale: 0, leaf: 1, gold: 2, flower: 3 };

export class Regalia {
  readonly U: UniformBuffer<any>;
  private cards: StorageBuffer; private nCards: number;
  private ptsBuf: StorageBuffer; private segs: StorageBuffer; private nSegs: number;
  private beadsBuf: StorageBuffer; private nBeads: number;
  readonly strands: Hair['strands'];
  readonly hair: Hair;
  readonly ornaments: Ornaments;

  constructor(readonly kit: Kit, readonly rig: HeroRig, readonly dq: StorageBuffer) {
    const asset = rig.asset;
    const A = anchorsOf(asset);
    const B = asset.bones, I = asset.index;
    const rand = rng(9);
    const list: { a: Anchor; L: number; W: number; kind: number; lift: number; out: number; hue: number; lean?: number }[] = [];
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
    // ---------------------------------------------------------------- the crown of leaves (on her head's bone): rising from
    // the diadem's top edge all round but its front, swept up and back
    const headBone = I.head;
    const band = fitBand(asset, A);
    // (green leaves standing up off the band all round but its front, swept back toward the nape, a laurel's way; gold
    // leaves between them, a little shorter; and over the seed-stone a peak of three gold leaves — a crown that reads
    // as one from every side)
    const leafAt = (az: number, dy: number, dr: number, kind: number, L: number, W: number, lift: number, lean: number) => {
      const p = onBand(band, az, dy, dr);
      const n: V3 = norm([Math.sin(az), 0.35, Math.cos(az)]);
      list.push({ a: { p, n, mat: 0, bones: headBone, weights: 255 }, kind, L, W, lift, out: 0.0, hue: rand(), lean });
    };
    for (let k = 0; k < 36; k++) {
      const az = ((k + 0.5) / 36) * Math.PI * 2 - Math.PI + 0.04 * rand();
      if (Math.abs(az) < 0.4) continue;
      const back = Math.abs(az) / Math.PI;
      leafAt(az, 0.005 + 0.004 * rand(), 0.001, KIND.leaf, 0.075 + 0.03 * rand() + 0.025 * back, 0.024, 2.72 + 0.14 * rand(), -Math.sign(az) * (0.7 + 0.2 * rand()));
    }
    for (let k = 0; k < 26; k++) {
      const az = (k / 26) * Math.PI * 2 - Math.PI + 0.03 * rand();
      if (Math.abs(az) < 0.3) continue;
      leafAt(az, 0.008, 0.003, KIND.gold, 0.055 + 0.015 * rand(), 0.015, 2.85, -Math.sign(az) * 0.55);
    }
    leafAt(0, 0.012, 0.004, KIND.gold, 0.06, 0.017, 3.02, 0);
    for (const sd of [-1, 1]) leafAt(sd * 0.13, 0.009, 0.003, KIND.gold, 0.046, 0.015, 2.95, -sd * 0.35);
    // ---------------------------------------------------------------- packed for the GPU
    this.nCards = list.length;
    const buf = new ArrayBuffer(list.length * CARD_BYTES);
    const f = new Float32Array(buf), u = new Uint32Array(buf);
    list.forEach((c, i) => {
      const o = i * 16;
      f.set([c.a.p[0], c.a.p[1], c.a.p[2], c.L, c.a.n[0], c.a.n[1], c.a.n[2], c.W], o);
      u.set([c.a.bones >>> 0, c.a.weights >>> 0, c.kind, Math.floor(rand() * 65535)], o + 8);
      f.set([c.lift, c.out, c.hue, c.lean ?? 0], o + 12);
    });
    this.cards = kit.storage({ label: 'regalia.cards', data: buf });

    // ---------------------------------------------------------------- the strands (hair.ts)
    this.hair = new Hair(rig, A);
    this.strands = this.hair.strands;
    const specs = this.hair.specs, kinds = this.hair.kinds;
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
    // beads (hair.ts): glass and gold, coils and bone pins on the locks, the temple strings' beads and their filigree
    // pods, a pod at each cord's end
    const beads: number[] = [];
    for (const bd of this.hair.beads) beads.push(bd.at, bd.kind, Math.round(bd.r * 10000), Math.floor(bd.seed * 65535));
    this.nBeads = beads.length / 4;
    this.beadsBuf = kit.storage({ label: 'regalia.beads', data: new Uint32Array(beads) });
    this.ptsBuf = kit.storage({ label: 'regalia.points', size: this.strands.pts.byteLength, usage: ['storage', 'copy-dst'] });
    this.U = kit.uniforms(regaliaShader.structs.RegU, 'regalia');
    // her headdress: the diadem, its stone, the nimbus (ornaments.ts)
    this.ornaments = new Ornaments(kit, asset, A, dq);
  }

  /** a step on the story clock (hair.ts), and the look's numbers for the shader */
  step(ds: number, hit: V3, fwd: V3, t: number, flash: number, pulse: number, push: number) {
    this.hair.step(ds, t, hit);
    this.ptsBuf.write(this.strands.pts);
    this.U.set({ look: [t, push, flash, pulse] as never, fwd: [...fwd, 0] as never });
    this.ornaments.set(t, flash, pulse, push);
  }

  /** let the strands hang where the body is now (a still, a jump in time): `seconds` of their own settling */
  settle(seconds: number) {
    this.hair.settle(seconds);
    this.ptsBuf.write(this.strands.pts);
  }

  draw(pass: RenderPass) {
    const bind = { R: this.U, DQ: this.dq, cards: this.cards, pts: this.ptsBuf, segs: this.segs, beads: this.beadsBuf } as never;
    pass.draw(regaliaShader, { label: 'regalia.cards', vertex: 'vsCard', fragment: 'fsCard', cull: 'none', count: 6 * 2 * 6, instances: this.nCards, bind });
    pass.draw(regaliaShader, { label: 'regalia.strands', vertex: 'vsTube', fragment: 'fsTube', cull: 'none', count: 6 * 8, instances: this.nSegs, bind });
    this.ornaments.draw(pass);
    pass.draw(regaliaShader, { label: 'regalia.beads', vertex: 'vsBead', fragment: 'fsBead', cull: 'back', count: 6 * 8 * 6, instances: this.nBeads, bind });
  }
}
