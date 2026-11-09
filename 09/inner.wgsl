// The world inside the drum (design/ref-inner.jpg): what the hide shows when it thins to a veil — a vision, bigger on
// the inside than the drum. A corridor of gateways runs away from the hide to a white-gold source of light, endlessly:
// each gateway an arch framed in a band of stepped, nested diamonds (the Shipibo kené's way of line), the wall round it
// a lattice of lit lines and niches, threads of light falling from it into the haze; mirrored left to right about the
// drum's axis, a spine of beads up its middle, a violet haze deepening into gold toward the source. The gateways flow
// toward the hide, slowly, for ever (the farthest coming out of the light, the nearest passing through the hide), and
// as the trip deepens they turn against each other, breathe, and their colours wander.
//
// Each gateway is a plane across the corridor: a ray through the hide meets them one after another, front to back,
// each drawn where the ray crosses it (its pattern at the ray's footprint there, so the far ones don't shimmer) and
// laid over what's behind by its own cover. (Included by drum.wgsl, after common.)

const INNER_LAYERS = 14;
/** realm units a metre (the hide's 0.85 m is about one unit across its radius) */
const INNER_SCALE = 1.25;

fn innerRot(a: f32) -> mat2x2f { let c = cos(a); let s = sin(a); return mat2x2f(c, s, -s, c); }

/** the opening of a gateway: signed distance (realm units, negative inside) — straight sides, a round top */
fn innerArch(p: vec2f, w: f32, h: f32) -> f32 {
  let q = vec2f(abs(p.x), p.y);
  let side = q.x - w;
  let top = length(q - vec2f(0.0, h)) - w;
  return select(side, top, q.y > h);
}

/** the kené: nested stepped diamonds in cells — its lines' distance (0 on a line), the lines `lw` wide */
fn innerKene(p: vec2f, steps: f32) -> f32 {
  let f = fract(p) - 0.5;
  // (stepped: the diamond's distance quantised along each axis, so its edges run as stairs)
  let q = abs(f);
  let s = floor(q * steps) / steps;
  let d = max(q.x + s.y, s.x + q.y);
  let rings = abs(fract(d * 2.0 + 0.1) - 0.5) / 2.0;
  // (and the cross through each cell, the pattern's spine, thick)
  let cross_ = min(q.x, q.y);
  return min(rings, cross_ * 0.6);
}

/** a soft line: 1 on it, falling over `w` (the pixel's footprint widens it, and fades it toward its mean) */
fn innerLine(d: f32, w: f32, fp: f32) -> f32 {
  let ww = max(w, fp);
  return (1.0 - smoothstep(ww * 0.5, ww * 1.5, d)) * min(1.0, w / ww);
}

/** the jewel colours, by a phase (0..1 round the wheel): gold, turquoise, emerald, violet, magenta */
fn innerJewel(x: f32) -> vec3f {
  let k = fract(x) * 5.0;
  let c0 = vec3f(1.0, 0.72, 0.28); let c1 = vec3f(0.25, 0.95, 0.9); let c2 = vec3f(0.3, 1.0, 0.45);
  let c3 = vec3f(0.55, 0.3, 1.0); let c4 = vec3f(1.0, 0.3, 0.75);
  let i = floor(k); let f = smoothstep(0.0, 1.0, k - i);
  var a = c0; var b = c1;
  if (i == 1.0) { a = c1; b = c2; } else if (i == 2.0) { a = c2; b = c3; } else if (i == 3.0) { a = c3; b = c4; } else if (i == 4.0) { a = c4; b = c0; }
  return mix(a, b, f);
}

/** the realm seen along a ray: ro, rd in the world (ro on the hide), T its clock (s), trip 0..1, px the pixel's angle */
fn innerWorld(roW: vec3f, rdW: vec3f, T: f32, trip: f32, px: f32) -> vec3f {
  let C = D.center.xyz;
  // (the realm's frame: x across (world z), y up, z into the drum (world x))
  let ro = vec3f(roW.z - C.z, roW.y - C.y, roW.x - C.x) * INNER_SCALE;
  let rd = normalize(vec3f(rdW.z, rdW.y, rdW.x));
  // the source, at the corridor's end: a point of white-gold light in a wide halo, the dark round it violet
  let off = length(rd.xy) / max(rd.z, 0.05);
  var bg = vec3f(1.0, 0.9, 0.7) * (exp(-off * off * 400.0) * 6.0 + exp(-off * 6.0) * 0.6) + vec3f(1.0, 0.45, 0.15) * exp(-off * 2.2) * 0.3;
  bg += vec3f(0.16, 0.04, 0.26) * 0.5;
  if (rd.z <= 0.02) { return bg; }
  let gap = 0.55 * (1.0 + 0.07 * sin(T * 0.45) * (0.4 + trip));
  let flow = T * 0.13 * (0.6 + 0.9 * trip);
  let ph = fract(flow / gap);
  let base = floor(flow / gap);
  var col = vec3f(0.0);
  var trans = 1.0;
  for (var k = 0; k < INNER_LAYERS; k++) {
    let z = (f32(k) + 1.0 - ph) * gap;
    let t = (z - ro.z) / rd.z;
    if (t <= 0.0) { continue; }
    let id = f32(k) + base;
    // (the corridor narrows as it goes — its gateways each smaller than the one before, beyond what perspective does)
    let sz = exp(-z * 0.11);
    let p0 = (ro.xy + rd.xy * t) / sz;
    // (each gateway turned a little against its neighbours as the trip deepens, breathing)
    let spin = (select(-1.0, 1.0, (i32(id) & 1) == 0)) * trip * 0.3 * sin(T * 0.21 + id * 0.7) + 0.04 * sin(T * 0.13);
    let p = innerRot(spin) * p0;
    let fp = t * px * 1.4 / sz;
    // the opening: straight sides, a round top, a little different each
    let w = 0.6 + 0.04 * sin(id * 1.9);
    let h = 0.15;
    let sd = innerArch(p, w, h);
    // its frame: a band round the opening, carved with the kené
    let bw = 0.16;
    let inFrame = smoothstep(-fp, fp, sd) * (1.0 - smoothstep(bw - fp, bw + fp, sd));
    let across = sat(sd / bw);
    // (along the band: the arch's length; across it: 0..1)
    let along = select(p.y, h + atan2(abs(p.x), p.y - h) * w, p.y > h);
    let kd = innerKene(vec2f(along * 3.2, across * 0.95 + 0.02), 4.0);
    let lines = innerLine(kd, 0.045, fp * 3.2);
    // (the frame's rims: a bright bead of gold at each edge)
    let rims = innerLine(min(abs(sd), abs(sd - bw)), 0.012, fp);
    // the wall beyond: dark, carved in tiers of niches, each outlined in light, mirrored
    let ap = vec2f(abs(p.x), p.y);
    let cell = vec2f(0.42, 0.5);
    let wc = (ap - vec2f(w + bw, 0.0)) / cell;
    let wf = fract(wc) - vec2f(0.5, 0.3);
    let niche = innerArch(wf * cell, 0.1, 0.05);
    let nicheLine = innerLine(abs(niche), 0.01, fp);
    let nicheIn = 1.0 - smoothstep(-fp, fp, niche);
    let wall = smoothstep(bw - fp, bw + fp * 2.0, sd);
    // threads of light pouring from the niches into the dark below them
    let fallX = abs(fract(wc.x) - 0.5) * cell.x;
    let fall = innerLine(fallX, 0.008, fp) * (0.5 + 0.5 * sin(p.y * 26.0 + T * 3.2 + floor(wc.x) * 2.1)) * step(wf.y, -0.08) * step(0.45, hash12(floor(wc) + id * 3.1));
    // the spine of beads up the middle, over the arch, and a jewel at its keystone
    let bead = innerLine(length(vec2f(p.x, fract(p.y * 8.0) / 8.0 - 0.0625)), 0.016, fp) * step(h + w + bw + 0.03, p.y);
    let key = innerLine(length(p - vec2f(0.0, h + w + bw * 0.5)), 0.05, fp);
    // colours: the frame gold, its lines and the wall's light through the jewels (wandering more as the trip deepens)
    let hue = id * 0.21 + T * 0.015 * (0.3 + trip) + trip * 0.3 * sin(T * 0.11 + id);
    let gold = vec3f(1.0, 0.52, 0.1);
    let lineC = mix(vec3f(0.25, 0.95, 0.88), innerJewel(hue + 0.2 + 0.1 * sin(along * 2.0)), 0.3 + 0.5 * trip);
    let wallC = innerJewel(hue + 0.55);
    // (the wall darkening away from its gateway: the light's from the opening)
    let wallLit = exp(-max(sd - bw, 0.0) * 2.2);
    // (lit from the source behind: the far ones brighter; the frame's inner edge catching the light through it)
    let depthK = sat(z / (f32(INNER_LAYERS) * gap));
    let lit = 0.35 + 1.3 * depthK * depthK;
    // (the band bevelled: brightest along its middle, the light from the opening on its inner edge)
    let bevel = sin(across * PI);
    var c = (gold * (0.08 + 0.4 * bevel + 0.25 * (1.0 - across)) * (1.0 - 0.7 * lines) + lineC * lines * 1.6 + vec3f(1.0, 0.75, 0.35) * rims * 1.5) * inFrame;
    c += (vec3f(0.03, 0.012, 0.05) + (wallC * (nicheLine * 1.3 + nicheIn * 0.1) + vec3f(1.0, 0.85, 0.6) * fall * 1.2) * wallLit) * wall;
    c += vec3f(1.0, 0.75, 0.35) * bead * 1.6 + innerJewel(hue + 0.4) * key * 2.0;
    let a = sat(inFrame + wall * 0.94);
    // (the nearest fades as it passes through the hide, the farthest comes out of the light)
    let fade = smoothstep(0.0, gap * 0.8, z - ro.z) * (1.0 - smoothstep(f32(INNER_LAYERS - 4) * gap, f32(INNER_LAYERS) * gap, z));
    // the haze between: violet near, gold toward the source
    let haze = 1.0 - exp(-t * 0.07);
    let hazeC = mix(vec3f(0.22, 0.06, 0.32), vec3f(1.0, 0.7, 0.4), depthK * depthK);
    c = mix(c * lit, hazeC, haze * 0.3);
    col += trans * a * fade * c;
    trans *= 1.0 - a * fade;
    if (trans < 0.02) { break; }
  }
  return col + trans * bg;
}
