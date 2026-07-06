// Splash set piece: a glowing aquarium cube floating in the dark, god rays
// streaming down to a caustic light pool, small fish swimming in the beam.
// No floor plane — the scene melts into the page gradient like the reference.
import * as THREE from "three";
import { buildFish } from "../game/tileFactory.js";

const CUBE_X = 3.1, CUBE_Z = 1.4;   // beam axis (right of centre)
const CUBE_Y = 3.3;                  // cube centre height
const CUBE_SIZE = 1.7;

export function buildSplash(parent) {
  const group = new THREE.Group();
  parent.add(group);

  // ---- the water cube: translucent glass volume with an inner glow ----
  const cube = new THREE.Group();
  cube.position.set(CUBE_X, CUBE_Y, CUBE_Z);
  group.add(cube);

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE),
    new THREE.MeshStandardMaterial({
      color: 0x63cde6,
      emissive: 0x2fa8c8,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.18,
      roughness: 0.05,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  cube.add(body);

  const innerGlow = new THREE.Mesh(
    new THREE.BoxGeometry(CUBE_SIZE * 0.92, CUBE_SIZE * 0.92, CUBE_SIZE * 0.92),
    new THREE.MeshBasicMaterial({
      color: 0x2fa8c8, transparent: true, opacity: 0.14,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide,
    })
  );
  cube.add(innerGlow);

  // Bright rippling surface on top.
  const surface = new THREE.Mesh(
    new THREE.PlaneGeometry(CUBE_SIZE * 0.99, CUBE_SIZE * 0.99),
    new THREE.MeshBasicMaterial({
      color: 0xd8f6ff, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    })
  );
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = CUBE_SIZE / 2;
  cube.add(surface);

  // Luminous edges.
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE)),
    new THREE.LineBasicMaterial({ color: 0xaef2ff, transparent: true, opacity: 0.75 })
  );
  cube.add(edges);

  // ---- god rays: gradient-faded shafts so they melt into the dark ----
  const beamH = CUBE_Y - CUBE_SIZE / 2 + 0.1;
  const beamTex = beamTexture();
  const beams = [];
  for (let i = 0; i < 3; i++) {
    const beam = new THREE.Mesh(
      new THREE.PlaneGeometry(CUBE_SIZE * 0.85, beamH),
      new THREE.MeshBasicMaterial({
        map: beamTex,
        color: 0x57c8dc,
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    beam.position.set(CUBE_X, beamH / 2, CUBE_Z);
    beam.rotation.y = (i / 3) * Math.PI;
    beams.push(beam);
    group.add(beam);
  }
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(CUBE_SIZE * 0.3, CUBE_SIZE * 0.55, beamH, 20, 1, true),
    new THREE.MeshBasicMaterial({
      map: beamTex,
      color: 0x66d8e8,
      transparent: true,
      opacity: 0.1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  column.position.set(CUBE_X, beamH / 2, CUBE_Z);
  group.add(column);

  // ---- lights so the fish glow inside the beam ----
  const cubeLight = new THREE.PointLight(0x9fe8ff, 30, 9, 1.8);
  cubeLight.position.set(CUBE_X, CUBE_Y, CUBE_Z);
  group.add(cubeLight);
  const beamLight = new THREE.PointLight(0x66d8e8, 14, 6, 1.8);
  beamLight.position.set(CUBE_X, 1.3, CUBE_Z);
  group.add(beamLight);

  // ---- caustic light pool (two layers, counter-rotating shimmer) ----
  const causticTex = causticTexture();
  const caustics = [];
  for (const [r, op] of [[1.5, 0.4], [1.05, 0.3]]) {
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(r, 40),
      new THREE.MeshBasicMaterial({
        map: causticTex,
        color: 0x9feefc,
        transparent: true,
        opacity: op,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(CUBE_X, 0.02 + caustics.length * 0.015, CUBE_Z);
    caustics.push(m);
    group.add(m);
  }

  // ---- the school of fish: some inside the cube, most in the beam ----
  const palette = [0xffab4a, 0xff8a5c, 0xf6ede0, 0xf78fb3, 0xffc46b];
  const fishes = [];
  for (let i = 0; i < 14; i++) {
    const mesh = buildFish(palette[i % palette.length]);
    mesh.scale.setScalar(0.3 + Math.random() * 0.28);
    group.add(mesh);
    const inCube = i < 5;
    fishes.push({
      mesh,
      r: inCube ? 0.15 + Math.random() * 0.45 : 0.15 + Math.random() * 0.5,
      y0: inCube
        ? CUBE_Y - 0.45 + Math.random() * 0.9
        : 0.55 + Math.random() * (beamH - 1.4),
      yAmp: inCube ? 0.12 : 0.2 + Math.random() * 0.3,
      speed: (0.4 + Math.random() * 0.7) * (Math.random() < 0.5 ? 1 : -1),
      ySpeed: 0.3 + Math.random() * 0.5,
      phase: Math.random() * Math.PI * 2,
    });
  }

  // ---------------------------------------------------------------- api
  let time = 0;
  return {
    group,
    update(dt) {
      time += dt;
      cube.position.y = CUBE_Y + Math.sin(time * 0.7) * 0.07;
      cube.rotation.y = Math.sin(time * 0.25) * 0.05;
      surface.material.opacity = 0.4 + Math.sin(time * 2.1) * 0.14;
      innerGlow.material.opacity = 0.12 + Math.sin(time * 1.5) * 0.04;
      for (let i = 0; i < beams.length; i++) {
        beams[i].material.opacity = 0.14 + Math.sin(time * 0.9 + i * 2.1) * 0.06;
      }
      column.material.opacity = 0.1 + Math.sin(time * 1.3) * 0.03;
      caustics[0].rotation.z = time * 0.07;
      caustics[1].rotation.z = -time * 0.11;
      caustics[0].material.opacity = 0.36 + Math.sin(time * 1.8) * 0.12;
      caustics[1].material.opacity = 0.26 + Math.sin(time * 2.3 + 1) * 0.1;
      cubeLight.intensity = 28 + Math.sin(time * 2) * 6;

      for (const f of fishes) {
        const a = time * f.speed + f.phase;
        f.mesh.position.set(
          CUBE_X + Math.cos(a) * f.r,
          f.y0 + Math.sin(time * f.ySpeed + f.phase) * f.yAmp,
          CUBE_Z + Math.sin(a) * f.r
        );
        const dir = Math.sign(f.speed);
        f.mesh.rotation.y = Math.atan2(-Math.cos(a) * dir, -Math.sin(a) * dir);
        f.mesh.rotation.z = Math.sin(time * 3 + f.phase) * 0.12;
        const tail = f.mesh.userData.tail;
        if (tail) tail.rotation.y = Math.sin(time * 8 + f.phase) * 0.5;
      }
    },
    dispose() {
      parent.remove(group);
      group.traverse((o) => o.geometry?.dispose?.());
    },
  };
}

/** Vertical white→transparent gradient, so shafts fade with distance. */
function beamTexture() {
  const c = document.createElement("canvas");
  c.width = 8; c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, "rgba(255,255,255,0.95)");
  g.addColorStop(0.55, "rgba(255,255,255,0.4)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 128);
  return new THREE.CanvasTexture(c);
}

/** Soft dappled light-web for the caustic pool (bright blobs, no craters). */
function causticTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  // Soft base pool.
  const base = ctx.createRadialGradient(128, 128, 10, 128, 128, 126);
  base.addColorStop(0, "rgba(255,255,255,0.55)");
  base.addColorStop(0.6, "rgba(255,255,255,0.18)");
  base.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  // Bright dapples layered on top.
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 22; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = Math.random() * 100;
    const x = 128 + Math.cos(a) * d, y = 128 + Math.sin(a) * d;
    const r = 6 + Math.random() * 16;
    const spot = ctx.createRadialGradient(x, y, 1, x, y, r);
    spot.addColorStop(0, "rgba(255,255,255,0.5)");
    spot.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = spot;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return new THREE.CanvasTexture(c);
}
