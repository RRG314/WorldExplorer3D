import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticRootServer } from './test-static-server.mjs';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'output', 'playwright', 'fixed-world-travel');
const durationSeconds = Math.max(30, Number(process.env.WE3D_TRAVEL_SECONDS) || 30);
const worldDataPattern = /(?:overpass-api|overpass\.private|elevation-tiles-prod|titiler\.terrascope|shortbread_v1|overturemaps-extras|\/api\/geospatial\/(?:terrain|buildings|world)|accepted-ground)/i;

await fs.mkdir(outputDir, { recursive: true });
const server = await startStaticRootServer({
  rootDir,
  host: '127.0.0.1',
  candidatePorts: [4240, 4241, 4242, 4243]
});
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const consoleErrors = [];
const requests = [];
let phase = 'bootstrap';

page.on('request', (request) => {
  requests.push({
    phase,
    method: request.method(),
    resourceType: request.resourceType(),
    url: request.url(),
    worldData: worldDataPattern.test(request.url())
  });
});
page.on('pageerror', (error) => consoleErrors.push(String(error?.message || error)));
page.on('console', (message) => {
  if (message.type() !== 'error') return;
  const text = message.text();
  if (/Failed to load resource|Could not reach Cloud Firestore|blocked by CORS/i.test(text)) return;
  consoleErrors.push(text);
});

async function readWorldState() {
  return page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return {
      env: ctx.getEnv?.(),
      earthEnv: ctx.ENV?.EARTH,
      spaceEnv: ctx.ENV?.SPACE_FLIGHT,
      selection: ctx.selLoc,
      requestId: ctx.worldPublication?.requestId || null,
      travelMode: ctx.getCurrentTravelMode?.() || null,
      actor: ctx.planeMode?.active ? {
        kind: 'plane',
        x: Number(ctx.planeMode.x),
        y: Number(ctx.planeMode.y),
        z: Number(ctx.planeMode.z)
      } : {
        kind: 'car',
        x: Number(ctx.car?.x),
        y: Number(ctx.car?.y),
        z: Number(ctx.car?.z)
      },
      camera: {
        x: Number(ctx.camera?.position?.x),
        y: Number(ctx.camera?.position?.y),
        z: Number(ctx.camera?.position?.z)
      },
      publication: ctx.verifyWorldPublicationStable?.() || null,
      scene: ctx.getEarthScenePublicationState?.() || null,
      worldLoading: Boolean(ctx.worldLoading),
      providerInFlight: Object.fromEntries(
        Object.entries(ctx.worldLoadRuntimeState?.session?.providers || {}).map(([id, value]) => [
          id,
          Number(value?.inFlight || 0)
        ])
      ),
      farTerrain: ctx.farTerrainClipmapState ? {
        status: ctx.farTerrainClipmapState.status,
        elevationMaxInFlight: Number(ctx.farTerrainClipmapState.elevationMaxInFlight || 0),
        terrainCoverage: ctx.farTerrainClipmapState.terrainCoverage || null,
        mappedSurfaceTintAreas: Number(ctx.farTerrainClipmapState.mappedSurfaceTintAreas || 0),
        mappedSurfaceTintVertices: Number(ctx.farTerrainClipmapState.mappedSurfaceTintVertices || 0),
        detailedMappedSurfaceTintVertices: Number(ctx.farTerrainClipmapState.detailedMappedSurfaceTintVertices || 0)
      } : null
    };
  });
}

try {
  await page.goto(`http://127.0.0.1:${server.port}/app/?fixed-world-travel=1`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000
  });
  await page.evaluate(async () => {
    const deadline = performance.now() + 120000;
    let ctx = null;
    while (performance.now() < deadline) {
      ({ ctx } = await import('/app/js/shared-context.js?v=55'));
      if (
        typeof ctx?.loadRoads === 'function' &&
        typeof ctx?.setTravelMode === 'function' &&
        typeof ctx?.startSpaceFlightToMoon === 'function' &&
        typeof ctx?.arriveAtEarth === 'function'
      ) return;
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    throw new Error('Runtime bootstrap timed out');
  });

  phase = 'world-load';
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    if (!ctx.selectPresetLocation?.('baltimore')) throw new Error('Baltimore selection failed');
    ctx.gameMode = 'free';
    ctx.gameStarted = true;
    ctx.paused = false;
    ctx.switchEnv?.(ctx.ENV.EARTH);
    document.getElementById('titleScreen')?.classList.add('hidden');
    document.getElementById('globeSelectorScreen')?.classList.remove('show');
    await ctx.loadRoads();
    ctx.startMode?.();
  });
  await page.waitForFunction(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const providers = Object.values(ctx.worldLoadRuntimeState?.session?.providers || {});
    return (
      ctx.worldLoadRuntimeState?.status === 'ready' &&
      ctx.worldLoading !== true &&
      providers.every((provider) => Number(provider?.inFlight || 0) === 0) &&
      ctx.verifyWorldPublicationStable?.().stable === true
    );
  }, null, { timeout: 120000 });
  await page.waitForTimeout(1000);
  const ready = await readWorldState();

  phase = 'drive';
  const driveStart = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const collisionResponse = await import('/app/js/physics/building-collision-response.js?v=5');
    const collisionProfile = collisionResponse.VEHICLE_COLLISION_PROFILE;
    const sampleRoadPoint = (road, fraction) => {
      if (!Array.isArray(road?.pts) || road.pts.length < 2) return null;
      const segmentCount = road.pts.length - 1;
      const target = Math.max(0, Math.min(segmentCount - 1e-6, fraction * segmentCount));
      const index = Math.floor(target);
      const blend = target - index;
      const start = road.pts[index];
      const end = road.pts[index + 1];
      const dx = end.x - start.x;
      const dz = end.z - start.z;
      const length = Math.hypot(dx, dz);
      if (!(length > 0.1)) return null;
      return {
        x: start.x + dx * blend,
        z: start.z + dz * blend,
        tangentX: dx / length,
        tangentZ: dz / length
      };
    };
    const probeClear = (road, point, direction, distance) => {
      const x = point.x + point.tangentX * direction * distance;
      const z = point.z + point.tangentZ * direction * distance;
      const surface = ctx.SurfaceQuery?.driveAt?.(x, z, { preferRoad: true });
      const actorBaseY = Number(surface?.position?.y);
      const nearestRoad = ctx.findNearestRoad?.(x, z, {
        y: actorBaseY,
        maxVerticalDelta: 18,
        preferredRoad: road
      });
      if (nearestRoad?.road !== road || !Number.isFinite(actorBaseY)) return false;
      const forwardX = point.tangentX * direction;
      const forwardZ = point.tangentZ * direction;
      return [
        collisionProfile.centerlineHalfLength,
        0,
        -collisionProfile.centerlineHalfLength
      ].every((longitudinalOffset) => {
        const collision = ctx.checkBuildingCollision?.(
          x + forwardX * longitudinalOffset,
          z + forwardZ * longitudinalOffset,
          collisionProfile.radius,
          { actorBaseY, actorHeight: 1.9 }
        );
        return !collisionResponse.isVehicleBuildingCollisionBlocking(collision, nearestRoad);
      });
    };
    let route = null;
    const roads = (ctx.roads || []).filter((road) => road?.driveable !== false);
    const roadStep = Math.max(1, Math.floor(roads.length / 320));
    for (let index = 0; index < roads.length && !route; index += roadStep) {
      const road = roads[index];
      for (const fraction of [0.2, 0.5, 0.8]) {
        const point = sampleRoadPoint(road, fraction);
        if (!point) continue;
        for (const direction of [1, -1]) {
          if (![0, 8, 16, 24, 32].every((distance) => probeClear(road, point, direction, distance))) continue;
          route = {
            points: [
              { x: point.x, z: point.z },
              {
                x: point.x + point.tangentX * direction * 32,
                z: point.z + point.tangentZ * direction * 32
              }
            ],
            distance: 32,
            sourceFeatureId: road.sourceFeatureId || null,
            type: road.type || null,
            width: Number(road.width)
          };
          break;
        }
        if (route) break;
      }
    }
    if (!route) throw new Error('No real mapped drive route was available');
    const first = route.points[0];
    const second = route.points[1];
    const spawn = ctx.resolveSafeWorldSpawn(first.x, first.z, {
      mode: 'drive',
      angle: Math.atan2(second.x - first.x, second.z - first.z),
      source: 'fixed_world_travel'
    });
    ctx.applyResolvedWorldSpawn(spawn, { mode: 'drive', syncCar: true, syncWalker: true });
    ctx.setTravelMode('drive', { source: 'fixed_world_travel', emitTutorial: false, force: true });
    window.__fixedWorldDrive = {
      route,
      waypoint: 1,
      lastX: ctx.car.x,
      lastZ: ctx.car.z,
      pathDistance: 0,
      completed: false
    };
    ctx.keys.ArrowUp = true;
    window.__fixedWorldDriveTimer = window.setInterval(() => {
      const state = window.__fixedWorldDrive;
      const actor = ctx.car;
      const step = Math.hypot(actor.x - state.lastX, actor.z - state.lastZ);
      if (Number.isFinite(step) && step < 20) state.pathDistance += step;
      state.lastX = actor.x;
      state.lastZ = actor.z;
      let target = state.route.points[Math.min(state.waypoint, state.route.points.length - 1)];
      if (Math.hypot(target.x - actor.x, target.z - actor.z) < 3) {
        state.completed = true;
        ctx.keys.ArrowUp = false;
        actor.speed = 0;
        actor.vFwd = 0;
        actor.vLat = 0;
        actor.vx = 0;
        actor.vz = 0;
        return;
      }
      while (
        state.waypoint < state.route.points.length - 1 &&
        Math.hypot(target.x - actor.x, target.z - actor.z) < 10
      ) {
        state.waypoint += 1;
        target = state.route.points[state.waypoint];
      }
      actor.angle = Math.atan2(target.x - actor.x, target.z - actor.z);
      actor.yawRate = 0;
      actor.steerSm = 0;
    }, 100);
    return {
      x: ctx.car.x,
      z: ctx.car.z,
      routeDistance: route.distance,
      routeSourceFeatureId: route.sourceFeatureId,
      routeType: route.type,
      routeWidth: route.width
    };
  });
  await page.waitForTimeout(durationSeconds * 1000);
  const drive = await page.evaluate(async ({ seconds, start }) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.keys.ArrowUp = false;
    window.clearInterval(window.__fixedWorldDriveTimer);
    return {
      seconds,
      start,
      end: { x: ctx.car.x, z: ctx.car.z },
      displacement: Math.hypot(ctx.car.x - start.x, ctx.car.z - start.z),
      pathDistance: Number(window.__fixedWorldDrive?.pathDistance || 0),
      completed: window.__fixedWorldDrive?.completed === true,
      speed: Number(ctx.car.speed || 0),
      publication: ctx.verifyWorldPublicationStable?.() || null
    };
  }, { seconds: durationSeconds, start: driveStart });

  phase = 'flight';
  const flightStart = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const meshes = (ctx.terrainGroup?.children || []).filter((mesh) => (
      mesh?.userData?.isTerrainMesh && mesh.visible !== false
    ));
    const bounds = meshes.reduce((result, mesh) => {
      mesh.geometry?.computeBoundingBox?.();
      const box = mesh.geometry?.boundingBox;
      if (!box) return result;
      return {
        minX: Math.min(result.minX, Number(mesh.position?.x || 0) + box.min.x),
        maxX: Math.max(result.maxX, Number(mesh.position?.x || 0) + box.max.x),
        minZ: Math.min(result.minZ, Number(mesh.position?.z || 0) + box.min.z),
        maxZ: Math.max(result.maxZ, Number(mesh.position?.z || 0) + box.max.z)
      };
    }, { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
    if (!Number.isFinite(bounds.minX)) throw new Error('Detailed terrain bounds unavailable');
    const x = bounds.minX + 40;
    const z = (bounds.minZ + bounds.maxZ) * 0.5;
    const ground = ctx.SurfaceQuery.terrainAt(x, z)?.position?.y ?? 0;
    ctx.setTravelMode('plane', {
      source: 'fixed_world_travel',
      emitTutorial: false,
      force: true,
      x,
      y: ground + 220,
      z,
      yaw: -Math.PI / 2,
      pitch: 0,
      speed: 62,
      throttle: 1,
      airborne: true
    });
    if (!ctx.planeMode?.active) throw new Error('Plane mode did not start');
    return { x: ctx.planeMode.x, y: ctx.planeMode.y, z: ctx.planeMode.z, bounds };
  });
  await page.waitForTimeout(durationSeconds * 1000);
  const flight = await page.evaluate(async ({ seconds, start }) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const current = ctx.getPlaneSnapshot?.() || ctx.planeMode;
    const acceptedGround = ctx.sampleAcceptedGroundAtWorldXZ?.(current.x, current.z) || null;
    const fixedLocationTerrainY = ctx.sampleFarTerrainWorldYAt?.(current.x, current.z);
    const traversalTerrainY = ctx.SurfaceQuery?.terrainAt?.(current.x, current.z)?.position?.y;
    return {
      seconds,
      start,
      end: { x: current.x, y: current.y, z: current.z },
      displacement: Math.hypot(current.x - start.x, current.z - start.z),
      boundaryCrossed: current.x < start.bounds.minX - 40,
      active: current.active === true,
      airborne: current.airborne === true,
      acceptedGroundStatus: acceptedGround?.status || null,
      fixedLocationTerrainY: Number(fixedLocationTerrainY),
      traversalTerrainY: Number(traversalTerrainY),
      publication: ctx.verifyWorldPublicationStable?.() || null
    };
  }, { seconds: durationSeconds, start: flightStart });
  await page.screenshot({ path: path.join(outputDir, 'flight-after-boundary-crossing.png') });

  phase = 'space-entry';
  const departurePose = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    if (!await ctx.startSpaceFlightToMoon()) throw new Error('Space flight did not start');
    return ctx.earthSessionState?.pose || null;
  });
  await page.waitForFunction(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.getEnv?.() === ctx.ENV?.SPACE_FLIGHT && ctx.spaceFlight?.active === true;
  }, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const space = await readWorldState();

  phase = 'earth-return';
  const returned = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.arriveAtEarth();
  });
  assert.equal(returned, true, 'Earth arrival was superseded');
  await page.waitForFunction(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return (
      ctx.getEnv?.() === ctx.ENV?.EARTH &&
      ctx.spaceFlight?.active !== true &&
      ctx.earthResumePending !== true &&
      ctx.getEarthScenePublicationState?.().rootVisible === true
    );
  }, null, { timeout: 30000 });
  await page.waitForTimeout(500);
  const restored = await readWorldState();
  await page.screenshot({ path: path.join(outputDir, 'earth-after-space-return.png') });

  const movementRequests = requests.filter((request) => ['drive', 'flight'].includes(request.phase));
  const movementWorldDataRequests = movementRequests.filter((request) => request.worldData);
  const earthReturnWorldDataRequests = requests.filter((request) => (
    request.phase === 'earth-return' && request.worldData
  ));
  const report = {
    generatedAt: new Date().toISOString(),
    durationSeconds,
    ready,
    drive,
    flight,
    departurePose,
    space,
    restored,
    network: {
      totalRequests: requests.length,
      movementRequests,
      movementWorldDataRequests,
      earthReturnWorldDataRequests
    },
    consoleErrors
  };
  await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));

  assert.equal(ready.publication?.stable, true, 'world was unstable before movement');
  assert.equal(
    ready.farTerrain?.terrainCoverage?.unownedCells,
    0,
    `Baltimore contains terrain cells owned by neither detailed nor regional terrain: ${JSON.stringify(ready.farTerrain)}`
  );
  assert.ok(
    ready.farTerrain?.mappedSurfaceTintAreas > 0 &&
      ready.farTerrain?.mappedSurfaceTintVertices > 0 &&
      ready.farTerrain?.detailedMappedSurfaceTintVertices > 0,
    `Baltimore lost deterministic mapped land-use fallback: ${JSON.stringify(ready.farTerrain)}`
  );
  assert.ok(
    drive.pathDistance >= 20 && drive.displacement >= 15,
    `${durationSeconds}-second drive covered only ${drive.pathDistance.toFixed(1)} m ` +
      `(${drive.displacement.toFixed(1)} m displacement)`
  );
  assert.equal(drive.publication?.stable, true, 'drive mutated the published world');
  assert.equal(flight.active, true, 'plane stopped during sustained flight');
  assert.equal(flight.airborne, true, 'plane landed during sustained flight');
  assert.ok(
    Number.isFinite(flight.fixedLocationTerrainY),
    'fixed-location rendered terrain did not publish a traversal height at the aircraft position'
  );
  assert.ok(
    Number.isFinite(flight.traversalTerrainY),
    'traversal lost ground height after crossing the detailed terrain boundary'
  );
  if (flight.acceptedGroundStatus !== 'available') {
    assert.ok(
      Math.abs(flight.traversalTerrainY - flight.fixedLocationTerrainY) < 0.01,
      'traversal did not use the fixed-location terrain height outside accepted detailed coverage'
    );
  }
  assert.equal(
    flight.boundaryCrossed,
    true,
    `${durationSeconds}-second flight did not cross the measured detailed-terrain boundary ` +
      `(${flight.displacement.toFixed(1)} m traveled)`
  );
  assert.equal(flight.publication?.stable, true, 'flight mutated the published world');
  assert.deepEqual(movementWorldDataRequests, [], 'ready-world movement requested fixed-world data');
  assert.equal(space.env, space.spaceEnv, 'space environment was not active');
  assert.equal(restored.env, restored.earthEnv, 'Earth environment was not restored');
  assert.equal(restored.selection, ready.selection, 'Earth return changed the selected location');
  assert.equal(restored.requestId, ready.requestId, 'Earth return republished the location');
  assert.equal(restored.travelMode, 'plane', 'Earth return did not restore the active flight mode');
  assert.equal(restored.actor?.kind, 'plane', 'Earth return did not restore the aircraft pose owner');
  assert.equal(departurePose?.mode, 'plane', 'Space entry did not capture the active aircraft');
  assert.ok(
    Math.hypot(
      restored.actor.x - departurePose.x,
      restored.actor.y - departurePose.planeY,
      restored.actor.z - departurePose.z
    ) < 100,
    'Earth return did not restore the pre-Space aircraft pose'
  );
  assert.equal(restored.publication?.stable, true, 'Earth return restored a mutated publication');
  assert.equal(restored.scene?.rootVisible, true, 'Earth scene root was not visible after return');
  assert.deepEqual(earthReturnWorldDataRequests, [], 'Earth return reloaded fixed-world data');
  assert.deepEqual(consoleErrors, []);
  console.log(JSON.stringify({
    ok: true,
    durationSeconds,
    driveMeters: Number(drive.pathDistance.toFixed(1)),
    flightMeters: Number(flight.displacement.toFixed(1)),
    crossedDetailedTerrainBoundary: flight.boundaryCrossed,
    movementWorldDataRequests: movementWorldDataRequests.length,
    earthReturnWorldDataRequests: earthReturnWorldDataRequests.length,
    restoredRequestId: restored.requestId,
    consoleErrors: consoleErrors.length
  }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
