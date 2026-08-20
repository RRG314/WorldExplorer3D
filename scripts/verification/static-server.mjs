import fs from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { serveMutableSourceManifest } from '../source-preview-manifest.mjs';

const MIME = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
});

function containedBy(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function listen(rootDir, host, port) {
  const sockets = new Set();
  const server = http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || '/', `http://${host}:${port}`);
      if (await serveMutableSourceManifest({
        pathname: requestUrl.pathname,
        rootDir,
        response
      })) return;
      const pathname = decodeURIComponent(requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname);
      let filePath = path.resolve(rootDir, `.${pathname}`);
      if (!containedBy(rootDir, filePath)) {
        response.writeHead(403).end('forbidden');
        return;
      }
      const initialStat = await fs.stat(filePath).catch(() => null);
      if (initialStat?.isDirectory()) filePath = path.join(filePath, 'index.html');
      const stat = await fs.stat(filePath).catch(() => null);
      if (!stat?.isFile()) {
        response.writeHead(404).end('not found');
        return;
      }
      response.writeHead(200, {
        'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
      });
      response.end(await fs.readFile(filePath));
    } catch (error) {
      response.writeHead(500).end(String(error?.message || error));
    }
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  return {
    port,
    close: () => new Promise((resolve) => {
      for (const socket of sockets) if (socket instanceof net.Socket) socket.destroy();
      server.closeIdleConnections?.();
      server.closeAllConnections?.();
      const timeout = setTimeout(resolve, 2000);
      timeout.unref?.();
      server.close(() => {
        clearTimeout(timeout);
        resolve();
      });
    })
  };
}

export async function startStaticServer({ rootDir, host = '127.0.0.1', ports = [] }) {
  for (const port of ports) {
    try {
      return await listen(path.resolve(rootDir), host, port);
    } catch {
      // Try the next bounded port; parallel local verification may own this one.
    }
  }
  throw new Error(`No verification server port available: ${ports.join(', ')}`);
}
