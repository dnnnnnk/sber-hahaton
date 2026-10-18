// Слой эффектов поверх экрана: canvas для частиц + DOM-элементы эффектов + слой UI (тосты, альбом).
// Всё pointer-events: none. Один общий requestAnimationFrame: цикл полностью стоит, когда рисовать нечего,
// и ставится на паузу, пока вкладка скрыта.
// Оболочку stage видит только через якоря: элементы с data-anchor="<имя>".

const MAX_DPR = 2;
const MAX_DT = 0.05;

export function createStage(host) {
  const root = document.createElement('div');
  root.className = 'prikoly-stage';
  const canvas = document.createElement('canvas');
  canvas.className = 'prikoly-canvas';
  const ui = document.createElement('div');
  ui.className = 'prikoly-ui';
  root.append(canvas, ui);
  host.append(root);

  const g = canvas.getContext('2d');
  const renderers = new Set();
  let width = 0;
  let height = 0;
  let dpr = 1;
  let raf = 0;
  let last = 0;
  let fps = 0;
  let fpsFrames = 0;
  let fpsSince = 0;

  function resize() {
    const r = host.getBoundingClientRect();
    width = r.width;
    height = r.height;
    dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }

  function clear() {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
  }

  function frame(now) {
    raf = 0;
    const dt = Math.min(Math.max((now - last) / 1000, 0), MAX_DT);
    last = now;
    clear();
    for (const r of renderers) {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.globalAlpha = 1;
      let alive = false;
      try {
        alive = r.frame(dt, now, g) !== false;
      } catch (err) {
        console.error('[prikoly] рендерер упал и снят', err);
      }
      if (!alive) {
        renderers.delete(r);
        r.onDone?.();
      }
    }
    countFps(now);
    if (!renderers.size) return clear();
    if (!document.hidden) raf = requestAnimationFrame(frame);
  }

  function countFps(now) {
    fpsFrames++;
    if (now - fpsSince >= 500) {
      fps = Math.round((fpsFrames * 1000) / (now - fpsSince));
      fpsFrames = 0;
      fpsSince = now;
    }
  }

  function start() {
    if (raf || document.hidden || !renderers.size) return;
    last = fpsSince = performance.now();
    fpsFrames = 0;
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  if (window.ResizeObserver) new ResizeObserver(resize).observe(host);
  else window.addEventListener('resize', resize);
  resize();

  function findAnchor(name) {
    for (const el of host.querySelectorAll(`[data-anchor="${CSS.escape(name)}"]`)) {
      if (!root.contains(el) && el.getClientRects().length) return el;
    }
    return null;
  }

  return {
    root,
    ui,
    get width() { return width; },
    get height() { return height; },
    get dpr() { return dpr; },

    // Резерв учитывается ещё до первого кадра, включая отложенный выпуск частиц.
    availableParticles(limit) {
      let reserved = 0;
      for (const r of renderers) reserved += r.budget ?? r.count ?? 0;
      return Math.max(0, limit - reserved);
    },

    // renderer: { frame(dt, now, g) → false, когда закончил; count?: число частиц; onDone?() }
    addRenderer(renderer) {
      renderers.add(renderer);
      start();
      return () => {
        renderers.delete(renderer);
        if (!renderers.size) {
          stop();
          clear();
        }
      };
    },

    // Прямоугольник якоря относительно stage (в CSS px) или null, если якоря нет на экране.
    getAnchorRect(name) {
      const el = findAnchor(name);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const h = host.getBoundingClientRect();
      const left = r.left - h.left;
      const top = r.top - h.top;
      return {
        left, top, width: r.width, height: r.height,
        right: left + r.width, bottom: top + r.height,
        cx: left + r.width / 2, cy: top + r.height / 2,
        radius: parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0,
      };
    },

    // Элемент якоря — только для эффектов, которые анимируют сам якорь (cssAnimate).
    getAnchorElement: findAnchor,

    // Декоративный слой эффекта внутри якоря (как overlay/drawWithContent у вью в нативе): прокручивается
    // вместе с якорем без отставания на кадр и может обрезаться по его форме (border-radius: inherit).
    // Слой обязан быть aria-hidden и pointer-events: none. Вызывать в каждом кадре: оболочка могла
    // перерисовать экран, тогда слой переезжает в новый элемент. false — якоря на экране нет.
    attachToAnchor(name, layer) {
      const el = findAnchor(name);
      if (!el) return false;
      if (layer.parentNode !== el) el.append(layer);
      return true;
    },

    // Имена видимых якорей с префиксом: "task-" → ["task-dog_walk", …]. Для шаблонов вида "task-*".
    anchorNames(prefix) {
      const names = new Set();
      for (const el of host.querySelectorAll(`[data-anchor^="${CSS.escape(prefix)}"]`)) {
        if (!root.contains(el) && el.getClientRects().length) names.add(el.dataset.anchor);
      }
      return [...names];
    },

    // "card", "task-*" → конкретные имена видимых якорей.
    resolveAnchors(patterns) {
      return [...new Set(patterns.flatMap(n => (n.endsWith('*') ? this.anchorNames(n.slice(0, -1)) : [n])))];
    },

    // Только публичные данные якоря, без доступа к состоянию оболочки.
    getAnchorData(name) {
      const el = findAnchor(name);
      return el ? { ...el.dataset } : null;
    },

    hitAnchor(name, clientX, clientY) {
      const el = findAnchor(name);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
    },

    stats() {
      let particles = 0;
      let settled = 0;
      for (const r of renderers) {
        particles += r.count || 0;
        settled += r.settled || 0;
      }
      return { fps: raf ? fps : 0, particles, settled, renderers: renderers.size, running: Boolean(raf) };
    },
  };
}
