// Where things stand on the dais (no GPU here: the motion's tools, 09/lab, read it as the picture does).
import type { V3 } from '../src/rig/hero/math';

export const DRUM = {
  /** the hide's centre (world) and radius, the shell's depth behind it */
  c: [0, 1.06, 0] as V3, r: 0.85, depth: 0.58,
};
/** the dais's centre and radius */
export const DAIS = { c: [-0.3, 0, 0.2] as V3, r: 2.45 };

// where she strikes: her right shoulder's in line with it (perform.ts stands her by it)
export const STRIKE_A = 0.4, STRIKE_B = 0.36;
/** where on the hide a stroke of the score lands (its frame: a across toward her side, +z; b up; m from its centre) */
export const struckAt = (k: { at: [number, number] }): [number, number] => [STRIKE_A + k.at[0] * 0.15, STRIKE_B + k.at[1] * 0.4];
/** that point in the world */
export const struckPoint = (k: { at: [number, number] }): V3 => { const [a, b] = struckAt(k); return [DRUM.c[0], DRUM.c[1] + b, DRUM.c[2] + a]; };
