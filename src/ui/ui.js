// DOM overlay: screens, HUD, toasts, win modal, level map.
const $ = (id) => document.getElementById(id);

export class UI {
  constructor(handlers = {}) {
    this.h = handlers;
    this._toastTimer = null;

    $("btn-play").onclick = () => { handlers.onSoundTouch?.(); handlers.onOpenMap?.(); };
    $("btn-map-back").onclick = () => handlers.onOpenMenu?.();
    $("btn-back").onclick = () => handlers.onOpenMap?.();
    $("btn-restart").onclick = () => handlers.onRestart?.();
    $("btn-undo").onclick = () => handlers.onUndo?.();
    $("btn-hint").onclick = () => handlers.onHint?.();
    $("btn-sound").onclick = () => handlers.onToggleSound?.();
    $("btn-sound-menu").onclick = () => handlers.onToggleSound?.();
    $("btn-win-next").onclick = () => handlers.onNextLevel?.();
    $("btn-win-replay").onclick = () => handlers.onRestart?.();
    $("btn-win-map").onclick = () => handlers.onOpenMap?.();
  }

  // ------------------------------------------------ screens
  showMenu() {
    this._setScreen("screen-menu");
    $("hud").classList.add("hidden");
    this.hideWin();
    this.hideTip();
  }

  showMap(levels, worlds, progress) {
    this._setScreen("screen-map");
    $("hud").classList.add("hidden");
    this.hideWin();
    this.hideTip();
    this._renderMap(levels, worlds, progress);
  }

  showGame(level) {
    this._setScreen(null);
    $("hud").classList.remove("hidden");
    $("hud-level-name").textContent =
      level.id === 0 ? level.name : `${level.id}. ${level.name}`;
    this.hideWin();
  }

  _setScreen(id) {
    for (const s of document.querySelectorAll(".screen")) s.classList.remove("visible");
    if (id) $(id).classList.add("visible");
  }

  // ------------------------------------------------ HUD
  setMoves(n, par) {
    $("hud-moves").textContent = par ? `Moves: ${n} / par ${par}` : `Moves: ${n}`;
  }
  setStars(got, total) {
    $("hud-stars").textContent = `★ ${got}/${total}`;
  }
  setUndoEnabled(on) { $("btn-undo").disabled = !on; }
  setSoundIcon(muted) {
    $("btn-sound").textContent = muted ? "🔇" : "🔊";
    $("btn-sound-menu").textContent = muted ? "🔇 Sound off" : "🔊 Sound on";
  }

  // ------------------------------------------------ toast / tutorial
  toast(msg, ms = 2600) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.add("hidden"), ms);
  }

  showTip(msg) {
    const el = $("tutorial-tip");
    el.textContent = msg;
    el.classList.remove("hidden");
  }
  hideTip() { $("tutorial-tip").classList.add("hidden"); }

  // ------------------------------------------------ win modal
  showWin({ stars, totalStars, moves, par, hasNext }) {
    const starStr =
      "★".repeat(stars) +
      (totalStars > stars ? `<span class="off">${"★".repeat(totalStars - stars)}</span>` : "");
    $("win-stars").innerHTML = starStr || "☆";
    $("win-detail").textContent =
      `${moves} move${moves === 1 ? "" : "s"}` + (par ? ` · par ${par}` : "") +
      ` · ${stars}/${totalStars} stars`;
    $("btn-win-next").style.display = hasNext ? "" : "none";
    $("win-modal").classList.remove("hidden");
  }
  hideWin() { $("win-modal").classList.add("hidden"); }

  // ------------------------------------------------ level map
  _renderMap(levels, worlds, progress) {
    const grid = $("level-grid");
    grid.innerHTML = "";
    let totalStars = 0;

    for (const world of worlds) {
      const worldLevels = levels.filter((l) => (l.world || 0) === world.id);
      if (!worldLevels.length) continue;

      const header = document.createElement("div");
      header.className = "world-title";
      header.innerHTML =
        `<span class="world-dot" style="background:${world.theme.glow}"></span>${world.name}`;
      grid.appendChild(header);

      for (const lvl of worldLevels) {
        const unlocked = lvl.id <= progress.unlocked;
        const gotStars = progress.stars[lvl.id] || 0;
        totalStars += gotStars;
        const nStars = lvl.tiles.filter((t) => t.star).length;

        const card = document.createElement("button");
        card.className =
          "level-card" + (unlocked ? "" : " locked") + (lvl.id === 0 ? " tutorial" : "");
        card.style.setProperty("--world-tint", world.theme.glow);
        card.innerHTML = `
          <div class="num">${lvl.id === 0 ? "✎" : lvl.id}</div>
          <div class="lname">${lvl.name}</div>
          <div class="stars">${
            unlocked
              ? "★".repeat(gotStars) + `<span class="off">${"★".repeat(Math.max(0, nStars - gotStars))}</span>`
              : "🔒"
          }</div>`;
        if (unlocked) card.onclick = () => this.h.onSelectLevel?.(lvl.id);
        grid.appendChild(card);
      }
    }
    $("map-total-stars").textContent = `★ ${totalStars}`;
  }
}
