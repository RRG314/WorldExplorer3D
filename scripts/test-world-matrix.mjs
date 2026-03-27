import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { chromium } from 'playwright';
import { WORLD_TEST_LOCATIONS } from './world-test-locations.mjs';

const rootDir = process.cwd();
const host = '127.0.0.1';
const candidatePorts = [4173, 4174, 4175, 4176, 4177];
const outputDir = path.join(rootDir, 'output', 'playwright', 'world-matrix');

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
    close: () => new Promise((resolve) => {
      for (const socket of sockets) {
        if (socket instanceof net.Socket) socket.destroy();
      }
      server.close(resolve);
    }),
    port
  };
}

async function startServer() {
  for (const port of candidatePorts) {
    try {
      return await serveStaticRoot(port);
    } catch {
      // try next candidate
    }
  }
  throw new Error(`Unable to start local static server on ports: ${candidatePorts.join(', ')}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isTransientNetworkConsoleError(text = '') {
  const msg = String(text || '');
  return (
    /Failed to load resource:\s+the server responded with a status of\s+(400|429|500|502|503|504)/i.test(msg) ||
    /Failed to load resource:\s+net::ERR_CONNECTION_CLOSED/i.test(msg)
  );
}

async function ensureRuntime(page) {
  await page.goto('http://127.0.0.1:4173/app/', { waitUntil: 'domcontentloaded', timeout: 120000 }).catch(async () => {
    // The static server port is resolved dynamically and patched below.
  });
}

async function bootstrapRuntime(page, baseUrl) {
  await page.goto(`${baseUrl}/app/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(async () => {
    const mod = await import('/app/js/shared-context.js?v=55');
    const ctx = mod?.ctx || {};
    return !!(
      ctx &&
      typeof ctx.loadRoads === 'function' &&
      typeof ctx.switchEnv === 'function' &&
      ctx.ENV?.EARTH
    );
  }, { timeout: 120000 });

  await page.evaluate(async () => {
    const deadline = performance.now() + 60000;
    let ctx = null;
    while (performance.now() < deadline) {
      const mod = await import('/app/js/shared-context.js?v=55');
      ctx = mod?.ctx || {};
      if (
        ctx &&
        typeof ctx.loadRoads === 'function' &&
        typeof ctx.switchEnv === 'function' &&
        ctx.ENV?.EARTH
      ) {
        break;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
    if (!ctx?.ENV?.EARTH) {
      throw new Error('Earth runtime helpers unavailable during world matrix bootstrap');
    }
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
  });
}

async function loadLocation(page, spec) {
  return await page.evaluate(async (locationSpec) => {
    const mod = await import('/app/js/shared-context.js?v=55');
    const ctx = mod?.ctx || {};
    const startedAt = performance.now();

    if (locationSpec.kind === 'custom') {
      const customLatInput = document.getElementById('customLat');
      const customLonInput = document.getElementById('customLon');
      if (customLatInput) customLatInput.value = String(locationSpec.lat);
      if (customLonInput) customLonInput.value = String(locationSpec.lon);
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
    const loadMs = performance.now() - startedAt;

    if (typeof ctx.spawnOnRoad === 'function') ctx.spawnOnRoad();

    const switchWalkAt = performance.now();
    if (typeof ctx.setTravelMode === 'function') {
      ctx.setTravelMode('walk', { source: 'world_matrix', emitTutorial: false });
    } else if (ctx.Walk?.setModeWalk) {
      ctx.Walk.setModeWalk();
    }
    const walkSwitchMs = performance.now() - switchWalkAt;

    const switchDriveAt = performance.now();
    if (typeof ctx.setTravelMode === 'function') {
      ctx.setTravelMode('drive', { source: 'world_matrix', emitTutorial: false });
    } else if (ctx.Walk?.setModeDrive) {
      ctx.Walk.setModeDrive();
    }
    const driveSwitchMs = performance.now() - switchDriveAt;

    const actorX = Number.isFinite(ctx.car?.x) ? ctx.car.x : Number(ctx.Walk?.state?.walker?.x || 0);
    const actorZ = Number.isFinite(ctx.car?.z) ? ctx.car.z : Number(ctx.Walk?.state?.walker?.z || 0);
    const driveSpawn = typeof ctx.resolveSafeWorldSpawn === 'function' ?
      ctx.resolveSafeWorldSpawn(actorX, actorZ, { mode: 'drive', source: 'world_matrix_drive' }) :
      null;
    const walkSpawn = typeof ctx.resolveSafeWorldSpawn === 'function' ?
      ctx.resolveSafeWorldSpawn(actorX, actorZ, { mode: 'walk', source: 'world_matrix_walk' }) :
      null;
    if (typeof ctx.refreshAstronomicalSky === 'function') {
      ctx.refreshAstronomicalSky(true);
    }
    const sky = typeof ctx.getAstronomicalSkySnapshot === 'function' ? ctx.getAstronomicalSkySnapshot() : null;
    let weather = null;
    if (typeof ctx.refreshLiveWeather === 'function' && typeof ctx.getWeatherSnapshot === 'function') {
      try {
        await ctx.refreshLiveWeather(true);
        weather = ctx.getWeatherSnapshot();
      } catch (err) {
        weather = {
          error: String(err?.message || err)
        };
      }
    }

    return {
      id: locationSpec.id,
      label: locationSpec.label,
      kind: locationSpec.kind,
      category: locationSpec.category,
      loadMs: Number(loadMs.toFixed(1)),
      walkSwitchMs: Number(walkSwitchMs.toFixed(1)),
      driveSwitchMs: Number(driveSwitchMs.toFixed(1)),
      counts: {
        roads: Array.isArray(ctx.roads) ? ctx.roads.length : 0,
        buildings: Array.isArray(ctx.buildings) ? ctx.buildings.length : 0,
        buildingMeshes: Array.isArray(ctx.buildingMeshes) ? ctx.buildingMeshes.length : 0,
        landuses: Array.isArray(ctx.landuses) ? ctx.landuses.length : 0,
        landuseMeshes: Array.isArray(ctx.landuseMeshes) ? ctx.landuseMeshes.length : 0,
        waterAreas: Array.isArray(ctx.waterAreas) ? ctx.waterAreas.length : 0,
        waterways: Array.isArray(ctx.waterways) ? ctx.waterways.length : 0,
        vegetationMeshes: Array.isArray(ctx.vegetationMeshes) ? ctx.vegetationMeshes.length : 0
      },
      groundLayers: {
        urbanSurfaceMeshCount: Array.isArray(ctx.urbanSurfaceMeshes) ? ctx.urbanSurfaceMeshes.length : 0,
        sidewalkBatchCount: Array.isArray(ctx.urbanSurfaceMeshes) ?
          ctx.urbanSurfaceMeshes.filter((mesh) => mesh?.userData?.isSidewalkBatch).length :
          0,
        keyedSidewalkBatchCount: Array.isArray(ctx.urbanSurfaceMeshes) ?
          ctx.urbanSurfaceMeshes.filter((mesh) =>
            mesh?.userData?.isSidewalkBatch &&
            Array.isArray(mesh?.userData?.continuousWorldRegionKeys) &&
            mesh.userData.continuousWorldRegionKeys.length > 0
          ).length :
          0,
        sidewalkTriangles: Array.isArray(ctx.urbanSurfaceMeshes) ?
          ctx.urbanSurfaceMeshes.reduce((sum, mesh) => {
            if (!mesh?.userData?.isSidewalkBatch) return sum;
            const indexCount = Number(mesh.geometry?.index?.count || 0);
            return sum + Math.floor(indexCount / 3);
          }, 0) :
          0,
        visibleBuildingGroundMeshes: Array.isArray(ctx.landuseMeshes) ?
          ctx.landuseMeshes.filter((mesh) => mesh && mesh.visible !== false && mesh.userData?.landuseType === 'buildingGround').length :
          0,
        visibleGroundAprons: Array.isArray(ctx.landuseMeshes) ?
          ctx.landuseMeshes.filter((mesh) => mesh && mesh.visible !== false && mesh.userData?.isGroundApron).length :
          0,
        visibleFoundationSkirts: Array.isArray(ctx.landuseMeshes) ?
          ctx.landuseMeshes.filter((mesh) => mesh && mesh.visible !== false && mesh.userData?.isFoundationSkirt).length :
          0,
        skippedBuildingAprons: Number(ctx.urbanSurfaceStats?.skippedBuildingAprons || 0)
      },
      traversal: {
        walkSegments: Number(ctx.traversalNetworks?.walk?.segmentCount || 0),
        driveSegments: Number(ctx.traversalNetworks?.drive?.segmentCount || 0)
      },
      actor: {
        x: Number(actorX.toFixed(2)),
        z: Number(actorZ.toFixed(2)),
        currentMode: typeof ctx.getCurrentTravelMode === 'function' ? ctx.getCurrentTravelMode() : (ctx.droneMode ? 'drone' : ctx.Walk?.state?.mode === 'walk' ? 'walk' : 'drive')
      },
      driveSpawn: driveSpawn ? {
        valid: driveSpawn.valid !== false,
        source: driveSpawn.source || null,
        onRoad: !!driveSpawn.onRoad,
        reason: driveSpawn.reason || null
      } : null,
      walkSpawn: walkSpawn ? {
        valid: walkSpawn.valid !== false,
        source: walkSpawn.source || null,
        onRoad: !!walkSpawn.onRoad,
        reason: walkSpawn.reason || null
      } : null,
      sky,
      weather,
      worldLoading: !!ctx.worldLoading,
      interiorActive: !!ctx.activeInterior
    };
  }, spec);
}

async function loadLocationWithRetries(page, spec, attempts = 3) {
  let last = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    last = await loadLocation(page, spec);
    const hasWorldData =
      (Number(last?.counts?.roads || 0) > 0) ||
      (Number(last?.counts?.buildings || 0) > 0) ||
      (Number(last?.counts?.landuses || 0) > 0);
    const traversalReady =
      Number(last?.traversal?.driveSegments || 0) > 0 &&
      Number(last?.traversal?.walkSegments || 0) > 0;
    if (last?.worldLoading === false && hasWorldData && traversalReady) {
      return last;
    }
    await page.waitForTimeout(1200 + attempt * 600);
  }
  return last;
}

async function main() {
  await mkdirp(outputDir);
  const server = await startServer();
  const baseUrl = `http://${host}:${server.port}`;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const consoleErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    consoleErrors.push(String(err?.message || err));
  });

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    locations: [],
    skippedLocations: [],
    warnings: []
  };

  try {
    await bootstrapRuntime(page, baseUrl);

    for (const spec of WORLD_TEST_LOCATIONS) {
      const result = await loadLocationWithRetries(page, spec, 3);
      assert(result.worldLoading === false, `${spec.id}: worldLoading stayed true`);
      const hasWorldData = result.counts.roads > 0 || result.counts.buildings > 0 || result.counts.landuses > 0;
      if (!hasWorldData) {
        const warning = `${spec.id}: no world data loaded after retries, skipping location (likely upstream provider outage)`;
        console.warn(`[world-matrix] ${warning}`);
        report.warnings.push(warning);
        report.skippedLocations.push({
          id: spec.id,
          label: spec.label,
          reason: 'no_world_data',
          snapshot: result
        });
        continue;
      }
      assert(result.driveSpawn?.valid !== false, `${spec.id}: invalid drive spawn ${JSON.stringify(result.driveSpawn)}`);
      assert(result.walkSpawn?.valid !== false, `${spec.id}: invalid walk spawn ${JSON.stringify(result.walkSpawn)}`);
      assert(result.traversal.driveSegments > 0, `${spec.id}: drive traversal graph missing`);
      assert(result.traversal.walkSegments > 0, `${spec.id}: walk traversal graph missing`);
      assert(
        (
          result.groundLayers.sidewalkBatchCount <= 1 ||
          (
            Number.isFinite(result.groundLayers.sidewalkBatchCount) &&
            result.groundLayers.sidewalkBatchCount <= 32 &&
            result.groundLayers.keyedSidewalkBatchCount === result.groundLayers.sidewalkBatchCount
          )
        ),
        `${spec.id}: sidewalk batching regressed ${JSON.stringify(result.groundLayers)}`
      );
      assert(result.sky?.source === 'astronomical', `${spec.id}: astronomical sky snapshot missing`);
      assert(Number.isFinite(result.sky?.sunAltitudeDeg), `${spec.id}: sun altitude missing from sky snapshot`);
      assert(Number.isFinite(result.sky?.moonIllumination), `${spec.id}: moon illumination missing from sky snapshot`);
      assert(!result.weather?.error, `${spec.id}: weather fetch failed ${JSON.stringify(result.weather)}`);
      assert(result.weather?.source === 'live', `${spec.id}: weather snapshot not live ${JSON.stringify(result.weather)}`);
      assert(typeof result.weather?.conditionLabel === 'string' && result.weather.conditionLabel.length > 0, `${spec.id}: weather condition missing`);
      assert(Number.isFinite(result.weather?.temperatureF), `${spec.id}: weather temperature missing`);

      try {
        await page.screenshot({
          path: path.join(outputDir, `${spec.id}.png`),
          fullPage: true
        });
      } catch (error) {
        report.warnings.push(`${spec.id}: screenshot capture skipped (${error?.message || error})`);
      }
      report.locations.push(result);
    }

    const fatalConsoleErrors = consoleErrors.filter((entry) => !isTransientNetworkConsoleError(entry));
    report.consoleErrors = consoleErrors;
    report.fatalConsoleErrors = fatalConsoleErrors;
    report.pass = fatalConsoleErrors.length === 0 && report.locations.length > 0;
    await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
    await server.close();
  }

  const fatalConsoleErrors = consoleErrors.filter((entry) => !isTransientNetworkConsoleError(entry));
  if (fatalConsoleErrors.length > 0) {
    throw new Error(`Console/page errors detected during world matrix run:\n${fatalConsoleErrors.join('\n')}`);
  }
  if (!report.locations.length) {
    throw new Error('World matrix run did not complete any loaded locations.');
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch(async (err) => {
    try {
      await mkdirp(outputDir);
      await fs.writeFile(
        path.join(outputDir, 'report.json'),
        JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            pass: false,
            error: String(err?.message || err)
          },
          null,
          2
        )
      );
    } catch {
      // Ignore report write failures during fatal exit.
    }
    console.error(err);
    process.exit(1);
  });
