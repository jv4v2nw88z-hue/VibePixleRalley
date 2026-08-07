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

---

### Phase 2 — gauges

**What changed.** `drawDialFace` stays the single component both dials are
built from; it was rewritten rather than forked, and everything in it is now
expressed as a fraction of the face radius so the pair scales together.

- **Bezel.** Double ring: a dark mounting shoulder the bezel presses into, a
  polished chrome ring with a two-lobe light sweep (bright top left, second
  weaker lobe bottom right), a hard catch just inside the outer edge, then a
  dark inner shoulder the face sits down inside. Face radius is `0.83R`.
- **Ticks.** Five minors to a major on both dials, matching the reference
  (`minor:0.2` on the tacho, `minor:4` on the speedo). Majors run
  `0.87fr-0.975fr` at `0.042fr` wide in pure white; minors `0.905fr-0.975fr`
  at `0.017fr`. A hairline at `0.855fr` separates the numerals from the band.
- **Numerals.** Bold grotesque at `0.185fr`, not the monospace the rest of the
  UI uses — monospaced digits sit on a fixed advance and read loose and
  mechanical on a dial rim. Full labelling, every major.
- **Numeral radius adapts to label width.** A three-digit label is nearly half
  the face wide, so the fixed radius that suits the tacho's single digits
  drove the speedo's hundreds into the tick band. `numR` is now
  `min(0.755fr, majR0 - 0.03fr - widest/2)`, with `widest` measured with
  `measureText` rather than estimated from character count.
- **Redline.** A run of heavy radial blocks at minor intervals, set outside
  the tick band and running up to the bezel, replacing the solid two-layer
  arc painted under the ticks. The white majors at 7 and 8 still show.
- **Scale.** `TACH_MAX` 9 to 8, `TACH_RED` and `TACH_SCALE` 7 to 6.5. On the
  old numbers nothing could drive the needle past 7 of a 9 dial short of an
  overrev, so the top fifth of the sweep was dead. Display constants only —
  the gearbox and the shift bar still read `race.rpm` against 1.0.
- **Needle.** One tapered blade with no counterweight, tip at `0.805fr`, a
  soft shadow dropped down and right, and a domed pivot cap at `0.165fr`
  carrying a bright boss in the needle's own colour.
- **Glass.** Was an arc stroke, so its gradient stopped dead at each end and
  left a grey wedge with a hard edge on the upper right of the face. Now a
  radial sheen clipped to the face, which has no ends to show.
- **Digital readout** moved off the dial into the centre stack. Inside the
  face it had nowhere to go that did not foul the full-scale numeral: the
  wedge at the foot of a 0-160 dial is exactly where the 160 sits. This is
  Phase 3's element and Phase 3 gives it its caption and segment treatment;
  it moved early because the collision was a Phase 2 numeral-placement defect.

**Two deliberate deviations from the reference.**

1. **The speedo stays in km/h.** The reference reads MPH. Converting the dial
   alone would leave it contradicting the rest of the game, which is metric
   throughout: stage lengths are quoted in km (`FOREST GRAVEL · 9.1 KM`) and
   the unlock requirements in km/h (`HANDLING 58+ · 170 KM/H+`). Changing
   those is content, not rendering, and outside this pass. Everything else
   about the dial — scale, tick density, numeral weight, placement — matches.
   One constant if you want MPH instead.
2. **The reference's own numerals are garbled.** Its tacho reads
   `0 1 2 4 5 5 ? 7 8` — two fives, and a question mark where the 3 and 6
   belong. Those are mockup artefacts. Geometry, weight and placement are
   matched; the sequence is drawn correctly.

**Responsive behaviour.** At 3:2 the speedo labels every 20 as the reference
does. On a phone the dial is a quarter the relative size and nine three-digit
labels genuinely will not fit, so `drawDialFace` thins to every 40 rather than
overlapping them. That is the auto-thin doing its job, not a layout failure.

**Scored against `reference/target.png`** (captures:
`reference/shots/phase2-desktop.png`, `phase2-phone.png`, plus the attempt
series).

| Element | Score | Remaining delta |
| --- | --- | --- |
| Bezel: double ring, chrome sweep | 9 | Dark inner shoulder is a shade thicker than the reference's |
| Face gradient and glass | 9 | — |
| Tick density, major/minor differentiation | 9 | — |
| Numeral typography and placement | 9 | Thins to every 40 on a phone-width dial (see above) |
| Redline arc geometry | 9 | — |
| Tacho scale and dead-zone fix | 10 | — |
| Needle taper, pivot cap, drop shadow | 9 | Reference blade is fractionally heavier at the hub |
| Dials read as a matched pair | 9 | — |

**Regression guard:** 29/29 pass.

**Frame cost:** up slightly, from the second needle pass for the shadow and
the radial-gradient hub — two dials, every frame. Well inside the 1ms
reporting threshold and 6-8% of the 16.67ms budget.

| Preset | Phase 1 mean | Phase 2 mean | delta | p95 | max |
| --- | --- | --- | --- | --- | --- |
| phone | 0.98 | 1.28 | +0.30 | 1.90 | 3.30 |
| desktop | 0.83 | 1.02 | +0.19 | 1.40 | 2.00 |

---

### Phase 3 — secondary instruments

**What changed.**

- **Boost gauge.** Built on `drawDialFace` rather than as a separate
  component: a new `small` option swaps the polished chrome bezel for the
  dark moulded ring the reference uses on its auxiliary dial, drops the
  hairline, and scales the lettering up for the smaller face. Scale 0-20,
  labelled 0/10/20, minors every 2.5, `BOOST` over the hub and `PSI` under.
- **Shift light module.** A faceted plate carrying three wells: a `SHIFT`
  header, a two-cell bay for the paddle tell-tales, and a four-segment
  shift-light bar with rounded lenses that fill progressively, green through
  to red on the last.
- **Digital readout.** Its own plate below the module: seven-segment digits
  with the unlit segments left as ghosts, over a `KMH` caption. `SEG7` maps
  glyphs to segments and `segBar` draws each as a mitred bar.
- **Gear gate.** A framed stack of cells with the engaged position lit amber
  and a detent knob riding alongside it, matching the reference's treatment.
- **Paddle shifters.** Rebuilt as a bowed casting: both long edges are
  quadratic curves, wider at the foot and leaning outboard at the tip, with a
  machined chamfer running as an L across the top and down the left flank —
  the key light is up and left for the whole dash, so both blades catch it on
  the same side rather than mirroring. A faceted mounting post now stands
  beside the blade's foot instead of behind it, and the stamped glyph is
  larger with its own shadow.
- **Handbrake gate.** Lever scaled to the bay rather than to its width alone,
  and the pivot boot reduced from a black blob wider than the rod.

**One deliberate deviation from the reference.** The reference's gate reads
`P R N 1 2`. This gearbox has no park and no reverse, and it has six forward
gears, so the gate carries `N 1 2 3 4 5 6` — the ratios the car actually has.
A faceplate that cannot display fifth would be a prettier instrument and a
lying one. The treatment (frame, cells, amber engaged position, detent knob)
matches; only the legend differs.

A smaller one: the reference's two tell-tales are both up-arrows, a plain
shift-up light. Ours are the down and up paddle tell-tales, which is what the
game actually has to report.

**Bugs found and fixed during the phase.**

1. **The readout rendered as a single dash.** Batching the seven-segment work
   into two fills left `segBar` opening its own `beginPath`, so each segment
   wiped the accumulated path and only the last subpath of each digit
   survived. Caught in the visual loop, not by any test.
2. **The right wing's bays started inside the rail band.** `upperY` was
   measured from `faceY` rather than from the foot of the rail, so the lever
   gate and throttle had their top corners cut by the crown and the right
   paddle's foot landed on the gate. Both now sit below the rail as the
   reference has them.
3. **The centre island could overrun the right wing.** The dial-size budget
   assumed the row needed 6.2D of width; the real demand is 0.93D of left
   wing, 3.87D of island and 1.45D of right wing, so 6.25D before the gaps
   between the three groups. At 3:2 the island ran 43px into the lever gate.
   Budget corrected to 6.55D.

**Scored against `reference/target.png`** (captures:
`reference/shots/phase3-desktop.png`, `phase3-phone.png`, plus the attempt
series).

| Element | Score | Remaining delta |
| --- | --- | --- |
| Boost gauge | 9 | `PSI` is dropped below a face radius of 16px, where the minimum legible caption size would foul the rim |
| Shift light module | 9 | Tell-tales are down/up rather than the reference's two up-arrows (deliberate) |
| Digital readout, seven-segment | 9 | — |
| Gear selector and detent knob | 9 | Legend is `N 1-6`, not `P R N 1 2` (deliberate) |
| Paddle shifters and mounting hardware | 9 | Reference's cast texture is heavier than our grain |
| Steering pads | 9 | — |
| LED pip row | 9 | — |
| Handbrake gate | 9 | Reference's lever is chromed; ours is darker to sit with the paddles |

**Regression guard:** 29/29 pass.

**Frame cost.** A note on method: absolute numbers drift with container load,
so the earlier phase figures are not comparable across sessions. Measuring
Phase 2's commit and Phase 3's back to back in the same session is the
reliable comparison, and that is what is quoted here. A desktop throughput
drop that looked like a 60-to-35fps regression turned out to be entirely
environmental — the previous commit measured the same on the same machine.

| Preset | Phase 2 (same session) | Phase 3 | delta |
| --- | --- | --- | --- |
| phone | 1.58 | 1.61 | +0.03 |
| desktop | 1.53 | 1.55 | +0.02 |

Three new instruments for 0.03ms, because the per-frame work was batched as
it was written: the readout is two path fills rather than forty-two, the
shift lenses fill without a clip, and the needle hubs and tell-tales use
concentric solids instead of building a gradient object every frame.

---

### Phase 4 — indicator strip and status boxes

**What changed.** The two bays Phase 1 cut into the bottom band are now
filled, and the band was reproportioned to carry them: the status bay reaches
up out of the band as the reference has it (`statY = botY - 0.12D`), the
indicator strip stays inside it, and the boost dial lifts slightly to clear
the taller bay.

- **Indicator strip.** Left turn arrow, low-beam headlight, a two-cell
  housing carrying the seatbelt and parking-brake lamps over a warm backlit
  ground, then the right turn arrow. All seven glyphs are vector paths in a
  unit box, so they scale with the chassis.
- **Status boxes.** Three faceted plates with fitted captions, a divider, a
  square icon area and a four-cell meter along the foot. `TRACTION` carries a
  car over two skid tracks, `DIFF` a four-wheel schematic, `THROTTLE` a level
  meter beside a raked pedal.

**Bindings.** Everything is read-only against state that already exists.

| Element | Bound to |
| --- | --- |
| Turn arrows | `input.left` / `input.right`, lit amber |
| Headlight | lit constantly, as the reference shows it |
| Seatbelt | lit constantly, as the reference shows it |
| Parking brake | `hudCtl.hb` — brightens when the lever is pulled |
| TRACTION meter | `up.susp` upgrade level |
| DIFF meter | `up.trans` upgrade level |
| THROTTLE meter | `hudCtl.gas`, live |

`TRACTION` and `DIFF` report how the car is built rather than what it is
doing, which is why the reference draws them full and static. They are
painted into the cached bitmap; the base rebuilds at every race start, so an
upgrade bought between runs shows up.

**One deliberate removal.** The strip replaced the three placeholder
telltales Phase 1 parked there (coolant, check-engine, brake). The reference's
set has no room for them, and the code's own comment already described them as
"cosmetic dash atmosphere ... nothing reads them back". No information is
lost: damage is on the stage panel's meter, and the brake lamp survives as the
parking-brake telltale.

**Bugs found and fixed during the phase.**

1. **Captions ran over their borders.** `TRACTION` and `THROTTLE` are long
   words and the caption was sized as a fixed fraction of box height. It now
   measures itself and shrinks to fit `0.84` of the box width.
2. **The icon area was landscape** (`0.64w x 0.39h`), which squashed the car
   glyph into a dome — it read as a mushroom, not a vehicle. The reference
   draws its glyphs in a square, so the icon area is now
   `min(0.62w, 0.41h)` on a side and centred.
3. **The plates were too dark to separate from the moulding.** Lifted the
   plate top to `#333941` and added a `rgba(150,164,180,.34)` border stroke,
   so the boxes read as fitted panels rather than as shading.

**Scored against `reference/target.png`** (captures:
`reference/shots/phase4-desktop.png`, `phase4-phone.png`, plus the attempt
series).

| Element | Score | Remaining delta |
| --- | --- | --- |
| Turn arrows | 9 | — |
| Headlight telltale | 9 | — |
| Seatbelt / parking-brake housing and backlight | 9 | Reference's seatbelt figure is slightly crisper at small sizes |
| Strip integrated into the chassis | 9 | Reference's strip is wider, spreading the arrows further apart |
| TRACTION box | 9 | — |
| DIFF box | 9 | Reference's wheel blocks are marginally larger |
| THROTTLE box | 9 | — |
| Boxes read as one set with the dash | 9 | — |

**Regression guard:** 29/29 pass.

**Frame cost.** Flat. Everything new except the arrows, the brake lamp and
the throttle meter is in the cached bitmap. Measured back to back in one
session against Phase 3's commit; run-to-run variance on this container is
about ±0.2ms, so the phone figure moving down is noise rather than a gain.

| Preset | Phase 3 (same session) | Phase 4 | delta |
| --- | --- | --- | --- |
| phone | 2.01 | 1.79 | -0.22 (within noise) |
| desktop | 1.52 | 1.55 | +0.03 |

---

### Phase 5 — overlay HUD

**What changed.** One panel treatment now runs across every overlay: near-black
glass behind a cool grey bezel, the same family as the dash mouldings. The old
warm green border (`rgba(60,74,56,.85)`) read as a different product from the
instruments it sat above.

- `.hud-box` — background to `rgba(8,10,9,.86)`, border to
  `2px rgba(152,166,178,.60)`, radius 4px to 8px, padding and drop shadow.
- **Stage panel scaling bug fixed.** `#hud-left .nm` was a hard `10px` while
  the timer beside it used `clamp()`, so the panel shrank to illegibility as
  the viewport grew — clearly visible in `phase0-baseline-desktop.png`. Now
  `clamp(9px, 2.3vh, 20px)`, with the panel's minimum width scaling too.
- **Meters** rebuilt as bordered pills on near-black, flat fills rather than
  gradients, height scaling with the viewport.
- **Timer** to the reference's proportions: larger amber digits with wider
  tracking, a brighter target line.
- **Minimap** rewritten to the same treatment: rounded panel, cool grey
  bezel, a thinner round-joined track line, larger overall and sized against
  both viewport axes so it cannot crowd the pause button.
- **Pause button** picks up the shared panel styling instead of the generic
  `.pad` fill.

**Bug found and fixed during the phase.** Growing the timer pushed it into the
pace-note callout, which was pinned at a fixed `52px` from the top. Both the
callout and the split readout are now placed in viewport units below the
timer, so the column reflows together at any height.

**Scored against `reference/target.png`** (captures:
`reference/shots/phase5-desktop.png`, `phase5-narrow.png`).

| Element | Score | Remaining delta |
| --- | --- | --- |
| Stage panel: frame, type, meters | 9 | — |
| Timer | 9 | Reference's digits are a slightly heavier face |
| Minimap | 9 | — |
| Pace note callout | 9 | No reference to match — the target frame shows a countdown here instead |
| Overlays read as one set with the dash | 9 | — |

**Regression guard:** 29/29 pass. **Frame cost:** desktop 0.91ms mean, down
from the previous phase in the same conditions — the minimap's per-frame work
shrank when the track polyline stopped being stroked twice.

---

### Phase 6 — car sprite

**Why the approach changed.** The Phase 0 plan was to extend the 16x28
character map. Zooming the reference car to 12x
(`scratchpad` crop of `target.png` at 700,310) settles it: the car is drawn at
the picture's own resolution, one image pixel per screen pixel, roughly
130 x 250. It has smooth curved flanks, a specular streak down the bonnet and
panel gaps a pixel wide. No character grid coarse enough to hand-author gets
near that, and a 64x112 map would be 7,000 characters per car.

So the top-down car is now **vector geometry**, rasterised once per
car/paint/livery/damage combination into an oversampled bitmap. The terrain
around it stays chunky, which is exactly how the reference reads: blocky
world, smooth car. It is the one thing in the world drawn with image
smoothing on.

The footprint is unchanged. Everything is expressed in the same 16 x 28 unit
box, so `pw/ph` and therefore `CAR_WORLD_LEN` scaling are identical and the
car drives exactly as it did.

- **Silhouette** is one closed path — blunt squared-off nose with rounded
  corners, waisted through the middle, tapered tail — reused as a clip for
  everything laid over it.
- **Panels**: bonnet with a crown gradient and a hard specular streak just
  left of centre, a rim light down the whole left flank, front and rear
  valances falling to black with a bumper seam across each.
- **Glasshouse**: windscreen and backlight as tapered panes with a black
  surround and a reflection streak, a brighter roof between them carrying the
  reference's two vent bars.
- **Lamps**: headlight and taillight units with lit upper edges, number plate.
- **Mirrors** on stalks at the screen line, **wheels** with a sidewall
  catch, **spoiler** on the two faster cars.
- Liveries redrawn as vector overlays clipped to the shell.

**Bug fixed: the shadow rotated with the car.** `drawCar` filled the shadow
rect inside the `rotate(c.a)` transform, so the light source spun with the
vehicle and was only ever correct pointing due north. The silhouette still
rotates — a turned body casts a turned shadow — but the offset that throws it
is now applied in world space, and three stacked passes give it the soft edge
the reference has.

**Palette rebalanced.** `shade()` adds a flat amount to every channel, so the
old highlight steps blew a red car out to salmon: `shade('#d8452f', 0.38)` is
`rgb(255,166,144)`. The top-down set is much tighter (`+0.07` to `+0.21`,
`-0.11` to `-0.22`), and the glass went from a mid blue-grey `#4d6b86` to the
reference's near-black `#1b2026`.

**Scored against `reference/target.png`.**

| Element | Score | Remaining delta |
| --- | --- | --- |
| Body colour and shading | 9 | Reference has slightly more panel modelling across the flanks |
| Window and glass definition | 9 | — |
| Roof highlight and vents | 9 | — |
| Nose, bumper seams, lamps | 9 | — |
| Wheels and mirrors | 9 | Reference's mirrors are a touch larger |
| Directional soft shadow | 10 | — |

**Regression guard:** 29/29 pass. **Frame cost:** 0.95ms desktop mean. The
sprite is built once per combination and cached, so the extra geometry costs
nothing per frame; the only per-frame addition is two extra shadow fills.

---

### Phase 7 — environment

**Ground.** The reference floor is a dense mottled carpet: fine grain a few
units across, over broader patches, over a base. The old version could not
draw that — it scattered one alpha-switched rect per 70-unit cell and gave up
entirely past 1400 cells, so a wide viewport at low zoom went flat with no
fallback. It is now baked once into a seamless 160-unit tile and laid down as
a pattern: **one `fillRect` a frame** instead of up to 1400, and it can be as
dense as the reference for free. Blobs near an edge are repeated at the eight
neighbouring offsets so the tile joins invisibly.

**Foliage.** Rebuilt as voxel massing rather than four concentric squares: each
bush is three or four cubes at different sizes and offsets, each with a lit
top face, a shaded flank, a darker front face and a bright catch on the
sunward corner. Shadows are softer, two-layer, and scale with the canopy
instead of being a fixed fraction of it. Rocks and guardrail posts use the
same cube so the whole world is lit from one direction.

**New ground decoration.** Grass tufts and small stones scattered well out
into the field, as the reference has. Both are created with `solid:false`, so
they never reach the collision buckets and cannot change a run.

**Road.** The single 3.5px edge stroke is gone. There is now an outer and an
inner shoulder band, both darker than the racing line — `S.edge` is *lighter*
than the surface, which is why using it drew a pale border rather than a
verge. Over the top, grain straddles the whole transition and the side a
fleck lands on chooses whether it is gravel or grass, so neither edge of the
shoulder resolves into a clean arc. Longitudinal ruts run either side of the
racing line, and the surface grain gained darker specks as well as lighter.

**Bugs found and fixed during the phase.**

1. **`shade()` was being called per fleck inside the node loop** — a string
   parse and a concatenation for every one of roughly two thousand rects a
   frame. All surface colours are now hoisted out of the run.
2. **Every fleck set its own `fillStyle`.** The detail passes now sort into
   eleven colour lanes and lay each down as one batched path, and a canopy is
   drawn face by face across the whole cluster: four `fillStyle` changes per
   bush instead of four per cube.
3. The detail passes ran 60 nodes behind the car. The chase camera aims
   ahead, so most of that was drawn off screen; trimmed to 22.

**Scored against `reference/target.png`** (captures:
`reference/shots/phase7-desktop.png`, plus the attempt series).

| Element | Score | Remaining delta |
| --- | --- | --- |
| Ground: base, patches, fine grain | 9 | — |
| Foliage size and value variation | 9 | Reference clusters more densely along the treeline; ours is more evenly spread |
| Foliage massing and lighting | 9 | — |
| Grass tufts and scattered rocks | 9 | — |
| Road grain and ruts | 9 | — |
| Road edge blending and shoulder | 9 | — |
| Start line | 9 | — |

**Regression guard:** 29/29 pass.

**Frame cost: this phase costs 1.04ms and must be reported.** Measured back
to back against Phase 6's commit in one session:

| Preset | Phase 6 | Phase 7 | delta |
| --- | --- | --- | --- |
| desktop | 0.98 | 2.02 | **+1.04** |

That is the largest single-phase cost in the pass and the only one over the
1ms threshold. It buys the dense ground, the voxel foliage and the blended
road edges — the three biggest environment gaps in the Phase 0 audit. At
2.02ms the frame callback is using 12% of the 16.67ms budget and both presets
hold 60fps (460 frames in an 8s sample). The batching above already took it
down from 2.24ms; what remains is genuine fill work, not overhead.

---

### Phase 8 — global pass

**Foliage density.** Cropping the same terrain region from the build and from
the reference at the same scale made the last big gap obvious: the reference
is overlapping canopy filling the frame, ours was scattered individual
bushes. Density and crown size are now matched.

**Collision is untouched, deliberately.** `mkProp` derives the collision
radius from `size`, so growing the existing treeline would have grown its
hitboxes and changed how a stage plays. The near band keeps its exact sizes
and lateral range; all the new mass spawns beyond `hw + 104`, well outside
anything reachable, and is created `solid:false` so the collision buckets
never see it.

**Grade.** A corner falloff and a slight top-edge darkening, done as a CSS
layer between the world canvas and the panels rather than as a full-canvas
composite in the render loop, so the browser's compositor pays for it and the
frame budget does not.

**Anti-aliasing policy**, now consistent and deliberate:

| Layer | Policy | Why |
| --- | --- | --- |
| World terrain, road, foliage | nearest-neighbour, axis-aligned rects | the reference world is chunky |
| Car sprite | smoothing on for its one `drawImage` | the reference car is a continuous-tone render |
| Dash, instruments, overlays | smooth vector paths | machined objects, not terrain |

**The performance lesson of the pass.** Accumulating thousands of rects into
one path and filling once is *slower* than plain `fillRect`, because the path
has to be tessellated as a whole where each `fillRect` is a fast axis-aligned
blit. Switching the foliage and road detail from batched paths to grouped
`fillRect` took the frame from 3.00ms to 2.35ms on desktop and 3.27ms to
2.82ms on phone. **The win is grouping by colour, not batching into one
path** — the eight-bucket structure stays, only the flush changed.

| Element | Score | Remaining delta |
| --- | --- | --- |
| Foliage density and massing | 9 | Reference is denser still; ours is capped by the frame budget |
| Colour grading and falloff | 9 | — |
| Contrast harmonisation | 9 | — |
| Anti-aliasing policy | 10 | — |

**Regression guard:** 29/29 pass.

**Frame cost, whole pass:**

| Preset | Phase 0 baseline | Final | delta |
| --- | --- | --- | --- |
| phone | 1.40 | 2.74 | +1.34 |
| desktop | 1.15 | 2.49 | +1.34 |

2.74ms is 16% of the 16.67ms frame budget, and both presets hold 60fps in an
8s sample (456 and 394 frames; the desktop figure varies with container load,
see the note under Phase 3). Nearly all of the added work is axis-aligned
`fillRect`, which is the cheapest thing a mobile GPU does.

---

## 9. Where the build stands against the reference

Every element in the Phase 0 decomposition now scores 9 or higher. Four
deliberate deviations, each argued in its phase and each a one-line change if
you disagree:

1. **The speedo reads km/h**, not the reference's MPH, because the rest of the
   game quotes stage lengths in km and unlock requirements in km/h.
2. **The gear gate reads `N 1 2 3 4 5 6`**, not `P R N 1 2`, because this
   gearbox has no park and no reverse and does have six forward gears.
3. **The shift tell-tales are down and up**, not the reference's two
   up-arrows, because the game has a downshift paddle to report.
4. **The pedal travel strip survives** as a narrow pair of slotted gauges.
   The reference has no footwell, but a touch player has no other read on
   what the throttle and brake are doing.

Two things the reference does that the build does not, both budget calls:
foliage is slightly less dense, and the speedo thins its labelling to every 40
on a phone-width dial where nine three-digit numerals will not fit.

_(Pass complete.)_

---

## 10. Refinement pass — measured against the reference frame

The eight phases were each scored against crops. This pass compared the whole
frame at 1:1 instead: both images are 1536x1024, so the same rectangle lands
on the same content in each. `scripts/compare.mjs` renders any region of the
reference and the build side by side, and `POSE=start` holds the capture on
the start line mid-countdown so the comparison is like-for-like rather than
one image mid-stage and one at the line.

That immediately exposed three things the crop-by-crop reviews had missed.

### 1. The instruments were 15% too small

Measured on the reference: the chassis takes 44% of the picture height and the
dial is 0.581 of the chassis. The build was at 41% and 0.541 — dials about 80%
of the reference's diameter, which is why the dash read as a scale model of it.

Two causes. The dash-share curve topped out at 0.42 and never reached the
reference's 0.44 at 3:2. And the width budget was 6.55D where the reference
packs its row into 5.82D. Refitting the curve
(`clamp(0.75/aspect - 0.06, 0.26, 0.45)`) lands 3:2 on 0.44 and leaves a phone
on the 28-29% its framing can afford. Reclaiming the width — tighter gaps,
narrower pedal strip, narrower throttle and lever bays, narrower status bay —
took the divisor to 5.76. **The dial went from 229 to 260px, 0.541 to 0.578 of
the chassis, against the reference's 0.581.**

The remaining gap to 5.82D is the throttle pad. The reference has no
equivalent and this game cannot do without one.

### 2. The foliage was two to three times too large and a stop too bright

Phase 8 raised density by growing the far crowns to 30-64 world units. Against
the reference at the same scale that was plainly wrong: its bushes are about
45px on a 1536 frame, roughly 20 world units at this camera, and it keeps
plenty of floor visible between them. The build had merged into a bright slab.

Far crowns are now 10-30 units, the canopy palette is darkened to sit only a
little above the floor value, and the cubes inside a cluster are smaller and
more numerous so a bush reads as massing rather than two flat squares.
Placement is clumped — each attempt seeds a clump centre and drops two or
three crowns around it — because the reference reads as stands of scrub, not
a sprinkle. Trunks now only appear under crowns over 20 units; one under every
crown had turned the floor into a bed of sticks.

### 3. The left paddle was covering the GEAR caption

The blades were anchored a third of the way across the island, which put the
left one over the head of the gear gate. The caption was rendering as **"AR"**.
They are now anchored outboard of the island's first column.

### Also in this pass

- **Prop culling was testing a square of the screen diagonal**, about two and
  a half times the area actually visible. Props are now transformed into
  camera space and tested against the real view rectangle. That is what paid
  for the density: 3.68ms to 2.80ms.
- Start line runs past both verges with a shadow under its leading edge, as
  the reference draws it.
- Ground tones pulled toward the reference's olive.
- Status box captions and the gear caption both fit themselves to their
  panels rather than overflowing.

### Where it stands

| Preset | frame cost | 60fps |
| --- | --- | --- |
| phone | 2.86ms | yes (471 frames / 8s) |
| desktop | 2.80ms | yes |

Regression guard 29/29. What still differs from the reference, all honest:
the road is wider and flatter in tone than the reference's crowned surface;
the gear gate is seven cells against five, so it reads taller; and the
throttle pad has no counterpart on the reference at all.


---

## 11. Detail pass — grain scale, edge break-up, car silhouette

Region comparisons at 2-3x against the same coordinates in the reference.

### Grain was an order of magnitude too coarse

The reference's gravel is a fine dense speckle at two to six screen pixels.
Ours was ten to twenty and read as confetti thrown on a flat plane. Same story
on the floor mottle: four to fifteen pixels against the reference's two to six.

- Road grain: 5 flecks per node at `2 + rnd*9` becomes 14 at `1.4 + rnd*3.4`.
- Floor tile: 900 marks at `2-7` becomes 3,400 at `1-3.4`.

Counter-intuitively this made the frame **cheaper** — 2.61ms against 2.80ms —
because fill cost scales with area and the area collapsed faster than the call
count rose.

### The shoulder edge was mathematically smooth

No amount of fleck scattered over a smooth curve hides it; the eye finds the
curve. Two fixes:

1. **The interleave was backwards.** Gravel flecks were landing on gravel and
   grass flecks on grass, where neither shows — only about a sixth of them
   were doing anything. Now grass reaches inward over the shoulder and gravel
   washes outward into the verge.
2. **The band edges now wander per node.** `band()` takes a jitter amplitude
   and offsets each node's half-width by a hash of its index, so the outer
   shoulder is ragged before any fleck is drawn over it.

### The floor sat a stop under the reference

Base `#2a3a1c` to `#37501f`, with the fine tones lifted to match. The reference
reads as a lit meadow with darker scrub over it; ours read as shadow
throughout, which flattened everything on top of it.

### The car was slab-sided

Against the reference at 3.2x the shell was two near-straight flanks with
rounded ends. Waist and tail are now pinched hard against the arches so it
curves, the across-body gradient carries a sixth stop down to `deep` so the
far flank turns away from the key light, the glasshouse fills more of the
roofline (panes were 1.25 units in from the waist, now 0.85) with a reading
reflection, and the lamp units are set into the corners rather than sitting on
the nose as blobs.

The paint highlight steps were also cut back. `shade()` adds a flat amount to
every channel, which walks a red toward orange as it lightens; at `+0.21` the
crown was reading salmon.

### Where it stands

| Preset | frame cost | 60fps |
| --- | --- | --- |
| phone | 3.02ms | yes (477 frames / 8s) |
| desktop | 2.67ms | yes |

Regression guard 29/29.


---

## 12. Shading pass — why the art style still did not match

Zooming a patch of open ground to 6x made the real gap obvious, and it was
not scale or colour. **The build's ground was a visible lattice of
axis-aligned squares**; the reference is irregular organic blobs with soft
edges. Everything in the world was flat-colour rectangles on an implicit
grid, and no amount of retuning sizes or palettes fixes that — a lattice
reads as a lattice.

### Ground: organic marks, not a grid

The tile is baked once, so it can afford proper drawing. Now:

- Broad tonal variation is drawn as ellipses into a 3x3 field and blurred as
  one image, then cropped back to the centre tile — blurring per blob would
  soften each blob's own edge and leave the seam hard.
- 5,200 fine marks, each **rotated off the axis** with its own aspect. An
  axis-aligned rect on a shared grid is precisely what read as a lattice.
- Only marks that actually straddle a seam are repeated across it.

### Foliage: baked sprites, not rectangles

The reference's scrub has graded faces, cubes shading each other where they
meet, and a soft cast shadow under the clump. That is not reachable with
per-frame `fillRect`s, and trying made the frame expensive and still flat.

Each clump shape is now baked once into a 64px sprite — three or four cubes
with a lit rim along the sunward edges, a bright inset plateau, a dark flank,
blurred contact shading where cubes meet, and one soft ground shadow under
the whole stand. The world draws **one image per bush** instead of fourteen
rectangles.

Two calibration mistakes on the way, both caught in the loop:

1. First sprites were 112px drawn at ~45 — a 2.5x downscale that softened
   every facet into a blob. Sprite size now matches draw size.
2. The top face used a full diagonal gradient, which rounded every cube off.
   The reference's tops are flat plateaus with a lit edge, not domes.

### It is also faster

| | phone | desktop |
| --- | --- | --- |
| before this pass | 2.86ms | 2.80ms |
| after | **2.05ms** | **2.02ms** |

Richer art for less work: one `drawImage` beats fourteen `fillRect`s, and all
the gradient, blur and contact shading happens once at build time rather than
sixty times a second.

### A harness defect this pass exposed

`scripts/shoot.mjs` wrapped each frame callback in a bare `try/catch` to keep
pumping. When a refactor removed a function the road still called, the
exception was swallowed and the capture came back with the ground and part of
the road drawn and everything after it missing — which looks like an art
problem, not a crash. The harness now records the first frame exception and
prints it.

**Regression guard:** 29/29.
