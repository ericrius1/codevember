// The world inside the drum: what the hide shows when it thins to a veil — deep, bigger on the inside than the drum,
// as if under water. A sea of membranes: sheets folding through the water, each a minimal surface's kind of curve,
// with smaller sheets folding through those and smaller again (a gyroid noise at three scales, turned against each
// other by the golden angle and warped by a slower noise, so nothing repeats), each catching the light in a soap
// film's colours and veiling what's behind it; gold threads of light where two folds cross; motes drifting; the water
// taking the light with depth, teal to indigo, to a gold source far down the middle where the sheets part. It flows
// toward the hide, turning slowly, and as the trip deepens turns more and breathes.
//
// Marched as a volume: a ray from the hide (bent by the hide's ripples and its cells, drum.wgsl) through the field in
// even steps (each pixel's start jittered, so the steps never show), the sheets' light and their veiling gathered
// front to back. (Included by drum.wgsl, after common.)

/** realm units a metre */
const INNER_SCALE = 1.6;
const INNER_STEPS = 44;

fn innerRot(a: f32) -> mat2x2f { let c = cos(a); let s = sin(a); return mat2x2f(c, s, -s, c); }

struct InnerCtx { T: f32, trip: f32, flow: f32 };
var<private> IC: InnerCtx;

/** the field at a point (realm frame): x the sheets' (0 on a sheet), y the threads' (0 where two folds cross), z a
 *  slow tint coordinate */
fn innerField(p0: vec3f) -> vec3f {
  var p = p0;
  p.z += IC.flow;
  let tw = p.z * (0.05 + 0.07 * IC.trip) + IC.T * 0.02;
  p = vec3f(innerRot(tw) * p.xy, p.z);
  // (the slow warp: the sheets bending, breathing)
  let wq = p * 0.3 + vec3f(0.0, 0.0, IC.T * 0.04);
  let w = vec3f(dotNoise(wq), dotNoise(wq + vec3f(5.2, 1.3, 2.8)), dotNoise(wq + vec3f(9.7, 4.1, 6.3))) * (0.35 + 0.2 * IC.trip);
  let q = p * 1.05 + w;
  let g1 = dotNoise(q);
  let g2 = dotNoise(q * 2.37 + vec3f(3.1, 0.7, 1.9));
  let g3 = dotNoise(q * 5.53 + vec3f(7.4, 2.2, 4.6));
  return vec3f(g1 + 0.45 * g2 + 0.2 * g3, abs(g1) * 0.7 + abs(g2), w.x + 0.3 * g2);
}

/** the realm seen along a ray: ro, rd in the world (ro on the hide), T its clock (s), trip 0..1, px the pixel's angle,
 *  jit 0..1 (the pixel's own start in the steps) */
fn innerWorld(roW: vec3f, rdW: vec3f, T: f32, trip: f32, px: f32, jit: f32) -> vec3f {
  let C = D.center.xyz;
  // (the realm's frame: x across (world z), y up, z into the drum (world x))
  let ro = vec3f(roW.z - C.z, roW.y - C.y, roW.x - C.x) * INNER_SCALE;
  let rd = normalize(vec3f(rdW.z, rdW.y, rdW.x));
  IC.T = T; IC.trip = trip; IC.flow = T * (0.2 + 0.22 * trip);
  // the water: teal near, indigo deep; the source far down the middle, gold
  let water = vec3f(0.012, 0.055, 0.07);
  let deepW = vec3f(0.006, 0.005, 0.028);
  let off = length(rd.xy) / max(rd.z, 0.05);
  let source = vec3f(1.0, 0.78, 0.42) * (exp(-off * off * 50.0) * 2.4 + exp(-off * 3.5) * 0.35);
  let dt = 0.17;
  var t = 0.05 + dt * jit;
  var col = vec3f(0.0);
  var trans = 1.0;
  for (var i = 0; i < INNER_STEPS; i++) {
    let p = ro + rd * t;
    let f = innerField(p);
    // (the sheets part down the middle, the eye's road to the source; and there's a little water before them)
    let road = smoothstep(0.25, 0.75, length(p.xy)) * smoothstep(0.1, 0.6, p.z);
    // a sheet where the field crosses 0: its film's colours, by how it's turned (the field's own value standing in)
    let sheet = exp(-f.x * f.x * 70.0) * road;
    let film = thinFilm(0.5 + 0.5 * sin(f.z * 2.0 + T * 0.15), 360.0 + 300.0 * f.z + 120.0 * trip * sin(T * 0.4 + f.z));
    let threads = exp(-f.y * f.y * 60.0) * road;
    let depthK = exp(-t * 0.22);
    // motes: plankton of light drifting through the water (a lattice of points, each jittered and pulsing)
    let mp = p + vec3f(0.0, T * 0.03, IC.flow * 0.3);
    let mc = floor(mp / 0.5);
    let mr = hash33(mc + 11.0);
    let md = length(mp - (mc + 0.2 + 0.6 * mr) * 0.5);
    let mote = exp(-md * md / (0.0001 + t * t * px * px * 4.0)) * step(0.6, mr.x) * (0.6 + 0.4 * sin(T * 2.0 + mr.y * 20.0));
    let em = (film * film * 0.22 + vec3f(0.01, 0.04, 0.05)) * sheet + vec3f(1.0, 0.62, 0.25) * threads * 0.3 + mix(vec3f(0.4, 1.0, 0.9), vec3f(1.0, 0.85, 0.5), mr.z) * mote * 0.35;
    col += trans * em * depthK * dt * 5.0;
    // (each sheet veils what's behind it, darkly; the water a little everywhere)
    trans *= exp(-(0.08 + 2.4 * sheet) * dt);
    t += dt;
    if (trans < 0.03) { break; }
  }
  let back = mix(water, deepW, sat(t / (f32(INNER_STEPS) * dt))) + source;
  return col + trans * back;
}
