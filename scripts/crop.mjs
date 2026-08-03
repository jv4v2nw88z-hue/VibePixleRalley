/* Crop and zoom a reference image so detail can be inspected at native scale.
   Usage: node scripts/crop.mjs <in> <out> <x> <y> <w> <h> [zoom] */
import { chromium } from 'playwright';
import { readFileSync } from 'fs';

const [inp, out, x, y, w, h, zoom = 1] = process.argv.slice(2);
const b64 = readFileSync(inp).toString('base64');
const mime = inp.endsWith('.png') ? 'image/png' : 'image/jpeg';
const Z = Number(zoom);
const W = Math.round(Number(w) * Z), H = Math.round(Number(h) * Z);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.setContent(
  `<body style="margin:0;overflow:hidden">
   <img src="data:${mime};base64,${b64}" style="position:absolute;
     image-rendering:pixelated;
     left:${-Number(x) * Z}px; top:${-Number(y) * Z}px;
     transform-origin:0 0; transform:scale(${Z})">
   </body>`);
await page.waitForTimeout(200);
await page.screenshot({ path: out });
console.log('wrote ' + out + '  ' + W + 'x' + H);
await browser.close();
