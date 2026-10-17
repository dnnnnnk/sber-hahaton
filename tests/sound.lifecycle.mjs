// Регрессии: отложенный звук не переживает mute, красную зону или уход в фон.
import assert from 'node:assert/strict';
import { createSound } from '../engine/sound.js';
import { createHaptics } from '../engine/haptics.js';

let starts = 0, stops = 0, pending;
const node = () => ({ connect() { return this; }, disconnect() {}, start() { starts++; }, stop() { stops++; } });
class AudioContext {
  state = 'running';
  destination = {};
  createBufferSource = node;
  createGain = () => ({ ...node(), gain: { value: 0 } });
  decodeAudioData(data, resolve) { resolve({}); }
}
globalThis.window = { AudioContext };
globalThis.document = { hidden: false, addEventListener(type, fn) { this[type] = fn; } };
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userActivation: { hasBeenActive: true } } });
globalThis.localStorage = { getItem() { return null; }, setItem() {} };
globalThis.fetch = () => new Promise(resolve => { pending = () => resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) }); });
const settle = () => new Promise(resolve => setImmediate(resolve));
const failures = [];
for (const scenario of ['mute while loading', 'stop while loading', 'disable while loading', 'hide while loading', 'stop playing', 'mute playing']) {
  starts = stops = 0;
  document.hidden = false;
  let enabled = true;
  const sound = createSound(() => enabled);
  try {
    sound.unlock();
    sound.play('local.wav');
    if (scenario === 'mute while loading') sound.setMuted(true);
    if (scenario === 'stop while loading') sound.stopAll();
    if (scenario === 'disable while loading') enabled = false;
    if (scenario === 'hide while loading') { document.hidden = true; document.visibilitychange(); }
    pending(); await settle();
    if (scenario === 'stop playing' || scenario === 'mute playing') {
      assert.equal(starts, 1);
      if (scenario === 'stop playing') sound.stopAll();
      else sound.setMuted(true);
      assert.equal(stops, 1);
    } else assert.equal(starts, 0);
    console.log(`sound: ${scenario}: PASS`);
  } catch (error) {
    failures.push(`${scenario}: ${error.message}`);
    console.log(`sound: ${scenario}: FAIL`);
  }
}
assert.deepEqual(failures, []);
const vibration = [];
navigator.vibrate = pattern => vibration.push(pattern);
const haptics = createHaptics(() => true);
haptics.play('double'); haptics.stop();
assert.deepEqual(vibration, [[10, 40, 10], 0]);
console.log('haptics: cancel current pattern: PASS');
