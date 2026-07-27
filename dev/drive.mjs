/* Development harness: boots the game at an iPhone-Safari landscape
   viewport, starts a stage and screenshots the dash — at the start line and
   again after driving for a while. Also reports console errors and a frame
   rate sampled from the running loop. Not part of the game. */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';

const OUT = process.env.SHOT_DIR || '/tmp/shots';
const URL = process.env.GAME_URL || 'http://localhost:5173/';
const VW = +(process.env.VW || 844), VH = +(process.env.VH || 390);
const DPR = +(process.env.DPR || 3);
/* A desktop browser reports no safe-area insets, so the notched-phone path
   would never be exercised. SAFE=l,r,b forces them onto the game's probe. */
const SAFE = (process.env.SAFE || '').split(',').map(Number);

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({
  viewport: { width: VW, height: VH }, deviceScaleFactor: DPR, hasTouch: true
});
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
if (SAFE.length === 3 && SAFE.every(n => !isNaN(n)))
  await page.addStyleTag({ content:
    `#safe-probe{padding:0 ${SAFE[1]}px ${SAFE[2]}px ${SAFE[0]}px !important}` })
    .catch(() => {});
await page.goto(URL, { waitUntil: 'networkidle' });
if (SAFE.length === 3 && SAFE.every(n => !isNaN(n)))
  await page.addStyleTag({ content:
    `#safe-probe{padding:0 ${SAFE[1]}px ${SAFE[2]}px ${SAFE[0]}px !important}` });

await page.click('[data-go="stages"]');
await page.waitForSelector('.stage-card button');
await page.click('.stage-card button');
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/game-start.png` });

/* hold the throttle and steer a little so the live parts all move */
await page.evaluate(() => {
  const fire = (id, type) => document.getElementById(id)
    .dispatchEvent(new MouseEvent(type, { bubbles: true }));
  fire('p-gas', 'mousedown');
  setTimeout(() => fire('p-shiftup', 'mousedown'), 1500);
  setTimeout(() => fire('p-left', 'mousedown'), 2600);
});
await page.waitForTimeout(3400);
await page.screenshot({ path: `${OUT}/game-drive.png` });

/* frame rate over a second of real running */
const fps = await page.evaluate(() => new Promise(res => {
  let n = 0; const t0 = performance.now();
  const tick = () => { n++; performance.now() - t0 < 1000 ? requestAnimationFrame(tick) : res(n); };
  requestAnimationFrame(tick);
}));

/* hit-box geometry, to confirm the zones do not overlap each other */
const zones = await page.evaluate(() =>
  ['p-left','p-right','p-shiftdn','p-shiftup','p-hbrake','p-gas'].map(id => {
    const r = document.getElementById(id).getBoundingClientRect();
    return { id, x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height) };
  }));

/* the panel must reach the true bottom edge: no game pixels below it, and
   nothing tappable inside the home-indicator inset */
const flush = await page.evaluate(() => {
  const c = document.getElementById('cluster-cv').getBoundingClientRect();
  const hits = ['p-left','p-gas'].map(id =>
    Math.round(window.innerHeight - document.getElementById(id).getBoundingClientRect().bottom));
  return { gapBelowPanel: Math.round(window.innerHeight - c.bottom),
           panelH: Math.round(c.height), hitBottomInset: hits };
});

console.log('fps', fps);
console.log('flush', JSON.stringify(flush));
console.log('zones', JSON.stringify(zones));
console.log('errors', errors.length ? errors : 'none');
await browser.close();
