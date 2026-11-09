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
  // stroke), w the flash (white-out)
  misc: vec4f,
  // the style's grade: x how cool the depths go under water (×)
  grade: vec4f,
}
@group(2) @binding(0) var<uniform> P: PostU;
@group(2) @binding(1) var src: texture_2d<f32>;
@group(2) @binding(2) var bloomTex: texture_2d<f32>;

override HDR: bool = false;
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
    for (var k = 1; k < 16; k++) {
      let f = (f32(k) - j) / 16.0;
      let w = 1.0 - f;
      acc += hdrAt(uv - toC * amt * f) * w; wsum += w;
    }
    c = acc / wsum;
  }
  c += textureSampleLevel(bloomTex, samp_linear, uv, 0.0).rgb * P.look.y;
  c += vec3f(0.45, 0.85, 0.8) * exp(-ring * ring) * P.shock.w * 0.25;
  c *= P.look.x;
  // (the whole universe's colour drifting while time's out of joint)
  c = max(hueShift(c, P.misc.y), vec3f(0.0));
  c += vec3f(1.0, 0.92, 0.8) * P.misc.w;
  // (under water the light cools a little in the shadows, the depths taking the red)
  c *= mix(vec3f(1.0), vec3f(0.86, 1.0, 1.06), sat(uw * P.grade.x) * 0.6 * (1.0 - sat(luma(c))));
  // the grade: saturation, a warm-cool split
  let l = luma(c);
  c = mix(vec3f(l), c, P.look2.w);
  var m = aces(c * 0.8);
  // vignette, grain
  let v = 1.0 - P.look2.z * dot(toC, toC) * 1.6;
  m *= v;
  // (the grain: brightness only, finer in the dark than in the light — the dark sky doesn't boil)
  let g = (hash12(i.pos.xy + fract(G.clock.x * 13.7) * 100.0) - 0.5) * P.look.w;
  m += g * (0.2 + 0.8 * sqrt(max(luma(m), 0.0)));
  return vec4f(canvasEncode(max(m, vec3f(0.0)), P3), 1.0);
}
