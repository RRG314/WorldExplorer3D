import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import geospatial from '../functions/geospatial.js';
import { serveMutableSourceManifest } from './source-preview-manifest.mjs';

const sourceRootDir = process.cwd();
const rootDir = path.resolve(process.env.WE3D_PREVIEW_ROOT || sourceRootDir);
const args = process.argv.slice(2);

function readArgument(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const standalone = args.includes('--standalone') || process.env.WE3D_STANDALONE === '1';
const host = readArgument('--host', process.env.HOST || '127.0.0.1');
const port = Number(readArgument('--port', process.env.PORT || 4192));
const { queryAircraft, queryDeFlockCameras, queryStreetImagery } = geospatial;

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`Invalid preview port: ${port}`);
}

async function readCandidateManifest() {
  try {
    const manifest = JSON.parse(await fs.readFile(path.join(rootDir, 'build-manifest.json'), 'utf8'));
    const candidateId = String(manifest?.candidateId || '');
    if (!candidateId || candidateId !== String(manifest?.buildId || '')) {
      throw new Error('Candidate manifest has no matching candidate/build identity.');
    }
    return Object.freeze({ ...manifest, candidateId });
  } catch (error) {
    if (process.env.WE3D_PREVIEW_ROOT) throw error;
    return null;
  }
}

const candidateManifest = await readCandidateManifest();
const candidateId = candidateManifest?.candidateId || '';

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
  ['.glb', 'model/gltf-binary'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.ttf', 'font/ttf'],
  ['.mp4', 'video/mp4'],
  ['.webm', 'video/webm'],
  ['.mp3', 'audio/mpeg'],
  ['.ogg', 'audio/ogg'],
  ['.wav', 'audio/wav'],
  ['.csv', 'text/csv; charset=utf-8']
]);

const standaloneOverrides = new Map([
  ['/js/firebase-project-config.js', path.join(rootDir, 'js/standalone/runtime-config.js')],
  ['/js/firebase-init.js', path.join(rootDir, 'js/standalone/firebase-init.js')]
]);

function responseHeaders(extra = {}) {
  return {
    ...(standalone ? { 'X-WorldExplorer-Mode': 'standalone' } : {}),
    ...extra
  };
}

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
    if (standalone && reqUrl.pathname === '/api/standalone/status') {
      res.writeHead(200, responseHeaders({
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      }));
      res.end(JSON.stringify({
        mode: 'standalone',
        firebaseEnabled: false,
        cloudFeatures: false,
        geospatialProxy: true
      }));
      return;
    }
    if (!candidateId && await serveMutableSourceManifest({
      pathname: reqUrl.pathname,
      rootDir,
      response: res
    })) return;
    const requestedCandidate = String(reqUrl.searchParams.get('candidate') || '');
    if (requestedCandidate && (!candidateId || requestedCandidate !== candidateId)) {
      res.writeHead(409, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      res.end(candidateId
        ? `candidate identity mismatch: expected ${candidateId}`
        : 'source preview is mutable and cannot be addressed as a release candidate');
      return;
    }
    if (reqUrl.pathname === '/api/geospatial/street-imagery') {
      if (req.method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Method not allowed.' }));
        return;
      }
      try {
        const payload = await queryStreetImagery(Object.fromEntries(reqUrl.searchParams));
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=300, stale-while-revalidate=900'
        });
        res.end(JSON.stringify(payload));
      } catch (error) {
        const status = Number(error?.statusCode) || (error?.name === 'AbortError' ? 504 : 502);
        res.writeHead(status, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store'
        });
        res.end(JSON.stringify({ error: status === 504 ? 'Street imagery provider timed out.' : (error?.message || 'Street imagery unavailable.') }));
      }
      return;
    }
    if (reqUrl.pathname === '/api/geospatial/aircraft') {
      if (req.method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Method not allowed.' }));
        return;
      }
      try {
        const payload = await queryAircraft(Object.fromEntries(reqUrl.searchParams));
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=30, stale-while-revalidate=120'
        });
        res.end(JSON.stringify(payload));
      } catch (error) {
        const status = Number(error?.statusCode) || (error?.name === 'AbortError' ? 504 : 502);
        res.writeHead(status, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store'
        });
        res.end(JSON.stringify({ error: status === 504 ? 'OpenSky timed out.' : (error?.message || 'Aircraft observations unavailable.') }));
      }
      return;
    }
    if (reqUrl.pathname === '/api/geospatial/deflock-cameras') {
      if (req.method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Method not allowed.' }));
        return;
      }
      try {
        const payload = await queryDeFlockCameras(Object.fromEntries(reqUrl.searchParams));
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=300, stale-while-revalidate=21600'
        });
        res.end(JSON.stringify(payload));
      } catch (error) {
        const status = Number(error?.statusCode) || (error?.name === 'AbortError' ? 504 : 502);
        res.writeHead(status, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store'
        });
        res.end(JSON.stringify({ error: error?.message || 'Mapped camera data is unavailable.' }));
      }
      return;
    }
    const overridePath = standalone ? standaloneOverrides.get(reqUrl.pathname) : null;
    let relPath = decodeURIComponent(reqUrl.pathname || '/');
    if (relPath === '/') relPath = '/index.html';

    const resolved = overridePath || path.resolve(path.join(rootDir, relPath));
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
    res.writeHead(200, responseHeaders({
      'Content-Type': contentType,
      'Cache-Control': candidateId && !/\.html?$/i.test(ext)
        ? 'public, max-age=31536000, immutable'
        : 'no-store, no-cache, must-revalidate, max-age=0',
      ...(candidateId ? { 'X-WorldExplorer-Candidate': candidateId } : {}),
      Pragma: 'no-cache',
      Expires: '0'
    }));
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
  if (standalone) {
    console.log('World Explorer 3D standalone local edition');
    console.log(`http://${host}:${port}/app/`);
    console.log('Firebase services: disabled');
  } else if (candidateId) {
    console.log(`Immutable candidate ${candidateId}`);
    console.log(`http://${host}:${port}/app/?candidate=${encodeURIComponent(candidateId)}`);
  } else {
    console.log(`Mutable source preview running at http://${host}:${port}/`);
  }
});
