// Tiny tween engine — no dependencies.
const active = new Set();

export const Ease = {
  linear: (t) => t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outElastic: (t) => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
};

/**
 * tween({ dur, ease, onUpdate(k), onDone() })
 * k goes 0 → 1 (eased).
 */
export function tween({ dur = 0.3, ease = Ease.outCubic, onUpdate, onDone }) {
  const t = { elapsed: 0, dur, ease, onUpdate, onDone, dead: false };
  active.add(t);
  return t;
}

export function killTween(t) {
  if (t) { t.dead = true; active.delete(t); }
}

export function updateTweens(dt) {
  for (const t of [...active]) {
    if (t.dead) continue;
    t.elapsed += dt;
    const k = Math.min(1, t.elapsed / t.dur);
    t.onUpdate?.(t.ease(k));
    if (k >= 1) {
      active.delete(t);
      t.onDone?.();
    }
  }
}
