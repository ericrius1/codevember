// Her headdress (ornaments.ts): the diadem's filigree, its seed-stone, its gold — weft's MeshBuilder vertices in her
// head's bind space, carried by that one bone. (Material 1, hammered gold inlaid with beetle wing, was a crescent
// nimbus's; it's kept for an ornament that wants it.)
#include "./common"
#include "weft/mesh"

struct OrnU {
  // x story time, y the strokes' flash (0..1), z her lines' pulse, w the great stroke's afterglow (0..1)
  look: vec4f,
  // x the head's bone
  bone: vec4u,
}
@group(2) @binding(0) var<uniform> O: OrnU;
@group(2) @binding(1) var<storage, read> DQ: array<vec4f>;
@group(2) @binding(2) var<storage, read> verts: array<MeshVertex>;
#include "weft/skin"

struct OrnOut {
  @builtin(position) pos: vec4f,
  @location(0) wpos: vec3f,
  @location(1) n: vec3f,
  @location(2) uv: vec2f,
  @location(3) bpos: vec3f,
  @location(4) @interpolate(flat) mat: u32,
};
@vertex fn vsOrn(@builtin(vertex_index) vi: u32) -> OrnOut {
  var o: OrnOut;
  let v = verts[vi];
  let q = skinBlend(vec4u(O.bone.x, 0u, 0u, 0u), vec4f(1.0, 0.0, 0.0, 0.0));
  let bp = meshPos(v);
  let p = dqPoint(q, bp);
  o.wpos = p;
  o.pos = frame.viewProj * vec4f(p, 1.0);
  o.n = normalize(dqDir(q, meshNormal(v)));
  o.uv = meshUV(v);
  o.bpos = bp;
  o.mat = v.mat;
  return o;
}

// a cell pattern (the hammer's dimples, the inlay's leading): the distance to the nearest and second-nearest points
fn cells(p: vec2f) -> vec3f {
  let i = floor(p); let f = fract(p);
  var d1 = 9.0; var d2 = 9.0; var id = 0.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      let g = vec2f(f32(x), f32(y));
      let h = hash12(i + g);
      let o = vec2f(h, hash12(i + g + 17.3));
      let d = length(g + o - f);
      if (d < d1) { d2 = d1; d1 = d; id = h; } else if (d < d2) { d2 = d; }
    }
  }
  return vec3f(d1, d2, id);
}

fn gold(N: vec3f, V: vec3f, L: StageLight, rough: f32) -> vec3f {
  let base = vec3f(0.6, 0.37, 0.1);
  let nv = max(dot(N, V), 0.0);
  let F = mix(base, vec3f(0.95, 0.72, 0.35), pow(1.0 - nv, 5.0));
  let spec = ggx(N, V, L.keyL, rough) * L.key + ggx(N, V, L.drumL, rough) * L.drum * 1.2;
  let diff = base * 0.3 * (L.key * sat(dot(N, L.keyL)) + L.drum * sat(dot(N, L.drumL)) + L.amb);
  // (the sky's shimmer in it, faint: a metal shows what's round it)
  let env = F * (L.rim * (0.5 + 0.5 * N.y) * 0.22 + L.amb * 0.25);
  return diff + F * spec * 1.5 + env;
}

@fragment fn fsOrn(in: OrnOut, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  var N = normalize(in.n);
  if (!ff) { N = -N; }
  let V = normalize(frame.camPos - in.wpos);
  let L = stageLight(in.wpos, N);
  let nv = abs(dot(N, V));
  var col = vec3f(0.0);
  let flash = O.look.y;
  if (in.mat == 0u) {
    // hammered gold: its dimples tip the normal
    let c = cells(in.bpos.xy * 260.0 + in.bpos.z * 90.0);
    // (soft dimples, a broad sheen over them: hammered metal glows, it doesn't glitter)
    let g = vec3f(hash12(vec2f(c.z, 1.0)) - 0.5, hash12(vec2f(c.z, 2.0)) - 0.5, 0.0) * 0.16 * smoothstep(0.0, 0.5, c.x);
    let Nh = normalize(N + g.x * normalize(cross(N, vec3f(0.0, 1.0, 0.0001))) + g.y * vec3f(0.0, 1.0, 0.0));
    col = gold(Nh, V, L, 0.4);
  } else if (in.mat == 1u) {
    // the nimbus's face: beetle-wing panels set in gold leading, a hammered gold band at its rims
    let along = in.uv.x; let across = in.uv.y;
    // (hammered gold most of its width; the wing inlay a narrow channel down its middle)
    let rim = 1.0 - smoothstep(0.26, 0.3, min(across, 1.0 - across));
    let c = cells(vec2f(along * 60.0, across * 2.0));
    let lead = 1.0 - smoothstep(0.03, 0.08, c.y - c.x);
    let goldK = max(rim, lead);
    // (each panel a wing-case's sheen: a thin film, its thickness its own, rippling with the great stroke)
    let ripple = sin(along * 60.0 - O.look.x * 3.0) * O.look.w;
    let thick = 380.0 + c.z * 260.0 + across * 50.0 + ripple * 40.0;
    let film = thinFilm(nv, thick);
    // (a wing-case: near black, its colour all in the film's sheen — green, violet, gold as it turns)
    let wing = vec3f(0.012, 0.014, 0.018) + film * film * 0.035;
    let spec = ggx(N, V, L.keyL, 0.22) * L.key + ggx(N, V, L.drumL, 0.22) * L.drum;
    var w = wing * (L.key * sat(dot(N, L.keyL)) + L.drum * sat(dot(N, L.drumL)) + L.amb) + film * film * (spec * 1.2 + L.rim * pow(1.0 - nv, 3.0) * 0.5);
    // its light from within: the faintest glow with each stroke, more after the great one
    w += film * film * (0.004 + 0.05 * flash + 0.16 * O.look.w) * (0.6 + 0.4 * sin(c.z * 40.0 + O.look.x * 2.0));
    // (the gold here hammered too: its dimples tip the normal)
    let hc = cells(in.bpos.xy * 260.0);
    let hg = (vec2f(hash12(vec2f(hc.z, 1.0)), hash12(vec2f(hc.z, 2.0))) - 0.5) * 0.16 * smoothstep(0.0, 0.5, hc.x);
    let Nh = normalize(N + vec3f(hg.x, hg.y, 0.0));
    col = mix(w, gold(Nh, V, L, 0.42), goldK);
  } else if (in.mat == 2u) {
    // the seed-stone: deep teal glass, a light inside it that wakes with the strokes
    let core = pow(nv, 3.0);
    let glow = 0.5 + 1.6 * flash + 2.5 * O.look.w + 0.25 * sin(O.look.x * 1.7);
    col = vec3f(0.03, 0.25, 0.22) * (0.4 + core * glow * 2.0) + vec3f(0.3, 1.0, 0.85) * core * core * glow;
    col += vec3f(1.0) * (ggx(N, V, L.keyL, 0.08) * L.key + ggx(N, V, L.drumL, 0.08) * L.drum) * 2.0;
  } else {
    // the diadem's filigree: scrolls cut through a gold band (s-curves round small rings)
    let u = in.uv.x * 160.0; let v = in.uv.y * 2.0 - 1.0;
    let cell = fract(u) - 0.5;
    let k = select(1.0, -1.0, fract(u * 0.5) > 0.5);
    let ringD = abs(length(vec2f(cell, v * 0.9)) - 0.32);
    let scroll = abs(v - k * 0.55 * sin(cell * PI * 2.0));
    let edge = 1.0 - smoothstep(0.78, 0.92, abs(v));
    let metal = max(max(1.0 - smoothstep(0.07, 0.12, ringD), 1.0 - smoothstep(0.06, 0.11, scroll)), 1.0 - edge);
    if (metal < 0.5) { discard; }
    col = gold(N, V, L, 0.38);
  }
  col += vec3f(0.35, 0.85, 0.8) * shockAt(in.wpos) * 0.3;
  return vec4f(col, 1.0);
}
