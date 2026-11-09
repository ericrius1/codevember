// The orbit telling's camera, checked without the GPU: it goes once all the way round and on to behind her, never
// jumps a frame, keeps clear of her, the drum and the dais, and the world stays slowed through the turn.
//   STYLE=orbit node 09/lab/run.mjs 09/lab/orbit.ts
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
    minDrum = Math.min(minDrum, Math.hypot(e[0] - O[0], e[2] - O[2]));
    minHer = Math.min(minHer, Math.hypot(e[0] - HER[0], e[1] - HER[1], e[2] - HER[2]));
    minY = Math.min(minY, e[1]);
    if (t <= ORBIT.start + 0.75 * (ORBIT.end - ORBIT.start)) maxRate = Math.max(maxRate, rate(t));
  }
}
const deg = (turned * 180) / Math.PI;
const end = shot(ACT.black, drag).eye;
console.log(JSON.stringify({ LOOP, ORBIT, degrees: deg, endEye: end.map((v) => +v.toFixed(2)), minDrum, minHer, minY, maxStep, maxJump, maxRate }, null, 2));
assert(Math.abs(Math.abs(deg) - 413) < 4, 'once all the way round and on to behind her (~413°)');
assert(end[0] < -2.5, 'ending behind her, the drum beyond her');
assert(minDrum > 2.2 && minHer > 1.6, 'clear of her and the drum');
assert(minY > 1.2, 'above the dais');
assert(maxJump < 0.004, 'no frame jumps (a frame\'s step never far off the last)');
assert(maxRate < 0.02, 'the world all but stopped through the turn (lifting only as it settles)');
