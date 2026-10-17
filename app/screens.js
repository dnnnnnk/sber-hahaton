// Экраны оболочки «СберKids».
//
// Экран рисуется картинкой screens/<id>.png (экспорт из Figma), а если её нет — HTML-заглушкой stub().
// Зоны (zones) — в процентах от размеров картинки: { x, y, w, h }. Они нужны только для PNG:
// в заглушке те же зоны — это элементы с data-zone="<id>" и data-anchor="<имя>".
//
// Поля зоны:
//   go: 'screenId'      — переход на экран
//   tap: shell => {}    — действие оболочки (отметить дело, пополнить копилку…)
//   anchor: 'card'      — якорь для эффектов (движок видит его только через stage.getAnchorRect)
//   lift: true          — якорь можно анимировать (на PNG вырезается «кусочек» картинки)
//   fill: '#fff'        — цвет подложки под поднятым кусочком (по умолчанию берётся с картинки)
// Координаты зон для PNG — черновые: откалибруйте их в ?debug=1 → «Калибровка».

export const START_SCREEN = 'home';

// Какие PNG уже лежат в screens/. Положили home.png — допишите 'home' (таббар отдельно — 'tabbar').
// Явный список вместо «пробных» запросов: без 404 в консоли и лишних запросов при каждом запуске.
export const READY_IMAGES = [];

export const TABS = [
  { id: 'home', label: 'Главный', icon: 'home' },
  { id: 'moneybox', label: 'Копилки', icon: 'jar' },
  { id: 'assistant', label: 'Ассистент', icon: 'chat', disabled: true },
  { id: 'tasks', label: 'Дела', icon: 'check' },
  { id: 'content', label: 'Контент', icon: 'play' },
];

// Зоны таббара для screens/tabbar.png — пять равных колонок.
export const TABBAR_ZONES = TABS.map((t, i) => ({ id: `tab-${t.id}`, tab: t.id, x: i * 20, y: 0, w: 20, h: 100 }));

export const TASKS = [
  { id: 'dog_walk', title: 'Погулять с собакой', icon: '🐕', reward: 50, done: false },
  { id: 'dishes', title: 'Помыть посуду', icon: '🍽️', reward: 30, done: true },
  { id: 'multiplication', title: 'Выучить таблицу на 7', icon: '✖️', reward: 70, done: false },
  { id: 'clean_room', title: 'Убрать в комнате', icon: '🧹', reward: 50, done: false },
  { id: 'read_book', title: 'Прочитать 10 страниц', icon: '📚', reward: 40, done: false },
];

export const MONEYBOXES = [
  { id: 'bike', title: 'Велосипед', icon: '🚲', goal: 12000, saved: 4200 },
  { id: 'paints', title: 'Набор для рисования', icon: '🎨', goal: 3000, saved: 2250 },
  { id: 'headphones', title: 'Наушники', icon: '🎧', goal: 5000, saved: 500 },
];

export const SCREENS = {
  home: {
    title: 'Главный',
    zone: 'green',
    tab: 'home',
    zones: [
      { id: 'avatar', anchor: 'avatar', lift: true, x: 4, y: 2.5, w: 12.5, h: 5.8 },
      { id: 'card', anchor: 'card', x: 4, y: 10, w: 92, h: 23 },
      { id: 'balance', anchor: 'balance', lift: true, x: 8, y: 20, w: 45, h: 6 },
      { id: 'transfer', go: 'transfer', x: 4, y: 35, w: 21, h: 10 },
      { id: 'topup', go: 'transfer', x: 27.5, y: 35, w: 21, h: 10 },
      { id: 'moneybox', go: 'moneybox', x: 51, y: 35, w: 21, h: 10 },
      { id: 'tasks', go: 'tasks', x: 75, y: 35, w: 21, h: 10 },
    ],
    onOpen: shell => shell.emit('balance:show', { value: shell.state.balance }),
    stub: s => `
      <header class="hello">
        <div class="avatar" data-anchor="avatar">🦊</div>
        <div class="hello__text">
          <div class="hello__title">Привет!</div>
          <div class="hello__sub">Сегодня отличный день</div>
        </div>
        <div class="round-btn" aria-hidden="true">🔔</div>
      </header>
      <section class="bank-card" data-anchor="card">
        <div class="bank-card__row"><span>СберКарта Детская</span><span>•• 4821</span></div>
        <div class="bank-card__label">Баланс</div>
        <div class="bank-card__balance" data-anchor="balance">${money(s.balance)}</div>
        <div class="bank-card__chip"></div>
      </section>
      <section class="quick">
        ${quick('transfer', '↗', 'Перевести')}
        ${quick('topup', '＋', 'Пополнить')}
        ${quick('moneybox', '◎', 'Копилки')}
        ${quick('tasks', '✓', 'Дела')}
      </section>
      <section class="block">
        <h2 class="block__title">История</h2>
        ${historyRow('🍦', 'Мороженое', 'Вчера', -120)}
        ${historyRow('💌', 'Карманные от мамы', 'Пн', 500)}
        ${historyRow('📗', 'Книжный магазин', '12 окт', -350)}
        ${historyRow('🎨', 'В копилку «Набор для рисования»', '10 окт', -250)}
      </section>`,
  },

  tasks: {
    title: 'Дела',
    zone: 'green',
    tab: 'tasks',
    zones: TASKS.map((t, i) => ({
      id: `task-${t.id}`,
      anchor: `task-${t.id}`,
      tap: shell => shell.toggleTask(t.id),
      x: 4, y: 14 + i * 10.5, w: 92, h: 9.5,
    })),
    stub: s => {
      const doneCount = TASKS.filter(t => s.tasks[t.id]).length;
      return `
        <header class="page-hdr">
          <h1>Дела</h1>
          <div class="page-hdr__sub">Выполнено ${doneCount} из ${TASKS.length}</div>
        </header>
        <ul class="tasks">
          ${TASKS.map(t => `
            <li>
              <button class="task ${s.tasks[t.id] ? 'is-done' : ''}" data-zone="task-${t.id}" data-anchor="task-${t.id}">
                <span class="task__icon">${t.icon}</span>
                <span class="task__body">
                  <span class="task__title">${t.title}</span>
                  <span class="task__reward">+${money(t.reward)}</span>
                </span>
                <span class="task__check" aria-hidden="true"></span>
              </button>
            </li>`).join('')}
        </ul>`;
    },
  },

  tasks_done: {
    title: 'Все задания выполнены',
    zone: 'green',
    tab: 'tasks',
    zones: [
      { id: 'trophy', anchor: 'trophy', lift: true, x: 35, y: 18, w: 30, h: 14 },
      { id: 'again', tap: shell => shell.resetTasks(), x: 8, y: 62, w: 84, h: 7 },
    ],
    stub: () => `
      <div class="center-page">
        <div class="big-emoji" data-anchor="trophy">🏆</div>
        <h1>Все задания выполнены!</h1>
        <p>Ты молодец. Новые дела появятся завтра.</p>
        <button class="btn" data-zone="again">Начать заново</button>
      </div>`,
  },

  moneybox: {
    title: 'Копилки',
    zone: 'green',
    tab: 'moneybox',
    zones: MONEYBOXES.flatMap((m, i) => [
      { id: `mbox-${m.id}`, anchor: `moneybox-${m.id}`, x: 4, y: 12 + i * 24, w: 92, h: 22 },
      { id: `topup-${m.id}`, tap: shell => shell.topup(m.id), x: 8, y: 26 + i * 24, w: 40, h: 6 },
    ]),
    stub: s => `
      <header class="page-hdr">
        <h1>Копилки</h1>
        <div class="page-hdr__sub">Коплю на мечту</div>
      </header>
      ${s.moneyboxes.map(m => `
        <article class="mbox" data-anchor="moneybox-${m.id}">
          <div class="mbox__top">
            <span class="mbox__icon">${m.icon}</span>
            <div>
              <div class="mbox__title">${m.title}</div>
              <div class="mbox__sum">${money(m.saved)} из ${money(m.goal)}</div>
            </div>
          </div>
          <div class="progress"><div class="progress__bar" style="width:${Math.round((m.saved / m.goal) * 100)}%"></div></div>
          <button class="btn btn--small" data-zone="topup-${m.id}">Пополнить</button>
        </article>`).join('')}`,
  },

  topup_success: {
    title: 'Копилка пополнена',
    zone: 'green',
    tab: null,
    zones: [
      { id: 'success', anchor: 'success', lift: true, x: 35, y: 16, w: 30, h: 14 },
      { id: 'progress', anchor: 'progress', x: 10, y: 48, w: 80, h: 3 },
      { id: 'done', go: 'moneybox', x: 8, y: 86, w: 84, h: 7 },
    ],
    stub: s => {
      const t = s.lastTopup;
      const m = s.moneyboxes.find(x => x.id === t?.moneyboxId) || s.moneyboxes[0];
      return `
        <div class="center-page">
          <div class="success-mark" data-anchor="success">✓</div>
          <h1>Копилка пополнена</h1>
          <p>${t ? `+${money(t.amount)} в «${m.title}»` : `«${m.title}»`}</p>
          <div class="progress progress--big" data-anchor="progress">
            <div class="progress__bar" style="width:${Math.round((m.saved / m.goal) * 100)}%"></div>
          </div>
          <p class="muted">${money(m.saved)} из ${money(m.goal)}</p>
          <button class="btn btn--bottom" data-zone="done">Готово</button>
        </div>`;
    },
  },

  content: {
    title: 'Контент',
    zone: 'green',
    tab: 'content',
    zones: [],
    stub: () => `
      <header class="page-hdr"><h1>Контент</h1></header>
      ${feedCard('feed-1', '#FFE7A3', '💡', 'Как накопить на мечту', 'Три простых шага')}
      ${feedCard('feed-2', '#CDEBFF', '🧮', 'Что такое кешбэк', 'Объясняем на мороженом')}
      ${feedCard('feed-3', '#E3D9FF', '🎲', 'Угадай цену', 'Игра на 2 минуты')}
      ${feedCard('feed-4', '#D5F5DD', '🌱', 'Карманные деньги', 'Как договориться с родителями')}`,
  },

  transfer: {
    title: 'Перевод',
    zone: 'red',
    tab: null,
    zones: [{ id: 'back', go: 'home', x: 0, y: 0, w: 20, h: 8 }],
    stub: () => `
      <header class="nav-hdr">
        <button class="round-btn" data-zone="back" aria-label="Назад">←</button>
        <h1>Перевод</h1>
      </header>
      <div class="form">
        <div class="field"><div class="field__label">Кому</div><div class="field__value">Мама · •• 1234</div></div>
        <div class="field"><div class="field__label">Сумма</div><div class="field__value field__value--big">500 ₽</div></div>
        <div class="field"><div class="field__label">Сообщение</div><div class="field__value muted">Необязательно</div></div>
        <button class="btn btn--bottom" disabled>Перевести</button>
      </div>`,
  },
};

export function money(value) {
  return `${Math.round(value).toLocaleString('ru-RU')} ₽`;
}

function quick(zone, icon, label) {
  return `<button class="quick__item" data-zone="${zone}"><span class="quick__icon">${icon}</span>${label}</button>`;
}

function historyRow(icon, title, date, amount) {
  return `
    <div class="row">
      <span class="row__icon">${icon}</span>
      <span class="row__body"><span class="row__title">${title}</span><span class="row__sub">${date}</span></span>
      <span class="row__amount ${amount > 0 ? 'is-plus' : ''}">${amount > 0 ? '+' : '−'}${money(Math.abs(amount))}</span>
    </div>`;
}

function feedCard(anchor, color, icon, title, sub) {
  return `
    <article class="feed" data-anchor="${anchor}" style="--feed:${color}">
      <span class="feed__icon">${icon}</span>
      <span class="feed__title">${title}</span>
      <span class="feed__sub">${sub}</span>
    </article>`;
}
