// Минимальная шина событий: оболочка → движок. Контракт событий — docs/ARCHITECTURE.md.
// Подписка на '*' получает все события (нужно debug-панели).

export function createBus() {
  const handlers = new Map();

  function on(name, fn) {
    if (!handlers.has(name)) handlers.set(name, new Set());
    handlers.get(name).add(fn);
    return () => off(name, fn);
  }

  function off(name, fn) {
    handlers.get(name)?.delete(fn);
  }

  function emit(name, payload = {}) {
    for (const key of [name, '*']) {
      for (const fn of [...(handlers.get(key) || [])]) {
        try {
          fn(payload, name);
        } catch (err) {
          console.error(`[bus] обработчик "${name}" упал`, err);
        }
      }
    }
  }

  return { on, off, emit };
}
