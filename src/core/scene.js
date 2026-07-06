// Scene, orthographic isometric camera, pastel lighting, ambient effects.
import * as THREE from "three";

const SKY = 0xdcebf5;

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(SKY, 26, 46);

  // --- Camera: classic isometric orthographic view ---
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
  camera.position.set(12, 12, 12);
  camera.lookAt(0, 0, 0);

  let viewSize = 5.5;
  let center = new THREE.Vector3(0, 0, 0);

  function frame(boardW, boardH) {
    center = new THREE.Vector3((boardW - 1) / 2, 0.3, (boardH - 1) / 2);
    const span = Math.max(boardW, boardH);
    viewSize = span * 0.72 + 1.7;
    camera.position.set(center.x + 12, 12.5, center.z + 12);
    camera.lookAt(center);
    resize();
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    const aspect = w / h;
    // Fit board in both portrait and landscape.
    const vs = aspect < 1 ? viewSize / Math.max(aspect, 0.52) : viewSize;
    camera.left = -vs * aspect;
    camera.right = vs * aspect;
    camera.top = vs;
    camera.bottom = -vs;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  // --- Lights: soft pastel dream ---
  const hemi = new THREE.HemisphereLight(0xfff6e8, 0xbcd8ea, 0.95);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff0da, 1.35);
  sun.position.set(7, 14, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -10;
  sun.shadow.camera.right = 10;
  sun.shadow.camera.top = 10;
  sun.shadow.camera.bottom = -10;
  sun.shadow.camera.far = 40;
  sun.shadow.bias = -0.0004;
  sun.shadow.radius = 4;
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0xcfe0ff, 0.35);
  fill.position.set(-6, 6, -8);
  scene.add(fill);

  // --- Floating island group (levels attach here) ---
  const boardGroup = new THREE.Group();
  scene.add(boardGroup);

  // Soft glow disc under the island.
  const glow = makeGlowDisc();
  scene.add(glow);

  // Ambient rising bubbles.
  const bubbles = makeBubbles();
  scene.add(bubbles.points);

  function frameExtras(boardW, boardH) {
    glow.position.set((boardW - 1) / 2, -1.4, (boardH - 1) / 2);
    glow.scale.setScalar(Math.max(boardW, boardH) * 0.85);
    bubbles.setBounds(boardW, boardH);
    sun.target.position.set((boardW - 1) / 2, 0, (boardH - 1) / 2);
    sun.target.updateMatrixWorld();
    sun.position.set((boardW - 1) / 2 + 7, 14, (boardH - 1) / 2 + 5);
  }

  let time = 0;
  function update(dt) {
    time += dt;
    // The whole island gently floats.
    boardGroup.position.y = Math.sin(time * 0.8) * 0.045;
    boardGroup.rotation.z = Math.sin(time * 0.5) * 0.004;
    glow.material.opacity = 0.32 + Math.sin(time * 1.2) * 0.06;
    bubbles.update(dt);
  }

  /** Apply a world theme: fog, lights, glow colour (see levels.json worlds). */
  function setTheme(theme) {
    if (!theme) return;
    scene.fog.color.set(theme.fog);
    hemi.color.set(theme.hemiSky);
    hemi.groundColor.set(theme.hemiGround);
    glow.material.color.set(theme.glow);
    sun.intensity = theme.sun ?? 1.35; // splash dims the sun for drama
  }

  return {
    scene, camera, renderer, boardGroup,
    frame: (w, h) => { frame(w, h); frameExtras(w, h); },
    resize, update, setTheme,
    render: () => renderer.render(scene, camera),
  };
}

// ---------------------------------------------------------------- helpers
function makeGlowDisc() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  // White gradient so the disc can be tinted per world theme.
  const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
  g.addColorStop(0, "rgba(255, 255, 255, 0.85)");
  g.addColorStop(0.55, "rgba(255, 255, 255, 0.3)");
  g.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.MeshBasicMaterial({
    map: tex, color: 0x7edcdc, transparent: true, opacity: 0.35, depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), mat);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

function makeBubbles() {
  const COUNT = 42;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(COUNT * 3);
  const speed = new Float32Array(COUNT);
  let bw = 5, bh = 5;

  for (let i = 0; i < COUNT; i++) {
    pos[i * 3] = Math.random() * 6 - 1;
    pos[i * 3 + 1] = Math.random() * 6 - 1.5;
    pos[i * 3 + 2] = Math.random() * 6 - 1;
    speed[i] = 0.25 + Math.random() * 0.55;
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));

  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(32, 32, 22, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(220,245,255,0.35)";
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);

  const mat = new THREE.PointsMaterial({
    size: 0.16, map: tex, transparent: true, opacity: 0.65,
    depthWrite: false, sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);

  return {
    points,
    setBounds(w, h) { bw = w; bh = h; },
    update(dt) {
      const p = geo.attributes.position.array;
      for (let i = 0; i < COUNT; i++) {
        p[i * 3 + 1] += speed[i] * dt;
        p[i * 3] += Math.sin(p[i * 3 + 1] * 2 + i) * dt * 0.12;
        if (p[i * 3 + 1] > 5) {
          p[i * 3 + 1] = -1.6;
          p[i * 3] = Math.random() * (bw + 2) - 1.5;
          p[i * 3 + 2] = Math.random() * (bh + 2) - 1.5;
        }
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}
