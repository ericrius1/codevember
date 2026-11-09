// The camera after the great stroke, checked without the GPU: held on the struck point, then drawn back and round to
// behind her (a third of a turn, a little to her left), never jumping a frame, never inside her, the drum or the
// ground, while the world stays slowed to the end.
//   node 09/lab/run.mjs 09/lab/camera.ts
import assert from 'node:assert/strict';
import { shot, ORBIT } from '../camera';
import { rate, LOOP, ACT } from '../score';

const drag = { yaw: 0, pitch: 0 };
const O = [0, 1.06, 0], HER = [-0.84, 1.1, 0.2];
let turned = 0, prevAz: number | null = null, prev: number[] | null = null, maxStep = 0, lastStep = 0, maxJump = 0, minDrum = Infinity, minHer = Infinity, minY = Infinity, maxRate = 0;
for (let t = ORBIT.pull - 1; t <= ACT.black; t += 1 / 60) {
  const p = shot(t, drag), e = p.eye;
  const az = Math.atan2(e[2] - O[2], e[0] - O[0]);
  if (prevAz !== null && t >= ORBIT.pull) { let d = az - prevAz; d -= 2 * Math.PI * Math.round(d / (2 * Math.PI)); turned += d; }
  prevAz = az;
  if (prev) {
    const st = Math.hypot(e[0] - prev[0], e[1] - prev[1], e[2] - prev[2]);
    maxStep = Math.max(maxStep, st);
    // (a jump: a frame's step far off the one before it — the speed itself may be anything smooth)
    if (lastStep > 0.002) maxJump = Math.max(maxJump, Math.abs(st - lastStep));
    lastStep = st;
  }
  prev = e;
  if (t >= ORBIT.start) {
    // (and from the turn's start on: the world never back up to its own pace)
    maxRate = Math.max(maxRate, rate(t));
    minDrum = Math.min(minDrum, Math.hypot(e[0] - O[0], e[2] - O[2]));
    minHer = Math.min(minHer, Math.hypot(e[0] - HER[0], e[1] - HER[1], e[2] - HER[2]));
    minY = Math.min(minY, e[1]);
  }
}
const deg = (turned * 180) / Math.PI;
const end = shot(ACT.black, drag).eye;
console.log(JSON.stringify({ LOOP, ORBIT, degrees: deg, endEye: end.map((v) => +v.toFixed(2)), minDrum, minHer, minY, maxStep, maxJump, maxRate }, null, 2));
assert(deg < -20 && deg > -40, 'drawn round toward behind her, a little (~30°)');
assert(end[0] < -2.5, 'ending behind her, the drum beyond her');
assert(minDrum > 1.0 && minHer > 1.0, 'clear of her and the drum');
assert(minY > 1.2, 'above the summit');
assert(maxJump < 0.004, 'no frame jumps (a frame\'s step never far off the last)');
assert(maxRate <= 0.1601, 'the world slowed to the end: never back above its slowed pace');
