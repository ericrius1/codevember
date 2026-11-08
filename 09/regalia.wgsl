// Her regalia, laid on at run time: cards anchored to points of her mesh and skinned by the same bones (the mantle of
// beetle-wing scales and leaves over her shoulders, the skirt's tiers of scales, glowing flowers), and strands
// simulated on the CPU (regalia.ts) and drawn here as tubes (her rope locks, the headdress's fibre-optic filaments,
// the seed pods' cords, the sash's tails) with beads, pods and the filaments' glowing tips.
#include "./common"

struct RegU {
  // x story time, y the shock's push on the cards (0..), z the strokes' flash, w the lines' pulse
  look: vec4f,
  // the body's forward (the sash's ribbons lie across it), w
  fwd: vec4f,
}
@group(2) @binding(0) var<uniform> R: RegU;
@group(2) @binding(1) var<storage, read> DQ: array<vec4f>;
struct Card {
  pos: vec4f,     // bind-space anchor (xyz), w the card's length
  nrm: vec4f,     // bind-space normal (xyz), w its half width
  skin: vec4u,    // x the bones (4 × u8), y the weights (4 × unorm8), z its kind, w a seed
  shape: vec4f,   // x how far it stands off the surface (rad), y its offset out (m), z its hue, w the way it hangs (0 down the surface .. 1 flat on it, out)
}
@group(2) @binding(2) var<storage, read> cards: array<Card>;
// the strands: points (xyz, w radius), segments (a, b, kind, t along its chain × 65535)
@group(2) @binding(3) var<storage, read> pts: array<vec4f>;
@group(2) @binding(4) var<storage, read> segs: array<vec4u>;
// the beads: point index, kind (0 glass, 1 gold, 2 pod, 3 a filament's tip), its radius (× 10000), a seed
@group(2) @binding(5) var<storage, read> beads: array<vec4u>;
#include "weft/skin"

struct CardOut {
  @builtin(position) pos: vec4f,
  @location(0) wpos: vec3f,
  @location(1) n: vec3f,
  @location(2) uv: vec2f,
  @location(3) @interpolate(flat) kind: u32,
  @location(4) @interpolate(flat) seed: f32,
  @location(5) @interpolate(flat) hue: f32,
};

const COLS = 3u;
const ROWS = 7u;
@vertex fn vsCard(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> CardOut {
  var o: CardOut;
  let c = cards[ii];
  let q = skinBlend(unpackBones(c.skin.x), unpack4x8unorm(c.skin.y));
  let anchor = dqPoint(q, c.pos.xyz);
  let n = normalize(dqDir(q, c.nrm.xyz));
  // the card's frame on the surface: down the surface (a scale hangs) or flat, facing out (a flower)
  let downB = normalize(vec3f(0.0, -1.0, 0.0) - c.nrm.xyz * dot(vec3f(0.0, -1.0, 0.0), c.nrm.xyz) + vec3f(0.0, -1e-4, 0.0));
  let down = normalize(dqDir(q, downB));
  let side = normalize(cross(n, down));
  // which corner: quads (COLS-1) × (ROWS-1), six vertices each
  let quad = vi / 6u; let k = vi % 6u;
  let qc = quad % (COLS - 1u); let qr = quad / (COLS - 1u);
  let corner = array<vec2u, 6>(vec2u(0u, 0u), vec2u(1u, 0u), vec2u(0u, 1u), vec2u(1u, 0u), vec2u(1u, 1u), vec2u(0u, 1u))[k];
  let col = qc + corner.x; let row = qr + corner.y;
  let u = f32(col) / f32(COLS - 1u) * 2.0 - 1.0;
  let v = f32(row) / f32(ROWS - 1u);
  let kind = c.skin.z;
  let seed = f32(c.skin.w) / 65535.0;
  let L = c.pos.w; let Wd = c.nrm.w;
  // its outline: a scale or a leaf pointed at its tip, a flower round
  var w = Wd * sin(PI * pow(max(v, 0.0), 0.75)) * (1.0 - 0.25 * v) + Wd * 0.25 * (1.0 - v) * step(0.5, f32(kind == 0u));
  // the flutter: a breath of air, and the shock's push lifting them off her
  let t = R.look.x;
  let lift = c.shape.x + 0.08 * sin(t * (1.3 + seed) + seed * 40.0) + R.look.y * (0.6 + 0.6 * seed);
  var p: vec3f;
  var nn: vec3f;
  if (kind == 3u) {
    // a flower: flat, facing out, a little off the surface
    let a = (v * 2.0 - 1.0);
    p = anchor + n * (c.shape.y + 0.004) + side * u * Wd + down * a * Wd;
    nn = n;
  } else {
    let ca = cos(lift); let sa = sin(lift);
    let dir = normalize(down * ca + n * sa);
    // (folded along its midrib: its edges a little out)
    p = anchor + n * c.shape.y + dir * (v * L) + side * (u * w) + n * (abs(u) * w * 0.3 + v * v * L * 0.15);
    nn = normalize(cross(dir, side) * -1.0 + side * u * 0.3);
    if (dot(nn, n) < 0.0) { nn = -nn; }
  }
  o.wpos = p;
  o.pos = frame.viewProj * vec4f(p, 1.0);
  o.n = nn;
  o.uv = vec2f(u, v);
  o.kind = kind;
  o.seed = seed;
  o.hue = c.shape.z;
  return o;
}

@fragment fn fsCard(in: CardOut, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  var N = normalize(in.n);
  if (!ff) { N = -N; }
  let V = normalize(frame.camPos - in.wpos);
  let L = stageLight(in.wpos, N);
  let nv = abs(dot(N, V));
  var col = vec3f(0.0);
  let uv = in.uv;
  if (in.kind == 0u) {
    // a beetle's wing-case: a film over a dark body — violet, green, gold as it turns — a midrib, fine ribs
    let rib = 1.0 - smoothstep(0.0, 0.06, abs(uv.x));
    let ribs = 0.5 + 0.5 * sin((uv.y * 30.0 + abs(uv.x) * 8.0));
    let thick = 400.0 + in.hue * 110.0 + uv.y * 60.0 + ribs * 20.0;
    let film = thinFilm(nv, thick) * vec3f(0.85, 0.9, 1.0);
    let base = vec3f(0.025, 0.03, 0.03) + film * 0.16;
    let spec = ggx(N, V, L.keyL, 0.25) * L.key + ggx(N, V, L.drumL, 0.25) * L.drum;
    col = base * (L.key * sat(dot(N, L.keyL)) + L.drum * sat(dot(N, L.drumL)) + L.amb * 1.5) + film * spec * 1.6;
    col += film * L.rim * pow(1.0 - nv, 2.0) * 1.5;
    col = mix(col, vec3f(0.5, 0.35, 0.1) * (L.key + L.drum) * 0.4, rib * 0.5);
    // the edge's gold thread
    col += vec3f(1.0, 0.6, 0.15) * (1.0 - smoothstep(0.0, 0.08, 1.0 - abs(uv.x) - (1.0 - uv.y) * 0.1)) * 0.05 * (1.0 + 3.0 * R.look.z);
  } else if (in.kind == 1u) {
    // a leaf: deep green, its veins lighter, light through it from the drum
    let vein = 1.0 - smoothstep(0.0, 0.05, abs(uv.x)) + 0.5 * (1.0 - smoothstep(0.0, 0.04, abs(fract(uv.y * 6.0 - abs(uv.x) * 1.5) - 0.5)));
    let base = mix(vec3f(0.035, 0.08, 0.02), vec3f(0.12, 0.2, 0.05), sat(vein) * 0.6) * (0.8 + 0.4 * in.seed);
    col = base * (L.key * sat(dot(N, L.keyL)) + L.drum * sat(dot(N, L.drumL)) + L.amb * 1.5);
    col += base * L.drum * sat(-dot(N, L.drumL)) * 0.8 + vec3f(0.1, 0.3, 0.05) * L.rim * pow(1.0 - nv, 2.0);
    col += vec3f(1.0) * ggx(N, V, L.keyL, 0.4) * L.key * 0.3;
  } else if (in.kind == 3u) {
    // a flower: five pale petals round a gold heart, glowing
    let fq = vec2f(uv.x, uv.y * 2.0 - 1.0);
    let r = length(fq);
    let a = atan2(fq.y, fq.x);
    let petal = 0.55 + 0.45 * cos(a * 5.0 + in.seed * 6.0);
    if (r > petal) { discard; }
    let heart = 1.0 - smoothstep(0.12, 0.2, r);
    let pc = mix(vec3f(0.55, 0.9, 1.0), vec3f(0.9, 0.95, 1.0), r);
    col = mix(pc * (0.5 + 1.2 * (1.0 + 2.0 * R.look.z)) * (1.0 - r * 0.5), vec3f(3.0, 1.8, 0.4), heart);
    col += pc * L.key * 0.2;
  } else {
    // gold
    col = vec3f(0.55, 0.36, 0.1) * (L.key * sat(dot(N, L.keyL)) + L.amb) + vec3f(1.0, 0.75, 0.4) * ggx(N, V, L.keyL, 0.2) * L.key * 3.0;
  }
  col += vec3f(0.35, 0.85, 0.8) * shockAt(in.wpos) * 0.3;
  return vec4f(col, 1.0);
}

// ---------------------------------------------------------------- the strands, as tubes
struct TubeOut {
  @builtin(position) pos: vec4f,
  @location(0) wpos: vec3f,
  @location(1) n: vec3f,
  @location(2) t: vec2f,      // along its chain, round it
  @location(3) @interpolate(flat) kind: u32,
  @location(4) tangent: vec3f,
};
const SIDES = 8u;
@vertex fn vsTube(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> TubeOut {
  var o: TubeOut;
  let s = segs[ii];
  let A = pts[s.x]; let B = pts[s.y];
  let quad = vi / 6u; let k = vi % 6u;
  let corner = array<vec2u, 6>(vec2u(0u, 0u), vec2u(1u, 0u), vec2u(0u, 1u), vec2u(1u, 0u), vec2u(1u, 1u), vec2u(0u, 1u))[k];
  let side = (quad + corner.x) % SIDES;
  let end = corner.y;
  let ax = B.xyz - A.xyz;
  let T = normalize(ax + vec3f(0.0, 1e-6, 0.0));
  var X = normalize(cross(T, select(vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), abs(T.y) > 0.9)));
  var Y = cross(T, X);
  let kind = s.z;
  var rx = 1.0; var ry = 1.0;
  if (kind == 3u) {
    // a ribbon: flat across the body's front
    X = normalize(cross(T, R.fwd.xyz) + vec3f(1e-5, 0.0, 0.0)); Y = cross(T, X);
    rx = 2.6; ry = 0.12;
  }
  let a = f32(side) / f32(SIDES) * TAU;
  let off = X * cos(a) * rx + Y * sin(a) * ry;
  let P = select(A, B, end == 1u);
  // (each end overlaps its neighbour a little: no cracks at the bends)
  let ext = select(-T, T, end == 1u) * P.w * 0.5;
  o.wpos = P.xyz + off * P.w + ext;
  o.pos = frame.viewProj * vec4f(o.wpos, 1.0);
  o.n = normalize(X * cos(a) / max(rx, 0.05) + Y * sin(a) / max(ry, 0.05));
  let ta = f32(s.w & 65535u) / 65535.0;
  let tb = f32(s.w >> 16u) / 65535.0;
  o.t = vec2f(select(ta, tb, end == 1u), a);
  o.kind = kind;
  o.tangent = T;
  return o;
}
@fragment fn fsTube(in: TubeOut, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  var N = normalize(in.n);
  if (!ff) { N = -N; }
  let V = normalize(frame.camPos - in.wpos);
  let L = stageLight(in.wpos, N);
  let T = normalize(in.tangent);
  var col = vec3f(0.0);
  if (in.kind == 0u) {
    // a rope lock: twisted, near-black with a blue cast, a sheen along it
    let tw = 0.5 + 0.5 * sin(in.t.y * 2.0 + in.t.x * 140.0);
    let base = vec3f(0.02, 0.018, 0.028) * (0.6 + 0.6 * tw);
    let H = normalize(L.keyL + V);
    let sh = pow(sqrt(max(0.0, 1.0 - dot(T, H) * dot(T, H))), 60.0);
    col = base * (L.key * sat(dot(N, L.keyL) + 0.3) + L.drum * sat(dot(N, L.drumL) + 0.3) + L.amb) + vec3f(0.25, 0.3, 0.5) * sh * L.key * 0.12;
    col += L.rim * pow(1.0 - abs(dot(N, V)), 3.0) * 0.4;
  } else if (in.kind == 1u || in.kind == 4u) {
    // a fibre-optic filament (cyan, or gold): dark at its root, its light running out toward its tip
    let g = pow(in.t.x, 3.0);
    let hue = select(vec3f(0.15, 1.0, 0.9), vec3f(1.0, 0.7, 0.2), in.kind == 4u);
    col = vec3f(0.02, 0.03, 0.04) + hue * g * (0.6 + 1.5 * R.look.z + 0.6 * R.look.w);
  } else if (in.kind == 2u) {
    // a cord
    let base = vec3f(0.3, 0.2, 0.1) * (0.7 + 0.3 * sin(in.t.x * 400.0 + in.t.y * 2.0));
    col = base * (L.key * sat(dot(N, L.keyL)) + L.drum * sat(dot(N, L.drumL)) + L.amb);
  } else {
    // the sash's tails: plum, a gold lattice, a fringe at the end
    let lat = abs(fract(in.t.x * 14.0 + in.t.y * 0.3) - 0.5);
    let base = mix(vec3f(0.09, 0.03, 0.11), vec3f(0.36, 0.22, 0.05), (1.0 - smoothstep(0.03, 0.06, lat)) * 0.6);
    col = base * (L.key * sat(dot(N, L.keyL) + 0.2) + L.drum * sat(dot(N, L.drumL) + 0.2) + L.amb) + base * pow(1.0 - abs(dot(N, V)), 2.0) * (L.key + L.drum) * 0.4;
  }
  col += vec3f(0.35, 0.85, 0.8) * shockAt(in.wpos) * 0.3;
  return vec4f(col, 1.0);
}

// ---------------------------------------------------------------- beads, pods, the filaments' tips
struct BeadOut {
  @builtin(position) pos: vec4f,
  @location(0) wpos: vec3f,
  @location(1) n: vec3f,
  @location(2) @interpolate(flat) kind: u32,
  @location(3) @interpolate(flat) seed: f32,
};
@vertex fn vsBead(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> BeadOut {
  var o: BeadOut;
  let b = beads[ii];
  let P = pts[b.x];
  let r = f32(b.z) / 10000.0;
  // a sphere: 8 round × 6 down, six vertices a quad
  let quad = vi / 6u; let k = vi % 6u;
  let corner = array<vec2u, 6>(vec2u(0u, 0u), vec2u(1u, 0u), vec2u(0u, 1u), vec2u(1u, 0u), vec2u(1u, 1u), vec2u(0u, 1u))[k];
  let lon = f32((quad % 8u) + corner.x) / 8.0 * TAU;
  let lat = (f32((quad / 8u) + corner.y) / 6.0 - 0.5) * PI;
  var n = vec3f(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));
  var sc = vec3f(1.0);
  if (b.y == 2u) { sc = vec3f(1.0, 1.5, 1.0); }
  o.wpos = P.xyz + n * sc * r;
  o.pos = frame.viewProj * vec4f(o.wpos, 1.0);
  o.n = normalize(n / sc);
  o.kind = b.y;
  o.seed = f32(b.w) / 65535.0;
  return o;
}
@fragment fn fsBead(in: BeadOut) -> @location(0) vec4f {
  let N = normalize(in.n);
  let V = normalize(frame.camPos - in.wpos);
  let L = stageLight(in.wpos, N);
  var col = vec3f(0.0);
  let spec = ggx(N, V, L.keyL, 0.15) * L.key + ggx(N, V, L.drumL, 0.15) * L.drum;
  if (in.kind == 0u) {
    // glass: teal or amber, lit through
    let g = mix(vec3f(0.1, 0.7, 0.65), vec3f(0.9, 0.5, 0.1), step(0.5, in.seed));
    col = g * (0.15 + 0.3 * R.look.z) + g * L.drum * 0.2 + vec3f(1.0) * spec * 1.5;
  } else if (in.kind == 1u) {
    col = vec3f(0.6, 0.38, 0.1) * (L.key * sat(dot(N, L.keyL)) + L.amb) + vec3f(1.0, 0.75, 0.4) * spec * 3.0;
  } else if (in.kind == 2u) {
    // a seed pod: dark husk, a glow from its holes
    let hole = step(0.8, hash13(floor(in.wpos * 300.0)));
    col = vec3f(0.12, 0.06, 0.025) * (L.key * sat(dot(N, L.keyL)) + L.drum * sat(dot(N, L.drumL)) + L.amb) + vec3f(1.0, 0.6, 0.2) * hole * (0.3 + 1.5 * R.look.z) + spec * 0.4;
  } else {
    // a filament's tip: a point of light
    let g = mix(vec3f(0.2, 1.0, 0.9), vec3f(1.0, 0.7, 0.25), step(0.5, in.seed));
    col = g * (2.5 + 5.0 * R.look.z + 2.0 * R.look.w);
  }
  col += vec3f(0.35, 0.85, 0.8) * shockAt(in.wpos) * 0.3;
  return vec4f(col, 1.0);
}
