// Тряска: несколько всплесков линейного ускорения подряд.
// threshold — м/с² (≈1.4g по умолчанию), hits — сколько всплесков за windowMs, debounceMs — пауза после срабатывания.

export default {
  type: 'shake',
  sensors: ['motion'],

  create(spec, ctx, fire) {
    const threshold = spec.threshold ?? 14;
    const hits = spec.hits ?? 3;
    const windowMs = spec.windowMs ?? 1000;
    const debounceMs = spec.debounceMs ?? 1500;
    let peaks = [];
    let quietUntil = 0;

    return ctx.sensors.subscribe('motion', s => {
      if (s.t < quietUntil || s.linear < threshold) return;
      if (peaks.length && s.t - peaks[peaks.length - 1] < 80) return; // один всплеск — одно касание порога
      peaks = peaks.filter(t => s.t - t <= windowMs);
      peaks.push(s.t);
      if (peaks.length >= hits) {
        peaks = [];
        quietUntil = s.t + debounceMs;
        fire({ strength: Math.min(1, s.linear / (threshold * 2)) });
      }
    });
  },
};
