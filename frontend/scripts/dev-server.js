import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../dist', import.meta.url)));
const port = Number(process.env.PORT || 5173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.map': 'application/json' };

createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) {
    const upstream = `http://localhost:${process.env.API_PORT || 3001}${url.pathname}${url.search}`;
    const headers = {};
    if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'];
    fetch(upstream, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : req, duplex: 'half' })
      .then(async (response) => { res.writeHead(response.status, { 'content-type': response.headers.get('content-type') || 'application/json' }); res.end(Buffer.from(await response.arrayBuffer())); })
      .catch(() => { res.writeHead(502, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'Backend API is unavailable.' } })); });
    return;
  }
  const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const filename = resolve(root, `.${relative}`);
  if (!filename.startsWith(root + sep) || !existsSync(filename)) { res.writeHead(404); res.end('Not found'); return; }
  res.writeHead(200, { 'content-type': types[extname(filename)] || 'application/octet-stream' });
  createReadStream(filename).pipe(res);
}).listen(port, () => console.log(`Bank Management UI listening at http://localhost:${port}`));
