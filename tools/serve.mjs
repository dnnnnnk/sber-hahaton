// Локальный статический сервер для проверок: node tools/serve.mjs [порт] [--root ..]
// python3 -m http.server под параллельной загрузкой модулей иногда сбрасывает соединения (маленькая очередь),
// и тесты падают на старте. Этот сервер без зависимостей, только 127.0.0.1, без кэша.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const port = Number(args.find(a => /^\d+$/.test(a))) || 8000;
const rootArg = args.includes('--root') ? args[args.indexOf('--root') + 1] : '.';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)), rootArg);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.wav': 'audio/wav', '.md': 'text/markdown; charset=utf-8',
};

createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://local').pathname);
    let file = normalize(join(root, path));
    if (file !== root && !file.startsWith(root + sep)) return send(res, 403, 'forbidden');
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    send(res, 404, 'not found');
  }
}).listen(port, '127.0.0.1', 511, () => console.log(`http://127.0.0.1:${port}/ → ${root}`));

function send(res, code, text) {
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}
