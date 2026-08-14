import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticRootServer } from './test-static-server.mjs';

// Visual validation must reflect the rendered world, not block indefinitely
// on an optional remote UI font.
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';

const rootDir = process.cwd();
const outputDir = path.join(rootDir, 'output', 'playwright', 'new-york-regional-continuity');
await fs.mkdir(outputDir, { recursive: true });

const server = await startStaticRootServer({
  rootDir,
  host: '127.0.0.1',
  candidatePorts: [4290, 4291, 4292, 4293]
});
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
// Gameplay validation does not depend on a remote webfont. Let Chrome use its
// local fallback so a slow third-party font request cannot hold every visual
// capture for Playwright's full screenshot timeout.
await page.route('**/*', (route) => (
  route.request().resourceType() === 'font' ? route.abort() : route.continue()
));
const consoleErrors = [];
const worldLoadTrace = [];
const shortbreadRequestUrls = [];
page.on('pageerror', (error) => consoleErrors.push(String(error?.message || error)));
page.on('request', (request) => {
  if (/vector\.openstreetmap\.org\/shortbread_v1\//.test(request.url())) {
    shortbreadRequestUrls.push(request.url());
  }
});
page.on('console', (message) => {
  if (/\[WorldLoadTrace\]/.test(message.text())) worldLoadTrace.push(message.text());
  if (message.type() !== 'error') return;
  const text = message.text();
  if (/Failed to load resource|blocked by CORS|Could not reach Cloud Firestore/i.test(text)) return;
  consoleErrors.push(text);
});

try {
  await page.goto(`http://127.0.0.1:${server.port}/app/?new-york-regional-continuity=1&worldLoadTrace=1`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000
  });
  await page.evaluate(async () => {
    const deadline = performance.now() + 120000;
    while (performance.now() < deadline) {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      if (typeof ctx?.loadRoads === 'function' && typeof ctx?.selectPresetLocation === 'function') {
        await ctx.ensureEarthRuntimeReady?.();
        if (ctx.getEarthRuntimeSnapshot?.().ready === true) return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    throw new Error('Runtime bootstrap timed out');
  });
  await page.evaluate(async () => {
    window.__newYorkLongTasks = [];
    if (PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      window.__newYorkLongTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__newYorkLongTasks.push({
            startTime: Number(entry.startTime.toFixed(2)),
            durationMs: Number(entry.duration.toFixed(2))
          });
        }
      });
      window.__newYorkLongTaskObserver.observe({ entryTypes: ['longtask'] });
    }
  });

  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    window.__newYorkCtx = ctx;
    window.__newYorkLoadStartedAt = performance.now();
    window.__newYorkPreloadState = {
      sequence: Number(ctx._worldLoadSequence || 0),
      worldLoading: ctx.worldLoading === true,
      runtimeStatus: ctx.worldLoadRuntimeState?.status || null,
      publication: ctx.worldPublication || null,
      transportPublication: ctx.transportSurfacePublication || null,
      structureProfileCompilation: ctx.structureProfileCompilation || null,
      roads: Number(ctx.roads?.length || 0),
      buildings: Number(ctx.buildings?.length || 0)
    };
    window.__newYorkStartSequence = Number(ctx._worldLoadSequence || 0);
    if (!ctx.selectPresetLocation('newyork')) throw new Error('New York preset selection failed');
    ctx.gameMode = 'free';
    ctx.gameStarted = true;
    ctx.paused = false;
    ctx.switchEnv?.(ctx.ENV.EARTH);
    document.getElementById('titleScreen')?.classList.add('hidden');
    document.getElementById('globeSelectorScreen')?.classList.remove('show');
    window.__newYorkLoadPromise = Promise.resolve(ctx.loadRoads()).then(
      (value) => {
        window.__newYorkLoadOutcome = {
          status: 'resolved',
          value: value || null,
          resolvedAt: performance.now()
        };
      },
      (error) => {
        window.__newYorkLoadOutcome = { status: 'rejected', error: String(error?.stack || error) };
      }
    );
  });
  let loadWaitError = null;
  try {
    await page.waitForFunction(() => {
      const ctx = window.__newYorkCtx;
      return (
        (
          ctx.worldLoadRuntimeState?.status === 'ready' &&
          ctx.worldLoading !== true &&
          Number(ctx.roads?.length || 0) > 0 &&
          Number(ctx.buildingMeshes?.length || 0) > 0 &&
          ctx.worldPublication?.requestId?.endsWith?.(':newyork') &&
          Number(ctx.worldPublication?.counts?.roads || 0) > 0 &&
          Number(ctx.worldPublication?.sequence || 0) > Number(window.__newYorkStartSequence || 0)
        ) ||
        window.__newYorkLoadOutcome?.status === 'rejected'
      );
    }, null, { timeout: 120000 });
  } catch (error) {
    loadWaitError = error;
  }
  const loadMs = await page.evaluate(() => Number(
    (performance.now() - Number(window.__newYorkLoadStartedAt || performance.now())).toFixed(1)
  ));
  await page.waitForTimeout(500);

  const loadOutcome = await page.evaluate(() => window.__newYorkLoadOutcome || null);
  assert.notEqual(
    loadOutcome?.status,
    'rejected',
    `New York load rejected: ${loadOutcome?.error || 'unknown error'}`
  );

  if (loadWaitError) {
    const stalled = await page.evaluate(async ({ measuredLoadMs }) => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return {
        ok: false,
        reason: 'new-york-load-timeout',
        measuredLoadMs,
        runtime: ctx.worldLoadRuntimeState || null,
        perfLoad: ctx.perfStats?.lastLoad || null,
        farTerrain: ctx.farTerrainClipmapState || null,
        outcome: window.__newYorkLoadOutcome || null,
        preloadState: window.__newYorkPreloadState || null,
        longTasks: window.__newYorkLongTasks || [],
        consoleErrors: []
      };
    }, { measuredLoadMs: loadMs });
    stalled.worldLoadTrace = worldLoadTrace;
    stalled.consoleErrors = consoleErrors;
    await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(stalled, null, 2));
    await page.screenshot({ path: path.join(outputDir, 'new-york-stalled.png') });
    assert.fail(`New York did not publish in 120 seconds: ${JSON.stringify(stalled.runtime)}`);
  }

  const report = await page.evaluate(async ({ measuredLoadMs }) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    window.__newYorkLongTaskObserver?.disconnect?.();
    const distanceToRoad = (road, x, z) => {
      let best = Infinity;
      for (let index = 0; index < (road?.pts?.length || 0) - 1; index += 1) {
        const a = road.pts[index];
        const b = road.pts[index + 1];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const lengthSq = dx * dx + dz * dz;
        const t = lengthSq > 0
          ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / lengthSq))
          : 0;
        best = Math.min(best, Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)));
      }
      return best;
    };
    const buildingCenter = (building) => ({
      x: (Number(building?.minX) + Number(building?.maxX)) * 0.5,
      z: (Number(building?.minZ) + Number(building?.maxZ)) * 0.5
    });
    const farBuildingMesh = (ctx.terrainGroup?.children || []).find(
      (mesh) => mesh?.userData?.isFarMappedContext
    );
    const positions = farBuildingMesh?.geometry?.attributes?.position;
    const farBuildingInstances = (farBuildingMesh?.children || []).find(
      (mesh) => mesh?.userData?.isFarMappedBuildingInstances
    );
    const instanceMatrix = new THREE.Matrix4();
    const targets = [
      { id: 'midtown', region: 'manhattan', label: 'Midtown Manhattan', lat: 40.7580, lon: -73.9855 },
      { id: 'lower-manhattan', region: 'manhattan', label: 'Lower Manhattan', lat: 40.7075, lon: -74.0113 },
      { id: 'upper-east-side', region: 'manhattan', label: 'Upper East Side', lat: 40.7870, lon: -73.9560 },
      { id: 'harlem', region: 'manhattan', label: 'Harlem', lat: 40.8116, lon: -73.9465 },
      { id: 'washington-heights', region: 'manhattan', label: 'Washington Heights', lat: 40.8417, lon: -73.9394 },
      { id: 'inwood', region: 'manhattan', label: 'Inwood', lat: 40.8680, lon: -73.9210 },
      { id: 'weehawken', region: 'new-jersey', label: 'Weehawken, New Jersey', lat: 40.7695, lon: -74.0204 },
      { id: 'north-bergen', region: 'new-jersey', label: 'North Bergen, New Jersey', lat: 40.8043, lon: -74.0121 },
      { id: 'secaucus', region: 'new-jersey', label: 'Secaucus, New Jersey', lat: 40.7895, lon: -74.0565 },
      { id: 'hoboken', region: 'new-jersey', label: 'Hoboken, New Jersey', lat: 40.7357, lon: -74.0301 },
      { id: 'jersey-city', region: 'new-jersey', label: 'Jersey City, New Jersey', lat: 40.7178, lon: -74.0431 },
      { id: 'kearny', region: 'new-jersey', label: 'Kearny, New Jersey', lat: 40.7684, lon: -74.1454 }
    ].map((target) => {
      const world = ctx.geoToWorld(target.lat, target.lon);
      const nearestRoadMeters = (ctx.roads || []).reduce(
        (best, road) => Math.min(best, distanceToRoad(road, world.x, world.z)),
        Infinity
      );
      const nearbyBuildings = (ctx.buildings || []).filter((building) => {
        const center = buildingCenter(building);
        return Number.isFinite(center.x) && Number.isFinite(center.z) &&
          Math.hypot(center.x - world.x, center.z - world.z) <= 500;
      }).length;
      let nearbyFarBuildingVertices = 0;
      for (let index = 0; index < Number(positions?.count || 0); index += 1) {
        if (Math.hypot(positions.getX(index) - world.x, positions.getZ(index) - world.z) <= 500) {
          nearbyFarBuildingVertices += 1;
        }
      }
      for (let index = 0; index < Number(farBuildingInstances?.count || 0); index += 1) {
        farBuildingInstances.getMatrixAt(index, instanceMatrix);
        if (Math.hypot(instanceMatrix.elements[12] - world.x, instanceMatrix.elements[14] - world.z) <= 500) {
          nearbyFarBuildingVertices += 8;
        }
      }
      return {
        ...target,
        world: { x: Number(world.x.toFixed(2)), z: Number(world.z.toFixed(2)) },
        distanceFromOriginMeters: Number(Math.hypot(world.x, world.z).toFixed(1)),
        nearestDetailedRoadMeters: Number.isFinite(nearestRoadMeters)
          ? Number(nearestRoadMeters.toFixed(1))
          : null,
        detailedBuildingsWithin500m: nearbyBuildings,
        farBuildingVerticesWithin500m: nearbyFarBuildingVertices,
        mappedBuildingEvidenceWithin500m: nearbyBuildings + Math.ceil(nearbyFarBuildingVertices / 8),
        terrainY: (() => {
          const value = Number(ctx.SurfaceQuery?.terrainAt?.(world.x, world.z)?.position?.y);
          return Number.isFinite(value) ? value : null;
        })()
      };
    });
    const structureTargets = [
      { id: 'brooklyn-bridge', kind: 'bridge', expectedName: 'Brooklyn Bridge', lat: 40.7061, lon: -73.9969 },
      { id: 'manhattan-bridge', kind: 'bridge', expectedName: 'Manhattan Bridge', lat: 40.7075, lon: -73.9905 },
      { id: 'queensboro-bridge', kind: 'bridge', expectedName: 'Queensboro Bridge', lat: 40.7526, lon: -73.9445 },
      { id: 'lincoln-tunnel-west', kind: 'tunnel', expectedName: 'Lincoln Tunnel', lat: 40.7663, lon: -74.0224 },
      { id: 'holland-tunnel-east', kind: 'tunnel', expectedName: 'Holland Tunnel', lat: 40.7250, lon: -74.0070 }
    ].map((target) => {
      const world = ctx.geoToWorld(target.lat, target.lon);
      const candidates = (ctx.roads || []).filter((road) => target.kind === 'bridge'
        ? road?.structureSemantics?.isBridge === true
        : road?.structureSemantics?.isTunnel === true
      );
      const namedCandidates = candidates.filter((road) =>
        String(road?.name || '').toLowerCase().includes(target.expectedName.toLowerCase())
      );
      const targetCandidates = namedCandidates.length > 0 ? namedCandidates : candidates;
      const nearest = targetCandidates.reduce((best, road) => {
        for (let index = 0; index < (road.pts || []).length - 1; index += 1) {
          const a = road.pts[index];
          const b = road.pts[index + 1];
          const dx = b.x - a.x;
          const dz = b.z - a.z;
          const lengthSq = dx * dx + dz * dz;
          const t = lengthSq > 0
            ? Math.max(0, Math.min(1, ((world.x - a.x) * dx + (world.z - a.z) * dz) / lengthSq))
            : 0;
          const point = { x: a.x + dx * t, z: a.z + dz * t };
          const distance = Math.hypot(point.x - world.x, point.z - world.z);
          if (!best || distance < best.distance) best = { road, point, distance };
        }
        return best;
      }, null);
      const road = nearest?.road;
      const sampleRoadAtDistance = (candidate, distance) => {
        let remaining = Math.max(0, Number(distance) || 0);
        for (let index = 0; index < (candidate?.pts || []).length - 1; index += 1) {
          const a = candidate.pts[index];
          const b = candidate.pts[index + 1];
          const dx = b.x - a.x;
          const dz = b.z - a.z;
          const length = Math.hypot(dx, dz);
          if (!(length > 0)) continue;
          if (remaining <= length || index === candidate.pts.length - 2) {
            const t = Math.max(0, Math.min(1, remaining / length));
            return {
              x: a.x + dx * t,
              z: a.z + dz * t,
              tangentX: dx / length,
              tangentZ: dz / length,
              distance: Number(distance),
              total: Number(candidate?.tunnelSystemModel?.total || 0)
            };
          }
          remaining -= length;
        }
        return null;
      };
      const portalPoints = (road?.tunnelSystemModel?.portalDistances || [])
        .map((distance) => sampleRoadAtDistance(road, distance))
        .filter(Boolean);
      const focusPoint = target.kind === 'tunnel' && portalPoints.length > 0
        ? portalPoints.reduce((best, point) => {
            const distance = Math.hypot(point.x - world.x, point.z - world.z);
            return !best || distance < best.distance ? { point, distance } : best;
          }, null)?.point
        : nearest?.point;
      const surface = focusPoint
        ? ctx.SurfaceQuery?.driveAt?.(focusPoint.x, focusPoint.z, { preferRoad: true })
        : null;
      return {
        ...target,
        targetWorld: { x: world.x, z: world.z },
        nearestDistanceMeters: Number(nearest?.distance?.toFixed?.(1)),
        roadName: road?.name || null,
        roadType: road?.type || null,
        width: Number(road?.width || 0),
        completeness: road?.transportRecord?.completeness || null,
        sourceId: road?.transportRecord?.identity || null,
        structureKind: road?.transportStructureRef?.kind || null,
        tunnelVisualKind: road?.tunnelSystemModel?.visualKind || null,
        shellRanges: road?.tunnelSystemModel?.shellRanges?.length || 0,
        portalCount: portalPoints.length,
        point: focusPoint
          ? {
              x: focusPoint.x,
              z: focusPoint.z,
              tangentX: Number(focusPoint.tangentX || 0),
              tangentZ: Number(focusPoint.tangentZ || 0),
              portalOutsideDirection: Number(focusPoint.distance) <= Number(focusPoint.total) * 0.5 ? -1 : 1
            }
          : null,
        surfaceY: Number(surface?.position?.y),
        surfaceKind: surface?.kind || null
      };
    });
    const radialBins = [0, 2000, 4000, 8000, 10000, 22000];
    const binFor = (distance) => {
      for (let index = 0; index < radialBins.length - 1; index += 1) {
        if (distance >= radialBins[index] && distance < radialBins[index + 1]) {
          return `${radialBins[index]}-${radialBins[index + 1]}`;
        }
      }
      return 'outside';
    };
    const roadPointBins = {};
    for (const road of ctx.roads || []) {
      for (const point of road.pts || []) {
        const bin = binFor(Math.hypot(point.x, point.z));
        roadPointBins[bin] = (roadPointBins[bin] || 0) + 1;
      }
    }
    const detailedBuildingBins = {};
    for (const building of ctx.buildings || []) {
      const center = buildingCenter(building);
      if (!Number.isFinite(center.x) || !Number.isFinite(center.z)) continue;
      const bin = binFor(Math.hypot(center.x, center.z));
      detailedBuildingBins[bin] = (detailedBuildingBins[bin] || 0) + 1;
    }
    const farBuildingVertexBins = {};
    for (let index = 0; index < Number(positions?.count || 0); index += 1) {
      const bin = binFor(Math.hypot(positions.getX(index), positions.getZ(index)));
      farBuildingVertexBins[bin] = (farBuildingVertexBins[bin] || 0) + 1;
    }
    const gl = ctx.renderer?.getContext?.();
    const extension = gl?.getExtension?.('WEBGL_debug_renderer_info');
    return {
      generatedAt: new Date().toISOString(),
      measuredLoadMs,
      outcome: window.__newYorkLoadOutcome || null,
      preloadState: window.__newYorkPreloadState || null,
      runtime: ctx.worldLoadRuntimeState || null,
      publication: ctx.worldPublication || null,
      transportPublication: ctx.transportSurfacePublication || null,
      structureProfileCompilation: ctx.structureProfileCompilation || null,
      perfLoad: ctx.perfStats?.lastLoad || null,
      runtimePhaseTotals: ctx.worldLoadRuntimeState?.phaseTotals || null,
      longTasks: window.__newYorkLongTasks || [],
      gpu: {
        vendor: String(extension ? gl.getParameter(extension.UNMASKED_VENDOR_WEBGL) : ''),
        renderer: String(extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : '')
      },
      counts: {
        roads: ctx.roads?.length || 0,
        buildings: ctx.buildings?.length || 0,
        buildingMeshes: ctx.buildingMeshes?.length || 0,
        fixedRegionalBridges: (ctx.roads || []).filter((road) => (
          road?.fixedRegionalContext === true && road?.structureSemantics?.isBridge === true
        )).length,
        fixedRegionalTunnels: (ctx.roads || []).filter((road) => (
          road?.fixedRegionalContext === true && road?.structureSemantics?.isTunnel === true
        )).length,
        fixedRegionalEngineeredRoads: (ctx.roads || []).filter((road) => (
          road?.fixedRegionalContext === true &&
          road?.structureSemantics?.terrainMode !== 'at_grade'
        )).length,
        exactRegionalBridges: (ctx.roads || []).filter((road) => (
          road?.fixedRegionalContext === true &&
          road?.transportRecord?.completeness === 'lossless' &&
          road?.structureSemantics?.isBridge === true
        )).length,
        exactRegionalTunnels: (ctx.roads || []).filter((road) => (
          road?.fixedRegionalContext === true &&
          road?.transportRecord?.completeness === 'lossless' &&
          road?.structureSemantics?.isTunnel === true
        )).length,
        farBuildings: Number(ctx.farTerrainClipmapState?.farBuildings || 0),
        farBuildingsAvailable: Number(ctx.farTerrainClipmapState?.farBuildingsAvailable || 0),
        farBuildingSelectionCoverage: Number(ctx.farTerrainClipmapState?.farBuildingSelectionCoverage || 0),
        farBuildingPublishedCoverage: Number(ctx.farTerrainClipmapState?.farBuildingPublishedCoverage || 0),
        farBuildingsSkippedByTerrainRectangle: Number(
          ctx.farTerrainClipmapState?.skippedDuplicateNearBuildings || 0
        )
      },
      radii: {
        initialEarthDetailRadius: Number(ctx.initialEarthDetailRadius || 0),
        worldTraversalRadiusWorld: Number(ctx.worldTraversalRadiusWorld || 0),
        farContextHalfExtentMeters: Number(ctx.fixedRegionalContextRadiusWorld || 0),
        farTerrainOuterDistanceMeters: Number(ctx.farTerrainClipmapState?.outerDistanceMeters || 0)
      },
      targets,
      structureTargets,
      structureVisuals: (ctx.structureVisualMeshes || []).map((mesh) => ({
        type: mesh?.userData?.structureVisualType || null,
        instances: Number(mesh?.count || 0),
        vertices: Number(mesh?.geometry?.attributes?.position?.count || 0),
        triangles: Number(mesh?.geometry?.index?.count || 0) / 3
      })),
      structureTerrainPortalMaskStats: ctx.structureTerrainPortalMaskStats || null,
      radialCoverage: { roadPointBins, detailedBuildingBins, farBuildingVertexBins },
      farTerrain: ctx.farTerrainClipmapState || null,
      consoleErrors: []
    };
  }, { measuredLoadMs: loadMs });
  report.consoleErrors = consoleErrors;
  report.worldLoadTrace = worldLoadTrace;
  report.shortbreadRequests = {
    total: shortbreadRequestUrls.length,
    unique: new Set(shortbreadRequestUrls).size,
    duplicateUrls: [...new Set(shortbreadRequestUrls.filter(
      (url, index, all) => all.indexOf(url) !== index
    ))]
  };
  report.westSideIssue = await page.evaluate(async () => {
    const ctx = window.__newYorkCtx;
    const {
      projectPointToFeature,
      sampleFeatureSurfaceY
    } = await import('/app/js/structure-semantics.js?v=46');
    const target = ctx.geoToWorld(40.7600, -73.9991);
    const terrainY = Number(ctx.SurfaceQuery?.terrainAt?.(target.x, target.z)?.position?.y);
    const nearbyBuildings = (ctx.getNearbyBuildings?.(target.x, target.z, 80) || []).map((building) => ({
      sourceBuildingId: String(building?.sourceBuildingId || ''),
      name: String(building?.name || ''),
      collisionKind: String(building?.collisionKind || ''),
      minX: Number(building?.minX),
      maxX: Number(building?.maxX),
      minZ: Number(building?.minZ),
      maxZ: Number(building?.maxZ),
      minY: Number(building?.minY),
      maxY: Number(building?.maxY)
    }));
    const tunnelRoads = (ctx.roads || []).filter((road) =>
      road?.structureSemantics?.terrainMode === 'subgrade'
    ).map((road) => {
      const projection = projectPointToFeature(road, target.x, target.z);
      if (!projection) return null;
      const surfaceY = Number(sampleFeatureSurfaceY(road, target.x, target.z, projection));
      const sampledTerrainY = Number(ctx.SurfaceQuery?.terrainAt?.(projection.x, projection.z)?.position?.y);
      return {
        name: String(road?.name || ''),
        sourceId: String(road?.transportRecord?.identity || ''),
        completeness: String(road?.transportRecord?.completeness || ''),
        distance: Number(projection.dist),
        surfaceY,
        terrainY: sampledTerrainY,
        roofY: surfaceY + Number(road?.tunnelSystemModel?.clearance || 0) + Number(road?.tunnelSystemModel?.roofThickness || 0)
      };
    }).filter(Boolean).sort((left, right) => left.distance - right.distance).slice(0, 12);
    const originalActions = ctx.readControlActions;
    ctx.readControlActions = () => ({});
    ctx.startPlaneMode?.({
      x: -15000,
      y: 500,
      z: 0,
      yaw: -Math.PI / 2,
      speed: 50,
      throttle: 1,
      airborne: true
    });
    const planeBefore = ctx.getPlaneSnapshot?.();
    for (let index = 0; index < 120; index += 1) ctx.updatePlane?.(1 / 30);
    const planeAfter = ctx.getPlaneSnapshot?.();
    ctx.stopPlaneMode?.({ targetMode: 'drone' });
    ctx.readControlActions = originalActions;
    return {
      geographic: { lat: 40.7600, lon: -73.9991 },
      world: target,
      terrainY,
      traversalRadius: Number(ctx.worldTraversalRadiusWorld || 0),
      collisionAtAircraftHeight: (() => {
        const collision = ctx.checkBuildingCollision?.(target.x, target.z, 2.15, {
          actorBaseY: 49,
          actorHeight: 1.45
        });
        return {
          collision: collision?.collision === true,
          inside: collision?.inside === true,
          penetration: Number(collision?.penetration),
          sourceBuildingId: String(collision?.building?.sourceBuildingId || ''),
          name: String(collision?.building?.name || ''),
          collisionKind: String(collision?.building?.collisionKind || '')
        };
      })(),
      nearbyBuildings,
      tunnelRoads,
      farBuildingFacadeOwners: (ctx.terrainGroup?.children || [])
        .filter((object) => object?.userData?.isFarMappedContext)
        .flatMap((object) => [object, ...(object.children || [])])
        .map((object) => ({
          name: object.name || '',
          facadeDetail: object.material?.userData?.farBuildingFacadeDetail || null,
          facadeCoverage: object.material?.userData?.farBuildingFacadeCoverage || null,
          materialType: object.material?.type || null
        })),
      outerFlight: {
        before: planeBefore,
        after: planeAfter,
        moved: Math.hypot(
          Number(planeAfter?.x) - Number(planeBefore?.x),
          Number(planeAfter?.z) - Number(planeBefore?.z)
        )
      }
    };
  });
  await page.evaluate(() => {
    const ctx = window.__newYorkCtx;
    const target = ctx.geoToWorld(40.7600, -73.9991);
    const terrainY = Number(ctx.SurfaceQuery?.terrainAt?.(target.x, target.z)?.position?.y || 0);
    ctx.setTravelMode?.('drone', { source: 'west-side-visible-tunnel-diagnostic', force: true });
    ctx.drone.x = target.x + 220;
    ctx.drone.y = terrainY + 115;
    ctx.drone.z = target.z + 175;
    ctx.drone.yaw = Math.atan2(220, 175);
    ctx.drone.pitch = -Math.atan2(100, Math.hypot(220, 175));
    ctx.drone.roll = 0;
    ctx.drone.cameraYawOffset = 0;
  });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(outputDir, 'west-side-issue-all.png') });
  await page.evaluate(() => {
    const ctx = window.__newYorkCtx;
    window.__westSideRoadVisibility = (ctx.roadMeshes || []).map((mesh) => mesh.visible);
    (ctx.roadMeshes || []).forEach((mesh) => { mesh.visible = false; });
  });
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(outputDir, 'west-side-issue-no-roads.png') });
  await page.evaluate(() => {
    const ctx = window.__newYorkCtx;
    (ctx.roadMeshes || []).forEach((mesh, index) => {
      mesh.visible = window.__westSideRoadVisibility?.[index] !== false;
    });
    window.__westSideStructureVisibility = (ctx.structureVisualMeshes || []).map((mesh) => mesh.visible);
    (ctx.structureVisualMeshes || []).forEach((mesh) => { mesh.visible = false; });
  });
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(outputDir, 'west-side-issue-no-structures.png') });
  await page.evaluate(() => {
    const ctx = window.__newYorkCtx;
    (ctx.structureVisualMeshes || []).forEach((mesh, index) => {
      mesh.visible = window.__westSideStructureVisibility?.[index] !== false;
    });
  });
  await page.screenshot({ path: path.join(outputDir, 'new-york-ground.png') });
  report.userFacadeView = await page.evaluate(() => {
    const ctx = window.__newYorkCtx;
    ctx.setTimeOfDay?.('day');
    const target = ctx.geoToWorld(40.7694, -73.9724);
    const terrainY = Number(ctx.SurfaceQuery?.terrainAt?.(target.x, target.z)?.position?.y || 0);
    ctx.setTravelMode?.('drone', { source: 'new-york-user-facade-visual', force: true });
    ctx.drone.x = target.x;
    ctx.drone.y = terrainY + 323;
    ctx.drone.z = target.z;
    ctx.drone.yaw = 302 * Math.PI / 180;
    ctx.drone.pitch = -0.38;
    ctx.drone.roll = 0;
    ctx.drone.cameraYawOffset = 0;
    const materialClaims = new Map();
    for (const mesh of ctx.buildingMeshes || []) {
      for (const material of Array.isArray(mesh?.material) ? mesh.material : [mesh?.material]) {
        if (!material) continue;
        const key = [
          material.name || material.type || 'unknown',
          material.userData?.buildingExterior === true ? 'exterior' : 'unclaimed',
          material.userData?.facadeAtlas === true ? 'facade' : 'plain'
        ].join('|');
        materialClaims.set(key, (materialClaims.get(key) || 0) + 1);
      }
    }
    return {
      geographic: { lat: 40.7694, lon: -73.9724 },
      world: target,
      terrainY,
      detailedBuildingMeshes: Number(ctx.buildingMeshes?.length || 0),
      materialClaims: Array.from(materialClaims.entries()).map(([claim, meshes]) => ({ claim, meshes }))
    };
  });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(outputDir, 'user-facade-view-all.png') });
  await page.evaluate(() => {
    const ctx = window.__newYorkCtx;
    window.__newYorkFarBuildingVisibility = (ctx.terrainGroup?.children || [])
      .filter((object) => object?.userData?.isFarMappedContext)
      .map((object) => ({ object, visible: object.visible }));
    window.__newYorkFarBuildingVisibility.forEach(({ object }) => { object.visible = false; });
  });
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(outputDir, 'user-facade-view-detailed-only.png') });
  await page.evaluate(() => {
    const ctx = window.__newYorkCtx;
    (window.__newYorkFarBuildingVisibility || []).forEach(({ object, visible }) => { object.visible = visible; });
    window.__newYorkDetailedBuildingVisibility = (ctx.buildingMeshes || [])
      .map((object) => ({ object, visible: object.visible }));
    window.__newYorkDetailedBuildingVisibility.forEach(({ object }) => { object.visible = false; });
  });
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(outputDir, 'user-facade-view-regional-only.png') });
  await page.evaluate(() => {
    (window.__newYorkDetailedBuildingVisibility || []).forEach(({ object, visible }) => { object.visible = visible; });
  });
  for (const targetId of ['lower-manhattan', 'inwood', 'kearny']) {
    const target = report.targets.find((candidate) => candidate.id === targetId);
    if (!target?.world) continue;
    await page.evaluate(({ world }) => {
      const ctx = window.__newYorkCtx;
      const terrainY = Number(ctx.SurfaceQuery?.terrainAt?.(world.x, world.z)?.position?.y || 0);
      ctx.setTravelMode?.('drone', { source: 'new-york-coverage-visual', force: true });
      ctx.drone.x = world.x + 900;
      ctx.drone.y = terrainY + 700;
      ctx.drone.z = world.z + 950;
      ctx.drone.yaw = Math.atan2(900, 950);
      ctx.drone.pitch = -Math.atan2(660, Math.hypot(900, 950));
      ctx.drone.roll = 0;
      ctx.drone.cameraYawOffset = 0;
    }, target);
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(outputDir, `coverage-${target.id}.png`) });
  }
  for (const target of report.structureTargets || []) {
    if (!target?.point) continue;
    await page.evaluate(({ point }) => {
      const ctx = window.__newYorkCtx;
      const surfaceY = Number(ctx.SurfaceQuery?.driveAt?.(point.x, point.z, { preferRoad: true })?.position?.y || 0);
      ctx.setTravelMode?.('drone', { source: 'new-york-structure-visual', force: true });
      const portalView = Math.hypot(Number(point.tangentX), Number(point.tangentZ)) > 0.5;
      const viewX = portalView
        ? Number(point.tangentX) * Number(point.portalOutsideDirection || -1) * 52 - Number(point.tangentZ) * 9
        : 105;
      const viewZ = portalView
        ? Number(point.tangentZ) * Number(point.portalOutsideDirection || -1) * 52 + Number(point.tangentX) * 9
        : 125;
      const viewY = portalView ? 14 : 72;
      ctx.drone.x = point.x + viewX;
      ctx.drone.y = surfaceY + viewY;
      ctx.drone.z = point.z + viewZ;
      ctx.drone.yaw = Math.atan2(viewX, viewZ);
      ctx.drone.pitch = -Math.atan2(viewY - 4, Math.hypot(viewX, viewZ));
      ctx.drone.roll = 0;
      ctx.drone.cameraYawOffset = 0;
    }, target);
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(outputDir, `${target.id}.png`) });
  }
  report.traversalEvidence = await page.evaluate(async () => {
    const ctx = window.__newYorkCtx;
    const target = ctx.geoToWorld(40.7357, -74.0301);
    const sequenceBefore = Number(ctx._worldLoadSequence || 0);
    const walkSurface = ctx.SurfaceQuery?.walkAt?.(target.x, target.z, { currentY: 50 });
    const roadPoint = (ctx.roads || []).flatMap((road) => road.pts || []).reduce(
      (best, point) => {
        const distance = Math.hypot(point.x - target.x, point.z - target.z);
        return !best || distance < best.distance ? { point, distance } : best;
      },
      null
    );
    const driveSurface = roadPoint
      ? ctx.SurfaceQuery?.driveAt?.(roadPoint.point.x, roadPoint.point.z, { preferRoad: true })
      : null;
    const walker = ctx.Walk?.state?.walker;
    if (walker && Number.isFinite(Number(walkSurface?.position?.y))) {
      walker.x = target.x;
      walker.z = target.z;
      walker.y = Number(walkSurface.position.y) + 1.7;
      ctx.setTravelMode?.('drone', { source: 'new-york-regional-continuity', force: true });
      ctx.drone.x = target.x + 650;
      ctx.drone.y = walker.y + 420;
      ctx.drone.z = target.z + 720;
      ctx.drone.yaw = Math.atan2(650, 720);
      ctx.drone.pitch = -Math.atan2(405, Math.hypot(650, 720));
      ctx.drone.roll = 0;
      ctx.drone.cameraYawOffset = 0;
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return {
      sequenceBefore,
      sequenceAfter: Number(ctx._worldLoadSequence || 0),
      worldLoading: ctx.worldLoading === true,
      targetDistance: Number(Math.hypot(target.x, target.z).toFixed(1)),
      traversalRadius: Number(ctx.worldTraversalRadiusWorld || 0),
      walkSurfaceY: Number(walkSurface?.position?.y),
      walkSurfaceKind: walkSurface?.kind || null,
      nearestRoadPointDistance: Number(roadPoint?.distance?.toFixed?.(1)),
      driveSurfaceY: Number(driveSurface?.position?.y),
      driveSurfaceKind: driveSurface?.kind || null
    };
  });
  await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
  await page.screenshot({ path: path.join(outputDir, 'new-york-hoboken-traversal.png') });
  await page.evaluate(() => {
    const ctx = window.__newYorkCtx;
    const farWater = (ctx.terrainGroup?.children || []).find(
      (mesh) => mesh?.userData?.isFarMappedWaterContext
    );
    if (farWater) farWater.visible = false;
  });
  await page.waitForTimeout(100);
  await page.screenshot({ path: path.join(outputDir, 'new-york-hoboken-no-far-water.png') });
  await page.evaluate(() => {
    const ctx = window.__newYorkCtx;
    const farWater = (ctx.terrainGroup?.children || []).find(
      (mesh) => mesh?.userData?.isFarMappedWaterContext
    );
    if (farWater) farWater.visible = true;
  });
  await page.evaluate(() => {
    const ctx = window.__newYorkCtx;
    window.__newYorkDetailedWaterVisibility = (ctx.landuseMeshes || [])
      .filter((mesh) => mesh?.userData?.landuseType === 'water' || mesh?.userData?.isWaterwayLine)
      .map((mesh) => ({ mesh, visible: mesh.visible }));
    window.__newYorkDetailedWaterVisibility.forEach(({ mesh }) => { mesh.visible = false; });
  });
  await page.waitForTimeout(100);
  await page.screenshot({ path: path.join(outputDir, 'new-york-hoboken-far-water-only.png') });
  await page.evaluate(() => {
    const ctx = window.__newYorkCtx;
    const farWater = (ctx.terrainGroup?.children || []).find(
      (mesh) => mesh?.userData?.isFarMappedWaterContext
    );
    if (farWater) farWater.visible = false;
  });
  await page.waitForTimeout(100);
  await page.screenshot({ path: path.join(outputDir, 'new-york-hoboken-terrain-only.png') });
  await page.evaluate(() => {
    const ctx = window.__newYorkCtx;
    const farWater = (ctx.terrainGroup?.children || []).find(
      (mesh) => mesh?.userData?.isFarMappedWaterContext
    );
    if (farWater) farWater.visible = true;
    (window.__newYorkDetailedWaterVisibility || []).forEach(({ mesh, visible }) => {
      mesh.visible = visible;
    });
  });

  assert.equal(consoleErrors.length, 0, `New York emitted console errors: ${consoleErrors.join(' | ')}`);
  assert.equal(
    report.shortbreadRequests.duplicateUrls.length,
    0,
    `New York requested duplicate Shortbread tiles: ${JSON.stringify(report.shortbreadRequests)}`
  );
  const midtown = report.targets.find((target) => target.id === 'midtown');
  assert.ok(
    Number.isFinite(midtown?.nearestDetailedRoadMeters) && midtown.nearestDetailedRoadMeters <= 40,
    `Midtown core road coverage regressed: ${JSON.stringify(midtown)}`
  );
  assert.ok(
    Number(midtown?.detailedBuildingsWithin500m || 0) >= 100,
    `Midtown detailed building coverage regressed: ${JSON.stringify(midtown)}`
  );
  const metropolitanTargets = report.targets.filter((target) => target.id !== 'midtown');
  assert.ok(
    metropolitanTargets.every((target) =>
      target.distanceFromOriginMeters <= report.radii.farContextHalfExtentMeters &&
      Number.isFinite(target.nearestDetailedRoadMeters) && target.nearestDetailedRoadMeters <= 200
    ),
    `Visible Manhattan/New Jersey road continuity is missing: ${JSON.stringify(metropolitanTargets)}`
  );
  assert.ok(
    metropolitanTargets.every((target) =>
      target.mappedBuildingEvidenceWithin500m >= 100
    ),
    `Visible Manhattan/New Jersey building continuity is missing: ${JSON.stringify(metropolitanTargets)}`
  );
  assert.ok(
    report.counts.farBuildings >= 150000 && report.counts.farBuildingPublishedCoverage >= 0.20,
    `Fixed regional building massing is too sparse: ${JSON.stringify(report.counts)}`
  );
  assert.ok(
    report.counts.fixedRegionalBridges >= 400 && report.counts.fixedRegionalTunnels >= 200,
    `Mapped New York bridges or tunnels were discarded: ${JSON.stringify(report.counts)}`
  );
  assert.ok(
    report.counts.exactRegionalBridges >= 800 && report.counts.exactRegionalTunnels >= 100,
    `Exact New York engineered structures were not retained: ${JSON.stringify(report.counts)}`
  );
  for (const target of report.structureTargets) {
    assert.equal(
      target.completeness,
      'lossless',
      `${target.id} did not resolve to exact mapped structure geometry: ${JSON.stringify(target)}`
    );
    assert.match(
      String(target.roadName || ''),
      new RegExp(target.expectedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
      `${target.id} resolved to the wrong mapped structure: ${JSON.stringify(target)}`
    );
    assert.ok(
      Number.isFinite(target.surfaceY) && target.surfaceKind === 'road',
      `${target.id} has no driveable compiled surface: ${JSON.stringify(target)}`
    );
    if (target.kind === 'tunnel') {
      assert.ok(
        target.tunnelVisualKind === 'tunnel' && target.shellRanges > 0 && target.portalCount > 0,
        `${target.id} has no compiled tunnel shell and real portal boundary: ${JSON.stringify(target)}`
      );
    }
  }
  assert.ok(
    report.structureVisuals.some((entry) => entry.type === 'elevated_road_shells' && entry.vertices > 1000),
    `New York bridge deck bodies were not published: ${JSON.stringify(report.structureVisuals)}`
  );
  assert.ok(
    report.structureVisuals.some((entry) => entry.type === 'portals' && entry.instances > 0),
    `New York tunnel portals were not published: ${JSON.stringify(report.structureVisuals)}`
  );
  assert.ok(
    report.structureTerrainPortalMaskStats?.maskedMeshes > 0 &&
      report.structureTerrainPortalMaskStats?.publishedMasks > 0,
    `New York tunnel entrances do not own a local terrain aperture: ${JSON.stringify(report.structureTerrainPortalMaskStats)}`
  );
  assert.equal(
    report.farTerrain?.farWaterTerrainMaskAuthority,
    'published-water-geometry-fragment-mask',
    `New York far terrain is not yielding exact mapped water polygons: ${JSON.stringify(report.farTerrain)}`
  );
  assert.equal(
    report.farTerrain?.farWaterTerrainMaskPolygons,
    report.farTerrain?.farWaterPolygons,
    `terrain delegated to water polygons without render geometry: ${JSON.stringify(report.farTerrain)}`
  );
  assert.ok(
    report.westSideIssue?.farBuildingFacadeOwners?.length > 0 &&
      report.westSideIssue.farBuildingFacadeOwners.every((entry) => (
        entry.facadeDetail === 'world-space-distance-adaptive-window-grid' &&
        entry.facadeCoverage === 'entire-fixed-map'
      )),
    `not every regional building tier owns full-map facades: ${JSON.stringify(report.westSideIssue?.farBuildingFacadeOwners)}`
  );
  assert.equal(
    report.farTerrain?.farWaterTerrainMaskSize,
    4096,
    `New York mapped-water terrain ownership lost its shoreline resolution: ${JSON.stringify(report.farTerrain)}`
  );
  assert.ok(
    report.measuredLoadMs <= 95000,
    `New York fixed-location load exceeded the 95-second cold-provider budget: ${report.measuredLoadMs}ms`
  );
  const loadResolvedAt = Number(report.outcome?.resolvedAt || Infinity);
  const maximumLoadLongTaskMs = Math.max(
    0,
    ...report.longTasks
      .filter((task) => Number(task.startTime) <= loadResolvedAt)
      .map((task) => Number(task.durationMs) || 0)
  );
  assert.ok(
    maximumLoadLongTaskMs <= 5000,
    `New York load blocked Chrome for ${maximumLoadLongTaskMs}ms in one task.`
  );
  assert.equal(
    report.traversalEvidence.sequenceAfter,
    report.traversalEvidence.sequenceBefore,
    'Moving into Hoboken triggered an unexpected second world load.'
  );
  assert.equal(report.traversalEvidence.worldLoading, false, 'Hoboken traversal restarted world loading.');
  assert.ok(
    Number.isFinite(report.traversalEvidence.walkSurfaceY) &&
      Number.isFinite(report.traversalEvidence.driveSurfaceY),
    `Hoboken traversal surfaces are unavailable: ${JSON.stringify(report.traversalEvidence)}`
  );
  console.log(JSON.stringify({
    ok: true,
    measuredLoadMs: report.measuredLoadMs,
    roads: report.counts.roads,
    buildings: report.counts.buildings,
    farBuildings: report.counts.farBuildings,
    fixedRegionalBridges: report.counts.fixedRegionalBridges,
    fixedRegionalTunnels: report.counts.fixedRegionalTunnels,
    traversalRadius: report.radii.worldTraversalRadiusWorld,
    maximumLoadLongTaskMs,
    traversalEvidence: report.traversalEvidence,
    targets: report.targets
  }, null, 2));
} finally {
  await browser.close();
  await server.close();
}
