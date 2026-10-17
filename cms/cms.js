// Мини-CMS: правим конфиг приколов без релиза. «Сохранить» пишет override в localStorage —
// приложение в соседней вкладке (и превью справа) получает событие storage и пересобирает движок сразу.
// Проверка — тем же validateConfig, что и в движке.

import { validateConfig, fetchConfig, OVERRIDE_KEY } from '../engine/config.js';

const CONFIG_URL = 'content/config.json';

const $ = id => document.getElementById(id);
const listEl = $('list');
const jsonEl = $('json');
const reportEl = $('report');
const statusEl = $('status');
const sourceEl = $('source');
const preview = $('preview');

let draft = null; // конфиг, который редактируем (как есть, без нормализации)
let saved = ''; // снимок последнего сохранённого состояния — для «есть изменения»
let source = 'config.json';
let tab = 'list';
let jsonBroken = false;

// ——— Загрузка ———

async function load() {
  const override = readOverride();
  if (override) {
    try {
      draft = JSON.parse(override);
      source = 'CMS';
    } catch {
      draft = null;
    }
  }
  if (!draft) {
    draft = await fetchConfig(CONFIG_URL);
    source = 'config.json';
  }
  saved = JSON.stringify(draft);
  renderAll();
}

function readOverride() {
  try {
    return localStorage.getItem(OVERRIDE_KEY);
  } catch {
    return null;
  }
}

// ——— Отрисовка ———

function renderAll() {
  renderSource();
  renderSettings();
  renderList();
  if (tab === 'json') renderJson();
}

function renderSource() {
  const dirty = JSON.stringify(draft) !== saved;
  sourceEl.textContent = `${source === 'CMS' ? 'Черновик из CMS' : 'Исходный config.json'}${dirty ? ' · есть несохранённые изменения' : ''}`;
  sourceEl.classList.toggle('is-dirty', dirty);
}

function renderSettings() {
  const s = draft.settings || {};
  for (const input of document.querySelectorAll('#season input')) input.checked = input.value === (s.season || 'auto');
  for (const input of document.querySelectorAll('[data-setting]')) {
    const value = s[input.dataset.setting];
    if (input.type === 'checkbox') input.checked = value !== false;
    else input.value = value ?? 3000;
  }
}

function renderList() {
  const prikoly = Array.isArray(draft.prikoly) ? draft.prikoly : [];
  listEl.innerHTML = prikoly.map((p, i) => `
    <article class="item ${p.enabled === false ? 'is-off' : ''}" data-index="${i}">
      <div class="item__head">
        <input class="item__icon" data-field="icon" value="${attr(p.icon || '✨')}" maxlength="4" aria-label="Иконка">
        <input class="item__title" data-field="title" value="${attr(p.title || '')}" placeholder="Название" aria-label="Название">
        <label class="switch" title="Включён">
          <input type="checkbox" data-field="enabled" ${p.enabled === false ? '' : 'checked'}><span></span>
        </label>
      </div>
      <div class="item__meta">${html(describe(p))}</div>
      <div class="item__fields">
        <label class="field">
          <span class="field__label">Подсказка в альбоме</span>
          <input data-field="hint" value="${attr(p.hint || '')}" placeholder="Например: А что, если перевернуть телефон?">
        </label>
        <label class="field field--short">
          <span class="field__label">Кулдаун, мс</span>
          <input type="number" min="0" step="500" data-field="cooldownMs" value="${Number(p.cooldownMs) || 0}">
        </label>
      </div>
    </article>`).join('') || '<p class="hint">В конфиге нет приколов.</p>';
}

function describe(p) {
  const t = p.trigger || {};
  const where = t.where ? ` (${Object.entries(t.where).map(([k, v]) => `${k} ${typeof v === 'object' ? JSON.stringify(v) : `= ${v}`}`).join(', ')})` : '';
  const trigger = t.type === 'event' ? `${t.name}${where}` : t.type;
  const effects = p.effect?.variants ? p.effect.variants.map(v => v.type).join(' | ') : p.effect?.type;
  const parts = [p.id, `${trigger} → ${effects}`];
  parts.push(`экраны: ${p.screens?.length ? p.screens.join(', ') : 'все зелёные'}`);
  if (p.schedule?.dateRange) parts.push(`даты: ${p.schedule.dateRange}`);
  if (p.schedule?.timeOfDay) parts.push(`время: ${p.schedule.timeOfDay}`);
  return parts.join(' · ');
}

function renderJson() {
  if (!jsonBroken) jsonEl.value = JSON.stringify(draft, null, 2);
  renderReport();
}

function renderReport(parseError = null) {
  if (parseError) {
    reportEl.className = 'report is-error';
    reportEl.textContent = `JSON не читается: ${parseError}`;
    return;
  }
  const { config, errors, warnings } = validateConfig(draft);
  if (errors.length) {
    reportEl.className = 'report is-error';
    reportEl.textContent = `Конфиг не будет принят: ${errors.join('; ')}`;
  } else if (warnings.length) {
    reportEl.className = 'report is-warn';
    reportEl.innerHTML = `Будут пропущены записи:<br>${warnings.map(html).join('<br>')}`;
  } else {
    reportEl.className = 'report is-ok';
    reportEl.textContent = `✓ Всё в порядке: ${config.prikoly.length} приколов, включено ${config.prikoly.filter(p => p.enabled).length}`;
  }
}

// ——— Редактирование ———

listEl.addEventListener('input', e => {
  const field = e.target.dataset.field;
  const item = e.target.closest('[data-index]');
  if (!field || !item) return;
  const prikol = draft.prikoly[Number(item.dataset.index)];
  if (field === 'enabled') {
    prikol.enabled = e.target.checked;
    item.classList.toggle('is-off', !prikol.enabled);
  } else if (field === 'cooldownMs') {
    prikol.cooldownMs = Math.max(0, Number(e.target.value) || 0);
  } else {
    prikol[field] = e.target.value;
  }
  renderSource();
});

document.querySelector('.settings').addEventListener('change', e => {
  draft.settings ??= {};
  const t = e.target;
  if (t.name === 'season') draft.settings.season = t.value;
  else if (t.dataset.setting) {
    draft.settings[t.dataset.setting] = t.type === 'checkbox' ? t.checked : Math.max(0, Number(t.value) || 0);
  }
  renderSource();
});

jsonEl.addEventListener('input', () => {
  try {
    draft = JSON.parse(jsonEl.value);
    jsonBroken = false;
    renderReport();
  } catch (err) {
    jsonBroken = true;
    renderReport(describeParseError(err, jsonEl.value));
  }
  renderSource();
});

function describeParseError(err, text) {
  const pos = /position (\d+)/.exec(err.message);
  if (!pos) return err.message;
  const before = text.slice(0, Number(pos[1]));
  const line = before.split('\n').length;
  const column = before.length - before.lastIndexOf('\n');
  return `строка ${line}, символ ${column} — ${err.message}`;
}

// ——— Вкладки ———

document.querySelector('.tabs').addEventListener('click', e => {
  const next = e.target.closest('[data-tab]')?.dataset.tab;
  if (!next || next === tab) return;
  if (tab === 'json' && jsonBroken) return say('Сначала исправьте JSON — он не читается', 'error');
  tab = next;
  for (const btn of document.querySelectorAll('[data-tab]')) btn.classList.toggle('is-active', btn.dataset.tab === tab);
  for (const panel of document.querySelectorAll('[data-panel]')) panel.hidden = panel.dataset.panel !== tab;
  if (tab === 'json') renderJson();
  else renderAll();
});

// ——— Действия ———

$('save').addEventListener('click', () => {
  if (jsonBroken) return say('JSON не читается — сохранять нечего', 'error');
  const { errors, warnings } = validateConfig(draft);
  if (errors.length) return say(`Не сохранено: ${errors.join('; ')}`, 'error');
  try {
    localStorage.setItem(OVERRIDE_KEY, JSON.stringify(draft, null, 2));
  } catch {
    return say('Браузер не дал записать в localStorage (приватный режим?)', 'error');
  }
  source = 'CMS';
  saved = JSON.stringify(draft);
  renderSource();
  say(warnings.length
    ? `Сохранено, но ${warnings.length} записей движок пропустит — см. вкладку JSON`
    : 'Сохранено — приложение уже подхватило изменения', warnings.length ? 'warn' : 'ok');
});

let resetArmed = 0;
$('reset').addEventListener('click', async e => {
  const btn = e.currentTarget;
  if (!resetArmed) {
    btn.textContent = 'Точно сбросить?';
    resetArmed = setTimeout(() => {
      resetArmed = 0;
      btn.textContent = 'Сбросить к config.json';
    }, 3000);
    return;
  }
  clearTimeout(resetArmed);
  resetArmed = 0;
  btn.textContent = 'Сбросить к config.json';
  try {
    localStorage.removeItem(OVERRIDE_KEY);
  } catch {
    // нечего удалять
  }
  draft = null;
  jsonBroken = false;
  await load();
  say('Черновик удалён — приложение вернулось к config.json', 'ok');
});

$('download').addEventListener('click', () => {
  const blob = new Blob([`${JSON.stringify(draft, null, 2)}\n`], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'config.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});

// Кнопки превью: управляем приложением в iframe через его debug-API.
document.querySelector('.preview__bar').addEventListener('click', e => {
  const act = e.target.closest('[data-preview]')?.dataset.preview;
  const app = preview.contentWindow;
  if (!act || !app) return;
  if (act === 'shake') app.sberKids?.engine?.simulate('shake');
  else app.location.hash = act;
});

// Другая вкладка CMS сохранила/сбросила — подтягиваем, если у нас нет своих правок.
window.addEventListener('storage', e => {
  if (e.key !== OVERRIDE_KEY || JSON.stringify(draft) !== saved) return;
  draft = null;
  load();
});

let statusTimer = 0;
function say(text, kind = 'ok') {
  statusEl.textContent = text;
  statusEl.className = `status is-${kind}`;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => (statusEl.textContent = ''), 5000);
}

function html(text) {
  return String(text).replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch]);
}

function attr(text) {
  return html(text).replace(/"/g, '&quot;');
}

load().catch(err => {
  say(`Не удалось загрузить config.json: ${err.message}`, 'error');
  draft = { version: 1, settings: {}, prikoly: [] };
  saved = JSON.stringify(draft);
  renderAll();
});
