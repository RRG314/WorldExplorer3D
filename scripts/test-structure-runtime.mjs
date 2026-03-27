import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { chromium } from 'playwright';

const rootDir = process.cwd();
const host = '127.0.0.1';
const candidatePorts = [4173, 4174, 4175, 4176, 4177];
const outputDir = path.join(rootDir, 'output', 'playwright', 'structure-runtime');

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
    port,
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
      return await serveStaticRoot(port);
    } catch {
      // try next port
    }
  }
  throw new Error(`Unable to start local static server on ports: ${candidatePorts.join(', ')}`);
}

async function bootstrapRuntime(page, baseUrl) {
  await page.goto(`${baseUrl}/app/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(async () => {
    const mod = await import('/app/js/shared-context.js?v=55');
    const ctx = mod?.ctx || {};
    return !!(ctx?.loadRoads && ctx?.switchEnv && ctx?.ENV?.EARTH);
  }, { timeout: 120000 });
}

async function loadLocation(page, spec) {
  return await page.evaluate(async (locationSpec) => {
    const mod = await import('/app/js/shared-context.js?v=55');
    const ctx = mod?.ctx || {};
    const deadline = performance.now() + 60000;
    while (performance.now() < deadline && !ctx?.ENV?.EARTH) {
      await new Promise((resolve) => window.setTimeout(resolve, 200));
    }
    if (!ctx?.ENV?.EARTH || typeof ctx.loadRoads !== 'function' || typeof ctx.switchEnv !== 'function') {
      throw new Error('Earth runtime helpers unavailable while loading structure test location.');
    }
    ctx.gameMode = 'free';
    ctx.loadingScreenMode = 'earth';
    ctx.gameStarted = true;
    ctx.paused = false;
    ctx.switchEnv(ctx.ENV.EARTH);
    document.getElementById('titleScreen')?.classList.add('hidden');
    document.getElementById('globeSelectorScreen')?.classList.remove('show');

    if (locationSpec.kind === 'custom') {
      ctx.customLoc = {
        lat: Number(locationSpec.lat),
        lon: Number(locationSpec.lon),
        name: String(locationSpec.label || 'Custom Structure Test')
      };
      ctx.customLocTransient = false;
      ctx.selLoc = 'custom';
    } else {
      ctx.selLoc = String(locationSpec.key);
    }

    await ctx.loadRoads();
    if (typeof ctx.spawnOnRoad === 'function') ctx.spawnOnRoad();
    if (typeof ctx.setTravelMode === 'function') {
      ctx.setTravelMode('drive', { source: 'structure_runtime_test', emitTutorial: false });
    } else if (ctx.Walk?.setModeDrive) {
      ctx.Walk.setModeDrive();
    }

    const { sampleFeatureSurfaceY } = await import('/app/js/structure-semantics.js?v=5');

    function pointAtDistance(feature, distance) {
      if (!Array.isArray(feature?.pts) || feature.pts.length < 2) return null;
      let remaining = Math.max(0, Number(distance) || 0);
      for (let i = 0; i < feature.pts.length - 1; i++) {
        const p1 = feature.pts[i];
        const p2 = feature.pts[i + 1];
        const segLen = Math.hypot(p2.x - p1.x, p2.z - p1.z);
        if (segLen <= 1e-6) continue;
        if (remaining <= segLen) {
          const t = remaining / segLen;
          return {
            x: p1.x + (p2.x - p1.x) * t,
            z: p1.z + (p2.z - p1.z) * t
          };
        }
        remaining -= segLen;
      }
      return feature.pts[feature.pts.length - 1] || null;
    }

    function sampleFeature(feature) {
      if (!feature) return null;
      const station = Array.isArray(feature.structureStations) && feature.structureStations.length > 0 ?
        feature.structureStations[0] :
        null;
      const point = station ? pointAtDistance(feature, station.distance) : feature.pts?.[Math.floor((feature.pts?.length || 1) / 2)] || null;
      if (!point) return null;
      const surfaceY = sampleFeatureSurfaceY(feature, point.x, point.z);
      const terrainY = typeof ctx.baseTerrainHeightAt === 'function' ? ctx.baseTerrainHeightAt(point.x, point.z) : ctx.elevationWorldYAtWorldXZ(point.x, point.z);
      return {
        x: Number(point.x.toFixed(2)),
        z: Number(point.z.toFixed(2)),
        surfaceY: Number(surfaceY.toFixed(3)),
        terrainY: Number(terrainY.toFixed(3)),
        clearance: Number((surfaceY - terrainY).toFixed(3))
      };
    }

    const roads = Array.isArray(ctx.roads) ? ctx.roads : [];
    const linearFeatures = Array.isArray(ctx.linearFeatures) ? ctx.linearFeatures : [];
    const structureVisualSummary = Array.isArray(ctx.structureVisualMeshes) ?
      ctx.structureVisualMeshes.map((mesh) => ({
        type: mesh?.userData?.structureVisualType || 'unknown',
        count: Number(mesh?.count) || 0
      })) :
      [];
    const elevatedRoads = roads.filter((feature) => feature?.structureSemantics?.terrainMode === 'elevated');
    const subgradeRoads = roads.filter((feature) => feature?.structureSemantics?.terrainMode === 'subgrade');
    const structureConnectors = linearFeatures.filter((feature) => feature?.isStructureConnector === true);
    const elevatedSample = sampleFeature(elevatedRoads.find((feature) => Array.isArray(feature?.structureStations) && feature.structureStations.length > 0) || elevatedRoads[0] || null);
    const tunnelSample = sampleFeature(subgradeRoads.find((feature) => Array.isArray(feature?.structureStations) && feature.structureStations.length > 0) || subgradeRoads[0] || null);
    const connectorSample = sampleFeature(structureConnectors.find((feature) => feature?.structureSemantics?.terrainMode === 'elevated') || structureConnectors[0] || null);

    return {
      location: locationSpec.label || locationSpec.key,
      roads: roads.length,
      elevatedRoads: elevatedRoads.length,
      subgradeRoads: subgradeRoads.length,
      structureConnectors: structureConnectors.length,
      structureVisualSummary,
      elevatedSample,
      tunnelSample,
      connectorSample
    };
  }, spec);
}

async function main() {
  await mkdirp(outputDir);
  const server = await startServer();
  const baseUrl = `http://${host}:${server.port}`;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const consoleErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  const locations = [
    { kind: 'preset', key: 'baltimore', label: 'Baltimore' },
    { kind: 'custom', lat: 40.758, lon: -73.9855, label: 'Midtown Manhattan' },
    { kind: 'custom', lat: 41.8826, lon: -87.6376, label: 'Chicago Loop' }
  ];

  try {
    await bootstrapRuntime(page, baseUrl);
    const results = [];
    for (const location of locations) {
      results.push(await loadLocation(page, location));
    }

    const bestElevated = results.find((entry) => entry.elevatedRoads > 0 && (entry.elevatedSample?.clearance || 0) > 2.5) || null;
    const bestTunnel = results.find((entry) => entry.subgradeRoads > 0 && (entry.tunnelSample?.clearance || 0) < -1.5) || null;
    const connectorHit = results.find((entry) => entry.structureConnectors > 0) || null;
    const bestVisibleStructure = results.find((entry) => {
      const summary = Array.isArray(entry.structureVisualSummary) ? entry.structureVisualSummary : [];
      const decks = summary.find((item) => item.type === 'decks')?.count || 0;
      const supports = summary.find((item) => item.type === 'supports')?.count || 0;
      const girders = summary.find((item) => item.type === 'girders')?.count || 0;
      return decks > 0 && supports > 0 && girders > 0;
    }) || null;

    const report = {
      ok: !!bestElevated && !!bestTunnel && !!connectorHit && !!bestVisibleStructure,
      bestElevated,
      bestTunnel,
      connectorHit,
      bestVisibleStructure,
      results,
      consoleErrors
    };

    await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
    await page.screenshot({ path: path.join(outputDir, 'runtime.png'), fullPage: true });

    if (!bestElevated) throw new Error('No elevated road sample with meaningful deck clearance was found.');
    if (!bestTunnel) throw new Error('No subgrade road sample with meaningful tunnel clearance was found.');
    if (!connectorHit) throw new Error('No structure connector features were loaded.');
    if (!bestVisibleStructure) throw new Error('Visible elevated structure batches are missing decks, girders, or supports.');
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch(async (error) => {
  const report = {
    ok: false,
    error: String(error?.message || error)
  };
  await mkdirp(outputDir);
  await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
});
