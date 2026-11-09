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
