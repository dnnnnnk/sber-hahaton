// Вибрация. На iOS navigator.vibrate нет — обёртка молча ничего не делает.

const PATTERNS = {
  light: 10,
  medium: 20,
  heavy: 35,
  success: [12, 60, 18],
  double: [10, 40, 10],
};

export function createHaptics(isEnabled) {
  const supported = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

  return {
    supported,
    play(kind) {
      if (!kind || !supported || !isEnabled()) return;
      // Без жеста пользователя Chrome всё равно не завибрирует, а только напишет предупреждение.
      if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
      const pattern = Array.isArray(kind) || typeof kind === 'number' ? kind : PATTERNS[kind];
      if (pattern == null) return;
      try {
        navigator.vibrate(pattern);
      } catch {
        // вибрация — необязательное украшение
      }
    },
  };
}
