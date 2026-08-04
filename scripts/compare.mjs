/* Side-by-side region comparison against the reference.
   Usage: node scripts/compare.mjs <out> <x> <y> <w> <h> [zoom] [oursPng]

   Both images are 1536x1024, so the same rectangle lands on the same content
   in each. Reference on the left, build on the right, with a divider. */
import { chromium } from 'playwright';
import { readFileSync } from 'fs';

const [out, x, y, w, h, zoom = 2, ours = 'reference/shots/current-desktop.png'] =
  process.argv.slice(2);
const Z = Number(zoom), W = Math.round(Number(w) * Z), H = Math.round(Number(h) * Z);
const b64 = (p) => readFileSync(p).toString('base64');

const pane = (src, label) => `
  <div style="position:relative;width:${W}px;height:${H}px;overflow:hidden">
    <img src="data:image/png;base64,${src}" style="position:absolute;
      image-rendering:pixelated;left:${-Number(x) * Z}px;top:${-Number(y) * Z}px;
      transform-origin:0 0;transform:scale(${Z})">
    <div style="position:absolute;left:0;top:0;background:#000;color:#0f0;
      font:12px monospace;padding:2px 6px">${label}</div>
  </div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W * 2 + 6, height: H } });
await page.setContent(`<body style="margin:0;display:flex;background:#111">
  ${pane(b64('reference/target.png'), 'REFERENCE')}
  <div style="width:6px;background:#f0f"></div>
  ${pane(b64(ours), 'BUILD')}
</body>`);
await page.waitForTimeout(250);
await page.screenshot({ path: out });
console.log('wrote ' + out);
await browser.close();
