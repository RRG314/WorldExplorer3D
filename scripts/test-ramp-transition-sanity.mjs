import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { chromium } from 'playwright';

const rootDir = process.cwd();
const host = '127.0.0.1';
const candidatePorts = [4173, 4174, 4175, 4176, 4177];
const outputDir = path.join(rootDir, 'output', 'playwright', 'ramp-transition-sanity');

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
      res.writeHead(200, { 'Content-Type': mime.get(ext) || 'application/octet-stream' });
      res.end(await fs.readFile(filePath));
    } catch (error) {
      res.writeHead(500).end(String(error?.message || error));
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
      const handle = await serveStaticRoot(port);
      return { ...handle, owned: true };
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
    if (ctx.Walk?.setModeDrive) ctx.Walk.setModeDrive();
    if (typeof ctx.startMode === 'function') ctx.startMode();
    return {
      ok: true,
      roads: Array.isArray(ctx.roads) ? ctx.roads.length : 0,
      buildings: Array.isArray(ctx.buildings) ? ctx.buildings.length : 0
    };
  }, locKey);
}

async function inspectRampArea(page, lat, lon) {
  return await page.evaluate(async ({ lat, lon }) => {
    const mod = await import('/app/js/shared-context.js?v=55');
    const ctx = mod?.ctx || {};
    if (!ctx || typeof ctx.geoToWorld !== 'function') {
      return { ok: false, reason: 'geo helpers unavailable' };
    }

    const world = ctx.geoToWorld(lat, lon);
    ctx.car.x = world.x;
    ctx.car.z = world.z;
    ctx.car.speed = 0;
    ctx.car.vx = 0;
    ctx.car.vz = 0;
    if (ctx.Walk?.setModeDrive) ctx.Walk.setModeDrive();
    ctx.updateTerrainAround(world.x, world.z);
    await new Promise((resolve) => window.setTimeout(resolve, 1800));

    const roads = Array.isArray(ctx.roads) ? ctx.roads : [];
    const nearby = [];
    for (let i = 0; i < roads.length; i++) {
      const road = roads[i];
      if (!road || !Array.isArray(road.pts)) continue;
      let minDist = Infinity;
      for (let j = 0; j < road.pts.length; j++) {
        const pt = road.pts[j];
        const dist = Math.hypot(pt.x - world.x, pt.z - world.z);
        if (dist < minDist) minDist = dist;
      }
      if (minDist > 120) continue;

      const anchors = Array.isArray(road.structureTransitionAnchors) ? road.structureTransitionAnchors : [];
      let maxAnchorOffset = 0;
      for (let j = 0; j < anchors.length; j++) {
        maxAnchorOffset = Math.max(maxAnchorOffset, Math.abs(Number(anchors[j]?.targetOffset) || 0));
      }

      let maxSlopeRatio = 0;
      const heights = road.surfaceHeights instanceof Float32Array ? road.surfaceHeights : null;
      const distances = road.surfaceDistances instanceof Float32Array ? road.surfaceDistances : null;
      if (heights && distances && heights.length === distances.length) {
        for (let j = 0; j < heights.length - 1; j++) {
          const dy = Math.abs((Number(heights[j + 1]) || 0) - (Number(heights[j]) || 0));
          const dd = Math.max(0.001, (Number(distances[j + 1]) || 0) - (Number(distances[j]) || 0));
          maxSlopeRatio = Math.max(maxSlopeRatio, dy / dd);
        }
      }

      nearby.push({
        id: road.id || null,
        name: road.name || null,
        type: road.type || null,
        minDist: Number(minDist.toFixed(2)),
        terrainMode: road.structureSemantics?.terrainMode || null,
        gradeSeparated: road.structureSemantics?.gradeSeparated === true,
        rampCandidate: road.structureSemantics?.rampCandidate === true,
        anchorCount: anchors.length,
        maxAnchorOffset: Number(maxAnchorOffset.toFixed(2)),
        maxSlopeRatio: Number(maxSlopeRatio.toFixed(3))
      });
    }

    const badTransitionRoads = nearby.filter((road) =>
      !road.gradeSeparated &&
      !road.rampCandidate &&
      !/_link$/i.test(String(road.type || '')) &&
      road.maxAnchorOffset > 2.5 &&
      road.maxSlopeRatio > 0.72
    );

    const suspiciousRampRoads = nearby.filter((road) =>
      road.gradeSeparated &&
      (road.rampCandidate || /_link$/i.test(String(road.type || ''))) &&
      road.maxSlopeRatio > 0.42
    );

    const seamMismatchSamples = [];
    const endpointGroups = new Map();
    const sampleHeightIntoFeature = (road, endpointIndex, offsetDistance) => {
      const distances = road?.surfaceDistances;
      const heights = road?.surfaceHeights;
      if (!(distances instanceof Float32Array) || !(heights instanceof Float32Array) || distances.length !== heights.length || distances.length === 0) {
        return NaN;
      }
      const totalDistance = Number(distances[distances.length - 1]) || 0;
      const clampedOffset = Math.max(0, Math.min(totalDistance, offsetDistance));
      const targetDistance = endpointIndex === 0 ? clampedOffset : Math.max(0, totalDistance - clampedOffset);
      if (targetDistance <= 0) return Number(heights[0]) || NaN;
      if (targetDistance >= totalDistance) return Number(heights[heights.length - 1]) || NaN;
      for (let i = 0; i < distances.length - 1; i++) {
        const start = Number(distances[i]) || 0;
        const end = Number(distances[i + 1]) || start;
        if (targetDistance < start || targetDistance > end) continue;
        const span = Math.max(0.001, end - start);
        const t = (targetDistance - start) / span;
        const from = Number(heights[i]) || 0;
        const to = Number(heights[i + 1]) || from;
        return from + (to - from) * t;
      }
      return Number(heights[heights.length - 1]) || NaN;
    };

    for (let i = 0; i < roads.length; i++) {
      const road = roads[i];
      if (!road || !Array.isArray(road.pts) || road.pts.length < 2) continue;
      const semantics = road.structureSemantics || null;
      const anchors = Array.isArray(road.structureTransitionAnchors) ? road.structureTransitionAnchors : [];
      let maxTransitionAnchorOffset = 0;
      for (let j = 0; j < anchors.length; j++) {
        maxTransitionAnchorOffset = Math.max(maxTransitionAnchorOffset, Math.abs(Number(anchors[j]?.targetOffset) || 0));
      }
      const elevatedLike = semantics?.gradeSeparated || ((semantics?.rampCandidate || /_link$/i.test(String(road.type || ''))) && maxTransitionAnchorOffset >= 2.4);
      if (!elevatedLike) continue;
      let minDist = Infinity;
      for (let j = 0; j < road.pts.length; j++) {
        const pt = road.pts[j];
        const dist = Math.hypot(pt.x - world.x, pt.z - world.z);
        if (dist < minDist) minDist = dist;
      }
      if (minDist > 220) continue;
      const endpoints = [
        { endpointIndex: 0, point: road.pts[0] },
        { endpointIndex: road.pts.length - 1, point: road.pts[road.pts.length - 1] }
      ];
      for (let j = 0; j < endpoints.length; j++) {
        const endpoint = endpoints[j];
        const point = endpoint.point;
        const key = `${Math.round(point.x * 10)},${Math.round(point.z * 10)}:${semantics?.verticalGroup || semantics?.terrainMode || 'structure'}`;
        let bucket = endpointGroups.get(key);
        if (!bucket) {
          bucket = [];
          endpointGroups.set(key, bucket);
        }
        bucket.push({
          id: road.id || null,
          name: road.name || null,
          type: road.type || null,
          road,
          endpointIndex: endpoint.endpointIndex
        });
      }
    }

    endpointGroups.forEach((entries) => {
      if (!Array.isArray(entries) || entries.length < 2) return;
      const sampleOffset = 10;
      const sampled = entries
        .map((entry) => ({
          ...entry,
          sampleY: sampleHeightIntoFeature(entry.road, entry.endpointIndex, sampleOffset)
        }))
        .filter((entry) => Number.isFinite(entry.sampleY));
      if (sampled.length < 2) return;
      let minY = Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < sampled.length; i++) {
        minY = Math.min(minY, sampled[i].sampleY);
        maxY = Math.max(maxY, sampled[i].sampleY);
      }
      const delta = maxY - minY;
      if (delta <= 0.9) return;
      seamMismatchSamples.push({
        endpointKey: sampled[0].road?.structureSemantics?.verticalGroup || 'structure',
        delta: Number(delta.toFixed(3)),
        roads: sampled.map((entry) => ({
          id: entry.id,
          name: entry.name,
          type: entry.type,
          sampleY: Number(entry.sampleY.toFixed(3))
        }))
      });
    });

    return {
      ok: true,
      point: { lat, lon, x: Number(world.x.toFixed(2)), z: Number(world.z.toFixed(2)) },
      nearbyRoadCount: nearby.length,
      badTransitionRoads,
      suspiciousRampRoads,
      seamMismatchSamples: seamMismatchSamples.slice(0, 12),
      sample: nearby
        .sort((a, b) => a.minDist - b.minDist)
        .slice(0, 14),
      terrainSnapshot: typeof ctx.getTerrainStreamingSnapshot === 'function' ? ctx.getTerrainStreamingSnapshot() : null
    };
  }, { lat, lon });
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
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });

  try {
    await page.goto(`http://${host}:${serverHandle.port}/app/`, { waitUntil: 'domcontentloaded' });
    const bootstrap = await bootstrapEarthRuntime(page, 'baltimore');
    if (!bootstrap.ok) throw new Error(`bootstrap failed: ${bootstrap.reason || 'unknown'}`);

    const report = await inspectRampArea(page, 39.3037, -76.6118);
    if (!report.ok) throw new Error(`inspect failed: ${report.reason || 'unknown'}`);
    if (report.badTransitionRoads.length > 0) {
      throw new Error(`ordinary transition roads still have abrupt bridge ramps: ${JSON.stringify(report.badTransitionRoads.slice(0, 4))}`);
    }

    await page.screenshot({ path: path.join(outputDir, 'runtime.png') });
    await fs.writeFile(
      path.join(outputDir, 'report.json'),
      JSON.stringify({ ok: true, bootstrap, report, errors }, null, 2)
    );
  } finally {
    await context.close();
    await browser.close();
    await serverHandle.close();
  }
}

main().catch(async (error) => {
  await mkdirp(outputDir);
  await fs.writeFile(
    path.join(outputDir, 'report.json'),
    JSON.stringify({ ok: false, error: String(error?.message || error) }, null, 2)
  );
  console.error(error);
  process.exitCode = 1;
});
