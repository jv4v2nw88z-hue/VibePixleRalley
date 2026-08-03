/* Frame-cost probe for the visual parity pass.
   Usage: node scripts/perf.mjs [preset] [seconds]

   Wraps the game's own requestAnimationFrame callback and times how long each
   frame spends inside it. That is the number a visual change moves; the raw
   rAF interval in a headless browser is too noisy to compare across runs.
   Reports mean, median, p95 and worst frame in milliseconds. */
import { chromium } from 'playwright';

const preset = process.argv[2] || 'phone';
const seconds = Number(process.argv[3] || 8);
const PRESETS = {
  phone:   { width: 844,  height: 390,  deviceScaleFactor: 3 },
  tablet:  { width: 1112, height: 834,  deviceScaleFactor: 2 },
  desktop: { width: 1536, height: 1024, deviceScaleFactor: 1 }
};
const vp = PRESETS[preset] || PRESETS.phone;

const PROBE = () => {
  const raf = window.requestAnimationFrame.bind(window);
  window.__frames = [];
  window.requestAnimationFrame = (cb) => raf((t) => {
    const a = performance.now();
    cb(t);
    window.__frames.push(performance.now() - a);
  });
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height },
                                       deviceScaleFactor: vp.deviceScaleFactor,
                                       hasTouch: true, isMobile: preset !== 'desktop' });
const page = await ctx.newPage();
await page.addInitScript(PROBE);
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'load' });
await page.waitForSelector('#screen-menu', { state: 'visible' });
await page.click('[data-go="stages"]');
await page.waitForSelector('#stage-list .stage-card button.primary');
await page.click('#stage-list .stage-card button.primary');

await page.waitForTimeout(3500);                 /* countdown, then discard warm-up */
await page.evaluate(() => { window.__frames.length = 0; });
await page.keyboard.down('ArrowUp');
await page.waitForTimeout(seconds * 1000);
await page.keyboard.up('ArrowUp');

const f = await page.evaluate(() => window.__frames.slice());
f.sort((a, b) => a - b);
const at = (q) => f[Math.min(f.length - 1, Math.floor(f.length * q))];
const mean = f.reduce((a, b) => a + b, 0) / f.length;
console.log(preset + '  frames=' + f.length +
  '  mean=' + mean.toFixed(2) +
  '  median=' + at(0.5).toFixed(2) +
  '  p95=' + at(0.95).toFixed(2) +
  '  max=' + f[f.length - 1].toFixed(2) + '  (ms in frame callback)');

await browser.close();
