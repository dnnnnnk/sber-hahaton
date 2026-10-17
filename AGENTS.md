# AGENTS.md — правила для ИИ-агентов и людей

Прочитай целиком перед любым изменением. Здесь всё, что нужно, чтобы добавить прикол, не читая весь код.

## Что это

Хакатон Сбера «Создаём эмоции», приложение СберKids (дети 6–13 лет), трек «Приколы»: короткие (секунды)
эффекты **поверх** экранов приложения, которые не мешают им пользоваться. Веб-прототип — эталонная реализация
движка, который потом переносится в нативные приложения (Kotlin/Compose и Swift/SwiftUI, см. `docs/NATIVE.md`).

## Три слоя и их границы

| Слой | Папка | Что изображает | Можно | Нельзя |
|---|---|---|---|---|
| Оболочка | `app/` | существующие нативные приложения | рисовать экраны, слать события в шину | знать про приколы, конфиг, эффекты |
| Движок | `engine/` | то, что напишем в нативе | события, сенсоры, правила, слой эффектов | трогать вёрстку оболочки, селекторы, `app/*` |
| Контент | `content/` | CMS-ключ + CDN | `config.json`, Lottie, картинки, звуки | код |

- Движок видит оболочку только через **шину событий** и **якоря** (`stage.getAnchorRect(name)`,
  `stage.getAnchorElement(name)`). Якорь в разметке — атрибут `data-anchor="<имя>"`.
- Движок ничего не решает сам: всё поведение — в `content/config.json`.
- `cms.html` + `cms/` — мини-CMS, правит конфиг через override в `localStorage`.

```
index.html  cms.html  AGENTS.md  README.md
app/        main.js (оболочка, навигация, lazy-загрузка движка) · screens.js (экраны, зоны, READY_IMAGES)
            bus.js · debug.js + debug.css (панель ?debug=1) · shell.css
engine/     engine.js (boot/init/reload) · config.js (загрузка+валидация) · rules.js · stage.js · sensors.js
            ui.js (тост, чип разрешений, альбом) · collection.js · haptics.js · sound.js · engine.css
engine/triggers/  index.js (реестр) + по файлу на тип
engine/effects/   index.js (реестр) + по файлу на тип
content/    config.json · effects/ (Lottie, картинки) · sounds/
cms/        cms.js · cms.css
screens/    экраны из Figma в WebP, кадр 375 pt @2x + tabbar.webp (см. screens/README.md)
vendor/     lottie.min.js (единственная внешняя библиотека, локальная копия)
docs/       ARCHITECTURE.md (слои, конвейер решений) · CONFIG.md (формат конфига) · NATIVE.md (Kotlin/Swift)
tools/      генераторы звуков и Lottie (Python), перекодировщик экранов в WebP — только для пересборки ассетов
```

## Контракт событий (оболочка → движок)

Стабилен. Новое поле — можно (обратно совместимо), переименовать/удалить — нельзя без правки всех конфигов.

```
screen:open        { screen, zone: 'green' | 'red' }
task:done          { taskId }                     // dog_walk, dishes, multiplication, clean_room, read_book
tasks:allDone      {}
moneybox:topup     { moneyboxId, progress, prevProgress }   // 0..1
balance:show       { value }                      // число, наружу не уходит
app:firstOpenToday { hour }
```

## Как добавить прикол (обычно — только конфиг)

1. Добавь запись в `content/config.json` → `prikoly` (полный формат — `docs/CONFIG.md`):

```json
{
  "id": "tasks-alive-dog", "title": "Лапки", "icon": "🐾", "hint": "Отметь прогулку с собакой",
  "enabled": true, "priority": 10,
  "trigger": { "type": "event", "name": "task:done", "where": { "taskId": "dog_walk" } },
  "screens": ["tasks"], "schedule": null, "cooldownMs": 0, "maxPerDay": null,
  "effect": { "type": "particles", "params": { "mode": "trail", "emoji": ["🐾"], "durationMs": 2500 } },
  "haptic": "light", "sound": "sounds/pop.wav"
}
```

2. Ассеты — в `content/effects/` или `content/sounds/`, пути в конфиге относительно `content/`. Только свои образы.
   Если прикол привязан к элементу экрана — нужен якорь (список в `docs/ARCHITECTURE.md`).
3. Проверь в `index.html?debug=1`: лог решений движка покажет, сработал прикол или почему пропущен.

Фильтр `where`: `{ "taskId": "dog_walk" }` (равенство), `{ "value": { "in": [777, 1111] } }`,
`{ "progress": { "gte": 0.5 } }`, операторы `eq ne in gt gte lt lte crosses`.
В строковых параметрах эффекта `{поле}` подставляется из события: `"anchor": "task-{taskId}"`.

## Как добавить тип триггера или эффекта

**Триггер** — файл `engine/triggers/<type>.js` + строка в `engine/triggers/index.js`:

```js
export default {
  type: 'shake',
  sensors: ['motion'],                    // какие источники нужны (для запроса разрешений iOS)
  create(spec, ctx, fire) {               // ctx: { bus, sensors, stage, settings }
    const off = ctx.sensors.subscribe('motion', sample => { /* … */ fire({ strength: 1 }); });
    return off;                           // dispose: отписаться от всего
  },
};
```

**Эффект** — файл `engine/effects/<type>.js` + строка в `engine/effects/index.js`:

```js
export default {
  type: 'particles',
  fullscreen: true,                       // одновременно играет не больше одного полноэкранного
  play(params, ctx) {                     // ctx: { stage, settings, reducedMotion, asset(src), haptics, sound, end() }
    // …рисуем; по завершении ОБЯЗАТЕЛЬНО ctx.end() и убрать за собой всё
    return { stop() { /* мгновенно убрать всё и вызвать ctx.end() */ }, update(payload) { /* опционально */ } };
  },
};
```

Эффект обязан сам завершиться за `params.durationMs` (движок подстрахует принудительным `stop()`).
Анимации — через `ctx.stage.addRenderer()` (один общий `requestAnimationFrame`, сам останавливается) или CSS/WAAPI.

## Чек-лист ограничений (нарушать нельзя)

- [ ] **Красная зона**: на экранах оплаты, перевода, пополнения, реквизитов, лимитов, QR эффекты не показываются;
      при переходе туда текущий эффект гаснет немедленно (`zone: 'red'` в `app/screens.js`).
- [ ] **Не блокировать ввод**: слой эффектов всегда `pointer-events: none`; никаких модалок; тост ≤ 2 с и не
      перекрывает навигацию. Исключение — альбом коллекции (открывает сам пользователь, закрывается тапом/свайпом).
- [ ] **Не замедлять запуск**: движок и конфиг грузятся после первой отрисовки, ассеты — по требованию.
- [ ] **Ресурсы**: `requestAnimationFrame`, частиц ≤ `settings.maxParticles` (150), DPR ≤ 2, цикл стоит, когда
      эффектов нет; пауза при `document.hidden`; `prefers-reduced-motion` → облегчённый вариант или пропуск.
- [ ] **Вес ассетов приколов ≤ 6 МБ** (`content/` целиком).
- [ ] **Без бэкенда и внешних запросов**: никаких API, аналитики, трекеров, CDN, внешних шрифтов. Только свой origin.
- [ ] **Данные не уходят с устройства**: баланс, суммы, имена — никуда.
- [ ] **Без лотерей и тёмных паттернов**: никаких рулеток, сундуков, случайных наград, обратных отсчётов, стриков.
      Случайность — только выбор визуального варианта (`effect.variants`).
- [ ] **Контент**: только собственные образы; нельзя Сберкота, свинку, чужих персонажей, бренды, оружие,
      внешние ссылки и QR. 0+/6+, доброжелательно, тексты короткие и простые.
- [ ] **Без новых разрешений**, кроме датчиков движения на iOS (системный запрос по жесту пользователя).
- [ ] **Две платформы**: Safari на iPhone и Chrome на Android.

## Стиль кода

- Чистые HTML/CSS/JS, ES-модули, без сборщика, фреймворков и TypeScript. Открывается как статика.
- Все пути **относительные** (сайт живёт в подпапке `/sber-hahaton/`). Внутри движка — `new URL(…, import.meta.url)`.
- Идентификаторы — по-английски, тексты интерфейса — по-русски, комментарии — коротко и по делу.
- Шрифт — системный стек. Никаких новых зависимостей (кроме уже лежащей `vendor/lottie.min.js`).
- `localStorage` — только внутри `try/catch` (в приватном режиме бросает). Ключи с префиксом `prikoly.` / `sberkids.`.
- Ошибка в прикле не должна ломать оболочку: движок ловит исключения триггеров и эффектов.

## Как работать

- Не трогай чужой слой без необходимости: задача «новый прикол» = `content/` (+ при нужде новый модуль в
  `engine/triggers` или `engine/effects`). Оболочку меняем, только если нужен новый экран, якорь или событие.
- Новое событие или якорь — добавь в контракт (этот файл + `docs/ARCHITECTURE.md`).
- Запуск: `python3 -m http.server 8000` в корне → http://localhost:8000/ и http://localhost:8000/?debug=1
  (CMS: http://localhost:8000/cms.html). Сенсоры на десктопе — кнопками debug-панели.
- **После изменений** — открыть `?debug=1`, проверить, что прикол срабатывает (лог решений), на `transfer`
  ничего не играет, в консоли нет ошибок.
- Коммиты небольшие, сообщение — что и зачем. Пуш в `main` → GitHub Pages обновится сам.
