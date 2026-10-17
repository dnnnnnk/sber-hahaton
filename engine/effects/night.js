// «Кувырок»: телефон лёг экраном вниз — приложение «засыпает» (ночное небо, звёзды, луна, падающая звезда);
// подняли — мягкий рассвет: небо розовеет, встаёт солнце с лучами, звучит утренний перелив и короткое
// приветствие. Капля сама засыпает и потягивается по тем же датчикам. Слой не принимает касаний.
// Возвращение ловим по ориентации; если её нет (десктоп, датчик уснул) — рассвет по maxNightMs.

export default {
  type: 'night',
  fullscreen: true,
  sensors: ['orientation'],

  validate(p) {
    for (const key of ['durationMs', 'maxNightMs', 'dawnMs']) {
      if (p[key] != null && !(Number.isFinite(p[key]) && p[key] >= 0)) return `${key}: нужно число ≥ 0`;
    }
    if (p.stars != null && !(Number.isInteger(p.stars) && p.stars >= 0 && p.stars <= 120)) return 'stars: целое число от 0 до 120';
    if (p.greeting != null && (typeof p.greeting !== 'string' || p.greeting.length > 40)) return 'greeting: строка до 40 символов';
    return null;
  },

  play(p, ctx) {
    const { stage } = ctx;
    const dawnMs = p.dawnMs ?? 2600;
    const maxNightMs = p.maxNightMs ?? 20000;
    const duration = p.durationMs ?? maxNightMs + dawnMs;
    if (!duration) return null;
    const reduced = ctx.reducedMotion;

    const el = document.createElement('div');
    el.className = 'prikoly-night';
    el.setAttribute('aria-hidden', 'true');
    el.style.setProperty('--rise', `${Math.round(stage.height * 0.5)}px`);
    // Равномерная раскладка R2 (без «пар», похожих на глаза в темноте).
    const stars = Array.from({ length: p.stars ?? 46 }, (_, i) => {
      const x = (0.5 + (i + 1) * 0.7548776662) % 1;
      const y = ((0.5 + (i + 1) * 0.5698402910) % 1) * 0.82;
      const size = 1.5 + (i % 3);
      return `<i class="prikoly-night__star" style="left:${(x * 100).toFixed(1)}%;top:${(y * 100).toFixed(1)}%;`
        + `width:${size}px;height:${size}px;animation-delay:${((i * 0.37) % 2).toFixed(2)}s"></i>`;
    }).join('');
    el.innerHTML = `
      <div class="prikoly-night__sky"></div>
      <div class="prikoly-night__dawn"></div>
      <div class="prikoly-night__stars">${stars}</div>
      <i class="prikoly-night__shooting"></i>
      <i class="prikoly-night__moon"></i>
      <div class="prikoly-night__sun"><i class="prikoly-night__rays"></i></div>
      <b class="prikoly-night__hello">${escape(p.greeting ?? 'Доброе утро!')}</b>`;
    if (reduced) el.classList.add('is-reduced');
    stage.root.append(el);
    requestAnimationFrame(() => el.classList.add('is-on'));

    let finished = false;
    let dawning = false;
    let voice = null;
    const timers = [];
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    const off = ctx.sensors.subscribe('orientation', o => {
      if (Math.abs(o.beta) < 60) dawn();
    });
    later(dawn, Math.max(0, Math.min(maxNightMs, duration - dawnMs)));

    function dawn() {
      if (dawning || finished) return;
      dawning = true;
      off();
      el.classList.add('is-dawn');
      voice = ctx.sound.synth('dawn');
      ctx.haptics.play('success');
      later(() => el.classList.add('is-hello'), 700);
      later(() => el.classList.add('is-fading'), Math.max(0, dawnMs - 700));
      later(finish, dawnMs);
    }

    function finish() {
      if (finished) return;
      finished = true;
      off();
      timers.forEach(clearTimeout);
      voice?.();
      el.remove();
      ctx.end();
    }

    return {
      // Сколько может длиться (ночь + рассвет): по этому сроку движок ставит страховочный таймер.
      durationMs: duration,
      // Пока ночь — повторный «вниз» ничего не меняет.
      update() {},
      stop: finish,
    };
  },
};

function escape(text) {
  return String(text).replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`);
}
