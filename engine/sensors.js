// Источники ввода для триггеров: движение, ориентация, касания и доступная клавиатурная активация якорей.
// Слушатели окна висят, только пока у источника есть подписчики.
// На iOS движение и ориентация требуют разрешения — его можно запросить только из жеста пользователя.

const SOURCES = {
  motion: emit => listen(window, 'devicemotion', e => emit(normalizeMotion(e))),
  orientation: emit => listen(window, 'deviceorientation', e => {
    if (e.beta == null || e.gamma == null) return;
    emit({ alpha: e.alpha, beta: e.beta, gamma: e.gamma, t: e.timeStamp });
  }),
  pointer: emit => {
    const handler = e => emit({ type: e.type, x: e.clientX, y: e.clientY, id: e.pointerId, t: e.timeStamp });
    const offs = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']
      .map(type => listen(document, type, handler, { capture: true, passive: true }));
    return () => offs.forEach(off => off());
  },
  keyboard: emit => listen(document, 'keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const anchor = e.target.closest?.('[data-anchor]')?.dataset.anchor;
    if (!anchor) return;
    e.preventDefault();
    emit({ key: e.key, anchor, t: e.timeStamp });
  }),
};

// Источники, которым на iOS нужно разрешение.
export const PERMISSION_SOURCES = ['motion', 'orientation'];

export function createSensors() {
  const subscribers = Object.fromEntries(Object.keys(SOURCES).map(kind => [kind, new Set()]));
  const detach = {};
  let permission = hasPermissionApi() ? 'unknown' : 'granted';
  let request = null;

  function emit(kind, data) {
    for (const fn of [...subscribers[kind]]) {
      try {
        fn(data);
      } catch (err) {
        console.error(`[prikoly] обработчик сенсора ${kind} упал`, err);
      }
    }
  }

  function attach(kind) {
    detach[kind] = SOURCES[kind](data => emit(kind, data));
  }

  return {
    subscribe(kind, fn) {
      const set = subscribers[kind];
      set.add(fn);
      if (set.size === 1) attach(kind);
      return () => {
        set.delete(fn);
        if (!set.size && detach[kind]) {
          detach[kind]();
          detach[kind] = null;
        }
      };
    },

    // Debug: подсунуть данные датчика, как будто они пришли от устройства.
    inject(kind, data) {
      emit(kind, { t: performance.now(), ...data });
    },

    get permission() { return permission; },
    needsPermission: () => permission === 'unknown',

    // Только из обработчика жеста! Оба запроса — синхронно, иначе iOS потеряет «жест».
    requestPermission() {
      if (permission !== 'unknown') return Promise.resolve(permission);
      if (request) return request;
      const asks = [window.DeviceMotionEvent, window.DeviceOrientationEvent]
        .filter(api => typeof api?.requestPermission === 'function')
        .map(api => api.requestPermission());
      request = Promise.all(asks)
        .then(results => {
          permission = results.every(r => r === 'granted') ? 'granted' : 'denied';
          // Переподписываемся, чтобы события точно пошли после разрешения.
          for (const kind of PERMISSION_SOURCES) {
            if (detach[kind]) {
              detach[kind]();
              attach(kind);
            }
          }
          return permission;
        })
        .catch(() => permission) // вызвали не из жеста — попробуем на следующем касании
        .finally(() => {
          request = null;
        });
      return request;
    },

    // После долгого нажатия гасим «клик», который браузер пришлёт следом.
    suppressNextClick() {
      const stop = e => {
        e.preventDefault();
        e.stopPropagation();
      };
      document.addEventListener('click', stop, { capture: true, once: true });
      setTimeout(() => document.removeEventListener('click', stop, { capture: true }), 800);
    },
  };
}

// Линейное ускорение (без гравитации): берём acceleration, а если его нет — фильтруем гравитацию сами.
let gravity = null;

function normalizeMotion(e) {
  const g = e.accelerationIncludingGravity || {};
  const a = e.acceleration;
  const r = e.rotationRate;
  const gx = g.x ?? 0;
  const gy = g.y ?? 0;
  const gz = g.z ?? 0;
  let linear;
  if (a && a.x != null) {
    linear = Math.hypot(a.x, a.y ?? 0, a.z ?? 0);
  } else {
    gravity = gravity ? gravity.map((v, i) => v * 0.8 + [gx, gy, gz][i] * 0.2) : [gx, gy, gz];
    linear = Math.hypot(gx - gravity[0], gy - gravity[1], gz - gravity[2]);
  }
  const rotation = r ? Math.hypot(r.alpha ?? 0, r.beta ?? 0, r.gamma ?? 0) : 0;
  return { linear, rotation, gx, gy, gz, t: e.timeStamp };
}

function hasPermissionApi() {
  return typeof window.DeviceMotionEvent?.requestPermission === 'function'
    || typeof window.DeviceOrientationEvent?.requestPermission === 'function';
}

function listen(target, type, handler, options) {
  target.addEventListener(type, handler, options);
  return () => target.removeEventListener(type, handler, options);
}
