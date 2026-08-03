/* Deterministic screenshot capture for the visual parity pass.
   Usage: node scripts/shoot.mjs <outfile> [preset]
   Presets: phone (844x390 @3), tablet (1112x834 @2), desktop (1536x1024 @1),
            narrow (740x360 @3), wide (932x430 @3)

   The run is made comparable between captures by freezing the game clock:
   performance.now is replaced with a counter the script advances by a fixed
   step, so the same number of frames always runs and the car always ends up
   in the same pose. The track RNG is already seed-based in the game itself. */
import { chromium } from 'playwright';

const out = process.argv[2] || 'reference/shots/shot.png';
const preset = process.argv[3] || 'phone';
const PRESETS = {
  narrow:  { width: 740,  height: 360,  deviceScaleFactor: 3 },
  phone:   { width: 844,  height: 390,  deviceScaleFactor: 3 },
  wide:    { width: 932,  height: 430,  deviceScaleFactor: 3 },
  tablet:  { width: 1112, height: 834,  deviceScaleFactor: 2 },
  desktop: { width: 1536, height: 1024, deviceScaleFactor: 1 }
};
const vp = PRESETS[preset] || PRESETS.phone;
/* how long the throttle is held: enough to be off the line, in gear and with
   the needles well up the dial, but short of the first corner */
const POSE_FRAMES = Number(process.env.POSE_FRAMES || 150);

/* Injected before any game code runs. Pins the clock and the frame pump so
   the capture is a pure function of the step count. */
const FREEZE = () => {
  let t = 0;
  const STEP = 1000 / 60;
  window.__tick = () => { t += STEP; };
  window.__now = () => t;
  performance.now = () => t;
  Date.now = () => 1700000000000 + t;
  const queue = [];
  window.requestAnimationFrame = (cb) => { queue.push(cb); return queue.length; };
  window.cancelAnimationFrame = () => {};
  window.__pump = (n) => {
    for (let i = 0; i < n; i++) {
      const batch = queue.splice(0, queue.length);
      window.__tick();
      for (const cb of batch) { try { cb(t); } catch (e) { /* keep pumping */ } }
    }
  };
  window.__queued = () => queue.length;
};

const browser = await chromium.launch({ args: ['--force-device-scale-factor=1'] });
const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height },
                                       deviceScaleFactor: vp.deviceScaleFactor,
                                       hasTouch: true, isMobile: preset !== 'desktop' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.addInitScript(FREEZE);
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'load' });
await page.waitForSelector('#screen-menu', { state: 'visible' });

await page.click('[data-go="stages"]');
await page.waitForSelector('#stage-list .stage-card button.primary');
await page.click('#stage-list .stage-card button.primary');

/* Run the countdown out and get the car rolling under a fixed throttle so the
   needles, gear and speed readout land on the same values every time. */
await page.evaluate(() => window.__pump(200));   /* countdown out, GO! message gone */
await page.keyboard.down('ArrowUp');
await page.evaluate((n) => window.__pump(n), POSE_FRAMES);
await page.keyboard.up('ArrowUp');
await page.evaluate(() => window.__pump(2));

/* the countdown banner is a transition, not part of the art being judged */
await page.evaluate(() => {
  const m = document.getElementById('big-msg');
  if (m) { m.classList.remove('show'); m.style.display = 'none'; }
});

await page.screenshot({ path: out });
console.log('wrote ' + out + '  ' + vp.width + 'x' + vp.height + '@' + vp.deviceScaleFactor);

/* Detail crops. These three carry most of the perceived quality, so every
   phase gets them at native resolution rather than judged from the full shot. */
if (process.env.CROPS) {
  const W = vp.width, H = vp.height;
  const band = await page.evaluate(() => {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--cluster-h');
    return Math.round(parseFloat(v) || 76);
  });
  const stem = out.replace(/\.png$/, '');
  const crops = {
    dash:   { x: 0, y: Math.max(0, H - band - 30), width: W, height: Math.min(band + 30, H) },
    gauges: { x: Math.round(W / 2 - 150), y: Math.max(0, H - band - 14), width: 300, height: Math.min(band + 14, H) },
    car:    { x: Math.round(W / 2 - 90), y: Math.round(H * 0.34), width: 180, height: 150 }
  };
  for (const [name, clip] of Object.entries(crops)) {
    await page.screenshot({ path: stem + '-' + name + '.png', clip });
    console.log('  crop ' + name);
  }
}
if (errors.length) console.log('PAGE ERRORS:\n' + errors.slice(0, 12).join('\n'));

await browser.close();
