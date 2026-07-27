/* Development harness: screenshots each canvas in dash-lab.html and pairs it
   with the matching crop of the reference image, so each element can be
   compared side by side. Not part of the game. */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';

const OUT = process.env.SHOT_DIR || '/tmp/shots';
const URL = process.env.LAB_URL || 'http://localhost:5173/dev/dash-lab.html';
const only = process.argv.slice(2);

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 2500, height: 900 } });
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction('window.__labReady === true', null, { timeout: 15000 });

const ids = await page.$$eval('canvas', els => els.map(e => e.id));
for (const id of ids) {
  if (only.length && !only.includes(id)) continue;
  const data = await page.$eval('#' + id, c => c.toDataURL('image/png'));
  writeFileSync(`${OUT}/${id}.png`, Buffer.from(data.split(',')[1], 'base64'));
  console.log('shot', id);
}
await browser.close();
