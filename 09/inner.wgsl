// The other realm, inside the drum: what the hide shows where it turns to glass, and what the camera flies into — a
// garden without end, in one dimension more than ours (its two painted layers: design/realms/garden, painted by Codex's
// image generation). (Included by drum.wgsl, after common.)

@group(2) @binding(9) var realmFar: texture_2d<f32>;
@group(2) @binding(10) var realmMid: texture_2d<f32>;
@group(2) @binding(11) var realmNear: texture_2d<f32>;

/** a painting's colour at q (its own units: ±1 its picture's extent), mirrored past its edges so they never show; lod
 *  from how many of its texels a pixel covers */
fn realmTap(tex: texture_2d<f32>, q: vec2f, lod: f32) -> vec3f {
  var uv = q * 0.5 + 0.5;
  uv = 1.0 - abs(1.0 - (uv - 2.0 * floor(uv * 0.5)));
  let c = textureSampleLevel(tex, samp_linear, vec2f(uv.x, 1.0 - uv.y), lod).rgb;
  return c * c;
}

/** the realm seen along a ray from the hide: ro, rd in the world, T its clock (s), trip 0..1, px the pixel's angle */
fn innerWorld(ro: vec3f, rd: vec3f, T: f32, trip: f32, px: f32) -> vec3f { return garden(ro, rd, T, trip, px); }

// ---------------------------------------------------------------- the garden without end
// Where the glass opens: a living lattice with no end in any direction — leaf-thin skins of backlit stained glass,
// lace where their panes are dark, light along their folds, hung in a deep blue haze with a white sun far down
// the way. Its shape is a four-dimensional one: an Apollonian lattice (fold space into cells, turn each inside out
// through its sphere, again and again — iq's "Apollonian", shadertoy.com/view/4ds3zn, one dimension up) of which we see
// only the three-dimensional slice we're in, and the slice turns slowly through the fourth: so its vaults open, split,
// bud and close as nothing in three dimensions can, never the same twice across it (a slice askew through a lattice is
// a quasicrystal). Flown through: it parts round whoever flies (its skins dissolve within arm's reach), rolling slowly.
// From outside, the glass bends the view in toward the drum's axis and the realm leans to meet whoever looks in; at the
// glass both let go, and it's simply there, as wide as the eye.
var<private> INNER_JIT: f32;
/** marching: steps a ray, folds a point, skins a ray may pass through (fewer live: drum.ts) */
override REALM_STEPS: i32 = 110;
override REALM_FOLDS: i32 = 8;
override REALM_SKINS: i32 = 5;
// (the glass's index from outside: how hard it bends the view toward the axis; how far the realm leans toward the eye)
const WAY_N = 2.2;
const WAY_AIM = 0.85;
// (m to a lattice unit: its cells two of these across; how far a ray's followed; the haze's depth — e⁻¹ shows through)
const GARDEN_SC = 2.2;
const GARDEN_FAR = 70.0;
const GARDEN_FOG = 15.0;
// (m: nothing nearer the flier than this; its skins fade in over the next stretch)
const GARDEN_CLEAR = 0.95;
// (the sun: far down the way, a little up and aside)
const GARDEN_SUN = vec3f(0.1961, 0.2942, 0.9354);

// the slice's place in the fourth dimension, set once a ray: its two turns (cos, sin), its depth in w, the sphere's size
var<private> GD_T1: vec2f;
var<private> GD_T2: vec2f;
var<private> GD_W: f32;
var<private> GD_S: f32;
// what the last gardenMap left: the fold's traps (the nearest the point came to the cell's three planes, and its
// centre), the point in a coarse and a fine cell (for the paintings), and how far each had shrunk
var<private> GD_ORB: vec4f;

/** how far p (m, the realm's frame) is from the lattice's nearest skin */
fn gardenMap(p: vec3f) -> f32 {
  // (the whole lattice swaying, as if grown rather than built)
  let pw = p + vec3f(1.3 * sin(0.21 * p.z + 0.7), 1.1 * sin(0.17 * p.z) + 0.5 * sin(0.33 * p.x + 0.4), 0.0);
  var q = vec4f(pw / GARDEN_SC, GD_W);
  q = vec4f(GD_T1.x * q.x - GD_T1.y * q.w, q.y, q.z, GD_T1.y * q.x + GD_T1.x * q.w);
  q = vec4f(q.x, GD_T2.x * q.y - GD_T2.y * q.w, q.z, GD_T2.y * q.y + GD_T2.x * q.w);
  var scale = 1.0;
  var orb = vec4f(1000.0);
  for (var i = 0; i < REALM_FOLDS; i++) {
    q = -1.0 + 2.0 * fract(0.5 * q + 0.5);
    let r2 = dot(q, q);
    orb = min(orb, vec4f(abs(q.xyz), r2));
    let k = GD_S / r2;
    q *= k;
    scale *= k;
  }
  GD_ORB = orb;
  return 0.25 * abs(q.w) / scale * GARDEN_SC;
}

/** the garden's colours round its wheel: teal, emerald, lime, gold, coral, orchid, violet, and round again */
fn gardenHue(hIn: f32) -> vec3f {
  let h = fract(hIn) * 7.0;
  let i = floor(h);
  let f = smoothstep(0.0, 1.0, h - i);
  var a: vec3f; var b: vec3f;
  switch (i32(i)) {
    case 0 { a = vec3f(0.02, 0.5, 0.52); b = vec3f(0.03, 0.55, 0.2); }
    case 1 { a = vec3f(0.03, 0.55, 0.2); b = vec3f(0.42, 0.85, 0.1); }
    case 2 { a = vec3f(0.42, 0.85, 0.1); b = vec3f(1.0, 0.68, 0.14); }
    case 3 { a = vec3f(1.0, 0.68, 0.14); b = vec3f(1.0, 0.32, 0.22); }
    case 4 { a = vec3f(1.0, 0.32, 0.22); b = vec3f(0.9, 0.16, 0.6); }
    case 5 { a = vec3f(0.9, 0.16, 0.6); b = vec3f(0.36, 0.2, 0.95); }
    default { a = vec3f(0.36, 0.2, 0.95); b = vec3f(0.02, 0.5, 0.52); }
  }
  return mix(a, b, f);
}

/** c's colours turned round the wheel by a (radians, about grey) */
fn hueTurn(c: vec3f, a: f32) -> vec3f {
  let k = vec3f(0.57735);
  let ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}

/** the haze's own light along dir: the deep's blue — near black away from the sun, ultramarine round it, pale azure
 *  at it */
fn gardenHaze(dir: vec3f) -> vec3f {
  let mu = dot(dir, GARDEN_SUN);
  var c = mix(vec3f(0.004, 0.01, 0.05), vec3f(0.008, 0.04, 0.14), smoothstep(-0.7, 0.45, mu));
  c = mix(c, vec3f(0.012, 0.07, 0.3), smoothstep(0.45, 0.9, mu));
  c = mix(c, vec3f(0.08, 0.26, 0.7), smoothstep(0.9, 0.997, mu));
  return c;
}

/** what's past everything along dir: the sun, and round it a flower of light opening out of its heart for ever — the
 *  mosaic folded twelve ways about the sun's axis and drawn out along the logarithm of the angle from it, so it wells up
 *  from the middle at every size at once */
fn gardenSky(dir: vec3f, T: f32, trip: f32) -> vec3f {
  let mu = dot(dir, GARDEN_SUN);
  var c = gardenHaze(dir);
  // (about the sun's axis: how far off it, and round it)
  let side = normalize(cross(vec3f(0.0, 1.0, 0.0), GARDEN_SUN));
  let up = cross(GARDEN_SUN, side);
  let v = vec2f(dot(dir, side), dot(dir, up));
  let r = max(length(v) / max(mu + 1.0, 0.05), 1e-4);
  let N = 6.0;
  var th = atan2(v.y, v.x) / TAU * N + T * 0.003;
  th = abs(fract(th) - 0.5) * 2.0;
  let lr = log(r) * 0.72 - T * (0.05 + 0.05 * trip) - 0.02 * D.breath.y;
  var petal = realmTap(realmFar, vec2f(th * 1.3 + 0.21 * lr, lr * 1.1), 1.0 + 2.5 * smoothstep(0.3, 0.02, r));
  // (its petals turning round the wheel from its heart to its rim)
  petal = max(hueTurn(petal, -2.6 * smoothstep(0.03, 0.7, r) + 0.5 * sin(lr * 2.0)), vec3f(0.0));
  let ring = smoothstep(0.012, 0.06, r) * (1.0 - smoothstep(0.15, 0.7, r)) * exp(-r * 2.5);
  c += petal * 0.8 * ring;
  let leap = D.realm.x;
  c += mix(vec3f(0.66, 0.88, 1.0), vec3f(1.0, 0.94, 0.8), 0.7 * D.breath.z) * (1.6 * exp(-r * r * 3000.0 / (1.0 + 30.0 * leap * leap)) + (0.18 + 0.5 * leap) * exp(-r * 30.0 / (1.0 + 3.0 * leap)) + 0.02 * exp(-r * 5.0));
  return c;
}

/** the mosaic laid over the lattice from three sides by a skin's facing N, `size` metres to the painting (so its big
 *  surfaces show whole flowers, its beads a petal's colour); foot the pixel's footprint there (m) */
fn gardenPaint(tex: texture_2d<f32>, p: vec3f, N: vec3f, size: f32, foot: f32) -> vec3f {
  var w = pow(abs(N), vec3f(6.0));
  w /= (w.x + w.y + w.z);
  let lod = log2(max(1.0, foot / size * f32(textureDimensions(tex).x)));
  let q = p * (2.0 / size);
  return w.x * realmTap(tex, q.zy + vec2f(0.37, 0.11), lod) + w.y * realmTap(tex, q.xz + vec2f(0.83, 0.59), lod)
    + w.z * realmTap(tex, q.xy, lod);
}

fn garden(roW: vec3f, rdW: vec3f, T: f32, trip: f32, px: f32) -> vec3f {
  let C = D.center.xyz;
  let portal = D.breath.z;
  // (the realm's own frame: x across the hide, y up, z in along the drum's axis)
  let rd0 = normalize(vec3f(rdW.z, rdW.y, rdW.x));
  let o = vec2f(roW.z - C.z, roW.y - C.y);
  // the view bent in toward the axis as it enters the glass, and the realm leaning toward the eye — both from outside
  // only: let go as the camera comes to the glass
  let n = mix(WAY_N, 1.0, portal);
  let tIn = rd0.xy / n;
  var slope = tIn / sqrt(max(1.0 - dot(tIn, tIn), 0.03));
  let cv = C - frame.camPos;
  let dC = normalize(vec3f(cv.z, cv.y, max(cv.x, 0.05)));
  let tC = dC.xy / n;
  slope -= WAY_AIM * (1.0 - portal) * tC / sqrt(max(1.0 - dot(tC, tC), 0.1));
  var dir = normalize(vec3f(slope, 1.0));
  // the flight: on down the way (a steady drift, and the camera's own — blurred across the frame's shutter), rolling
  let F = T * 0.22 + D.breath.y + (INNER_JIT - 0.5) * 2.0 * D.breath.w;
  let roll = 0.045 * (T * 0.22 + D.breath.y) + 0.35;
  let cr = cos(roll); let sr = sin(roll);
  let R = mat2x2f(cr, sr, -sr, cr);
  dir = vec3f(R * dir.xy, dir.z);
  let home = vec3f(0.31, -0.42, F);
  let P0 = home + vec3f(R * o, 0.0);
  // the slice through the fourth dimension: turning slowly, deeper as the trip deepens
  let a1 = 0.21 + 0.05 * sin(T * 0.11) + 0.06 * trip;
  let a2 = -0.13 + 0.05 * cos(T * 0.083);
  GD_T1 = vec2f(cos(a1), sin(a1));
  GD_T2 = vec2f(cos(a2), sin(a2));
  GD_W = 0.27 + T * 0.05 + 0.006 * F;
  GD_S = 1.32 + 0.1 * sin(T * 0.07 + 1.0);

  var col = vec3f(0.0);
  var trans = 1.0;
  var t = 0.05 + 0.25 * INNER_JIT;
  var skins = 0;
  var glow = 0.0;
  for (var i = 0; i < REALM_STEPS; i++) {
    let p = P0 + dir * t;
    let dm = gardenMap(p);
    let near = length(p - home);
    let d = max(dm, GARDEN_CLEAR - near);
    let eps = max(0.002, px * t * 1.3);
    // (the air near a skin glows a little with it)
    glow += trans * exp(-dm * 9.0) * exp(-t / GARDEN_FOG) * 0.0012;
    if (d < eps) {
      let orb = GD_ORB;
      // the skin's facing
      let e = max(eps, 0.003);
      let k1 = vec3f(1.0, -1.0, -1.0); let k2 = vec3f(-1.0, -1.0, 1.0); let k3 = vec3f(-1.0, 1.0, -1.0); let k4 = vec3f(1.0, 1.0, 1.0);
      var N = normalize(k1 * gardenMap(p + k1 * e) + k2 * gardenMap(p + k2 * e) + k3 * gardenMap(p + k3 * e) + k4 * gardenMap(p + k4 * e));
      if (dot(N, dir) > 0.0) { N = -N; }
      // its panes: the mosaic at two sizes, each chamber in its own season — the painting's colours turned round the
      // wheel by where in the lattice it stands
      let foot = px * t;
      let big = gardenPaint(realmMid, p, N, 3.4, foot);
      let fine = luma(gardenPaint(realmNear, p.yzx, N.yzx, 0.62, foot));
      let season = 3.0 * sin(2.6 * orb.w + 1.7 * orb.x - 0.9 * orb.z + 0.11 * t + 0.04 * T + 1.2 * trip + 2.2 * D.realm.x);
      var alb = max(hueTurn(big * (0.55 + 2.2 * fine), season), vec3f(0.0));
      alb = max(mix(vec3f(luma(alb)), alb, 1.5), vec3f(0.0)) * 1.15;
      // lit: the sun on its face or through it (a leaf held up to the light), the air's own light from all round —
      // teal from above, violet from below — and its hollows in shade
      let ao = 0.1 + 0.9 * pow(sat(orb.w * 1.7), 1.6);
      let ndl = dot(N, GARDEN_SUN);
      let sunC = mix(vec3f(0.62, 0.84, 1.0), vec3f(1.0, 0.9, 0.7), 0.75 * portal) * 1.5;
      let amb = mix(vec3f(0.07, 0.06, 0.3), mix(vec3f(0.04, 0.2, 0.4), vec3f(0.05, 0.27, 0.3), portal), 0.5 + 0.5 * N.y);
      var c = alb * ao * (amb * 1.3 + sunC * (0.75 * sat(ndl) + 0.55 * sat(-ndl)));
      c += alb * alb * sunC * sat(-ndl) * 0.9 * ao;
      // gold along its folds; bright veins running over it, the wheel's colours, a pulse of light travelling down them
      let fold = min(orb.x, orb.z);
      let seam = 1.0 - smoothstep(0.0, 0.03, fold);
      let vein = 1.0 - smoothstep(0.0, 0.07, abs(fract(orb.y * 9.0 + orb.w * 3.0 + T * 0.09) - 0.5));
      let pulse = 0.55 + 0.45 * sin(orb.y * 23.0 - T * 1.3 + orb.w * 9.0);
      let fres = pow(1.0 - abs(dot(N, dir)), 3.0);
      c += mix(vec3f(0.3, 0.75, 1.0), vec3f(1.0, 0.7, 0.24), portal * 0.7) * seam * (0.5 + 0.5 * fres);
      // (and its rim alight where the sun's behind it)
      c += alb * sunC * pow(fres, 1.5) * pow(sat(dot(dir, GARDEN_SUN)), 2.0) * 1.2;
      c += gardenHue(orb.w * 1.6 - T * 0.04 + 0.5 + 0.3 * trip) * vein * pulse * 0.6;
      // (its sheen: the sun's glint and the air's light glancing off it)
      let rf = reflect(dir, N);
      c += sunC * pow(sat(dot(rf, GARDEN_SUN)), 28.0) * 0.5 * ao + gardenHaze(rf) * fres * 0.4;
      // how solid: lace where the mosaic's dark, whole along the gold and the veins; dissolving near the flier
      var a = smoothstep(0.02, 0.085, luma(big));
      a = max(a, max(seam, vein * 0.8));
      a *= smoothstep(GARDEN_CLEAR, GARDEN_CLEAR + 0.9, near);
      let fog = exp(-t / GARDEN_FOG);
      col += trans * a * mix(gardenHaze(dir), c, fog);
      trans *= 1.0 - a;
      skins++;
      if (skins >= REALM_SKINS || trans < 0.03) { break; }
      t += max(eps * 3.0, 0.03);
      continue;
    }
    t += max(d * 0.75, eps * 0.5);
    if (t > GARDEN_FAR) { break; }
  }
  // past the last skin: the haze thickening to the sky's own light
  let sky = gardenSky(dir, T, trip);
  col += trans * sky;
  col += vec3f(0.35, 0.75, 1.0) * glow;
  // the deep: all of it steeped in one blue — ultramarine in its shadows, azure to a pale cyan in its lights — seen
  // through the glass that blue is nearly all there is; flown into, its own colours come up through it
  let l = luma(col);
  // (its darks let down to navy, its lights lifted: depth, not a wash)
  let lc = l * l / (l + 0.22);
  let deep = mix(vec3f(0.01, 0.06, 0.55), vec3f(0.07, 0.42, 1.0), sat(lc * 0.85)) * lc * 3.0 + vec3f(0.5, 0.88, 1.0) * max(lc - 0.8, 0.0) * 0.9;
  let in01 = smoothstep(0.0, 1.0, portal);
  col = mix(col, deep, mix(0.86, 0.16, in01)) * mix(0.8, 1.0, in01);
  return col;
}
