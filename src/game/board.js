// Board: owns logical tiles + their meshes, handles interactions and undo.
import * as THREE from "three";
import { tween, Ease } from "../core/tween.js";
import {
  key, DIR_VEC, buildLogicalTiles, findPath,
} from "./rules.js";
import {
  buildTileGroup, buildDecorGroup, LEVEL_H, waterY,
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
    this._animated = { portals: [], rings: [], sprites: [], starTiles: [] };
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

    let i = 0;
    for (const t of levelData.tiles) {
      if (t.decor) {
        const dg = buildDecorGroup(t, i);
        dg.position.set(t.x, 0, t.z);
        this.group.add(dg);
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
      i++;
    }
  }

  dispose() {
    if (this.group) {
      this.root.remove(this.group);
      this.group.traverse((o) => {
        o.geometry?.dispose?.();
      });
    }
    this.group = null;
    this.cells = new Map();
    this._animated = { portals: [], rings: [], sprites: [], starTiles: [] };
    this.undoStack = [];
    this.busy = 0;
  }

  get pickables() {
    const list = [];
    for (const t of this.cells.values()) if (t.group) list.push(t.group);
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
      onDone: () => { this.busy--; this.cb.onMove?.(); },
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
      onDone: () => { this.busy--; this.cb.onMove?.(); },
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
      onDone: () => { this.busy--; this.cb.onMove?.(); },
    });
    const rec = { kind: "lift", tile };
    if (record) this.undoStack.push(rec);
    return rec;
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
  }

  /** World position for a fish resting on a tile (used by fish controller). */
  fishPos(k) {
    const tile = this.cells.get(k);
    const v = new THREE.Vector3(tile.x, waterY(tile), tile.z);
    // Ramps: the fish rides the middle of the slope.
    if (tile.ramp != null) v.y += LEVEL_H * 0.5;
    return v;
  }
}
