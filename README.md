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
| Steer | on-screen ◀ / ▶ |
| Throttle | `GAS` (or switch to auto throttle in Settings) |
| Handbrake | the lever on the right — locks the rears for hairpins, and reverses when stopped |
| Shift | the paddles on the outer edges of the dash: `−` bottom left drops a gear, `+` bottom right takes one (manual gearbox only) |
| Pause | `II`, top right |

## The dash

The instrument binnacle along the bottom of the screen is one canvas, drawn from scratch
every frame: a bay of chunky checker-tread brake and throttle pedals, an analog tachometer
reading in thousands of rpm with the redline banded in red at 7, a gear panel with a
vertical shift-light ladder, and an analog speedometer with a digital km/h readout. Chrome
bezels, near-black glass and thin red pointers. The speedometer scales itself to the car you
are driving. Three warning lamps — coolant, check-engine, brake — pick up on a cooked
engine, a battered car and the handbrake, purely for atmosphere.

The dash is not a rectangle. It is a flat bar across the bottom of the screen with the two
dials standing proud of it: the bar's top edge runs *below* the tops of the dials, so the
circles break its outline rather than sitting inset inside it. The steering buttons get the
same treatment — round, domed heads on raised chrome mounts rooted in the bar, clear of its
edge — while the shifter blades and handbrake stay flush in the band.

The dash is held to under a fifth of the screen height and pinned to the bottom edge, and
the steering mounts, shifter blades and handbrake line up on the same baseline so the whole
band reads as one dashboard. It has to stay small: this is a chase cam, and the camera aims
at a point *ahead* of the car, which means the car itself is drawn that far down the screen
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
