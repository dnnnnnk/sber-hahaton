// Перекодирует PNG экранов из Figma в WebP (разово, при новом экспорте). Рантайму не нужен.
//
//   npm i --no-save playwright@1.54 && npx playwright install chromium
//   node tools/encode_screens.mjs <папка с PNG> [--out screens] [--quality 0.9] [--probe]
//
// Кодирует headless Chromium (canvas.toBlob('image/webp')): размер в пикселях тот же, что у PNG (@2x),
// поэтому зоны в % не сдвигаются. Непрозрачные картинки кодируются без альфы, с прозрачностью — с альфой
// (альфа в WebP хранится без потерь). PSNR в отчёте — сходство с PNG, дБ (≥ 40 — на глаз не отличить).
// --probe — только таблица размеров для нескольких quality, без записи файлов.

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : def;
};
const probe = args.includes('--probe') && args.splice(args.indexOf('--probe'), 1);
const outDir = opt('--out', 'screens');
const quality = Number(opt('--quality', '0.9'));
const srcDir = args[0];
if (!srcDir) {
  console.error('Usage: node tools/encode_screens.mjs <папка с PNG> [--out screens] [--quality 0.9] [--probe]');
  process.exit(1);
}

const files = (await readdir(srcDir)).filter(f => f.toLowerCase().endsWith('.png')).sort();
const browser = await chromium.launch();
const page = await browser.newPage();

// В странице: PNG → холст → WebP; заодно проверка прозрачности и PSNR раскодированного WebP против PNG.
await page.setContent('<!doctype html><title>encode</title>');
await page.evaluate(() => {
  const toData = async (bitmap, alpha) => {
    const c = new OffscreenCanvas(bitmap.width, bitmap.height);
    const g = c.getContext('2d', { alpha });
    g.drawImage(bitmap, 0, 0);
    return { canvas: c, data: g.getImageData(0, 0, c.width, c.height).data };
  };
  const psnr = (a, b, alpha) => {
    let sum = 0, n = 0;
    for (let i = 0; i < a.length; i += 4) {
      for (let k = 0; k < (alpha ? 4 : 3); k++) { const d = a[i + k] - b[i + k]; sum += d * d; n++; }
    }
    return sum ? 10 * Math.log10((255 * 255 * n) / sum) : Infinity;
  };
  const fromBase64 = s => Uint8Array.from(atob(s), ch => ch.charCodeAt(0));
  const toBase64 = async blob => {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const decode = blob => createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });

  window.encode = async (pngBase64, qualities) => {
    const png = await decode(new Blob([fromBase64(pngBase64)], { type: 'image/png' }));
    const src = await toData(png, true);
    let opaque = true;
    for (let i = 3; i < src.data.length; i += 4) if (src.data[i] !== 255) { opaque = false; break; }
    const { canvas } = opaque ? await toData(png, false) : src;
    const results = [];
    for (const q of qualities) {
      const blob = await canvas.convertToBlob({ type: 'image/webp', quality: q });
      const back = await toData(await decode(blob), !opaque);
      results.push({ q, size: blob.size, psnr: psnr(src.data, back.data, !opaque), base64: await toBase64(blob) });
    }
    return { width: png.width, height: png.height, opaque, results };
  };
});

await mkdir(outDir, { recursive: true });
const qualities = probe ? [0.7, 0.75, 0.8, 0.82, 0.85, 0.9] : [quality];
let before = 0, after = 0;
for (const file of files) {
  const png = await readFile(join(srcDir, file));
  const res = await page.evaluate(([b64, qs]) => window.encode(b64, qs), [png.toString('base64'), qualities]);
  const name = basename(file, '.png') + '.webp';
  const kb = n => `${(n / 1024).toFixed(0)} КБ`;
  const head = `${file.padEnd(20)} ${res.width}×${res.height} ${res.opaque ? 'без альфы' : 'с альфой '} PNG ${kb(png.length).padStart(8)}`;
  if (probe) {
    console.log(head);
    for (const r of res.results) console.log(`   q=${r.q}: ${kb(r.size).padStart(8)}  PSNR ${r.psnr.toFixed(1)} дБ`);
    continue;
  }
  const r = res.results[0];
  await writeFile(join(outDir, name), Buffer.from(r.base64, 'base64'));
  before += png.length;
  after += r.size;
  console.log(`${head} → ${name} ${kb(r.size).padStart(8)}  PSNR ${r.psnr.toFixed(1)} дБ`);
}
if (!probe) console.log(`Итого: ${(before / 1048576).toFixed(2)} МБ → ${(after / 1048576).toFixed(2)} МБ (quality ${quality})`);
await browser.close();
