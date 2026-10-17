// Lottie-анимация в точке (якорь или центр экрана): проигрывается один раз и удаляется.
// lottie-web (vendor/lottie.min.js) грузится лениво при первом использовании; те же JSON-файлы
// без изменений играют Lottie Android/iOS. prefers-reduced-motion → пропуск.

let loading = null;

function loadLottie() {
  if (window.lottie) return Promise.resolve(window.lottie);
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('../../vendor/lottie.min.js', import.meta.url).href;
    script.onload = () => (window.lottie ? resolve(window.lottie) : reject(new Error('lottie не определился')));
    script.onerror = () => {
      loading = null;
      reject(new Error('vendor/lottie.min.js не загрузился'));
    };
    document.head.append(script);
  });
  return loading;
}

export default {
  type: 'lottie',
  fullscreen: false,

  validate(params) {
    if (typeof params.src !== 'string' || !params.src) return 'нужен src';
    if (params.anchor != null && (typeof params.anchor !== 'string' || !params.anchor)) return 'anchor должен быть непустой строкой';
    if (params.size != null && !positive(params.size)) return 'size: нужно число > 0';
    if (params.speed != null && !positive(params.speed)) return 'speed: нужно число > 0';
    if (params.durationMs != null && !nonNegative(params.durationMs)) return 'durationMs: нужно число ≥ 0';
    return null;
  },

  play(params, ctx) {
    if (!params.src) return null;
    if (ctx.reducedMotion) {
      ctx.end();
      return { stop() {} };
    }
    const rect = params.anchor ? ctx.stage.getAnchorRect(params.anchor) : null;
    if (params.anchor && !rect) return null;
    const size = params.size ?? 160;
    const cx = rect ? rect.cx : ctx.stage.width / 2;
    const cy = rect ? rect.cy : ctx.stage.height / 2;

    const box = document.createElement('div');
    box.className = 'prikoly-lottie';
    Object.assign(box.style, { width: `${size}px`, height: `${size}px`, left: `${cx - size / 2}px`, top: `${cy - size / 2}px` });
    ctx.stage.root.append(box);

    let animation = null;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      animation?.destroy();
      box.remove();
      ctx.end();
    };

    loadLottie()
      .then(lottie => {
        if (finished) return;
        animation = lottie.loadAnimation({
          container: box, renderer: 'svg', loop: false, autoplay: true, path: ctx.asset(params.src),
        });
        animation.setSpeed(params.speed ?? 1);
        animation.addEventListener('complete', finish);
        animation.addEventListener('data_failed', () => {
          console.warn(`[prikoly] Lottie ${params.src} не загрузился`);
          finish();
        });
      })
      .catch(err => {
        console.warn('[prikoly]', err);
        finish();
      });

    return { stop: finish };
  },
};

function positive(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function nonNegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
