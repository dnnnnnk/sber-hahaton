# tools/

Генераторы собственных ассетов (никаких сторонних сэмплов и анимаций). Нужны только если захотите пересобрать:

```bash
python3 tools/gen_sounds.py content/sounds        # pop, chime, sparkle, boing, whoosh (.wav, 22 кГц, моно)
python3 tools/gen_lottie.py content/effects/sparkle.json   # Lottie «вспышка»
```

Экраны из Figma → WebP (`screens/`). Кодирует headless Chromium из Playwright — это инструмент разработки,
сайту он не нужен. Playwright ставится без `package.json` (`node_modules/` в `.gitignore`):

```bash
npm i --no-save playwright@1.54 && npx playwright install chromium
node tools/encode_screens.mjs ~/Downloads/figma-png --probe   # таблица размер/PSNR для разных quality
node tools/encode_screens.mjs ~/Downloads/figma-png           # → screens/*.webp, quality 0.9
```

Размер в пикселях сохраняется (@2x), поэтому зоны в `app/screens.js` не сдвигаются. Новый файл — в `READY_IMAGES`.
