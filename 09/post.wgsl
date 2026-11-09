// The lens: bloom (a mip chain down and back up), the shock's refraction where its shell is seen edge-on, time
// dilation's look (the colour drifting, the edges fringing, the light smeared toward the middle), then the grade and
// the tone, a vignette, grain.
#include "./common"
#include "weft/fullscreen"
#include "weft/output"

struct PostU {
  // x exposure, y bloom strength, z the threshold's knee, w grain
  look: vec4f,
  // x chromatic fringe, y the radial smear (dilation), z vignette, w saturation
  look2: vec4f,
  // the shock's centre on screen (uv), z its ring's radius on screen (uv), w strength
  shock: vec4f,
  // x the source texel size (down/up), y the hue's drift, z under water (0..: the picture swaying after the great
  // stroke), w spare
  misc: vec4f,
  // the style's grade: x how cool the depths go under water (×)
  grade: vec4f,
  // the light pouring out of the glass: xy the hide's middle on screen (uv), z how strong, w how far it reaches
  rays: vec4f,
}
@group(2) @binding(0) var<uniform> P: PostU;
@group(2) @binding(1) var src: texture_2d<f32>;
@group(2) @binding(2) var bloomTex: texture_2d<f32>;

// (an HDR film, tools/render.mjs --hdr: the picture's lights let past paper white, and the signal written as HLG in
// BT.2020, which the film sink encodes as it comes)
override HDR: bool = false;
// (the zoom blur's and the light's rays' taps: fewer live on a laptop's GPU, each pixel's start jittered either way)
override ZOOM_TAPS: i32 = 16;
override RAY_TAPS: i32 = 28;
override P3: bool = false;

// (a pixel gone infinite or NaN somewhere in the scene — a degenerate normal, a specular singularity — must never
// reach the bloom, where one bad pixel becomes a white disc for a frame: such values are dropped, the rest held under
// a ceiling far above anything lit)
fn sane1(x: f32) -> f32 { return select(clamp(x, 0.0, 256.0), 0.0, (bitcast<u32>(x) & 0x7f800000u) == 0x7f800000u); }
fn sane(c: vec3f) -> vec3f { return vec3f(sane1(c.r), sane1(c.g), sane1(c.b)); }
fn tap(uv: vec2f) -> vec3f { return sane(textureSampleLevel(src, samp_linear, uv, 0.0).rgb); }

@fragment fn fs_down(i: FullscreenOut) -> @location(0) vec4f {
  let ts = 1.0 / vec2f(textureDimensions(src));
  let uv = i.uv;
  // (13 taps, the "call of duty" downsample: no fireflies)
  let a = tap(uv + ts * vec2f(-2.0, -2.0)); let b = tap(uv + ts * vec2f(0.0, -2.0)); let c = tap(uv + ts * vec2f(2.0, -2.0));
  let d = tap(uv + ts * vec2f(-1.0, -1.0)); let e = tap(uv + ts * vec2f(1.0, -1.0));
  let f = tap(uv + ts * vec2f(-2.0, 0.0)); let g = tap(uv); let h = tap(uv + ts * vec2f(2.0, 0.0));
  let j = tap(uv + ts * vec2f(-1.0, 1.0)); let k = tap(uv + ts * vec2f(1.0, 1.0));
  let l = tap(uv + ts * vec2f(-2.0, 2.0)); let m = tap(uv + ts * vec2f(0.0, 2.0)); let n = tap(uv + ts * vec2f(2.0, 2.0));
  var o = (d + e + j + k) * 0.125 + (a + c + l + n) * 0.03125 + (b + f + h + m) * 0.0625 + g * 0.125;
  if (P.misc.x > 0.5) {
    // the first level: only what's bright (a soft knee), clamped
    let br = max(o.r, max(o.g, o.b));
    let kk = P.look.z;
    let w = sat((br - kk * 0.5) / max(kk, 1e-3));
    o = min(o * w * w, vec3f(60.0));
  }
  return vec4f(o, 1.0);
}
@fragment fn fs_up(i: FullscreenOut) -> @location(0) vec4f {
  let ts = 1.0 / vec2f(textureDimensions(src));
  let uv = i.uv;
  let s = tap(uv + ts * vec2f(-1.0, -1.0)) + tap(uv + ts * vec2f(1.0, -1.0)) + tap(uv + ts * vec2f(-1.0, 1.0)) + tap(uv + ts * vec2f(1.0, 1.0))
    + 2.0 * (tap(uv + ts * vec2f(0.0, -1.0)) + tap(uv + ts * vec2f(0.0, 1.0)) + tap(uv + ts * vec2f(-1.0, 0.0)) + tap(uv + ts * vec2f(1.0, 0.0)))
    + 4.0 * tap(uv);
  return vec4f(s / 16.0 * 0.85, 1.0);
}

/** the HDR picture from the scene's light `c` and its SDR picture `s` (paper white 1 in both): the same picture up to
 *  its lights, which keep climbing past white — and keep their colour — up to HDR_PEAK × white */
const HDR_PEAK = 4.93;   // 1000 nits over a 203 nit white
fn pastWhite(c: vec3f, s: vec3f) -> vec3f {
  let top = max(c.r, max(c.g, c.b));
  let t = max(mix(luma(c), top, 0.5) - 0.55, 0.0);
  let k = t * t / (t * t + 3.0 * t + 1.5);
  let hue = mix(c / max(top, 1e-4), vec3f(1.0), 0.3 * k);
  return s + hue * (HDR_PEAK - 1.0) * k;
}
/** display light (linear, Rec.709 primaries, 1 = a 203 nit white) as the HLG signal in BT.2020, for a 1000 nit screen */
fn hlg(c: vec3f) -> vec3f {
  let w = mat3x3f(0.6274, 0.0691, 0.0164, 0.3293, 0.9195, 0.0880, 0.0433, 0.0114, 0.8956) * c * (203.0 / 1000.0);
  // (the screen's light back to the scene's: HLG's system gamma, 1.2 at 1000 nits, undone)
  let y = max(dot(w, vec3f(0.2627, 0.6780, 0.0593)), 1e-6);
  let e = clamp(w * pow(y, (1.0 - 1.2) / 1.2), vec3f(0.0), vec3f(1.0));
  return select(0.17883277 * log(max(12.0 * e - 0.28466892, vec3f(1e-6))) + 0.55991073, sqrt(3.0 * e), e <= vec3f(1.0 / 12.0));
}

fn hdrAt(uv: vec2f) -> vec3f { return sane(textureSampleLevel(src, samp_linear, uv, 0.0).rgb); }

@fragment fn fs_final(i: FullscreenOut) -> @location(0) vec4f {
  var uv = i.uv;
  let asp = frame.res.x / frame.res.y;
  // under water: the picture swaying, slow and layered, as through moving water
  let uw = P.misc.z;
  if (uw > 0.0) {
    let tt = G.clock.x;
    uv += uw * 0.0022 * vec2f(sin(uv.y * 11.0 + tt * 1.1) + 0.5 * sin(uv.y * 23.0 - tt * 1.7 + uv.x * 5.0),
      cos(uv.x * 9.0 - tt * 0.9) + 0.5 * cos(uv.x * 19.0 + tt * 1.4 + uv.y * 4.0));
  }
  // the shock's ring: the picture bent outward across it, a bright edge
  let sc = P.shock.xy;
  var dv = (uv - sc) * vec2f(asp, 1.0);
  let dl = length(dv);
  let ring = (dl - P.shock.z) / 0.035;
  let bend = P.shock.w * exp(-ring * ring) * ring * -0.03;
  uv += normalize(dv + vec2f(1e-5)) / vec2f(asp, 1.0) * bend;
  // dilation's smear toward the middle and the colour's fringe
  let toC = uv - 0.5;
  // (both nothing at the middle, where the eye is — the struck hide stays sharp — and growing toward the edges)
  let r2 = dot(toC, toC);
  let fr = P.look2.x * 0.012 * r2;
  var c = vec3f(hdrAt(uv - toC * fr).r, hdrAt(uv).g, hdrAt(uv + toC * fr).b);
  if (P.look2.y > 0.001) {
    // (a zoom blur: 16 taps, each pixel's start jittered so its steps never show as ghost copies)
    var acc = c; var wsum = 1.0;
    let j = hash12(i.pos.xy);
    let amt = P.look2.y * smoothstep(0.0, 0.25, r2);
    for (var k = 1; k < ZOOM_TAPS; k++) {
      let f = (f32(k) - j) / f32(ZOOM_TAPS);
      let w = 1.0 - f;
      acc += hdrAt(uv - toC * amt * f) * w; wsum += w;
    }
    c = acc / wsum;
  }
  c += textureSampleLevel(bloomTex, samp_linear, uv, 0.0).rgb * P.look.y;
  // the realm's light pouring out through the glass: its glow streaked out from the hide's middle across the picture
  // (the bloom gathered along the way back toward it; whatever stands dark in front of it, her, cuts shadows in it)
  if (P.rays.z > 0.001) {
    let d = (P.rays.xy - uv) / f32(RAY_TAPS) * P.rays.w;
    var p = uv + d * hash12(i.pos.xy + 3.7);
    var acc = vec3f(0.0);
    var w = 1.0;
    // (the falloff per tap matched to the count, so the rays reach as far whatever it is)
    let fall = pow(0.94, 28.0 / f32(RAY_TAPS));
    for (var k = 0; k < RAY_TAPS; k++) { acc += textureSampleLevel(bloomTex, samp_linear, p, 0.0).rgb * w; w *= fall; p += d; }
    c += acc / f32(RAY_TAPS) * P.rays.z;
  }
  c += vec3f(0.45, 0.85, 0.8) * exp(-ring * ring) * P.shock.w * 0.25;
  c *= P.look.x;
  // (the whole universe's colour drifting while time's out of joint)
  c = max(hueShift(c, P.misc.y), vec3f(0.0));
  // (under water the light cools a little in the shadows, the depths taking the red)
  c *= mix(vec3f(1.0), vec3f(0.86, 1.0, 1.06), sat(uw * P.grade.x) * 0.6 * (1.0 - sat(luma(c))));
  // the grade: saturation, a warm-cool split
  let l = luma(c);
  c = mix(vec3f(l), c, P.look2.w);
  var m = aces(c * 0.8);
  if (HDR) { m = pastWhite(c * 0.8, m); }
  // vignette, grain
  let v = 1.0 - P.look2.z * dot(toC, toC) * 1.6;
  m *= v;
  // (the grain: brightness only, finer in the dark than in the light — the dark sky doesn't boil)
  let g = (hash12(i.pos.xy + fract(G.clock.x * 13.7) * 100.0) - 0.5) * P.look.w;
  m += g * (0.2 + 0.8 * sqrt(max(luma(m), 0.0)));
  if (HDR) { return vec4f(hlg(max(m, vec3f(0.0))), 1.0); }
  return vec4f(canvasEncode(max(m, vec3f(0.0)), P3), 1.0);
}
