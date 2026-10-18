// Debug-панель (?debug=1): режим ведущего (сброс демо, сезон, геройские моменты), имитация сенсоров,
// лог решений движка, FPS, подсветка зон и якорей, калибровка.
// Инструмент разработчика оболочки — к движку обращается только через его публичный API.

import { TASKS, MONEYBOXES, DREAM_ID } from './screens.js';

const COLLAPSED_KEY = 'sberkids.debugCollapsed';
const SEASONS = ['auto', 'autumn', 'winter', 'spring', 'summer'];
const SEASON_LABELS = { auto: 'по календарю', autumn: 'осень', winter: 'зима', spring: 'весна', summer: 'лето' };

export function mountDebug({ shell, bus, engine }) {
  loadStyles();
  document.body.classList.add('debug-on');

  const panel = document.createElement('aside');
  panel.className = 'dbg';
  panel.innerHTML = `
    <button class="dbg__fab" type="button" data-act="toggle" aria-label="Debug-панель">🛠</button>
    <div class="dbg__body">
      <header class="dbg__head">
        <b>Приколы · debug</b>
        <button type="button" data-act="toggle" aria-label="Свернуть">✕</button>
      </header>
      <div class="dbg__status" data-out="status"></div>
      <section class="dbg__host" aria-label="Режим ведущего">
        <button type="button" class="dbg__reset" data-act="resetDemo">🔄 Сбросить демо</button>
        <div class="dbg__seasons" role="group" aria-label="Сезон">
          <button type="button" data-season="auto">Авто</button>
          <button type="button" data-season="autumn">🍂</button>
          <button type="button" data-season="winter">❄️</button>
          <button type="button" data-season="spring">🌸</button>
          <button type="button" data-season="summer">☀️</button>
        </div>
        <div class="dbg__grid dbg__grid--hero">
          <button type="button" data-act="heroGiggle">💧 Капля хихикает</button>
          <button type="button" data-act="heroDance">💃 Капля танцует</button>
          <button type="button" data-act="heroHolo">💳 Голограмма</button>
          <button type="button" data-act="shake">🍂 Погода (тряхнуть)</button>
          <button type="button" data-act="flip">🙃 Кувырок</button>
          <button type="button" data-act="still">💤 Тихий час</button>
          <button type="button" data-act="allDone">✅ Все дела</button>
          <button type="button" data-act="coins">🪙 Копилки</button>
          <button type="button" data-act="topup">🤖 +500 в мечту</button>
        </div>
      </section>
      <div class="dbg__stats" data-out="stats"></div>
      <div class="dbg__grid">
        <button type="button" data-act="balance">💰 Баланс 1111</button>
        <button type="button" data-act="season">🗓 Сменить сезон</button>
        <button type="button" data-act="album">📒 Открыть альбом</button>
        <button type="button" data-act="resetCollection">🧹 Сбросить коллекцию</button>
        <button type="button" data-act="cooldowns">⏱ Сбросить кулдауны</button>
        <button type="button" data-act="mute">🔊 Звук</button>
        <button type="button" data-act="resident">💧 Позвать Каплю</button>
      </div>
      <fieldset class="dbg__tilt">
        <legend>Наклон (держите и двигайте)</legend>
        <label>x <input type="range" min="-1" max="1" step="0.02" value="0" data-tilt="x"></label>
        <label>y <input type="range" min="-1" max="1" step="0.02" value="0" data-tilt="y"></label>
      </fieldset>
      <div class="dbg__toggles">
        <label><input type="checkbox" data-opt="zones"> Зоны и якоря</label>
        <label><input type="checkbox" data-opt="calibrate"> Калибровка</label>
      </div>
      <div class="dbg__calib" data-out="calib" hidden></div>
      <ol class="dbg__log" data-out="log"></ol>
    </div>`;
  document.body.append(panel);

  const out = name => panel.querySelector(`[data-out="${name}"]`);
  let seasonIndex = 0;

  // ——— Кнопки ———

  const actions = {
    toggle: () => setCollapsed(!panel.classList.contains('is-collapsed')),
    shake: () => engine.simulate('shake', { strength: 1 }),
    // Кувырок как с телефона: экраном вниз (ночь, Капля засыпает), через 2,5 с — обратно (рассвет).
    flip: () => {
      const face = beta => engine.sensors.inject('orientation', { alpha: 0, beta, gamma: 0 });
      face(179);
      setTimeout(() => face(179), 450);
      setTimeout(() => face(12), 2900);
    },
    // Тихий час как с телефона: датчик движения «молчит» 7 с (метки времени вперёд) — 💤 и Капля засыпает.
    still: () => {
      const t = performance.now();
      for (let i = 0; i <= 14; i++) engine.sensors.inject('motion', { linear: 0.04, rotation: 0.4, t: t + i * 500 });
    },
    resetDemo: () => resetDemo(),
    heroGiggle: () => {
      engine.simulateEntry('screen-resident', { summon: true });
      setTimeout(() => engine.simulateEntry('screen-resident', { react: 'giggle' }), 60);
    },
    heroDance: () => {
      engine.simulateEntry('screen-resident', { summon: true });
      setTimeout(() => engine.simulateEntry('screen-resident', { react: 'dance' }), 60);
    },
    // Голограмма: 2,6 с «покачивания» телефона.
    heroHolo: () => {
      if (shell.current() !== 'home') shell.go('home');
      const started = performance.now();
      const timer = setInterval(() => {
        const t = (performance.now() - started) / 1000;
        if (t > 2.6) return clearInterval(timer);
        engine.simulate('tilt', { x: Math.sin(t * 2.6) * 0.65, y: Math.cos(t * 1.7) * 0.3 });
      }, 40);
    },
    coins: () => engine.simulateEntry('moneybox-rattle', { strength: 0.8 }),
    // То же, что кнопка «+500 ₽» на карточке мечты: экран пополнения → копилки, рост полоски, вехи, мечта.
    topup: () => shell.topup(DREAM_ID),
    resident: () => engine.simulateEntry('screen-resident', { summon: true }),
    balance: () => shell.setBalance(1111),
    allDone: () => shell.completeAllTasks(),
    album: () => engine.openAlbum?.(),
    resetCollection: () => engine.resetCollection?.(),
    cooldowns: () => {
      engine.rules.resetCooldowns();
      addLine({ info: '⏱ кулдауны сброшены' });
    },
    season: () => {
      seasonIndex = (seasonIndex + 1) % SEASONS.length;
      engine.setSeason(SEASONS[seasonIndex]);
      renderStatus();
    },
    mute: () => {
      engine.sound.setMuted(!engine.sound.isMuted());
      renderStatus();
    },
  };

  panel.addEventListener('click', e => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act) actions[act]();
    const season = e.target.closest('[data-season]')?.dataset.season;
    if (season) {
      engine.setSeason(season);
      seasonIndex = Math.max(0, SEASONS.indexOf(season));
      renderStatus();
    }
  });

  // «Сбросить демо»: приколы (коллекция, кулдауны, лимиты, сезон, звук, Капля) и оболочка
  // (дела, копилки, баланс) — в исходное, затем главный экран.
  function resetDemo() {
    const { state } = shell;
    TASKS.forEach(t => { state.tasks[t.id] = t.done; });
    state.moneyboxes = MONEYBOXES.map(m => ({ ...m }));
    state.balance = 800.55;
    state.lastTopup = null;
    state.pending = [];
    seasonIndex = 0;
    try {
      localStorage.removeItem('sberkids.lastOpenDay');
    } catch {
      // не страшно
    }
    engine.resetDemo();
    if (shell.current() === 'home') shell.refresh();
    else shell.go('home');
    document.getElementById('viewport').scrollTop = 0;
    renderStatus();
  }

  // Наклон: слайдеры шлют tilt, пока их двигают; отпустили — значения возвращаются к нулю.
  const tiltInputs = [...panel.querySelectorAll('[data-tilt]')];
  for (const input of tiltInputs) {
    input.addEventListener('input', () => {
      const [x, y] = tiltInputs.map(i => Number(i.value));
      engine.simulate('tilt', { x, y });
    });
    input.addEventListener('change', () => tiltInputs.forEach(i => (i.value = 0)));
  }

  panel.querySelector('[data-opt="zones"]').addEventListener('change', e => {
    document.body.classList.toggle('debug-zones', e.target.checked);
  });
  panel.querySelector('[data-opt="calibrate"]').addEventListener('change', e => calibration.toggle(e.target.checked));

  // ——— Статус, статистика, лог ———

  function renderStatus() {
    const { id, zone } = engine.screen;
    const season = engine.rules.season();
    out('status').innerHTML = `
      <span class="dbg__zone dbg__zone--${zone}">${zone === 'red' ? '🔴 красная зона' : '🟢 зелёная зона'}</span>
      экран <b>${id ?? '—'}</b> · конфиг: ${engine.source} ·
      сезон: ${SEASON_LABELS[season] || season} · звук: ${engine.sound.isMuted() ? 'выкл' : 'вкл'}`;
  }

  function renderStats() {
    const s = engine.stats();
    out('stats').textContent = `FPS ${s.fps} · частиц ${s.particles} · активно: ${s.active.join(', ') || '—'}`;
  }

  function addLine(item) {
    const li = document.createElement('li');
    const time = new Date(item.time || Date.now()).toLocaleTimeString('ru-RU');
    if (item.info) {
      li.className = 'is-info';
      li.textContent = `${time} ${item.info}`;
    } else if (item.event) {
      li.className = 'is-event';
      li.textContent = `${time} → ${item.event} ${item.payload}`;
    } else {
      li.className = item.ok ? 'is-ok' : 'is-skip';
      li.textContent = `${time} ${item.trigger} → ${item.id}: ${item.ok ? '✅' : `⏭ ${item.reason}`}`;
    }
    const log = out('log');
    log.prepend(li);
    while (log.children.length > 40) log.lastChild.remove();
  }

  engine.getLog().forEach(addLine);
  engine.onLog(item => {
    addLine(item);
    renderStatus();
  });
  bus.on('*', (payload, name) => {
    addLine({ event: name, payload: JSON.stringify(payload) });
    if (name === 'screen:open') renderStatus();
  });

  let statsTimer = 0;
  function setCollapsed(collapsed) {
    panel.classList.toggle('is-collapsed', collapsed);
    clearInterval(statsTimer);
    if (!collapsed) {
      renderStatus();
      renderStats();
      statsTimer = setInterval(renderStats, 500);
    }
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch {
      // не страшно
    }
  }

  let collapsed = matchMedia('(max-width: 899px)').matches;
  try {
    const saved = localStorage.getItem(COLLAPSED_KEY);
    if (saved != null) collapsed = saved === '1';
  } catch {
    // не страшно
  }
  setCollapsed(collapsed);

  const calibration = createCalibration(out('calib'));
  return panel;
}

// ——— Калибровка: тап → точка, протяжка → прямоугольник { x, y, w, h } в % от картинки экрана ———

function createCalibration(output) {
  const viewport = document.getElementById('viewport');
  let layer = null;
  let observer = null;
  let start = null;
  let box = null;

  function attach() {
    // На PNG-экране — полный кадр картинки (зоны в % от него), в заглушке — сам экран.
    const screen = viewport.querySelector('.screen__frame') || viewport.querySelector('.screen');
    if (!screen || screen.contains(layer)) return;
    layer = document.createElement('div');
    layer.className = 'dbg-calib';
    layer.addEventListener('pointerdown', onDown);
    layer.addEventListener('pointermove', onMove);
    layer.addEventListener('pointerup', onUp);
    screen.append(layer);
  }

  function percent(e) {
    const r = layer.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
  }

  function onDown(e) {
    layer.setPointerCapture(e.pointerId);
    start = percent(e);
    box?.remove();
    box = document.createElement('div');
    box.className = 'dbg-calib__box';
    layer.append(box);
    draw(start, start);
  }

  function onMove(e) {
    if (start) draw(start, percent(e));
  }

  function onUp(e) {
    if (!start) return;
    const end = percent(e);
    const rect = norm(start, end);
    start = null;
    const isPoint = rect.w < 1 && rect.h < 0.5;
    const text = isPoint
      ? `{ x: ${fix(end.x)}, y: ${fix(end.y)} }`
      : `{ x: ${fix(rect.x)}, y: ${fix(rect.y)}, w: ${fix(rect.w)}, h: ${fix(rect.h)} }`;
    copy(text).then(ok => {
      output.hidden = false;
      output.textContent = `${ok ? '📋 скопировано' : '✍️ скопируйте'}: ${text}`;
    });
  }

  function draw(a, b) {
    const r = norm(a, b);
    Object.assign(box.style, { left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` });
  }

  return {
    toggle(on) {
      document.body.classList.toggle('debug-calibrate', on);
      if (on) {
        attach();
        observer = new MutationObserver(attach);
        observer.observe(viewport, { childList: true, subtree: true });
        output.hidden = false;
        output.textContent = 'Тап — точка, протяжка — прямоугольник. Координаты в % от картинки экрана.';
      } else {
        observer?.disconnect();
        layer?.remove();
        layer = null;
        output.hidden = true;
      }
    },
  };
}

function norm(a, b) {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

function fix(v) {
  return Math.round(v * 10) / 10;
}

function copy(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).then(() => true, () => false);
  return Promise.resolve(false);
}

function loadStyles() {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./debug.css', import.meta.url).href;
  document.head.append(link);
}
