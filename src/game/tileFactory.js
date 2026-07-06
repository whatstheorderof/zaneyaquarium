// Builds all tile / prop meshes. Pure visuals — game logic lives in rules.js.
import * as THREE from "three";
import { N, E, S, W, bit } from "./rules.js";

// ------------------------------------------------------------- palette
export const PALETTE = {
  bases: [0xb8a7e0, 0xf3b8c8, 0x8fb8e8, 0xa8dbc5, 0xf0dfc0, 0xc9b6ea],
  baseSide: 0x9d8fd0,
  water: 0x6fd6d6,
  waterGlow: 0xaef0ea,
  sand: 0xf3e6c8,
  portal: 0x7ef0d8,
  star: 0xffd166,
  coral: [0xf78fb3, 0xc98fe8, 0x63cdda, 0xf5a25d],
  rock: 0xcfd8e6,
};

/** Apply a world theme to the tile palette + shared water material. */
export function applyTheme(theme) {
  if (!theme) return;
  const hex = (s) => parseInt(s.replace("#", ""), 16);
  if (theme.bases) PALETTE.bases = theme.bases.map(hex);
  if (theme.water) PALETTE.water = hex(theme.water);
  if (theme.waterGlow) PALETTE.waterGlow = hex(theme.waterGlow);
  if (mats.water) {
    mats.water.color.set(PALETTE.water);
    mats.water.emissive.set(PALETTE.waterGlow);
  }
}

const TILE = 1;           // world size of a tile
const BASE_H = 0.55;      // base block height at h = 0
const LEVEL_H = 0.55;     // extra height per elevation level
const CHANNEL_W = 0.3;    // water channel width

// Shared materials (cached).
const mats = {};
function mat(name, factory) {
  if (!mats[name]) mats[name] = factory();
  return mats[name];
}
const waterMat = () =>
  mat("water", () => new THREE.MeshStandardMaterial({
    color: PALETTE.water,
    emissive: PALETTE.waterGlow,
    emissiveIntensity: 0.35,
    roughness: 0.15,
    metalness: 0,
    transparent: true,
    opacity: 0.92,
  }));

export function topY(tile) {
  const h = tile.lift ? tile.lift[tile.li] : tile.h;
  return BASE_H + h * LEVEL_H;
}
export function waterY(tile) { return topY(tile) + 0.055; }
export { BASE_H, LEVEL_H };

// ------------------------------------------------------------- tile root
/**
 * Build the full visual group for a logical tile record.
 * The group is positioned by the board; children are local.
 */
export function buildTileGroup(tile, index) {
  const g = new THREE.Group();
  g.userData.tile = tile;

  const h = tile.lift ? tile.lift[tile.li] : tile.h;
  const baseH = BASE_H + h * LEVEL_H;
  const color = tile.portal
    ? 0xa8dbc5
    : PALETTE.bases[index % PALETTE.bases.length];

  // Base block (slightly inset for the "tile grid" look).
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(TILE * 0.96, baseH, TILE * 0.96),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85 })
  );
  base.position.y = baseH / 2;
  base.castShadow = true;
  base.receiveShadow = true;
  g.add(base);

  // Light rim on top edge for a cute bevel feel.
  const rim = new THREE.Mesh(
    new THREE.BoxGeometry(TILE * 0.98, 0.045, TILE * 0.98),
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.4),
      roughness: 0.7,
    })
  );
  rim.position.y = baseH - 0.02;
  g.add(rim);

  // Rotating part: sand pad + water channels (so rotation animates nicely).
  const spinner = new THREE.Group();
  spinner.position.y = baseH;
  g.add(spinner);
  g.userData.spinner = spinner;

  if (tile.baseConn || tile.ramp != null) {
    if (tile.ramp != null) {
      buildRamp(g, tile, baseH);
    } else {
      buildChannels(spinner, tile.baseConn);
    }
  }

  if (tile.portal) g.add(buildPortal(baseH));
  if (tile.spawn) spinner.add(buildSpawnPool());
  if (tile.lift) decorateLift(g, baseH);
  if (tile.slide) decorateSlider(g, baseH);
  if (tile.rotatable) {
    const ring = buildRotateRing();
    ring.position.y = baseH + 0.06;
    g.add(ring);
    g.userData.ring = ring;
  }
  if (tile.star) {
    const star = buildStar();
    star.position.y = baseH + 0.55;
    g.add(star);
    g.userData.starMesh = star;
  }

  // Apply initial scrambled rotation to the spinner (logic already applied in rules).
  spinner.rotation.y = -(tile.rot || 0) * (Math.PI / 2);

  return g;
}

// ------------------------------------------------------------- channels
function buildChannels(parent, connMask) {
  const wm = waterMat();
  const sandM = new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 1 });

  // Sand basin under the water.
  const basin = new THREE.Mesh(
    new THREE.BoxGeometry(TILE * 0.86, 0.04, TILE * 0.86), sandM);
  basin.position.y = 0.02;
  parent.add(basin);

  // Center pool.
  const pad = new THREE.Mesh(
    new THREE.BoxGeometry(CHANNEL_W + 0.14, 0.07, CHANNEL_W + 0.14), wm);
  pad.position.y = 0.055;
  parent.add(pad);

  // One arm per open direction (built in the tile's *base* orientation).
  const arms = [
    { d: N, x: 0, z: -(TILE / 4), rx: CHANNEL_W, rz: TILE / 2 },
    { d: E, x: TILE / 4, z: 0, rx: TILE / 2, rz: CHANNEL_W },
    { d: S, x: 0, z: TILE / 4, rx: CHANNEL_W, rz: TILE / 2 },
    { d: W, x: -(TILE / 4), z: 0, rx: TILE / 2, rz: CHANNEL_W },
  ];
  for (const a of arms) {
    if (!(connMask & bit(a.d))) continue;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(a.rx, 0.07, a.rz), wm);
    arm.position.set(a.x, 0.055, a.z);
    parent.add(arm);
  }
}

function buildRamp(g, tile, baseH) {
  // A sloped water chute connecting low side (h) to high side (h+1).
  const wm = waterMat();
  const dirVec = { [N]: [0, -1], [E]: [1, 0], [S]: [0, 1], [W]: [-1, 0] }[tile.ramp];

  const slope = new THREE.Group();
  slope.position.y = baseH;
  g.add(slope);

  const steps = 5;
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) / steps;
    const seg = new THREE.Mesh(
      new THREE.BoxGeometry(
        dirVec[0] !== 0 ? TILE / steps + 0.03 : CHANNEL_W,
        0.07,
        dirVec[1] !== 0 ? TILE / steps + 0.03 : CHANNEL_W
      ),
      wm
    );
    seg.position.set(
      dirVec[0] * (t - 0.5) * TILE,
      t * LEVEL_H,
      dirVec[1] * (t - 0.5) * TILE
    );
    slope.add(seg);

    // little stair blocks under the water
    const block = new THREE.Mesh(
      new THREE.BoxGeometry(
        dirVec[0] !== 0 ? TILE / steps : 0.6,
        Math.max(0.04, t * LEVEL_H),
        dirVec[1] !== 0 ? TILE / steps : 0.6
      ),
      new THREE.MeshStandardMaterial({ color: 0xd9c9ef, roughness: 0.9 })
    );
    block.position.set(
      dirVec[0] * (t - 0.5) * TILE,
      (t * LEVEL_H) / 2 - 0.02,
      dirVec[1] * (t - 0.5) * TILE
    );
    block.castShadow = true;
    slope.add(block);
  }
}

// ------------------------------------------------------------- props
function buildPortal(baseH) {
  const grp = new THREE.Group();
  grp.position.y = baseH;

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.3, 0.055, 12, 32),
    new THREE.MeshStandardMaterial({
      color: 0xf3b8c8, emissive: PALETTE.portal, emissiveIntensity: 0.5, roughness: 0.3,
    })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.12;
  grp.add(ring);
  grp.userData.spin = ring;

  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(0.26, 24),
    new THREE.MeshBasicMaterial({
      color: PALETTE.portal, transparent: true, opacity: 0.75, side: THREE.DoubleSide,
    })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.1;
  grp.add(glow);
  grp.userData.glow = glow;

  // Tiny pagoda arch over the portal.
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(0.34, 0.3, 4),
    new THREE.MeshStandardMaterial({ color: 0xf3a8c0, roughness: 0.6 })
  );
  roof.position.y = 0.95;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  grp.add(roof);
  const pillarM = new THREE.MeshStandardMaterial({ color: 0xf7ecd8, roughness: 0.8 });
  for (const [px, pz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.78, 8), pillarM);
    p.position.set(px, 0.4, pz);
    p.castShadow = true;
    grp.add(p);
  }
  grp.userData.isPortal = true;
  return grp;
}

function buildSpawnPool() {
  const pool = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.32, 0.05, 20),
    waterMat()
  );
  pool.position.y = 0.05;
  return pool;
}

function buildRotateRing() {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.4, 0.46, 32),
    new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.5, side: THREE.DoubleSide,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  return ring;
}

function decorateLift(g, baseH) {
  // Corner bolts to hint "this platform moves vertically".
  const m = new THREE.MeshStandardMaterial({ color: 0x8fb8e8, roughness: 0.5 });
  for (const [px, pz] of [[-0.38, -0.38], [0.38, -0.38], [-0.38, 0.38], [0.38, 0.38]]) {
    const bolt = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 10), m);
    bolt.position.set(px, baseH + 0.03, pz);
    g.add(bolt);
  }
  const arrow = makeArrowSprite("↕");
  arrow.position.y = baseH + 0.5;
  g.add(arrow);
  g.userData.hintSprite = arrow;
}

function decorateSlider(g, baseH) {
  const m = new THREE.MeshStandardMaterial({ color: 0xf5a25d, roughness: 0.5 });
  for (const px of [-0.42, 0.42]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.7), m);
    rail.position.set(px, baseH * 0.35, 0);
    g.add(rail);
  }
  const arrow = makeArrowSprite("⇄");
  arrow.position.y = baseH + 0.5;
  g.add(arrow);
  g.userData.hintSprite = arrow;
}

function makeArrowSprite(char) {
  const c = document.createElement("canvas");
  c.width = c.height = 96;
  const ctx = c.getContext("2d");
  ctx.font = "700 56px 'Baloo 2', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.strokeStyle = "rgba(43,58,85,0.5)";
  ctx.lineWidth = 6;
  ctx.strokeText(char, 48, 52);
  ctx.fillText(char, 48, 52);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity: 0.85 })
  );
  sprite.scale.setScalar(0.42);
  return sprite;
}

export function buildStar() {
  const shape = new THREE.Shape();
  const spikes = 5, outer = 0.2, inner = 0.085;
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.07, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2,
  });
  const star = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      color: PALETTE.star, emissive: 0xffb830, emissiveIntensity: 0.35, roughness: 0.35,
    })
  );
  star.castShadow = true;
  return star;
}

// ------------------------------------------------------------- decor tiles
export function buildDecorGroup(t, index) {
  const g = new THREE.Group();
  const baseH = BASE_H * (0.7 + ((index * 7) % 5) * 0.08);
  const color = PALETTE.bases[(index + 2) % PALETTE.bases.length];

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, baseH, 0.9),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85 })
  );
  base.position.y = baseH / 2;
  base.castShadow = true;
  base.receiveShadow = true;
  g.add(base);

  const prop = buildProp(t.decor, index);
  prop.position.y = baseH;
  g.add(prop);
  return g;
}

function buildProp(kind, seed) {
  const g = new THREE.Group();
  const pick = (arr) => arr[seed % arr.length];

  switch (kind) {
    case "coral": {
      const m = new THREE.MeshStandardMaterial({ color: pick(PALETTE.coral), roughness: 0.7 });
      for (let i = 0; i < 4; i++) {
        const branch = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3 + (i % 3) * 0.12, 6), m);
        branch.position.set((i - 1.5) * 0.12, 0.16 + (i % 2) * 0.06, ((i * 13) % 5 - 2) * 0.05);
        branch.rotation.z = (i - 1.5) * 0.25;
        branch.castShadow = true;
        g.add(branch);
      }
      break;
    }
    case "plant": {
      const m = new THREE.MeshStandardMaterial({ color: 0x7fd8a8, roughness: 0.7 });
      for (let i = 0; i < 3; i++) {
        const leaf = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.05, 0.5 + i * 0.1, 6), m);
        leaf.position.set((i - 1) * 0.14, 0.26, (i % 2) * 0.1 - 0.05);
        leaf.rotation.z = (i - 1) * 0.3;
        leaf.castShadow = true;
        g.add(leaf);
      }
      break;
    }
    case "shell": {
      const shell = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({
          color: 0xffe3ec, emissive: 0xffc7dd, emissiveIntensity: 0.25, roughness: 0.4,
        })
      );
      shell.position.y = 0.02;
      shell.castShadow = true;
      g.add(shell);
      break;
    }
    case "arch": {
      const m = new THREE.MeshStandardMaterial({ color: pick([0xb8a7e0, 0x8fb8e8]), roughness: 0.8 });
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.55, 0.14), m);
      const r = l.clone();
      l.position.set(-0.22, 0.28, 0);
      r.position.set(0.22, 0.28, 0);
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.14, 0.18), m);
      top.position.y = 0.6;
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(0.3, 0.22, 4),
        new THREE.MeshStandardMaterial({ color: 0xf3a8c0, roughness: 0.6 })
      );
      roof.position.y = 0.78;
      roof.rotation.y = Math.PI / 4;
      for (const p of [l, r, top, roof]) { p.castShadow = true; g.add(p); }
      break;
    }
    case "tower": {
      const m = new THREE.MeshStandardMaterial({ color: pick([0xf0dfc0, 0xc9b6ea]), roughness: 0.8 });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.7, 10), m);
      body.position.y = 0.35;
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(0.28, 0.3, 10),
        new THREE.MeshStandardMaterial({ color: 0x63cdda, roughness: 0.6 })
      );
      roof.position.y = 0.85;
      body.castShadow = roof.castShadow = true;
      g.add(body, roof);
      break;
    }
    default: { // "rock"
      const m = new THREE.MeshStandardMaterial({ color: PALETTE.rock, roughness: 1 });
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18, 0), m);
      rock.position.y = 0.1;
      rock.rotation.set(seed, seed * 2, 0);
      rock.castShadow = true;
      g.add(rock);
    }
  }
  return g;
}

// ------------------------------------------------------------- fish
export function buildFish(colorHex = 0xff9f43) {
  const g = new THREE.Group();
  const bodyM = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.55 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 14), bodyM);
  body.scale.set(1.25, 0.9, 0.8);
  body.castShadow = true;
  g.add(body);

  const tail = new THREE.Mesh(
    new THREE.ConeGeometry(0.11, 0.2, 10),
    new THREE.MeshStandardMaterial({ color: 0xff8fa3, roughness: 0.55 })
  );
  tail.rotation.z = Math.PI / 2;
  tail.position.x = -0.24;
  tail.castShadow = true;
  g.add(tail);
  g.userData.tail = tail;

  const fin = new THREE.Mesh(
    new THREE.ConeGeometry(0.06, 0.12, 8),
    new THREE.MeshStandardMaterial({ color: 0xff8fa3, roughness: 0.55 })
  );
  fin.position.set(0, 0.16, 0);
  g.add(fin);

  const eyeM = new THREE.MeshBasicMaterial({ color: 0x2b3a55 });
  for (const zc of [0.11, -0.11]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.032, 8, 8), eyeM);
    eye.position.set(0.13, 0.045, zc);
    g.add(eye);
  }
  return g;
}
