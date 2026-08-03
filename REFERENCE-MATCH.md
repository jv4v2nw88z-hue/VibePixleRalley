# Matching the build to the reference photograph

Working notes for whoever picks this up next. The task is to make the game
render as close as possible to a reference mockup of a rally game, supplied by
the user as a 1536x1024 PNG.

## The reference

`d666254f-53f079ab84c259630b6dc1386ad980bbd0ff5915.png`, 1536x1024, uploaded
twice (identical both times) under
`/root/.claude/uploads/4961e144-1999-5bc3-9a9f-2be2bb90949f/`.

Uploads do not survive a container restart. If it is gone, ask the user to
re-attach it — every number below was measured off that file and there is no
way to re-derive them without it.

**The single most important observation:** the world above the dash is chunky
pixel art, but the dash itself is *not*. It is moulded plastic photographed
head-on — smooth bezels, soft bevels, a fine grain in the mouldings and small
crisp lettering. Drawing the dash on the world's pixel grid was the original
sin that made every label collide and every instrument smear. The dash is now
drawn with real curves at device resolution (`#dash-cv` has no
`image-rendering:pixelated`); the world keeps its grid.

## How to compare

Chromium and Playwright are pre-installed. Do **not** run
`playwright install`; the browser lives at
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`.

```
npx vite --port 5178 --host 127.0.0.1 &        # dies between sessions, restart it
cd <scratchpad>
node shot1536.mjs out.png                       # renders at exactly 1536x1024
python3 -c "import sys; sys.argv=['x','out.png']; exec(open('cmp.py').read()); pair('a.png',(x0,y0,x1,y1))"
```

`shot1536.mjs` boots the game, clicks through to stage 1 and screenshots on
the countdown, at 1536x1024 CSS with DPR 1 — so the screenshot is pixel-for-
pixel comparable to the reference with no resampling. `cmp.py` stacks a crop
of the reference above the same crop of the render.

Both live in the scratchpad and will be gone next session; they are ten lines
each and quicker to rewrite than to hunt for.

### On the RMSE metric

A blurred whole-frame RMSE is useful early and misleading late. Once the
structure is aligned it starts penalising *correct* structure whenever the
procedural scenery happens to fall differently from the mockup's hand-painted
trees — which it always will, because the mockup is not generated from this
code. It went 28.7 (session start) -> 17.9 and then stopped tracking quality.

**Trust measurements, not the metric.** Bounding boxes, widths, positions,
colour means and percentile spreads are the reliable signals. Every change
below was driven by one of those.

## Measurements taken off the reference

All nominal units are `px / 5.12`, because the dash design grid is 300 units
across a 1536-wide frame.

| thing | reference |
|---|---|
| dash band | wings top y=627, binnacle top y=576 (10.5u proud), bottom 1024 |
| tacho | centre (552, 729), diameter 290 |
| speedo | centre (972, 729), diameter 286 |
| road | 296-307 px wide |
| car | 85 x 160, centred (765, 399) |
| car paint | #a4201c, nearly flat — one tone, not banded |
| checker cells | 25 px, eleven across the road |
| verge | mean #22360f, luminance p10/p50/p90 = 21/34/42 |
| dirt | mean #775b35, luminance p10/p50/p90 = 72/84/100 |
| foliage | lit-green runs: median 16 px, p90 38, max 56 |
| fascia median luminance | 24.7 / 15.7 / 16.7 / 15.3 / 15.3 / 13.0 down the band |
| strip lamp centres | 84.4, 106.4, 136.1, 162.6, 192.5 u — *not* evenly spaced |
| arrow glyph | 40 x 25 |
| headlamp glyph | 44 x 29 (wider than tall) |
| occupant glyph | 40 x 46 |
| parking glyph | 47 x 35 (a flattened ring) |

## Bugs found along the way

- **`rnd2` was silently broken.** It multiplied a 32-bit hash with `*`, which
  overflows 2^53 and drops the low bits, correlating output with input. The
  road mottle came out banked down one side of the ribbon and never covered
  the other half. Fixed with `Math.imul`. If procedural noise ever looks
  striped or one-sided again, suspect this first.
- **HUD panels were sized in CSS pixels**, so they shrank to stamps on a tall
  viewport. They are in `vh` now and hold their proportions at any aspect.
- **The headlamp glyph was mirrored** — bowl left, beams trailing off the
  wrong side.

## Still open

Ranked by how much of the frame they affect.

1. **The checker band's height is unresolved.** Its *width* is right (11
   cells, 25 px each, measured). Its height is not: a scan for bright rows
   gives the reference 472..587 and the render 491..547, but the reference's
   figure runs into the fascia lip at y=576 so it is contaminated. Re-measure
   with the scan clipped to y<560 before changing anything. Also the
   reference's cells are worn grey (`#d9d9d1` is close but its blacks are
   lighter than the render's) and its band may stop short of the verges.
2. **Treeline placement.** Density and block size are matched statistically,
   but the reference's bushes cluster in a band along the verge with clear
   grass between; ours are more evenly scattered. `buildScenery` biases
   laterally with `bias*bias` already — the remaining difference is
   clumping along the road, not across it.
3. **Fascia is still +2 to +6 luminance** through the middle bands, and +6
   in the 900-960 strip. Diminishing, but the strip pad is the place to look.
4. **The car** is the largest single cell error and always will be: the
   reference is a smooth 3D render, ours is a 28x42 pixel sprite. Size,
   position, colour and shadow all match now. Further gains need a finer
   grid, which starts to fight the game's own art style.

## Rules of engagement

- The game must stay playable. `probe.mjs` (scratchpad) boots a race and
  samples the timer, progress and surface every 1.5 s — run it after any
  change to physics constants, `CAR_WORLD_LEN`, or stage width. It should
  show progress climbing and `errors: none`.
- `CAR_WORLD_LEN` and `STAGES[].width` both affect gameplay, not just looks.
  They were changed (76 -> 86, 132 -> 139) to match the reference's
  proportions; that is deliberate and the user has seen it.
- Work on `claude/reference-photo-comparison-jf9o3q`. Do not open a PR
  unless asked.
