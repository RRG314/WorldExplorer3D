import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticRootServer } from './test-static-server.mjs';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'output', 'playwright', 'monaco-tunnels');
await fs.mkdir(outputDir, { recursive: true });

const server = await startStaticRootServer({
  rootDir,
  host: '127.0.0.1',
  candidatePorts: [4304, 4305, 4306, 4307]
});
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
  await page.goto(`http://127.0.0.1:${server.port}/app/?monaco-tunnel-contract=1`, {
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
          window.__monacoCtx = ctx;
          return;
        }
      }
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    throw new Error('Earth runtime bootstrap timed out');
  });
  await page.evaluate(async () => {
    const ctx = window.__monacoCtx;
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
    const ctx = window.__monacoCtx;
    return ctx.worldLoading !== true &&
      ctx.worldLoadRuntimeState?.status === 'ready' &&
      ctx.worldPublication?.requestId?.endsWith?.(':monaco') &&
      Number(ctx.roads?.length || 0) > 0;
  }, null, { timeout: 120000 });
  await page.waitForFunction(() => (
    window.__monacoCtx?.farTerrainClipmapState?.status === 'ready'
  ), null, { timeout: 90000 });

  const report = await page.evaluate(async () => {
    const ctx = window.__monacoCtx;
    const { sampleFeatureSurfaceY } = await import('/app/js/structure-semantics.js?v=46');
    const {
      findSweptVehicleBuildingCollision,
      isVehicleBuildingCollisionBlocking
    } = await import('/app/js/physics/building-collision-response.js');
    const pointAtDistance = (road, distance) => {
      let remaining = Math.max(0, Number(distance) || 0);
      for (let index = 0; index < (road?.pts?.length || 0) - 1; index += 1) {
        const start = road.pts[index];
        const end = road.pts[index + 1];
        const dx = end.x - start.x;
        const dz = end.z - start.z;
        const length = Math.hypot(dx, dz);
        if (!(length > 0)) continue;
        if (remaining <= length || index === road.pts.length - 2) {
          const t = Math.max(0, Math.min(1, remaining / length));
          return {
            x: start.x + dx * t,
            z: start.z + dz * t,
            tangentX: dx / length,
            tangentZ: dz / length
          };
        }
        remaining -= length;
      }
      return null;
    };
    const exactTunnels = (ctx.roads || []).filter((road) => (
      road?.structureSemantics?.terrainMode === 'subgrade' &&
      road?.transportRecord?.completeness === 'lossless' &&
      road?.tunnelSystemModel?.visualKind === 'tunnel' &&
      (road?.tunnelSystemModel?.shellRanges?.length || 0) > 0
    ));
    const samples = [];
    for (const road of exactTunnels) {
      for (const range of road.tunnelSystemModel.shellRanges || []) {
        const start = Number(range.start) || 0;
        const end = Number(range.end) || 0;
        const usableStart = Math.min(end, start + Math.min(12, (end - start) * 0.2));
        const usableEnd = Math.max(start, end - Math.min(12, (end - start) * 0.2));
        const count = Math.max(2, Math.min(24, Math.ceil((usableEnd - usableStart) / 10)));
        for (let index = 0; index <= count; index += 1) {
          const distance = usableStart + (usableEnd - usableStart) * index / count;
          const point = pointAtDistance(road, distance);
          if (!point) continue;
          const surfaceY = Number(sampleFeatureSurfaceY(road, point.x, point.z));
          const terrainY = Number(ctx.SurfaceQuery?.terrainAt?.(point.x, point.z)?.position?.y);
          const roofY = surfaceY +
            Number(road.tunnelSystemModel.clearance || 0) +
            Number(road.tunnelSystemModel.roofThickness || 0);
          if (![surfaceY, terrainY, roofY].every(Number.isFinite)) continue;
          samples.push({
            road,
            point,
            distance,
            surfaceY,
            terrainY,
            roofY,
            roofAboveTerrain: roofY - terrainY
          });
        }
      }
    }
    samples.sort((left, right) => right.roofAboveTerrain - left.roofAboveTerrain);
    const focus = samples[0] || null;
    const collisionResults = [];
    for (const sample of samples.slice(0, 80)) {
      const width = Math.max(3.4, Number(sample.road?.width) || 6);
      const wallOffset = width * 0.5 + 0.72;
      const normalX = -sample.point.tangentZ;
      const normalZ = sample.point.tangentX;
      const centerCollision = ctx.checkBuildingCollision?.(
        sample.point.x,
        sample.point.z,
        0.92,
        { actorBaseY: sample.surfaceY, actorHeight: 1.9 }
      );
      const wallCollision = ctx.checkBuildingCollision?.(
        sample.point.x + normalX * wallOffset,
        sample.point.z + normalZ * wallOffset,
        0.92,
        { actorBaseY: sample.surfaceY, actorHeight: 1.9 }
      );
      // During actual driving the controller retains this road as car.road.
      // Use that continuity-owned result instead of whichever parallel bore a
      // stateless nearest-road query happens to score first.
      const centerNearestRoad = { dist: 0, road: sample.road };
      const wallX = sample.point.x + normalX * wallOffset;
      const wallZ = sample.point.z + normalZ * wallOffset;
      const wallNearestRoad = ctx.findNearestRoad?.(wallX, wallZ, {
        y: sample.surfaceY + 1.2,
        maxVerticalDelta: 18,
        preferredRoad: sample.road
      });
      collisionResults.push({
        roadSourceId: sample.road?.transportRecord?.identity || null,
        point: sample.point,
        centerBlocked: centerCollision?.collision === true &&
          centerCollision?.building?.geometrySource === 'compiled_transport_structures' &&
          isVehicleBuildingCollisionBlocking(centerCollision, centerNearestRoad),
        centerColliderSourceId: centerCollision?.building?.sourceBuildingId || null,
        centerColliderKind: centerCollision?.building?.structureColliderKind || null,
        wallBlocked: wallCollision?.collision === true &&
          wallCollision?.building?.geometrySource === 'compiled_transport_structures' &&
          isVehicleBuildingCollisionBlocking(wallCollision, wallNearestRoad),
        wallKind: wallCollision?.building?.structureColliderKind || null
      });
    }
    let solidBuildingCollision = null;
    let solidBuildingSweep = null;
    for (const building of ctx.buildings || []) {
      if (
        building?.colliderDetail !== 'full' ||
        building?.geometrySource === 'compiled_transport_structures' ||
        !Array.isArray(building?.pts) ||
        building.pts.length < 3
      ) continue;
      const point = building.pts.reduce((center, candidate) => ({
        x: center.x + Number(candidate.x) / building.pts.length,
        z: center.z + Number(candidate.z) / building.pts.length
      }), { x: 0, z: 0 });
      const actorBaseY = Number(building.minY ?? building.baseY ?? 0) + 0.1;
      const collision = ctx.checkBuildingCollision?.(
        point.x,
        point.z,
        0.92,
        { actorBaseY, actorHeight: 1.9 }
      );
      if (collision?.collision !== true || collision?.building !== building) continue;
      const nearestRoad = ctx.findNearestRoad?.(point.x, point.z, {
        y: actorBaseY + 1.2,
        maxVerticalDelta: 18
      });
      solidBuildingCollision = {
        sourceBuildingId: building.sourceBuildingId || null,
        buildingType: building.buildingType || null,
        point,
        onRoadDistance: Number(nearestRoad?.dist),
        blocking: isVehicleBuildingCollisionBlocking(collision, nearestRoad)
      };
      const previousAngle = Number(ctx.car?.angle) || 0;
      ctx.car.angle = Math.PI * 0.5;
      const sweep = findSweptVehicleBuildingCollision(
        ctx,
        ctx.checkBuildingCollision,
        point.x - 60,
        point.z,
        point.x + 60,
        point.z,
        actorBaseY
      );
      ctx.car.angle = previousAngle;
      solidBuildingSweep = sweep ? {
        sourceBuildingId: sweep.buildingCheck?.building?.sourceBuildingId || null,
        hitX: Number(sweep.x),
        hitZ: Number(sweep.z),
        lastSafeX: Number(sweep.lastSafeX)
      } : null;
      if (solidBuildingCollision.blocking) break;
    }
    const streetLevelTunnelCollisionSamples = (ctx.transportStructureColliders || [])
      .filter((collider) => (
        collider?.structureColliderKind === 'side_wall' &&
        collider?.transportTerrainMode === 'subgrade'
      ))
      .slice(0, 240)
      .map((collider) => {
        const point = collider.pts.reduce((center, candidate) => ({
          x: center.x + Number(candidate.x) / collider.pts.length,
          z: center.z + Number(candidate.z) / collider.pts.length
        }), { x: 0, z: 0 });
        const terrainY = Number(ctx.SurfaceQuery?.terrainAt?.(point.x, point.z)?.position?.y);
        const collision = ctx.checkBuildingCollision?.(
          point.x,
          point.z,
          0.2,
          { actorBaseY: terrainY, actorHeight: 1.9 }
        );
        return {
          terrainY,
          colliderMaxY: Number(collider.maxY),
          blockedByTunnelWall: collision?.building === collider
        };
      })
      .filter((sample) => Number.isFinite(sample.terrainY));
    if (focus) {
      const side = 72;
      const rear = 105;
      const viewX = -focus.point.tangentX * rear - focus.point.tangentZ * side;
      const viewZ = -focus.point.tangentZ * rear + focus.point.tangentX * side;
      ctx.setTravelMode?.('drone', { source: 'monaco-tunnel-contract', force: true });
      ctx.drone.x = focus.point.x + viewX;
      ctx.drone.y = focus.terrainY + 62;
      ctx.drone.z = focus.point.z + viewZ;
      ctx.drone.yaw = Math.atan2(viewX, viewZ);
      ctx.drone.pitch = -Math.atan2(48, Math.hypot(viewX, viewZ));
      ctx.drone.roll = 0;
      ctx.drone.cameraYawOffset = 0;
    }
    return {
      generatedAt: new Date().toISOString(),
      roads: Number(ctx.roads?.length || 0),
      exactTunnels: exactTunnels.length,
      tunnelSamples: samples.length,
      maximumRoofAboveTerrain: Number(samples[0]?.roofAboveTerrain),
      medianRoofAboveTerrain: Number(samples[Math.floor(samples.length * 0.5)]?.roofAboveTerrain),
      minimumRoofAboveTerrain: Number(samples.at(-1)?.roofAboveTerrain),
      focus: focus ? {
        name: focus.road?.name || null,
        sourceId: focus.road?.transportRecord?.identity || null,
        point: focus.point,
        surfaceY: focus.surfaceY,
        terrainY: focus.terrainY,
        roofY: focus.roofY,
        roofAboveTerrain: focus.roofAboveTerrain
      } : null,
      tunnelColliders: (ctx.transportStructureColliders || []).reduce((counts, collider) => {
        const kind = collider?.structureColliderKind || 'unknown';
        counts[kind] = (counts[kind] || 0) + 1;
        return counts;
      }, {}),
      wallCollisionSamples: collisionResults.length,
      wallCollisionHits: collisionResults.filter((result) => result.wallBlocked).length,
      tunnelCenterFalseBlocks: collisionResults.filter((result) => result.centerBlocked).length,
      tunnelCenterFalseBlockDetails: collisionResults.filter((result) => result.centerBlocked).slice(0, 20),
      streetLevelTunnelCollisionSamples: streetLevelTunnelCollisionSamples.length,
      streetLevelTunnelFalseBlocks: streetLevelTunnelCollisionSamples.filter((sample) => sample.blockedByTunnelWall).length,
      solidBuildingCollision,
      solidBuildingSweep,
      structureVisuals: (ctx.structureVisualMeshes || []).map((mesh) => ({
        type: mesh?.userData?.structureVisualType || null,
        instances: Number(mesh?.count || 0),
        vertices: Number(mesh?.geometry?.attributes?.position?.count || 0)
      })),
      consoleErrors: []
    };
  });
  report.consoleErrors = consoleErrors;
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outputDir, 'monaco-worst-tunnel.png') });
  report.steepDrive = await page.evaluate(async () => {
    const ctx = window.__monacoCtx;
    const { sampleFeatureSurfaceY } = await import('/app/js/structure-semantics.js?v=46');
    let steepest = null;
    for (const road of ctx.roads || []) {
      if (road?.structureSemantics?.terrainMode !== 'at_grade') continue;
      for (let index = 0; index < (road.pts?.length || 0) - 1; index += 1) {
        const start = road.pts[index];
        const end = road.pts[index + 1];
        const length = Math.hypot(end.x - start.x, end.z - start.z);
        if (length < 8 || length > 80) continue;
        const centerX = (start.x + end.x) * 0.5;
        const centerZ = (start.z + end.z) * 0.5;
        if (Math.hypot(centerX, centerZ) > 1300 || Number(road.width) < 5) continue;
        const startY = Number(sampleFeatureSurfaceY(road, start.x, start.z));
        const endY = Number(sampleFeatureSurfaceY(road, end.x, end.z));
        if (![startY, endY].every(Number.isFinite)) continue;
        const grade = Math.abs(endY - startY) / length;
        if (grade > 0.18) continue;
        if (!steepest || grade > steepest.grade) {
          steepest = { road, start, end, startY, endY, grade };
        }
      }
    }
    if (!steepest) return null;
    const high = steepest.startY >= steepest.endY ? steepest.start : steepest.end;
    const low = steepest.startY >= steepest.endY ? steepest.end : steepest.start;
    const x = (high.x + low.x) * 0.5;
    const z = (high.z + low.z) * 0.5;
    const surfaceY = Number(sampleFeatureSurfaceY(steepest.road, x, z));
    ctx.setTravelMode?.('drive', { source: 'monaco-steep-camera-contract', force: true });
    Object.assign(ctx.car, {
      x,
      z,
      y: surfaceY + 1.2,
      angle: Math.atan2(low.x - high.x, low.z - high.z),
      speed: 0,
      vFwd: 0,
      vLat: 0,
      vx: 0,
      vz: 0,
      road: steepest.road,
      onRoad: true
    });
    ctx.camMode = 0;
    if (ctx.carMesh) {
      ctx.carMesh.position.set(x, surfaceY + 1.2, z);
      ctx.carMesh.visible = true;
    }
    for (let frame = 0; frame < 20; frame += 1) ctx.updateCamera?.(1 / 60);
    const look = { x: ctx.car.x, y: ctx.car.y - 0.7, z: ctx.car.z };
    const camera = {
      x: Number(ctx.camera.position.x),
      y: Number(ctx.camera.position.y),
      z: Number(ctx.camera.position.z)
    };
    let minimumSegmentClearance = Infinity;
    for (let index = 1; index <= 20; index += 1) {
      const t = index / 20;
      const sampleX = look.x + (camera.x - look.x) * t;
      const sampleY = look.y + (camera.y - look.y) * t;
      const sampleZ = look.z + (camera.z - look.z) * t;
      const terrainY = Number(ctx.SurfaceQuery?.terrainAt?.(sampleX, sampleZ)?.position?.y);
      if (Number.isFinite(terrainY)) minimumSegmentClearance = Math.min(minimumSegmentClearance, sampleY - terrainY);
    }
    return {
      road: steepest.road.name || null,
      grade: steepest.grade,
      car: { x: ctx.car.x, y: ctx.car.y, z: ctx.car.z },
      camera,
      cameraGroundClearance: camera.y - Number(ctx.SurfaceQuery?.terrainAt?.(camera.x, camera.z)?.position?.y),
      minimumSegmentClearance
    };
  });
  if (report.steepDrive) {
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(900);
    await page.keyboard.up('ArrowUp');
    await page.waitForTimeout(350);
    const postDrive = await page.evaluate(() => {
      const ctx = window.__monacoCtx;
      const look = { x: ctx.car.x, y: ctx.car.y - 0.7, z: ctx.car.z };
      const camera = {
        x: Number(ctx.camera.position.x),
        y: Number(ctx.camera.position.y),
        z: Number(ctx.camera.position.z)
      };
      let minimumSegmentClearance = Infinity;
      for (let index = 1; index <= 20; index += 1) {
        const t = index / 20;
        const x = look.x + (camera.x - look.x) * t;
        const y = look.y + (camera.y - look.y) * t;
        const z = look.z + (camera.z - look.z) * t;
        const terrainY = Number(ctx.SurfaceQuery?.terrainAt?.(x, z)?.position?.y);
        if (Number.isFinite(terrainY)) minimumSegmentClearance = Math.min(minimumSegmentClearance, y - terrainY);
      }
      return {
        car: { x: ctx.car.x, y: ctx.car.y, z: ctx.car.z },
        camera,
        minimumSegmentClearance
      };
    });
    report.steepDrive.movementMeters = Math.hypot(
      postDrive.car.x - report.steepDrive.car.x,
      postDrive.car.z - report.steepDrive.car.z
    );
    report.steepDrive.postDrive = postDrive;
  }
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outputDir, 'monaco-steep-drive-camera.png') });
  report.mountainContinuity = await page.evaluate(() => {
    const ctx = window.__monacoCtx;
    const target = ctx.geoToWorld(43.7483, 7.4279);
    const terrainY = Number(ctx.SurfaceQuery?.terrainAt?.(target.x, target.z)?.position?.y || 0);
    ctx.setTravelMode?.('drone', { source: 'monaco-mountain-continuity-contract', force: true });
    ctx.drone.x = target.x;
    ctx.drone.y = terrainY + 178;
    ctx.drone.z = target.z;
    // The gameplay compass heading is opposite the camera's look vector in
    // this diagnostic drone setup; 71 degrees reproduces the user's W 251°
    // mountain-facing view without depending on the plane model lifecycle.
    ctx.drone.yaw = 71 * Math.PI / 180;
    ctx.drone.pitch = -0.12;
    ctx.drone.roll = 0;
    ctx.drone.cameraYawOffset = 0;
    ctx.setTimeOfDay?.('day');
    document.querySelectorAll('.tutorial-popup, .tutorial-hint').forEach((element) => element.remove());
    const materials = (ctx.buildingMeshes || []).flatMap((mesh) => (
      Array.isArray(mesh?.material) ? mesh.material : [mesh?.material]
    )).filter(Boolean);
    const exteriorMaterials = materials.filter((material) => material?.userData?.buildingExterior === true);
    const facadeMaterials = exteriorMaterials.filter((material) => material?.userData?.facadeAtlas === true);
    const farFacadeOwners = (ctx.terrainGroup?.children || [])
      .filter((object) => object?.userData?.isFarMappedContext)
      .flatMap((object) => [object, ...(object.children || [])])
      .map((object) => ({
        name: object.name || '',
        detail: object.material?.userData?.farBuildingFacadeDetail || null,
        coverage: object.material?.userData?.farBuildingFacadeCoverage || null
      }));
    return {
      geographic: { lat: 43.7483, lon: 7.4279 },
      terrainY,
      farTerrain: ctx.farTerrainClipmapState || null,
      detailedExteriorMaterials: exteriorMaterials.length,
      detailedFacadeMaterials: facadeMaterials.length,
      farFacadeOwners
    };
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(outputDir, 'monaco-mountain-terrain-facades.png') });
  await page.evaluate(() => {
    const ctx = window.__monacoCtx;
    window.__monacoDetailedTerrainVisibility = (ctx.terrainGroup?.children || [])
      .filter((mesh) => mesh?.userData?.isTerrainMesh && !mesh?.userData?.isFixedLocationTerrainLod)
      .map((mesh) => ({ mesh, visible: mesh.visible }));
    window.__monacoDetailedTerrainVisibility.forEach(({ mesh }) => { mesh.visible = false; });
  });
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(outputDir, 'monaco-mountain-far-terrain-only.png') });
  await page.evaluate(() => {
    const ctx = window.__monacoCtx;
    window.__monacoDetailedTerrainVisibility?.forEach(({ mesh, visible }) => { mesh.visible = visible; });
    window.__monacoFarTerrainVisibility = (ctx.terrainGroup?.children || [])
      .filter((mesh) => mesh?.userData?.isFixedLocationTerrainLod)
      .map((mesh) => ({ mesh, visible: mesh.visible }));
    window.__monacoFarTerrainVisibility.forEach(({ mesh }) => { mesh.visible = false; });
  });
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(outputDir, 'monaco-mountain-detailed-terrain-only.png') });
  await page.evaluate(() => {
    window.__monacoFarTerrainVisibility?.forEach(({ mesh, visible }) => { mesh.visible = visible; });
  });
  await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));

  assert.ok(report.exactTunnels > 0, `Monaco published no exact tunnels: ${JSON.stringify(report)}`);
  assert.ok(report.tunnelSamples > 0, `Monaco tunnel cover could not be sampled: ${JSON.stringify(report)}`);
  assert.ok(
    report.maximumRoofAboveTerrain <= 0.2,
    `Monaco tunnel roof escaped above terrain: ${JSON.stringify(report.focus)}`
  );
  assert.ok(
    Number(report.tunnelColliders.side_wall || 0) > 0,
    `Monaco exact tunnel walls have no collision owner: ${JSON.stringify(report.tunnelColliders)}`
  );
  assert.ok(
    report.wallCollisionHits > 0,
    `Monaco tunnel wall probes passed through compiled walls: ${JSON.stringify(report)}`
  );
  assert.equal(
    report.tunnelCenterFalseBlocks,
    0,
    `Monaco tunnel centerline is blocked by its own shell: ${JSON.stringify(report)}`
  );
  assert.equal(
    report.streetLevelTunnelFalseBlocks,
    0,
    `subgrade tunnel walls leaked into street-level collision: ${JSON.stringify(report)}`
  );
  assert.equal(
    report.solidBuildingCollision?.blocking,
    true,
    `Monaco full-detail building did not stop the vehicle collision policy: ${JSON.stringify(report.solidBuildingCollision)}`
  );
  assert.ok(
    report.solidBuildingSweep?.sourceBuildingId,
    `a real Monaco building was skipped by swept vehicle collision: ${JSON.stringify(report.solidBuildingSweep)}`
  );
  assert.ok(report.steepDrive?.grade > 0.04, `Monaco steep-road fixture was not found: ${JSON.stringify(report.steepDrive)}`);
  assert.ok(
    report.steepDrive?.minimumSegmentClearance >= 0.18 &&
      report.steepDrive?.postDrive?.minimumSegmentClearance >= 0.18,
    `chase camera clipped through steep terrain: ${JSON.stringify(report.steepDrive)}`
  );
  assert.ok(report.steepDrive?.movementMeters > 0.5, `car did not move on the steep-road fixture: ${JSON.stringify(report.steepDrive)}`);
  assert.equal(
    report.mountainContinuity?.farTerrain?.farWaterTerrainMaskPolygons,
    report.mountainContinuity?.farTerrain?.farWaterPolygons,
    `regional terrain contains water cutouts without matching water geometry: ${JSON.stringify(report.mountainContinuity?.farTerrain)}`
  );
  assert.ok(
    Number(report.mountainContinuity?.farTerrain?.vertices || 0) >= 150000,
    `fixed Monaco mountain terrain is still too coarse: ${JSON.stringify(report.mountainContinuity?.farTerrain)}`
  );
  assert.equal(
    report.mountainContinuity?.detailedFacadeMaterials,
    report.mountainContinuity?.detailedExteriorMaterials,
    `some detailed Monaco building materials lack facade ownership: ${JSON.stringify(report.mountainContinuity)}`
  );
  assert.ok(
    report.mountainContinuity?.farFacadeOwners?.length > 0 &&
      report.mountainContinuity.farFacadeOwners.every((entry) => (
        entry.detail === 'world-space-antialiased-window-grid' &&
        entry.coverage === 'entire-fixed-map'
      )),
    `some regional Monaco building tier lacks full-map facades: ${JSON.stringify(report.mountainContinuity?.farFacadeOwners)}`
  );
  assert.deepEqual(consoleErrors, [], `Monaco emitted runtime errors: ${JSON.stringify(consoleErrors)}`);
  console.log(JSON.stringify({ ok: true, ...report }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
