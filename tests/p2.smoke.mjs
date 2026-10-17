// Сервер: python3 -m http.server 8000. Затем: node tests/p2.smoke.mjs
// PLAYWRIGHT_MODULE — необязательный путь к уже установленному playwright, без зависимостей приложения.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { validateConfig } from '../engine/config.js';

const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.APP_URL || 'http://127.0.0.1:8000/';
const output = process.env.QA_DIR || '/private/tmp/sber-p2-qa';
await mkdir(output, { recursive: true });
const original = JSON.parse(await readFile(new URL('../content/config.json', import.meta.url), 'utf8'));
assert.deepEqual(validateConfig(original).warnings, []);
for (const [type, params] of [
  ['coins', { anchors: ['card'], coinsPerCard: -1 }],
  ['coins', { anchors: ['card', 'card'] }],
  ['resident', { size: 0 }],
  ['resident', { rangeDeg: 0 }],
  ['resident', { durationMs: -1 }],
]) {
  const config = structuredClone(original);
  config.prikoly = [{ ...config.prikoly[0], effect: { type, params } }];
  assert.equal(validateConfig(config).config.prikoly.length, 0, `invalid ${type} rejected`);
}

const reports = [];
for (const browserType of [chromium, webkit].filter(b => !process.env.ONLY_BROWSER || b.name() === process.env.ONLY_BROWSER)) {
  const browser = await browserType.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    const external = [];
    const observe = target => {
      target.on('pageerror', e => errors.push(e.message));
      target.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
      target.on('request', request => {
        if (!request.url().startsWith(new URL(base).origin) && !/^(data|blob):/.test(request.url())) external.push(request.url());
      });
      target.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    };
    observe(page);
    await page.goto(`${base}?debug=1`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.sberKids?.engine?.config?.prikoly.length);
    const go = async id => {
      await page.evaluate(id => window.sberKids.go(id), id);
      await page.waitForFunction(id => window.sberKids.current() === id, id);
      await page.waitForTimeout(260);
    };
    const reset = () => page.evaluate(() => window.sberKids.engine.rules.resetCooldowns());
    const preview = id => page.evaluate(id => window.sberKids.engine.simulateEntry(id), id);
    const active = id => page.waitForFunction(id => window.sberKids.engine.stats().active.includes(id), id);
    const idle = () => page.waitForFunction(() => !window.sberKids.engine.stats().running && !window.sberKids.engine.stats().active.length);
    const screenshot = async name => {
      await page.addStyleTag({ content: '.dbg { visibility: hidden !important; }' });
      await page.screenshot({ path: `${output}/${browserType.name()}-${name}.png` });
      await page.locator('style').last().evaluate(el => el.remove());
    };

    // Навигация и все старые экраны остаются рабочими.
    for (const id of ['tasks', 'tasks_done', 'moneybox', 'moneybox_goal', 'topup_success', 'content', 'transfer', 'home']) {
      await go(id);
      assert.equal(await page.locator('.screen').count(), 1);
    }
    await page.mouse.dblclick(190, 180, { delay: 80 });
    await active('screen-resident');
    await page.waitForTimeout(300);
    assert.equal(await page.locator('.prikoly-resident').count(), 1);
    const start = await page.locator('.prikoly-resident').boundingBox();
    await page.evaluate(() => {
      const sensors = window.sberKids.engine.sensors;
      sensors.inject('orientation', { beta: 30, gamma: 0 });
      sensors.inject('orientation', { beta: 30, gamma: 14 });
    });
    await page.waitForTimeout(550);
    const moved = await page.locator('.prikoly-resident').boundingBox();
    assert.ok(moved.x > start.x + 5, 'resident follows tilt');
    await page.mouse.click(moved.x + moved.width / 2, moved.y + moved.height / 2);
    await page.waitForFunction(() => document.querySelector('.prikoly-resident')?.dataset.mood === 'happy');
    await screenshot('resident');
    await page.evaluate(() => {
      const sensors = window.sberKids.engine.sensors;
      const t = performance.now();
      for (let i = 0; i < 3; i++) sensors.inject('motion', { linear: 30, rotation: 0, t: t + i * 100 });
    });
    await page.waitForFunction(() => document.querySelector('.prikoly-resident')?.dataset.mood === 'dizzy');
    const box = await page.locator('.prikoly-resident').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();
    await page.waitForFunction(() => !document.querySelector('.prikoly-resident'));
    await page.evaluate(() => window.sberKids.engine.stopAll('test cleanup'));

    // Ресурсы освобождаются при уходе с главного, в том числе до истечения эффекта.
    await reset(); await preview('screen-resident'); await active('screen-resident');
    await go('tasks');
    assert.equal(await page.locator('.prikoly-resident').count(), 0);
    await idle();
    // Старый эффект дел проходит через обычное действие пользователя.
    await page.locator('[data-zone="task-dog_walk"]').click();
    await active('tasks-alive-dog');
    await page.evaluate(() => window.sberKids.engine.stopAll('test cleanup'));

    await go('moneybox');
    // При нулевом прогрессе монет нет, при полном — ровно coinsPerCard.
    await page.evaluate(() => {
      const s = window.sberKids;
      s.state.moneyboxes.forEach(m => { m.saved = 0; });
      const slides = s.state.moneyboxes.find(m => m.id === 'slides');
      slides.saved = slides.goal;
      s.refresh();
      document.getElementById('viewport').scrollTop = 490;
    });
    await page.waitForTimeout(80);
    await reset();
    await page.evaluate(() => window.sberKids.engine.simulate('shake', { strength: 1 }));
    await active('moneybox-rattle');
    assert.equal(await page.evaluate(() => window.sberKids.engine.stats().particles), 14);
    await page.waitForTimeout(250);
    await screenshot('coins');
    // Прикосновение к карточке проходит сквозь монеты и открывает пополнение.
    await page.locator('[data-anchor="moneybox-slides"]').click();
    await page.waitForFunction(() => window.sberKids.current() === 'topup_success');
    assert.ok(!(await page.evaluate(() => window.sberKids.engine.stats().active)).includes('moneybox-rattle'));
    await go('moneybox');
    await page.evaluate(() => { document.getElementById('viewport').scrollTop = 490; });
    await reset(); await preview('moneybox-rattle'); await active('moneybox-rattle');
    assert.equal(await page.evaluate(() => window.sberKids.engine.stats().particles), 4, 'quarter-full has four coins');
    await page.evaluate(() => {
      window.sberKids.go('transfer');
    });
    await page.waitForFunction(() => window.sberKids.current() === 'transfer');
    await page.evaluate(() => { window.sberKids.engine.simulate('shake'); window.sberKids.engine.simulateEntry('screen-resident'); });
    await page.waitForTimeout(100);
    await idle();
    assert.equal(await page.locator('.prikoly-toast.is-shown').count(), 0, 'red zone hides discovery toast');
    await screenshot('red-zone');

    // Ограничения нулевого бюджета, минимального бюджета и reduced motion.
    await go('home');
    await page.evaluate(config => {
      config.settings.maxParticles = 0;
      window.sberKids.engine.reload(config, 'test zero');
      window.sberKids.engine.rules.resetCooldowns();
      window.sberKids.engine.simulateEntry('screen-resident');
    }, structuredClone(original));
    await page.waitForTimeout(100); await idle();
    await go('moneybox');
    await page.evaluate(() => { document.getElementById('viewport').scrollTop = 490; window.sberKids.engine.simulateEntry('moneybox-rattle'); });
    await page.waitForTimeout(100); await idle();
    await page.evaluate(config => {
      config.settings.maxParticles = 2;
      window.sberKids.engine.reload(config, 'test small');
      window.sberKids.engine.rules.resetCooldowns();
      window.sberKids.engine.simulateEntry('moneybox-rattle');
    }, structuredClone(original));
    await active('moneybox-rattle');
    assert.ok((await page.evaluate(() => window.sberKids.engine.stats().particles)) <= 2);
    await page.evaluate(config => window.sberKids.engine.reload(config, 'test restore'), original);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await go('home');
    await reset(); await preview('screen-resident'); await active('screen-resident');
    assert.equal(await page.locator('.screen').evaluate(el => getComputedStyle(el).animationName), 'none');
    await screenshot('reduced-motion');

    // Живая CMS: выключение обоих приколов убирает персонажа и не допускает новый запуск.
    const cms = await context.newPage();
    observe(cms);
    cms.setDefaultTimeout(10000);
    await cms.setViewportSize({ width: 1280, height: 900 });
    await cms.goto(`${base}cms.html`, { waitUntil: 'networkidle' });
    await cms.waitForFunction(() => document.querySelectorAll('.item').length > 0);
    for (const id of ['screen-resident', 'moneybox-rattle']) {
      const item = cms.locator('.item').filter({ has: cms.locator('.item__meta', { hasText: id }) });
      await item.locator('.switch').click();
      assert.equal(await item.locator('[data-field="enabled"]').isChecked(), false);
    }
    await cms.screenshot({ path: `${output}/${browserType.name()}-cms-before-save.png` });
    assert.ok(await cms.evaluate(() => innerWidth <= 1281), 'CMS has no horizontal overflow');
    await cms.locator('#save').click();
    await page.waitForFunction(() => window.sberKids.engine.source === 'CMS');
    assert.equal(await page.locator('.prikoly-resident').count(), 0);
    await reset(); await preview('screen-resident'); await page.waitForTimeout(100); await idle();
    await go('moneybox');
    await preview('moneybox-rattle'); await page.waitForTimeout(100); await idle();
    await go('home');
    await cms.setViewportSize({ width: 375, height: 812 });
    assert.ok(await cms.evaluate(() => innerWidth <= 376), 'mobile CMS has no overflow');
    await cms.locator('#save').click();
    await page.evaluate(() => { localStorage.removeItem('prikoly.configOverride'); });
    await page.evaluate(config => window.sberKids.engine.reload(config, 'test restore'), original);
    await cms.close();

    // Пауза фоновой вкладки проверяется тем же visibilitychange, что приходит от браузера.
    await reset(); await preview('screen-resident'); await active('screen-resident');
    assert.equal(await page.evaluate(() => window.sberKids.engine.stats().running), true);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    assert.equal(await page.evaluate(() => window.sberKids.engine.stats().running), false);
    await page.evaluate(() => {
      delete document.hidden;
      document.dispatchEvent(new Event('visibilitychange'));
      window.sberKids.engine.sound.setMuted(true);
    });
    assert.equal(await page.evaluate(() => window.sberKids.engine.sound.synth('giggle')), null);
    assert.equal(await page.evaluate(() => localStorage.getItem('prikoly.muted')), '1');
    await page.evaluate(() => window.sberKids.engine.sound.setMuted(false));
    await page.evaluate(() => window.sberKids.engine.stopAll('test cleanup'));

    // Капля и отложенный поток осадков резервируют один общий бюджет до первого кадра.
    await page.evaluate(config => {
      config.settings.maxParticles = 1;
      window.sberKids.engine.reload(config, 'test shared budget');
      window.sberKids.engine.rules.resetCooldowns();
      window.sberKids.engine.simulateEntry('screen-resident');
    }, structuredClone(original));
    await active('screen-resident');
    await page.evaluate(() => window.sberKids.engine.simulate('shake'));
    await page.waitForTimeout(200);
    assert.ok((await page.evaluate(() => window.sberKids.engine.stats().particles)) <= 1);
    await page.evaluate(config => window.sberKids.engine.reload(config, 'test restore'), original);

    let performanceResult = null;
    if (browserType === chromium) {
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await go('moneybox');
      await page.evaluate(() => {
        const s = window.sberKids;
        s.state.moneyboxes.forEach(m => { m.saved = m.goal; });
        s.refresh();
        document.getElementById('viewport').scrollTop = 490;
      });
      await reset();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await preview('moneybox-rattle'); await active('moneybox-rattle');
      const measure = async scenario => ({ scenario, ...await page.evaluate(() => new Promise(resolve => {
        const gaps = [];
        let start = 0, last = 0;
        const frame = now => {
          if (!start) start = last = now;
          else { gaps.push(now - last); last = now; }
          if (now - start < 1800) return requestAnimationFrame(frame);
          gaps.sort((a, b) => a - b);
          resolve({ cpu: 4, frames: gaps.length, fps: Math.round(1000 * gaps.length / (now - start)), p95Ms: Math.round(gaps[Math.floor(gaps.length * 0.95)]), maxParticles: window.sberKids.engine.stats().particles });
        };
        requestAnimationFrame(frame);
      })) });
      const coins = await measure('coins-full-cards');
      await page.evaluate(() => window.sberKids.engine.stopAll('test cleanup'));
      await go('home');
      await reset(); await preview('screen-resident'); await active('screen-resident');
      await page.evaluate(() => { window.sberKids.engine.setSeason('winter'); window.sberKids.engine.simulate('shake'); });
      await active('season-winter-snow');
      const resident = await measure('resident-and-snow');
      performanceResult = [coins, resident];
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      assert.ok(coins.fps >= 40 && resident.fps >= 40, 'CPU x4 remains responsive');
      await page.evaluate(() => window.sberKids.engine.stopAll('test cleanup'));
    }

    // Естественное завершение: общий цикл не остаётся крутиться.
    await go('moneybox');
    await page.evaluate(() => { document.getElementById('viewport').scrollTop = 490; });
    await reset(); await preview('moneybox-rattle'); await active('moneybox-rattle');
    await idle();
    await go('home');
    await reset(); await preview('screen-resident'); await active('screen-resident');
    await page.waitForFunction(() => !window.sberKids.engine.stats().running, null, { timeout: 12000 });
    await idle();
    await page.evaluate(() => window.sberKids.engine.openAlbum());
    assert.ok((await page.locator('.prikoly-album').innerText()).includes('Капля на карте'));
    await page.evaluate(() => window.sberKids.engine.closeAlbum());
    assert.deepEqual(errors, [], 'browser console and responses');
    assert.deepEqual(external, [], 'same-origin requests only');
    reports.push({ browser: browserType.name(), passed: true, errors, external, viewport: '375x812', cms: '1280x900', performance: performanceResult });
    console.log(`${browserType.name()}: P2 smoke passed`);
    await context.close();
  } finally { await browser.close(); }
}
await writeFile(`${output}/report.json`, JSON.stringify(reports, null, 2));
console.log(`Screenshots and report: ${output}`);
