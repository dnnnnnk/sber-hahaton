// Несколько быстрых тапов по якорю: count тапов, между тапами не больше withinMs.
// Касания слушаем на уровне документа и проверяем попадание в прямоугольник якоря — вёрстку оболочки не трогаем.

export default {
  type: 'multitap',
  sensors: ['pointer'],

  validate(spec) {
    if (typeof spec.anchor !== 'string' || !spec.anchor) return 'нужен anchor';
    if (spec.count != null && !(Number.isInteger(spec.count) && spec.count > 0)) return 'count: нужно целое число > 0';
    if (spec.withinMs != null && !nonNegative(spec.withinMs)) return 'withinMs: нужно число ≥ 0';
    return null;
  },

  create(spec, ctx, fire) {
    const count = spec.count ?? 3;
    const withinMs = spec.withinMs ?? 450;
    let taps = 0;
    let lastTap = -Infinity;
    let down = null;

    return ctx.sensors.subscribe('pointer', e => {
      if (e.type === 'pointerdown') {
        down = ctx.stage.hitAnchor(spec.anchor, e.x, e.y) ? e : null;
      } else if (e.type === 'pointercancel') {
        down = null;
      } else if (e.type === 'pointerup' && down) {
        const isTap = e.t - down.t < 350 && Math.hypot(e.x - down.x, e.y - down.y) < 15;
        down = null;
        if (!isTap) {
          taps = 0;
          return;
        }
        taps = e.t - lastTap <= withinMs ? taps + 1 : 1;
        lastTap = e.t;
        if (taps >= count) {
          taps = 0;
          fire({ anchor: spec.anchor, taps: count });
        }
      }
    });
  },
};

function nonNegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
