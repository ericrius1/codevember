// How the picture and the sound meet at each stroke: frame by frame round its contact, the head's gap to the hide
// (its felt's face to the hide's plane, at rest), how deep it's pressed; and how far the camera stands from the struck
// point (the sound's way to it).
//   node 09/lab/run.mjs 09/lab/contact.ts
import { strokes, BEATER } from '../perform';
import { STROKES, story } from '../score';
import { shot } from '../camera';
import { DRUM } from '../stage';
for (const s of STROKES) {
  const hit = [DRUM.c[0], DRUM.c[1] + s.at[1], DRUM.c[2] + s.at[0]];
  const e = shot(s.t, { yaw: 0, pitch: 0 }).eye, d = Math.hypot(e[0] - hit[0], e[1] - hit[1], e[2] - hit[2]);
  console.log(`stroke ${s.t}: camera ${d.toFixed(2)} m from the struck point, the sound ${(d / 343 * 1000).toFixed(1)} ms on its way`);
  const f0 = Math.round(s.t * 60);
  for (let n = f0 - 4; n <= f0 + 4; n++) {
    const t = n / 60, { st } = strokes.at(story(t));
    console.log(`  frame ${n} t ${t.toFixed(4)} ${st.phase.padEnd(8)} since ${(st.since * 1000).toFixed(2).padStart(8)} ms  gap ${((DRUM.c[0] - st.head[0] - BEATER.headR) * 1000).toFixed(1).padStart(7)} mm  press ${st.press.toFixed(2)}  head ${st.head.map((x) => x.toFixed(3))}`);
  }
}
