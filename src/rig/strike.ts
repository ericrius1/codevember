// A stroke planner for anything swung at a surface by hand — a drum's beater, a gong's mallet, a hammer, an axe: where
// the implement is through a stroke (ready, the lift, the top, the downswing, contact, the rebound, the way back to
// ready), how the hand holds it, and how far through the body's chain the stroke is, for a body solver to carry.
//
// The implement is a rigid shaft from the grip to its head. A stroke is given by its contact: when, where, the head's
// way and speed there, and the shaft's way at that moment. Everything else follows from those:
//   - the downswing is a whip. The hand travels on a cubic from the top (at rest) to its place at contact, arriving
//     with only a part of the head's speed (`handShare`); the rest comes from the shaft turning in the swing plane
//     (the plane of the shaft and the head's way at contact) through `cock` radians, its angle as s^p over the swing so
//     its turn is fastest at contact — the wrist uncocking last, as a whip's tip. p is solved so the head arrives at
//     exactly the speed asked.
//   - contact: the head sinks into the surface along its way and comes back out over the dwell (a half sine), the hand
//     still following through a little.
//   - the rebound: the head leaves at `restitution` of its speed, the shaft swinging back up off the surface, and the
//     hand eases (minimum jerk) to where the next stroke will be readied from.
//   - the lift: from ready to the top (minimum jerk), a hang there (still rising, the anticipation), then the
//     downswing. The top is where the hand is at the start of the downswing, and the shaft there is the contact shaft
//     turned back through `cock`.
//   - the body's chain (ChainPhase): the hips start the downswing first, then the trunk, the shoulder, the elbow, the
//     wrist last, each a share of the swing later (`lag`), each easing through its own turn — the kinetic chain that
//     makes a stroke look like it has weight behind it. The coil (wind-up) runs the other way: the wrist cocks first
//     and the hips turn away last.
//
// Times are on whatever clock the caller keeps (a story clock that dilates is fine: a stroke is a function of time).
import { type V3, add, sub, scale, dot, cross, len, norm, lerp3, clamp, rotateAxis, minJerk, rej } from './hero/math';
import type { HandGoal } from './hero/rig';

export interface Implement {
  /** from the grip (the middle of the fist) to the head's centre (m) */
  reach: number;
  /** the head's radius (m): its surface meets the struck one */
  headR: number;
}

export interface StrokeSpec {
  /** contact time */
  t: number;
  /** the struck point on the surface (world), and the surface's normal there (out, toward the player) */
  at: V3; normal: V3;
  /** the head's way at contact (into the surface: dot(dir, normal) < 0), and its speed (m/s) */
  dir: V3; speed: number;
  /** the shaft's way at contact, grip → head (made perpendicular to dir) */
  shaft: V3;
  /** how far the shaft turns through the downswing (rad): a tap ~0.6, a full stroke ~1.4, overhead ~3 */
  cock: number;
  /** the downswing's length (s) */
  down: number;
  /** the share of the head's speed at contact that's the hand's own travel (0..1; the rest is the shaft's turn) */
  handShare: number;
  /** the hand at the top of the backswing (world) */
  top: V3;
  /** the lift from ready to the top (s), and the hang there before the downswing (s) */
  lift: number; hang: number;
  /** how long the head is on the surface (s), and how far it sinks into it at the deepest (m) */
  dwell: number; depth: number;
  /** the rebound's speed as a share of the strike's, and how long the way back to ready takes (s) */
  restitution: number; settle: number;
  /** where the hand rests after (world) and the shaft's way there; default: this stroke's top, lowered */
  ready?: { hand: V3; shaft: V3 };
  /** the chain's lag: each link of the chain this share of the downswing after the one before (default 0.1) */
  lag?: number;
}

export type StrokePhase = 'ready' | 'lift' | 'hang' | 'down' | 'contact' | 'rebound';

export interface StrokeState {
  phase: StrokePhase;
  /** the grip (the middle of the fist), the shaft's way (grip → head), the head's centre */
  hand: V3; shaft: V3; head: V3;
  /** the head's velocity (m/s, on the stroke's clock) */
  vel: V3;
  /** 0 → 1 through the lift and hang (the coil), through the downswing, through the rebound and settle */
  coil: number; swing: number; settle: number;
  /** how deep in the surface the head is (0..1 of the stroke's depth) */
  press: number;
  /** time from contact (negative before) */
  since: number;
}

/** the chain's own progress through a downswing (each 0..1): the hips first, the wrist last */
export interface ChainPhase { hips: number; trunk: number; shoulder: number; elbow: number; wrist: number }

const along = (a: V3, b: V3, k: number): V3 => lerp3(a, b, k);
/** cubic Bézier and its derivative */
function bez(p0: V3, p1: V3, p2: V3, p3: V3, s: number): V3 {
  const u = 1 - s, a = u * u * u, b = 3 * u * u * s, c = 3 * u * s * s, d = s * s * s;
  return [p0[0] * a + p1[0] * b + p2[0] * c + p3[0] * d, p0[1] * a + p1[1] * b + p2[1] * c + p3[1] * d, p0[2] * a + p1[2] * b + p2[2] * c + p3[2] * d];
}
function bezD(p0: V3, p1: V3, p2: V3, p3: V3, s: number): V3 {
  const u = 1 - s, a = 3 * u * u, b = 6 * u * s, c = 3 * s * s;
  return [(p1[0] - p0[0]) * a + (p2[0] - p1[0]) * b + (p3[0] - p2[0]) * c, (p1[1] - p0[1]) * a + (p2[1] - p1[1]) * b + (p3[1] - p2[1]) * c,
    (p1[2] - p0[2]) * a + (p2[2] - p1[2]) * b + (p3[2] - p2[2]) * c];
}
/** the shaft's way turned from a to b by k of the angle between them (about their common normal) */
function slerpDir(a: V3, b: V3, k: number): V3 {
  const c = clamp(dot(a, b), -1, 1), ang = Math.acos(c);
  if (ang < 1e-5) return b;
  let ax = cross(a, b);
  if (len(ax) < 1e-6) ax = Math.abs(a[1]) < 0.9 ? cross(a, [0, 1, 0]) : cross(a, [1, 0, 0]);
  return rotateAxis(a, norm(ax), ang * k);
}

/** a stroke's fixed geometry, worked out once */
export class Stroke {
  readonly dir: V3; readonly shaft: V3; readonly axis: V3;
  /** the grip at contact, the shaft at the top, the downswing's exponent */
  readonly handC: V3; readonly shaftTop: V3; readonly p: number;
  readonly ready: { hand: V3; shaft: V3 };
  constructor(readonly s: StrokeSpec, readonly tool: Implement) {
    this.dir = norm(s.dir);
    // (the shaft at contact square to the head's way)
    this.shaft = norm(rej(s.shaft, this.dir));
    // the swing plane's normal: turning about it carries the head along dir at contact
    this.axis = norm(cross(this.shaft, this.dir));
    // the head's centre at contact: its surface on the struck point
    const headC = sub(s.at, scale(this.dir, tool.headR));
    this.handC = sub(headC, scale(this.shaft, tool.reach));
    this.shaftTop = rotateAxis(this.shaft, this.axis, -s.cock);
    // ω at contact = p·cock/down must give the shaft's share of the speed: reach·ω = (1 − handShare)·speed
    this.p = Math.max(1, ((1 - s.handShare) * s.speed * s.down) / (Math.max(1e-3, s.cock) * tool.reach));
    this.ready = s.ready ?? { hand: add(s.top, [0, -0.12, 0]), shaft: slerpDir(this.shaftTop, this.shaft, 0.5) };
  }
  /** when the lift starts (it's ready before), and when it's settled after */
  get begins() { return this.s.t - this.s.down - this.s.hang - this.s.lift; }
  get ends() { return this.s.t + this.s.dwell + this.s.settle; }

  /** the stroke at time t, coming from `from` (the previous stroke's ready, or this one's) */
  at(t: number, from = this.ready, to = this.ready): StrokeState {
    const S = this.s, T = this.tool;
    const since = t - S.t;
    const tTop = S.t - S.down, tLift = tTop - S.hang - S.lift;
    let hand: V3, shaft: V3, vel: V3 = [0, 0, 0], phase: StrokePhase, coil = 0, swing = 0, settle = 0, press = 0;
    if (t < tLift) {
      phase = 'ready'; hand = from.hand; shaft = from.shaft;
    } else if (t < tTop - S.hang) {
      // the lift: ready → (most of the way to) the top
      phase = 'lift';
      const k = minJerk((t - tLift) / S.lift);
      coil = k * 0.85;
      hand = along(from.hand, this.hangStart, k); shaft = slerpDir(from.shaft, this.hangShaft, k);
    } else if (t < tTop) {
      // the hang: still drifting up into the top (the breath before the stroke)
      phase = 'hang';
      const k = (t - (tTop - S.hang)) / Math.max(1e-4, S.hang), e = 1 - (1 - k) * (1 - k);
      coil = 0.85 + 0.15 * e;
      hand = along(this.hangStart, S.top, e); shaft = slerpDir(this.hangShaft, this.shaftTop, e);
    } else if (t < S.t) {
      // the downswing: the hand on its cubic, the shaft whipping through its turn
      phase = 'down';
      const s = (t - tTop) / S.down;
      swing = s; coil = 1 - s;
      const P3 = this.handC, P2 = sub(P3, scale(this.dir, (S.handShare * S.speed * S.down) / 3));
      // (the hand leaves the top drawn down and in toward the body's line: the elbow leads)
      const P1 = add(S.top, scale(sub(P2, S.top), 0.15));
      hand = bez(S.top, P1, P2, P3, s);
      const th = S.cock * Math.pow(s, this.p);
      shaft = rotateAxis(this.shaftTop, this.axis, th);
      const w = (S.cock * this.p * Math.pow(Math.max(s, 1e-6), this.p - 1)) / S.down;
      vel = add(scale(bezD(S.top, P1, P2, P3, s), 1 / S.down), scale(cross(this.axis, shaft), w * T.reach));
    } else if (t < S.t + S.dwell) {
      // contact: in along dir and back out (the surface's own give and spring)
      phase = 'contact';
      const k = since / S.dwell;
      press = Math.sin(Math.PI * k);
      swing = 1;
      const follow = scale(this.dir, S.handShare * S.speed * S.dwell * k * (1 - 0.5 * k));
      hand = add(this.handC, add(follow, scale(this.dir, S.depth * press * 0.35)));
      // (the shaft keeps the head where the surface puts it)
      const head = add(sub(S.at, scale(this.dir, T.headR)), scale(this.dir, S.depth * press));
      shaft = norm(sub(head, hand));
      return { phase, hand, shaft, head, vel: scale(this.dir, S.speed * Math.cos(Math.PI * k)), coil, swing, settle, press, since };
    } else {
      // the rebound and the way back: the head flung back off the surface, the hand easing to ready
      phase = since < S.dwell + S.settle ? 'rebound' : 'ready';
      const u = clamp((since - S.dwell) / S.settle, 0, 1);
      settle = u;
      const k = minJerk(u);
      const handOut = add(this.handC, scale(this.dir, S.handShare * S.speed * S.dwell * 0.5));
      // (the head's flight back: a turn the other way through the swing plane, quick then easing — its angle as
      // 1 − (1 − u)^3, so it leaves at the rebound's speed)
      const back = S.restitution * S.speed * S.settle / (3 * T.reach);
      const flung = rotateAxis(this.shaft, this.axis, -back * (1 - (1 - u) ** 3) * (1 - k));
      hand = along(handOut, to.hand, k);
      shaft = slerpDir(flung, to.shaft, k);
      swing = 1;
    }
    const head = add(hand, scale(shaft, T.reach));
    return { phase, hand, shaft, head, vel, coil, swing, settle, press, since };
  }
  // (the hang starts a little short of the top, along the line from ready)
  private get hangStart(): V3 { return add(this.s.top, scale(sub(this.ready.hand, this.s.top), 0.12)); }
  private get hangShaft(): V3 { return slerpDir(this.shaftTop, this.ready.shaft, 0.15); }

  /** the chain through the downswing: each link `lag` of it after the one before, eased through its own share */
  chain(st: StrokeState): ChainPhase {
    const lag = this.s.lag ?? 0.1;
    const s = st.phase === 'down' ? st.swing : st.since >= 0 ? 1 : 0;
    const link = (i: number) => minJerk(clamp((s - (i - 2) * lag) / (1 - 2 * lag), 0, 1));
    // (the hips lead from before the top: a good stroke starts in the legs while the hands are still going up)
    return { hips: link(0), trunk: link(1), shoulder: link(2), elbow: link(3), wrist: link(4) };
  }
}

/** a sequence of strokes on one clock: which one is going on at t, from where, to where */
export class Strokes {
  readonly list: Stroke[];
  constructor(specs: StrokeSpec[], tool: Implement, readonly rest: { hand: V3; shaft: V3 }) {
    this.list = specs.map((s) => new Stroke(s, tool)).sort((a, b) => a.s.t - b.s.t);
  }
  at(t: number): { st: StrokeState; stroke: Stroke; index: number } {
    const L = this.list;
    // the stroke whose span holds t: from the previous one's settle to its own settle
    let i = L.findIndex((k) => t < k.ends);
    if (i < 0) i = L.length - 1;
    const k = L[i];
    const from = i > 0 ? L[i - 1].ready : this.rest;
    const to = i + 1 < L.length ? L[i + 1].ready : k.ready;
    return { st: k.at(t, t < k.s.t ? from : from, to), stroke: k, index: i };
  }
}

/** a hand's goal for holding the implement in a hammer grip at the stroke's state: the shaft leaves the fist on the
 *  thumb's side toward the head; the forearm's way is the arm's (from the shoulder), square to the shaft. `right`: the
 *  right hand (the thumb is fwd × palm-normal); `shoulder` the arm's root, for the forearm's way */
export function gripGoal(st: { hand: V3; shaft: V3 }, shoulder: V3, right: boolean, o: { curl?: number; elbow?: V3; elbowW?: number; turn?: number } = {}): HandGoal {
  const U = st.shaft;
  let F = rej(sub(st.hand, shoulder), U);
  if (len(F) < 1e-4) F = rej([0, 1, 0], U);
  F = norm(F);
  // the palm's normal: thumb = F × D (right) or D × F (left) must be the shaft's way
  const D = right ? norm(cross(U, F)) : norm(cross(F, U));
  // the knuckles' line a little ahead of the shaft and toward the back of the hand (the shaft in the curled fingers)
  const knuckles = add(st.hand, add(scale(F, 0.018), scale(D, -0.028)));
  return { palm: knuckles, knuckles, fwd: F, down: D, tips: [null, null, null, null, null], curl: o.curl ?? 0.9, grip: 1, exact: true,
    elbow: o.elbow, elbowW: o.elbowW, turn: o.turn };
}
