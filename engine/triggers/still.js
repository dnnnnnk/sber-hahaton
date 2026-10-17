// Телефон лежит неподвижно seconds секунд. Срабатывает один раз, пока его снова не возьмут в руки.
// threshold — м/с² линейного ускорения, rotationThreshold — °/с.

const GAP_MS = 1000;

export default {
  type: 'still',
  sensors: ['motion'],

  validate(spec) {
    if (spec.seconds != null && !positive(spec.seconds)) return 'seconds: нужно число > 0';
    for (const key of ['threshold', 'rotationThreshold']) {
      if (spec[key] != null && !nonNegative(spec[key])) return `${key}: нужно число ≥ 0`;
    }
    return null;
  },

  create(spec, ctx, fire) {
    const ms = (spec.seconds ?? 10) * 1000;
    const threshold = spec.threshold ?? 0.25;
    const rotationThreshold = spec.rotationThreshold ?? 3;
    let since = null;
    let last = -Infinity;
    let fired = false;

    return ctx.sensors.subscribe('motion', s => {
      if (s.empty) return;
      // Разрыв в замерах (вкладка в фоне, датчик уснул) — отсчёт тишины заново.
      if (s.t - last > GAP_MS) since = null;
      last = s.t;
      if (s.linear > threshold || s.rotation > rotationThreshold) {
        since = null;
        fired = false;
        return;
      }
      since ??= s.t;
      if (!fired && s.t - since >= ms) {
        fired = true;
        fire({ seconds: Math.round((s.t - since) / 1000) });
      }
    });
  },
};

function positive(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function nonNegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
