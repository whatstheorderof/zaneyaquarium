// Zaney Aquarium — entry point. Wires scene, board, fish, UI and audio together.
import { createScene } from "./core/scene.js";
import { createInput } from "./core/input.js";
import { updateTweens } from "./core/tween.js";
import { Board } from "./game/board.js";
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

// ------------------------------------------------------------ bootstrap
async function boot() {
  const res = await fetch("levels/levels.json");
  const { levels } = await res.json();

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
  };

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
  });
  ui.setSoundIcon(audio.muted);

  // Unlock audio on the very first interaction anywhere.
  const unlockAudio = () => { audio.ensure(); window.removeEventListener("pointerdown", unlockAudio); };
  window.addEventListener("pointerdown", unlockAudio);

  // --------- input (tile taps) ---------
  createInput(canvas, view.camera, () => (state.screen === "game" ? board.pickables : []), (tile) => {
    if (state.screen !== "game" || state.won) return;
    if (fish.anySwimming) return; // let the fish finish their journey
    const rec = board.interact(tile);
    if (rec) {
      state.moves++;
      ui.setMoves(state.moves, state.level.par);
      advanceTutorial();
    }
  });

  // --------- screens ---------
  function showMenu() {
    state.screen = "menu";
    ui.showMenu();
  }
  function showMap() {
    state.screen = "map";
    ui.showMap(levels, progress);
  }
  function startLevel(id) {
    const level = levels.find((l) => l.id === id);
    if (!level) return;
    state.screen = "game";
    state.level = level;
    state.moves = 0;
    state.starsGot = 0;
    state.totalStars = level.tiles.filter((t) => t.star).length;
    state.won = false;
    state.tutorialStep = 0;

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
    view.update(dt);
    view.render();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  showMenu();
}

boot().catch((err) => {
  console.error("Zaney Aquarium failed to start:", err);
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;font-family:sans-serif;color:#2b3a55;text-align:center;padding:20px;";
  el.innerHTML = "<div><h2>Oops, the aquarium sprang a leak 🫧</h2><p>Please serve this folder over HTTP (see README) and reload.</p></div>";
  document.body.appendChild(el);
});
