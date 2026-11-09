// The shaman on the GPU: her DNC1 mesh (Boulder's town pipeline, 09/character), her rig (Boulder's HeroRig with its
// whole-body solver), her bones as dual quaternions each frame, and the uniforms her shader reads.
import type { Kit, RenderPass, StorageBuffer, UniformBuffer } from '@ericrius1/weft';
import { loadHero, VBYTES, MAX_BONES, type HeroAsset } from '../src/rig/hero/asset';
import { HeroRig } from '../src/rig/hero/rig';
import { fitHands } from '../src/rig/town/hands';
import * as solve from '../src/rig/body/solve';
import type { V3 } from '../src/rig/hero/math';
import shamanShader from './shaman.wgsl';

HeroRig.bodyKit = solve;
// (her elbows slide, never flip: the arm fit follows its own minimum frame on frame)
HeroRig.armContinuity = true; HeroRig.armSpring = 30;

const LAYOUT: GPUVertexBufferLayout = {
  arrayStride: VBYTES, attributes: [
    { shaderLocation: 0, offset: 0, format: 'uint16x4' }, { shaderLocation: 1, offset: 8, format: 'snorm8x4' },
    { shaderLocation: 2, offset: 12, format: 'snorm8x4' }, { shaderLocation: 3, offset: 16, format: 'uint8x4' },
    { shaderLocation: 4, offset: 20, format: 'unorm8x4' },
  ],
};

function dqPoint(dq: Float32Array, i: number, p: ArrayLike<number>): V3 {
  const o = i * 8, rx = dq[o], ry = dq[o + 1], rz = dq[o + 2], rw = dq[o + 3], dx = dq[o + 4], dy = dq[o + 5], dz = dq[o + 6], dw = dq[o + 7];
  const cx = ry * p[2] - rz * p[1] + rw * p[0], cy = rz * p[0] - rx * p[2] + rw * p[1], cz = rx * p[1] - ry * p[0] + rw * p[2];
  const qx = p[0] + 2 * (ry * cz - rz * cy), qy = p[1] + 2 * (rz * cx - rx * cz), qz = p[2] + 2 * (rx * cy - ry * cx);
  const tx = 2 * (rw * dx - dw * rx + (ry * dz - rz * dy)), ty = 2 * (rw * dy - dw * ry + (rz * dx - rx * dz)), tz = 2 * (rw * dz - dw * rz + (rx * dy - ry * dx));
  return [qx + tx, qy + ty, qz + tz];
}

export class Shaman {
  readonly rig: HeroRig;
  readonly dq: StorageBuffer;
  readonly u: UniformBuffer<any>;
  private vb: StorageBuffer; private ib: StorageBuffer; private n: number;
  private legs = Array.from({ length: 8 }, () => [0, 0, 0, 0]);
  private legBones: number[];
  /** her lines' brightness, their pulse with the strokes, the great stroke's light up her arm (0..1) */
  look = { lines: 1, iri: 1, armLight: 0 };

  static async load(kit: Kit) {
    const a = await loadHero(new URL('./assets/shaman_hi.bin.gz', import.meta.url).href);
    fitHands(a);
    return new Shaman(kit, a);
  }

  constructor(readonly kit: Kit, readonly asset: HeroAsset) {
    this.rig = new HeroRig(asset);
    // (her body's proportions are a woman's: Katara's base)
    this.rig.female = true;
    this.vb = kit.storage({ label: 'shaman.vb', data: asset.verts, usage: ['vertex', 'copy-dst'] });
    this.ib = kit.storage({ label: 'shaman.ib', data: asset.idx, usage: ['index', 'copy-dst'] });
    this.n = asset.idx.length;
    this.dq = kit.storage({ label: 'shaman.bones', size: MAX_BONES * 32 });
    this.u = kit.uniforms(shamanShader.structs.ShamanU, 'shaman');
    this.legBones = ['thighL', 'shinL', 'thighR', 'shinR'].map((n) => asset.index[n]);
    const h = asset.header;
    const pal = Array.from({ length: 16 }, (_, i) => { const v = h.pal?.[i]; return v ? [v[0], v[1], v[2], v[3] ?? 0] : [0.5, 0.5, 0.5, 0]; });
    const B = asset.bones, I = asset.index;
    const hand = (T: string) => Math.hypot(...([0, 1, 2].map((k) => B[I['hand' + T]].tail[k] - B[I['hand' + T]].head[k])) as [number, number, number]) * 1.9;
    this.u.set({
      pal: pal as never,
      qmin: [h.qmin[0], h.qmin[1], h.qmin[2], h.face.nose_tip[0]] as never,
      qmax: [h.qmax[0], h.qmax[1], h.qmax[2], 0] as never,
      eye: [h.eye.x, h.eye.y, h.eye.z, h.eye.r] as never,
      face: [h.face.brow_y, h.face.mouth_y, h.face.lip_w, h.face.nose_tip[1]] as never,
      arms: [
        [...B[I.farmL].head, 0], [...B[I.handL].head, hand('L')], [...B[I.farmR].head, 0], [...B[I.handR].head, hand('R')],
      ] as never,
    });
  }

  /** a point in the bind pose carried by a bone as it's posed now */
  bonePoint(name: string, p: V3): V3 { return this.rig.skinPoint(this.asset.index[name], p); }

  /** after the rig's update: the bones to the GPU, the legs' capsules, the face's state, the look */
  sync() {
    const r = this.rig;
    this.dq.write(r.dq.subarray(0, r.nBones * 8));
    const s = this.asset.header.height / 1.66;
    const R = [[0.094, 0.078], [0.078, 0.052]];
    this.legBones.forEach((bi, k) => {
      const b = this.asset.bones[bi];
      const a = dqPoint(r.dq, bi, b.head), t = dqPoint(r.dq, bi, b.tail), rr = R[k % 2];
      this.legs[k * 2] = [a[0], a[1], a[2], rr[0] * s + 0.012];
      this.legs[k * 2 + 1] = [t[0], t[1], t[2], rr[1] * s + 0.012];
    });
    const f = r.faceState;
    this.u.set({
      legs: this.legs as never,
      face2: [f.blink, f.face.smile ?? 0, 0, 0] as never,
      face3: [f.gaze[0], f.gaze[1], 0, 0] as never,
      look: [this.look.lines, this.look.iri, this.look.armLight, 0] as never,
    });
  }

  draw(pass: RenderPass) {
    pass.draw(shamanShader, {
      label: 'shaman', vertex: 'vs', fragment: 'fs', cull: 'none',
      vertexBuffers: [{ layout: LAYOUT, buffer: this.vb }], indices: { buffer: this.ib, format: 'uint32' }, count: this.n,
      bind: { DQ: this.dq, SU: this.u } as never,
    });
  }
}
