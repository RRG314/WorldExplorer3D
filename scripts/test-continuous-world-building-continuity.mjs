import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { mkdirp, rootDir, startServer, bootstrapEarthRuntime } from './lib/runtime-browser-harness.mjs';

const outputDir = path.join(rootDir, 'output', 'playwright', 'continuous-world-building-continuity');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isIgnorableConsoleError(text = '') {
  return /(429 \(Too Many Requests\)|504 \(Gateway Timeout\)|502 \(Bad Gateway\)|503 \(Service Unavailable\)|Could not reach Cloud Firestore backend|Failed to load resource.*favicon\.ico|net::ERR_CONNECTION_CLOSED)/i.test(String(text));
}

function isOverpassInfraFailure(text = '') {
  return /All Overpass endpoints failed|status of 429|status of 500|status of 502|status of 503|status of 504|HTTP 429|HTTP 500|HTTP 502|HTTP 503|HTTP 504|timeout after \d+ms/i.test(String(text));
}

async function collectContinuityReport(page) {
  return page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    if (!ctx) return { ok: false, reason: 'shared context unavailable' };

    const thresholdsByMode = {
      drive: { minRoads: 10, minBuildings: 12, minDetailedBuildings: 6 },
      walk: { minRoads: 3, minBuildings: 10, minDetailedBuildings: 4 },
      drone: { minRoads: 3, minBuildings: 10, minDetailedBuildings: 4 }
    };

    const actorForMode = (mode) => {
      if (mode === 'drone') return ctx.drone || null;
      if (mode === 'walk') return ctx.Walk?.state?.walker || null;
      return ctx.car || null;
    };

    const geoDistanceMeters = (latA, lonA, latB, lonB) => {
      if (![latA, lonA, latB, lonB].every((value) => Number.isFinite(value))) return null;
      const rad = Math.PI / 180;
      const avgLat = ((latA + latB) * 0.5) * rad;
      const metersPerDegLat = 111320;
      const metersPerDegLon = Math.cos(avgLat) * 111320;
      const dx = (lonA - lonB) * metersPerDegLon;
      const dz = (latA - latB) * metersPerDegLat;
      return Math.hypot(dx, dz);
    };

    const targetWorldPoint = (targetGeo) => {
      if (
        !targetGeo ||
        !Number.isFinite(targetGeo.lat) ||
        !Number.isFinite(targetGeo.lon) ||
        typeof ctx.geoToWorld !== 'function'
      ) {
        return null;
      }
      return ctx.geoToWorld(targetGeo.lat, targetGeo.lon);
    };

    const sample = (label, mode, targetGeo = null) => {
      const actor = actorForMode(mode);
      const x = Number(actor?.x || 0);
      const z = Number(actor?.z || 0);
      const actorGeo = typeof ctx.worldToLatLon === 'function' ? ctx.worldToLatLon(x, z) : null;
      const targetWorld = targetWorldPoint(targetGeo);
      const validation = typeof ctx.getContinuousWorldValidationSnapshot === 'function' ? ctx.getContinuousWorldValidationSnapshot() : null;
      const interactive = validation?.interactiveStream || ctx.getContinuousWorldInteractiveStreamSnapshot?.() || null;
      const runtime = typeof ctx.getContinuousWorldRuntimeSnapshot === 'function' ? ctx.getContinuousWorldRuntimeSnapshot() : null;
      const regionKey = String(runtime?.activeRegion?.key || '');
      const regionCoverage = Array.isArray(interactive?.coverage) ?
        interactive.coverage.filter((entry) => String(entry?.regionKey || '') === regionKey) :
        [];
      return {
        label,
        mode,
        actor: {
          x,
          y: Number(actor?.y || 0),
          z,
          speed: Math.abs(Number(actor?.speed || actor?.speedMph || 0))
        },
        actorGeo: actorGeo ? {
          lat: Number(actorGeo.lat || 0),
          lon: Number(actorGeo.lon || 0)
        } : null,
        locationGeo: {
          lat: Number(ctx.LOC?.lat || 0),
          lon: Number(ctx.LOC?.lon || 0),
          selLoc: String(ctx.selLoc || ''),
          customLocTransient: !!ctx.customLocTransient
        },
        targetWorld: targetWorld ? {
          x: Number(targetWorld.x || 0),
          z: Number(targetWorld.z || 0)
        } : null,
        targetDistance: targetWorld ? Math.hypot(x - Number(targetWorld.x || 0), z - Number(targetWorld.z || 0)) : null,
        targetGeoDistanceM:
          actorGeo && targetGeo ?
            geoDistanceMeters(actorGeo.lat, actorGeo.lon, targetGeo.lat, targetGeo.lon) :
            null,
        visibleNearbyRoads: typeof ctx.countVisibleRoadMeshesNearWorldPoint === 'function' ?
          ctx.countVisibleRoadMeshesNearWorldPoint(x, z, mode === 'drone' ? 420 : mode === 'walk' ? 220 : 320) :
          0,
        visibleNearbyBuildings: typeof ctx.countVisibleBuildingMeshesNearWorldPoint === 'function' ?
          ctx.countVisibleBuildingMeshesNearWorldPoint(x, z, mode === 'drone' ? 560 : mode === 'walk' ? 260 : 360) :
          0,
        visibleNearbyDetailedBuildings: typeof ctx.countVisibleDetailedBuildingMeshesNearWorldPoint === 'function' ?
          ctx.countVisibleDetailedBuildingMeshesNearWorldPoint(x, z, mode === 'drone' ? 560 : mode === 'walk' ? 260 : 360) :
          0,
        nearbyRoadFeatures: typeof ctx.countDriveableRoadFeaturesNearWorldPoint === 'function' ?
          ctx.countDriveableRoadFeaturesNearWorldPoint(x, z, mode === 'drone' ? 520 : mode === 'walk' ? 240 : 360) :
          0,
        interactive: interactive ? {
          totalLoads: Number(interactive.totalLoads || 0),
          activeInteractiveBuildings: Number(interactive.activeInteractiveBuildings || 0),
          evictedBuildings: Number(interactive.evictedBuildings || 0),
          lastLoadReason: interactive.lastLoadReason || null,
          lastError: interactive.lastError || null,
          pending: !!interactive.pending,
          pendingAgeMs: Number(interactive.pendingAgeMs || 0),
          pendingRegionKey: interactive.pendingRegionKey || null,
          coveredRegionCount: Number(interactive.coveredRegionCount || 0),
          regionCoverage
        } : null,
        playableCore: validation?.playableCore || null,
        terrain: validation?.terrain || null
      };
    };

    const tick = async (mode, burst = 1) => {
      for (let i = 0; i < burst; i++) {
        const actor = actorForMode(mode);
        if (typeof ctx.updateContinuousWorldRuntime === 'function') ctx.updateContinuousWorldRuntime();
        if (typeof ctx.updateTerrainAround === 'function') ctx.updateTerrainAround(Number(actor?.x || 0), Number(actor?.z || 0));
        if (typeof ctx.kickContinuousWorldInteractiveStreaming === 'function') {
          ctx.kickContinuousWorldInteractiveStreaming(`building_continuity_${mode}`);
        }
        if (typeof ctx.updateWorldLod === 'function') ctx.updateWorldLod(true);
        if (typeof ctx.update === 'function') ctx.update(1 / 60);
        await new Promise((resolve) => window.setTimeout(resolve, 220));
      }
    };

    const waitForStartup = async () => {
      const deadline = performance.now() + 30000;
      while (performance.now() < deadline) {
        const startup = sample('startup_probe', 'drive', null);
        const startupRoadShellReady =
          startup.visibleNearbyRoads >= 16 ||
          (
            startup.visibleNearbyRoads >= 12 &&
            startup.nearbyRoadFeatures >= 160
          );
        if (
          startup.playableCore?.ready &&
          startupRoadShellReady &&
          startup.visibleNearbyBuildings >= 24 &&
          startup.visibleNearbyDetailedBuildings >= 12
        ) {
          return startup;
        }
        await tick('drive', 1);
      }
      return null;
    };

    const startup = await waitForStartup();
    if (!startup) return { ok: false, reason: 'startup shell never became ready enough' };

    const farTarget = (() => {
      const baseX = Number(ctx.car?.x || 0);
      const baseZ = Number(ctx.car?.z || 0);
      const desiredX = baseX + 3200;
      const desiredZ = baseZ + 140;
      if (typeof ctx.resolveSafeWorldSpawn !== 'function') return null;
      const resolved = ctx.resolveSafeWorldSpawn(desiredX, desiredZ, {
        mode: 'drive',
        angle: Number(ctx.car?.angle || 0),
        maxRoadDistance: 420,
        strictMaxDistance: true,
        source: 'building_continuity_far_target',
        preferVisibleShell: false
      });
      if (!resolved?.valid) return null;
      const targetDistance = Math.hypot(Number(resolved.x || 0) - desiredX, Number(resolved.z || 0) - desiredZ);
      if (targetDistance > 460) return null;
      return resolved;
    })();
    if (!farTarget?.valid || !Number.isFinite(farTarget?.x) || !Number.isFinite(farTarget?.z)) {
      return { ok: false, reason: 'failed to resolve far target road spawn' };
    }

    const targetGeo = typeof ctx.worldToLatLon === 'function' ? ctx.worldToLatLon(farTarget.x, farTarget.z) : null;
    if (!Number.isFinite(targetGeo?.lat) || !Number.isFinite(targetGeo?.lon)) {
      return { ok: false, reason: 'failed to resolve far target geo' };
    }

    const currentTargetWorld = () => {
      const targetWorld = targetWorldPoint(targetGeo);
      return targetWorld && Number.isFinite(targetWorld.x) && Number.isFinite(targetWorld.z) ?
        targetWorld :
        { x: Number(farTarget.x || 0), z: Number(farTarget.z || 0) };
    };

    const settleMode = async (mode) => {
      const targetWorld = currentTargetWorld();
      if (typeof ctx.setTravelMode === 'function') {
        ctx.setTravelMode(mode, { source: 'building_continuity', force: true, emitTutorial: false });
      }
      if (typeof ctx.teleportToLocation === 'function') {
        ctx.teleportToLocation(targetWorld.x, targetWorld.z, {
          source: `building_continuity_${mode}`,
          preferredRoad: farTarget.road || null,
          strictMaxDistance: true
        });
      }
      if (mode === 'drone' && ctx.drone) {
        ctx.drone.x = targetWorld.x;
        ctx.drone.z = targetWorld.z;
        ctx.drone.y = Math.max(Number(ctx.drone.y || 0), 160);
        ctx.drone.speed = 18;
      }
      if (mode === 'walk' && ctx.Walk?.state?.walker) {
        ctx.Walk.state.walker.x = targetWorld.x;
        ctx.Walk.state.walker.z = targetWorld.z;
      }
      if (mode === 'drive' && ctx.car) {
        ctx.car.speed = 14;
      }
      if (mode === 'drive' && typeof ctx.loadContinuousWorldInteractiveChunk === 'function') {
        await ctx.loadContinuousWorldInteractiveChunk(targetGeo.lat, targetGeo.lon, `building_continuity_${mode}`);
      }

      let latest = sample(`${mode}_initial`, mode, targetGeo);
      const thresholds = thresholdsByMode[mode];
      for (let i = 0; i < 32; i++) {
        await tick(mode, 1);
        if (mode === 'drive' && i === 5 && ctx.car) ctx.car.speed = 0;
        if (mode === 'drone' && i === 8 && ctx.drone) ctx.drone.speed = 0;
        latest = sample(`${mode}_${i}`, mode, targetGeo);
        if (
          Number(latest.targetDistance || 0) <= (mode === 'drone' ? 260 : mode === 'walk' ? 180 : 240) &&
          Number(latest.visibleNearbyRoads || 0) >= thresholds.minRoads &&
          Number(latest.visibleNearbyBuildings || 0) >= thresholds.minBuildings &&
          Number(latest.visibleNearbyDetailedBuildings || 0) >= thresholds.minDetailedBuildings
        ) {
          break;
        }
      }
      return latest;
    };

    const drive = await settleMode('drive');
    const walk = await settleMode('walk');
    const drone = await settleMode('drone');

    return {
      ok: true,
      startup,
      target: {
        x: Number(farTarget.x || 0),
        z: Number(farTarget.z || 0),
        lat: Number(targetGeo.lat || 0),
        lon: Number(targetGeo.lon || 0)
      },
      samples: { drive, walk, drone }
    };
  });
}

async function main() {
  await mkdirp(outputDir);
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  const ignoredConsoleErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (isIgnorableConsoleError(text)) ignoredConsoleErrors.push(text);
      else consoleErrors.push(text);
    }
  });
  page.on('pageerror', (err) => {
    const text = String(err?.message || err);
    if (isIgnorableConsoleError(text)) ignoredConsoleErrors.push(text);
    else consoleErrors.push(text);
  });

  try {
    await page.goto(`${server.baseUrl}/app/`, { waitUntil: 'domcontentloaded' });
    const loader = await bootstrapEarthRuntime(page, 'baltimore');
    assert(loader?.ok, `bootstrap failed: ${loader?.reason || 'unknown'}`);

    const report = await collectContinuityReport(page);
    assert(report?.ok, report?.reason || 'building continuity report failed');

    await fs.writeFile(
      path.join(outputDir, 'raw-report.json'),
      JSON.stringify({
        ok: true,
        baseUrl: `${server.baseUrl}/app/`,
        loader,
        report,
        consoleErrors,
        ignoredConsoleErrors
      }, null, 2)
    );

    assert(
      Number(report?.startup?.visibleNearbyRoads || 0) >= 16 ||
      (
        Number(report?.startup?.visibleNearbyRoads || 0) >= 12 &&
        Number(report?.startup?.nearbyRoadFeatures || 0) >= 160
      ),
      `startup roads too thin: ${Number(report?.startup?.visibleNearbyRoads || 0)} roads / ${Number(report?.startup?.nearbyRoadFeatures || 0)} features`
    );
    assert(Number(report?.startup?.visibleNearbyBuildings || 0) >= 24, `startup buildings too thin: ${Number(report?.startup?.visibleNearbyBuildings || 0)}`);
    assert(Number(report?.startup?.visibleNearbyDetailedBuildings || 0) >= 12, `startup detailed buildings too thin: ${Number(report?.startup?.visibleNearbyDetailedBuildings || 0)}`);

    const drive = report.samples?.drive || {};
    const walk = report.samples?.walk || {};
    const drone = report.samples?.drone || {};
    const infraSignals = [
      ...consoleErrors,
      ...ignoredConsoleErrors,
      report?.startup?.interactive?.lastError,
      drive?.interactive?.lastError,
      walk?.interactive?.lastError,
      drone?.interactive?.lastError
    ].filter(Boolean);
    const overpassInfraFailure = infraSignals.some((text) => isOverpassInfraFailure(text));
    if (
      overpassInfraFailure &&
      (
        Number(drive.visibleNearbyRoads || 0) < 10 ||
        Number(drive.visibleNearbyBuildings || 0) < 12 ||
        Number(drive.visibleNearbyDetailedBuildings || 0) < 6
      )
    ) {
      throw new Error(`overpass_infra_failure_during_far_drive: ${infraSignals.find((text) => isOverpassInfraFailure(text))}`);
    }
    assert(Number(drive.visibleNearbyRoads || 0) >= 10, `drive far-region roads too thin: ${Number(drive.visibleNearbyRoads || 0)}`);
    assert(Number(drive.visibleNearbyBuildings || 0) >= 12, `drive far-region buildings too thin: ${Number(drive.visibleNearbyBuildings || 0)}`);
    assert(Number(drive.visibleNearbyDetailedBuildings || 0) >= 6, `drive far-region detailed buildings too thin: ${Number(drive.visibleNearbyDetailedBuildings || 0)}`);
    assert(Number(drive.targetDistance || 0) <= 240, `drive far-region target drifted: ${Number(drive.targetDistance || 0)}`);
    assert(Number(walk.visibleNearbyBuildings || 0) >= 10, `walk far-region buildings too thin: ${Number(walk.visibleNearbyBuildings || 0)}`);
    assert(Number(walk.visibleNearbyDetailedBuildings || 0) >= 4, `walk far-region detailed buildings too thin: ${Number(walk.visibleNearbyDetailedBuildings || 0)}`);
    assert(Number(walk.targetDistance || 0) <= 180, `walk far-region target drifted: ${Number(walk.targetDistance || 0)}`);
    assert(Number(drone.visibleNearbyBuildings || 0) >= 10, `drone far-region buildings too thin: ${Number(drone.visibleNearbyBuildings || 0)}`);
    assert(Number(drone.visibleNearbyDetailedBuildings || 0) >= 4, `drone far-region detailed buildings too thin: ${Number(drone.visibleNearbyDetailedBuildings || 0)}`);
    assert(Number(drone.targetDistance || 0) <= 260, `drone far-region target drifted: ${Number(drone.targetDistance || 0)}`);

    assert(consoleErrors.length === 0, `Unexpected console errors: ${consoleErrors.join(' | ')}`);

    await page.screenshot({ path: path.join(outputDir, 'drive.png') });
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      if (typeof ctx.setTravelMode === 'function') {
        ctx.setTravelMode('walk', { source: 'building_continuity_capture', force: true, emitTutorial: false });
      }
      if (typeof ctx.updateWorldLod === 'function') ctx.updateWorldLod(true);
    });
    await page.screenshot({ path: path.join(outputDir, 'walk.png') });
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      if (typeof ctx.setTravelMode === 'function') {
        ctx.setTravelMode('drone', { source: 'building_continuity_capture', force: true, emitTutorial: false });
      }
      if (ctx.drone) ctx.drone.y = Math.max(Number(ctx.drone.y || 0), 160);
      if (typeof ctx.updateWorldLod === 'function') ctx.updateWorldLod(true);
    });
    await page.screenshot({ path: path.join(outputDir, 'drone.png') });

    const finalReport = {
      ok: true,
      baseUrl: `${server.baseUrl}/app/`,
      loader,
      report,
      consoleErrors
    };
    await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(finalReport, null, 2));
    console.log(JSON.stringify(finalReport, null, 2));
  } finally {
    await page.close().catch(() => {});
    await browser.close().catch(() => {});
    await server.close().catch(() => {});
  }
}

main().catch(async (error) => {
  await mkdirp(outputDir).catch(() => {});
  const failure = { ok: false, error: String(error?.message || error) };
  await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(failure, null, 2)).catch(() => {});
  console.error('[test-continuous-world-building-continuity] Failed:', error);
  process.exitCode = 1;
});
