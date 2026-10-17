// Универсальный canvas-рендерер частиц: снег, листья, лепестки, пузыри, цифры, конфетти, искорки,
// а в режиме mode: "trail" — следы (лапки) цепочкой по траектории. Параметры — docs/CONFIG.md.

const PRESETS = {
  top: { direction: 90, spread: 20, speed: [30, 70], gravity: 60, drag: 0.8 },
  bottom: { direction: -90, spread: 20, speed: [60, 140], gravity: -45, drag: 0.5 },
  center: { direction: -90, spread: 360, speed: [220, 440], gravity: 520, drag: 1.6 },
  anchor: { direction: -90, spread: 360, speed: [160, 320], gravity: 420, drag: 1.6 },
};

const DEFAULTS = {
  mode: 'normal',
  count: 40,
  spawn: 'top',
  anchor: null,
  emoji: null,
  images: null,
  shapes: null,
  colors: ['#21A038', '#FFC93C', '#4DA3FF', '#FF7A59', '#B57BFF'],
  size: [18, 30],
  wind: 0,
  sway: 0,
  rotation: 0,
  flutter: false,
  fade: true,
  lifeMs: [2500, 4000],
  emitMs: 0,
  durationMs: 4000,
  settleOn: null,
  settleChance: 0.5,
  settleMs: 2000,
  stepMs: 160,
};

const FADE_OUT_MS = 400;
const MELT_MS = 700;
const MODES = ['normal', 'trail'];
const SPAWNS = ['top', 'bottom', 'center', 'anchor'];
const SHAPES = ['circle', 'rect', 'star', 'spark', 'bubble', 'snow', 'petal'];
const sprites = new Map();
const images = new Map();

export default {
  type: 'particles',
  fullscreen: true,

  validate(params) {
    if (params.mode != null && !MODES.includes(params.mode)) return `mode: одно из ${MODES.join(', ')}`;
    if (params.spawn != null && !SPAWNS.includes(params.spawn)) return `spawn: одно из ${SPAWNS.join(', ')}`;
    if (params.spawn === 'anchor' && (typeof params.anchor !== 'string' || !params.anchor)) return 'для spawn: anchor нужен anchor';
    if (params.count != null && !(Number.isInteger(params.count) && params.count >= 0 && params.count <= 500)) {
      return 'count: нужно целое число от 0 до 500';
    }
    for (const key of ['emitMs', 'durationMs', 'settleMs', 'stepMs', 'drag', 'sway', 'rotation']) {
      if (params[key] != null && !nonNegative(params[key])) return `${key}: нужно число ≥ 0`;
    }
    for (const key of ['direction', 'spread', 'gravity', 'wind']) {
      if (params[key] != null && !finite(params[key])) return `${key}: нужно конечное число`;
    }
    for (const key of ['size', 'speed']) {
      if (params[key] != null && !numberOrRange(params[key], false)) return `${key}: нужно число > 0 или диапазон [min, max]`;
    }
    if (params.lifeMs != null && !numberOrRange(params.lifeMs, true)) return 'lifeMs: нужно число ≥ 0 или диапазон [min, max]';
    if (params.settleChance != null && !(finite(params.settleChance) && params.settleChance >= 0 && params.settleChance <= 1)) {
      return 'settleChance: нужно число от 0 до 1';
    }
    if (params.settleOn != null && !stringArray(params.settleOn)) return 'settleOn: нужен массив непустых строк';
    for (const key of ['emoji', 'images', 'colors']) {
      if (params[key] != null && !stringArray(params[key])) return `${key}: нужен непустой массив строк`;
    }
    if (params.shapes != null && (!stringArray(params.shapes) || params.shapes.some(shape => !SHAPES.includes(shape)))) {
      return `shapes: допустимы ${SHAPES.join(', ')}`;
    }
    for (const key of ['flutter', 'fade']) {
      if (params[key] != null && typeof params[key] !== 'boolean') return `${key}: нужно true или false`;
    }
    return null;
  },

  play(input, ctx) {
    const p = { ...DEFAULTS, ...PRESETS[input.spawn] || PRESETS.top, ...input };
    const { stage } = ctx;
    const budget = Math.min(Math.floor(p.count), stage.availableParticles(ctx.settings.maxParticles));
    const total = ctx.reducedMotion ? Math.ceil(budget * 0.35) : budget;
    if (total === 0 || p.durationMs === 0) {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        ctx.end();
      };
      queueMicrotask(finish);
      return { stop: finish };
    }
    const pool = buildPool(p, ctx);
    const system = p.mode === 'trail' ? createTrail(p, total, pool, stage) : createFlow(p, total, pool, stage, ctx);

    let elapsed = 0;
    let finished = false;
    const renderer = {
      budget: total,
      count: 0,
      frame(dt, now, g) {
        elapsed += dt * 1000;
        const alive = system.step(dt, elapsed, g, stage.dpr);
        renderer.count = system.count();
        if (elapsed >= p.durationMs) system.expire(elapsed);
        if (!alive && !finished) {
          finished = true;
          ctx.end();
        }
        return alive;
      },
    };
    const remove = stage.addRenderer(renderer);

    return {
      // Мягкое завершение: новые частицы не рождаются, живые гаснут за FADE_OUT_MS и освобождают бюджет.
      fade() {
        system.expire(elapsed);
        delete renderer.budget;
      },
      stop() {
        remove();
        if (!finished) {
          finished = true;
          ctx.end();
        }
      },
    };
  },
};

// ——— Поток частиц: падают сверху, всплывают снизу, разлетаются из центра или якоря ———

function createFlow(p, total, pool, stage, ctx) {
  const particles = [];
  const settleRoll = Array.isArray(p.settleOn) && p.settleOn.length ? p.settleChance : 0;
  const rotation = ctx.reducedMotion ? 0 : p.rotation;
  const sway = ctx.reducedMotion ? 0 : p.sway;
  let spawned = 0;
  let expired = false;

  function spawn(now) {
    const W = stage.width;
    const H = stage.height;
    const size = rand(p.size);
    let x;
    let y;
    if (p.spawn === 'bottom') {
      x = Math.random() * W;
      y = H + size;
    } else if (p.spawn === 'center' || p.spawn === 'anchor') {
      const rect = p.spawn === 'anchor' && p.anchor ? stage.getAnchorRect(p.anchor) : null;
      x = rect ? rect.cx + (Math.random() - 0.5) * rect.width * 0.6 : W / 2 + (Math.random() - 0.5) * 20;
      y = rect ? rect.cy + (Math.random() - 0.5) * rect.height * 0.4 : H / 2 + (Math.random() - 0.5) * 20;
    } else {
      x = Math.random() * W;
      y = -size;
    }
    const angle = toRad(p.direction + (Math.random() - 0.5) * p.spread);
    const speed = rand(p.speed);
    particles.push({
      x, y, prevY: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size,
      look: pick(pool),
      color: pick(p.colors),
      rot: Math.random() * Math.PI * 2 * (rotation ? 1 : 0),
      spin: toRad((Math.random() * 2 - 1) * rotation),
      flip: p.flutter ? Math.random() * Math.PI : 0,
      flipSpeed: p.flutter ? rand([3, 7]) : 0,
      phase: Math.random() * Math.PI * 2,
      swayFreq: rand([1.2, 2.4]),
      born: now,
      life: rand(p.lifeMs),
      canSettle: Math.random() < settleRoll,
      settled: null,
    });
  }

  return {
    count: () => particles.length,
    expire(now) {
      if (expired) return;
      expired = true;
      spawned = total;
      for (const q of particles) q.life = Math.min(q.life, now - q.born + FADE_OUT_MS);
    },
    step(dt, now, g, dpr) {
      const want = p.emitMs > 0 ? Math.floor(total * Math.min(1, now / p.emitMs)) : total;
      while (spawned < want) {
        spawn(now);
        spawned++;
      }

      const W = stage.width;
      const H = stage.height;
      const rects = settleRoll ? p.settleOn.map(name => [name, stage.getAnchorRect(name)]) : [];

      for (let i = particles.length - 1; i >= 0; i--) {
        const q = particles[i];
        const age = now - q.born;
        let x;
        let y;
        let alpha = 1;
        let scale = 1;

        if (q.settled) {
          const rect = rects.find(([name]) => name === q.settled.anchor)?.[1];
          if (!rect) q.life = Math.min(q.life, age + 250);
          else {
            q.x = rect.left + q.settled.dx;
            q.y = rect.top + q.settled.dy;
          }
          x = q.x;
          y = q.y;
          const melt = age - q.settled.at - p.settleMs;
          if (melt > 0) {
            alpha = Math.max(0, 1 - melt / MELT_MS);
            scale = 0.6 + 0.4 * alpha;
          }
        } else {
          q.prevY = q.y;
          q.x += (q.vx + p.wind) * dt;
          q.vx -= q.vx * p.drag * dt;
          q.vy += (p.gravity - q.vy * p.drag) * dt;
          q.y += q.vy * dt;
          q.rot += q.spin * dt;
          q.flip += q.flipSpeed * dt;
          x = q.x + Math.sin((age / 1000) * q.swayFreq + q.phase) * sway;
          y = q.y;
          if (q.canSettle && q.vy > 0) trySettle(q, x, rects, age, H);
        }

        const offscreen = y > H + 60 || y < -80 || x < -80 || x > W + 80;
        if (age >= q.life || (offscreen && !q.settled && age > 300)) {
          particles.splice(i, 1);
          continue;
        }
        if (p.fade && !q.settled) alpha = Math.min(alpha, (q.life - age) / (q.life * 0.3));
        if (q.settled && age > q.life - FADE_OUT_MS) alpha = Math.min(alpha, (q.life - age) / FADE_OUT_MS);
        draw(g, dpr, q, x, y, alpha, scale);
      }
      return particles.length > 0 || spawned < total;
    },
  };

  function trySettle(q, x, rects, age, H) {
    const foot = q.size * 0.3;
    for (const [anchor, rect] of rects) {
      if (!rect || rect.top < 0 || rect.top > H) continue;
      if (x < rect.left + 6 || x > rect.right - 6) continue;
      if (q.prevY + foot < rect.top && q.y + foot >= rect.top) {
        q.settled = { anchor, dx: x - rect.left, dy: -foot, at: age };
        q.x = x;
        q.y = rect.top - foot;
        q.life = age + p.settleMs + MELT_MS;
        return;
      }
    }
  }
}

// ——— Следы: частицы появляются цепочкой по плавной кривой через экран ———

function createTrail(p, total, pool, stage) {
  const W = stage.width;
  const H = stage.height;
  const rect = p.spawn === 'anchor' && p.anchor ? stage.getAnchorRect(p.anchor) : null;
  // От якоря — к дальнему боковому краю, иначе — через весь экран снизу вверх.
  const right = Math.random() < 0.5;
  const from = rect
    ? { x: right ? rect.left + rect.height / 2 : rect.right - rect.height / 2, y: rect.cy }
    : { x: right ? -20 : W + 20, y: H * rand([0.6, 0.85]) };
  const to = rect
    ? { x: right ? W + 30 : -30, y: Math.min(H * 0.95, Math.max(H * 0.05, from.y + H * rand([-0.35, 0.1]))) }
    : { x: right ? W + 30 : -30, y: H * rand([0.1, 0.35]) };
  const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  const bend = (Math.random() - 0.5) * 0.5 * len;
  const via = {
    x: (from.x + to.x) / 2 - ((to.y - from.y) / len) * bend,
    y: (from.y + to.y) / 2 + ((to.x - from.x) / len) * bend,
  };
  const steps = Math.max(2, total);
  const lifeMs = rand(p.lifeMs);
  const stepMs = Math.min(p.stepMs, Math.max(30, (p.durationMs - lifeMs) / (steps - 1)));
  const size = rand(p.size);
  const look = pick(pool);
  const color = pick(p.colors);
  const prints = [];
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) / steps;
    const pt = bezier(from, via, to, t);
    const ahead = bezier(from, via, to, Math.min(1, t + 0.01));
    const angle = Math.atan2(ahead.y - pt.y, ahead.x - pt.x);
    const side = i % 2 ? 1 : -1;
    const offset = size * 0.45 * side;
    prints.push({
      x: pt.x - Math.sin(angle) * offset,
      y: pt.y + Math.cos(angle) * offset,
      rot: angle + Math.PI / 2,
      born: i * stepMs,
    });
  }
  let alive = prints.length;
  let expiredAt = Infinity;

  return {
    count: () => alive,
    expire(now) {
      expiredAt = Math.min(expiredAt, now);
    },
    step(dt, now, g, dpr) {
      alive = 0;
      for (const q of prints) {
        const age = now - q.born;
        if (age < 0 || age > lifeMs || now - expiredAt > FADE_OUT_MS) continue;
        if (q.born > expiredAt) continue;
        alive++;
        const grow = Math.min(1, age / 140);
        let alpha = Math.min(1, (lifeMs - age) / (lifeMs * 0.35));
        if (now > expiredAt) alpha = Math.min(alpha, 1 - (now - expiredAt) / FADE_OUT_MS);
        draw(g, dpr, { size, look, color, rot: q.rot, flip: 0 }, q.x, q.y, alpha, 0.5 + 0.5 * grow);
      }
      const pending = prints.some(q => q.born > now && q.born <= expiredAt);
      return alive > 0 || pending;
    },
  };
}

// ——— Отрисовка ———

function draw(g, dpr, q, x, y, alpha, scale) {
  if (alpha <= 0) return;
  const look = q.look;
  const sprite = look.kind === 'image' ? look.img : getSprite(look, q.color, q.size, dpr);
  if (!sprite || (look.kind === 'image' && !look.img.complete)) return;
  const s = q.size * scale;
  const w = look.kind === 'image' ? s : s * SPRITE_PAD;
  const h = look.kind === 'image' ? s * (sprite.naturalHeight / sprite.naturalWidth || 1) : s * SPRITE_PAD;
  const cos = Math.cos(q.rot);
  const sin = Math.sin(q.rot);
  const sy = q.flip ? Math.cos(q.flip) : 1;
  g.globalAlpha = Math.min(1, alpha);
  g.setTransform(cos * dpr, sin * dpr, -sin * sy * dpr, cos * sy * dpr, x * dpr, y * dpr);
  g.drawImage(sprite, -w / 2, -h / 2, w, h);
}

const SPRITE_PAD = 1.3;

function getSprite(look, color, size, dpr) {
  const px = Math.max(4, Math.round(size * dpr / 2) * 2);
  const key = `${look.kind}|${look.value}|${color}|${px}`;
  let sprite = sprites.get(key);
  if (sprite) return sprite;
  if (sprites.size > 300) sprites.clear();
  sprite = document.createElement('canvas');
  sprite.width = sprite.height = Math.ceil(px * SPRITE_PAD);
  const g = sprite.getContext('2d');
  g.translate(sprite.width / 2, sprite.height / 2);
  if (look.kind === 'shape') drawShape(g, look.value, color, px / 2);
  else drawGlyph(g, look.value, color, px);
  sprites.set(key, sprite);
  return sprite;
}

function drawGlyph(g, text, color, px) {
  const isEmoji = /\p{Extended_Pictographic}/u.test(text);
  g.font = `${isEmoji ? 400 : 800} ${px}px -apple-system, system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", Roboto, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = color;
  if (!isEmoji) {
    g.lineWidth = px * 0.12;
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineJoin = 'round';
    g.strokeText(text, 0, px * 0.05);
  }
  g.fillText(text, 0, px * 0.05);
}

function drawShape(g, shape, color, r) {
  g.fillStyle = color;
  g.strokeStyle = color;
  switch (shape) {
    case 'snow': {
      const grad = g.createRadialGradient(0, 0, 0, 0, 0, r);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.45, withAlpha(color, 0.9));
      grad.addColorStop(1, withAlpha(color, 0));
      g.fillStyle = grad;
      circle(g, r);
      g.fill();
      break;
    }
    case 'bubble': {
      const grad = g.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
      grad.addColorStop(0, 'rgba(255,255,255,0.35)');
      grad.addColorStop(0.75, withAlpha(color, 0.12));
      grad.addColorStop(1, withAlpha(color, 0.45));
      g.fillStyle = grad;
      circle(g, r * 0.92);
      g.fill();
      g.lineWidth = Math.max(1, r * 0.08);
      g.strokeStyle = withAlpha(color, 0.75);
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.beginPath();
      g.ellipse(-r * 0.35, -r * 0.4, r * 0.22, r * 0.12, -0.6, 0, Math.PI * 2);
      g.fill();
      break;
    }
    case 'star':
      starPath(g, 5, r, r * 0.45);
      g.fill();
      break;
    case 'spark': {
      starPath(g, 4, r, r * 0.22);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.9)';
      circle(g, r * 0.18);
      g.fill();
      break;
    }
    case 'petal': {
      const grad = g.createLinearGradient(0, -r, 0, r);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(1, color);
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(0, r);
      g.bezierCurveTo(r * 0.9, r * 0.4, r * 0.6, -r * 0.8, 0, -r * 0.6);
      g.bezierCurveTo(-r * 0.6, -r * 0.8, -r * 0.9, r * 0.4, 0, r);
      g.fill();
      break;
    }
    case 'rect':
      g.fillRect(-r * 0.8, -r * 0.45, r * 1.6, r * 0.9);
      break;
    default:
      circle(g, r * 0.8);
      g.fill();
  }
}

function circle(g, r) {
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
}

function starPath(g, points, outer, inner) {
  g.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = (i * Math.PI) / points - Math.PI / 2;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
}

// ——— Вспомогательное ———

function buildPool(p, ctx) {
  const pool = [];
  for (const value of [].concat(p.emoji || [])) pool.push({ kind: 'emoji', value: String(value) });
  for (const value of [].concat(p.shapes || [])) pool.push({ kind: 'shape', value });
  for (const src of [].concat(p.images || [])) pool.push({ kind: 'image', value: src, img: loadImage(ctx.asset(src)) });
  return pool.length ? pool : [{ kind: 'shape', value: 'circle' }];
}

function loadImage(url) {
  if (!images.has(url)) {
    const img = new Image();
    img.src = url;
    images.set(url, img);
  }
  return images.get(url);
}

function bezier(a, b, c, t) {
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * b.x + t * t * c.x, y: u * u * a.y + 2 * u * t * b.y + t * t * c.y };
}

function rand(range) {
  if (!Array.isArray(range)) return range;
  return range[0] + Math.random() * (range[1] - range[0]);
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function withAlpha(hex, a) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
  if (!m) return hex;
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${a})`;
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function nonNegative(value) {
  return finite(value) && value >= 0;
}

function numberOrRange(value, allowZero) {
  const valid = number => finite(number) && (allowZero ? number >= 0 : number > 0);
  return valid(value) || (Array.isArray(value) && value.length === 2 && valid(value[0]) && valid(value[1]) && value[0] <= value[1]);
}

function stringArray(value) {
  return Array.isArray(value) && value.length > 0 && value.every(item => typeof item === 'string' && item.length > 0);
}
