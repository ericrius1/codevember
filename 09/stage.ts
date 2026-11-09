// Where things stand on the dais (no GPU here: the motion's tools, 09/lab, read it as the picture does).
import type { V3 } from '../src/rig/hero/math';

export const DRUM = {
  /** the hide's centre (world) and radius, the shell's depth behind it */
  c: [0, 1.06, 0] as V3, r: 0.85, depth: 0.58,
};
/** the dais's centre and radius */
export const DAIS = { c: [-0.3, 0, 0.2] as V3, r: 2.45 };
