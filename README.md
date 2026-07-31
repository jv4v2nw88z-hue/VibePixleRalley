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
src/style.css    retro rally styling for the HUD and menu screens
vite.config.js   build config (output to /dist)
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
| Steer | the ◀ / ▶ buttons on the left of the dash |
| Throttle | the right-hand pedal pad, out past the handbrake (or switch to auto throttle in Settings) |
| Brake | the left-hand pedal pad beside it |
| Handbrake | the lever inboard of the pedals — locks the rears for hairpins, and reverses when stopped |
| Shift | the tabs either side of the instruments: `−` drops a gear, `+` takes one (manual gearbox only) |
| Pause | `II`, top right |

Every dash control is one pointer surface rather than a handler per button: a press is
hit-tested against all of them, and so is every move that follows it, so a finger can go down
on one button and slide along the dash activating each in turn without being lifted. A pad
activates the moment the pointer enters its box and releases the moment it leaves — hold
controls are reference-counted, so a second finger arriving as the first leaves never drops
the input, and shift tabs fire on entry and re-arm on exit.

The hit boxes are deliberately larger than the art. `PAD_SLOP` (10px) is how far past its
drawn edge a button still counts as pressed, and `PAD_SNAP` (26px) is how far into genuinely
dead space a press may land and still be pulled to the nearest button — both are at the top
of the dash-pad block. Only one button ever takes a press: candidates are ranked by how far
off-centre the point is *as a fraction of that button's own half size*, so a point inside one
button's art always scores under 1 and beats a neighbour whose padding it merely grazes, and
a wide shift tab competes fairly with a tall pedal. The drag gesture tests the same boxes, so
a finger sliding along the dash gets the tolerance too — it can ride well above the strip and
still hand off from one control to the next.

**Speed units** — the speedometer reads in KPH or MPH, set in Settings or straight from the
pause menu. It is display only: the physics, the car stats and the stage targets are all in
km/h either way. The dial rescales to the same eight divisions in whichever unit is showing
(0-240 KPH, 0-160 MPH) and the readout and its label change together.

**Orientation** — the rotate prompt is unchanged, but once the player taps anything the game
asks the platform to pin landscape (Capacitor and Cordova plugins first, then the Screen
Orientation API) so a stage cannot flip out from under them. On Android that needs the
document fullscreen, which is only requested on a touch device; where none of it is
supported — iOS Safari has no orientation lock at all — it fails quietly and the prompt is
still there to do its job.

## The dash

The instrument binnacle along the bottom of the screen is one canvas, drawn from scratch
every frame: an analog tachometer
reading 0-9 in thousands of rpm with the redline banded in red at 7, a gear widget, a
console module, and an analog speedometer reading 0-240 with a digital km/h readout.

None of it is vector art. Everything on the cluster — bezels, tick marks, numerals,
captions, needles, lamps — is laid down a whole pixel at a time through a small pixel
toolkit (`pxDisc`, `pxRay`, `pxArcBand`, `pxPanel`, a 3x5 caption face and a bold 5x7 face
whose numerals carry the two-pixel strokes a dash font wants), so nothing is gradient-filled,
hinted or antialiased. One art pixel is one CSS pixel; the canvas is scaled underneath by an
integer device ratio, so every rect lands on exact device pixels.

The palette and the dial geometry are sampled off a reference cluster rather than guessed —
flat `#1C1C1C` glass under a two-tone grey bezel, a `#999999` tick ring the marks cross,
periwinkle `#B2B3E1` numbering on the tacho and grey `#C9C9C9` on the speedo, a `#B92C23`
redline band and a `#D2453C` pointer. Radii, as fractions of R: bezel 1.00-0.90, tick ring
0.83, numerals ~0.68, needle tip 0.72.

The gear widget is a slanted shift-light ladder — blue bars with green caps stepping outboard
as they descend, the bottom one red — with a GEAR caption over an `N R <gear>` row, the live
position lit. The console module between the dials stacks a bordered panel (caption, status
LED, the two royal-blue shift tell-tales), then the knob, then the digital km/h readout in
seven-segment digits.

Outboard of the speedo sits the lamp panel: a chrome surround around a near-black well
carrying three line-art tell-tales — check-engine, coolant, brake. Each icon is authored as a
17x11 bitmap so its silhouette stays exact and its strokes stay one pixel wide at any size.
Unlit they are a dim grey outline; lit, the icon takes its warning colour and the cell behind
it warms to match. They pick up on a cooked engine, a battered car and the handbrake, purely
for atmosphere — nothing reads them back.

The panel's columns are symmetric about its dials — gear widget outboard of the tacho, lamp
panel outboard of the speedo, both 0.70 D — so the **dials** straddle the middle of the
screen with no correcting offset at all. The dial size is then solved from what has to fit
either side of that middle: half the panel plus the docked run, of which the pedal block is
the part that scales with D. There is a slide-the-panel correction still in the code as a
backstop, but with the columns balanced it computes to zero.

The pedal pads dock at the outboard end of the dash, past the handbrake. They are cut to the
reference's own: near-white, rounded at the corners, tapering in towards the foot and shading
to grey at the bottom, with five dark studs laid out as a quincunx. They sink under the foot
and take a red or green tint. One canvas draws the pair at the panel's own art scale — one
pixel per CSS pixel, where the other docked controls draw at two — so they are the size and
spacing they always were; a pair of invisible tap targets laid over it makes them pressable,
each taking half the block so there is more finger to aim at than the art alone would give.

The dash is not a rectangle. It is a flat bar across the bottom of the screen with the two
dials standing proud of it: the bar's top edge runs *below* the tops of the dials, so the
circles break its outline rather than sitting inset inside it. The steering buttons get the
bar. The steering buttons and the shift tabs stay flush in the band, cast as the same flat
slanted parallelogram — near-black body, hairline outline, small grey stamp — the reference
uses for its minus and plus.

Every touch control docks against the cluster rather than the screen edge, and each is drawn
on its own canvas in the same pixel-art metal as the binnacle — no text-label boxes. Left to
right: steering buttons, `−`, the instruments, `+`, handbrake lever, pedals. JS positions
them from the panel's measured width, so the whole run stays one dashboard at any screen size
instead of a row of islands floating over the road.

The dash is held to under a fifth of the screen height and pinned to the bottom edge. It has
to stay small: this is a chase cam, and the camera aims at a point *ahead* of the car, which
means the car itself is drawn that far down the screen
and rides lower the faster you go. So the camera also watches where the car will land and
lifts its focal point only as far as it takes to keep it above the dash — at low speed the
framing is untouched.

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
