// The other realm, inside the drum: what the hide shows where it turns to glass — a world of its own, nothing like the
// cosmos outside (design/realm-*.jpg, painted by Codex's image generation: 09/design/refs.mjs realm,realm_mid,
// realm_near). Not modelled: a window into it, the way a building's rooms are shown through its windows — three
// painted layers standing at their depths inside the drum, each met by the view's ray (bent by the hide's ripples) where
// it crosses its plane, so they slide against each other as the eye moves: the deep scene far back, a layer of serpents
// and unfolding flowers in front of it, a drift of threads and sparks nearest the hide (those two glowing things on
// black, laid on by their light). The deep one flies on toward its source for ever (two zooms of it cross-faded, an
// octave apart), turning slowly, its middle twisting; the others turn against it and breathe. (Included by drum.wgsl,
// after common.)

@group(2) @binding(9) var realmFar: texture_2d<f32>;
@group(2) @binding(10) var realmMid: texture_2d<f32>;
@group(2) @binding(11) var realmNear: texture_2d<f32>;

fn realmRot(a: f32) -> mat2x2f { let c = cos(a); let s = sin(a); return mat2x2f(c, s, -s, c); }

/** a plane inside the drum at `depth` (m behind the hide), met by the ray: where on it (its frame: across, up; m from
 *  the drum's axis), and how far along the ray */
fn realmHit(ro: vec3f, rd: vec3f, depth: f32) -> vec3f {
  let C = D.center.xyz;
  let t = (C.x + depth - ro.x) / max(rd.x, 0.02);
  let p = ro + rd * t;
  return vec3f(p.z - C.z, p.y - C.y, t);
}
/** a layer's colour at q (its own units: ±1 its picture's extent), mirrored past its edges so they never show; lod from
 *  how many of its texels a pixel covers */
fn realmTap(tex: texture_2d<f32>, q: vec2f, lod: f32) -> vec3f {
  var uv = q * 0.5 + 0.5;
  uv = 1.0 - abs(1.0 - (uv - 2.0 * floor(uv * 0.5)));
  let c = textureSampleLevel(tex, samp_linear, vec2f(uv.x, 1.0 - uv.y), lod).rgb;
  return c * c;
}

/** the realm seen along a ray from the hide: ro, rd in the world, T its clock (s), trip 0..1, px the pixel's angle */
fn innerWorld(ro: vec3f, rd: vec3f, T: f32, trip: f32, px: f32) -> vec3f {
  if (D.realm2.y > 0.5) { return innerInfinite(ro, rd, T, trip, px); }
  let texN = f32(textureDimensions(realmFar).x);
  // the deep scene, 2.6 m back, its picture 2.2 m across: flying on toward its source, turning, its middle twisting
  let hf = realmHit(ro, rd, 2.6);
  var qf = hf.xy / 1.1;
  qf = realmRot(T * 0.025 + 0.3 * trip * sin(T * 0.13)) * qf;
  let tw = (0.12 + 0.2 * trip) * D.realm2.x * sin(T * 0.21) * exp(-dot(qf, qf) * 1.5);
  qf = realmRot(tw) * qf;
  let lodF = log2(max(1.0, hf.z * px * texN / 2.2));
  // (two copies an octave apart: the nearer swelling and fading as the farther swells into its place — at the end of
  // each octave the farther is where the nearer began, so the flight never jumps)
  // (and the hand-over only in the last stretch of each octave, so most of the time it's one picture, flying)
  let z = fract(T * D.realm.w + 0.1);
  let s0 = exp2(-z);
  let s1 = exp2(1.0 - z);
  let far = mix(realmTap(realmFar, qf * s0, lodF + log2(s0)), realmTap(realmFar, qf * s1, lodF + log2(s1)), smoothstep(0.75, 1.0, z));
  // the serpents and flowers, 1.1 m back, turning the other way and breathing
  let hm = realmHit(ro, rd, 1.1);
  let qm = realmRot(-T * 0.04) * hm.xy / (0.95 * (1.0 + 0.04 * sin(T * 0.5)));
  let mid = realmTap(realmMid, qm, log2(max(1.0, hm.z * px * texN / 1.9)));
  // the threads and sparks, just behind the hide, drifting
  let hn = realmHit(ro, rd, 0.32);
  let qn = realmRot(T * 0.06) * (hn.xy / 0.8) + vec2f(0.03 * sin(T * 0.3), 0.02 * T);
  let near = realmTap(realmNear, qn, log2(max(1.0, hn.z * px * texN / 1.6)));
  // (the deep scene darkened away from its source — the realm deep, not a picture — and the layers laid on by their
  // light, held so they don't wash it out)
  let deep = 0.35 + 0.65 * exp(-dot(qf * s0, qf * s0) * 0.8);
  return far * deep * D.realm.x + mid * D.realm.y + near * D.realm.z;
}

// ---------------------------------------------------------------- the endless deep (style inner 'infinite')
// Where the glass opens, depth without end: the view's ray marched on through a shaft of folded light that runs away
// from the hide for ever and is flown down for ever — space folded on itself at finer and finer scales by a sum of
// turned cosines (turbulence, as fragcoord.xyz's volumetric shaders do it), the light gathered along the ray from every
// fold it passes near, so nothing is ever a surface to stop at; its walls breathe and turn, a thread of light runs down
// its middle, motes stream past toward the hide, and at its far end, at infinity, the painted realm glows. Its colours
// are the realm painting's own, flowing along the shaft; tone-mapped softly (tanh) so it never clips.
var<private> INNER_JIT: f32;
fn innerInfinite(roW: vec3f, rdW: vec3f, T: f32, trip: f32, px: f32) -> vec3f {
  let C = D.center.xyz;
  let rd = normalize(vec3f(rdW.z, rdW.y, rdW.x));
  // (from the hide's plane; the hide's radius about 2.6 units)
  let ro = vec3f(roW.z - C.z, roW.y - C.y, 0.0) * 3.0;
  let fly = T * (0.9 + 0.9 * trip);
  var z = 0.3 * INNER_JIT;
  var acc = vec3f(0.0);
  for (var i = 0; i < 72; i++) {
    var p = ro + rd * z;
    p.z += fly;
    // (the shaft turning as it goes)
    let a = p.z * 0.035 + T * 0.03;
    let cs = cos(a); let sn = sin(a);
    p = vec3f(p.x * cs - p.y * sn, p.x * sn + p.y * cs, p.z);
    // space folded on itself, finer and finer
    var q = p;
    var f = 0.35;
    for (var k = 0; k < 6; k++) {
      q += cos(q.yzx * f + vec3f(T * 0.23, T * 0.17, T * 0.13) + f) * (0.9 / f) * 0.16;
      f *= 1.6;
    }
    // its walls: a shell of folded light round the axis (breathing), and a thread of light down the middle
    let r = length(q.xy);
    let shell = abs(r - 5.0 - 1.2 * sin(q.z * 0.07 + T * 0.2));
    // (thin folded sheets, only within the shaft's wall; open dark space inside it; a thread of light down the axis)
    let lace = abs(dot(cos(q * 0.8), sin(q.yzx * 0.8)));
    let walls = max(lace * 0.7, shell * 0.9 - 0.45);
    let thread = length(p.xy) * 0.9 + 0.12;
    let d = 0.035 + 0.5 * min(walls, thread);
    // (its colours the painting's, flowing down the shaft; the thread gold-white)
    var uv = vec2f(atan2(q.y, q.x) / TAU * 2.0, q.z * 0.012 + r * 0.03);
    uv = 1.0 - abs(1.0 - (uv - 2.0 * floor(uv * 0.5)));
    let paint = realmTap(realmFar, uv * 2.0 - 1.0, 2.0);
    let c = mix(paint * 1.6 + vec3f(0.02, 0.01, 0.04), vec3f(1.0, 0.85, 0.6), exp(-thread * 1.5) * 0.7);
    acc += c / d * exp(-z * 0.01);
    // (the deep's own haze, thickening with distance: violet near, gold toward the far light — depth you can feel)
    acc += mix(vec3f(0.5, 0.2, 0.9), vec3f(1.0, 0.65, 0.3), smoothstep(10.0, 120.0, z)) * d * 0.9 * exp(-z * 0.012);
    // motes streaming past (a lattice of points, each its own; the nearer the brighter)
    let mc = floor(p / 1.6);
    let mr = hash33(mc + 3.0);
    let md = length(p - (mc + 0.2 + 0.6 * mr) * 1.6);
    acc += mix(vec3f(0.6, 1.0, 0.9), vec3f(1.0, 0.8, 0.55), mr.z) * step(0.72, mr.x) * exp(-md * md / (0.0016 + z * z * px * px * 2.0)) * 40.0;
    z += d;
    if (z > 220.0) { break; }
  }
  // at its end, at infinity: the painted realm, small, glowing
  let off = rd.xy / max(rd.z, 0.05);
  let far = realmTap(realmFar, realmRot(T * 0.02) * off * 5.0, 1.0) * exp(-dot(off, off) * 30.0) * 0.8;
  // (the deep between: indigo, darkening to the end; the light on it soft-clipped, its darks kept dark)
  let g = tanh(acc / 620.0);
  return 1.6 * g * g * (3.0 - 2.0 * g) / max(1.0, 1.0) + far + vec3f(0.01, 0.005, 0.03);
}
