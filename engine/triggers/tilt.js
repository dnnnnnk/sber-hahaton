// Непрерывный наклон: { x, y } в −1..1 относительно «обычного» положения телефона.
// Базовое положение плавно подстраивается, поэтому эффект живёт, пока телефон двигается, и гаснет в покое.
// rangeDeg — наклон до ±1, startThreshold — с какого отклонения начинаем, follow — скорость подстройки базы.

export default {
  type: 'tilt',
  sensors: ['orientation'],

  create(spec, ctx, fire) {
    const range = spec.rangeDeg ?? 20;
    const startThreshold = spec.startThreshold ?? 0.12;
    const follow = spec.follow ?? 0.02;
    let base = null;
    let last = { x: 0, y: 0 };

    return ctx.sensors.subscribe('orientation', o => {
      if (!base) {
        base = { beta: o.beta, gamma: o.gamma };
        return;
      }
      base.beta += (o.beta - base.beta) * follow;
      base.gamma += (o.gamma - base.gamma) * follow;
      const x = clamp((o.gamma - base.gamma) / range);
      const y = clamp((o.beta - base.beta) / range);
      if (Math.hypot(x, y) < startThreshold) return;
      if (Math.hypot(x - last.x, y - last.y) < 0.015) return;
      last = { x, y };
      fire({ x, y });
    });
  },
};

function clamp(v) {
  return Math.max(-1, Math.min(1, v));
}
