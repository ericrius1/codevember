// The beater's state over a window (film time): phase, hand, shaft, head, and the hand's acceleration.
//   node 09/lab/run.mjs 09/lab/beat.ts --from 18.85 --to 19.0
import { strokes } from '../perform';
import { story } from '../score';
const argv = process.argv.slice(2);
const flag = (k: string, d: string) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1]; };
const FROM = Number(flag('from', '18.85')), TO = Number(flag('to', '19.0'));
const H: number[][] = [];
for (let n = Math.round(FROM * 60) - 2; n <= Math.round(TO * 60); n++) {
  const t = n / 60, { st, stroke } = strokes.at(story(t));
  H.push([...st.hand, ...st.shaft]);
  if (H.length < 3) continue;
  const k = H.length - 1, acc = (o: number) => Math.hypot(...[0, 1, 2].map((j) => (H[k][o + j] - 2 * H[k - 1][o + j] + H[k - 2][o + j]) * 3600));
  console.log(`${t.toFixed(3)} ${st.phase.padEnd(8)} since ${st.since.toFixed(3)} settle ${st.settle.toFixed(3)} hand ${st.hand.map((x) => x.toFixed(3))} |a|hand ${acc(0).toFixed(1).padStart(6)} |a|shaft ${acc(3).toFixed(1).padStart(6)} ends ${stroke.ends.toFixed(3)}`);
}
