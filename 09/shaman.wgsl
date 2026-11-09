// The shaman: Boulder's DNC1 mesh (built by its town pipeline from 09/character/shaman.py), dual-quaternion skinned
// as Boulder's hero.wgsl skins it (the same vertex stream, the same bones, the skirt kept outside the legs), shaded for
// this stage: indigo-violet skin with a faint iridescent sheen and glowing sacred-geometry lines (they pulse with the
// strokes, and the great one's light runs up her arm), a drawn face with gold eyes, a woven bark tunic embroidered in
// gold, a fibre skirt with gold tiers, a plum sash, dark locks.
#include "./common"
#include "weft/skin"

struct ShamanU {
  pal: array<vec4f, 16>,
  qmin: vec4f,              // the quantisation box (bind space); w the nose tip's height
  qmax: vec4f,
  eye: vec4f,               // the eyes: x half spacing, y height, z depth, w radius (bind space)
  face: vec4f,              // x brow height, y mouth height, z lip half width, w nose tip depth
  face2: vec4f,             // x blink, y smile, z, w
  face3: vec4f,             // the gaze: x, y in the head's axes
  arms: array<vec4f, 4>,    // bind space: the left elbow, the left wrist, the right elbow, the right wrist (w: the hand's length)
  legs: array<vec4f, 8>,    // world: the thighs and shins as tapered capsules (a, b; radius in w)
  look: vec4f,              // x the lines' brightness, y the iridescence, z the arm light's reach (0..1 hand→heart), w
}
@group(2) @binding(0) var<storage, read> DQ: array<vec4f>;
@group(2) @binding(1) var<uniform> SU: ShamanU;

struct VIn {
  @location(0) pm: vec4u,
  @location(1) nrm: vec4f,
  @location(2) flow: vec4f,
  @location(3) bones: vec4u,
  @location(4) weights: vec4f,
};
struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) wpos: vec3f,
  @location(1) nrm: vec3f,
  @location(2) local: vec3f,
  @location(3) @interpolate(flat) mat: u32,
  @location(4) flow: vec3f,
  @location(5) bake: vec4f,
};

// ---------------------------------------------------------------- skinning (weft/skin: Boulder's hero.wgsl's)
fn skinPos(v: VIn, q: SkinDQ, lp: vec3f) -> vec3f {
  // (the eyes, material 8, rigid: linear, no dual-quaternion bulge)
  if ((v.pm.w & 0xffu) == 8u) { return skinLinear(v.bones, v.weights, lp); }
  return skinPoint(q, v.bones, v.weights, lp);
}
fn bindPos(v: VIn) -> vec3f { return SU.qmin.xyz + vec3f(v.pm.xyz) / 65535.0 * (SU.qmax.xyz - SU.qmin.xyz); }
/** the skirt kept outside her legs (hero.wgsl's clearLegs: the tunic's 1 and the skirt's 2 here) */
fn clearLegs(v: VIn, p: vec3f, lp: vec3f) -> vec3f {
  let m = v.pm.w & 0xffu;
  if (SU.legs[0].w <= 0.0 || (m != 2u && m != 1u) || lp.y > 0.95 || lp.y < 0.12) { return p; }
  var q = p;
  for (var i = 0u; i < 4u; i++) {
    let a = SU.legs[i * 2u]; let b = SU.legs[i * 2u + 1u];
    let ab = b.xyz - a.xyz;
    let u = clamp(dot(q - a.xyz, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0);
    let c = a.xyz + ab * u;
    let d = q - c; let l = length(d); let r = mix(a.w, b.w, u);
    if (l < r && l > 1e-5) { q = c + d * (r / l); }
  }
  return q;
}

@vertex fn vs(v: VIn) -> VOut {
  var o: VOut;
  let Q = skinBlend(v.bones, v.weights);
  let lp = bindPos(v);
  let wp = clearLegs(v, skinPos(v, Q, lp), lp);
  o.pos = frame.viewProj * vec4f(wp, 1.0);
  o.wpos = wp;
  o.nrm = normalize(skinDir(Q, v.bones, v.weights, v.nrm.xyz) + vec3f(0.0, 1e-6, 0.0));
  o.local = lp;
  o.mat = v.pm.w & 0xffu;
  o.flow = skinDir(Q, v.bones, v.weights, v.flow.xyz);
  o.bake = vec4f(v.nrm.w, v.flow.w, v.flow.x, v.flow.y);
  return o;
}

// ---------------------------------------------------------------- her lines (sacred geometry, glowing)
fn lineAA(d: f32, w: f32, px: f32) -> f32 { return 1.0 - smoothstep(w - px, w + px, abs(d)); }
/** a point's place along a limb from a to b: (0..1 along, angle round it, distance from its axis) */
fn limb(p: vec3f, a: vec3f, b: vec3f) -> vec3f {
  let ab = b - a; let L = length(ab); let ax = ab / max(L, 1e-5);
  let t = dot(p - a, ax);
  let r = p - a - ax * t;
  var e1 = normalize(cross(ax, vec3f(0.0, 0.0, 1.0)));
  let e2 = cross(ax, e1);
  return vec3f(t / L, atan2(dot(r, e2), dot(r, e1)), length(r));
}
/** the forearm's and the hand's lines: bands at the wrist, a lattice of diamonds between, an eye on the back of the hand */
fn armLines(p: vec3f, side: f32, px: f32) -> f32 {
  let i = select(2u, 0u, side > 0.0);
  let el = SU.arms[i].xyz; let wr = SU.arms[i + 1u].xyz; let hl = SU.arms[i + 1u].w;
  let f = limb(p, el, wr);
  let flen = length(wr - el);
  var g = 0.0;
  if (f.x > 0.25 && f.x < 1.02) {
    // the bands near the wrist
    let tw = (1.0 - f.x) * flen;
    g = max(g, lineAA(tw - 0.012, 0.0007, px)); g = max(g, lineAA(tw - 0.022, 0.0005, px));
    // the diamond lattice between (a helix each way round the forearm)
    let u = f.y / TAU; let s = f.x * flen / 0.035;
    let d1 = fract(s + u * 3.0) - 0.5; let d2 = fract(s - u * 3.0) - 0.5;
    let lat = max(lineAA(d1, 0.035, px * 30.0), lineAA(d2, 0.035, px * 30.0)) * smoothstep(0.3, 0.45, f.x) * (1.0 - smoothstep(0.82, 0.88, f.x));
    g = max(g, lat * 0.85);
    // a line down the inside of the forearm
    g = max(g, lineAA(sin(f.y), 0.035, px * 20.0) * smoothstep(0.3, 0.5, f.x) * 0.9);
  }
  // the hand: an eye on its back, rings at the knuckles
  let h = limb(p, wr, wr + normalize(wr - el) * hl);
  if (h.x > 0.0 && h.x < 0.8) {
    let back = cos(h.y);
    let q = vec2f(h.x * hl - 0.04, sin(h.y) * 0.03);
    let rr = length(q);
    g = max(g, lineAA(rr - 0.012, 0.0009, px) * smoothstep(0.2, 0.6, back));
  }
  return g;
}
fn faceLines(p: vec3f, px: f32) -> f32 {
  let E = SU.eye; let F = SU.face;
  if (p.y < F.y - 0.06 || p.z < 0.0) { return 0.0; }
  var g = 0.0;
  let u = atan2(p.x, p.z) * 0.1; let v = p.y;
  // the line down the middle: forehead to the bridge of the nose, and the chin
  let mid = lineAA(u, 0.0008, px);
  g = max(g, mid * smoothstep(F.x + 0.004, F.x + 0.012, v) * (1.0 - smoothstep(F.x + 0.06, F.x + 0.07, v)));
  g = max(g, mid * (1.0 - smoothstep(F.y - 0.012, F.y - 0.008, v)) * smoothstep(F.y - 0.06, F.y - 0.05, v));
  // the third eye
  let te = vec2f(u, (v - F.x - 0.03) * 0.11);
  let ter = length(te * vec2f(1.0, 9.0));
  g = max(g, lineAA(ter - 0.0035, 0.0008, px));
  g = max(g, 1.0 - smoothstep(0.0011, 0.0016, ter));
  // three dots under each eye, an arc from its outer corner back toward the ear
  let ue = atan2(E.x, E.z + E.w) * 0.1;
  let au = abs(u) - ue;
  for (var k = 0; k < 3; k++) {
    let c = vec2f(-0.0012 + f32(k) * 0.0016, E.y - 0.021 - f32(k) * 0.002);
    g = max(g, 1.0 - smoothstep(0.0005, 0.0009, length(vec2f(au, v) - c)));
  }
  let arc = (v - E.y + 0.004) - 12.0 * (au - 0.004) * (au - 0.004);
  g = max(g, lineAA(arc, 0.001, px) * smoothstep(0.0025, 0.004, au) * (1.0 - smoothstep(0.011, 0.014, au)));
  // a swirl on each cheek, from under the eye's outer corner curling in toward the nose
  let sc = vec2f(au - 0.0045, v - (E.y - 0.032));
  let sr = length(sc * vec2f(1.0, 0.9));
  let sa = atan2(sc.y, sc.x * sign(u + 1e-6));
  let spiral = abs(fract((sr * 900.0 - sa / TAU) ) - 0.5) / 900.0;
  g = max(g, lineAA(spiral, 0.0004, px) * (1.0 - smoothstep(0.004, 0.0055, sr)) * smoothstep(0.0006, 0.001, sr));
  return g;
}

// ---------------------------------------------------------------- the face (her eyes, drawn)
fn drawEyes(p: vec3f, px: f32) -> vec4f {
  let E = SU.eye;
  if (p.z < 0.0 || abs(p.y - E.y) > 0.03) { return vec4f(0.0); }
  let u = atan2(p.x, p.z) * 0.1; let v = p.y - E.y;
  let ue = atan2(E.x, E.z + E.w) * 0.1;
  let side = select(-1.0, 1.0, u > 0.0);
  let x = (u - side * ue) * side * 1.0 / 1.04;
  let y = v / 1.04;
  let blink = sat(SU.face2.x);
  let xi = -0.0185; let xo = 0.0205;
  let inX = smoothstep(xi, xi + 0.0008, x) * (1.0 - smoothstep(xo - 0.0008, xo, x));
  // (almond lids: the upper arched high, the lower shallow; shut by a blink)
  let s = (x - xi) / (xo - xi);
  // (heavy-lidded: the upper lid low over the iris, serene, inward)
  let top = mix(0.0074 * sin(PI * pow(s, 0.85)) + 0.0004, -0.002, blink);
  let bot = mix(-0.0085 * sin(PI * pow(s, 1.1)), -0.0022, blink);
  let open = inX * smoothstep(-px, px, top - y) * smoothstep(-px, px, y - bot);
  var c = vec3f(0.85, 0.78, 0.7);
  let ic = vec2f(0.0005 + SU.face3.x * 0.009 * side, 0.0012 + SU.face3.y * 0.006);
  let rq = length((vec2f(x, y) - ic) / vec2f(0.0092, 0.0098));
  // gold irises, lit from within
  let iris = 1.0 - smoothstep(1.0 - px / 0.009, 1.0 + px / 0.009, rq);
  let ir = mix(vec3f(1.5, 0.95, 0.22), vec3f(0.55, 0.25, 0.04), smoothstep(0.2, 1.0, rq));
  c = mix(c, ir, iris);
  c = mix(c, vec3f(0.02, 0.01, 0.03), 1.0 - smoothstep(0.32, 0.36, rq));
  c = mix(c, vec3f(2.0), 1.0 - smoothstep(0.0011, 0.0016, length(vec2f(x, y) - ic - vec2f(-0.0028 * side, 0.0035))));
  // the lids' dark line, a flick out at the corner
  let lid = lineAA(y - top, 0.0015, px) * inX;
  // (the lid's own shadow over the iris's top)
  c *= 1.0 - 0.55 * inX * (1.0 - smoothstep(0.0, 0.004, top - y)) * step(y, top);
  let flick = lineAA(y - (0.0012 + (x - xo) * 0.5), 0.0007, px) * smoothstep(xo - 0.002, xo, x) * (1.0 - smoothstep(xo + 0.005, xo + 0.006, x));
  let lines = max(lid, flick);
  c = mix(c, vec3f(0.015, 0.008, 0.03), lines);
  // the brow: a dark arc
  let br = (y - 0.022) + 18.0 * (x - 0.002) * (x - 0.002);
  let brow = lineAA(br, mix(0.0018, 0.0007, sat((x + 0.016) / 0.036)), px) * smoothstep(-0.018, -0.015, x) * (1.0 - smoothstep(0.02, 0.022, x));
  c = mix(c, vec3f(0.02, 0.012, 0.03), brow);
  return vec4f(c, max(open, max(lines, brow)));
}

// ---------------------------------------------------------------- cloth
fn weave(p: vec3f, s: f32) -> f32 { return sin(p.x * s + p.z * s * 0.3) * sin(p.y * s * 1.03) * 0.5 + 0.5; }
/** the tunic's gold embroidery: a panel down the front (eyes stacked in diamonds), a band at the hem, an all-over lattice */
fn tunicGold(p: vec3f, px: f32) -> f32 {
  var g = 0.0;
  let front = smoothstep(0.0, 0.03, p.z);
  // the front panel
  let ax = abs(p.x);
  g = max(g, lineAA(ax - 0.05, 0.0012, px) * front * step(1.0, p.y));
  let cy = fract(p.y / 0.09) - 0.5;
  let dia = abs(p.x) / 0.04 + abs(cy) * 0.09 / 0.045;
  g = max(g, lineAA(dia - 1.0, 0.03, px * 25.0) * front * step(ax, 0.05) * step(1.0, p.y));
  let eye = length(vec2f(p.x, cy * 0.09));
  g = max(g, lineAA(eye - 0.008, 0.001, px) * front * step(ax, 0.05) * step(1.0, p.y));
  // the all-over lattice, faint
  let l1 = fract((p.y + atan2(p.x, p.z) * 0.06) / 0.05) - 0.5; let l2 = fract((p.y - atan2(p.x, p.z) * 0.06) / 0.05) - 0.5;
  g = max(g, max(lineAA(l1, 0.012, px * 20.0), lineAA(l2, 0.012, px * 20.0)) * 0.22);
  return g;
}
fn skirtGold(p: vec3f, px: f32) -> f32 {
  // tiers: a band of zigzag every so far down, the hem's band
  let t = (1.0 - p.y) / 0.19;
  let ft = fract(t);
  let a = atan2(p.x, p.z);
  let zig = abs(fract(a * 7.0 / PI) - 0.5) * 0.18;
  var g = lineAA((ft - 0.9 + zig) * 0.19, 0.0009, px);
  g = max(g, lineAA((ft - 0.95) * 0.19, 0.0006, px));
  g = max(g, lineAA(p.y - 0.09, 0.0025, px));
  return g * step(0.06, p.y);
}

@fragment fn fs(in: VOut, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  var N = normalize(in.nrm);
  if (!ff) { N = -N; }
  let V = normalize(frame.camPos - in.wpos);
  let P = in.wpos;
  let lp = in.local;
  let L = stageLight(P, N);
  let m = in.mat;
  let px = length(fwidth(lp)) * 0.7;
  let ao = mix(1.0, in.bake.x, 0.7);
  var base = SU.pal[m].rgb;
  var rough = 0.6; var spec = 0.04; var sheen = 0.0; var emit = vec3f(0.0); var wrap = 0.0; var rimK = 1.9;
  let pulse = G.glow.x;
  let skin = m == 0u || m == 6u || m == 11u;
  if (skin) {
    base = SU.pal[0].rgb;
    // a faint iridescent sheen over the violet (a living film)
    let nv = sat(dot(N, V));
    base = mix(base, base * (0.6 + 0.8 * thinFilm(nv, 420.0 + 120.0 * sin(lp.y * 9.0))), SU.look.y * 0.35);
    rough = 0.42; spec = 0.035; wrap = 0.45;
    // her lines
    var g = faceLines(lp, px);
    if (abs(lp.x) > 0.12 && lp.y > 0.8) { g = max(g, armLines(lp, sign(lp.x), px)); }
    // (the feet: bands round the ankles, a line down each foot)
    if (lp.y < 0.12) {
      let fx = abs(lp.x) - 0.1;
      g = max(g, lineAA(lp.y - 0.085, 0.0012, px));
      g = max(g, lineAA(fx, 0.0012, px) * step(lp.z, 0.16) * step(0.02, lp.y) * step(0.02, lp.z));
    }
    // (the right arm carries the great stroke's light up from the hand: a band of it running toward the heart)
    var run = 0.0;
    if (lp.x < -0.12) {
      let f = limb(lp, SU.arms[2].xyz, SU.arms[3].xyz);
      run = exp(-pow((f.x - (1.0 - SU.look.z)) / 0.12, 2.0)) * step(0.001, SU.look.z) * step(SU.look.z, 0.999);
    }
    // (gold, a little teal running through it: never the white the two make half and half)
    let lineCol = mix(vec3f(1.0, 0.6, 0.15), vec3f(0.25, 1.0, 0.9), 0.15 + 0.15 * sin(lp.y * 14.0 + G.clock.y * 1.3));
    emit += lineCol * g * (SU.look.x * (0.4 + 0.9 * pulse) + run * 6.0);
    base = mix(base, vec3f(0.55, 0.38, 0.12), g * 0.75);
    // the eyes
    let e = drawEyes(lp, px);
    base = mix(base, e.rgb * 0.5, e.a);
    emit += e.rgb * e.a * step(1.2, e.r) * 0.3;
    // (the lips, darker)
    let lipZone = (1.0 - smoothstep(0.004, 0.008, abs(lp.y - SU.face.y))) * (1.0 - smoothstep(SU.face.z * 0.8, SU.face.z, abs(lp.x))) * step(0.0, lp.z) * step(SU.face.w - 0.03, lp.z);
    base = mix(base, base * vec3f(0.55, 0.35, 0.6), lipZone);
  } else if (m == 1u) {
    // the tunic: woven bark fibre, gold embroidery
    let w = weave(lp * vec3f(1.0, 1.0, 1.0), 900.0);
    base = base * 0.55 * (0.75 + 0.5 * w) * (0.85 + 0.3 * vnoise(lp * 40.0));
    let gold = tunicGold(lp, px);
    base = mix(base, vec3f(0.36, 0.22, 0.05), gold);
    rough = mix(0.85, 0.35, gold); spec = mix(0.03, 0.35, gold); sheen = 0.3; rimK = 1.1;
    emit += vec3f(1.0, 0.6, 0.15) * gold * 0.05 * (1.0 + pulse);
  } else if (m == 5u) {
    // gold bands (the collar, the cuffs, the hem)
    let w = weave(lp, 1400.0);
    base = vec3f(0.5, 0.32, 0.09) * (0.7 + 0.5 * w);
    rough = 0.55; spec = 0.08;
  } else if (m == 2u) {
    // the skirt: dark green fibre hanging in strands, gold tiers
    let a = atan2(lp.x, lp.z);
    let strand = 0.5 + 0.5 * sin(a * 260.0 + vnoise(lp * vec3f(30.0, 4.0, 30.0)) * 6.0);
    base = vec3f(0.028, 0.05, 0.03) * (0.6 + 0.6 * strand) * (0.8 + 0.4 * vnoise(lp * vec3f(8.0, 40.0, 8.0)));
    let gold = skirtGold(lp, px);
    base = mix(base, vec3f(0.36, 0.22, 0.05), gold);
    rough = mix(0.8, 0.35, gold); spec = mix(0.03, 0.35, gold); sheen = 0.1; rimK = 0.45;
  } else if (m == 7u) {
    // the sash: plum, a gold lattice
    let a = atan2(lp.x, lp.z);
    let l1 = fract((lp.y * 30.0 + a * 4.0)) - 0.5; let l2 = fract((lp.y * 30.0 - a * 4.0)) - 0.5;
    let gold = max(lineAA(l1, 0.06, px * 30.0), lineAA(l2, 0.06, px * 30.0)) * 0.7;
    base = mix(vec3f(0.15, 0.03, 0.11) * (0.8 + 0.4 * weave(lp, 1100.0)), vec3f(0.6, 0.4, 0.1), gold);
    rough = 0.6; spec = 0.05; sheen = 0.5;
  } else if (m == 3u || m == 10u) {
    // the locks: near-black with a blue sheen along the strand, glass beads here and there
    let T = normalize(in.flow + vec3f(0.0, 1e-5, 0.0));
    let H = normalize(L.keyL + V);
    let th = dot(T, H);
    // (strands: the hair's grain along its flow — fine dark partings between twisted locks, so the cap reads as hair,
    // not as a shell)
    let q = lp - T * dot(lp, T);
    let grain = vnoise(q * 420.0) * 0.6 + vnoise(q * 1300.0) * 0.4;
    let part = smoothstep(0.25, 0.5, vnoise(q * 140.0 + 3.1));
    base *= (0.45 + 0.75 * grain) * (0.55 + 0.45 * part);
    let kk = pow(sqrt(max(0.0, 1.0 - th * th)), 80.0) * (0.4 + 0.9 * grain);
    emit += vec3f(0.35, 0.4, 0.6) * kk * L.key * 0.12;
    rimK = 0.6;
    // (the beads are on the locks themselves now: regalia.ts's strands)
    rough = 0.62; spec = 0.015;
  }
  // light
  let nk = dot(N, L.keyL);
  let diffK = sat((nk + wrap) / (1.0 + wrap)) * mix(1.0, sat(nk * 2.0 + 0.5), 0.0);
  let nd = dot(N, L.drumL);
  let diffD = sat((nd + wrap) / (1.0 + wrap));
  // (skin: the light through it, red-violet at the terminator)
  var sss = vec3f(0.0);
  if (skin) { sss = vec3f(0.5, 0.15, 0.4) * (sat(nk + 0.4) - sat(nk)) * 0.6 * L.key + vec3f(0.6, 0.2, 0.25) * (sat(nd + 0.4) - sat(nd)) * L.drum * 0.5; }
  var col = base * (L.key * diffK + L.drum * diffD + L.amb * ao) + base * sss;
  // the cosmos's rim
  let fr = pow(1.0 - sat(dot(N, V)), 3.0);
  col += L.rim * pow(1.0 - sat(dot(N, V)), 4.0) * ao * (0.5 + sheen) * rimK;
  col += vec3f(1.0) * (ggx(N, V, L.keyL, rough) * L.key + ggx(N, V, L.drumL, rough) * L.drum) * (spec * 6.0);
  // (cloth's sheen at grazing angles)
  col += base * sheen * fr * (L.key + L.drum) * 0.8;
  col += emit;
  // the shock passing through her
  col += vec3f(0.35, 0.85, 0.8) * shockAt(P) * 0.3;
  return vec4f(col, 1.0);
}

@vertex fn vsDepth(v: VIn) -> @builtin(position) vec4f {
  let Q = skinBlend(v.bones, v.weights); let lp = bindPos(v);
  return frame.viewProj * vec4f(clearLegs(v, skinPos(v, Q, lp), lp), 1.0);
}
