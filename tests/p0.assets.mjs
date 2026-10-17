import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { validateConfig, isContentPath } from '../engine/config.js';

const root = new URL('../', import.meta.url);
const original = JSON.parse(await readFile(new URL('content/config.json', root), 'utf8'));
assert.deepEqual(validateConfig(original).warnings, []);
for (const value of ['https://example.org/x.wav', 'https://local.invalid/content/x.wav', '//example.org/x.wav', '/x.wav', '../x.wav', '%2e%2e/x.wav', 'sounds/..%2f..%2fx.wav', 'data:audio/wav,x', 'blob:x', 'sounds\\x.wav', 'sounds/{value}.wav', 'sounds/x.wav?balance=1111', '']) {
  assert.equal(isContentPath(value), false, value);
  for (const field of ['sound', 'src']) {
    const config = structuredClone(original);
    const entry = { ...config.prikoly[0] };
    if (field === 'sound') entry.sound = value;
    else entry.effect = { type: 'lottie', params: { src: value } };
    config.prikoly = [entry];
    assert.equal(validateConfig(config).config.prikoly.length, 0, `${field}: ${value}`);
  }
}
for (const value of ['sounds/pop.wav', 'effects/sparkle.json', './sounds/pop.wav']) assert.equal(isContentPath(value), true);

const images = [];
for (const file of await readdir(new URL('screens/', root))) {
  if (!file.endsWith('.webp')) continue;
  const data = await readFile(new URL(`screens/${file}`, root));
  let width = 0;
  for (let i = 12; i + 8 < data.length;) {
    const kind = data.toString('ascii', i, i + 4), length = data.readUInt32LE(i + 4), at = i + 8;
    if (kind === 'VP8X') { width = data.readUIntLE(at + 4, 3) + 1; break; }
    if (kind === 'VP8 ') { width = data.readUInt16LE(at + 6) & 16383; break; }
    if (kind === 'VP8L') { width = (data.readUInt32LE(at + 1) & 16383) + 1; break; }
    i += 8 + length + length % 2;
  }
  assert.equal(width, 750, file);
  images.push({ file, bytes: data.length, width });
}
const imageBytes = images.reduce((sum, i) => sum + i.bytes, 0);
assert.ok(imageBytes <= 1_500_000);
async function treeSize(url) {
  let bytes = 0;
  for (const name of await readdir(url)) {
    const child = new URL(name, url), info = await stat(child);
    bytes += info.isDirectory() ? await treeSize(new URL(`${name}/`, url)) : info.size;
  }
  return bytes;
}
const contentBytes = await treeSize(new URL('content/', root));
assert.ok(contentBytes <= 6_000_000);
console.log(JSON.stringify({ images, imageBytes, contentBytes, externalAssetPaths: 'rejected' }, null, 2));
