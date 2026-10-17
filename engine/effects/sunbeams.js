// Летние «солнечные зайчики»: тёплая полоса блика пробегает по карте и карточкам (якоря, можно "task-*"),
// по экрану скачут круглые зайчики, как от зеркальца, а сверху мягко светит солнце. Всё — DOM поверх
// экрана без касаний; положение бликов перечитывается каждый кадр, поэтому прокрутка их не отрывает.

const MAX_GLINTS = 8;

export default {
  type: 'sunbeams',
  fullscreen: true,

  validate(p) {
    if (p.anchors != null && (!Array.isArray(p.anchors) || p.anchors.some(a => typeof a !== 'string' || !a))) {
      return 'anchors: массив имён якорей (можно "task-*")';
    }
    if (p.spots != null && !(Number.isInteger(p.spots) && p.spots >= 0 && p.spots <= 8)) return 'spots: целое число от 0 до 8';
    if (p.durationMs != null && !(Number.isFinite(p.durationMs) && p.durationMs >= 0)) return 'durationMs: нужно число ≥ 0';
    return null;
  },

  play(p, ctx) {
    const { stage } = ctx;
    const duration = p.durationMs ?? 4600;
    if (!duration) return null;
    const reduced = ctx.reducedMotion;
    const names = stage.resolveAnchors(p.anchors ?? ['card', 'tabbar', 'task-*', 'moneybox-*', 'feed-*'])
      .filter(name => onScreen(stage.getAnchorRect(name), stage))
      .slice(0, MAX_GLINTS);
    const spotCount = reduced ? 0 : p.spots ?? 4;

    const sun = document.createElement('div');
    sun.className = 'prikoly-sun';
    sun.setAttribute('aria-hidden', 'true');
    const glints = names.map((name, i) => {
      const el = document.createElement('div');
      el.className = 'prikoly-sun__glint';
      el.style.animationDelay = `${120 + i * 110}ms`;
      return { name, el };
    });
    const spots = Array.from({ length: spotCount }, (_, i) => {
      const el = document.createElement('i');
      el.className = 'prikoly-sun__spot';
      const size = 40 + (i % 3) * 14;
      el.style.width = el.style.height = `${size}px`;
      return {
        el, size,
        x0: (i % 2 ? 1.1 : -0.1), x1: (i % 2 ? -0.1 : 1.1),
        y: 0.18 + ((i * 0.29) % 0.64), wobble: 26 + i * 9, phase: i * 1.7, delay: i * 260,
      };
    });
    stage.root.append(sun, ...glints.map(g => g.el), ...spots.map(s => s.el));
    requestAnimationFrame(() => sun.classList.add('is-on'));

    let elapsed = 0;
    let finished = false;
    const remove = stage.addRenderer({
      count: 0,
      budget: 0,
      frame(dt) {
        elapsed += dt * 1000;
        if (elapsed >= duration) return finish(), false;
        const fade = Math.min(1, elapsed / 300, (duration - elapsed) / 500);
        sun.style.opacity = (fade * 0.9).toFixed(3);
        for (const g of glints) {
          const r = stage.getAnchorRect(g.name);
          g.el.hidden = !onScreen(r, stage);
          if (g.el.hidden) continue;
          Object.assign(g.el.style, {
            left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, borderRadius: `${r.radius}px`,
          });
        }
        for (const s of spots) {
          const t = Math.max(0, Math.min(1, (elapsed - s.delay) / (duration - s.delay - 300)));
          const ease = t * t * (3 - 2 * t);
          const x = (s.x0 + (s.x1 - s.x0) * ease) * stage.width;
          const y = s.y * stage.height + Math.sin(elapsed / 260 + s.phase) * s.wobble;
          s.el.style.transform = `translate(${(x - s.size / 2).toFixed(1)}px, ${(y - s.size / 2).toFixed(1)}px)`;
          s.el.style.opacity = (Math.min(1, t * 6, (1 - t) * 6) * fade).toFixed(3);
        }
        return true;
      },
    });

    function finish() {
      if (finished) return;
      finished = true;
      remove();
      sun.remove();
      glints.forEach(g => g.el.remove());
      spots.forEach(s => s.el.remove());
      ctx.end();
    }

    return { stop: finish };
  },
};

function onScreen(r, stage) {
  return r && r.bottom > 0 && r.top < stage.height && r.width > 0;
}
