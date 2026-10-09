/* Simuliert Vercel: liefert die statische Oberfläche aus und leitet /api/* (HTTP) an das Backend weiter.
   WebSockets gehen – wie bei Vercel – NICHT durch diesen Proxy, sondern direkt zum Backend. */
import { createReadStream, existsSync, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const [port, backendPort, dir] = [Number(process.argv[2]), Number(process.argv[3]), path.resolve(process.argv[4])];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    const up = http.request({ host: '127.0.0.1', port: backendPort, path: req.url, method: req.method, headers: { ...req.headers, 'x-forwarded-proto': 'http' } }, (r) => {
      res.writeHead(r.statusCode, r.headers);
      r.pipe(res);
    });
    up.on('error', () => { res.writeHead(502); res.end('bad gateway'); });
    req.pipe(up);
    return;
  }
  // Statische Datei oder SPA-Fallback; andere Methoden als GET/HEAD → 405 (wie ein reiner statischer Host)
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end('Method Not Allowed'); return; }
  let file = path.join(dir, decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(dir) || !existsSync(file) || statSync(file).isDirectory()) file = path.join(dir, 'index.html');
  res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1');
