import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { mkdirp, rootDir, startServer, bootstrapEarthRuntime } from './lib/runtime-browser-harness.mjs';

const outputDir = path.join(rootDir, 'output', 'playwright', 'continuous-world-interactive-streaming');
const TARGETS = [
  {
    id: 'upper_manhattan',
    lat: 40.8105,
    lon: -73.949,
    minNearbyRoads: 1,
    minNearbyBuildings: 3
  }
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isIgnorableConsoleError(text = '') {
  return /(429 \(Too Many Requests\)|504 \(Gateway Timeout\)|502 \(Bad Gateway\)|503 \(Service Unavailable\)|Could not reach Cloud Firestore backend|Failed to load resource.*favicon\.ico|net::ERR_CONNECTION_CLOSED)/i.test(String(text));
}

async function summarizeInitialWorld(page, target) {
  return page.evaluate(async ({ targetLat, targetLon }) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    if (!ctx) return { ok: false, reason: 'shared context unavailable' };

    const buildingCenter = (feature) => {
      if (Number.isFinite(feature?.centerX) && Number.isFinite(feature?.centerZ)) {
        return { x: feature.centerX, z: feature.centerZ };
      }
      if (Number.isFinite(feature?.minX) && Number.isFinite(feature?.maxX) && Number.isFinite(feature?.minZ) && Number.isFinite(feature?.maxZ)) {
        return {
          x: (feature.minX + feature.maxX) * 0.5,
          z: (feature.minZ + feature.maxZ) * 0.5
        };
      }
      return null;
    };

    let maxBuildingDistance = 0;
    for (const building of Array.isArray(ctx.buildings) ? ctx.buildings : []) {
      const center = buildingCenter(building);
      if (!center) continue;
      maxBuildingDistance = Math.max(maxBuildingDistance, Math.hypot(center.x, center.z));
    }

    const targetWorld = typeof ctx.geoToWorld === 'function' ? ctx.geoToWorld(targetLat, targetLon) : null;
    return {
      ok: true,
      roads: Array.isArray(ctx.roads) ? ctx.roads.length : 0,
      buildings: Array.isArray(ctx.buildings) ? ctx.buildings.length : 0,
      landuseMeshes: Array.isArray(ctx.landuseMeshes) ? ctx.landuseMeshes.length : 0,
      waterAreas: Array.isArray(ctx.waterAreas) ? ctx.waterAreas.length : 0,
      waterways: Array.isArray(ctx.waterways) ? ctx.waterways.length : 0,
      maxBuildingDistance,
      targetWorld
    };
  }, { targetLat: target.lat, targetLon: target.lon });
}

async function moveToTargetAndWait(page, target) {
  return page.evaluate(async ({ targetLat, targetLon, targetId }) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    if (!ctx) return { ok: false, reason: 'shared context unavailable' };
    const targetWorld = typeof ctx.geoToWorld === 'function' ? ctx.geoToWorld(targetLat, targetLon) : null;
    if (!targetWorld || !Number.isFinite(targetWorld.x) || !Number.isFinite(targetWorld.z)) {
      return { ok: false, reason: 'target world conversion failed' };
    }

    const countNearbyBuildings = (radius = 280) => {
      let count = 0;
      for (const building of Array.isArray(ctx.buildings) ? ctx.buildings : []) {
        const centerX = Number.isFinite(building?.centerX) ? building.centerX : (Number(building?.minX || 0) + Number(building?.maxX || 0)) * 0.5;
        const centerZ = Number.isFinite(building?.centerZ) ? building.centerZ : (Number(building?.minZ || 0) + Number(building?.maxZ || 0)) * 0.5;
        if (Math.hypot(centerX - targetWorld.x, centerZ - targetWorld.z) <= radius) count += 1;
      }
      return count;
    };

    const countNearbyBuildingMeshes = (radius = 420) => {
      let count = 0;
      for (const mesh of Array.isArray(ctx.buildingMeshes) ? ctx.buildingMeshes : []) {
        if (!mesh) continue;
        let centerX = Number(mesh?.position?.x);
        let centerZ = Number(mesh?.position?.z);
        if (!Number.isFinite(centerX) || !Number.isFinite(centerZ)) {
          const footprint = mesh?.userData?.buildingFootprint;
          if (!Array.isArray(footprint) || footprint.length === 0) continue;
          centerX = 0;
          centerZ = 0;
          for (let i = 0; i < footprint.length; i++) {
            centerX += Number(footprint[i]?.x || 0);
            centerZ += Number(footprint[i]?.z || 0);
          }
          centerX /= footprint.length;
          centerZ /= footprint.length;
        }
        if (Math.hypot(centerX - targetWorld.x, centerZ - targetWorld.z) <= radius) count += 1;
      }
      return count;
    };

    const countNearbyRoads = (radius = 220) => {
      let count = 0;
      for (const road of Array.isArray(ctx.roads) ? ctx.roads : []) {
        const pts = Array.isArray(road?.pts) ? road.pts : [];
        for (let i = 0; i < pts.length; i++) {
          if (Math.hypot(pts[i].x - targetWorld.x, pts[i].z - targetWorld.z) <= radius) {
            count += 1;
            break;
          }
        }
      }
      return count;
    };

    const countNearbyLanduseMeshes = (radius = 260) => {
      const distanceToBounds = (bounds) => {
        if (!bounds) return Infinity;
        const dx =
          targetWorld.x < bounds.minX ? bounds.minX - targetWorld.x :
          targetWorld.x > bounds.maxX ? targetWorld.x - bounds.maxX :
          0;
        const dz =
          targetWorld.z < bounds.minZ ? bounds.minZ - targetWorld.z :
          targetWorld.z > bounds.maxZ ? targetWorld.z - bounds.maxZ :
          0;
        return Math.hypot(dx, dz);
      };
      let count = 0;
      for (const mesh of Array.isArray(ctx.landuseMeshes) ? ctx.landuseMeshes : []) {
        const lodCenter = mesh?.userData?.lodCenter;
        const lodRadius = Number(mesh?.userData?.lodRadius || 0);
        if (lodCenter && Number.isFinite(lodCenter.x) && Number.isFinite(lodCenter.z)) {
          if (Math.hypot(lodCenter.x - targetWorld.x, lodCenter.z - targetWorld.z) <= lodRadius + radius) {
            count += 1;
          }
          continue;
        }
        const footprint = mesh?.userData?.landuseFootprint || mesh?.userData?.waterwayCenterline;
        if (Array.isArray(footprint) && footprint.length > 0) {
          let sumX = 0;
          let sumZ = 0;
          for (let i = 0; i < footprint.length; i++) {
            sumX += footprint[i].x;
            sumZ += footprint[i].z;
          }
          const centerX = sumX / footprint.length;
          const centerZ = sumZ / footprint.length;
          if (Math.hypot(centerX - targetWorld.x, centerZ - targetWorld.z) <= radius) count += 1;
          continue;
        }
        if (distanceToBounds(mesh?.userData?.landuseBounds || mesh?.userData?.bounds) <= radius) count += 1;
      }
      return count;
    };

    const countNearbyWaterAreas = (radius = 340) => {
      const distanceToBounds = (bounds) => {
        if (!bounds) return Infinity;
        const dx =
          targetWorld.x < bounds.minX ? bounds.minX - targetWorld.x :
          targetWorld.x > bounds.maxX ? targetWorld.x - bounds.maxX :
          0;
        const dz =
          targetWorld.z < bounds.minZ ? bounds.minZ - targetWorld.z :
          targetWorld.z > bounds.maxZ ? targetWorld.z - bounds.maxZ :
          0;
        return Math.hypot(dx, dz);
      };
      let count = 0;
      for (const area of Array.isArray(ctx.waterAreas) ? ctx.waterAreas : []) {
        if (distanceToBounds(area?.bounds) <= radius) {
          count += 1;
          continue;
        }
        const centerX = Number.isFinite(area?.centerX) ? area.centerX : 0;
        const centerZ = Number.isFinite(area?.centerZ) ? area.centerZ : 0;
        if (Math.hypot(centerX - targetWorld.x, centerZ - targetWorld.z) <= radius) count += 1;
      }
      for (const waterway of Array.isArray(ctx.waterways) ? ctx.waterways : []) {
        const pts = Array.isArray(waterway?.pts) ? waterway.pts : [];
        for (let i = 0; i < pts.length; i++) {
          if (Math.hypot(pts[i].x - targetWorld.x, pts[i].z - targetWorld.z) <= radius) {
            count += 1;
            break;
          }
        }
      }
      return count;
    };

    const before = {
      roads: Array.isArray(ctx.roads) ? ctx.roads.length : 0,
      buildings: Array.isArray(ctx.buildings) ? ctx.buildings.length : 0,
      landuseMeshes: Array.isArray(ctx.landuseMeshes) ? ctx.landuseMeshes.length : 0,
      waterAreas: Array.isArray(ctx.waterAreas) ? ctx.waterAreas.length : 0,
      waterways: Array.isArray(ctx.waterways) ? ctx.waterways.length : 0
    };

    if (typeof ctx.setTravelMode === 'function') {
      ctx.setTravelMode('drive', { source: 'continuous_world_interactive_stream', force: true, emitTutorial: false });
    }
    if (typeof ctx.configureContinuousWorldInteractiveStreaming === 'function') {
      ctx.configureContinuousWorldInteractiveStreaming({ autoKickEnabled: false });
    }
    if (typeof ctx.resetContinuousWorldInteractiveStreamState === 'function') {
      ctx.resetContinuousWorldInteractiveStreamState('test_reset');
    }
    if (typeof ctx.seedContinuousWorldInteractiveStreamState === 'function') {
      ctx.seedContinuousWorldInteractiveStreamState();
    }
    if (typeof ctx.teleportToLocation === 'function') {
      ctx.teleportToLocation(targetWorld.x, targetWorld.z, { source: 'continuous_world_interactive_stream' });
    } else if (ctx.car) {
      ctx.car.x = targetWorld.x;
      ctx.car.z = targetWorld.z;
    }
    if (ctx.car) {
      ctx.car.speed = 0;
      ctx.car.vx = 0;
      ctx.car.vy = 0;
      ctx.car.vz = 0;
      ctx.car.onRoad = false;
      ctx.car.road = null;
      ctx.car._lastStableRoad = null;
      ctx.car.angle = Math.PI * 0.5;
      ctx.car.speed = 14;
    }

    let snapshots = [];
    for (let i = 0; i < 8; i++) {
      if (typeof ctx.updateContinuousWorldRuntime === 'function') ctx.updateContinuousWorldRuntime();
      if (typeof ctx.updateTerrainAround === 'function') ctx.updateTerrainAround(targetWorld.x, targetWorld.z);
      if (typeof ctx.update === 'function') ctx.update(1 / 60);
      if (typeof ctx.updateWorldLod === 'function') ctx.updateWorldLod(true);
      await new Promise((resolve) => window.setTimeout(resolve, 140));
    }

    if (typeof ctx.loadContinuousWorldInteractiveChunk === 'function') {
      await ctx.loadContinuousWorldInteractiveChunk(targetLat, targetLon, 'test_direct');
    }
    if (typeof ctx.configureContinuousWorldInteractiveStreaming === 'function') {
      ctx.configureContinuousWorldInteractiveStreaming({ autoKickEnabled: true });
    }
    let stableTicks = 0;
    for (let i = 0; i < 90; i++) {
      if (typeof ctx.updateContinuousWorldRuntime === 'function') ctx.updateContinuousWorldRuntime();
      if (typeof ctx.updateTerrainAround === 'function') ctx.updateTerrainAround(targetWorld.x, targetWorld.z);
      if (typeof ctx.update === 'function') ctx.update(1 / 60);
      if (typeof ctx.kickContinuousWorldInteractiveStreaming === 'function') {
        ctx.kickContinuousWorldInteractiveStreaming('test_prefetch');
      }
      if (typeof ctx.updateWorldLod === 'function') ctx.updateWorldLod(true);
      await new Promise((resolve) => window.setTimeout(resolve, 250));
      const validation = typeof ctx.getContinuousWorldValidationSnapshot === 'function' ? ctx.getContinuousWorldValidationSnapshot() : null;
      const snapshot = {
        tick: i,
        roads: Array.isArray(ctx.roads) ? ctx.roads.length : 0,
        buildings: Array.isArray(ctx.buildings) ? ctx.buildings.length : 0,
        landuseMeshes: Array.isArray(ctx.landuseMeshes) ? ctx.landuseMeshes.length : 0,
        waterAreas: Array.isArray(ctx.waterAreas) ? ctx.waterAreas.length : 0,
        waterways: Array.isArray(ctx.waterways) ? ctx.waterways.length : 0,
        nearbyBuildings: countNearbyBuildings(),
        nearbyRoads: countNearbyRoads(),
        nearbyLanduse: countNearbyLanduseMeshes(),
        nearbyWater: countNearbyWaterAreas(),
        onRoad: !!validation?.road?.onRoad,
        streamLoads: Number(validation?.interactiveStream?.totalLoads || 0),
        coverageCount: Number(validation?.interactiveStream?.coverageCount || 0),
        coveredRegionCount: Number(validation?.interactiveStream?.coveredRegionCount || 0),
        pending: !!validation?.interactiveStream?.pending
      };
      snapshots.push(snapshot);
      if (!snapshot.pending && snapshot.streamLoads >= 1 && snapshot.nearbyRoads >= 1) {
        stableTicks += 1;
        if (stableTicks >= 2) break;
      } else {
        stableTicks = 0;
      }
    }

    const validation = typeof ctx.getContinuousWorldValidationSnapshot === 'function' ? ctx.getContinuousWorldValidationSnapshot() : null;

    return {
      ok: true,
      id: targetId,
      before,
      targetWorld,
      roads: Array.isArray(ctx.roads) ? ctx.roads.length : 0,
      buildings: Array.isArray(ctx.buildings) ? ctx.buildings.length : 0,
      landuseMeshes: Array.isArray(ctx.landuseMeshes) ? ctx.landuseMeshes.length : 0,
      waterAreas: Array.isArray(ctx.waterAreas) ? ctx.waterAreas.length : 0,
      waterways: Array.isArray(ctx.waterways) ? ctx.waterways.length : 0,
      nearbyBuildings: countNearbyBuildings(),
      nearbyBuildingMeshes: countNearbyBuildingMeshes(),
      nearbyRoads: countNearbyRoads(),
      nearbyLanduse: countNearbyLanduseMeshes(),
      nearbyWater: countNearbyWaterAreas(),
      validation,
      snapshots
    };
  }, { targetLat: target.lat, targetLon: target.lon, targetId: target.id });
}

async function main() {
  await mkdirp(outputDir);
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  const consoleErrors = [];
  const report = {
    baseUrl: `${server.baseUrl}/app/`,
    initial: null,
    cases: [],
    screenshots: {},
    consoleErrors,
    failures: []
  };

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (isIgnorableConsoleError(text)) return;
    consoleErrors.push(text);
  });

  try {
    await page.goto(`${server.baseUrl}/app/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const boot = await bootstrapEarthRuntime(page, 'newyork');
    assert(boot?.ok, `bootstrap failed: ${boot?.reason || 'unknown'}`);
    await page.waitForFunction(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return Array.isArray(ctx?.roads) && ctx.roads.length > 1000 &&
        Array.isArray(ctx?.buildings) && ctx.buildings.length > 1000;
    }, { timeout: 90000 });

    report.initial = await summarizeInitialWorld(page, TARGETS[0]);
    assert(report.initial?.ok, report.initial?.reason || 'initial summary failed');
    assert((report.initial?.roads || 0) > 0, 'initial world loaded no roads');
    assert(Number.isFinite(report.initial?.targetWorld?.x) && Number.isFinite(report.initial?.targetWorld?.z), 'target world point missing');
    const targetDistance = Math.hypot(report.initial.targetWorld.x, report.initial.targetWorld.z);
    assert(targetDistance > (report.initial.maxBuildingDistance || 0) + 600, `target is not beyond initial building envelope: ${targetDistance} vs ${report.initial.maxBuildingDistance}`);

    report.screenshots.initial = path.join(outputDir, 'initial.png');
    await page.screenshot({ path: report.screenshots.initial, fullPage: true });

    for (const target of TARGETS) {
      const caseReport = await moveToTargetAndWait(page, target);
      report.cases.push(caseReport);
      assert(caseReport?.ok, caseReport?.reason || `interactive stream move failed for ${target.id}`);
      assert((caseReport?.validation?.interactiveStream?.totalLoads || 0) >= 1, `no interactive chunk was loaded for ${target.id}`);
      assert((caseReport?.nearbyRoads || 0) >= (target.minNearbyRoads || 0), `too few nearby roads after streaming at ${target.id}: ${caseReport?.nearbyRoads || 0}`);
      const nearbyVisibleBuildings = Math.max(
        Number(caseReport?.nearbyBuildings || 0),
        Number(caseReport?.nearbyBuildingMeshes || 0)
      );
      assert(
        nearbyVisibleBuildings >= (target.minNearbyBuildings || 0),
        `too few nearby buildings after streaming at ${target.id}: colliders=${caseReport?.nearbyBuildings || 0}, meshes=${caseReport?.nearbyBuildingMeshes || 0}`
      );
      if (target.id === 'upper_manhattan') {
        assert((caseReport?.validation?.interactiveStream?.totalLoads || 0) >= 2, 'interactive streaming did not prefetch multiple chunks');
        assert((caseReport?.validation?.interactiveStream?.coveredRegionCount || 0) >= 2, 'interactive streaming did not cover multiple regions');
        assert(
          Array.isArray(caseReport?.validation?.interactiveStream?.coverage) &&
            caseReport.validation.interactiveStream.coverage.some((entry) => String(entry?.reason || '').startsWith('region_prefetch:')),
          'interactive streaming did not record region-prefetch coverage'
        );
        assert(
          Array.isArray(caseReport?.validation?.interactiveStream?.coveredRegionKeys) &&
            caseReport.validation.interactiveStream.coveredRegionKeys.includes('2040:-3697'),
          'interactive streaming did not prefetch the eastward adjacent region for the movement heading'
        );
        assert((caseReport?.roads || 0) > (report.initial?.roads || 0), 'road count did not increase after streaming');
        assert(
          nearbyVisibleBuildings >= (target.minNearbyBuildings || 0),
          `too few nearby visible buildings after roads-first streaming at ${target.id}: ${nearbyVisibleBuildings}`
        );
      }

      report.screenshots[target.id] = path.join(outputDir, `${target.id}.png`);
      await page.screenshot({ path: report.screenshots[target.id], fullPage: true });
    }
  } catch (error) {
    report.failures.push(error?.message || String(error));
  } finally {
    await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
    await context.close();
    await browser.close();
    await server.close();
  }

  if (report.failures.length) {
    console.error(report.failures.join('\n'));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
