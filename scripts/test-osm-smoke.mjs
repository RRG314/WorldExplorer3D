import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { chromium } from 'playwright';

const rootDir = process.cwd();
const host = '127.0.0.1';
const candidatePorts = [4173, 4174, 4175, 4176, 4177];
const outputDir = path.join(rootDir, 'output', 'playwright', 'osm-smoke');

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

function isTransientNetworkConsoleError(text = '') {
  const msg = String(text || '');
  return /Failed to load resource:\s+the server responded with a status of\s+(400|429|500|502|503|504)/i.test(msg);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function waitForUiReady(page) {
  await page.waitForFunction(async () => {
    const mod = await import('/app/js/shared-context.js?v=55');
    const ctx = mod?.ctx;
    return !!(
      ctx &&
      typeof ctx.setTitleLocationMode === 'function' &&
      typeof ctx.switchEnv === 'function'
    );
  }, { timeout: 90000 });
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
      roads: Array.isArray(ctx.roads) ? ctx.roads.length : 0
    };
  }, locKey);
}

async function resolveRuntimeState(page) {
  return await page.evaluate(async () => {
    const mod = await import('/app/js/shared-context.js?v=55');
    const ctx = mod?.ctx || {};
    return {
      env: typeof ctx.getEnv === 'function' ? ctx.getEnv() : null,
      oceanActive: !!ctx?.oceanMode?.active,
      titleHidden: !!document.getElementById('titleScreen')?.classList.contains('hidden')
    };
  });
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

async function loadCustomLocation(page, locationSpec) {
  return await page.evaluate(async (spec) => {
    const mod = await import('/app/js/shared-context.js?v=55');
    const ctx = mod?.ctx || {};
    if (typeof ctx.loadRoads !== 'function') {
      return { ok: false, reason: 'loadRoads unavailable' };
    }
    const lat = Number(spec?.lat);
    const lon = Number(spec?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return { ok: false, reason: 'invalid custom coordinates' };
    }
    const customLatInput = document.getElementById('customLat');
    const customLonInput = document.getElementById('customLon');
    if (customLatInput) customLatInput.value = String(lat);
    if (customLonInput) customLonInput.value = String(lon);
    ctx.customLoc = {
      lat,
      lon,
      name: String(spec?.label || 'Custom Location')
    };
    ctx.customLocTransient = false;
    ctx.selLoc = 'custom';
    await ctx.loadRoads();
    return {
      ok: true,
      selLoc: ctx.selLoc || null,
      customLoc: ctx.customLoc || null,
      worldLoading: !!ctx.worldLoading,
      roads: Array.isArray(ctx.roads) ? ctx.roads.length : 0,
      buildings: Array.isArray(ctx.buildings) ? ctx.buildings.length : 0
    };
  }, locationSpec);
}

async function inspectSurfaceModes(page) {
  return await page.evaluate(async () => {
    const mod = await import('/app/js/shared-context.js?v=55');
    const ctx = mod?.ctx || {};
    const terrainModes = {};
    (ctx.terrainGroup?.children || []).forEach((mesh) => {
      const mode = mesh?.userData?.terrainVisualProfile?.mode || 'unknown';
      terrainModes[mode] = (terrainModes[mode] || 0) + 1;
    });
    let visibleWaterMeshes = 0;
    let frozenWaterMeshes = 0;
    (ctx.landuseMeshes || []).forEach((mesh) => {
      const isWaterMesh = mesh?.visible !== false && (mesh?.userData?.landuseType === 'water' || mesh?.userData?.isWaterwayLine);
      if (!isWaterMesh) return;
      visibleWaterMeshes++;
      if (mesh?.userData?.surfaceVariant === 'ice') frozenWaterMeshes++;
    });
    return {
      terrainModes,
      visibleWaterMeshes,
      frozenWaterMeshes,
      worldSurfaceProfile: ctx.worldSurfaceProfile || null
    };
  });
}

async function writePngDataUrl(filePath, dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,')) return false;
  const base64 = dataUrl.slice('data:image/png;base64,'.length);
  await fs.writeFile(filePath, Buffer.from(base64, 'base64'));
  return true;
}

async function launchFromTitle(page, launchMode = 'earth') {
  const modePrepared = await page.evaluate(async (mode) => {
    const mod = await import('/app/js/shared-context.js?v=55');
    const ctx = mod?.ctx || {};
    if (typeof ctx.setTitleLocationMode === 'function') {
      ctx.setTitleLocationMode(mode === 'ocean' ? 'ocean' : 'earth');
      return true;
    }
    return false;
  }, launchMode);
  if (!modePrepared) {
    if (launchMode === 'ocean') {
      await page.click('#oceanLaunchToggle', { force: true });
    } else {
      await page.click('#earthLaunchToggle', { force: true });
    }
  }

  await page.click('#startBtn', { force: true });

  const pollForGate = async (timeoutMs) => {
    let gate = null;
    let lastState = null;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      lastState = await page.evaluate(async () => {
        const titleHidden = !!document.getElementById('titleScreen')?.classList.contains('hidden');
        const globeVisible = !!document.getElementById('globeSelectorScreen')?.classList.contains('show');
        const mod = await import('/app/js/shared-context.js?v=55');
        const ctx = mod?.ctx || {};
        return {
          titleHidden,
          globeVisible,
          gameStarted: !!ctx.gameStarted,
          loadingScreenMode: ctx.loadingScreenMode || null,
          selLoc: ctx.selLoc || null
        };
      });
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
    await page.fill('#globeCustomLat', '39.2904');
    await page.fill('#globeCustomLon', '-76.6122');
    await page.click('#globeSelectorStartBtn', { force: true });
    const hiddenHandle = await page.waitForFunction(
      () => !!document.getElementById('titleScreen')?.classList.contains('hidden'),
      { timeout: 90000 }
    );
    await hiddenHandle.dispose();
  }
}

async function main() {
  await mkdirp(outputDir);

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

  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#startBtn', { timeout: 30000 });
    await waitForUiReady(page);

    const titlePresence = await page.evaluate(() => {
      const titleGeoBtn = document.getElementById('titleUseMyLocationBtn');
      const globeGeoBtn = document.getElementById('globeSelectorLocateBtn');
      const oceanToggle = document.getElementById('oceanLaunchToggle');
      return {
        hasTitleGeolocation: !!titleGeoBtn,
        titleGeolocationLabel: titleGeoBtn?.textContent?.trim() || null,
        hasGlobeGeolocation: !!globeGeoBtn,
        globeGeolocationLabel: globeGeoBtn?.textContent?.trim() || null,
        hasOceanLaunchToggle: !!oceanToggle,
        oceanLaunchLabel: oceanToggle?.textContent?.trim() || null
      };
    });

    await page.screenshot({ path: path.join(outputDir, 'title.png'), fullPage: true });

    assert(titlePresence.hasTitleGeolocation, 'Missing #titleUseMyLocationBtn');
    assert(titlePresence.hasGlobeGeolocation, 'Missing #globeSelectorLocateBtn');
    assert(titlePresence.hasOceanLaunchToggle, 'Missing #oceanLaunchToggle');

    const earthBootstrap = await bootstrapEarthRuntime(page, 'baltimore');
    assert(earthBootstrap.ok, `Failed to bootstrap Earth runtime: ${earthBootstrap.reason || 'unknown error'} ${JSON.stringify(earthBootstrap.details || {})}`);
    await page.waitForTimeout(1800);
    const earthStateAfterTitleLaunch = await resolveRuntimeState(page);

    const monacoLoad = await loadPresetLocation(page, 'monaco');
    assert(monacoLoad.ok, `Failed to load Monaco preset: ${monacoLoad.reason || 'unknown error'}`);
    assert(monacoLoad.selLoc === 'monaco', `Expected Monaco preset to be active, got ${monacoLoad.selLoc}`);
    await page.waitForTimeout(1800);

    const monacoWaterRaw = await page.evaluate(async () => {
      const mod = await import('/app/js/shared-context.js?v=55');
      const ctx = mod?.ctx || {};
      const waterMeshes = Array.isArray(ctx.landuseMeshes) ?
        ctx.landuseMeshes.filter((mesh) =>
          mesh && mesh.visible !== false && (mesh.userData?.landuseType === 'water' || mesh.userData?.isWaterwayLine)
        ) :
        [];

      let pngDataUrl = null;
      let firstWaterPreview = null;
      const firstWater = waterMeshes[0] || null;
      if (firstWater && globalThis.THREE && ctx.camera && ctx.renderer?.domElement) {
        const box = new globalThis.THREE.Box3().setFromObject(firstWater);
        const center = box.getCenter(new globalThis.THREE.Vector3());
        const size = box.getSize(new globalThis.THREE.Vector3());
        const camOffsetX = Math.max(18, size.x * 0.2 || 18);
        const camOffsetZ = Math.max(18, size.z * 0.2 || 18);
        const camY = center.y + Math.max(14, size.y * 1.25 + 14);

        ctx.camera.position.set(center.x + camOffsetX, camY, center.z + camOffsetZ);
        ctx.camera.lookAt(center.x, center.y + 0.4, center.z);
        ctx.camera.updateProjectionMatrix?.();
        if (typeof ctx.render === 'function') ctx.render();
        else if (ctx.renderer && ctx.scene && ctx.camera) ctx.renderer.render(ctx.scene, ctx.camera);
        pngDataUrl = ctx.renderer.domElement.toDataURL('image/png');

        firstWaterPreview = {
          type: firstWater.userData?.isWaterwayLine ? 'waterway' : firstWater.userData?.landuseType || 'water',
          center: {
            x: Number(center.x.toFixed(2)),
            y: Number(center.y.toFixed(2)),
            z: Number(center.z.toFixed(2))
          },
          size: {
            x: Number(size.x.toFixed(2)),
            y: Number(size.y.toFixed(2)),
            z: Number(size.z.toFixed(2))
          }
        };
      }

      return {
        preset: ctx.selLoc || null,
        loc: ctx.LOC || null,
        roads: Array.isArray(ctx.roads) ? ctx.roads.length : 0,
        buildings: Array.isArray(ctx.buildings) ? ctx.buildings.length : 0,
        waterAreas: Array.isArray(ctx.waterAreas) ? ctx.waterAreas.length : 0,
        waterways: Array.isArray(ctx.waterways) ? ctx.waterways.length : 0,
        visibleWaterMeshes: waterMeshes.length,
        firstWaterPreview,
        pngDataUrl
      };
    });

    const monacoWaterImage = path.join(outputDir, 'monaco-water.png');
    await writePngDataUrl(monacoWaterImage, monacoWaterRaw.pngDataUrl);
    const { pngDataUrl, ...monacoWater } = monacoWaterRaw;

    assert(
      monacoWater.waterAreas + monacoWater.waterways > 0,
      `Monaco load returned no water features: ${JSON.stringify(monacoWater)}`
    );
    assert(
      monacoWater.visibleWaterMeshes > 0,
      `Monaco water loaded but no visible meshes were rendered: ${JSON.stringify(monacoWater)}`
    );

    const arcticLoad = await loadCustomLocation(page, {
      lat: 78.2232,
      lon: 15.6469,
      label: 'Svalbard Arctic'
    });
    assert(arcticLoad.ok, `Failed to load Arctic custom location: ${arcticLoad.reason || 'unknown error'}`);
    await page.waitForTimeout(1800);
    const arcticSurface = await inspectSurfaceModes(page);
    await page.screenshot({ path: path.join(outputDir, 'arctic-surface.png'), fullPage: true });
    assert(
      (arcticSurface.terrainModes.snow || 0) + (arcticSurface.terrainModes.snowRock || 0) > 0,
      `Arctic terrain did not classify as snow: ${JSON.stringify(arcticSurface)}`
    );
    assert(
      arcticSurface.worldSurfaceProfile?.waterModeHint === 'ice',
      `Arctic water profile did not freeze: ${JSON.stringify(arcticSurface.worldSurfaceProfile || {})}`
    );
    if (arcticSurface.visibleWaterMeshes > 0) {
      assert(
        arcticSurface.frozenWaterMeshes > 0,
        `Arctic visible water meshes were not rendered as ice: ${JSON.stringify(arcticSurface)}`
      );
    }

    const antarcticaLoad = await loadCustomLocation(page, {
      lat: -77.846,
      lon: 166.668,
      label: 'Antarctica'
    });
    assert(antarcticaLoad.ok, `Failed to load Antarctica custom location: ${antarcticaLoad.reason || 'unknown error'}`);
    await page.waitForTimeout(1800);
    const antarcticaSurface = await inspectSurfaceModes(page);
    await page.screenshot({ path: path.join(outputDir, 'antarctica-surface.png'), fullPage: true });
    assert(
      (antarcticaSurface.terrainModes.snow || 0) + (antarcticaSurface.terrainModes.snowRock || 0) > 0,
      `Antarctica terrain did not classify as snow: ${JSON.stringify(antarcticaSurface)}`
    );
    assert(
      antarcticaSurface.worldSurfaceProfile?.waterModeHint === 'ice',
      `Antarctica water profile did not freeze: ${JSON.stringify(antarcticaSurface.worldSurfaceProfile || {})}`
    );

    const desertLoad = await loadCustomLocation(page, {
      lat: 24.9222,
      lon: 55.7676,
      label: 'Dubai Desert'
    });
    assert(desertLoad.ok, `Failed to load desert custom location: ${desertLoad.reason || 'unknown error'}`);
    await page.waitForTimeout(1800);
    const desertSurface = await inspectSurfaceModes(page);
    await page.screenshot({ path: path.join(outputDir, 'desert-surface.png'), fullPage: true });
    assert(
      (desertSurface.terrainModes.sand || 0) > 0 ||
      desertSurface.worldSurfaceProfile?.terrainModeHint === 'sand',
      `Desert terrain did not classify as sand: ${JSON.stringify(desertSurface)}`
    );

    const oceanSwitchIssued = await page.evaluate(async () => {
      const mod = await import('/app/js/shared-context.js?v=55');
      const ctx = mod?.ctx || {};
      if (typeof ctx.startOceanMode === 'function') {
        ctx.startOceanMode();
        return true;
      }
      return false;
    });
    assert(oceanSwitchIssued, 'startOceanMode() is unavailable on app context');

    await page.waitForFunction(async () => {
      const mod = await import('/app/js/shared-context.js?v=55');
      const ctx = mod?.ctx || {};
      const env = typeof ctx.getEnv === 'function' ? ctx.getEnv() : null;
      return !!(ctx?.oceanMode?.active || env === 'OCEAN');
    }, { timeout: 90000 });
    await page.waitForTimeout(1200);
    const oceanState = await resolveRuntimeState(page);
    await page.screenshot({ path: path.join(outputDir, 'ocean-mode.png'), fullPage: true });
    assert(oceanState.oceanActive || oceanState.env === 'OCEAN', `Ocean mode not active (env=${oceanState.env})`);

    await page.evaluate(async () => {
      const mod = await import('/app/js/shared-context.js?v=55');
      const ctx = mod?.ctx || {};
      if (ctx?.oceanMode?.active && typeof ctx.stopOceanMode === 'function') {
        ctx.stopOceanMode();
      }
      if (typeof ctx.switchEnv === 'function' && ctx.ENV?.EARTH) {
        ctx.switchEnv(ctx.ENV.EARTH);
      }
    });
    await page.waitForFunction(async () => {
      const mod = await import('/app/js/shared-context.js?v=55');
      const ctx = mod?.ctx || {};
      const env = typeof ctx.getEnv === 'function' ? ctx.getEnv() : null;
      return env === 'EARTH' && !ctx?.oceanMode?.active;
    }, { timeout: 90000 });
    await page.waitForTimeout(1200);
    const earthState = await resolveRuntimeState(page);
    await page.screenshot({ path: path.join(outputDir, 'earth-mode.png'), fullPage: true });

    assert(earthStateAfterTitleLaunch.env === 'EARTH', `Expected EARTH env after title launch (got ${earthStateAfterTitleLaunch.env})`);
    assert(earthState.env === 'EARTH', `Expected EARTH env after ocean return (got ${earthState.env})`);
    assert(!earthState.oceanActive, 'Ocean renderer remained active after Earth return');

    const checks = {
      titleGeolocationPresent: titlePresence.hasTitleGeolocation,
      globeGeolocationPresent: titlePresence.hasGlobeGeolocation,
      oceanLaunchTogglePresent: titlePresence.hasOceanLaunchToggle,
      oceanLaunchWorks: oceanState.oceanActive || oceanState.env === 'OCEAN',
      monacoWaterPresent: monacoWater.waterAreas + monacoWater.waterways > 0,
      monacoWaterVisible: monacoWater.visibleWaterMeshes > 0,
      arcticFrozenSurface:
        ((arcticSurface.terrainModes.snow || 0) + (arcticSurface.terrainModes.snowRock || 0) > 0) &&
        arcticSurface.worldSurfaceProfile?.waterModeHint === 'ice',
      antarcticaFrozenSurface:
        ((antarcticaSurface.terrainModes.snow || 0) + (antarcticaSurface.terrainModes.snowRock || 0) > 0) &&
        antarcticaSurface.worldSurfaceProfile?.waterModeHint === 'ice',
      desertSurfaceSand:
        (desertSurface.terrainModes.sand || 0) > 0 ||
        desertSurface.worldSurfaceProfile?.terrainModeHint === 'sand',
      earthLaunchWorks:
        earthStateAfterTitleLaunch.env === 'EARTH' &&
        earthState.env === 'EARTH' &&
        !earthState.oceanActive,
      noConsoleErrors: consoleErrors.length === 0
    };

    const report = {
      ok: Object.values(checks).every(Boolean),
      url: baseUrl,
      checks,
      titlePresence,
      earthStateAfterTitleLaunch,
      monacoLoad,
      monacoWater,
      monacoWaterImage,
      arcticLoad,
      arcticSurface,
      antarcticaLoad,
      antarcticaSurface,
      desertLoad,
      desertSurface,
      oceanState,
      earthState,
      consoleErrors
    };

    await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));

    assert(
      checks.noConsoleErrors,
      `Console/page errors present: ${consoleErrors.length} ${JSON.stringify(consoleErrors.slice(0, 8))}`
    );
    console.log(JSON.stringify(report, null, 2));
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
  console.error('[test-osm-smoke] Failed:', err?.stack || err?.message || String(err));
  process.exit(1);
});
