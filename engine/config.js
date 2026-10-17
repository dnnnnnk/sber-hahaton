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
const DATE_RANGE = /^(\d\d)-(\d\d)\.\.(\d\d)-(\d\d)$/;
const TIME_RANGE = /^(\d\d):(\d\d)\.\.(\d\d):(\d\d)$/;
const HAPTICS = ['light', 'medium', 'heavy', 'success', 'double'];

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

  if (raw.version == null || (Number.isInteger(raw.version) && raw.version >= 1)) config.version = raw.version ?? 1;
  else warnings.push('version: нужно целое число ≥ 1 — взято 1');
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
  if (settings.globalCooldownMs != null) {
    if (nonNegative(settings.globalCooldownMs)) result.globalCooldownMs = settings.globalCooldownMs;
    else warnings.push('settings.globalCooldownMs: нужно число ≥ 0');
  }
  if (settings.maxParticles != null) {
    if (nonNegativeInteger(settings.maxParticles) && settings.maxParticles <= 500) result.maxParticles = settings.maxParticles;
    else warnings.push('settings.maxParticles: нужно целое число от 0 до 500');
  }
  for (const key of ['sound', 'haptics']) {
    if (settings[key] == null) continue;
    if (typeof settings[key] === 'boolean') result[key] = settings[key];
    else warnings.push(`settings.${key}: нужно true или false`);
  }
  if (settings.season != null) {
    if (SEASONS.includes(settings.season)) result.season = settings.season;
    else warnings.push(`settings.season: одно из ${SEASONS.join(', ')}`);
  }
  if (settings.albumAnchor != null) {
    if (typeof settings.albumAnchor === 'string' && settings.albumAnchor.trim()) result.albumAnchor = settings.albumAnchor;
    else warnings.push('settings.albumAnchor: нужна непустая строка');
  }
  return result;
}

function entryProblem(entry, ids) {
  if (!isObject(entry)) return 'запись должна быть объектом';
  if (typeof entry.id !== 'string' || !entry.id) return 'нет id';
  if (ids.has(entry.id)) return 'повторяющийся id';
  if (entry.enabled != null && typeof entry.enabled !== 'boolean') return 'enabled должен быть true или false';
  for (const key of ['title', 'hint', 'icon']) {
    if (entry[key] != null && typeof entry[key] !== 'string') return `${key} должен быть строкой`;
  }

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
    if (v.params?.src != null && !isContentPath(v.params.src)) return 'effect.params.src: нужен локальный путь внутри content/';
    const effectProblem = effects[v.type].validate?.(v.params || {});
    if (effectProblem) return `effect ${v.type}: ${effectProblem}`;
  }

  if (entry.screens != null && !(Array.isArray(entry.screens) && entry.screens.every(s => typeof s === 'string'))) {
    return 'screens должен быть массивом строк или null';
  }
  const s = entry.schedule;
  if (s != null) {
    if (!isObject(s)) return 'schedule должен быть объектом или null';
    if (s.dateRange != null && !validDateRange(s.dateRange)) return 'schedule.dateRange: нужна реальная дата в формате "MM-DD..MM-DD"';
    if (s.timeOfDay != null && !validTimeRange(s.timeOfDay)) return 'schedule.timeOfDay: нужно реальное время в формате "HH:MM..HH:MM"';
  }
  if (entry.priority != null && !isNumber(entry.priority)) return 'priority должен быть числом';
  if (entry.cooldownMs != null && !nonNegative(entry.cooldownMs)) return 'cooldownMs должен быть числом ≥ 0';
  if (entry.maxPerDay != null && !nonNegativeInteger(entry.maxPerDay)) return 'maxPerDay должен быть целым числом ≥ 0 или null';
  if (entry.haptic != null && !HAPTICS.includes(entry.haptic)) return `haptic: одно из ${HAPTICS.join(', ')} или null`;
  if (entry.sound != null && !isContentPath(entry.sound)) return 'sound: нужен локальный путь внутри content/ или null';
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

// CMS не может включить внешний запрос или выйти из каталога контента.
export function isContentPath(value) {
  if (typeof value !== 'string' || !value || /[\\\s%:?#{}]/.test(value) || value.startsWith('/')) return false;
  try {
    const base = new URL('https://local.invalid/content/');
    const resolved = new URL(value, base);
    return resolved.origin === base.origin && resolved.pathname.startsWith(base.pathname) && resolved.pathname !== base.pathname;
  } catch {
    return false;
  }
}

function isNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function nonNegative(v) {
  return isNumber(v) && v >= 0;
}

function nonNegativeInteger(v) {
  return Number.isInteger(v) && v >= 0;
}

function validDateRange(value) {
  const match = typeof value === 'string' && DATE_RANGE.exec(value);
  if (!match) return false;
  return validMonthDay(Number(match[1]), Number(match[2])) && validMonthDay(Number(match[3]), Number(match[4]));
}

function validMonthDay(month, day) {
  const days = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}

function validTimeRange(value) {
  const match = typeof value === 'string' && TIME_RANGE.exec(value);
  if (!match) return false;
  return Number(match[1]) <= 23 && Number(match[2]) <= 59 && Number(match[3]) <= 23 && Number(match[4]) <= 59;
}
