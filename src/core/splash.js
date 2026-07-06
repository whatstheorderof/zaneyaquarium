// Splash set piece: a glowing aquarium cube floating in the dark, god rays
// streaming down to a caustic light pool, small fish swimming in the beam.
// Inspired by cinematic "light shaft aquarium" hero imagery.
import * as THREE from "three";
import { buildFish } from "../game/tileFactory.js";

const CUBE_X = 3.1, CUBE_Z = 1.4;   // beam axis (right of centre)
const CUBE_Y = 3.3;                  // cube centre height
const CUBE_SIZE = 1.7;
const FLOOR_Y = 0;

export function buildSplash(parent) {
  const group = new THREE.Group();
  parent.add(group);
  const animated = {};

  // ---- dark sea floor ----
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 12),
    new THREE.MeshStandardMaterial({ color: 0x0b1626, roughness: 1 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(2, FLOOR_Y, 1.5);
  floor.receiveShadow = true;
  group.add(floor);

  // ---- the water cube ----
  const cube = new THREE.Group();
  cube.position.set(CUBE_X, CUBE_Y, CUBE_Z);
  group.add(cube);
  animated.cube = cube;

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE),
    new THREE.MeshStandardMaterial({
      color: 0x2fa8c8,
      emissive: 0x1e7f9e,
      emissiveIntensity: 0.55,
      transparent: true,
      opacity: 0.32,
      roughness: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  cube.add(body);

  // Bright rippling surface on top.
  const surface = new THREE.Mesh(
    new THREE.PlaneGeometry(CUBE_SIZE * 0.98, CUBE_SIZE * 0.98),
    new THREE.MeshBasicMaterial({
      color: 0xbfeeff, transparent: true, opacity: 0.75,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = CUBE_SIZE / 2;
  cube.add(surface);
  animated.surface = surface;

  // Soft glowing edges.
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, CUBE_SIZE)),
    new THREE.LineBasicMaterial({ color: 0x9fe8f0, transparent: true, opacity: 0.5 })
  );
  cube.add(edges);

  // ---- god rays: additive translucent shafts from cube to floor ----
  const beams = [];
  const beamH = CUBE_Y - CUBE_SIZE / 2 - FLOOR_Y;
  const beamGeo = new THREE.PlaneGeometry(CUBE_SIZE * 0.92, beamH);
  for (let i = 0; i < 5; i++) {
    const beam = new THREE.Mesh(
      beamGeo,
      new THREE.MeshBasicMaterial({
        color: 0x7fd9e8,
        transparent: true,
        opacity: 0.05 + (i % 2) * 0.035,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    beam.position.set(CUBE_X, FLOOR_Y + beamH / 2, CUBE_Z);
    beam.rotation.y = (i / 5) * Math.PI;
    beams.push(beam);
    group.add(beam);
  }
  // Central light column.
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(CUBE_SIZE * 0.36, CUBE_SIZE * 0.62, beamH, 18, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x9fe8f0, transparent: true, opacity: 0.07,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    })
  );
  column.position.set(CUBE_X, FLOOR_Y + beamH / 2, CUBE_Z);
  group.add(column);
  animated.beams = beams;
  animated.column = column;

  // ---- caustic pool on the floor ----
  const caustics = new THREE.Mesh(
    new THREE.CircleGeometry(1.45, 40),
    new THREE.MeshBasicMaterial({
      map: causticTexture(),
      color: 0xaef2ff,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  caustics.rotation.x = -Math.PI / 2;
  caustics.position.set(CUBE_X, FLOOR_Y + 0.02, CUBE_Z);
  group.add(caustics);
  animated.caustics = caustics;

  // ---- the school of fish, drifting inside the beam ----
  const palette = [0xffab4a, 0xff8a5c, 0xf6ede0, 0xf78fb3, 0xffc46b];
  const fishes = [];
  for (let i = 0; i < 13; i++) {
    const mesh = buildFish(palette[i % palette.length]);
    const s = 0.32 + Math.random() * 0.3;
    mesh.scale.setScalar(s);
    group.add(mesh);
    fishes.push({
      mesh,
      r: 0.15 + Math.random() * 0.55,
      y0: 0.6 + Math.random() * (beamH - 0.9),
      yAmp: 0.15 + Math.random() * 0.35,
      speed: (0.4 + Math.random() * 0.7) * (Math.random() < 0.5 ? 1 : -1),
      ySpeed: 0.3 + Math.random() * 0.5,
      phase: Math.random() * Math.PI * 2,
    });
  }
  animated.fishes = fishes;

  // ---------------------------------------------------------------- api
  let time = 0;
  return {
    group,
    update(dt) {
      time += dt;
      cube.position.y = CUBE_Y + Math.sin(time * 0.7) * 0.07;
      cube.rotation.y = Math.sin(time * 0.25) * 0.05;
      surface.material.opacity = 0.6 + Math.sin(time * 2.1) * 0.18;
      for (let i = 0; i < beams.length; i++) {
        beams[i].material.opacity =
          (0.05 + (i % 2) * 0.035) * (1 + Math.sin(time * 0.9 + i * 1.7) * 0.45);
      }
      column.material.opacity = 0.07 + Math.sin(time * 1.3) * 0.025;
      caustics.material.opacity = 0.4 + Math.sin(time * 1.8) * 0.16;
      caustics.rotation.z = time * 0.08;
      caustics.scale.setScalar(1 + Math.sin(time * 1.1) * 0.06);

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

/** Blobby light-web texture for the caustic pool. */
function causticTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
  g.addColorStop(0, "rgba(255,255,255,0.95)");
  g.addColorStop(0.5, "rgba(255,255,255,0.35)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  // Carve wobbly dark cells so it reads as caustic light on sand.
  ctx.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * 256, y = Math.random() * 256, r = 8 + Math.random() * 22;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.5 + Math.random() * 0.5), Math.random() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  return new THREE.CanvasTexture(c);
}
