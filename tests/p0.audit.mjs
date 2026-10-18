// Полная приёмка P0: node tests/p0.audit.mjs (настройка Playwright — как у p2.smoke.mjs).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { validateConfig } from '../engine/config.js';

const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.APP_URL || 'http://127.0.0.1:8000/';
const output = process.env.QA_DIR || '/private/tmp/sber-p0-qa';
const original = JSON.parse(await readFile(new URL('../content/config.json', import.meta.url), 'utf8'));
assert.deepEqual(validateConfig(original).warnings, []);
await mkdir(output, { recursive: true });
const reports = [];

for (const browserType of [chromium, webkit].filter(b => !process.env.ONLY_BROWSER || b.name() === process.env.ONLY_BROWSER)) {
  const browser = await browserType.launch({ headless: true });
  const report = { browser: browserType.name(), browserVersion: browser.version(), scope: process.env.ONLY_CHECK || process.env.AUDIT_PHASE || 'full', visualOnly: Boolean(process.env.VISUAL_ONLY), viewport: '375x812', checks: [], screens: [], effects: [], errors: [], warnings: [], external: [] };
  reports.push(report);
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await context.addInitScript(() => {
    window.p0Audio = { starts: 0, stops: 0 };
    const proto = (window.AudioContext || window.webkitAudioContext)?.prototype;
    if (!proto) return;
    const create = proto.createBufferSource;
    proto.createBufferSource = function (...args) {
      const source = create.apply(this, args);
      const start = source.start.bind(source), stop = source.stop.bind(source);
      source.start = (...args) => { window.p0Audio.starts++; return start(...args); };
      source.stop = (...args) => { window.p0Audio.stops++; return stop(...args); };
      return source;
    };
  });
  const observe = target => {
    target.on('pageerror', error => report.errors.push(error.message));
    target.on('console', msg => {
      if (msg.type() === 'error') report.errors.push(msg.text());
      if (msg.type() === 'warning') report.warnings.push(msg.text());
    });
    target.on('request', request => {
      if (!request.url().startsWith(new URL(base).origin) && !/^(data|blob):/.test(request.url())) report.external.push(request.url());
    });
    target.on('response', response => { if (response.status() >= 400) report.errors.push(`${response.status()} ${response.url()}`); });
  };
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  observe(page);
  const shot = async name => {
    const style = await page.addStyleTag({ content: '.dbg { visibility: hidden !important; }' });
    await page.screenshot({ path: `${output}/${browserType.name()}-${name}.png`, scale: 'css' });
    await style.evaluate(el => el.remove());
  };
  const go = async id => {
    await page.evaluate(id => window.sberKids.go(id), id);
    await page.waitForFunction(id => window.sberKids.current() === id, id);
    await page.waitForTimeout(270);
  };
  const check = async (name, fn) => {
    if (process.env.ONLY_CHECK && !name.includes(process.env.ONLY_CHECK)) return;
    try { await fn(); report.checks.push({ name, passed: true }); }
    catch (error) { report.checks.push({ name, passed: false, error: error.message }); }
    console.log(`${browserType.name()}: ${name}: ${report.checks.at(-1).passed ? 'PASS' : 'FAIL'}`);
  };
  try {
    await page.goto(`${base}?debug=1#home`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.sberKids?.engine?.config?.prikoly.length);
    for (const id of ['home', 'tasks', 'tasks_done', 'moneybox', 'moneybox_goal', 'topup_success', 'content', 'transfer']) {
      await check(`screen ${id}`, async () => {
        await go(id);
        const size = await page.locator('#viewport').evaluate(el => ({ height: el.clientHeight, scroll: el.scrollHeight }));
        const positions = [...new Set([0, ...Array.from({ length: Math.ceil(size.scroll / 580) }, (_, i) => Math.min((i + 1) * 580, size.scroll - size.height))])].filter(n => n >= 0);
        const snapshots = [];
        for (const [i, top] of positions.entries()) {
          await page.locator('#viewport').evaluate((el, top) => { el.scrollTop = top; }, top);
          await page.waitForTimeout(70);
          await shot(`screen-${id}-${i}`);
          await page.evaluate(() => document.body.classList.add('debug-zones'));
          await shot(`zones-${id}-${i}`);
          await page.evaluate(() => document.body.classList.remove('debug-zones'));
          const style = await page.addStyleTag({ content: '.dbg { visibility: hidden !important; }' });
          const misses = await page.evaluate(() => {
            const vp = document.querySelector('#viewport').getBoundingClientRect();
            const bar = document.querySelector('#tabbar:not([hidden]) [data-anchor="tabbar"]')?.getBoundingClientRect();
            const misses = [];
            for (const el of document.querySelectorAll('#phone button[data-zone], #phone button[data-tab]:not(:disabled)')) {
              const r = el.getBoundingClientRect();
              if (!r.width || !r.height) continue; // скрытый таббар сохраняет элементы предыдущего экрана
              const inBar = Boolean(el.closest('#tabbar'));
              for (const fx of [.2, .5, .8]) for (const fy of [.2, .5, .8]) {
                const x = r.left + r.width * fx, y = r.top + r.height * fy;
                if (y < vp.top || y >= vp.bottom || (!inBar && bar && y >= bar.top)) continue;
                if (document.elementFromPoint(x, y)?.closest('button') !== el) misses.push({ id: el.dataset.zone || el.dataset.tab, x, y });
              }
            }
            return misses;
          });
          await style.evaluate(el => el.remove());
          assert.deepEqual(misses, [], 'visible zone receives touches at nine points');
          snapshots.push({ top, screenshot: `${browserType.name()}-screen-${id}-${i}.png` });
        }
        const geometry = await page.evaluate(() => {
          const frame = document.querySelector('.screen__frame');
          return {
            overflow: document.documentElement.scrollWidth > innerWidth,
            patches: [...document.querySelectorAll('.screen-patch')].map(el => ({ className: el.className, input: getComputedStyle(el).pointerEvents, clipped: el.scrollHeight > el.clientHeight + 2 })),
            anchors: [...document.querySelectorAll('#phone [data-anchor]')].map(el => {
              const r = el.getBoundingClientRect();
              return { name: el.dataset.anchor, x: r.x, y: r.y, width: r.width, height: r.height };
            }),
            raster: Boolean(frame),
          };
        });
        report.screens.push({ id, ...size, snapshots, ...geometry });
        assert.equal(await page.locator('.screen').count(), 1);
        assert.equal(geometry.overflow, false, 'no horizontal overflow');
        assert.ok(geometry.patches.every(p => p.input === 'none'), 'patches pass through input');
        assert.ok(geometry.patches.every(p => !p.clipped), `clipped patches: ${JSON.stringify(geometry.patches.filter(p => p.clipped))}`);
      });
    }
    if (process.env.AUDIT_PHASE !== 'screens') {
      const stop = () => page.evaluate(() => window.sberKids.engine.stopAll('audit cleanup'));
      const reset = () => page.evaluate(() => window.sberKids.engine.rules.resetCooldowns());
      const tap = async selector => {
        await page.locator(selector).evaluate(el => el.scrollIntoView({ block: 'center' }));
        await page.locator(selector).tap();
        await page.waitForTimeout(280);
      };
      await check('navigation: four tabs and all home actions', async () => {
        await go('home');
        for (const id of ['home', 'moneybox', 'tasks', 'content']) {
          await tap(`#tabbar [data-tab="${id}"]`);
          await page.waitForFunction(id => window.sberKids.current() === id, id);
        }
        for (const id of ['transfer', 'self', 'mobile']) {
          await go('home');
          await tap(`[data-zone="${id}"]`);
          assert.equal(await page.evaluate(() => window.sberKids.current()), 'transfer');
          await tap('[data-zone="back"]');
          assert.equal(await page.evaluate(() => window.sberKids.current()), 'home');
        }
      });
      await check('navigation: dream +500, success back to moneyboxes, goal and reset list', async () => {
        await go('moneybox');
        assert.equal(await page.locator('[data-zone="goal"]').count(), 0, 'no dream link before the dream is reached');
        await reset();
        await tap('[data-zone="topup-robot"]');
        assert.equal(await page.evaluate(() => window.sberKids.current()), 'topup_success');
        assert.deepEqual(await page.evaluate(() => [window.sberKids.state.lastTopup.moneyboxId, window.sberKids.state.lastTopup.amount]), ['robot', 500]);
        await page.waitForFunction(() => document.querySelector('.prikoly-lottie svg'));
        await tap('[data-zone="done"]');
        assert.equal(await page.evaluate(() => window.sberKids.current()), 'moneybox');
        await page.evaluate(() => { const s = window.sberKids; s.state.moneyboxes.find(m => m.id === 'robot').saved = 3000; s.refresh(); });
        await tap('[data-zone="goal"]');
        assert.equal(await page.evaluate(() => window.sberKids.current()), 'moneybox_goal');
        await tap('[data-zone="back"]');
        assert.equal(await page.evaluate(() => window.sberKids.current()), 'moneybox');
        await page.evaluate(() => { const s = window.sberKids; s.state.moneyboxes.find(m => m.id === 'robot').saved = 0; s.state.lastTopup = null; s.refresh(); });
        await go('tasks_done');
        await tap('[data-zone="back"]');
        assert.equal(await page.evaluate(() => window.sberKids.current()), 'tasks');
        await go('tasks_done');
        await tap('[data-zone="again"]');
        assert.ok(await page.evaluate(() => Object.values(window.sberKids.state.tasks).every(done => !done)));
      });
      await check('all five task actions, input through effects, final celebration', async () => {
        await go('tasks');
        await page.evaluate(() => {
          Object.keys(window.sberKids.state.tasks).forEach(id => { window.sberKids.state.tasks[id] = false; });
          window.sberKids.refresh();
        });
        for (const [id, effect] of [['dog_walk', 'dog'], ['dishes', 'dishes'], ['multiplication', 'math'], ['clean_room', 'clean'], ['read_book', 'book']]) {
          await stop(); await reset();
          await tap(`[data-zone="task-${id}"]`);
          assert.equal(await page.evaluate(id => window.sberKids.state.tasks[id], id), true);
          const expected = id === 'read_book' ? 'tasks-all-done' : `tasks-alive-${effect}`;
          await page.waitForFunction(id => window.sberKids.engine.stats().active.includes(id), expected);
        }
        await page.waitForFunction(() => window.sberKids.current() === 'tasks_done');
        await stop();
      });

      // Каждый включённый эффект и каждый визуальный вариант — с обычными правилами и естественным окончанием.
      for (const entry of original.prikoly.filter(p => p.enabled)) {
        for (const [variant, spec] of (entry.effect.variants || [entry.effect]).entries()) {
          await check(`effect ${entry.id} variant ${variant + 1}`, async () => {
            await stop();
            const screen = entry.id === 'moneybox-rattle' ? 'moneybox' : entry.screens?.[0] || 'home';
            await go(screen);
            if (entry.id.startsWith('tasks-alive-')) await page.locator(`[data-anchor="task-${entry.trigger.where.taskId}"]`).evaluate(el => el.scrollIntoView({ block: 'center' }));
            if (entry.id === 'moneybox-rattle') await page.locator('#viewport').evaluate(el => { el.scrollTop = 680; });
            const config = structuredClone(original);
            config.prikoly.find(p => p.id === entry.id).effect = structuredClone(spec);
            await page.evaluate(({ config, id }) => {
              const engine = window.sberKids.engine;
              engine.reload(config, 'P0 variant fixture');
              engine.rules.resetCooldowns();
              if (id.startsWith('season-')) engine.setSeason(id.split('-')[1]);
            }, { config, id: entry.id });
            await page.evaluate(({ id, taskId }) => window.sberKids.engine.simulateEntry(id, { taskId, x: .6, y: -.25 }), { id: entry.id, taskId: entry.trigger.where?.taskId });
            await page.waitForFunction(id => window.sberKids.engine.stats().active.includes(id), entry.id);
            const captureDelay = spec.type === 'particles'
              ? entry.id.startsWith('season-') ? 2200 : spec.params?.durationMs <= 2100 ? 450 : 1100
              : spec.type === 'coins' ? 600 : 220;
            await page.waitForTimeout(captureDelay);
            if (spec.type === 'lottie') await page.waitForFunction(() => document.querySelector('.prikoly-lottie svg'));
            await shot(`effect-${entry.id}-${variant + 1}`);
            if (process.env.VISUAL_ONLY) {
              report.effects.push({ id: entry.id, variant: variant + 1, visualOnly: true });
              await stop();
              return;
            }
            // Ночь «Кувырка» длится, пока телефон лежит экраном вниз: поднимаем его — рассвет и конец.
            if (spec.type === 'night') {
              await page.waitForFunction(() => document.querySelector('.prikoly-night'));
              await page.evaluate(() => window.sberKids.engine.sensors.inject('orientation', { alpha: 0, beta: 12, gamma: 0 }));
            }
            // Постоянный жилец не заканчивается сам: проверяем, что он стоит без цикла и гаснет по stopAll.
            if (spec.type === 'resident' && spec.params?.durationMs == null) {
              await page.waitForFunction(() => !window.sberKids.engine.stats().running);
              await stop();
              assert.equal(await page.locator('.prikoly-resident').count(), 0);
              report.effects.push({ id: entry.id, variant: variant + 1, persistent: true });
              return;
            }
            if (entry.id === 'holo-card') {
              for (const scroll of [0, 75]) {
                await page.locator('#viewport').evaluate((el, top) => { el.scrollTop = top; }, scroll);
                await page.waitForTimeout(60);
                const delta = await page.evaluate(() => {
                  const a = document.querySelector('[data-anchor="card"]').getBoundingClientRect();
                  const h = document.querySelector('.prikoly-holo').getBoundingClientRect();
                  return Math.max(...['left', 'top', 'width', 'height'].map(k => Math.abs(a[k] - h[k])));
                });
                assert.ok(delta < 1, 'hologram follows exact card bounds while scrolling');
              }
            }
            let peak = 0;
            const deadline = Date.now() + (spec.params?.durationMs || 5000) + 1800;
            while (await page.evaluate(id => window.sberKids.engine.stats().active.includes(id), entry.id)) {
              const stats = await page.evaluate(() => window.sberKids.engine.stats());
              peak = Math.max(peak, stats.particles);
              assert.ok(stats.particles <= config.settings.maxParticles, 'particle budget');
              assert.ok(Date.now() < deadline, 'effect terminates');
              await page.waitForTimeout(180);
            }
            assert.equal(await page.evaluate(() => window.sberKids.engine.stats().running), false);
            assert.equal(await page.evaluate(() => window.sberKids.engine.stage.dpr), 2);
            const late = await page.evaluate(id => window.sberKids.engine.getLog().filter(l => l.info?.includes(id) && l.info.includes('не уложился')), entry.id);
            assert.deepEqual(late, [], 'no safety timer needed');
            report.effects.push({ id: entry.id, variant: variant + 1, peak, endedNaturally: true });
          });
        }
      }
      await page.evaluate(config => window.sberKids.engine.reload(config, 'config.json'), original);
      await check('real avatar triple tap and long press album', async () => {
        await go('home'); await reset();
        const avatar = page.locator('[data-anchor="avatar"]');
        const r = await avatar.boundingBox();
        await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2, { clickCount: 3, delay: 70 });
        await page.waitForFunction(() => window.sberKids.engine.stats().active.includes('avatar-flip'));
        await stop();
        await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
        await page.mouse.down(); await page.waitForTimeout(700); await page.mouse.up();
        await page.waitForFunction(() => document.querySelector('.prikoly-album.is-open'));
        await page.waitForTimeout(350);
        await shot('album-found');
        const enabled = original.prikoly.filter(p => p.enabled && p.collect !== false).length;
        assert.equal(await page.locator('.prikoly-album__grid li').count(), enabled);
        assert.equal(await page.locator('.prikoly-album__grid .is-locked').count(), 0);
        await page.locator('.prikoly-album__mute').tap();
        assert.equal(await page.evaluate(() => window.sberKids.engine.sound.isMuted()), true);
        await page.locator('.prikoly-album__done').tap();
        await page.waitForTimeout(350);
        assert.equal(await page.locator('.prikoly-album').count(), 0);
        await page.evaluate(() => { window.sberKids.engine.resetCollection(); window.sberKids.engine.openAlbum(); });
        await page.waitForTimeout(350); await shot('album-locked');
        assert.equal(await page.locator('.prikoly-album__grid .is-locked').count(), enabled);
        const drag = await page.locator('.prikoly-album__grip').boundingBox();
        await page.mouse.move(drag.x + 10, drag.y + 2); await page.mouse.down();
        await page.mouse.move(drag.x + 10, drag.y + 110, { steps: 5 }); await page.mouse.up();
        await page.waitForTimeout(350);
        assert.equal(await page.locator('.prikoly-album').count(), 0, 'swipe closes album');
        await page.evaluate(() => window.sberKids.engine.sound.setMuted(false));
      });

      await check('debug controls, decision log, zones and calibration', async () => {
        await go('home');
        await page.locator('.dbg__fab').tap();
        await page.locator('[data-act="cooldowns"]').tap();
        await page.locator('[data-act="resident"]').tap();
        await page.waitForFunction(() => window.sberKids.engine.stats().active.includes('screen-resident'));
        await stop();
        await page.locator('[data-act="season"]').tap();
        await page.locator('[data-act="shake"]').tap();
        await page.waitForFunction(() => window.sberKids.engine.stats().active.some(id => id.startsWith('season-')));
        await stop();
        for (const act of ['flip', 'still', 'balance', 'resetCollection', 'cooldowns', 'mute', 'mute']) await page.locator(`[data-act="${act}"]`).tap();
        await page.locator('[data-tilt="x"]').evaluate(el => { el.value = '.7'; el.dispatchEvent(new Event('input', { bubbles: true })); });
        await page.waitForFunction(() => window.sberKids.engine.stats().active.includes('holo-card'));
        await stop();
        await page.locator('[data-opt="zones"]').check();
        assert.equal(await page.evaluate(() => document.body.classList.contains('debug-zones')), true);
        await page.locator('[data-opt="zones"]').uncheck();
        await page.locator('[data-opt="calibrate"]').check();
        await page.locator('.dbg__head [data-act="toggle"]').tap();
        await page.mouse.move(100, 220); await page.mouse.down(); await page.mouse.move(200, 300); await page.mouse.up();
        await page.locator('.dbg__fab').tap();
        await page.waitForFunction(() => document.querySelector('[data-out="calib"]').textContent.includes('x:'));
        await page.locator('[data-opt="calibrate"]').uncheck();
        await page.screenshot({ path: `${output}/${browserType.name()}-debug.png`, scale: 'css' });
        await page.locator('[data-act="allDone"]').tap();
        await page.waitForFunction(() => window.sberKids.current() === 'tasks_done');
        await stop();
        await go('moneybox');
        await page.locator('#viewport').evaluate(el => { el.scrollTop = 680; });
        await page.locator('[data-act="cooldowns"]').tap();
        await page.locator('[data-act="coins"]').tap();
        await page.waitForFunction(() => window.sberKids.engine.stats().active.includes('moneybox-rattle'));
        await stop();
        await page.locator('[data-act="album"]').tap();
        await page.waitForFunction(() => document.querySelector('.prikoly-album.is-open'));
        await page.evaluate(() => window.sberKids.engine.closeAlbum());
        await page.waitForTimeout(350);
        await page.locator('.dbg__head [data-act="toggle"]').tap();
      });
      await check('red zone cancels pending audio and blocks every trigger', async () => {
        await go('home');
        await page.locator('[data-anchor="card"]').tap();
        await page.route('**/sounds/pop.wav?p0-delayed=1', async route => {
          await new Promise(resolve => setTimeout(resolve, 700));
          await route.continue();
        });
        const starts = await page.evaluate(() => {
          window.sberKids.engine.sound.setMuted(false);
          window.sberKids.engine.sound.play(new URL('content/sounds/pop.wav?p0-delayed=1', location.href).href);
          return window.p0Audio.starts;
        });
        await go('transfer');
        await page.waitForTimeout(1000);
        assert.equal(await page.evaluate(() => window.p0Audio.starts), starts, 'pending sound cancelled by red zone');
        await page.evaluate(() => {
          const e = window.sberKids.engine;
          for (const p of e.config.prikoly) e.simulateEntry(p.id);
          for (const type of ['shake', 'flip', 'still', 'tilt', 'multitap']) e.simulate(type);
        });
        await page.waitForTimeout(100);
        assert.equal(await page.evaluate(() => window.sberKids.engine.stats().active.length), 0);
        assert.equal(await page.evaluate(() => window.sberKids.engine.stats().running), false);
        assert.equal(await page.locator('.prikoly-toast.is-shown').count(), 0);
      });
      await check('red zone rejects album via public/debug API', async () => {
        await go('transfer');
        await page.evaluate(() => window.sberKids.engine.openAlbum());
        await page.waitForTimeout(350);
        assert.equal(await page.locator('.prikoly-album').count(), 0);
        await page.evaluate(() => window.sberKids.engine.closeAlbum());
      });
      await check('CMS list, JSON validation, save, live season and reset', async () => {
        const cms = await context.newPage(); observe(cms);
        await cms.goto(`${base}cms.html`, { waitUntil: 'networkidle' });
        await cms.waitForFunction(() => document.querySelectorAll('.item').length > 0);
        await cms.screenshot({ path: `${output}/${browserType.name()}-cms-list.png`, scale: 'css' });
        assert.ok(await cms.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await cms.locator('#season label').filter({ has: cms.locator('[value="winter"]') }).tap();
        await cms.locator('#save').tap();
        await page.waitForFunction(() => window.sberKids.engine.config.settings.season === 'winter');
        await go('home'); await reset();
        await page.evaluate(() => { window.sberKids.engine.setSeason('auto'); window.sberKids.engine.simulate('shake'); });
        await page.waitForFunction(() => window.sberKids.engine.stats().active.includes('season-winter-snow'));
        await stop();
        const item = cms.locator('.item').filter({ has: cms.locator('.item__meta', { hasText: 'holo-card' }) });
        await item.locator('.switch').tap();
        await cms.locator('#save').tap();
        await page.waitForFunction(() => !window.sberKids.engine.config.prikoly.find(p => p.id === 'holo-card').enabled);
        await cms.locator('[data-tab="json"]').tap();
        const json = await cms.locator('#json').inputValue();
        const saved = await cms.evaluate(() => localStorage.getItem('prikoly.configOverride'));
        await cms.locator('#json').fill('{broken');
        await cms.locator('#save').tap();
        assert.equal(await cms.evaluate(() => localStorage.getItem('prikoly.configOverride')), saved);
        assert.ok((await cms.locator('#report').innerText()).includes('JSON'));
        await cms.screenshot({ path: `${output}/${browserType.name()}-cms-json-error.png`, scale: 'css' });
        await cms.locator('#json').fill(json);
        const downloadPromise = cms.waitForEvent('download');
        await cms.locator('#download').tap();
        const download = await downloadPromise;
        const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
        assert.equal(exported.settings.season, 'winter');
        await cms.locator('#reset').tap(); await cms.locator('#reset').tap();
        await page.waitForFunction(() => window.sberKids.engine.source === 'config.json');
        assert.equal(await page.evaluate(() => window.sberKids.engine.config.prikoly.find(p => p.id === 'holo-card').enabled), true);
        await cms.screenshot({ path: `${output}/${browserType.name()}-cms-json.png`, scale: 'css' });
        // Превью доступно на широком экране; само приложение выше проверялось строго при 375×812.
        await cms.setViewportSize({ width: 1280, height: 900 });
        const frame = cms.frames().find(f => f !== cms.mainFrame());
        await frame.waitForFunction(() => window.sberKids?.engine);
        for (const id of ['tasks', 'home']) {
          await cms.locator(`[data-preview="${id}"]`).click();
          await frame.waitForFunction(id => window.sberKids.current() === id, id);
        }
        await cms.locator('[data-preview="shake"]').click();
        await cms.screenshot({ path: `${output}/${browserType.name()}-cms-preview.png`, scale: 'css' });
        await cms.close();
      });
      await check('storage unavailable and iOS permission denied', async () => {
        for (const mode of ['storage', 'permission']) {
          const fixture = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
          try {
            await fixture.addInitScript(mode => {
              if (mode === 'storage') {
                for (const method of ['getItem', 'setItem', 'removeItem']) Storage.prototype[method] = () => { throw new DOMException('Storage unavailable', 'SecurityError'); };
              } else {
                for (const name of ['DeviceMotionEvent', 'DeviceOrientationEvent']) {
                  window[name] ||= class {};
                  window[name].requestPermission = async () => 'denied';
                }
              }
            }, mode);
            const target = await fixture.newPage(); observe(target);
            await target.goto(`${base}?debug=1#home`, { waitUntil: 'networkidle' });
            await target.waitForFunction(() => window.sberKids?.engine?.config?.prikoly.length);
            if (mode === 'permission') {
              await target.locator('.prikoly-chip').tap();
              await target.waitForFunction(() => window.sberKids.engine.sensors.permission === 'denied');
              assert.equal(await target.locator('.prikoly-chip').count(), 0);
            }
            await target.locator('#tabbar [data-tab="tasks"]').tap();
            await target.waitForFunction(() => window.sberKids.current() === 'tasks');
            await target.locator('[data-zone="task-dog_walk"]').tap();
            await target.waitForFunction(() => window.sberKids.engine.stats().active.includes('tasks-alive-dog'));
          } finally { await fixture.close(); }
        }
      });
    }
    await check('console, HTTP and origin', async () => {
      assert.deepEqual(report.errors, []);
      assert.deepEqual(report.warnings, []);
      assert.deepEqual(report.external, []);
    });
  } finally {
    await context.close();
    await browser.close();
    await writeFile(`${output}/report.json`, JSON.stringify(reports, null, 2));
  }
}
assert.ok(reports.every(r => r.checks.length && r.checks.every(c => c.passed)), `P0 failed; see ${output}/report.json`);
assert.ok(reports.every(r => !r.errors.length && !r.warnings.length && !r.external.length), 'no errors, warnings or external requests');
console.log(`P0 ${process.env.VISUAL_ONLY ? 'visual capture' : process.env.ONLY_CHECK || process.env.AUDIT_PHASE || 'full audit'} passed; evidence: ${output}`);
