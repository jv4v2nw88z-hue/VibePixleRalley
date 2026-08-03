# Comparison harness

Throwaway tooling for matching the build against a reference image. Not part
of the game — nothing here is bundled or imported by `src/`.

See `../REFERENCE-MATCH.md` for what was measured and what is left.

```sh
npm i -D playwright                       # once; the browser is already on disk
npx vite --port 5178 --host 127.0.0.1 &

node tools/shot1536.mjs out.png           # render at exactly 1536x1024, DPR 1
REF=/path/to/reference.png python3 -c "
import sys; sys.argv=['x','out.png']
exec(open('tools/cmp.py').read())
pair('crop.png', (600,250,940,540))       # stacks reference over render
"
node tools/probe.mjs                      # drives a race, checks it still works
```

`shot1536.mjs` renders at the reference's own size with `deviceScaleFactor: 1`
so the screenshot is pixel-for-pixel comparable with no resampling in between.

Chromium is pre-installed at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`
— do not run `playwright install`.
