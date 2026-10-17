// Голографический блик поверх якоря (по умолчанию — карта): радужный градиент и блик едут за наклоном,
// плавно гаснут, когда телефон замер (нет обновлений idleMs). Непрерывный эффект: принимает update({ x, y }).

export default {
  type: 'holo',
  fullscreen: false,

  validate(params) {
    if (params.anchor != null && (typeof params.anchor !== 'string' || !params.anchor)) return 'anchor должен быть непустой строкой';
    if (params.intensity != null && !(finite(params.intensity) && params.intensity >= 0 && params.intensity <= 1)) {
      return 'intensity: нужно число от 0 до 1';
    }
    for (const key of ['idleMs', 'durationMs']) {
      if (params[key] != null && !(finite(params[key]) && params[key] >= 0)) return `${key}: нужно число ≥ 0`;
    }
    return null;
  },

  play(params, ctx) {
    const anchor = params.anchor || 'card';
    if (!ctx.stage.getAnchorRect(anchor)) return null;
    const idleMs = params.idleMs ?? 900;
    const durationMs = params.durationMs ?? 20000;
    const intensity = Math.min(1, params.intensity ?? 0.9) * (ctx.reducedMotion ? 0.5 : 1);
    const follow = ctx.reducedMotion ? 0 : 1;

    const el = document.createElement('div');
    el.className = 'prikoly-holo';
    el.innerHTML = '<div class="prikoly-holo__rainbow"></div><div class="prikoly-holo__shine"></div>';
    const [rainbow, shine] = el.children;
    ctx.stage.root.append(el);

    const started = performance.now();
    let lastUpdate = started;
    let target = { x: ctx.payload.x ?? 0, y: ctx.payload.y ?? 0 };
    const pos = { ...target };
    let opacity = 0;
    let finished = false;

    const remove = ctx.stage.addRenderer({
      frame(dt, now) {
        const r = ctx.stage.getAnchorRect(anchor);
        if (!r) return finish(), false;
        Object.assign(el.style, {
          left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`,
          borderRadius: `${r.radius}px`,
        });
        const k = Math.min(1, dt * 8) * follow;
        pos.x += (target.x - pos.x) * k;
        pos.y += (target.y - pos.y) * k;
        const idle = now - lastUpdate > idleMs || now - started > durationMs;
        opacity += ((idle ? 0 : intensity) - opacity) * Math.min(1, dt * (idle ? 3 : 10));
        el.style.opacity = opacity.toFixed(3);
        rainbow.style.backgroundPosition = `${50 + pos.x * 50}% ${50 + pos.y * 50}%`;
        shine.style.background = `radial-gradient(circle at ${50 + pos.x * 45}% ${50 + pos.y * 45}%, `
          + 'rgba(255,255,255,0.75), rgba(255,255,255,0) 45%)';
        if (idle && opacity < 0.02) return finish(), false;
        return true;
      },
    });

    function finish() {
      if (finished) return;
      finished = true;
      remove();
      el.remove();
      ctx.end();
    }

    return {
      update({ x = 0, y = 0 }) {
        target = { x, y };
        lastUpdate = performance.now();
      },
      stop: finish,
    };
  },
};

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}
