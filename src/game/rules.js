// Pure game rules — no three.js. Shared by the game and the level validator.

// Directions: N = -z, E = +x, S = +z, W = -x
export const N = 0, E = 1, S = 2, W = 3;
export const DIR_VEC = [
  { dx: 0, dz: -1 },
  { dx: 1, dz: 0 },
  { dx: 0, dz: 1 },
  { dx: -1, dz: 0 },
];
const CHAR_TO_DIR = { N, E, S, W };

export const bit = (d) => 1 << d;
export const opposite = (d) => (d + 2) % 4;

export function connMaskFromString(str = "") {
  let m = 0;
  for (const ch of str) m |= bit(CHAR_TO_DIR[ch]);
  return m;
}

/** Rotate a connection mask 90° clockwise (N→E→S→W). */
export function rotMaskCW(mask, steps = 1) {
  let m = mask & 15;
  for (let i = 0; i < ((steps % 4) + 4) % 4; i++) m = ((m << 1) | (m >>> 3)) & 15;
  return m;
}

export const key = (x, z) => `${x},${z}`;

/** Effective connection mask for a tile given its rotation state. */
export function effectiveConn(tile) {
  if (tile.ramp != null) {
    return bit(tile.ramp) | bit(opposite(tile.ramp));
  }
  return rotMaskCW(tile.baseConn, tile.rot || 0);
}

/** Height of a tile's edge in direction d (ramps are higher on one side). */
export function edgeHeight(tile, d) {
  if (tile.ramp != null) return d === tile.ramp ? tile.h + 1 : tile.h;
  if (tile.lift) return tile.lift[tile.li];
  return tile.h;
}

/**
 * Are two adjacent tiles connected through direction d (from a → b)?
 * Requires both edges open. Equal heights connect both ways; a higher edge
 * flowing into a lower one is a WATERFALL — a one-way drop (a → b only).
 */
export function connected(a, b, d) {
  if (!a || !b) return false;
  const od = opposite(d);
  if (!(effectiveConn(a) & bit(d))) return false;
  if (!(effectiveConn(b) & bit(od))) return false;
  return edgeHeight(a, d) >= edgeHeight(b, od);
}

/** Is a → b specifically a waterfall drop (for visuals/animation)? */
export function isDrop(a, b, d) {
  return connected(a, b, d) && edgeHeight(a, d) > edgeHeight(b, opposite(d));
}

/** Map warp-pair id → [cellKey, cellKey] for the current board. */
export function warpPairs(cells) {
  const map = new Map();
  for (const [k, t] of cells) {
    if (t.warp == null) continue;
    if (!map.has(t.warp)) map.set(t.warp, []);
    map.get(t.warp).push(k);
  }
  return map;
}

function* neighborKeys(cells, tile, warps) {
  for (let d = 0; d < 4; d++) {
    const nk = key(tile.x + DIR_VEC[d].dx, tile.z + DIR_VEC[d].dz);
    const nb = cells.get(nk);
    if (nb && connected(tile, nb, d)) yield nk;
  }
  // Whirlpool: teleports to its twin regardless of edges or height.
  if (tile.warp != null) {
    const pair = warps.get(tile.warp) || [];
    const self = key(tile.x, tile.z);
    for (const pk of pair) if (pk !== self) yield pk;
  }
}

/**
 * BFS over the water graph.
 * cells: Map<"x,z", tile>. Returns array of keys from start to goal, or null.
 */
export function findPath(cells, startKey, goalKey) {
  if (startKey === goalKey) return [startKey];
  const warps = warpPairs(cells);
  const prev = new Map([[startKey, null]]);
  const queue = [startKey];
  while (queue.length) {
    const k = queue.shift();
    const tile = cells.get(k);
    if (!tile) continue;
    for (const nk of neighborKeys(cells, tile, warps)) {
      if (prev.has(nk)) continue;
      prev.set(nk, k);
      if (nk === goalKey) {
        const path = [nk];
        let cur = k;
        while (cur !== null) { path.unshift(cur); cur = prev.get(cur); }
        return path;
      }
      queue.push(nk);
    }
  }
  return null;
}

/**
 * All cells reachable from startKey through connected water.
 * Returns Map<key, prevKey> (BFS tree, startKey → null).
 */
export function reachableFrom(cells, startKey) {
  const warps = warpPairs(cells);
  const prev = new Map([[startKey, null]]);
  const queue = [startKey];
  while (queue.length) {
    const k = queue.shift();
    const tile = cells.get(k);
    if (!tile) continue;
    for (const nk of neighborKeys(cells, tile, warps)) {
      if (prev.has(nk)) continue;
      prev.set(nk, k);
      queue.push(nk);
    }
  }
  return prev;
}

/** Build logical tile records from raw level JSON (no meshes). */
export function buildLogicalTiles(levelData) {
  const cells = new Map();
  let portalKey = null;
  for (const t of levelData.tiles) {
    if (t.decor) continue; // decorations are not part of the water graph
    const tile = {
      x: t.x,
      z: t.z,
      h: t.h || 0,
      baseConn: connMaskFromString(t.conn || ""),
      rot: t.scr || 0,
      rotatable: !!t.rot,
      ramp: t.ramp != null ? CHAR_TO_DIR[t.ramp] : null,
      lift: t.lift || null,
      li: t.li || 0,
      slide: t.slide || null,
      slideDir: 1,
      warp: t.warp ?? null,
      crack: !!t.crack,
      cracked: false,
      portal: !!t.portal,
      spawn: !!t.spawn,
      star: !!t.star,
      starCollected: false,
    };
    cells.set(key(t.x, t.z), tile);
    if (tile.portal) portalKey = key(t.x, t.z);
  }
  return { cells, portalKey };
}
