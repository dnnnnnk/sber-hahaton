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
    await page.waitForFunction(() => window.sberKids?.engine?.config?.prikoly.length);

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
      catch (error) { report.checks.push({ name, passed: false, error: error.message }); }
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
      assert.ok(particles >= 14, `full dream card rattles at scroll 0 (${particles})`);
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
      await page.evaluate(() => { window.sberKids.engine.setSeason('auto'); return window.sberKids.engine.reloadFromSources(); });
    });

    await check('A3 topup screen reads as a moneybox, not a payment', async () => {
      await go('moneybox');
      await page.locator('[data-zone="topup-slides"]').evaluate(el => el.scrollIntoView({ block: 'center' }));
      await page.locator('[data-zone="topup-slides"]').tap();
      await page.waitForFunction(() => window.sberKids.current() === 'topup_success');
      await page.waitForTimeout(300);
      const patch = page.locator('.screen-patch--topup');
      const text = await patch.innerText();
      assert.ok(text.includes('Копилка пополнена') && text.includes('Тапочки'));
      assert.ok(!/Оплата|магазин|чек/i.test(text));
      assert.ok(!/Оплата/.test(await page.locator('.screen').getAttribute('aria-label')));
      const r = await patch.boundingBox();
      const frame = await page.locator('.screen__frame').boundingBox();
      // Растровые «Оплата выполнена», «Любимый магазин», сумма чека и «Сохранить чек» — 33..75 % кадра.
      assert.ok(r.y <= frame.y + frame.height * 0.33 && r.y + r.height >= frame.y + frame.height * 0.75 && r.width >= frame.width - 1);
      await shot('a3-topup');
      await stop();
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
      assert.deepEqual([robot.title, robot.saved, robot.goal], ['Умный робот', 7600, 7600]);
      await go('moneybox');
      const card = await page.locator('.screen-patch--moneybox').first().innerText();
      assert.ok(card.includes('Умный робот') && /7\s600\s₽/.test(card));
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
