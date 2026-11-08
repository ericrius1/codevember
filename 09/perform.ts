// What she does, moment by moment (story time): the strokes (src/rig/strike.ts) from the score, and the whole body
// that carries them (the rig's body solver: her feet planted wide, the hips leading each downswing, the trunk coiling
// and uncoiling, her left hand open toward the hide), the great stroke's wind-up (a step back, the beater raised high
// over her shoulder, her left arm reaching out at the drum), its follow-through, and her arms opening to the cosmos as
// the universes answer — then the pulse taken up again.
import { STROKES, BIG, LOOP, story, STORY_LOOP } from './score';
import { Strokes, gripGoal, type StrokeSpec, type StrokeState } from '../src/rig/strike';
import { type V3, add, sub, scale, norm, lerp3, clamp, minJerk } from '../src/rig/hero/math';
import type { BodyGoal, FootGoal } from '../src/rig/body/solve';
import type { HandGoal } from '../src/rig/hero/rig';
import { DRUM } from './drum';

export const BEATER = { reach: 0.6, headR: 0.075 };

const C = DRUM.c;
/** a point on the hide (its frame: a across toward her side, +z; b up) */
const onHide = (a: number, b: number): V3 => [C[0], C[1] + b, C[2] + a];

// where she stands: her right shoulder in line with the struck point, a stride back from the hide, turned a little
// toward the drum's middle
const STRIKE_A = 0.4, STRIKE_B = 0.36;
const BODY: V3 = [-0.84, 0, STRIKE_A - 0.2];
const YAW = Math.atan2(-0.988, 0.152);
const FEET = { l: [-0.6, 0, 0.0] as V3, r: [-1.06, 0, 0.4] as V3 };

// the head's way at contact (into the hide and down: an overhead stroke landing high on the hide, the arc's head still
// travelling forward), the shaft square to it (the head above and ahead of the hand: a hammer driven into a wall)
const DIR = norm([0.8, -0.6, 0.0]);
const SHAFT = norm([0.6, 0.8, 0.0]);
const smooth = (a: number, b: number, x: number) => minJerk((x - a) / (b - a));
const bumpIn = (a: number, b: number, c: number, d: number, x: number) => smooth(a, b, x) * (1 - smooth(c, d, x));

function specFor(i: number, shift: number): StrokeSpec {
  const k = STROKES[i];
  const t = story(k.t) + shift;
  const at = onHide(STRIKE_A + k.at[0] * 0.15, STRIKE_B + k.at[1] * 0.4);
  const v = k.v;
  if (k.big) {
    const S = story(k.t);
    const down = 0.26, hang = 0.55;
    const liftFrom = story(4.8) + 0.62;
    return {
      t, at, normal: [-1, 0, 0], dir: norm([0.75, -0.66, 0.04]), speed: v, shaft: norm([0.66, 0.75, -0.04]),
      cock: 3.0, down, handShare: 0.42,
      // the top: her hand high over her head, the beater hanging down her back
      top: [-1.02, 2.06, STRIKE_A + 0.06],
      lift: S - down - hang - liftFrom, hang,
      dwell: 0.0095, depth: 0.1, restitution: 0.35, settle: 1.6,
      // after: her arms open to the sky, the beater raised in her right hand
      ready: { hand: [-1.05, 2.02, 0.92], shaft: norm([0.25, 0.85, 0.45]) },
      lag: 0.12,
    };
  }
  const after = STROKES[i + 1];
  const nextBig = after?.big;
  // (the stroke after the great one rises from her raised arms: a long, slow lift)
  const prevBig = STROKES[i - 1]?.big;
  return {
    t, at, normal: [-1, 0, 0], dir: DIR, speed: v, shaft: SHAFT,
    cock: 1.15 + (v - 3) * 0.12, down: 0.24, handShare: 0.3,
    top: add(sub(at, scale(SHAFT, BEATER.reach)), [-0.24, 0.36 + (v - 3) * 0.05, 0.03]),
    lift: prevBig ? 1.6 : 0.62, hang: 0.12,
    dwell: 0.0065, depth: 0.018 + (v - 3) * 0.006, restitution: 0.45, settle: nextBig ? 0.45 : 0.55,
    ready: { hand: [-0.56, 1.2, STRIKE_A + 0.05], shaft: norm([0.15, 0.98, -0.05]) },
    lag: 0.1,
  };
}

// the strokes, with the last ones of the loop before and the first of the next round them (it's a loop)
const specs: StrokeSpec[] = [];
STROKES.forEach((_, i) => { specs.push(specFor(i, 0)); });
specs.unshift(specFor(STROKES.length - 1, -STORY_LOOP), specFor(STROKES.length - 2, -STORY_LOOP));
specs.push(specFor(0, STORY_LOOP), specFor(1, STORY_LOOP));
export const strokes = new Strokes(specs, BEATER, specs[0].ready!);

// the great stroke's story times
const SB = story(BIG.t);
const SB_TOP = SB - 0.26;
const SB_LIFT = story(4.8) + 0.62;
/** her arms open to the sky after: from the follow-through to the pulse's return */
const OPEN = { in0: SB + 0.02, in1: SB + 1.4, out0: story(21.2), out1: story(22.4) };

export interface Moment {
  goal: BodyGoal;
  beater: StrokeState;
  /** how far the great stroke is: its wind-up (0..1), its downswing (0..1), after it (0..1 of the opening) */
  coil: number; swing: number; open: number;
  /** the stroke's flash (0..1, fading from each contact) */
  flash: number;
  /** the struck point and how hard it's pressed */
  hit: V3; press: number;
}

/** her body and the beater at story time s (s within the loop's story span) */
export function moment(s: number): Moment {
  const { st, stroke } = strokes.at(s);
  const big = stroke.s.speed > 8;
  const ch = stroke.chain(st);
  // the great stroke's own phases
  const coilBig = big ? clamp(st.coil, 0, 1) * (st.phase === 'down' ? 1 : 1) : 0;
  const lifting = big ? smooth(SB_LIFT, SB_TOP - 0.4, s) : 0;
  const swing = big && st.phase === 'down' ? st.swing : big && s >= SB ? 1 : 0;
  const open = bumpIn(OPEN.in0, OPEN.in1, OPEN.out0, OPEN.out1, s);
  // ---------------------------------------------------------------- the trunk: coil, then the chain unwinds it
  // normal strokes: a small coil and release; the great one: a deep one
  const coilAmt = big ? 1 : 0.25;
  let coil: number;
  if (st.phase === 'lift' || st.phase === 'hang') coil = st.coil;
  else if (st.phase === 'down') coil = 1 - ch.hips;
  else coil = 0;
  const after = st.phase === 'rebound' || st.phase === 'contact' ? 1 - st.settle : 0;
  const hipsYaw = (-0.42 * coil + 0.18 * after * (big ? 1.4 : 0.5)) * coilAmt;
  const trunkCoil = st.phase === 'down' ? 1 - ch.trunk : coil;
  const spineTurn = (-0.38 * trunkCoil + 0.22 * after * (big ? 1.2 : 0.5)) * coilAmt;
  // (the top of the great wind-up: arched back; the strike: crunched forward over it; then arched to the sky)
  const flex = big
    ? -0.22 * lifting * (1 - swing) + 0.38 * swing * (1 - open) * (1 - st.settle * 0.6) - 0.3 * open
    : -0.05 * coil + 0.1 * after;
  const side = big ? 0.12 * lifting * (1 - swing) - 0.06 * swing * (1 - open) : 0.03 * coil;
  // the pelvis: lower as it loads (the knees bend), forward as it drives
  const load = big ? lifting * (1 - swing) * 0.8 + swing * (1 - st.settle) : 0.25 * coil + 0.3 * after;
  const stepBack = big ? smooth(SB_LIFT, SB_LIFT + 0.9, s) * (1 - smooth(SB + 1.5, SB + 3.5, s)) : 0;
  const drive = big ? swing * (1 - smooth(SB + 1.5, SB + 3.5, s)) : 0;
  const at: V3 = add(BODY, [-0.16 * stepBack + 0.22 * drive, 0, 0.03 * stepBack]);
  // ---------------------------------------------------------------- the feet: planted wide; for the great stroke the
  // right foot steps back as she winds up, and the left drives forward
  const rStep = big ? smooth(SB_LIFT + 0.1, SB_LIFT + 0.7, s) * (1 - smooth(story(21.0), story(22.0), s)) : 0;
  const rFoot: V3 = add(FEET.r, [-0.28 * rStep, 0, 0.06 * rStep]);
  const lift = Math.sin(Math.PI * clamp((s - SB_LIFT - 0.1) / 0.6, 0, 1)) + Math.sin(Math.PI * clamp((s - story(21.0)) / (story(22.0) - story(21.0)), 0, 1));
  const lStep = big ? smooth(SB_TOP - 0.1, SB - 0.02, s) * (1 - smooth(story(21.0), story(22.0), s)) : 0;
  const lFoot: V3 = add(FEET.l, [0.12 * lStep, 0, -0.02 * lStep]);
  const feet: [FootGoal, FootGoal] = [
    { kind: 'flat', at: lFoot, yaw: YAW + 0.25 },
    lift > 0.02 ? { kind: 'free', at: add(rFoot, [0, 0.09 * lift + 0.08, 0]), yaw: YAW - 0.35, w: 0.7 } : { kind: rStep > 0.5 ? 'ball' : 'flat', at: rFoot, yaw: YAW - 0.35 },
  ];
  // ---------------------------------------------------------------- the hands
  const shoulderR = add(at, [0.02, 1.44, 0.2]);
  const right: HandGoal = gripGoal(st, shoulderR, true, { curl: 0.95, elbow: norm([-0.3, -0.6, 0.6]), elbowW: 0.5 });
  // the left: open toward the hide, rising a little with each stroke; reaching out at the drum for the great one;
  // raised to the sky after it
  const pulse = st.phase === 'lift' || st.phase === 'hang' ? st.coil : st.phase === 'down' ? 1 - st.swing * 0.5 : 0.5 * (1 - st.settle);
  let lp: V3 = [-0.56 + 0.05 * pulse, 1.2 + 0.1 * pulse, -0.08];
  let lFwd: V3 = norm([0.35, 0.9, -0.2]), lDown: V3 = norm([0.9, -0.2, 0.3]);
  const reach = big ? lifting * (1 - smooth(SB_TOP + 0.05, SB - 0.02, s)) : 0;
  lp = lerp3(lp, [-0.32, 1.78, -0.12], reach);
  lFwd = norm(lerp3(lFwd, [0.75, 0.6, -0.15], reach));
  lDown = norm(lerp3(lDown, [0.5, -0.8, 0.2], reach));
  // (the downswing pulls it in to the body: the counter-arm)
  const tuck = big ? swing * (1 - open) : 0;
  lp = lerp3(lp, [-0.62, 1.15, 0.0], tuck);
  lp = lerp3(lp, [-0.75, 2.0, -0.55], open);
  lFwd = norm(lerp3(lFwd, [0.1, 0.9, -0.4], open));
  lDown = norm(lerp3(lDown, [0.3, 0.2, 0.9], open));
  const left: HandGoal = { palm: lp, fwd: lFwd, down: lDown, tips: [null, null, null, null, null], curl: 0.12 + 0.1 * (1 - reach), elbow: norm([-0.2, -0.7, -0.6]), elbowW: 0.4 };
  // ---------------------------------------------------------------- where she looks
  const hit = stroke.s.at;
  let look: V3 = lerp3(hit, add(C, [0, 0.1, 0]), 0.3);
  const sky: V3 = [60, 70, 0];
  look = lerp3(look, sky, open);
  const breath = 0.5 + 0.5 * Math.sin(s * 1.3);
  const goal: BodyGoal = {
    at, yaw: YAW, feet,
    hands: [{ goal: left, w: 1 }, { goal: right, w: 1 }],
    pelvis: { height: 0.92 - 0.07 * load, hw: 0.6, yaw: hipsYaw, rw: 0.8, pitch: 0.05 * load - 0.08 * open },
    spine: { flex, side, turn: spineTurn, w: 0.8 },
    look, nod: big ? -0.15 * open : 0.05 * after,
    balance: 0.8, ease: 0.06, breath,
  };
  // the flash: brightest at contact, fading
  const since = st.since;
  const flash = since >= 0 ? Math.exp(-since * (big ? 0.9 : 6)) : 0;
  return { goal, beater: st, coil: big ? lifting : 0, swing, open, flash, hit, press: st.press };
}

/** the loop's story span for a film time (the strokes are on story time within one loop) */
export const storyAt = (t: number) => story(((t % LOOP) + LOOP) % LOOP);
