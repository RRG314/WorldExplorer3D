import fs from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { serveMutableSourceManifest } from './source-preview-manifest.mjs';

const MIME_TYPES = new Map([
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
  ['.map', 'application/json; charset=utf-8']
]);

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isInsideRoot(rootDir, filePath) {
  const relative = path.relative(rootDir, filePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function serveStaticRoot({ rootDir, host, port }) {
  const sockets = new Set();
  const server = http.createServer(async (req, res) => {
    try {
      const reqUrl = new URL(req.url || '/', `http://${host}:${port}`);
      if (await serveMutableSourceManifest({
        pathname: reqUrl.pathname,
        rootDir,
        response: res
      })) return;
      const requestPath = decodeURIComponent(reqUrl.pathname === '/' ? '/index.html' : reqUrl.pathname);
      const resolved = path.resolve(rootDir, `.${requestPath}`);
      if (!isInsideRoot(rootDir, resolved)) {
        res.writeHead(403).end('forbidden');
        return;
      }

      let filePath = resolved;
      let stat = null;
      try {
        stat = await fs.stat(filePath);
      } catch {
        // Missing paths are handled by the explicit existence check below.
      }
      if (stat?.isDirectory()) filePath = path.join(filePath, 'index.html');
      if (!(await exists(filePath))) {
        res.writeHead(404).end('not found');
        return;
      }

      const contentType = MIME_TYPES.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(await fs.readFile(filePath));
    } catch (err) {
      res.writeHead(500).end(String(err?.message || err));
    }
  });

  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });

  return {
    port,
    close: () => new Promise((resolve) => {
      for (const socket of sockets) {
        if (socket instanceof net.Socket) socket.destroy();
      }
      server.close(resolve);
    })
  };
}

export async function startStaticRootServer({ rootDir, host = '127.0.0.1', candidatePorts = [] }) {
  for (const port of candidatePorts) {
    try {
      return await serveStaticRoot({ rootDir, host, port });
    } catch {
      // A parallel test may own this port, so continue through the bounded list.
    }
  }
  throw new Error(`Unable to start local static server on ports: ${candidatePorts.join(', ')}`);
}
