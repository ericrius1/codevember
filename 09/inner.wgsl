// The other realm, inside the drum: what the hide shows where it turns to glass — a deep ocean without end (its three
// painted layers: design/realms/ocean, painted by Codex's image generation, 09/design/refs.mjs ocean_ring, ocean_wall,
// ocean_core). (Included by drum.wgsl, after common.)

@group(2) @binding(9) var realmFar: texture_2d<f32>;
@group(2) @binding(10) var realmMid: texture_2d<f32>;
@group(2) @binding(11) var realmNear: texture_2d<f32>;

fn realmRot(a: f32) -> mat2x2f { let c = cos(a); let s = sin(a); return mat2x2f(c, s, -s, c); }

/** a layer's colour at q (its own units: ±1 its picture's extent), mirrored past its edges so they never show; lod from
 *  how many of its texels a pixel covers */
fn realmTap(tex: texture_2d<f32>, q: vec2f, lod: f32) -> vec3f {
  var uv = q * 0.5 + 0.5;
  uv = 1.0 - abs(1.0 - (uv - 2.0 * floor(uv * 0.5)));
  let c = textureSampleLevel(tex, samp_linear, vec2f(uv.x, 1.0 - uv.y), lod).rgb;
  return c * c;
}

/** the realm seen along a ray from the hide: ro, rd in the world, T its clock (s), trip 0..1, px the pixel's angle */
fn innerWorld(ro: vec3f, rd: vec3f, T: f32, trip: f32, px: f32) -> vec3f { return innerInfinite(ro, rd, T, trip, px); }

// ---------------------------------------------------------------- the endless deep
// Where the glass opens: a deep ocean without end (design/realms/ocean, painted by Codex: refs.mjs ocean_ring,
// ocean_wall, ocean_core;). A way
// down whose wall starts just inside the rim, narrows over its first metres and then runs on for ever — so its far
// reaches close only in perspective, to a point of cold light — ribbed with rings of bioluminescent veils and coral,
// flown down for ever. The blue thickens with depth: the near wall dark, everything further down paler and brighter,
// till far down it's all one glow (the eye falls toward it), and a mist of folded light is marched through it. The glass
// bends the view in toward the way's axis, as water bends a diver's, and the way leans to meet whoever looks in — so
// from any side you look down it, its end in sight, its rings sliding against each other and the rim as you move. A
// second way opens first at the struck point, as wide as the glass has spread.
var<private> INNER_JIT: f32;
// (the glass's index: how hard it bends the view toward the way's axis; how far the way's axis leans toward the eye)
const WAY_N = 2.2;
const WAY_AIM = 0.85;
// (m: past this the ray's in the light at the end; the blue's depth — e⁻¹ of what's there shows through each this much)
const WAY_FAR = 90.0;
const WAY_FOG = 6.5;
/** the way's radius at depth z (m): R0 at its mouth, narrowing over the first few L to a third of that, then for ever */
fn wayR(R0: f32, L: f32, z: f32) -> f32 { return R0 * (0.34 + 0.66 * exp(-z / L)); }
/** the blue at depth z (m): near, the dark of the deep; far down, the glow of the light at the end */
fn wayHaze(z: f32) -> vec3f { return mix(vec3f(0.004, 0.016, 0.045), vec3f(0.11, 0.34, 0.6), smoothstep(1.5, 28.0, z)); }
/** how much of what's at depth z shows through the blue in front of it */
fn wayClear(z: f32) -> f32 { return exp(-z / WAY_FOG); }
/** how dark the dust has got along the ray, at its accumulated density (0..1): it hides what's behind it */
fn wayDust(dens: f32) -> f32 { return 0.7 * dens * dens; }
/** a stretch of the way's water, dz long about depth z (m): the light it gives (rgb), and the dust's density gathered
 *  along the ray so far (w) — after the volumetric nebulae of fragcoord.xyz / shadertoy (Duke's "Dusty nebula 4",
 *  otaviogood's spiral noise): ridged spiral noise for the veils, density accumulated front to back and coloured by it
 *  (pale where it's thin and near the light, deep where it's thick), a light far down the axis glowing through it */
fn wayMedium(o: vec2f, slope: vec2f, R0: f32, L: f32, z: f32, dz: f32, flow: f32, S: f32, T: f32, densIn: f32) -> vec4f {
  let R = wayR(R0, L, z);
  let u = (o + slope * z) / R;
  // (its own frame flies with the ribs: a fixed veil keeps its place among them as they come up the way)
  let along = z / S + flow;
  var q = vec3f(u * 1.7, along * 0.55);
  q = nebWiggle(q, T * 0.35);
  // (clear down the middle so the eye goes on; the veils thicken toward the wall)
  let field = 4.5 + 1.8 * (1.0 - length(u)) - nebSpiralC(q * 2.0) + nebSpiralC(q.zxy * 1.02 + 100.0) * 4.0 - nebSpiral3(q * 2.0);
  let d = abs(field * 0.5) + 0.03;
  var dens = densIn;
  var c = vec3f(0.0);
  // the light deep inside: on the axis, two widths of the mouth down, its glow on everything near it
  let zL = 2.2 * L;
  let lv = vec3f(u * 0.9, (z - zL) / L);
  let ld2 = max(dot(lv, lv), 0.02);
  let stepK = dz / (0.25 * L);
  c += vec3f(0.35, 0.62, 1.0) * (0.022 / ld2) * stepK;
  if (d < 0.1) {
    let local = 0.1 - d;
    dens += (1.0 - dens) * local * stepK * 1.6;
    let thin = mix(vec3f(0.78, 0.95, 1.0), vec3f(0.06, 0.12, 0.32), dens);
    let lit = mix(5.0 * vec3f(0.6, 0.85, 1.0), 1.3 * vec3f(0.32, 0.26, 0.75), min(sqrt(ld2) / 1.6, 1.0));
    c += thin * lit * local * 1.1 * stepK * (1.0 - dens * 0.6);
  }
  // (swallowed by the blue with depth, like everything in it)
  return vec4f(c * wayClear(z) + wayHaze(z) * 0.02 * stepK, dens);
}
/** one way down (rgb): o the ray's start in the hide's plane, slope its slant per metre of depth (both m, about the
 *  way's axis); R0 its mouth's radius and L how fast it narrows (m) */
fn deepWay(o: vec2f, slope: vec2f, R0: f32, L: f32, T: f32, trip: f32, px: f32, camD: f32) -> vec3f {
  let texN = f32(textureDimensions(realmMid).x);
  // (flown down at a steady pace, and the camera's own flight down it as it comes in through the glass: D.breath.y)
  let flow = T * 0.2 + D.breath.y;
  // where the ray meets the wall: steps growing with depth, then halved down onto it
  var zh = WAY_FAR;
  var zp = 0.0;
  for (var i = 1; i <= 52; i++) {
    let z = 0.03 * L * f32(i * i);
    if (z >= WAY_FAR) { break; }
    if (length(o + slope * z) > wayR(R0, L, z)) { zh = z; break; }
    zp = z;
  }
  if (zh < WAY_FAR) {
    var a = zp; var b = zh;
    for (var j = 0; j < 7; j++) { let m = 0.5 * (a + b); if (length(o + slope * m) > wayR(R0, L, m)) { b = m; } else { a = m; } }
    zh = b;
  }
  var col = vec3f(0.0);
  var trans = 1.0;
  // the ribs: rings hugging the wall at an even step, flown down for ever (each coming up out of the blue, passing out
  // through the mouth), each further one paler and dimmer in the blue, till far down they're only its glow. Between
  // them the water is a medium marched through and gathered front to back (wayMedium): veils of glowing dust, darker
  // where they thicken, lit by a light deep inside — so the way is a volume the eye falls through, not a picture
  let S = 0.5 * L;
  let ph = fract(flow);
  let base = floor(flow);
  var mz = 0.03 * L * (0.3 + 0.7 * INNER_JIT);
  var md = 0.0;
  for (var k = 0; k < 34; k++) {
    let kk = f32(k) + 1.0 - ph;
    let dk = S * kk;
    // (the water up to this rib)
    let to = min(dk, zh);
    for (var st = 0; st < 3; st++) {
      if (mz >= to || trans < 0.02) { break; }
      let dz = min((to - mz) / f32(3 - st), 0.35 * L + mz * 0.15);
      let mm = wayMedium(o, slope, R0, L, mz + dz * 0.5, dz, flow, S, T, md);
      md = mm.w;
      col += trans * mm.rgb;
      trans *= exp(-wayDust(md) * dz / L);
      mz += dz;
    }
    if (dk > zh) { break; }
    let Rk = wayR(R0, L, dk) * 1.04;
    let id = f32(k) + base;
    let spin = id * 2.39996 + T * 0.03 * select(-1.0, 1.0, (i32(id) & 1) == 0) * (1.0 + trip);
    let uvr = realmRot(spin) * (o + slope * dk) / Rk;
    let lod = log2(max(1.0, (camD + dk) * px * texN / (2.0 * Rk)));
    let inside = 1.0 - smoothstep(0.96, 1.0, max(abs(uvr.x), abs(uvr.y)));
    var c = realmTap(realmMid, uvr, lod) * inside;
    let clear = wayClear(dk);
    let a = smoothstep(0.06, 0.3, luma(sqrt(c))) * smoothstep(0.0, 0.8, kk) * 0.92 * (0.15 + 0.85 * clear);
    c = mix(wayHaze(dk) * 1.5, c * 2.2, clear);
    col += trans * a * c;
    trans *= 1.0 - a * 0.85;
  }
  // past the ribs: the wall where the ray meets it (dim, glowing from within, swallowed by the blue the further down it
  // is) — or, where the ray runs on past every wall, the light at the end
  var back: vec3f;
  if (zh < WAY_FAR) {
    let p = o + slope * zh;
    let th = atan2(p.y, p.x);
    var wu = vec2f(th / PI * 1.5, (zh - flow * S) / L * 0.9);
    wu = 1.0 - abs(1.0 - (wu - 2.0 * floor(wu * 0.5)));
    let w = realmTap(realmNear, wu * 2.0 - 1.0, 1.5 + log2(1.0 + zh / L)) * 0.9;
    back = mix(wayHaze(zh), w, wayClear(zh));
  } else {
    back = wayHaze(WAY_FAR);
  }
  // (and the source itself, far down where the slant runs out: by direction alone, so it can't be reached)
  let so = realmRot(-T * 0.04) * slope * 4.5;
  let src = realmTap(realmFar, so, 0.5) * (1.0 - smoothstep(0.9, 1.0, max(abs(so.x), abs(so.y)))) * 1.6
    + vec3f(0.55, 0.85, 1.0) * exp(-dot(so, so) * 14.0) * 0.7;
  back += src * (1.0 - wayClear(zh * 0.5));
  return col + trans * back;
}
fn innerInfinite(roW: vec3f, rdW: vec3f, T: f32, trip: f32, px: f32) -> vec3f {
  let C = D.center.xyz;
  // (in the way's own frame: x across the hide, y up, z down the drum's axis, in)
  let rd = normalize(vec3f(rdW.z, rdW.y, rdW.x));
  let ro = vec2f(roW.z - C.z, roW.y - C.y);
  let camD = length(frame.camPos - roW);
  // the view bent in toward the axis as it enters the glass, and the way leaning toward the eye (the slant of the line
  // from the eye to the hide's middle, bent the same way, taken off)
  let tIn = rd.xy / WAY_N;
  var slope = tIn / sqrt(max(1.0 - dot(tIn, tIn), 0.1));
  let cv = C - frame.camPos;
  let dC = normalize(vec3f(cv.z, cv.y, max(cv.x, 0.05)));
  let tC = dC.xy / WAY_N;
  slope -= WAY_AIM * tC / sqrt(max(1.0 - dot(tC, tC), 0.1));
  // the way down from the rim
  var way = deepWay(ro, slope, 0.84, 1.8, T, trip, px, camD);
  // and from where she struck: a well opening there first, as wide as the glass has spread, giving way to the rim's as
  // the glass reaches it
  let hit = D.front.xy;
  let mouth = clamp(D.front.z * 0.85, 0.05, 0.6);
  let wellK = (1.0 - smoothstep(0.55, 1.5, D.front.z)) * (1.0 - smoothstep(mouth * 0.7, mouth, length(ro - hit)));
  if (wellK > 0.001) {
    let well = deepWay(ro - hit, slope, mouth, 1.0, T + 7.0, trip, px, camD);
    way = mix(way, well, wellK);
  }
  return way;
}

// ---------------------------------------------------------------- the dust's noise (wayMedium's)
// After "Dusty nebula 4" by Duke (shadertoy.com/view/MsVXWW, CC BY-NC-SA 3.0), itself after otaviogood's spiral noise
// ("Alien Beacon"); its wiggling warp as Eric's fragcoord.xyz variant ("Nebula Fun") has it.
const NEB_NUDGE = 0.739513;
const NEB_NORM = 0.80392; // 1/√(1 + NUDGE²)
/** otaviogood's spiral noise: sines added while rotating and raising the frequency — ridged (abs) */
fn nebSpiralC(pIn: vec3f) -> f32 {
  var p = pIn; var n = 0.0; var it = 1.0;
  for (var i = 0; i < 8; i++) {
    n += -abs(sin(p.y * it) + cos(p.x * it)) / it;
    p = vec3f((p.xy + vec2f(p.y, -p.x) * NEB_NUDGE) * NEB_NORM, p.z);
    let xz = (p.xz + vec2f(p.z, -p.x) * NEB_NUDGE) * NEB_NORM;
    p = vec3f(xz.x, p.y, xz.y);
    it *= 1.733733;
  }
  return n;
}
fn nebSpiral3(pIn: vec3f) -> f32 {
  var p = pIn; var n = 0.0; var it = 1.0;
  for (var i = 0; i < 5; i++) {
    n += (sin(p.y * it) + cos(p.x * it)) / it;
    let xz = (p.xz + vec2f(p.z, -p.x) * NEB_NUDGE) * NEB_NORM;
    p = vec3f(xz.x, p.y, xz.y);
    it *= 1.33733;
  }
  return n;
}
/** the slow wiggle through its strands */
fn nebWiggle(pIn: vec3f, t: f32) -> vec3f {
  var p = pIn;
  let s = 0.5 + 0.5 * sin(2.0 * nebSpiral3(p * 1.6) + t * 0.7);
  let w = vec3f(sin(p.y * 2.2 + t * 0.55) + 0.6 * sin(p.z * 3.1 - t * 1.1),
                sin(p.z * 2.6 + t * 0.66) + 0.6 * sin(p.x * 3.7 + t * 0.99),
                sin(p.x * 2.0 - t * 0.44) + 0.6 * sin(p.y * 3.4 + t * 1.21));
  p += 0.08 * s * w;
  p += 0.04 * vec3f(sin(p.y * 6.0 + t * 1.7), sin(p.z * 6.5 - t * 1.9), sin(p.x * 5.5 + t * 1.8));
  return p;
}
