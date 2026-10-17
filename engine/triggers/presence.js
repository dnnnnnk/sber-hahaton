// «Присутствие»: срабатывает при открытии каждого зелёного экрана (и сразу после сборки триггеров, если
// зелёный экран уже открыт — например, после сохранения в CMS). Нужен постоянным жильцам вроде Капли:
// эффект с update() получает новый экран и переезжает на него, а не запускается заново.

export default {
  type: 'presence',
  sensors: [],

  validate() {
    return null;
  },

  create(spec, ctx, fire) {
    let alive = true;
    const current = ctx.screen?.();
    if (current?.id && current.zone !== 'red') queueMicrotask(() => alive && fire({ screen: current.id }));
    const off = ctx.bus.on('screen:open', ({ screen, zone }) => {
      if (zone !== 'red') fire({ screen });
    });
    return () => {
      alive = false;
      off();
    };
  },
};
