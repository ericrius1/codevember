// The great drum: its hide (a membrane simulated on the GPU — the wave equation with stiffness and damping, the
// beater's head pushing into it as it strikes), its carved shell, its root stand and cords and seed pods, the dais
// they stand on.
//
// The hide's simulation runs on its own clock (the membrane's time): at the world's normal pace it runs slower than
// the world (so a stroke's ripples can be seen crossing it at all — at a real hide's 100 m/s they'd cross it in a
// frame), and once time dilates deep enough it runs exactly with the world, at a real hide's speed.
#include "./common"
#include "weft/mesh"

const N = 256u;

struct DrumU {
  // x the hide's radius (m), y cell size (m), z λ² (c·dt/h)², w μ² (stiffness)
  sim: vec4f,
  // x the damping σ0·dt, y the frequency-dependent damping (σ1·dt/h²), z substeps this frame, w the visual gain
  sim2: vec4f,
  // the hide's frame: xyz its centre, w how far the whole drum's rocked back on its stand by the strokes (rad, about z)
  center: vec4f,
  // x the rim texture's repeats round the shell, y the hide's glow, z the time (s), w the inner light's flicker
  look: vec4f,
  // x how far you see through the hide behind its front (0 opaque .. 1), y the refraction's strength (screen uv
  // per unit of the normal's tilt), z the fuzz's length (m), w its breeze's clock (s)
  glass: vec4f,
  // the trip (from the great stroke to the end): x how deep (0..1), y the world inside's clock (s), z how far the hide
  // breathes on its own (m), w 1: the world inside alone (a debug: ?inner=1)
  trip: vec4f,
  // the glass's front: xy where the hide was struck (its frame: a across, b up; m), z how far out the front's got (m),
  // w how soft its edge is (m)
  front: vec4f,
  // the realm's layers (inner.wgsl): xyz their gains (deep, middle, near), w the deep one's flight (octaves a second);
  // realm2 x its twist (×)
  realm: vec4f, realm2: vec4f,
}
@group(2) @binding(0) var<uniform> D: DrumU;
// the drum rocked on its stand by a stroke: turned about the stand's foot (z through it)
const ROCK_PIVOT = vec3f(0.18, 0.12, 0.0);
fn rock(p: vec3f) -> vec3f {
  let a = D.center.w; let c = cos(a); let s = sin(a);
  let q = p - ROCK_PIVOT;
  return ROCK_PIVOT + vec3f(q.x * c - q.y * s, q.x * s + q.y * c, q.z);
}
fn rockDir(n: vec3f) -> vec3f { let a = D.center.w; let c = cos(a); let s = sin(a); return vec3f(n.x * c - n.y * s, n.x * s + n.y * c, n.z); }
// ---------------------------------------------------------------- the hide, drawn
struct HideOut {
  @builtin(position) pos: vec4f,
  @location(0) wpos: vec3f,
  @location(1) uv: vec2f,
  @location(2) n: vec3f,
  @location(3) disp: f32,
  @location(4) curv: f32,
};
@group(2) @binding(4) var simTex: texture_2d<f32>;
@group(2) @binding(5) var hideTex: texture_2d<f32>;
@group(2) @binding(6) var rimTex: texture_2d<f32>;
@group(2) @binding(7) var<storage, read> verts: array<MeshVertex>;
// a rigid prop (the beater): its model matrix (its rotation orthonormal)
struct PropU { model: mat4x4f }
@group(2) @binding(8) var<uniform> PM: PropU;
#include "./inner"

/** the hide's displacement at uv (bilinear by hand: rg32float isn't filterable) */
fn simAt(uv: vec2f) -> f32 {
  let p = uv * f32(N) - 0.5;
  let i = vec2i(floor(p)); let f = fract(p);
  let m = i32(N) - 1;
  let a = textureLoad(simTex, clamp(i, vec2i(0), vec2i(m)), 0).x;
  let b = textureLoad(simTex, clamp(i + vec2i(1, 0), vec2i(0), vec2i(m)), 0).x;
  let c = textureLoad(simTex, clamp(i + vec2i(0, 1), vec2i(0), vec2i(m)), 0).x;
  let d = textureLoad(simTex, clamp(i + vec2i(1, 1), vec2i(0), vec2i(m)), 0).x;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
/** the hide breathing on its own as the trip deepens (m, into the drum): slow rings from its middle and a turning
 *  three-fold swell, held at the rim */
fn breathe(uv: vec2f) -> f32 {
  let A = D.trip.z;
  if (A <= 0.0) { return 0.0; }
  let p = (uv - 0.5) * 2.0;
  let r = length(p);
  let a = atan2(p.y, p.x);
  let T = D.trip.y;
  let edge = max(1.0 - r * r, 0.0);
  return A * edge * (0.55 * sin(r * 9.0 - T * 0.9) + 0.35 * r * sin(3.0 * a + r * 4.0 + T * 0.35) + 0.22 * sin(r * 19.0 - T * 1.6 + a));
}
/** the hide's displacement drawn: the simulation's, at its gain, and its breath */
fn hideH(uv: vec2f) -> f32 { return simAt(uv) * D.sim2.w + breathe(uv); }
@vertex fn vsHide(@builtin(vertex_index) vi: u32) -> HideOut {
  var o: HideOut;
  let v = verts[vi];
  let lp = meshPos(v);            // (a, b) on the hide in its frame, at rest
  let uv = meshUV(v);
  let e = 1.5 / f32(N);
  let h = hideH(uv);
  let hx = (hideH(uv + vec2f(e, 0.0)) - hideH(uv - vec2f(e, 0.0))) / (2.0 * e * 2.0 * D.sim.x);
  let hy = (hideH(uv + vec2f(0.0, e)) - hideH(uv - vec2f(0.0, e))) / (2.0 * e * 2.0 * D.sim.x);
  let lapv = hideH(uv + vec2f(e, 0.0)) + hideH(uv - vec2f(e, 0.0)) + hideH(uv + vec2f(0.0, e)) + hideH(uv - vec2f(0.0, e)) - 4.0 * h;
  // the hide's frame: its normal toward the player (-x), a across (+z), b up (+y); displaced into the drum by h
  let C = D.center.xyz;
  let wp = rock(C + vec3f(h, lp.y, lp.x));
  o.wpos = wp;
  o.pos = frame.viewProj * vec4f(wp, 1.0);
  o.uv = uv;
  // (the surface x = h(z, y): its normal toward -x)
  o.n = rockDir(normalize(vec3f(-1.0, hy, hx)));
  o.disp = h;
  o.curv = lapv / (D.sim.y * D.sim.y);
  return o;
}
@fragment fn fsHide(in: HideOut, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  let V = normalize(frame.camPos - in.wpos);
  var N = normalize(in.n);
  let front = dot(V, vec3f(-1.0, 0.0, 0.0)) > 0.0;
  if (!front) { N = -N; }
  let L = stageLight(in.wpos, N);
  // the hide's paint and its veins
  let tuv = (in.uv - 0.5) * 0.985 + 0.5;
  var alb = textureSample(hideTex, samp_linear, vec2f(tuv.x, 1.0 - tuv.y)).rgb;
  alb = pow(alb, vec3f(2.2));
  // (a hide, not a decal: paler and creamier at its middle where it's stretched thinnest, deepening to a dark amber
  // toward the rim where it's thick and laps the shell)
  let rr = length(in.uv - 0.5) * 2.0;
  alb = mix(alb, vec3f(luma(alb)) * vec3f(1.15, 1.0, 0.78), 0.28 * (1.0 - rr * rr));
  alb *= mix(1.08, 0.52, smoothstep(0.35, 1.0, rr));
  // (its painted lines: turquoise and gold against the amber — they glow)
  let sat_ = max(alb.r, max(alb.g, alb.b)) - min(alb.r, min(alb.g, alb.b));
  let teal = sat(alb.g + alb.b * 0.6 - alb.r * 1.2) * 2.5;
  let gold = sat((alb.r + alb.g) * 0.5 - 0.42) * 3.0 * sat(1.0 - alb.b * 4.0);
  let paint = sat(teal + gold * 0.6);
  // light through the hide from inside the drum: warm, brighter where it's stretched thin (the ripples' crests and
  // troughs), the veins darker in it
  let stretch = 1.0 - exp(-abs(in.curv) * 0.004);
  let thru = D.look.y * (0.3 + 0.25 * D.look.w) * (1.0 + 0.6 * stretch + 0.15 * G.drumCol.w);
  let r = length(in.uv - 0.5) * 2.0;
  let backlit = vec3f(1.0, 0.48, 0.16) * alb * thru * (1.0 - 0.35 * r * r);
  var col: vec3f;
  if (front) {
    // a skin, not a board: light goes into it and comes out further on, redder (wrapped diffuse, the wrap's light
    // tinted the colour light takes on through a hide), its relief softened by it
    let wrapK = (dot(N, L.keyL) + 0.55) / 1.55;
    let wrapD = (dot(N, L.drumL) + 0.55) / 1.55;
    let scatterTint = vec3f(1.0, 0.62, 0.38);
    let wk = sat(wrapK);
    let wd = sat(wrapD);
    let lit = mix(scatterTint * wk, vec3f(sat(dot(N, L.keyL))), 0.55) * L.key + mix(scatterTint * wd, vec3f(sat(dot(N, L.drumL))), 0.55) * L.drum * 0.2;
    let diff = lit + L.amb;
    // (its relief: the ripples' slopes shaded as a raking light from above and her side would — the rings read as rings
    // however bright the light through it is)
    let tilt = N - vec3f(-1.0, 0.0, 0.0);
    let rake = dot(tilt, normalize(vec3f(0.0, 0.75, 0.65)));
    let relief = clamp(1.0 + 2.6 * rake, 0.45, 1.75);
    col = (alb * diff * 0.45 + backlit) * relief;
    // the crests catch the lights: soft glints (a hide's fine down, not oil), and the sky's shimmer slid across them
    col += vec3f(1.0, 0.88, 0.72) * (ggx(N, V, L.keyL, 0.34) * L.key * 0.22 + ggx(N, V, L.drumL, 0.38) * L.drum * 0.16);
    let nv = sat(dot(N, V));
    let fs = fresnel(0.035, nv);
    let R = reflect(-V, N);
    col += fs * (L.rim * (0.8 + 1.4 * sat(R.y)) + L.amb * 0.6) * (0.6 + 2.0 * length(tilt.yz));
    // velvet: the down on it lit at the grazing angles, warm where the light's through it
    let sheen = pow(1.0 - nv, 3.0);
    col += sheen * (alb * 0.6 + vec3f(0.25, 0.16, 0.1)) * (L.key * (0.4 + 0.6 * wk) + L.rim * 0.8 + L.drum * 0.3) * 0.55;
    // the painted lines glow, more as the hide's struck and as it's stretched
    col += mix(vec3f(0.2, 1.0, 0.85), vec3f(1.0, 0.7, 0.2), gold / max(paint, 1e-3)) * paint * (0.2 + 0.6 * stretch + 0.18 * G.drumCol.w) * D.look.y * relief;
  } else {
    col = backlit * 0.6 + alb * L.amb * 0.3;
  }
  // (the ripples catch the light: a sheen along their slopes)
  col += vec3f(1.0, 0.8, 0.5) * stretch * 0.18 * D.look.y;
  col += vec3f(0.35, 0.85, 0.8) * shockAt(in.wpos) * 0.3;
  // the hide turns to glass behind each stroke's ripple as it spreads from where it was struck: a little for a moment
  // at each stroke of the pulse, and from the great one almost wholly, for good — its front crawling out with the
  // ripple through the slowed moment, leaving the hide clear behind it. Through the glass, the other realm (inner.wgsl),
  // bent by the ripples as through water; the painted lines glow on over it; a soap film's colours run along the
  // ripples' slopes and the front's seam
  let ab = (in.uv - 0.5) * 2.0 * D.sim.x;
  let dHit = length(ab - D.front.xy);
  let veil = D.glass.x * (1.0 - smoothstep(D.front.z - D.front.w, D.front.z, dHit));
  if (veil > 0.001 && front) {
    let tilt = N - rockDir(vec3f(-1.0, 0.0, 0.0));
    let slope = length(tilt.yz);
    // (the hide's thickness wandering a little, bending the view through it smoothly)
    let wv = vec2f(dotNoise(vec3f(ab * 4.0, 0.3 + D.trip.y * 0.05)), dotNoise(vec3f(ab * 4.0 + 3.7, 1.9)));
    let rdIn = normalize(-V + tilt * D.glass.y * 6.0 + vec3f(0.0, wv.y, wv.x) * 0.025 * veil);
    let px = frame.fovY / frame.res.y;
    let realm = innerWorld(in.wpos, rdIn, D.trip.y, D.trip.x, px);
    let nv = sat(dot(N, V));
    let tr = clamp(veil * (0.95 + 0.6 * stretch) * (1.0 - 0.35 * paint) * (1.0 - 0.4 * pow(1.0 - nv, 4.0)), 0.0, 0.97);
    // (the thinner the hide, the less light it scatters back of its own; a breath of its warmth over the realm)
    let through = realm * mix(vec3f(1.0, 0.86, 0.72), vec3f(1.0), 0.6 + 0.35 * veil) + backlit * 0.2 * (1.0 - veil);
    col = mix(col * (1.0 - 0.55 * veil), through, tr);
    if (D.trip.w > 0.5) { col = realm; }
    let irid = thinFilm(nv, 320.0 + 2600.0 * slope + 900.0 * in.disp) * sat(slope * 18.0) * (0.35 + 0.65 * D.trip.x);
    col += irid * veil * (0.18 + 0.5 * stretch) * (0.6 + 0.4 * L.key.r);
  }
  // the front's seam: where the glass is spreading, a fine line of the film's colours
  if (D.glass.x > 0.001 && front) {
    let seam = exp(-pow((dHit - (D.front.z - D.front.w * 0.5)) / (D.front.w * 0.3), 2.0)) * D.glass.x * step(dHit, D.sim.x * 1.9);
    col += thinFilm(sat(dot(N, V)), 380.0 + 900.0 * dHit) * seam * 0.35;
  }
  return vec4f(col, 1.0);
}

// ---------------------------------------------------------------- the hide's down: fine hairs, in shells
// The hide is drawn again as FUZZ_SHELLS shells stepped out along its normal, each cut to the cross-sections of a
// field of fine hairs at its height (a hair a cell of a jittered grid on the hide, tapering, of its own length): up
// close, a down of separate hairs catching the light, their tips lit through; further off, where a hair's thinner than
// a pixel, each shell fades to its hairs' mean cover — a soft haze, a velvet edge. They sway on a slow breeze over
// the hide and whip aside as a ripple passes under them.
const FUZZ_SHELLS = 12u;
const FUZZ_CELL = 0.0026;
struct FuzzOut {
  @builtin(position) pos: vec4f,
  @location(0) wpos: vec3f,
  @location(1) uv: vec2f,
  @location(2) n: vec3f,
  @location(3) ab: vec2f,
  @location(4) @interpolate(flat) k: f32,
  @location(5) curv: f32,
};
@vertex fn vsFuzz(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> FuzzOut {
  var o: FuzzOut;
  let v = verts[vi];
  let lp = meshPos(v);
  let uv = meshUV(v);
  let g = D.sim2.w;
  let e = 1.5 / f32(N);
  let sc = 1.0 / (2.0 * e * 2.0 * D.sim.x);
  let h = hideH(uv);
  let hx = (hideH(uv + vec2f(e, 0.0)) - hideH(uv - vec2f(e, 0.0))) * sc;
  let hy = (hideH(uv + vec2f(0.0, e)) - hideH(uv - vec2f(0.0, e))) * sc;
  // (the hide's speed's slope: a ripple running under the hairs)
  let vel = textureLoad(simTex, clamp(vec2i(uv * f32(N)), vec2i(0), vec2i(i32(N) - 1)), 0);
  let vx = textureLoad(simTex, clamp(vec2i((uv + vec2f(e, 0.0)) * f32(N)), vec2i(0), vec2i(i32(N) - 1)), 0);
  let vy = textureLoad(simTex, clamp(vec2i((uv + vec2f(0.0, e)) * f32(N)), vec2i(0), vec2i(i32(N) - 1)), 0);
  let whip = vec2f((vx.x - vx.y) - (vel.x - vel.y), (vy.x - vy.y) - (vel.x - vel.y)) * g * 900.0;
  let k = (f32(ii) + 1.0) / f32(FUZZ_SHELLS);
  let n = normalize(vec3f(-1.0, hy, hx));
  // the breeze: a slow drift over the hide, curling
  let tb = D.glass.w;
  let p3 = vec3f(lp.xy * 3.0, tb * 0.15);
  let breeze = vec2f(vnoise(p3) - 0.5, vnoise(p3 + vec3f(5.2, 1.3, 7.7)) - 0.5) * 1.1 + vec2f(0.15, -0.35);
  let lean = (breeze + clamp(whip, vec2f(-3.0), vec2f(3.0))) * k * k * D.glass.z * 0.9;
  let C = D.center.xyz;
  // (out along the normal, toward her: -x, and over in the hide's plane by the lean; a little drooping)
  let wp = rock(C + vec3f(h, lp.y, lp.x) + n * (k * D.glass.z) + vec3f(0.0, lean.y - k * k * D.glass.z * 0.15, lean.x));
  o.wpos = wp;
  o.pos = frame.viewProj * vec4f(wp, 1.0);
  o.uv = uv;
  o.n = rockDir(n);
  o.ab = lp.xy;
  o.k = k;
  let lapv = hideH(uv + vec2f(e, 0.0)) + hideH(uv - vec2f(e, 0.0)) + hideH(uv + vec2f(0.0, e)) + hideH(uv - vec2f(0.0, e)) - 4.0 * h;
  o.curv = lapv / (D.sim.y * D.sim.y);
  return o;
}
@fragment fn fsFuzz(in: FuzzOut) -> @location(0) vec4f {
  // (everything that takes a derivative first, and one discard at the very end: an early one leaves Chrome's Metal
  // blots of black)
  let tuv = (in.uv - 0.5) * 0.985 + 0.5;
  var alb = pow(textureSample(hideTex, samp_linear, vec2f(tuv.x, 1.0 - tuv.y)).rgb, vec3f(2.2));
  let p = in.ab / FUZZ_CELL;
  let ic = floor(p);
  let r3 = hash33(vec3f(ic, 7.0));
  let c = ic + 0.5 + (r3.xy - 0.5) * 0.7;
  // (each hair its own length and thickness; some cells bare)
  let lenK = 0.35 + 0.65 * r3.z;
  let here = step(hash12(ic + 31.7), 0.8) * step(in.k, lenK);
  let rad = 0.2 * pow(max(1.0 - in.k / lenK, 0.0), 0.6) * (0.7 + 0.6 * hash12(ic + 3.1));
  let d = length(p - c);
  let fw = length(fwidth(p));
  let sharp = here * (1.0 - smoothstep(rad - fw * 0.5, rad + fw * 0.5, d));
  // (the shell's mean cover, where the hairs are finer than a pixel: π r² of a cell, the share present and this long)
  let kk = in.k;
  let meanR = 0.2 * pow(max(1.0 - kk, 0.0), 0.6);
  let mean = 3.14159 * meanR * meanR * 0.8 * (1.0 - kk) * 1.3;
  var a = mix(sharp, mean, smoothstep(0.35, 1.2, fw));
  // (none past the rim, where the hide laps over the shell)
  let rr = length(in.uv - 0.5) * 2.0;
  a *= 1.0 - smoothstep(0.96, 1.0, rr);
  let V = normalize(frame.camPos - in.wpos);
  var Nn = normalize(in.n);
  let L = stageLight(in.wpos, Nn);
  alb = mix(vec3f(luma(alb)) * vec3f(1.1, 0.95, 0.78), alb, 0.5);
  // (dark at the root, pale and lit through at the tip)
  let base = mix(alb * 0.55, alb * 1.25 + vec3f(0.07, 0.05, 0.03), kk);
  let wk = sat((dot(Nn, L.keyL) + 0.6) / 1.6);
  var col = base * (L.key * wk * 0.6 + L.drum * 0.12 + L.amb);
  // (a hair's sheen along it, and its tip lit through by what's behind and round it)
  let tip = kk * kk;
  col += (vec3f(1.0, 0.8, 0.6) * L.key * 0.12 + L.rim * 0.5) * pow(1.0 - sat(dot(Nn, V)), 2.0) * (0.3 + tip);
  let stretch = 1.0 - exp(-abs(in.curv) * 0.004);
  let thru = D.look.y * (0.3 + 0.25 * D.look.w) * (1.0 + 0.6 * stretch + 0.15 * G.drumCol.w);
  col += vec3f(1.0, 0.55, 0.22) * alb * thru * tip * 0.8;
  col += vec3f(0.35, 0.85, 0.8) * shockAt(in.wpos) * 0.3 * tip;
  // (the down thins with the hide as it turns to a veil)
  let abF = (in.uv - 0.5) * 2.0 * D.sim.x;
  a *= 1.0 - 0.8 * D.glass.x * (1.0 - smoothstep(D.front.z - D.front.w, D.front.z, length(abF - D.front.xy)));
  if (a < 0.002) { discard; }
  return vec4f(col, a * 0.85);
}

// ---------------------------------------------------------------- the drum's body and the dais
struct BodyOut {
  @builtin(position) pos: vec4f,
  @location(0) wpos: vec3f,
  @location(1) n: vec3f,
  @location(2) uv: vec2f,
  @location(3) col: vec4f,
  @location(4) @interpolate(flat) mat: u32,
};
@vertex fn vsBody(@builtin(vertex_index) vi: u32) -> BodyOut {
  var o: BodyOut;
  let v = verts[vi];
  var p = meshPos(v);
  let m = v.mat;
  // (the seed pods sway on their cords as the drum's struck: mat 4, about their hanging point in uv)
  if (m == 4u) {
    let a = 0.04 * sin(G.clock.y * 3.1 + v.u * 13.0) + 0.12 * G.drumCol.w * sin(G.clock.y * 9.0 + v.u * 7.0);
    let top = v.v;
    p.x += a * (top - p.y);
  }
  // (the drum and its stand rock with the strokes; the dais and the rock under it don't)
  let rocks = m != 5u && m != 7u;
  if (rocks) { p = rock(p); }
  o.wpos = p;
  o.pos = frame.viewProj * vec4f(p, 1.0);
  o.n = select(meshNormal(v), rockDir(meshNormal(v)), rocks);
  o.uv = meshUV(v);
  o.col = meshColor(v);
  o.mat = m;
  return o;
}
@vertex fn vsProp(@builtin(vertex_index) vi: u32) -> BodyOut {
  var o: BodyOut;
  let v = verts[vi];
  let p = (PM.model * vec4f(meshPos(v), 1.0)).xyz;
  o.wpos = p;
  o.pos = frame.viewProj * vec4f(p, 1.0);
  o.n = (PM.model * vec4f(meshNormal(v), 0.0)).xyz;
  o.uv = meshUV(v);
  o.col = meshColor(v);
  o.mat = v.mat;
  return o;
}
fn woodGrain(p: vec3f, s: f32) -> f32 { return 0.5 + 0.5 * sin(p.y * s + fbm(p * vec3f(3.0, 0.6, 3.0)) * 9.0); }
@fragment fn fsBody(in: BodyOut, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  var N = normalize(in.n);
  if (!ff) { N = -N; }
  let V = normalize(frame.camPos - in.wpos);
  let P = in.wpos;
  let L = stageLight(P, N);
  var base = in.col.rgb;
  var rough = 0.55; var spec = 0.04; var emit = vec3f(0.0);
  let m = in.mat;
  // (sampled out here: only uniform control flow may take derivatives)
  let rimC = textureSample(rimTex, samp_repeat, vec2f(in.uv.x * D.look.x, 1.0 - in.uv.y)).rgb;
  // (the footprints of a pixel in uv and in the world, for fading fine carving out before it shimmers)
  let fwu = fwidth(in.uv.y); let fwp = length(fwidth(P));
  if (m == 0u) {
    // the shell: the carved band (its texture round it), polished
    let t = rimC;
    base = pow(t, vec3f(2.2));
    let inlay = sat((base.b - base.r * 0.6) * 4.0);
    // (the wood itself old and dark, its red taken down toward a deep brown: carved hardwood, not lacquer)
    base = mix(base, vec3f(luma(base)) * vec3f(1.0, 0.72, 0.55), (1.0 - inlay) * 0.55) * mix(0.7, 1.0, inlay);
    let goldL = sat((base.r + base.g) * 0.5 - 0.4) * sat(1.0 - base.b * 3.0) * 3.0;
    rough = mix(0.32, 0.18, inlay); spec = mix(0.05, 0.12, inlay);
    // abalone inlays: thin film
    base = mix(base, base * thinFilm(sat(dot(N, V)), 380.0 + 300.0 * vnoise(P * 30.0)) * 1.6, inlay * 0.7);
    emit += (vec3f(0.2, 1.0, 0.85) * inlay * 0.08 + vec3f(1.0, 0.65, 0.2) * goldL * 0.15) * (1.0 + 2.0 * G.drumCol.w);
  } else if (m == 1u) {
    // the shell's inside and its edges: dark wood (lit warm from within as the hide thins to a veil and it's seen)
    base = in.col.rgb * (0.7 + 0.5 * woodGrain(P * 8.0, 30.0));
    rough = 0.45;
    emit += vec3f(1.0, 0.5, 0.2) * base * D.glass.x * 2.5 * (1.0 + 0.5 * G.drumCol.w);
  } else if (m == 2u) {
    // the root stand: polished living wood, grain along it, a line of glowing dots down it
    base = in.col.rgb * (0.65 + 0.6 * woodGrain(P * 3.0, 50.0));
    rough = 0.35; spec = 0.05;
    let dots = step(0.9, fract(in.uv.y * 40.0)) * step(abs(fract(in.uv.x * 2.0) - 0.5), 0.06);
    emit += vec3f(0.2, 1.0, 0.8) * dots * 0.5;
  } else if (m == 3u) {
    // cords: braided fibre
    base = in.col.rgb * (0.7 + 0.5 * sin(in.uv.y * 600.0 + in.uv.x * 12.0));
    rough = 0.9;
  } else if (m == 4u) {
    // seed pods: dark polished husk, holes glowing
    let hole = step(0.82, vnoise(P * 160.0));
    base = in.col.rgb * (0.7 + 0.4 * vnoise(P * 60.0));
    rough = 0.3; spec = 0.06;
    emit += vec3f(1.0, 0.6, 0.2) * hole * (0.4 + 1.5 * G.drumCol.w);
  } else if (m == 5u) {
    // the dais: dark stone, glowing rings and glyphs inlaid
    let r = length(P.xz - vec2f(-0.3, 0.2));
    let a = atan2(P.z - 0.2, P.x + 0.3);
    base = in.col.rgb * (0.6 + 0.6 * fbm(P * 4.0));
    rough = 0.7;
    var g = 0.0;
    for (var k = 0; k < 3; k++) {
      let rk = 1.1 + f32(k) * 0.55;
      g = max(g, 1.0 - smoothstep(0.004, 0.012, abs(r - rk)));
    }
    let tick = step(0.94, fract(a * 24.0 / TAU)) * step(abs(r - 1.92), 0.1);
    g = max(g, tick);
    let top = step(0.5, N.y);
    // (a ring of the light runs out from the drum with each stroke)
    let wave = exp(-pow((r - G.shock2.w * 6.0) * 3.0, 2.0)) * G.shock2.w;
    emit += mix(vec3f(0.2, 1.0, 0.85), vec3f(1.0, 0.6, 0.2), 0.5 + 0.5 * sin(a * 3.0 + G.clock.y * 0.3)) * g * top * (0.5 + 1.5 * G.drumCol.w + 3.0 * wave);
  } else if (m == 6u) {
    // the hide's lapped edge and the lacing loops: the hide, darker
    base = vec3f(0.5, 0.3, 0.12);
    rough = 0.6;
  } else if (m == 8u) {
    // the beater's shaft: dark carved wood, a spiral groove with a thread of gold in it
    // (each faded to its mean as it nears a pixel's size: the spiral and the grain never moiré)
    let g = fract(in.uv.y * 30.0 + in.uv.x);
    let gw = max(0.06, fwu * 30.0 * 1.2);
    let gk = 0.06 / gw * (1.0 - smoothstep(0.25, 0.6, fwu * 30.0));
    let grainK = 1.0 - smoothstep(0.004, 0.012, fwp * 20.0);
    base = in.col.rgb * (0.7 + 0.4 * mix(0.5, woodGrain(P * 20.0, 60.0), grainK));
    rough = 0.35; spec = 0.05;
    emit += vec3f(1.0, 0.6, 0.15) * (1.0 - smoothstep(0.0, gw, abs(g - 0.5))) * gk * 0.25 * (1.0 + 3.0 * G.drumCol.w);
  } else if (m == 9u) {
    // the beater's head: soft leather over felt
    base = in.col.rgb * (0.75 + 0.4 * fbm(P * 40.0));
    rough = 0.75; spec = 0.03;
  } else if (m == 7u) {
    // the dais's roots and the rock under it, fading into the dark
    base = in.col.rgb * (0.5 + 0.5 * fbm(P * 2.0));
    rough = 0.9;
    emit += vec3f(0.2, 0.9, 0.8) * step(0.86, fbm(P * 6.0)) * 0.3;
  }
  let nk = dot(N, L.keyL);
  let nd = dot(N, L.drumL);
  var col = base * (L.key * sat(nk) + L.drum * sat(nd) + L.amb);
  col += vec3f(1.0) * (ggx(N, V, L.keyL, rough) * L.key + ggx(N, V, L.drumL, rough) * L.drum) * spec * 8.0;
  col += L.rim * pow(1.0 - sat(dot(N, V)), 3.0) * 0.6;
  col += emit;
  col += vec3f(0.35, 0.85, 0.8) * shockAt(P) * 0.3;
  return vec4f(col, 1.0);
}
