// Fish: cute swimmers that follow the water graph to the portal.
import * as THREE from "three";
import { key } from "./rules.js";
import { buildFish } from "./tileFactory.js";

const SWIM_SPEED = 1.55; // tiles per second

export class FishController {
  constructor(boardGroup, callbacks = {}) {
    this.root = boardGroup;
    this.cb = callbacks; // { onStar(key), onHome(fish), onAllHome(), onSound(name) }
    this.fishes = [];
    this._time = 0;
  }

  load(levelData, board) {
    this.dispose();
    this.board = board;
    for (const f of levelData.fish) {
      const mesh = buildFish(f.color ? parseInt(f.color.replace("#", "0x")) : 0xff9f43);
      const k = key(f.x, f.z);
      const pos = board.fishPos(k);
      mesh.position.copy(pos);
      board.group.add(mesh);
      this.fishes.push({
        mesh, key: k,
        state: "idle", // idle | swim | home
        path: null, seg: 0, segT: 0,
        yaw: Math.PI, bobPhase: Math.random() * 6,
      });
    }
  }

  dispose() {
    for (const f of this.fishes) f.mesh.parent?.remove(f.mesh);
    this.fishes = [];
  }

  get anySwimming() {
    return this.fishes.some((f) => f.state === "swim");
  }
  get allHome() {
    return this.fishes.length > 0 && this.fishes.every((f) => f.state === "home");
  }

  /** The idle fish sitting on a given cell, if any. */
  idleFishAt(k) {
    return this.fishes.find((f) => f.state === "idle" && f.key === k) || null;
  }

  /** Current Push: swim a fish along a partial path (no portal at the end). */
  pushAlong(fish, path) {
    if (fish.state !== "idle" || !path || path.length < 2) return false;
    this._beginSwim(fish, path, true);
    return true;
  }

  /** Called after every completed move: start any fish that now has a path. */
  tryStart() {
    for (const f of this.fishes) {
      if (f.state !== "idle") continue;
      const path = this.board.findPathToPortal(f.key);
      if (path && path.length > 1) this._beginSwim(f, path, false);
    }
  }

  _beginSwim(f, path, partial) {
    f.state = "swim";
    f.partial = partial;
    f.path = path;
    // Cache waypoints now — tiles may crumble away behind the fish.
    f.points = path.map((k) => this.board.fishPos(k));
    f.seg = 0;
    f.segT = 0;
    this.cb.onSound?.("swim");
  }

  update(dt) {
    this._time += dt;
    for (const f of this.fishes) {
      if (f.state === "home") continue;
      if (f.state === "idle") {
        // Gentle idle bob + wiggle.
        const p = this.board.fishPos(f.key);
        if (!p) continue; // tile crumbled away beneath us
        f.mesh.position.y = p.y + Math.sin(this._time * 2 + f.bobPhase) * 0.03;
        f.mesh.rotation.y = f.yaw + Math.sin(this._time * 1.4 + f.bobPhase) * 0.15;
        this._wiggleTail(f, 1);
        continue;
      }
      // --- swimming ---
      const a0 = f.points[f.seg];
      const b0 = f.points[f.seg + 1];
      const warpSeg = Math.abs(b0.x - a0.x) + Math.abs(b0.z - a0.z) > 1.5;
      const dropSeg = !warpSeg && a0.y - b0.y > 0.3;
      if (f.segT === 0 && warpSeg) this.cb.onSound?.("warp");
      const segLen = warpSeg ? 1.4 : a0.distanceTo(b0) || 1;
      f.segT += (SWIM_SPEED * dt) / segLen;

      if (f.segT >= 1) {
        f.seg++;
        f.segT = 0;
        const prevKey = f.path[f.seg - 1];
        f.key = f.path[f.seg];
        if (dropSeg) this.cb.onSound?.("splash");
        if (this.board.collectStar(f.key)) this.cb.onStar?.(f.key);
        this.board.crackAfterLeave(prevKey); // ice crumbles behind the fish
        if (f.seg >= f.path.length - 1) {
          if (f.partial) {
            // Pushed by a current — rest here, ready to swim on.
            f.partial = false;
            f.state = "idle";
            f.path = null;
            f.points = null;
            f.mesh.scale.setScalar(1);
            this.tryStart();
          } else {
            this._arrive(f);
          }
          continue;
        }
      }
      const a = f.points[f.seg];
      const b = f.points[Math.min(f.seg + 1, f.path.length - 1)];
      const t = f.segT;
      const isWarp = Math.abs(b.x - a.x) + Math.abs(b.z - a.z) > 1.5;
      const isFall = !isWarp && a.y - b.y > 0.3;

      if (isWarp) {
        // Whirlpool: spiral shut at one end, spin open at the other.
        const pos = (t < 0.5 ? a : b).clone();
        pos.y += Math.sin(t * Math.PI) * 0.18;
        f.mesh.position.copy(pos);
        f.mesh.scale.setScalar(Math.max(0.05, Math.abs(Math.cos(Math.PI * t))));
        f.mesh.rotation.y += dt * 14;
        this._wiggleTail(f, 2.2);
        continue;
      }
      f.mesh.scale.setScalar(1);
      const pos = a.clone().lerp(b, t);
      if (isFall) {
        // Waterfall: accelerate down the fall, nose first.
        pos.y = a.y + (b.y - a.y) * t * t;
        f.mesh.rotation.z = -0.55;
      } else {
        f.mesh.rotation.z = Math.sin(this._time * 7) * 0.08;
      }
      pos.y += Math.sin(this._time * 6 + f.bobPhase) * 0.025;
      f.mesh.position.copy(pos);

      // Face swim direction (fish model faces +x).
      const dx = b.x - a.x, dz = b.z - a.z;
      if (dx !== 0 || dz !== 0) {
        const targetYaw = Math.atan2(-dz, dx);
        f.yaw = lerpAngle(f.yaw, targetYaw, Math.min(1, dt * 8));
        f.mesh.rotation.y = f.yaw;
      }
      this._wiggleTail(f, 2.2);
    }
  }

  _wiggleTail(f, intensity) {
    const tail = f.mesh.userData.tail;
    if (tail) tail.rotation.y = Math.sin(this._time * 9 + f.bobPhase) * 0.4 * intensity;
  }

  _arrive(f) {
    f.state = "home";
    this.cb.onSound?.("splash");
    // Spiral down into the portal.
    const mesh = f.mesh;
    const start = mesh.position.clone();
    let t = 0;
    const spiral = () => {
      t += 0.02;
      if (t >= 1) { mesh.visible = false; return; }
      mesh.position.x = start.x + Math.cos(t * 10) * 0.12 * (1 - t);
      mesh.position.z = start.z + Math.sin(t * 10) * 0.12 * (1 - t);
      mesh.position.y = start.y + t * 0.25 - t * t * 0.5;
      mesh.scale.setScalar(1 - t * 0.9);
      mesh.rotation.y += 0.2;
      requestAnimationFrame(spiral);
    };
    spiral();
    this.cb.onHome?.(f);
    if (this.allHome) this.cb.onAllHome?.();
  }
}

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
