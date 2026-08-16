import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startStaticRootServer } from './test-static-server.mjs';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'output', 'playwright', 'monaco-structure-ownership');
const externalBaseUrl = String(process.env.WE3D_BASE_URL || '').trim();
const server = externalBaseUrl ? null : await startStaticRootServer({
  rootDir,
  host: '127.0.0.1',
  candidatePorts: [4318, 4319, 4320, 4321]
});
const baseUrl = externalBaseUrl || `http://127.0.0.1:${server.port}`;
const targetGeo = Object.freeze({ lat: 43.7274, lon: 7.4134 });
await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const consoleErrors = [];
page.on('pageerror', (error) => consoleErrors.push(String(error?.stack || error)));
page.on('console', (message) => {
  if (message.type() !== 'error') return;
  const value = message.text();
  if (/Failed to load resource|blocked by CORS|Could not reach Cloud Firestore/i.test(value)) return;
  consoleErrors.push(value);
});

try {
  await page.goto(`${baseUrl}/app/?monaco-structure-ownership=1`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000
  });
  await page.evaluate(async () => {
    const deadline = performance.now() + 120000;
    while (performance.now() < deadline) {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      if (typeof ctx?.loadRoads === 'function' && typeof ctx?.selectPresetLocation === 'function') {
        await ctx.ensureEarthRuntimeReady?.();
        if (ctx.getEarthRuntimeSnapshot?.().ready === true) {
          window.__ownershipCtx = ctx;
          return;
        }
      }
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    throw new Error('Earth runtime bootstrap timed out');
  });
  await page.evaluate(async () => {
    const ctx = window.__ownershipCtx;
    if (!ctx.selectPresetLocation('monaco')) throw new Error('Monaco preset selection failed');
    ctx.gameMode = 'free';
    ctx.gameStarted = true;
    ctx.paused = false;
    ctx.switchEnv?.(ctx.ENV.EARTH);
    document.getElementById('titleScreen')?.classList.add('hidden');
    document.getElementById('globeSelectorScreen')?.classList.remove('show');
    await ctx.loadRoads();
  });
  await page.waitForFunction(() => {
    const ctx = window.__ownershipCtx;
    return ctx.worldLoading !== true &&
      ctx.worldLoadRuntimeState?.status === 'ready' &&
      ctx.worldPublication?.requestId?.endsWith?.(':monaco') &&
      Number(ctx.roads?.length || 0) > 0;
  }, null, { timeout: 120000 });
  await page.waitForFunction(() => (
    window.__ownershipCtx?.farTerrainClipmapState?.status === 'ready'
  ), null, { timeout: 90000 });

  const report = await page.evaluate(({ targetGeo }) => {
    const ctx = window.__ownershipCtx;
    const target = ctx.geoToWorld(targetGeo.lat, targetGeo.lon);
    const matrix = new THREE.Matrix4();
    const worldMatrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const nearbyInstances = [];

    for (const mesh of ctx.structureVisualMeshes || []) {
      mesh.updateWorldMatrix?.(true, false);
      if (mesh?.isInstancedMesh === true) {
        for (let instanceId = 0; instanceId < Number(mesh.count || 0); instanceId += 1) {
          mesh.getMatrixAt(instanceId, matrix);
          worldMatrix.multiplyMatrices(mesh.matrixWorld, matrix);
          worldMatrix.decompose(position, quaternion, scale);
          const distance = Math.hypot(position.x - target.x, position.z - target.z);
          if (distance > 180) continue;
          nearbyInstances.push({
            owner: 'structure_visual',
            type: String(mesh.userData?.structureVisualType || ''),
            instanceId,
            distance,
            position: { x: position.x, y: position.y, z: position.z },
            scale: { x: scale.x, y: scale.y, z: scale.z },
            color: mesh.material?.color?.getHexString?.() || null
          });
        }
      } else {
        const bounds = new THREE.Box3().setFromObject(mesh);
        const closest = bounds.clampPoint(new THREE.Vector3(target.x, bounds.min.y, target.z), new THREE.Vector3());
        const distance = Math.hypot(closest.x - target.x, closest.z - target.z);
        if (distance > 180) continue;
        nearbyInstances.push({
          owner: 'structure_visual',
          type: String(mesh.userData?.structureVisualType || ''),
          instanceId: null,
          distance,
          bounds: {
            min: bounds.min.toArray(),
            max: bounds.max.toArray()
          },
          color: mesh.material?.color?.getHexString?.() || null
        });
      }
    }

    const pointSegmentDistance = (point, start, end) => {
      const dx = end.x - start.x;
      const dz = end.z - start.z;
      const denominator = dx * dx + dz * dz;
      const t = denominator > 0
        ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / denominator))
        : 0;
      return Math.hypot(point.x - (start.x + dx * t), point.z - (start.z + dz * t));
    };
    const roadDistance = (road) => {
      let best = Infinity;
      for (let index = 0; index < (road?.pts?.length || 0) - 1; index += 1) {
        best = Math.min(best, pointSegmentDistance(target, road.pts[index], road.pts[index + 1]));
      }
      return best;
    };
    const nearbyRoads = (ctx.roads || [])
      .map((road) => ({ road, distance: roadDistance(road) }))
      .filter((entry) => entry.distance <= 180)
      .sort((left, right) => left.distance - right.distance)
      .slice(0, 80)
      .map(({ road, distance }) => ({
        distance,
        name: String(road.name || ''),
        type: String(road.type || ''),
        width: Number(road.width),
        terrainMode: String(road.structureSemantics?.terrainMode || ''),
        structureKind: String(road.structureSemantics?.structureKind || ''),
        isBridge: road.structureSemantics?.isBridge === true,
        completeness: String(road.transportRecord?.completeness || ''),
        routeState: String(road.transportRecord?.routeState || ''),
        identity: String(road.transportRecord?.identity || road.sourceFeatureId || ''),
        sourceTags: road.transportRecord?.sourceTags || road.transportRecord?.rawTags || null,
        assembly: road.transportStructureAssembly ? {
          featureId: road.transportStructureAssembly.featureId,
          family: road.transportStructureAssembly.family,
          publishBody: road.transportStructureAssembly.publishBody,
          engineeredDetail: road.transportStructureAssembly.engineeredDetail,
          visualSupportDetail: road.transportStructureAssembly.visualSupportDetail,
          bodyCoverage: road.transportStructureAssembly.bodyCoverage,
          supportCount: road.transportStructureAssembly.supportStations?.length || 0,
          abutments: (road.transportStructureAssembly.abutments || []).map((abutment) => ({
            endpoint: abutment.endpoint,
            distance: Math.hypot(abutment.x - target.x, abutment.z - target.z),
            x: abutment.x,
            y: abutment.terrainY + abutment.height * 0.5,
            z: abutment.z,
            height: abutment.height
          }))
        } : null,
        endpoints: road.transportStructureRef ? {
          start: road.transportStructureRef.start,
          end: road.transportStructureRef.end
        } : null
      }));

    ctx.setTravelMode?.('drone', { source: 'monaco-structure-ownership', force: true });
    const terrainY = Number(ctx.SurfaceQuery?.terrainAt?.(target.x, target.z)?.position?.y) || 0;
    ctx.drone.x = target.x - 55;
    ctx.drone.y = terrainY + 28;
    ctx.drone.z = target.z + 55;
    ctx.drone.yaw = Math.atan2(ctx.drone.x - target.x, ctx.drone.z - target.z);
    ctx.drone.pitch = -0.18;
    ctx.drone.roll = 0;
    ctx.drone.cameraYawOffset = 0;

    return {
      generatedAt: new Date().toISOString(),
      targetGeo,
      targetWorld: { x: target.x, y: terrainY, z: target.z },
      structureVisualCounts: (ctx.structureVisualMeshes || []).map((mesh) => ({
        type: String(mesh.userData?.structureVisualType || ''),
        instances: Number(mesh.count || 0),
        color: mesh.material?.color?.getHexString?.() || null
      })),
      nearbyInstances: nearbyInstances.sort((left, right) => left.distance - right.distance),
      nearbyRoads,
      consoleErrors: []
    };
  }, { targetGeo });
  report.consoleErrors = consoleErrors;
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(outputDir, 'all-owners.png'), fullPage: false });

  const visualTypes = ['supports', 'portals', 'walls', 'roofs', 'tunnel_shells', 'elevated_road_shells'];
  for (const type of visualTypes) {
    await page.evaluate((type) => {
      for (const mesh of window.__ownershipCtx.structureVisualMeshes || []) {
        mesh.visible = mesh.userData?.structureVisualType === type;
      }
    }, type);
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(outputDir, `${type}-only.png`), fullPage: false });
  }
  await page.evaluate(() => {
    for (const mesh of window.__ownershipCtx.structureVisualMeshes || []) mesh.visible = true;
  });

  report.driveProbe = await page.evaluate(async ({ targetGeo }) => {
    const ctx = window.__ownershipCtx;
    const target = ctx.geoToWorld(targetGeo.lat, targetGeo.lon);
    const coveredRoads = (ctx.roads || []).filter((road) => road?.structureSemantics?.structureKind === 'covered');
    const candidates = coveredRoads.length > 0 ? coveredRoads : (ctx.roads || []);
    let nearest = null;
    for (const road of candidates) {
      for (let index = 0; index < (road.pts?.length || 0) - 1; index += 1) {
        const start = road.pts[index];
        const end = road.pts[index + 1];
        const dx = end.x - start.x;
        const dz = end.z - start.z;
        const lengthSquared = dx * dx + dz * dz;
        if (!(lengthSquared > 0.01)) continue;
        const t = Math.max(0, Math.min(1, ((target.x - start.x) * dx + (target.z - start.z) * dz) / lengthSquared));
        const x = start.x + dx * t;
        const z = start.z + dz * t;
        const distance = Math.hypot(x - target.x, z - target.z);
        if (nearest && distance >= nearest.distance) continue;
        nearest = { road, x, z, distance, tangentX: dx / Math.sqrt(lengthSquared), tangentZ: dz / Math.sqrt(lengthSquared) };
      }
    }
    if (!nearest) throw new Error('No mapped road found near the Monaco regression coordinate');
    const { sampleFeatureSurfaceY } = await import('/app/js/structure-semantics.js?v=46');
    const { resolveTunnelCameraEnvelope } = await import('/app/js/hud/tunnel-camera-envelope.js?v=3');
    const y = Number(sampleFeatureSurfaceY(nearest.road, nearest.x, nearest.z));
    ctx.setTravelMode?.('drive', { source: 'monaco-structure-ownership', force: true });
    ctx.car.x = nearest.x;
    ctx.car.y = y;
    ctx.car.z = nearest.z;
    ctx.car.angle = Math.atan2(nearest.tangentX, nearest.tangentZ);
    ctx.car.road = nearest.road;
    ctx.car.speed = 0;
    ctx.car.velocityX = 0;
    ctx.car.velocityZ = 0;
    const collision = ctx.checkBuildingCollision?.(
      nearest.x,
      nearest.z,
      0.92,
      { actorBaseY: y, actorHeight: 1.9 }
    );
    const envelope = resolveTunnelCameraEnvelope(nearest.road, nearest.x, nearest.z);
    return {
      road: nearest.road.name || null,
      identity: nearest.road.transportRecord?.identity || null,
      coveredRoadAvailable: coveredRoads.length > 0,
      probedCoveredRoad: nearest.road.structureSemantics?.structureKind === 'covered',
      distanceFromTarget: nearest.distance,
      world: { x: nearest.x, y, z: nearest.z },
      syntheticStructureCollision: collision?.building?.geometrySource === 'compiled_transport_structures',
      cameraInside: envelope.inside,
      cameraReason: envelope.reason
    };
  }, { targetGeo });
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(outputDir, 'covered-road-drive.png'), fullPage: false });

  const nearbyInstanced = report.nearbyInstances.filter((instance) => instance.instanceId !== null);
  assert.equal(nearbyInstanced.length, 0, 'covered/building-passage tags published freestanding structure instances');
  assert.equal(report.driveProbe.syntheticStructureCollision, false, 'covered road retained a synthetic tunnel wall collider');
  assert.equal(report.driveProbe.cameraInside, false, 'covered road retained tag-only tunnel camera mode');
  assert.deepEqual(report.consoleErrors, []);

  await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({
    targetGeo: report.targetGeo,
    structureVisualCounts: report.structureVisualCounts,
    nearbyInstanceCounts: report.nearbyInstances.reduce((counts, instance) => {
      if (instance.instanceId === null) return counts;
      counts[instance.type] = (counts[instance.type] || 0) + 1;
      return counts;
    }, {}),
    nearbyCoveredRoads: report.nearbyRoads.filter((road) => road.structureKind === 'covered').length,
    driveProbe: report.driveProbe,
    consoleErrors: report.consoleErrors
  }, null, 2)}\n`);
} finally {
  await browser.close();
  await server?.close?.();
}
