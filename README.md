# Rally Pixel

A pixel-art rally time-trial game played from inside the cockpit. Canvas-based, vanilla JS,
no game engine and no external assets — every sprite, gauge and letterform is drawn into
canvas at runtime. Built with Vite and deployed as a static site.

Vibe coded using Claude Opus 5 on high.

Designed for **landscape** phones first — the dashboard *is* the controller, the whole
layout is laid out on a resolution-independent grid, and safe-area insets keep every control
clear of notches and home indicators. It plays fine with a keyboard on desktop too.

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
index.html       page shell — the two canvases and the menu screens
src/main.js      the game — track builder, physics, cockpit, renderer, UI
src/carsprite.js the top-down car: a pseudo-3D body through a pixel pipeline
src/pixfont.js   the 5x7 bitmap face every label in the game is set in
src/style.css    retro rally styling for the menu screens
vite.config.js   build config (output to /dist)
```

Only two canvases exist while you are driving. The first carries the stage and the readouts
painted over it; the second is the cockpit. There is no DOM in the game view at all.

## The loop

Drive a stage against the clock → get paid for pace, for beating the target time and for
keeping the car straight → spend the credits in the garage → unlock the next stage and the
next car. Stages are gated on your car's **stats**, not on grinding, so progression follows
the upgrades you actually choose to buy.

## Units

Settings → `UNITS`. MPH by default, as on the cockpit reference; km/h is a switch away, and
the dial, the digital readout, the garage stats and the stage requirements all follow it.

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

## The cockpit

The bottom of the screen is a rally dashboard, drawn as one canvas: steering rockers under
the left thumb, a sliding gear selector, an analog tachometer reading in thousands of rpm
with the redline banded at 7, a shift block with paddle tell-tales, rev lights and a digital
speed readout, an analog speedometer, a turbo boost gauge, the handbrake lever, and the
throttle and brake pads under the right thumb. A strip of tell-tales runs along the bottom —
indicators, headlights, seatbelt, parking brake, traction, differential — and they all follow
what the car is actually doing.

The instruments sit on a raised centre binnacle that stands above the panel line and chamfers
back down at each end, and the paddles are bolted to it on cast mounting blocks — the dash is
a shaped moulding rather than a flat slab, which is most of its silhouette.

It is laid out on a fixed grid 128 rows deep, with a further 46 rows above it for the paddle
shifters, which stand proud of the dash top edge. One grid unit is a whole number of device
pixels, so a phone and a desktop get the same composition rather than the same art scaled by
CSS. The moulding is drawn full bleed to the screen edges; the layout inside it is inset by
the device's safe-area insets, so no control ends up under a notch or a home indicator.

Everything static — moulding, bezels, dial faces, every label — is painted once into an
offscreen bitmap at device resolution. A frame is one blit plus the needles, digits, lamps
and whichever controls are being held.

## Controls

The dashboard is the controller. There are no DOM buttons over the game.

| Action | Control | Keyboard |
|---|---|---|
| Steer | the rockers bottom left | arrows / `A` `D` |
| Throttle | `THROTTLE`, bottom right corner | `↑` / `W` |
| Brake | `BRAKE`, inboard of the throttle | `↓` / `S` |
| Handbrake | the lever above the throttle — locks the rears for hairpins, and reverses when stopped | `SPACE` / `SHIFT` |
| Shift | the paddles either side of the instruments, or the `SHIFT` arrows between the dials | `E` / `Q` |
| Pause | `II`, top right | `ESC` |

Both thumbs work at once — pointer ids are tracked to the control they went down on, so
holding the throttle while steering and reaching for the handbrake all works. Sliding a thumb
off a control releases it and onto another engages it. Reaching for a paddle while the
gearbox is in automatic hands the box over to manual and tells you so.

**Tilt** — enable in Settings (iOS asks for motion permission). Steering comes from the
phone's tilt; the throttle, brake and handbrake stay on the dash. Hold the phone how you want
to drive, then hit `CALIBRATE`.

## Framing

This is a chase cam, and the camera aims at a point *ahead* of the car, which means the car
is drawn that far down the screen and rides lower the faster you go. The camera watches where
the car will land and lifts its focal point only as far as it takes to keep it above the
dashboard — at low speed the framing is untouched. The frame also leans back under power and
pitches forward under braking, a few pixels, which is most of what sells acceleration.

## How it is rendered

The stage is not drawn straight to the screen. It goes into a small offscreen buffer a few
hundred pixels across, which is blitted up with nearest-neighbour filtering. That is what
makes the game read as pixel art rather than as smooth vector shapes: every tree, rut and
dust puff lands on the same coarse grid, and the car sprite is drawn at roughly 1:1 with it,
so a sprite pixel and a world pixel are the same size. It also cuts the fill cost by the
square of the scale factor, which is most of the reason it holds 60fps on a phone.

Both the world buffer and the dashboard have a ceiling on their internal resolution. Pixel
art does not get better by rendering a 1440-wide window at 720 internal pixels — it gets
smoother, which is the opposite of the point — and the fill cost grows with the area of the
window for no visual gain. Above the cap the blit simply scales up further and the pixels get
chunkier, which is what the art wants.

Objects are culled against the real screen rectangle in camera space rather than a radius
around the camera. The view is wide and shallow, because the dash takes the bottom of it, so
a radius selects roughly twice the trees that can actually be seen.

The readouts are drawn *after* the blit, at full device resolution, in a 5x7 bitmap face.
Nothing the player has to read is ever resampled: the world may be chunky and streaked with
motion, the instruments never are.

Light comes from the top left everywhere — scenery, car sprite, dashboard bezels — which is
most of what makes the three look like one picture.

## Graphics quality

Settings → `GRAPHICS`. Mobile defaults to MEDIUM, desktop to HIGH.

| | LOW | MEDIUM | HIGH |
|---|---|---|---|
| Internal resolution | coarse | normal | fine |
| Particles | 70 | 170 | 320 |
| Headlights | ground pool | ground pool | pool + cones |
| Scenery draw distance | short | normal | long |

Pick LOW if the game stutters or the phone gets warm — it is a real reduction in work per
frame, not a cosmetic switch.

## Turbo

Boost builds while the throttle is open and the engine is on the cam, bleeds away off
throttle, and dumps on an upshift or a hit. It is worth a modest torque multiplier — enough
to reward holding a gear and staying on the power, not enough to rewrite the car's stats.
Cars with more turbo fitted spool faster and hold more. The gauge on the dash reads it, and
you can hear the impeller in the gear whine and the valve on a lift.

## Driving it well

- The handbrake rotates the car far faster than steering alone. Use it for hairpins, not for
  fast corners — it scrubs a lot of speed.
- Sliding sideways costs speed. A tidy, slightly-sideways line beats a spectacular one.
- Trees, rocks and guardrails sit off the road. Clipping one costs speed and adds damage;
  past 48% damage the car smokes, and 100% damage costs you about 20% of your top speed.
- The brake and the handbrake are different tools. The brake is strong and stable and is what
  you use into every corner; braking distance follows the surface, so ice takes a lot longer
  to pull up on than tarmac. The handbrake is for hairpins.
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
