// Звуки приколов через Web Audio: файлы грузятся по требованию и кэшируются.
// Глобальный mute хранится в localStorage. На iOS звук «разблокируется» первым касанием (unlock()).

const MUTE_KEY = 'prikoly.muted';

export function createSound(isEnabled) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const buffers = new Map();
  let audio = null;
  let muted = readMuted();
  const voices = new Set();

  function stopAll() {
    for (const stop of [...voices]) stop();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopAll();
  });

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
      if (!url || muted || !isEnabled() || document.hidden) return;
      const ctx = context(false);
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      let source = null;
      let gain = null;
      let stopped = false;
      const stop = () => {
        if (stopped) return;
        stopped = true;
        if (source) {
          source.onended = null;
          try { source.stop(); } catch { /* уже закончился */ }
          source.disconnect();
          gain.disconnect();
        }
        voices.delete(stop);
      };
      // Резервируем отмену до fetch/decode: поздняя загрузка уже не запустит звук.
      voices.add(stop);
      load(url)
        .then(buffer => {
          if (stopped) return;
          if (muted || !isEnabled() || document.hidden) return stop();
          source = ctx.createBufferSource();
          gain = ctx.createGain();
          gain.gain.value = volume;
          source.buffer = buffer;
          source.connect(gain).connect(ctx.destination);
          source.onended = stop;
          source.start();
        })
        .catch(err => {
          const cancelled = stopped;
          stop();
          if (!cancelled) console.warn(`[prikoly] звук ${url} не проигрался`, err);
        });
      return stop;
    },

    // Собственные короткие тембры. На появление персонажа звук не вызывается.
    synth(kind) {
      if (muted || !isEnabled() || document.hidden) return null;
      const ctx = context(false);
      if (!ctx || ctx.state !== 'running') return null;
      // [начало, частота, длительность, во сколько раз изменится частота к концу]
      const notes = {
        coins: [[0, 1568, 0.08], [0.07, 2093, 0.07], [0.15, 1760, 0.09], [0.23, 2637, 0.12]],
        giggle: [[0, 620, 0.08], [0.1, 820, 0.07], [0.2, 1060, 0.12]],
        wobble: [[0, 440, 0.12], [0.12, 370, 0.12], [0.24, 330, 0.16]],
        hop: [[0, 520, 0.09, 1.6], [0.08, 880, 0.1, 1.2]],
        dance: [[0, 660, 0.09], [0.12, 880, 0.09], [0.24, 990, 0.09], [0.36, 1320, 0.16]],
        yawn: [[0, 560, 0.55, 0.55]],
        wake: [[0, 420, 0.22, 1.7], [0.2, 700, 0.14, 1.25]],
        shimmer: [[0, 1760, 0.18, 1.12], [0.06, 2349, 0.2, 1.1], [0.13, 2793, 0.26, 1.08]],
        dawn: [[0, 523, 0.3, 1], [0.18, 659, 0.3, 1], [0.36, 784, 0.42, 1], [0.6, 1047, 0.5, 1]],
        swish: [[0, 900, 0.12, 0.5]],
      }[kind];
      if (!notes) return null;
      const nodes = [];
      let stopped = false;
      const stop = () => {
        if (stopped) return;
        stopped = true;
        for (const [osc, gain] of nodes) {
          try { osc.stop(); } catch { /* уже закончился */ }
          osc.disconnect(); gain.disconnect();
        }
        voices.delete(stop);
      };
      for (const [offset, frequency, duration, glide = 0.82] of notes) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const at = ctx.currentTime + offset;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(frequency, at);
        osc.frequency.exponentialRampToValueAtTime(frequency * glide, at + duration);
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(0.065, at + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
        osc.connect(gain).connect(ctx.destination);
        osc.start(at); osc.stop(at + duration + 0.01);
        nodes.push([osc, gain]);
      }
      voices.add(stop);
      nodes[nodes.length - 1][0].onended = stop;
      return stop;
    },

    isMuted: () => muted,
    stopAll,
    setMuted(value) {
      muted = Boolean(value);
      if (muted) stopAll();
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
