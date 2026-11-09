// Her strands on the CPU (src/rig/strands.ts): the rope locks down her back, the bead strings from her diadem, the seed
// pods' cords, the sash's tails — laid out on her mesh and bones, kept out of her body, blown by the air and the great
// stroke's shock. No GPU here: regalia.ts draws them, and the motion's tools (09/lab) read them as the picture does.
import type { HeroAsset } from '../src/rig/hero/asset';
import type { HeroRig } from '../src/rig/hero/rig';
import { Strands, type ChainSpec, type Capsule } from '../src/rig/strands';
import { type V3, norm, add, scale, sub } from '../src/rig/hero/math';
import { BIG, story, STORY_LOOP } from './score';

export interface Anchor { p: V3; n: V3; mat: number; bones: number; weights: number }
/** every vertex of her mesh as an anchor: its bind position and normal, its material, its bones and weights (packed) */
export function anchorsOf(a: HeroAsset): Anchor[] {
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
export function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/** the regalia's shared measures on her bind pose: the head's centre, the mantle's band, the tunic's anchors */
export function measures(a: HeroAsset, A: Anchor[]) {
  const B = a.bones, I = a.index;
  const neckY = B[I.neck].head[1], shY = B[I.uarmL].head[1], shX = Math.abs(B[I.uarmL].head[0]);
  const top = neckY + 0.02, bottom = shY - 0.2;
  const tunic = A.filter((x) => (x.mat === 1 || x.mat === 5) && x.p[1] > bottom && x.p[1] < top && Math.abs(x.p[0]) < shX + 0.07);
  const eye = a.header.eye;
  const Hc: V3 = [0, eye.y + 0.035, eye.z - 0.085];
  return { neckY, shY, shX, top, bottom, tunic, Hc };
}

/** the band round her head: where it sits (bind space) at each azimuth (0 her front, + toward her left) */
export interface Band { y: (az: number) => number; r: (az: number) => number; zc: number }

/** fit the diadem's band to her head's mesh: its height dipping to the brow in front, its radius just over her skin
 *  and hair there */
export function fitBand(a: HeroAsset, A: Anchor[]): Band {
  const hb = a.index.head, eye = a.header.eye;
  const zc = eye.z - 0.085;
  const head = A.filter((x) => (x.bones & 255) === hb && (x.weights & 255) > 100);
  const y = (az: number) => eye.y + 0.068 + 0.016 * (1 - Math.cos(az)) * 0.5 - 0.004 * Math.exp(-az * az * 30);
  const N = 72, rr = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const az = (i / N) * Math.PI * 2 - Math.PI, yy = y(az);
    let r = 0.09;
    for (const x of head) {
      if (Math.abs(x.p[1] - yy) > 0.007) continue;
      const aa = Math.atan2(x.p[0], x.p[2] - zc);
      if (Math.abs(Math.atan2(Math.sin(aa - az), Math.cos(aa - az))) > 0.09) continue;
      r = Math.max(r, Math.hypot(x.p[0], x.p[2] - zc));
    }
    rr[i] = r;
  }
  // (smoothed round the ring: a band, not every lock's bump)
  const sm = Array.from(rr, (_, i) => { let s = 0, w = 0; for (let d = -3; d <= 3; d++) { const k = Math.exp(-d * d / 4); s += rr[(i + d + N) % N] * k; w += k; } return s / w; });
  const r = (az: number) => {
    const f = ((az + Math.PI) / (Math.PI * 2)) * N, i = Math.floor(f), u = f - i;
    return sm[((i % N) + N) % N] * (1 - u) + sm[(((i + 1) % N) + N) % N] * u + 0.0045;
  };
  return { y, r, zc };
}

/** a point on the band at azimuth az, raised by dy and out by dr */
export function onBand(b: Band, az: number, dy = 0, dr = 0): V3 {
  const r = b.r(az) + dr;
  return [Math.sin(az) * r, b.y(az) + dy, b.zc + Math.cos(az) * r];
}

/** where the bead strings hang at her temples (azimuths on the band) */
export const TEMPLES = [-1.12, -0.86, 0.86, 1.12];

/** what each chain is: 0 a lock, 1 a bead string from her temples, 2 a pod's cord, 3 a sash's tail */
export const STRAND = { lock: 0, beads: 1, pod: 2, sash: 3 };
/** what's threaded on them (regalia.wgsl's beads): glass, gold, a seed pod, a gold filigree pod lit from inside, a
 *  carved bone pin, a gold coil round a lock */
export const BEAD = { glass: 0, gold: 1, pod: 2, filigree: 3, pin: 4, coil: 5 };

export class Hair {
  readonly strands: Strands;
  readonly kinds: number[] = [];
  readonly specs: ChainSpec[] = [];
  /** what's threaded on the strands: the point it's at, its kind, its radius (m), a seed (0..1) */
  readonly beads: { at: number; kind: number; r: number; seed: number }[] = [];
  readonly band: Band;
  caps: Capsule[] = [];

  constructor(readonly rig: HeroRig, A: Anchor[] = anchorsOf(rig.asset)) {
    const asset = rig.asset, I = asset.index;
    const { tunic, bottom, Hc } = measures(asset, A);
    const band = this.band = fitBand(asset, A);
    const rand = rng(23);
    const specs = this.specs, kinds = this.kinds;
    const bp = (bone: number, p: V3) => rig.skinPoint(bone, p);
    const bd = (bone: number, d: V3) => norm(rig.skinDir(bone, d));
    const headBone = I.head;
    const threads: { c: number; i: number; kind: number; r: number }[] = [];
    // rope locks from the back of her head, weighted with glass and gold, a coil or a bone pin on some
    for (let k = 0; k < 30; k++) {
      const az = Math.PI * (0.55 + 0.9 * (k % 10) / 9) + 0.05 * rand();
      const el = -0.3 + 0.26 * Math.floor(k / 10) + 0.08 * rand();
      const d: V3 = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
      const p = add(Hc, scale(d, 0.112));
      const rest = norm(add(d, [0, -1.4, 0]));
      const n = 9 + Math.floor(rand() * 4);
      const c = specs.length;
      specs.push({ root: () => ({ p: bp(headBone, p), dir: bd(headBone, rest) }), n, seg: 0.058, bend: 1.5, falloff: 3, r0: 0.0092, r1: 0.007, grav: 1, drag: 3.2, follow: 0.85 });
      kinds.push(STRAND.lock);
      for (let i = 3; i < n - 1; i += 3) threads.push({ c, i, kind: rand() < 0.3 ? BEAD.gold : BEAD.glass, r: 0.012 + 0.003 * rand() });
      const r = rand();
      if (r < 0.22) { threads.push({ c, i: 2, kind: BEAD.pin, r: 0.0075 }); threads.push({ c, i: 3, kind: BEAD.glass, r: 0.0105 }); }
      else if (r < 0.55) threads.push({ c, i: 1 + Math.floor(rand() * 2), kind: BEAD.coil, r: 0.0135 });
    }
    // bead strings from the diadem at her temples: gold and teal glass on a fine thread, a filigree pod at each end
    TEMPLES.forEach((az, j) => {
      const p = onBand(band, az, -0.012, 0.007);
      const n = j === 0 || j === 3 ? 8 : 7;
      const c = specs.length;
      specs.push({ root: () => ({ p: bp(headBone, p), dir: bd(headBone, [Math.sin(az) * 0.15, -1, 0.05]) }), n, seg: 0.019, bend: 0, r0: 0.0011, r1: 0.0011, grav: 1, drag: 2.6, follow: 1 });
      kinds.push(STRAND.beads);
      for (let i = 1; i < n - 1; i++) threads.push({ c, i, kind: i % 2 ? BEAD.gold : BEAD.glass, r: i % 2 ? 0.0034 : 0.0046 });
      threads.push({ c, i: n - 1, kind: BEAD.filigree, r: 0.0085 });
    });
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
      const c = specs.length;
      const n = 5;
      specs.push({ root: () => ({ p: bp(chest, p), dir: [0, -1, 0] }), n, seg: 0.035 + 0.015 * rand(), bend: 0, r0: 0.0022, r1: 0.0022, grav: 1, drag: 1.8, follow: 1 });
      kinds.push(STRAND.pod);
      threads.push({ c, i: n - 1, kind: BEAD.pod, r: 0.016 });
    }
    // the sash's two tails from its knot in front
    const pel = I.pelvis;
    for (const sx of [-1, 1]) {
      const front = A.filter((a) => a.mat === 7 && Math.abs(a.p[0] - sx * 0.03) < 0.02 && a.p[2] > 0).sort((a, b) => b.p[2] - a.p[2])[0];
      const p = front ? add(front.p, [0, -0.01, 0.012]) : [sx * 0.03, 0.95, 0.15] as V3;
      specs.push({ root: () => ({ p: bp(pel, p), dir: bd(pel, norm([sx * 0.15, -1, 0.15])) }), n: 10, seg: 0.058, bend: 1.1, falloff: 2, r0: 0.018, r1: 0.016, grav: 1, drag: 3.2, follow: 1 });
      kinds.push(STRAND.sash);
    }
    this.strands = new Strands(specs);
    for (const t of threads) this.beads.push({ at: this.strands.start(t.c) + t.i, kind: t.kind, r: t.r, seed: rand() });
  }

  /** the body's capsules this frame (what the strands keep out of) */
  body() {
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

  /** the air round her at p, story time t (m/s): a slow swirl, and the great stroke's surge out from the struck
   *  point `hit` (a breath of the shock: it rises over a few hundredths of a second of story time and dies over a few
   *  tenths, so in the slowed moment the strands lift off her and drift back as slowly as everything else) */
  medium(p: V3, t: number, hit: V3): V3 {
    // (its swirl repeats with the loop's story: whole turns of it a loop, so the air at the end is the air at the start)
    const W = (Math.PI * 2) / STORY_LOOP;
    const w: V3 = [
      0.12 * Math.sin(t * 2 * W + p[1] * 2.1) + 0.06 * Math.sin(t * 3 * W + p[2] * 3.0),
      0.04 * Math.sin(t * 2 * W + 1.3 + p[0] * 2.7),
      0.1 * Math.cos(t * W + p[1] * 2.4) + 0.05 * Math.cos(t * 3 * W + 0.7 + p[0] * 3.3),
    ];
    const sb = story(BIG.t), age = t - sb;
    if (age > 0 && age < 3) {
      const d = sub(p, hit), l = Math.hypot(d[0], d[1], d[2]) || 1;
      const k = 4.5 * (1 - Math.exp(-age / 0.02)) * Math.exp(-age / 0.35) / (1 + l * l * 0.5);
      const u = norm(add(d, [0, 0.35 * l, 0]));
      w[0] += u[0] * k; w[1] += u[1] * k; w[2] += u[2] * k;
    }
    return w;
  }

  /** a step on the story clock `ds` to story time `t` (the struck point `hit`, for the great stroke's surge) */
  step(ds: number, t: number, hit: V3) {
    this.body();
    // (the medium's clock: its time at the step's middle)
    const tm = t - ds * 0.5;
    this.strands.step(ds, this.caps, (p) => this.medium(p, tm, hit));
  }

  /** let the strands hang where the body is now (a still, a jump in time): `seconds` of their own settling */
  settle(seconds: number) {
    for (let i = 0; i < Math.round(seconds * 60); i++) { this.body(); this.strands.step(1 / 60, this.caps); }
  }
}
