# tools/

Генераторы собственных ассетов (никаких сторонних сэмплов и анимаций). Нужны только если захотите пересобрать:

```bash
python3 tools/gen_sounds.py content/sounds        # pop, chime, sparkle, boing, whoosh (.wav, 22 кГц, моно)
python3 tools/gen_lottie.py content/effects/sparkle.json   # Lottie «вспышка»
```
