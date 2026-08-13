import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { startStaticRootServer } from './test-static-server.mjs';

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
          window.__newYorkLoadOutcome?.status === 'resolved' &&
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
    }, null, { timeout: 70000 });
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
    assert.fail(`New York did not publish in 70 seconds: ${JSON.stringify(stalled.runtime)}`);
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
      { id: 'midtown', label: 'Midtown Manhattan', lat: 40.7580, lon: -73.9855 },
      { id: 'weehawken', label: 'Weehawken, New Jersey', lat: 40.7695, lon: -74.0204 },
      { id: 'hoboken', label: 'Hoboken, New Jersey', lat: 40.7357, lon: -74.0301 },
      { id: 'jersey-city', label: 'Jersey City, New Jersey', lat: 40.7178, lon: -74.0431 }
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
        terrainY: (() => {
          const value = Number(ctx.SurfaceQuery?.terrainAt?.(world.x, world.z)?.position?.y);
          return Number.isFinite(value) ? value : null;
        })()
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
        farContextHalfExtentMeters: 8000,
        farTerrainOuterDistanceMeters: Number(ctx.farTerrainClipmapState?.outerDistanceMeters || 0)
      },
      targets,
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
  await page.screenshot({ path: path.join(outputDir, 'new-york-ground.png') });
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
  const newJerseyTargets = report.targets.filter((target) => target.id !== 'midtown');
  assert.ok(
    newJerseyTargets.every((target) =>
      Number.isFinite(target.nearestDetailedRoadMeters) && target.nearestDetailedRoadMeters <= 120
    ),
    `New Jersey road continuity is missing: ${JSON.stringify(newJerseyTargets)}`
  );
  assert.ok(
    newJerseyTargets.every((target) =>
      target.detailedBuildingsWithin500m >= 20 || target.farBuildingVerticesWithin500m >= 24
    ),
    `New Jersey building continuity is missing: ${JSON.stringify(newJerseyTargets)}`
  );
  assert.ok(
    report.counts.farBuildings >= 50000 && report.counts.farBuildingPublishedCoverage >= 0.84,
    `Fixed regional building massing is too sparse: ${JSON.stringify(report.counts)}`
  );
  assert.ok(
    report.counts.fixedRegionalBridges >= 400 && report.counts.fixedRegionalTunnels >= 200,
    `Mapped New York bridges or tunnels were discarded: ${JSON.stringify(report.counts)}`
  );
  assert.equal(
    report.farTerrain?.farWaterTerrainMaskAuthority,
    'mapped-water-polygon-fragment-mask',
    `New York far terrain is not yielding exact mapped water polygons: ${JSON.stringify(report.farTerrain)}`
  );
  assert.equal(
    report.farTerrain?.farWaterTerrainMaskSize,
    4096,
    `New York mapped-water terrain ownership lost its shoreline resolution: ${JSON.stringify(report.farTerrain)}`
  );
  assert.ok(
    report.measuredLoadMs <= 45000,
    `New York fixed-location load exceeded 45 seconds: ${report.measuredLoadMs}ms`
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
