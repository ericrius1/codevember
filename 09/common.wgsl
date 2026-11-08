// 09 / Membrane: what every pass shares — the frame (weft's), the moment (globals: the clocks, the stroke, the shock,
// the cosmos's state), the light on the stage, and small tools (hashes, noise, thin film, tone).
#include "weft/frame"

struct Globals {
  // x film time (s), y story time (s), z the world's rate (1 .. 0.01), w u (0..1 of the loop)
  clock: vec4f,
  // the key light: xyz toward it, w its strength; its colour (rgb), w the fill's strength
  key: vec4f, keyCol: vec4f,
  // the drum's own light (the hide lit from inside): xyz where, w strength; rgb colour, w the stroke's flash (0..)
  drumLight: vec4f, drumCol: vec4f,
  // the cosmos's light on the stage (the great membrane's shimmer): rgb, w strength; the sky's ambient (rgb), w ground
  rimCol: vec4f, ambient: vec4f,
  // the drum: xyz the hide's centre, w its radius; the struck point (world), w how hard it's pressed (0..1)
  drum: vec4f, hit: vec4f,
  // the shock out of the great stroke: xyz where it started, w its radius (m, world); x its strength, y its width (m),
  // z the dilation's depth (0 none .. 1 deepest), w the stroke's afterglow (0..1, fading)
  shock: vec4f, shock2: vec4f,
  // the cosmos: x the great membrane's ripple (0..1), y how much of the other universes shows through it, z the foam's
  // ripples, w the hue's drift
  cosmos: vec4f,
  // the great membrane (our universe's wall): xyz its sphere's centre, w its radius
  wall: vec4f,
  // the ripples on it: up to 4 events — xyz where on it (unit, from the centre), w when (film s; < 0 none)
  waves: array<vec4f, 4>,
  // the shaman's glow: x her lines' pulse (0..), y the stroke's light running up her arm (0..1 of the way), z, w
  glow: vec4f,
}
@group(0) @binding(1) var<uniform> G: Globals;

const PI = 3.14159265;
const TAU = 6.2831853;

fn sat(x: f32) -> f32 { return clamp(x, 0.0, 1.0); }
fn sat3(x: vec3f) -> vec3f { return clamp(x, vec3f(0.0), vec3f(1.0)); }
fn luma(c: vec3f) -> f32 { return dot(c, vec3f(0.2126, 0.7152, 0.0722)); }

// ---------------------------------------------------------------- hashes and noise
fn hash11(p: f32) -> f32 { var x = fract(p * 0.1031); x *= x + 33.33; x *= x + x; return fract(x); }
fn hash12(p: vec2f) -> f32 { var p3 = fract(vec3f(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
fn hash13(p: vec3f) -> f32 { var p3 = fract(p * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
fn hash33(p: vec3f) -> vec3f {
  var q = fract(p * vec3f(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yxz + 33.33);
  return fract((q.xxy + q.yxx) * q.zyx);
}
fn vnoise(p: vec3f) -> f32 {
  let i = floor(p); let f = fract(p); let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3f(1, 0, 0)), u.x), mix(hash13(i + vec3f(0, 1, 0)), hash13(i + vec3f(1, 1, 0)), u.x), u.y),
             mix(mix(hash13(i + vec3f(0, 0, 1)), hash13(i + vec3f(1, 0, 1)), u.x), mix(hash13(i + vec3f(0, 1, 1)), hash13(i + vec3f(1, 1, 1)), u.x), u.y), u.z);
}
fn fbm(p: vec3f) -> f32 {
  var a = 0.5; var s = 0.0; var q = p;
  for (var i = 0; i < 5; i++) { s += a * vnoise(q); q = q * 2.03 + vec3f(1.7, 9.2, 3.1); a *= 0.5; }
  return s;
}
// a gyroid turned by the golden angle: cheap, organic, layered (dot noise)
const GOLD = mat3x3f(vec3f(-0.571464913, 0.814921382, 0.096597072), vec3f(-0.278044873, -0.303026659, 0.911518454), vec3f(0.772087367, 0.494042493, 0.399753815));
fn dotNoise(p: vec3f) -> f32 { return dot(cos(GOLD * p), sin(1.618034 * p * GOLD)); }

// ---------------------------------------------------------------- light
/** thin-film interference: the colour of a soap film / a beetle's wing at a view cosine, thickness in nm */
fn thinFilm(cosT: f32, nm: f32) -> vec3f {
  let n = 1.33;
  let ct = sqrt(max(0.0, 1.0 - (1.0 - cosT * cosT) / (n * n)));
  let opd = 2.0 * n * nm * ct;
  let lam = vec3f(650.0, 532.0, 450.0);
  return 0.5 + 0.5 * cos(TAU * opd / lam + vec3f(0.0, 0.0, 0.0));
}
fn fresnel(f0: f32, c: f32) -> f32 { return f0 + (1.0 - f0) * pow(1.0 - sat(c), 5.0); }
fn ggx(N: vec3f, V: vec3f, L: vec3f, rough: f32) -> f32 {
  let H = normalize(V + L);
  let a = rough * rough; let a2 = a * a;
  let nh = max(dot(N, H), 0.0); let nl = max(dot(N, L), 0.0); let nv = max(dot(N, V), 1e-3);
  let d = nh * nh * (a2 - 1.0) + 1.0;
  let D = a2 / (PI * d * d);
  let k = a * 0.5;
  let vis = 1.0 / ((nl * (1.0 - k) + k) * (nv * (1.0 - k) + k));
  return D * vis * nl * 0.25;
}

/** what lights a surface on the stage at p with normal N: the key, the drum's glow (its hide's light, falling off),
 *  the great membrane's shimmer from the sky (a rim), the ambient (sky above, the island's warm bounce below) */
struct StageLight { key: vec3f, keyL: vec3f, drum: vec3f, drumL: vec3f, rim: vec3f, amb: vec3f };
fn stageLight(p: vec3f, N: vec3f) -> StageLight {
  var o: StageLight;
  o.keyL = normalize(G.key.xyz);
  o.key = G.keyCol.rgb * G.key.w;
  let d = G.drumLight.xyz - p;
  let dl = length(d);
  o.drumL = d / max(dl, 1e-3);
  // (the hide is a big disc: its light falls off over its own size, and only on its front side)
  let face = sat(dot(-o.drumL, vec3f(-1.0, 0.0, 0.0)) * 1.5 + 0.2);
  o.drum = G.drumCol.rgb * G.drumLight.w * face / (1.0 + dl * dl * 0.9) * (1.0 + G.drumCol.w);
  o.rim = G.rimCol.rgb * G.rimCol.w;
  let up = N.y * 0.5 + 0.5;
  o.amb = mix(vec3f(0.12, 0.07, 0.05) * G.ambient.w, G.ambient.rgb, up);
  return o;
}

// ---------------------------------------------------------------- the shock (the great stroke's wave through space)
/** how much the shock's front is at p (0..1, a thin shell), and the light it carries */
fn shockAt(p: vec3f) -> f32 {
  if (G.shock2.x <= 0.0) { return 0.0; }
  let r = length(p - G.shock.xyz);
  let d = (r - G.shock.w) / max(G.shock2.y, 1e-3);
  return exp(-d * d) * G.shock2.x;
}

// ---------------------------------------------------------------- tone
fn aces(x: vec3f) -> vec3f {
  let a = 2.51; let b = 0.03; let c = 2.43; let d = 0.59; let e = 0.14;
  return sat3((x * (a * x + b)) / (x * (c * x + d) + e));
}
fn hueShift(c: vec3f, a: f32) -> vec3f {
  let k = vec3f(0.57735);
  let ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}
