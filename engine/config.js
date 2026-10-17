// Загрузка и проверка конфига приколов. Им же пользуется CMS, чтобы проверять JSON по тем же правилам.
// Битая запись пропускается с предупреждением, битый конфиг целиком → пустой список (движок молчит).

import { triggers } from './triggers/index.js';
import { effects } from './effects/index.js';

export const OVERRIDE_KEY = 'prikoly.configOverride';

export const DEFAULT_SETTINGS = {
  globalCooldownMs: 3000,
  maxParticles: 150,
  sound: true,
  haptics: true,
  season: 'auto',
  albumAnchor: 'avatar',
};

const SEASONS = ['auto', 'autumn', 'winter', 'spring', 'summer'];
const DATE_RANGE = /^\d\d-\d\d\.\.\d\d-\d\d$/;
const TIME_RANGE = /^\d\d:\d\d\.\.\d\d:\d\d$/;

export async function fetchConfig(url) {
  const bust = `${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`;
  const res = await fetch(bust, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Override из CMS (localStorage). null — если его нет или он не парсится.
export function readOverride() {
  let text = null;
  try {
    text = localStorage.getItem(OVERRIDE_KEY);
  } catch {
    return null;
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (err) {
    console.warn('[prikoly] override из CMS не парсится — использую config.json', err);
    return null;
  }
}

export function validateConfig(raw) {
  const errors = [];
  const warnings = [];
  const config = { version: 1, settings: { ...DEFAULT_SETTINGS }, prikoly: [] };

  if (!isObject(raw)) {
    errors.push('Конфиг должен быть JSON-объектом');
    return { config, errors, warnings };
  }
  if (!Array.isArray(raw.prikoly)) {
    errors.push('Нет массива "prikoly"');
    return { config, errors, warnings };
  }

  config.version = raw.version ?? 1;
  config.settings = normalizeSettings(raw.settings, warnings);

  const ids = new Set();
  raw.prikoly.forEach((entry, index) => {
    const where = `prikoly[${index}]${isObject(entry) && entry.id ? ` "${entry.id}"` : ''}`;
    const problem = entryProblem(entry, ids);
    if (problem) {
      warnings.push(`${where}: ${problem} — запись пропущена`);
      return;
    }
    ids.add(entry.id);
    config.prikoly.push(normalizeEntry(entry));
  });

  return { config, errors, warnings };
}

function normalizeSettings(settings, warnings) {
  const result = { ...DEFAULT_SETTINGS };
  if (settings == null) return result;
  if (!isObject(settings)) {
    warnings.push('settings: должен быть объектом — взяты значения по умолчанию');
    return result;
  }
  for (const key of ['globalCooldownMs', 'maxParticles']) {
    if (settings[key] == null) continue;
    if (isNumber(settings[key]) && settings[key] >= 0) result[key] = settings[key];
    else warnings.push(`settings.${key}: нужно число ≥ 0`);
  }
  for (const key of ['sound', 'haptics']) {
    if (typeof settings[key] === 'boolean') result[key] = settings[key];
  }
  if (settings.season != null) {
    if (SEASONS.includes(settings.season)) result.season = settings.season;
    else warnings.push(`settings.season: одно из ${SEASONS.join(', ')}`);
  }
  if (typeof settings.albumAnchor === 'string') result.albumAnchor = settings.albumAnchor;
  return result;
}

function entryProblem(entry, ids) {
  if (!isObject(entry)) return 'запись должна быть объектом';
  if (typeof entry.id !== 'string' || !entry.id) return 'нет id';
  if (ids.has(entry.id)) return 'повторяющийся id';

  const trigger = entry.trigger;
  if (!isObject(trigger)) return 'нет trigger';
  const triggerDef = triggers[trigger.type];
  if (!triggerDef) return `неизвестный trigger.type "${trigger.type}"`;
  const triggerProblem = triggerDef.validate?.(trigger);
  if (triggerProblem) return `trigger: ${triggerProblem}`;

  const effect = entry.effect;
  if (!isObject(effect)) return 'нет effect';
  const variants = effect.variants ?? [effect];
  if (!Array.isArray(variants) || !variants.length) return 'effect.variants должен быть непустым массивом';
  for (const v of variants) {
    if (!isObject(v) || !effects[v.type]) return `неизвестный effect.type "${v?.type}"`;
    if (v.params != null && !isObject(v.params)) return 'effect.params должен быть объектом';
  }

  if (entry.screens != null && !(Array.isArray(entry.screens) && entry.screens.every(s => typeof s === 'string'))) {
    return 'screens должен быть массивом строк или null';
  }
  const s = entry.schedule;
  if (s != null) {
    if (!isObject(s)) return 'schedule должен быть объектом или null';
    if (s.dateRange != null && !DATE_RANGE.test(s.dateRange)) return 'schedule.dateRange в формате "MM-DD..MM-DD"';
    if (s.timeOfDay != null && !TIME_RANGE.test(s.timeOfDay)) return 'schedule.timeOfDay в формате "HH:MM..HH:MM"';
  }
  for (const key of ['priority', 'cooldownMs', 'maxPerDay']) {
    if (entry[key] != null && !isNumber(entry[key])) return `${key} должен быть числом или null`;
  }
  return null;
}

function normalizeEntry(entry) {
  return {
    ...entry,
    title: typeof entry.title === 'string' && entry.title ? entry.title : entry.id,
    hint: typeof entry.hint === 'string' ? entry.hint : '',
    icon: typeof entry.icon === 'string' && entry.icon ? entry.icon : '✨',
    enabled: entry.enabled !== false,
    priority: entry.priority ?? 0,
    screens: entry.screens ?? null,
    schedule: entry.schedule ?? null,
    cooldownMs: entry.cooldownMs ?? 0,
    maxPerDay: entry.maxPerDay ?? null,
    haptic: entry.haptic ?? null,
    sound: entry.sound ?? null,
  };
}

function isObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}
