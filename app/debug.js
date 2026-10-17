// Debug-панель (?debug=1): имитация сенсоров, лог решений движка, FPS, подсветка зон и якорей, калибровка.
// Инструмент разработчика оболочки — к движку обращается только через его публичный API.

const COLLAPSED_KEY = 'sberkids.debugCollapsed';
const SEASONS = ['auto', 'autumn', 'winter', 'spring'];
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
      <div class="dbg__stats" data-out="stats"></div>
      <div class="dbg__grid">
        <button type="button" data-act="shake">📳 Тряхнуть</button>
        <button type="button" data-act="flip">🙃 Перевернуть</button>
        <button type="button" data-act="still">🛌 Лежит</button>
        <button type="button" data-act="balance">💰 Баланс 1111</button>
        <button type="button" data-act="allDone">✅ Все дела выполнены</button>
        <button type="button" data-act="season">🗓 Сменить сезон</button>
        <button type="button" data-act="album">📒 Открыть альбом</button>
        <button type="button" data-act="resetCollection">🧹 Сбросить коллекцию</button>
        <button type="button" data-act="cooldowns">⏱ Сбросить кулдауны</button>
        <button type="button" data-act="mute">🔊 Звук</button>
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
    flip: () => engine.simulate('flip', { downMs: 800 }),
    still: () => engine.simulate('still', { seconds: 10 }),
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
  });

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
