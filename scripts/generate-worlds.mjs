// Generates worlds 2-5 (levels 11-50) from compact path specs and merges them
// into levels/levels.json. Levels 0-10 (world 1) are kept untouched.
// Run: node scripts/generate-worlds.mjs   (then node scripts/validate-levels.mjs)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildLogicalTiles, findPath, key } from "../src/game/rules.js";

const here = dirname(fileURLToPath(import.meta.url));
const LEVELS_PATH = join(here, "../levels/levels.json");

// ---------------------------------------------------------------- worlds
const WORLDS = [
  {
    id: 0, name: "Coral Reef",
    theme: {
      bgTop: "#f7f3ea", bgBottom: "#cfe4f2", fog: "#dcebf5",
      hemiSky: "#fff6e8", hemiGround: "#bcd8ea", glow: "#7edcdc",
      water: "#6fd6d6", waterGlow: "#aef0ea",
      bases: ["#b8a7e0", "#f3b8c8", "#8fb8e8", "#a8dbc5", "#f0dfc0", "#c9b6ea"],
    },
  },
  {
    id: 1, name: "Sunken Temple",
    theme: {
      bgTop: "#eef5e6", bgBottom: "#b2d4bc", fog: "#cde2cf",
      hemiSky: "#f4f8e4", hemiGround: "#9cc0a8", glow: "#7ee0b0",
      water: "#5ecfae", waterGlow: "#a8f0d4",
      bases: ["#9ec9a8", "#c8d8a0", "#8fb8a0", "#dde3b4", "#a9d0c0", "#e6dfc0"],
    },
  },
  {
    id: 2, name: "Golden Shallows",
    theme: {
      bgTop: "#fdf2e0", bgBottom: "#f4c896", fog: "#f8ddb8",
      hemiSky: "#fff2d6", hemiGround: "#e6c49a", glow: "#ffd166",
      water: "#63c6d8", waterGlow: "#b8ecf0",
      bases: ["#f5c078", "#f3a89e", "#ead0a0", "#f0b8c8", "#e5c288", "#d8a8b8"],
    },
  },
  {
    id: 3, name: "Midnight Lagoon",
    theme: {
      bgTop: "#2e3858", bgBottom: "#171f36", fog: "#232d49",
      hemiSky: "#8b9bcb", hemiGround: "#2e3a5e", glow: "#66e0ff",
      water: "#49b9dc", waterGlow: "#7ef0ff",
      bases: ["#5868a0", "#7078b8", "#4a5a8e", "#6888b0", "#586898", "#8090c0"],
    },
  },
  {
    id: 4, name: "Dream Palace",
    theme: {
      bgTop: "#f9e9f6", bgBottom: "#d3bbe8", fog: "#e8d3ee",
      hemiSky: "#fff0f8", hemiGround: "#c4abda", glow: "#f0a8e0",
      water: "#9d87e6", waterGlow: "#d4c4ff",
      bases: ["#e0a8d0", "#c0a8e8", "#f0c0d8", "#b0b8f0", "#e8b8e8", "#d0c0f0"],
    },
  },
  {
    id: 5, name: "Kelp Forest",
    theme: {
      bgTop: "#e3f2e4", bgBottom: "#9cc4a8", fog: "#c2ddc6",
      hemiSky: "#eef8e0", hemiGround: "#8fb89c", glow: "#57d9a0",
      water: "#4fc9a0", waterGlow: "#9df0cc",
      bases: ["#7fae8e", "#a9c98f", "#6f9e88", "#c5d6a0", "#93c1ac", "#d6d9b0"],
    },
  },
  {
    id: 6, name: "Starlit Abyss",
    theme: {
      bgTop: "#2a2547", bgBottom: "#120f24", fog: "#1e1a38",
      hemiSky: "#7a74b8", hemiGround: "#221d40", glow: "#b48aff",
      water: "#6a5ae0", waterGlow: "#a99bff",
      bases: ["#4a4380", "#5e55a0", "#3d3870", "#6a62a8", "#544d90", "#7a72b8"],
    },
  },
  {
    id: 7, name: "Cascade Falls",
    theme: {
      bgTop: "#eef7fb", bgBottom: "#a8cfe0", fog: "#cfe6f0",
      hemiSky: "#f4fbff", hemiGround: "#9cc4d8", glow: "#6fd0e8",
      water: "#58c8e0", waterGlow: "#b0eef8",
      bases: ["#8fb8d0", "#a8cfe0", "#7ea8c4", "#c0dcea", "#94bfd4", "#d4e6ee"],
    },
  },
  {
    id: 8, name: "Whirlpool Depths",
    theme: {
      bgTop: "#3f5f82", bgBottom: "#1d2f47", fog: "#31496a",
      hemiSky: "#8aa4c8", hemiGround: "#28405e", glow: "#5fd8d0",
      water: "#3fb8c8", waterGlow: "#8ae8f0",
      bases: ["#4f7396", "#5f83a6", "#436685", "#6d90b0", "#57799c", "#7d9cba"],
    },
  },
  {
    id: 9, name: "Frostbite Shoals",
    theme: {
      bgTop: "#f2f8fc", bgBottom: "#c2d8ea", fog: "#dfecf6",
      hemiSky: "#ffffff", hemiGround: "#b4cee2", glow: "#a8dcff",
      water: "#7cc8e8", waterGlow: "#cceeff",
      bases: ["#b8d4e8", "#cfe2f0", "#a4c6de", "#e0edf6", "#c2d8ea", "#93b9d4"],
    },
  },
  {
    id: 10, name: "The Maelstrom",
    theme: {
      bgTop: "#2e3446", bgBottom: "#12141f", fog: "#20263a",
      hemiSky: "#7d87a8", hemiGround: "#252c42", glow: "#ffd166",
      water: "#4a90c8", waterGlow: "#8ac6f0",
      bases: ["#4d5670", "#5d6884", "#414a63", "#6b7692", "#555f7c", "#7c88a6"],
    },
  },
];

// ---------------------------------------------------------------- helpers
const DIR = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
const OPP = { N: "S", E: "W", S: "N", W: "E" };
const DECOR = ["coral", "plant", "shell", "arch", "tower", "rock"];
const FISH_COLORS = ["#ffab4a", "#f78fb3", "#8ac6ff"];

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rng, arr) => arr[(rng() * arr.length) | 0];

/**
 * Walk a move string, returning ordered cells with in/out direction chars.
 * "T" teleports through a whirlpool to its partner (declared in ov) — no
 * edges are opened for a teleport hop.
 */
function walk(start, moves, ov = {}) {
  const cells = [{ x: start[0], z: start[1], dirs: new Set() }];
  let [x, z] = start;
  for (const m of moves) {
    if (m === "T") {
      const fromKey = `${x},${z}`;
      const id = ov[fromKey]?.warp;
      if (id == null) throw new Error(`"T" at ${fromKey} but no warp override there`);
      const partner = Object.entries(ov).find(([k, o]) => o.warp === id && k !== fromKey);
      if (!partner) throw new Error(`warp ${id} has no partner tile`);
      [x, z] = partner[0].split(",").map(Number);
      cells.push({ x, z, dirs: new Set() });
      continue;
    }
    const [dx, dz] = DIR[m];
    cells[cells.length - 1].dirs.add(m);        // exit edge of current cell
    x += dx; z += dz;
    cells.push({ x, z, dirs: new Set([OPP[m]]) }); // entry edge of next cell
  }
  return cells;
}

function connString(dirs) {
  return ["N", "E", "S", "W"].filter((d) => dirs.has(d)).join("");
}

/** Choose a scramble for a rotatable tile. Straights: 1|3. Others: weighted. */
function chooseScr(rng, dirs, worldIdx) {
  const isStraight =
    dirs.size === 2 &&
    ((dirs.has("N") && dirs.has("S")) || (dirs.has("E") && dirs.has("W")));
  if (isStraight) return rng() < 0.5 ? 1 : 3;
  const r = rng();
  if (worldIdx <= 1) return r < 0.8 ? 3 : 2;
  if (worldIdx === 2) return r < 0.6 ? 3 : 2;
  if (worldIdx === 3) return r < 0.5 ? 3 : r < 0.85 ? 2 : 1;
  return r < 0.4 ? 3 : r < 0.8 ? 2 : 1;
}
const movesFor = (scr, dirs) => {
  const isStraight =
    dirs.size === 2 &&
    ((dirs.has("N") && dirs.has("S")) || (dirs.has("E") && dirs.has("W")));
  return isStraight ? scr % 2 : (4 - scr) % 4;
};

// ---------------------------------------------------------------- builder
function buildLevel(spec, id, worldIdx) {
  const rng = mulberry32(1000 + id * 77);
  const [W, H] = spec.size;
  const ov = spec.ov || {};
  const hm = spec.hm || {};

  // 1. Merge all fish paths into a cell map.
  const cellMap = new Map(); // "x,z" -> {x,z,dirs:Set,spawn,portal}
  const pathOrder = []; // unique path cells in first-visit order
  for (let fi = 0; fi < spec.fish.length; fi++) {
    const f = spec.fish[fi];
    const cells = walk(f.s, f.m, ov);
    for (let ci = 0; ci < cells.length; ci++) {
      const c = cells[ci];
      if (c.x < 0 || c.z < 0 || c.x >= W || c.z >= H)
        throw new Error(`L${id}: cell ${c.x},${c.z} out of bounds`);
      const k = key(c.x, c.z);
      let rec = cellMap.get(k);
      if (!rec) {
        rec = { x: c.x, z: c.z, dirs: new Set(), spawn: false, portal: false };
        cellMap.set(k, rec);
        pathOrder.push(rec);
      }
      for (const d of c.dirs) rec.dirs.add(d);
      if (ci === 0) {
        if (rec.dirs.size > 1 && !rec.spawn)
          throw new Error(`L${id}: fish ${fi} spawn ${k} lies on another path`);
        rec.spawn = true;
      }
      if (ci === cells.length - 1) rec.portal = true;
    }
  }
  const portals = pathOrder.filter((c) => c.portal);
  if (portals.length !== 1)
    throw new Error(`L${id}: fish paths must share one portal cell`);

  // 2. Emit tiles.
  const tiles = [];
  const occupied = new Set();   // every cell that must stay clear of decor
  const starCandidates = [];    // [cellKey, tileRef]
  let par = 0;

  for (const c of pathOrder) {
    const k = key(c.x, c.z);
    const o = ov[k] || {};
    const h = hm[k] || 0;
    const t = { x: c.x, z: c.z };
    let tileRef = t;

    if (o.ramp) {
      const need = new Set([o.ramp, OPP[o.ramp]]);
      if (![...c.dirs].every((d) => need.has(d)))
        throw new Error(`L${id}: ramp at ${k} not straight through`);
      t.ramp = o.ramp;
      if (h) t.h = h;
    } else if (o.lift) {
      t.conn = connString(c.dirs);
      t.lift = o.lift;
      t.li = 0;
      par += 1;
    } else if (o.slide) {
      const { axis, min, max, start } = o.slide;
      const goal = [c.x, c.z];
      const [ix, iz] = axis === "x" ? [start, c.z] : [c.x, start];
      if (start !== min && start !== max)
        throw new Error(`L${id}: slider at ${k} must start at a track end`);
      // Track cells must be clear.
      for (let v = min; v <= max; v++) {
        const [tx, tz] = axis === "x" ? [v, c.z] : [c.x, v];
        occupied.add(key(tx, tz));
        if ((tx !== c.x || tz !== c.z) && cellMap.has(key(tx, tz)) && !(tx === ix && tz === iz))
          throw new Error(`L${id}: slider track blocked by path at ${tx},${tz}`);
      }
      t.x = ix; t.z = iz;
      t.conn = connString(c.dirs);
      t.slide = { axis, min, max, goal };
      if (h) t.h = h;
      par += Math.abs((axis === "x" ? goal[0] : goal[1]) - start);
    } else if (o.warp != null) {
      t.conn = connString(c.dirs);
      t.warp = o.warp; // whirlpool tiles don't rotate
      if (h) t.h = h;
    } else if (c.spawn) {
      t.conn = connString(c.dirs);
      t.spawn = true;
      if (h) t.h = h;
    } else if (c.portal) {
      t.conn = connString(c.dirs);
      t.portal = true;
      if (h) t.h = h;
    } else if (c.dirs.size >= 4 || o.static) {
      t.conn = connString(c.dirs); // cross — rotation is meaningless
      if (h) t.h = h;
    } else {
      t.conn = connString(c.dirs);
      t.rot = true;
      t.scr = chooseScr(rng, c.dirs, worldIdx);
      par += movesFor(t.scr, c.dirs);
      if (h) t.h = h;
    }
    if (o.crack) t.crack = true; // one-use ice tile (any base type)
    occupied.add(key(t.x, t.z));
    occupied.add(k);
    tiles.push(t);
    if (!c.spawn && !c.portal) starCandidates.push([k, tileRef]);
  }

  // 3. Stars, evenly spaced along the path.
  const nStars = spec.stars ?? (worldIdx <= 1 ? 2 : 3);
  const fracs = nStars === 2 ? [0.33, 0.72] : [0.25, 0.5, 0.78];
  const used = new Set();
  for (const f of fracs) {
    let idx = Math.min(starCandidates.length - 1, Math.round(f * (starCandidates.length - 1)));
    while (used.has(idx) && idx < starCandidates.length - 1) idx++;
    used.add(idx);
    starCandidates[idx][1].star = true;
  }

  // 4. Decor sprinkle on free cells.
  const decorRng = mulberry32(9000 + id * 31);
  let placed = 0, di = (id * 3) % DECOR.length;
  for (let z = 0; z < H && placed < 12; z++) {
    for (let x = 0; x < W && placed < 12; x++) {
      if (occupied.has(key(x, z))) continue;
      if (decorRng() < 0.45) {
        tiles.push({ x, z, decor: DECOR[di % DECOR.length] });
        di++; placed++;
      }
    }
  }

  const level = {
    id,
    name: spec.name,
    world: worldIdx,
    size: spec.size,
    par,
    ...(spec.steps ? { steps: spec.steps } : {}),
    tiles,
    fish: spec.fish.map((f, i) => ({ x: f.s[0], z: f.s[1], color: FISH_COLORS[i] })),
  };

  // 5. Prove it: initial state unsolved, solution state solvable.
  verify(level);
  return level;
}

function verify(level) {
  {
    const { cells, portalKey } = buildLogicalTiles(level);
    for (const f of level.fish) {
      if (findPath(cells, key(f.x, f.z), portalKey))
        throw new Error(`L${level.id}: already solved at load`);
    }
  }
  {
    const nLifts = level.tiles.filter((t) => t.lift).length;
    let ok = false;
    for (let c = 0; c < 1 << nLifts && !ok; c++) {
      // Fresh board per combo — crack tiles are consumed while checking.
      const { cells, portalKey } = buildLogicalTiles(level);
      for (const t of cells.values()) t.rot = 0;
      for (const t of [...cells.values()].filter((t) => t.slide)) {
        cells.delete(key(t.x, t.z));
        [t.x, t.z] = t.slide.goal;
        cells.set(key(t.x, t.z), t);
      }
      const lifts = [...cells.values()].filter((t) => t.lift);
      lifts.forEach((t, i) => { t.li = (c >> i) & 1; });
      ok = true;
      for (const f of level.fish) {
        const p = findPath(cells, key(f.x, f.z), portalKey);
        if (!p) { ok = false; break; }
        for (const k of p) if (cells.get(k)?.crack) cells.delete(k); // ice crumbles
      }
    }
    if (!ok) throw new Error(`L${level.id}: NOT solvable in solution state`);
  }
}

// ---------------------------------------------------------------- specs
// s = spawn, m = move string (N/E/S/W), ov = per-cell overrides, hm = heights.
const SPECS = [
  // ============ WORLD 2 — Sunken Temple (11-20) ============
  [
    { name: "Moss Gate", size: [5, 4], fish: [{ s: [0, 3], m: "EENNEE" }] },
    { name: "Jade Steps", size: [5, 4], fish: [{ s: [0, 0], m: "ESSSEEN" }] },
    {
      name: "Broken Aqueduct", size: [5, 4],
      fish: [{ s: [0, 2], m: "EEEEN" }],
      ov: { "2,2": { slide: { axis: "z", min: 0, max: 2, start: 0 } } },
      steps: ["Deep in the temple, some tiles slide along rails instead of turning."],
    },
    { name: "Overgrown Court", size: [6, 4], fish: [{ s: [0, 1], m: "EESSEEENN" }] },
    {
      name: "Twin Idols", size: [6, 4],
      fish: [{ s: [0, 1], m: "EEEEE" }, { s: [3, 3], m: "NNEE" }],
    },
    {
      name: "Flooded Archive", size: [6, 5],
      fish: [{ s: [0, 4], m: "EENNEENN" }],
      ov: { "3,2": { slide: { axis: "z", min: 2, max: 4, start: 4 } } },
    },
    { name: "Serpent Walk", size: [6, 5], fish: [{ s: [0, 0], m: "EEESSWWSSEEE" }], stars: 3 },
    {
      name: "Twin Serpents", size: [6, 5], stars: 3,
      fish: [{ s: [0, 0], m: "SSEEEEE" }, { s: [2, 0], m: "SSEEE" }],
    },
    {
      name: "Tide Locks", size: [6, 5], stars: 3,
      fish: [{ s: [0, 2], m: "EEEEEN" }],
      ov: {
        "1,2": { slide: { axis: "z", min: 0, max: 2, start: 0 } },
        "3,2": { slide: { axis: "z", min: 2, max: 4, start: 4 } },
      },
    },
    {
      name: "Temple Heart", size: [6, 5], stars: 3,
      fish: [{ s: [0, 4], m: "EENNEEN" }, { s: [4, 4], m: "NNN" }],
      ov: { "3,2": { slide: { axis: "z", min: 0, max: 2, start: 0 } } },
    },
  ],
  // ============ WORLD 3 — Golden Shallows (21-30) ============
  [
    {
      name: "Sunrise Shelf", size: [5, 4], stars: 2,
      fish: [{ s: [0, 3], m: "NEEEE" }],
      ov: { "2,2": { ramp: "E" }, "3,2": { lift: [0, 1] } },
      hm: { "4,2": 1 },
      steps: ["Golden ramps carry water uphill — raise the platform to meet them!"],
    },
    {
      name: "Golden Stair", size: [5, 4], stars: 2,
      fish: [{ s: [0, 0], m: "SSEEEE" }],
      ov: { "1,2": { ramp: "E" }, "3,2": { ramp: "E" } },
      hm: { "2,2": 1, "3,2": 1, "4,2": 2 },
    },
    {
      name: "Pearl Lift", size: [5, 4], stars: 2,
      fish: [{ s: [0, 2], m: "EEENN" }],
      ov: { "1,2": { ramp: "E" }, "2,2": { lift: [0, 1] }, "3,1": { lift: [0, 1] } },
      hm: { "3,2": 1, "3,0": 1 },
    },
    {
      name: "Lagoon Terraces", size: [6, 4], stars: 2,
      fish: [{ s: [0, 3], m: "EENNEEN" }],
      ov: {
        "2,2": { slide: { axis: "x", min: 0, max: 2, start: 0 } },
        "3,1": { ramp: "E" },
      },
      hm: { "4,1": 1, "4,0": 1 },
    },
    {
      name: "Twin Coves", size: [6, 4], stars: 3,
      fish: [{ s: [0, 1], m: "EEEEE" }, { s: [3, 3], m: "NNEE" }],
      ov: {
        "2,1": { ramp: "E" },
        "3,2": { slide: { axis: "x", min: 3, max: 5, start: 5 } },
      },
      hm: { "3,1": 1, "4,1": 1, "5,1": 1, "3,2": 1, "3,3": 1 },
    },
    {
      name: "Sunken Sandbar", size: [6, 5], stars: 3,
      fish: [{ s: [0, 4], m: "NNEEEEE" }],
      ov: { "1,2": { ramp: "E" }, "3,2": { lift: [0, 1] }, "4,2": { ramp: "W" } },
      hm: { "2,2": 1 },
    },
    { name: "Gilded Maze", size: [6, 5], stars: 3, fish: [{ s: [0, 0], m: "SSEEENNEESSS" }] },
    {
      name: "High Tide Locks", size: [6, 5], stars: 3,
      fish: [{ s: [0, 2], m: "EEENNEE" }],
      ov: {
        "1,2": { ramp: "E" },
        "2,2": { lift: [0, 1] },
        "3,1": { slide: { axis: "x", min: 3, max: 5, start: 5 } },
        "4,0": { lift: [0, 1] },
      },
      hm: { "3,2": 1, "3,1": 1, "3,0": 1, "5,0": 1 },
    },
    {
      name: "Twin Ascent", size: [6, 5], stars: 3,
      fish: [{ s: [0, 3], m: "EEENNN" }, { s: [5, 4], m: "NNWWNN" }],
      ov: { "2,3": { ramp: "E" }, "4,2": { ramp: "W" } },
      hm: { "3,3": 1, "3,2": 1, "3,1": 1, "3,0": 1 },
    },
    {
      name: "Sun Temple", size: [7, 5], stars: 3,
      fish: [{ s: [0, 2], m: "EEEEEE" }, { s: [4, 0], m: "SSEE" }],
      ov: {
        "2,2": { ramp: "E" },
        "3,2": { lift: [0, 1] },
        "4,1": { slide: { axis: "x", min: 4, max: 6, start: 6 } },
      },
      hm: { "4,2": 1, "5,2": 1, "6,2": 1, "4,1": 1, "4,0": 1 },
    },
  ],
  // ============ WORLD 4 — Midnight Lagoon (31-40) ============
  [
    { name: "First Glow", size: [6, 5], fish: [{ s: [0, 0], m: "SSSSEEENNEE" }] },
    {
      name: "Deep Channels", size: [6, 5],
      fish: [{ s: [0, 0], m: "SEEEEES" }, { s: [2, 4], m: "NNNEEES" }],
    },
    {
      name: "Black Ice", size: [6, 5],
      fish: [{ s: [0, 2], m: "EEENNE" }],
      ov: {
        "2,2": { slide: { axis: "z", min: 0, max: 2, start: 0 } },
        "3,1": { slide: { axis: "x", min: 3, max: 5, start: 5 } },
      },
    },
    {
      name: "Lantern Row", size: [7, 5],
      fish: [{ s: [0, 4], m: "NNEEEEENN" }],
      ov: {
        "1,2": { slide: { axis: "z", min: 0, max: 2, start: 0 } },
        "3,2": { ramp: "E" },
        "4,2": { lift: [0, 1] },
      },
      hm: { "5,2": 1, "5,1": 1, "5,0": 1 },
    },
    {
      name: "Twin Currents", size: [7, 5],
      fish: [{ s: [0, 0], m: "SSEEESS" }, { s: [6, 0], m: "SSWWWSS" }],
    },
    {
      name: "Void Steps", size: [6, 5],
      fish: [{ s: [0, 1], m: "SEEENEEN" }],
      ov: { "1,2": { ramp: "E" }, "2,2": { lift: [0, 1] }, "4,1": { lift: [0, 1] } },
      hm: { "3,2": 1, "3,1": 1, "5,1": 1, "5,0": 1 },
    },
    {
      name: "Glow Reef", size: [7, 5],
      fish: [{ s: [0, 2], m: "EEEEEE" }, { s: [4, 0], m: "SSEE" }],
      ov: {
        "2,2": { slide: { axis: "z", min: 0, max: 2, start: 0 } },
        "4,1": { slide: { axis: "x", min: 4, max: 6, start: 6 } },
      },
    },
    { name: "Abyss Walk", size: [7, 5], fish: [{ s: [0, 0], m: "EESSWSSEEEENNE" }] },
    {
      name: "Night Locks", size: [7, 5],
      fish: [{ s: [0, 3], m: "EEEENNEE" }, { s: [2, 0], m: "EESEE" }],
      ov: {
        "2,3": { ramp: "E" },
        "3,3": { lift: [0, 1] },
        "5,1": { slide: { axis: "z", min: 1, max: 4, start: 4 } },
      },
      hm: {
        "4,3": 1, "4,2": 1, "4,1": 1, "5,1": 1, "6,1": 1,
        "2,0": 1, "3,0": 1, "4,0": 1,
      },
    },
    {
      name: "Midnight Palace", size: [7, 6],
      fish: [
        { s: [0, 2], m: "EEEEEE" },
        { s: [3, 0], m: "SSEEE" },
        { s: [3, 5], m: "NNNEEE" },
      ],
      ov: {
        "3,4": { slide: { axis: "x", min: 0, max: 3, start: 0 } },
        "4,2": { ramp: "E" },
        "5,2": { lift: [0, 1] },
      },
      hm: { "6,2": 1 },
    },
  ],
  // ============ WORLD 5 — Dream Palace (41-50) ============
  [
    {
      name: "Rose Gate", size: [6, 5],
      fish: [{ s: [0, 4], m: "EENNEENNE" }],
      ov: { "3,2": { ramp: "E" } },
      hm: { "4,2": 1, "4,1": 1, "4,0": 1, "5,0": 1 },
    },
    {
      name: "Cloud Steps", size: [6, 5],
      fish: [{ s: [0, 3], m: "NEEEEE" }],
      ov: { "1,2": { ramp: "E" }, "3,2": { ramp: "E" }, "4,2": { lift: [1, 2] } },
      hm: { "2,2": 1, "3,2": 1, "5,2": 2 },
    },
    {
      name: "Mirror Halls", size: [7, 5],
      fish: [{ s: [0, 0], m: "SSSSEEE" }, { s: [6, 0], m: "SSSSWWW" }],
    },
    {
      name: "Silk Locks", size: [7, 5],
      fish: [{ s: [0, 2], m: "EEEEEEN" }],
      ov: {
        "1,2": { slide: { axis: "z", min: 0, max: 2, start: 0 } },
        "3,2": { slide: { axis: "z", min: 2, max: 4, start: 4 } },
        "5,2": { slide: { axis: "z", min: 0, max: 2, start: 0 } },
      },
    },
    {
      name: "Lavender Court", size: [7, 5],
      fish: [{ s: [0, 1], m: "EEEEEE" }, { s: [4, 4], m: "NNNEE" }],
      ov: {
        "2,1": { ramp: "E" },
        "4,2": { slide: { axis: "x", min: 2, max: 4, start: 2 } },
      },
      hm: { "3,1": 1, "4,1": 1, "5,1": 1, "6,1": 1, "4,2": 1, "4,3": 1, "4,4": 1 },
    },
    { name: "Starfall Maze", size: [7, 6], fish: [{ s: [0, 0], m: "SSEENNEESSSSWSEE" }] },
    {
      name: "Petal Ascent", size: [7, 6],
      fish: [{ s: [0, 3], m: "EEEENN" }, { s: [6, 4], m: "NNWWN" }],
      ov: { "1,3": { ramp: "E" }, "3,3": { ramp: "E" } },
      hm: {
        "2,3": 1, "3,3": 1, "4,3": 2, "4,2": 2, "4,1": 2,
        "5,2": 2, "6,2": 2, "6,3": 2, "6,4": 2,
      },
    },
    {
      name: "Moon Pools", size: [7, 6],
      fish: [{ s: [0, 2], m: "EEEEEE" }, { s: [4, 0], m: "SSEE" }],
      ov: {
        "1,2": { lift: [1, 0] },
        "3,2": { lift: [1, 0] },
        "5,2": { slide: { axis: "z", min: 2, max: 4, start: 4 } },
        "4,1": { slide: { axis: "x", min: 2, max: 4, start: 2 } },
      },
    },
    {
      name: "Aurora Steps", size: [7, 6],
      fish: [
        { s: [0, 1], m: "EEESSSS" },
        { s: [6, 1], m: "WWWSSSS" },
        { s: [0, 4], m: "EEES" },
      ],
      ov: { "3,3": { lift: [1, 0] } },
    },
    {
      name: "Zaney's Dream", size: [8, 6],
      fish: [
        { s: [0, 2], m: "EEEEEEE" },
        { s: [4, 0], m: "SSEEE" },
        { s: [4, 5], m: "NNNEEE" },
      ],
      ov: {
        "2,2": { slide: { axis: "z", min: 0, max: 2, start: 0 } },
        "4,4": { slide: { axis: "x", min: 4, max: 6, start: 6 } },
        "5,2": { ramp: "E" },
        "6,2": { lift: [0, 1] },
      },
      hm: { "7,2": 1 },
    },
  ],
  // ============ WORLD 6 — Kelp Forest (51-60) ============
  [
    { name: "Kelp Gate", size: [7, 5], fish: [{ s: [0, 0], m: "SSEEESSEEEN" }] },
    {
      name: "Green Cathedral", size: [7, 5],
      fish: [{ s: [0, 1], m: "EEESSEEE" }, { s: [5, 0], m: "SSSE" }],
    },
    {
      name: "Drift Locks", size: [7, 5],
      fish: [{ s: [0, 2], m: "EEEEEENN" }],
      ov: {
        "1,2": { slide: { axis: "z", min: 0, max: 2, start: 0 } },
        "3,2": { slide: { axis: "z", min: 2, max: 4, start: 4 } },
        "5,2": { slide: { axis: "z", min: 0, max: 2, start: 0 } },
      },
    },
    {
      name: "Root Stairs", size: [7, 5],
      fish: [{ s: [0, 3], m: "EEEEENN" }],
      ov: {
        "1,3": { ramp: "E" },
        "2,3": { slide: { axis: "z", min: 2, max: 4, start: 4 } },
        "3,3": { ramp: "E" },
        "4,3": { lift: [1, 2] },
      },
      hm: { "2,3": 1, "3,3": 1, "5,3": 2, "5,2": 2, "5,1": 2 },
    },
    {
      name: "Twin Canopy", size: [8, 5],
      fish: [{ s: [0, 1], m: "EEEEEEE" }, { s: [3, 4], m: "NNNEEEE" }],
      ov: { "5,1": { ramp: "E" }, "6,1": { lift: [0, 1] } },
      hm: { "7,1": 1 },
    },
    { name: "Sea Grove Maze", size: [8, 6], fish: [{ s: [0, 0], m: "EEESSWWSSEEEEENN" }] },
    {
      name: "Tide Gardens", size: [8, 6],
      fish: [{ s: [0, 2], m: "EEEEEEE" }, { s: [3, 0], m: "SSEEEE" }],
      ov: {
        "2,2": { slide: { axis: "z", min: 0, max: 2, start: 0 } },
        "5,2": { slide: { axis: "z", min: 2, max: 4, start: 4 } },
      },
    },
    {
      name: "Emerald Locks", size: [8, 6],
      fish: [{ s: [0, 4], m: "EEEENNEEE" }, { s: [4, 0], m: "SSEEE" }],
      ov: {
        "2,4": { ramp: "E" },
        "3,4": { lift: [0, 1] },
        "4,1": { slide: { axis: "x", min: 4, max: 6, start: 6 } },
        "6,2": { lift: [0, 1] },
      },
      hm: {
        "4,4": 1, "4,3": 1, "4,2": 1, "5,2": 1, "7,2": 1,
        "4,1": 1, "4,0": 1,
      },
    },
    {
      name: "Whispering Reeds", size: [8, 6],
      fish: [
        { s: [0, 1], m: "EEEESSSS" },
        { s: [7, 1], m: "WWWSSSS" },
        { s: [0, 4], m: "EEEES" },
      ],
      ov: { "4,3": { lift: [1, 0] } },
    },
    {
      name: "Heart of the Forest", size: [8, 6],
      fish: [
        { s: [0, 2], m: "EEEEEENE" },
        { s: [6, 4], m: "NNNE" },
        { s: [2, 0], m: "SSEEEENE" },
      ],
      ov: {
        "4,2": { ramp: "E" },
        "5,2": { lift: [0, 1] },
        "6,3": { slide: { axis: "x", min: 4, max: 6, start: 4 } },
      },
      hm: { "6,2": 1, "6,1": 1, "7,1": 1, "6,3": 1, "6,4": 1 },
    },
  ],
  // ============ WORLD 7 — Starlit Abyss (61-70) ============
  [
    { name: "First Star", size: [8, 6], fish: [{ s: [0, 5], m: "NNEEENNEEEN" }] },
    {
      name: "Nebula Currents", size: [8, 6],
      fish: [{ s: [0, 0], m: "SSSSSEEEE" }, { s: [7, 0], m: "SSSSSWWW" }],
    },
    {
      name: "Gravity Wells", size: [8, 6],
      fish: [{ s: [0, 3], m: "EEEEEEEN" }],
      ov: {
        "1,3": { lift: [1, 0] },
        "3,3": { slide: { axis: "z", min: 1, max: 3, start: 1 } },
        "5,3": { lift: [1, 0] },
        "6,3": { slide: { axis: "z", min: 3, max: 5, start: 5 } },
      },
    },
    {
      name: "Star Steps", size: [8, 6],
      fish: [{ s: [0, 4], m: "EEEEEENNN" }],
      ov: {
        "1,4": { ramp: "E" },
        "3,4": { ramp: "E" },
        "5,4": { slide: { axis: "z", min: 2, max: 4, start: 2 } },
      },
      hm: {
        "2,4": 1, "3,4": 1, "4,4": 2, "5,4": 2, "6,4": 2,
        "6,3": 2, "6,2": 2, "6,1": 2,
      },
    },
    {
      name: "Comet Trails", size: [9, 6],
      fish: [{ s: [0, 1], m: "EEEEEEEE" }, { s: [2, 4], m: "NNNEEEEEE" }],
      ov: {
        "4,1": { ramp: "E" },
        "6,1": { lift: [0, 1] },
        "2,2": { slide: { axis: "x", min: 0, max: 2, start: 0 } },
      },
      hm: { "5,1": 1, "7,1": 1, "8,1": 1 },
    },
    { name: "Void Gardens", size: [9, 6], fish: [{ s: [0, 0], m: "EEESSSWWSSEEEEEENNN" }] },
    {
      name: "Twin Nebulae", size: [9, 6],
      fish: [{ s: [0, 2], m: "EEEEEEEE" }, { s: [4, 5], m: "NNNEEEE" }],
      ov: {
        "2,2": { ramp: "E" },
        "5,2": { lift: [0, 1] },
        "6,2": { ramp: "E" },
      },
      hm: {
        "3,2": 1, "4,2": 1, "6,2": 1, "7,2": 2, "8,2": 2,
        "4,3": 1, "4,4": 1, "4,5": 1,
      },
    },
    {
      name: "Starlight Locks", size: [9, 6],
      fish: [{ s: [0, 3], m: "EEEEEEEE" }, { s: [4, 0], m: "SSSEEEE" }],
      ov: {
        "2,3": { slide: { axis: "z", min: 3, max: 5, start: 5 } },
        "4,2": { slide: { axis: "x", min: 2, max: 4, start: 2 } },
        "6,3": { slide: { axis: "z", min: 1, max: 3, start: 1 } },
        "7,3": { lift: [1, 0] },
      },
    },
    {
      name: "Aurora Cascade", size: [9, 6],
      fish: [
        { s: [0, 2], m: "EEEEEEEE" },
        { s: [4, 0], m: "SSEEEE" },
        { s: [4, 5], m: "NNNEEEE" },
      ],
      ov: {
        "5,2": { slide: { axis: "z", min: 0, max: 2, start: 0 } },
        "6,2": { ramp: "E" },
        "7,2": { lift: [0, 1] },
      },
      hm: { "8,2": 1 },
    },
    {
      name: "Zaney's Galaxy", size: [9, 6],
      fish: [
        { s: [0, 4], m: "EEEEEEEE" },
        { s: [5, 1], m: "SSSEEE" },
        { s: [8, 0], m: "SSSS" },
      ],
      ov: {
        "2,4": { slide: { axis: "z", min: 2, max: 4, start: 2 } },
        "4,4": { ramp: "E" },
        "6,4": { ramp: "E" },
        "7,4": { lift: [1, 2] },
      },
      hm: {
        "5,4": 1, "6,4": 1, "8,4": 2,
        "5,1": 1, "5,2": 1, "5,3": 1,
        "8,0": 2, "8,1": 2, "8,2": 2, "8,3": 2,
      },
    },
  ],
  // ============ WORLD 8 — Cascade Falls (71-80): waterfalls ============
  [
    {
      name: "First Falls", size: [7, 5],
      fish: [{ s: [0, 1], m: "EEEEEE" }],
      hm: { "0,1": 1, "1,1": 1, "2,1": 1 },
      steps: ["Water spills over ledges! Fish can ride a waterfall DOWN — but never swim back up."],
    },
    {
      name: "Twin Cascades", size: [7, 5],
      fish: [{ s: [0, 0], m: "SSEEEEEE" }],
      hm: { "0,0": 2, "0,1": 2, "0,2": 2, "1,2": 2, "2,2": 1, "3,2": 1 },
    },
    {
      name: "Cascade Court", size: [7, 5],
      fish: [{ s: [0, 3], m: "EENNEESEE" }],
      ov: { "1,3": { ramp: "E" } },
      hm: { "2,3": 1, "2,2": 1, "2,1": 1, "3,1": 1 },
    },
    {
      name: "Falls & Locks", size: [8, 6],
      fish: [{ s: [0, 2], m: "EEEENNE" }],
      ov: { "1,2": { slide: { axis: "z", min: 0, max: 2, start: 0 } } },
      hm: { "0,2": 1, "1,2": 1, "2,2": 1 },
    },
    {
      name: "Terrace Gardens", size: [8, 6],
      fish: [{ s: [0, 1], m: "EEEEEEE" }, { s: [4, 4], m: "NNNEEE" }],
      hm: { "0,1": 1, "1,1": 1, "2,1": 1, "3,1": 1 },
    },
    {
      name: "Cliffside Run", size: [8, 6],
      fish: [{ s: [0, 0], m: "EEESSWWSSEEEEN" }],
      ov: { "3,4": { ramp: "E" } },
      hm: { "0,0": 1, "1,0": 1, "2,0": 1, "3,0": 1, "4,4": 1, "5,4": 1, "5,3": 1 },
    },
    {
      name: "Split Falls", size: [8, 6],
      fish: [{ s: [0, 1], m: "EEEEEEE" }, { s: [0, 4], m: "EEENNNEEEE" }],
      hm: { "0,1": 1, "1,1": 1, "2,1": 1, "0,4": 1, "1,4": 1, "2,4": 1 },
    },
    {
      name: "Veil of Water", size: [9, 6],
      fish: [{ s: [0, 3], m: "EEEENNEE" }],
      hm: { "0,3": 2, "1,3": 2 },
    },
    {
      name: "Rain Stair Relay", size: [9, 6],
      fish: [
        { s: [0, 2], m: "EEEEEEEE" },
        { s: [4, 0], m: "SSEEEE" },
        { s: [4, 5], m: "NNNEEEE" },
      ],
      ov: { "6,2": { ramp: "E" } },
      hm: { "0,2": 1, "1,2": 1, "2,2": 1, "7,2": 1, "8,2": 1 },
    },
    {
      name: "Cascade Palace", size: [9, 6],
      fish: [{ s: [0, 4], m: "EEEENNEEEE" }, { s: [6, 0], m: "SSEE" }],
      ov: {
        "3,4": { slide: { axis: "z", min: 2, max: 4, start: 2 } },
        "7,2": { lift: [1, 0] },
      },
      hm: { "0,4": 2, "1,4": 2, "2,4": 1, "3,4": 1 },
    },
  ],
  // ============ WORLD 9 — Whirlpool Depths (81-90): teleporters ============
  [
    {
      name: "First Whirl", size: [7, 5],
      fish: [{ s: [0, 2], m: "EETEE" }],
      ov: { "2,2": { warp: 1 }, "4,2": { warp: 1 } },
      steps: ["Whirlpools are twins — dive into one and you burst out of the other!"],
    },
    {
      name: "Spiral Steps", size: [7, 5],
      fish: [{ s: [0, 0], m: "SSEETSE" }],
      ov: { "2,2": { warp: 1 }, "5,1": { warp: 1 } },
    },
    {
      name: "Twin Vortices", size: [8, 5],
      fish: [{ s: [0, 2], m: "ETEETENE" }],
      ov: {
        "1,2": { warp: 1 }, "3,0": { warp: 1 },
        "5,0": { warp: 2 }, "5,3": { warp: 2 },
      },
    },
    {
      name: "Undertow", size: [8, 6],
      fish: [{ s: [0, 0], m: "SSSEETEES" }],
      ov: {
        "2,3": { warp: 1 }, "5,1": { warp: 1 },
        "1,3": { slide: { axis: "z", min: 1, max: 3, start: 1 } },
      },
    },
    {
      name: "Maelstrom Gate", size: [8, 6],
      fish: [{ s: [0, 1], m: "EEEEEEE" }, { s: [0, 4], m: "EETEEEE" }],
      ov: { "2,4": { warp: 1 }, "3,1": { warp: 1 } },
    },
    {
      name: "Eye of the Sea", size: [8, 6],
      fish: [{ s: [0, 4], m: "EETEENE" }],
      ov: {
        "2,4": { warp: 1 }, "4,2": { warp: 1 },
        "1,4": { slide: { axis: "z", min: 2, max: 4, start: 2 } },
      },
      hm: { "0,4": 1, "1,4": 1, "2,4": 1, "4,2": 1, "5,2": 1 },
    },
    {
      name: "Twin Spirals", size: [9, 6],
      fish: [{ s: [0, 1], m: "EETEEEE" }, { s: [0, 4], m: "EETENEEE" }],
      ov: {
        "2,1": { warp: 1 }, "4,2": { warp: 1 },
        "2,4": { warp: 2 }, "4,3": { warp: 2 },
      },
    },
    {
      name: "Deep Current Locks", size: [9, 6],
      fish: [{ s: [0, 5], m: "NNEEETEE" }],
      ov: {
        "3,3": { warp: 1 }, "6,1": { warp: 1 },
        "1,3": { lift: [1, 0] }, "7,1": { lift: [1, 0] },
      },
    },
    {
      name: "Sea of Mirrors", size: [9, 6],
      fish: [
        { s: [0, 0], m: "EETEEEEEE" },
        { s: [4, 0], m: "SSSEEEE" },
        { s: [0, 5], m: "EEEENNEEEE" },
      ],
      ov: { "2,0": { warp: 1 }, "2,3": { warp: 1 } },
    },
    {
      name: "Whirlpool Crown", size: [9, 6],
      fish: [{ s: [0, 2], m: "EETENNEE" }, { s: [3, 0], m: "SSEEEEE" }],
      ov: {
        "2,2": { warp: 1 }, "5,4": { warp: 1 },
        "1,2": { slide: { axis: "z", min: 0, max: 2, start: 0 } },
        "7,2": { lift: [1, 0] },
      },
      hm: { "0,2": 1, "1,2": 1, "2,2": 1, "5,4": 1 },
    },
  ],
  // ============ WORLD 10 — Frostbite Shoals (91-100): cracking ice ============
  [
    {
      name: "Thin Ice", size: [7, 5],
      fish: [{ s: [0, 2], m: "EEEEE" }],
      ov: { "2,2": { crack: true }, "3,2": { crack: true } },
      steps: ["Icy tiles crumble after ONE crossing — plan the order of your fish!"],
    },
    {
      name: "Cracked Crossing", size: [7, 5],
      fish: [{ s: [0, 1], m: "EEEEEE" }, { s: [0, 3], m: "EEEEEENN" }],
      ov: { "2,1": { crack: true }, "4,1": { crack: true } },
    },
    {
      name: "Ice Locks", size: [8, 5],
      fish: [{ s: [0, 2], m: "EEEEEEN" }],
      ov: {
        "2,2": { slide: { axis: "z", min: 0, max: 2, start: 0 } },
        "1,2": { crack: true }, "3,2": { crack: true },
      },
    },
    {
      name: "Glacier Steps", size: [8, 5],
      fish: [{ s: [0, 3], m: "EEEEENE" }],
      ov: { "2,3": { crack: true } },
      hm: { "0,3": 1, "1,3": 1, "2,3": 1 },
    },
    {
      name: "Snowmelt Relay", size: [8, 6],
      fish: [{ s: [0, 1], m: "EEEEEEE" }, { s: [3, 4], m: "NNNEEEE" }],
      ov: { "3,3": { crack: true }, "3,2": { crack: true } },
    },
    {
      name: "Fracture Fields", size: [8, 6],
      fish: [{ s: [0, 0], m: "EEESSWWSSEEEEE" }],
      ov: {
        "2,0": { crack: true }, "3,1": { crack: true },
        "2,2": { crack: true }, "1,3": { crack: true },
      },
    },
    {
      name: "Icefall Vault", size: [9, 6],
      fish: [{ s: [0, 4], m: "ETEESE" }],
      ov: {
        "1,4": { warp: 1 }, "3,1": { warp: 1 },
        "4,1": { crack: true },
        "5,2": { slide: { axis: "x", min: 3, max: 5, start: 3 } },
      },
    },
    {
      name: "Frozen Terraces", size: [9, 6],
      fish: [{ s: [0, 2], m: "EEEEEEEE" }, { s: [4, 0], m: "SSEEEE" }],
      ov: { "2,2": { crack: true }, "6,2": { lift: [1, 0] } },
      hm: { "0,2": 1, "1,2": 1, "2,2": 1 },
    },
    {
      name: "Aurora Icefields", size: [9, 6],
      fish: [
        { s: [0, 2], m: "EEEEEEEE" },
        { s: [4, 0], m: "SSEEEE" },
        { s: [4, 5], m: "NNNEEEE" },
      ],
      ov: {
        "1,2": { crack: true }, "3,2": { crack: true },
        "4,1": { crack: true }, "4,4": { crack: true },
        "6,2": { slide: { axis: "z", min: 0, max: 2, start: 0 } },
      },
    },
    {
      name: "Shatterlight Keep", size: [9, 6],
      fish: [{ s: [0, 0], m: "SSEETESEE" }, { s: [3, 5], m: "EEENNEE" }],
      ov: {
        "2,2": { warp: 1 }, "5,2": { warp: 1 },
        "0,2": { crack: true }, "5,5": { crack: true },
        "7,3": { lift: [1, 0] },
      },
      hm: { "0,0": 1, "0,1": 1, "0,2": 1, "1,2": 1, "2,2": 1, "5,2": 1 },
    },
  ],
  // ============ WORLD 11 — The Maelstrom (101-110): everything ============
  [
    {
      name: "Storm Approach", size: [9, 6],
      fish: [{ s: [0, 0], m: "EEEESSEEES" }],
      ov: { "5,2": { slide: { axis: "z", min: 0, max: 2, start: 0 } } },
      hm: { "0,0": 1, "1,0": 1, "2,0": 1, "3,0": 1 },
    },
    {
      name: "Tempest Locks", size: [9, 6],
      fish: [{ s: [0, 3], m: "EEEEEEEE" }],
      ov: {
        "2,3": { slide: { axis: "z", min: 1, max: 3, start: 1 } },
        "4,3": { slide: { axis: "z", min: 3, max: 5, start: 5 } },
        "6,3": { slide: { axis: "z", min: 1, max: 3, start: 1 } },
        "3,3": { crack: true }, "5,3": { crack: true },
        "7,3": { lift: [1, 0] },
      },
    },
    {
      name: "Vortex Falls", size: [9, 6],
      fish: [{ s: [0, 5], m: "ENNETEE" }, { s: [6, 4], m: "NNNEE" }],
      ov: {
        "2,3": { warp: 1 }, "6,1": { warp: 1 },
        "6,2": { crack: true },
      },
      hm: { "0,5": 2, "1,5": 2, "1,4": 2 },
    },
    {
      name: "Eye of the Storm", size: [10, 6],
      fish: [{ s: [0, 2], m: "EEEEETNEE" }, { s: [2, 5], m: "NNNEEETNEE" }],
      ov: {
        "5,2": { warp: 1 }, "7,4": { warp: 1 },
        "4,2": { slide: { axis: "z", min: 0, max: 2, start: 0 } },
        "2,4": { crack: true },
        "8,3": { lift: [1, 0] },
      },
    },
    {
      name: "Maelstrom Steps", size: [10, 6],
      fish: [{ s: [0, 4], m: "EEEEENNEEEE" }],
      ov: {
        "1,4": { ramp: "E" }, "3,4": { ramp: "E" },
        "5,4": { crack: true },
        "7,2": { slide: { axis: "z", min: 0, max: 2, start: 0 } },
      },
      hm: { "2,4": 1, "3,4": 1, "4,4": 2, "5,4": 2, "5,3": 2 },
    },
    {
      name: "Twin Tempests", size: [10, 6],
      fish: [{ s: [0, 0], m: "SSSSSEETEEEE" }, { s: [9, 5], m: "WWTNEEEE" }],
      ov: {
        "2,5": { warp: 1 }, "5,2": { warp: 1 },
        "7,5": { warp: 2 }, "5,3": { warp: 2 },
        "0,3": { crack: true }, "8,5": { crack: true },
      },
    },
    {
      name: "Deluge Vault", size: [10, 7],
      fish: [
        { s: [0, 3], m: "EEEEEEEEE" },
        { s: [5, 0], m: "SSSEEEE" },
        { s: [0, 6], m: "EEEEENNNEEEE" },
      ],
      ov: {
        "2,3": { slide: { axis: "z", min: 1, max: 3, start: 1 } },
        "5,1": { crack: true },
        "7,3": { ramp: "E" },
        "8,3": { lift: [0, 1] },
      },
      hm: { "0,6": 1, "1,6": 1, "2,6": 1, "3,6": 1, "9,3": 1 },
    },
    {
      name: "Riptide Maze", size: [10, 7],
      fish: [{ s: [0, 0], m: "EEEESSSWWWSSSEEEEEEENN" }],
      ov: {
        "3,0": { crack: true }, "2,3": { crack: true }, "3,6": { crack: true },
      },
      hm: { "0,0": 1, "1,0": 1 },
    },
    {
      name: "Stormlight Spiral", size: [10, 7],
      fish: [{ s: [0, 1], m: "EETEETNE" }, { s: [3, 3], m: "EESSEETNE" }],
      ov: {
        "2,1": { warp: 1 }, "5,5": { warp: 1 },
        "7,5": { warp: 2 }, "8,2": { warp: 2 },
        "4,3": { crack: true },
      },
      hm: { "0,1": 1, "1,1": 1, "2,1": 1 },
    },
    {
      name: "Zaney's Maelstrom", size: [10, 7],
      fish: [
        { s: [0, 3], m: "EEEETESSE" },
        { s: [0, 6], m: "EEEEEEEENNNE" },
        { s: [7, 0], m: "SESSE" },
      ],
      ov: {
        "4,3": { warp: 1 }, "7,1": { warp: 1 },
        "3,3": { slide: { axis: "z", min: 1, max: 3, start: 1 } },
        "2,6": { crack: true }, "6,6": { crack: true },
        "8,2": { lift: [1, 0] },
      },
      hm: {
        "0,3": 2, "1,3": 2, "2,3": 1, "3,3": 1, "4,3": 1,
        "7,1": 1, "7,0": 1,
      },
    },
  ],
];

// ---------------------------------------------------------------- main
const data = JSON.parse(readFileSync(LEVELS_PATH, "utf8"));
const world1 = data.levels.filter((l) => l.id <= 10).map((l) => ({ ...l, world: 0 }));

const generated = [];
let id = 11;
for (let w = 0; w < SPECS.length; w++) {
  for (const spec of SPECS[w]) {
    generated.push(buildLevel(spec, id, w + 1));
    id++;
  }
}

const out = { worlds: WORLDS, levels: [...world1, ...generated] };
writeFileSync(LEVELS_PATH, JSON.stringify(out, null, 2) + "\n");

console.log(`Wrote ${out.levels.length} levels (${generated.length} generated) across ${WORLDS.length} worlds.`);
for (const l of generated) {
  console.log(
    `  ${String(l.id).padStart(2)} ${WORLDS[l.world].name.padEnd(16)} ${l.name.padEnd(18)} par ${String(l.par).padStart(2)}  fish ${l.fish.length}  ${l.size[0]}x${l.size[1]}`
  );
}
