import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { chromium } from 'playwright';

const rootDir = process.cwd();
const host = '127.0.0.1';
const candidatePorts = [4173, 4174, 4175, 4176, 4177];
const outputDir = path.join(rootDir, 'output', 'playwright', 'load-spawn-settle');

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
      return { ...handle, port };
    } catch {
      // try next port
    }
  }
  throw new Error(`Unable to start local static server on ports: ${candidatePorts.join(', ')}`);
}

async function bootstrapEarthRuntime(page, locKey) {
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

    if (!ctx || typeof ctx.loadRoads !== 'function' || typeof ctx.switchEnv !== 'function' || !ctx.ENV?.EARTH) {
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

async function returnToMainMenu(page) {
  await page.evaluate(() => {
    document.getElementById('mainMenuBtn')?.click();
  });
}

async function waitForMenu(page) {
  const deadline = Date.now() + 30000;
  let last = null;
  while (Date.now() < deadline) {
    last = await page.evaluate(async () => {
      const mod = await import('/app/js/shared-context.js?v=55');
      const ctx = mod?.ctx || {};
      return {
        titleHidden: !!document.getElementById('titleScreen')?.classList.contains('hidden'),
        worldLoading: !!ctx.worldLoading,
        gameStarted: !!ctx.gameStarted
      };
    });
    if (!last.titleHidden && !last.worldLoading && !last.gameStarted) return last;
    await page.waitForTimeout(300);
  }
  throw new Error(`Timed out waiting for main menu: ${JSON.stringify(last || {})}`);
}

async function captureSpawnState(page, label) {
  return await page.evaluate(async (nextLabel) => {
    const mod = await import('/app/js/shared-context.js?v=55');
    const ctx = mod?.ctx || {};
    const car = ctx.car || {};
    const walker = ctx.Walk?.state?.walker || {};
    const roads = Array.isArray(ctx.roads) ? ctx.roads : [];

    const terrainY = typeof ctx.terrainMeshHeightAt === 'function' ? ctx.terrainMeshHeightAt(walker.x, walker.z) : NaN;
    const walkSurfaceY = typeof ctx.GroundHeight?.walkSurfaceY === 'function' ? ctx.GroundHeight.walkSurfaceY(walker.x, walker.z, walker.y - 1.7) : NaN;
    const nearestRoad = typeof ctx.findNearestRoad === 'function' ?
      ctx.findNearestRoad(walker.x, walker.z, {
        y: walker.y,
        maxVerticalDelta: 24,
        preferredRoad: car.road || car._lastStableRoad || null
      }) :
      null;

    let overhead = null;
    for (let i = 0; i < roads.length; i++) {
      const road = roads[i];
      const semantics = road?.structureSemantics || null;
      if (!semantics?.gradeSeparated || semantics.terrainMode !== 'elevated') continue;
      if (road === car.road || road === car._lastStableRoad) continue;
      const pts = Array.isArray(road?.pts) ? road.pts : null;
      if (!pts || pts.length < 2) continue;
      let bestDist = Infinity;
      for (let p = 0; p < pts.length - 1; p++) {
        const a = pts[p];
        const b = pts[p + 1];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const len2 = dx * dx + dz * dz;
        if (len2 <= 1e-9) continue;
        let t = ((walker.x - a.x) * dx + (walker.z - a.z) * dz) / len2;
        t = Math.max(0, Math.min(1, t));
        const px = a.x + dx * t;
        const pz = a.z + dz * t;
        bestDist = Math.min(bestDist, Math.hypot(walker.x - px, walker.z - pz));
      }
      const halfWidth = Number.isFinite(road?.width) ? road.width * 0.5 : 4;
      if (bestDist > Math.max(4.5, halfWidth + 1.35)) continue;
      const sampleY = typeof road.sampleSurfaceYAt === 'function' ? road.sampleSurfaceYAt(walker.x, walker.z) : NaN;
      const clearance = sampleY - (walker.y - 1.7);
      if (!Number.isFinite(clearance) || clearance <= 2.6) continue;
      overhead = {
        roadType: road.type || null,
        terrainMode: semantics.terrainMode,
        dist: bestDist,
        clearance,
        y: sampleY
      };
      break;
    }

    const belowTerrain = Number.isFinite(terrainY) && walker.y - 1.7 < terrainY - 0.2;
    const roadContactOkay =
      car.onRoad === true &&
      !!car.road &&
      Number.isFinite(walkSurfaceY) &&
      Math.abs((car.y - 1.2) - walkSurfaceY) < 0.35;

    return {
      label: nextLabel,
      location: ctx.selLoc || null,
      car: {
        x: car.x,
        y: car.y,
        z: car.z,
        onRoad: !!car.onRoad,
        roadType: car.road?.type || null,
        roadMode: car.road?.structureSemantics?.terrainMode || null
      },
      walker: {
        x: walker.x,
        y: walker.y,
        z: walker.z,
        mode: ctx.Walk?.state?.mode || null
      },
      terrainY,
      walkSurfaceY,
      nearestRoad: nearestRoad ? {
        dist: nearestRoad.dist,
        y: nearestRoad.y,
        type: nearestRoad.road?.type || null,
        terrainMode: nearestRoad.road?.structureSemantics?.terrainMode || null
      } : null,
      belowTerrain,
      overhead,
      roadContactOkay,
      roadsNeedRebuild: !!ctx.roadsNeedRebuild,
      worldLoading: !!ctx.worldLoading
    };
  }, label);
}

function assertSpawnState(state) {
  if (state.belowTerrain) {
    throw new Error(`${state.label}: spawn settled below terrain`);
  }
  if (!state.roadContactOkay) {
    throw new Error(`${state.label}: spawn lost road contact`);
  }
  if (state.overhead) {
    throw new Error(`${state.label}: spawn settled under elevated structure ${JSON.stringify(state.overhead)}`);
  }
}

async function main() {
  await mkdirp(outputDir);
  const serverHandle = await startServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console:${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`pageerror:${err.message}`));

  try {
    await page.goto(`http://${host}:${serverHandle.port}/app/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#startBtn', { timeout: 30000 });

    const firstBoot = await bootstrapEarthRuntime(page, 'baltimore');
    if (!firstBoot.ok) throw new Error(`First bootstrap failed: ${JSON.stringify(firstBoot)}`);
    await page.waitForTimeout(3500);
    const baltimore = await captureSpawnState(page, 'baltimore_start');
    assertSpawnState(baltimore);
    await page.screenshot({ path: path.join(outputDir, 'baltimore-start.png') });

    await returnToMainMenu(page);
    await waitForMenu(page);

    const secondBoot = await bootstrapEarthRuntime(page, 'newyork');
    if (!secondBoot.ok) throw new Error(`Second bootstrap failed: ${JSON.stringify(secondBoot)}`);
    await page.waitForTimeout(3500);
    const newyork = await captureSpawnState(page, 'newyork_reload');
    assertSpawnState(newyork);
    await page.screenshot({ path: path.join(outputDir, 'newyork-reload.png') });

    await page.goto(`http://${host}:${serverHandle.port}/app/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#startBtn', { timeout: 30000 });
    const thirdBoot = await bootstrapEarthRuntime(page, 'monaco');
    if (!thirdBoot.ok) throw new Error(`Third bootstrap failed: ${JSON.stringify(thirdBoot)}`);
    await page.waitForTimeout(3500);
    const monaco = await captureSpawnState(page, 'monaco_start');
    assertSpawnState(monaco);
    await page.screenshot({ path: path.join(outputDir, 'monaco-start.png') });

    const report = {
      ok: true,
      boots: { firstBoot, secondBoot, thirdBoot },
      states: { baltimore, newyork, monaco },
      errors
    };
    await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
  } finally {
    await context.close();
    await browser.close();
    await serverHandle.close();
  }
}

main().catch(async (error) => {
  await mkdirp(outputDir);
  await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify({
    ok: false,
    error: String(error?.message || error)
  }, null, 2));
  console.error(error);
  process.exitCode = 1;
});
