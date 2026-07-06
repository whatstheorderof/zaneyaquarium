// Zaney Aquarium — entry point. Wires scene, board, fish, UI and audio together.
import { createScene } from "./core/scene.js";
import { createInput } from "./core/input.js";
import { updateTweens } from "./core/tween.js";
import { Board } from "./game/board.js";
import { applyTheme } from "./game/tileFactory.js";
import { key, reachableFrom } from "./game/rules.js";
import { buildSplash } from "./core/splash.js";
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

// ------------------------------------------------------------ splash theme
// The menu is a cinematic set piece: a glowing aquarium cube in the dark
// with god rays and a school of fish (see src/core/splash.js).
const SPLASH_THEME = {
  fog: "#0a1322",
  hemiSky: "#5a6f9e",
  hemiGround: "#0e1830",
  glow: "#2e6f80",
  sun: 0.3, // dim the sun so the light shafts carry the scene
};

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
  let splash = null;

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
    // Cinematic splash: dark water, glowing aquarium cube, god rays, fish.
    view.setTheme(SPLASH_THEME);
    document.getElementById("app").classList.add("splash-bg");
    fish.dispose();
    board.dispose();
    if (!splash) splash = buildSplash(view.boardGroup);
    view.frame(5, 4);
    layoutSplash();
  }

  /** On portrait screens, slide the aquarium cube below the menu copy. */
  function layoutSplash() {
    if (!splash) return;
    const portrait = window.innerHeight > window.innerWidth;
    splash.group.position.set(portrait ? 2.4 : 0, 0, portrait ? 2.4 : 0);
    splash.group.scale.setScalar(portrait ? 0.75 : 1);
  }
  window.addEventListener("resize", () => {
    layoutSplash();
    if (state.screen === "map") ui.showMap(levels, worlds, progress);
  });
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
    if (splash) { splash.dispose(); splash = null; }
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
  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    updateTweens(dt);
    if (state.screen === "game" || state.screen === "menu") {
      board.update(dt);
      fish.update(dt);
    }
    if (state.screen === "menu" && splash) splash.update(dt);
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
