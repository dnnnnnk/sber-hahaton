// Собственный персонаж «Капля»: пружинная физика и пассивное наблюдение за жестами.
import tilt from '../triggers/tilt.js';
import shake from '../triggers/shake.js';

export default {
  type: 'resident',
  fullscreen: false,
  sensors: ['orientation', 'motion'],

  validate(p) {
    if (p.anchor != null && (typeof p.anchor !== 'string' || !p.anchor)) return 'anchor: нужно имя якоря';
    if (p.size != null && !(Number.isFinite(p.size) && p.size >= 32 && p.size <= 72)) return 'size: число от 32 до 72';
    if (p.durationMs != null && !(Number.isFinite(p.durationMs) && p.durationMs >= 0)) return 'durationMs: нужно число ≥ 0';
    if (p.rangeDeg != null && !(Number.isFinite(p.rangeDeg) && p.rangeDeg > 0)) return 'rangeDeg: нужно число > 0';
    if (p.shakeThreshold != null && !(Number.isFinite(p.shakeThreshold) && p.shakeThreshold > 0)) return 'shakeThreshold: нужно число > 0';
    return null;
  },

  play(p, ctx) {
    const anchor = p.anchor ?? 'card';
    const size = p.size ?? 52;
    const duration = p.durationMs ?? 9000;
    const { stage } = ctx;
    if (!stage.getAnchorRect(anchor) || !duration || !stage.availableParticles(ctx.settings.maxParticles)) return null;
    let elapsed = 0;
    let x = 0;
    let vx = 0;
    let lean = 0;
    let moodUntil = 0;
    let dizzyUntil = 0;
    let leaving = null;
    let point = null;
    let touch = null;
    let finished = false;
    let voice = null;
    const disposers = [];
    const model = document.createElement('div');
    model.className = 'prikoly-resident';
    model.setAttribute('aria-hidden', 'true');
    model.dataset.mood = 'curious';
    stage.root.append(model);

    const react = kind => {
      if (document.hidden || leaving) return;
      voice?.();
      if (kind === 'shake') {
        dizzyUntil = elapsed + 1200;
        voice = ctx.sound.synth('wobble');
      } else {
        moodUntil = elapsed + 800;
        voice = ctx.sound.synth('giggle');
        ctx.haptics.play('light');
      }
    };

    disposers.push(tilt.create({ rangeDeg: p.rangeDeg ?? 15, startThreshold: 0, follow: 0.01 }, { sensors: ctx.sensors }, payload => {
      if (!document.hidden) lean = payload.x;
    }));
    disposers.push(shake.create({ threshold: p.shakeThreshold ?? 14, hits: 3 }, { sensors: ctx.sensors }, () => react('shake')));
    disposers.push(ctx.sensors.subscribe('pointer', e => {
      if (!point || document.hidden || leaving) return;
      if (e.type === 'pointerdown') {
        // Координаты pointer — экранные; point — тоже. Ни один жест не перехватывается.
        if (!touch && Math.hypot(e.x - point.x, e.y - point.y) < size * 0.65) {
          touch = { id: e.id, x: e.x, y: e.y, t: e.t };
        }
      } else if (touch?.id === e.id) {
        const dx = e.x - touch.x;
        const dy = e.y - touch.y;
        if (e.type === 'pointermove' && Math.hypot(dx, dy) > 34) {
          leaving = { at: elapsed, dx: Math.sign(dx || 1), dy: dy < -15 ? -1 : 0 };
          touch = null;
        } else if (e.type === 'pointerup') {
          if (Math.hypot(dx, dy) < 12 && e.t - touch.t < 600) react('tap');
          touch = null;
        } else if (e.type === 'pointercancel') touch = null;
      }
    }));

    const remove = stage.addRenderer({
      count: 1,
      budget: 1,
      onDone: finish,
      frame(dt, now, g) {
        elapsed += dt * 1000;
        const r = stage.getAnchorRect(anchor);
        if (!r || r.top < size * 0.45 || r.top > stage.height || elapsed >= duration) return finish(), false;
        const fade = Math.min(1, elapsed / 220, (duration - elapsed) / 450);
        const exit = leaving ? Math.min(1, (elapsed - leaving.at) / 220) : 0;
        if (exit >= 1) return finish(), false;
        if (!ctx.reducedMotion) {
          vx += (lean * 360 - x * 5 - vx * 5) * dt;
          x += vx * dt;
          const limit = Math.max(0, r.width * 0.5 - size * 0.65);
          if (Math.abs(x) > limit) { x = Math.sign(x) * limit; vx *= -0.35; }
        }
        const laughing = elapsed < moodUntil;
        const dizzy = elapsed < dizzyUntil;
        const bounce = laughing && !ctx.reducedMotion ? -Math.abs(Math.sin((moodUntil - elapsed) / 70)) * 8 : 0;
        const cx = r.cx + x;
        const cy = r.top - size * 0.34 + bounce;
        const host = stage.root.getBoundingClientRect();
        point = { x: host.left + cx, y: host.top + cy };
        Object.assign(model.style, { left: `${cx - size / 2}px`, top: `${cy - size / 2}px`, width: `${size}px`, height: `${size}px` });
        model.dataset.mood = dizzy ? 'dizzy' : laughing ? 'happy' : 'curious';
        g.save();
        g.globalAlpha = fade * (1 - exit);
        g.translate(cx + exit * size * (leaving?.dx ?? 0), cy + (leaving?.dy ?? 0) * exit * size);
        // Тень остаётся лёгкой; персонаж не закрывает баланс или кнопки.
        g.save();
        g.scale(1, 0.2); g.fillStyle = 'rgba(18,90,77,.13)';
        g.beginPath(); g.ellipse(0, size * 2.4, size * 0.34, size * 0.2, 0, 0, Math.PI * 2); g.fill();
        g.restore();
        if (!ctx.reducedMotion) g.rotate(x / size * 0.17 + (dizzy ? Math.sin(elapsed / 55) * 0.16 : 0));
        drawDrop(g, size, { laughing, dizzy, time: elapsed, lean });
        g.restore();
        return true;
      },
    });

    function finish() {
      if (finished) return;
      finished = true;
      remove();
      disposers.forEach(off => off());
      voice?.();
      model.remove();
      ctx.end();
    }
    return { stop: finish };
  },
};

function drawDrop(g, size, { laughing, dizzy, time, lean }) {
  const s = size / 52;
  g.scale(s, s);
  // Абстрактная капля с лиловым хохолком, без образов чужих персонажей.
  g.fillStyle = '#8174e5';
  g.beginPath(); g.ellipse(3, -23, 5, 10, 0.5, 0, Math.PI * 2); g.fill();
  const fill = g.createLinearGradient(-16, -24, 20, 25);
  fill.addColorStop(0, '#bcffeb'); fill.addColorStop(0.45, '#66e7c7'); fill.addColorStop(1, '#25b39e');
  g.fillStyle = fill;
  g.beginPath();
  g.moveTo(0, -22); g.bezierCurveTo(14, -25, 24, -8, 23, 9);
  g.bezierCurveTo(23, 24, 10, 26, 0, 24); g.bezierCurveTo(-18, 28, -26, 17, -23, 3);
  g.bezierCurveTo(-21, -13, -12, -22, 0, -22); g.fill();
  g.strokeStyle = 'rgba(255,255,255,.72)'; g.lineWidth = 2.2; g.lineCap = 'round';
  g.beginPath(); g.moveTo(-17, -5); g.quadraticCurveTo(-14, -16, -5, -17); g.stroke();
  g.fillStyle = '#25a792';
  for (const side of [-1, 1]) { g.beginPath(); g.ellipse(side * 23, 11, 4, 7, side * -0.6, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#ffa8b7';
  for (const side of [-1, 1]) { g.beginPath(); g.ellipse(side * 14, 10, 4, 2.5, 0, 0, Math.PI * 2); g.fill(); }
  const blink = time % 3100 > 2950;
  for (const side of [-1, 1]) {
    const x = side * 8;
    g.strokeStyle = '#174c50'; g.lineWidth = 2;
    if (dizzy) {
      g.beginPath(); g.moveTo(x - 3, 1); g.lineTo(x + 3, 7); g.moveTo(x + 3, 1); g.lineTo(x - 3, 7); g.stroke();
    } else if (laughing || blink) {
      g.beginPath(); g.arc(x, 6, 3, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
    } else {
      g.fillStyle = '#fff'; g.beginPath(); g.ellipse(x, 3, 4.3, 5.8, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#174c50'; g.beginPath(); g.ellipse(x + lean * 1.4, 4, 2.4, 3.3, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(x + lean * 1.4 - 0.6, 2.5, 0.8, 0, Math.PI * 2); g.fill();
    }
  }
  g.strokeStyle = '#174c50'; g.lineWidth = 1.7;
  g.beginPath(); g.moveTo(-4, 12); g.quadraticCurveTo(0, laughing ? 21 : 17, 5, 12); g.stroke();
}
