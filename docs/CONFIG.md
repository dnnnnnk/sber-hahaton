# Формат config.json

Конфиг — это JSON по ключу в CMS (в прототипе — `content/config.json` или override из `cms.html`).
Все пути к ассетам — относительно `content/` (в нативе — относительно базового URL CDN).

```json
{
  "version": 1,
  "settings": { "globalCooldownMs": 3000, "maxParticles": 150, "sound": true, "haptics": true,
                "season": "auto", "albumAnchor": "avatar" },
  "prikoly": [ { …прикол… } ]
}
```

## settings

| Поле | По умолчанию | Смысл |
|---|---|---|
| `globalCooldownMs` | `3000` | пауза после полноэкранного эффекта (прикол с бо́льшим `priority` её не ждёт) |
| `maxParticles` | `150` | потолок частиц в одном эффекте |
| `sound`, `haptics` | `true` | глобально включить звук / вибрацию (у ребёнка ещё есть mute в альбоме) |
| `season` | `"auto"` | `auto` — по календарю; `autumn`/`winter`/`spring`/`summer` — «как будто сейчас середина сезона» для `dateRange` |
| `albumAnchor` | `"avatar"` | долгое нажатие на этот якорь открывает альбом находок |

## Прикол

| Поле | Тип | Смысл |
|---|---|---|
| `id` | строка, уникальная | ключ коллекции и лога |
| `title` | строка | название в альбоме и тосте «Новая находка» |
| `icon` | эмодзи | картинка в альбоме |
| `hint` | строка | подсказка в альбоме, пока не найдено (коротко, просто, без давления) |
| `enabled` | bool | выключенный прикол не создаёт триггер и не виден в альбоме |
| `priority` | число | при одновременном срабатывании играет больший |
| `trigger` | объект | что запускает — см. ниже |
| `screens` | массив id \| `null` | где можно играть; `null` — на всех зелёных. Красная зона запрещена всегда |
| `schedule` | объект \| `null` | `{ "dateRange": "MM-DD..MM-DD", "timeOfDay": "HH:MM..HH:MM" }`, оба ежегодные/ежедневные, через Новый год и полночь можно |
| `cooldownMs` | число | пауза между срабатываниями этого прикола |
| `maxPerDay` | число \| `null` | не чаще N раз в день (счётчик в `localStorage`) |
| `effect` | объект | `{ "type", "params" }` или `{ "variants": [ {type, params}, … ] }` — вариант выбирается случайно, это разнообразие, не награда |
| `haptic` | `light` \| `medium` \| `heavy` \| `success` \| `double` \| `null` | вибрация при старте (на iOS в вебе её нет — молча пропускается) |
| `sound` | путь \| `null` | например `"sounds/pop.wav"` |

В строковых параметрах эффекта `{поле}` подставляется из события: `"anchor": "task-{taskId}"`.

## Триггеры

| `type` | Параметры (по умолчанию) | Когда срабатывает |
|---|---|---|
| `event` | `name`, `where` | оболочка прислала событие, поля совпали с `where` |
| `shake` | `threshold` 14 (м/с²), `hits` 3, `windowMs` 1000, `debounceMs` 1500 | `hits` всплесков ускорения за `windowMs` |
| `tilt` | `rangeDeg` 20, `startThreshold` 0.12, `follow` 0.02 | непрерывно, пока телефон наклоняют: `{ x, y }` в −1..1 |
| `flip` | `holdMs` 300, `maxMs` 5000 | экраном вниз ≥ `holdMs` и обратно не позже `maxMs` |
| `still` | `seconds` 10, `threshold` 0.25, `rotationThreshold` 3 | лежит неподвижно `seconds` (один раз, пока не возьмут) |
| `multitap` | `anchor`, `count` 3, `withinMs` 450 | `count` быстрых тапов по якорю |
| `longpress` | `anchor`, `ms` 600 | долгое нажатие на якорь |

### where (для `event`)

```json
{ "taskId": "dog_walk" }                          // равенство
{ "taskId": ["dishes", "clean_room"] }            // массив = одно из
{ "value": { "in": [777, 1111, 1234, 2222] } }    // одно из
{ "progress": { "gte": 0.5, "lt": 1 } }           // eq ne gt gte lt lte, можно несколько сразу
{ "progress": { "crosses": [0.25, 0.5, 0.75, 1] } } // порог пересечён: prevProgress < t ≤ progress
```

## Эффекты

### `particles` — частицы на canvas (полноэкранный)

| Параметр | По умолчанию | Смысл |
|---|---|---|
| `mode` | `"normal"` | `"trail"` — следы цепочкой по траектории (лапки) |
| `spawn` | `"top"` | `top` (падают), `bottom` (всплывают), `center` / `anchor` (разлёт) |
| `anchor` | — | якорь для `spawn: "anchor"` и начала следов |
| `emoji` | — | эмодзи или символы (`"7"`, `"А"`); символы красятся из `colors` |
| `shapes` | — | `circle`, `rect` (конфетти), `star`, `spark`, `bubble`, `snow`, `petal` |
| `images` | — | картинки из `content/effects/` |
| `colors` | 5 цветов | для фигур и символов |
| `count` | 40 | частиц (или шагов следа), не больше `settings.maxParticles` |
| `size` | `[18, 30]` | px, число или `[min, max]` |
| `speed`, `direction`, `spread` | от `spawn` | стартовая скорость px/с, направление в градусах (90 — вниз), разброс |
| `gravity`, `drag` | от `spawn` | ускорение px/с² (минус — вверх) и сопротивление; предельная скорость = gravity/drag |
| `wind`, `sway` | 0 | постоянный снос px/с и покачивание px |
| `rotation` | 0 | макс. вращение °/с |
| `flutter` | false | «переворачивание» в полёте (конфетти, лепестки) |
| `fade` | true | таять в конце жизни |
| `lifeMs` | `[2500, 4000]` | жизнь частицы |
| `emitMs` | 0 | выпускать частицы постепенно в течение `emitMs` |
| `durationMs` | 4000 | жёсткий предел: к этому моменту всё гаснет |
| `settleOn`, `settleChance`, `settleMs` | —, 0.5, 2000 | частица, долетевшая до верхнего края якоря, ложится на него и тает |
| `stepMs` | 160 | (trail) интервал между шагами |

### `lottie` — Lottie-анимация в точке

`src` (путь к JSON), `anchor` (иначе центр), `size` 160, `speed` 1, `durationMs`. Играет один раз и удаляется.
Те же файлы без изменений играют Lottie Android/iOS.

### `cssAnimate` — анимация самого якоря

`anchor`, `animation`: `flip` (сальто), `jump`, `wiggle`, `pop`; `durationMs`, `repeat`.

### `holo` — голографический блик (непрерывный, для `tilt`)

`anchor` (`card`), `intensity` 0..1, `idleMs` 900 (через сколько покоя гаснет), `durationMs` (предел жизни).

## Примеры

**Новый прикол только конфигом** — «шарики по пополнению копилки на велосипед»:

```json
{
  "id": "bike-balloons", "title": "Шарики", "icon": "🎈", "hint": "Пополни копилку на велосипед",
  "enabled": true, "priority": 7,
  "trigger": { "type": "event", "name": "moneybox:topup", "where": { "moneyboxId": "bike" } },
  "screens": ["topup_success"], "schedule": null, "cooldownMs": 0, "maxPerDay": 5,
  "effect": { "type": "particles", "params": { "spawn": "bottom", "emoji": ["🎈"], "count": 14,
              "size": [30, 44], "sway": 20, "lifeMs": [2500, 3200], "durationMs": 3500 } },
  "haptic": "light", "sound": "sounds/pop.wav"
}
```

**Сезонный прикол** — только в декабре, по тряске, с оседанием на карте:

```json
"trigger": { "type": "shake" },
"schedule": { "dateRange": "12-01..12-31" },
"effect": { "type": "particles", "params": { "spawn": "top", "shapes": ["snow"], "settleOn": ["card"] } }
```

**Утреннее приветствие** — первый запуск за день до 11:00:

```json
"trigger": { "type": "event", "name": "app:firstOpenToday", "where": { "hour": { "lt": 11 } } },
"effect": { "type": "lottie", "params": { "src": "effects/sparkle.json", "anchor": "avatar" } }
```

## Проверка

- CMS (`cms.html` → вкладка JSON) проверяет конфиг теми же правилами, что и движок, и показывает,
  какие записи будут пропущены и почему.
- В `index.html?debug=1` лог показывает каждое решение: `shake → season-winter-snow: ⏭ не сезон`.
- Вес `content/` целиком — не больше 6 МБ.
