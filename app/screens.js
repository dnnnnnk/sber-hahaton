// Экраны оболочки «СберKids».
//
// Экран рисуется картинкой screens/<id>.webp (экспорт из Figma @2x, кадр 375 pt), а если её нет в READY_IMAGES —
// HTML-заглушкой stub(). Зоны (zones) — в процентах от размеров картинки: { x, y, w, h }.
// В заглушке те же зоны — это элементы с data-zone="<id>" и data-anchor="<имя>"; зона без x/y есть только
// в заглушке (или в HTML-дополнении afterImage).
//
// Поля зоны:
//   go: 'screenId'        — переход на экран
//   tap: shell => {}      — действие оболочки (отметить дело, пополнить копилку…)
//   anchor: 'card'        — якорь для эффектов (движок видит его только через stage.getAnchorRect)
//   lift: true            — якорь можно анимировать (на PNG вырезается «кусочек» картинки)
//   fill: '#fff'          — цвет подложки под поднятым кусочком (по умолчанию берётся с картинки)
//   done: state => bool   — показать на зоне галочку «сделано»
// Поля экрана для PNG:
//   cropBottom: 162       — сколько pt снизу картинки скрыть всегда (нарисованный таббар — вместо него закреплённый)
//   afterImage: state => html — HTML, который дорисовывается под картинкой (если в макете чего-то нет)
// Координаты зон — «на глаз» по макетам: уточните их в ?debug=1 → «Калибровка».

export const START_SCREEN = 'home';

// Ширина кадра в Figma, pt. Всё в pt ниже — в этой системе координат.
export const DESIGN_WIDTH = 375;

// Какие картинки лежат в screens/ — имя файла с расширением; id картинки = имя без расширения.
// Положили новую — допишите сюда (WebP: tools/encode_screens.mjs; PNG/JPEG тоже годятся).
// Явный список вместо «пробных» запросов: без 404 в консоли и лишних запросов при каждом запуске.
export const READY_IMAGES = [
  'home.webp', 'tasks.webp', 'tasks_done.webp', 'moneybox.webp', 'moneybox_goal.webp', 'topup_success.webp',
  'content.webp', 'transfer.webp', 'tabbar.webp',
];

// «Хром» телефона, нарисованный на каждой картинке (pt). На настоящем телефоне он свой, поэтому на мобильном
// его срезаем; в рамке телефона на десктопе — оставляем для реалистичности.
export const IMAGE_CHROME = { statusBar: 44, homeIndicator: 34 };

export const TABS = [
  { id: 'home', label: 'Главный', icon: 'home' },
  { id: 'moneybox', label: 'Копилки', icon: 'jar' },
  { id: 'assistant', label: 'Ассистент', icon: 'chat', disabled: true },
  { id: 'tasks', label: 'Дела', icon: 'check' },
  { id: 'content', label: 'Контент', icon: 'play' },
];

// Закреплённый таббар: screens/tabbar.webp (375×162 pt, с прозрачным градиентом) поверх экрана.
// На нём активна «Главный», поэтому для других вкладок поверх кладём кусочки их собственных экранов,
// где эта вкладка нарисована активной. Кусочки — в pt от верха нижних 162 pt картинки-источника.
export const TABBAR = {
  image: 'tabbar',
  height: 162,
  pill: { x: 3.2, y: 14.81, w: 93.47, h: 52.78 }, // белая «таблетка» — якорь tabbar
  zones: [
    { id: 'tab-home', tab: 'home', x: 3.2, y: 14.81, w: 21.33, h: 52.78 },
    { id: 'tab-moneybox', tab: 'moneybox', x: 24.53, y: 14.81, w: 17.07, h: 52.78 },
    { id: 'tab-assistant', tab: 'assistant', x: 41.6, y: 14.81, w: 16.8, h: 52.78 },
    { id: 'tab-tasks', tab: 'tasks', x: 58.4, y: 14.81, w: 16.27, h: 52.78 },
    { id: 'tab-content', tab: 'content', x: 74.67, y: 14.81, w: 22, h: 52.78 },
  ],
  active: {
    home: [],
    moneybox: [
      { from: 'moneybox', x: 30, y: 36, w: 62, h: 60 },
      { from: 'moneybox', x: 92, y: 30, w: 62, h: 68 },
    ],
    content: [
      { from: 'content', x: 30, y: 36, w: 62, h: 60 },
      { from: 'content', x: 284, y: 36, w: 62, h: 60 },
    ],
    // В tasks.webp таббар старый (4 вкладки): берём оттуда только активную «Дела» и сдвигаем на её место.
    tasks: [
      { from: 'moneybox', x: 30, y: 36, w: 62, h: 60 },
      { from: 'tasks', x: 212, y: 34, w: 46, h: 62, toX: 226 },
    ],
  },
};

export const TASKS = [
  { id: 'dog_walk', title: 'Погуляю с собакой', icon: '🐾', tint: '#FFF4C2', reward: 50, done: false },
  { id: 'dishes', title: 'Помою посуду', icon: '🍽️', tint: '#E3F1FF', reward: 30, done: true },
  { id: 'multiplication', title: 'Выучу таблицу на 7', icon: '✖️', tint: '#EDE7FF', reward: 70, done: false },
  { id: 'clean_room', title: 'Уберу в комнате', icon: '🧹', tint: '#E4F8E9', reward: 50, done: false },
  { id: 'read_book', title: 'Прочитаю 10 страниц', icon: '📚', tint: '#FFE9E3', reward: 40, done: false },
];

export const MONEYBOXES = [
  { id: 'slides', title: 'Тапочки', icon: '🩴', goal: 3000, saved: 1675.5 },
  { id: 'neon', title: 'Неоновая вывеска', icon: '💡', goal: 7600, saved: 3000 },
  { id: 'slime', title: 'Слайм розовый', icon: '🫧', goal: 700, saved: 580 },
  { id: 'markers', title: 'Фломастеры', icon: '🖍️', goal: 200, saved: 100.32 },
  { id: 'band', title: 'Фитнес-браслет', icon: '⌚', goal: 2000, saved: 1800 },
  { id: 'robot', title: 'Робот Макс', icon: '🤖', goal: 12000, saved: 3950 },
];

// Зоны копилок на moneybox.webp (карточки сверху вниз).
const MONEYBOX_Y = { slides: 26.91, neon: 37.83, slime: 43.6, markers: 49.22, band: 54.84, robot: 60.45 };

export const SCREENS = {
  home: {
    title: 'Главный',
    zone: 'green',
    tab: 'home',
    cropBottom: 162,
    zones: [
      { id: 'avatar', anchor: 'avatar', lift: true, x: 6.4, y: 6.03, w: 14.93, h: 5.63 },
      { id: 'card', anchor: 'card', x: 4.27, y: 17.29, w: 91.47, h: 12.06 },
      { id: 'balance', anchor: 'balance', lift: true, x: 10.67, y: 23.52, w: 33.07, h: 2.81 },
      { id: 'transfer', go: 'transfer', x: 4.27, y: 40.8, w: 67.47, h: 11.26 },
      { id: 'self', go: 'transfer', x: 74.67, y: 40.8, w: 21.07, h: 11.26 },
      { id: 'mobile', go: 'transfer', x: 4.27, y: 68.34, w: 91.47, h: 7.04 },
      { id: 'moneybox', go: 'moneybox' },
      { id: 'tasks', go: 'tasks' },
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
        <div class="bank-card__row"><span>Детская карта</span><span>•• 4821</span></div>
        <div class="bank-card__label">Баланс</div>
        <div class="bank-card__balance" data-anchor="balance">${money(s.balance)}</div>
        <div class="bank-card__chip"></div>
      </section>
      <section class="quick">
        ${quick('transfer', '↗', 'Скинуть')}
        ${quick('mobile', '＋', 'Мобилка')}
        ${quick('moneybox', '◎', 'Копилки')}
        ${quick('tasks', '✓', 'Дела')}
      </section>
      <section class="block">
        <h2 class="block__title">История</h2>
        ${historyRow('🍦', 'Мороженое', 'Вчера', -120)}
        ${historyRow('💌', 'Карманные от мамы', 'Пн', 500)}
        ${historyRow('📗', 'Книжный магазин', '12 окт', -350)}
      </section>`,
  },

  tasks: {
    title: 'Дела',
    zone: 'green',
    tab: 'tasks',
    // На макете видно только первое дело, а таббар нарисован старый — срезаем всё после первой карточки
    // и дорисовываем остальные дела HTML-строками в том же стиле (afterImage).
    cropBottom: 175,
    zones: [
      { id: 'avatar', anchor: 'avatar', lift: true, x: 6.4, y: 7.39, w: 14.93, h: 6.9 },
      ...TASKS.map((t, i) => ({
        id: `task-${t.id}`,
        anchor: `task-${t.id}`,
        tap: shell => shell.toggleTask(t.id),
        done: state => state.tasks[t.id],
        ...(i === 0 ? { x: 4.27, y: 65.52, w: 91.47, h: 11.95 } : {}),
      })),
    ],
    afterImage: s => `
      <ul class="png-tasks">
        ${TASKS.slice(1).map(t => `
          <li>
            <button class="png-task ${s.tasks[t.id] ? 'is-done' : ''}" data-zone="task-${t.id}" data-anchor="task-${t.id}">
              <span class="png-task__icon" style="--tint:${t.tint}">${t.icon}</span>
              <span class="png-task__title">${t.title}</span>
            </button>
          </li>`).join('')}
      </ul>`,
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
    title: 'Всё сделано',
    zone: 'green',
    tab: null,
    zones: [
      { id: 'back', go: 'tasks', x: 6.4, y: 6.1, w: 14.93, h: 5.69 },
      { id: 'trophy', anchor: 'trophy', x: 8, y: 15.24, w: 85.33, h: 18.29 },
      { id: 'again', tap: shell => shell.resetTasks(), x: 4.27, y: 89.33, w: 91.47, h: 5.49 },
    ],
    stub: () => `
      <div class="center-page">
        <div class="big-emoji" data-anchor="trophy">🏆</div>
        <h1>Всё сделано!</h1>
        <p>Можешь поделиться с родителем и создать список на завтра.</p>
        <button class="btn" data-zone="again">Создать новый список</button>
      </div>`,
  },

  moneybox: {
    title: 'Копилки',
    zone: 'green',
    tab: 'moneybox',
    cropBottom: 162,
    zones: [
      { id: 'avatar', anchor: 'avatar', lift: true, x: 6.4, y: 2.34, w: 14.93, h: 2.18 },
      { id: 'goal', go: 'moneybox_goal', x: 4.27, y: 32.37, w: 91.47, h: 4.95 },
      ...MONEYBOXES.map(m => ({
        id: `topup-${m.id}`,
        anchor: `moneybox-${m.id}`,
        tap: shell => shell.topup(m.id),
        x: 4.27, y: MONEYBOX_Y[m.id], w: 91.47, h: 5.15,
      })),
    ],
    stub: s => `
      <header class="page-hdr">
        <h1>Копилки</h1>
        <div class="page-hdr__sub">Коплю на мечту · нажми на копилку, чтобы пополнить</div>
      </header>
      ${s.moneyboxes.map(m => `
        <button class="mbox" data-zone="topup-${m.id}" data-anchor="moneybox-${m.id}">
          <div class="mbox__top">
            <span class="mbox__icon">${m.icon}</span>
            <div>
              <div class="mbox__title">${m.title}</div>
              <div class="mbox__sum">${money(m.saved)} из ${money(m.goal)}</div>
            </div>
          </div>
          <div class="progress"><div class="progress__bar" style="width:${Math.round((m.saved / m.goal) * 100)}%"></div></div>
        </button>`).join('')}`,
  },

  moneybox_goal: {
    title: 'Ты накопил на мечту',
    zone: 'green',
    tab: null,
    zones: [
      { id: 'back', go: 'moneybox', x: 6.4, y: 4.19, w: 14.93, h: 3.91 },
      { id: 'goal', anchor: 'goal', x: 9.6, y: 11.17, w: 46.67, h: 12.07 },
    ],
    stub: () => `
      <div class="center-page">
        <div class="big-emoji" data-anchor="goal">🤖</div>
        <h1>Поздравляем! Ты накопил на мечту</h1>
        <button class="btn" data-zone="back">К копилкам</button>
      </div>`,
  },

  topup_success: {
    title: 'Готово',
    zone: 'green',
    tab: null,
    zones: [
      { id: 'success', anchor: 'success', x: 20.27, y: 13.79, w: 34.67, h: 14.78 },
      { id: 'done', go: 'home', x: 4.27, y: 86.95, w: 91.47, h: 6.9 },
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
          <button class="btn btn--bottom" data-zone="done">На главный</button>
        </div>`;
    },
  },

  content: {
    title: 'Контент',
    zone: 'green',
    tab: 'content',
    cropBottom: 162,
    zones: [],
    stub: () => `
      <header class="page-hdr"><h1>Контент</h1></header>
      ${feedCard('feed-1', '#FFE7A3', '💡', 'Как накопить на мечту', 'Три простых шага')}
      ${feedCard('feed-2', '#CDEBFF', '🧮', 'Что такое кешбэк', 'Объясняем на мороженом')}
      ${feedCard('feed-3', '#E3D9FF', '🎲', 'Угадай цену', 'Игра на 2 минуты')}
      ${feedCard('feed-4', '#D5F5DD', '🌱', 'Карманные деньги', 'Как договориться с родителями')}`,
  },

  transfer: {
    title: 'Скинуть денег',
    zone: 'red',
    tab: null,
    zones: [{ id: 'back', go: 'home', x: 6.4, y: 7.39, w: 14.93, h: 6.9 }],
    stub: () => `
      <header class="nav-hdr">
        <button class="round-btn" data-zone="back" aria-label="Назад">←</button>
        <h1>Скинуть денег</h1>
      </header>
      <div class="form">
        <div class="field"><div class="field__label">Кому</div><div class="field__value">Мама · •• 1234</div></div>
        <div class="field"><div class="field__label">Сколько</div><div class="field__value field__value--big">500 ₽</div></div>
        <div class="field"><div class="field__label">Сообщение</div><div class="field__value muted">Необязательно</div></div>
        <button class="btn btn--bottom" disabled>Скинуть</button>
      </div>`,
  },
};

export function money(value) {
  return `${value.toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽`;
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
