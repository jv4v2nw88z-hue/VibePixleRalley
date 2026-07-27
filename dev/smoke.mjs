/* Throwaway smoke pass: walks the screens, races, pauses and resizes
   mid-race, reporting any console or page error. */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const p = await b.newPage({ viewport:{width:844,height:390}, deviceScaleFactor:2, hasTouch:true });
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
p.on('console',m=>{ if(m.type()==='error' && !/404/.test(m.text())) errs.push(m.text()); });
await p.goto('http://localhost:5173/', {waitUntil:'networkidle'});
const go = async n => {                        /* only the visible screen's button */
  await p.click(`.screen:not(.hidden) [data-go="${n}"]`);
  await p.waitForTimeout(300); console.log('screen', n);
};
await go('garage'); await go('menu'); await go('settings'); await go('menu'); await go('stages');
await p.click('.stage-card button'); await p.waitForTimeout(900); console.log('racing');
await p.tap('#p-pause'); await p.waitForTimeout(300);
await p.click('#pause-resume'); await p.waitForTimeout(400); console.log('resumed');
await p.setViewportSize({width:667,height:375}); await p.waitForTimeout(800);
await p.screenshot({path: process.env.SHOT_DIR+'/smoke-resize.png'}); console.log('resized');
await p.tap('#p-pause'); await p.waitForTimeout(250);
await p.click('#pause-quit'); await p.waitForTimeout(500); console.log('quit');
console.log('errors', errs.length?errs:'none');
await b.close();
