// The hide's simulation, one step a dispatch: the wave equation on a clamped circular membrane (a real hide's tension
// and stiffness, damped — more for the higher modes), the beater's head a one-sided obstacle while it's in contact (the
// hide can't be in front of it). A frame runs as many steps as its share of the membrane's clock needs, each with its
// own contact (where the head was at that instant of the stroke).
#include "./common"

const N = 256u;

struct SimU {
  // x the hide's radius (m), y cell size (m), z λ² (c·dt/h)², w μ² (stiffness)
  sim: vec4f,
  // x the damping σ0·dt, y the high modes' extra loss, z, w
  sim2: vec4f,
}
@group(2) @binding(0) var<uniform> D: SimU;
struct Contact {
  // the beater's head on the hide (its frame: a across, b up), how far its front is through the hide's rest plane
  // (m, + into the drum), its radius (w <= 0: not touching)
  k: vec4f,
}
@group(2) @binding(1) var<uniform> C: Contact;
@group(2) @binding(2) var simIn: texture_2d<f32>;
@group(2) @binding(3) var simOut: texture_storage_2d<rg32float, write>;

// ---------------------------------------------------------------- the simulation (one step a dispatch)
fn cellR(c: vec2i) -> f32 { return length((vec2f(c) + 0.5) / f32(N) * 2.0 - 1.0) * D.sim.x; }
/** the hide at a cell (now, and a step ago); nothing past its rim (clamped there) */
fn at2(c: vec2i) -> vec2f {
  if (c.x < 0 || c.y < 0 || c.x >= i32(N) || c.y >= i32(N)) { return vec2f(0.0); }
  if (cellR(c) >= D.sim.x) { return vec2f(0.0); }
  return textureLoad(simIn, c, 0).xy;
}
@compute @workgroup_size(8, 8) fn step(@builtin(global_invocation_id) id: vec3u) {
  let c = vec2i(id.xy);
  if (id.x >= N || id.y >= N) { return; }
  let r = cellR(c);
  if (r >= D.sim.x) { textureStore(simOut, c, vec4f(0.0)); return; }
  let s = at2(c);
  let e = at2(c + vec2i(1, 0)); let w = at2(c - vec2i(1, 0)); let n = at2(c + vec2i(0, 1)); let so = at2(c - vec2i(0, 1));
  // the Laplacian now and a step ago (h² Δu), and the biharmonic (h⁴ Δ²u, the 13-point stencil)
  let lap = e + w + n + so - 4.0 * s;
  let ring = e.x + w.x + n.x + so.x;
  let diag = at2(c + vec2i(1, 1)).x + at2(c + vec2i(1, -1)).x + at2(c + vec2i(-1, 1)).x + at2(c + vec2i(-1, -1)).x;
  let far = at2(c + vec2i(2, 0)).x + at2(c - vec2i(2, 0)).x + at2(c + vec2i(0, 2)).x + at2(c - vec2i(0, 2)).x;
  let bih = far + 2.0 * diag - 8.0 * ring + 20.0 * s.x;
  // u⁺ = [2u − (1 − σ0k) u⁻ + λ² Δu − μ² Δ²u + 2σ1k/h² (Δu − Δu⁻)] / (1 + σ0k)   (Bilbao's stiff, lossy membrane)
  let s0 = D.sim2.x;
  var un = (2.0 * s.x - (1.0 - s0) * s.y + D.sim.z * lap.x - D.sim.w * bih + D.sim2.y * (lap.x - lap.y)) / (1.0 + s0);
  // the beater's head: the hide can't be in front of it while it's pressing in
  let k = C.k;
  if (k.w > 0.0) {
    let p = ((vec2f(c) + 0.5) / f32(N) * 2.0 - 1.0) * D.sim.x;
    let dr = length(p - k.xy);
    if (dr < k.w) {
      let front = k.z - (k.w - sqrt(max(k.w * k.w - dr * dr, 0.0)));
      un = max(un, front);
    }
  }
  textureStore(simOut, c, vec4f(un, s.x, 0.0, 0.0));
}
