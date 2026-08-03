import { chromium } from '/home/user/VibePixleRalley/node_modules/playwright/index.mjs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport:{width:844,height:390}, deviceScaleFactor:2 });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://127.0.0.1:5178/',{waitUntil:'networkidle'}); await p.waitForTimeout(400);
await p.click('[data-go="stages"]'); await p.waitForTimeout(250);
await p.click('#stage-list .stage-card button.btn.primary');
await p.waitForTimeout(4200);                      // countdown over
const read = async () => p.evaluate(()=>({
  t: document.getElementById('t-time').textContent,
  prog: document.getElementById('h-prog').style.width,
  surf: document.getElementById('h-surf').textContent }));
for (let i=0;i<6;i++){ await p.waitForTimeout(1500); console.log(JSON.stringify(await read())); }
console.log('errors:', errs.length?errs.join(' | '):'none');
await b.close();
