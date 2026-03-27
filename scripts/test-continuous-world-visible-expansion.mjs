import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { mkdirp, rootDir, startServer, bootstrapEarthRuntime } from './lib/runtime-browser-harness.mjs';

const outputDir = path.join(rootDir, 'output', 'playwright', 'continuous-world-visible-expansion');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isIgnorableConsoleError(text = '') {
  return /(429 \(Too Many Requests\)|504 \(Gateway Timeout\)|Could not reach Cloud Firestore backend|Failed to load resource.*favicon\.ico|net::ERR_CONNECTION_CLOSED)/i.test(String(text));
}

async function summarizeLoadedWorld(page) {
  return await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    if (!ctx) return { ok: false, reason: 'shared context unavailable' };

    const roadLength = (road) => {
      const pts = Array.isArray(road?.pts) ? road.pts : [];
      let total = 0;
      for (let i = 1; i < pts.length; i++) {
        total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
      }
      return total;
    };

    const pointOnRoadAtDistance = (road, distance) => {
      const pts = Array.isArray(road?.pts) ? road.pts : [];
      if (pts.length < 2) return null;
      const total = roadLength(road);
      const target = Math.max(0, Math.min(total, Number(distance) || 0));
      let traversed = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const dx = p2.x - p1.x;
        const dz = p2.z - p1.z;
        const seg = Math.hypot(dx, dz);
        if (traversed + seg >= target || i === pts.length - 2) {
          const local = seg > 1e-6 ? (target - traversed) / seg : 0;
          return { x: p1.x + dx * local, z: p1.z + dz * local };
        }
        traversed += seg;
      }
      return null;
    };

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

    const featureMaxDistance = (items, centerFn) => {
      let best = 0;
      for (const item of Array.isArray(items) ? items : []) {
        const center = centerFn(item);
        if (!center) continue;
        best = Math.max(best, Math.hypot(center.x, center.z));
      }
      return best;
    };

    const roadCenter = (road) => pointOnRoadAtDistance(road, roadLength(road) * 0.5);
    const isVehicleRoad = (road) => {
      const type = String(road?.type || '').toLowerCase();
      return !!type && !/^(footway|path|steps|pedestrian|corridor|cycleway)$/.test(type);
    };
    const isGradeSeparated = (road) => {
      const semantics = road?.structureSemantics || null;
      if (semantics?.gradeSeparated) return true;
      const anchors = Array.isArray(road?.structureTransitionAnchors) ? road.structureTransitionAnchors : [];
      return anchors.some((anchor) => Math.abs(Number(anchor?.targetOffset) || 0) >= 2.6);
    };

    const farRoads = (Array.isArray(ctx.roads) ? ctx.roads : [])
      .filter((road) => isVehicleRoad(road) && !isGradeSeparated(road))
      .map((road) => {
        const length = roadLength(road);
        const mid = pointOnRoadAtDistance(road, length * 0.5);
        if (!mid) return null;
        return {
          sourceFeatureId: String(road?.sourceFeatureId || ''),
          length,
          x: mid.x,
          z: mid.z,
          distance: Math.hypot(mid.x, mid.z),
          name: String(road?.name || road?.type || '')
        };
      })
      .filter(Boolean)
      .filter((road) => road.length >= 220 && road.distance >= 2200)
      .sort((a, b) => b.distance - a.distance);

    return {
      ok: true,
      loadConfig: ctx._continuousWorldVisibleLoadConfig || null,
      roads: Array.isArray(ctx.roads) ? ctx.roads.length : 0,
      buildings: Array.isArray(ctx.buildings) ? ctx.buildings.length : 0,
      waterAreas: Array.isArray(ctx.waterAreas) ? ctx.waterAreas.length : 0,
      maxRoadDistance: featureMaxDistance(ctx.roads, roadCenter),
      maxBuildingDistance: featureMaxDistance(ctx.buildings, buildingCenter),
      farRoad: farRoads[0] || null
    };
  });
}

async function travelToFarRoad(page, farRoad) {
  return await page.evaluate(async (roadRef) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    if (!ctx) return { ok: false, reason: 'shared context unavailable' };
    const roads = Array.isArray(ctx.roads) ? ctx.roads : [];
    const road = roads.find((entry) => String(entry?.sourceFeatureId || '') === String(roadRef?.sourceFeatureId || ''));
    if (!road) return { ok: false, reason: 'far road not found in runtime' };

    if (typeof ctx.setTravelMode === 'function') {
      ctx.setTravelMode('drive', { source: 'continuous_world_visible_expansion', force: true, emitTutorial: false });
    }

    if (typeof ctx.teleportToLocation === 'function') {
      ctx.teleportToLocation(roadRef.x, roadRef.z, {
        source: 'continuous_world_visible_expansion',
        preferredRoad: road
      });
    } else if (ctx.car) {
      ctx.car.x = roadRef.x;
      ctx.car.z = roadRef.z;
    }

    if (ctx.car) {
      ctx.car.speed = 0;
      ctx.car.vx = 0;
      ctx.car.vz = 0;
      ctx.car.vy = 0;
      ctx.car.road = road;
      ctx.car._lastStableRoad = road;
      ctx.car.onRoad = true;
    }

    for (let i = 0; i < 16; i++) {
      if (typeof ctx.updateContinuousWorldRuntime === 'function') {
        ctx.updateContinuousWorldRuntime();
      }
      if (typeof ctx.updateTerrainAround === 'function') {
        ctx.updateTerrainAround(Number(ctx.car?.x || 0), Number(ctx.car?.z || 0));
      }
      if (ctx.roadsNeedRebuild && typeof ctx.requestWorldSurfaceSync === 'function') {
        ctx.requestWorldSurfaceSync({ force: i === 0, source: 'continuous_world_visible_expansion' });
      }
      if (typeof ctx.update === 'function') ctx.update(1 / 60);
      if (typeof ctx.updateWorldLod === 'function') ctx.updateWorldLod(true);
      await new Promise((resolve) => window.setTimeout(resolve, 90));
    }

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

    const nearbyBuildings = (Array.isArray(ctx.buildings) ? ctx.buildings : []).reduce((count, building) => {
      const center = buildingCenter(building);
      if (!center) return count;
      return Math.hypot(center.x - Number(ctx.car?.x || 0), center.z - Number(ctx.car?.z || 0)) <= 260 ? count + 1 : count;
    }, 0);

    const nearbyRoads = (Array.isArray(ctx.roads) ? ctx.roads : []).reduce((count, road) => {
      const pts = Array.isArray(road?.pts) ? road.pts : [];
      if (pts.length === 0) return count;
      for (let i = 0; i < pts.length; i++) {
        if (Math.hypot(pts[i].x - Number(ctx.car?.x || 0), pts[i].z - Number(ctx.car?.z || 0)) <= 220) {
          return count + 1;
        }
      }
      return count;
    }, 0);

    const snapshot = typeof ctx.getContinuousWorldValidationSnapshot === 'function' ?
      ctx.getContinuousWorldValidationSnapshot() :
      null;

    return {
      ok: true,
      actor: snapshot?.actor || null,
      road: snapshot?.road || null,
      nearbyBuildings,
      nearbyRoads
    };
  }, farRoad);
}

async function main() {
  await mkdirp(outputDir);
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  const consoleErrors = [];

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (isIgnorableConsoleError(text)) return;
    consoleErrors.push(text);
  });

  const report = {
    baseUrl: `${server.baseUrl}/app/`,
    initial: null,
    farTravel: null,
    screenshots: {},
    consoleErrors,
    failures: []
  };

  try {
    await page.goto(`${server.baseUrl}/app/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const boot = await bootstrapEarthRuntime(page, 'baltimore');
    assert(boot?.ok, `bootstrap failed: ${boot?.reason || 'unknown'}`);

    report.initial = await summarizeLoadedWorld(page);
    assert(report.initial?.ok, report.initial?.reason || 'initial summary failed');
    assert(report.initial?.loadConfig?.enabled === true, 'continuous-world visible load config missing');
    assert((report.initial?.maxRoadDistance || 0) >= 2400, `loaded road extent too small: ${report.initial?.maxRoadDistance || 0}`);
    assert((report.initial?.maxBuildingDistance || 0) >= 2200, `loaded building extent too small: ${report.initial?.maxBuildingDistance || 0}`);
    assert(report.initial?.farRoad, 'no far road candidate found');

    report.screenshots.initial = path.join(outputDir, 'initial.png');
    await page.screenshot({ path: report.screenshots.initial, fullPage: true });

    report.farTravel = await travelToFarRoad(page, report.initial.farRoad);
    assert(report.farTravel?.ok, report.farTravel?.reason || 'far travel failed');
    assert(report.farTravel?.road?.onRoad, 'road contact lost after far travel');
    assert((report.farTravel?.nearbyRoads || 0) >= 2, `too few nearby roads after far travel: ${report.farTravel?.nearbyRoads || 0}`);
    assert((report.farTravel?.nearbyBuildings || 0) >= 4, `too few nearby buildings after far travel: ${report.farTravel?.nearbyBuildings || 0}`);

    report.screenshots.far = path.join(outputDir, 'far.png');
    await page.screenshot({ path: report.screenshots.far, fullPage: true });
  } catch (error) {
    report.failures.push(error?.message || String(error));
  } finally {
    await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
    await context.close();
    await browser.close();
    await server.close();
  }

  if (report.failures.length > 0) {
    throw new Error(report.failures.join('\n'));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
