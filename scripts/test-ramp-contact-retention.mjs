import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { chromium } from 'playwright';

const rootDir = process.cwd();
const host = '127.0.0.1';
const candidatePorts = [4173, 4174, 4175, 4176, 4177];
const outputDir = path.join(rootDir, 'output', 'playwright', 'ramp-contact-retention');

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

async function waitForRuntimeReady(page, timeoutMs = 180000) {
  const start = Date.now();
  let state = null;
  while (Date.now() - start < timeoutMs) {
    state = await page.evaluate(async () => {
      const ctx = (await import('/app/js/shared-context.js?v=55')).ctx;
      return {
        gameStarted: !!ctx?.gameStarted,
        worldLoading: !!ctx?.worldLoading,
        roads: Array.isArray(ctx?.roads) ? ctx.roads.length : 0,
        buildings: Array.isArray(ctx?.buildings) ? ctx.buildings.length : 0
      };
    });
    if (state.gameStarted && !state.worldLoading && state.roads > 0) return state;
    await page.waitForTimeout(1000);
  }
  throw new Error(`Timeout waiting for runtime readiness: ${JSON.stringify(state || {})}`);
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
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      document.querySelector('.loc[data-loc="baltimore"]')?.click();
      document.getElementById('startBtn')?.click();
    });
    const readyState = await waitForRuntimeReady(page);

    const report = await page.evaluate(async () => {
      const ctx = (await import('/app/js/shared-context.js?v=55')).ctx;
      const semMod = await import('/app/js/structure-semantics.js?v=10');
      const roads = (ctx.roads || []).filter((road) =>
        road?.structureSemantics?.terrainMode === 'elevated' ||
        road?.structureSemantics?.rampCandidate
      );
      const bad = [];

      for (const road of roads) {
        const pts = Array.isArray(road?.pts) ? road.pts : [];
        if (pts.length < 2) continue;
        const count = Math.max(4, Math.min(10, (pts.length - 1) * 2));
        const halfWidth = (Number(road.width) || 10) * 0.5;
        for (const dip of [0, 2, 4]) {
          for (let i = 0; i <= count; i++) {
            const tGlobal = i / count;
            const segFloat = tGlobal * (pts.length - 1);
            const segIndex = Math.min(pts.length - 2, Math.floor(segFloat));
            const t = segFloat - segIndex;
            const p1 = pts[segIndex];
            const p2 = pts[segIndex + 1];
            const dx = p2.x - p1.x;
            const dz = p2.z - p1.z;
            const len = Math.hypot(dx, dz) || 1;
            const nx = -dz / len;
            const nz = dx / len;
            const centerX = p1.x + dx * t;
            const centerZ = p1.z + dz * t;

            for (const offsetMul of [0, -0.35, 0.35]) {
              const sampleX = centerX + nx * halfWidth * offsetMul;
              const sampleZ = centerZ + nz * halfWidth * offsetMul;
              const profileY = semMod.sampleFeatureSurfaceY(road, sampleX, sampleZ);
              if (!Number.isFinite(profileY)) continue;
              const currentY = profileY + 1.2 - dip;
              const nearestRoad = ctx.findNearestRoad(sampleX, sampleZ, {
                y: currentY - 1.2,
                maxVerticalDelta: 18,
                preferredRoad: road
              });
              const reachable = semMod.isRoadSurfaceReachable(nearestRoad, {
                currentRoad: road,
                extraVerticalAllowance: 0.7
              });
              const wrongSameGroup =
                nearestRoad?.road &&
                nearestRoad.road !== road &&
                nearestRoad.road?.structureSemantics?.verticalGroup === road?.structureSemantics?.verticalGroup;

              if ((!reachable || wrongSameGroup) && road.structureSemantics?.terrainMode === 'elevated') {
                bad.push({
                  roadType: road.type,
                  ramp: !!road.structureSemantics?.rampCandidate,
                  dip,
                  offsetMul,
                  sample: i,
                  nearestType: nearestRoad?.road?.type || null,
                  nearestMode: nearestRoad?.road?.structureSemantics?.terrainMode || null,
                  nearestSame: nearestRoad?.road === road,
                  dist: Number.isFinite(nearestRoad?.dist) ? Number(nearestRoad.dist.toFixed(3)) : null,
                  verticalDelta: Number.isFinite(nearestRoad?.verticalDelta) ? Number(nearestRoad.verticalDelta.toFixed(3)) : null
                });
                if (bad.length >= 25) {
                  return {
                    ok: false,
                    readyState: {
                      roads: Array.isArray(ctx.roads) ? ctx.roads.length : 0,
                      buildings: Array.isArray(ctx.buildings) ? ctx.buildings.length : 0
                    },
                    scannedRoads: roads.length,
                    failures: bad
                  };
                }
              }
            }
          }
        }
      }

      return {
        ok: true,
        readyState: {
          roads: Array.isArray(ctx.roads) ? ctx.roads.length : 0,
          buildings: Array.isArray(ctx.buildings) ? ctx.buildings.length : 0
        },
        scannedRoads: roads.length,
        failures: bad
      };
    });

    await page.screenshot({ path: path.join(outputDir, 'runtime.png') });
    await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify({
      ...report,
      readyState,
      errors
    }, null, 2));

    if (!report.ok) {
      throw new Error(`Ramp contact retention failures detected: ${JSON.stringify(report.failures.slice(0, 3))}`);
    }
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
