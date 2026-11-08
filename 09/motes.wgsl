// Motes: spores and specks of light drifting round the dais on the story clock (so they stand still as time dilates),
// on paths periodic in the loop's story length (the loop closes), blown out by the great stroke's shock; and a burst of
// sparks off the hide where the beater lands, spraying out on the membrane's own clock. No state: every mote's place is
// a function of the moment, so a still or a scrub is exact.
#include "./common"

struct MoteU {
  // x story time, y the loop's story length, z the burst's age (its own clock), w the burst's strength
  t: vec4f,
  // the burst's origin (the struck point), w how far the shock has blown the motes out (m at the front)
  burst: vec4f,
}
@group(2) @binding(0) var<uniform> MU: MoteU;

const SPARKS = 900u;
struct MoteOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) col: vec3f,
};
@vertex fn vsMote(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> MoteOut {
  var o: MoteOut;
  let h = hash33(vec3f(f32(ii), 1.7, 9.3));
  let h2 = hash33(vec3f(f32(ii), 4.1, 2.2));
  let s = MU.t.x; let L = MU.t.y;
  var p: vec3f; var size: f32; var col: vec3f;
  if (ii < SPARKS) {
    // a spark: out of the hide in a cone round its normal (-x), falling a little, fading
    let age = MU.t.z;
    if (MU.t.w <= 0.0 || age <= 0.0) { o.pos = vec4f(0.0, 0.0, -2.0, 1.0); return o; }
    let a = h.x * TAU; let c = mix(0.25, 1.0, h.y);
    let dir = normalize(vec3f(-c, sqrt(1.0 - c * c) * sin(a), sqrt(1.0 - c * c) * cos(a)));
    let v = mix(0.6, 3.5, h.z * h.z);
    p = MU.burst.xyz + dir * v * age + vec3f(0.0, -0.3 * age * age, 0.0);
    let life = 1.0 - smoothstep(0.4 + h2.x * 1.6, 2.6, age);
    size = mix(0.003, 0.009, h2.y) * life;
    col = mix(vec3f(1.0, 0.65, 0.2), vec3f(0.3, 1.0, 0.9), step(0.6, h2.z)) * 1.1 * life * MU.t.w;
  } else {
    // a mote: round the dais, drifting on loops of the loop's own story length
    let r = mix(0.4, 5.5, sqrt(h.x));
    let a0 = h.y * TAU;
    let base = vec3f(-0.3 + cos(a0) * r, mix(0.05, 3.6, h.z), 0.2 + sin(a0) * r);
    let w1 = TAU / L * (1.0 + floor(h2.x * 3.0)); let w2 = TAU / L * (2.0 + floor(h2.y * 3.0));
    p = base + vec3f(sin(s * w1 + h2.z * 9.0), 0.6 * sin(s * w2 + h.x * 7.0), cos(s * w1 * 1.0 + h2.y * 5.0)) * mix(0.15, 0.6, h2.x);
    // the shock blows them out from the drum, and they drift back as it fades
    let d = p - MU.burst.xyz;
    let dl = length(d);
    p += d / max(dl, 1e-3) * MU.burst.w * smoothstep(MU.burst.w * 3.0 + 0.5, 0.0, dl - 0.3);
    size = mix(0.002, 0.007, h2.z * h2.z);
    let tw = 0.6 + 0.4 * sin(s * TAU / L * 7.0 + h.x * 40.0);
    col = mix(vec3f(0.9, 0.6, 0.25), vec3f(0.35, 1.0, 0.85), step(0.55, h.z)) * (0.6 + 1.6 * G.drumCol.w) * tw;
  }
  // (nothing right at the lens: what drifts too close fades and shrinks away)
  let dc = length(p - frame.camPos);
  let near = smoothstep(0.25, 0.9, dc);
  col *= near; size *= near;
  // a camera-facing quad
  let corner = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0))[vi];
  let wp = p + (frame.camRight * corner.x + frame.camUp * corner.y) * size * 3.0;
  o.pos = frame.viewProj * vec4f(wp, 1.0);
  o.uv = corner;
  o.col = col;
  return o;
}
@fragment fn fsMote(i: MoteOut) -> @location(0) vec4f {
  let r = length(i.uv);
  let g = exp(-r * r * 4.0) + 0.4 * exp(-r * r * 30.0);
  return vec4f(i.col * g, 0.0);
}
