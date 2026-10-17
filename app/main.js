// Оболочка «СберKids»: изображает нативное приложение и отправляет события в шину.
// Про движок приколов знает только одно: его надо лениво загрузить после первой отрисовки.

import { createBus } from './bus.js';
import { SCREENS, TABS, TABBAR_ZONES, TASKS, MONEYBOXES, START_SCREEN, READY_IMAGES } from './screens.js';

const DEBUG = new URLSearchParams(location.search).get('debug') === '1';
const IMAGE_WAIT_MS = 400;

const bus = createBus();
const phone = document.getElementById('phone');
const viewport = document.getElementById('viewport');
const tabbar = document.getElementById('tabbar');

const state = {
  screen: null,
  balance: 1250,
  tasks: Object.fromEntries(TASKS.map(t => [t.id, t.done])),
  moneyboxes: MONEYBOXES.map(m => ({ ...m })),
  lastTopup: null,
  pending: [], // события, которые уйдут после ближайшего screen:open
};

const shell = {
  state,
  bus,
  engine: null,
  emit: (name, payload) => bus.emit(name, payload),
  current: () => state.screen,
  go,
  refresh,

  toggleTask(taskId) {
    const nowDone = !state.tasks[taskId];
    state.tasks[taskId] = nowDone;
    refresh();
    if (!nowDone) return;
    bus.emit('task:done', { taskId });
    if (TASKS.every(t => state.tasks[t.id])) {
      bus.emit('tasks:allDone', {});
      setTimeout(() => state.screen === 'tasks' && go('tasks_done'), 1300);
    }
  },

  completeAllTasks() {
    TASKS.forEach(t => (state.tasks[t.id] = true));
    state.pending.push(['tasks:allDone', {}]);
    if (state.screen === 'tasks_done') announce();
    else go('tasks_done');
  },

  resetTasks() {
    TASKS.forEach(t => (state.tasks[t.id] = false));
    go('tasks');
  },

  topup(moneyboxId) {
    const m = state.moneyboxes.find(x => x.id === moneyboxId);
    if (!m) return;
    if (m.saved >= m.goal) m.saved = 0; // для демо: полная копилка начинается заново
    const prevProgress = m.saved / m.goal;
    const amount = Math.min(m.goal - m.saved, Math.round(m.goal / 4));
    m.saved += amount;
    const progress = m.saved / m.goal;
    state.lastTopup = { moneyboxId, amount };
    state.pending.push(['moneybox:topup', { moneyboxId, progress, prevProgress }]);
    go('topup_success');
  },

  setBalance(value) {
    state.balance = value;
    refresh();
    bus.emit('balance:show', { value });
  },
};

// ——— Навигация (hash-роутинг: работает из подпапки GitHub Pages и с кнопкой «назад») ———

function screenFromHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  return SCREENS[id] ? id : START_SCREEN;
}

function go(id) {
  if (!SCREENS[id]) return console.warn(`[shell] нет экрана "${id}"`);
  if (id === state.screen) return;
  location.hash = id;
}

window.addEventListener('hashchange', () => render(screenFromHash()));

let renderToken = 0;

async function render(id) {
  const token = ++renderToken;
  const screen = SCREENS[id];
  const probe = loadImage(id);
  const image = await Promise.race([probe, wait(IMAGE_WAIT_MS).then(() => null)]);
  if (token !== renderToken) return;

  state.screen = id;
  phone.dataset.screen = id;
  phone.dataset.screenZone = screen.zone;
  mountScreen(screen, image);
  renderTabbar(screen.tab);
  viewport.scrollTop = 0;
  announce();

  // Картинка не успела — показали заглушку; подменим, как только загрузится.
  if (!image) {
    probe.then(img => {
      if (img && token === renderToken) mountScreen(screen, img);
    });
  }
}

function refresh() {
  const screen = SCREENS[state.screen];
  if (!screen) return;
  const top = viewport.scrollTop;
  mountScreen(screen, imageCache.get(state.screen)?.result ?? null);
  viewport.scrollTop = top;
}

function announce() {
  const screen = SCREENS[state.screen];
  bus.emit('screen:open', { screen: state.screen, zone: screen.zone });
  screen.onOpen?.(shell);
  for (const [name, payload] of state.pending.splice(0)) bus.emit(name, payload);
}

// ——— Отрисовка экрана: PNG + зоны, либо HTML-заглушка ———

function mountScreen(screen, image) {
  const root = document.createElement('div');
  root.className = 'screen';
  if (image) {
    root.classList.add('screen--image');
    root.style.aspectRatio = `${image.width} / ${image.height}`;
    root.append(imageEl(image, screen.title));
    for (const zone of screen.zones) root.append(...zoneEls(zone, image));
  } else {
    root.classList.add('screen--stub');
    root.innerHTML = screen.stub(state);
  }
  viewport.replaceChildren(root);
}

function renderTabbar(activeTab) {
  tabbar.hidden = !activeTab;
  if (!activeTab) return;
  const image = imageCache.get('tabbar')?.result;
  if (image) {
    tabbar.className = 'tabbar tabbar--image';
    tabbar.style.aspectRatio = `${image.width} / ${image.height}`;
    tabbar.replaceChildren(imageEl(image, ''), ...TABBAR_ZONES.flatMap(z => zoneEls(z, image)));
  } else {
    tabbar.className = 'tabbar';
    tabbar.style.aspectRatio = '';
    tabbar.innerHTML = TABS.map(t => `
      <button class="tab ${t.id === activeTab ? 'is-active' : ''}" data-tab="${t.id}" ${t.disabled ? 'disabled' : ''}>
        ${ICONS[t.icon]}<span>${t.label}</span>
      </button>`).join('');
  }
  tabbar.dataset.anchor = 'tabbar';
}

function imageEl(image, alt) {
  const img = document.createElement('img');
  img.className = 'screen__img';
  img.src = image.src;
  img.alt = alt;
  img.draggable = false;
  return img;
}

function zoneEls(zone, image) {
  const actionable = Boolean(zone.go || zone.tap || zone.tab);
  const el = document.createElement(actionable ? 'button' : 'div');
  el.className = 'zone';
  Object.assign(el.style, { left: `${zone.x}%`, top: `${zone.y}%`, width: `${zone.w}%`, height: `${zone.h}%` });
  if (zone.tab) el.dataset.tab = zone.tab;
  else if (actionable) el.dataset.zone = zone.id;
  if (zone.anchor) el.dataset.anchor = zone.anchor;
  if (actionable) el.setAttribute('aria-label', zone.label || zone.id);
  if (!zone.lift) return [el];

  // «Поднимаемый» якорь: кусочек картинки поверх подложки, чтобы его можно было анимировать.
  el.classList.add('zone--lift');
  el.style.backgroundImage = `url("${image.src}")`;
  el.style.backgroundSize = `${10000 / zone.w}% ${10000 / zone.h}%`;
  el.style.backgroundPosition = `${slicePos(zone.x, zone.w)}% ${slicePos(zone.y, zone.h)}%`;
  const hole = document.createElement('div');
  hole.className = 'zone zone--hole';
  Object.assign(hole.style, el.style, { backgroundImage: 'none', background: zone.fill || sampleFill(image, zone) });
  return [hole, el];
}

function slicePos(offset, size) {
  return size >= 100 ? 0 : (offset / (100 - size)) * 100;
}

// Средний цвет углов зоны — подложка под «поднятым» кусочком картинки.
function sampleFill(image, zone) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const g = canvas.getContext('2d', { willReadFrequently: true });
    const { width: W, height: H } = image;
    const inset = 0.04;
    const xs = [zone.x + zone.w * inset, zone.x + zone.w * (1 - inset)];
    const ys = [zone.y + zone.h * inset, zone.y + zone.h * (1 - inset)];
    const sum = [0, 0, 0];
    for (const x of xs) {
      for (const y of ys) {
        g.clearRect(0, 0, 1, 1);
        g.drawImage(image.img, (x / 100) * W - 1, (y / 100) * H - 1, 3, 3, 0, 0, 1, 1);
        const d = g.getImageData(0, 0, 1, 1).data;
        sum[0] += d[0]; sum[1] += d[1]; sum[2] += d[2];
      }
    }
    return `rgb(${sum.map(v => Math.round(v / 4)).join(',')})`;
  } catch {
    return 'var(--bg)';
  }
}

// ——— PNG экранов: грузим только перечисленные в READY_IMAGES (без лишних 404), один раз ———

const imageCache = new Map();

function loadImage(name) {
  if (!READY_IMAGES.includes(name)) return Promise.resolve(null);
  if (!imageCache.has(name)) {
    const entry = { result: null };
    const src = `screens/${name}.png`;
    entry.promise = new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve((entry.result = { src, img, width: img.naturalWidth, height: img.naturalHeight }));
      img.onerror = () => {
        console.warn(`[shell] ${src} указан в READY_IMAGES, но не загрузился — рисую заглушку`);
        resolve(null);
      };
      img.src = src;
    });
    imageCache.set(name, entry);
  }
  return imageCache.get(name).promise;
}

function preloadImages() {
  loadImage('tabbar').then(img => img && state.screen && renderTabbar(SCREENS[state.screen].tab));
  READY_IMAGES.forEach(loadImage);
}

// ——— Ввод ———

phone.addEventListener('click', e => {
  const tabEl = e.target.closest('[data-tab]');
  if (tabEl) {
    const tab = TABS.find(t => t.id === tabEl.dataset.tab);
    if (tab && !tab.disabled) go(tab.id);
    return;
  }
  const zoneEl = e.target.closest('[data-zone]');
  if (!zoneEl) return;
  const zone = SCREENS[state.screen].zones.find(z => z.id === zoneEl.dataset.zone);
  if (!zone) return;
  if (zone.go) go(zone.go);
  zone.tap?.(shell);
});

// Системные помехи: контекстное меню на долгом нажатии и pinch-zoom в Safari.
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('gesturestart', e => e.preventDefault());

// ——— Запуск ———

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const ICONS = {
  home: '<svg viewBox="0 0 24 24"><path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/></svg>',
  jar: '<svg viewBox="0 0 24 24"><path d="M8 3h8v3l2 3v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9l2-3z"/><path d="M8 6h8"/></svg>',
  chat: '<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4z"/></svg>',
  check: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 12l3 3 5-6"/></svg>',
  play: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9l5 3-5 3z"/></svg>',
};

// Движок приколов грузится после первой отрисовки и не может сломать оболочку.
let engineRequested = false;

function loadEngine() {
  if (engineRequested) return;
  engineRequested = true;
  import('../engine/engine.js')
    .then(engine => engine.boot({ bus, host: phone, configUrl: 'content/config.json' }))
    .then(engine => {
      shell.engine = engine;
      if (DEBUG) return import('./debug.js').then(debug => debug.mountDebug({ shell, bus, engine }));
    })
    .then(() => {
      if (!shell.engine) return;
      if (state.screen) announce(); // движок пропустил первый screen:open
      announceFirstOpenToday();
    })
    .catch(err => console.warn('[shell] движок приколов не запустился — приложение работает без него', err));
}

function announceFirstOpenToday() {
  const now = new Date();
  const day = now.toDateString();
  try {
    if (localStorage.getItem('sberkids.lastOpenDay') === day) return;
    localStorage.setItem('sberkids.lastOpenDay', day);
  } catch {
    return;
  }
  bus.emit('app:firstOpenToday', { hour: now.getHours() });
}

if (!location.hash) history.replaceState(null, '', `#${START_SCREEN}`);
preloadImages();
render(screenFromHash()).then(() => {
  requestAnimationFrame(() => setTimeout(loadEngine, 0));
  setTimeout(loadEngine, 300); // rAF не приходит в фоновой вкладке
});
if (DEBUG) window.sberKids = shell;
