// The frame rate a day really holds, live (rAF, resolution following the GPU as on the page; ?fixed holds it): frames
// in each second of a whole loop, and the longest gap in it (ms). On Apple GPUs this is the honest measure: they clock
// down to just make the display's rate, so a frame's GPU time says little about the room left.
//   node tools/fps.mjs 09 [--w 1440 --h 932 --dpr 2 --secs 27 --q '?fixed&sky=1']
import { chromium } from 'playwright';
const argv = process.argv.slice(2);
const flag = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv[i + 1]; };
const day = argv[0], w = Number(flag('w', 1440)), h = Number(flag('h', 830)), dpr = Number(flag('dpr', 2)), secs = Number(flag('secs', 27));
const browser = await chromium.launch({ channel: 'chrome', headless: true,
  args: ['--mute-audio', '--enable-unsafe-webgpu', '--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
page.on('pageerror', (e) => console.error('page:', e.message)); page.on('console', (m) => m.type() === 'warning' && !m.text().startsWith('draws') && console.log(m.text()));
await page.goto(`http://localhost:5190/codevember/${day}/${flag('q', '')}`);
await page.waitForFunction(() => document.body.classList.contains('ready'), null, { timeout: 90000 });
// (a day with sound waits at its threshold: strike Begin, as a visitor would)
if (await page.$('.begin-drum')) { await page.waitForSelector('.begin-drum:not([disabled])', { timeout: 90000 }); await page.click('.begin-drum'); await page.waitForTimeout(300); }
const r = await page.evaluate(async (secs) => {
  const kit = window.__kit; kit.profiler.force = true;
  const t0 = performance.now(), b = [], gpu = [], scale = [];
  let last = t0, serial = 0;
  await new Promise((done) => { const f = (now) => { const s = Math.floor((now - t0) / 1000); (b[s] ??= []).push(now - last); last = now;
    if (kit.profiler.serial !== serial) { serial = kit.profiler.serial; (gpu[s] ??= []).push(kit.profiler.lastFrameMs); }
    scale[s] = kit.renderScale;
    if (now - t0 < secs * 1000) requestAnimationFrame(f); else done(); }; requestAnimationFrame(f); });
  const med = (a) => { if (!a?.length) return 0; a = [...a].sort((x, y) => x - y); return a[a.length >> 1]; };
  console.warn('gpu ms (median, per second):', gpu.map(med).map((x) => x.toFixed(0)).join(' '), '| all:', med(gpu.flat()).toFixed(1));
  console.warn('render scale (per second):', scale.map((x) => x?.toFixed(2)).join(' '));
  console.warn('render scale at the end', window.__kit.renderScale); return b.map((a) => ({ fps: a.length, worst: Math.max(...a) }));
}, secs);
console.log(r.map((x, i) => `${i}s:${x.fps}(${x.worst.toFixed(0)})`).join(' '));
const all = r.slice(1).map((x) => x.fps); console.log('min', Math.min(...all), 'mean', (all.reduce((a, b) => a + b, 0) / all.length).toFixed(1));
await browser.close();
