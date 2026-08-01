# Rally Pixel

A pixel-art rally time-trial game. Canvas-based, vanilla JS, no game engine and no external
assets - every sprite is drawn into canvas at runtime. Built with Vite and deployed as a
static site.

Vibe coded using Claude Opus 5 on high.

Designed for **landscape** iPhone Safari - touch controls, safe-area insets, no zooming - but
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
src/main.js      the whole game - sprites, track builder, physics, UI
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
different on gravel, tarmac, snow and ice - and tyre choice matters on each.

## Pacenotes

A co-driver calls the road ahead: `EASY LEFT`, `SHARP RIGHT`, `HAIRPIN LEFT`, plus hazard
calls like `ICE! CAUTION`, `MUD PATCH`, `CREST` and `TIGHTENS`. Notes are generated from the
stage geometry - severity comes from the corner radius - and arrive about 165 m before the
corner. Red notes are the ones that will hurt.

## Controls

**Buttons (default)**

The throttle drives itself. From the moment the countdown ends the car holds the gas on its
own and only lets go for the handbrake or a crash recovery, so there are exactly three things
to touch:

| Action | Control |
|---|---|
| Steer | the two arrow buttons at the far left of the dash |
| Shift | the paddles above the dash line: `-` on the left drops a gear, `+` on the right takes one (manual gearbox only) |
| Handbrake | the lever in its slot at the upper right - cuts the throttle, locks the rears for hairpins, and backs the car out when stopped |
| Pause | `II`, top right |

Every control has a padded hit box around its art, and a thumb dragged from one to the next
hands over without being lifted, so you can slide from the left arrow to the right without
looking at the screen.

## The dash

The dashboard fills the bottom of the screen, full width and flush to the bottom edge, with
a raised housing bulging up in the middle to cradle the two big dials. It is one canvas
painted on an integer pixel grid and blitted with nearest-neighbour scaling, so nothing on
it is antialiased and every label comes from a 3x5 bitmap face rather than the browser's
text rendering.

Left to right: five indicator lamps over the two steering arrows, the P / R / N gear
selector, the tachometer (thousands of rpm, redline banded from 7), the centre stack with
its shift bar, up-chevrons, rev segments and digital speed readout, the speedometer, a boost
gauge, and the handbrake standing in its slot. Along the bottom run the indicator strip and
the TRACTION, DIFF and THROTTLE panels, all three of them readouts.

`Settings → UNITS` switches between MPH and KPH, and drives the analog speedometer face and
the digital readout together.

This is a chase cam: the camera aims at a point *ahead* of the car, so the car is drawn that
far down the screen and rides lower the faster you go. The camera watches where the car will
land and lifts its focal point only as far as it takes to keep it clear of the dash, gauge
housing included, and the countdown is parked just above the car's roof so it never covers
it.

**Tilt** - enable in Settings (iOS asks for motion permission). Steering comes from the
phone's tilt; the paddles and handbrake stay on the dash. Hold the phone how you want to
drive, then hit `CALIBRATE`. Sensitivity is adjustable.

**Keyboard** - arrows or A / D to steer, `SHIFT` / `DOWN` / `SPACE` for the handbrake,
`E` / `Q` to change gear in manual, `ESC` to pause.

## Driving it well

- The handbrake rotates the car far faster than steering alone. Use it for hairpins, not for
  fast corners - it scrubs a lot of speed.
- Sliding sideways costs speed. A tidy, slightly-sideways line beats a spectacular one.
- Trees, rocks and guardrails sit off the road. Clipping one costs speed and adds damage;
  past 48% damage the car smokes, and 100% damage costs you about 20% of your top speed.
- Beach it in a ditch and it drops you back on the road after a couple of seconds. The lost
  time is the penalty.

## Garage

Nothing is bought on the first tap. Tapping anything in the shop **fits it to the car as a
preview** - the sprite in the bay updates immediately, the stat bars show what would change,
and a bar above the bay names the item and its price with `PURCHASE` and `CANCEL`. Only
`PURCHASE` charges you and writes to the save; `CANCEL`, switching tabs or leaving the garage
puts the car back to its last paid-for state for free. Items you can't afford still go on the
car to look at - the purchase button greys out and says how far short you are.

- **Upgrades** - engine, turbo, suspension, gearbox, weight reduction. Three tiers each,
  per car, feeding top speed, acceleration, handling and mechanical grip.
- **Tyres** - all-terrain, gravel, tarmac slick and studded snow, three tiers each. Every
  compound has a per-surface grip multiplier; fit the right one for the stage.
- **Paint** - ten colours and four liveries (plain, stripes, rally #7, chevron), applied to
  the sprite you actually drive.
- **Cars** - Kestrel 1.6 GTI (free), Falcon RS Evo (CR 5,200), Vantor WRC-X (CR 16,500).

Upgrades are per car, so a new car starts stock.

## Payout

`finish fee + pace bonus + clean-run bonus + target-beaten bonus + first-clear bonus`

Pace scales continuously with how far under the target time you finish, so a slow run still
pays. Collisions cut the clean-run bonus.

## Saving

Credits, owned cars, upgrade levels, tyres, paint, liveries, best times and settings are all
kept in `localStorage` under `rallypixel.save.v1`. Settings → `RESET ALL` wipes it.
