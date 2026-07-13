// Pointer input → raycast picking of tiles. Works for mouse and touch.
import * as THREE from "three";

export function createInput(canvas, camera, getPickables, onPick, onZoom) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let downAt = null;

  // --- pinch-to-zoom + wheel zoom ---
  const pointers = new Map();
  let pinchDist = null;
  const dist = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  function toNDC(e) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function onPointerDown(e) {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      pinchDist = dist();
      downAt = null; // two fingers = zoom, never a tap
      return;
    }
    downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
  }

  function onPointerMove(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinchDist) {
      const d = dist();
      if (d > 8) {
        onZoom?.(pinchDist / d); // fingers apart → factor < 1 → zoom in
        pinchDist = d;
      }
    }
  }

  function onPointerEnd(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchDist = null;
  }

  function onWheel(e) {
    e.preventDefault();
    onZoom?.(e.deltaY > 0 ? 1.07 : 0.93);
  }

  function onPointerUp(e) {
    onPointerEnd(e);
    if (!downAt) return;
    const dx = e.clientX - downAt.x;
    const dy = e.clientY - downAt.y;
    const isTap = Math.hypot(dx, dy) < 12 && performance.now() - downAt.t < 600;
    downAt = null;
    if (!isTap) return;

    toNDC(e);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(getPickables(), true);
    if (!hits.length) return;

    // Walk up to the tile root group.
    let obj = hits[0].object;
    while (obj && !obj.userData?.tile && !obj.userData?.ground) obj = obj.parent;
    if (obj?.userData?.tile) {
      onPick({ tile: obj.userData.tile });
    } else if (obj?.userData?.ground) {
      // Empty-cell tap (used by power-ups): snap the hit point to the grid.
      const p = hits[0].point;
      onPick({ cell: { x: Math.round(p.x), z: Math.round(p.z) } });
    }
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerEnd);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  return {
    dispose() {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerEnd);
      canvas.removeEventListener("wheel", onWheel);
    },
  };
}
