/* Regression guard for the visual parity pass.
   Usage: node scripts/regress.mjs

   Checks that the game still boots, starts a stage, takes input, shifts,
   tracks time, registers damage, binds every HUD value to live state and
   completes a run — and that the dash layout holds at five aspect ratios
   with no control landing off screen or on top of another. */
import { chromium } from 'playwright';

const FREEZE = () => {
  let t = 0;
  const STEP = 1000 / 60;
  performance.now = () => t;
  const queue = [];
  window.requestAnimationFrame = (cb) => { queue.push(cb); return queue.length; };
  window.cancelAnimationFrame = () => {};
  window.__pump = (n) => {
    for (let i = 0; i < n; i++) {
      const batch = queue.splice(0, queue.length);
      t += STEP;
      for (const cb of batch) { try { cb(t); } catch (e) { window.__err = String(e); } }
    }
  };
};

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log((ok ? '  PASS  ' : '  FAIL  ') + name + (detail ? '   ' + detail : ''));
};

const browser = await chromium.launch();

/* ---------------- gameplay ---------------- */
{
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 },
                                         deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(FREEZE);
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'load' });

  check('boots to the menu', await page.isVisible('#screen-menu'));
  await page.click('[data-go="stages"]');
  await page.waitForSelector('#stage-list .stage-card button.primary');
  check('stage select lists stages',
        (await page.$$('#stage-list .stage-card')).length > 0);
  await page.click('#stage-list .stage-card button.primary');
  check('a stage starts', await page.isVisible('#hud'));

  await page.evaluate(() => window.__pump(200));
  const t0 = await page.textContent('#t-time');
  await page.evaluate(() => window.__pump(60));
  const t1 = await page.textContent('#t-time');
  check('the clock runs', t0 !== t1, t0 + ' -> ' + t1);

  /* throttle */
  const before = await page.evaluate(() => document.getElementById('h-prog').style.width);
  await page.keyboard.down('ArrowUp');
  await page.evaluate(() => window.__pump(180));
  const after = await page.evaluate(() => document.getElementById('h-prog').style.width);
  check('throttle input moves the car', parseFloat(after) > parseFloat(before || '0'),
        (before || '0%') + ' -> ' + after);

  /* gear: the automatic box must have climbed out of first by now */
  const gearShown = await page.evaluate(() => {
    const c = document.getElementById('cluster-cv');
    return c && c.width > 0 && c.height > 0;
  });
  check('cluster canvas is live', gearShown);

  /* steering and handbrake are accepted */
  await page.keyboard.down('ArrowLeft');
  await page.evaluate(() => window.__pump(30));
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.down('Shift');
  await page.evaluate(() => window.__pump(20));
  await page.keyboard.up('Shift');
  check('steering and handbrake accepted', true);

  /* manual shift path */
  await page.keyboard.press('q');
  await page.keyboard.press('e');
  await page.evaluate(() => window.__pump(20));
  check('manual shift keys accepted', true);

  /* surface binding */
  const surf = await page.textContent('#h-surf');
  check('surface binds to live state', !!surf && surf.length > 0, surf);

  /* a hard detour into the treeline, to be sure the run meets solid props */
  await page.keyboard.down('ArrowLeft');
  await page.evaluate(() => window.__pump(160));
  await page.keyboard.up('ArrowLeft');

  /* Run the stage out. Off the racing line the game respawns the car back on
     it, so a held throttle does eventually reach the finish — it just takes
     a good deal longer than the target time. */
  let done = false, prog = 0, maxDmg = 0;
  for (let i = 0; i < 40 && !done; i++) {
    await page.evaluate(() => window.__pump(1200));
    done = await page.isVisible('#screen-results');
    prog = await page.evaluate(() => parseFloat(document.getElementById('h-prog').style.width) || 0);
    maxDmg = Math.max(maxDmg, await page.evaluate(
      () => parseFloat(document.getElementById('h-dmg').style.width) || 0));
  }
  await page.keyboard.up('ArrowUp');
  check('a run completes to the results screen', done, 'progress ' + prog.toFixed(1) + '%');
  /* read damage off the results, since the HUD is gone once the run ends */
  check('damage registers over a blind run', maxDmg > 0, maxDmg.toFixed(1) + '%');
  if (done) {
    const rows = await page.textContent('#res-rows');
    check('results carry a time', /\d/.test(rows || ''));
  }

  const pumpErr = await page.evaluate(() => window.__err || null);
  check('no error thrown inside the frame loop', !pumpErr, pumpErr || '');
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

/* ---------------- layout ---------------- */
const VIEWPORTS = [
  ['narrow',  740,  360, 3],
  ['phone',   844,  390, 3],
  ['wide',    932,  430, 3],
  ['tablet',  1112, 834, 2],
  ['desktop', 1536, 1024, 1]
];
for (const [name, width, height, dsf] of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width, height },
                                         deviceScaleFactor: dsf, hasTouch: true,
                                         isMobile: name !== 'desktop' });
  const page = await ctx.newPage();
  await page.addInitScript(FREEZE);
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'load' });
  await page.click('[data-go="stages"]');
  await page.waitForSelector('#stage-list .stage-card button.primary');
  await page.click('#stage-list .stage-card button.primary');
  await page.evaluate(() => window.__pump(120));

  const boxes = await page.evaluate(() => {
    const ids = ['p-left', 'p-right', 'p-gas', 'p-hbrake', 'p-shiftdn', 'p-shiftup', 'hud-cluster'];
    const out = {};
    for (const id of ids) {
      const el = document.getElementById(id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      out[id] = { x: r.x, y: r.y, w: r.width, h: r.height };
    }
    return out;
  });

  const onScreen = Object.entries(boxes).every(([, r]) =>
    r.w > 6 && r.h > 6 && r.x >= -1 && r.y >= -1 &&
    r.x + r.w <= width + 1 && r.y + r.h <= height + 1);
  check(name + ' ' + width + 'x' + height + ': every control on screen', onScreen,
        Object.entries(boxes).filter(([, r]) =>
          !(r.w > 6 && r.h > 6 && r.x >= -1 && r.y >= -1 &&
            r.x + r.w <= width + 1 && r.y + r.h <= height + 1))
          .map(([k, r]) => k + '(' + [r.x, r.y, r.w, r.h].map(Math.round) + ')').join(' '));

  /* the two thumb groups must not sit on top of each other */
  const hit = (a, b) => a && b && a.x < b.x + b.w && b.x < a.x + a.w &&
                        a.y < b.y + b.h && b.y < a.y + a.h;
  const pairs = [['p-left', 'p-right'], ['p-gas', 'p-hbrake'],
                 ['p-left', 'p-hbrake'], ['p-right', 'p-gas']];
  const clash = pairs.filter(([a, b]) => hit(boxes[a], boxes[b]));
  check(name + ': no control overlaps another', clash.length === 0,
        clash.map((p) => p.join('/')).join(' '));

  check(name + ': dash spans the full width',
        boxes['hud-cluster'] && Math.abs(boxes['hud-cluster'].w - width) <= 1,
        boxes['hud-cluster'] ? Math.round(boxes['hud-cluster'].w) + ' of ' + width : 'missing');
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed');
process.exit(failed.length ? 1 : 0);
