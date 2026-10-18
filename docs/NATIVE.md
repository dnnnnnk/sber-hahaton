# Перенос в нативные приложения

Движок специально написан так, чтобы перенос был построчным: те же сущности, те же интерфейсы, тот же
`config.json` и те же Lottie-файлы. Бэкенд не нужен, новых разрешений нет (в нативе акселерометр и
гироскоп разрешений не требуют).

## Таблица соответствий

| Веб-прототип | Android (Kotlin, Compose) | iOS (Swift, SwiftUI) |
|---|---|---|
| `app/bus.js` — шина событий | `SharedFlow<PrikolEvent>` в синглтоне `Prikoly`; экраны зовут `Prikoly.emit(TaskDone(id))` | `PassthroughSubject<PrikolEvent, Never>` / `AsyncStream`; `Prikoly.shared.emit(.taskDone(id))` |
| `screen:open { zone }` | `LaunchedEffect(route)` в `NavHost` + список красных маршрутов | `.onAppear` / `NavigationStack` path + список красных экранов |
| `stage` — слой поверх экрана | `Box { AppContent(); PrikolyOverlay() }`, оверлей без обработки касаний | `.overlay { PrikolyOverlay().allowsHitTesting(false) }` на корневом view |
| якоря `data-anchor` / `getAnchorRect` | `Modifier.prikolyAnchor("card")` = `onGloballyPositioned` → `Map<String, Rect>` | `.prikolyAnchor("card")` = `anchorPreference` / `GeometryReader` → `[String: CGRect]` |
| `particles` (canvas) | `Canvas` + `withFrameNanos` в `LaunchedEffect`, спрайты — `ImageBitmap` из эмодзи | `Canvas` + `TimelineView(.animation)`, спрайты — `context.resolve(Text("🍂"))` |
| `lottie` | `lottie-compose`: `LottieAnimation(composition, iterations = 1)` | `lottie-ios`: `LottieView(animation:).playing(loopMode: .playOnce)` |
| `cssAnimate` (WAAPI) | `Animatable` + `graphicsLayer { rotationZ; translationY }` на view якоря | `.rotationEffect` / `.offset` + `withAnimation` на view якоря (`PhaseAnimator`/`keyframeAnimator`) |
| `holo` (`mix-blend-mode`) | `Brush.linearGradient` + `BlendMode.Overlay`/`HardLight` в `drawWithContent` | `LinearGradient` + `.blendMode(.hardLight)` поверх карты |
| `stage.attachToAnchor` (слой эффекта внутри якоря: голограмма в форме карты) | `Modifier.drawWithContent { drawContent(); drawHolo() }` + `clip(RoundedCornerShape(20.dp, 20.dp, 5.dp, 5.dp))` на самой карте | `.overlay { Holo() }.clipShape(UnevenRoundedRectangle(…))` на view карты |
| `shake`, `still` (`devicemotion`) | `SensorManager`, `TYPE_LINEAR_ACCELERATION` (+ `TYPE_GYROSCOPE`) | `CMMotionManager.deviceMotion` (`userAcceleration`, `rotationRate`) |
| `tilt`, `flip` (`deviceorientation`) | `TYPE_ROTATION_VECTOR` → `getOrientation` (pitch/roll) | `CMMotionManager.deviceMotion.attitude` (pitch/roll) |
| `multitap`, `longpress` (pointer на document; Enter/Space для доступного `longpress`) | `pointerInput` с `PointerEventPass.Initial` на корне, без consume; якорь альбома — семантическая кнопка | `simultaneousGesture` на корне или `UIWindow.sendEvent`; якорь альбома — accessibility action |
| `rules.js` | чистый Kotlin, без Android-зависимостей (юнит-тесты как есть) | чистый Swift |
| `config.json` override из CMS | CMS-ключ: произвольный JSON по ключу (уже умеет приложение) → `kotlinx.serialization` | тот же ключ → `Codable` |
| ассеты `content/` | CDN + дисковый кэш (Coil / OkHttp cache), Lottie по URL с кэшем | CDN + `URLCache`, `LottieAnimation.loadedFrom(url:)` |
| `collection.js`, `prefs.js` («Показывать Каплю») (localStorage) | `DataStore<Preferences>` | `UserDefaults` / `@AppStorage` |
| `haptics.js` | `HapticFeedback` / `VibrationEffect.createPredefined` | `UIImpactFeedbackGenerator`, `UINotificationFeedbackGenerator(.success)` |
| `sound.js` | `SoundPool` (короткие сэмплы) | `AVAudioPlayer` с категорией `.ambient` |
| пауза при `document.hidden` | `Lifecycle.State.STARTED` (`repeatOnLifecycle`) | `scenePhase != .active` |
| `prefers-reduced-motion` | `Settings.Global.ANIMATOR_DURATION_SCALE == 0` | `UIAccessibility.isReduceMotionEnabled` |
| тост, альбом | маленький `Snackbar`-подобный оверлей; `ModalBottomSheet` | оверлей-капсула; `.sheet` с `presentationDetents` |

## Интерфейсы

```kotlin
interface Trigger { fun start(spec: TriggerSpec, ctx: TriggerContext, fire: (Map<String, Any>) -> Unit): () -> Unit }
interface Effect {
    val fullscreen: Boolean
    fun play(params: JsonObject, ctx: EffectContext): EffectHandle?   // null — нет якоря
}
interface EffectHandle { fun stop(); fun update(payload: Map<String, Any>) {} }
```

```swift
protocol Trigger { func start(_ spec: TriggerSpec, _ ctx: TriggerContext, fire: @escaping ([String: Any]) -> Void) -> () -> Void }
protocol Effect { var fullscreen: Bool { get }; func play(_ params: JSON, _ ctx: EffectContext) -> EffectHandle? }
protocol EffectHandle { func stop(); func update(_ payload: [String: Any]) }
```

Реестры — `Map<String, Trigger>` / `[String: Trigger]`; новый тип = класс + строка в реестре, как в вебе.
Обе платформы должны повторить смысловую валидацию веб-эталона: неотрицательные длительности и лимиты,
`maxParticles` в диапазоне `0..500`, реальные календарные диапазоны и проверки параметров каждого типа.
`maxParticles = 0` означает отсутствие визуальных частиц, а не принудительный минимум в одну.

## Что меняется без релиза

Всё, что в `config.json`: какие приколы включены, где и когда играют, кулдауны, лимиты, приоритеты,
параметры частиц, тексты, подсказки, звуки и Lottie-файлы (по URL с CDN). Релиз нужен только для нового
**типа** триггера или эффекта — и это небольшой модуль по интерфейсу выше.

## Оценка объёма (на платформу, 1 разработчик)

| Блок | Дней |
|---|---|
| Шина + события из 6 мест существующих экранов | 1 |
| Оверлей + якоря (модификатор / view-модификатор) | 1–1,5 |
| Правила, конфиг, валидация, загрузка по CMS-ключу, кэш | 1,5 |
| Частицы (Canvas, спрайты, оседание, следы) | 2–3 |
| Lottie, cssAnimate, голограмма | 1,5 |
| Сенсорные триггеры (shake, tilt, flip, still) + жесты (multitap, longpress) | 1,5–2 |
| Коллекция, тост, альбом | 1,5 |
| Звук, вибрация, reduced motion, lifecycle | 1 |
| Тесты правил, QA на слабых устройствах | 1,5–2 |
| **Итого** | **~13–15** |

Риски: производительность частиц на слабых Android (решается лимитом частиц из конфига без релиза),
корректный расчёт якорей при прокрутке (в Compose/SwiftUI это стандартные механизмы).

## Дополнение P2

Оценка ниже — дополнительно к базовому движку, на одну платформу и одного разработчика.

| Пункт | Реализация | Дней |
|---|---|---|
| Звенящие копилки | тот же Canvas, клип по карточкам, простые столкновения кругов; якорь отдаёт только прогресс `0..1` | 1 |
| Капля на карте | собственные кривые Canvas, пружинная физика; одновременное пассивное наблюдение за жестами, отписка по завершении | 1–1,5 |
| Переходы и нажатия | штатные анимации оболочки; доступность и reduced motion | 0,5 |
| QA P2 | реальные датчики, жизненный цикл, лимиты и жесты поверх функций приложения | 0,5–1 |
| **Дополнительно P2** | | **3–4** |

Общая оценка с P2 — около **16–19 дней на платформу**. Синтезированные звон, смешок и удивление можно заранее
сохранить в локальные WAV; они не требуют сервиса или новых разрешений. Ни один эффект не читает сумму,
не меняет накопления и не добавляет вознаграждений. Срок жизни и очистка при красной зоне остаются общими
гарантиями движка, а не обязанностью каждого экрана приложения.

## Дополнение: геройские моменты демо (18 октября)

| Пункт | Android (Compose) | iOS (SwiftUI) | Дней |
|---|---|---|---|
| Капля — постоянный жилец (`presence`, реакции из конфига) | composable в оверлее над таббаром: `Animatable` для пружин (сквош, прыжок, катание), выражения лица — состояния векторного рисунка; `Modifier.pointerInput` только на круге тела | view в `.overlay` над `TabView`; `spring`/`keyframeAnimator`, `Canvas` или `Shape`-лицо; `.contentShape(Circle())` + `allowsHitTesting` только для тела | 2–2,5 |
| Таблица реакций «событие → реакция» | тот же JSON в `Map<String, Reaction>`, подписка на `SharedFlow` событий и сенсоры | `[String: Reaction]`, `AsyncStream` событий и `CMMotionManager` | 0,5 |
| Голограмма-фольга | 4 слоя `Brush` с `BlendMode.HardLight/Screen/Overlay` в `drawWithContent` карты, сдвиг от `rotation vector` | `LinearGradient`/`RadialGradient` с `.blendMode`, сдвиг от `attitude` | 0,5–1 |
| Кувырок (ночь/рассвет) | полноэкранный `Box` с градиентами и звёздами, `flip` по `gravity.z`; рассвет — `animateFloatAsState` | `ZStack` с градиентами, `TimelineView` для мерцания, `flip` по `gravity.z` | 1 |
| Смахивание погоды | `pointerInput(PointerEventPass.Initial)` на корне без consume — палец виден и во время прокрутки | `simultaneousGesture(DragGesture(minimumDistance: 0))` на корне | 0,5 |
| Снежинки-кристаллы, летние блики | спрайты `Path` в `ImageBitmap` (с тенью), бегущий `Brush` по якорям | `Path` → `GraphicsContext.resolve`, `LinearGradient` по якорям | 0,5–1 |
| **Дополнительно** | | | **5–6,5** |

Итого с P2 и геройскими моментами — около **21–25 дней на платформу**. Синтезированные тембры Капли и переливов
можно заранее записать в локальные WAV. Всё по-прежнему управляется одним JSON по CMS-ключу: реакции Капли,
сезоны и включение приколов меняются без релиза.
