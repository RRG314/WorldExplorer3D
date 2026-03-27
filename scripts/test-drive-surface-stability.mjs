import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { chromium } from 'playwright';

const rootDir = process.cwd();
const host = '127.0.0.1';
const candidatePorts = [4173, 4174, 4175, 4176, 4177];
const outputDir = path.join(rootDir, 'output', 'playwright', 'drive-surface-stability');

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

async function collectDriveSurfaceReport(page) {
  return await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const semMod = await import('/app/js/structure-semantics.js?v=26');

    const seamPath = [
      { lat: 39.30018, lon: -76.60228 },
      { lat: 39.30024, lon: -76.60216 },
      { lat: 39.30030, lon: -76.60204 },
      { lat: 39.30036, lon: -76.60192 },
      { lat: 39.30042, lon: -76.60180 }
    ];

    const report = {
      cache: {
        appEntryVersion: Array.from(document.scripts).find((script) => script.type === 'module' && script.src.includes('bootstrap.js'))?.src || null
      },
      seamProbe: null,
      rampProbe: null
    };

    const samplePath = async (path, label) => {
      let orderedPath = path.slice();
      if (label.startsWith('ramp_') && orderedPath.length >= 2) {
        const gapAt = (point) => {
          const world = ctx.geoToWorld(point.lat, point.lon);
          const terrainY = ctx.GroundHeight.terrainY(world.x, world.z);
          const nearestRoad = ctx.findNearestRoad(world.x, world.z, {
            y: terrainY,
            maxVerticalDelta: 18,
            preferredRoad: null
          });
          const profileY = nearestRoad?.road ? semMod.sampleFeatureSurfaceY(nearestRoad.road, world.x, world.z) : NaN;
          return Number.isFinite(profileY) ? Math.abs(profileY - terrainY) : Infinity;
        };
        const firstGap = gapAt(orderedPath[0]);
        const lastGap = gapAt(orderedPath[orderedPath.length - 1]);
        if (firstGap > lastGap) orderedPath.reverse();
      }
      const points = [];
      let prevSurfaceY = NaN;
      let maxSurfaceJump = 0;
      let maxSyncDurationMs = 0;
      let terrainFallbacks = 0;
      let roadDrops = 0;

      for (let i = 0; i < orderedPath.length; i++) {
        const world = ctx.geoToWorld(orderedPath[i].lat, orderedPath[i].lon);
        ctx.car.x = world.x;
        ctx.car.z = world.z;
        ctx.car.speed = label === 'seam' ? 24 : 0;
        let currentFeetY = Number.isFinite(ctx.car.y) ? ctx.car.y - 1.2 : NaN;
        if (label.startsWith('ramp_') && i === 0) {
          const seedNearestRoad = ctx.findNearestRoad(world.x, world.z, {
            y: NaN,
            maxVerticalDelta: 40,
            preferredRoad: null
          });
          const seedRoad = seedNearestRoad?.road || null;
          const seedSemantics = seedRoad?.structureSemantics || null;
          const seedProfileY = seedRoad ? semMod.sampleFeatureSurfaceY(seedRoad, world.x, world.z) : NaN;
          const seedGradeSeparated =
            seedSemantics?.terrainMode === 'elevated' ||
            seedSemantics?.terrainMode === 'subgrade' ||
            seedSemantics?.rampCandidate === true ||
            semMod.roadBehavesGradeSeparated(seedRoad);
          if (
            seedRoad &&
            seedGradeSeparated &&
            Number.isFinite(seedNearestRoad?.dist) &&
            seedNearestRoad.dist <= 1.6 &&
            Number.isFinite(seedProfileY)
          ) {
            currentFeetY = seedProfileY;
            ctx.car.road = seedRoad;
            ctx.car._lastStableRoad = seedRoad;
            ctx.car.y = seedProfileY + 1.2;
          }
        }
        const syncStart = performance.now();
        ctx.updateTerrainAround(world.x, world.z);
        if (label !== 'seam' && ctx.roadsNeedRebuild && typeof ctx.requestWorldSurfaceSync === 'function') {
          ctx.requestWorldSurfaceSync({ force: true, source: `${label}_probe` });
        }
        const syncDurationMs = performance.now() - syncStart;
        if (!(label === 'seam' && i === 0) && syncDurationMs > maxSyncDurationMs) {
          maxSyncDurationMs = syncDurationMs;
        }

        const driveSurfaceY = ctx.GroundHeight.driveSurfaceY(world.x, world.z, true, currentFeetY);
        const terrainY = ctx.GroundHeight.terrainY(world.x, world.z);
        const preferredRoad = ctx.car.road || ctx.car._lastStableRoad || null;
        const nearestRoad = ctx.findNearestRoad(world.x, world.z, {
          y: Number.isFinite(driveSurfaceY) ? driveSurfaceY : currentFeetY,
          maxVerticalDelta: 18,
          preferredRoad
        });
        const onRoad = semMod.isRoadSurfaceReachable(nearestRoad, {
          currentRoad: preferredRoad,
          extraVerticalAllowance: 0.7
        });
        const profileY = nearestRoad?.road ? semMod.sampleFeatureSurfaceY(nearestRoad.road, world.x, world.z) : NaN;
        if (onRoad && nearestRoad?.road) {
          ctx.car.road = nearestRoad.road;
          ctx.car._lastStableRoad = nearestRoad.road;
        }
        ctx.car.onRoad = !!onRoad;
        ctx.car.y = Number.isFinite(driveSurfaceY) ? driveSurfaceY + 1.2 : terrainY + 1.2;

        if (Number.isFinite(prevSurfaceY) && Number.isFinite(driveSurfaceY)) {
          const jump = Math.abs(driveSurfaceY - prevSurfaceY);
          if (jump > maxSurfaceJump) maxSurfaceJump = jump;
        }
        prevSurfaceY = driveSurfaceY;

        if (Number.isFinite(profileY) && profileY > terrainY + 1.0 && driveSurfaceY <= terrainY + 0.35) {
          terrainFallbacks += 1;
        }
        if (!onRoad && Number.isFinite(profileY) && profileY > terrainY + 1.0) {
          roadDrops += 1;
        }

        points.push({
          lat: orderedPath[i].lat,
          lon: orderedPath[i].lon,
          syncDurationMs: Number(syncDurationMs.toFixed(2)),
          driveSurfaceY: Number.isFinite(driveSurfaceY) ? Number(driveSurfaceY.toFixed(3)) : null,
          terrainY: Number.isFinite(terrainY) ? Number(terrainY.toFixed(3)) : null,
          profileY: Number.isFinite(profileY) ? Number(profileY.toFixed(3)) : null,
          onRoad,
          roadType: nearestRoad?.road?.type || null,
          terrainMode: nearestRoad?.road?.structureSemantics?.terrainMode || null,
          dist: Number.isFinite(nearestRoad?.dist) ? Number(nearestRoad.dist.toFixed(3)) : null,
          verticalDelta: Number.isFinite(nearestRoad?.verticalDelta) ? Number(nearestRoad.verticalDelta.toFixed(3)) : null
        });
      }

      return {
        label,
        maxSurfaceJump: Number(maxSurfaceJump.toFixed(3)),
        maxSyncDurationMs: Number(maxSyncDurationMs.toFixed(2)),
        terrainFallbacks,
        roadDrops,
        points
      };
    };

    const pickRampPaths = () => {
      const roads = Array.isArray(ctx.roads) ? ctx.roads : [];
      const candidates = roads.filter((road) => {
        if (!Array.isArray(road?.pts) || road.pts.length < 2) return false;
        const semantics = road?.structureSemantics || null;
        if (!(semantics?.terrainMode === 'elevated' || semantics?.rampCandidate || semantics?.gradeSeparated)) return false;
        const anchors = Array.isArray(road?.structureTransitionAnchors) ? road.structureTransitionAnchors.length : 0;
        return anchors > 0 || semantics?.rampCandidate;
      }).slice(0, 40);

      return candidates.slice(0, 8).map((road, idx) => {
        const pts = road.pts;
        const pointIndices = [0, 0.2, 0.4, 0.6, 0.8, 1].map((tGlobal) => {
          const segFloat = tGlobal * (pts.length - 1);
          const segIndex = Math.min(pts.length - 2, Math.floor(segFloat));
          const t = segFloat - segIndex;
          const p1 = pts[segIndex];
          const p2 = pts[segIndex + 1];
          return {
            x: p1.x + (p2.x - p1.x) * t,
            z: p1.z + (p2.z - p1.z) * t
          };
        });
        return {
          id: idx,
          roadType: road.type,
          points: pointIndices.map((pt) => {
            const ll = ctx.worldToLatLon(pt.x, pt.z);
            return { lat: ll.lat, lon: ll.lon };
          })
        };
      });
    };

    report.seamProbe = await samplePath(seamPath, 'seam');

    const rampPaths = pickRampPaths();
    const rampReports = [];
    let worstRampJump = 0;
    let worstRampFallbacks = 0;
    let worstRampDrops = 0;
    for (let i = 0; i < rampPaths.length; i++) {
      const rampReport = await samplePath(rampPaths[i].points, `ramp_${i + 1}`);
      rampReport.roadType = rampPaths[i].roadType;
      rampReports.push(rampReport);
      if (rampReport.maxSurfaceJump > worstRampJump) worstRampJump = rampReport.maxSurfaceJump;
      if (rampReport.terrainFallbacks > worstRampFallbacks) worstRampFallbacks = rampReport.terrainFallbacks;
      if (rampReport.roadDrops > worstRampDrops) worstRampDrops = rampReport.roadDrops;
    }
    report.rampProbe = {
      scannedRamps: rampReports.length,
      worstRampJump: Number(worstRampJump.toFixed(3)),
      worstRampFallbacks,
      worstRampDrops,
      ramps: rampReports
    };

    return report;
  });
}

async function main() {
  await mkdirp(outputDir);

  const serverHandle = await startServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (err) => errors.push(`pageerror:${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console:${msg.text()}`);
  });

  try {
    await page.goto(`http://${host}:${serverHandle.port}/app/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    const bootstrap = await bootstrapEarthRuntime(page, 'baltimore');
    if (!bootstrap?.ok) throw new Error(`bootstrap failed: ${JSON.stringify(bootstrap)}`);
    await page.waitForTimeout(4000);

    const report = await collectDriveSurfaceReport(page);
    report.bootstrap = bootstrap;
    report.errors = errors;

    await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));

    if (report.seamProbe.terrainFallbacks > 0 || report.seamProbe.roadDrops > 0) {
      throw new Error(`seam probe lost road surface: ${JSON.stringify(report.seamProbe)}`);
    }
    if (report.seamProbe.maxSyncDurationMs >= 240) {
      throw new Error(`seam probe sync spike too high: ${report.seamProbe.maxSyncDurationMs}`);
    }
    if (report.rampProbe.worstRampJump > 2.4) {
      throw new Error(`ramp probe jump too high: ${report.rampProbe.worstRampJump}`);
    }
    if (report.rampProbe.worstRampFallbacks > 0 || report.rampProbe.worstRampDrops > 0) {
      throw new Error(`ramp probe lost elevated surface: ${JSON.stringify(report.rampProbe)}`);
    }

    await page.screenshot({ path: path.join(outputDir, 'runtime.png') });
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
    let existing = {};
    try {
      existing = JSON.parse(await fs.readFile(path.join(outputDir, 'report.json'), 'utf8'));
    } catch {
      existing = {};
    }
    await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify({
      ...existing,
      ok: false,
      error: String(error?.message || error)
    }, null, 2));
    console.error(error);
    process.exit(1);
  });
