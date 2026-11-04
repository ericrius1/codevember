// Gyre: forty nested hoops, each a thin glazed band, turning over about a diameter in a cascade from the outside in,
// the whole slowly yawing. Sphere-traced in one fullscreen pass over a studio floor: a soft key, a hemisphere fill,
// a cool rim, a softbox in the glaze, raymarched soft shadows and AO, tone-mapped and dithered for the film.
#include "weft/frame"
#include "weft/fullscreen"
#include "weft/output"

const N = 40;
const PI = 3.14159265;

struct Gyre {
  // per ring: cos yaw, sin yaw, cos tilt, sin tilt (the CPU's choreography, main.ts)
  rings: array<vec4f, N>,
  outer: f32,         // @range(0.5, 1.5)
  inner: f32,         // @range(0.05, 0.6)
  width: f32,         // @range(0.002, 0.02)  the band's radial thickness
  height: f32,        // @range(0.01, 0.12)   its height
  floorY: f32,        // @range(-2, -0.8)
  exposure: f32,      // @range(0.2, 3)
  seed: f32,
  _pad: f32,
}
@group(1) @binding(0) var<uniform> gyre: Gyre;

fn dR() -> f32 { return (gyre.outer - gyre.inner) / f32(N - 1); }
fn radius(i: i32) -> f32 { return gyre.outer - f32(i) * dR(); }

// world → ring i's own frame (its band in the xz plane)
fn toRing(p: vec3f, i: i32) -> vec3f {
  let r = gyre.rings[i];
  let a = vec3f(r.x * p.x - r.y * p.z, p.y, r.y * p.x + r.x * p.z);
  return vec3f(a.x, r.z * a.y + r.w * a.z, -r.w * a.y + r.z * a.z);
}
fn fromRing(q: vec3f, i: i32) -> vec3f {
  let r = gyre.rings[i];
  let a = vec3f(q.x, r.z * q.y - r.w * q.z, r.w * q.y + r.z * q.z);
  return vec3f(r.x * a.x + r.y * a.z, a.y, -r.y * a.x + r.x * a.z);
}

// a band: a rounded rectangle swept round the ring
fn band(q: vec3f, R: f32) -> f32 {
  let w = gyre.width * 0.5;
  let h = gyre.height * 0.5;
  let rr = min(0.0024, w * 0.9);
  let d = vec2f(length(q.xz) - (R - w), q.y);
  let b = abs(d) - vec2f(w - rr, h - rr);
  return length(max(b, vec2f(0.0))) + min(max(b.x, b.y), 0.0) - rr;
}

// the hoops: rings are walked outward from the one whose shell |p| = R is nearest (both ways at once), and the walk
// stops once the shell bound alone is past the best distance found; a ring is only traced when its slab (|p · n| <=
// height / 2) allows it too. So the field is exact, which the soft shadows need, at a few rings a step.
struct Hit { d: f32, ring: i32 }
fn ringAt(p: vec3f, i: i32, best: Hit) -> Hit {
  let g = gyre.rings[i];
  let n = vec3f(g.y * g.w, g.z, g.x * g.w);
  if (abs(dot(p, n)) - gyre.height * 0.5 >= best.d) { return best; }
  let d = band(toRing(p, i), radius(i));
  if (d < best.d) { return Hit(d, i); }
  return best;
}
fn hoops(p: vec3f) -> Hit {
  let r = length(p);
  let s = dR();
  let ext = gyre.width + gyre.height * gyre.height / (8.0 * gyre.inner);
  let x = (gyre.outer - r) / s;
  let c = i32(clamp(round(x), 0.0, f32(N - 1)));
  var h = ringAt(p, c, Hit(1e3, -1));
  for (var k = 1; k < N; k++) {
    let lo = c - k;
    let hi = c + k;
    // (the shell bound of the nearer of the two; rings past either end don't exist)
    let bLo = select(1e3, abs(r - radius(lo)) - ext, lo >= 0);
    let bHi = select(1e3, abs(r - radius(hi)) - ext, hi < N);
    if (min(bLo, bHi) >= h.d) { break; }
    if (bLo < h.d) { h = ringAt(p, lo, h); }
    if (bHi < h.d) { h = ringAt(p, hi, h); }
  }
  return h;
}
fn map(p: vec3f) -> f32 { return hoops(p).d; }

fn sphere(ro: vec3f, rd: vec3f, rad: f32) -> vec2f {
  let b = dot(ro, rd);
  let c = dot(ro, ro) - rad * rad;
  let h = b * b - c;
  if (h < 0.0) { return vec2f(-1.0); }
  let s = sqrt(h);
  return vec2f(-b - s, -b + s);
}
fn bound() -> f32 { return gyre.outer + 0.01; }

fn normal(p: vec3f) -> vec3f {
  let e = vec2f(1.0, -1.0) * 0.00025;
  return normalize(e.xyy * map(p + e.xyy) + e.yyx * map(p + e.yyx) + e.yxy * map(p + e.yxy) + e.xxx * map(p + e.xxx));
}

// soft shadow toward the key (iq's improved penumbra), only through the hoops' sphere
fn shadow(ro: vec3f, rd: vec3f, k: f32) -> f32 {
  let s = sphere(ro, rd, bound());
  if (s.y < 0.0) { return 1.0; }
  var t = max(s.x, 0.004);
  var res = 1.0;
  var ph = 1e10;
  for (var i = 0; i < 160; i++) {
    let h = map(ro + rd * t);
    let y = h * h / (2.0 * ph);
    let d = sqrt(max(h * h - y * y, 0.0));
    res = min(res, k * d / max(0.0, t - y));
    ph = h;
    t += clamp(h, 0.003, 0.08);
    if (res < 0.002 || t > s.y) { break; }
  }
  res = clamp(res, 0.0, 1.0);
  return res * res * (3.0 - 2.0 * res);
}

fn ao(p: vec3f, n: vec3f, scale: f32) -> f32 {
  var occ = 0.0;
  var w = 1.0;
  for (var i = 1; i <= 5; i++) {
    let h = scale * f32(i) / 5.0;
    occ += (h - map(p + n * h)) * w;
    w *= 0.7;
  }
  return clamp(1.0 - occ * 1.3 / scale, 0.0, 1.0);
}

// ---------------------------------------------------------------- the look
const KEY = vec3f(-0.46, 0.80, 0.46);
const KEY_COL = vec3f(1.0, 0.95, 0.88);
const RIM = vec3f(0.55, 0.35, -0.76);
const RIM_COL = vec3f(0.75, 0.85, 1.0);
const PAPER = vec3f(0.80, 0.765, 0.715);   // the floor, linear

fn palette(x: f32) -> vec3f {
  // outer → inner: oxblood, terracotta, saffron, sage, teal, ink (linear)
  let c = array<vec3f, 6>(vec3f(0.80, 0.10, 0.06), vec3f(0.95, 0.32, 0.06), vec3f(0.98, 0.66, 0.12),
    vec3f(0.22, 0.55, 0.36), vec3f(0.05, 0.38, 0.62), vec3f(0.22, 0.14, 0.55));
  let f = clamp(x, 0.0, 1.0) * 5.0;
  let i = min(i32(f), 4);
  return mix(c[i], c[i + 1], smoothstep(0.0, 1.0, f - f32(i)));
}

// the studio the glaze reflects: the paper sweep, a big softbox up at the key, a strip at the rim
fn studio(r: vec3f) -> vec3f {
  let up = r.y * 0.5 + 0.5;
  var c = mix(PAPER * 0.55, PAPER * 1.05, smoothstep(0.2, 0.7, up));
  let k = dot(r, normalize(KEY));
  c += KEY_COL * 5.0 * smoothstep(0.90, 0.96, k);
  c += RIM_COL * 1.6 * smoothstep(0.93, 0.975, dot(r, normalize(RIM)));
  return c;
}

fn ggx(n: vec3f, v: vec3f, l: vec3f, rough: f32) -> f32 {
  let h = normalize(v + l);
  let a = rough * rough;
  let a2 = a * a;
  let nh = max(dot(n, h), 0.0);
  let nl = max(dot(n, l), 0.0);
  let nv = max(dot(n, v), 1e-3);
  let d = a2 / (PI * pow(nh * nh * (a2 - 1.0) + 1.0, 2.0));
  let k = a * 0.5;
  let g = nl / (nl * (1.0 - k) + k) * nv / (nv * (1.0 - k) + k);
  return d * g / (4.0 * nv * nl + 1e-4) * nl;
}

// the floor's light, unshadowed: the background is this too, so the sweep has no horizon
fn paperLit() -> vec3f {
  return PAPER * (KEY_COL * 1.15 * max(normalize(KEY).y, 0.0) + vec3f(0.42, 0.43, 0.46));
}

fn shadeFloor(p: vec3f, rd: vec3f, t: f32) -> vec3f {
  let l = normalize(KEY);
  let sh = shadow(p, l, 14.0);
  // occlusion under the hoops: how much of the sky the sculpture hides, from the point's distance under it
  let above = vec3f(p.x, 0.0, p.z);
  let rr = length(above);
  let o = 1.0 - 0.38 * exp(-rr * rr * 1.2) * smoothstep(gyre.outer * 1.6, 0.0, rr);
  let c = PAPER * (KEY_COL * 1.15 * max(l.y, 0.0) * mix(0.28, 1.0, sh) + vec3f(0.42, 0.43, 0.46) * o);
  return mix(c, paperLit(), smoothstep(5.0, 14.0, t));
}

fn shadeHoop(p: vec3f, rd: vec3f, ring: i32) -> vec3f {
  let n = normal(p);
  let v = -rd;
  let l = normalize(KEY);
  // which face: outside, inside or rim, from the normal in the ring's frame
  let q = toRing(p, ring);
  let nq = toRing(n, ring);
  let radial = dot(nq.xz, normalize(q.xz));
  let x = f32(ring) / f32(N - 1);
  let col = palette(x);
  var albedo = mix(vec3f(0.86, 0.83, 0.78), col, 0.10);   // the outside: bone-white glaze, a breath of the colour
  var metal = 0.0;
  var rough = 0.32;
  if (radial < -0.6) { albedo = col; rough = 0.26; }  // the inside: the colour
  else if (radial < 0.6) { albedo = vec3f(1.0, 0.74, 0.36); metal = 1.0; rough = 0.24; }  // the rims: gold leaf
  let f0 = mix(vec3f(0.04), albedo, metal);
  let nv = max(dot(n, v), 0.0);
  let fres = f0 + (vec3f(1.0) - f0) * pow(1.0 - nv, 5.0);
  let sh = shadow(p + n * 0.0015, l, 7.0);
  let occ = ao(p, n, 0.05);
  let diff = albedo * (1.0 - metal);
  var c = diff * KEY_COL * 1.15 * max(dot(n, l), 0.0) * sh;
  // the fill: the room, warm from the paper below, cool from above
  c += diff * mix(vec3f(0.42, 0.38, 0.34), vec3f(0.60, 0.62, 0.66), n.y * 0.5 + 0.5) * mix(0.3, 1.0, occ);
  // the paper's bounce, from below
  c += diff * PAPER * 0.22 * max(-n.y, 0.0);
  c += diff * RIM_COL * 0.35 * max(dot(n, normalize(RIM)), 0.0) * occ;
  // the glaze: the key's highlight, the studio reflected
  let spec = mix(vec3f(1.0), albedo, metal);
  c += spec * KEY_COL * 1.15 * ggx(n, v, l, rough) * sh;
  let r = reflect(rd, n);
  c += fres * studio(r) * occ * mix(0.55, 1.0, metal) * (1.0 - rough * 0.6);
  return c;
}

// Khronos PBR Neutral: keeps the glazes' hues as they are
fn neutral(cIn: vec3f) -> vec3f {
  var c = cIn;
  let x = min(c.r, min(c.g, c.b));
  let off = select(0.04, x - 6.25 * x * x, x < 0.08);
  c -= off;
  let peak = max(c.r, max(c.g, c.b));
  if (peak < 0.8) { return c; }
  let d = 0.2;
  let np = 1.0 - d * d / (peak + d - 0.8);
  c *= np / peak;
  let g = 1.0 - 1.0 / (0.15 * (peak - np) + 1.0);
  return mix(c, vec3f(np), g);
}

fn hash(p: vec3f) -> f32 {
  var q = fract(p * vec3f(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yxz + 33.33);
  return fract((q.x + q.y) * q.z);
}

@fragment fn fs(i: FullscreenOut) -> @location(0) vec4f {
  let ro = frame.camPos;
  let rd = viewRay(i.uv);
  var c = paperLit();
  // the sweep: a touch darker toward the top of the frame, as a paper sweep falls off away from the light
  c *= mix(1.0, 0.86, smoothstep(0.45, 1.0, rd.y * 0.5 + 0.5 + 0.25));
  var hitHoop = false;
  let s = sphere(ro, rd, bound());
  if (s.y > 0.0) {
    var t = max(s.x, 0.0);
    let px = 1.6 * frame.invRes.y / frame.proj[1][1];   // a pixel's size per unit of distance
    for (var k = 0; k < 220; k++) {
      let h = hoops(ro + rd * t);
      if (h.d < px * t * 0.35) {
        c = shadeHoop(ro + rd * t, rd, h.ring);
        hitHoop = true;
        break;
      }
      t += h.d;
      if (t > s.y) { break; }
    }
  }
  if (!hitHoop && rd.y < 0.0) {
    let t = (gyre.floorY - ro.y) / rd.y;
    c = shadeFloor(ro + rd * t, rd, t);
    // the sweep's top falls off the same way
    c *= mix(1.0, 0.86, smoothstep(0.45, 1.0, rd.y * 0.5 + 0.5 + 0.25));
  }
  var m = neutral(c * gyre.exposure);
  // a soft vignette, and dither so the film's gradients don't band
  let d = distance(i.uv, vec2f(0.5));
  m *= 1.0 - 0.18 * smoothstep(0.35, 0.85, d);
  let e = canvasEncode(m, false);
  let n = hash(vec3f(i.pos.xy, gyre.seed)) + hash(vec3f(i.pos.yx + 17.0, gyre.seed)) - 1.0;
  return vec4f(e + n / 255.0, 1.0);
}
