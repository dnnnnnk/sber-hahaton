// «Капля» — собственный персонаж-жилец. Живёт на зелёных экранах (по умолчанию — в центре таббара, на месте
// неактивного «Ассистента»), реагирует на датчики, жесты и события оболочки. Какое событие вызывает какую
// реакцию — в params.reactions, поэтому реакции меняет контент-менеджер без релиза (docs/CONFIG.md).
// Рисунок — SVG в DOM. Физика (наклон, прыжки, сквош) идёт в общем rAF только пока Капля двигается;
// дыхание и моргание в покое — CSS. Тап и свайп наблюдаются пассивно; единственное, что принимает касание, —
// круг её тела (~0,9 размера): тап по Капле не нажимает вкладку под ней. Остальной слой — pointer-events: none.
// Без durationMs Капля постоянная: переезжает между экранами через update({ screen }), исчезает в красной
// зоне, а свайпом её можно отпустить до следующего входа в приложение.
import tilt from '../triggers/tilt.js';
import shake from '../triggers/shake.js';

export const REACTIONS = {
  none: 'ничего не делает',
  roll: 'перекатывается к краю',
  joy: 'радуется и подпрыгивает',
  dance: 'танцует',
  giggle: 'хихикает',
  dizzy: 'кружится голова',
  surprise: 'удивляется',
  doze: 'дремлет',
  sleep: 'засыпает и потягивается после',
  leave: 'убегает до следующего входа',
};

export const REACTION_EVENTS = {
  tilt: 'Наклон телефона',
  shake: 'Тряска',
  flip: 'Телефон экраном вниз',
  tap: 'Тап по Капле',
  swipe: 'Свайп по Капле',
  still: 'Телефон лежит неподвижно',
  idle: 'Долго ничего не происходит',
  'task:done': 'Дело выполнено',
  'tasks:allDone': 'Все дела выполнены',
  'moneybox:topup': 'Копилка пополнена',
};

export const DEFAULT_REACTIONS = {
  tilt: 'roll',
  shake: 'dizzy',
  flip: 'sleep',
  tap: 'giggle',
  swipe: 'leave',
  still: 'doze',
  idle: 'doze',
  'task:done': 'joy',
  'tasks:allDone': 'dance',
  'moneybox:topup': 'joy',
};

const BUS_EVENT = /^[a-z]+:[A-Za-z]+$/;
const PERCH_Y = ['top', 'center', 'bottom'];
const MOOD = { idle: 'curious', happy: 'happy', dizzy: 'dizzy', sleep: 'sleepy', yawn: 'sleepy', surprised: 'surprised' };

// Отпущена свайпом: до перезагрузки страницы (следующего входа) не возвращается сама.
let dismissed = false;

export default {
  type: 'resident',
  fullscreen: false,
  sensors: ['orientation', 'motion'],

  validate(p) {
    if (p.anchor != null && (typeof p.anchor !== 'string' || !p.anchor)) return 'anchor: нужно имя якоря';
    if (p.size != null && !(Number.isFinite(p.size) && p.size >= 32 && p.size <= 72)) return 'size: число от 32 до 72';
    for (const key of ['durationMs', 'idleMs', 'stillMs']) {
      if (p[key] != null && !(Number.isFinite(p[key]) && p[key] >= 0)) return `${key}: нужно число ≥ 0`;
    }
    if (p.rangeDeg != null && !(Number.isFinite(p.rangeDeg) && p.rangeDeg > 0)) return 'rangeDeg: нужно число > 0';
    if (p.shakeThreshold != null && !(Number.isFinite(p.shakeThreshold) && p.shakeThreshold > 0)) return 'shakeThreshold: нужно число > 0';
    if (p.reactions != null) {
      if (!isObject(p.reactions)) return 'reactions: нужен объект «событие → реакция»';
      for (const [event, reaction] of Object.entries(p.reactions)) {
        if (!REACTION_EVENTS[event] && !BUS_EVENT.test(event)) return `reactions: неизвестное событие "${event}"`;
        if (!REACTIONS[reaction]) return `reactions.${event}: одна из ${Object.keys(REACTIONS).join(', ')}`;
      }
    }
    if (p.perches != null) {
      if (!isObject(p.perches) || !Object.keys(p.perches).length) return 'perches: нужен объект «экран → место»';
      for (const [screen, perch] of Object.entries(p.perches)) {
        if (!isObject(perch) || typeof perch.anchor !== 'string' || !perch.anchor) return `perches.${screen}: нужен anchor`;
        if (perch.x != null && !(Number.isFinite(perch.x) && perch.x >= 0 && perch.x <= 1)) return `perches.${screen}.x: число от 0 до 1`;
        if (perch.y != null && !PERCH_Y.includes(perch.y)) return `perches.${screen}.y: одно из ${PERCH_Y.join(', ')}`;
        if (perch.plate != null && typeof perch.plate !== 'boolean') return `perches.${screen}.plate: true или false`;
      }
    }
    return null;
  },

  // «Сбросить демо» в debug: Капля снова приходит сама.
  reset() {
    dismissed = false;
  },

  play(p, ctx) {
    const { stage } = ctx;
    const persistent = p.durationMs == null;
    const duration = p.durationMs ?? Infinity;
    if (ctx.payload?.summon) dismissed = false;
    if ((persistent && dismissed) || !duration || !stage.availableParticles(ctx.settings.maxParticles)) return null;
    const size = p.size ?? 46;
    const reduced = ctx.reducedMotion;
    const reactions = { ...DEFAULT_REACTIONS, ...(p.reactions || {}) };
    const perches = p.perches || { default: { anchor: p.anchor || 'tabbar', x: 0.5, y: p.anchor ? 'top' : 'center' } };
    const w = size;
    const h = size * 1.1;
    let screenId = ctx.payload?.screen || ctx.screen?.().id;
    let perch = resolvePerch();
    if (!persistent && !perch) return null;

    const el = document.createElement('div');
    el.className = 'prikoly-resident prikoly-drop';
    el.setAttribute('aria-hidden', 'true');
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    el.innerHTML = `
      <div class="prikoly-drop__shadow"></div>
      <div class="prikoly-drop__hit"></div>
      <div class="prikoly-drop__pop"><div class="prikoly-drop__roll">
        <div class="prikoly-drop__squash">${SVG}</div>
        <div class="prikoly-drop__fx"></div>
      </div></div>`;
    const shadowEl = el.querySelector('.prikoly-drop__shadow');
    const popEl = el.querySelector('.prikoly-drop__pop');
    const rollEl = el.querySelector('.prikoly-drop__roll');
    const squashEl = el.querySelector('.prikoly-drop__squash');
    const fxEl = el.querySelector('.prikoly-drop__fx');
    const pupils = el.querySelector('.pd-pupils');
    // «Домик» на месте отдыха (perch.plate): закрывает то, что под Каплей, и остаётся, когда она укатилась.
    const plateEl = document.createElement('div');
    plateEl.className = 'prikoly-drop-plate';
    plateEl.setAttribute('aria-hidden', 'true');
    plateEl.style.width = plateEl.style.height = `${Math.round(size * 1.22)}px`;
    stage.root.append(plateEl, el);

    // Физика: x — смещение вдоль «пола» от места отдыха, y — высота прыжка (вверх отрицательная).
    let t = 0;
    let x = 0, vx = 0, y = 0, vy = 0, rot = 0, sq = 0, sqv = 0;
    let lean = 0;
    let airborne = false;
    let pendingJump = null;
    let hops = [];
    let face = 'idle';
    let faceUntil = 0;
    let state = 'idle'; // idle | doze | sleep | leaving
    let jiggleUntil = 0, wobbleUntil = 0, wobbleFrom = 0, danceUntil = 0, stretchUntil = 0;
    let leaving = null;
    let finished = false;
    let voice = null;
    let running = false;
    let removeRenderer = null;
    let center = { x: -1e4, y: -1e4 };
    let touch = null;
    let idleTimer = 0;
    let lastActivity = 0;
    let stillSince = null;
    let faceDownSince = null;
    let tiltReactAt = -Infinity;
    const fxLoops = new Map();
    const disposers = [];

    // ——— Реакции ———

    function react(kind, source) {
      if (finished || leaving || document.hidden || !kind || kind === 'none') return;
      if (state === 'sleep' && source !== 'wake') return;
      if (state === 'doze' && kind !== 'doze') wakeFromDoze();
      switch (kind) {
        case 'roll':
          if (source !== 'tilt') { vx += (Math.random() < 0.5 ? -1 : 1) * 420; wake(); }
          break;
        case 'joy':
          setFace('happy', 1100);
          jump(reduced ? 0 : 400);
          burst('spark', 3);
          say('hop');
          break;
        case 'dance':
          setFace('happy', 2900);
          danceUntil = t + 2800;
          hops = reduced ? [] : [0, 400, 800, 1200, 1600, 2000, 2400].map(at => t + at);
          for (let i = 0; i < 6; i++) setTimeout(() => !finished && burst('note', 1), i * 420);
          say('dance');
          break;
        case 'giggle':
          setFace('happy', 900);
          jiggleUntil = t + 700;
          jump(reduced ? 0 : 170);
          burst('heart', 2);
          say('giggle');
          ctx.haptics.play('light');
          break;
        case 'dizzy':
          setFace('dizzy', 1700);
          wobbleFrom = t;
          wobbleUntil = t + 1700;
          loopFx('star', 3, 1700);
          say('wobble');
          break;
        case 'surprise':
          setFace('surprised', 800);
          jump(reduced ? 0 : 140);
          break;
        case 'doze':
          if (state !== 'idle') break;
          state = 'doze';
          el.classList.add('is-sleepy');
          setFace('sleep', Infinity);
          loopFx('z', 3);
          break;
        case 'sleep':
          state = 'sleep';
          el.classList.add('is-sleepy');
          setFace('sleep', Infinity);
          loopFx('z', 3);
          // Источник без «пробуждения» (например, тряска) — сама проснётся через 6 с.
          if (source !== 'flip') setTimeout(() => state === 'sleep' && wakeUp(), 6000);
          break;
        case 'leave':
          leave(source === 'swipe' ? swipeDir : 1);
          break;
        default:
          break;
      }
      wake();
    }

    function wakeFromDoze() {
      state = 'idle';
      el.classList.remove('is-sleepy');
      stopLoop('z');
      setFace('surprised', 500);
    }

    // После сна (телефон вернули лицом вверх): потягивается и зевает.
    function wakeUp() {
      if (state !== 'sleep') return;
      state = 'idle';
      el.classList.remove('is-sleepy');
      stopLoop('z');
      setFace('yawn', 1100);
      stretchUntil = t + 1100;
      say('yawn');
      setTimeout(() => !finished && !leaving && (setFace('happy', 700), jump(reduced ? 0 : 220)), 1150);
      wake();
    }

    function leave(dir) {
      if (leaving) return;
      leaving = { at: t, dir: dir || 1 };
      if (persistent) dismissed = true;
      voice?.();
      voice = ctx.sound.synth('swish');
      wake();
    }

    function jump(v) {
      if (!v || airborne || pendingJump) return;
      sqv -= 2.6; // присела перед прыжком
      pendingJump = { at: t + 80, v };
      wake();
    }

    function setFace(next, ms) {
      face = next;
      faceUntil = t + ms;
      applyFace();
    }

    function applyFace() {
      el.dataset.face = face;
      el.dataset.mood = MOOD[face] || 'curious';
    }

    function say(kind) {
      voice?.();
      voice = ctx.sound.synth(kind);
    }

    // ——— Эффекты-значки над головой: ✦ звёзды, z, ♪, ♥ ———

    function burst(kind, count) {
      for (let i = 0; i < count; i++) {
        const s = document.createElement('i');
        s.className = `pd-fx pd-fx--${kind}`;
        s.style.setProperty('--i', String(i));
        s.style.setProperty('--dx', `${(i - (count - 1) / 2) * 16 + (Math.random() - 0.5) * 8}px`);
        fxEl.append(s);
        setTimeout(() => s.remove(), 1300);
      }
    }

    function loopFx(kind, count, ms) {
      stopLoop(kind);
      const items = [];
      for (let i = 0; i < count; i++) {
        const s = document.createElement('i');
        s.className = `pd-fx pd-fx--${kind} is-loop`;
        s.style.setProperty('--i', String(i));
        fxEl.append(s);
        items.push(s);
      }
      fxLoops.set(kind, { items, timer: ms ? setTimeout(() => stopLoop(kind), ms) : 0 });
    }

    function stopLoop(kind) {
      const loop = fxLoops.get(kind);
      if (!loop) return;
      clearTimeout(loop.timer);
      loop.items.forEach(s => s.remove());
      fxLoops.delete(kind);
    }

    // ——— Место на экране ———

    function resolvePerch() {
      for (const spec of [perches[screenId], perches.default]) {
        if (!spec) continue;
        const r = stage.getAnchorRect(spec.anchor);
        if (!r || r.bottom < 0 || r.top > stage.height) continue;
        const fx = spec.x ?? 0.5;
        const floorY = spec.y === 'top' ? r.top : spec.y === 'bottom' ? r.bottom - 4 : r.cy + h * 0.5;
        const restX = r.left + r.width * fx;
        const margin = w * 0.55;
        return {
          spec, rect: r, floorY, restX,
          minX: Math.min(0, r.left + margin - restX), maxX: Math.max(0, r.right - margin - restX),
        };
      }
      return null;
    }

    // ——— Цикл: работает, пока есть движение ———

    function wake() {
      if (running || finished) return;
      running = true;
      // Капля — DOM, не частица: в статистике частиц её нет, но одно место общего бюджета она резервирует.
      removeRenderer = stage.addRenderer({ count: 0, budget: 1, onDone: () => { running = false; }, frame });
    }

    function frame(dt) {
      t += dt * 1000;
      perch = resolvePerch();
      if (!persistent) {
        if (!perch || perch.rect.top < size * 0.45 || t >= duration) return finish(), false;
      }
      step(dt);
      apply();
      if (leaving && t - leaving.at >= 340) return finish(), false;
      if (face !== 'idle' && t >= faceUntil) {
        face = state === 'idle' ? 'idle' : 'sleep';
        applyFace();
      }
      const busy = !persistent || leaving || airborne || pendingJump || hops.length
        || t < Math.max(jiggleUntil, wobbleUntil, danceUntil, stretchUntil, faceUntil === Infinity ? 0 : faceUntil)
        || Math.abs(vx) > 2 || Math.abs(sq) > 0.003 || Math.abs(sqv) > 0.03
        || Math.abs(rot - nearestTurn(rot)) > 0.01 || Math.abs(x - restTarget()) > 0.6;
      if (!busy) running = false;
      return Boolean(busy);
    }

    function restTarget() {
      if (!perch || reduced) return 0;
      return clamp(lean * 1400 / 6, perch.minX, perch.maxX);
    }

    function step(dt) {
      if (reduced) {
        x = 0; y = 0; rot = 0; sq = 0; vx = 0;
        return;
      }
      if (leaving) {
        x += leaving.dir * 900 * dt;
        rot += leaving.dir * dt * 9;
        return;
      }
      const rolling = reactions.tilt === 'roll' && state === 'idle';
      const ax = (rolling ? lean * 1400 : 0) - x * 6 - vx * 3;
      vx += ax * dt;
      x += vx * dt;
      if (perch) {
        if (x < perch.minX || x > perch.maxX) {
          x = clamp(x, perch.minX, perch.maxX);
          if (Math.abs(vx) > 140) sqv -= Math.min(3.5, Math.abs(vx) * 0.006);
          vx *= -0.25;
        }
      }
      // Катится: угол следует за пройденным путём; остановилась — встаёт на ноги.
      rot += (vx * dt) / (w * 0.48);
      if (Math.abs(vx) < 40) rot += (nearestTurn(rot) - rot) * Math.min(1, dt * 7);

      if (pendingJump && t >= pendingJump.at) {
        airborne = true;
        vy = -pendingJump.v;
        pendingJump = null;
      }
      if (hops.length && t >= hops[0] && !airborne && !pendingJump) {
        hops.shift();
        airborne = true;
        vy = -260;
      }
      if (airborne) {
        vy += 1700 * dt;
        y += vy * dt;
        const target = clamp(-vy / 2400, -0.12, 0.22);
        sq += (target - sq) * Math.min(1, dt * 18);
        if (y >= 0) {
          y = 0;
          airborne = false;
          sqv -= Math.min(4, Math.abs(vy) * 0.0075); // шлёп при приземлении
          vy = 0;
        }
      } else {
        const stretch = t < stretchUntil ? 0.2 * Math.sin(Math.PI * (1 - (stretchUntil - t) / 1100)) : 0;
        sqv += (-(sq - stretch) * 260 - sqv * 15) * dt;
        sq += sqv * dt;
      }
    }

    function apply() {
      const fade = leaving ? Math.max(0, 1 - (t - leaving.at) / 340) : 1;
      const lifeFade = persistent ? 1 : Math.min(1, t / 220, (duration - t) / 450);
      el.classList.toggle('is-away', !perch);
      plateEl.hidden = !perch?.spec.plate;
      if (!perch) return;
      if (perch.spec.plate) {
        const d = size * 1.22;
        plateEl.style.transform = `translate(${(perch.restX - d / 2).toFixed(1)}px, ${(perch.floorY - h * 0.5 - d / 2).toFixed(1)}px)`;
        plateEl.style.opacity = (fade * lifeFade).toFixed(3);
      }
      const jiggle = t < jiggleUntil && !reduced ? Math.sin(t / 26) * 2.4 : 0;
      const wobble = t < wobbleUntil && !reduced ? Math.sin((t - wobbleFrom) / 55) * 0.26 * ((wobbleUntil - t) / 1700) : 0;
      const dance = t < danceUntil && !reduced ? Math.sin((t / 400) * Math.PI) * 0.22 : 0;
      const X = perch.restX + x + jiggle;
      const Y = perch.floorY + y;
      el.style.transform = `translate(${(X - w / 2).toFixed(1)}px, ${(Y - h).toFixed(1)}px)`;
      el.style.opacity = (fade * lifeFade).toFixed(3);
      rollEl.style.transform = `rotate(${(rot + wobble + dance).toFixed(3)}rad)`;
      squashEl.style.transform = `scale(${(1 - sq * 0.55).toFixed(3)}, ${(1 + sq).toFixed(3)})`;
      const lift = Math.min(1, -y / 90);
      shadowEl.style.transform = `translate(-50%, ${(-y).toFixed(1)}px) scale(${(1 - lift * 0.5).toFixed(3)})`;
      shadowEl.style.opacity = (1 - lift * 0.6).toFixed(2);
      const host = stage.root.getBoundingClientRect();
      center = { x: host.left + X, y: host.top + Y - h * 0.48 };
    }

    function look(px, py) {
      if (state !== 'idle' || !pupils) return;
      const dx = clamp((px - center.x) / 70, -1, 1) * 1.7;
      const dy = clamp((py - center.y) / 90, -1, 1) * 1.3;
      pupils.setAttribute('transform', `translate(${dx.toFixed(2)} ${dy.toFixed(2)})`);
    }

    // ——— Входы ———

    function activity() {
      const now = performance.now();
      if (now - lastActivity < 300) return;
      lastActivity = now;
      if (state === 'doze') wakeFromDoze();
      clearTimeout(idleTimer);
      const idleMs = p.idleMs ?? 20000;
      if (idleMs > 0) idleTimer = setTimeout(() => react(reactions.idle, 'idle'), idleMs);
    }

    let swipeDir = 1;
    disposers.push(ctx.sensors.subscribe('pointer', e => {
      if (finished || document.hidden) return;
      activity();
      if (e.type === 'pointerdown' || e.type === 'pointermove') look(e.x, e.y);
      if (leaving || !perch) return;
      if (e.type === 'pointerdown') {
        if (!touch && Math.hypot(e.x - center.x, e.y - center.y) < size * 0.62) touch = { id: e.id, x: e.x, y: e.y, t: e.t, moved: 0 };
        return;
      }
      if (touch?.id !== e.id) return;
      const dx = e.x - touch.x;
      const dy = e.y - touch.y;
      if (e.type === 'pointermove') {
        touch.moved = Math.max(touch.moved, Math.hypot(dx, dy));
        if (Math.abs(dx) > 4) swipeDir = Math.sign(dx);
        if (touch.moved > 34) {
          touch = null;
          react(reactions.swipe, 'swipe');
        }
      } else if (e.type === 'pointerup') {
        if (Math.hypot(dx, dy) < 12 && e.t - touch.t < 600) react(reactions.tap, 'tap');
        touch = null;
      } else if (e.type === 'pointercancel') {
        // Браузер забрал жест под прокрутку — значит, палец поехал: считаем свайпом.
        if (touch.moved > 10 && e.t - touch.t < 700) react(reactions.swipe, 'swipe');
        touch = null;
      }
    }));

    disposers.push(tilt.create({ rangeDeg: p.rangeDeg ?? 15, startThreshold: 0, follow: 0.01 }, { sensors: ctx.sensors }, payload => {
      if (document.hidden || state === 'sleep') return;
      lean = reduced ? 0 : payload.x;
      if (reactions.tilt !== 'roll' && Math.abs(payload.x) > 0.6 && t - tiltReactAt > 2500) {
        tiltReactAt = t;
        react(reactions.tilt, 'tilt');
      }
      if (Math.abs(payload.x) > 0.2) activity();
      wake();
    }));

    disposers.push(shake.create({ threshold: p.shakeThreshold ?? 14, hits: 3 }, { sensors: ctx.sensors }, () => {
      activity();
      react(reactions.shake, 'shake');
    }));

    // Неподвижность и «лицом вниз» — сами, чтобы просыпаться, когда телефон снова взяли.
    let lastMotion = -Infinity;
    disposers.push(ctx.sensors.subscribe('motion', s => {
      if (s.empty) return;
      if (s.t - lastMotion > 1000) stillSince = null; // разрыв в замерах — отсчёт заново
      lastMotion = s.t;
      if (s.linear > 0.25 || s.rotation > 3) {
        if (stillSince != null && state === 'doze') wakeFromDoze();
        stillSince = null;
        return;
      }
      stillSince ??= s.t;
      if (state === 'idle' && s.t - stillSince >= (p.stillMs ?? 6000)) {
        stillSince = s.t; // разбудили тапом, а телефон всё лежит — снова задремлет через stillMs
        react(reactions.still, 'still');
      }
    }));

    disposers.push(ctx.sensors.subscribe('orientation', o => {
      const faceDown = Math.abs(o.beta) > 150;
      if (faceDown) {
        faceDownSince ??= o.t;
        if (state !== 'sleep' && o.t - faceDownSince >= 300) react(reactions.flip, 'flip');
      } else if (Math.abs(o.beta) < 60) {
        faceDownSince = null;
        if (state === 'sleep') wakeUp();
      }
    }));

    for (const [event, kind] of Object.entries(reactions)) {
      if (BUS_EVENT.test(event)) disposers.push(ctx.events.on(event, () => react(kind, event)));
    }

    const onScroll = () => wake();
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('resize', onScroll);
    disposers.push(() => {
      document.removeEventListener('scroll', onScroll, { capture: true });
      window.removeEventListener('resize', onScroll);
    });

    function enter() {
      perch = resolvePerch();
      apply();
      if (!reduced && perch) {
        popEl.animate([
          { transform: 'translateY(40%) scale(.2)', opacity: 0 },
          { transform: 'translateY(-6%) scale(1.08, .94)', opacity: 1, offset: 0.65 },
          { transform: 'none', opacity: 1 },
        ], { duration: 380, easing: 'cubic-bezier(.3,.9,.4,1.2)' });
      }
      wake();
    }

    function finish() {
      if (finished) return;
      finished = true;
      removeRenderer?.();
      disposers.forEach(off => off());
      clearTimeout(idleTimer);
      for (const kind of [...fxLoops.keys()]) stopLoop(kind);
      voice?.();
      el.remove();
      plateEl.remove();
      ctx.end();
    }

    applyFace();
    activity();
    enter();

    return {
      persistent,
      update(payload = {}) {
        if (payload.react) return react(payload.react, 'debug');
        if (payload.wake) return wakeUp();
        if (payload.screen && payload.screen !== screenId) {
          screenId = payload.screen;
          enter();
        }
      },
      stop: finish,
    };
  },
};

function nearestTurn(angle) {
  return Math.round(angle / (Math.PI * 2)) * Math.PI * 2;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function spiral(cx, cy) {
  let d = '';
  for (let i = 0; i <= 26; i++) {
    const a = i * 0.55;
    const r = 0.35 + i * 0.15;
    d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * r).toFixed(2)} ${(cy + Math.sin(a) * r).toFixed(2)}`;
  }
  return d;
}

// Абстрактная мятная капля с лиловым хохолком — собственный образ, без чужих персонажей.
const SVG = `
<svg class="prikoly-drop__svg" viewBox="-32 -40 64 70" aria-hidden="true">
  <defs>
    <linearGradient id="prikoly-drop-fill" x1="0.15" y1="0" x2="0.85" y2="1">
      <stop offset="0" stop-color="#c4fff0"/><stop offset="0.45" stop-color="#66e7c7"/><stop offset="1" stop-color="#22ad98"/>
    </linearGradient>
  </defs>
  <g class="pd-breath">
    <ellipse cx="3" cy="-23" rx="5" ry="10" transform="rotate(28 3 -23)" fill="#8174e5"/>
    <path d="M0 -22C14 -25 24 -8 23 9C23 24 10 26 0 24C-18 28 -26 17 -23 3C-21 -13 -12 -22 0 -22Z" fill="url(#prikoly-drop-fill)"/>
    <path d="M-17 -5Q-14 -16 -5 -17" stroke="rgba(255,255,255,.75)" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <g class="pd-arm pd-arm--l"><ellipse cx="-23" cy="11" rx="4" ry="7" transform="rotate(34 -23 11)" fill="#25a792"/></g>
    <g class="pd-arm pd-arm--r"><ellipse cx="23" cy="11" rx="4" ry="7" transform="rotate(-34 23 11)" fill="#25a792"/></g>
    <ellipse cx="-14" cy="10.5" rx="4" ry="2.5" fill="#ffa8b7"/>
    <ellipse cx="14" cy="10.5" rx="4" ry="2.5" fill="#ffa8b7"/>
    <g class="pd-eyes pd-eyes--open">
      <ellipse cx="-8" cy="3" rx="4.3" ry="5.8" fill="#fff"/><ellipse cx="8" cy="3" rx="4.3" ry="5.8" fill="#fff"/>
      <g class="pd-pupils">
        <ellipse cx="-8" cy="4" rx="2.4" ry="3.3" fill="#174c50"/><ellipse cx="8" cy="4" rx="2.4" ry="3.3" fill="#174c50"/>
        <circle cx="-8.7" cy="2.4" r="0.9" fill="#fff"/><circle cx="7.3" cy="2.4" r="0.9" fill="#fff"/>
      </g>
    </g>
    <path class="pd-eyes pd-eyes--happy" d="M-11.5 5Q-8 0.5 -4.5 5M4.5 5Q8 0.5 11.5 5" stroke="#174c50" stroke-width="2.1" fill="none" stroke-linecap="round"/>
    <path class="pd-eyes pd-eyes--sleep" d="M-11.5 4Q-8 7.5 -4.5 4M4.5 4Q8 7.5 11.5 4" stroke="#174c50" stroke-width="2.1" fill="none" stroke-linecap="round"/>
    <path class="pd-eyes pd-eyes--dizzy" d="${spiral(-8, 3.5)}${spiral(8, 3.5)}" stroke="#174c50" stroke-width="1.4" fill="none" stroke-linecap="round"/>
    <path class="pd-mouth pd-mouth--smile" d="M-4 12Q0 17 5 12" stroke="#174c50" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <path class="pd-mouth pd-mouth--laugh" d="M-5.5 11.5Q0 21.5 5.5 11.5Z" fill="#174c50"/>
    <ellipse class="pd-mouth pd-mouth--o" cx="0.5" cy="14" rx="2.4" ry="3" fill="#174c50"/>
    <ellipse class="pd-mouth pd-mouth--yawn" cx="0.5" cy="14.5" rx="3.6" ry="4.6" fill="#174c50"/>
  </g>
</svg>`;
