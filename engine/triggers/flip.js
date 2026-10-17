// Телефон перевернули экраном вниз (держали holdMs) и вернули обратно не позже чем через maxMs.
// Эффект играет, когда экран снова виден.

export default {
  type: 'flip',
  sensors: ['orientation'],

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
