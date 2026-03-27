import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { chromium } from 'playwright';

const rootDir = process.cwd();
const host = '127.0.0.1';
const candidatePorts = [4173, 4174, 4175, 4176, 4177];
const outputDir = path.join(rootDir, 'output', 'playwright', 'terrain-seam-regression');

async function mkdirp(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function serveStaticRoot(port) {
  const root = rootDir;
  const sockets = new Set();
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

  const server = http.createServer(async (req, res) => {
    try {
      const reqUrl = new URL(req.url || '/', `http://${host}:${port}`);
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
    server,
    close: () => new Promise((resolve) => {
      for (const socket of sockets) {
        if (socket instanceof net.Socket) socket.destroy();
      }
      server.close(resolve);
    })
  };
}

async function startServer() {
  for (const port of candidatePorts) {
    try {
      const handle = await serveStaticRoot(port);
      return { ...handle, port, owned: true };
    } catch {
      // try next candidate
    }
  }
  throw new Error(`Unable to start local static server on ports: ${candidatePorts.join(', ')}`);
}

async function bootstrapEarthRuntime(page, locKey = 'baltimore') {
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
    if (ctx.Walk?.setModeDrive) ctx.Walk.setModeDrive();
    if (typeof ctx.startMode === 'function') ctx.startMode();
    return {
      ok: true,
      roads: Array.isArray(ctx.roads) ? ctx.roads.length : 0,
      buildings: Array.isArray(ctx.buildings) ? ctx.buildings.length : 0
    };
  }, locKey);
}

async function sampleSeamPath(page, seamPath) {
  return await page.evaluate(async (pathLatLon) => {
    const mod = await import('/app/js/shared-context.js?v=55');
    const ctx = mod?.ctx || {};
    const samples = [];

    if (!ctx || typeof ctx.geoToWorld !== 'function' || typeof ctx.getTerrainStreamingSnapshot !== 'function') {
      return { ok: false, reason: 'terrain snapshot helpers unavailable' };
    }

    const takeSnapshot = (label, lat, lon, syncDurationMs = 0) => {
      const snap = ctx.getTerrainStreamingSnapshot();
      return {
        label,
        lat,
        lon,
        syncDurationMs: Number(syncDurationMs.toFixed(2)),
        terrainMeshCount: snap.terrainMeshCount,
        pendingTerrainTiles: snap.pendingTerrainTiles,
        loadedTerrainTiles: snap.loadedTerrainTiles,
        activeTileCount: snap.activeTileCount,
        activeTilesLoaded: snap.activeTilesLoaded,
        activeNearTileCount: snap.activeNearTileCount,
        activeNearTilesLoaded: snap.activeNearTilesLoaded,
        activeCenterKey: snap.activeCenterKey,
        activeCenterLoaded: snap.activeCenterLoaded,
        roadsNeedRebuild: snap.roadsNeedRebuild,
        terrainModeHint: snap.worldSurfaceProfile?.terrainModeHint || null,
        modeCounts: snap.modeCounts
      };
    };

    for (let i = 0; i < pathLatLon.length; i++) {
      const point = pathLatLon[i];
      const world = ctx.geoToWorld(point.lat, point.lon);
      ctx.car.x = world.x;
      ctx.car.z = world.z;
      ctx.car.speed = 0;
      ctx.car.vx = 0;
      ctx.car.vz = 0;
      const startedAt = performance.now();
      ctx.updateTerrainAround(world.x, world.z);
      const syncDurationMs = performance.now() - startedAt;
      await new Promise((resolve) => window.setTimeout(resolve, i === 0 ? 1800 : 900));
      samples.push(takeSnapshot(`step_${i + 1}`, point.lat, point.lon, syncDurationMs));
    }

    return { ok: true, samples };
  }, seamPath);
}

async function main() {
  await mkdirp(outputDir);

  const serverHandle = await startServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console:${msg.text()}`);
  });

  const seamPath = [
    { lat: 39.30018, lon: -76.60228 },
    { lat: 39.30024, lon: -76.60216 },
    { lat: 39.30030, lon: -76.60204 },
    { lat: 39.30036, lon: -76.60192 },
    { lat: 39.30042, lon: -76.60180 }
  ];

  let bootstrap = null;
  let seamReport = null;
  try {
    await page.goto(`http://${host}:${serverHandle.port}/app/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    bootstrap = await bootstrapEarthRuntime(page, 'baltimore');
    if (!bootstrap?.ok) {
      throw new Error(`bootstrap failed: ${JSON.stringify(bootstrap)}`);
    }

    await page.waitForTimeout(4000);
    seamReport = await sampleSeamPath(page, seamPath);
    if (!seamReport?.ok) {
      throw new Error(`seam probe failed: ${JSON.stringify(seamReport)}`);
    }

    const samples = seamReport.samples || [];
    const maxSyncDurationMs = samples.reduce((max, sample) => Math.max(max, Number(sample.syncDurationMs) || 0), 0);
    const minTerrainMeshCount = samples.reduce((min, sample) => Math.min(min, Number(sample.terrainMeshCount) || Infinity), Infinity);
    const anyGrass = samples.some((sample) => Number(sample.modeCounts?.grass || 0) > 0);
    const allCenterTilesLoaded = samples.every((sample) => sample.activeCenterLoaded === true);

    if (!(minTerrainMeshCount >= 9)) {
      throw new Error(`terrain mesh count dropped too low during seam probe: ${minTerrainMeshCount}`);
    }
    if (!(maxSyncDurationMs < 220)) {
      throw new Error(`terrain sync spike too high during seam probe: ${maxSyncDurationMs.toFixed(2)}ms`);
    }
    if (!anyGrass) {
      throw new Error('terrain seam probe never produced any grass-classified terrain tiles');
    }
    if (!allCenterTilesLoaded) {
      throw new Error('center terrain tile failed to finish loading during seam probe');
    }

    await page.screenshot({ path: path.join(outputDir, 'runtime.png') });

    const report = {
      ok: true,
      bootstrap,
      seamPath,
      maxSyncDurationMs,
      minTerrainMeshCount,
      anyGrass,
      allCenterTilesLoaded,
      samples,
      errors
    };
    await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
  } finally {
    await context.close();
    await browser.close();
    await serverHandle.close();
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch(async (error) => {
    await mkdirp(outputDir);
    await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify({
      ok: false,
      error: String(error?.message || error)
    }, null, 2));
    console.error(error);
    process.exit(1);
  });
