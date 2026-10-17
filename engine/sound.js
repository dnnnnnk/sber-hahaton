// Звуки приколов через Web Audio: файлы грузятся по требованию и кэшируются.
// Глобальный mute хранится в localStorage. На iOS звук «разблокируется» первым касанием (unlock()).

const MUTE_KEY = 'prikoly.muted';

export function createSound(isEnabled) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const buffers = new Map();
  let audio = null;
  let muted = readMuted();

  function context(fromGesture) {
    if (audio || !AudioCtx) return audio;
    // Без жеста пользователя браузер не даст стартовать — не создаём контекст раньше времени.
    if (!fromGesture && !navigator.userActivation?.hasBeenActive) return null;
    audio = new AudioCtx();
    try {
      if (navigator.audioSession) navigator.audioSession.type = 'ambient'; // уважать беззвучный режим iOS
    } catch {
      // старые браузеры
    }
    return audio;
  }

  function load(url) {
    if (!buffers.has(url)) {
      const promise = fetch(url)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.arrayBuffer();
        })
        .then(data => new Promise((resolve, reject) => audio.decodeAudioData(data, resolve, reject)));
      promise.catch(() => buffers.delete(url));
      buffers.set(url, promise);
    }
    return buffers.get(url);
  }

  return {
    unlock() {
      const ctx = context(true);
      if (ctx?.state === 'suspended') ctx.resume().catch(() => {});
    },

    play(url, volume = 0.5) {
      if (!url || muted || !isEnabled()) return;
      const ctx = context(false);
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      load(url)
        .then(buffer => {
          const source = ctx.createBufferSource();
          const gain = ctx.createGain();
          gain.gain.value = volume;
          source.buffer = buffer;
          source.connect(gain).connect(ctx.destination);
          source.start();
        })
        .catch(err => console.warn(`[prikoly] звук ${url} не проигрался`, err));
    },

    isMuted: () => muted,
    setMuted(value) {
      muted = Boolean(value);
      try {
        localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
      } catch {
        // без хранилища mute живёт до перезагрузки
      }
    },
  };
}

function readMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}
