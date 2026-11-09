// Her headdress (09/design/headdress-ornaments.png): rigid ornaments carried by her head's bone, built here in its
// bind space (she faces +z, x her left) and fitted to her head's own mesh —
//   - a diadem: a gold filigree band round her head just above the brow, dipping to a setting at its front that holds
//     a teal seed-stone (her third eye: it wakes with the strokes);
//   - small gold bosses where the bead strings hang from the diadem at her temples (the strings: hair.ts).
// (Above the band, her crown of green and gold leaves is regalia.ts's cards. A flat crescent halo stood behind her head
// here for a while; side on it read as a wire — an antenna — and went.)
// Drawn by ornament.wgsl, skinned by the head's bone alone.
import { MeshBuilder, type Kit, type RenderPass, type StorageBuffer, type UniformBuffer } from '@ericrius1/weft';
import type { HeroAsset } from '../src/rig/hero/asset';
import type { V3 } from '../src/rig/hero/math';
import { type Anchor, type Band, fitBand, onBand, TEMPLES } from './hair';
import ornamentShader from './ornament.wgsl';

/** the ornaments' materials (ornament.wgsl; 1, the nimbus's inlay, unused now) */
export const ORN = { gold: 0, inlay: 1, stone: 2, filigree: 3 };

export class Ornaments {
  private mesh: { vertices: StorageBuffer; indices: StorageBuffer; count: number };
  readonly U: UniformBuffer<any>;
  readonly band: Band;
  constructor(readonly kit: Kit, readonly asset: HeroAsset, A: Anchor[], readonly dq: StorageBuffer) {
    const b = new MeshBuilder();
    const band = this.band = fitBand(asset, A);
    // ---------------------------------------------------------------- the diadem: a flat band (its filigree is cut in
    // the shader), a little proud of her head, full round
    const N = 160, H = 0.011, T = 0.0025;
    const ring = (dy: number, dr: number) => Array.from({ length: N + 1 }, (_, i) => onBand(band, (i / N) * Math.PI * 2 - Math.PI, dy, dr));
    const strip = (pa: V3[], pb: V3[], out: number, mat: number, v0: number, v1: number) => {
      const base = b.vertexCount;
      for (let i = 0; i <= N; i++) {
        const az = (i / N) * Math.PI * 2 - Math.PI;
        const n: V3 = [Math.sin(az) * out, 0, Math.cos(az) * out];
        b.vertex(pa[i], n, [i / N, v0], [1, 1, 1, 1], mat);
        b.vertex(pb[i], n, [i / N, v1], [1, 1, 1, 1], mat);
      }
      for (let i = 0; i < N; i++) { const a0 = base + i * 2; b.tri(a0, a0 + 2, a0 + 1).tri(a0 + 1, a0 + 2, a0 + 3); }
    };
    // (its width wider at the front, round the setting)
    const wide = (az: number) => H * (1 + 0.9 * Math.exp(-az * az * 6));
    const lo = Array.from({ length: N + 1 }, (_, i) => { const az = (i / N) * Math.PI * 2 - Math.PI; return onBand(band, az, -wide(az) * 0.5, T); });
    const hi = Array.from({ length: N + 1 }, (_, i) => { const az = (i / N) * Math.PI * 2 - Math.PI; return onBand(band, az, wide(az) * 0.5, T); });
    strip(lo, hi, 1, ORN.filigree, 0, 1);
    // its edges: two fine gold wires
    b.setColor([1, 1, 1, 1], ORN.gold);
    b.tube(ring(0, 0).map((_, i) => lo[i]), 0.0013, 5, true);
    b.tube(ring(0, 0).map((_, i) => hi[i]), 0.0013, 5, true);
    void ring;
    // the setting at its front: a pointed oval of gold round the stone, the stone itself
    const front = onBand(band, 0, 0.002, T + 0.002);
    b.push().translate(front[0], front[1], front[2]).scale(1, 1.45, 0.55).setColor([1, 1, 1, 1], ORN.gold).sphere(0.0125, 18, 12).pop();
    b.push().translate(front[0], front[1], front[2] + 0.004).scale(1, 1.4, 0.7).setColor([1, 1, 1, 1], ORN.stone).sphere(0.0095, 18, 12).pop();
    // a drop below it, between the brows, and two small studs either side
    const drop = onBand(band, 0, -0.024, T + 0.001);
    b.push().translate(drop[0], drop[1], drop[2]).scale(0.8, 1.3, 0.6).setColor([1, 1, 1, 1], ORN.gold).sphere(0.0042, 10, 8).pop();
    for (const s of [-1, 1]) {
      const st = onBand(band, s * 0.32, 0, T + 0.001);
      b.push().translate(st[0], st[1], st[2]).scale(1, 1, 0.6).setColor([1, 1, 1, 1], ORN.stone).sphere(0.0045, 10, 8).pop();
    }
    // the temples' bosses, where the bead strings hang
    for (const az of TEMPLES) {
      const p = onBand(band, az, -0.006, T + 0.002);
      b.push().translate(p[0], p[1], p[2]).scale(1, 1, 0.55).setColor([1, 1, 1, 1], ORN.gold).sphere(0.0068, 12, 8).pop();
    }
    this.mesh = b.upload(kit, 'ornaments');
    this.U = kit.uniforms(ornamentShader.structs.OrnU, 'ornaments');
  }

  /** each frame: story time, the strokes' flash, her lines' pulse, the great stroke's afterglow */
  set(t: number, flash: number, pulse: number, after: number) {
    this.U.set({ look: [t, flash, pulse, after] as never, bone: [this.asset.index.head, 0, 0, 0] as never });
  }

  draw(pass: RenderPass) {
    pass.draw(ornamentShader, { label: 'ornaments', vertex: 'vsOrn', fragment: 'fsOrn', cull: 'none', count: this.mesh.count,
      indices: { buffer: this.mesh.indices, format: 'uint32' }, bind: { O: this.U, DQ: this.dq, verts: this.mesh.vertices } as never });
  }
}
