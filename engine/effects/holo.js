// Голографическая «фольга» поверх якоря (по умолчанию — карта): деликатный радужный перелив, бегущая полоса
// блика, мягкий блик и мелкие искры. Сила и сдвиг — от угла наклона: заметно уже при ±10°, но текст и картинка
// под фольгой остаются читаемыми при любом наклоне. Когда телефон замер (нет обновлений idleMs), фольга гаснет.
// Непрерывный эффект: принимает update({ x, y }) от tilt.
// Все слои — в одном контейнере внутри якоря (stage.attachToAnchor): он прокручивается вместе с картой,
// повторяет её скругление (border-radius: inherit от якоря) и обрезает всё по ней (overflow: hidden).
// Каждый слой — отдельный элемент со своим mix-blend-mode, чтобы смешиваться с картой под ним.

const SPARKS = 14;
const CHIME_GAP_MS = 6000;
let lastChime = -Infinity; // перелив не чаще раза в 6 с, даже если фольга гаснет и загорается снова

export default {
  type: 'holo',
  fullscreen: false,

  validate(params) {
    if (params.anchor != null && (typeof params.anchor !== 'string' || !params.anchor)) return 'anchor должен быть непустой строкой';
    if (params.intensity != null && !(finite(params.intensity) && params.intensity >= 0 && params.intensity <= 1)) {
      return 'intensity: нужно число от 0 до 1';
    }
    for (const key of ['idleMs', 'durationMs']) {
      if (params[key] != null && !(finite(params[key]) && params[key] >= 0)) return `${key}: нужно число ≥ 0`;
    }
    if (params.sparkles != null && !(Number.isInteger(params.sparkles) && params.sparkles >= 0 && params.sparkles <= 40)) {
      return 'sparkles: целое число от 0 до 40';
    }
    if (params.fullAt != null && !(finite(params.fullAt) && params.fullAt > 0 && params.fullAt <= 1)) return 'fullAt: число от 0 до 1';
    if (params.chime != null && typeof params.chime !== 'boolean') return 'chime: true или false';
    return null;
  },

  play(params, ctx) {
    const anchor = params.anchor || 'card';
    if (!ctx.stage.getAnchorRect(anchor)) return null;
    const idleMs = params.idleMs ?? 900;
    const durationMs = params.durationMs ?? 20000;
    const intensity = Math.min(1, params.intensity ?? 0.45) * (ctx.reducedMotion ? 0.5 : 1);
    const follow = ctx.reducedMotion ? 0.15 : 1;
    // Доля полного отклонения tilt, при которой фольга горит в полную силу (0.45 от ±20° ≈ 9°).
    const fullAt = params.fullAt ?? 0.45;
    const sparkCount = ctx.reducedMotion ? 0 : params.sparkles ?? SPARKS;

    // Контейнер без opacity и z-index: не изолирует смешивание слоёв с картой.
    const holder = document.createElement('div');
    holder.className = 'prikoly-holo';
    holder.setAttribute('aria-hidden', 'true');
    const layers = ['foil', 'stripe', 'glare', 'sparks'].map(name => {
      const el = document.createElement('div');
      el.className = `prikoly-holo__layer prikoly-holo--${name}`;
      holder.append(el);
      return el;
    });
    if (!ctx.stage.attachToAnchor(anchor, holder)) return null;
    const [foil, stripe, glare, sparksEl] = layers;
    const sparks = Array.from({ length: sparkCount }, (_, i) => {
      const s = document.createElement('i');
      const u = (i * 0.618 + 0.13) % 1;
      const v = ((i * 0.37 + 0.21) % 0.8) + 0.1;
      s.style.left = `${(u * 92 + 4).toFixed(1)}%`;
      s.style.top = `${(v * 100).toFixed(1)}%`;
      s.style.setProperty('--s', `${(6 + (i % 4) * 2.5).toFixed(1)}px`);
      sparksEl.append(s);
      return { el: s, phase: u * 7.1 + v * 4.3 };
    });

    const started = performance.now();
    let lastUpdate = started;
    let target = { x: ctx.payload.x ?? 0, y: ctx.payload.y ?? 0 };
    const pos = { ...target };
    let activity = 0;
    let glinted = false;
    let finished = false;
    let voice = null;

    const remove = ctx.stage.addRenderer({
      frame(dt, now) {
        if (!ctx.stage.attachToAnchor(anchor, holder)) return finish(), false;
        const k = Math.min(1, dt * 9) * follow;
        pos.x += (target.x - pos.x) * k;
        pos.y += (target.y - pos.y) * k;
        const idle = now - lastUpdate > idleMs || now - started > durationMs;
        activity += ((idle ? 0 : 1) - activity) * Math.min(1, dt * (idle ? 2.2 : 9));
        // Сила — от угла: даже лёгкий наклон заметен, полный перелив — к fullAt.
        const power = Math.min(1, 0.3 + Math.hypot(pos.x, pos.y) / fullAt * 0.7);
        const a = activity * intensity;
        foil.style.opacity = (a * (0.45 + 0.5 * power)).toFixed(3);
        // Плитка фольги 220 %: сдвиг в пределах 0..100 % всегда накрывает слой целиком — без шва на краю плитки.
        foil.style.backgroundPosition = `${clamp(50 + pos.x * 50)}% ${clamp(50 + pos.y * 50)}%`;
        stripe.style.opacity = (a * Math.min(1, 0.25 + power)).toFixed(3);
        stripe.style.backgroundPosition = `${(50 - pos.x * 130 - pos.y * 40).toFixed(1)}% 0%`;
        glare.style.opacity = (a * 0.85).toFixed(3);
        glare.style.background = `radial-gradient(circle at ${(50 + pos.x * 55).toFixed(1)}% ${(45 + pos.y * 55).toFixed(1)}%, `
          + 'rgba(255,255,255,.7), rgba(255,255,255,0) 42%)';
        sparksEl.style.opacity = a.toFixed(3);
        for (const s of sparks) {
          const flash = Math.max(0, Math.cos(s.phase - pos.x * 6 - pos.y * 4));
          s.el.style.opacity = (flash ** 8 * power).toFixed(3);
        }
        // Первый «пойманный блик» — тихий перелив.
        if (!glinted && a > 0.5 && Math.hypot(pos.x, pos.y) > fullAt * 0.8) {
          glinted = true;
          if (params.chime !== false && now - lastChime > CHIME_GAP_MS) {
            lastChime = now;
            voice = ctx.sound.synth('shimmer');
          }
        }
        if (idle && activity < 0.02) return finish(), false;
        return true;
      },
    });

    function finish() {
      if (finished) return;
      finished = true;
      remove();
      voice?.();
      holder.remove();
      ctx.end();
    }

    return {
      update({ x = 0, y = 0 }) {
        target = { x, y };
        lastUpdate = performance.now();
      },
      stop: finish,
    };
  },
};

function clamp(value) {
  return Math.max(0, Math.min(100, value)).toFixed(1);
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}
