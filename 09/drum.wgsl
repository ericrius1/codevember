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
  // the hide's frame: xyz its centre, w unused
  center: vec4f,
  // x the rim texture's repeats round the shell, y the hide's glow, z the time (s), w the inner light's flicker
  look: vec4f,
}
@group(2) @binding(0) var<uniform> D: DrumU;
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
@vertex fn vsHide(@builtin(vertex_index) vi: u32) -> HideOut {
  var o: HideOut;
  let v = verts[vi];
  let lp = meshPos(v);            // (a, b) on the hide in its frame, at rest
  let uv = meshUV(v);
  let g = D.sim2.w;
  let e = 1.5 / f32(N);
  let h = simAt(uv) * g;
  let hx = (simAt(uv + vec2f(e, 0.0)) - simAt(uv - vec2f(e, 0.0))) * g / (2.0 * e * 2.0 * D.sim.x);
  let hy = (simAt(uv + vec2f(0.0, e)) - simAt(uv - vec2f(0.0, e))) * g / (2.0 * e * 2.0 * D.sim.x);
  let lapv = simAt(uv + vec2f(e, 0.0)) + simAt(uv - vec2f(e, 0.0)) + simAt(uv + vec2f(0.0, e)) + simAt(uv - vec2f(0.0, e)) - 4.0 * simAt(uv);
  // the hide's frame: its normal toward the player (-x), a across (+z), b up (+y); displaced into the drum by h
  let C = D.center.xyz;
  let wp = C + vec3f(h, lp.y, lp.x);
  o.wpos = wp;
  o.pos = frame.viewProj * vec4f(wp, 1.0);
  o.uv = uv;
  // (the surface x = h(z, y): its normal toward -x)
  o.n = normalize(vec3f(-1.0, hy, hx));
  o.disp = h;
  o.curv = lapv * g / (D.sim.y * D.sim.y);
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
  // (its painted lines: turquoise and gold against the amber — they glow)
  let sat_ = max(alb.r, max(alb.g, alb.b)) - min(alb.r, min(alb.g, alb.b));
  let teal = sat(alb.g + alb.b * 0.6 - alb.r * 1.2) * 2.5;
  let gold = sat((alb.r + alb.g) * 0.5 - 0.42) * 3.0 * sat(1.0 - alb.b * 4.0);
  let paint = sat(teal + gold * 0.6);
  // light through the hide from inside the drum: warm, brighter where it's stretched thin (the ripples' crests and
  // troughs), the veins darker in it
  let stretch = 1.0 - exp(-abs(in.curv) * 0.004);
  let thru = D.look.y * (0.3 + 0.25 * D.look.w) * (1.0 + 0.6 * stretch + 0.35 * G.drumCol.w);
  let r = length(in.uv - 0.5) * 2.0;
  let backlit = vec3f(1.0, 0.48, 0.16) * alb * thru * (1.0 - 0.35 * r * r);
  var col: vec3f;
  if (front) {
    let diff = sat(dot(N, L.keyL)) * L.key + sat(dot(N, L.drumL)) * L.drum * 0.2 + L.amb;
    col = alb * diff * 0.45 + backlit;
    col += vec3f(1.0) * ggx(N, V, L.keyL, 0.45) * L.key * 0.25;
    col += L.rim * pow(1.0 - sat(dot(N, V)), 4.0) * 0.4;
    // the painted lines glow, more as the hide's struck and as it's stretched
    col += mix(vec3f(0.2, 1.0, 0.85), vec3f(1.0, 0.7, 0.2), gold / max(paint, 1e-3)) * paint * (0.22 + 0.7 * stretch + 0.4 * G.drumCol.w) * D.look.y;
  } else {
    col = backlit * 0.6 + alb * L.amb * 0.3;
  }
  // (the ripples catch the light: a sheen along their slopes)
  col += vec3f(1.0, 0.8, 0.5) * stretch * 0.3 * D.look.y;
  col += vec3f(0.35, 0.85, 0.8) * shockAt(in.wpos) * 0.3;
  return vec4f(col, 1.0);
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
  o.wpos = p;
  o.pos = frame.viewProj * vec4f(p, 1.0);
  o.n = meshNormal(v);
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
  if (m == 0u) {
    // the shell: the carved band (its texture round it), polished
    let t = rimC;
    base = pow(t, vec3f(2.2));
    let inlay = sat((base.b - base.r * 0.6) * 4.0);
    let goldL = sat((base.r + base.g) * 0.5 - 0.4) * sat(1.0 - base.b * 3.0) * 3.0;
    rough = mix(0.32, 0.18, inlay); spec = mix(0.05, 0.12, inlay);
    // abalone inlays: thin film
    base = mix(base, base * thinFilm(sat(dot(N, V)), 380.0 + 300.0 * vnoise(P * 30.0)) * 1.6, inlay * 0.7);
    emit += (vec3f(0.2, 1.0, 0.85) * inlay * 0.08 + vec3f(1.0, 0.65, 0.2) * goldL * 0.15) * (1.0 + 2.0 * G.drumCol.w);
  } else if (m == 1u) {
    // the shell's inside and its edges: dark wood
    base = in.col.rgb * (0.7 + 0.5 * woodGrain(P * 8.0, 30.0));
    rough = 0.45;
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
    let g = fract(in.uv.y * 30.0 + in.uv.x);
    base = in.col.rgb * (0.7 + 0.4 * woodGrain(P * 20.0, 60.0));
    rough = 0.35; spec = 0.05;
    emit += vec3f(1.0, 0.6, 0.15) * (1.0 - smoothstep(0.0, 0.06, abs(g - 0.5))) * 0.25 * (1.0 + 3.0 * G.drumCol.w);
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
