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
    for (const b of document.querySelectorAll(".btn-power")) {
      b.onclick = () => handlers.onPowerup?.(b.dataset.power);
    }
  }

  /** Update power-up buttons: counts, active targeting, spent state. */
  setPowerups(counts, active) {
    for (const b of document.querySelectorAll(".btn-power")) {
      const name = b.dataset.power;
      const n = counts[name] ?? 0;
      b.querySelector(".power-count").textContent = n;
      b.classList.toggle("active", active === name);
      b.classList.toggle("spent", n <= 0);
      b.disabled = n <= 0;
    }
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

  // ------------------------------------------------ progression map
  _renderMap(levels, worlds, progress) {
    const grid = $("level-grid");
    grid.innerHTML = "";
    let totalStars = 0;
    // Fewer nodes per row on narrow screens so rows never overflow their card.
    const PER_ROW = window.innerWidth < 420 ? 3 : window.innerWidth < 640 ? 4 : 5;

    for (const world of worlds) {
      const worldLevels = levels.filter((l) => (l.world || 0) === world.id);
      if (!worldLevels.length) continue;

      const section = document.createElement("div");
      section.className = "world-section";
      section.innerHTML =
        `<div class="world-title"><span class="world-dot" style="background:${world.theme.glow}"></span>${world.name}</div>`;

      // Snake layout: rows of 5, alternating direction, dashed connectors.
      for (let r = 0; r * PER_ROW < worldLevels.length; r++) {
        const rowLevels = worldLevels.slice(r * PER_ROW, (r + 1) * PER_ROW);
        const row = document.createElement("div");
        row.className = "map-row" + (r % 2 === 1 ? " rev" : "");

        rowLevels.forEach((lvl, i) => {
          if (i > 0) {
            const link = document.createElement("span");
            link.className = "map-link";
            row.appendChild(link);
          }
          row.appendChild(this._mapNode(lvl, world, progress));
          totalStars += progress.stars[lvl.id] || 0;
        });

        // Vertical dashed connector down to the next row.
        if ((r + 1) * PER_ROW < worldLevels.length) {
          const v = document.createElement("div");
          v.className = "map-link-v " + (r % 2 === 0 ? "at-right" : "at-left");
          row.appendChild(v);
        }
        section.appendChild(row);
      }
      grid.appendChild(section);
    }
    $("map-total-stars").textContent = `★ ${totalStars}`;
  }

  _mapNode(lvl, world, progress) {
    const unlocked = lvl.id <= progress.unlocked;
    const isCurrent = lvl.id === progress.unlocked;
    const gotStars = progress.stars[lvl.id] || 0;
    const nStars = lvl.tiles.filter((t) => t.star).length;

    const node = document.createElement("button");
    node.className =
      "map-node" + (unlocked ? "" : " locked") + (lvl.id === 0 ? " tutorial" : "");
    node.style.setProperty("--world-tint", world.theme.glow);
    node.title = lvl.name + (unlocked ? "" : " (locked)");
    node.innerHTML = `
      ${isCurrent ? '<span class="pin">📍</span>' : ""}
      <div class="num">${lvl.id === 0 ? "✎" : lvl.id}</div>
      <div class="stars">${
        unlocked
          ? "★".repeat(gotStars) + `<span class="off">${"★".repeat(Math.max(0, nStars - gotStars))}</span>`
          : "🔒"
      }</div>`;
    if (unlocked) node.onclick = () => this.h.onSelectLevel?.(lvl.id);
    return node;
  }
}
