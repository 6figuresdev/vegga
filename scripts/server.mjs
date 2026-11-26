// Zero-dependency static server: `npm start`, then open http://localhost:4173/fixture/ and /dashboard/
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const port = Number(process.env.PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.md': 'text/markdown', '.png': 'image/png' };

export function start(p = port) {
  return http.createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (path === '/') { res.writeHead(302, { Location: '/fixture/' }); return res.end(); }
      const file = normalize(join(root, path));
      if (!file.startsWith(root)) { res.writeHead(403); return res.end('forbidden'); }
      let target = file;
      if ((await stat(target).catch(() => null))?.isDirectory()) target = join(target, 'index.html');
      const body = await readFile(target);
      res.writeHead(200, { 'Content-Type': types[extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch { res.writeHead(404); res.end('not found'); }
  }).listen(p);
}
if (process.argv[1] && process.argv[1].endsWith('server.mjs')) {
  start();
  console.log(`Vegga on http://localhost:${port}/fixture/  (dashboard: /dashboard/)`);
}
