# Rally Pixel

A pixel-art rally time-trial game. Canvas-based, vanilla JS, no game engine and no external
assets — every sprite is drawn into canvas at runtime. Built with Vite and deployed as a
static site.

Vibe coded using Claude Opus 5 on high.

Designed for **landscape** iPhone Safari — touch controls, safe-area insets, no zooming — but
it plays fine with a keyboard on desktop.

## Build

```bash
npm install     # install dependencies
npm run dev     # local dev server with hot reload, http://localhost:5173
npm run build   # production build to /dist
npm run preview # serve the built /dist output locally
```

### Deploying to Cloudflare Pages

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Output directory | `dist` |

The build uses a relative `base`, so it works from a domain root or a project subpath.

## Project structure

```
index.html       page shell and DOM (HUD, menus, garage, touch controls)
src/main.js      the whole game — sprites, track builder, physics, UI
src/dash.js      instrument-panel art: palette, pixel font and painters
src/style.css    retro rally styling for the HUD and menu screens
vite.config.js   build config (output to /dist)
dev/             screenshot harnesses for working on the dash (not shipped)
```

## The loop

Drive a stage against the clock → get paid for pace, for beating the target time and for
keeping the car straight → spend the credits in the garage → unlock the next stage and the
next car. Stages are gated on your car's **stats**, not on grinding, so progression follows
the upgrades you actually choose to buy.

## Stages

| Stage | Surface | Length | Unlocks at |
|---|---|---|---|
| Pine Hollow | Forest gravel (with a mud patch) | 9.1 km | open from the start |
| Col de Granite | Mountain tarmac (with a gravel cut) | 9.5 km | handling 44+ |
| Vitkull Pass | Snow pass (with ice sections) | 11.8 km | handling 58+ and 170 km/h+ |

Each surface has its own grip and rolling resistance, so the same car feels genuinely
different on gravel, tarmac, snow and ice — and tyre choice matters on each.

## Pacenotes

A co-driver calls the road ahead: `EASY LEFT`, `SHARP RIGHT`, `HAIRPIN LEFT`, plus hazard
calls like `ICE! CAUTION`, `MUD PATCH`, `CREST` and `TIGHTENS`. Notes are generated from the
stage geometry — severity comes from the corner radius — and arrive about 165 m before the
corner. Red notes are the ones that will hurt.

## Controls

**Buttons (default)**

| Action | Control |
|---|---|
| Steer | on-screen ◀ / ▶ |
| Throttle | `GAS` (or switch to auto throttle in Settings) |
| Handbrake | the lever on the right — locks the rears for hairpins, and reverses when stopped |
| Shift | the blades either side of the dash: `−` on the left drops a gear, `+` on the right takes one (manual gearbox only) |
| Pause | `II`, top right |

## The dash

The whole bottom band is a **single canvas** spanning the viewport edge to edge and sitting
flush on the true bottom edge — one slab of moulding with no gaps between the control zones
and nothing showing underneath it. On a notched phone the moulding runs on down through the
home-indicator inset while every touch target stops above it. Left to right: the steering
switchgear, the shift-down blade, the pedal box, the rev ladder and gear legends, the
tachometer, the centre stack with its tell-tales and digital km/h readout, the speedometer,
the warning lamps, the handbrake, the shift-up blade and the throttle pedal.

### It is rasterised, not drawn

Nothing on the panel goes through a smooth canvas primitive. There is no `arc()`, no
`stroke()`, no `createLinearGradient` — those anti-alias, and one anti-aliased circle makes
the whole panel read as vector art however chunky everything around it is. `src/dash.js`
carries its own rasteriser: circles and rings are filled a row at a time with stepped edges,
gradients come out as banded rows, arcs are walked by angle, polygons are scanline-filled to
whole pixels, and text is a 5×7 bitmap font. The canvas backing store is **one art pixel per
CSS pixel** — deliberately not device resolution — and `image-rendering: pixelated` blows it
up so each art pixel lands as a hard 2×2 or 3×3 block.

Every control's art lives on that shared panel, but each one keeps its own transparent hit
box parked exactly over its painted zone, so the dash reads as one object while the touch
targets stay separate. The boxes claim the dead moulding around their art and run the full
height of the panel, so no thumb has to be precise about a 25px pedal.

The art is in `src/dash.js` and was matched to a Pixel Car Racer dashboard by sampling the
reference image directly — bezel gradient, dial face, tick ring, numeral and needle colours,
and the proportions of every part as fractions of the gauge radius. The notable numbers:

| Part | Value |
|---|---|
| Bezel | vertical gradient `#959595` top → `#6d6d6d` centreline → `#545559` bottom, 0.082 R thick |
| Dial face | flat `#1e1e1e` under a `#111111` inner shadow from 0.845 to 0.918 R |
| Tick ring | `#9d9d9d` at 0.833 R, majors `#c8c8c8`, minors `#6a6a6a` |
| Numerals | tacho `#b2b3e3`, speedo `#c9c9c9`, glyph centres at 0.700 R |
| Needle | `#d2453c`, 0.66 R long, 0.068 R at the hub tapering to 0.039 R |
| Redline | `#b92c23`, banded 0.778 → 0.886 R |

Both dials start at 30° and gain 30° per division, exactly as the reference does, so the
speedometer sweeps 240° in eight steps and the tacho 270° in nine. The speedometer scales
itself to the car you are driving, and thins its labelling out when the dial gets small
enough that three-digit numbers would collide. Four warning lamps — check-engine, coolant,
ABS and beams — pick up on a battered car, a cooked engine and the handbrake, purely for
atmosphere.

The panel is held to under a fifth of the screen height and sits on the bottom edge. It has
to stay short: this is a chase cam, and the camera aims at a point *ahead* of the car, which
means the car itself is drawn that far down the screen and rides lower the faster you go. So
the camera also watches where the car will land and lifts its focal point only as far as it
takes to keep it above the dash — at low speed the framing is untouched.

The steering switches take the reference's NOS-button spot and construction — scalloped steel
collar, cap standing proud on a visible side wall, lit crescent upper-left and shadow
lower-right — but they are sized to two thirds of the panel height rather than the reference
button's one seventh, because steering is this game's primary input and has to be findable at
a glance. The cap is the panel's own steel and lights amber, not nitrous red.

Cost control: the parts that never move — panel shell, dial faces, readout moulding, gear
legend — are rasterised once into an offscreen bitmap and blitted as one image per frame. The
switchgear is cached as small sprites keyed on its quantised state. A frame is a couple of
blits plus the needles, digits and ladder as plain rectangles.

**Tilt** — enable in Settings (iOS asks for motion permission). Steering comes from the
phone's tilt; gas and handbrake stay on screen. Hold the phone how you want to drive, then
hit `CALIBRATE`. Sensitivity is adjustable.

**Keyboard** — arrows or WASD to steer and accelerate, `SHIFT`/`DOWN` for the handbrake,
`ESC` to pause.

## Driving it well

- The handbrake rotates the car far faster than steering alone. Use it for hairpins, not for
  fast corners — it scrubs a lot of speed.
- Sliding sideways costs speed. A tidy, slightly-sideways line beats a spectacular one.
- Trees, rocks and guardrails sit off the road. Clipping one costs speed and adds damage;
  past 48% damage the car smokes, and 100% damage costs you about 20% of your top speed.
- Beach it in a ditch and it drops you back on the road after a couple of seconds. The lost
  time is the penalty.

## Garage

Nothing is bought on the first tap. Tapping anything in the shop **fits it to the car as a
preview** — the sprite in the bay updates immediately, the stat bars show what would change,
and a bar above the bay names the item and its price with `PURCHASE` and `CANCEL`. Only
`PURCHASE` charges you and writes to the save; `CANCEL`, switching tabs or leaving the garage
puts the car back to its last paid-for state for free. Items you can't afford still go on the
car to look at — the purchase button greys out and says how far short you are.

- **Upgrades** — engine, turbo, suspension, gearbox, weight reduction. Three tiers each,
  per car, feeding top speed, acceleration, handling and mechanical grip.
- **Tyres** — all-terrain, gravel, tarmac slick and studded snow, three tiers each. Every
  compound has a per-surface grip multiplier; fit the right one for the stage.
- **Paint** — ten colours and four liveries (plain, stripes, rally #7, chevron), applied to
  the sprite you actually drive.
- **Cars** — Kestrel 1.6 GTI (free), Falcon RS Evo (CR 5,200), Vantor WRC-X (CR 16,500).

Upgrades are per car, so a new car starts stock.

## Payout

`finish fee + pace bonus + clean-run bonus + target-beaten bonus + first-clear bonus`

Pace scales continuously with how far under the target time you finish, so a slow run still
pays. Collisions cut the clean-run bonus.

## Saving

Credits, owned cars, upgrade levels, tyres, paint, liveries, best times and settings are all
kept in `localStorage` under `rallypixel.save.v1`. Settings → `RESET ALL` wipes it.
