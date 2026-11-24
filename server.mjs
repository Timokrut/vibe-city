import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';

const root = fileURLToPath(new URL('./public/', import.meta.url));
const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.png': 'image/png'
};

export function createServer(api) {
  return http.createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (api && path.startsWith('/api/')) return await api(req, res, path);
      if (!['GET', 'HEAD'].includes(req.method)) {
        res.writeHead(405, { Allow: 'GET, HEAD' }).end();
        return;
      }
      const file = resolve(root, '.' + (path === '/' ? '/index.html' : path));
      if (!file.startsWith(resolve(root) + sep)) {
        res.writeHead(403).end();
        return;
      }
      const data = await readFile(file);
      res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch (error) {
      res.writeHead(error.code === 'ENOENT' || error.code === 'EISDIR' ? 404 : 400).end();
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { roomApi } = await import('./rooms.mjs');
  const port = Number(process.env.PORT || 3000);
  createServer(roomApi).listen(port, '0.0.0.0', function () {
    const actual = this.address().port;
    console.log('Local: http://localhost:' + actual);
    for (const nic of Object.values(networkInterfaces()).flat()) {
      if (nic && nic.family === 'IPv4' && !nic.internal) console.log('LAN: http://' + nic.address + ':' + actual);
    }
  });
}

