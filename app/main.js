// Оболочка «СберKids»: изображает нативное приложение и отправляет события в шину.
// Про движок приколов знает только одно: его надо лениво загрузить после первой отрисовки.

import { createBus } from './bus.js';
import {
  SCREENS, TABS, TABBAR, TASKS, MONEYBOXES, START_SCREEN, READY_IMAGES, DESIGN_WIDTH, IMAGE_CHROME,
} from './screens.js';

const DEBUG = new URLSearchParams(location.search).get('debug') === '1';
const IMAGE_WAIT_MS = 400;

const bus = createBus();
const phone = document.getElementById('phone');
const viewport = document.getElementById('viewport');
const tabbar = document.getElementById('tabbar');

const state = {
  screen: null,
  balance: 800.55,
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
  const previous = state.screen;
  // Финансовый экран гасит эффекты до ожидания картинки, включая холодный переход.
  if (screen.zone === 'red') bus.emit('screen:open', { screen: id, zone: screen.zone });
  const probe = screen.preferStub ? Promise.resolve(null) : loadImage(id);
  // Картинку экрана (и таббара) ждём недолго — иначе рисуем заглушку и подменяем, когда догрузится.
  const ready = Promise.all([probe, screen.tab ? loadImage(TABBAR.image) : null]);
  const image = await Promise.race([ready.then(([img]) => img), wait(IMAGE_WAIT_MS).then(() => null)]);
  if (token !== renderToken) return;

  state.screen = id;
  phone.dataset.screen = id;
  phone.dataset.screenZone = screen.zone;
  mountScreen(screen, image);
  if (previous && previous !== id && screen.zone !== 'red') {
    const from = TABS.findIndex(t => t.id === SCREENS[previous].tab);
    const to = TABS.findIndex(t => t.id === screen.tab);
    const root = viewport.firstElementChild;
    root.style.setProperty('--enter-x', `${from >= 0 && to >= 0 && to < from ? -12 : 12}px`);
    root.classList.add('screen--enter');
  }
  renderTabbar(screen.tab);
  viewport.scrollTop = 0;
  announce();

  ready.then(([img]) => {
    if (token !== renderToken) return;
    if (img && !image) mountScreen(screen, img);
    renderTabbar(screen.tab);
  });
}

function refresh() {
  const screen = SCREENS[state.screen];
  if (!screen) return;
  const top = viewport.scrollTop;
  mountScreen(screen, screen.preferStub ? null : imageCache.get(state.screen)?.result ?? null);
  viewport.scrollTop = top;
}

function announce() {
  const screen = SCREENS[state.screen];
  bus.emit('screen:open', { screen: state.screen, zone: screen.zone });
  screen.onOpen?.(shell);
  for (const [name, payload] of state.pending.splice(0)) bus.emit(name, payload);
}

// ——— Отрисовка экрана: PNG + зоны, либо HTML-заглушка ———

// pt макета → % ширины кадра (в этих единицах работают margin/padding, поэтому обрезка масштабируется сама).
const widthPct = pt => `${(pt / DESIGN_WIDTH) * 100}%`;

function mountScreen(screen, image) {
  const root = document.createElement('div');
  root.className = 'screen';
  root.setAttribute('aria-label', screen.title);
  if (image) {
    // Кадр — картинка целиком (зоны в % от неё); .screen обрезает нарисованные статус-бар,
    // home indicator и таббар (см. IMAGE_CHROME и cropBottom в screens.js).
    const heightPt = (image.height / image.width) * DESIGN_WIDTH;
    const cropBottom = screen.cropBottom || 0;
    root.classList.add('screen--image');
    root.classList.toggle('has-tabbar', Boolean(screen.tab));
    root.style.setProperty('--crop-top', widthPct(IMAGE_CHROME.statusBar));
    root.style.setProperty('--crop-bottom', widthPct(cropBottom));
    root.style.setProperty('--crop-bottom-mobile', widthPct(cropBottom || IMAGE_CHROME.homeIndicator));
    root.style.background = sampleColor(image, [[1, ((heightPt - cropBottom - 2) / heightPt) * 100]]);
    const frame = document.createElement('div');
    frame.className = 'screen__frame';
    frame.style.aspectRatio = `${image.width} / ${image.height}`;
    frame.append(imageEl(image, screen.a11y || screen.title));
    for (const patch of screen.patches || []) frame.append(patchEl(patch));
    for (const zone of screen.zones) frame.append(...zoneEls(zone, image));
    const crop = document.createElement('div');
    crop.className = 'screen__crop';
    crop.append(frame);
    root.append(crop);
    if (screen.afterImage) root.insertAdjacentHTML('beforeend', `<div class="screen__extra">${screen.afterImage(state)}</div>`);
  } else {
    root.classList.add('screen--stub');
    root.innerHTML = screen.stub(state);
  }
  viewport.replaceChildren(root);
}

function renderTabbar(activeTab) {
  tabbar.hidden = !activeTab;
  if (!activeTab) return;
  const image = imageCache.get(TABBAR.image)?.result;
  if (image) {
    tabbar.className = 'tabbar tabbar--image';
    tabbar.removeAttribute('data-anchor');
    tabbar.style.setProperty('--crop-bottom-mobile', widthPct(IMAGE_CHROME.homeIndicator));
    const frame = document.createElement('div');
    frame.className = 'tabbar__frame';
    frame.style.aspectRatio = `${image.width} / ${image.height}`;
    frame.append(imageEl(image, ''), ...activeTabSlices(activeTab));
    frame.append(...zoneEls({ id: 'tabbar', anchor: 'tabbar', ...TABBAR.pill }, image));
    for (const zone of TABBAR.zones) frame.append(...zoneEls(zone, image));
    tabbar.replaceChildren(frame);
  } else {
    tabbar.className = 'tabbar';
    tabbar.dataset.anchor = 'tabbar';
    tabbar.innerHTML = TABS.map(t => `
      <button class="tab ${t.id === activeTab ? 'is-active' : ''}" data-tab="${t.id}" ${t.disabled ? 'disabled' : ''}>
        ${ICONS[t.icon]}<span>${t.label}</span>
      </button>`).join('');
  }
}

// Активная вкладка: кусочки других экранов поверх tabbar.webp (см. TABBAR.active в screens.js).
function activeTabSlices(activeTab) {
  return (TABBAR.active[activeTab] || []).flatMap(part => {
    const source = imageCache.get(part.from)?.result;
    if (!source) {
      loadImage(part.from).then(img => img && SCREENS[state.screen]?.tab === activeTab && renderTabbar(activeTab));
      return [];
    }
    const sourceHeight = (source.height / source.width) * DESIGN_WIDTH;
    const top = sourceHeight - TABBAR.height + part.y;
    const el = document.createElement('div');
    el.className = 'tabbar__slice';
    const w = (part.w / DESIGN_WIDTH) * 100; // ширина одинакова у таббара и источника (оба 375 pt)
    const sliceH = (part.h / sourceHeight) * 100;
    Object.assign(el.style, {
      left: widthPct(part.toX ?? part.x),
      top: `${(part.y / TABBAR.height) * 100}%`,
      width: `${w}%`,
      height: `${(part.h / TABBAR.height) * 100}%`,
      backgroundImage: `url("${source.src}")`,
      backgroundSize: `${10000 / w}% ${10000 / sliceH}%`,
      backgroundPosition: `${slicePos((part.x / DESIGN_WIDTH) * 100, w)}% ${slicePos((top / sourceHeight) * 100, sliceH)}%`,
    });
    return [el];
  });
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
  if (zone.x == null) return []; // зона есть только в заглушке / HTML-дополнении
  const actionable = Boolean(zone.go || zone.tap || zone.tab);
  const el = document.createElement(actionable ? 'button' : 'div');
  const box = { left: `${zone.x}%`, top: `${zone.y}%`, width: `${zone.w}%`, height: `${zone.h}%` };
  el.className = 'zone';
  Object.assign(el.style, box);
  if (zone.tab) el.dataset.tab = zone.tab;
  else if (actionable) el.dataset.zone = zone.id;
  if (zone.anchor) el.dataset.anchor = zone.anchor;
  if (zone.progress) el.dataset.progress = String(zone.progress(state));
  if (actionable) {
    el.setAttribute('aria-label', zone.label || zone.id);
    if (zone.tab && TABS.find(tab => tab.id === zone.tab)?.disabled) el.disabled = true;
    if (zone.tab === state.screen) el.setAttribute('aria-current', 'page');
  } else if (zone.label) {
    el.setAttribute('role', zone.keyboardAction ? 'button' : 'img');
    el.setAttribute('aria-label', zone.label);
    if (zone.keyboardAction) el.tabIndex = 0;
  }
  if (zone.done) {
    const done = zone.done(state);
    el.classList.toggle('is-done', done);
    if (actionable) el.setAttribute('aria-pressed', String(done));
  }
  if (!zone.lift) return [el];

  // «Поднимаемый» якорь: кусочек картинки поверх подложки, чтобы его можно было анимировать.
  el.classList.add('zone--lift');
  el.classList.toggle('zone--round', Boolean(zone.round));
  el.style.backgroundImage = `url("${image.src}")`;
  el.style.backgroundSize = `${10000 / zone.w}% ${10000 / zone.h}%`;
  el.style.backgroundPosition = `${slicePos(zone.x, zone.w)}% ${slicePos(zone.y, zone.h)}%`;
  const hole = document.createElement('div');
  hole.className = `zone zone--hole${zone.round ? ' zone--round' : ''}`;
  Object.assign(hole.style, box, { background: zone.fill || cornerColor(image, zone) });
  return [hole, el];
}

// Нейтральные плашки поверх фрагментов исходного макета с чужими брендами/персонажами.
// Это часть оболочки, не движка: плашки не принимают ввод, а интерактивные зоны остаются поверх них.
function patchEl(patch) {
  const el = document.createElement('div');
  el.className = `screen-patch ${patch.className || ''}`;
  Object.assign(el.style, {
    left: `${patch.x}%`, top: `${patch.y}%`, width: `${patch.w}%`, height: `${patch.h}%`,
  });
  if (patch.image && patch.imageRect) {
    const r = patch.imageRect;
    el.style.backgroundImage = `url("${patch.image}")`;
    el.style.backgroundSize = `${10000 / r.w}% ${10000 / r.h}%`;
    el.style.backgroundPosition = `${slicePos(r.x, r.w)}% ${slicePos(r.y, r.h)}%`;
  }
  const html = typeof patch.html === 'function' ? patch.html(state) : patch.html;
  if (html) el.innerHTML = html;
  return el;
}

function slicePos(offset, size) {
  return size >= 100 ? 0 : (offset / (100 - size)) * 100;
}

// Средний цвет углов зоны — подложка под «поднятым» кусочком картинки.
function cornerColor(image, zone) {
  const xs = [zone.x + zone.w * 0.04, zone.x + zone.w * 0.96];
  const ys = [zone.y + zone.h * 0.04, zone.y + zone.h * 0.96];
  return sampleColor(image, xs.flatMap(x => ys.map(y => [x, y])));
}

// Средний цвет картинки в точках (в % от её размеров).
function sampleColor(image, points) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const g = canvas.getContext('2d', { willReadFrequently: true });
    const sum = [0, 0, 0];
    for (const [x, y] of points) {
      g.clearRect(0, 0, 1, 1);
      g.drawImage(image.img, (x / 100) * image.width - 1, (y / 100) * image.height - 1, 3, 3, 0, 0, 1, 1);
      const d = g.getImageData(0, 0, 1, 1).data;
      sum[0] += d[0]; sum[1] += d[1]; sum[2] += d[2];
    }
    return `rgb(${sum.map(v => Math.round(v / points.length)).join(',')})`;
  } catch {
    return 'var(--bg)';
  }
}

// ——— Картинки экранов: грузим только перечисленные в READY_IMAGES (без лишних 404), один раз ———

const imageCache = new Map();
// id картинки (имя без расширения) → файл в screens/: 'content' → 'content.webp'
const imageFiles = new Map(READY_IMAGES.map(file => [file.replace(/\.[^.]+$/, ''), file]));

function loadImage(name) {
  const file = imageFiles.get(name);
  if (!file) return Promise.resolve(null);
  if (!imageCache.has(name)) {
    const entry = { result: null };
    const src = `screens/${file}`;
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

// Остальные картинки — после первого экрана и по одной, чтобы не отнимать у него сеть.
async function preloadImages() {
  for (const name of imageFiles.keys()) await loadImage(name);
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
render(screenFromHash()).then(() => {
  requestAnimationFrame(() => setTimeout(loadEngine, 0));
  setTimeout(loadEngine, 300); // rAF не приходит в фоновой вкладке
  setTimeout(preloadImages, 500);
});
if (DEBUG) window.sberKids = shell;
