// Board: owns logical tiles + their meshes, handles interactions and undo.
import * as THREE from "three";
import { tween, Ease } from "../core/tween.js";
import {
  key, DIR_VEC, buildLogicalTiles, findPath, isDrop, edgeHeight, opposite,
} from "./rules.js";
import {
  buildTileGroup, buildDecorGroup, buildCoralBridge, buildGroundPlane,
  buildWaterfall, LEVEL_H, waterY,
} from "./tileFactory.js";

export class Board {
  constructor(boardGroup, callbacks = {}) {
    this.root = boardGroup;
    this.cb = callbacks; // { onMove, onSound }
    this.group = null;
    this.cells = new Map();
    this.portalKey = null;
    this.busy = 0;
    this.undoStack = [];
    this._animated = { portals: [], rings: [], sprites: [], starTiles: [], vortices: [] };
    this._time = 0;
  }

  // ---------------------------------------------------------- lifecycle
  load(levelData) {
    this.dispose();
    this.level = levelData;
    this.group = new THREE.Group();
    this.root.add(this.group);
    this.undoStack = [];

    const { cells, portalKey } = buildLogicalTiles(levelData);
    this.cells = cells;
    this.portalKey = portalKey;
    this.decorCells = new Set();

    // Invisible plane so empty-cell taps (power-ups) can be located.
    this.ground = buildGroundPlane(levelData.size[0], levelData.size[1]);
    this.group.add(this.ground);

    let i = 0;
    for (const t of levelData.tiles) {
      if (t.decor) {
        const dg = buildDecorGroup(t, i);
        dg.position.set(t.x, 0, t.z);
        this.group.add(dg);
        this.decorCells.add(key(t.x, t.z));
        i++;
        continue;
      }
      const tile = this.cells.get(key(t.x, t.z));
      const g = buildTileGroup(tile, i);
      g.position.set(t.x, 0, t.z);
      tile.group = g;
      tile.baseLiftY = tile.lift ? tile.lift[tile.li] : 0; // built-at height level
      this.group.add(g);

      g.traverse((o) => {
        if (o.userData?.isPortal) this._animated.portals.push(o);
      });
      if (g.userData.ring) this._animated.rings.push(g.userData.ring);
      if (g.userData.hintSprite) this._animated.sprites.push(g.userData.hintSprite);
      if (g.userData.starMesh) this._animated.starTiles.push(tile);
      if (g.userData.vortex) this._animated.vortices.push(g.userData.vortex);
      i++;
    }

    // Waterfall sheets wherever water currently spills down a level.
    this.wfGroup = new THREE.Group();
    this.group.add(this.wfGroup);
    this.updateWaterfalls();
  }

  /** Rebuild waterfall sheets to match the current tile configuration. */
  updateWaterfalls() {
    if (!this.wfGroup) return;
    for (const m of [...this.wfGroup.children]) {
      this.wfGroup.remove(m);
      m.geometry?.dispose?.();
    }
    for (const tile of this.cells.values()) {
      for (let d = 0; d < 4; d++) {
        const nk = key(tile.x + DIR_VEC[d].dx, tile.z + DIR_VEC[d].dz);
        const nb = this.cells.get(nk);
        if (nb && isDrop(tile, nb, d)) {
          this.wfGroup.add(
            buildWaterfall(tile.x, tile.z, d, edgeHeight(tile, d), edgeHeight(nb, opposite(d)))
          );
        }
      }
    }
  }

  /** A fish just left this tile — if it's cracked ice, it crumbles away. */
  crackAfterLeave(k) {
    const tile = this.cells.get(k);
    if (!tile || !tile.crack || tile.cracked) return;
    tile.cracked = true;
    this.cells.delete(k);
    const g = tile.group;
    this.cb.onSound?.("crumble");
    tween({
      dur: 0.9, ease: Ease.inOutCubic,
      onUpdate: (t) => {
        g.position.y = -t * 1.6;
        g.rotation.z = t * 0.35;
        g.scale.setScalar(1 - t * 0.5);
      },
      onDone: () => { g.visible = false; this.updateWaterfalls(); },
    });
  }

  dispose() {
    if (this.group) {
      this.root.remove(this.group);
      this.group.traverse((o) => {
        o.geometry?.dispose?.();
      });
    }
    this.group = null;
    this.wfGroup = null;
    this.cells = new Map();
    this._animated = { portals: [], rings: [], sprites: [], starTiles: [], vortices: [] };
    this.undoStack = [];
    this.busy = 0;
  }

  get pickables() {
    const list = [];
    for (const t of this.cells.values()) if (t.group) list.push(t.group);
    if (this.ground) list.push(this.ground);
    return list;
  }

  // ---------------------------------------------------------- queries
  isInteractive(tile) {
    return tile.rotatable || !!tile.slide || !!tile.lift;
  }

  findPathToPortal(startKey) {
    if (!this.portalKey) return null;
    return findPath(this.cells, startKey, this.portalKey);
  }

  collectStar(k) {
    const tile = this.cells.get(k);
    if (!tile || !tile.star || tile.starCollected) return false;
    tile.starCollected = true;
    const mesh = tile.group.userData.starMesh;
    if (mesh) {
      const y0 = mesh.position.y;
      tween({
        dur: 0.7, ease: Ease.outCubic,
        onUpdate: (kk) => {
          mesh.position.y = y0 + kk * 1.4;
          mesh.scale.setScalar(1 + kk * 0.6);
          mesh.material.transparent = true;
          mesh.material.opacity = 1 - kk;
        },
        onDone: () => { mesh.visible = false; },
      });
    }
    return true;
  }

  // ---------------------------------------------------------- interactions
  /** Handle a tap on a tile. Returns a move record, or null if nothing happened. */
  interact(tile) {
    if (this.busy > 0) return null;
    if (tile.rotatable) return this._rotate(tile, 1, true);
    if (tile.slide) return this._slide(tile, true);
    if (tile.lift) return this._lift(tile, true);
    this._wobble(tile);
    return null;
  }

  undo() {
    if (this.busy > 0 || !this.undoStack.length) return null;
    const rec = this.undoStack.pop();
    if (rec.kind === "rotate") this._rotate(rec.tile, -1, false);
    else if (rec.kind === "slide") this._slideTo(rec.tile, rec.fromX, rec.fromZ, rec.fromDir, false);
    else if (rec.kind === "lift") this._lift(rec.tile, false);
    return rec;
  }

  _rotate(tile, dirSign, record) {
    const spinner = tile.group.userData.spinner;
    tile.rot = ((tile.rot + dirSign) % 4 + 4) % 4;
    const from = spinner.rotation.y;
    const to = from - dirSign * (Math.PI / 2);
    this.busy++;
    this.cb.onSound?.("rotate");
    tween({
      dur: 0.32, ease: Ease.outBack,
      onUpdate: (k) => { spinner.rotation.y = from + (to - from) * k; },
      onDone: () => { this.busy--; this.updateWaterfalls(); this.cb.onMove?.(); },
    });
    const rec = { kind: "rotate", tile };
    if (record) this.undoStack.push(rec);
    return rec;
  }

  _slide(tile, record) {
    const axis = tile.slide.axis; // "x" | "z"
    const cur = axis === "x" ? tile.x : tile.z;
    let dir = tile.slideDir;
    let next = cur + dir;

    const fits = (v) => {
      if (v < tile.slide.min || v > tile.slide.max) return false;
      const nk = axis === "x" ? key(v, tile.z) : key(tile.x, v);
      return !this.cells.has(nk);
    };
    if (!fits(next)) {
      dir = -dir;
      next = cur + dir;
      if (!fits(next)) { this._wobble(tile); return null; }
    }
    const [nx, nz] = axis === "x" ? [next, tile.z] : [tile.x, next];
    const rec = { kind: "slide", tile, fromX: tile.x, fromZ: tile.z, fromDir: tile.slideDir };
    this._slideTo(tile, nx, nz, dir, true);
    if (record) this.undoStack.push(rec);
    return rec;
  }

  _slideTo(tile, nx, nz, newDir, isForward) {
    this.cells.delete(key(tile.x, tile.z));
    const fx = tile.group.position.x, fz = tile.group.position.z;
    tile.x = nx; tile.z = nz; tile.slideDir = newDir;
    this.cells.set(key(nx, nz), tile);
    this.busy++;
    this.cb.onSound?.("slide");
    tween({
      dur: 0.34, ease: Ease.inOutCubic,
      onUpdate: (k) => {
        tile.group.position.x = fx + (nx - fx) * k;
        tile.group.position.z = fz + (nz - fz) * k;
      },
      onDone: () => { this.busy--; this.updateWaterfalls(); this.cb.onMove?.(); },
    });
  }

  _lift(tile, record) {
    tile.li = tile.li === 0 ? 1 : 0;
    const targetY = (tile.lift[tile.li] - tile.baseLiftY) * LEVEL_H;
    const fromY = tile.group.position.y;
    this.busy++;
    this.cb.onSound?.("lift");
    tween({
      dur: 0.4, ease: Ease.inOutCubic,
      onUpdate: (k) => { tile.group.position.y = fromY + (targetY - fromY) * k; },
      onDone: () => { this.busy--; this.updateWaterfalls(); this.cb.onMove?.(); },
    });
    const rec = { kind: "lift", tile };
    if (record) this.undoStack.push(rec);
    return rec;
  }

  // ---------------------------------------------------------- power-ups
  /** Coral Boost: grow a water bridge (open all sides) on an empty cell. */
  addCoralBridge(x, z) {
    const k = key(x, z);
    if (this.cells.has(k) || this.decorCells.has(k)) return false;
    if (x < 0 || z < 0 || x >= this.level.size[0] || z >= this.level.size[1]) return false;

    const tile = {
      x, z, h: 0,
      baseConn: 15, rot: 0, rotatable: false,
      ramp: null, lift: null, li: 0, slide: null, slideDir: 1,
      portal: false, spawn: false, star: false, starCollected: false,
      coral: true,
    };
    const g = buildCoralBridge(tile);
    g.position.set(x, 0, z);
    tile.group = g;
    this.group.add(g);
    this.cells.set(k, tile);

    // Pop-in animation.
    g.scale.setScalar(0.01);
    this.busy++;
    this.cb.onSound?.("star");
    tween({
      dur: 0.45, ease: Ease.outBack,
      onUpdate: (kk) => g.scale.setScalar(0.01 + kk * 0.99),
      onDone: () => { this.busy--; this.updateWaterfalls(); this.cb.onMove?.(); },
    });
    return true;
  }

  /** Bubble Lift: raise a normal tile one level. */
  bubbleLift(tile) {
    if (tile.lift || tile.ramp || tile.portal) return false;
    tile.h += 1;
    const g = tile.group;
    const fromY = g.position.y;
    this.busy++;
    this.cb.onSound?.("lift");
    tween({
      dur: 0.55, ease: Ease.outBack,
      onUpdate: (k) => { g.position.y = fromY + LEVEL_H * k; },
      onDone: () => { this.busy--; this.updateWaterfalls(); this.cb.onMove?.(); },
    });
    return true;
  }

  _wobble(tile) {
    if (!tile.group) return;
    const g = tile.group;
    this.busy++;
    this.cb.onSound?.("bump");
    tween({
      dur: 0.3, ease: Ease.linear,
      onUpdate: (k) => { g.rotation.y = Math.sin(k * Math.PI * 3) * 0.06 * (1 - k); },
      onDone: () => { g.rotation.y = 0; this.busy--; },
    });
  }

  // ---------------------------------------------------------- per-frame
  update(dt) {
    this._time += dt;
    const t = this._time;
    for (const p of this._animated.portals) {
      if (p.userData.spin) p.userData.spin.rotation.z = t * 1.2;
      if (p.userData.glow) {
        p.userData.glow.material.opacity = 0.55 + Math.sin(t * 2.4) * 0.2;
        p.userData.glow.scale.setScalar(1 + Math.sin(t * 2.4) * 0.07);
      }
    }
    for (const r of this._animated.rings) {
      r.material.opacity = 0.32 + Math.sin(t * 2.2) * 0.18;
    }
    for (const s of this._animated.sprites) {
      s.position.y += Math.sin(t * 2) * 0.0006;
    }
    for (const tile of this._animated.starTiles) {
      const m = tile.group.userData.starMesh;
      if (m && !tile.starCollected) {
        m.rotation.y = t * 1.6;
        m.position.y = m.userData.baseY ?? (m.userData.baseY = m.position.y);
        m.position.y = m.userData.baseY + Math.sin(t * 2 + tile.x) * 0.05;
      }
    }
    for (const v of this._animated.vortices) {
      const [r1, r2] = v.userData.rings;
      r1.rotation.z = t * 2.4;
      r2.rotation.z = -t * 3.4;
      r1.scale.setScalar(1 + Math.sin(t * 3) * 0.08);
    }
    if (this.wfGroup) {
      for (const m of this.wfGroup.children) {
        m.material.opacity = 0.55 + Math.sin(t * 5 + m.position.x * 3) * 0.12;
      }
    }
  }

  /** World position for a fish resting on a tile (used by fish controller). */
  fishPos(k) {
    const tile = this.cells.get(k);
    if (!tile) return null;
    const v = new THREE.Vector3(tile.x, waterY(tile), tile.z);
    // Ramps: the fish rides the middle of the slope.
    if (tile.ramp != null) v.y += LEVEL_H * 0.5;
    return v;
  }
}
