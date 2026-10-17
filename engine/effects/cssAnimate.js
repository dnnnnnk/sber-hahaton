// Готовая анимация самого якоря: «аватар делает сальто», «баланс подпрыгивает».
// Через Web Animations API: ничего не остаётся на элементе после окончания.
// prefers-reduced-motion → вместо движения мягкое свечение.

const ANIMATIONS = {
  flip: {
    duration: 900,
    easing: 'cubic-bezier(.3,.7,.4,1)',
    keyframes: [
      { transform: 'translateY(0) rotate(0deg) scale(1)' },
      { transform: 'translateY(-35%) rotate(-100deg) scale(1.05)', offset: 0.3 },
      { transform: 'translateY(-55%) rotate(-220deg) scale(1.08)', offset: 0.55 },
      { transform: 'translateY(-10%) rotate(-340deg) scale(1.02)', offset: 0.82 },
      { transform: 'translateY(0) rotate(-360deg) scale(1.08, 0.92)', offset: 0.9 },
      { transform: 'translateY(0) rotate(-360deg) scale(1)' },
    ],
  },
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

  play(params, ctx) {
    const el = params.anchor && ctx.stage.getAnchorElement(params.anchor);
    if (!el?.animate) return null;
    const preset = ANIMATIONS[ctx.reducedMotion ? 'glow' : params.animation] || ANIMATIONS.pop;
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
