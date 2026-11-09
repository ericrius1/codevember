// The sky round the dais, one fullscreen pass: we live inside a bubble — our universe — and its wall is the sky, a
// soap-film membrane all round us a hundred-odd metres out. Our own sky (a violet nebula, its stars) is in front of
// it. And the bubble is a cell of a foam: its wall is thirty-two curved faces (a truncated icosahedron's), each shared
// with the universe next door, joined along bright Plateau borders.
//
// The great stroke's shock reaches the wall and ripples it: wave packets run out across it from where the shock came
// (G.waves), and each neighbouring universe answers from its own face a beat later, so the rings cross and
// interfere. Where the film thins in the troughs, and then as the whole wall thins (K.worlds.x), the faces open on
// the worlds beyond, each its own place: a ringed giant over a sea of light, a living coral of light (the Apollonian
// fractal's caves), a lattice of crystals strung on beams, islands floating in a gold dusk with falls of light from
// them, a spiral galaxy. The ripples lens them as water does; the film's colours lie over them.
#include "./common"
#include "weft/fullscreen"

struct CosmosU {
  // x how far the wall has thinned on the worlds (0..1), y its faces' borders' light (0..1), z the worlds' own clock
  // (s), w their exposure
  worlds: vec4f,
  // x the lens: how far the ripples bend the light through them, y one world on every face (a debug: ≥ 0), z the
  // ripples' own clock (it speeds up as time comes back: the events in G.waves are on it), w spare
  aux: vec4f,
  // the front: the great stroke's shock reaching the wall — x when it first does, behind the drum (film s; < 0 not
  // yet), y how far that is from the drum (m), z how fast the line where it arrives sweeps on round (m/s), w its height
  front: vec4f,
}
@group(2) @binding(0) var<uniform> K: CosmosU;

// ---------------------------------------------------------------- the wall's ripples
/** the height of the ripples at a point (unit n from the sphere's centre, radius R) from one event (xyz where on the
 *  wall, w when): a packet running out over the sphere at `speed` (m/s), its rings behind its front, `k` rings a metre */
fn ripple(n: vec3f, R: f32, ev: vec4f, speed: f32, amp: f32, k: f32) -> f32 {
  if (ev.w < 0.0) { return 0.0; }
  let age = K.aux.z - ev.w;
  if (age <= 0.0) { return 0.0; }
  let arc = acos(clamp(dot(n, normalize(ev.xyz)), -1.0, 1.0)) * R;
  let front = speed * age;
  let x = front - arc;
  if (x < 0.0) { return 0.0; }
  let fade = exp(-age * 0.14) * (1.0 - exp(-age * 3.0));
  // (the rings stretch a little as they spread)
  let lam = 1.0 / k * (1.0 + age * 0.05);
  return amp * sin(TAU * x / lam) * exp(-x / (front * 0.5 + 25.0)) * fade * smoothstep(0.0, lam * 0.5, x);
}

// the foam's faces: a hundred and ten of them (a Fibonacci lattice on the sphere: cells near enough all one size), so
// that wherever we look several are in view, each opening on its own world; no two faces that touch open on the same
// one: 0 the ringed giant over its sea, 1 the coral, 2 the lattice, 3 the islands, 4 the galaxy, 5 the aurora, 6 the
// nebula (dealt out greedily, the near side first — behind the drum and up over it, where the reveal looks)
const NF = 110;
const SEEDS = array<vec3f, 110>(
  vec3f(0.13453, 0.00000, -0.99091),
  vec3f(-0.17103, 0.15668, -0.97273),
  vec3f(0.02606, -0.29692, -0.95455),
  vec3f(0.21358, 0.27858, -0.93636),
  vec3f(-0.39010, -0.06900, -0.91818),
  vec3f(0.36778, -0.23395, -0.90000),
  vec3f(-0.12243, 0.45542, -0.88182),
  vec3f(-0.23235, -0.44738, -0.86364),
  vec3f(0.50164, 0.18320, -0.84545),
  vec3f(-0.51930, 0.21436, -0.82727),
  vec3f(0.24909, -0.53229, -0.80909),
  vec3f(0.18314, 0.58389, -0.79091),
  vec3f(-0.54918, -0.31826, -0.77273),
  vec3f(0.64094, -0.14091, -0.75455),
  vec3f(-0.38912, 0.55349, -0.73636),
  vec3f(-0.08942, -0.69009, -0.71818),
  vec3f(0.54607, 0.46023, -0.70000),
  vec3f(-0.73090, 0.03022, -0.68182),
  vec3f(0.53024, -0.52766, -0.66364),
  vec3f(-0.03528, 0.76298, -0.64545),
  vec3f(-0.49898, -0.59795, -0.62727),
  vec3f(0.78602, 0.10576, -0.60909),
  vec3f(-0.66222, 0.46075, -0.59091),
  vec3f(0.17992, -0.79976, -0.57273),
  vec3f(0.41373, 0.72202, -0.55455),
  vec3f(-0.80406, -0.25652, -0.53636),
  vec3f(0.77641, -0.35872, -0.51818),
  vec3f(-0.33434, 0.79889, -0.50000),
  vec3f(-0.29658, -0.82456, -0.48182),
  vec3f(0.78430, 0.41221, -0.46364),
  vec3f(-0.86573, 0.22820, -0.44545),
  vec3f(0.48898, -0.76048, -0.42727),
  vec3f(0.15455, 0.89931, -0.40909),
  vec3f(-0.72771, -0.56358, -0.39091),
  vec3f(0.92477, -0.07662, -0.37273),
  vec3f(-0.63497, 0.68638, -0.35455),
  vec3f(0.00459, -0.94172, -0.33636),
  vec3f(0.63697, 0.70216, -0.31818),
  vec3f(-0.94987, -0.08803, -0.30000),
  vec3f(0.76427, -0.58006, -0.28182),
  vec3f(-0.17265, 0.94905, -0.26364),
  vec3f(-0.51631, -0.82047, -0.24545),
  vec3f(0.93920, 0.25740, -0.22727),
  vec3f(-0.87002, 0.44648, -0.20909),
  vec3f(0.34122, -0.92039, -0.19091),
  vec3f(0.37138, 0.91227, -0.17273),
  vec3f(-0.89280, -0.42311, -0.15455),
  vec3f(0.94669, -0.29187, -0.13636),
  vec3f(-0.50208, 0.85671, -0.11818),
  vec3f(-0.20890, -0.97281, -0.10000),
  vec3f(0.81251, 0.57717, -0.08182),
  vec3f(-0.99031, 0.12342, -0.06364),
  vec3f(0.64750, -0.76071, -0.04545),
  vec3f(0.03643, 0.99896, -0.02727),
  vec3f(-0.70188, -0.71223, -0.00909),
  vec3f(0.99865, 0.05106, 0.00909),
  vec3f(-0.77061, 0.63672, 0.02727),
  vec3f(0.13804, -0.98938, 0.04545),
  vec3f(0.56597, 0.82197, 0.06364),
  vec3f(-0.97127, -0.22349, 0.08182),
  vec3f(0.86570, -0.49047, 0.10000),
  vec3f(-0.30642, 0.94453, 0.11818),
  vec3f(-0.41111, -0.90133, 0.13636),
  vec3f(0.90952, 0.38586, 0.15455),
  vec3f(-0.92846, 0.32884, 0.17273),
  vec3f(0.46091, -0.86667, 0.19091),
  vec3f(0.24464, 0.94680, 0.20909),
  vec3f(-0.81654, -0.53067, 0.22727),
  vec3f(0.95619, -0.15953, 0.24545),
  vec3f(-0.59435, 0.75976, 0.26364),
  vec3f(-0.07455, -0.95657, 0.28182),
  vec3f(0.69708, 0.65121, 0.30000),
  vec3f(-0.94798, -0.00925, 0.31818),
  vec3f(0.70058, -0.62933, 0.33636),
  vec3f(-0.09083, 0.93062, 0.35455),
  vec3f(-0.55738, -0.74189, 0.37273),
  vec3f(0.90475, 0.16916, 0.39091),
  vec3f(-0.77466, 0.48223, 0.40909),
  vec3f(0.24322, -0.87079, 0.42727),
  vec3f(0.40488, 0.79852, 0.44545),
  vec3f(-0.82926, -0.31205, 0.46364),
  vec3f(0.81320, -0.32643, 0.48182),
  vec3f(-0.37470, 0.78077, 0.50000),
  vec3f(-0.24799, -0.81853, 0.51818),
  vec3f(0.72606, 0.43029, 0.53636),
  vec3f(-0.81445, 0.17074, 0.55455),
  vec3f(0.47798, -0.66597, 0.57273),
  vec3f(0.09586, 0.80102, 0.59091),
  vec3f(-0.60143, -0.51700, 0.60909),
  vec3f(0.77841, -0.02458, 0.62727),
  vec3f(-0.54663, 0.53346, 0.64545),
  vec3f(0.04184, -0.74688, 0.66364),
  vec3f(0.46319, 0.56620, 0.68182),
  vec3f(-0.70680, -0.10213, 0.70000),
  vec3f(0.57505, -0.39183, 0.71818),
  vec3f(-0.15493, 0.65861, 0.73636),
  vec3f(-0.32070, -0.57255, 0.75455),
  vec3f(0.60280, 0.19881, 0.77273),
  vec3f(-0.55799, 0.25123, 0.79091),
  vec3f(0.23216, -0.53988, 0.80909),
  vec3f(0.18498, 0.53048, 0.82727),
  vec3f(-0.47029, -0.25306, 0.84545),
  vec3f(0.48869, -0.12373, 0.86364),
  vec3f(-0.25891, 0.39416, 0.88182),
  vec3f(-0.06963, -0.43029, 0.90000),
  vec3f(0.31083, 0.24561, 0.91818),
  vec3f(-0.35010, 0.02557, 0.93636),
  vec3f(0.20454, -0.21681, 0.95455),
  vec3f(-0.00339, 0.23193, 0.97273),
  vec3f(-0.08941, -0.10052, 0.99091));
const KINDS = array<i32, 110>(1, 2, 2, 4, 6, 3, 6, 5, 6, 4, 6, 0, 4, 0, 0, 0, 5, 3, 5, 3, 6, 3, 1, 2, 6, 5, 6, 1, 2, 4, 2, 4, 0, 2, 2, 3, 1, 0, 6, 0, 2, 1, 1, 4, 0, 3, 3, 3, 4, 0, 3, 3, 3, 4, 6, 5, 6, 3, 6, 4, 1, 3, 3, 0, 5, 5, 1, 5, 6, 5, 6, 5, 1, 2, 5, 0, 3, 1, 2, 0, 2, 4, 4, 5, 2, 4, 1, 2, 4, 1, 0, 0, 4, 0, 5, 5, 1, 5, 5, 4, 1, 6, 6, 6, 3, 2, 3, 2, 0, 1);
fn facetSeed(i: i32) -> vec3f { return SEEDS[i]; }
fn facetKind(i: i32) -> i32 { return KINDS[i]; }
// where the neighbouring universes answer from (an icosahedron's twelve directions, turned)
const ANSWERS = array<vec3f, 12>(
  vec3f(0.922602, 0.385753, 0.000000),
  vec3f(-0.757628, 0.652687, 0.000000),
  vec3f(-0.133467, -0.840115, 0.525731),
  vec3f(0.133467, 0.840115, 0.525731),
  vec3f(0.519220, -0.082487, 0.850651),
  vec3f(0.519220, -0.082487, -0.850651),
  vec3f(-0.519220, 0.082487, 0.850651),
  vec3f(0.133467, 0.840115, -0.525731),
  vec3f(0.757628, -0.652687, -0.000000),
  vec3f(-0.519220, 0.082487, -0.850651),
  vec3f(-0.133467, -0.840115, -0.525731),
  vec3f(-0.922602, -0.385753, -0.000000));

fn wallRipple(n: vec3f) -> f32 {
  let R = G.wall.w;
  var h = 0.0;
  for (var i = 0; i < 4; i++) { h += ripple(n, R, G.waves[i], 52.0 + f32(i) * 8.0, 1.0 - 0.2 * f32(i), 0.075); }
  // the neighbours answer, each from its own face, a beat after the shock's ripple reaches it
  if (G.waves[0].w > 0.0) {
    for (var i = 0; i < 12; i++) {
      let s = ANSWERS[i];
      let reach = acos(clamp(dot(s, normalize(G.waves[0].xyz)), -1.0, 1.0)) * R / 52.0;
      let ev = vec4f(s, G.waves[0].w + reach + 0.9 + 0.8 * hash11(f32(i) * 3.1));
      h += ripple(n, R, ev, 46.0, 0.24, 0.09);
    }
  }
  // (a faint breath on it always: the cosmos never quite still)
  h += 0.03 * sin(dot(n, vec3f(3.0, 1.0, 2.0)) * 23.0 + G.clock.x * 0.4) * sin(dot(n, vec3f(-1.0, 4.0, 1.0)) * 19.0 - G.clock.x * 0.3);
  return h;
}

/** which face a point of the wall is on, the next nearest, and how far it is (≈ rad) from the border between them and
 *  from the corner of three */
struct Facet { i: i32, seam: f32, node: f32 };
fn facetOf(n: vec3f) -> Facet {
  var b1 = -2.0; var b2 = -2.0; var b3 = -2.0; var i1 = 0; var i2 = 0; var i3 = 0;
  for (var i = 0; i < NF; i++) {
    let d = dot(n, facetSeed(i));
    if (d > b1) { b3 = b2; i3 = i2; b2 = b1; i2 = i1; b1 = d; i1 = i; }
    else if (d > b2) { b3 = b2; i3 = i2; b2 = d; i2 = i; }
    else if (d > b3) { b3 = d; i3 = i; }
  }
  var f: Facet;
  f.i = i1;
  f.seam = (b1 - b2) / length(facetSeed(i1) - facetSeed(i2));
  f.node = max(f.seam, (b1 - b3) / length(facetSeed(i1) - facetSeed(i3)));
  return f;
}
/** a face's world's frame: forward out through the face, its up (each world askew a little) */
fn facetFrame(i: i32) -> mat3x3f {
  let f = facetSeed(i);
  var up = vec3f(0.0, 1.0, 0.0);
  if (abs(f.y) > 0.8) { up = vec3f(0.0, 0.0, 1.0); }
  let u = normalize(up - f * dot(up, f));
  let r = cross(u, f);
  let tilt = (hash11(f32(i) * 5.3 + 0.7) - 0.5) * 0.6;
  let u2 = u * cos(tilt) + r * sin(tilt);
  // (x to the right as seen looking out through the face)
  return mat3x3f(cross(f, u2), u2, f);
}

// ---------------------------------------------------------------- our own sky
fn stars(rd: vec3f) -> vec3f {
  // (half as many as there were, each a soft disc the same share of the frame at any resolution — about two pixels
  // across at 540 — and steady: no twinkle, so the sky never boils)
  let px = frame.fovY / 540.0;
  var c = vec3f(0.0);
  for (var l = 0; l < 3; l++) {
    let s = 150.0 + f32(l) * 130.0;
    let q = rd * s;
    let id = floor(q);
    let h = hash33(id + f32(l) * 17.0);
    if (h.x > 0.975) {
      let p = id + 0.2 + h * 0.6;
      let d = length(q - p) / s;
      let w = px * (0.85 + 0.3 * h.y);
      // (most of them faint, a few bright)
      let e = 0.012 + 0.9 * h.z * h.z * h.z * h.z;
      c += mix(vec3f(0.7, 0.8, 1.0), vec3f(1.0, 0.82, 0.62), h.y) * exp(-0.5 * d * d / (w * w)) * e;
    }
  }
  return c;
}
fn nebula(rd: vec3f) -> vec3f {
  // (its slow drift round the loop: periodic, so the loop closes)
  let lp = TAU * G.clock.w;
  var p = rd * 2.2 + vec3f(0.03 * sin(lp), 0.0, 0.03 * cos(lp));
  var acc = vec3f(0.0);
  var a = 1.0;
  for (var i = 0; i < 5; i++) {
    let n = dotNoise(p * 1.7 + f32(i) * 1.3);
    acc += vec3f(0.35, 0.12, 0.6) * sat(n * 0.5 + 0.1) * a + vec3f(0.05, 0.35, 0.4) * sat(-n * 0.5 - 0.3) * a;
    p = p * 2.0 + sin(p.zxy * 1.3) * 0.3;
    a *= 0.55;
  }
  // (a river of it across the sky)
  let band = exp(-pow(dot(rd, normalize(vec3f(0.2, 1.0, 0.35))) * 2.4, 2.0));
  return acc * (0.06 + 0.22 * band) * vec3f(1.0, 0.9, 1.1);
}

/** ray–sphere: the near and far distances (no hit: far < 0) */
fn sphereHit(ro: vec3f, rd: vec3f, c: vec3f, r: f32) -> vec2f {
  let oc = ro - c;
  let b = dot(oc, rd);
  let q = dot(oc, oc) - r * r;
  let h = b * b - q;
  if (h < 0.0) { return vec2f(-1.0); }
  let s = sqrt(h);
  return vec2f(-b - s, -b + s);
}

// ---------------------------------------------------------------- the worlds beyond (each in its own frame: z out
// through its face, y its up; ro a small parallax as our camera moves; tm its own clock)

// 0: a ringed giant over a sea of light
const GIANT_C = vec3f(0.8, 2.6, 14.0);
const GIANT_R = 2.1;
const GIANT_AX = vec3f(0.3, 0.84, -0.46);
const GIANT_SUN = vec3f(-0.78, 0.32, -0.54);
fn giantSky(ro: vec3f, rd: vec3f, tm: f32) -> vec3f {
  let Ls = normalize(GIANT_SUN);
  let up = sat(rd.y * 0.5 + 0.5);
  var col = mix(vec3f(0.05, 0.12, 0.16), vec3f(0.006, 0.012, 0.04), pow(up, 0.6)) + stars(rd) * 0.5;
  let sd = max(dot(rd, Ls), 0.0);
  col += vec3f(1.0, 0.85, 0.6) * (pow(sd, 1200.0) * 30.0 + pow(sd, 40.0) * 0.25 + pow(sd, 6.0) * 0.06);
  // the giant
  let A = normalize(GIANT_AX);
  let hp = sphereHit(ro, rd, GIANT_C, GIANT_R);
  var tp = 1e9;
  if (hp.x > 0.0) {
    tp = hp.x;
    let N = normalize(ro + rd * tp - GIANT_C);
    let lat = dot(N, A);
    let swirl = dotNoise(N * 4.0 + vec3f(0.0, 0.0, tm * 0.01)) * 0.12;
    let b = 0.5 + 0.5 * sin(lat * 26.0 + swirl * 9.0 + 2.0 * sin(lat * 7.0));
    let b2 = 0.5 + 0.5 * sin(lat * 61.0 + swirl * 20.0);
    var albedo = mix(vec3f(0.62, 0.42, 0.26), vec3f(0.93, 0.83, 0.64), b) * mix(0.8, 1.05, b2);
    albedo = mix(albedo, vec3f(0.5, 0.22, 0.14), smoothstep(0.55, 0.6, abs(lat + 0.12)) * 0.4);
    let dif = sat(dot(N, Ls) * 0.9 + 0.1);
    // the rings' shadow on it
    let tr = dot(GIANT_C - (ro + rd * tp), A) / dot(Ls, A);
    let pr = ro + rd * tp + Ls * tr;
    let rr = length(pr - GIANT_C) / GIANT_R;
    let shade = select(1.0, 1.0 - 0.6 * smoothstep(1.35, 1.5, rr) * (1.0 - smoothstep(2.25, 2.4, rr)), tr > 0.0);
    let rim = pow(1.0 - sat(dot(N, -rd)), 3.0);
    col = albedo * dif * shade * 1.1 + vec3f(0.3, 0.5, 1.0) * rim * (0.2 + dif) + albedo * 0.015;
  }
  // two moons: one near (over the sea, in front of it all), one far beyond the giant
  for (var m = 0; m < 2; m++) {
    let mc = select(vec3f(5.5, 7.5, 30.0), vec3f(-2.6, 1.3, 6.5), m == 0);
    let mr = select(0.7, 0.32, m == 0);
    let hm = sphereHit(ro, rd, mc, mr);
    if (hm.x > 0.0 && hm.x < tp) {
      tp = hm.x;
      let N = normalize(ro + rd * hm.x - mc);
      let cr = 0.75 + 0.25 * vnoise(N * 9.0 + f32(m) * 7.0);
      let base = select(vec3f(0.62, 0.66, 0.72), vec3f(0.78, 0.6, 0.5), m == 0) * cr;
      col = base * sat(dot(N, Ls) * 0.95 + 0.05) + vec3f(0.2, 0.4, 0.6) * pow(1.0 - sat(dot(N, -rd)), 4.0) * 0.3;
      // (the far one hazed by the distance)
      col = mix(col, vec3f(0.05, 0.12, 0.16), select(0.55, 0.0, m == 0));
    }
  }
  // its rings
  let tr = dot(GIANT_C - ro, A) / dot(rd, A);
  if (tr > 0.0 && tr < tp) {
    let p = ro + rd * tr;
    let r = length(p - GIANT_C) / GIANT_R;
    let band = smoothstep(1.35, 1.45, r) * (1.0 - smoothstep(2.25, 2.4, r)) * (1.0 - 0.85 * exp(-pow((r - 1.92) / 0.025, 2.0)));
    let dens = band * (0.45 + 0.35 * sin(r * 47.0) + 0.2 * sin(r * 131.0)) * (0.8 + 0.2 * sin(r * 13.0));
    // (in the giant's shadow behind it)
    let sh = sphereHit(p, Ls, GIANT_C, GIANT_R);
    let lit = select(1.0, 0.12, sh.x > 0.0);
    let rc = vec3f(0.95, 0.85, 0.7) * (0.35 + 0.9 * abs(dot(Ls, A))) * lit;
    col = mix(col, rc, sat(dens * 0.9));
  }
  return col;
}
fn worldGiant(ro: vec3f, rd0: vec3f, tm: f32) -> vec3f {
  // (its horizon a little below its face's middle, the giant above it: seen from the dais, low in the sky)
  let cp = cos(0.3); let sp = sin(0.3);
  let rd = vec3f(rd0.x, rd0.y * cp + rd0.z * sp, -rd0.y * sp + rd0.z * cp);
  if (rd.y > -0.004) { return giantSky(ro, rd, tm); }
  // the sea: its swell, glowing from within in drifting veins of light, the giant in it
  let t = (-1.0 - ro.y) / rd.y;
  let p = ro + rd * t;
  let q = p.xz * 0.9;
  let g = vec2f(cos(q.x * 1.3 + tm * 0.4) + 0.6 * cos(q.x * 0.7 + q.y * 1.9 + tm * 0.3), cos(q.y * 1.1 - tm * 0.35) + 0.5 * cos(q.y * 2.3 - q.x * 0.6 + tm * 0.5)) * 0.06;
  let N = normalize(vec3f(-g.x, 1.0, -g.y));
  let R = reflect(rd, N);
  let fr = fresnel(0.03, dot(N, -rd));
  var col = giantSky(p, R, tm) * (0.25 + 0.75 * fr);
  let vein = pow(0.5 + 0.5 * sin(dotNoise(vec3f(q * 0.7, tm * 0.05)) * 3.0 + q.x * 0.4), 6.0);
  let glow = vec3f(0.1, 0.85, 0.75) * vein * 0.35 + vec3f(0.05, 0.25, 0.35) * 0.08;
  col += glow * exp(-t * 0.03);
  // (the haze at the horizon)
  return mix(col, vec3f(0.08, 0.2, 0.24), 1.0 - exp(-t * 0.02));
}

// 1: a living coral of light — the Apollonian gasket's caves, lit from within
fn apo(p: vec3f) -> vec2f {
  var q = p / 2.6; var s = 1.0 / 2.6; var orb = 1e4;
  for (var i = 0; i < 7; i++) {
    q = -1.0 + 2.0 * fract(0.5 * q + 0.5);
    let r2 = dot(q, q);
    orb = min(orb, r2);
    let k = 1.2 / r2;
    q *= k; s *= k;
  }
  return vec2f(0.25 * abs(q.y) / s, orb);
}
fn worldCoral(ro: vec3f, rd: vec3f, tm: f32) -> vec3f {
  // (seen at a third the size: more of its shells in view)
  let o = vec3f(0.36, 0.71, 0.13) * 2.6 + ro * 0.12 + vec3f(0.0, 0.0, tm * 0.01);
  var t = 0.0; var glow = vec3f(0.0); var hitOrb = -1.0; var steps = 0.0;
  for (var i = 0; i < 72; i++) {
    let d0 = apo(o + rd * t);
    let d = vec2f(d0.x, d0.y);
    let band = 0.5 + 0.5 * sin(d.y * 18.0 - tm * 0.6);
    glow += mix(vec3f(0.1, 0.9, 0.55), vec3f(0.85, 0.2, 1.0), band) * 0.0026 / (0.004 + d.x * 40.0);
    if (d.x < 0.0002 + t * 0.0008) { hitOrb = d.y; break; }
    t += d.x;
    steps += 1.0;
    if (t > 6.0) { break; }
  }
  // (its open water: a haze of light, teal below, violet above, the caves' far reaches)
  let haze = mix(vec3f(0.03, 0.22, 0.2), vec3f(0.2, 0.05, 0.3), sat(rd.y * 0.5 + 0.5)) * (0.7 + 0.3 * sin(dot(rd, vec3f(5.0, 3.0, 1.0)) + tm * 0.2));
  var col = haze;
  if (hitOrb >= 0.0) {
    let p = o + rd * t;
    let e = vec2f(0.0005, 0.0);
    let N = normalize(vec3f(apo(p + e.xyy).x - apo(p - e.xyy).x, apo(p + e.yxy).x - apo(p - e.yxy).x, apo(p + e.yyx).x - apo(p - e.yyx).x));
    let ao = 1.0 - steps / 72.0;
    // (each shell of the gasket its own living colour; veins pulsing along them)
    let hue = fract(hitOrb * 0.9 + 0.1);
    let base = 0.5 + 0.5 * cos(TAU * (hue + vec3f(0.55, 0.3, 0.05)));
    let vein = pow(0.5 + 0.5 * sin(hitOrb * 60.0 + tm * 0.8), 10.0);
    let lit = sat(dot(N, normalize(vec3f(0.4, 0.8, -0.3)))) * 0.6 + 0.4;
    let rim = pow(1.0 - abs(dot(N, rd)), 3.0);
    col = base * (0.35 + 0.65 * base) * lit * ao * 1.3 + vec3f(0.3, 1.0, 0.7) * vein * 1.4 * ao + mix(vec3f(0.2, 0.9, 0.8), vec3f(0.9, 0.3, 1.0), hue) * rim * 0.7 * ao;
    col = mix(haze, col, exp(-t * 0.35));
  }
  return col + glow;
}

// 2: a lattice of crystals strung on beams of light, turning slowly, out to forever
fn latticeD(p: vec3f) -> vec2f {
  let c = round(p / 2.0);
  let q = p - c * 2.0;
  let s = 0.26 + 0.16 * hash13(c);
  let oct = (abs(q.x) + abs(q.y) + abs(q.z) - s) * 0.57735;
  let beam = min(min(length(q.xy), length(q.yz)), length(q.xz)) - 0.012;
  return vec2f(min(oct, beam), select(1.0, 0.0, oct < beam));
}
fn worldLattice(ro: vec3f, rd0: vec3f, tm: f32) -> vec3f {
  let a = tm * 0.02;
  let rot = mat3x3f(vec3f(cos(a), 0.0, sin(a)), vec3f(0.0, 1.0, 0.0), vec3f(-sin(a), 0.0, cos(a)));
  let rd = rot * rd0;
  let o = vec3f(1.0, 1.0, 0.3) + ro * 0.2 + vec3f(0.0, 0.0, tm * 0.05);
  var t = 0.0; var glow = vec3f(0.0); var hit = false; var kind = 0.0;
  for (var i = 0; i < 64; i++) {
    let d = latticeD(o + rd * t);
    // the beams' light, and the crystals' halo
    glow += mix(vec3f(0.35, 0.55, 1.0), vec3f(1.0, 0.55, 0.85), d.y) * 0.0009 / (0.01 + d.x * d.x * 400.0) * exp(-t * 0.12);
    if (d.x < 0.001) { hit = true; kind = d.y; break; }
    t += d.x * 0.9;
    if (t > 30.0) { break; }
  }
  var col = vec3f(0.03, 0.02, 0.08) + vec3f(0.35, 0.25, 0.6) * pow(sat(1.0 - abs(rd.y)), 4.0) * 0.4;
  if (hit) {
    let p = o + rd * t;
    let e = vec2f(0.001, 0.0);
    let N = normalize(vec3f(latticeD(p + e.xyy).x - latticeD(p - e.xyy).x, latticeD(p + e.yxy).x - latticeD(p - e.yxy).x, latticeD(p + e.yyx).x - latticeD(p - e.yyx).x));
    let c = abs(dot(N, rd));
    // (a crystal: the light through it split to colours as it turns, its edges burning white)
    let disp = thinFilm(c, 520.0 + 300.0 * hash13(round(p / 2.0)));
    let edge = pow(1.0 - c, 4.0);
    let crystal = disp * (0.35 + 0.9 * edge) + vec3f(0.9, 0.95, 1.0) * pow(sat(dot(reflect(rd, N), normalize(vec3f(0.3, 0.9, 0.2)))), 30.0) * 2.0;
    col = mix(col, select(crystal, vec3f(0.7, 0.85, 1.0) * 1.2, kind > 0.5), exp(-t * 0.1));
  }
  return col + glow;
}

// 3: islands floating in a gold dusk, falls of light pouring from them into the haze below — six layers, near to far
fn worldIslands(ro: vec3f, rd: vec3f, tm: f32) -> vec3f {
  let sun = normalize(vec3f(0.25, 0.12, 1.0));
  let sd = max(dot(rd, sun), 0.0);
  let y = rd.y;
  var col = mix(vec3f(0.85, 0.4, 0.14), vec3f(0.12, 0.04, 0.2), pow(sat(y * 1.4 + 0.15), 0.7));
  col = mix(col, vec3f(0.6, 0.22, 0.2), sat(-y * 2.0));
  col += vec3f(1.0, 0.75, 0.4) * (pow(sd, 300.0) * 4.0 + pow(sd, 10.0) * 0.45);
  for (var l = 5; l >= 0; l--) {
    let z = 2.5 * pow(1.6, f32(l));
    let t = (z - ro.z) / max(rd.z, 1e-3);
    if (rd.z <= 0.05) { continue; }
    let p = (ro + rd * t).xy / z * 3.0 + vec2f(f32(l) * 3.7 + tm * 0.01 * (6.0 - f32(l)), 0.0);
    let cell = floor(p.x / 1.4);
    var shade = 0.0; var fall = 0.0; var top = 0.0;
    for (var c = -1; c <= 1; c++) {
      let id = cell + f32(c);
      let h = hash12(vec2f(id, f32(l) * 7.1));
      if (h < 0.25) { continue; }
      let cx = (id + 0.5 + (hash12(vec2f(id, 3.3 + f32(l))) - 0.5) * 0.6) * 1.4;
      let cy = (hash12(vec2f(id, 9.1 + f32(l))) - 0.45) * 1.1;
      let w = 0.28 + 0.3 * hash12(vec2f(id, 5.5));
      let dx = (p.x - cx) / w;
      let dy = p.y - cy;
      // an island: a grassy mound over a rounded keel of rock, tapering below
      let topY = 0.07 * w * sqrt(max(0.0, 1.0 - dx * dx)) + 0.01 * sin(dx * 13.0 + id);
      let keel = pow(max(0.0, 1.0 - dx * dx), 0.55) * w * (0.95 + 0.25 * sin(dx * 3.0 + id * 2.0)) * (1.0 - 0.35 * abs(dx)) + 0.02 * sin(dx * 21.0 + id);
      let inside = step(abs(dx), 1.0) * step(-keel, dy) * step(dy, topY);
      shade = max(shade, inside);
      top = max(top, inside * smoothstep(topY - 0.05 * w, topY, dy));
      // its falls: threads of light from its rim, down into the haze, streaming
      let fx = cx + w * (0.7 * (hash12(vec2f(id, 1.9)) - 0.5));
      let fw = 0.01 + 0.012 * hash12(vec2f(id, 2.7));
      let dxf = (fx - cx) / w;
      let below = cy - pow(max(0.0, 1.0 - dxf * dxf), 0.7) * w * 0.7 - p.y;
      let stream = 0.65 + 0.35 * sin(below * 26.0 - tm * 3.0 + id * 5.0);
      let xf = (p.x - fx) / (fw * (1.0 + below * 0.6));
      let thread = exp(-xf * xf) + 0.25 * exp(-xf * xf * 0.06);
      fall = max(fall, thread * step(0.0, below) * exp(-below * 0.45) * stream * step(0.4, h) * (1.0 - inside));
    }
    let haze = 1.0 - exp(-f32(l) * 0.45);
    let rock = mix(vec3f(0.035, 0.02, 0.04), vec3f(0.55, 0.25, 0.22), haze * 0.85) + vec3f(0.35, 0.6, 0.12) * top * (1.0 - haze);
    col = mix(col, rock, shade);
    col += vec3f(1.0, 0.9, 0.6) * fall * (2.2 - haze * 1.4);
  }
  return col;
}

// 4: a spiral galaxy, wheeling, seen across its disc
fn worldGalaxy(ro: vec3f, rd: vec3f, tm: f32) -> vec3f {
  var col = vec3f(0.004, 0.003, 0.01) + stars(rd) * 0.7;
  // far galaxies, small and tilted, deep behind
  let gq = rd * 26.0;
  let gid = floor(gq);
  let gh = hash33(gid + 3.0);
  if (gh.x > 0.86) {
    let gp = gq - (gid + 0.25 + gh * 0.5);
    let ga = gh.y * 6.28;
    let ge = vec2f(cos(ga) * gp.x + sin(ga) * gp.y, -sin(ga) * gp.x + cos(ga) * gp.y) * vec2f(1.0, 2.5 + 2.0 * gh.z);
    col += mix(vec3f(0.6, 0.7, 1.0), vec3f(1.0, 0.8, 0.6), gh.z) * exp(-dot(ge, ge) * 180.0) * 0.5;
  }
  let C = vec3f(0.3, 0.5, 4.2) + ro * 0.2;
  let N = normalize(vec3f(0.15, 0.8, -0.58));
  let U = normalize(cross(N, vec3f(1.0, 0.0, 0.0)));
  let V = cross(N, U);
  for (var k = 0; k < 6; k++) {
    let off = (f32(k) - 2.5) * 0.05;
    let t = dot(C + N * off - ro, N) / dot(rd, N);
    if (t <= 0.0) { continue; }
    let p = ro + rd * t - C;
    let x = dot(p, U); let y = dot(p, V);
    let r = length(vec2f(x, y)) + 1e-3;
    let th = atan2(y, x);
    let arm = pow(0.5 + 0.5 * cos(2.0 * (th - 2.3 * log(r) + tm * 0.03)), 3.0);
    let thick = exp(-pow(off / (0.06 + 0.05 * exp(-r * 1.5)), 2.0));
    let n = 0.6 + 0.8 * fbm(vec3f(x, y, 0.0) * 3.0);
    let dust = 1.0 - 0.6 * pow(0.5 + 0.5 * cos(2.0 * (th - 2.3 * log(r) + tm * 0.03) - 0.5), 12.0);
    let knots = pow(hash12(floor(vec2f(x, y) * 90.0 + f32(k) * 17.0)), 80.0) * arm * 6.0;
    let disc = exp(-r * 0.75) * (0.12 + arm * n) * dust;
    let bulge = exp(-r * r * 12.0) * 1.3;
    col += (vec3f(0.45, 0.6, 1.0) * disc * 2.2 + vec3f(1.0, 0.45, 0.6) * knots + vec3f(1.0, 0.8, 0.5) * bulge) * thick * 0.3;
  }
  // a veil of dust between us and it, near: darkening, edged with its light (the nearest layer: it moves the most)
  let tv = (1.6 - ro.z) / max(rd.z, 0.05);
  if (rd.z > 0.05) {
    let v = (ro + rd * tv).xy;
    let dn = fbm(vec3f(v * 1.3, 0.3 + tm * 0.004));
    let veil = smoothstep(0.42, 0.7, dn) * smoothstep(1.6, 0.3, abs(v.y + 0.35 - 0.4 * sin(v.x * 0.8)));
    col = col * (1.0 - 0.75 * veil) + vec3f(0.35, 0.22, 0.5) * veil * smoothstep(0.65, 0.5, dn) * 0.12;
  }
  return col;
}

// 5: an aurora over dark peaks and a still lake that holds it
fn auroraSky(rd: vec3f, tm: f32) -> vec3f {
  var col = mix(vec3f(0.01, 0.02, 0.04), vec3f(0.0, 0.004, 0.015), sat(rd.y * 2.0)) + stars(rd) * 0.8;
  if (rd.y <= 0.0) { return col; }
  // curtains: sheets hanging at heights, folding as they drift (each layer a ribbon on a plane above)
  var acc = vec3f(0.0);
  for (var k = 0; k < 10; k++) {
    let hgt = 1.0 + f32(k) * 0.12;
    let t = hgt / rd.y;
    if (t > 60.0) { continue; }
    let p = rd.xz * t;
    let fold = sin(p.x * 0.35 + tm * 0.15 + sin(p.x * 0.11 - tm * 0.07) * 3.0) * 2.2 + sin(p.x * 0.9 + tm * 0.3) * 0.5;
    let band = exp(-pow((p.y - 9.0 - fold) / (0.5 + 0.25 * f32(k)), 2.0));
    let rays = 0.55 + 0.45 * sin(p.x * 6.0 + fold * 3.0 + f32(k));
    let c = mix(vec3f(0.15, 1.0, 0.45), vec3f(0.85, 0.25, 0.9), f32(k) / 9.0);
    acc += c * band * rays * (1.0 - f32(k) / 11.0) * exp(-t * 0.02);
  }
  return col + acc * 0.22;
}
fn worldAurora(ro: vec3f, rd: vec3f, tm: f32) -> vec3f {
  // the peaks along the horizon
  let az = atan2(rd.x, rd.z);
  let ridge = 0.06 + 0.07 * fbm(vec3f(az * 3.0, 1.3, 0.0)) + 0.05 * pow(abs(sin(az * 2.3 + 0.5)), 3.0);
  if (rd.y > ridge) { return auroraSky(rd, tm); }
  if (rd.y > 0.0) {
    // (the mountains, black, a rim of the aurora's light on their snow)
    let rim = smoothstep(ridge - 0.012, ridge, rd.y);
    return vec3f(0.006, 0.01, 0.014) + vec3f(0.1, 0.5, 0.3) * rim * 0.15;
  }
  // the lake: the sky in it, rippled a little
  let t = -0.5 / rd.y;
  let p = rd.xz * t;
  let r = vec3f(rd.x + 0.01 * sin(p.x * 3.0 + tm), -rd.y, rd.z + 0.01 * sin(p.y * 4.0 - tm * 0.7));
  let refl = select(auroraSky(r, tm), vec3f(0.006, 0.01, 0.014), r.y < ridge);
  return refl * 0.6 * (0.6 + 0.4 * fresnel(0.02, -rd.y));
}

// 6: a nebula: pillars of gas lit from within by young stars, deep and slow
fn worldNebula(ro: vec3f, rd: vec3f, tm: f32) -> vec3f {
  var col = vec3f(0.006, 0.004, 0.012) + stars(rd) * 0.5;
  var trans = 1.0;
  var t = 0.5;
  for (var i = 0; i < 28; i++) {
    let p = ro * 0.5 + rd * t + vec3f(0.0, 0.0, tm * 0.01);
    var q = p * 0.55;
    q += sin(q.zxy * 1.7) * 0.25;
    let n = dotNoise(q * 1.3) * 0.5 + dotNoise(q * 3.1 + 2.0) * 0.25;
    // (pillars: denser below, rising)
    let dens = smoothstep(0.05, 0.5, n + 0.1 - 0.08 * p.y);
    let glow = mix(vec3f(0.95, 0.28, 0.12), vec3f(0.12, 0.6, 0.7), sat(p.y * 0.3 + 0.45 + n * 0.6));
    let lit = 0.25 + 0.75 * sat(1.0 - length(p.xy - vec2f(1.5, 2.0)) * 0.15);
    // (its edges lit, its cores dark: pillars with rims, not a fog)
    let rim = dens * (1.0 - dens) * 4.0;
    col += glow * (rim * 0.8 + dens * 0.2) * lit * trans * 0.11;
    trans *= 1.0 - dens * 0.12;
    t += 0.35 + t * 0.06;
    if (trans < 0.05) { break; }
  }
  // a cluster of young stars at its heart
  let sd = max(dot(rd, normalize(vec3f(0.18, 0.3, 1.0))), 0.0);
  col += vec3f(0.9, 0.95, 1.0) * (pow(sd, 600.0) * 1.5 + pow(sd, 60.0) * 0.04) * trans;
  return col;
}

fn world(kind: i32, ro: vec3f, rd: vec3f, tm: f32) -> vec3f {
  if (kind == 0) { return worldGiant(ro, rd, tm); }
  if (kind == 1) { return worldCoral(ro, rd, tm); }
  if (kind == 2) { return worldLattice(ro, rd, tm); }
  if (kind == 3) { return worldIslands(ro, rd, tm); }
  if (kind == 4) { return worldGalaxy(ro, rd, tm); }
  if (kind == 5) { return worldAurora(ro, rd, tm); }
  return worldNebula(ro, rd, tm);
}

/** the front at a point of the wall (q, unit n): x its height there, y its slope (per m, along its way), z how far
 *  behind it the point is (m: < 0 not reached yet) — a single bright crest sweeping out from behind the drum across the
 *  whole dome (where the shock's sphere meets the wall), the membrane ringing behind it */
fn frontAt(q: vec3f) -> vec3f {
  if (K.front.x < 0.0 || G.clock.x < K.front.x) { return vec3f(0.0, 0.0, -1e4); }
  let age = G.clock.x - K.front.x;
  let d = length(q - G.drum.xyz) - K.front.y;
  let x = age * K.front.z - d;
  let fade = exp(-age * 0.45) * K.front.w;
  let w = 5.0;
  let crest = exp(-(x / w) * (x / w));
  let rings = select(0.0, sin(TAU * x / 22.0) * exp(-x / 55.0) * smoothstep(4.0, 18.0, x) * 0.55, x > 0.0);
  let hgt = (crest + rings) * fade;
  // (its slope: the crest's, and the rings')
  let dcrest = -2.0 * x / (w * w) * crest;
  let drings = select(0.0, (TAU / 22.0) * cos(TAU * x / 22.0) * exp(-x / 55.0) * smoothstep(4.0, 18.0, x) * 0.55, x > 0.0);
  return vec3f(hgt, (dcrest + drings) * fade, x);
}

@fragment fn fsSky(i: FullscreenOut) -> @location(0) vec4f {
  let rd = viewRay(i.uv);
  let ro = frame.camPos;
  let W = G.wall.xyz; let R = G.wall.w;
  // our wall: where the ray meets it, its ripples there and their slope
  let hit = sphereHit(ro, rd, W, R);
  let q = ro + rd * max(hit.y, 0.0);
  let n = normalize(q - W);
  let amp = G.cosmos.x;
  // (still, away from the great stroke: no ripples to sum)
  var h = 0.0; var dh = vec3f(0.0);
  if (amp > 0.001) {
    h = wallRipple(n);
    let e = 0.003;
    let t1 = normalize(cross(n, vec3f(0.0, 1.0, 0.0001)));
    let t2 = cross(n, t1);
    dh = (t1 * (wallRipple(normalize(n + t1 * e)) - h) + t2 * (wallRipple(normalize(n + t2 * e)) - h)) / e;
  }
  let hr = h * amp;
  // the front: where it is, its slope's way (out across the wall, away from the drum)
  let fr = frontAt(q);
  let away = normalize(normalize(q - G.drum.xyz) - n * dot(normalize(q - G.drum.xyz), n) + vec3f(1e-5));
  // (the light through it bent as through water: our own sky by the ripples and the front, the worlds beyond by the
  // front and only a little by the ripples — their shapes stay their own, only the view of them wavers)
  let bendF = away * fr.y * 0.9;
  let bent = normalize(rd + dh * amp * K.aux.x + bendF);
  let bentW = normalize(rd + dh * amp * K.aux.x * 0.12 + bendF * 0.7);
  var col = nebula(bent) + stars(bent) * 0.8;
  // the face it's on (its borders flexing with the ripples, a little wandering)
  let nw = normalize(n + dh * amp * 0.0003 + 0.006 * vec3f(dotNoise(n * 4.0), dotNoise(n * 4.0 + 4.1), dotNoise(n * 4.0 + 8.3)));
  let fc = facetOf(nw);
  let seamW = 0.0021;
  let inner = smoothstep(seamW * 1.2, seamW * 4.0, fc.seam);
  // how far it's open on the world beyond: the troughs first, as the ripples come; then the whole face
  // (only behind the front: the faces open as it passes them)
  let behind = select(smoothstep(0.0, 70.0, fr.z), 1.0, K.front.x < 0.0 && K.aux.y >= 0.0);
  let reveal = K.worlds.x * behind;
  let open = sat(smoothstep(0.15, 0.85, -hr) * 0.75 * G.cosmos.y * behind + reveal * (0.8 + 0.3 * clamp(-hr, -1.0, 1.0))) * inner;
  if (open > 0.002) {
    let M = facetFrame(fc.i);
    let ld = vec3f(dot(bentW, M[0]), dot(bentW, M[1]), dot(bentW, M[2]));
    let lw = (ro - W) / R * 3.0;
    let lo = vec3f(dot(lw, M[0]), dot(lw, M[1]), dot(lw, M[2]));
    let kind = select(facetKind(fc.i), i32(K.aux.y), K.aux.y >= 0.0);
    let w = world(kind, lo, ld, K.worlds.z) * K.worlds.w;
    col = col * (1.0 - open) + w * open;
  }
  // the film over it all: its colours, strongest where it's rippled and edge-on
  let c = abs(dot(n, rd));
  let lp = TAU * G.clock.w;
  let nm = 380.0 + 260.0 * hr + 60.0 * fbm(n * 6.0 + vec3f(sin(lp), cos(lp), 0.0) * 0.4);
  let filmCol = thinFilm(c, nm) * (0.03 + 0.5 * fresnel(0.04, c)) * (1.0 + 2.5 * abs(hr));
  col += filmCol * (0.06 + 0.22 * abs(hr)) * (1.0 - 0.6 * open);
  // the crests burn with the film's colours; a thin bright line where it turns over
  let crest = max(hr, 0.0) * max(hr, 0.0) * (1.0 - 0.6 * open);
  let edge = exp(-pow(hr / 0.08, 2.0)) * smoothstep(0.05, 0.3, length(dh) * 0.004) * amp;
  col += pow(thinFilm(c, 280.0 + 240.0 * hr + 160.0 * fbm(n * 9.0)), vec3f(2.0)) * crest * 0.18 + vec3f(0.8, 0.9, 1.0) * edge * 0.08;
  // the front's crest: a band of the film bulged and burning with its colours as it sweeps the dome
  let fcrest = max(fr.x, 0.0);
  col += (thinFilm(c, 320.0 + 300.0 * fcrest) * 0.3 + vec3f(0.62, 0.72, 0.85) * (0.25 + 0.6 * fcrest * fcrest)) * fcrest * 0.42;
  // the faces' borders: where three films meet, a bright tube of film, brightest at the corners
  let seam = exp(-pow(fc.seam / seamW, 2.0));
  let node = exp(-pow(fc.node / (seamW * 2.2), 2.0));
  let bl = K.worlds.y * (0.6 + 0.6 * abs(hr)) * (0.25 + 0.75 * behind) + fcrest * 0.6;
  col += (thinFilm(c, 300.0 + 500.0 * fc.seam / seamW + 200.0 * hr) * 0.25 + vec3f(0.5, 0.55, 0.62)) * (seam * 0.32 + node * 0.6) * bl;
  col = hueShift(col, G.cosmos.w);
  return vec4f(col, 1.0);
}
