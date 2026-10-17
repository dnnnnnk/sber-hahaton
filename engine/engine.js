// Движок приколов. Знает только события шины, сенсоры, правила и слой эффектов (stage).
// Ничего не решает сам — исполняет конфиг. boot() — запуск из оболочки, init() — сам движок.

import { triggers } from './triggers/index.js';
import { effects } from './effects/index.js';
import { createRules } from './rules.js';
import { createStage } from './stage.js';
import { createHaptics } from './haptics.js';
import { createSound } from './sound.js';
import { createSensors, PERMISSION_SOURCES } from './sensors.js';
import { createUi } from './ui.js';
import { createCollection } from './collection.js';
import { fetchConfig, readOverride, validateConfig, isContentPath, OVERRIDE_KEY, DEFAULT_SETTINGS } from './config.js';

const LOG_LIMIT = 60;
const DEFAULT_DURATION_MS = 5000;
const SAFETY_EXTRA_MS = 1500;
const FADE_SAFETY_MS = 900;

// Запуск из оболочки: слой эффектов + конфиг (override из CMS или content/config.json) + горячая перезагрузка.
export async function boot({ bus, host, configUrl }) {
  loadStyles();
  const stage = createStage(host);
  const baseUrl = new URL(configUrl, document.baseURI).href;
  const engine = init(null, bus, stage, { baseUrl });

  async function reloadFromSources() {
    const override = readOverride();
    if (override) return engine.reload(override, 'CMS');
    try {
      engine.reload(await fetchConfig(baseUrl), 'config.json');
    } catch (err) {
      console.warn('[prikoly] config.json не загрузился — приколы выключены', err);
      engine.reload(null, 'нет конфига');
    }
  }

  await reloadFromSources();
  // CMS в соседней вкладке сохранила/сбросила override → пересобираемся без перезагрузки страницы.
  window.addEventListener('storage', e => {
    if (e.key === OVERRIDE_KEY || e.key === null) reloadFromSources();
  });
  engine.reloadFromSources = reloadFromSources;
  return engine;
}

export function init(rawConfig, bus, stage, { baseUrl = document.baseURI } = {}) {
  let config = { version: 1, settings: { ...DEFAULT_SETTINGS }, prikoly: [] };
  let source = 'нет конфига';
  const settings = () => config.settings;
  const rules = createRules(settings);
  const haptics = createHaptics(() => settings().haptics);
  const sound = createSound(() => settings().sound);
  const sensors = createSensors();
  const ui = createUi(stage);
  const collection = createCollection();
  const screen = { id: null, zone: 'green' };
  const active = new Map(); // id прикола → { handle, fullscreen, priority, timer }
  const fading = new Set(); // мягко гаснущие эффекты: красная зона и CMS обрывают их сразу
  const log = [];
  const logListeners = new Set();
  let entries = []; // { prikol, fullscreen, dispose }
  let disposeAlbumGesture = null;
  let pending = [];

  const currentScreen = () => ({ ...screen });
  const triggerCtx = { bus, stage, sensors, settings, screen: currentScreen };

  bus.on('screen:open', ({ screen: id, zone }) => {
    screen.id = id;
    screen.zone = zone === 'red' ? 'red' : 'green';
    ui.positionChip(screen.zone !== 'red');
    if (screen.zone === 'red') {
      pending = [];
      stopAll('красная зона');
      ui.hideToast();
      ui.closeAlbum(true);
    } else {
      for (const [key, run] of active) {
        if (run.screens && !run.screens.includes(id)) stopEffect(key, 'другой экран');
      }
    }
  });

  // ——— Сборка триггеров из конфига ———

  function build() {
    for (const entry of entries) safely(() => entry.dispose?.());
    entries = config.prikoly
      .filter(prikol => prikol.enabled)
      .map(prikol => {
        const entry = { prikol, fullscreen: isFullscreen(prikol.effect), dispose: null };
        try {
          entry.dispose = triggers[prikol.trigger.type].create(prikol.trigger, triggerCtx, payload => fire(entry, payload));
        } catch (err) {
          console.warn(`[prikoly] триггер «${prikol.id}» не создан`, err);
        }
        return entry;
      });

    // Альбом коллекции — долгое нажатие на якорь из settings.albumAnchor (по умолчанию аватар).
    disposeAlbumGesture?.();
    disposeAlbumGesture = triggers.longpress.create({ anchor: settings().albumAnchor }, triggerCtx, () => {
      if (screen.zone !== 'red') openAlbum();
    });
  }

  function openAlbum() {
    if (screen.zone === 'red') return;
    const found = new Set(collection.ids());
    const items = config.prikoly
      .filter(p => p.enabled || found.has(p.id))
      .map(p => ({ id: p.id, title: p.title, icon: p.icon, hint: p.hint, found: found.has(p.id) }));
    haptics.play('light');
    ui.openAlbum({
      items,
      muted: sound.isMuted(),
      onToggleMute: () => {
        sound.setMuted(!sound.isMuted());
        return sound.isMuted();
      },
    });
  }

  function reload(raw, from = 'конфиг') {
    const result = validateConfig(raw);
    result.warnings.forEach(w => console.warn(`[prikoly] ${w}`));
    if (result.errors.length) console.warn(`[prikoly] конфиг не принят: ${result.errors.join('; ')} — приколы выключены`);
    pending = [];
    stopAll('конфиг обновлён');
    config = result.config;
    source = from;
    build();
    updatePermissionUi();
    info(`🔄 конфиг из ${from}: ${entries.length} из ${config.prikoly.length} приколов включено`);
    return result;
  }

  // ——— Разрешение датчиков (iOS) и разблокировка звука: первым же касанием или чипом ———

  function usesMotion() {
    return entries.some(e => {
      const variants = e.prikol.effect.variants ?? [e.prikol.effect];
      const sources = [triggers[e.prikol.trigger.type], ...variants.map(v => effects[v.type])];
      return sources.some(def => def.sensors?.some(s => PERMISSION_SOURCES.includes(s)));
    });
  }

  function updatePermissionUi() {
    if (sensors.needsPermission() && usesMotion()) ui.showChip(onGesture);
    else ui.hideChip();
  }

  function onGesture() {
    sound.unlock();
    if (sensors.needsPermission() && usesMotion()) {
      sensors.requestPermission().then(result => {
        if (result !== 'unknown') info(`📱 датчики движения: ${result === 'granted' ? 'разрешены' : 'запрещены'}`);
        updatePermissionUi();
      });
    }
  }

  for (const type of ['touchend', 'click']) document.addEventListener(type, onGesture, { capture: true, passive: true });

  // ——— Срабатывание: копим кандидатов одного «тика» и решаем разом (приоритеты) ———

  function fire(entry, payload = {}) {
    const running = active.get(entry.prikol.id);
    if (running?.handle.update) {
      if (screen.zone !== 'red') safely(() => running.handle.update(payload));
      return;
    }
    pending.push({ entry, payload });
    if (pending.length === 1) queueMicrotask(flush);
  }

  function flush() {
    const batch = [];
    for (const c of pending.splice(0)) {
      if (!batch.some(b => b.entry === c.entry)) batch.push(c);
    }
    const now = Date.now();
    const date = new Date(now);
    const passed = [];
    for (const c of batch) {
      const verdict = rules.check(c.entry.prikol, { screen, fullscreen: c.entry.fullscreen, now, date });
      if (verdict.ok) passed.push(c);
      else decision(c, false, verdict.reason);
    }
    // Неэксклюзивные приколы (exclusive: false — жилец, вехи поверх звезды) не соревнуются за приоритет.
    for (const c of passed.filter(c => c.entry.prikol.exclusive === false)) start(c, now);
    const contest = passed.filter(c => c.entry.prikol.exclusive !== false);
    contest.sort((a, b) => b.entry.prikol.priority - a.entry.prikol.priority);
    // Победителю не на чем играть (нет якоря, кармашки за краем) — пробуем следующего подходящего.
    let winner = null;
    for (const c of contest) {
      if (winner) decision(c, false, `уступил «${winner.entry.prikol.id}» по приоритету`);
      else if (start(c, now)) winner = c;
    }
  }

  // true — эффект запущен; false — пропущен (причина уже в логе).
  function start(c, now) {
    const { prikol, fullscreen } = c.entry;
    const userAction = prikol.trigger.type === 'event';
    if (active.has(prikol.id)) {
      if (!userAction) return decision(c, false, 'уже играет'), false;
      fadeEffect(prikol.id, 'повтор действия');
    }
    if (fullscreen) {
      const current = [...active.entries()].find(([, run]) => run.fullscreen);
      // Новое действие ребёнка мягко гасит предыдущий эффект того же или меньшего приоритета.
      if (current && (userAction ? current[1].priority > prikol.priority : current[1].priority >= prikol.priority)) {
        return decision(c, false, `уже идёт «${current[0]}»`), false;
      }
      if (current && userAction) fadeEffect(current[0], `сменён «${prikol.id}»`);
      else if (current) stopEffect(current[0], `прерван «${prikol.id}»`);
    }

    const spec = pickVariant(prikol.effect);
    const def = effects[spec.type];
    const params = fillTemplate(spec.params || {}, c.payload);
    const run = { handle: null, fullscreen, priority: prikol.priority, screens: prikol.screens, timer: 0 };
    let ended = false;
    const end = () => {
      if (ended) return;
      ended = true;
      clearTimeout(run.timer);
      if (active.get(prikol.id) === run) active.delete(prikol.id);
    };
    const ctx = {
      stage,
      settings: settings(),
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      asset: src => {
        if (!isContentPath(src)) throw new Error('ассет должен находиться внутри content/');
        return new URL(src, baseUrl).href;
      },
      haptics,
      sound,
      sensors,
      // Эффект может слушать события оболочки (жилец реагирует на дела), но не отправлять их.
      events: { on: (name, fn) => bus.on(name, fn) },
      screen: currentScreen,
      payload: c.payload,
      end,
    };

    try {
      run.handle = def.play(params, ctx);
    } catch (err) {
      console.error(`[prikoly] эффект «${prikol.id}» упал`, err);
      run.handle = null;
    }
    if (!run.handle) {
      end();
      return decision(c, false, 'эффекту не на чем играть (нет якоря?)'), false;
    }
    if (!ended) {
      active.set(prikol.id, run);
      // Постоянный эффект (жилец без durationMs) живёт до ухода на красный/неподходящий экран.
      if (!run.handle.persistent) {
        run.timer = setTimeout(
          () => stopEffect(prikol.id, 'не уложился в durationMs'),
          (run.handle.durationMs ?? params.durationMs ?? DEFAULT_DURATION_MS) + SAFETY_EXTRA_MS,
        );
      }
    }

    rules.commit(prikol, fullscreen, now);
    haptics.play(prikol.haptic);
    if (prikol.sound) run.stopSound = sound.play(ctx.asset(prikol.sound));
    decision(c, true);
    if (collection.add(prikol.id)) ui.toast(`✨ Новая находка: ${prikol.title}`);
    return true;
  }

  function stopEffect(id, reason) {
    const run = active.get(id);
    if (!run) return;
    active.delete(id);
    clearTimeout(run.timer);
    run.stopSound?.();
    safely(() => run.handle.stop());
    info(`⏹ ${id}: ${reason}`);
  }

  // Мягкое завершение: эффект перестаёт считаться активным сразу, а частицы досгорают сами (≤ 0,5 с).
  function fadeEffect(id, reason) {
    const run = active.get(id);
    if (!run) return;
    if (!run.handle.fade) return stopEffect(id, reason);
    active.delete(id);
    clearTimeout(run.timer);
    const handle = run.handle;
    const done = () => {
      fading.delete(done);
      safely(() => handle.stop());
    };
    fading.add(done);
    safely(() => handle.fade());
    setTimeout(done, FADE_SAFETY_MS);
    info(`⏹ ${id}: ${reason}`);
  }

  function stopAll(reason) {
    for (const id of [...active.keys()]) stopEffect(id, reason);
    for (const done of [...fading]) done();
    sound.stopAll();
    haptics.stop();
  }

  // ——— Лог решений (для debug-панели) ———

  function decision(c, ok, reason = '') {
    const { prikol } = c.entry;
    const trigger = prikol.trigger.type === 'event' ? prikol.trigger.name : prikol.trigger.type;
    push({ ok, trigger, id: prikol.id, title: prikol.title, reason });
  }

  function info(text) {
    push({ info: text });
  }

  function push(item) {
    item.time = Date.now();
    log.push(item);
    if (log.length > LOG_LIMIT) log.shift();
    for (const fn of logListeners) safely(() => fn(item));
  }

  return {
    stage,
    rules,
    sound,
    sensors,
    ui,
    get config() { return config; },
    get source() { return source; },
    get screen() { return { ...screen }; },
    reload,
    stopAll,

    // Debug: «как будто сработал триггер» — для сенсоров, которых нет на десктопе.
    simulate(type, payload = {}) {
      const matching = entries.filter(e => e.prikol.trigger.type === type);
      if (!matching.length) info(`${type}: нет включённых приколов с таким триггером`);
      matching.forEach(entry => fire(entry, payload));
    },

    // Предпросмотр одного прикола с обычными проверками зоны, экрана и кулдаунов.
    simulateEntry(id, payload = {}) {
      const entry = entries.find(e => e.prikol.id === id);
      if (entry) fire(entry, payload);
      else info(`${id}: прикол выключен или отсутствует`);
    },

    setSeason(value) {
      rules.setSeasonOverride(value);
      info(`🗓 сезон: ${value || 'как в конфиге'}`);
    },

    // Режим ведущего: всё состояние приколов в исходное — коллекция, кулдауны, лимиты, сезон, звук, Капля.
    resetDemo() {
      pending = [];
      stopAll('сброс демо');
      ui.hideToast();
      ui.closeAlbum(true);
      collection.reset();
      rules.resetCooldowns();
      rules.resetDaily();
      rules.setSeasonOverride(null);
      sound.setMuted(false);
      for (const def of Object.values(effects)) safely(() => def.reset?.());
      info('🔄 демо сброшено: коллекция, кулдауны, лимиты, сезон, звук, Капля');
      // Постоянные жильцы возвращаются сразу, без перехода между экранами.
      if (screen.zone !== 'red') build();
    },

    collection,
    openAlbum,
    closeAlbum: () => ui.closeAlbum(),
    resetCollection() {
      collection.reset();
      info('🧹 коллекция сброшена');
    },

    getLog: () => [...log],
    onLog(fn) {
      logListeners.add(fn);
      return () => logListeners.delete(fn);
    },

    stats: () => ({ ...stage.stats(), active: [...active.keys()] }),
  };
}

// ——— Вспомогательное ———

function isFullscreen(effect) {
  return (effect.variants ?? [effect]).some(v => effects[v.type]?.fullscreen);
}

// Варианты — только визуальное разнообразие, не награда.
function pickVariant(effect) {
  if (!effect.variants) return effect;
  return effect.variants[Math.floor(Math.random() * effect.variants.length)];
}

// "{taskId}" в строковых параметрах → значение из события.
function fillTemplate(value, payload) {
  if (typeof value === 'string') return value.replace(/\{(\w+)\}/g, (m, key) => (payload[key] ?? m));
  if (Array.isArray(value)) return value.map(v => fillTemplate(v, payload));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fillTemplate(v, payload)]));
  }
  return value;
}

function safely(fn) {
  try {
    fn();
  } catch (err) {
    console.error('[prikoly]', err);
  }
}

function loadStyles() {
  const href = new URL('./engine.css', import.meta.url).href;
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.append(link);
}
