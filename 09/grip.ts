// The beater held by her hand as her hand really is. The strokes (src/rig/strike.ts) plan where the grip and the shaft
// should be, and the rig takes her hand there — but where an arm can't reach (raised high, stretched out), the hand
// stops short of its goal, and a beater placed from the plan floats off her fingers. So the beater is fixed in her
// right hand's bone instead: its grip and its shaft's way found in the bone's own frame once, from a moment when the
// hand is exactly where it's asked, and carried by the bone after. Only round each contact is the shaft turned onto
// the plan's way (the head must meet the hide where the hide's simulation is struck), and there the hand is where
// it's asked anyway, so the turn is nothing to see.
import type { V3 } from '../src/rig/hero/math';
import type { HeroRig } from '../src/rig/hero/rig';
import type { StrokeState } from '../src/rig/strike';
import { BEATER } from './perform';

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const nrm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

export class GripHold {
  private hb: number;
  /** the grip, the shaft's way and the beater's side in the hand bone's frame (its bind space) */
  private local: { p: V3; d: V3; s: V3 } | null = null;
  constructor(private rig: HeroRig) {
    this.hb = (rig as unknown as { asset: { index: Record<string, number> } }).asset.index.handR;
  }
  /** the hand bone's matrix: world from bind (column-major, its 3×3 not necessarily orthonormal) */
  private mat() { return (this.rig as unknown as { bones: Float32Array }).bones.subarray(this.hb * 16, this.hb * 16 + 16); }
  private toLocal(p: V3, dir: boolean): V3 {
    const m = this.mat();
    const a = [m[0], m[1], m[2]], b = [m[4], m[5], m[6]], c = [m[8], m[9], m[10]];
    const q = dir ? p : sub(p, [m[12], m[13], m[14]]);
    // (the 3×3's inverse by its cofactors: columns a, b, c)
    const bc = [b[1] * c[2] - b[2] * c[1], b[2] * c[0] - b[0] * c[2], b[0] * c[1] - b[1] * c[0]];
    const ca = [c[1] * a[2] - c[2] * a[1], c[2] * a[0] - c[0] * a[2], c[0] * a[1] - c[1] * a[0]];
    const ab = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const det = a[0] * bc[0] + a[1] * bc[1] + a[2] * bc[2];
    return [(bc[0] * q[0] + bc[1] * q[1] + bc[2] * q[2]) / det, (ca[0] * q[0] + ca[1] * q[1] + ca[2] * q[2]) / det, (ab[0] * q[0] + ab[1] * q[1] + ab[2] * q[2]) / det];
  }
  /** fix the beater in her hand as the stroke plans it now (call when her hand is where it's asked) */
  calibrate(st: { hand: V3; shaft: V3 }, side: V3 = [0, 0, 1]) {
    this.local = { p: this.toLocal(st.hand, false), d: this.toLocal(st.shaft, true), s: this.toLocal(side, true) };
  }
  get calibrated() { return !!this.local; }
  /** where the beater is: its grip and shaft carried by her hand, turned onto the plan's way by `aim` (0..1) */
  place(st: StrokeState, aim: number) {
    const L = this.local!;
    const grip = this.rig.skinPoint(this.hb, L.p);
    const held = nrm(this.rig.skinDir(this.hb, L.d));
    const side = nrm(this.rig.skinDir(this.hb, L.s));
    const toPlan = nrm(sub(st.head, grip));
    const shaft = nrm([held[0] + (toPlan[0] - held[0]) * aim, held[1] + (toPlan[1] - held[1]) * aim, held[2] + (toPlan[2] - held[2]) * aim]);
    const head: V3 = [grip[0] + shaft[0] * BEATER.reach, grip[1] + shaft[1] * BEATER.reach, grip[2] + shaft[2] * BEATER.reach];
    return { hand: grip, shaft, side, head, planErr: sub(grip, st.hand) };
  }
}

/** how much the shaft's turned onto the plan's way round a contact (story seconds from it): 1 through the stroke's
 *  last stretch and the contact, gone a little after (smooth both ways) */
export function aimAt(since: number): number {
  const x = since < 0 ? -since / 0.22 : since / 0.35;
  if (x >= 1) return 0;
  const u = 1 - x;
  return u * u * u * (u * (u * 6 - 15) + 10);
}
