// Правила: можно ли сейчас запустить прикол. Порядок проверок важен — первая неудачная и есть причина пропуска.
// 1) enabled  2) красная зона и список screens  3) расписание (dateRange, timeOfDay)
// 4) кулдаун прикола и глобальный кулдаун (пауза после полноэкранного эффекта; прикол с бо́льшим
//    приоритетом её не ждёт — так «Все дела выполнены» не теряется сразу после отметки дела).
//    Отклик на действие ребёнка (триггер event) глобальный кулдаун не ждёт: каждый тап по делу отвечает сразу.
// 5) maxPerDay.
// Приоритет при одновременном срабатывании решает engine.js.

const DAILY_KEY = 'prikoly.daily';

// «Принудительный сезон» подменяет дату для dateRange (CMS / debug-панель).
export const SEASON_DATES = { autumn: '10-15', winter: '01-15', spring: '04-15', summer: '07-15' };
export const SEASON_NAMES = { auto: 'по календарю', autumn: 'осень', winter: 'зима', spring: 'весна', summer: 'лето' };

export function createRules(getSettings) {
  const lastFired = new Map();
  let lastFullscreen = { at: -Infinity, priority: -Infinity };
  let seasonOverride = null;

  function season() {
    return seasonOverride || getSettings().season || 'auto';
  }

  function monthDay(date) {
    const forced = SEASON_DATES[season()];
    return forced || `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function check(prikol, { screen, fullscreen, now = Date.now(), date = new Date() }) {
    if (!prikol.enabled) return skip('выключен');
    if (screen.zone === 'red') return skip('красная зона');
    if (prikol.screens && !prikol.screens.includes(screen.id)) return skip(`не тот экран (${screen.id})`);

    const s = prikol.schedule;
    if (s?.dateRange && !inRange(s.dateRange, monthDay(date))) return skip('не сезон');
    if (s?.timeOfDay && !inRange(s.timeOfDay, `${pad(date.getHours())}:${pad(date.getMinutes())}`)) {
      return skip('не то время суток');
    }

    const since = now - (lastFired.get(prikol.id) ?? -Infinity);
    if (since < prikol.cooldownMs) return skip(`кулдаун ещё ${Math.ceil((prikol.cooldownMs - since) / 1000)} с`);
    const globalCooldown = getSettings().globalCooldownMs;
    const userAction = prikol.trigger?.type === 'event';
    if (fullscreen && !userAction && now - lastFullscreen.at < globalCooldown && prikol.priority <= lastFullscreen.priority) {
      return skip('глобальный кулдаун');
    }

    if (prikol.maxPerDay != null && dailyCount(prikol.id) >= prikol.maxPerDay) return skip('лимит на сегодня');
    return { ok: true };
  }

  function commit(prikol, fullscreen, now = Date.now()) {
    lastFired.set(prikol.id, now);
    if (fullscreen) lastFullscreen = { at: now, priority: prikol.priority };
    if (prikol.maxPerDay != null) bumpDaily(prikol.id);
  }

  return {
    check,
    commit,
    season,
    setSeasonOverride(value) {
      seasonOverride = value && value !== 'auto' ? value : null;
    },
    resetCooldowns() {
      lastFired.clear();
      lastFullscreen = { at: -Infinity, priority: -Infinity };
    },
    // «Сбросить демо»: дневные лимиты с нуля.
    resetDaily() {
      try {
        localStorage.removeItem(DAILY_KEY);
      } catch {
        // без хранилища лимиты и так живут до перезагрузки
      }
    },
  };
}

// "MM-DD..MM-DD" или "HH:MM..HH:MM"; диапазон может переходить через Новый год / полночь.
export function inRange(range, value) {
  const [from, to] = range.split('..');
  return from <= to ? value >= from && value <= to : value >= from || value <= to;
}

function skip(reason) {
  return { ok: false, reason };
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function readDaily() {
  try {
    const data = JSON.parse(localStorage.getItem(DAILY_KEY));
    if (data?.day === today()) return data;
  } catch {
    // приватный режим или мусор в хранилище — считаем с нуля
  }
  return { day: today(), counts: {} };
}

function dailyCount(id) {
  return readDaily().counts[id] || 0;
}

function bumpDaily(id) {
  const data = readDaily();
  data.counts[id] = (data.counts[id] || 0) + 1;
  try {
    localStorage.setItem(DAILY_KEY, JSON.stringify(data));
  } catch {
    // без хранилища лимит просто не переживёт перезагрузку
  }
}
