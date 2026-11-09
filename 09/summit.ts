// The summit (style.ts `summit`): the ground she stands on as a mountain's top torn from the earth and floating in the
// void (design/summit-concept.jpg, painted by Codex: refs.mjs dais). Its top a carved stone circle, level where she and
// the drum stand, worn and broken at its rim (assets/dais-top.webp, seen from above: refs.mjs dais_top); under it the
// mountain's broken roots — ragged cliffs in strata falling away to a long inverted spire far below (assets/dais-rock.webp
// round them: refs.mjs dais_rock), roots hanging from it into the dark; standing stones on its far side, framing the
// drum; shards of the mountain drifting round it below. Built on the CPU once; drawn by drum.wgsl (materials 12–16).
import type { MeshBuilder } from '@ericrius1/weft';
import type { V3 } from '../src/rig/hero/math';
import { DAIS } from './stage';

export const SUMMIT_MAT = { top: 12, cliff: 13, stone: 14, shard: 15, root: 16 };

// ---------------------------------------------------------------- noise (value noise and its fbm, deterministic)
const hash3 = (x: number, y: number, z: number) => {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};
function vnoise(x: number, y: number, z: number) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const L = (a: number, b: number, t: number) => a + (b - a) * t;
  const h = (i: number, j: number, k: number) => hash3(ix + i, iy + j, iz + k);
  return L(L(L(h(0, 0, 0), h(1, 0, 0), u), L(h(0, 1, 0), h(1, 1, 0), u), v), L(L(h(0, 0, 1), h(1, 0, 1), u), L(h(0, 1, 1), h(1, 1, 1), u), v), w);
}
function fbm(x: number, y: number, z: number, oct = 5) {
  let a = 0.5, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x, y, z); n += a; x = x * 2.03 + 17.1; y = y * 2.03 + 3.7; z = z * 2.03 + 9.3; a *= 0.5; }
  return s / n;
}
/** a periodic wobble round a circle: sines of whole frequencies, random phases */
function wobble(seed: number, kMin: number, kMax: number) {
  const terms: [number, number, number][] = [];
  for (let k = kMin; k <= kMax; k++) terms.push([k, hash3(seed, k, 1) * Math.PI * 2, (0.6 + 0.8 * hash3(seed, k, 2)) / Math.pow(k, 1.1)]);
  const norm = terms.reduce((s, t) => s + t[2], 0);
  return (a: number) => terms.reduce((s, [k, p, amp]) => s + Math.sin(k * a + p) * amp, 0) / norm;
}

/** a grid of points (rows × cols, cols wrapping round) as a surface: normals from its neighbours */
function grid(b: MeshBuilder, P: V3[][], uv: (i: number, j: number) => [number, number], mat: number, col: number[], flip = false, wrap = true) {
  const rows = P.length, cols = P[0].length, base = b.vertexCount;
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const jp = wrap ? P[i][(j + 1) % cols] : P[i][Math.min(cols - 1, j + 1)], jm = wrap ? P[i][(j - 1 + cols) % cols] : P[i][Math.max(0, j - 1)];
    const ip = P[Math.min(rows - 1, i + 1)][j], im = P[Math.max(0, i - 1)][j];
    const du = [jp[0] - jm[0], jp[1] - jm[1], jp[2] - jm[2]], dv = [ip[0] - im[0], ip[1] - im[1], ip[2] - im[2]];
    let n = [du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]];
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    n = n.map((x) => (x / l) * (flip ? -1 : 1));
    b.vertex(P[i][j], n, uv(i, j), [...col, 1], mat);
  }
  const cMax = wrap ? cols : cols - 1;
  for (let i = 0; i < rows - 1; i++) for (let j = 0; j < cMax; j++) {
    const j1 = (j + 1) % cols;
    const a = base + i * cols + j, c = base + i * cols + j1, d = base + (i + 1) * cols + j, e = base + (i + 1) * cols + j1;
    b.tri(a, d, c).tri(c, d, e);
  }
}

export function buildSummit(b: MeshBuilder) {
  const [cx, , cz] = DAIS.c, DR = DAIS.r;
  const NA = 288;
  // the rim: where the carved circle breaks off — a little out past it, ragged
  const w1 = wobble(1, 3, 28), w2 = wobble(2, 20, 70);
  const rimR = (a: number) => DR * (1.07 + 0.05 * w1(a) + 0.018 * w2(a));
  // ---------------------------------------------------------------- the top: level where she and the drum stand,
  // weathered and sagging a little out past the carving, rounding over at the broken rim
  const NR = 54;
  const top: V3[][] = [];
  for (let i = 0; i <= NR; i++) {
    const s = i / NR;
    const row: V3[] = [];
    for (let j = 0; j < NA; j++) {
      const a = (j / NA) * Math.PI * 2, R = rimR(a);
      const r = s * R;
      const out = Math.max(0, (r - (DR - 0.25)) / (R - DR + 0.25));
      let y = 0;
      if (out > 0) {
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        y = -0.05 * out * out - 0.06 * Math.pow(out, 5) - 0.03 * out * fbm(x * 3, 0.5, z * 3, 3);
      }
      // (at the very edge, rounded over: the last ring a little in and down)
      const edge = i === NR ? 1 : 0;
      const rr = r - edge * 0.035;
      row.push([cx + Math.cos(a) * rr, y - edge * 0.06, cz + Math.sin(a) * rr]);
    }
    top.push(row);
  }
  // (uv: the carving seen from above, its circle the carved one: radius DR to the picture's edge)
  grid(b, top, (i, j) => { const p = top[i][j]; return [0.5 + (p[0] - cx) / (2 * DR), 0.5 + (p[2] - cz) / (2 * DR)]; }, SUMMIT_MAT.top, [0.5, 0.5, 0.5], true);
  // ---------------------------------------------------------------- the cliffs and the spire: the rim falling away
  // in strata, an overhanging lip, narrowing to a point far below
  const DEPTH = 7.8;
  const NV = 110;
  const prof: [number, number][] = [[0, 1.0], [0.02, 1.03], [0.05, 0.99], [0.1, 0.93], [0.18, 0.84], [0.3, 0.7], [0.45, 0.52], [0.6, 0.36], [0.75, 0.22], [0.88, 0.1], [1, 0.0]];
  const profAt = (v: number) => {
    let k = 0; while (k < prof.length - 2 && prof[k + 1][0] < v) k++;
    const [v0, r0] = prof[k], [v1, r1] = prof[k + 1], t = (v - v0) / (v1 - v0), s = t * t * (3 - 2 * t);
    return r0 + (r1 - r0) * s;
  };
  const cliff: V3[][] = [];
  const topRing = top[NR];
  for (let i = 0; i <= NV; i++) {
    const v = Math.pow(i / NV, 1.35);
    const row: V3[] = [];
    for (let j = 0; j < NA; j++) {
      const a = (j / NA) * Math.PI * 2;
      if (i === 0) { row.push(topRing[j]); continue; }
      const y0 = -0.12 - DEPTH * v;
      const x0 = Math.cos(a), z0 = Math.sin(a);
      // strata: ledges stepping in at each layer's foot, the layers tilted a little and broken
      const sy = y0 * 2.4 + 0.8 * fbm(x0 * 2, 0.3, z0 * 2, 3) + 0.25 * x0;
      const ledge = 0.06 * (Math.pow(sy - Math.floor(sy), 3) - 0.25);
      const big = fbm(x0 * 1.6 + 5, y0 * 0.35, z0 * 1.6, 4) - 0.5;
      const fine = fbm(x0 * 7, y0 * 1.6 + 2, z0 * 7, 4) - 0.5;
      const k = profAt(v);
      const R = rimR(a) * k * (1 + 0.32 * big * Math.min(1, v * 6) + 0.1 * fine) + ledge * k + (i > 0 && v < 0.06 ? 0.03 * fine : 0);
      // (the spire's point leaning a little off the axis, so it's not a turned thing)
      const lean = v * v * 0.6;
      row.push([cx + x0 * Math.max(0.002, R) + lean * 0.5, y0 + 0.25 * fine * Math.min(1, v * 3), cz + z0 * Math.max(0.002, R) - lean * 0.3]);
    }
    cliff.push(row);
  }
  grid(b, cliff, (i, j) => [j / NA, i / NV], SUMMIT_MAT.cliff, [0.3, 0.3, 0.32], true);
  // ---------------------------------------------------------------- roots hanging from its underside into the void
  for (let k = 0; k < 34; k++) {
    const a = k * 2.39996 + 0.3, v = 0.08 + 0.55 * hash3(k, 3, 3);
    const i = Math.round(Math.pow(v, 1 / 1.35) * NV), j = Math.round(((a / (Math.PI * 2)) % 1) * NA) % NA;
    const p0 = cliff[i][j];
    const L = 1.0 + 3.2 * hash3(k, 4, 4) * (1 - v * 0.5);
    const path: V3[] = [];
    for (let s = 0; s <= 12; s++) {
      const t = s / 12;
      path.push([p0[0] + Math.cos(a) * 0.1 * t + Math.sin(t * 4 + k) * 0.12 * t, p0[1] - L * t, p0[2] + Math.sin(a) * 0.1 * t + Math.cos(t * 3.3 + k) * 0.12 * t]);
    }
    b.setColor([0.07, 0.05, 0.04], SUMMIT_MAT.root).tube(path, (t) => (0.045 * (1 - t) + 0.003) * (0.6 + 0.6 * hash3(k, 5, 5)), 6);
    // (a few fine ones off it)
    if (k % 2 === 0) {
      const q = path[3];
      const sub: V3[] = [];
      for (let s = 0; s <= 8; s++) { const t = s / 8; sub.push([q[0] + Math.sin(k + t * 3) * 0.25 * t, q[1] - L * 0.6 * t, q[2] + Math.cos(k + t * 2) * 0.25 * t]); }
      b.tube(sub, (t) => 0.012 * (1 - t) + 0.002, 4);
    }
  }
  // ---------------------------------------------------------------- the standing stones: on its far side (away from
  // where the camera stands), framing the drum, each its own height and lean, rough, broken at the top
  const STONES: { a: number; r: number; h: number; w: number; lean: number; cut: number }[] = [
    { a: -44, r: 2.28, h: 2.05, w: 0.86, lean: -0.04, cut: 0.35 },
    { a: -6, r: 2.32, h: 1.45, w: 0.78, lean: 0.05, cut: -0.3 },
    { a: 30, r: 2.26, h: 2.45, w: 0.95, lean: -0.06, cut: 0.25 },
    { a: 64, r: 2.2, h: 1.7, w: 0.8, lean: 0.07, cut: -0.4 },
    { a: 98, r: 2.15, h: 1.15, w: 0.7, lean: 0.1, cut: 0.3 },
  ];
  STONES.forEach((st, si) => {
    const a = (st.a * Math.PI) / 180;
    const bx = cx + Math.cos(a) * st.r, bz = cz + Math.sin(a) * st.r;
    // (its broad face toward the dais's centre)
    const fx = -Math.cos(a), fz = -Math.sin(a), sx = -fz, sz = fx;
    // rough-hewn: few facets (drum.wgsl shades them flat), each corner its own, the slab swelling and narrowing as it
    // rises, its top broken off at a slant
    const ROWS = 9, SEG = 9;
    const corner = Array.from({ length: SEG }, (_, j) => 0.75 + 0.5 * hash3(si, j, 11));
    const P: V3[][] = [];
    for (let i = 0; i <= ROWS; i++) {
      const t = i / ROWS;
      const taper = (1 - 0.28 * t) * (1 + 0.1 * Math.sin(t * 4 + si * 2)) ;
      const row: V3[] = [];
      for (let j = 0; j < SEG; j++) {
        const u = (j / SEG) * Math.PI * 2 + si;
        const k = taper * corner[j] * (1 + 0.22 * (hash3(si * 31 + i, j, 12) - 0.5));
        const ex = Math.cos(u) * st.w * 0.5 * k, ez = Math.sin(u) * st.w * 0.24 * k;
        // (the top: a slanted break across its width, chipped)
        const y = i === ROWS ? st.h * (1 + st.cut * 0.22 * (ex / (st.w * 0.5))) + 0.06 * (hash3(si, j, 13) - 0.5) : -0.3 + (st.h + 0.3) * t;
        const leanX = st.lean * (y + 0.3);
        row.push([bx + sx * ex + fx * (ez + leanX), y, bz + sz * ex + fz * (ez + leanX)]);
      }
      P.push(row);
    }
    const c = P[ROWS].reduce((s, p) => [s[0] + p[0] / SEG, s[1] + p[1] / SEG, s[2] + p[2] / SEG] as V3, [0, 0, 0] as V3);
    P.push(P[ROWS].map(() => c));
    grid(b, P, (i, j) => [j / SEG, i / ROWS], SUMMIT_MAT.stone, [0.36, 0.35, 0.37], true);
  });
  // ---------------------------------------------------------------- shards of the mountain drifting round it below
  // (uv: x its orbit's speed, y its bob's phase; drum.wgsl turns them round the summit's axis on the story clock)
  for (let k = 0; k < 14; k++) {
    const a = k * 2.39996 + 1.1;
    const far = hash3(k, 6, 6);
    const r = 3.6 + 5.5 * far;
    const y = far > 0.6 ? -0.8 + 2.4 * hash3(k, 7, 7) : -1.2 - 3.5 * hash3(k, 7, 7);
    const size = 0.15 + 0.5 * hash3(k, 8, 8) * (0.5 + far);
    const px = cx + Math.cos(a) * r, pz = cz + Math.sin(a) * r;
    const speed = (0.012 + 0.02 * hash3(k, 9, 9)) * (k % 3 === 0 ? -1 : 1), phase = hash3(k, 10, 10) * 6.28;
    const RO = 6, SE = 9, P: V3[][] = [];
    for (let i = 0; i <= RO; i++) {
      const th = (i / RO) * Math.PI, row: V3[] = [];
      for (let j = 0; j < SE; j++) {
        const ph = (j / SE) * Math.PI * 2;
        const d: V3 = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
        // (a chunk: flat on top, a point below, faceted by noise)
        const n = fbm(d[0] * 1.5 + k, d[1] * 1.5, d[2] * 1.5, 3) - 0.5 + 0.25 * (hash3(k * 40 + i, j, 14) - 0.5);
        const sy = d[1] > 0 ? 0.45 : 1.3;
        const rr = size * (1 + 0.6 * n);
        row.push([px + d[0] * rr, y + d[1] * rr * sy, pz + d[2] * rr]);
      }
      P.push(row);
    }
    grid(b, P, () => [speed, phase], SUMMIT_MAT.shard, [0.3, 0.3, 0.32], true);
  }
}
