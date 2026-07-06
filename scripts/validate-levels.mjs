// Level validator — run with: node scripts/validate-levels.mjs
// Proves every level is (a) not already solved at load, and (b) solvable:
// with all rotatable tiles back at their solved orientation, sliders at their
// goal cells and lifts raised/lowered appropriately, every fish reaches the
// portal and every star lies on a fish's path.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  buildLogicalTiles, findPath, key,
} from "../src/game/rules.js";

const here = dirname(fileURLToPath(import.meta.url));
const { levels } = JSON.parse(readFileSync(join(here, "../levels/levels.json"), "utf8"));

let failures = 0;
const fail = (lvl, msg) => { failures++; console.error(`  ✗ [${lvl.id} ${lvl.name}] ${msg}`); };

for (const lvl of levels) {
  console.log(`Level ${lvl.id} — ${lvl.name}`);

  // ---- structural checks ----
  const seen = new Set();
  for (const t of lvl.tiles) {
    const k = key(t.x, t.z);
    if (seen.has(k)) fail(lvl, `duplicate tile at ${k}`);
    seen.add(k);
    if (t.x < 0 || t.z < 0 || t.x >= lvl.size[0] || t.z >= lvl.size[1])
      fail(lvl, `tile out of bounds at ${k}`);
  }
  if (!lvl.tiles.some((t) => t.portal)) fail(lvl, "no portal");
  if (!lvl.fish?.length) fail(lvl, "no fish");
  for (const f of lvl.fish) {
    const t = lvl.tiles.find((t) => t.x === f.x && t.z === f.z && t.spawn);
    if (!t) fail(lvl, `fish at ${f.x},${f.z} has no spawn tile`);
  }

  // Slider tracks must be clear (no logic tiles, no decor).
  for (const t of lvl.tiles) {
    if (!t.slide) continue;
    const { axis, min, max, goal } = t.slide;
    for (let v = min; v <= max; v++) {
      const [cx, cz] = axis === "x" ? [v, t.z] : [t.x, v];
      if (cx === t.x && cz === t.z) continue;
      if (seen.has(key(cx, cz))) fail(lvl, `slider track blocked at ${cx},${cz}`);
    }
    const cur = axis === "x" ? t.x : t.z;
    const g = axis === "x" ? goal[0] : goal[1];
    if (g < min || g > max) fail(lvl, "slider goal outside track");
    if ((axis === "x" && goal[1] !== t.z) || (axis === "z" && goal[0] !== t.x))
      fail(lvl, "slider goal not on track axis");
    if (g === cur) fail(lvl, "slider starts at goal (should start displaced)");
  }

  // ---- (a) initial scrambled state must NOT already have a path ----
  {
    const { cells, portalKey } = buildLogicalTiles(lvl);
    for (const f of lvl.fish) {
      const p = findPath(cells, key(f.x, f.z), portalKey);
      if (p) fail(lvl, `fish at ${f.x},${f.z} already has a path at load`);
    }
  }

  // ---- (b) solved state must connect every fish, stars on paths ----
  {
    const { cells, portalKey } = buildLogicalTiles(lvl);
    // Un-scramble rotations.
    for (const t of cells.values()) t.rot = 0;
    // Move sliders to goal.
    const sliders = [...cells.values()].filter((t) => t.slide);
    for (const t of sliders) {
      cells.delete(key(t.x, t.z));
      t.x = t.slide.goal[0];
      t.z = t.slide.goal[1];
      cells.set(key(t.x, t.z), t);
    }
    // Brute-force lift positions (few lifts per level).
    const lifts = [...cells.values()].filter((t) => t.lift);
    const combos = 1 << lifts.length;
    let solvedPaths = null;
    for (let c = 0; c < combos; c++) {
      lifts.forEach((t, i) => { t.li = (c >> i) & 1; });
      const paths = [];
      let ok = true;
      for (const f of lvl.fish) {
        const p = findPath(cells, key(f.x, f.z), portalKey);
        if (!p) { ok = false; break; }
        paths.push(p);
      }
      if (ok) { solvedPaths = paths; break; }
    }
    if (!solvedPaths) {
      fail(lvl, "NOT SOLVABLE in authored solution state");
    } else {
      const visited = new Set(solvedPaths.flat());
      for (const t of lvl.tiles) {
        if (!t.star) continue;
        // Stars ride their tile — sliders carry them to the goal cell.
        const [sx, sz] = t.slide ? t.slide.goal : [t.x, t.z];
        if (!visited.has(key(sx, sz)))
          fail(lvl, `star at ${sx},${sz} not on any fish path`);
      }
      const lens = solvedPaths.map((p) => p.length).join(", ");
      console.log(`  ✓ solvable — fish path lengths: ${lens}`);
    }
  }
}

if (failures) {
  console.error(`\n${failures} problem(s) found.`);
  process.exit(1);
}
console.log(`\nAll ${levels.length} levels valid ✓`);
