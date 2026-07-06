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

  /** Called after every completed move: start any fish that now has a path. */
  tryStart() {
    for (const f of this.fishes) {
      if (f.state !== "idle") continue;
      const path = this.board.findPathToPortal(f.key);
      if (path && path.length > 1) {
        f.state = "swim";
        f.path = path;
        f.seg = 0;
        f.segT = 0;
        this.cb.onSound?.("swim");
      }
    }
  }

  update(dt) {
    this._time += dt;
    for (const f of this.fishes) {
      if (f.state === "home") continue;
      if (f.state === "idle") {
        // Gentle idle bob + wiggle.
        const p = this.board.fishPos(f.key);
        f.mesh.position.y = p.y + Math.sin(this._time * 2 + f.bobPhase) * 0.03;
        f.mesh.rotation.y = f.yaw + Math.sin(this._time * 1.4 + f.bobPhase) * 0.15;
        this._wiggleTail(f, 1);
        continue;
      }
      // --- swimming ---
      const from = this.board.fishPos(f.path[f.seg]);
      const to = this.board.fishPos(f.path[f.seg + 1]);
      const segLen = from.distanceTo(to) || 1;
      f.segT += (SWIM_SPEED * dt) / segLen;

      if (f.segT >= 1) {
        f.seg++;
        f.segT = 0;
        f.key = f.path[f.seg];
        if (this.board.collectStar(f.key)) this.cb.onStar?.(f.key);
        if (f.seg >= f.path.length - 1) {
          this._arrive(f);
          continue;
        }
      }
      const a = this.board.fishPos(f.path[f.seg]);
      const b = this.board.fishPos(f.path[Math.min(f.seg + 1, f.path.length - 1)]);
      const pos = a.clone().lerp(b, f.segT);
      pos.y += Math.sin(this._time * 6 + f.bobPhase) * 0.025;
      f.mesh.position.copy(pos);

      // Face swim direction (fish model faces +x).
      const dx = b.x - a.x, dz = b.z - a.z;
      if (dx !== 0 || dz !== 0) {
        const targetYaw = Math.atan2(-dz, dx);
        f.yaw = lerpAngle(f.yaw, targetYaw, Math.min(1, dt * 8));
        f.mesh.rotation.y = f.yaw;
      }
      f.mesh.rotation.z = Math.sin(this._time * 7) * 0.08;
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
