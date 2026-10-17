// Телефон лежит неподвижно seconds секунд. Срабатывает один раз, пока его снова не возьмут в руки.
// threshold — м/с² линейного ускорения, rotationThreshold — °/с.

export default {
  type: 'still',
  sensors: ['motion'],

  create(spec, ctx, fire) {
    const ms = (spec.seconds ?? 10) * 1000;
    const threshold = spec.threshold ?? 0.25;
    const rotationThreshold = spec.rotationThreshold ?? 3;
    let since = null;
    let fired = false;

    return ctx.sensors.subscribe('motion', s => {
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
