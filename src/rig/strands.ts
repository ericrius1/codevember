// Strands that ride a body: verlet chains pinned at their roots to points the rig carries (a lock on the scalp, a
// filament in a headdress, a cord on a mantle, a sash's tail at the waist), each point after the root falling under
// gravity and drag, held to its length, bent back toward its rest way by its stiffness (stiffest at the root), kept out
// of the body's capsules, pushed by whatever wind blows (a breeze; a shock wave's front passing through).
//
// It runs on whatever clock it's given (a story clock that dilates: the strands slow with time). Points are kept in one
// Float32Array (x, y, z, radius) ready for the GPU.
import { type V3 } from './hero/math';

export interface Capsule { a: V3; b: V3; r: number }
export interface ChainSpec {
  /** the root (world) and its rest way (world, unit) this frame — from the rig */
  root: () => { p: V3; dir: V3 };
  /** points (including the root) and the length between them */
  n: number; seg: number;
  /** bending stiffness toward the rest way (0..1 a step, at the root; it falls off along the chain by `falloff`) */
  stiff: number; falloff?: number;
  /** radius at the root and the tip (for drawing, and the collisions) */
  r0: number; r1: number;
  /** gravity's share (1: all of it; a filament's light fibre less), drag (1/s) */
  grav?: number; drag?: number;
  /** how much the rest way turns with the chain as it goes (0: every link toward the root's way, 1: each toward its
   *  parent link's own way — a filament arcs, a lock hangs) */
  follow?: number;
}

export class Strands {
  readonly pts: Float32Array;
  private prev: Float32Array;
  private off: number[] = [];
  readonly specs: ChainSpec[];
  private first = true;
  constructor(specs: ChainSpec[]) {
    this.specs = specs;
    let n = 0;
    for (const s of specs) { this.off.push(n); n += s.n; }
    this.pts = new Float32Array(n * 4);
    this.prev = new Float32Array(n * 3);
    specs.forEach((s, c) => {
      for (let i = 0; i < s.n; i++) this.pts[(this.off[c] + i) * 4 + 3] = s.r0 + (s.r1 - s.r0) * (i / Math.max(1, s.n - 1));
    });
  }
  /** the first point of chain c (its index in pts / 4) */
  start(c: number) { return this.off[c]; }
  get count() { return this.pts.length / 4; }

  /** lay every chain out along its rest way (the first frame, or after a jump) */
  reset() {
    this.specs.forEach((s, c) => {
      const { p, dir } = s.root();
      for (let i = 0; i < s.n; i++) {
        const k = this.off[c] + i;
        const q: V3 = [p[0] + dir[0] * s.seg * i, p[1] + dir[1] * s.seg * i - 0.002 * i * i, p[2] + dir[2] * s.seg * i];
        this.pts[k * 4] = q[0]; this.pts[k * 4 + 1] = q[1]; this.pts[k * 4 + 2] = q[2];
        this.prev[k * 3] = q[0]; this.prev[k * 3 + 1] = q[1]; this.prev[k * 3 + 2] = q[2];
      }
    });
    this.first = false;
  }

  /** a step of dt (s): `wind(p)` the air's velocity at a point (m/s), the strands pushed toward it by their drag;
   *  `push(p)` an acceleration (m/s²: a shock's front); `caps` the body to keep out of */
  step(dt: number, caps: Capsule[], wind: (p: V3) => V3 = () => [0, 0, 0], push: ((p: V3) => V3) | null = null, iters = 3) {
    if (this.first) this.reset();
    if (dt <= 0) return;
    const P = this.pts, Q = this.prev;
    const sub = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / sub;
    for (let st = 0; st < sub; st++) {
      this.specs.forEach((s, c) => {
        const o = this.off[c];
        const { p: root, dir } = s.root();
        // the root goes where the rig puts it
        P[o * 4] = root[0]; P[o * 4 + 1] = root[1]; P[o * 4 + 2] = root[2];
        Q[o * 3] = root[0]; Q[o * 3 + 1] = root[1]; Q[o * 3 + 2] = root[2];
        const g = 9.8 * (s.grav ?? 1), drag = s.drag ?? 1.5;
        const keep = Math.exp(-drag * h);
        for (let i = 1; i < s.n; i++) {
          const k = o + i;
          const x: V3 = [P[k * 4], P[k * 4 + 1], P[k * 4 + 2]];
          const w = wind(x);
          const a: V3 = push ? push(x) : [0, 0, 0];
          for (let j = 0; j < 3; j++) {
            const v = (x[j] - Q[k * 3 + j]) * keep + w[j] * h * (1 - keep);
            Q[k * 3 + j] = x[j];
            P[k * 4 + j] = x[j] + v + (a[j] + (j === 1 ? -g : 0)) * h * h;
          }
        }
        for (let it = 0; it < iters; it++) {
          let way = dir;
          for (let i = 1; i < s.n; i++) {
            const k = o + i, kp = k - 1;
            const px = P[kp * 4], py = P[kp * 4 + 1], pz = P[kp * 4 + 2];
            // bent back toward its rest way
            const stiff = s.stiff * Math.pow(1 - (i - 1) / s.n, s.falloff ?? 2);
            if (stiff > 0) {
              const tx = px + way[0] * s.seg, ty = py + way[1] * s.seg, tz = pz + way[2] * s.seg;
              P[k * 4] += (tx - P[k * 4]) * stiff; P[k * 4 + 1] += (ty - P[k * 4 + 1]) * stiff; P[k * 4 + 2] += (tz - P[k * 4 + 2]) * stiff;
            }
            // its length
            let dx = P[k * 4] - px, dy = P[k * 4 + 1] - py, dz = P[k * 4 + 2] - pz;
            const d = Math.hypot(dx, dy, dz) || 1e-6;
            const f = s.seg / d;
            P[k * 4] = px + dx * f; P[k * 4 + 1] = py + dy * f; P[k * 4 + 2] = pz + dz * f;
            // out of the body
            const r = P[k * 4 + 3];
            for (const cp of caps) {
              const q: V3 = [P[k * 4], P[k * 4 + 1], P[k * 4 + 2]];
              const ab: V3 = [cp.b[0] - cp.a[0], cp.b[1] - cp.a[1], cp.b[2] - cp.a[2]];
              const L2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2] || 1e-9;
              let u = ((q[0] - cp.a[0]) * ab[0] + (q[1] - cp.a[1]) * ab[1] + (q[2] - cp.a[2]) * ab[2]) / L2;
              u = Math.max(0, Math.min(1, u));
              const cx = cp.a[0] + ab[0] * u, cy = cp.a[1] + ab[1] * u, cz = cp.a[2] + ab[2] * u;
              const ex = q[0] - cx, ey = q[1] - cy, ez = q[2] - cz;
              const el = Math.hypot(ex, ey, ez);
              const rr = cp.r + r;
              if (el < rr && el > 1e-6) { const m = rr / el; P[k * 4] = cx + ex * m; P[k * 4 + 1] = cy + ey * m; P[k * 4 + 2] = cz + ez * m; }
            }
            // the next link's rest way: the root's, turned toward this link's own by `follow`
            const fo = s.follow ?? 0.6;
            dx = P[k * 4] - px; dy = P[k * 4 + 1] - py; dz = P[k * 4 + 2] - pz;
            const dl = Math.hypot(dx, dy, dz) || 1;
            const nx = way[0] + (dx / dl - way[0]) * fo, ny = way[1] + (dy / dl - way[1]) * fo, nz = way[2] + (dz / dl - way[2]) * fo;
            const nl = Math.hypot(nx, ny, nz) || 1;
            way = [nx / nl, ny / nl, nz / nl];
          }
        }
      });
    }
  }
}
