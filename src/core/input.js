// Pointer input → raycast picking of tiles. Works for mouse and touch.
import * as THREE from "three";

export function createInput(canvas, camera, getPickables, onPick) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let downAt = null;

  function toNDC(e) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function onPointerDown(e) {
    downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
  }

  function onPointerUp(e) {
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
  canvas.addEventListener("pointerup", onPointerUp);

  return {
    dispose() {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerup", onPointerUp);
    },
  };
}
