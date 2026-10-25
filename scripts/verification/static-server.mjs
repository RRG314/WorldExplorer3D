import {servePlaceLookupPreview} from '../place-lookup-preview.mjs';
import fs from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { serveMutableSourceManifest } from '../source-preview-manifest.mjs';
import { assertPreviewRequest, resolvePreviewFile } from '../lib/local-preview-security.mjs';

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

async function listen(rootDir, host, port, handleRequest) {
  const sockets = new Set();
  const server = http.createServer(async (request, response) => {
    try {
      assertPreviewRequest(request, server.address().port, host);
      response.setHeader('X-Content-Type-Options', 'nosniff');
      const requestUrl = new URL(request.url || '/', `http://${host}:${port}`);
      if (await handleRequest?.(request, response, requestUrl)) return;
      if(await servePlaceLookupPreview(request,response,requestUrl))return;
      // Match the local preview's read-only backend route. A static 404 here
      // prevents real DeFlock journeys from exercising their production source.
      if (requestUrl.pathname === '/api/geospatial/deflock-cameras') {
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        if (request.method !== 'GET') {
          response.writeHead(405).end(JSON.stringify({ error: 'Method not allowed.' }));
          return;
        }
        try {
          const { default: geospatial } = await import('../../functions/geospatial.js');
          const payload = await geospatial.queryDeFlockCameras(Object.fromEntries(requestUrl.searchParams));
          response.writeHead(200).end(JSON.stringify(payload));
        } catch (error) {
          response.writeHead(Number(error?.statusCode) || (error?.name === 'AbortError' ? 504 : 502))
            .end(JSON.stringify({ error: error?.message || 'Mapped camera data is unavailable.' }));
        }
        return;
      }
      if (await serveMutableSourceManifest({
        pathname: requestUrl.pathname,
        rootDir,
        response
      })) return;
      const filePath = await resolvePreviewFile(rootDir, requestUrl.pathname);
      if (!filePath) {
        response.writeHead(404).end('not found');
        return;
      }
      response.writeHead(200, {
        'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream'
      });
      response.end(await fs.readFile(filePath));
    } catch (error) {
      response.writeHead([400,403].includes(error.statusCode) ? error.statusCode : 500)
        .end(error.statusCode === 403 ? 'forbidden' : error.statusCode === 400 ? 'invalid request' : 'preview request failed');
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
    port: server.address().port,
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

export async function startStaticServer({ rootDir, host = '127.0.0.1', ports = [], handleRequest }) {
  for (const port of ports) {
    try {
      return await listen(path.resolve(rootDir), host, port, handleRequest);
    } catch {
      // Try the next bounded port; parallel local verification may own this one.
    }
  }
  throw new Error(`No verification server port available: ${ports.join(', ')}`);
}
