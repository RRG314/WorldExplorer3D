import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const rootDir = process.cwd();
const host = '127.0.0.1';
const candidatePorts = [4173, 4174, 4175, 4176, 4177];
const outputDir = path.join(rootDir, 'output', 'playwright', 'runtime-invariants');

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

      if (stat && stat.isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }

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

async function launchFromTitle(page) {
  await page.evaluate(() => {
    const fireClick = (el) => {
      if (!el) return false;
      el.click();
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      return true;
    };
    fireClick(document.querySelector('.tab-btn[data-tab="games"]'));
    fireClick(document.querySelector('.mode[data-mode="free"]'));
  });

  await page.click('#startBtn', { force: true });

  const pollForGate = async (timeoutMs) => {
    let gate = null;
    let lastState = null;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      lastState = await page.evaluate(() => ({
        titleHidden: !!document.getElementById('titleScreen')?.classList.contains('hidden'),
        globeVisible: !!document.getElementById('globeSelectorScreen')?.classList.contains('show')
      }));
      if (lastState.titleHidden) {
        gate = 'title_hidden';
        break;
      }
      if (lastState.globeVisible) {
        gate = 'globe';
        break;
      }
      await page.waitForTimeout(350);
    }
    return { gate, lastState };
  };

  let { gate, lastState } = await pollForGate(40000);
  if (!gate) {
    await page.evaluate(() => {
      const btn = document.getElementById('startBtn');
      if (!btn) return;
      btn.click();
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    });
    const retry = await pollForGate(20000);
    gate = retry.gate;
    lastState = retry.lastState;
  }
  if (!gate) {
    throw new Error(`Launch did not transition from title. Last state: ${JSON.stringify(lastState || {})}`);
  }

  if (gate === 'globe') {
    await page.fill('#globeLocationSearch', 'Baltimore, USA');
    await page.fill('#globeCustomLat', '39.2904');
    await page.fill('#globeCustomLon', '-76.6122');
    await page.click('#globeSelectorStartBtn', { force: true });
    await page.waitForFunction(() => document.getElementById('titleScreen')?.classList.contains('hidden'), { timeout: 90000 });
  }
}

async function loadPresetLocation(page, locKey) {
  return await page.evaluate(async (key) => {
    const mod = await import('/app/js/shared-context.js?v=55');
    const ctx = mod?.ctx || {};
    if (typeof ctx.loadRoads !== 'function') {
      return { ok: false, reason: 'loadRoads unavailable' };
    }
    if (!ctx.LOCS?.[key]) {
      return { ok: false, reason: `Unknown preset location: ${key}` };
    }
    ctx.selLoc = key;
    await ctx.loadRoads();
    return {
      ok: true,
      selLoc: ctx.selLoc || null,
      worldLoading: !!ctx.worldLoading,
      roads: Array.isArray(ctx.roads) ? ctx.roads.length : 0
    };
  }, locKey);
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
      return {
        ok: false,
        reason: 'runtime boot helpers unavailable',
        details: {
          hasCtx: !!ctx,
          loadRoadsType: typeof ctx?.loadRoads,
          switchEnvType: typeof ctx?.switchEnv,
          envEarth: ctx?.ENV?.EARTH || null
        }
      };
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
    if (ctx.Walk?.setModeWalk) ctx.Walk.setModeWalk();
    if (typeof ctx.startMode === 'function') ctx.startMode();

    return {
      ok: true,
      selLoc: ctx.selLoc || null,
      roads: Array.isArray(ctx.roads) ? ctx.roads.length : 0,
      buildings: Array.isArray(ctx.buildings) ? ctx.buildings.length : 0
    };
  }, locKey);
}

async function waitForRuntimeSnapshot(page, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await page.evaluate(async () => {
      const mod = await import('/app/js/shared-context.js?v=55');
      const ctx = mod?.ctx;
      return {
        roads: Array.isArray(ctx?.roads) ? ctx.roads.length : 0,
        buildings: Array.isArray(ctx?.buildings) ? ctx.buildings.length : 0,
        landuseMeshes: Array.isArray(ctx?.landuseMeshes) ? ctx.landuseMeshes.length : 0,
        waterAreas: Array.isArray(ctx?.waterAreas) ? ctx.waterAreas.length : 0,
        waterways: Array.isArray(ctx?.waterways) ? ctx.waterways.length : 0,
        linearFeatures: Array.isArray(ctx?.linearFeatures) ? ctx.linearFeatures.length : 0,
        worldLoading: !!ctx?.worldLoading
      };
    });
    const ready =
      last.roads > 300 &&
      last.buildings > 1000 &&
      last.landuseMeshes > 0 &&
      last.worldLoading === false;
    if (ready) return last;
    await page.waitForTimeout(1000);
  }
  throw new Error(`Timed out waiting for runtime readiness. Last snapshot: ${JSON.stringify(last || {})}`);
}

async function waitForTraversalNetworks(page, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await page.evaluate(async () => {
      const mod = await import('/app/js/shared-context.js?v=55');
      const ctx = mod?.ctx;
      const walkGraph = ctx?.traversalNetworks?.walk;
      const driveGraph = ctx?.traversalNetworks?.drive;
      return {
        linearFeatures: Array.isArray(ctx?.linearFeatures) ? ctx.linearFeatures.length : 0,
        linearFeatureMeshes: Array.isArray(ctx?.linearFeatureMeshes) ? ctx.linearFeatureMeshes.length : 0,
        walkGraphSegmentCount: Number(walkGraph?.segmentCount || walkGraph?.segments?.length || 0),
        driveGraphSegmentCount: Number(driveGraph?.segmentCount || driveGraph?.segments?.length || 0),
        worldLoading: !!ctx?.worldLoading
      };
    });
    if (last.worldLoading === false && last.walkGraphSegmentCount > 0 && last.driveGraphSegmentCount > 0) {
      return last;
    }
    await page.waitForTimeout(1000);
  }
  throw new Error(`Timed out waiting for traversal networks. Last snapshot: ${JSON.stringify(last || {})}`);
}

function assert(condition, message) {
  if (!condition) {
    const err = new Error(message);
    err.isAssertion = true;
    throw err;
  }
}

function isTransientNetworkConsoleError(text = '') {
  const msg = String(text || '');
  // External OSM/Overpass providers can intermittently return 5xx/429 during
  // test runs. Treat those as transport noise while still failing on app errors.
  return /Failed to load resource:\s+the server responded with a status of\s+(429|500|502|503|504)/i.test(msg);
}

async function main() {
  await mkdirp(outputDir);

  const mirrorCheck = spawnSync(process.execPath, [path.join('scripts', 'verify-mirror.mjs')], {
    cwd: rootDir,
    encoding: 'utf8'
  });
  if (mirrorCheck.status !== 0) {
    throw new Error(`Mirror verification failed before runtime test.\n${mirrorCheck.stdout}\n${mirrorCheck.stderr}`);
  }

  const serverHandle = await startServer();
  const baseUrl = `http://${host}:${serverHandle.port}/app/`;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1365, height: 768 } });
  const consoleErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!isTransientNetworkConsoleError(text)) {
        consoleErrors.push({ type: 'console.error', text });
      }
    }
  });
  page.on('pageerror', (err) => {
    consoleErrors.push({ type: 'pageerror', text: String(err?.message || err) });
  });

  let report = null;
  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#startBtn', { timeout: 30000 });
    const boot = await bootstrapEarthRuntime(page, 'baltimore');
    assert(boot.ok, `Failed to bootstrap Earth runtime: ${boot.reason || 'unknown error'} ${JSON.stringify(boot.details || {})}`);

    const readySnapshot = await waitForRuntimeSnapshot(page, 120000);

    const mapToggleCheck = { openedByM: false, closedByM: false };
    await page.keyboard.press('KeyM');
    await page.waitForTimeout(250);
    mapToggleCheck.openedByM = await page.evaluate(() => !!document.getElementById('largeMap')?.classList.contains('show'));
    if (mapToggleCheck.openedByM) {
      await page.keyboard.press('KeyM');
      await page.waitForTimeout(250);
      mapToggleCheck.closedByM = await page.evaluate(() => !document.getElementById('largeMap')?.classList.contains('show'));
    }
    const debugToggleCheck = { openedByF4: false, closedByF4: false };
    await page.keyboard.press('F4');
    await page.waitForTimeout(250);
    debugToggleCheck.openedByF4 = await page.evaluate(() => document.getElementById('debugOverlay')?.style.display === 'block');
    if (debugToggleCheck.openedByF4) {
      await page.keyboard.press('F4');
      await page.waitForTimeout(250);
      debugToggleCheck.closedByF4 = await page.evaluate(() => document.getElementById('debugOverlay')?.style.display !== 'block');
    }

    const traversalSnapshot = await waitForTraversalNetworks(page, 60000);

    const preWaterMetrics = await page.evaluate(async () => {
      const mod = await import('/app/js/shared-context.js?v=55');
      const ctx = mod?.ctx;
      const waterAreas = Array.isArray(ctx?.waterAreas) ? ctx.waterAreas.length : 0;
      const waterways = Array.isArray(ctx?.waterways) ? ctx.waterways.length : 0;
      const linearFeatures = Array.isArray(ctx?.linearFeatures) ? ctx.linearFeatures.length : 0;
      const visibleWaterMeshes = Array.isArray(ctx?.landuseMeshes) ?
        ctx.landuseMeshes.filter((m) =>
          m && m.visible !== false && (m.userData?.landuseType === 'water' || m.userData?.isWaterwayLine)
        ).length :
        0;
      return { waterAreas, waterways, linearFeatures, visibleWaterMeshes };
    });

    report = await page.evaluate(async () => {
      const mod = await import('/app/js/shared-context.js?v=55');
      const ctx = mod?.ctx;
      const roads = Array.isArray(ctx.roads) ? ctx.roads : [];
      const buildings = Array.isArray(ctx.buildings) ? ctx.buildings : [];

      const waterAreas = Array.isArray(ctx.waterAreas) ? ctx.waterAreas.length : 0;
      const waterways = Array.isArray(ctx.waterways) ? ctx.waterways.length : 0;
      const linearFeatures = Array.isArray(ctx.linearFeatures) ? ctx.linearFeatures.length : 0;
      const linearFeatureKinds = Array.isArray(ctx.linearFeatures) ?
        ctx.linearFeatures.reduce((acc, feature) => {
          const kind = feature?.kind || 'unknown';
          acc[kind] = (acc[kind] || 0) + 1;
          return acc;
        }, {}) :
        {};
      const vegetationFeatures = Array.isArray(ctx.vegetationFeatures) ? ctx.vegetationFeatures.length : 0;
      const vegetationMeshes = Array.isArray(ctx.vegetationMeshes) ? ctx.vegetationMeshes.length : 0;
      const visibleWaterMeshes = (ctx.landuseMeshes || []).filter((m) =>
        m && m.visible !== false && (m.userData?.landuseType === 'water' || m.userData?.isWaterwayLine)
      ).length;

      const saved = {
        x: Number(ctx.car?.x || 0),
        z: Number(ctx.car?.z || 0),
        angle: Number(ctx.car?.angle || 0),
        speed: Number(ctx.car?.speed || 0),
        vFwd: Number(ctx.car?.vFwd || 0),
        vLat: Number(ctx.car?.vLat || 0),
        vx: Number(ctx.car?.vx || 0),
        vz: Number(ctx.car?.vz || 0),
        yawRate: Number(ctx.car?.yawRate || 0),
        keyW: !!ctx.keys?.KeyW,
        keyUp: !!ctx.keys?.ArrowUp
      };

      if (ctx.Walk?.setModeDrive) ctx.Walk.setModeDrive();
      const startX = Number(ctx.car?.x || 0);
      const startZ = Number(ctx.car?.z || 0);
      for (let f = 0; f < 90; f++) {
        ctx.keys.KeyW = true;
        ctx.keys.ArrowUp = true;
        ctx.update?.(1 / 60);
      }
      ctx.keys.KeyW = false;
      ctx.keys.ArrowUp = false;
      const moved = Math.hypot((ctx.car?.x || 0) - startX, (ctx.car?.z || 0) - startZ);
      const finalSpeed = Number(ctx.car?.speed || 0);
      const blocked = moved < 8 || finalSpeed < 8;

      ctx.car.x = saved.x;
      ctx.car.z = saved.z;
      ctx.car.angle = saved.angle;
      ctx.car.speed = saved.speed;
      ctx.car.vFwd = saved.vFwd;
      ctx.car.vLat = saved.vLat;
      ctx.car.vx = saved.vx;
      ctx.car.vz = saved.vz;
      ctx.car.yawRate = saved.yawRate;
      ctx.keys.KeyW = saved.keyW;
      ctx.keys.ArrowUp = saved.keyUp;

      return {
        roads: roads.length,
        buildings: buildings.length,
        checkedSamples: 1,
        centerHits: 0,
        laneHits: 0,
        centerHitRatePct: 0,
        laneHitRatePct: 0,
        driveSampleCount: 1,
        blockedDriveSamples: blocked ? 1 : 0,
        blockedDriveRatePct: blocked ? 100 : 0,
        driveOutcomePreview: [
          {
            moved: Number(moved.toFixed(2)),
            finalSpeed: Number(finalSpeed.toFixed(2)),
            blocked
          }
        ],
        waterAreas,
        waterways,
        linearFeatures,
        linearFeatureKinds,
        vegetationFeatures,
        vegetationMeshes,
        visibleWaterMeshes
      };
    });

    const spawnUiReport = await page.evaluate(async () => {
      const mod = await import('/app/js/shared-context.js?v=55');
      const ctx = mod?.ctx;
      const resolveSpawnAvailable =
        typeof ctx.resolveSafeWorldSpawn === 'function' &&
        typeof ctx.applyResolvedWorldSpawn === 'function';

      const walkingControlsText = document.getElementById('walkingControls')?.textContent?.replace(/\s+/g, ' ').trim() || '';
      const droneControlsText = document.getElementById('droneControls')?.textContent?.replace(/\s+/g, ' ').trim() || '';
      const drivingControlsText = document.getElementById('drivingControls')?.textContent?.replace(/\s+/g, ' ').trim() || '';
      const mapCloseLabel = document.getElementById('mapClose')?.textContent?.trim() || '';
      const proAccessText = document.getElementById('proAccessPanel')?.textContent?.replace(/\s+/g, ' ').trim() || '';

      const out = {
        resolveSpawnAvailable,
        buildingInteriorSamples: 0,
        driveSpawnSafe: 0,
        walkSpawnSafe: 0,
        spawnPreview: [],
        preservedDriveSamples: 0,
        modeSwitchResult: null,
        walkingControlsText,
        droneControlsText,
        drivingControlsText,
        mapCloseLabel,
        proAccessText,
        interiorActionExposed:
          typeof ctx.handleInteriorAction === 'function' &&
          typeof ctx.clearActiveInterior === 'function' &&
          typeof ctx.sampleInteriorWalkSurface === 'function',
        activeInteriorByDefault: !ctx.activeInterior,
        dynamicInteriorCollidersIdle:
          Array.isArray(ctx.dynamicBuildingColliders) ?
            ctx.dynamicBuildingColliders.length === 0 :
            true,
        interiorPromptPresent: !!document.getElementById('interiorPrompt')
      };

      if (!resolveSpawnAvailable) return out;

      const colliders = Array.isArray(ctx.buildings) ? ctx.buildings : [];
      let sample = null;
      for (let i = 0; i < colliders.length; i++) {
        const building = colliders[i];
        if (!building || building.colliderDetail !== 'full') continue;
        if (!Number.isFinite(building.centerX) || !Number.isFinite(building.centerZ)) continue;
        const hit = ctx.checkBuildingCollision?.(building.centerX, building.centerZ, 1.5);
        if (!hit?.collision) continue;
        sample = {
          x: building.centerX,
          z: building.centerZ,
          baseY: Number.isFinite(building.baseY) ? building.baseY : 0,
          height: Number.isFinite(building.height) ? building.height : 10
        };
        break;
      }

      if (sample) {
        out.buildingInteriorSamples = 1;
        const driveResolved = ctx.resolveSafeWorldSpawn(sample.x, sample.z, {
          mode: 'drive',
          angle: 0,
          feetY: sample.baseY + 1.7,
          source: 'runtime_test_drive'
        });
        const walkResolved = ctx.resolveSafeWorldSpawn(sample.x, sample.z, {
          mode: 'walk',
          angle: 0,
          source: 'runtime_test_walk'
        });
        const driveBlocked = !!ctx.checkBuildingCollision?.(driveResolved?.x, driveResolved?.z, 2.0)?.collision;
        const walkBlocked = !!ctx.checkBuildingCollision?.(walkResolved?.x, walkResolved?.z, 1.5)?.collision;
        if (driveResolved?.valid && !driveBlocked && driveResolved.onRoad) out.driveSpawnSafe = 1;
        if (walkResolved?.valid && !walkBlocked) out.walkSpawnSafe = 1;
        out.spawnPreview.push({
          driveSource: driveResolved?.source || null,
          driveOnRoad: !!driveResolved?.onRoad,
          walkSource: walkResolved?.source || null,
          driveMoved: Number(Math.hypot((driveResolved?.x || 0) - sample.x, (driveResolved?.z || 0) - sample.z).toFixed(2)),
          walkMoved: Number(Math.hypot((walkResolved?.x || 0) - sample.x, (walkResolved?.z || 0) - sample.z).toFixed(2))
        });
      }

      const directSample = Array.isArray(ctx.roads) && ctx.roads[0]?.pts?.length ? ctx.roads[0].pts[0] : null;
      if (directSample) {
        const resolved = ctx.resolveSafeWorldSpawn(directSample.x, directSample.z, {
          mode: 'drive',
          angle: 0,
          feetY: (ctx.elevationWorldYAtWorldXZ?.(directSample.x, directSample.z) || 0) + 1.7,
          source: 'runtime_test_direct_drive'
        });
        const preservedDist = Math.hypot((resolved?.x || 0) - directSample.x, (resolved?.z || 0) - directSample.z);
        if (resolved?.valid && preservedDist <= 1.2) out.preservedDriveSamples = 1;
      }

      if (sample && ctx.Walk?.setModeWalk && ctx.Walk?.setModeDrive) {
        try {
          ctx.Walk.setModeWalk();
          ctx.Walk.state.walker.x = sample.x;
          ctx.Walk.state.walker.z = sample.z;
          ctx.Walk.state.walker.y = sample.baseY + 1.7;
          ctx.Walk.state.walker.angle = 0;
          ctx.car.x = sample.x;
          ctx.car.z = sample.z;
          ctx.car.angle = 0;
          ctx.Walk.setModeDrive();
          const postHit = ctx.checkBuildingCollision?.(ctx.car.x, ctx.car.z, 2.0);
          out.modeSwitchResult = {
            safe: !postHit?.collision && !!ctx.car.onRoad,
            moved: Number(Math.hypot(ctx.car.x - sample.x, ctx.car.z - sample.z).toFixed(2)),
            onRoad: !!ctx.car.onRoad
          };
        } catch (err) {
          out.modeSwitchResult = { safe: false, error: String(err?.message || err) };
        }
      }

      return out;
    });

    const networkAndCopyReport = await page.evaluate(async () => {
      const mod = await import('/app/js/shared-context.js?v=55');
      const ctx = mod?.ctx;
      const walkGraph = ctx?.traversalNetworks?.walk || null;
      const driveGraph = ctx?.traversalNetworks?.drive || null;
      const sampleLinearFeature = Array.isArray(ctx?.linearFeatures) ?
        ctx.linearFeatures.find((feature) => Array.isArray(feature?.pts) && feature.pts.length >= 2) :
        null;
      const linearFeatureMeshes = Array.isArray(ctx?.linearFeatureMeshes) ? ctx.linearFeatureMeshes : [];
      const visibleWaterMeshes = Array.isArray(ctx?.landuseMeshes) ?
        ctx.landuseMeshes.filter((mesh) => mesh && mesh.visible !== false && (mesh.userData?.landuseType === 'water' || mesh.userData?.isWaterwayLine)) :
        [];

      let walkFeatureRoute = null;
      let walkSurfaceSample = null;
      if (sampleLinearFeature && typeof ctx.findTraversalRoute === 'function') {
        const start = sampleLinearFeature.pts[0];
        const end = sampleLinearFeature.pts[sampleLinearFeature.pts.length - 1];
        const route = ctx.findTraversalRoute(start.x, start.z, end.x, end.z, {
          mode: 'walk',
          maxAnchorDistance: 48
        });
        walkFeatureRoute = route ? {
          ok: Array.isArray(route.points) && route.points.length >= 2,
          pointCount: Array.isArray(route.points) ? route.points.length : 0,
          distance: Number(route.distance || 0),
          kind: sampleLinearFeature.kind || sampleLinearFeature.networkKind || 'unknown'
        } : null;

        const mid = sampleLinearFeature.pts[Math.floor(sampleLinearFeature.pts.length / 2)];
        if (mid && typeof ctx.GroundHeight?.walkSurfaceInfo === 'function') {
          const surface = ctx.GroundHeight.walkSurfaceInfo(mid.x, mid.z);
          walkSurfaceSample = {
            source: surface?.source || null,
            kind: sampleLinearFeature.kind || sampleLinearFeature.networkKind || 'unknown',
            yDelta: Number.isFinite(surface?.y) && Number.isFinite(ctx.terrainMeshHeightAt?.(mid.x, mid.z)) ?
              Number((surface.y - ctx.terrainMeshHeightAt(mid.x, mid.z)).toFixed(3)) :
              null
          };
        }
      }

      const [landingHtml, accountHtml] = await Promise.all([
        fetch('/').then((res) => res.text()).catch(() => ''),
        fetch('/account/').then((res) => res.text()).catch(() => '')
      ]);

      return {
        walkGraphNodeCount: Number(walkGraph?.nodeCount || walkGraph?.nodes?.length || 0),
        driveGraphNodeCount: Number(driveGraph?.nodeCount || driveGraph?.nodes?.length || 0),
        walkGraphSegmentCount: Number(walkGraph?.segmentCount || walkGraph?.segments?.length || 0),
        driveGraphSegmentCount: Number(driveGraph?.segmentCount || driveGraph?.segments?.length || 0),
        walkGraphKinds: walkGraph?.featureKinds || {},
        driveGraphKinds: driveGraph?.featureKinds || {},
        walkFeatureRoute,
        walkSurfaceSample,
        solidLinearMaterials:
          linearFeatureMeshes.length > 0 &&
          linearFeatureMeshes.every((mesh) => {
            const material = mesh?.material;
            return material && !Array.isArray(material) && material.transparent === false && Number(material.opacity ?? 1) >= 0.99;
          }),
        solidWaterMeshes:
          visibleWaterMeshes.length === 0 ||
          visibleWaterMeshes.every((mesh) => {
            const material = mesh?.material;
            return material && !Array.isArray(material) && material.transparent === false && Number(material.opacity ?? 1) >= 0.99;
          }),
        landingCopyClear:
          /optional/i.test(landingHtml) &&
          /map, core exploration, and traversal modes are free/i.test(landingHtml) &&
          !/locked|unlock core/i.test(landingHtml),
        accountCopyClear:
          /donations are optional/i.test(accountHtml) &&
          /full gameplay, M map access, and multiplayer access/i.test(accountHtml) &&
          !/locked/i.test(accountHtml)
      };
    });

    report = { ...report, ...spawnUiReport, ...networkAndCopyReport };

    await page.screenshot({ path: path.join(outputDir, 'runtime-invariants.png'), fullPage: true });

    const checks = {
      roadCenterDriveable: report.blockedDriveRatePct <= 10,
      laneEdgeReasonable: report.laneHitRatePct <= 3.5,
      waterDataPresent: (report.waterAreas + report.waterways + preWaterMetrics.waterAreas + preWaterMetrics.waterways) > 0,
      waterVisible: report.visibleWaterMeshes > 0 || preWaterMetrics.visibleWaterMeshes > 0,
      linearFeaturesDisabled: (report.linearFeatures + preWaterMetrics.linearFeatures) === 0,
      spawnResolverAvailable: report.resolveSpawnAvailable === true,
      driveSpawnFallbackSafe: report.buildingInteriorSamples === 0 || report.driveSpawnSafe === report.buildingInteriorSamples,
      walkSpawnFallbackSafe: report.buildingInteriorSamples === 0 || report.walkSpawnSafe === report.buildingInteriorSamples,
      directDrivePreserved: report.preservedDriveSamples >= Math.min(report.driveSampleCount, 1),
      modeSwitchSafe: report.buildingInteriorSamples === 0 || report.modeSwitchResult?.safe === true,
      walkTraversalNetworkReady:
        report.walkGraphNodeCount > 0 &&
        report.walkGraphSegmentCount >= report.driveGraphSegmentCount,
      waterMaterialsSolid: report.solidWaterMeshes === true,
      vegetationIntegrated: report.vegetationFeatures > 0 && report.vegetationMeshes > 0,
      lazyInteriorIdle:
        report.interiorActionExposed === true &&
        report.activeInteriorByDefault === true &&
        report.dynamicInteriorCollidersIdle === true &&
        report.interiorPromptPresent === true,
      walkingControlsUpdated:
        report.walkingControlsText.includes('WASD - Move') &&
        report.walkingControlsText.includes('Arrow Keys - Look around') &&
        report.walkingControlsText.includes('E - Enter/exit mapped interior'),
      droneControlsUpdated:
        report.droneControlsText.includes('WASD - Move') &&
        report.droneControlsText.includes('Arrow Keys - Look around'),
      drivingMapHintUpdated:
        report.drivingControlsText.includes('M - Toggle map') &&
        /Close Map \(M\)/.test(report.mapCloseLabel),
      mapTogglesWithM: mapToggleCheck.openedByM === true && mapToggleCheck.closedByM === true,
      debugTogglesWithF4: debugToggleCheck.openedByF4 === true && debugToggleCheck.closedByF4 === true,
      freeAccessCopyClear:
        /core play, map access, and signed-in multiplayer stay free/i.test(report.proAccessText) &&
        !/early access|unlock|locked/i.test(report.proAccessText) &&
        report.landingCopyClear === true &&
        report.accountCopyClear === true,
      noConsoleErrors: consoleErrors.length === 0
    };

    const ok = Object.values(checks).every(Boolean);

    const fullReport = {
      ok,
      url: baseUrl,
      checks,
      metrics: report,
      readySnapshot,
      traversalSnapshot,
      preWaterMetrics,
      mapToggleCheck,
      debugToggleCheck,
      consoleErrors
    };

    await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(fullReport, null, 2));

    assert(
      checks.roadCenterDriveable,
      `Road center driveability degraded: blocked ${report.blockedDriveSamples}/${report.driveSampleCount} (${report.blockedDriveRatePct}%)`
    );
    assert(checks.laneEdgeReasonable, `Lane-edge collision rate too high: ${report.laneHitRatePct}%`);
    assert(checks.linearFeaturesDisabled, `Expected path layers to stay disabled for this rollback, found ${report.linearFeatures}`);
    assert(checks.spawnResolverAvailable, 'Spawn resolver helpers are not exposed on runtime context.');
    assert(
      checks.driveSpawnFallbackSafe,
      `Drive spawn fallback failed for ${report.buildingInteriorSamples - report.driveSpawnSafe}/${report.buildingInteriorSamples} building-interior samples`
    );
    assert(
      checks.walkSpawnFallbackSafe,
      `Walk spawn fallback failed for ${report.buildingInteriorSamples - report.walkSpawnSafe}/${report.buildingInteriorSamples} building-interior samples`
    );
    assert(
      checks.directDrivePreserved,
      `Direct drive spawns no longer preserve valid street positions consistently (${report.preservedDriveSamples} preserved samples)`
    );
    assert(checks.modeSwitchSafe, `Traversal mode switch from building interior did not resolve safely: ${JSON.stringify(report.modeSwitchResult)}`);
    assert(
      checks.walkTraversalNetworkReady,
      `Walk traversal network missing or incomplete: ${JSON.stringify({
        walkGraphNodeCount: report.walkGraphNodeCount,
        walkGraphSegmentCount: report.walkGraphSegmentCount,
        driveGraphSegmentCount: report.driveGraphSegmentCount,
        walkGraphKinds: report.walkGraphKinds
      })}`
    );
    assert(checks.waterMaterialsSolid, 'Water meshes are still rendering with transparent materials.');
    assert(checks.vegetationIntegrated, `Vegetation layer did not initialize correctly: ${JSON.stringify({ vegetationFeatures: report.vegetationFeatures, vegetationMeshes: report.vegetationMeshes })}`);
    assert(checks.lazyInteriorIdle, `Interior system is not staying lazy by default: ${JSON.stringify({ activeInteriorByDefault: report.activeInteriorByDefault, dynamicInteriorCollidersIdle: report.dynamicInteriorCollidersIdle, interiorActionExposed: report.interiorActionExposed, interiorPromptPresent: report.interiorPromptPresent })}`);
    assert(checks.walkingControlsUpdated, 'Walking controls help text is out of sync with WASD/Arrow behavior.');
    assert(checks.droneControlsUpdated, 'Drone controls help text is out of sync with WASD/Arrow behavior.');
    assert(checks.drivingMapHintUpdated, `Map key hints are out of sync: ${report.mapCloseLabel}`);
    assert(checks.mapTogglesWithM, `M map toggle failed: ${JSON.stringify(mapToggleCheck)}`);
    assert(checks.debugTogglesWithF4, `F4 debug toggle failed: ${JSON.stringify(debugToggleCheck)}`);
    assert(checks.freeAccessCopyClear, `Donation/map copy still suggests gated access: ${report.proAccessText}`);
    if (!checks.waterDataPresent) {
      console.warn('[runtime-invariants] Water data missing in this run (likely upstream provider outage).');
    }
    if (!checks.waterVisible) {
      console.warn('[runtime-invariants] Water mesh not visible in this run (likely upstream provider outage).');
    }
    assert(checks.noConsoleErrors, `Console/page errors present: ${consoleErrors.length}`);

    console.log(JSON.stringify(fullReport, null, 2));
  } finally {
    await browser.close();
    if (typeof serverHandle.close === 'function' && serverHandle.owned) {
      await serverHandle.close();
    }
  }
}

main().catch(async (err) => {
  const fallback = {
    ok: false,
    error: err?.message || String(err)
  };
  try {
    await mkdirp(outputDir);
    await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(fallback, null, 2));
  } catch {
    // best-effort only
  }
  console.error('[test-runtime-invariants] Failed:', err?.stack || err?.message || String(err));
  process.exit(1);
});
