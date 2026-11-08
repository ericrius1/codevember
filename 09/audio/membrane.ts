// 09 / Membrane, the drum itself: the hide simulated as a stiff, lossy membrane on a grid (Bilbao's scheme, the same
// physics the picture's hide runs in membrane.wgsl, here at 48 kHz with a real drum's losses), struck by a modelled
// beater, and listened to the way air hears it.
//
// The scheme, one step:  u⁺ = [2u − (1−σ0k)u⁻ + λ²Δu − μ²Δ²u + (2σ1k/h²)(Δu − Δu⁻)] / (1+σ0k), Δ the 5-point
// Laplacian times h², Δ² the 13-point biharmonic (computed as Δ of Δ), nothing past the rim (clamped, as in the
// picture). Stable while 8λ² + 64μ² ≤ 4; the hide's λ is far inside it. A big blow stretches the hide a little, so its
// tension rises with the mean square slope (the Kirchhoff–Carrier term) and the pitch falls back as the ring dies. The
// hide is thick (3.5 kg/m², a huge drum's) and uneven, thicker along the spine and in patches, which splits the pairs
// of modes a perfect disc would ring together and sets them beating slowly.
//
// The beater: a 0.25 kg padded head in two parts, the heavy core behind the felt (a nonlinear spring, F = K·η^α) and
// a few grams of leather cover in front of it, which meets the hide first (stiff, Hertzian): the light leather's tap
// gives the hide its high modes, the core's long push (6–9 ms) its boom. The force is spread over the footprint, which
// grows as the head presses in; the hide pushes back; the head comes off by itself and the hand takes it away. The
// sound: the pressure at two points in front, summed over every cell's acceleration with its own distance and delay
// (the Rayleigh integral, binned by delay), the back face's volume acceleration (for the shell's air), and the velocity
// at two points on the hide (pickups).
const C_AIR = 343, RHO_AIR = 1.2;

export interface HideSpec {
  /** cells across the diameter */
  n: number;
  /** the hide's radius (m), its steps a second */
  radius: number; sr: number;
  /** wave speed (m/s), bending stiffness κ (m²/s) */
  c: number; kappa: number;
  /** losses: σ0 (1/s, all modes alike) and σ1 (m²/s, the high modes' extra) */
  sigma0: number; sigma1: number;
  /** surface density (kg/m²), and the tension modulation's strength (E·thickness / 2(1−ν²)T0; 0: linear) */
  rho: number; glide: number;
  /** how uneven its thickness is (a real hide: thicker along the spine, in patches; 0: even), the unevenness's seed */
  grain?: number; seed?: number;
}

export interface Patch { idx: Int32Array; w: Float64Array }

export class Membrane {
  readonly o: HideSpec;
  readonly W: number; readonly h: number; readonly k: number;
  /** the hide's cells (indices into the padded grid), and those one past the rim (where Δu is still wanted) */
  readonly inner: Int32Array; readonly ext: Int32Array;
  /** grid index → position in `inner` (−1: not on the hide) */
  readonly slot: Int32Array;
  u: Float64Array; u0: Float64Array; lap: Float64Array; lap0: Float64Array;
  /** each cell's mass against the mean's inverse (ρ0/ρ: where it's thicker it answers the same pull more slowly) */
  readonly cl: Float64Array;
  private l2 = 0; private m2 = 0; private a = 0; private s1 = 0; private inv = 0; private fk = 0;
  /** Σ −u·Δu (∫|∇u|², for the tension), the volume swept this step (Σu·h²) */
  private S = 0;
  vol = 0;
  // listening points in front: each cell's delay bin and the bins' 1/r, the bins' sums this step, the output
  private binL: Int32Array | null = null; private binR: Int32Array | null = null;
  private gL: Float64Array | null = null; private gR: Float64Array | null = null;
  private accL: Float64Array | null = null; private accR: Float64Array | null = null;
  outL: Float64Array | null = null; outR: Float64Array | null = null;
  n = 0;

  constructor(o: HideSpec) {
    this.o = o;
    const N = o.n, W = N + 6;
    this.W = W; this.h = (2 * o.radius) / N; this.k = 1 / o.sr;
    const inner: number[] = [], ext: number[] = [];
    this.slot = new Int32Array(W * W).fill(-1);
    const on = (i: number, j: number) => {
      if (i < 0 || j < 0 || i >= N || j >= N) return false;
      return Math.hypot((i + 0.5) * this.h - o.radius, (j + 0.5) * this.h - o.radius) < o.radius;
    };
    for (let j = -2; j < N + 2; j++) for (let i = -2; i < N + 2; i++) {
      const g = (j + 3) * W + (i + 3);
      if (on(i, j)) { this.slot[g] = inner.length; inner.push(g); ext.push(g); }
      else if (on(i + 1, j) || on(i - 1, j) || on(i, j + 1) || on(i, j - 1)) ext.push(g);
    }
    this.inner = Int32Array.from(inner); this.ext = Int32Array.from(ext);
    this.u = new Float64Array(W * W); this.u0 = new Float64Array(W * W);
    this.lap = new Float64Array(W * W); this.lap0 = new Float64Array(W * W);
    // the hide's thickness: a ridge along the spine (a little off the middle, at an angle), and patches
    this.cl = new Float64Array(W * W).fill(1);
    if (o.grain) {
      let a = (o.seed ?? 7) >>> 0;
      const r = () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; };
      const waves: [number, number, number, number][] = [];
      for (let w = 0; w < 14; w++) { const l = 0.12 + 0.5 * r(), th = r() * Math.PI * 2; waves.push([Math.cos(th) * 2 * Math.PI / l, Math.sin(th) * 2 * Math.PI / l, r() * Math.PI * 2, 0.4 + r()]); }
      const sp = 0.6 + r() * 0.6, so = (r() - 0.5) * 0.3;
      const f = (x: number, y: number) => {
        let v = 0, n = 0;
        for (const [kx, ky, ph, amp] of waves) { v += amp * Math.cos(kx * x + ky * y + ph); n += amp * amp; }
        const ridge = Math.exp(-(((Math.cos(sp) * x + Math.sin(sp) * y - so) / 0.22) ** 2));
        return 0.6 * v / Math.sqrt(n / 2) + 1.4 * (ridge - 0.35);
      };
      for (const g of inner) {
        const x = ((g % W) - 3 + 0.5) * this.h - o.radius, y = (Math.floor(g / W) - 3 + 0.5) * this.h - o.radius;
        this.cl[g] = 1 / Math.max(0.5, 1 + o.grain * f(x, y));
      }
    }
    const lam2 = ((o.c * this.k) / this.h) ** 2, mu2 = ((o.kappa * this.k) / (this.h * this.h)) ** 2;
    if (8 * lam2 + 64 * mu2 > 3.6) throw new Error(`unstable: 8λ²+64μ² = ${8 * lam2 + 64 * mu2}`);
    this.l2 = lam2; this.m2 = mu2;
    this.loss(o.sigma0, o.sigma1);
  }
  /** the stability figure 8λ² + 64μ² (≤ 4) */
  get courant() { return 8 * this.l2 + 64 * this.m2; }
  /** set the losses (they can change as it runs) */
  loss(sigma0: number, sigma1: number) {
    const k = this.k, s0 = sigma0 * k;
    this.inv = 1 / (1 + s0); this.a = 1 - s0; this.s1 = (2 * sigma1 * k) / (this.h * this.h);
    this.fk = (k * k) / (this.o.rho * this.h * this.h) * this.inv;
  }
  /** the grid cell at (x, y) metres from the centre */
  cell(x: number, y: number) {
    const i = Math.floor((x + this.o.radius) / this.h), j = Math.floor((y + this.o.radius) / this.h);
    return (j + 3) * this.W + (i + 3);
  }
  /** the cells within `rad` of (x, y), raised-cosine weighted, the weights summing to 1 */
  patch(x: number, y: number, rad: number): Patch {
    const idx: number[] = [], w: number[] = [];
    const R = Math.ceil(rad / this.h) + 1, c0 = this.cell(x, y);
    for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
      const g = c0 + dj * this.W + di;
      if (this.slot[g] < 0) continue;
      const gi = (g % this.W) - 3, gj = Math.floor(g / this.W) - 3;
      const d = Math.hypot((gi + 0.5) * this.h - this.o.radius - x, (gj + 0.5) * this.h - this.o.radius - y);
      if (d >= rad) continue;
      idx.push(g); w.push(Math.cos((Math.PI / 2) * (d / rad)) ** 2);
    }
    if (!idx.length) { idx.push(c0); w.push(1); }
    const s = w.reduce((a, b) => a + b, 0);
    return { idx: Int32Array.from(idx), w: Float64Array.from(w.map((v) => v / s)) };
  }
  /** the hide's mean displacement over a patch */
  under(p: Patch) { let s = 0; for (let j = 0; j < p.idx.length; j++) s += p.w[j] * this.u[p.idx[j]]; return s; }

  /** two listening points in front of the hide (x across, y up, z out from it, metres), for `steps` steps */
  listen(l: [number, number, number], r: [number, number, number], steps: number) {
    const nIn = this.inner.length, dl = new Float64Array(nIn), dr = new Float64Array(nIn);
    let rmin = Infinity, rmax = 0;
    for (let q = 0; q < nIn; q++) {
      const g = this.inner[q], gi = (g % this.W) - 3, gj = Math.floor(g / this.W) - 3;
      const x = (gi + 0.5) * this.h - this.o.radius, y = (gj + 0.5) * this.h - this.o.radius;
      dl[q] = Math.hypot(x - l[0], y - l[1], l[2]); dr[q] = Math.hypot(x - r[0], y - r[1], r[2]);
      rmin = Math.min(rmin, dl[q], dr[q]); rmax = Math.max(rmax, dl[q], dr[q]);
    }
    const nb = Math.ceil(((rmax - rmin) / C_AIR) * this.o.sr) + 2;
    const bin = (d: Float64Array, out: Int32Array, g: Float64Array) => {
      const cnt = new Float64Array(nb);
      for (let q = 0; q < nIn; q++) { const b = Math.round(((d[q] - rmin) / C_AIR) * this.o.sr); out[q] = b; g[b] += 1 / d[q]; cnt[b]++; }
      for (let b = 0; b < nb; b++) g[b] = cnt[b] ? g[b] / cnt[b] : 0;
    };
    this.binL = new Int32Array(nIn); this.binR = new Int32Array(nIn); this.gL = new Float64Array(nb); this.gR = new Float64Array(nb);
    bin(dl, this.binL, this.gL); bin(dr, this.binR, this.gR);
    this.accL = new Float64Array(nb); this.accR = new Float64Array(nb);
    this.outL = new Float64Array(steps + nb + 2); this.outR = new Float64Array(steps + nb + 2);
  }

  /** one step: the new state computed (into u0), not yet current — push forces, then end() */
  step() {
    const { u, u0, lap, lap0, ext, inner, cl } = this;
    const W = this.W, a = this.a, s1 = this.s1, inv = this.inv, m2 = this.m2;
    const area = inner.length * this.h * this.h;
    const l2 = this.l2 * (1 + (this.o.glide * this.S) / area);
    for (let q = 0; q < ext.length; q++) {
      const i = ext[q];
      lap[i] = u[i - 1] + u[i + 1] + u[i - W] + u[i + W] - 4 * u[i];
    }
    let S = 0, vol = 0;
    const binL = this.binL, binR = this.binR, accL = this.accL, accR = this.accR;
    if (binL && binR && accL && accR) {
      for (let q = 0; q < inner.length; q++) {
        const i = inner[q], L = lap[i], ui = u[i];
        const B = lap[i - 1] + lap[i + 1] + lap[i - W] + lap[i + W] - 4 * L;
        const un = (2 * ui - a * u0[i] + cl[i] * (l2 * L - m2 * B) + s1 * (L - lap0[i])) * inv;
        u0[i] = un; S -= ui * L; vol += un;
        accL[binL[q]] += un; accR[binR[q]] += un;
      }
    } else {
      for (let q = 0; q < inner.length; q++) {
        const i = inner[q], L = lap[i], ui = u[i];
        const B = lap[i - 1] + lap[i + 1] + lap[i - W] + lap[i + W] - 4 * L;
        const un = (2 * ui - a * u0[i] + cl[i] * (l2 * L - m2 * B) + s1 * (L - lap0[i])) * inv;
        u0[i] = un; S -= ui * L; vol += un;
      }
    }
    this.S = S; this.vol = vol;
  }
  /** a force (N) on a patch this step */
  push(p: Patch, F: number) {
    if (F === 0) return;
    const f = F * this.fk;
    for (let j = 0; j < p.idx.length; j++) {
      const g = p.idx[j], inc = f * p.w[j] * this.cl[g];
      this.u0[g] += inc; this.vol += inc;
      if (this.accL && this.binL && this.accR && this.binR) { const q = this.slot[g]; this.accL[this.binL[q]] += inc; this.accR[this.binR[q]] += inc; }
    }
  }
  /** the step done: the new state current, the listening points' sums sent on with their delays */
  end() {
    let t = this.u; this.u = this.u0; this.u0 = t;
    t = this.lap; this.lap = this.lap0; this.lap0 = t;
    this.vol *= this.h * this.h;
    const { accL, accR, outL, outR, gL, gR } = this;
    if (accL && accR && outL && outR && gL && gR) {
      for (let b = 0; b < accL.length; b++) {
        if (accL[b] !== 0) { outL[this.n + b] += accL[b] * gL[b]; accL[b] = 0; }
        if (accR[b] !== 0) { outR[this.n + b] += accR[b] * gR[b]; accR[b] = 0; }
      }
    }
    this.n++;
  }
  /** the pressure (Pa) at the listening points: ρ0/2π ∂²/∂t² Σ u h² / r */
  pressure(): [Float32Array, Float32Array] {
    const g = (RHO_AIR / (2 * Math.PI)) * this.h * this.h * this.o.sr * this.o.sr;
    const d2 = (o: Float64Array) => { const p = new Float32Array(this.n); for (let i = 2; i < this.n; i++) p[i] = (o[i] - 2 * o[i - 1] + o[i - 2]) * g; return p; };
    return [d2(this.outL!), d2(this.outR!)];
  }
}

// ---------------------------------------------------------------- the drum and the beater
/** the great drum's hide: drum.ts's wave speed and stiffness, a real hide's losses (the fundamental's T60 ≈ 2.9 s, the
 *  high modes' far less) */
export const HIDE: HideSpec = { n: 150, radius: 0.85, sr: 48000, c: 100, kappa: 0.16, sigma0: 2.3, sigma1: 0.011, rho: 3.5, glide: 40, grain: 0.1, seed: 9 };
/** the beater's head: 0.25 kg in all, its leather cover and the felt's outer layer a few grams of that riding on the
 *  felt (the leather meets the hide first: Hertzian, stiff, a little lossy; the felt holds it on when it's pulled).
 *  Its footprint grows as it presses in (a sphere's: a = √(R·δ)), from a cell at the first touch to ~4.8 cm across */
export const BEATER = { mass: 0.25, alpha: 2.4, radius: 0.075, footprint: 0.024, skin: 0.008, skinK: 4e7, skinLoss: 0.2, pull: 2e4 };
/** where we listen from: two points 1.9 m out from the hide, either side of its axis */
const EARS: [[number, number, number], [number, number, number]] = [[-0.45, 0.1, 1.9], [0.45, 0.1, 1.9]];

export interface StrikeSpec {
  /** the head's speed into the hide (m/s), where it lands (metres from the centre), the felt's stiffness */
  v: number; at: [number, number]; K: number;
  /** how long to listen (s) */
  seconds: number;
  /** the losses' scale through the ring, every 10 ms ([σ0×, σ1×]; for the great stroke's slowed decay) */
  loss?: [number, number][];
}
export interface Strike {
  sr: number;
  /** the pressure in front (Pa), the back face's volume acceleration (m³/s²), the pickups' velocity (m/s) */
  front: [Float32Array, Float32Array]; back: Float32Array; pick: [Float32Array, Float32Array];
  /** the head's force on the hide (N) */
  force: Float32Array;
  /** the contact: when it came off (s), the peak force (N), the felt's deepest compression (m), the hide's deepest
   *  push under it (m) */
  contact: { off: number; peakF: number; comp: number; push: number };
  courant: number;
}

export function strike(s: StrikeSpec, hide: HideSpec = HIDE): Strike {
  const m = new Membrane(hide);
  const steps = Math.round(s.seconds * hide.sr), k = m.k;
  m.listen(EARS[0], EARS[1], steps);
  const foot = m.patch(s.at[0], s.at[1], BEATER.footprint + m.h);
  const dist = new Float64Array(foot.idx.length);
  for (let j = 0; j < foot.idx.length; j++) {
    const g = foot.idx[j], gi = (g % m.W) - 3, gj = Math.floor(g / m.W) - 3;
    dist[j] = Math.hypot((gi + 0.5) * m.h - hide.radius - s.at[0], (gj + 0.5) * m.h - hide.radius - s.at[1]);
  }
  /** the footprint's weights for a contact radius a (at least the nearest cell) */
  const spread = (a: number) => {
    let sum = 0;
    const r = Math.max(a, m.h * 0.75);
    for (let j = 0; j < dist.length; j++) { const w = dist[j] < r ? Math.cos((Math.PI / 2) * (dist[j] / r)) ** 2 : 0; foot.w[j] = w; sum += w; }
    if (sum === 0) { let b = 0; for (let j = 1; j < dist.length; j++) if (dist[j] < dist[b]) b = j; foot.w[b] = 1; sum = 1; }
    for (let j = 0; j < dist.length; j++) foot.w[j] /= sum;
  };
  spread(0);
  const p1 = m.cell(0.12, -0.31), p2 = m.cell(0.42, 0.18);
  const back = new Float32Array(steps), force = new Float32Array(steps);
  const v1 = new Float32Array(steps), v2 = new Float32Array(steps);
  // the leather (xs, vs) and the core behind the felt (xb, vb), both coming in at the stroke's speed
  let xs = 0, vs = s.v, xb = 0, vb = s.v, touching = true, off = 0, peakF = 0, comp = 0, push = 0;
  const ms = BEATER.skin, mc = BEATER.mass - ms;
  let volPrev = 0, volPrev2 = 0, u1p = 0, u2p = 0, underPrev = 0;
  const lossStep = Math.round(0.01 * hide.sr);
  for (let n = 0; n < steps; n++) {
    if (s.loss && n % lossStep === 0) {
      const [a, b] = s.loss[Math.min(s.loss.length - 1, n / lossStep)];
      m.loss(hide.sigma0 * a, hide.sigma1 * b);
    }
    m.step();
    let F = 0;
    if (touching) {
      // the leather into the hide under it (Hunt–Crossley: stiff, losing a little as it's pressed), the felt squeezed
      // between the core and the leather
      const under = m.under(foot), ec = xs - under, ecDot = vs - (under - underPrev) * hide.sr;
      underPrev = under;
      if (ec > 0) F = Math.max(0, BEATER.skinK * Math.pow(ec, 1.5) * (1 + BEATER.skinLoss * ecDot));
      const ef = xb - xs, Ff = ef > 0 ? s.K * Math.pow(ef, BEATER.alpha) : BEATER.pull * ef;
      vs += ((Ff - F) / ms) * k; vb -= (Ff / mc) * k;
      xs += vs * k; xb += vb * k;
      comp = Math.max(comp, ef); push = Math.max(push, under);
      spread(Math.min(BEATER.footprint, Math.sqrt(BEATER.radius * Math.max(0, xb - under))));
      // (off when it's parted from the hide and on its way back: the hand takes it from there)
      if (ec <= 0 && vb < 0 && vs < 0 && n * k > 0.001) { touching = false; off = n * k; }
    }
    m.push(foot, F);
    m.end();
    force[n] = F; peakF = Math.max(peakF, F);
    const vol = m.vol;
    back[n] = (vol - 2 * volPrev + volPrev2) * hide.sr * hide.sr;
    volPrev2 = volPrev; volPrev = vol;
    const a1 = m.u[p1], a2 = m.u[p2];
    v1[n] = (a1 - u1p) * hide.sr; v2[n] = (a2 - u2p) * hide.sr; u1p = a1; u2p = a2;
  }
  return { sr: hide.sr, front: m.pressure(), back, pick: [v1, v2], force, contact: { off, peakF, comp, push }, courant: m.courant };
}

/** the felt's stiffness K for a contact of `ms` milliseconds at speed v (bisection over short strikes) */
export function feltFor(ms: number, v: number, at: [number, number]) {
  let lo = Math.log(1e5), hi = Math.log(1e11);
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    const r = strike({ v, at, K: Math.exp(mid), seconds: 0.03 });
    if (r.contact.off === 0 || r.contact.off * 1000 > ms) lo = mid; else hi = mid;
  }
  return Math.exp((lo + hi) / 2);
}

// ---------------------------------------------------------------- the membrane of the universe
/** the universe's membrane: the same scheme, vast and slow (its fundamental ≈ 18 Hz, a thousand modes under 500 Hz),
 *  barely damped, its thickness very uneven; units are its own (radius 1), run at 12 kHz (nothing it says is high) */
export const COSMOS: HideSpec = { n: 120, radius: 1, sr: 12000, c: 47, kappa: 0.004, sigma0: 0.32, sigma1: 0.0006, rho: 1, glide: 0, grain: 0.22, seed: 3 };

export interface Drive {
  /** where it's pushed (radius 1), how wide, and the push itself (a signal at the membrane's rate) */
  at: [number, number]; rad: number; signal: Float32Array;
}
export interface UniverseSpec {
  seconds: number; drives: Drive[];
  /** the losses' scale every 10 ms ([σ0×, σ1×]) */
  loss?: [number, number][];
}
/** the universe membrane pushed by the drives: the velocity at four points across it, and its volume's acceleration */
export function universe(s: UniverseSpec, hide: HideSpec = COSMOS) {
  const m = new Membrane(hide);
  const steps = Math.round(s.seconds * hide.sr);
  const patches = s.drives.map((d) => m.patch(d.at[0], d.at[1], d.rad));
  const pts = [m.cell(-0.55, 0.21), m.cell(0.48, -0.33), m.cell(-0.18, -0.62), m.cell(0.27, 0.58)];
  const pick = pts.map(() => new Float32Array(steps)), prev = pts.map(() => 0);
  const acc = new Float32Array(steps);
  let v1 = 0, v2 = 0;
  const lossStep = Math.round(0.01 * hide.sr);
  for (let n = 0; n < steps; n++) {
    if (s.loss && n % lossStep === 0) {
      const [a, b] = s.loss[Math.min(s.loss.length - 1, n / lossStep)];
      m.loss(hide.sigma0 * a, hide.sigma1 * b);
    }
    m.step();
    for (let d = 0; d < patches.length; d++) { const sig = s.drives[d].signal; if (n < sig.length) m.push(patches[d], sig[n]); }
    m.end();
    for (let p = 0; p < pts.length; p++) { const u = m.u[pts[p]]; pick[p][n] = (u - prev[p]) * hide.sr; prev[p] = u; }
    acc[n] = (m.vol - 2 * v1 + v2) * hide.sr * hide.sr; v2 = v1; v1 = m.vol;
  }
  return { sr: hide.sr, pick, acc, courant: m.courant };
}
