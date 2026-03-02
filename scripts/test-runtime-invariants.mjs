import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const rootDir = process.cwd();
const host = '127.0.0.1';
const preferredPort = 4173;
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

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });

  return server;
}

async function startServer() {
  try {
    const server = await serveStaticRoot(preferredPort);
    return { server, port: preferredPort, owned: true };
  } catch {
    // Fallback: assume caller already runs local server.
    return { server: null, port: preferredPort, owned: false };
  }
}

function assert(condition, message) {
  if (!condition) {
    const err = new Error(message);
    err.isAssertion = true;
    throw err;
  }
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
      consoleErrors.push({ type: 'console.error', text: msg.text() });
    }
  });
  page.on('pageerror', (err) => {
    consoleErrors.push({ type: 'pageerror', text: String(err?.message || err) });
  });

  let report = null;
  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#startBtn', { timeout: 30000 });
    await page.click('.tab-btn[data-tab="games"]');
    await page.click('.mode[data-mode="free"]');
    await page.click('#startBtn', { force: true });
    await page.waitForFunction(() => document.getElementById('titleScreen')?.classList.contains('hidden'), { timeout: 60000 });
    await page.click('#exploreBtn');

    await page.waitForFunction(async () => {
      const mod = await import('/app/js/shared-context.js?v=55');
      const ctx = mod?.ctx;
      return !!(
        ctx &&
        Array.isArray(ctx.roads) && ctx.roads.length > 300 &&
        Array.isArray(ctx.buildings) && ctx.buildings.length > 1000 &&
        Array.isArray(ctx.landuseMeshes) && ctx.landuseMeshes.length > 0
      );
    }, { timeout: 120000 });

    report = await page.evaluate(async () => {
      const mod = await import('/app/js/shared-context.js?v=55');
      const ctx = mod?.ctx;

      function sampleRoadPoint(road, t) {
        if (!road?.pts || road.pts.length < 2) return null;
        const segCount = road.pts.length - 1;
        const target = Math.max(0, Math.min(segCount - 1e-6, t * segCount));
        const i = Math.floor(target);
        const frac = target - i;
        const a = road.pts[i];
        const b = road.pts[i + 1];
        const x = a.x + (b.x - a.x) * frac;
        const z = a.z + (b.z - a.z) * frac;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const len = Math.hypot(dx, dz) || 1;
        return { x, z, nx: -dz / len, nz: dx / len };
      }

      const roads = ctx.roads || [];
      const maxRoads = Math.min(roads.length, 1500);
      const roadStep = Math.max(1, Math.floor(maxRoads / 500));
      let checkedSamples = 0;
      let centerHits = 0;
      let laneHits = 0;
      const driveCandidates = [];

      for (let r = 0; r < maxRoads; r += roadStep) {
        const road = roads[r];
        const width = Number(road?.width || 8);
        const half = width * 0.5;

        for (const t of [0.15, 0.35, 0.55, 0.75]) {
          const p = sampleRoadPoint(road, t);
          if (!p) continue;
          checkedSamples += 1;

          const center = ctx.checkBuildingCollision?.(p.x, p.z, 2.0);
          if (center?.collision) centerHits += 1;
          const nr = ctx.findNearestRoad?.(p.x, p.z);
          const roadHalfWidth = nr?.road?.width ? nr.road.width * 0.5 : 0;
          const onRoadCenter = Number.isFinite(nr?.dist) &&
          roadHalfWidth > 0 &&
          nr.dist <= Math.max(2.2, roadHalfWidth - 0.35);
          if (center?.collision && onRoadCenter && driveCandidates.length < 28) {
            const heading = Math.atan2(-(p.nz || 0), p.nx || 1);
            driveCandidates.push({ x: p.x, z: p.z, heading });
          }

          const laneOffset = Math.max(0.4, half - 0.8);
          for (const sign of [-1, 1]) {
            const lx = p.x + p.nx * laneOffset * sign;
            const lz = p.z + p.nz * laneOffset * sign;
            const sideHit = ctx.checkBuildingCollision?.(lx, lz, 2.0);
            if (sideHit?.collision) laneHits += 1;
          }
        }
      }

      const driveOutcomes = [];
      let blockedDriveSamples = 0;

      if (ctx.Walk && typeof ctx.Walk.setModeDrive === 'function') {
        ctx.Walk.setModeDrive();
      }

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

      for (let i = 0; i < driveCandidates.length; i++) {
        const sample = driveCandidates[i];
        ctx.car.x = sample.x;
        ctx.car.z = sample.z;
        ctx.car.angle = sample.heading;
        ctx.car.speed = 0;
        ctx.car.vFwd = 0;
        ctx.car.vLat = 0;
        ctx.car.vx = 0;
        ctx.car.vz = 0;
        ctx.car.yawRate = 0;

        const startX = ctx.car.x;
        const startZ = ctx.car.z;
        for (let f = 0; f < 160; f++) {
          ctx.keys.KeyW = true;
          ctx.keys.ArrowUp = true;
          ctx.update?.(1 / 60);
        }
        ctx.keys.KeyW = false;
        ctx.keys.ArrowUp = false;

        const moved = Math.hypot(ctx.car.x - startX, ctx.car.z - startZ);
        const finalSpeed = Number(ctx.car.speed || 0);
        const blocked = moved < 14 || finalSpeed < 12;
        if (blocked) blockedDriveSamples += 1;
        driveOutcomes.push({
          moved: Number(moved.toFixed(2)),
          finalSpeed: Number(finalSpeed.toFixed(2)),
          blocked
        });
      }

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

      const blockedDriveRatePct = Number(
        (blockedDriveSamples / Math.max(1, driveCandidates.length) * 100).toFixed(2)
      );

      const waterAreas = Array.isArray(ctx.waterAreas) ? ctx.waterAreas.length : 0;
      const waterways = Array.isArray(ctx.waterways) ? ctx.waterways.length : 0;
      const visibleWaterMeshes = (ctx.landuseMeshes || []).filter((m) =>
        m && m.visible !== false && (m.userData?.landuseType === 'water' || m.userData?.isWaterwayLine)
      ).length;

      return {
        roads: roads.length,
        buildings: Array.isArray(ctx.buildings) ? ctx.buildings.length : 0,
        checkedSamples,
        centerHits,
        laneHits,
        centerHitRatePct: Number((centerHits / Math.max(1, checkedSamples) * 100).toFixed(2)),
        laneHitRatePct: Number((laneHits / Math.max(1, checkedSamples * 2) * 100).toFixed(2)),
        driveSampleCount: driveCandidates.length,
        blockedDriveSamples,
        blockedDriveRatePct,
        driveOutcomePreview: driveOutcomes.slice(0, 12),
        waterAreas,
        waterways,
        visibleWaterMeshes
      };
    });

    await page.screenshot({ path: path.join(outputDir, 'runtime-invariants.png'), fullPage: true });

    const checks = {
      roadCenterDriveable: report.blockedDriveRatePct <= 10,
      laneEdgeReasonable: report.laneHitRatePct <= 3.5,
      waterDataPresent: (report.waterAreas + report.waterways) > 0,
      waterVisible: report.visibleWaterMeshes > 0,
      noConsoleErrors: consoleErrors.length === 0
    };

    const ok = Object.values(checks).every(Boolean);

    const fullReport = {
      ok,
      url: baseUrl,
      checks,
      metrics: report,
      consoleErrors
    };

    await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(fullReport, null, 2));

    assert(
      checks.roadCenterDriveable,
      `Road center driveability degraded: blocked ${report.blockedDriveSamples}/${report.driveSampleCount} (${report.blockedDriveRatePct}%)`
    );
    assert(checks.laneEdgeReasonable, `Lane-edge collision rate too high: ${report.laneHitRatePct}%`);
    assert(checks.waterDataPresent, 'Water data missing: waterAreas + waterways == 0');
    assert(checks.waterVisible, 'Water is not visible in landuse mesh set');
    assert(checks.noConsoleErrors, `Console/page errors present: ${consoleErrors.length}`);

    console.log(JSON.stringify(fullReport, null, 2));
  } finally {
    await browser.close();
    if (serverHandle.server && serverHandle.owned) {
      await new Promise((resolve) => serverHandle.server.close(resolve));
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
