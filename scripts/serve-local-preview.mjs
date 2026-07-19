import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const rootDir = process.cwd();
const host = '127.0.0.1';
const port = Number(process.env.PORT || 4192);

const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.map', 'application/json; charset=utf-8'],
  ['.glb', 'model/gltf-binary']
]);

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const reqUrl = new URL(req.url || '/', `http://${host}:${port}`);
    let relPath = decodeURIComponent(reqUrl.pathname || '/');
    if (relPath === '/') relPath = '/index.html';

    const resolved = path.resolve(path.join(rootDir, relPath));
    if (!resolved.startsWith(rootDir)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('forbidden');
      return;
    }

    let filePath = resolved;
    let stat = null;
    try {
      stat = await fs.stat(filePath);
    } catch {
      stat = null;
    }

    if (stat?.isDirectory()) filePath = path.join(filePath, 'index.html');
    if (!(await exists(filePath))) {
      res.writeHead(404, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Pragma: 'no-cache',
        Expires: '0'
      });
      res.end('not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mime.get(ext) || 'application/octet-stream';
    const body = await fs.readFile(filePath);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0'
    });
    res.end(body);
  } catch (error) {
    res.writeHead(500, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0'
    });
    res.end(String(error?.stack || error?.message || error));
  }
});

server.listen(port, host, () => {
  console.log(`Local preview server running at http://${host}:${port}/`);
});
