// The cosmos behind the stage, one fullscreen pass: our universe's own sky (a violet nebula, its stars) inside its
// membrane — a vast soap-film sphere we live inside, off its centre, its near wall a little behind the drum — and
// beyond that membrane the other universes, each its own kind of light, seen through it where it ripples thin.
// Further out, the foam: the other universes' own bubbles packed round ours, each with its membrane and its world
// inside, all of it inside a membrane of a higher order, rippling too.
//
// The ripples on a membrane are wave packets running out over it from where a disturbance reached it (G.waves for
// ours: the great stroke's shock; each neighbour takes them up where it touches ours, a beat later; the higher
// membrane last).
#include "./common"
#include "weft/fullscreen"

struct CosmosU {
  // x the camera's distance from the drum (for what's resolved), y the foam's presence (0..1), z the higher
  // membrane's ripple (0..1), w the camera inside our bubble (1) or out (0)
  view: vec4f,
  // the spark: where the stage is, seen from far away (xyz), w its brightness
  spark: vec4f,
}
@group(2) @binding(0) var<uniform> K: CosmosU;

const BUBBLES = 13;
/** the foam: centre (xyz) and radius (w) of each neighbour, and its universe (0..5) */
fn bubble(i: i32) -> vec4f {
  let W = G.wall.xyz; let R = G.wall.w;
  let fi = f32(i);
  // (a golden spiral of directions, distances so they just touch ours and each other)
  let y = 1.0 - (fi + 0.5) / f32(BUBBLES) * 2.0;
  let r = sqrt(1.0 - y * y);
  let th = fi * 2.39996 + 0.7;
  let d = vec3f(cos(th) * r, y * 0.8, sin(th) * r);
  let rad = R * (0.45 + 0.6 * hash11(fi * 3.7 + 1.0));
  return vec4f(W + normalize(d) * (R + rad * 1.02), rad);
}
fn bubbleKind(i: i32) -> f32 { return floor(hash11(f32(i) * 7.13 + 2.0) * 5.999); }

// ---------------------------------------------------------------- ripples on a sphere
/** the height of the ripples at a point (unit n from the sphere's centre, radius R): packets from each event running
 *  out over the sphere at `speed` (m/s), their rings behind their front */
fn ripple(n: vec3f, R: f32, ev: vec4f, speed: f32, amp: f32, k: f32) -> f32 {
  if (ev.w < 0.0) { return 0.0; }
  let age = G.clock.x - ev.w;
  if (age <= 0.0) { return 0.0; }
  let arc = acos(clamp(dot(n, normalize(ev.xyz)), -1.0, 1.0)) * R;
  let front = speed * age;
  let x = front - arc;
  if (x < 0.0) { return exp(-x * x * 0.0004) * 0.0; }
  let fade = exp(-age * 0.16) * (1.0 - exp(-age * 3.0));
  // (rings behind the front, longer as they spread; the front itself the tallest)
  // (k: rings per metre; they stretch a little as they spread)
  let lam = 1.0 / k * (1.0 + age * 0.04);
  return amp * sin(TAU * x / lam) * exp(-x / (front * 0.45 + 30.0)) * fade * smoothstep(0.0, lam * 0.5, x);
}
fn wallRipple(n: vec3f, k: f32) -> f32 {
  var h = 0.0;
  for (var i = 0; i < 4; i++) { h += ripple(n, G.wall.w, G.waves[i], 140.0 + f32(i) * 20.0, 1.0 - 0.25 * f32(i), k); }
  // (always a faint breath on it, the cosmos never quite still)
  h += 0.02 * sin(dot(n, vec3f(3.0, 1.0, 2.0)) * 23.0 + G.clock.x * 0.4) * sin(dot(n, vec3f(-1.0, 4.0, 1.0)) * 19.0 - G.clock.x * 0.3);
  return h;
}

// ---------------------------------------------------------------- the universes
fn palette(kind: f32, t: f32) -> vec3f {
  // each universe its own light
  let k = i32(kind);
  var a = vec3f(0.5); var b = vec3f(0.5); var c = vec3f(1.0); var d = vec3f(0.0, 0.33, 0.67);
  if (k == 0) { d = vec3f(0.0, 0.1, 0.2); c = vec3f(1.0, 1.0, 0.5); }          // ember: fire and gold
  else if (k == 1) { d = vec3f(0.5, 0.55, 0.6); c = vec3f(0.6, 0.8, 1.0); }    // crystal: ice and violet
  else if (k == 2) { d = vec3f(0.3, 0.2, 0.25); c = vec3f(0.8, 1.0, 0.6); }    // garden: green-gold vines
  else if (k == 3) { d = vec3f(0.65, 0.4, 0.25); c = vec3f(1.0, 0.7, 0.4); }   // abyss: teal and magenta
  else { d = vec3f(0.8, 0.9, 0.3); c = vec3f(1.0, 1.0, 1.0); }                 // the eye: violet and gold rings
  return a + b * cos(TAU * (c * t + d));
}
/** another universe's light along a ray from ro (just past its membrane): a volume of glowing structure, warped by
 *  turbulence (sines folded into themselves) so it reads as a living space, not a pattern — each kind its own form and
 *  light: fire's turbulent shells, crystal's lattice, the garden's vines, the abyss's caustic sheets, the eye's rings */
fn universe(kind: f32, ro: vec3f, rd: vec3f, scale: f32) -> vec3f {
  var col = vec3f(0.0);
  var t = 0.05;
  let k = i32(kind);
  let tm = G.clock.y * 0.15 + G.clock.x * 0.03;
  for (var i = 0; i < 22; i++) {
    var p = (ro + rd * t) / scale;
    // the turbulence: each octave's sine folded into the next
    var f = 1.4;
    for (var j = 0; j < 5; j++) { p += sin(p.zxy * f + tm + f32(j)) / f * 0.55; f *= 1.55; }
    var d = 1.0;
    if (k == 0) { d = abs(length(p.xy) - 1.0 + 0.3 * sin(p.z * 2.0)) * 0.25 + 0.012; }
    else if (k == 1) { let q = fract(p * 1.2 + 0.5) - 0.5; d = abs(abs(q.x) + abs(q.y) + abs(q.z) - 0.38) * 0.4 + 0.006; }
    else if (k == 2) { let q = p * 2.2; d = abs(dot(sin(q), cos(q.zxy))) * 0.14 + 0.01; }
    else if (k == 3) { d = abs(sin(p.y * 2.5 + sin(p.x * 1.3) + sin(p.z * 1.7))) * 0.16 + 0.01; }
    else { d = abs(fract(length(p) * 1.2 - tm * 0.5) - 0.5) * 0.3 + 0.012; }
    let w = 1.0 - f32(i) / 22.0;
    col += palette(kind, t * 0.25 + length(p) * 0.08 + tm * 0.05) / d * w * 0.0035;
    t += d * 0.9 + 0.04;
  }
  return col;
}

// ---------------------------------------------------------------- our own sky
fn stars(rd: vec3f) -> vec3f {
  var c = vec3f(0.0);
  for (var l = 0; l < 3; l++) {
    let s = 180.0 + f32(l) * 160.0;
    let q = rd * s;
    let id = floor(q);
    let h = hash33(id + f32(l) * 17.0);
    if (h.x > 0.92) {
      let p = id + 0.2 + h * 0.6;
      let d = length(q - p);
      let tw = 0.7 + 0.3 * sin(G.clock.x * (1.0 + h.y * 3.0) + h.z * 40.0);
      c += mix(vec3f(0.7, 0.8, 1.0), vec3f(1.0, 0.8, 0.6), h.y) * exp(-d * d * 30.0) * (h.z * 2.0 + 0.3) * tw;
    }
  }
  return c;
}
fn nebula(rd: vec3f) -> vec3f {
  var p = rd * 2.2 + vec3f(0.0, 0.0, G.clock.y * 0.004);
  var acc = vec3f(0.0);
  var a = 1.0;
  for (var i = 0; i < 5; i++) {
    let n = dotNoise(p * 1.7 + f32(i) * 1.3);
    acc += vec3f(0.35, 0.12, 0.6) * sat(n * 0.5 + 0.1) * a + vec3f(0.05, 0.35, 0.4) * sat(-n * 0.5 - 0.3) * a;
    p = p * 2.0 + sin(p.zxy * 1.3) * 0.3;
    a *= 0.55;
  }
  // (a river of it across the sky, brightest toward the wall)
  let band = exp(-pow(dot(rd, normalize(vec3f(0.2, 1.0, 0.35))) * 2.4, 2.0));
  return acc * (0.06 + 0.22 * band) * vec3f(1.0, 0.9, 1.1);
}

/** ray–sphere: the near and far distances (no hit: far < 0) */
fn sphereHit(ro: vec3f, rd: vec3f, c: vec3f, r: f32) -> vec2f {
  let oc = ro - c;
  let b = dot(oc, rd);
  let q = dot(oc, oc) - r * r;
  let h = b * b - q;
  if (h < 0.0) { return vec2f(-1.0); }
  let s = sqrt(h);
  return vec2f(-b - s, -b + s);
}

/** a membrane's look where the ray meets it: its film (iridescent, strongest edge-on), how much shows through, the
 *  ray bent by its ripples' slope */
struct Film { col: vec3f, through: f32, bend: vec3f };
fn film(n: vec3f, rd: vec3f, h: f32, dh: vec3f, thick: f32, reveal: f32) -> Film {
  var f: Film;
  let c = abs(dot(n, rd));
  let nm = thick + 260.0 * h + 60.0 * fbm(n * 6.0 + vec3f(G.clock.x * 0.02));
  let fr = fresnel(0.04, c);
  f.col = thinFilm(c, nm) * (0.03 + 0.5 * fr) * (1.0 + 2.5 * abs(h));
  // (thinner in the ripples' troughs and crests: the other side shows through)
  f.through = sat(reveal * (0.15 + 1.4 * abs(h)) + 0.02);
  f.bend = dh;
  return f;
}

@fragment fn fsSky(i: FullscreenOut) -> @location(0) vec4f {
  let rd = viewRay(i.uv);
  let ro = frame.camPos;
  let W = G.wall.xyz; let R = G.wall.w;
  var col = vec3f(0.0);
  let inside = length(ro - W) < R;
  let hue = G.cosmos.w;
  if (inside) {
    // our membrane, its ripples bending everything seen through them, our sky in front of it, what's past it
    let hit = sphereHit(ro, rd, W, R);
    let t = hit.y;
    let q = ro + rd * t;
    let n = normalize(q - W);
    let h = wallRipple(n, 0.04);
    // (the slope, from neighbours on the sphere)
    let e = 0.004;
    let t1 = normalize(cross(n, vec3f(0.0, 1.0, 0.0001)));
    let t2 = cross(n, t1);
    let dh = (t1 * (wallRipple(normalize(n + t1 * e), 0.04) - h) + t2 * (wallRipple(normalize(n + t2 * e), 0.04) - h)) / e;
    let hr = h * G.cosmos.x;
    let F = film(n, rd, hr, dh * G.cosmos.x, 380.0, G.cosmos.y);
    // (the sky seen through the ripples' lens: bent by their slope)
    let bent = normalize(rd + F.bend * 0.00035);
    col = nebula(bent) + stars(bent) * 0.8;
    // past it: the other universes, a different one in each region of the sky, shown where the ripples thin it
    let cell = floor(n * 2.5 + 0.5);
    let kind = floor(hash13(cell) * 4.999);
    let other = universe(kind, q * 0.02, bent, 0.6 + 0.4 * hash13(cell + 3.0));
    let open = sat(0.04 + smoothstep(0.2, 0.75, -hr) * G.cosmos.y);
    col = col * (1.0 - open * 0.8) + other * open * 1.2 + F.col * (0.12 + 0.8 * abs(hr));
    // the crests burn with the film's colours; a thin bright line where the film turns over
    let crest = smoothstep(0.3, 0.9, hr);
    let edge = exp(-pow(hr / 0.08, 2.0)) * smoothstep(0.05, 0.3, abs(dh.x) + abs(dh.y) + abs(dh.z)) * G.cosmos.x;
    col += pow(thinFilm(abs(dot(n, rd)), 280.0 + 240.0 * hr + 160.0 * fbm(n * 9.0)), vec3f(2.0)) * crest * 3.0 + vec3f(0.7, 0.9, 1.0) * crest * crest * 0.08 + vec3f(0.8, 0.9, 1.0) * edge * 0.2;
  } else {
    // outside our bubble: the void between universes, the foam, the higher membrane round it all
    col = stars(rd) * 0.25 + vec3f(0.01, 0.005, 0.02);
    var best = 1e30; var bi = -1;
    for (var b = -1; b < BUBBLES; b++) {
      let s = select(bubble(b), vec4f(W, R), b < 0);
      if (b >= 0 && K.view.y <= 0.0) { continue; }
      let h = sphereHit(ro, rd, s.xyz, s.w);
      if (h.y > 0.0 && h.x > 0.0 && h.x < best) { best = h.x; bi = b; }
    }
    if (bi > -2 && best < 1e29) {
      let s = select(bubble(bi), vec4f(W, R), bi < 0);
      let q = ro + rd * best;
      let n = normalize(q - s.xyz);
      var h: f32;
      if (bi < 0) { h = wallRipple(n, 0.012) * G.cosmos.x; }
      else {
        // (a neighbour takes the ripple up where it touches ours, a beat after)
        let touch = normalize(W - s.xyz);
        h = ripple(n, s.w, vec4f(touch, select(-1.0, G.waves[0].w + 2.2 + hash11(f32(bi)) * 1.5, G.waves[0].w > 0.0)), 160.0, 1.0, 0.012) * G.cosmos.z
          + 0.06 * sin(dot(n, vec3f(5.0, 2.0, 3.0)) * 6.0 + G.clock.x * 0.5);
      }
      let F = film(n, rd, h, vec3f(0.0), 300.0 + f32(bi) * 37.0, 1.0);
      // inside it: its universe, seen through its film (ours: our nebula, and the spark of the stage)
      var inner: vec3f;
      if (bi < 0) {
        inner = nebula(rd) * 3.0 + vec3f(0.06, 0.02, 0.1);
        // the spark: the stage, from out here a point of light the ripples come from
        let sp = K.spark.xyz - ro;
        let ang = acos(clamp(dot(normalize(sp), rd), -1.0, 1.0));
        inner += vec3f(1.0, 0.7, 0.35) * K.spark.w * (0.0008 / (ang * ang + 0.00004));
      } else {
        inner = universe(bubbleKind(bi), (q - s.xyz) / s.w * 2.0, normalize(rd + n * h * 0.05), 1.0) * 0.6;
      }
      let lim = pow(1.0 - abs(dot(n, rd)), 2.5);
      col = inner * (0.55 + 0.45 * F.through) + F.col * 1.6 + thinFilm(abs(dot(n, rd)), 420.0 + h * 300.0) * lim * 0.5;
    }
    // the higher membrane: round the whole foam
    let HR = R * 14.0;
    let hh = sphereHit(ro, rd, W, HR);
    if (hh.y > 0.0) {
      let tq = select(hh.y, hh.x, hh.x > 0.0);
      let q = ro + rd * tq;
      let n = normalize(q - W);
      let toward = normalize(ro - W);
      let hr = ripple(n, HR, vec4f(toward, select(-1.0, G.waves[0].w + 6.0, G.waves[0].w > 0.0)), 2500.0, 1.0, 0.0045) * K.view.z;
      let F = film(n, rd, hr, vec3f(0.0), 520.0, 0.5);
      col = col * (1.0 - 0.15 * K.view.z) + F.col * K.view.y * (0.3 + 2.0 * abs(hr));
    }
  }
  col = hueShift(col, hue);
  return vec4f(col, 1.0);
}
