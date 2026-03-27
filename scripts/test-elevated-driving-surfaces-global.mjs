import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { chromium } from 'playwright';

const rootDir = process.cwd();
const host = '127.0.0.1';
const candidatePorts = [4173, 4174, 4175, 4176, 4177];
const outputDir = path.join(rootDir, 'output', 'playwright', 'elevated-driving-surfaces-global');
const browserProfileDir = path.join(outputDir, '.browser-profile');

const samples = [
  { key: 'baltimore_biddle', loc: 'baltimore', label: 'Baltimore East Biddle', lat: 39.3037, lon: -76.6108, yawDeg: 176, radius: 110 },
  { key: 'baltimore_saratoga', loc: 'baltimore', label: 'Baltimore East Saratoga', lat: 39.2921, lon: -76.6086, yawDeg: 268, radius: 110 },
  { key: 'newyork_auto', loc: 'newyork', label: 'New York Representative Elevated Road', yawDeg: 18, radius: 120, autoElevated: true },
  { key: 'sanfrancisco_auto', loc: 'sanfrancisco', label: 'San Francisco Representative Elevated Road', yawDeg: 286, radius: 120, autoElevated: true },
  { key: 'losangeles_auto', loc: 'losangeles', label: 'Los Angeles Representative Elevated Road', lat: 34.0407, lon: -118.2468, yawDeg: 42, radius: 120, autoElevated: true },
  { key: 'seattle_auto', loc: 'seattle', label: 'Seattle Representative Elevated Road', yawDeg: 20, radius: 120, autoElevated: true }
];

function isIgnorableConsoleError(text) {
  return (
    /Failed to load resource:\s+the server responded with a status of\s+(429|500|502|503|504)/i.test(String(text)) ||
    /Road loading failed after all attempts:\s+Error:\s+All Overpass endpoints failed:/i.test(String(text)) ||
    /Could not reach Cloud Firestore backend/i.test(String(text)) ||
    /favicon\.ico/i.test(String(text))
  );
}

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
    if (ctx.Walk?.setModeDrive) ctx.Walk.setModeDrive();
    if (typeof ctx.startMode === 'function') ctx.startMode();

    return {
      ok: true,
      selLoc: ctx.selLoc || null,
      roads: Array.isArray(ctx.roads) ? ctx.roads.length : 0,
      buildings: Array.isArray(ctx.buildings) ? ctx.buildings.length : 0
    };
  }, locKey);
}

async function captureSample(page, sample) {
  return await page.evaluate(async (input) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const semMod = await import('/app/js/structure-semantics.js?v=26');

    const roadFamily = (road) => String(road?.type || '').toLowerCase().replace(/_link$/i, '');
    const roadName = (road) => String(road?.name || '').trim().toLowerCase();
    const roadLength = (road) => {
      const distances = road?.surfaceDistances;
      if (distances instanceof Float32Array && distances.length > 0) return Number(distances[distances.length - 1]) || 0;
      const pts = Array.isArray(road?.pts) ? road.pts : [];
      let total = 0;
      for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
      return total;
    };
    const endpointDirection = (road, endpointIndex) => {
      const pts = Array.isArray(road?.pts) ? road.pts : null;
      if (!pts || pts.length < 2) return null;
      const lastIndex = pts.length - 1;
      const from = endpointIndex <= 0 ? pts[0] : pts[lastIndex];
      const toward = endpointIndex <= 0 ? pts[1] : pts[lastIndex - 1];
      if (!from || !toward) return null;
      const dx = toward.x - from.x;
      const dz = toward.z - from.z;
      const length = Math.hypot(dx, dz);
      if (!(length > 1e-5)) return null;
      return { x: dx / length, z: dz / length };
    };
    const continuationAlignment = (road, endpointIndex, other, otherEndpointIndex) => {
      const a = endpointDirection(road, endpointIndex);
      const b = endpointDirection(other, otherEndpointIndex);
      if (!a || !b) return -1;
      return Math.abs(Math.max(-1, Math.min(1, a.x * b.x + a.z * b.z)));
    };
    const endpointPoint = (road, endpoint) => {
      const pts = Array.isArray(road?.pts) ? road.pts : null;
      if (!pts || pts.length < 2) return null;
      return endpoint === 'start' ? pts[0] : pts[pts.length - 1];
    };

    let world;
    let sampleRoad = null;
    if (input.autoElevated) {
      const elevatedRoads = (Array.isArray(ctx.roads) ? ctx.roads : []).filter((road) => {
        const semantics = road?.structureSemantics || null;
        return (semantics?.gradeSeparated || semMod.roadBehavesGradeSeparated(road)) && Array.isArray(road?.pts) && road.pts.length >= 2;
      });
      let bestScore = -Infinity;
      for (let i = 0; i < elevatedRoads.length; i++) {
        const road = elevatedRoads[i];
        const length = roadLength(road);
        if (!(length > 24)) continue;
        const bounds = road.bounds || null;
        if (!bounds) continue;
        const centerX = (bounds.minX + bounds.maxX) * 0.5;
        const centerZ = (bounds.minZ + bounds.maxZ) * 0.5;
        let nearbyRoadCount = 0;
        for (let j = 0; j < ctx.roads.length; j++) {
          const other = ctx.roads[j];
          const otherBounds = other?.bounds;
          if (!otherBounds || other === road) continue;
          const near =
            !(otherBounds.maxX < centerX - input.radius || otherBounds.minX > centerX + input.radius || otherBounds.maxZ < centerZ - input.radius || otherBounds.minZ > centerZ + input.radius);
          if (near) nearbyRoadCount += 1;
        }
        const score = Math.min(length, 240) + nearbyRoadCount * 8;
        if (score > bestScore) {
          bestScore = score;
          sampleRoad = road;
        }
      }
      if (sampleRoad) {
        const distances = sampleRoad.surfaceDistances instanceof Float32Array ? sampleRoad.surfaceDistances : null;
        const total = distances && distances.length > 0 ? Number(distances[distances.length - 1]) || 0 : roadLength(sampleRoad);
        const targetDistance = Math.max(1, total * 0.5);
        let chosenPoint = sampleRoad.pts[Math.floor(sampleRoad.pts.length * 0.5)] || sampleRoad.pts[0];
        if (distances && sampleRoad.pts.length === distances.length) {
          let bestIndex = 0;
          let bestDelta = Infinity;
          for (let i = 0; i < distances.length; i++) {
            const delta = Math.abs((Number(distances[i]) || 0) - targetDistance);
            if (delta < bestDelta) {
              bestDelta = delta;
              bestIndex = i;
            }
          }
          chosenPoint = sampleRoad.pts[bestIndex] || chosenPoint;
        }
        world = { x: chosenPoint.x, z: chosenPoint.z };
      } else {
        world = ctx.geoToWorld(input.lat ?? 0, input.lon ?? 0);
      }
    } else {
      world = ctx.geoToWorld(input.lat, input.lon);
    }

    if (typeof ctx.updateTerrainAround === 'function') ctx.updateTerrainAround(world.x, world.z);
    if (typeof ctx.requestWorldSurfaceSync === 'function') ctx.requestWorldSurfaceSync({ force: true, source: 'elevated_global_probe' });
    await new Promise((resolve) => window.setTimeout(resolve, 900));

    const driveY = ctx.GroundHeight?.driveSurfaceY?.(world.x, world.z, true, NaN);
    const terrainY = ctx.GroundHeight?.terrainY?.(world.x, world.z);
    const surfaceY = Number.isFinite(driveY) ? driveY : terrainY;
    const carY = (Number.isFinite(surfaceY) ? surfaceY : 0) + 1.2;
    if (ctx.car) {
      ctx.car.x = world.x;
      ctx.car.z = world.z;
      ctx.car.y = carY;
      ctx.car.speed = 0;
      ctx.car.angle = input.yawDeg * Math.PI / 180;
      ctx.car.road = null;
    }
    const walker = ctx.Walk?.state?.walker || null;
    if (walker) {
      walker.x = world.x;
      walker.z = world.z;
      walker.y = carY + 0.45;
      walker.yaw = input.yawDeg * Math.PI / 180;
      walker.pitch = -0.18;
      walker.angle = walker.yaw;
    }

    const nearbyRoads = (Array.isArray(ctx.roads) ? ctx.roads : []).filter((road) => {
      const bounds = road?.bounds;
      if (!bounds) return false;
      return !(
        bounds.maxX < world.x - input.radius ||
        bounds.minX > world.x + input.radius ||
        bounds.maxZ < world.z - input.radius ||
        bounds.minZ > world.z + input.radius
      );
    });

    const approachContinuationsMissingAnchors = [];
    const joinMismatches = [];
    const seenJoinKeys = new Set();

    for (let i = 0; i < nearbyRoads.length; i++) {
      const road = nearbyRoads[i];
      const semantics = road?.structureSemantics || null;
      const connectedStart = Array.isArray(road?.connectedFeatures?.start) ? road.connectedFeatures.start : [];
      const connectedEnd = Array.isArray(road?.connectedFeatures?.end) ? road.connectedFeatures.end : [];
      const anchors = Array.isArray(road?.structureTransitionAnchors) ? road.structureTransitionAnchors : [];
      const connected = connectedStart.concat(connectedEnd);
      const missingAnchorCandidate =
        !semantics?.gradeSeparated &&
        anchors.length === 0 &&
        connected.some((entry) => {
          const other = entry?.feature || null;
          if (!other) return false;
          const otherSem = other?.structureSemantics || null;
          if (!(otherSem?.gradeSeparated || semMod.roadBehavesGradeSeparated(other))) return false;
          const sameFamily = roadFamily(road) && roadFamily(road) === roadFamily(other);
          const sameName = roadName(road) && roadName(road) === roadName(other);
          if (!sameFamily && !sameName) return false;
          const alignment = continuationAlignment(road, entry?.endpoint === 'start' ? 0 : (road.pts.length - 1), other, entry?.endpointIndex ?? 0);
          const minimumAlignment = sameName ? 0.42 : 0.58;
          return alignment >= minimumAlignment;
        });
      if (missingAnchorCandidate) {
        approachContinuationsMissingAnchors.push({
          type: road.type || null,
          name: road.name || null,
          length: Number(roadLength(road).toFixed(2))
        });
      }

      const entries = [
        { endpoint: 'start', links: connectedStart },
        { endpoint: 'end', links: connectedEnd }
      ];
      for (let e = 0; e < entries.length; e++) {
        const point = endpointPoint(road, entries[e].endpoint);
        if (!point) continue;
        const ownY = semMod.sampleFeatureSurfaceY(road, point.x, point.z);
        for (let j = 0; j < entries[e].links.length; j++) {
          const other = entries[e].links[j]?.feature || null;
          if (!other || other === road) continue;
          const sameFamily = roadFamily(road) && roadFamily(road) === roadFamily(other);
          const sameName = roadName(road) && roadName(road) === roadName(other);
          if (!sameFamily && !sameName) continue;
          const alignment = continuationAlignment(road, entries[e].endpoint === 'start' ? 0 : (road.pts.length - 1), other, entries[e].links[j]?.endpointIndex ?? 0);
          const minimumAlignment = sameName ? 0.42 : 0.58;
          if (!(alignment >= minimumAlignment)) continue;
          const sameVerticalGroup =
            semantics?.verticalGroup &&
            other?.structureSemantics?.verticalGroup &&
            semantics.verticalGroup === other.structureSemantics.verticalGroup;
          const elevatedPair =
            semantics?.gradeSeparated ||
            (other?.structureSemantics?.gradeSeparated) ||
            semMod.roadBehavesGradeSeparated(road) ||
            semMod.roadBehavesGradeSeparated(other);
          if (!elevatedPair) continue;
          if (!sameVerticalGroup) continue;
          const otherPoint = entries[e].links[j]?.point || endpointPoint(other, entries[e].links[j]?.endpoint);
          if (!otherPoint) continue;
          const otherY = semMod.sampleFeatureSurfaceY(other, otherPoint.x, otherPoint.z);
          if (!Number.isFinite(ownY) || !Number.isFinite(otherY)) continue;
          const pairKey = [road?.id || road?.name || road?.type || i, other?.id || other?.name || other?.type || j].sort().join('::') + `:${Math.round(point.x * 10)},${Math.round(point.z * 10)}`;
          if (seenJoinKeys.has(pairKey)) continue;
          seenJoinKeys.add(pairKey);
          const delta = Math.abs(ownY - otherY);
          if (delta > 0.85) {
            joinMismatches.push({
              roadType: road.type || null,
              otherType: other.type || null,
              roadName: road.name || null,
              otherName: other.name || null,
              delta: Number(delta.toFixed(3))
            });
          }
        }
      }
    }

    const byType = {};
    const tmpMatrix = typeof THREE !== 'undefined' ? new THREE.Matrix4() : null;
    const tmpPos = typeof THREE !== 'undefined' ? new THREE.Vector3() : null;
    const tmpQuat = typeof THREE !== 'undefined' ? new THREE.Quaternion() : null;
    const tmpScale = typeof THREE !== 'undefined' ? new THREE.Vector3() : null;
    if (tmpMatrix && tmpPos && tmpQuat && tmpScale) {
      for (const mesh of (Array.isArray(ctx.structureVisualMeshes) ? ctx.structureVisualMeshes : [])) {
        const type = mesh?.userData?.structureVisualType;
        if (!type || typeof mesh.getMatrixAt !== 'function') continue;
        for (let i = 0; i < mesh.count; i++) {
          mesh.getMatrixAt(i, tmpMatrix);
          tmpMatrix.decompose(tmpPos, tmpQuat, tmpScale);
          if (Math.hypot(tmpPos.x - world.x, tmpPos.z - world.z) > input.radius) continue;
          byType[type] = (byType[type] || 0) + 1;
        }
      }
    }

    return {
      key: input.key,
      label: input.label,
      loc: input.loc,
      sampleRoadType: sampleRoad?.type || null,
      sampleRoadName: sampleRoad?.name || null,
      world,
      driveY: Number.isFinite(driveY) ? Number(driveY.toFixed(3)) : null,
      terrainY: Number.isFinite(terrainY) ? Number(terrainY.toFixed(3)) : null,
      nearbyElevatedRoads: nearbyRoads.filter((road) =>
        road?.structureSemantics?.gradeSeparated || semMod.roadBehavesGradeSeparated(road)
      ).length,
      approachContinuationsMissingAnchors,
      joinMismatches,
      structureVisualsByType: byType
    };
  }, sample);
}

async function main() {
  await mkdirp(outputDir);
  await mkdirp(browserProfileDir);
  const serverHandle = await startServer();
  const context = await chromium.launchPersistentContext(browserProfileDir, {
    headless: true,
    viewport: { width: 1280, height: 720 }
  });
  const page = context.pages()[0] || await context.newPage();
  const report = [];
  const infraErrors = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = `console:${msg.text()}`;
    if (isIgnorableConsoleError(text)) infraErrors.push(text);
  });

  try {
    await page.goto(`http://${host}:${serverHandle.port}/app/`, { waitUntil: 'domcontentloaded' });
    for (const sample of samples) {
      const infraBaseline = infraErrors.length;
      const boot = await bootstrapEarthRuntime(page, sample.loc);
      if (!boot?.ok) throw new Error(`${sample.key}: failed to bootstrap runtime (${boot?.reason || 'unknown'})`);
      const sampleReport = await captureSample(page, sample);
      const screenshotPath = path.join(outputDir, `${sample.key}.png`);
      await page.screenshot({ path: screenshotPath });
      report.push({
        ...sampleReport,
        infraErrors: infraErrors.slice(infraBaseline),
        screenshot: screenshotPath
      });
    }
  } finally {
    await context.close();
    await serverHandle.close();
  }

  const reportPath = path.join(outputDir, 'report.json');
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  const blockingProblems = [];
  for (const entry of report) {
    const infraFailure = Array.isArray(entry.infraErrors) && entry.infraErrors.some((text) =>
      /All Overpass endpoints failed|status of 429|status of 500|status of 502|status of 503|status of 504/i.test(text)
    );
    if (entry.nearbyElevatedRoads <= 0) {
      if (!infraFailure) blockingProblems.push(`${entry.key}: no elevated roads found near sample`);
    }
    if (entry.joinMismatches.length > 0) {
      blockingProblems.push(`${entry.key}: ${entry.joinMismatches.length} elevated join mismatches above tolerance`);
    }
  }

  if (blockingProblems.length > 0) {
    throw new Error(`Elevated driving surface audit failed:\\n- ${blockingProblems.join('\\n- ')}`);
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
