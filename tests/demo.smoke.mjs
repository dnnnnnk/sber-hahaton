// Регрессии демо-сценария: node tests/demo.smoke.mjs (сервер и Playwright — как у p2.smoke.mjs).
// Блок A — ловушки, которые ломали показ: быстрые отметки дел, откат на следующий прикол, данные экранов.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.APP_URL || 'http://127.0.0.1:8000/';
const output = process.env.QA_DIR || '/private/tmp/sber-demo-qa';
await mkdir(output, { recursive: true });

const reports = [];
for (const browserType of [chromium, webkit].filter(b => !process.env.ONLY_BROWSER || b.name() === process.env.ONLY_BROWSER)) {
  const browser = await browserType.launch({ headless: true });
  const report = { browser: browserType.name(), checks: [] };
  reports.push(report);
  try {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    const errors = [];
    const external = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('request', request => {
      if (!request.url().startsWith(new URL(base).origin) && !/^(data|blob):/.test(request.url())) external.push(request.url());
    });
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    await page.goto(`${base}?debug=1#home`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.sberKids?.engine?.config?.prikoly.length, null, { timeout: 20000 });

    const go = async id => {
      await page.evaluate(id => window.sberKids.go(id), id);
      await page.waitForFunction(id => window.sberKids.current() === id, id);
      await page.waitForTimeout(300);
    };
    const stop = () => page.evaluate(() => window.sberKids.engine.stopAll('demo cleanup'));
    const reset = () => page.evaluate(() => window.sberKids.engine.rules.resetCooldowns());
    const started = id => page.evaluate(id => window.sberKids.engine.getLog().filter(l => l.id === id && l.ok).length, id);
    const shot = name => page.screenshot({ path: `${output}/${browserType.name()}-${name}.png`, scale: 'css' });
    const check = async (name, fn) => {
      try { await fn(); report.checks.push({ name, passed: true }); }
      catch (error) {
        const log = await page.evaluate(() => window.sberKids?.engine?.getLog().slice(-6).map(l => l.info || `${l.id} ${l.ok ? 'ok' : l.reason}`)).catch(() => []);
        report.checks.push({ name, passed: false, error: error.message, log });
      }
      console.log(`${browserType.name()}: ${name}: ${report.checks.at(-1).passed ? 'PASS' : 'FAIL'}`);
    };
    await page.addStyleTag({ content: '.dbg { visibility: hidden !important; }' });

    await check('A8 no task is done on start', async () => {
      assert.ok(await page.evaluate(() => Object.values(window.sberKids.state.tasks).every(done => !done)));
    });

    await check('A1 three task taps one second apart give three effects', async () => {
      await go('tasks');
      await stop();
      const before = await page.evaluate(() => window.sberKids.engine.getLog().filter(l => l.ok).length);
      const ids = [['dog_walk', 'tasks-alive-dog'], ['dishes', 'tasks-alive-dishes'], ['multiplication', 'tasks-alive-math']];
      for (const [task, prikol] of ids) {
        await page.locator(`[data-zone="task-${task}"]`).evaluate(el => el.scrollIntoView({ block: 'center' }));
        await page.locator(`[data-zone="task-${task}"]`).tap();
        // Отклик сразу: эффект этого дела активен без ожидания кулдауна.
        await page.waitForFunction(id => window.sberKids.engine.stats().active.includes(id), prikol, { timeout: 400 });
        await page.waitForTimeout(1000);
      }
      const after = await page.evaluate(() => window.sberKids.engine.getLog().filter(l => l.ok).length);
      assert.equal(after - before, 3, 'every tap starts its own effect');
      for (const [, prikol] of ids) assert.ok(await started(prikol) >= 1, `${prikol} started`);
      // Повтор того же дела перезапускает его эффект, а не молчит.
      await page.locator('[data-zone="task-multiplication"]').tap();
      await page.locator('[data-zone="task-multiplication"]').tap();
      await page.waitForFunction(() => window.sberKids.engine.getLog().filter(l => l.id === 'tasks-alive-math' && l.ok).length >= 2);
      await page.waitForTimeout(700);
      assert.ok((await page.evaluate(() => window.sberKids.engine.stats().particles)) <= 150);
      await stop();
      await page.evaluate(() => { Object.keys(window.sberKids.state.tasks).forEach(id => { window.sberKids.state.tasks[id] = false; }); window.sberKids.refresh(); });
    });

    await check('A1 soft fade stops in red zone at once', async () => {
      await go('tasks');
      await page.locator('[data-zone="task-dog_walk"]').tap();
      await page.locator('[data-zone="task-clean_room"]').tap();
      await page.evaluate(() => window.sberKids.go('transfer'));
      await page.waitForFunction(() => window.sberKids.current() === 'transfer');
      await page.waitForFunction(() => !window.sberKids.engine.stats().running && !window.sberKids.engine.stats().active.length, null, { timeout: 300 });
      await page.evaluate(() => { Object.keys(window.sberKids.state.tasks).forEach(id => { window.sberKids.state.tasks[id] = false; }); });
    });

    await check('A2 coins visible without scrolling', async () => {
      await go('moneybox');
      await reset();
      await page.evaluate(() => window.sberKids.engine.simulate('shake', { strength: 1 }));
      await page.waitForFunction(() => window.sberKids.engine.stats().active.includes('moneybox-rattle'));
      await page.waitForTimeout(300);
      const particles = await page.evaluate(() => window.sberKids.engine.stats().particles);
      // Мечта в начале демо пустая (монет нет), «Тапочки» накоплены больше чем наполовину.
      assert.ok(particles >= 6, `visible cards rattle at scroll 0 (${particles})`);
      const pockets = await page.evaluate(() => ['robot', 'slides'].map(id => {
        const r = document.querySelector(`[data-anchor="moneybox-${id}"]`).getBoundingClientRect();
        const tab = document.querySelector('[data-anchor="tabbar"]').getBoundingClientRect();
        return r.top >= 0 && r.bottom <= tab.top;
      }));
      assert.deepEqual(pockets, [true, true], 'first two moneyboxes are above the tabbar');
      await shot('a2-coins-scroll0');
      await stop();
    });

    await check('A2 hidden pockets fall back to the next prikol', async () => {
      await go('moneybox');
      // Кармашков нет на экране → «Звенящие копилки» не стартуют, играет следующий подходящий прикол.
      await page.evaluate(() => {
        const engine = window.sberKids.engine;
        const config = structuredClone(engine.config);
        config.prikoly.find(p => p.id === 'moneybox-rattle').effect.params.anchors = ['moneybox-missing'];
        engine.reload(config, 'demo fallback');
        engine.rules.resetCooldowns();
        engine.setSeason('autumn');
        engine.simulate('shake', { strength: 1 });
      });
      await page.waitForFunction(() => window.sberKids.engine.stats().active.includes('season-autumn-leaves'));
      const log = await page.evaluate(() => window.sberKids.engine.getLog().slice(-4));
      assert.ok(log.some(l => l.id === 'moneybox-rattle' && !l.ok), 'rattle skipped');
      assert.ok(!log.some(l => l.id === 'season-autumn-leaves' && !l.ok), 'leaves not dropped by priority');
      await stop();
      await page.evaluate(async () => { window.sberKids.engine.setSeason('auto'); await window.sberKids.engine.reloadFromSources(); });
    });

    await check('A3 topup screen reads as a moneybox, not a payment', async () => {
      await go('moneybox');
      await page.locator('[data-zone="topup-robot"]').tap();
      await page.waitForFunction(() => window.sberKids.current() === 'topup_success');
      await page.waitForTimeout(300);
      const patch = page.locator('.screen-patch--topup');
      const text = await patch.innerText();
      assert.ok(/Копилка пополнена\s*\+500\s₽/.test(text) && text.includes('Умный робот'), text);
      assert.ok(!/Оплата|магазин|чек/i.test(text));
      assert.ok(!/Оплата/.test(await page.locator('.screen').getAttribute('aria-label')));
      const r = await patch.boundingBox();
      const frame = await page.locator('.screen__frame').boundingBox();
      // Растровые «Оплата выполнена», «Любимый магазин», сумма чека и «Сохранить чек» — 33..75 % кадра.
      assert.ok(r.y <= frame.y + frame.height * 0.33 && r.y + r.height >= frame.y + frame.height * 0.75 && r.width >= frame.width - 1);
      await shot('a3-topup');
      await page.waitForFunction(() => window.sberKids.current() === 'moneybox', null, { timeout: 3500 });
      await stop();
      await page.evaluate(() => { const s = window.sberKids; s.state.moneyboxes.find(m => m.id === 'robot').saved = 0; s.state.lastTopup = null; s.refresh(); });
    });

    await check('A4 tasks_done lists the same tasks', async () => {
      await page.evaluate(() => window.sberKids.completeAllTasks());
      await page.waitForFunction(() => window.sberKids.current() === 'tasks_done');
      await page.waitForTimeout(300);
      const rows = await page.locator('.done-row b').allInnerTexts();
      const titles = await page.evaluate(async () => (await import('./app/screens.js')).TASKS.map(t => t.title));
      assert.deepEqual(rows, titles);
      assert.equal(await page.locator('.done-row.is-done').count(), titles.length);
      await shot('a4-tasks-done');
      await stop();
      await page.evaluate(() => window.sberKids.resetTasks());
    });

    await check('A5 dream has kid text and the same moneybox', async () => {
      await go('moneybox_goal');
      const note = await page.locator('.screen-patch--goal-note').innerText();
      assert.ok(note.includes('Хочу') && !/Светодиод|свадьб|Декор/i.test(note));
      const robot = await page.evaluate(() => window.sberKids.state.moneyboxes.find(m => m.id === 'robot'));
      assert.deepEqual([robot.title, robot.saved, robot.goal], ['Умный робот', 0, 3000]);
      const sum = await page.locator('.screen-patch--goal-sum').innerText();
      assert.ok(/0\s₽/.test(sum) && /из 3\s000\s₽/.test(sum), `goal sums follow the moneybox (${sum})`);
      await go('moneybox');
      const card = await page.locator('.screen-patch--moneybox').first().innerText();
      assert.ok(card.includes('Умный робот') && /из 3\s000\s₽/.test(card));
      assert.ok(/\+500\s₽/.test(await page.locator('[data-zone="topup-robot"]').innerText()), 'explicit +500 ₽ button');
    });

    await check('A6 guess-the-price uses a price tag', async () => {
      await go('content');
      const text = await page.locator('.screen').innerText();
      assert.ok(!text.includes('🎲') && text.includes('🏷️'));
    });

    await check('A7 avatar flip stays inside the screen and is round', async () => {
      await go('home');
      await reset();
      const round = await page.locator('.zone--lift[data-anchor="avatar"]').evaluate(el => getComputedStyle(el).borderTopLeftRadius);
      assert.ok(round === '50%' || parseFloat(round) >= 27, `round lift (${round})`);
      await page.evaluate(() => window.sberKids.engine.simulateEntry('avatar-flip'));
      let minTop = Infinity;
      for (let i = 0; i < 14; i++) {
        // Видимый край круглого аватара: центр с учётом сдвига минус радиус с учётом увеличения.
        minTop = Math.min(minTop, await page.locator('[data-anchor="avatar"]').evaluate(el => {
          const m = new DOMMatrix(getComputedStyle(el).transform);
          const scale = Math.hypot(m.c, m.d);
          return el.offsetTop + m.f + (el.offsetHeight / 2) * (1 - scale) + el.closest('.screen__frame').getBoundingClientRect().top;
        }));
        await page.waitForTimeout(60);
      }
      assert.ok(minTop >= 0, `avatar top ${minTop}`);
      await stop();
    });

    // ——— B1: Капля — сквозной персонаж ———
    const drop = () => page.locator('.prikoly-drop');
    const mood = () => page.evaluate(() => document.querySelector('.prikoly-drop')?.dataset.mood ?? null);
    const dropCenter = async () => {
      const b = await drop().boundingBox();
      return { x: b.x + b.width / 2, y: b.y + b.height * 0.58 };
    };
    const settle = () => page.waitForFunction(() => !window.sberKids.engine.stats().running, null, { timeout: 6000 });

    await check('B1 Drop lives on green screens and vanishes on red', async () => {
      // stopAll выше снял её на этом же экране; она возвращается со следующим открытием экрана.
      await go('content');
      await go('home');
      await page.waitForFunction(() => document.querySelectorAll('.prikoly-drop').length === 1);
      const tab = await page.locator('[data-anchor="tabbar"]').boundingBox();
      const b = await drop().boundingBox();
      assert.ok(b.y >= tab.y - 2 && b.y + b.height <= tab.y + tab.height + 2, 'sits inside the tabbar');
      assert.ok(Math.abs(b.x + b.width / 2 - (tab.x + tab.width / 2)) < 3, 'in the middle slot');
      await settle();
      for (const id of ['tasks', 'moneybox', 'content', 'tasks_done', 'moneybox_goal', 'topup_success']) {
        await go(id);
        assert.equal(await drop().count(), 1, `${id}: present`);
        assert.equal(await drop().evaluate(el => el.classList.contains('is-away')), false, `${id}: has a perch`);
      }
      await go('transfer');
      assert.equal(await drop().count(), 0, 'red zone: gone');
      await go('home');
      await page.waitForFunction(() => document.querySelectorAll('.prikoly-drop').length === 1);
      await shot('b1-home');
    });

    await check('B1 tap on Drop giggles and does not press the tab under her', async () => {
      await go('home');
      await settle();
      const c = await dropCenter();
      await page.touchscreen.tap(c.x, c.y);
      await page.waitForFunction(() => document.querySelector('.prikoly-drop')?.dataset.mood === 'happy');
      assert.equal(await page.evaluate(() => window.sberKids.current()), 'home');
      // Касания рядом с ней по-прежнему уходят в интерфейс.
      const tasksTab = await page.locator('#tabbar [data-tab="tasks"]').boundingBox();
      await page.touchscreen.tap(tasksTab.x + tasksTab.width / 2, tasksTab.y + tasksTab.height / 2);
      await page.waitForFunction(() => window.sberKids.current() === 'tasks');
    });

    await check('B1 task done → joy, all done → dance', async () => {
      await go('tasks');
      await page.evaluate(() => { Object.keys(window.sberKids.state.tasks).forEach(id => { window.sberKids.state.tasks[id] = false; }); window.sberKids.refresh(); });
      await settle();
      await page.locator('[data-zone="task-dog_walk"]').tap();
      await page.waitForFunction(() => document.querySelector('.prikoly-drop')?.dataset.face === 'happy', null, { timeout: 500 });
      assert.ok(await page.locator('.pd-fx--spark').count() > 0, 'sparkles over her head');
      await page.waitForTimeout(1300);
      for (const id of ['dishes', 'multiplication', 'clean_room', 'read_book']) {
        await page.locator(`[data-zone="task-${id}"]`).evaluate(el => el.scrollIntoView({ block: 'center' }));
        await page.locator(`[data-zone="task-${id}"]`).tap();
        await page.waitForTimeout(250);
      }
      await page.waitForFunction(() => document.querySelector('.pd-fx--note'), null, { timeout: 1500 });
      await shot('b1-dance');
      await page.waitForFunction(() => window.sberKids.current() === 'tasks_done');
      await stop();
      await page.evaluate(() => window.sberKids.resetTasks());
      await page.waitForFunction(() => window.sberKids.current() === 'tasks');
    });

    await check('B1 shake → dizzy, tilt → rolls to the edge and back', async () => {
      await go('home');
      await page.waitForFunction(() => document.querySelectorAll('.prikoly-drop').length === 1);
      await settle();
      const start = await drop().boundingBox();
      await page.evaluate(() => {
        const s = window.sberKids.engine.sensors;
        s.inject('orientation', { beta: 30, gamma: 0 });
        s.inject('orientation', { beta: 30, gamma: 13 });
      });
      await page.waitForTimeout(900);
      const tilted = await drop().boundingBox();
      assert.ok(tilted.x > start.x + 60, `rolled right (${tilted.x - start.x})`);
      await page.evaluate(() => { const s = window.sberKids.engine.sensors; for (let i = 0; i < 80; i++) s.inject('orientation', { beta: 30, gamma: 0 }); });
      await settle();
      const back = await drop().boundingBox();
      assert.ok(Math.abs(back.x - start.x) < 25, `returned home (${back.x - start.x})`);
      await page.evaluate(() => {
        const s = window.sberKids.engine.sensors;
        const t = performance.now();
        for (let i = 0; i < 3; i++) s.inject('motion', { linear: 30, rotation: 0, t: t + i * 100 });
      });
      await page.waitForFunction(() => document.querySelector('.prikoly-drop')?.dataset.mood === 'dizzy');
      assert.ok(await page.locator('.pd-fx--star').count() >= 3, 'stars circle her head');
    });

    await check('B1 face down sleeps, face up wakes with a stretch', async () => {
      await go('home');
      await page.waitForTimeout(1800);
      await page.evaluate(() => window.sberKids.engine.sensors.inject('orientation', { beta: 178, gamma: 0 }));
      await page.waitForTimeout(350);
      await page.evaluate(() => window.sberKids.engine.sensors.inject('orientation', { beta: 179, gamma: 0 }));
      await page.waitForFunction(() => document.querySelector('.prikoly-drop')?.dataset.face === 'sleep');
      assert.ok(await page.locator('.pd-fx--z').count() >= 3, 'z-z-z');
      await page.evaluate(() => window.sberKids.engine.sensors.inject('orientation', { beta: 20, gamma: 0 }));
      await page.waitForFunction(() => document.querySelector('.prikoly-drop')?.dataset.face === 'yawn');
      await page.waitForFunction(() => document.querySelector('.prikoly-drop')?.dataset.face === 'happy', null, { timeout: 2500 });
    });

    await check('B1 idle and lying still → dozes, touch wakes her', async () => {
      await go('home');
      await page.evaluate(() => {
        const engine = window.sberKids.engine;
        const config = structuredClone(engine.config);
        config.prikoly.find(p => p.id === 'screen-resident').effect.params.idleMs = 700;
        engine.reload(config, 'demo idle');
      });
      await page.waitForFunction(() => document.querySelector('.prikoly-drop')?.dataset.face === 'sleep', null, { timeout: 2500 });
      await page.mouse.move(40, 300);
      await page.mouse.move(60, 320);
      await page.waitForFunction(() => document.querySelector('.prikoly-drop')?.dataset.face !== 'sleep');
      await page.evaluate(() => window.sberKids.engine.reloadFromSources());
      await page.waitForFunction(() => document.querySelectorAll('.prikoly-drop').length === 1);
      await page.evaluate(() => {
        const s = window.sberKids.engine.sensors;
        const t = performance.now();
        for (let i = 0; i <= 14; i++) s.inject('motion', { linear: 0.05, rotation: 0.5, t: t + i * 500 });
      });
      await page.waitForFunction(() => document.querySelector('.prikoly-drop')?.dataset.face === 'sleep');
      await page.evaluate(() => window.sberKids.engine.sensors.inject('motion', { linear: 2, rotation: 40 }));
      await page.waitForFunction(() => document.querySelector('.prikoly-drop')?.dataset.face !== 'sleep');
    });

    await check('B1 reactions come from the CMS without a release', async () => {
      const cms = await context.newPage();
      cms.on('pageerror', e => errors.push(`cms: ${e.message}`));
      await cms.setViewportSize({ width: 1280, height: 900 });
      await cms.goto(`${base}cms.html`, { waitUntil: 'networkidle' });
      const item = cms.locator('.item').filter({ has: cms.locator('.item__meta', { hasText: 'screen-resident' }) });
      await item.locator('select[data-reaction="tap"]').selectOption('dance');
      await cms.locator('#save').click();
      await page.waitForFunction(() => window.sberKids.engine.source === 'CMS'
        && window.sberKids.engine.config.prikoly.find(p => p.id === 'screen-resident').effect.params.reactions.tap === 'dance');
      await go('home');
      await page.waitForFunction(() => document.querySelectorAll('.prikoly-drop').length === 1);
      await settle();
      const c = await dropCenter();
      await page.touchscreen.tap(c.x, c.y);
      await page.waitForFunction(() => document.querySelector('.pd-fx--note'), null, { timeout: 1500 });
      await cms.locator('#reset').click(); await cms.locator('#reset').click();
      await page.waitForFunction(() => window.sberKids.engine.source === 'config.json');
      await cms.close();
    });

    // Прятки: поза Капли — по коробке .prikoly-drop (без поворота, со сдвигом и масштабом).
    const dropBox = () => page.evaluate(() => {
      const r = document.querySelector('.prikoly-drop')?.getBoundingClientRect();
      const bar = document.querySelector('[data-anchor="tabbar"]')?.getBoundingClientRect();
      return r && { left: r.left, right: r.right, cx: r.left + r.width / 2, cy: r.top + r.height / 2, barTop: bar?.top, barCx: bar && bar.left + bar.width / 2,
        peeking: document.querySelector('.prikoly-drop').classList.contains('is-peeking'), plate: Boolean(document.querySelector('.prikoly-drop-plate:not([hidden])')) };
    });
    const swipeAway = async dx => {
      const c = await dropCenter();
      await page.mouse.move(c.x, c.y);
      await page.mouse.down();
      await page.mouse.move(c.x + dx, c.y, { steps: 6 });
      await page.mouse.up();
      await page.waitForFunction(() => document.querySelector('.prikoly-drop.is-peeking'));
      await settle();
    };

    await check('B1 swipe → she hides behind the nearest edge and peeks; tap → jumps back', async () => {
      await go('home');
      await page.waitForFunction(() => document.querySelectorAll('.prikoly-drop').length === 1);
      await settle();
      await swipeAway(-90);
      let r = await dropBox();
      assert.ok(r.peeking && r.left < 0 && r.right > 12 && r.right <= 32, `peeks from the left edge (${r.left.toFixed(1)}..${r.right.toFixed(1)})`);
      assert.ok(Math.abs(r.cy - r.barTop) < 24, 'at the tabbar corner, not over cards');
      assert.equal(r.plate, false, 'her house is hidden while she hides');
      assert.ok(!(await page.locator('.prikoly-drop').innerHTML()).match(/sad|cry/), 'no sad faces');
      await shot('b1-peek');
      // Переход между экранами — она всё ещё подглядывает.
      await go('tasks');
      await page.waitForFunction(() => document.querySelector('.prikoly-drop.is-peeking'));
      // Событие — выглядывает, радуется и снова прячется.
      await page.locator('[data-zone="task-dog_walk"]').tap();
      await page.waitForFunction(() => {
        const r = document.querySelector('.prikoly-drop').getBoundingClientRect();
        return r.left > 0 && document.querySelector('.prikoly-drop').dataset.face === 'happy';
      }, null, { timeout: 2000 });
      await page.waitForFunction(() => document.querySelector('.prikoly-drop').getBoundingClientRect().left < 0, null, { timeout: 3000 });
      await settle();
      // Тап по подглядывающей — выпрыгивает на своё место.
      r = await dropBox();
      await page.touchscreen.tap(5, r.cy);
      await page.waitForFunction(() => !document.querySelector('.prikoly-drop.is-peeking'));
      await settle();
      r = await dropBox();
      assert.ok(Math.abs(r.cx - r.barCx) < 30 && r.plate, `back in the tabbar centre (${r.cx.toFixed(1)})`);
      assert.equal(await page.evaluate(() => window.sberKids.current()), 'tasks', 'the tap did not press anything under her');
      await page.evaluate(() => Object.keys(window.sberKids.state.tasks).forEach(id => { window.sberKids.state.tasks[id] = false; }));
    });

    await check('B1 hidden Drop: none on red screens, right edge too, back in place on the next app open', async () => {
      await go('home');
      await settle();
      await swipeAway(90);
      let r = await dropBox();
      assert.ok(r.peeking && r.right > 375 && r.left >= 343, `peeks from the right edge (${r.left.toFixed(1)}..${r.right.toFixed(1)})`);
      await go('transfer');
      assert.equal(await page.locator('.prikoly-drop, .prikoly-drop-plate').count(), 0, 'nothing on the transfer screen, not even at the edge');
      await go('home');
      await page.waitForFunction(() => document.querySelector('.prikoly-drop.is-peeking'));
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.sberKids?.engine?.config?.prikoly.length);
      await page.addStyleTag({ content: '.dbg { visibility: hidden !important; }' });
      await page.waitForFunction(() => document.querySelectorAll('.prikoly-drop').length === 1);
      await settle();
      r = await dropBox();
      assert.ok(!r.peeking && Math.abs(r.cx - r.barCx) < 30, 'next app open — she is back in her place');
    });

    await check('B1 album switch «Показывать Каплю»: off — no Drop anywhere, on — back', async () => {
      await go('home');
      await page.evaluate(() => window.sberKids.engine.openAlbum());
      const toggle = page.locator('.prikoly-album__switch');
      assert.ok(await toggle.isChecked());
      assert.equal(await page.locator('.prikoly-album__drop').innerText().then(t => /Показывать Каплю/.test(t)), true);
      await toggle.click();
      await page.waitForFunction(() => !document.querySelector('.prikoly-drop'));
      assert.equal(await page.evaluate(() => localStorage.getItem('prikoly.showDrop')), 'off');
      await page.evaluate(() => window.sberKids.engine.closeAlbum());
      await go('tasks');
      await page.locator('[data-zone="task-dishes"]').tap();
      await page.waitForTimeout(400);
      assert.equal(await page.locator('.prikoly-drop, .prikoly-drop-plate').count(), 0, 'not on events');
      await page.evaluate(() => window.sberKids.engine.sensors.inject('orientation', { alpha: 0, beta: 179, gamma: 0 }));
      await page.waitForTimeout(500);
      assert.equal(await page.locator('.prikoly-drop').count(), 0, 'not on a flip');
      await page.evaluate(() => window.sberKids.engine.sensors.inject('orientation', { alpha: 0, beta: 12, gamma: 0 }));
      await stop();
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.sberKids?.engine?.config?.prikoly.length);
      await page.addStyleTag({ content: '.dbg { visibility: hidden !important; }' });
      await page.waitForTimeout(600);
      assert.equal(await page.locator('.prikoly-drop').count(), 0, 'the choice survives a reload');
      const reason = await page.evaluate(() => window.sberKids.engine.getLog().filter(l => l.id === 'screen-resident').at(-1)?.reason);
      assert.equal(reason, 'Капля выключена в альбоме');
      await page.evaluate(() => window.sberKids.engine.openAlbum());
      await page.locator('.prikoly-album__switch').click();
      await page.waitForFunction(() => document.querySelectorAll('.prikoly-drop').length === 1);
      await page.evaluate(() => window.sberKids.engine.closeAlbum());
      await page.evaluate(() => Object.keys(window.sberKids.state.tasks).forEach(id => { window.sberKids.state.tasks[id] = false; }));
      await stop();
    });

    await check('B1 home card and QR button are the original raster, no shell patch over them', async () => {
      await go('home');
      const covered = await page.evaluate(() => {
        const frame = document.querySelector('.screen__frame').getBoundingClientRect();
        const card = document.querySelector('[data-anchor="card"]').getBoundingClientRect();
        // Кнопка сканера QR в правом верхнем углу home.webp: 590..701 × 120..231 px из 750 × 1990.
        const qr = { left: frame.left + frame.width * 0.787, right: frame.left + frame.width * 0.935, top: frame.top + frame.height * 0.0603, bottom: frame.top + frame.height * 0.116 };
        const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        // Единственная плашка на карте — живая сумма: только над растровыми цифрами, не над картинкой.
        const picture = { left: card.left + card.width * 0.66, right: card.right, top: card.top, bottom: card.bottom };
        return [...document.querySelectorAll('.screen-patch')].filter(el => {
          const r = el.getBoundingClientRect();
          return hit(r, qr) || hit(r, picture) || (hit(r, card) && !el.classList.contains('screen-patch--balance'));
        }).map(el => el.className);
      });
      assert.deepEqual(covered, [], 'nothing covers the card picture or the QR icon');
      const [card, balance] = await Promise.all(['card', 'balance'].map(name => page.locator(`[data-anchor="${name}"]`).last().boundingBox()));
      assert.ok(balance.x > card.x && balance.y > card.y && balance.x + balance.width < card.x + card.width / 2, 'balance anchor sits on the raster sum');
      await shot('b1-home-raster');
    });

    await check('B2 foil is a soft sheen from the first ±10° and fades when still', async () => {
      await go('home');
      await reset();
      // Деликатный перелив: вдвое тише прежнего (было 0.35 / 0.6 / ≤ 0.86), но заметен с первых градусов.
      for (const [x, min] of [[0.25, 0.17], [0.5, 0.3], [1, 0.3]]) {
        await page.evaluate(x => window.sberKids.engine.simulate('tilt', { x, y: 0 }), x);
        await page.waitForTimeout(250);
        const opacity = await page.evaluate(() => Number(getComputedStyle(document.querySelector('.prikoly-holo--foil')).opacity));
        assert.ok(opacity >= min && opacity <= 0.45, `foil opacity ${opacity} at x=${x}`);
      }
      const shape = await page.evaluate(() => {
        const card = document.querySelector('[data-anchor="card"]');
        const holo = document.querySelector('.prikoly-holo');
        const a = card.getBoundingClientRect();
        const h = holo.getBoundingClientRect();
        const cs = getComputedStyle(holo);
        return {
          inside: holo.parentElement === card,
          delta: Math.max(...['left', 'top', 'width', 'height'].map(k => Math.abs(a[k] - h[k]))),
          overflow: cs.overflow,
          radius: ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'].map(k => cs[k]),
          cardRadius: ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'].map(k => getComputedStyle(card)[k]),
          input: cs.pointerEvents,
        };
      });
      assert.ok(shape.inside && shape.delta < 1, 'the foil container sits inside the card anchor and scrolls with it');
      assert.equal(shape.overflow, 'hidden');
      assert.deepEqual(shape.radius, shape.cardRadius, 'same corners as the card');
      assert.ok(parseFloat(shape.radius[0]) >= 19 && parseFloat(shape.radius[0]) <= 21 && parseFloat(shape.radius[2]) <= 6, `card corners from the raster (${shape.radius})`);
      assert.equal(shape.input, 'none');
      assert.ok(await page.locator('.prikoly-holo--sparks i').count() >= 10, 'sparkles');
      await shot('b2-foil');
      await page.waitForFunction(() => !document.querySelector('.prikoly-holo'), null, { timeout: 4000 });
    });

    await check('B2 nothing leaks past the rounded card corners at extreme tilts, also scrolled', async () => {
      await go('home');
      await reset();
      for (const scroll of [0, 60]) {
        await page.locator('#viewport').evaluate((el, top) => { el.scrollTop = top; }, scroll);
        await page.waitForTimeout(150);
        const card = await page.locator('[data-anchor="card"]').boundingBox();
        const clip = { x: card.x - 8, y: card.y - 8, width: card.width + 16, height: card.height + 16 };
        const before = await page.screenshot({ clip, scale: 'device' });
        for (const [x, y] of [[-1, -1], [1, 1], [1, -1]]) {
          for (let i = 0; i < 8; i++) {
            await page.evaluate(([x, y]) => window.sberKids.engine.simulate('tilt', { x, y }), [x, y]);
            await page.waitForTimeout(50);
          }
          const after = await page.screenshot({ clip, scale: 'device' });
          const leaks = await page.evaluate(async ({ a, b, card, clip }) => {
            const read = async b64 => {
              const img = new Image();
              img.src = `data:image/png;base64,${b64}`;
              await img.decode();
              const c = document.createElement('canvas');
              c.width = img.width; c.height = img.height;
              const g = c.getContext('2d');
              g.drawImage(img, 0, 0);
              return g.getImageData(0, 0, c.width, c.height);
            };
            const [A, B] = await Promise.all([read(a), read(b)]);
            const s = A.width / clip.width;
            const radii = getComputedStyle(document.querySelector('[data-anchor="card"]'));
            const [tl, tr, br, bl] = ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'].map(k => parseFloat(radii[k]) * s);
            const L = (card.x - clip.x) * s, T = (card.y - clip.y) * s, W = card.width * s, H = card.height * s;
            // Снаружи формы карты с запасом 1,5 px устройства на сглаживание края.
            const outside = (x, y) => {
              const pad = 1.5;
              if (x < L - pad || x > L + W + pad || y < T - pad || y > T + H + pad) return true;
              const far = (cx, cy, r) => Math.hypot(x - cx, y - cy) > r + pad;
              if (x < L + tl && y < T + tl) return far(L + tl, T + tl, tl);
              if (x > L + W - tr && y < T + tr) return far(L + W - tr, T + tr, tr);
              if (x > L + W - br && y > T + H - br) return far(L + W - br, T + H - br, br);
              if (x < L + bl && y > T + H - bl) return far(L + bl, T + H - bl, bl);
              return false;
            };
            let leaks = 0;
            for (let y = 0; y < A.height; y++) for (let x = 0; x < A.width; x++) {
              if (!outside(x, y)) continue;
              const i = (y * A.width + x) * 4;
              if (Math.max(Math.abs(A.data[i] - B.data[i]), Math.abs(A.data[i + 1] - B.data[i + 1]), Math.abs(A.data[i + 2] - B.data[i + 2])) > 2) leaks++;
            }
            return leaks;
          }, { a: before.toString('base64'), b: after.toString('base64'), card, clip });
          assert.equal(leaks, 0, `pixels changed outside the card at x=${x} y=${y} scroll=${scroll}`);
        }
        await page.waitForFunction(() => !document.querySelector('.prikoly-holo'), null, { timeout: 4000 });
      }
      await page.locator('#viewport').evaluate(el => { el.scrollTop = 0; });
    });

    // ——— B4: «Кувырок» — ночь лицом вниз и рассвет ———
    const face = beta => page.evaluate(beta => window.sberKids.engine.sensors.inject('orientation', { alpha: 0, beta, gamma: 0 }), beta);
    const faceDown = async () => { await face(179); await page.waitForTimeout(450); await face(179); };

    await check('B4 face down → night with sleeping Drop; face up → dawn, greeting, stretch', async () => {
      await go('content');
      await go('home');
      await reset();
      await page.waitForFunction(() => document.querySelectorAll('.prikoly-drop').length === 1);
      await faceDown();
      await page.waitForFunction(() => document.querySelector('.prikoly-night.is-on'));
      await page.waitForFunction(() => document.querySelector('.prikoly-drop')?.dataset.face === 'sleep');
      assert.equal(await page.locator('.prikoly-night').evaluate(el => getComputedStyle(el).pointerEvents), 'none');
      // Ночь не мешает: вкладка нажимается, ночь остаётся.
      const tab = await page.locator('#tabbar [data-tab="content"]').boundingBox();
      await page.touchscreen.tap(tab.x + tab.width / 2, tab.y + tab.height / 2);
      await page.waitForFunction(() => window.sberKids.current() === 'content');
      assert.equal(await page.locator('.prikoly-night').count(), 1);
      await page.waitForTimeout(1200);
      await shot('b4-night');
      await face(12);
      await page.waitForFunction(() => document.querySelector('.prikoly-night.is-dawn'));
      await page.waitForFunction(() => document.querySelector('.prikoly-drop')?.dataset.face === 'yawn');
      await page.waitForFunction(() => document.querySelector('.prikoly-night.is-hello'));
      await shot('b4-dawn');
      await page.waitForFunction(() => !document.querySelector('.prikoly-night'), null, { timeout: 4000 });
    });

    await check('B4 a long night is not cut short, red zone ends it at once', async () => {
      await go('home');
      await reset();
      await faceDown();
      await page.waitForFunction(() => document.querySelector('.prikoly-night.is-on'));
      await page.waitForTimeout(7200);
      assert.equal(await page.locator('.prikoly-night:not(.is-dawn)').count(), 1, 'still night after 7 s');
      await go('transfer');
      assert.equal(await page.locator('.prikoly-night').count(), 0);
      await face(12);
      await go('home');
    });

    // ——— B3: погода, с которой можно играть ———
    await check('B3 finger sweeps settled leaves without blocking touches', async () => {
      await go('content');
      await go('home');
      await reset();
      await page.evaluate(() => { window.sberKids.engine.setSeason('autumn'); window.sberKids.engine.simulate('shake'); });
      await page.waitForFunction(() => window.sberKids.engine.stats().settled >= 6, null, { timeout: 6000 });
      // Ждём, пока листопад долетит (emitMs + падение), чтобы новые листья не ложились во время смахивания.
      await page.waitForTimeout(2600);
      const before = await page.evaluate(() => window.sberKids.engine.stats().settled);
      await shot('b3-leaves');
      const card = await page.locator('[data-anchor="card"]').boundingBox();
      const tab = await page.locator('[data-anchor="tabbar"]').boundingBox();
      // Палец проходит по верху карты и по таббару (touchmove, пассивно; прокрутка не мешает).
      // В Chromium — настоящий touchmove через CDP, в WebKit — движение указателя (оба слушаются пассивно).
      const cdp = browserType === chromium ? await context.newCDPSession(page) : null;
      for (const [y, x0, x1] of [[card.y + 2, card.x + card.width - 8, card.x + 8], [tab.y + 2, tab.x + 8, tab.x + tab.width - 8]]) {
        if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
        else await page.mouse.move(x0, y);
        for (let i = 1; i <= 16; i++) {
          const point = { x: x0 + (x1 - x0) * i / 16, y: y + (i % 2) * 3 };
          if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point] });
          else await page.mouse.move(point.x, point.y);
          await page.waitForTimeout(16);
        }
        if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      }
      await page.waitForTimeout(150);
      const after = await page.evaluate(() => window.sberKids.engine.stats().settled);
      assert.ok(after <= before - 4, `swept ${before} → ${after}`);
      assert.equal(await page.evaluate(() => window.sberKids.current()), 'home');
      // Касание после смахивания по-прежнему доходит до интерфейса.
      const tasksTab = await page.locator('#tabbar [data-tab="tasks"]').boundingBox();
      await page.touchscreen.tap(tasksTab.x + tasksTab.width / 2, tasksTab.y + tasksTab.height / 2);
      await page.waitForFunction(() => window.sberKids.current() === 'tasks');
      await stop();
    });

    await check('B3 winter flakes are white crystals, summer runs glints over cards', async () => {
      await stop();
      const config = await page.evaluate(() => window.sberKids.engine.config.prikoly);
      const snow = config.find(p => p.id === 'season-winter-snow').effect.params;
      assert.ok(snow.shapes.includes('flake') && snow.colors.every(c => /^#f{6}$/i.test(c)), 'white crystal flakes');
      await go('tasks');
      await reset();
      await page.evaluate(() => { window.sberKids.engine.setSeason('summer'); window.sberKids.engine.simulate('shake'); });
      await page.waitForFunction(() => window.sberKids.engine.stats().active.includes('season-summer-sunbeams'));
      assert.ok(await page.locator('.prikoly-sun__glint').count() >= 3, 'glints over task rows and tabbar');
      assert.ok(await page.locator('.prikoly-sun__spot').count() >= 3, 'sun bunnies');
      const misaligned = await page.evaluate(() => [...document.querySelectorAll('.prikoly-sun__glint:not([hidden])')].length);
      assert.ok(misaligned >= 3);
      await page.waitForTimeout(900);
      await shot('b3-summer');
      await page.waitForFunction(() => !document.querySelector('.prikoly-sun'), null, { timeout: 6000 });
      await page.evaluate(() => window.sberKids.engine.setSeason('auto'));
    });

    // ——— C: готовность к защите ———
    const stillFor = ms => page.evaluate(ms => {
      const s = window.sberKids.engine.sensors;
      const t = performance.now();
      for (let i = 0; i * 500 <= ms; i++) s.inject('motion', { linear: 0.04, rotation: 0.4, t: t + i * 500 });
    }, ms);

    await check('C1 quiet hour: 6 s lying still → 💤 over the avatar, Drop dozes', async () => {
      await go('content');
      await go('home');
      await reset();
      await page.waitForFunction(() => document.querySelectorAll('.prikoly-drop').length === 1);
      await stillFor(5000);
      await page.waitForTimeout(150);
      assert.ok(!(await page.evaluate(() => window.sberKids.engine.stats().active.includes('still-sleep'))), 'not before 6 s');
      await page.evaluate(() => window.sberKids.engine.sensors.inject('motion', { linear: 3, rotation: 30 }));
      await stillFor(6500);
      await page.waitForFunction(() => window.sberKids.engine.stats().active.includes('still-sleep'));
      const spec = await page.evaluate(() => window.sberKids.engine.config.prikoly.find(p => p.id === 'still-sleep'));
      assert.equal(spec.effect.params.anchor, 'avatar');
      assert.ok(spec.effect.params.gravity < 0 && spec.effect.params.direction < 0, '💤 float up from the avatar');
      await page.waitForFunction(() => document.querySelector('.prikoly-drop')?.dataset.face === 'sleep');
      await page.waitForTimeout(900);
      await shot('c1-quiet-hour');
      await stop();
    });

    await check('C2 every album hint is a short riddle, not an instruction', async () => {
      const hints = await page.evaluate(() => window.sberKids.engine.config.prikoly.filter(p => p.collect !== false).map(p => [p.id, p.hint]));
      for (const [id, hint] of hints) {
        assert.ok(hint.endsWith('?'), `${id}: riddle ends with "?"`);
        assert.ok(hint.length <= 60, `${id}: short (${hint.length})`);
        assert.ok(!/^(Отметь|Тряхни|Покачай|Переверни|Пополни|Выполни|Положи|Дважды|Быстро|Почитай|Убери|Помой|Выучи|Накопи|Загляни)/.test(hint), `${id}: not an instruction`);
      }
    });

    await check('C3 presenter reset returns everything to the start', async () => {
      await go('tasks');
      await page.locator('[data-zone="task-dog_walk"]').tap();
      await page.evaluate(() => { window.sberKids.engine.setSeason('winter'); window.sberKids.engine.sound.setMuted(true); window.sberKids.setBalance(1111); });
      await go('home');
      await page.waitForFunction(() => document.querySelectorAll('.prikoly-drop').length === 1);
      await page.evaluate(() => window.sberKids.engine.stopAll('swipe stand-in'));
      await page.evaluate(() => { document.querySelector('.dbg').classList.remove('is-collapsed'); document.querySelector('[data-act="resetDemo"]').click(); });
      await page.waitForFunction(() => window.sberKids.current() === 'home');
      await page.waitForFunction(() => document.querySelectorAll('.prikoly-drop').length === 1);
      const state = await page.evaluate(() => ({
        // Как при первом входе: в альбоме только Капля, которая встречает сразу.
        found: window.sberKids.engine.collection.ids().filter(id => id !== 'screen-resident').length,
        tasks: Object.values(window.sberKids.state.tasks).some(Boolean),
        season: window.sberKids.engine.rules.season(),
        muted: window.sberKids.engine.sound.isMuted(),
        balance: window.sberKids.state.balance,
        robot: window.sberKids.state.moneyboxes.find(m => m.id === 'robot').saved,
        lastTopup: window.sberKids.state.lastTopup,
        daily: localStorage.getItem('prikoly.daily'),
      }));
      assert.deepEqual(state, { found: 0, tasks: false, season: 'auto', muted: false, balance: 800.55, robot: 0, lastTopup: null, daily: null });
      await page.evaluate(() => document.querySelector('.dbg').classList.add('is-collapsed'));
    });

    await check('C3 presenter buttons call every hero moment', async () => {
      const act = name => page.evaluate(name => document.querySelector(`[data-act="${name}"]`).click(), name);
      await go('home');
      await page.waitForFunction(() => document.querySelectorAll('.prikoly-drop').length === 1);
      await act('heroGiggle');
      await page.waitForFunction(() => document.querySelector('.prikoly-drop')?.dataset.face === 'happy');
      await act('heroDance');
      await page.waitForFunction(() => document.querySelector('.pd-fx--note'));
      await act('heroHolo');
      await page.waitForFunction(() => document.querySelector('.prikoly-holo--foil'));
      await page.waitForTimeout(2800);
      await reset();
      await act('flip');
      await page.waitForFunction(() => document.querySelector('.prikoly-night'));
      await page.waitForFunction(() => !document.querySelector('.prikoly-night'), null, { timeout: 8000 });
      await reset();
      await act('still');
      await page.waitForFunction(() => window.sberKids.engine.stats().active.includes('still-sleep'));
      await stop();
      await go('moneybox');
      await reset();
      await act('coins');
      await page.waitForFunction(() => window.sberKids.engine.stats().active.includes('moneybox-rattle'));
      await stop();
      await act('topup');
      await page.waitForFunction(() => window.sberKids.current() === 'topup_success');
      await page.waitForFunction(() => window.sberKids.current() === 'moneybox', null, { timeout: 3500 });
      await stop();
      await act('allDone');
      await page.waitForFunction(() => window.sberKids.current() === 'tasks_done');
      await page.waitForFunction(() => window.sberKids.engine.stats().active.includes('tasks-all-done'));
      await stop();
      await page.evaluate(() => document.querySelector('[data-act="resetDemo"]').click());
      await page.waitForFunction(() => window.sberKids.current() === 'home');
    });

    // ——— D: красивое число и вехи копилки ———
    await check('D the HTML balance at 800,55 ₽ is indistinguishable from the raster', async () => {
      await go('home');
      await stop();
      const hide = await page.addStyleTag({ content: '.prikoly-stage, .prikoly-toast { visibility: hidden !important; }' });
      const patch = await page.locator('.screen-patch--balance').boundingBox();
      const clip = { x: patch.x - 6, y: patch.y - 6, width: patch.width + 12, height: patch.height + 12 };
      const html = await page.screenshot({ clip, scale: 'device' });
      const raw = await page.addStyleTag({ content: '.screen-patch--balance { visibility: hidden !important; }' });
      const raster = await page.screenshot({ clip, scale: 'device' });
      await raw.evaluate(el => el.remove());
      await hide.evaluate(el => el.remove());
      const m = await page.evaluate(async ([a, r]) => {
        const read = async b64 => {
          const img = new Image();
          img.src = `data:image/png;base64,${b64}`;
          await img.decode();
          const c = document.createElement('canvas');
          c.width = img.width; c.height = img.height;
          const g = c.getContext('2d');
          g.drawImage(img, 0, 0);
          return g.getImageData(0, 0, c.width, c.height);
        };
        const [A, R] = await Promise.all([read(a), read(r)]);
        const ink = (D, thr) => {
          let L = 1e9, Rr = -1, T = 1e9, B = -1;
          for (let y = 0; y < D.height; y++) for (let x = 0; x < D.width; x++) {
            if (D.data[(y * D.width + x) * 4] < thr) { L = Math.min(L, x); Rr = Math.max(Rr, x); T = Math.min(T, y); B = Math.max(B, y); }
          }
          return [L, Rr, T, B];
        };
        let sum = 0;
        for (let i = 0; i < A.data.length; i += 4) sum += Math.abs(A.data[i] - R.data[i]) + Math.abs(A.data[i + 1] - R.data[i + 1]) + Math.abs(A.data[i + 2] - R.data[i + 2]);
        return { all: [ink(A, 230), ink(R, 230)], rubles: [ink(A, 100), ink(R, 100)], mean: sum / (A.data.length / 4 * 3) };
      }, [html.toString('base64'), raster.toString('base64')]);
      for (const key of ['all', 'rubles']) {
        const [h, r] = m[key];
        assert.ok(h.every((v, i) => Math.abs(v - r[i]) <= 2), `${key}: html ${h} vs raster ${r} (px @2x)`);
      }
      assert.ok(m.mean < 9, `mean difference ${m.mean.toFixed(2)}`);
      const colors = await page.locator('[data-anchor="balance"]').evaluate(el => [getComputedStyle(el.firstElementChild).color, getComputedStyle(el.lastElementChild).color]);
      assert.deepEqual(colors, ['rgb(0, 0, 0)', 'rgb(166, 180, 189)']);
    });

    await check('D debug «Баланс 1111» changes the HTML balance and sends balance:show → glow around it', async () => {
      await go('home');
      await reset();
      const shown = [];
      await page.exposeFunction('noteBalance', v => shown.push(v)).catch(() => {});
      await page.evaluate(() => window.sberKids.bus.on('balance:show', ({ value }) => window.noteBalance(value)));
      await page.evaluate(() => { document.querySelector('.dbg').classList.remove('is-collapsed'); document.querySelector('[data-act="balance"]').click(); document.querySelector('.dbg').classList.add('is-collapsed'); });
      await page.waitForFunction(() => ['balance-pretty-number', 'balance-pretty-glow'].every(id => window.sberKids.engine.stats().active.includes(id)));
      assert.ok(/^1\s111\s₽$/.test(await page.locator('[data-anchor="balance"]').innerText()), 'the sum on the card is 1 111 ₽');
      assert.ok(shown.includes(1111), 'balance:show 1111');
      const glow = await page.locator('[data-anchor="balance"]').evaluate(el => el.getAnimations().length);
      assert.ok(glow > 0, 'the sum glows and jumps');
      const enabled = await page.evaluate(() => window.sberKids.engine.config.prikoly.filter(p => p.id.startsWith('balance-pretty')).every(p => p.enabled));
      assert.ok(enabled, 'pretty number is enabled in the config');
      await page.waitForTimeout(400);
      await shot('d-balance-1111');
      await page.evaluate(() => window.sberKids.setBalance(800.55));
      await stop();
    });

    await check('D pretty number: gold stars and a glowing HTML balance', async () => {
      await go('home');
      await reset();
      await page.evaluate(() => window.sberKids.setBalance(1111));
      await page.waitForFunction(() => ['balance-pretty-number', 'balance-pretty-glow'].every(id => window.sberKids.engine.stats().active.includes(id)));
      const animated = await page.locator('[data-anchor="balance"]').evaluate(el => el.getAnimations().length);
      assert.ok(animated > 0, 'the sum itself jumps and glows');
      await page.evaluate(() => window.sberKids.engine.openAlbum());
      const album = await page.locator('.prikoly-album').innerText();
      assert.ok(!album.includes('сияние'), 'companion glow is not a separate find');
      await page.evaluate(() => { window.sberKids.engine.closeAlbum(); window.sberKids.setBalance(800.55); });
      await stop();
    });

    await check('D six +500 ₽ topups: the bar grows, milestones fire, 100 % opens the dream', async () => {
      await page.evaluate(() => { document.querySelector('.dbg').classList.remove('is-collapsed'); document.querySelector('[data-act="resetDemo"]').click(); document.querySelector('.dbg').classList.add('is-collapsed'); });
      await page.waitForFunction(() => window.sberKids.current() === 'home');
      await go('moneybox');
      const okCount = id => page.evaluate(id => window.sberKids.engine.getLog().filter(l => l.id === id && l.ok).length, id);
      const width = () => page.locator('[data-anchor="progress"] i').evaluate(el => el.getBoundingClientRect().width / el.parentElement.getBoundingClientRect().width);
      const milestonesBefore = await okCount('moneybox-milestones');
      const crossedAt = [];
      let last = await width();
      assert.ok(last < 0.01, 'the dream starts empty');
      for (let i = 1; i <= 6; i++) {
        const starsBefore = await okCount('topup-star');
        const milestones = await okCount('moneybox-milestones');
        await page.locator('[data-zone="topup-robot"]').tap();
        await page.waitForFunction(() => window.sberKids.current() === 'topup_success');
        assert.ok(/\+500\s₽/.test(await page.locator('.topup-patch__title').innerText()), 'success screen says +500 ₽');
        await page.waitForFunction(n => window.sberKids.engine.getLog().filter(l => l.id === 'topup-star' && l.ok).length > n, starsBefore);
        // Нечётные — тап по экрану, чётные — сам через ~2 с.
        if (i % 2) await page.touchscreen.tap(190, 420);
        await page.waitForFunction(() => window.sberKids.current() !== 'topup_success', null, { timeout: 3500 });
        if (i === 6) break;
        assert.equal(await page.evaluate(() => window.sberKids.current()), 'moneybox');
        await page.waitForTimeout(250);
        const mid = await width();
        assert.ok(mid > last - 0.001 && mid < i / 6 - 0.02, `bar is still growing (${mid.toFixed(3)} → ${(i / 6).toFixed(3)})`);
        assert.equal(await page.locator('.moneybox-patch__progress.is-growing').count(), 1, 'growth is highlighted');
        await page.waitForFunction(() => !document.querySelector('.is-growing'), null, { timeout: 2500 });
        last = await width();
        assert.ok(Math.abs(last - i / 6) < 0.01, `bar at ${i}/6 (${last.toFixed(3)})`);
        await page.waitForTimeout(150);
        if (await okCount('moneybox-milestones') > milestones) crossedAt.push(i);
        await page.waitForFunction(() => !window.sberKids.engine.stats().active.includes('moneybox-milestones'), null, { timeout: 4000 });
      }
      assert.deepEqual(crossedAt, [2, 3, 5], 'milestones at 25, 50 and 75 %');
      assert.equal(await okCount('moneybox-milestones') - milestonesBefore, 3);
      await page.waitForFunction(() => window.sberKids.current() === 'moneybox_goal', null, { timeout: 4000 });
      await page.waitForFunction(() => ['moneybox-dream', 'moneybox-dream-stars'].every(id => window.sberKids.engine.getLog().some(l => l.id === id && l.ok)));
      assert.ok(await page.evaluate(() => window.sberKids.engine.stats().active.includes('moneybox-dream')), 'big celebration');
      await page.waitForFunction(() => document.querySelector('.prikoly-drop')?.dataset.face === 'happy');
      await page.waitForTimeout(600);
      await shot('d-dream');
      // Без сброса по кругу: полная мечта остаётся полной, кнопка ведёт на экран мечты.
      await go('moneybox');
      assert.equal(await page.evaluate(() => window.sberKids.state.moneyboxes.find(m => m.id === 'robot').saved), 3000);
      await page.locator('[data-zone="topup-robot"]').tap();
      await page.waitForFunction(() => window.sberKids.current() === 'moneybox_goal');
      assert.equal(await page.evaluate(() => window.sberKids.state.moneyboxes.find(m => m.id === 'robot').saved), 3000);
      await stop();
      // Сброс — только кнопкой ведущего.
      await page.evaluate(() => { document.querySelector('.dbg').classList.remove('is-collapsed'); document.querySelector('[data-act="resetDemo"]').click(); document.querySelector('.dbg').classList.add('is-collapsed'); });
      await page.waitForFunction(() => window.sberKids.current() === 'home');
      assert.equal(await page.evaluate(() => window.sberKids.state.moneyboxes.find(m => m.id === 'robot').saved), 0);
    });

    assert.deepEqual(errors, [], 'console and HTTP');
    assert.deepEqual(external, [], 'same-origin only');
    await context.close();
  } finally { await browser.close(); }
  const failed = report.checks.filter(c => !c.passed);
  if (failed.length) {
    console.error(JSON.stringify(failed, null, 2));
    process.exitCode = 1;
  }
}
await writeFile(`${output}/report.json`, JSON.stringify(reports, null, 2));
console.log(process.exitCode ? 'demo smoke FAILED' : `demo smoke passed; screenshots: ${output}`);
