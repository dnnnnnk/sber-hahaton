// Монетки живут в прозрачном кармашке карточки. Прогресс приходит только через якорь.
export default {
  type: 'coins',
  fullscreen: true,

  validate(p) {
    if (!Array.isArray(p.anchors) || !p.anchors.length || p.anchors.some(a => typeof a !== 'string' || !a)) {
      return 'anchors: нужен непустой массив имён якорей';
    }
    if (new Set(p.anchors).size !== p.anchors.length) return 'anchors: имена не должны повторяться';
    if (p.coinsPerCard != null && !(Number.isInteger(p.coinsPerCard) && p.coinsPerCard >= 0 && p.coinsPerCard <= 40)) {
      return 'coinsPerCard: нужно целое число от 0 до 40';
    }
    if (p.durationMs != null && !(Number.isFinite(p.durationMs) && p.durationMs >= 0)) return 'durationMs: нужно число ≥ 0';
    return null;
  },

  play(p, ctx) {
    const { stage } = ctx;
    const duration = p.durationMs ?? 2800;
    const perCard = p.coinsPerCard ?? 14;
    let budget = stage.availableParticles(ctx.settings.maxParticles);
    // Отсеиваем карточки, у которых кармашек не виден целиком (за краем или под таббаром), до раздачи бюджета.
    // Нет ни одного — эффект не стартует, и движок пробует следующий прикол (например, сезонный).
    const tabAtStart = stage.getAnchorRect('tabbar');
    const cards = p.anchors.flatMap(anchor => {
      const r = stage.getAnchorRect(anchor);
      if (!pocketVisible(r, stage, tabAtStart)) return [];
      const progress = Math.max(0, Math.min(1, Number(stage.getAnchorData(anchor)?.progress) || 0));
      return [{ anchor, progress, coins: [] }];
    });
    if (!cards.length || !budget || !duration || !perCard) return null;
    // По одной монете за проход: первая карточка не забирает весь маленький лимит.
    for (let n = 0; n < perCard && budget; n++) {
      for (const card of cards) {
        const count = Math.ceil(card.progress * perCard * (ctx.reducedMotion ? 0.4 : 1));
        if (n >= count || !budget) continue;
        card.coins.push({
          x: 12 + Math.random() * 48, y: 10 + Math.random() * 20,
          vx: (Math.random() - 0.5) * 210, vy: -100 - Math.random() * 130,
          angle: Math.random() * 6.28, spin: (Math.random() - 0.5) * 9,
          radius: 5 + Math.random() * 2,
        });
        budget--;
      }
    }
    const count = cards.reduce((n, c) => n + c.coins.length, 0);
    if (!count) return null;
    let elapsed = 0;
    let finished = false;
    const stopSound = ctx.sound.synth('coins');
    const remove = stage.addRenderer({
      count,
      budget: count,
      onDone: finish,
      frame(dt, now, g) {
        elapsed += dt * 1000;
        if (elapsed >= duration) return finish(), false;
        let shown = false;
        const alpha = Math.min(1, elapsed / 130, (duration - elapsed) / 450);
        const tab = stage.getAnchorRect('tabbar');
        for (const card of cards) {
          if (!card.coins.length) continue;
          const r = stage.getAnchorRect(card.anchor);
          if (!visible(r, stage) || (tab && r.top >= tab.top)) continue;
          // Нижний правый кармашек не закрывает сумму и прогресс. Совпадает с карточкой при скролле.
          const { x, y, w, h } = pocket(r);
          if (y + h > 0 && y < (tab ? tab.top : stage.height)) shown = true;
          g.save();
          g.globalAlpha = alpha;
          if (tab) { g.beginPath(); g.rect(0, 0, stage.width, tab.top); g.clip(); }
          rounded(g, x, y, w, h, 12);
          g.fillStyle = 'rgba(255, 241, 191, .7)';
          g.fill();
          g.clip();
          for (const coin of card.coins) {
            const floor = h - coin.radius - 3;
            if (!ctx.reducedMotion) {
              // Подшаги удерживают монеты внутри кармашка даже при CPU throttling.
              for (let n = 0; n < 2; n++) {
                const step = dt / 2;
                coin.vy += 780 * step;
                coin.x += coin.vx * step;
                coin.y += coin.vy * step;
                coin.angle += coin.spin * step;
                coin.vx *= Math.exp(-2.2 * step);
                if (coin.y > floor) {
                  coin.y = floor;
                  coin.vy = -Math.abs(coin.vy) * 0.48;
                  if (Math.abs(coin.vy) < 12) coin.vy = 0;
                  coin.spin *= 0.8;
                }
                if (coin.y < coin.radius) { coin.y = coin.radius; coin.vy = Math.abs(coin.vy) * 0.5; }
                if (coin.x < coin.radius || coin.x > w - coin.radius) {
                  coin.x = Math.max(coin.radius, Math.min(w - coin.radius, coin.x));
                  coin.vx *= -0.65;
                }
              }
            } else coin.y = floor;
          }
          if (!ctx.reducedMotion) collide(card.coins, w, h);
          for (const coin of card.coins) drawCoin(g, x + coin.x, y + coin.y, coin.radius, coin.angle);
          g.restore();
        }
        if (!shown) return finish(), false;
        return true;
      },
    });
    function finish() {
      if (finished) return;
      finished = true;
      remove();
      stopSound?.();
      ctx.end();
    }
    return { stop: finish };
  },
};

function visible(r, stage) {
  return r && r.bottom > 0 && r.top < stage.height && r.right > 0 && r.left < stage.width;
}

function pocket(r) {
  const w = Math.min(96, r.width * 0.29);
  const h = Math.min(40, r.height * 0.34);
  return { x: r.right - w - 12, y: r.bottom - h - 9, w, h };
}

function pocketVisible(r, stage, tab) {
  if (!visible(r, stage)) return false;
  const { x, y, w, h } = pocket(r);
  return y >= 0 && y + h <= (tab ? tab.top : stage.height) && x >= 0 && x + w <= stage.width;
}

function rounded(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function collide(coins, w, h) {
  for (let i = 0; i < coins.length; i++) {
    const a = coins[i];
    for (let j = i + 1; j < coins.length; j++) {
      const b = coins[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.hypot(dx, dy) || 0.01;
      const overlap = a.radius + b.radius - distance;
      if (overlap <= 0) continue;
      const nx = dx / distance;
      const ny = dy / distance;
      a.x -= nx * overlap * 0.5; a.y -= ny * overlap * 0.5;
      b.x += nx * overlap * 0.5; b.y += ny * overlap * 0.5;
      const velocity = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (velocity < 0) {
        a.vx += velocity * nx * 0.65; a.vy += velocity * ny * 0.65;
        b.vx -= velocity * nx * 0.65; b.vy -= velocity * ny * 0.65;
      }
    }
    a.x = Math.max(a.radius, Math.min(w - a.radius, a.x));
    a.y = Math.max(a.radius, Math.min(h - a.radius - 3, a.y));
  }
}

function drawCoin(g, x, y, r, angle) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.scale(0.62 + Math.abs(Math.cos(angle)) * 0.38, 1);
  const fill = g.createLinearGradient(-r, -r, r, r);
  fill.addColorStop(0, '#fff2aa');
  fill.addColorStop(0.5, '#ffd45b');
  fill.addColorStop(1, '#efa82b');
  g.fillStyle = fill;
  g.strokeStyle = '#da9b24';
  g.lineWidth = 1;
  g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill(); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.85)';
  g.beginPath(); g.arc(0, 0, r - 2, Math.PI, Math.PI * 1.75); g.stroke();
  g.fillStyle = '#bd831d';
  g.fillRect(-0.7, -r * 0.45, 1.4, r * 0.9);
  g.restore();
}
