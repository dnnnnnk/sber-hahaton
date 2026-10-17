# Доказательства приёмки P0

17 октября 2026. Контактные листы собраны из настоящих скриншотов при viewport 375×812; изображения перекодированы в WebP с потерями (качество 0,8) — это иллюстрации, а не эталоны.
Длинные экраны показаны несколькими кадрами с перекрытием. Каждый кадр имеет подпись исходного файла.

[Ассеты и ограничения путей](assets.json) · [Отмена звука и вибрации](sound.txt) · [Регрессия P2 после P0](p2-regression.json).

[Полный функциональный протокол](report.json) · [Дополнительная визуальная проверка 22 вариантов](visual.json) · [Версии браузеров и SHA-256 исходников](manifest.json)

Естественное завершение проверяет полный прогон. Визуальный прогон снимает частицы в середине анимации, затем останавливает их; он не заменяет проверку завершения.

## Chromium

Экраны: [лист 1](chromium-screens-1.webp), [лист 2](chromium-screens-2.webp).

Зоны и якоря: [лист 1](chromium-zones-1.webp), [лист 2](chromium-zones-2.webp).

Все эффекты и варианты: [лист 1](chromium-effects-1.webp), [лист 2](chromium-effects-2.webp), [лист 3](chromium-effects-3.webp).

Альбом, debug и CMS: [лист 1](chromium-ui-1.webp).

[CMS с превью при 1280×900](chromium-cms-preview.webp).

## WebKit

Экраны: [лист 1](webkit-screens-1.webp), [лист 2](webkit-screens-2.webp).

Зоны и якоря: [лист 1](webkit-zones-1.webp), [лист 2](webkit-zones-2.webp).

Все эффекты и варианты: [лист 1](webkit-effects-1.webp), [лист 2](webkit-effects-2.webp), [лист 3](webkit-effects-3.webp).

Альбом, debug и CMS: [лист 1](webkit-ui-1.webp).

[CMS с превью при 1280×900](webkit-cms-preview.webp).

Полные отдельные PNG сохраняются при повторном запуске в `QA_DIR`. Методика — [P0_QA.md](../../P0_QA.md).
