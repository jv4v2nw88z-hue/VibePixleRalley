# VibePixelRalley — Visual Parity Audit

Target: `reference/target.png` (1536x1024, 3:2)
Supplied "current build": `reference/current-build.jpeg` (2532x1170, iPhone landscape)
Actual current build: `reference/shots/phase0-baseline-*.png` (captured from `HEAD` = 89db659)

---

## 0. Read this first: the supplied "current build" screenshot is not this repo

Before writing the gap tables I captured the real build with Playwright at
`HEAD` (`89db659`, identical to `origin/main`). It does not look like
`reference/current-build.jpeg`.

`current-build.jpeg` shows a full-width sculpted dash carrying a boost gauge, a
SHIFT light module, a digital MPH readout, a `P R N 1 2` gear selector strip, an
integrated indicator strip with headlight / seatbelt / parking-brake / turn
telltales, and TRACTION / DIFF / THROTTLE status boxes.

**None of those exist in this codebase.** Verified by search across
`src/main.js`, `src/style.css` and `index.html`:

| Element in `current-build.jpeg` | Present at HEAD? | Evidence |
| --- | --- | --- |
| Boost gauge / PSI | No | no match for `boost` or `psi` outside an upgrade blurb |
| SHIFT light module | No | closest is two 12px telltale triangles, `drawAuxTri` |
| Digital speed readout captioned MPH | Partial | unlabelled number box, `main.js:2371` |
| `P R N 1 2` selector strip | No | single numeral in a "GEAR" barrel, `main.js:2381` |
| Indicator strip (headlight / belt / brake / arrows) | No | three 10px lamps in the aux stack, `drawLamp` |
| TRACTION / DIFF / THROTTLE boxes | No | no match anywhere |
| Full-width dash chassis | No | 348x72px centred binnacle, `clusterLayout` |
| MPH units | No | the build reads in KMH, `main.js:2122` |

What the real build has that the jpeg does not: a **pedal bay** (checker-plate
footwell with two animated pedals) occupying the left third of the binnacle.

The real build is also missing things the jpeg has that are not on the target
list at all, and the jpeg's own reported bugs do not reproduce (section 3).

**Conclusion:** `current-build.jpeg` is a mockup or a render from some other
build, not a screenshot of this repository. I have audited against
`reference/shots/phase0-baseline-*.png`, which I captured from this code. This
materially changes the size of the job: six of the seventeen elements you listed
are **net-new HUD to be built**, not restyled.

### What that means for the "no gameplay logic" constraint

Building the missing instruments needs read-only bindings to state that already
exists (`race.gear`, `race.rpm`, `car.damage`, `save.settings`, the turbo/tyre
upgrade levels). That is a rendering change and stays inside your constraint.

Two of them do **not** have backing state and I will not invent it without a
decision from you:

- **BOOST / PSI.** `turbo` is an upgrade *level* (0-3) that scales torque. There
  is no live manifold-pressure value. I can derive a cosmetic needle from
  `rpm x throttle x turboLevel` — a display-only expression, no physics touched.
- **TRACTION / DIFF.** Both are upgrade levels, not live state. These read as
  static configuration boxes on the target, so binding them to upgrade level is
  faithful and needs no new logic.

I flag `P R N 1 2` too: the gearbox has forward gears and no reverse or park.
The strip can render `P R N 1 2` as a fixed faceplate with only the live gear
lit, which is what the target shows, without any state machine change.

---

## 1. Render pipeline map

No asset files. No sprite sheets on disk. Everything is drawn with canvas
primitives at runtime. Three source files contribute pixels.

### Layer stack, back to front

| z | Layer | Owner |
| --- | --- | --- |
| auto | `canvas#game`, `alpha:false`, `image-rendering:pixelated` | `renderRace` |
| 20 | `#hud` (DOM overlays + the cluster canvas) | `style.css` + `drawCluster` |
| 25 | `#controls` (each pad owns a small canvas) | `drawSteer`, `drawHandbrake`, `drawPaddle` |
| 30 | `.screen` menu / stages / garage / lot / settings / results | `showScreen` |
| 40 | `#pause-overlay` | `style.css` |
| 90 | `#rotate` | `style.css` |

### World draw order — `renderRace` (`main.js:3096`)

1. flat fill with `track.off.color` (forest `#2f4023`)
2. `drawGroundDetail` — 70px grid, one alpha rect per cell
3. `drawRoad` — one polygon per surface run, speckle, then two edge strokes
4. `drawBanner` x2 — start and finish checker
5. `drawSkids` → `drawParticles(below)` → `drawProps` → `drawCar` → `drawParticles(above)`
6. `drawMinimap` (drawn in screen space after `restore`)

### Cluster canvas — `#cluster-cv`

Split into a cached base and a live pass, which is the frame-budget mechanism
already in place and must be preserved.

- **Cached** (`buildClusterBase`, rebuilt only when the viewport key changes):
  shell + top chrome catch, pedal bay, both dial faces (`drawDialFace`), gear
  barrel, rev-bar trough.
- **Live** (`drawCluster`, every frame): `drawImage(base)` then pedal plates,
  two needles, digital readout, gear numeral, rev-bar segments, two telltale
  triangles, knob, three lamps.

### Sprites

`CAR_SPRITES` — 16x28 character maps per car (`hatch`, `rally`, `wrc`),
expanded by `renderCarSprite` into a cached canvas per
`car|paint|livery|damageTier|scale`. `CAR_SIDE` drives the garage-only side
view and is out of scope for this pass.

---

## 2. Element-by-element gap tables

Colour values are read from source. Dial figures are for the phone preset
(844x390 @3, `D=66`, `R=33`).

### 2.1 Terrain and foliage

| Current | Target | Delta |
| --- | --- | --- |
| Flat `#2f4023` fill, then `drawGroundDetail` scatters one rect per 70px cell, size `16-50`, alpha `.45-.75`, from a 3-colour palette `#26361b / #37492a / #1f2d16` | Ground reads as layered grass: a base value, broad soft patches, then small light-green tufts at a third scale | Add a second, finer detail octave; widen the value range; break the single-rect-per-cell rule |
| Foliage is one prop type doing all the work: `drawProp` type 0 draws four concentric squares, size `17-32`, always axis-aligned, always the same 4-step ramp | Trees vary in size, silhouette and value; large dark canopies down to small mid-green bushes; visible clustering | Add size tiers and per-prop hue jitter; break the concentric-square silhouette with an offset step |
| Every prop gets the same hard `rgba(0,0,0,.33)` square shadow offset `+0.20s,+0.26s` | Shadows are softer, shorter, and scale with canopy size | Scale shadow offset and alpha with prop size; soften the shadow edge |
| No grass tufts, no scattered small rocks in open ground. Rocks only spawn as hazards at `hw+28..58` | Target has small grass tufts and grey rocks scattered well out into the field | New non-solid decoration pass (must not enter the collision buckets) |

### 2.2 Road surface

| Current | Target | Delta |
| --- | --- | --- |
| Gravel `#7d6647`, speckle `#8d7451`, 3 squares of `3-10px` every 2 nodes | Dirt with a warmer core, visible longitudinal ruts and a coarser grain | Add a rut pass along the centreline; raise speckle count and value spread |
| Edge is a single 3.5px `#a08a63` stroke on each side — a hard line into grass | Edge is a gradual gravel-to-grass transition: darker gravel shoulder, then broken grass encroachment | Replace the stroke with a shoulder band plus a scatter of grass squares straddling the boundary |
| Start line is `drawBanner`: 10 columns x 2 rows, depth 16, `#f2f2ea` / `#20242a` | Same idea, correct. Target's is wider than the road and sits proud of the surface | Widen past `hw`, add a thin shadow under the leading edge |

### 2.3 Car sprite

| Current | Target | Delta |
| --- | --- | --- |
| 16x28 map, body `#d8452f`; lighting is `x<3` lighter / `x>w-4` darker — a flat 3-band vertical ramp | Directional top-left key light, with a bright roof panel and a darker lower flank | Add a roof highlight band and a proper falloff, not two edge columns |
| Glass is two solid `#4d6b86` bands, full body width, no frame | Windscreen and rear screen are inset, darker, with a body-coloured A-pillar / roof between them and a lighter reflection streak | Inset the glass one pixel each side, add pillar colour and a highlight run |
| Shadow is `rgba(0,0,0,.30)` rect offset `+5,+6`, rotates with the car | Soft shadow offset down-right, does not rotate with the body, softer edge | Draw the shadow in world space, not in the car's rotated frame; soften |
| No mirrors, no roof vent, wheels are 1px `T` columns | Target shows mirrors, a defined roof, and wheels with a visible sidewall | Extend the character map |

### 2.4 Dashboard chassis

| Current | Target | Delta |
| --- | --- | --- |
| 348x72px rounded rect, centred, `rgba(20,25,31,.50)` → `rgba(4,6,9,.74)`, 7px radius, one 1px `rgba(150,170,196,.30)` stroke and a 3.5px white top wash | Full-width sculpted chassis: a raised top rail with a distinct crown, a recessed instrument face, panel seams, moulded vents, visible screws | Rebuild as a full-width chassis with a sculpted rail. This is the single biggest perceived-quality gap |
| `#dash-rail` is a separate CSS gradient strip behind the binnacle, masked to fade at 9% / 91% | The chassis *is* the band; nothing floats on top of it | Fold the rail into the chassis so there is one object |
| Controls are five independent canvases at the screen edges with their own chrome housings | Steering pads, paddles, lever and selector are all mounted *into* the chassis | Give every control a matching bezel cut into the chassis |
| Panel occupies 18% of height (phone) / 9% (desktop 3:2) | Target dash is ~42% of a 3:2 frame | **Decision needed** — see section 5 |

### 2.5 Tachometer

| Current | Target | Delta |
| --- | --- | --- |
| Range 0-9, redline at 7. The top 22% of the sweep is unreachable dead zone | Range 0-8, redline ~6.8-8, needle uses nearly the whole dial | Retune to 0-8 (`TACH_MAX`, `TACH_RED`, `TACH_SCALE` are display constants, not physics) |
| Numerals only at 0 / 3 / 6 / 9 on phone (`labelEvery: R>=44 ? 1 : 3`) | Every integer 0-8 labelled | Shrink numerals so full labelling fits |
| Numerals at `R*0.29` = 9.6px on a 33px dial — 29% of radius, oversized, which is *why* only four fit | Numerals ~13-15% of radius | Drop to ~`R*0.16`, re-seat the label radius |
| Redline is a continuous 2-layer arc: `rgba(255,59,47,.25)` glow + solid `#ff3b2f` | Target's redline is a run of discrete red **tick marks** on the outer ring, not a solid band | Rebuild as per-tick red segments |
| No `x1000` caption ("at this dial size it lands on the 0 and the 9") | `x1000` sits below centre, right of the hub | Reposition rather than omit |
| Ticks: major `R*0.125` / minor `R*0.065`, minor every 0.5 | Target minors are finer and denser, majors clearly longer and thicker | Increase minor density, widen the major/minor contrast |
| Needle blade `R*0.042` → `R*0.011`, hub `R*0.115` with a `#ff3b2f` centre dot | Target needle is a longer taper with a larger domed pivot cap and a visible drop shadow | Add the needle shadow; enlarge and dome the cap |

### 2.6 Speedometer

| Current | Target | Delta |
| --- | --- | --- |
| Reads **KMH**, 0-240, labels every 80 | Reads **MPH**, 0-160, labels every 20 | Unit conversion is display-only; `cluster.kmhMax` and the label |
| Only 0 / 80 / 160 legible at phone size | All nine numerals shown | Same numeral-size fix as the tacho |
| Face, bezel and glass share `drawDialFace` with the tacho — already a shared component | Same | Keep. Extend the options object rather than forking |
| Digital readout is an unlabelled box below the hub, `R*0.88` x `R*0.34` | Boxed readout below the SHIFT module with an `MPH` caption underneath, not inside the dial | Move it out of the dial into the centre stack |

### 2.7 Boost gauge

| Current | Target | Delta |
| --- | --- | --- |
| **Does not exist** | Small dial right of the speedo: `BOOST` label, `PSI` sub, `0 / 10 / 20` numerals, short red needle, thin chrome bezel | Build it. Needs a display-only pressure expression (section 0) |

### 2.8 Shift light module and digital readout

| Current | Target | Delta |
| --- | --- | --- |
| Two 12px telltale triangles + a knob + 3 lamps stacked between the dials | Boxed `SHIFT` module: caption, two blue up-arrows, a 4-segment LED strip below | Rebuild as one bordered module |
| Rev bar lives under the gear numeral: 5-7 segments, green / amber / red | Target's LED strip is inside the SHIFT module, 4 segments, green with a dark unlit remainder | Move and restyle |
| Digital readout inside the speedo dial, no caption | Separate box under SHIFT, numeral plus `MPH` caption below the box | Rebuild in the centre stack |
| The "hE" glyph bug **does not reproduce** — the readout draws `String(Math.round(kmh))` (`main.js:2379`) and rendered `94` correctly in every capture | n/a | No fix needed. This is a `current-build.jpeg` artefact |

### 2.9 Gear selector strip

| Current | Target | Delta |
| --- | --- | --- |
| A "GEAR" barrel with one large amber numeral (`N` under 2 units/s, else the gear) | Vertical `P R N 1 2` faceplate, unlit letters in grey, current position in amber, with a slider knob riding alongside on the right | Build the strip; keep the same `race.gear` binding |

### 2.10 Paddle shifters

| Current | Target | Delta |
| --- | --- | --- |
| 20x24 grid at CSS scale 2 — a raked checker-plate blade in near-white `#f2f5f8` / `#c3cbd2`, drilled holes, tiny stamped +/- | Large dark-grey raked blade with a bright top edge, a visible mounting bracket at the inboard base, and a big white `+` / `-` centred | Invert the value (dark blade, not bright), triple the size, add the bracket, enlarge the glyph |
| Sits at the far screen edge, floating, half-read as a texture swatch | Mounted onto the chassis, overlapping the top rail | Reposition and mount |

### 2.11 Indicator light strip

| Current | Target | Delta |
| --- | --- | --- |
| **Does not exist as a strip.** Three 10px lamps (temp / engine / brake) sit in the aux stack between the dials | Wide strip along the bottom of the chassis: grey left arrow, green headlight glyph, red seatbelt in a bordered box, red parking-brake in a bordered box, grey right arrow | Build the strip, integrated into the chassis (not a floating rounded bar) |
| Lamp glyphs are drawn at 10px and are illegible | Target glyphs are ~4x that and read cleanly | Size up |

### 2.12 Traction / Diff / Throttle boxes

| Current | Target | Delta |
| --- | --- | --- |
| **Do not exist** | Three captioned boxes bottom-right: green car-with-skid-marks, a differential schematic, a throttle-body glyph, each over a segment bar | Build. Bind to existing upgrade levels (section 0) |

### 2.13 Stage panel (top left)

| Current | Target | Delta |
| --- | --- | --- |
| `rgba(8,11,7,.62)` box, 2px `rgba(60,74,56,.85)` border, 4px radius. Labels 10px `--muted` `#8d9a86`, 1px letterspacing | Larger, neutral-grey type on a near-black panel with a thin cool-grey border, square corners | Warm green-grey → neutral; square the corners; raise type size |
| Type is a **fixed 10px** so the panel shrinks to illegibility on desktop (see `phase0-baseline-desktop.png`) | Scales with the frame | Move to `clamp()` like the timer already uses |
| Meters are 6px `#0d110c` troughs with a green gradient fill | Target meters are thinner, flatter, no gradient | Flatten |

### 2.14 Timer

| Current | Target | Delta |
| --- | --- | --- |
| Amber `#ffb432`, `clamp(17px,4.2vh,30px)`, 2px tracking, glow `0 0 10px rgba(255,180,50,.4)` | Near-identical. Target's box is slightly wider with more internal padding and a squarer corner | Closest element to parity already — minor padding and radius only |

### 2.15 Minimap

| Current | Target | Delta |
| --- | --- | --- |
| `min(120, W*0.19)` square, `rgba(8,11,7,.55)` fill, 2px `rgba(60,74,56,.85)` border, track polyline `#c9d3c2` at 2px, car dot `#ffb432` 6px | Larger, neutral-grey border, thinner track line, and the panel treatment matches the stage panel | Unify with the stage panel; thin the polyline; neutralise the border |

### 2.16 Pace note callout

| Current | Target | Delta |
| --- | --- | --- |
| `&#8598;` glyph in amber at `clamp(20px,5vh,34px)` + white text `clamp(12px,2.6vh,19px)`, 2px tracking, `0 2px 0 #000` shadow | Not visible in the target frame (it shows a countdown instead) | No target reference. Hold to the unified overlay treatment from Phase 4 and leave the layout alone |

### 2.17 Steering pads, handbrake, pedal bay

| Current | Target | Delta |
| --- | --- | --- |
| Two 34x30 chrome-housed rockers with solid arrowheads | Two tall dark pads with grey arrows, mounted in the chassis, plus a 4-LED green pip row above them | Restyle to dark; add the pip row |
| Handbrake: 20x32 canvas, animated lever, `HANDBRAKE` caption | Target shows a chrome shift lever in a slotted gate, no caption | Restyle to the gated-lever look, keep the existing animation binding |
| Pedal bay: checker-plate footwell, two animated pedals, left third of the binnacle | **Not present on the target at all** | **Decision needed** — see section 5 |

---

## 3. Bug verification

Each of the bugs you flagged, checked against the real build:

| Reported | Status at HEAD |
| --- | --- |
| Digital readout renders "hE" instead of a number | **Does not reproduce.** `main.js:2379` draws `String(Math.round(kmh))`; captures show `94`. Artefact of `current-build.jpeg` |
| Tach numerals misplaced around the dial | **Does not reproduce as misplacement.** `dialAngle` is correct and consistent. The real defect is different: numerals are drawn at 29% of radius, which is why only 4 of 9 fit |
| Redline arc short and mispositioned | **Confirmed, different cause.** Geometry is correct for its own scale; the problem is `TACH_MAX=9` vs redline at 7, leaving a dead top-of-dial, and a solid arc where the target uses discrete ticks |
| Foliage is uniform high-contrast noise, no depth or size variation | **Confirmed.** One prop type, one silhouette, one shadow treatment, `drawProp` type 0 |
| Road edges have no blending or shoulder transition | **Confirmed.** A single 3.5px stroke, `main.js:3209` |
| Indicator strip floats as a separate rounded bar | **N/A** — no indicator strip exists. The equivalent defect is that `#dash-rail` floats behind the binnacle as a separate CSS band |
| Paddle shifters are flat slabs with no mounting hardware | **Confirmed and worse than reported** — they are near-white checker plate at the screen edge and read as texture swatches, not controls |
| Car sprite is flat dark with no window definition or roof highlight | **Partly.** The car is red, not dark, and has glass bands. But there is no roof highlight and no window frame, and the shadow rotates with the body |

### Additional bugs found, not on your list

1. **Stage panel does not scale.** `#hud-left` type is a hard 10px while the
   timer uses `clamp()`. At desktop the panel is unreadably small
   (`phase0-baseline-desktop.png`, top left).
2. **Car shadow rotates with the car.** `drawCar` fills the shadow rect inside
   the `rotate(c.a)` transform (`main.js:3298`), so the light source spins with
   the vehicle. Wrong at every heading except due north.
3. **Ground detail silently drops out.** `drawGroundDetail` returns early when
   the visible cell count exceeds 1400 (`main.js:3148`). On a large viewport at
   low zoom the ground goes flat with no fallback.
4. **`drawGroundDetail` sets `globalAlpha` per cell** inside the loop — up to
   1400 state changes per frame. The single largest cheap win in the world pass.

---

## 4. Baselines

Captured at `HEAD` before any implementation work.

### Frame cost (ms inside the rAF callback, 480 frames under throttle)

| Preset | mean | median | p95 | max |
| --- | --- | --- | --- | --- |
| phone 844x390 @3 | 1.40 | 1.20 | 2.30 | 3.70 |
| desktop 1536x1024 @1 | 1.15 | 1.10 | 1.50 | 3.60 |

Budget at 60fps is 16.67ms. Headroom is large, but the target's dash is far
denser than the current one, so every phase gets re-measured with
`node scripts/perf.mjs`.

### Regression guard (all pass at HEAD)

Boots, reaches the menu, starts a stage, runs the countdown, accepts throttle,
auto-shifts through to 5th, tracks time, binds progress / damage / surface, and
holds layout at 740x360, 844x390, 932x430, 1112x834 and 1536x1024.

### Capture harness

- `scripts/shoot.mjs <out> <preset>` — deterministic capture. Freezes
  `performance.now`, replaces `requestAnimationFrame` with a manual pump, and
  drives a fixed 150-frame throttle hold, so the car pose, gear, revs and speed
  are identical across runs. `CROPS=1` also emits dash / gauges / car crops.
- `scripts/perf.mjs <preset> <seconds>` — frame-cost probe.

---

## 5. Two decisions I need from you

**A. Dash height.** The target's chassis is ~42% of a 3:2 frame. The current
binnacle is 18% on phone. The code caps it deliberately
(`clamp(vh*0.185, 54, 88)`) because this is a chase camera: `renderRace`
computes the car's on-screen drop and lifts the focal point to keep the car
clear of the dash (`main.js:3117-3121`). Growing the dash to target proportions
costs visible road ahead at speed and pushes the camera towards its `H*0.44`
clamp. My recommendation: grow to **~26-28% on phone**, scaled by aspect so the
3:2 desktop framing lands nearer the target's proportion. That reads as a real
dash without eating the driving view. Say if you want literal target proportions
instead and I will take the framing hit.

**B. The pedal bay.** The target has no footwell. The current build spends the
left third of the binnacle on one, and it is genuinely nice work. Options:
(1) keep it and let the chassis grow to fit the target's instruments alongside,
(2) shrink it to a narrow strip, (3) drop it. My recommendation is **(2)** — the
target's left third is occupied by the steering pads and the `P R N 1 2` strip,
and something has to give. Dropping it entirely loses the only visual feedback
for the throttle and brake on a touch device.

---

## 6. Deltas ranked by visual impact per unit of effort

| # | Delta | Impact | Effort | Ratio |
| --- | --- | --- | --- | --- |
| 1 | Dash chassis: full-width sculpted rail, seams, vents, screws, integrated strip | Very high | High | **High** |
| 2 | Gauge numeral sizing + full labelling + tick density | Very high | Low | **Very high** |
| 3 | Road edge blending / shoulder | High | Low | **Very high** |
| 4 | Foliage size and value variation | High | Medium | **High** |
| 5 | Paddle shifters: dark, larger, bracketed, mounted | High | Low | **Very high** |
| 6 | Tacho rescale 0-8 + discrete redline ticks | High | Low | **Very high** |
| 7 | Centre stack: SHIFT module + digital readout | High | Medium | High |
| 8 | Car sprite: roof highlight, window frame, fixed shadow | Medium-high | Low | **Very high** |
| 9 | Indicator strip integrated into chassis | Medium-high | Medium | High |
| 10 | Gear selector `P R N 1 2` with knob | Medium | Medium | Medium |
| 11 | Boost gauge | Medium | Medium | Medium |
| 12 | TRACTION / DIFF / THROTTLE boxes | Medium | Medium | Medium |
| 13 | Overlay unification (stage panel, minimap, timer) + the scaling bug | Medium | Low | **High** |
| 14 | Ground detail second octave + grass tufts + scattered rocks | Medium | Medium | Medium |
| 15 | Steering pads restyle + LED pip row | Low-medium | Low | High |
| 16 | Handbrake → gated lever | Low | Low | Medium |
| 17 | Global colour grading and contrast harmonisation | Medium | Low | High |

---

## 7. Proposed phase order

I am keeping your order with two changes, both argued below.

| Phase | Content | Change from your plan |
| --- | --- | --- |
| **1** | **Dash chassis and materials.** Full-width sculpted chassis absorbing `#dash-rail`, top rail with crown, panel seams, vents, screws, mounting bezels for every control, and the layout grid the later phases slot into. Resolves decisions A and B. | unchanged |
| **2** | **Gauges.** Shared `drawDialFace` extended, not forked: double-ring bezel, numeral resize, full labelling, major/minor tick contrast, tacho rescale to 0-8, discrete redline ticks, needle taper + domed cap + drop shadow, MPH conversion. | unchanged |
| **3** | **Secondary instruments.** Boost gauge, SHIFT module, digital readout, `P R N 1 2` selector, paddle shifters with brackets, steering pads, LED pip row, handbrake gate. | + steering pads and pip row folded in (they share the chassis-mounted bezel work) |
| **4** | **Indicator strip and status boxes.** Integrated indicator strip, TRACTION / DIFF / THROTTLE. | **new phase, split out of your Phase 3/4** — these are net-new elements and both live on the chassis, so they want their own diff loop |
| **5** | **Overlay HUD.** Stage panel, timer, minimap, pace note. Unified typography and panel treatment. Fixes the fixed-10px scaling bug. | was Phase 4 |
| **6** | **Car sprite.** Roof highlight, window frame and pillars, wheel sidewalls, mirrors, world-space soft shadow. | was Phase 5 |
| **7** | **Environment.** Foliage variation, grass tufts, scattered rocks, ground second octave, road grain and ruts, shoulder blending, start line. Also fixes the `globalAlpha`-per-cell cost and the 1400-cell dropout. | was Phase 6 |
| **8** | **Global pass.** Colour grading, contrast harmonisation, anti-aliasing policy, final polish. | was Phase 7 |

**Why the split at Phase 4:** the indicator strip and the status boxes are the
two elements most likely to look bolted-on, because they are new geometry
sitting on a chassis built in Phase 1. Giving them their own scored loop is
cheaper than discovering the integration is wrong at the end of a large
Phase 3.

**Why environment stays late** despite items 3 and 4 ranking high: the road and
foliage read differently once the dash occupies a different share of the frame,
and I would rather tune them against the final framing than tune them twice.

---

## 8. Phase logs

Scored gap reports are appended below as each phase completes. No phase is
committed until every element in it scores 9 or higher against the target.

### Phase 0 — complete

Audit written against Playwright captures from `HEAD`. Phase order and both
decisions approved as recommended: dash grows to roughly 26-28% of height on a
phone scaled by aspect, and the pedal bay survives as a narrow strip.

---

### Phase 1 — dashboard chassis and materials

**What changed.** The binnacle is gone. The dash is now one full-width canvas
moulding reaching the bottom edge of the screen, and every touch control is
mounted into a well cut in it rather than floating at a screen edge with a
housing of its own.

- `clusterLayout` rewritten from a strip of five columns into a grid across the
  whole viewport: a centre island (pedal strip, gear strip, tacho, centre
  stack, speedo, boost), a left wing (LED pips over the two steering pads), a
  right wing (lever gate, throttle, status bay), a bottom band carrying the
  indicator strip, and two paddle mounts on the rail.
- Dash height is now `clamp(0.62/aspect, 0.25, 0.42)` of the viewport: 28% on a
  phone, 41% at 3:2. Replaces the flat `min(vh*0.185, 88px)` cap.
- New material vocabulary, all painted once into the cached base bitmap:
  `facetPath`, `dashPlate`, `dashWell`, `dashBezel`, `dashSeam`, `dashVent`,
  `dashScrew`, `dashGrain`, `dashShellPath`.
- The rail gets its depth from a second copy of the shell profile dropped by
  the rail thickness, so the band follows every step and chamfer of the crown,
  with a scored foot, a lit lip and a soft shadow cast onto the face below.
- `#dash-rail` deleted. `applyDashLayout` publishes the grid as CSS custom
  properties and the stylesheet consumes them, so the chassis places the
  controls instead of the other way round.
- `drawSteer`, `drawHandbrake` and `drawPaddle` rewritten in smooth chassis
  coordinates. They no longer draw a housing each; the chassis provides it.
  The handbrake became a gated lever, the paddles gained mounting brackets.
- The footwell became two slotted travel gauges (decision B).
- Dead code removed: `hudPainter`, `pxInto`, `drawHousing`.

**Bugs found and fixed during the phase.**

1. `dashGrain` seeded `rnd2` with a running counter. `rnd2` hashes a 2D
   coordinate and is only well mixed across a plane, so walking it with an
   index put every sample on a lattice — a web of thin diagonals across every
   panel instead of speckle. Visible in
   `reference/shots/phase1-attempt-7-desktop.png`. Now uses `mulberry`.
2. `.pad.paddle.auto{opacity:.45}` erased the blades once they were restyled
   dark. The blade now keeps its material in automatic and only the stamped
   glyph reports the mode.
3. Paddles anchored at the canvas top buried most of the blade in the
   instrument face and collided with the wings at 3:2. They now hang off the
   rail like the reference, with only the foot dipping into the moulding.
4. Louvres were placed in the middle of each plain panel, straight underneath
   the paddle mounts. They now take the panel outboard of each blade.

**Scored against `reference/target.png`** (capture:
`reference/shots/phase1-desktop.png`, `phase1-phone.png`, plus the attempt
series). Only the elements this phase owns are scored.

| Element | Score | Remaining delta |
| --- | --- | --- |
| Sculpted top rail and crown profile | 9 | Reference crown has one more shoulder step at the extreme wings; ours steps twice, not three times |
| Bevels: plates, wells, bezels | 9 | Bezel gradient is a touch cooler than the reference's |
| Panel seams | 9 | — |
| Moulded vents | 9 | Only appear on wide aspects, where the reference has no dead panel to fill. Correct behaviour, no reference to score against |
| Fasteners | 9 | — |
| Indicator strip integrated into the chassis | 9 | Housing only; its contents are Phase 4 |
| Control mounting: pads, gate, throttle, paddles | 9 | Paddle blade taper is still coarser than the reference; Phase 3 refines the casting |
| Cast grain / material read | 9 | — |

**Regression guard:** 29/29 checks pass (`node scripts/regress.mjs`). Boots,
starts a stage, clock runs, throttle moves the car, steering / handbrake /
manual shift accepted, surface and progress bind to live state, damage
registers, a run completes to the results screen, no page errors. Layout holds
at 740x360, 844x390, 932x430, 1112x834 and 1536x1024 with every control on
screen, no control overlapping another, and the dash spanning the full width.

**Frame cost:** improved, well inside budget.

| Preset | Phase 0 mean | Phase 1 mean | p95 | max |
| --- | --- | --- | --- | --- |
| phone | 1.40 | **0.98** | 1.40 | 2.10 |
| desktop | 1.15 | **0.83** | 1.10 | 1.90 |

The gain is the pedal bay: the old footwell repainted a checker-plate face
cell by cell every frame, a few hundred `fillRect` calls. The travel gauges
are eight. Everything Phase 1 added went into the cached bitmap.

_(Phase 1 complete. Next: Phase 2, gauges.)_
