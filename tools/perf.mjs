// GPU time per frame of a day, headless: node tools/perf.mjs 04 [--size 1080] [--dpr 1] [--frames 40]
// (on the live dev server, npm run dev; each frame stepped by hand and waited for)
import { chromium } from 'playwright';
const argv = process.argv.slice(2);
const flag = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1]; };
const day = argv[0], size = Number(flag('size', 1080)), dpr = Number(flag('dpr', 1)), frames = Number(flag('frames', 40));
const browser = await chromium.launch({ channel: 'chrome', headless: true,
  args: ['--mute-audio', '--enable-unsafe-webgpu', '--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: dpr });
page.on('pageerror', (e) => console.error('page:', e.message));
await page.goto(`http://localhost:${process.env.PORT ?? 5190}/codevember/${day}/?perf&u=0.4`);
await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 60000 });
const r = await page.evaluate(async (frames) => {
  const kit = window.__kit;
  const ms = [];
  for (let i = 0; i < frames; i++) {
    const t0 = performance.now();
    kit.step(1 / 60);
    await kit.queue.onSubmittedWorkDone();
    ms.push(performance.now() - t0);
  }
  ms.sort((a, b) => a - b);
  return { median: ms[ms.length >> 1], p90: ms[Math.floor(ms.length * 0.9)], px: kit.size.canvas };
}, frames);
console.log(`${day} at ${r.px.join('×')}: median ${r.median.toFixed(1)} ms, p90 ${r.p90.toFixed(1)} ms`);
await browser.close();
