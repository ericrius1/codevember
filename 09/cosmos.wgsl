// The sky round the dais, one fullscreen pass: we live inside a bubble — our universe — and its wall is the sky, a
// soap-film membrane all round us a hundred-odd metres out. Our own sky (a violet nebula, its stars) is in front of it.
//
// The great stroke's shock reaches the wall and ripples it: wave packets run out across it from where the shock came
// (G.waves), and each neighbouring universe answers from its own direction a beat later, so the rings cross and
// interfere. Where the film thins in the troughs, and then behind the great front as it sweeps round (K.open.x), it
// tears open on the deep beyond it (deepSky): strands of light and of dark out to forever. The ripples lens it as water
// does; a whisper of the film's colours lies over it.
#include "./common"
#include "weft/fullscreen"

struct CosmosU {
  // x how far the membrane's torn open (0..1), y the lens: how far its ripples bend the light through them, z the
  // ripples' own clock (s: the events in G.waves are on it), w spare
  open: vec4f,
  // the front: the great stroke's shock reaching the wall — x when it first does, behind the drum (film s; < 0 not
  // yet), y how far that is from the drum (m), z how fast the line where it arrives sweeps on round (m/s), w its height
  front: vec4f,
  // x how fast the front's crest fades (1/s), y how far the deep shows through the whole membrane (0..1), z the deep's
  // shells, w 1: the deep alone (a debug: ?deep=1)
  deep: vec4f,
}
@group(2) @binding(0) var<uniform> K: CosmosU;
// (live, on a dense screen, the sky is drawn at half the size and lifted into the scene: fsSkyUp)
@group(2) @binding(1) var skyTex: texture_2d<f32>;
// the deep's slow fields, made once a frame for every shell (fsDeepFields): which contours are strands, their colours,
// the haze's
@group(2) @binding(2) var deepA: texture_2d<f32>;
@group(2) @binding(3) var deepB: texture_2d<f32>;

// ---------------------------------------------------------------- the deep
// What the membrane opens on, marched through rather than painted: a living depth beyond our universe's wall, strands
// of light and of dark winding through it — kelp, roots, a forest's hanging threads — at every scale. The march goes
// out by doublings of distance, each doubling its own band of strands a doubling larger, so they're always about the
// same size to the eye out to forever; each band is real 3D (it slides against the next as the camera moves) and turns
// slowly its own way round the light. Light strands glow (sea-teal, deep blue, leaf-green in places), dark ones drink
// the light behind them, all of it toward a cold light far down. A strand is where two smooth noises are both near
// zero: a line winding through space, never a lattice.
fn gnc(i: vec3f, f: vec3f, o: vec3f) -> f32 { return dot(hash33(i + o) * 2.0 - 1.0, f - o); }
/** gradient noise (quintic), about ±0.5 */
fn gnoise(p: vec3f) -> f32 {
  let i = floor(p); let f = fract(p); let u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(mix(gnc(i, f, vec3f(0, 0, 0)), gnc(i, f, vec3f(1, 0, 0)), u.x), mix(gnc(i, f, vec3f(0, 1, 0)), gnc(i, f, vec3f(1, 1, 0)), u.x), u.y),
             mix(mix(gnc(i, f, vec3f(0, 0, 1)), gnc(i, f, vec3f(1, 0, 1)), u.x), mix(gnc(i, f, vec3f(0, 1, 1)), gnc(i, f, vec3f(1, 1, 1)), u.x), u.y), u.z);
}
/** p turned by angle a about the unit axis k */
fn turnAbout(p: vec3f, k: vec3f, a: f32) -> vec3f { let c = cos(a); let s = sin(a); return p * c + cross(k, p) * s + k * dot(k, p) * (1.0 - c); }
/** the cold light far down beyond the wall (beyond the drum as the camera ends, up a little and to the right of it) */
const DEEP_LIGHT = vec3f(0.82, 0.15, 0.56);
/** the shells' centre */
const DEEP_C = vec3f(0.0, 1.4, 0.0);
/** a shell's point in its noise: d its direction from the shells' centre — its own place, its own slow turn round the
 *  light (the next the other way), and a slow warp through it */
fn shellQ(k: i32, d: vec3f, T: f32) -> vec3f {
  let fk = f32(k);
  let h3 = hash33(vec3f(fk * 3.1, fk * 1.7 + 2.0, 5.3));
  let spin = T * 0.004 * (0.6 + 0.8 * h3.z) * select(-1.0, 1.0, (k & 1) == 0);
  var q = turnAbout(d, normalize(DEEP_LIGHT), spin) / 0.16 + h3 * 97.0;
  q += 0.09 * vec3f(dotNoise(q * 0.35 + vec3f(0.0, T * 0.01, 0.0)), dotNoise(q * 0.35 + 2.3), dotNoise(q * 0.35 + 5.1));
  return q;
}
// The deep's slow fields — six noises far larger than a strand (which of its contours are strands, which dark ones, the
// colours, the haze) — made once a frame for every shell into a strip of an atlas (each shell's all-round view,
// longitude by colatitude) instead of on every pixel for every shell: read back, they're the same fields to a hair's
// breadth, at a sixth of the work
const DEEP_W = 256.0;
const DEEP_H = 128.0;
const DEEP_MAX = 18.0;
struct DeepFields { @location(0) a: vec4f, @location(1) b: vec4f };
@fragment fn fsDeepFields(i: FullscreenOut) -> DeepFields {
  let k = floor(i.pos.y / DEEP_H);
  let lon = i.pos.x / DEEP_W * TAU - PI;
  let colat = (i.pos.y - k * DEEP_H) / DEEP_H * PI;
  let d = vec3f(sin(colat) * cos(lon), cos(colat), sin(colat) * sin(lon));
  let q = shellQ(i32(k), d, G.clock.x);
  var o: DeepFields;
  o.a = vec4f(gnoise(q * 0.31 + 3.0), gnoise(q * 0.09 + 5.0), gnoise(q * 0.13 + 9.0), gnoise(q * 0.27 + 17.0));
  o.b = vec4f(gnoise(q * 0.05 + 23.0), gnoise(q * 0.04 + 51.0), 0.0, 1.0);
  return o;
}
/** where shell k's fields are in the atlas, toward d (unit, from the shells' centre) */
fn deepUV(k: i32, d: vec3f) -> vec2f {
  let u = (atan2(d.z, d.x) + PI) / TAU;
  let v = clamp(acos(clamp(d.y, -1.0, 1.0)) / PI * DEEP_H, 0.5, DEEP_H - 0.5);
  return vec2f(u, (f32(k) * DEEP_H + v) / (DEEP_H * DEEP_MAX));
}
/** the deep along a ray: ro, rd the ray (bent by the membrane), d0 where it leaves the wall (m).
 *  Shells round the dais out from the wall, each a third again as far as the last, each with strands a third again as
 *  large (so the same size to the eye, out to forever): long strands of light flowing each shell its own way, strands
 *  of dark that hide all behind them, a glowing haze between. Every shell is drawn, near or not (its weight fades it
 *  in past the wall), so the screen-space widths (fwidth) stay in uniform control flow */
fn deepSky(ro: vec3f, rd: vec3f, d0: f32) -> vec3f {
  let T = G.clock.x;
  let Ld = normalize(DEEP_LIGHT);
  let toL = max(dot(rd, Ld), 0.0);
  let C = DEEP_C;
  let N = i32(min(K.deep.z, DEEP_MAX));
  let G0 = 1.33;
  var col = vec3f(0.0);
  var tr = 1.0;
  var Rk = 70.0;
  // (a shell wholly inside the wall from here adds nothing: passed over — on uniforms alone, so the screen-space widths
  // stay in uniform control flow)
  let inner = (G.wall.w - length(ro - G.wall.xyz)) * 0.98 - length(ro - C);
  for (var k = 0; k < N; k++) {
    let fk = f32(k);
    let Rn = Rk * G0;
    if (Rk < inner) { Rk = Rn; continue; }
    // where the ray meets this shell (from inside it), and how far past the wall that is
    let hk = sphereHit(ro, rd, C, Rk).y;
    let p = ro + rd * hk;
    let wgt = smoothstep(d0 * 0.98, d0 * 1.25, hk);
    // (the shell's own place in the noise, and the way its strands flow)
    let h3 = hash33(vec3f(fk * 3.1, fk * 1.7 + 2.0, 5.3));
    let dk3 = normalize(p - C);
    let q = shellQ(k, dk3, T);
    let F = normalize(vec3f(h3.x - 0.5, 1.4, h3.y - 0.5) + vec3f(0.0, 0.0, 0.6 * sin(fk * 2.4)));
    // (its slow fields, made for the frame: fsDeepFields)
    let duv = deepUV(k, dk3);
    let fa = textureSampleLevel(deepA, samp_repeat, duv, 0.0);
    let fb = textureSampleLevel(deepB, samp_repeat, duv, 0.0);
    let qf = q - F * dot(q, F) * 0.88;
    // light: the contours of a noise, long along the flow
    let a = gnoise(qf) + 0.12 * gnoise(qf * 2.3 + 11.0);
    let aw = max(fwidth(a), 1e-4);
    let far = exp(-fk * 0.16);
    // (near shells' strands thick and soft, as if out of focus; far ones fine — the eye reads the depth in their sizes)
    let far3 = far * far * far;
    let lw = max(0.005 + 0.012 * far3, aw * 0.9);
    let core = exp(-(a / lw) * (a / lw)) * sqrt(0.008 / lw);
    let halo = exp(-(a / (lw * 6.0)) * (a / (lw * 6.0)));
    // dark: another noise's contours, flowing across, thicker
    let qd = q - F.zxy * dot(q, F.zxy) * 0.93;
    let c = gnoise(qd * 0.5 + 41.0);
    let cw = max(0.013 + 0.03 * far3, max(fwidth(c), 1e-4) * 0.9);
    // (the widths taken, what only shades a strand is worked out only near one: far from any, it adds nothing)
    var em = vec3f(0.0); var keepL = 0.0;
    // (and none of it where this shell's hidden: behind the wall here, or past dark strands that have drunk the light)
    let seen = tr * wgt > 1e-3;
    if (seen && halo > 4e-4) {
      // (only some of each shell's contours are strands: the rest of it open, so the shells behind show)
      keepL = smoothstep(-0.04, 0.26, fa.x + 0.12);
      // its colour: sea-teal and deep blue, leaf-green in places; pale only at the brightest; dimmer and bluer far off
      var lc = mix(vec3f(0.10, 0.50, 0.36), vec3f(0.12, 0.28, 0.70), sat(fa.y * 2.4 + 0.5));
      lc = mix(lc, vec3f(0.30, 0.56, 0.20), 0.75 * smoothstep(-0.04, 0.2, fa.z));
      lc = mix(lc, vec3f(luma(lc)), 0.2);
      lc = mix(vec3f(0.10, 0.22, 0.42), lc, far);
      let lit = (0.25 + 1.3 * pow(toL, 8.0)) * (0.35 + 0.65 * far);
      em = (lc * (core * 0.7 + halo * 0.008) + vec3f(0.55, 0.85, 0.8) * core * core * 0.12) * keepL * lit;
    }
    var dark = 0.0;
    let dk = exp(-(c / cw) * (c / cw));
    if (seen && dk > 1e-3) { dark = dk * smoothstep(0.06, 0.3, fa.w + 0.05); }
    // the haze from the last shell to this one, its glow wandering (softly, at the shells' own scale)
    if (seen) {
      let hz = pow(sat(fb.x * 2.2 + 0.35), 2.0);
      let hazeG = sat(fb.y * 2.0 + 0.5);
      let hazeC = mix(vec3f(0.003, 0.009, 0.014), mix(vec3f(0.012, 0.04, 0.046), vec3f(0.02, 0.042, 0.02), hazeG), hz) * (1.0 + 2.0 * pow(toL, 6.0));
      col += tr * wgt * (hazeC * 0.03 + em);
    }
    tr *= 1.0 - wgt * (dark * 0.92 + min(core, 1.0) * keepL * 0.35);
    Rk = Rn;
  }
  // the light far down and its haze, seen past what's dark
  let back = vec3f(0.006, 0.02, 0.028) * (0.5 + 0.5 * toL) + vec3f(0.3, 0.62, 0.72) * (pow(toL, 40.0) * 0.5 + pow(toL, 10.0) * 0.05);
  return col + tr * back;
}

// ---------------------------------------------------------------- the wall's ripples
/** the height of the ripples at a point (unit n from the sphere's centre, radius R) from one event (xyz where on the
 *  wall, w when): a packet running out over the sphere at `speed` (m/s), its rings behind its front, `k` rings a metre */
fn ripple(n: vec3f, R: f32, ev: vec4f, speed: f32, amp: f32, k: f32) -> f32 {
  if (ev.w < 0.0) { return 0.0; }
  let age = K.open.z - ev.w;
  if (age <= 0.0) { return 0.0; }
  let arc = acos(clamp(dot(n, normalize(ev.xyz)), -1.0, 1.0)) * R;
  let front = speed * age;
  let x = front - arc;
  if (x < 0.0) { return 0.0; }
  // (its strength: the event's length)
  let fade = exp(-age * 0.1) * (1.0 - exp(-age * 3.0)) * length(ev.xyz);
  // (the rings stretch a little as they spread)
  let lam = 1.0 / k * (1.0 + age * 0.05);
  return amp * sin(TAU * x / lam) * exp(-x / (front * 0.5 + 25.0)) * fade * smoothstep(0.0, lam * 0.5, x);
}

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
  for (var i = 0; i < 8; i++) { h += ripple(n, R, G.waves[i], 52.0 + f32(i % 3) * 8.0, 1.0, 0.075); }
  // the neighbours answer the great stroke, each from its own face, a beat after its ripple reaches them
  let gw = G.waves[3];
  if (gw.w > 0.0) {
    for (var i = 0; i < 12; i++) {
      let s = ANSWERS[i];
      let reach = acos(clamp(dot(s, normalize(gw.xyz)), -1.0, 1.0)) * R / 52.0;
      let ev = vec4f(s * 0.07, gw.w + reach + 0.9 + 0.8 * hash11(f32(i) * 3.1));
      h += ripple(n, R, ev, 46.0, 1.0, 0.09);
    }
  }
  // (a faint breath on it always: the cosmos never quite still)
  let tc = G.clock.x;
  h += 0.03 * sin(dot(n, vec3f(3.0, 1.0, 2.0)) * 23.0 + tc * 0.4) * sin(dot(n, vec3f(-1.0, 4.0, 1.0)) * 19.0 - tc * 0.3);
  // the trip: the whole membrane heaving more and more in great slow rings
  let tr = G.cosmos.z;
  if (tr > 0.0) {
    // (great rings rolling out from behind the drum, their spacing wandering a little — never a grid of blots)
    let arc = acos(clamp(dot(n, vec3f(0.99, -0.12, 0.0)), -1.0, 1.0));
    let sw = sin(arc * (11.0 + 1.5 * sin(arc * 2.0 + tc * 0.2)) - tc * 0.9) * smoothstep(0.05, 0.4, arc);
    h += tr * sw * 0.5;
  }
  return h;
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

/** the front at a point of the wall (q, unit n): x its height there, y its slope (per m, along its way), z how far
 *  behind it the point is (m: < 0 not reached yet) — a single bright crest sweeping out from behind the drum across the
 *  whole dome (where the shock's sphere meets the wall), the membrane ringing behind it */
fn frontAt(q: vec3f, F: vec4f, fadeRate: f32) -> vec3f {
  if (F.x < 0.0 || G.clock.x < F.x) { return vec3f(0.0, 0.0, -1e4); }
  let age = G.clock.x - F.x;
  let d = length(q - G.drum.xyz) - F.y;
  let x = age * F.z - d;
  let fade = exp(-age * fadeRate) * F.w;
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
  let fr = frontAt(q, K.front, K.deep.x);
  let away = normalize(normalize(q - G.drum.xyz) - n * dot(normalize(q - G.drum.xyz), n) + vec3f(1e-5));
  // (the light through it bent as through water, by the ripples and the front)
  let bendF = away * fr.y * 0.9;
  let bent = normalize(rd + dh * amp * K.open.y + bendF);
  // our own sky, its colour drifting while time's out of joint
  var col = hueShift(nebula(bent), G.cosmos.w) + stars(bent) * 0.8;
  // how far it's open on the deep: the troughs first, as the ripples come; then all of it behind the great front as
  // it sweeps the dome
  let reveal = K.open.x * smoothstep(0.0, 70.0, fr.z);
  // the tears: where the membrane's worn thin enough to open — a noise over it at three scales, the openings growing
  // out of its thinnest places as the ripples' troughs pass and as it's torn open
  let tq = n * 1.15 + vec3f(0.0, 0.0, G.clock.x * 0.012);
  let tn = fbm(tq + 0.35 * vec3f(vnoise(tq * 2.0), vnoise(tq * 2.0 + 5.3), vnoise(tq * 2.0 + 9.1)));
  let th = mix(0.86, 0.5, reveal);
  let tear = smoothstep(th - 0.015, th + 0.06, tn);
  let open = sat(smoothstep(0.3, 1.0, -hr) * 0.25 * G.cosmos.y + reveal) * tear;
  // the deep, refracted through the ripples (strongly: where the membrane's folded the deep behind it swims) — drawn
  // wherever the sky is once the membrane's opening at all: its strands' widths are screen-space derivatives, so it's
  // gated on uniform values only, never on this pixel's own openness
  var deep = vec3f(0.0);
  if (K.open.x > 0.001 || K.deep.y > 0.002) { deep = deepSky(ro, normalize(rd + dh * amp * 0.0014 + bendF), max(hit.y, 0.0)); }
  if (K.deep.w > 0.5) { return vec4f(deep, 1.0); }
  // (through the whole membrane, a little, as the trip deepens: the film itself turning to a window), and where it's
  // torn, the deep
  col = mix(col, col * 0.5 + deep, K.deep.y * (0.4 + 0.6 * smoothstep(0.0, 0.8, abs(hr))));
  col = col * (1.0 - open) + deep * open;
  // the film over it all: a whisper of its colours, strongest where it's rippled and edge-on (over the deep, the depth
  // is the thing)
  let c = abs(dot(n, rd));
  let lp = TAU * G.clock.w;
  let nm = 380.0 + 130.0 * hr + 60.0 * fbm(n * 6.0 + vec3f(sin(lp), cos(lp), 0.0) * 0.4);
  // (its colours softened: a film's interference fully saturated paints the ripples' crests as blots)
  let tf = thinFilm(c, nm);
  let filmCol = mix(vec3f(luma(tf)), tf, 0.55) * (0.03 + 0.5 * fresnel(0.04, c)) * (1.0 + 1.2 * abs(hr));
  col += filmCol * (0.06 + 0.22 * abs(hr)) * (1.0 - 0.6 * open) * 0.25;
  // the crests: bands of the film's colours, wider as the trip deepens; a thin bright line where it turns over
  let trip = G.cosmos.z;
  let crest = max(hr, 0.0) * max(hr, 0.0) * (1.0 - 0.6 * open);
  let band = smoothstep(0.1, 0.9, abs(hr)) * (1.0 - 0.5 * open);
  let edge = exp(-pow(hr / 0.08, 2.0)) * smoothstep(0.05, 0.3, length(dh) * 0.004) * amp;
  let tf2 = pow(thinFilm(c, 280.0 + 240.0 * hr + 160.0 * fbm(n * 9.0)), vec3f(2.0));
  col += (mix(vec3f(luma(tf2)), tf2, 0.15) * (min(crest, 1.0) * (0.1 + 0.08 * trip) + band * 0.05 * trip) + vec3f(0.8, 0.9, 1.0) * edge * 0.08) * 0.25;
  // the front's crest: a band of the film bulged and burning as it sweeps the dome
  let fcrest = max(fr.x, 0.0);
  col += (thinFilm(c, 320.0 + 300.0 * fcrest) * 0.075 + vec3f(0.62, 0.72, 0.85) * (0.25 + 0.6 * fcrest * fcrest)) * fcrest * 0.42;
  // the tears' rims: the film gathered thick at their edges
  let rimK = exp(-pow((tn - th) / 0.012, 2.0)) * sat(reveal * 1.5 + 0.8 * G.cosmos.y * max(-hr, 0.0));
  col += (thinFilm(c, 420.0 + 300.0 * hr) * 0.05 + vec3f(0.3, 0.6, 0.55) * 0.1) * rimK * 0.35;
  return vec4f(col, 1.0);
}

// The sky drawn small (live, on a dense screen: a texel of it a point of the screen) and lifted into the scene, by a
// Catmull-Rom filter in five bilinear taps: its stars and the deep's fine strands stay crisp, not smeared as a plain
// bilinear lift would leave them.
fn skyTap(uv: vec2f) -> vec3f { return textureSampleLevel(skyTex, samp_linear, uv, 0.0).rgb; }
@fragment fn fsSkyUp(i: FullscreenOut) -> @location(0) vec4f {
  let size = vec2f(textureDimensions(skyTex));
  let sp = i.uv * size;
  let tc = floor(sp - 0.5) + 0.5;
  let f = sp - tc;
  let w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  let w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  let w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  let w3 = f * f * (-0.5 + 0.5 * f);
  let w12 = w1 + w2;
  let a = (tc - 1.0) / size; let b = (tc + w2 / w12) / size; let c = (tc + 2.0) / size;
  let k0 = w12.x * w0.y; let k1 = w0.x * w12.y; let k2 = w12.x * w12.y; let k3 = w3.x * w12.y; let k4 = w12.x * w3.y;
  let col = skyTap(vec2f(b.x, a.y)) * k0 + skyTap(vec2f(a.x, b.y)) * k1 + skyTap(b) * k2 + skyTap(vec2f(c.x, b.y)) * k3 + skyTap(vec2f(b.x, c.y)) * k4;
  return vec4f(max(col / (k0 + k1 + k2 + k3 + k4), vec3f(0.0)), 1.0);
}
