# Tesla Roadster Simulation

### ▶ [Play it online](https://francesco2011-source.github.io/tesla_roadster_simulation/)

![Tesla Roadster Simulation: Jump challenge with compressed-gas jets](docs/screenshot.jpg)

A 3D simulator that runs in the browser: you drive a Tesla Roadster fitted with 10 compressed-gas thrusters and an underfloor suction fan (the SpaceX package described in the code). Free-roam driving with rigid-body physics, designed mainly for the **PS5 DualSense controller**; keyboard and mouse work too. No build step: a tiny local Python server serves the game, and three.js is bundled in the repository.

> Unofficial fan project, not affiliated with Tesla or SpaceX.

## Play online
Open the link above in Chrome or Edge, connect the PS5 controller and press any button. Nothing to install.

## Run it locally

Requirements:
- **Python 3**, only for the local server `serve.py` (ES modules don't load from `file://`)
- A browser with WebGL and the Gamepad API (written for Chrome/Edge; PlayStation controllers with the different Firefox/Safari mappings are normalised too)

| OS | How |
|---|---|
| **macOS** | double-click `start-mac.command` (first time: right-click → Open; if needed `chmod +x start-mac.command`) |
| **Windows** | double-click `start-windows.bat` (uses `py -3` or `python`, prints a message if Python is missing) |
| **Terminal** | `python3 serve.py` (Windows: `py -3 serve.py`) |

`serve.py` starts on port 8000 (tries up to 19 further ports if it's busy), prints the address, e.g. `http://localhost:8000`, and opens your browser. Stop it with `Ctrl+C`. On the start screen click or press ✕ to begin.

## PS5 controller (recommended)
Connect the DualSense via USB or Bluetooth and **press any button**: it is detected automatically (a "Controller connected" notice appears). DualShock 4 and Xbox pads work too (A=✕, B=○, X=□, Y=△, View=CREATE, Menu=OPTIONS). Controller rumble is used when the browser exposes it.

| PS5 pad | Action | Keyboard / mouse |
|---|---|---|
| R2 / L2 | Accelerate / brake (stopped: reverse) | W / S (or ↑ / ↓) |
| Left stick | Steer (in air: flip and spin) | A D · W S (or arrows) |
| ✕ | Lift thrusters | Space |
| ○ | Rear boost | Shift |
| □ | Front braking jets | C |
| L1 / R1 | Barrel-roll (on ground: turn in place) | Q / E |
| △ | Change camera (third person, cockpit, side, drone) | V |
| Touchpad / L3 | Change challenge | T |
| CREATE | Right the car | F |
| OPTIONS | Restart (hold 0.6 s: settings) | R (P: settings) |
| Right stick | Orbit camera | mouse drag |
| R3 | Camera distance | Z / wheel |
| D-pad ↑ / ↓ | Manual suction: more / less | M / N |
| D-pad → | Suction auto / manual | G |
| D-pad ← | Traction control on/off | H |

The **Controls** button at the top (or `?` / `F1`) shows the same table in-game.

## Challenges
Switch with Touchpad / L3 / `T`. There are five:

| Challenge | Description (from the game) |
|---|---|
| **Ramp** | Climb the J, let go and land in the zone. J-ramp: r = 7 m curve, 9 m wall, r = 5 m hook at 90°, 3 m lip, 4.6 m wide; landing zone at x = −24 |
| **Jump** | Clear the five parked vehicles (landing zone at x = −76) |
| **Test grid** | Grid test area: bumps, washboard and rock field, 10°/20°/30°/40° ramps, stairs and wall, long jump, banked circular track, conical hill climb, skidpad and slalom, crates to smash (a 4 × 5 wall and a 21-crate pyramid) |
| **Stunt park** | Kickers, table-top, helix loop, half-pipe and slalom |
| **Hills** | Dirt between the hills: less grip, lots of jumps |

**Scoring** (computed by the code at each landing): release height (60 pts/m), airtime (150/s), full turns (1500 each), soft landing (up to 1200), car level (up to 600), gas left (up to 800), on target (+1000); in Jump, 600 pts per vehicle cleared. A wheels-down landing above 12 m/s is a crash; you can keep going, right the car (CREATE) or restart (OPTIONS). The best score is saved in the browser.

## Settings
Open with the **Settings** button, `P`, or by holding OPTIONS; the game pauses and choices are saved in the browser. Gamepad: D-pad ↑↓ to pick, ←→ to adjust, ○ to close.

| Setting | Range (default) |
|---|---|
| Compressed gas | 100–2000 L, or infinite (600 L) |
| Lift gas burn | 50–600 L/s (180) |
| Lift thrust | 1.4–4 g (2.4) |
| Boost thrust | 0.5–5 g (2.2) |
| Compressed-air density (fog) | 40–250 % (140 %) |
| Road grip | μ 0.4–1.4 (0.85) |
| Ramp-hook impact bang | 0–100 % (100) |
| Camera vertical axis | normal / inverted |
| Volume | 0–100 % (80) |
| Language | Italiano / English |

Gas is refilled by restarting (OPTIONS) or by stopping on the "GAS" station in the map.

## How it works (from the code)
- **Car**: 1745 kg + 155 kg of nitrogen (600 L at ~690 bar) that is used up as you go; 2.65 m wheelbase; rear-wheel drive, 10,000 Nm and 1000 kW; top speed ~370 km/h.
- **Physics**: 3D rigid body with 8 sub-steps per frame; independent spring/damper suspension; Pacejka magic-formula tyres (longitudinal and lateral) with a friction circle (μ 1.25); Ackermann steering; traction control, ABS and stability control (ESC) with torque vectoring on the two rear motors; drag and downforce.
- **Suction**: underfloor fan up to ~2 g of downforce, with a seal that depends on ride height. In auto mode it switches on above 60 km/h, on the ramp and in the loop, never in reverse.
- **Thrusters**: 10 nozzles: 4 fixed rear (boost) and 6 gimballed (up to 35°, up to 11 kN each: 2 front under the splitter, 2 in the side skirts, 2 at the rear corners), used for lift, braking, lateral thrust and attitude, with automatic stabilisation in flight. Positions are a reconstruction, not official data.
- **Compressed air**: volumetric condensation fog whose particles collide with the car, ramps and ground.
- **Sound**: synthesised in real time with Web Audio (no audio files).
- **Languages**: the game UI is available in Italian and English, picked from the browser and switchable in Settings.

## Project layout
```
index.html          page and interface (HUD, controls, settings)
game.js             engine: physics, input, camera, audio, particles, challenges
routes.js           test grid, stunt park and hills
roadster-model.js   procedural car (used when the .glb model is missing)
wheels.js           wheels built from scratch
i18n.js             Italian / English translations
serve.py            local server (python3 serve.py)
start-mac.command   launcher for macOS
start-windows.bat   launcher for Windows
vendor/three/       three.js (MIT), bundled
.github/workflows/  GitHub Pages deployment
docs/               screenshot and social preview image
```

## 3D model (optional)
The Tesla model is **not included** (unknown license). The game looks for `models/tesla-roadster-2026.glb`; without it a procedural car from `roadster-model.js` is used. Drop your own model at that path (`models/` is git-ignored). See [CREDITS.md](CREDITS.md).

## Publish your own copy (GitHub Pages)
*Settings → Pages → Source: GitHub Actions*; the included workflow (`.github/workflows/pages.yml`) deploys on every push to `main`.

## License
MIT (code). Third-party assets: see [CREDITS.md](CREDITS.md).
