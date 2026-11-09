// Her regalia, laid on at run time: cards anchored to points of her mesh and skinned by the same bones (the mantle of
// feathers and leaves over her shoulders, the skirt's tiers of long eyed feathers, glowing flowers, the crown of leaves),
// and strands simulated on the CPU (hair.ts) and drawn here as tubes (her rope locks, the bead strings from her
// diadem, the seed pods' cords, the sash's tails) with what's threaded on them: glass and gold beads, gold coils and
// carved bone pins on the locks, filigree pods lit from inside, seed pods.
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
  shape: vec4f,   // x how far it stands off the surface (rad), y its offset out (m), z its hue, w its lean about its normal (rad)
}
@group(2) @binding(2) var<storage, read> cards: array<Card>;
// the strands: points (xyz, w radius), segments (a, b, kind, t along its chain × 65535)
@group(2) @binding(3) var<storage, read> pts: array<vec4f>;
@group(2) @binding(4) var<storage, read> segs: array<vec4u>;
// the beads: point index, kind (0 glass, 1 gold, 2 seed pod, 3 filigree pod, 4 bone pin, 5 gold coil), its radius (× 10000), a seed
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
  // its own frame: along it (root to tip), across it
  @location(6) along: vec3f,
  @location(7) across: vec3f,
};

const COLS = 3u;
const ROWS = 9u;
/** a point kept out of her arms and her head (common's capsules 0 and 2..5), a margin off them */
fn clearOfHer(p: vec3f, m: f32) -> vec3f {
  var q = p;
  let n = min(u32(G.glow.y), 6u);
  for (var i = 0u; i < n; i++) {
    if (i == 1u) { continue; }
    let a = G.caps[2u * i]; let b = G.caps[2u * i + 1u];
    let ba = b.xyz - a.xyz; let pa = q - a.xyz;
    let d = pa - ba * sat(dot(pa, ba) / dot(ba, ba));
    let l = length(d); let r = a.w + m;
    if (l < r) { q += d / max(l, 1e-4) * (r - l); }
  }
  return q;
}
@vertex fn vsCard(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> CardOut {
  var o: CardOut;
  let c = cards[ii];
  let q = skinBlend(unpackBones(c.skin.x), unpack4x8unorm(c.skin.y));
  let anchor = dqPoint(q, c.pos.xyz);
  let n = normalize(dqDir(q, c.nrm.xyz));
  // the card's frame on the surface: down the surface (a scale hangs) or flat, facing out (a flower)
  let downB = normalize(vec3f(0.0, -1.0, 0.0) - c.nrm.xyz * dot(vec3f(0.0, -1.0, 0.0), c.nrm.xyz) + vec3f(0.0, -1e-4, 0.0));
  var down = normalize(dqDir(q, downB));
  // (leaned about its normal by shape.w: a crown's leaves swept back round the head)
  down = normalize(down * cos(c.shape.w) + cross(n, down) * sin(c.shape.w));
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
  // its outline: a leaf pointed at its tip, a flower round; a feather's is cut from its card (fsCard)
  let w = select(Wd * sin(PI * pow(max(v, 0.0), 0.75)) * (1.0 - 0.25 * v), Wd, kind == 0u);
  // the flutter: a breath of air; the shock lifts them a little off her and bends them away from it, the tips the most
  let t = R.look.x;
  let push = R.look.y;
  let lift = c.shape.x + 0.06 * sin(t * (1.3 + seed) + seed * 40.0) + push * 0.14 * (0.4 + seed);
  var p: vec3f;
  var nn: vec3f;
  var along = down;
  if (kind == 3u) {
    // a flower: flat, facing out, a little off the surface
    let a = (v * 2.0 - 1.0);
    p = anchor + n * (c.shape.y + 0.004) + side * u * Wd + down * a * Wd;
    nn = n;
  } else if (c.shape.x > 1.5) {
    // (the crown's leaves: standing, swept back; folded along the midrib, the edges a little out)
    let ca = cos(lift); let sa = sin(lift);
    let dir = normalize(down * ca + n * sa);
    p = anchor + n * c.shape.y + dir * (v * L) + side * (u * w) + n * (abs(u) * w * 0.3 + v * v * L * 0.15);
    nn = normalize(cross(dir, side) * -1.0 + side * u * 0.3);
    if (dot(nn, n) < 0.0) { nn = -nn; }
    along = dir;
  } else {
    // what hangs on her — feathers, leaves: it leaves the surface at its lift and arcs back to it by its tip (laid
    // one over the next as plumage lies), hanging a little toward the ground's down whichever way she's turned; cupped
    // across, its edges toward her
    let g = vec3f(0.0, -1.0, 0.0);
    let d0 = normalize(down + (g - n * dot(g, n)) * 0.6);
    let sd = normalize(cross(n, d0));
    let cv = max(lift * 1.8, 1e-3);
    let a1 = lift - cv * v;
    // (the shock's wind: away from the hide, never into her)
    var wind = anchor - G.shock.xyz; wind.y *= 0.3; wind = normalize(wind + vec3f(1e-4, 0.0, 0.0));
    wind -= n * min(0.0, dot(wind, n));
    let sway = wind * push * (0.22 + 0.2 * seed) + sd * 0.05 * sin(t * (0.9 + seed) + seed * 17.0);
    p = anchor + n * c.shape.y + (d0 * (sin(lift) - sin(a1)) + n * (cos(a1) - cos(lift))) * (L / cv)
      + sd * (u * w) - n * (u * u * w * 0.3) + sway * (v * v * L);
    // (out of her arms' way: draped over them, not through them; its root stays where it's sewn)
    p = mix(p, clearOfHer(p, 0.006), smoothstep(0.0, 0.3, v));
    along = normalize(d0 * cos(a1) + n * sin(a1) + sway * (2.0 * v));
    nn = normalize(cross(along, sd) + sd * u * 0.45);
    if (dot(nn, n) < 0.0) { nn = -nn; }
    o.across = sd;
  }
  if (kind == 3u || c.shape.x > 1.5) { o.across = side; }
  o.along = along;
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
  // (a feather's barbs run out from its shaft toward its tip: which barb this is, and how many pixels one takes — taken
  // here, before any branch, as screen-space widths must be)
  let bc = (uv.y - 0.3 * abs(uv.x)) * 46.0;
  let bw = fwidth(bc);
  let ew = fwidth(uv.x);
  if (in.kind == 0u) {
    // a feather: its shaft, its vane of barbs — ragged at the edge, parted here and there — coloured as birds' are: by
    // its structure, so it turns with the eye (cobalt to turquoise, emerald, violet, a few amber), dark and downy at the
    // root; the long ones of her skirt's train carry an eye
    let style = floor(in.hue); let hue = fract(in.hue);
    let v = uv.y; let au = abs(uv.x);
    let vv = sat((v - 0.07) / 0.93);
    let bi = floor(bc); let bf = fract(bc);
    let bh = hash11(bi * 1.37 + in.seed * 91.0);
    let fine = 1.0 - smoothstep(0.35, 0.9, bw);
    // its outline
    var f = pow(vv, 0.45) * sqrt(sat(1.0 - pow(vv, 2.4))) * (0.9 + 0.1 * mix(0.5, bh, fine));
    let parted = step(mix(0.88, 0.7, style), hash11(bi * 0.731 + in.seed * 37.0)) * fine;
    f *= 1.0 - parted * (0.2 + 0.3 * style) * (1.0 - abs(bf - 0.5) * 2.0);
    let shaftW = 0.05 * (1.0 - 0.6 * v) + ew;
    if (au > max(f, shaftW * step(v, 0.96))) { discard; }
    // its colours, root to tip
    var c0 = vec3f(0.006, 0.012, 0.07); var c1 = vec3f(0.012, 0.07, 0.42); var c2 = vec3f(0.0, 0.32, 0.36);
    if (hue > 0.4) { c0 = vec3f(0.004, 0.03, 0.02); c1 = vec3f(0.01, 0.22, 0.09); c2 = vec3f(0.16, 0.4, 0.05); }
    if (hue > 0.7) { c0 = vec3f(0.02, 0.006, 0.05); c1 = vec3f(0.14, 0.03, 0.36); c2 = vec3f(0.36, 0.07, 0.4); }
    if (hue > 0.92) { c0 = vec3f(0.06, 0.012, 0.006); c1 = vec3f(0.42, 0.1, 0.015); c2 = vec3f(0.6, 0.36, 0.04); }
    if (style > 0.5) { c0 = vec3f(0.004, 0.02, 0.016); c1 = mix(vec3f(0.01, 0.16, 0.1), vec3f(0.02, 0.1, 0.24), hue); c2 = mix(vec3f(0.12, 0.3, 0.05), vec3f(0.0, 0.26, 0.3), hue); }
    var base = mix(mix(c0, c1, smoothstep(0.05, 0.45, v + 0.1 * (in.seed - 0.5))), c2, smoothstep(0.5, 0.95, v + 0.25 * au));
    // (it turns with the eye: toward the next colour round as it's seen along)
    base = hueShift(base, (1.0 - nv) * 0.9 - 0.25 + 0.3 * (in.seed - 0.5));
    // (barb by barb a shade apart, and the dark between them)
    base *= mix(1.0, (0.72 + 0.5 * bh) * (0.55 + 0.45 * smoothstep(0.0, 0.3, bf) * smoothstep(1.0, 0.7, bf)), fine);
    var glint = 1.0;
    // the eye near its tip: a dark heart, a ring of turquoise, of bronze, of gold-green
    let eyed = (style > 0.5 && in.seed > 0.4) || (style < 0.5 && in.seed > 0.9);
    if (eyed) {
      let e = length(vec2f(uv.x * 0.8, (v - 0.74) * 4.2));
      let ring = vec3f(0.005, 0.006, 0.04) * (1.0 - smoothstep(0.26, 0.3, e))
        + vec3f(0.0, 0.3, 0.5) * smoothstep(0.26, 0.3, e) * (1.0 - smoothstep(0.42, 0.47, e))
        + vec3f(0.42, 0.17, 0.03) * smoothstep(0.42, 0.47, e) * (1.0 - smoothstep(0.6, 0.66, e))
        + vec3f(0.2, 0.32, 0.03) * smoothstep(0.6, 0.66, e) * (1.0 - smoothstep(0.76, 0.86, e));
      let inEye = 1.0 - smoothstep(0.76, 0.86, e);
      base = mix(base, hueShift(ring, (1.0 - nv) * 0.5 - 0.15) * (0.8 + 0.3 * bh * fine), inEye);
      glint += 1.5 * inEye;
    }
    // (downy and dull at the root, where the next one lies over it)
    let lap = smoothstep(0.0, 0.45, v);
    base *= 0.35 + 0.65 * lap;
    // its light: the vane's, a little through it from behind; a sheen along the barbs, in its own colour
    let nk = dot(N, L.keyL); let nd = dot(N, L.drumL);
    let drum = L.drum / (1.0 + 0.45 * luma(L.drum));
    col = base * (L.key * sat(nk * 0.8 + 0.2) + drum * sat(nd * 0.8 + 0.2) + L.amb * 1.6);
    col += base * (L.key * sat(-nk) + drum * sat(-nd)) * 0.45;
    let A = normalize(in.along); let S = normalize(in.across);
    let Tb = normalize(A * 0.75 + S * sign(uv.x) * 0.66);
    let Hk = normalize(V + L.keyL); let Hd = normalize(V + L.drumL);
    let shK = pow(sqrt(max(0.0, 1.0 - dot(Tb, Hk) * dot(Tb, Hk))), 34.0) * sat(nk + 0.3);
    let shD = pow(sqrt(max(0.0, 1.0 - dot(Tb, Hd) * dot(Tb, Hd))), 34.0) * sat(nd + 0.3);
    let lustre = (base * 3.5 + 0.02) * (0.6 + 0.8 * thinFilm(nv, 380.0 + 160.0 * hue));
    col += lustre * (shK * L.key + shD * drum) * 0.5 * glint * lap * (0.6 + 0.4 * bh);
    col += lustre * L.rim * pow(1.0 - nv, 2.5) * 0.7 * lap;
    // (the stroke's flash catches in them)
    col += lustre * R.look.z * 0.06 * lap;
    // the shaft: pale horn, a thread of light down it
    let sh = (1.0 - smoothstep(shaftW * 0.5, shaftW, au)) * step(v, 0.96);
    col = mix(col, vec3f(0.5, 0.42, 0.3) * (L.key * sat(nk + 0.4) + drum * sat(nd + 0.4) + L.amb) * (0.5 + 0.5 * lap), sh * 0.85);
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
    col = mix(pc * (0.12 + 0.35 * R.look.z) * (1.0 - r * 0.5) + pc * L.key * 0.15, vec3f(1.2, 0.75, 0.2) * (0.6 + R.look.z), heart);
    col += pc * L.key * 0.2;
  } else {
    // a beaten gold leaf: its midrib and veins pressed in, a broad sheen (never a glitter), the drum's light in it
    let vein = 1.0 - smoothstep(0.0, 0.07, abs(uv.x)) + 0.5 * (1.0 - smoothstep(0.0, 0.05, abs(fract(uv.y * 5.0 - abs(uv.x) * 1.4) - 0.5)));
    let gb = vec3f(0.55, 0.35, 0.09) * (1.0 - 0.35 * sat(vein));
    let F = mix(gb, vec3f(0.95, 0.72, 0.35), pow(1.0 - nv, 5.0));
    col = gb * 0.3 * (L.key * sat(dot(N, L.keyL)) + L.drum * sat(dot(N, L.drumL)) + L.amb)
      + F * (ggx(N, V, L.keyL, 0.36) * L.key + ggx(N, V, L.drumL, 0.36) * L.drum) * 1.6 + F * (L.rim * 0.25 + L.amb * 0.3);
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
/** how many pieces a strand's link is drawn in, along its curve */
const TUBE_PIECES = 3u;
@vertex fn vsTube(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> TubeOut {
  var o: TubeOut;
  let s = segs[ii];
  let A = pts[s.x]; let B = pts[s.y];
  let ta = f32(s.w & 65535u) / 65535.0;
  let tb = f32(s.w >> 16u) / 65535.0;
  // (a link drawn as a curve through its neighbours — the chain's points are a strand's, not a rod's)
  var P0 = A.xyz * 2.0 - B.xyz; var P3 = B.xyz * 2.0 - A.xyz;
  if (ta > 0.0) { P0 = pts[s.x - 1u].xyz; }
  if (tb < 1.0) { P3 = pts[s.y + 1u].xyz; }
  let piece = vi / (6u * SIDES);
  let quad = (vi / 6u) % SIDES; let k = vi % 6u;
  let corner = array<vec2u, 6>(vec2u(0u, 0u), vec2u(1u, 0u), vec2u(0u, 1u), vec2u(1u, 0u), vec2u(1u, 1u), vec2u(0u, 1u))[k];
  let side = quad + corner.x;
  let u = f32(piece + corner.y) / f32(TUBE_PIECES);
  let u2 = u * u; let u3 = u2 * u;
  let Pc = 0.5 * (2.0 * A.xyz + (B.xyz - P0) * u + (2.0 * P0 - 5.0 * A.xyz + 4.0 * B.xyz - P3) * u2 + (3.0 * A.xyz - P0 - 3.0 * B.xyz + P3) * u3);
  let dP = 0.5 * ((B.xyz - P0) + 2.0 * (2.0 * P0 - 5.0 * A.xyz + 4.0 * B.xyz - P3) * u + 3.0 * (3.0 * A.xyz - P0 - 3.0 * B.xyz + P3) * u2);
  let T = normalize(dP + vec3f(0.0, 1e-6, 0.0));
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
  let rad = mix(A.w, B.w, u);
  o.wpos = Pc + off * rad;
  o.pos = frame.viewProj * vec4f(o.wpos, 1.0);
  o.n = normalize(X * cos(a) / max(rx, 0.05) + Y * sin(a) / max(ry, 0.05));
  o.t = vec2f(mix(ta, tb, u), a);
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
    let ph = in.t.y * 3.0 + in.t.x * 170.0;
    let tw = abs(sin(ph * 0.5));
    // (three strands twisted: each rounds out from the grooves between them)
    N = normalize(N + T * cos(ph * 0.5) * sign(sin(ph * 0.5)) * 0.55 * (1.0 - tw));
    let base = vec3f(0.022, 0.017, 0.034) * (0.25 + 0.95 * smoothstep(0.0, 0.5, tw));
    let H = normalize(L.keyL + V);
    let sh = pow(sqrt(max(0.0, 1.0 - dot(T, H) * dot(T, H))), 60.0);
    col = base * (L.key * sat(dot(N, L.keyL) + 0.3) + L.drum * sat(dot(N, L.drumL) + 0.3) + L.amb) + vec3f(0.25, 0.3, 0.5) * sh * L.key * 0.12;
    col += L.rim * pow(1.0 - abs(dot(N, V)), 3.0) * 0.4;
  } else if (in.kind == 1u) {
    // a bead string's thread: fine gold
    col = vec3f(0.5, 0.32, 0.09) * (L.key * sat(dot(N, L.keyL) + 0.3) + L.amb) + vec3f(1.0, 0.75, 0.4) * ggx(N, V, L.keyL, 0.3) * L.key;
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

// ---------------------------------------------------------------- what's threaded on the strands
struct BeadOut {
  @builtin(position) pos: vec4f,
  @location(0) wpos: vec3f,
  @location(1) n: vec3f,
  @location(2) @interpolate(flat) kind: u32,
  @location(3) @interpolate(flat) seed: f32,
  // the unit sphere's point it was made from (x, y along its strand, z), for its carving
  @location(4) local: vec3f,
};
@vertex fn vsBead(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> BeadOut {
  var o: BeadOut;
  let b = beads[ii];
  let P = pts[b.x];
  let r = f32(b.z) / 10000.0;
  let kind = b.y;
  // its frame: along its strand (toward the tip), and two across
  var T = vec3f(0.0, -1.0, 0.0);
  if (kind >= 3u) {
    let nb = select(pts[b.x + 1u].xyz, P.xyz, kind == 3u);
    T = normalize(nb - pts[b.x - 1u].xyz + vec3f(0.0, -1e-6, 0.0));
  }
  let X = normalize(cross(T, select(vec3f(0.0, 0.0, 1.0), vec3f(1.0, 0.0, 0.0), abs(T.z) > 0.9)));
  let Y = cross(X, T);
  // a sphere: 8 round × 6 down, six vertices a quad (along its strand: its own y)
  let quad = vi / 6u; let k = vi % 6u;
  let corner = array<vec2u, 6>(vec2u(0u, 0u), vec2u(1u, 0u), vec2u(0u, 1u), vec2u(1u, 0u), vec2u(1u, 1u), vec2u(0u, 1u))[k];
  let lon = f32((quad % 8u) + corner.x) / 8.0 * TAU;
  let lat = (f32((quad / 8u) + corner.y) / 6.0 - 0.5) * PI;
  let n = vec3f(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));
  // its shape: across, along, across; and how far down its strand it hangs
  var sc = vec3f(1.0); var drop = 0.0;
  if (kind == 2u) { sc = vec3f(1.0, 1.5, 1.0); }
  if (kind == 3u) { sc = vec3f(1.0, 1.45, 1.0); drop = 1.0; }
  if (kind == 4u) { sc = vec3f(0.55, 3.4, 0.55); }
  if (kind == 5u) { sc = vec3f(1.0, 0.5, 1.0); }
  // (a pod's point, a filigree pod's tip: the far end drawn out)
  var shape = n;
  if (kind == 2u || kind == 3u) { shape = vec3f(n.x * (1.0 - 0.35 * max(-n.y, 0.0)), n.y, n.z * (1.0 - 0.35 * max(-n.y, 0.0))); }
  let lp = shape * sc * r;
  let nl = normalize(n / sc);
  if (kind < 3u) {
    // (round beads and seed pods: upright)
    o.wpos = P.xyz + lp;
    o.n = nl;
  } else {
    // (along its strand: its y down the strand toward the tip; a filigree pod hangs from its point)
    o.wpos = P.xyz + X * lp.x + T * (lp.y + drop * r * sc.y) + Y * lp.z;
    o.n = normalize(X * nl.x + T * nl.y + Y * nl.z);
  }
  o.pos = frame.viewProj * vec4f(o.wpos, 1.0);
  o.kind = kind;
  o.seed = f32(b.w) / 65535.0;
  o.local = n;
  return o;
}
@fragment fn fsBead(in: BeadOut) -> @location(0) vec4f {
  let N = normalize(in.n);
  let V = normalize(frame.camPos - in.wpos);
  let L = stageLight(in.wpos, N);
  let nv = max(dot(N, V), 0.0);
  var col = vec3f(0.0);
  // (rough enough that a glint spreads over a bead rather than winking on and off in a frame)
  let spec = ggx(N, V, L.keyL, 0.32) * L.key + ggx(N, V, L.drumL, 0.32) * L.drum;
  let goldC = vec3f(0.6, 0.38, 0.1) * (L.key * sat(dot(N, L.keyL)) + L.drum * sat(dot(N, L.drumL)) * 0.6 + L.amb) + vec3f(1.0, 0.75, 0.4) * spec * 2.2
    + vec3f(1.0, 0.8, 0.5) * L.rim * pow(1.0 - nv, 2.0) * 0.4;
  if (in.kind == 0u) {
    // glass: teal or amber, lit through
    let g = mix(vec3f(0.1, 0.7, 0.65), vec3f(0.9, 0.5, 0.1), step(0.5, in.seed));
    col = g * (0.12 + 0.3 * R.look.z) * (0.5 + nv) + g * L.drum * 0.2 + vec3f(1.0) * spec * 1.5 + g * L.rim * pow(1.0 - nv, 2.0);
  } else if (in.kind == 1u) {
    col = goldC;
  } else if (in.kind == 2u) {
    // a seed pod: dark husk, a glow from its holes
    let hole = step(0.8, hash13(floor(in.wpos * 300.0)));
    col = vec3f(0.12, 0.06, 0.025) * (L.key * sat(dot(N, L.keyL)) + L.drum * sat(dot(N, L.drumL)) + L.amb) + vec3f(1.0, 0.6, 0.2) * hole * (0.3 + 1.5 * R.look.z) + spec * 0.4;
  } else if (in.kind == 3u) {
    // a filigree pod: a cage of gold wire, an ember inside it
    let a = atan2(in.local.z, in.local.x);
    let ribs = abs(fract(a / TAU * 8.0 + in.local.y * 0.6) - 0.5);
    let rings = abs(fract(in.local.y * 2.5) - 0.5);
    let wire = 1.0 - smoothstep(0.06, 0.12, min(ribs, rings));
    let ember = vec3f(1.0, 0.55, 0.15) * (0.8 + 2.5 * R.look.z) * (0.5 + 0.5 * nv);
    col = mix(ember, goldC, wire);
  } else if (in.kind == 4u) {
    // a carved bone pin: ivory, rings cut round it, a gold cap at its head
    let y = in.local.y;
    let ring = 1.0 - smoothstep(0.05, 0.15, abs(fract(y * 3.0) - 0.5));
    let ivory = vec3f(0.62, 0.55, 0.42) * (1.0 - 0.45 * ring);
    col = ivory * (L.key * sat(dot(N, L.keyL) * 0.8 + 0.2) + L.drum * sat(dot(N, L.drumL)) + L.amb * 1.2) + vec3f(0.6) * ggx(N, V, L.keyL, 0.4) * L.key;
    col = mix(col, goldC, step(0.82, -y));
  } else {
    // a gold coil wound round the lock
    let ridge = 0.6 + 0.4 * sin(in.local.y * 22.0);
    col = goldC * ridge;
  }
  col += vec3f(0.35, 0.85, 0.8) * shockAt(in.wpos) * 0.3;
  return vec4f(col, 1.0);
}
