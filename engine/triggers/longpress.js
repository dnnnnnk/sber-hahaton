// Долгое нажатие на якорь (ms), палец не уехал дальше 12 px. Клик, который придёт следом, гасится.

export default {
  type: 'longpress',
  sensors: ['pointer'],

  validate(spec) {
    return typeof spec.anchor === 'string' && spec.anchor ? null : 'нужен anchor';
  },

  create(spec, ctx, fire) {
    const ms = spec.ms ?? 600;
    let timer = 0;
    let start = null;

    function cancel() {
      clearTimeout(timer);
      timer = 0;
      start = null;
    }

    const off = ctx.sensors.subscribe('pointer', e => {
      if (e.type === 'pointerdown') {
        cancel();
        if (!ctx.stage.hitAnchor(spec.anchor, e.x, e.y)) return;
        start = e;
        timer = setTimeout(() => {
          cancel();
          ctx.sensors.suppressNextClick();
          fire({ anchor: spec.anchor });
        }, ms);
      } else if (e.type === 'pointermove') {
        if (start && Math.hypot(e.x - start.x, e.y - start.y) > 12) cancel();
      } else {
        cancel();
      }
    });

    return () => {
      cancel();
      off();
    };
  },
};
