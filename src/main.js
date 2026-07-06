// Zaney Aquarium — entry point. Wires scene, board, fish, UI and audio together.
import { createScene } from "./core/scene.js";
import { createInput } from "./core/input.js";
import { updateTweens } from "./core/tween.js";
import { Board } from "./game/board.js";
import { applyTheme, buildFish } from "./game/tileFactory.js";
import { key, reachableFrom } from "./game/rules.js";
import { FishController } from "./game/fish.js";
import { AudioEngine } from "./audio/ambient.js";
import { UI } from "./ui/ui.js";

// ------------------------------------------------------------ persistence
const SAVE_KEY = "zaney-aquarium-save-v1";
function loadProgress() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) { /* private mode etc. */ }
  return { unlocked: 0, stars: {}, muted: false };
}
function saveProgress(p) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(p)); } catch (_) {}
}

// ------------------------------------------------------------ splash diorama
// A little decorative island shown behind the main menu — pure eye candy,
// rendered by the game engine itself (water ring, portal, corals, fish).
const MENU_SCENE = {
  id: -1, name: "menu", world: 3, size: [5, 4], par: 0,
  tiles: [
    { x: 1, z: 1, conn: "ES" }, { x: 2, z: 1, conn: "EW" }, { x: 3, z: 1, conn: "SW" },
    { x: 3, z: 2, conn: "NW" }, { x: 2, z: 2, conn: "EW" }, { x: 1, z: 2, conn: "NE" },
    { x: 2, z: 0, conn: "S", portal: true },
    { x: 0, z: 0, decor: "tower" }, { x: 4, z: 0, decor: "arch" },
    { x: 0, z: 1, decor: "plant" }, { x: 4, z: 1, decor: "tower" },
    { x: 0, z: 2, decor: "coral" }, { x: 4, z: 2, decor: "plant" },
    { x: 0, z: 3, decor: "shell" }, { x: 2, z: 3, decor: "coral" },
    { x: 4, z: 3, decor: "rock" },
  ],
  fish: [],
};
const MENU_FISH = [
  { color: 0xff9f43, r: 1.12, speed: 0.55, phase: 0 },
  { color: 0xf78fb3, r: 1.18, speed: -0.42, phase: 2.2 },
  { color: 0x8ac6ff, r: 0.75, speed: 0.7, phase: 4.1 },
];

// ------------------------------------------------------------ bootstrap
async function boot() {
  const res = await fetch("levels/levels.json");
  const { levels, worlds } = await res.json();

  const canvas = document.getElementById("game-canvas");
  const view = createScene(canvas);
  const audio = new AudioEngine();
  const progress = loadProgress();
  audio.muted = !!progress.muted;

  // --------- game state ---------
  const state = {
    screen: "menu",       // menu | map | game
    level: null,
    moves: 0,
    starsGot: 0,
    totalStars: 0,
    won: false,
    tutorialStep: 0,
    powers: { coral: 1, bubble: 1, push: 1 },
    activePower: null,
  };
  let menuFish = [];

  const board = new Board(view.boardGroup, {
    onMove: () => {
      // A tile animation finished — see if any fish can now swim home.
      if (!state.won) fish.tryStart();
      ui.setUndoEnabled(board.undoStack.length > 0);
    },
    onSound: (name) => audio.play(name),
  });

  const fish = new FishController(view.boardGroup, {
    onStar: () => {
      state.starsGot++;
      ui.setStars(state.starsGot, state.totalStars);
      audio.play("star");
    },
    onHome: () => {},
    onAllHome: () => onWin(),
    onSound: (name) => audio.play(name),
  });

  const ui = new UI({
    onOpenMenu: () => showMenu(),
    onOpenMap: () => showMap(),
    onSelectLevel: (id) => startLevel(id),
    onRestart: () => { audio.play("click"); startLevel(state.level.id); },
    onUndo: () => {
      const rec = board.undo();
      if (rec) {
        state.moves = Math.max(0, state.moves - 1);
        ui.setMoves(state.moves, state.level.par);
      }
      ui.setUndoEnabled(board.undoStack.length > 0);
    },
    onHint: () => {
      audio.play("click");
      ui.toast("💡 The tide whispers… hints are coming in a future update!");
    },
    onToggleSound: () => {
      audio.ensure();
      audio.setMuted(!audio.muted);
      progress.muted = audio.muted;
      saveProgress(progress);
      ui.setSoundIcon(audio.muted);
    },
    onNextLevel: () => {
      const next = levels.find((l) => l.id === state.level.id + 1);
      if (next) startLevel(next.id);
      else showMap();
    },
    onSoundTouch: () => audio.ensure(),
    onPowerup: (name) => togglePowerup(name),
  });
  ui.setSoundIcon(audio.muted);

  // Unlock audio on the very first interaction anywhere.
  const unlockAudio = () => { audio.ensure(); window.removeEventListener("pointerdown", unlockAudio); };
  window.addEventListener("pointerdown", unlockAudio);

  // --------- input (tile / cell taps) ---------
  createInput(canvas, view.camera, () => (state.screen === "game" ? board.pickables : []), (hit) => {
    if (state.screen !== "game" || state.won) return;
    if (fish.anySwimming) return; // let the fish finish their journey

    if (state.activePower) return applyPowerup(hit);

    if (!hit.tile) return; // plain taps on empty water do nothing
    const rec = board.interact(hit.tile);
    if (rec) {
      state.moves++;
      ui.setMoves(state.moves, state.level.par);
      advanceTutorial();
    }
  });

  // --------- power-ups ---------
  function togglePowerup(name) {
    if (state.screen !== "game" || state.won) return;
    if (state.powers[name] <= 0) return;
    audio.play("click");
    if (state.activePower === name) {
      state.activePower = null;
      ui.toast("Power-up cancelled");
    } else {
      state.activePower = name;
      ui.toast({
        coral: "🪸 Coral Boost — tap an empty cell to grow a water bridge",
        bubble: "🫧 Bubble Lift — tap a tile to raise it one level",
        push: "🌊 Current Push — tap the tile your fish is on to push it forward",
      }[name], 4200);
    }
    ui.setPowerups(state.powers, state.activePower);
  }

  function applyPowerup(hit) {
    const name = state.activePower;
    let used = false;

    if (name === "coral") {
      if (hit.cell && board.addCoralBridge(hit.cell.x, hit.cell.z)) used = true;
      else ui.toast("Coral needs an empty cell to grow on");
    } else if (name === "bubble") {
      if (hit.tile && board.bubbleLift(hit.tile)) used = true;
      else ui.toast(hit.tile ? "That tile can't be lifted" : "Tap a tile to lift it");
    } else if (name === "push") {
      const f = hit.tile && fish.idleFishAt(key(hit.tile.x, hit.tile.z));
      if (!f) { ui.toast("Tap the tile a fish is resting on"); return; }
      const path = bestPushPath(f.key);
      if (!path) { ui.toast("No open water ahead of this fish"); return; }
      fish.pushAlong(f, path);
      used = true;
    }

    if (used) {
      state.powers[name]--;
      state.activePower = null;
      ui.setPowerups(state.powers, null);
    }
  }

  /** Farthest connected cell that gets the fish closest to the portal. */
  function bestPushPath(startKey) {
    const prev = reachableFrom(board.cells, startKey);
    const [px, pz] = board.portalKey.split(",").map(Number);
    const dist = (k) => {
      const [x, z] = k.split(",").map(Number);
      return Math.abs(x - px) + Math.abs(z - pz);
    };
    const depth = (k) => {
      let n = 0;
      for (let c = k; prev.get(c) !== null && prev.get(c) !== undefined; c = prev.get(c)) n++;
      return n;
    };
    let best = startKey;
    for (const k of prev.keys()) {
      if (dist(k) < dist(best) || (dist(k) === dist(best) && depth(k) > depth(best))) best = k;
    }
    if (best === startKey) return null;
    const path = [];
    for (let c = best; c !== null; c = prev.get(c)) path.unshift(c);
    return path;
  }

  // --------- screens ---------
  function showMenu() {
    state.screen = "menu";
    ui.showMenu();
    // Live splash: twilight theme + decorative island with circling fish.
    applyWorldTheme(MENU_SCENE);
    document.getElementById("app").classList.add("splash-bg");
    fish.dispose();
    board.load(MENU_SCENE);
    view.frame(MENU_SCENE.size[0], MENU_SCENE.size[1]);
    menuFish = MENU_FISH.map((cfg) => {
      const mesh = buildFish(cfg.color);
      board.group.add(mesh);
      return { mesh, ...cfg };
    });
  }
  function showMap() {
    state.screen = "map";
    ui.showMap(levels, worlds, progress);
  }
  function applyWorldTheme(level) {
    const world = worlds.find((w) => w.id === (level.world || 0)) || worlds[0];
    const t = world.theme;
    view.setTheme(t);
    applyTheme(t); // tile palette + water colour
    document.getElementById("app").style.background =
      `linear-gradient(180deg, ${t.bgTop} 0%, ${t.bgBottom} 100%)`;
  }
  function startLevel(id) {
    const level = levels.find((l) => l.id === id);
    if (!level) return;
    applyWorldTheme(level);
    document.getElementById("app").classList.remove("splash-bg");
    menuFish = [];
    state.screen = "game";
    state.level = level;
    state.moves = 0;
    state.starsGot = 0;
    state.totalStars = level.tiles.filter((t) => t.star).length;
    state.won = false;
    state.tutorialStep = 0;
    state.powers = { coral: 1, bubble: 1, push: 1 };
    state.activePower = null;
    ui.setPowerups(state.powers, null);

    board.load(level);
    fish.load(level, board);
    view.frame(level.size[0], level.size[1]);

    ui.showGame(level);
    ui.setMoves(0, level.par);
    ui.setStars(0, state.totalStars);
    ui.setUndoEnabled(false);

    if (level.steps?.length) ui.showTip(level.steps[0]);
    else ui.hideTip();
  }

  function advanceTutorial() {
    const steps = state.level?.steps;
    if (!steps) return;
    state.tutorialStep++;
    if (steps[state.tutorialStep]) ui.showTip(steps[state.tutorialStep]);
    else ui.hideTip();
  }

  function onWin() {
    if (state.won) return;
    state.won = true;
    audio.play("win");
    ui.hideTip();

    // Save progress: stars (best) + unlock next level.
    const best = progress.stars[state.level.id] || 0;
    progress.stars[state.level.id] = Math.max(best, state.starsGot);
    progress.unlocked = Math.max(progress.unlocked, state.level.id + 1);
    saveProgress(progress);

    const hasNext = levels.some((l) => l.id === state.level.id + 1);
    setTimeout(() => {
      ui.showWin({
        stars: state.starsGot,
        totalStars: state.totalStars,
        moves: state.moves,
        par: state.level.par,
        hasNext,
      });
    }, 900);
  }

  // --------- main loop ---------
  let last = performance.now();
  let menuTime = 0;
  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    updateTweens(dt);
    if (state.screen === "game" || state.screen === "menu") {
      board.update(dt);
      fish.update(dt);
    }
    if (state.screen === "menu" && menuFish.length) {
      // Fish lazily circling the splash island.
      menuTime += dt;
      for (const f of menuFish) {
        const a = menuTime * f.speed + f.phase;
        const cx = 2, cz = 1.5;
        f.mesh.position.set(
          cx + Math.cos(a) * f.r,
          0.66 + Math.sin(menuTime * 1.6 + f.phase) * 0.06,
          cz + Math.sin(a) * f.r
        );
        const dir = Math.sign(f.speed);
        f.mesh.rotation.y = Math.atan2(-Math.cos(a) * dir, -Math.sin(a) * dir);
        const tail = f.mesh.userData.tail;
        if (tail) tail.rotation.y = Math.sin(menuTime * 8 + f.phase) * 0.5;
      }
    }
    view.update(dt);
    view.render();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  showMenu();
  window.__zaneyBooted = true; // tells the boot watchdog in index.html all is well
}

boot().catch((err) => {
  console.error("Zaney Aquarium failed to start:", err);
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;font-family:sans-serif;color:#2b3a55;text-align:center;padding:20px;";
  el.innerHTML = "<div><h2>Oops, the aquarium sprang a leak 🫧</h2><p>Please serve this folder over HTTP (see README) and reload.</p></div>";
  document.body.appendChild(el);
  window.__zaneyBooted = true; // we've shown our own message; keep the watchdog quiet
});
