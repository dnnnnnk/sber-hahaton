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
//   round: true           — круглый кусочек и подложка (аватар): при сальто не видно квадрата
//   fill: '#fff'          — цвет подложки под поднятым кусочком (по умолчанию берётся с картинки)
//   done: state => bool   — показать на зоне галочку «сделано»
//   label: '…'            — короткое русское имя для скринридера
//   keyboardAction: true  — якорь доступен как кнопка; Enter/Space обрабатывает движок
// Поля экрана для PNG:
//   cropBottom: 162       — сколько pt снизу картинки скрыть всегда (нарисованный таббар — вместо него закреплённый)
//   afterImage: state => html — HTML, который дорисовывается под картинкой (если в макете чего-то нет)
//   patches: []           — нейтральные HTML-плашки поверх чужих образов; ввод всегда проходит сквозь них
// Координаты зон сверены по кадрам 750 px и в ?debug=1 → «Зоны и якоря» при viewport 375×812.

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
    { id: 'tab-home', tab: 'home', label: 'Главный', x: 3.2, y: 14.81, w: 21.33, h: 52.78 },
    { id: 'tab-moneybox', tab: 'moneybox', label: 'Копилки', x: 24.53, y: 14.81, w: 17.07, h: 52.78 },
    { id: 'tab-assistant', tab: 'assistant', label: 'Ассистент, пока недоступен', x: 41.6, y: 14.81, w: 16.8, h: 52.78 },
    { id: 'tab-tasks', tab: 'tasks', label: 'Дела', x: 58.4, y: 14.81, w: 16.27, h: 52.78 },
    { id: 'tab-content', tab: 'content', label: 'Контент', x: 74.67, y: 14.81, w: 22, h: 52.78 },
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
  { id: 'dishes', title: 'Помою посуду', icon: '🍽️', tint: '#E3F1FF', reward: 30, done: false },
  { id: 'multiplication', title: 'Выучу таблицу на 7', icon: '✖️', tint: '#EDE7FF', reward: 70, done: false },
  { id: 'clean_room', title: 'Уберу в комнате', icon: '🧹', tint: '#E4F8E9', reward: 50, done: false },
  { id: 'read_book', title: 'Прочитаю 10 страниц', icon: '📚', tint: '#FFE9E3', reward: 40, done: false },
];

// Мечта «Умный робот» накоплена полностью — те же название и суммы, что на экране мечты.
// Сумма всех копилок совпадает с «Всего на копилках» в шапке растра (16 158 ₽).
export const MONEYBOXES = [
  { id: 'robot', title: 'Умный робот', icon: '🤖', goal: 7600, saved: 7600 },
  { id: 'slides', title: 'Тапочки', icon: '🩴', goal: 3000, saved: 1675.5 },
  { id: 'neon', title: 'Неоновая вывеска', icon: '💡', goal: 7600, saved: 3000 },
  { id: 'slime', title: 'Слайм розовый', icon: '🫧', goal: 700, saved: 580 },
  { id: 'markers', title: 'Фломастеры', icon: '🖍️', goal: 200, saved: 100.32 },
  { id: 'band', title: 'Фитнес-браслет', icon: '⌚', goal: 2000, saved: 1800 },
  { id: 'bike', title: 'Велосипед', icon: '🚲', goal: 15000, saved: 1000 },
  { id: 'headphones', title: 'Наушники', icon: '🎧', goal: 4500, saved: 402.18 },
];

// Карточки копилок на moneybox.webp сверху вниз. Первые две видны без прокрутки — там монетки «Звенящих
// копилок» заметны сразу; растровые «Копилка фаворит» и «Копилка» закрыты собственными карточками.
const MONEYBOX_Y = {
  robot: 15.52, slides: 21.14, neon: 26.91, slime: 37.83, markers: 43.6, band: 49.22, bike: 54.84, headphones: 60.45,
};

const MONEYBOX_PATCHES = MONEYBOXES.map(item => ({
  x: 4.27, y: MONEYBOX_Y[item.id], w: 91.47, h: 5.15,
  className: 'screen-patch--moneybox',
  html: state => {
    const box = state.moneyboxes.find(candidate => candidate.id === item.id) || item;
    const progress = Math.min(100, Math.round((box.saved / box.goal) * 100));
    return `
      <span class="moneybox-patch__icon">${box.icon}</span>
      <span class="moneybox-patch__body">
        <span class="moneybox-patch__amount">${money(box.saved)} <small>из ${money(box.goal)}</small></span>
        <span class="moneybox-patch__progress"><i style="width:${progress}%"></i></span>
        <span class="moneybox-patch__title">${box.title}</span>
      </span>`;
  },
}));

export const SCREENS = {
  home: {
    title: 'Главный',
    a11y: 'Главный экран. Детская карта, баланс, быстрые действия и история операций.',
    zone: 'green',
    tab: 'home',
    cropBottom: 162,
    zones: [
      { id: 'avatar', anchor: 'avatar', label: 'Аватар. Нажмите, чтобы открыть альбом находок', keyboardAction: true, lift: true, round: true, x: 6.4, y: 6.03, w: 14.93, h: 5.63 },
      { id: 'card', anchor: 'card', label: 'Детская карта', x: 4.27, y: 17.36, w: 91.47, h: 11.98 },
      // Растровая сумма «800,55 ₽» на карте — поднимаемый якорь: «Красивое число» анимирует саму сумму.
      { id: 'balance', anchor: 'balance', lift: true, fill: '#fff', x: 10.4, y: 23.52, w: 33.6, h: 3.22 },
      { id: 'transfer', label: 'Скинуть деньги', go: 'transfer', x: 4.27, y: 40.8, w: 67.47, h: 11.26 },
      { id: 'self', label: 'Перевести себе', go: 'transfer', x: 74.67, y: 40.8, w: 21.07, h: 11.26 },
      { id: 'mobile', label: 'Оплатить мобильную связь', go: 'transfer', x: 4.27, y: 68.34, w: 91.47, h: 7.04 },
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
    a11y: 'Экран дел. Пять задач, каждую можно отметить выполненной.',
    zone: 'green',
    tab: 'tasks',
    patches: [
      {
        x: 6.4, y: 7.39, w: 14.93, h: 6.9,
        className: 'screen-patch--avatar',
        image: 'screens/home.webp', imageRect: { x: 6.4, y: 6.03, w: 14.93, h: 5.63 },
      },
      {
        x: 10.67, y: 22.2, w: 78.67, h: 8.5,
        className: 'screen-patch--tasks-copy',
        html: '<b>Тут делаются дела</b><span>Сообщи родителю, что готов выполнить полезные дела за вознаграждение</span>',
      },
    ],
    // Растровая первая строка отличалась от HTML и содержала подчёркивания. Обрезаем перед списком
    // и рисуем все пять дел одинаковыми доступными кнопками.
    cropBottom: 292,
    zones: [
      { id: 'avatar', anchor: 'avatar', label: 'Аватар. Нажмите, чтобы открыть альбом находок', keyboardAction: true, x: 6.4, y: 7.39, w: 14.93, h: 6.9 },
      ...TASKS.map(t => ({
        id: `task-${t.id}`,
        anchor: `task-${t.id}`,
        label: `${t.title}, награда ${t.reward} рублей`,
        tap: shell => shell.toggleTask(t.id),
        done: state => state.tasks[t.id],
      })),
    ],
    afterImage: s => `
      <ul class="png-tasks">
        ${TASKS.map(t => `
          <li>
            <button class="png-task ${s.tasks[t.id] ? 'is-done' : ''}" data-zone="task-${t.id}" data-anchor="task-${t.id}"
              aria-label="${t.title}, награда ${t.reward} рублей" aria-pressed="${s.tasks[t.id]}">
              <span class="png-task__icon" style="--tint:${t.tint}">${t.icon}</span>
              <span class="png-task__body">
                <span class="png-task__title">${t.title}</span>
                <span class="png-task__reward">+${money(t.reward)}</span>
              </span>
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
    a11y: 'Все дела выполнены. Можно отправить результат родителю или создать новый список.',
    zone: 'green',
    tab: null,
    patches: [{
      x: 4.27, y: 38.5, w: 91.47, h: 9.2,
      className: 'screen-patch--tasks-done-copy',
      html: '<b>Всё сделано!</b><span>Можешь поделиться с родителем — у тебя всё готово — и создать список на завтра</span>',
    }, {
      // В растре были другие дела — показываем те же пять, что на экране «Дела».
      x: 4.27, y: 49.9, w: 91.47, h: 22.1,
      className: 'screen-patch--done-list',
      html: s => TASKS.map(t => `
        <span class="done-row ${s.tasks[t.id] ? 'is-done' : ''}">
          <i>${t.icon}</i><b>${t.title}</b><em aria-hidden="true"></em>
        </span>`).join(''),
    }],
    zones: [
      { id: 'back', label: 'Назад к делам', go: 'tasks', x: 6.4, y: 6.1, w: 14.93, h: 5.69 },
      { id: 'trophy', anchor: 'trophy', label: 'Праздник выполненных дел', x: 8, y: 15.24, w: 85.33, h: 18.29 },
      { id: 'again', label: 'Создать новый список', tap: shell => shell.resetTasks(), x: 4.27, y: 89.33, w: 91.47, h: 5.49 },
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
    a11y: 'Экран копилок. Можно открыть мечту или пополнить одну из восьми копилок.',
    zone: 'green',
    tab: 'moneybox',
    // Нижняя подборка исходного макета содержит товарные бренды. Оставляем собственные копилки и кнопку,
    // а вместо подборки дорисовываем нейтральные идеи HTML-карточками.
    cropBottom: 770,
    // Баннер мечты — из растра (робот, ракета, кнопка); плашкой закрыт только заголовок с артефактами «_».
    patches: [...MONEYBOX_PATCHES, {
      x: 36.27, y: 33.54, w: 39.07, h: 1.6,
      className: 'screen-patch--goal-banner',
      html: '<b>Ура! Ты накопил<br>на мечту</b>',
    }],
    zones: [
      { id: 'avatar', anchor: 'avatar', label: 'Аватар. Нажмите, чтобы открыть альбом находок', keyboardAction: true, lift: true, round: true, x: 6.4, y: 2.34, w: 14.93, h: 2.18 },
      { id: 'goal', label: 'Открыть накопленную мечту', go: 'moneybox_goal', x: 4.27, y: 32.37, w: 91.47, h: 4.95 },
      ...MONEYBOXES.map(m => ({
        id: `topup-${m.id}`,
        anchor: `moneybox-${m.id}`,
        progress: state => {
          const box = state.moneyboxes.find(item => item.id === m.id);
          return box ? Math.max(0, Math.min(1, box.saved / box.goal)) : 0;
        },
        label: `Пополнить копилку «${m.title}»`,
        tap: shell => shell.topup(m.id),
        x: 4.27, y: MONEYBOX_Y[m.id], w: 91.47, h: 5.15,
      })),
    ],
    afterImage: () => `
      <section class="moneybox-ideas">
        <h2>Идеи для мечты</h2>
        <p>На что можно начать копить</p>
        <div class="moneybox-ideas__grid">
          <article><span>🛹</span><b>Скейт</b></article>
          <article><span>🧩</span><b>Пазл</b></article>
          <article><span>📚</span><b>Книга</b></article>
        </div>
      </section>`,
    stub: s => `
      <header class="page-hdr">
        <h1>Копилки</h1>
        <div class="page-hdr__sub">Коплю на мечту · нажми на копилку, чтобы пополнить</div>
      </header>
      ${s.moneyboxes.map(m => `
        <button class="mbox" data-zone="topup-${m.id}" data-anchor="moneybox-${m.id}" data-progress="${Math.max(0, Math.min(1, m.saved / m.goal))}">
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
    a11y: 'Мечта накоплена. Умный робот: 7 600 рублей из 7 600.',
    zone: 'green',
    tab: null,
    patches: [{
      x: 4.27, y: 24.8, w: 91.47, h: 9.3,
      className: 'screen-patch--goal-copy',
      html: '<b>Поздравляем!<br>Ты накопил на мечту</b><span>Переводи деньги и купи то, о чём мечтал. После перевода копилка отправится в архив</span>',
    }, {
      // Вместо товарного описания с маркетплейса — слова самого ребёнка о мечте.
      x: 4.27, y: 83.74, w: 91.47, h: 11.9,
      className: 'screen-patch--goal-note',
      html: '<small>Комментарий</small><span>Хочу робота, который танцует и напоминает про дела. Копил сам — по чуть-чуть каждую неделю! 🤖</span>',
    }],
    zones: [
      { id: 'back', label: 'Назад к копилкам', go: 'moneybox', x: 6.4, y: 4.19, w: 14.93, h: 3.91 },
      { id: 'goal', anchor: 'goal', label: 'Умный робот — накопленная мечта', x: 9.6, y: 11.17, w: 46.67, h: 12.07 },
    ],
    stub: () => `
      <div class="center-page">
        <div class="big-emoji" data-anchor="goal">🤖</div>
        <h1>Поздравляем! Ты накопил на мечту</h1>
        <button class="btn" data-zone="back">К копилкам</button>
      </div>`,
  },

  topup_success: {
    title: 'Копилка пополнена',
    a11y: 'Копилка пополнена. Можно вернуться на главный экран.',
    zone: 'green',
    tab: null,
    patches: [{
      // В растре — чек оплаты магазина. Экран копилки не должен читаться как платёжный.
      x: 0, y: 30.5, w: 100, h: 46,
      className: 'screen-patch--topup',
      html: s => {
        const t = s.lastTopup;
        const m = s.moneyboxes.find(x => x.id === t?.moneyboxId) || s.moneyboxes[0];
        const progress = Math.min(100, Math.round((m.saved / m.goal) * 100));
        return `
          <b class="topup-patch__title">Копилка пополнена</b>
          <span class="topup-patch__card">
            <i>${m.icon}</i>
            <span><b>${m.title}</b><small>${t ? `+${money(t.amount)}` : 'Копим дальше'}</small></span>
          </span>
          <span class="topup-patch__card topup-patch__card--progress">
            <span class="topup-patch__sum"><b>${money(m.saved)}</b><small>из ${money(m.goal)}</small></span>
            <span class="topup-patch__bar" data-anchor="progress"><i style="width:${progress}%"></i></span>
          </span>`;
      },
    }, {
      x: 4.27, y: 86.95, w: 91.47, h: 6.9,
      className: 'screen-patch--primary-button', html: '<b>На главный</b>',
    }],
    zones: [
      { id: 'success', anchor: 'success', label: 'Копилка пополнена', x: 20.27, y: 13.79, w: 34.67, h: 14.78 },
      { id: 'done', label: 'На главный', go: 'home', x: 4.27, y: 86.95, w: 91.47, h: 6.9 },
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
    a11y: 'Полезные материалы о накоплениях, кешбэке и карманных деньгах.',
    zone: 'green',
    tab: 'content',
    cropBottom: 162,
    preferStub: true,
    zones: [],
    stub: () => `
      <header class="page-hdr"><h1>Контент</h1></header>
      ${feedCard('feed-1', '#FFE7A3', '💡', 'Как накопить на мечту', 'Три простых шага')}
      ${feedCard('feed-2', '#CDEBFF', '🧮', 'Что такое кешбэк', 'Объясняем на мороженом')}
      ${feedCard('feed-3', '#E3D9FF', '🏷️', 'Угадай цену', 'Игра на 2 минуты')}
      ${feedCard('feed-4', '#D5F5DD', '🌱', 'Карманные деньги', 'Как договориться с родителями')}`,
  },

  transfer: {
    title: 'Скинуть денег',
    a11y: 'Экран перевода денег. Приколы здесь полностью отключены.',
    zone: 'red',
    tab: null,
    patches: [{
      x: 4.27, y: 39.9, w: 91.47, h: 20.1,
      className: 'screen-patch--banks',
      html: `
        <span class="bank-choice is-active"><i>₽</i><b>Мой банк</b><small>Основной</small></span>
        <span class="bank-choice"><i>★</i><b>Семейный</b><small>Для близких</small></span>
        <span class="bank-choice"><i>↗</i><b>Другой банк</b><small>По СБП</small></span>`,
    }],
    zones: [{ id: 'back', label: 'Назад на главный', go: 'home', x: 6.4, y: 7.39, w: 14.93, h: 6.9 }],
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
