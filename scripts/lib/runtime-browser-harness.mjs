import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';

export const rootDir = process.cwd();
export const host = '127.0.0.1';
export const candidatePorts = [4173, 4174, 4175, 4176, 4177];

export async function mkdirp(dir) {
  await fs.mkdir(dir, { recursive: true });
}

export async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function serveStaticRoot(port) {
  const root = rootDir;
  const overpassCacheDir = path.join(rootDir, 'tmp', 'overpass-proxy-cache');
  const sockets = new Set();
  const overpassEndpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];
  const mime = new Map([
    ['.html', 'text/html; charset=utf-8'],
    ['.js', 'text/javascript; charset=utf-8'],
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

  const readRequestBody = (req) => new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

  const deriveOverpassProxyTimeoutMs = (bodyBuffer) => {
    const rawBody = Buffer.isBuffer(bodyBuffer) ? bodyBuffer.toString('utf8') : String(bodyBuffer || '');
    let queryText = rawBody;
    try {
      const params = new URLSearchParams(rawBody);
      queryText = String(params.get('data') || rawBody);
    } catch {}
    const timeoutMatch = queryText.match(/\[timeout:(\d+)\]/i);
    const requestedSeconds = Number(timeoutMatch?.[1]);
    const bodySizeBytes = Buffer.isBuffer(bodyBuffer) ? bodyBuffer.byteLength : Buffer.byteLength(rawBody, 'utf8');
    const bodyScaleMs =
      bodySizeBytes >= 16000 ? 6000 :
      bodySizeBytes >= 9000 ? 4000 :
      bodySizeBytes >= 4500 ? 2500 :
      1500;
    const requestedMs = Number.isFinite(requestedSeconds) ? requestedSeconds * 1000 : 7000;
    return Math.max(9000, Math.min(26000, requestedMs + bodyScaleMs));
  };

  const firstSuccessful = (promises) => new Promise((resolve, reject) => {
    const errors = new Array(promises.length);
    let pending = promises.length;
    promises.forEach((promise, idx) => {
      Promise.resolve(promise).then(resolve).catch((err) => {
        errors[idx] = err;
        pending -= 1;
        if (pending === 0) reject(errors);
      });
    });
  });

  const proxyOverpass = async (req, res) => {
    const body = await readRequestBody(req);
    const upstreamTimeoutMs = deriveOverpassProxyTimeoutMs(body);
    const bodyHash = crypto.createHash('sha1').update(body).digest('hex');
    const cacheFile = path.join(overpassCacheDir, `${bodyHash}.json`);
    await fs.mkdir(overpassCacheDir, { recursive: true });
    try {
      const cached = await fs.readFile(cacheFile, 'utf8');
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Overpass-Proxy-Cache': 'hit'
      });
      res.end(cached);
      return;
    } catch {}
    const failures = [];
    const attempts = overpassEndpoints.map((endpoint) => (async () => {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': req.headers['content-type'] || 'application/x-www-form-urlencoded; charset=UTF-8',
          'Accept': 'application/json',
          'User-Agent': 'WorldExplorer3D-TestHarness/1.0'
        },
        body,
        signal: AbortSignal.timeout(upstreamTimeoutMs)
      });
      if (!response.ok) {
        throw new Error(`${endpoint} HTTP ${response.status}`);
      }
      const text = await response.text();
      return { endpoint, text };
    })().catch((error) => {
      const message = `${endpoint} ${String(error?.message || error)}`;
      failures.push(message);
      throw new Error(message);
    }));
    try {
      const result = await firstSuccessful(attempts);
      await fs.writeFile(cacheFile, result.text).catch(() => {});
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Overpass-Proxy-Cache': 'miss'
      });
      res.end(result.text);
      return;
    } catch {}
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'All Overpass upstreams failed', failures }));
  };

  const server = http.createServer(async (req, res) => {
    try {
      const reqUrl = new URL(req.url || '/', `http://${host}:${port}`);
      if (reqUrl.pathname === '/api/overpass' && req.method === 'POST') {
        await proxyOverpass(req, res);
        return;
      }
      let relPath = decodeURIComponent(reqUrl.pathname || '/');
      if (relPath === '/') relPath = '/index.html';
      const joined = path.join(root, relPath);
      const resolved = path.resolve(joined);
      if (!resolved.startsWith(root)) {
        res.writeHead(403).end('forbidden');
        return;
      }

      let filePath = resolved;
      let stat = null;
      try {
        stat = await fs.stat(filePath);
      } catch {
        stat = null;
      }

      if (stat && stat.isDirectory()) filePath = path.join(filePath, 'index.html');
      if (!(await exists(filePath))) {
        res.writeHead(404).end('not found');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = mime.get(ext) || 'application/octet-stream';
      const buf = await fs.readFile(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(buf);
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

export async function startServer() {
  for (const port of candidatePorts) {
    try {
      const handle = await serveStaticRoot(port);
      return { ...handle, baseUrl: `http://${host}:${port}` };
    } catch {
      // try next candidate
    }
  }
  throw new Error(`Unable to start local static server on ports: ${candidatePorts.join(', ')}`);
}

export async function bootstrapEarthRuntime(page, locKey = 'baltimore') {
  return await page.evaluate(async (key) => {
    const deadline = performance.now() + 60000;
    let ctx = null;
    while (performance.now() < deadline) {
      const mod = await import('/app/js/shared-context.js?v=55');
      ctx = mod?.ctx || {};
      if (
        typeof ctx.loadRoads === 'function' &&
        typeof ctx.switchEnv === 'function' &&
        ctx.ENV?.EARTH
      ) {
        break;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }

    if (
      !ctx ||
      typeof ctx.loadRoads !== 'function' ||
      typeof ctx.switchEnv !== 'function' ||
      !ctx.ENV?.EARTH
    ) {
      return { ok: false, reason: 'runtime boot helpers unavailable' };
    }

    ctx.selLoc = key;
    ctx.gameMode = 'free';
    ctx.loadingScreenMode = 'earth';
    ctx.gameStarted = true;
    ctx.paused = false;
    ctx.switchEnv(ctx.ENV.EARTH);

    document.getElementById('titleScreen')?.classList.add('hidden');
    document.getElementById('globeSelectorScreen')?.classList.remove('show');
    ['hud', 'minimap', 'floatMenuContainer', 'mainMenuBtn', 'controlsTab', 'coords', 'historicBtn'].forEach((id) => {
      document.getElementById(id)?.classList.add('show');
    });

    await ctx.loadRoads();
    if (typeof ctx.spawnOnRoad === 'function') ctx.spawnOnRoad();
    if (typeof ctx.setTravelMode === 'function') {
      ctx.setTravelMode('drive', { source: 'continuous_world_bootstrap', force: true, emitTutorial: false });
    } else if (ctx.Walk?.setModeDrive) {
      ctx.Walk.setModeDrive();
    }

    return {
      ok: true,
      selLoc: ctx.selLoc || null,
      roads: Array.isArray(ctx.roads) ? ctx.roads.length : 0,
      buildings: Array.isArray(ctx.buildings) ? ctx.buildings.length : 0
    };
  }, locKey);
}

export async function loadEarthLocation(page, spec) {
  return await page.evaluate(async (locationSpec) => {
    const mod = await import('/app/js/shared-context.js?v=55');
    const ctx = mod?.ctx || {};
    if (!ctx || typeof ctx.loadRoads !== 'function') {
      return { ok: false, reason: 'loadRoads unavailable' };
    }

    if (typeof ctx.setTravelMode === 'function') {
      ctx.setTravelMode('drive', { source: 'continuous_world_load_prepare', force: true, emitTutorial: false });
    } else if (ctx.Walk?.setModeDrive) {
      ctx.Walk.setModeDrive();
    }
    if (ctx.boatMode?.active && typeof ctx.stopBoatMode === 'function') {
      ctx.stopBoatMode({ targetMode: 'drive', source: 'continuous_world_load_prepare' });
    }
    ctx.droneMode = false;
    ctx.paused = false;

    if (locationSpec.kind === 'custom') {
      ctx.customLoc = {
        lat: Number(locationSpec.lat),
        lon: Number(locationSpec.lon),
        name: String(locationSpec.label || 'Custom Location')
      };
      ctx.customLocTransient = false;
      ctx.selLoc = 'custom';
    } else {
      ctx.selLoc = String(locationSpec.key);
    }

    await ctx.loadRoads();
    if (typeof ctx.spawnOnRoad === 'function') ctx.spawnOnRoad();
    if (typeof ctx.setTravelMode === 'function') {
      ctx.setTravelMode('drive', { source: 'continuous_world_load', force: true, emitTutorial: false });
    }

    return {
      ok: true,
      selLoc: ctx.selLoc,
      roads: Array.isArray(ctx.roads) ? ctx.roads.length : 0,
      buildings: Array.isArray(ctx.buildings) ? ctx.buildings.length : 0,
      waterAreas: Array.isArray(ctx.waterAreas) ? ctx.waterAreas.length : 0,
      waterways: Array.isArray(ctx.waterways) ? ctx.waterways.length : 0
    };
  }, spec);
}
