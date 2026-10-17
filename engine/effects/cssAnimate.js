// Готовая анимация самого якоря: «аватар делает сальто», «баланс подпрыгивает».
// Через Web Animations API: ничего не остаётся на элементе после окончания.
// prefers-reduced-motion → вместо движения мягкое свечение.

// Сальто: высота прыжка ограничена местом над якорем, чтобы аватар не вылетал за верх экрана;
// «к зрителю» его выносит увеличение.
function flipPreset(hop) {
  return {
    duration: 900,
    easing: 'cubic-bezier(.3,.7,.4,1)',
    keyframes: [
      { transform: 'translateY(0) rotate(0deg) scale(1)' },
      { transform: 'translateY(4px) rotate(0deg) scale(1.08, 0.9)', offset: 0.12 },
      { transform: `translateY(${-hop * 0.7}px) rotate(-110deg) scale(1.1)`, offset: 0.35 },
      { transform: `translateY(${-hop}px) rotate(-220deg) scale(1.16)`, offset: 0.55 },
      { transform: `translateY(${-hop * 0.25}px) rotate(-340deg) scale(1.02)`, offset: 0.82 },
      { transform: 'translateY(0) rotate(-360deg) scale(1.08, 0.92)', offset: 0.9 },
      { transform: 'translateY(0) rotate(-360deg) scale(1)' },
    ],
  };
}

const ANIMATIONS = {
  flip: flipPreset(24),
  jump: {
    duration: 800,
    easing: 'ease-out',
    keyframes: [
      { transform: 'translateY(0) scale(1)' },
      { transform: 'translateY(-30%) scale(1.06)', offset: 0.3 },
      { transform: 'translateY(0) scale(1.06, 0.94)', offset: 0.5 },
      { transform: 'translateY(-12%) scale(1)', offset: 0.7 },
      { transform: 'translateY(0) scale(1)' },
    ],
  },
  wiggle: {
    duration: 700,
    easing: 'ease-in-out',
    keyframes: [0, -10, 9, -7, 5, -2, 0].map(deg => ({ transform: `rotate(${deg}deg)` })),
  },
  pop: {
    duration: 600,
    easing: 'ease-out',
    keyframes: [
      { transform: 'scale(1)' },
      { transform: 'scale(1.25)', offset: 0.35 },
      { transform: 'scale(0.95)', offset: 0.7 },
      { transform: 'scale(1)' },
    ],
  },
  glow: {
    duration: 900,
    easing: 'ease-in-out',
    keyframes: [
      { filter: 'brightness(1)' },
      { filter: 'brightness(1.3) drop-shadow(0 0 10px rgba(255, 201, 60, 0.9))' },
      { filter: 'brightness(1)' },
    ],
  },
};

export default {
  type: 'cssAnimate',
  fullscreen: false,

  validate(params) {
    if (typeof params.anchor !== 'string' || !params.anchor) return 'нужен anchor';
    if (params.animation != null && !ANIMATIONS[params.animation]) return `неизвестная animation "${params.animation}"`;
    if (params.durationMs != null && !nonNegative(params.durationMs)) return 'durationMs: нужно число ≥ 0';
    if (params.repeat != null && !(Number.isInteger(params.repeat) && params.repeat > 0)) return 'repeat: нужно целое число > 0';
    return null;
  },

  play(params, ctx) {
    const el = params.anchor && ctx.stage.getAnchorElement(params.anchor);
    if (!el?.animate) return null;
    let preset = ANIMATIONS[ctx.reducedMotion ? 'glow' : params.animation] || ANIMATIONS.pop;
    if (preset === ANIMATIONS.flip) {
      const r = ctx.stage.getAnchorRect(params.anchor);
      preset = flipPreset(Math.max(0, Math.min(r.height * 0.55, r.top - 6)));
    }
    const zIndex = el.style.zIndex;
    el.style.zIndex = '5';
    const animation = el.animate(preset.keyframes, {
      duration: params.durationMs ?? preset.duration,
      easing: preset.easing,
      iterations: params.repeat ?? 1,
    });
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      animation.cancel();
      el.style.zIndex = zIndex;
      ctx.end();
    };
    animation.onfinish = finish;
    return { stop: finish };
  },
};

function nonNegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
