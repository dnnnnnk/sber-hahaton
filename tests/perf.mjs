// Производительность геройских моментов при CPU ×4 (Chromium): node tests/perf.mjs. Цель — ≥ 55 FPS.
// Это настольная эмуляция нагрузки; ощущения на слабом Android проверяются отдельно (docs/DEVICE_QA.md).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.APP_URL || 'http://127.0.0.1:8000/';
const output = process.env.QA_DIR || '/private/tmp/sber-perf-qa';
const target = Number(process.env.FPS_TARGET || 55);
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await context.newPage();
await page.goto(`${base}?debug=1#home`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.sberKids?.engine?.config?.prikoly.length, null, { timeout: 20000 });
await page.addStyleTag({ content: '.dbg { display: none !important; }' });
const cdp = await context.newCDPSession(page);
const go = async id => {
  await page.evaluate(id => window.sberKids.go(id), id);
  await page.waitForFunction(id => window.sberKids.current() === id, id);
  await page.waitForTimeout(350);
};
// Кадры за 2 с; во время замера можно «двигать» датчики (drive) — как настоящий наклон.
const measure = (scenario, drive = '') => page.evaluate(({ drive }) => new Promise(resolve => {
  const gaps = [];
  let start = 0, last = 0, n = 0;
  const step = drive ? new Function('n', drive) : null;
  const frame = now => {
    if (!start) start = last = now;
    else { gaps.push(now - last); last = now; }
    step?.(n++);
    if (now - start < 2000) return requestAnimationFrame(frame);
    gaps.sort((a, b) => a - b);
    const s = window.sberKids.engine.stats();
    resolve({ fps: Math.round(1000 * gaps.length / (now - start)), p95Ms: Math.round(gaps[Math.floor(gaps.length * 0.95)]), particles: s.particles, active: s.active });
  };
  requestAnimationFrame(frame);
}), { drive }).then(result => ({ scenario, cpu: 4, ...result }));

const results = [];
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
const engine = code => page.evaluate(code);

await go('home');
await engine(`window.sberKids.engine.rules.resetCooldowns(); window.sberKids.engine.setSeason('autumn'); window.sberKids.engine.simulate('shake');
  window.sberKids.engine.simulateEntry('screen-resident', { react: 'dance' });`);
results.push(await measure('home: leaves + foil + dancing Drop',
  `window.sberKids.engine.simulate('tilt', { x: Math.sin(n / 9) * 0.6, y: Math.cos(n / 13) * 0.3 });`));

await engine(`window.sberKids.engine.stopAll('perf'); window.sberKids.engine.rules.resetCooldowns(); window.sberKids.engine.setSeason('winter'); window.sberKids.engine.simulate('shake');`);
await page.waitForTimeout(2500);
results.push(await measure('home: settled snow swept by a finger',
  `const c = document.querySelector('[data-anchor="card"]').getBoundingClientRect();
   document.dispatchEvent(new PointerEvent('pointermove', { clientX: c.right - (n * 9) % c.width, clientY: c.top + 2, bubbles: true }));`));

await engine(`window.sberKids.engine.stopAll('perf');`);
await go('content');
await go('home');
await engine(`const s = window.sberKids.engine.sensors; s.inject('orientation', { alpha: 0, beta: 179, gamma: 0 });
  setTimeout(() => s.inject('orientation', { alpha: 0, beta: 179, gamma: 0 }), 450);`);
await page.waitForFunction(() => document.querySelector('.prikoly-night.is-on'));
results.push(await measure('flip: night sky, stars, sleeping Drop'));
await engine(`window.sberKids.engine.sensors.inject('orientation', { alpha: 0, beta: 12, gamma: 0 });`);
results.push(await measure('flip: dawn, sun rays, greeting'));

await engine(`window.sberKids.engine.stopAll('perf');`);
await go('tasks');
await engine(`window.sberKids.engine.rules.resetCooldowns(); window.sberKids.engine.setSeason('summer'); window.sberKids.engine.simulate('shake');`);
results.push(await measure('tasks: summer glints and sun bunnies'));
await engine(`window.sberKids.engine.stopAll('perf'); window.sberKids.completeAllTasks();`);
await page.waitForFunction(() => window.sberKids.engine.stats().active.includes('tasks-all-done'));
results.push(await measure('tasks done: confetti + dancing Drop'));

await engine(`window.sberKids.engine.stopAll('perf');`);
await go('moneybox');
await engine(`const s = window.sberKids; s.state.moneyboxes.forEach(m => { m.saved = m.goal; }); s.refresh();
  s.engine.rules.resetCooldowns(); s.engine.simulateEntry('moneybox-rattle');`);
results.push(await measure('moneybox: coins in visible cards'));

await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
await writeFile(`${output}/perf.json`, JSON.stringify(results, null, 2));
for (const r of results) console.log(`${r.fps >= target ? 'PASS' : 'FAIL'} ${r.fps} fps, p95 ${r.p95Ms} ms — ${r.scenario}`);
await browser.close();
assert.ok(results.every(r => r.fps >= target), `CPU ×4: every hero moment ≥ ${target} FPS`);
