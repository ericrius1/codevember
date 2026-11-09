// What she does, moment by moment (story time): the strokes (src/rig/strike.ts) from the score, and the whole body
// that carries them (the rig's body solver): her feet planted wide, the weight rocking back as she winds and forward
// into each stroke, the hips leading each downswing and the trunk after them, coiling and uncoiling, her knees giving
// into the stroke, her left hand open toward the hide; for the great stroke a deep wind-up (the beater raised high, her
// left arm reaching out at the drum), the drive through it, and her arms opening to the cosmos as the universes answer
// — then the pulse taken up again.
//
// Every channel of her body is a track through keys (src/rig/track.ts: quintic Hermite, continuous to its
// acceleration) laid out from the strokes' own times, each channel's keys a little after or before the others' (the
// hips first, the trunk, the arms after: overlapping action), so nothing in her ever jumps or stops dead — the only
// break in the whole loop is the beater meeting the hide.
import { STROKES, BIG, LOOP, ACT, story, STORY_LOOP } from './score';
import { Strokes, gripGoal, type StrokeSpec, type StrokeState } from '../src/rig/strike';
import { Track, type Key } from '../src/rig/track';
import { type V3, add, sub, scale, norm } from '../src/rig/hero/math';
import type { BodyGoal, FootGoal } from '../src/rig/body/solve';
import type { HandGoal, HeroRig } from '../src/rig/hero/rig';
import { DRUM } from './stage';

export const BEATER = { reach: 0.6, headR: 0.075 };

const C = DRUM.c;
/** a point on the hide (its frame: a across toward her side, +z; b up) */
const onHide = (a: number, b: number): V3 => [C[0], C[1] + b, C[2] + a];

// where she stands: her right shoulder in line with the struck point, a stride back from the hide, turned a little
// toward the drum's middle; her feet wide (the left forward toward the drum, the right back), knees soft
const STRIKE_A = 0.4, STRIKE_B = 0.36;
const BODY: V3 = [-0.84, 0, STRIKE_A - 0.2];
const YAW = Math.atan2(-0.988, 0.152);
const FEET = { l: [-0.55, 0, -0.04] as V3, r: [-1.13, 0, 0.44] as V3 };

// the head's way at contact (into the hide and down: an overhead stroke landing high on the hide, the arc's head still
// travelling forward), the shaft square to it (the head above and ahead of the hand: a hammer driven into a wall)
const DIR = norm([0.8, -0.6, 0.0]);
const SHAFT = norm([0.6, 0.8, 0.0]);

function specFor(i: number, shift: number): StrokeSpec {
  const k = STROKES[i];
  const t = story(k.t) + shift;
  const at = onHide(STRIKE_A + k.at[0] * 0.15, STRIKE_B + k.at[1] * 0.4);
  const v = k.v;
  if (k.big) {
    const S = story(k.t);
    const down = 0.26, hang = 0.5;
    // (the wind-up starts as the stroke before it has settled)
    const liftFrom = story(STROKES[i - 1].t) + 0.5;
    return {
      t, at, normal: [-1, 0, 0], dir: norm([0.75, -0.66, 0.04]), speed: v, shaft: norm([0.66, 0.75, -0.04]),
      cock: 2.7, down, handShare: 0.45,
      // the top: her hand high over her head and back, the beater pointing back and up behind her
      top: [-1.0, 2.04, STRIKE_A + 0.24],
      lift: S - down - hang - liftFrom, hang,
      dwell: 0.0055, depth: 0.13, restitution: 0.35, settle: 1.3,
      // after: no flourish — the beater comes down by her side, its head low ahead of her (a hanging arm, the shaft square to it), and she stands
      // and watches what the stroke has done
      ready: { hand: [-0.74, 0.9, 0.38], shaft: norm([0.84, -0.32, 0.3]) },
      lag: 0.12, follow: 0.3, followDist: 0.14, topFlow: 0.3, lay: 0.35,
    };
  }
  // (a fuller arc than a tap: the hand comes from up by her ear, the beater cocked back past upright; each stroke of
  // the pulse harder than the last, its arc bigger, its push into the hide deeper)
  // (the stroke before the first is the great one, at the end of the loop before)
  const n = STROKES.length;
  const prevBig = STROKES[(i - 1 + n) % n].big;
  const nextBig = STROKES[(i + 1) % n].big;
  return {
    t, at, normal: [-1, 0, 0], dir: DIR, speed: v, shaft: SHAFT,
    cock: 1.55 + (v - 3) * 0.15, down: 0.25, handShare: 0.36,
    top: add(sub(at, scale(SHAFT, BEATER.reach)), [-0.3, 0.5 + (v - 3) * 0.06, 0.15]),
    lift: prevBig ? 1.6 : 0.66, hang: 0.1,
    dwell: 0.0065, depth: 0.026 + (v - 3) * 0.01, restitution: 0.55, settle: nextBig ? 0.4 : 0.55,
    ready: { hand: [-0.6, 1.22, STRIKE_A + 0.06], shaft: norm([0.2, 0.97, -0.05]) },
    lag: 0.1, follow: 0.12, followDist: 0.04, topFlow: 0.4,
  };
}

// the strokes, with the last ones of the loop before and the first of the next round them (it's a loop)
const specs: StrokeSpec[] = [];
STROKES.forEach((_, i) => { specs.push(specFor(i, 0)); });
specs.unshift(specFor(STROKES.length - 1, -STORY_LOOP), specFor(STROKES.length - 2, -STORY_LOOP));
specs.push(specFor(0, STORY_LOOP), specFor(1, STORY_LOOP));
export const strokes = new Strokes(specs, BEATER, specs[0].ready!);

// the great stroke's story times: contact, her coming up out of it into stillness (and only in the dark at the loop's
// end back to where the pulse starts)
const SB = story(BIG.t);
const OPEN = { in0: SB + 0.02, in1: SB + 0.85, out0: story(ACT.fade + 0.7), out1: story(ACT.black + 0.42) };

// ---------------------------------------------------------------- her body's channels, keyed from the strokes
type K = Key<number>;
const keys: Record<string, K[]> = { hips: [], trunk: [], flex: [], side: [], load: [], shift: [], nod: [], sky: [],
  lx: [], ly: [], lz: [], lfx: [], lfy: [], lfz: [], ldx: [], ldy: [], ldz: [], lcurl: [] };
const key = (ch: string, t: number, v: number, vel: K['vel'] = 'auto') => keys[ch].push({ t, v, vel });
/** the left hand's poses: its palm, its way, its palm's normal, its fingers' curl */
const LH = {
  rest: { p: [-0.56, 1.2, -0.08] as V3, f: norm([0.35, 0.9, -0.2]), d: norm([0.9, -0.2, 0.3]), curl: 0.2 },
  lifted: { p: [-0.46, 1.3, -0.1] as V3, f: norm([0.45, 0.85, -0.2]), d: norm([0.92, -0.1, 0.3]), curl: 0.14 },
  counter: { p: [-0.68, 1.1, -0.34] as V3, f: norm([0.1, 0.6, -0.5]), d: norm([0.5, -0.3, 0.8]), curl: 0.3 },
  recoil: { p: [-0.5, 1.24, -0.1] as V3, f: norm([0.45, 0.85, -0.15]), d: norm([0.92, -0.15, 0.3]), curl: 0.16 },
  reach: { p: [-0.3, 1.78, -0.14] as V3, f: norm([0.75, 0.6, -0.15]), d: norm([0.5, -0.8, 0.2]), curl: 0.08 },
  tuck: { p: [-0.64, 1.14, 0.0] as V3, f: norm([0.3, 0.9, -0.1]), d: norm([0.8, -0.3, 0.5]), curl: 0.35 },
  // (after the great stroke: low at her side, open, the palm toward the drum — still)
  still: { p: [-0.68, 0.92, -0.24] as V3, f: norm([0.33, -0.93, -0.12]), d: norm([0.93, 0.34, 0.12]), curl: 0.28 },
};
const leftAt = (t: number, pose: typeof LH.rest, vel: K['vel'] = 'auto') => {
  key('lx', t, pose.p[0], vel); key('ly', t, pose.p[1], vel); key('lz', t, pose.p[2], vel);
  key('lfx', t, pose.f[0], vel); key('lfy', t, pose.f[1], vel); key('lfz', t, pose.f[2], vel);
  key('ldx', t, pose.d[0], vel); key('ldy', t, pose.d[1], vel); key('ldz', t, pose.d[2], vel);
  key('lcurl', t, pose.curl, vel);
};
for (const k of strokes.list) {
  const S = k.s, big = S.speed > 8;
  const tT = S.t - S.down, tC = S.t, D = S.down;
  if (!big) {
    // the pulse: a small coil (the hips turning away last, as the hand reaches the top, and turning back first),
    // the weight back then forward, the knees giving into the stroke, the trunk crunching a little over it
    // (each stroke its own: the harder ones bigger through the whole body)
    // Each stroke is a bounce through her whole body, back to standing easy before the next: she rises a little as
    // the beater goes up (the up-beat), drops into her knees on contact as the trunk crunches over the stroke and the
    // head nods with it, and comes back up through the rebound.
    const a = 0.8 + 0.14 * (S.speed - 3);
    key('hips', tT - 0.35 * D, -0.26 * a); key('hips', tC + 0.14, 0.12 * a); key('hips', tC + 0.75, 0);
    key('trunk', tT - 0.08 * D, -0.22 * a); key('trunk', tC + 0.17, 0.1 * a); key('trunk', tC + 0.8, 0);
    key('flex', tT - 0.04, -0.1 * a); key('flex', tC + 0.1, 0.26 * a); key('flex', tC + 0.8, 0.03 * a);
    key('side', tT, 0.05 * a); key('side', tC + 0.12, -0.03 * a); key('side', tC + 0.8, 0);
    key('load', tT - 0.15, -0.25 * a); key('load', tC + 0.1, 0.95 * a); key('load', tC + 0.62, 0.12 * a);
    key('shift', tT - 0.1, -0.08 * a); key('shift', tC + 0.12, 0.09 * a); key('shift', tC + 0.8, 0);
    key('nod', tT - 0.05, -0.07 * a); key('nod', tC + 0.06, 0.13 * a); key('nod', tC + 0.6, 0.01);
    // the free arm: out toward the hide as the beater goes up (her balance), swung back against the downswing (the
    // counter-arm), and on contact back out toward the hide, a little past, settling (each key well apart: a hand
    // keyed close together ticked)
    leftAt(tT - 0.12, LH.lifted); leftAt(tC + 0.04, LH.counter); leftAt(tC + 0.32, LH.recoil); leftAt(tC + 0.75, LH.rest);
    continue;
  }
  // the great stroke: the long wind-up — sinking, the weight going back, the trunk turning away and arching, the left
  // arm reaching up and out at the drum — then the drive: the hips first, the trunk crunching over the stroke, the
  // weight thrown forward; then stillness: she comes up out of the stroke into a deep, rooted stance, the beater
  // lowered, both arms down, and watches — the hide, then the worlds opening beyond it — till the pulse comes back
  const tR = k.begins;
  // (its keys after it on its own loop's clock: the great stroke is also the stroke before the loop's first)
  const sh = tC - SB;
  const O = { in1: OPEN.in1 + sh, out0: OPEN.out0 + sh, out1: OPEN.out1 + sh };
  key('hips', tR + 0.4, -0.05); key('hips', tT - 0.3 * D, -0.44); key('hips', tC + 0.3, 0.22); key('hips', O.in1, 0.04); key('hips', O.out1, 0);
  key('trunk', tR + 0.5, -0.04); key('trunk', tT - 0.04 * D, -0.42); key('trunk', tC + 0.36, 0.2); key('trunk', O.in1, 0.0);
  key('flex', tR + 0.6, -0.04); key('flex', tT - 0.08, -0.24); key('flex', tC + 0.09, 0.4); key('flex', O.in1, 0.03); key('flex', O.out0, 0.02); key('flex', O.out1, 0.0);
  key('side', tR + 0.6, 0.02); key('side', tT - 0.05, 0.12); key('side', tC + 0.1, -0.06); key('side', O.in1, 0.0);
  key('load', tR + 0.4, 0.2); key('load', tT - 0.25, 0.85); key('load', tC + 0.12, 1.0); key('load', O.in1, 0.4); key('load', O.out0, 0.36); key('load', O.out1, 0.15);
  key('shift', tR + 0.4, -0.02); key('shift', tT - 0.2, -0.16); key('shift', tC + 0.16, 0.2); key('shift', O.in1, 0.0);
  key('nod', tT - 0.1, -0.06); key('nod', tC + 0.08, 0.12); key('nod', O.in1, -0.07); key('nod', O.out0, -0.06); key('nod', O.out1, 0.02);
  // (her gaze: lifting from the struck point as she comes up out of the stroke, between the veil and the rippling sky)
  key('sky', tC + 0.05, 0, 'hold'); key('sky', O.in1, 0.6);
  key('sky', O.out0, 0.7, 'hold'); key('sky', O.out1, 0, 'hold');
  leftAt(tR + 0.3, LH.rest); leftAt(tT - 0.35, LH.reach); leftAt(tC + 0.06, LH.tuck); leftAt(O.in1, LH.still); leftAt(O.out0, LH.still); leftAt(O.out1 + 0.3, LH.rest);
}
// (the sky's weight is 0 everywhere but round the great stroke)
key('sky', -STORY_LOOP, 0, 'hold'); key('sky', 2 * STORY_LOOP, 0, 'hold');
const T: Record<string, Track> = {};
for (const [ch, ks] of Object.entries(keys)) T[ch] = new Track(ks, true);

export interface Moment {
  goal: BodyGoal;
  beater: StrokeState;
  /** how far she's turned from the struck point to watching the worlds beyond, after the great stroke (0..1) */
  open: number;
  /** the stroke's flash (0..1, fading from each contact) */
  flash: number;
  /** the stroke's shudder through what hangs on her (0..: the scales and leaves lifting, settling) */
  push: number;
  /** the drum rocked back on its stand by the stroke (rad): a damped sway after each contact */
  rock: number;
  /** the struck point and how hard it's pressed */
  hit: V3; press: number;
}

/** her body and the beater at story time s (s within the loop's story span) */
export function moment(s: number): Moment {
  const { st, stroke } = strokes.at(s);
  const big = stroke.s.speed > 8;
  const at: V3 = add(BODY, [T.shift.at(s), 0, 0.15 * Math.min(0, T.shift.at(s))]);
  const load = T.load.at(s), sky = T.sky.at(s);
  // ---------------------------------------------------------------- the feet: planted wide
  const feet: [FootGoal, FootGoal] = [
    { kind: 'flat', at: FEET.l, yaw: YAW + 0.25 },
    { kind: 'flat', at: FEET.r, yaw: YAW - 0.4 },
  ];
  // ---------------------------------------------------------------- the hands
  const shoulderR = add(at, [0.02, 1.44, 0.2]);
  // (each elbow's way: down and out at her side, swinging out and up as its hand rises over the shoulder — never a
  // fixed way the arm can pass through, so the arm's fit never flips)
  // (a smootherstep: its acceleration 0 at both ends too — a smoothstep's jumped there, and the elbow with it every
  // time a hand crossed the band's edge, as the left one did before every stroke)
  const high = (y: number) => { const u = Math.min(1, Math.max(0, (y - 1.25) / 0.6)); return u * u * u * (u * (u * 6 - 15) + 10); };
  const hR = high(st.hand[1]);
  const elbowR = norm([-0.3 - 0.1 * hR, -0.6 + 0.75 * hR, 0.6 + 0.3 * hR]);
  const right: HandGoal = gripGoal(st, shoulderR, true, { curl: 0.95, elbow: elbowR, elbowW: 0.6, axis: stroke.axis });
  const lp: V3 = [T.lx.at(s), T.ly.at(s), T.lz.at(s)];
  const lFwd = norm([T.lfx.at(s), T.lfy.at(s), T.lfz.at(s)]), lDown = norm([T.ldx.at(s), T.ldy.at(s), T.ldz.at(s)]);
  const hL = high(lp[1]);
  const elbowL = norm([-0.2 - 0.1 * hL, -0.7 + 0.8 * hL, -0.6 - 0.3 * hL]);
  const left: HandGoal = { palm: lp, fwd: lFwd, down: lDown, tips: [null, null, null, null, null], curl: T.lcurl.at(s), elbow: elbowL, elbowW: 0.9 };
  // ---------------------------------------------------------------- where she looks: the struck point, the sky after
  const eye = add(at, [0.1, 1.62, 0]);
  const toHit = norm(sub(stroke.s.at, eye)), toSky = norm([0.86, 0.4, -0.12]);
  const look = add(eye, scale(norm([toHit[0] * (1 - sky) + toSky[0] * sky, toHit[1] * (1 - sky) + toSky[1] * sky, toHit[2] * (1 - sky) + toSky[2] * sky]), 4));
  const breath = 0.5 + 0.5 * Math.sin(s * 1.3);
  const goal: BodyGoal = {
    at, yaw: YAW, feet,
    hands: [{ goal: left, w: 1 }, { goal: right, w: 1 }],
    pelvis: { height: 0.9 - 0.085 * load, hw: 2.5, yaw: T.hips.at(s), rw: 0.8, pitch: 0.05 * load },
    spine: { flex: T.flex.at(s), side: T.side.at(s), turn: T.trunk.at(s), w: 0.8 },
    look, nod: T.nod.at(s),
    balance: 0.8, ease: 0.06, breath,
  };
  // the flash: brightest at contact, fading
  const since = st.since;
  const flash = since >= 0 ? Math.exp(-since * (big ? 0.9 : 6)) : 0;
  // (it rises over a few hundredths of a second after contact — the shock reaching her through her arm — and dies
  // over a third of one; the great stroke's lifts them far and lasts)
  const push = since > 0 ? (1 - Math.exp(-since / 0.02)) * (big ? 0.9 * Math.exp(-since * 1.2) : 0.2 * Math.exp(-since / 0.3)) : 0;
  const rock = since > 0 ? (big ? 0.012 : 0.0035 * (0.8 + 0.25 * (stroke.s.speed - 3))) * Math.sin(Math.PI * 2 * 2.3 * since) * Math.exp(-since / 0.4) * (1 - Math.exp(-since / 0.01)) : 0;
  return { goal, beater: st, open: sky, flash, push, rock, hit: stroke.s.at, press: st.press };
}

/** the loop's story span for a film time (the strokes are on story time within one loop) */
export const storyAt = (t: number) => story(((t % LOOP) + LOOP) % LOOP);

/** pose her rig for the moment (story time s, ds since the last pose): main.ts and the motion's tools (09/lab) both */
export function drive(rig: HeroRig, M: Moment, s: number, ds: number) {
  rig.update({
    dt: ds, time: s, pos: [M.goal.at[0], 0, M.goal.at[2]], yaw: M.goal.yaw, vel: [0, 0, 0], speed: 0, running: false, onGround: true,
    wade: 0, landImpact: 0, pose: { mode: 'idle', target: [0, 0, 0], intensity: 0, t: 0 }, look: M.goal.look ?? null, wind: [0, 0, 0],
    ground: () => 0, body: { goal: M.goal, w: 1 },
  });
}
