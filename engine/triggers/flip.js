// Телефон перевернули экраном вниз (держали holdMs) и вернули обратно не позже чем через maxMs.
// Эффект играет, когда экран снова виден.

export default {
  type: 'flip',
  sensors: ['orientation'],

  validate(spec) {
    for (const key of ['holdMs', 'maxMs']) {
      if (spec[key] != null && !nonNegative(spec[key])) return `${key}: нужно число ≥ 0`;
    }
    if (spec.holdMs != null && spec.maxMs != null && spec.maxMs < spec.holdMs) return 'maxMs не может быть меньше holdMs';
    return null;
  },

  create(spec, ctx, fire) {
    const holdMs = spec.holdMs ?? 300;
    const maxMs = spec.maxMs ?? 5000;
    let state = 'up';
    let since = 0;

    return ctx.sensors.subscribe('orientation', o => {
      const faceDown = Math.abs(o.beta) > 150;
      const faceUp = Math.abs(o.beta) < 60;
      if (state === 'up' && faceDown) {
        state = 'turning';
        since = o.t;
      } else if (state === 'turning') {
        if (!faceDown) state = 'up';
        else if (o.t - since >= holdMs) {
          state = 'down';
          since = o.t;
        }
      } else if (state === 'down' && faceUp) {
        state = 'up';
        if (o.t - since <= maxMs) fire({ downMs: Math.round(o.t - since) });
      }
    });
  },
};

function nonNegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
