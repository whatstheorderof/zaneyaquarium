# 🐟 Zaney Aquarium

**Guide the fish home.**

A peaceful, Monument-Valley-inspired 3D isometric puzzle game that runs in any modern browser. Rotate, slide and raise pastel aquarium tiles to build a water path so the little fish can swim to the glowing home portal — collecting stars along the way.

Built with [Three.js](https://threejs.org/) (WebGL), zero build step, zero dependencies to install.

---

## Play locally

The game is a static site, but it loads `levels/levels.json` via `fetch`, so it must be served over HTTP (opening `index.html` directly from disk won't work).

Any static server works:

```bash
# option 1 — node
npx serve .

# option 2 — python
python3 -m http.server 8000
```

Then open `http://localhost:8000` (or whatever port your server prints).

## Deploy to Vercel

The repo is a zero-config static site — no framework preset or build command needed.

```bash
git add -A
git commit -m "Zaney Aquarium prototype"
git push origin main
```

Then import the repo at [vercel.com/new](https://vercel.com/new) (Framework preset: **Other**, no build command, output directory: root). Every push deploys automatically.

## How to play

- **Tap / click a tile** to interact with it:
  - tiles with a **pulsing white ring** rotate 90°
  - tiles on **orange rails** slide along their track
  - tiles with **blue corner bolts** (↕) raise or lower
- Connect the water channels from the fish to the glowing portal. Heights must match — use **ramps** to climb.
- The fish swims home **automatically** the moment a path exists, collecting any **stars** on its route. Route it through the stars before opening a shortcut!
- The level is complete when **every fish** reaches the portal.

**HUD:** ⟳ restart · ↩ undo · 💡 hint (placeholder) · 🔊 sound

Progress (unlocked levels, best stars, sound preference) is saved in `localStorage`.

## Project structure

```
index.html              UI shell + import map (three.js via CDN)
styles.css              pastel UI styling
levels/levels.json      51 levels across 5 themed worlds (+ world themes)
src/
  main.js               bootstrap, game state, screens, main loop
  core/
    scene.js            renderer, orthographic isometric camera, lights, bubbles
    input.js            pointer → raycast tile picking (mouse + touch)
    tween.js            tiny dependency-free tween engine
  game/
    rules.js            pure game logic: connectivity, rotation math,
                        BFS pathfinding (no three.js — shared with validator)
    board.js            board state, tile interactions (rotate/slide/lift), undo
    tileFactory.js      all meshes: tiles, channels, ramps, portal, stars,
                        fish, coral/decor props
    fish.js             fish controller: pathfinding trigger, swim animation,
                        star collection, win detection
  audio/
    ambient.js          procedural WebAudio: underwater ambience + SFX
  ui/
    ui.js               DOM overlay: menu, level map, HUD, win modal, toasts
scripts/
  validate-levels.mjs   proves every level is solvable (run: node scripts/validate-levels.mjs)
  generate-worlds.mjs   regenerates worlds 2-5 (levels 11-50) from compact path specs
```

## Worlds

| World | Levels | Theme | New mechanics / difficulty |
|---|---|---|---|
| 1 · Coral Reef | 0–10 | cream & sky pastels | tutorial → all basics |
| 2 · Sunken Temple | 11–20 | misty jade | longer paths, twin fish, double sliders |
| 3 · Golden Shallows | 21–30 | warm sunset gold | ramps, lifts, height puzzles everywhere |
| 4 · Midnight Lagoon | 31–40 | deep indigo, bioluminescent | big boards, combos, 3-fish finale |
| 5 · Dream Palace | 41–50 | pink-violet twilight | double-height climbs, drop-lifts, everything at once |

Each world re-themes the fog, lighting, glow, water colour and tile palette (see `worlds` in `levels.json`).

## Level format

Levels are plain JSON. A tile is a cell on the grid:

```jsonc
{
  "x": 2, "z": 1,          // grid position (x → east, z → south)
  "conn": "EW",            // open water edges: N/E/S/W (solved orientation)
  "rot": true, "scr": 1,   // rotatable, scrambled by N clockwise turns at load
  "star": true,            // collectible star on this tile
  "h": 1,                  // elevation level (water only connects equal heights)
  "ramp": "E",             // sloped tile: low on W at h, high on E at h+1
  "lift": [0, 1], "li": 0, // vertical platform toggling between heights
  "slide": { "axis": "z", "min": 0, "max": 2, "goal": [2, 2] }, // sliding tile
  "portal": true,          // the home portal (goal)
  "spawn": true,           // a fish starts here
  "decor": "coral"         // pure decoration: coral | plant | shell | arch | tower | rock
}
```

Because `conn` stores the **solved** orientation and `scr` scrambles it at load, every authored level is solvable by construction — `scripts/validate-levels.mjs` verifies it (path exists, stars reachable, not pre-solved).

## Extending the game

- **New level:** add an object to `levels/levels.json`, run the validator.
- **New tile type:** add logic to `rules.js` (connectivity) + visuals to `tileFactory.js` + interaction to `board.js`.
- **Real hints:** the hint button is wired in `main.js`; a solver could replay the `scr`/`goal` data backwards.

---

*Tech: Three.js r161 · orthographic isometric camera · BFS pathfinding over the water graph · procedural WebAudio · no build step.*
