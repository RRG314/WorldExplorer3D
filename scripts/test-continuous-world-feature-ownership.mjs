import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { CONTINUOUS_WORLD_LOCATIONS } from './continuous-world-scenarios.mjs';
import { mkdirp, rootDir, startServer, bootstrapEarthRuntime, loadEarthLocation } from './lib/runtime-browser-harness.mjs';

const outputDir = path.join(rootDir, 'output', 'playwright', 'continuous-world-feature-ownership');

const denseCityLocations = [
  CONTINUOUS_WORLD_LOCATIONS.baltimore,
  CONTINUOUS_WORLD_LOCATIONS.newyork,
  CONTINUOUS_WORLD_LOCATIONS.sanfrancisco
];

const structureLocations = [
  CONTINUOUS_WORLD_LOCATIONS.baltimore,
  CONTINUOUS_WORLD_LOCATIONS.newyork,
  CONTINUOUS_WORLD_LOCATIONS.seattle
];

const waterLocations = [
  CONTINUOUS_WORLD_LOCATIONS.miami,
  CONTINUOUS_WORLD_LOCATIONS.monaco
];

function isIgnorableConsoleError(text = '') {
  return /(429 \(Too Many Requests\)|504 \(Gateway Timeout\)|Could not reach Cloud Firestore backend|net::ERR_CONNECTION_CLOSED)/i.test(String(text));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function writeReport(report) {
  await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
}

async function runDenseCityCase(page, locationSpec) {
  return await page.evaluate(async (spec) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    if (!ctx || typeof ctx.getContinuousWorldValidationSnapshot !== 'function') {
      return { ok: false, reason: 'continuous-world diagnostics unavailable' };
    }

    const roadLength = (road) => {
      if (road?.surfaceDistances instanceof Float32Array && road.surfaceDistances.length > 0) {
        return Number(road.surfaceDistances[road.surfaceDistances.length - 1]) || 0;
      }
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
          return {
            x: p1.x + dx * local,
            z: p1.z + dz * local
          };
        }
        traversed += seg;
      }
      return null;
    };

    const featureCenter = (feature) => {
      if (Array.isArray(feature?.pts) && feature.pts.length > 0) {
        let sx = 0;
        let sz = 0;
        const pts = feature.pts;
        for (let i = 0; i < pts.length; i++) {
          sx += Number(pts[i].x || 0);
          sz += Number(pts[i].z || 0);
        }
        return { x: sx / pts.length, z: sz / pts.length };
      }
      if (Number.isFinite(feature?.minX) && Number.isFinite(feature?.maxX) && Number.isFinite(feature?.minZ) && Number.isFinite(feature?.maxZ)) {
        return { x: (feature.minX + feature.maxX) * 0.5, z: (feature.minZ + feature.maxZ) * 0.5 };
      }
      return null;
    };

    const buildingDensityAt = (x, z, radius = 180) => {
      const buildings = Array.isArray(ctx.buildings) ? ctx.buildings : [];
      let count = 0;
      for (let i = 0; i < buildings.length; i++) {
        const center = featureCenter(buildings[i]);
        if (!center) continue;
        if (Math.hypot(center.x - x, center.z - z) <= radius) count++;
      }
      return count;
    };

    const roadTypeScore = (road) => {
      const type = String(road?.type || '').toLowerCase();
      if (type.startsWith('motorway')) return 6;
      if (type.startsWith('trunk')) return 5;
      if (type.startsWith('primary')) return 4;
      if (type.startsWith('secondary')) return 3;
      if (type.startsWith('tertiary')) return 2;
      return 1;
    };

    const isVehicleRoad = (road) => {
      const type = String(road?.type || '').toLowerCase();
      if (!type) return false;
      return !/^(footway|path|steps|pedestrian|corridor|cycleway)$/.test(type);
    };

    const gradeSeparatedLike = (road) => {
      const semantics = road?.structureSemantics || null;
      if (semantics?.gradeSeparated) return true;
      const anchors = Array.isArray(road?.structureTransitionAnchors) ? road.structureTransitionAnchors : [];
      return anchors.some((anchor) => Math.abs(Number(anchor?.targetOffset) || 0) >= 2.6);
    };

    const tunnelLike = (road) => {
      const semantics = road?.structureSemantics || null;
      const tags = road?.structureTags || null;
      return semantics?.terrainMode === 'subgrade' || String(tags?.tunnel || '').toLowerCase() === 'yes';
    };

    const roads = Array.isArray(ctx.roads) ? ctx.roads : [];
    const candidates = [];
    for (let i = 0; i < roads.length; i++) {
      const road = roads[i];
      if (!isVehicleRoad(road)) continue;
      if (gradeSeparatedLike(road) || tunnelLike(road)) continue;
      const length = roadLength(road);
      if (length < 220) continue;
      const mid = pointOnRoadAtDistance(road, length * 0.5);
      const quarter = pointOnRoadAtDistance(road, length * 0.25);
      const threeQuarter = pointOnRoadAtDistance(road, length * 0.75);
      if (!mid || !quarter || !threeQuarter) continue;
      const density =
        buildingDensityAt(mid.x, mid.z, 200) +
        buildingDensityAt(quarter.x, quarter.z, 180) +
        buildingDensityAt(threeQuarter.x, threeQuarter.z, 180);
      if (density < 18) continue;
      candidates.push({ road, score: density * 10 + roadTypeScore(road) * 40 + length });
    }
    candidates.sort((a, b) => b.score - a.score);
    const selected = candidates[0]?.road || null;
    if (!selected) {
      return { ok: false, skipped: true, reason: `no dense city road found for ${spec.id}` };
    }

    const samples = [];
    const total = roadLength(selected);
    const pad = Math.min(26, total * 0.08);
    const sampleCount = 10;
    for (let i = 0; i < sampleCount; i++) {
      const t = sampleCount <= 1 ? 0.5 : i / (sampleCount - 1);
      const point = pointOnRoadAtDistance(selected, pad + (total - pad * 2) * t);
      if (!point) continue;
      if (typeof ctx.setTravelMode === 'function') {
        ctx.setTravelMode('drive', { source: 'cw_dense_city_features', force: true, emitTutorial: false });
      } else if (ctx.Walk?.setModeDrive) {
        ctx.Walk.setModeDrive();
      }
      ctx.teleportToLocation(point.x, point.z, {
        source: 'cw_dense_city_features',
        preferredRoad: selected
      });
      if (ctx.car) {
        ctx.car.speed = 0;
        ctx.car.vx = 0;
        ctx.car.vz = 0;
        ctx.car.vy = 0;
        ctx.car.onRoad = true;
        ctx.car.road = selected;
        ctx.car._lastStableRoad = selected;
      }
      for (let j = 0; j < 6; j++) {
        if (typeof ctx.updateTerrainAround === 'function' && !ctx.worldLoading) {
          ctx.updateTerrainAround(point.x, point.z);
        }
        if (ctx.roadsNeedRebuild && typeof ctx.requestWorldSurfaceSync === 'function') {
          ctx.requestWorldSurfaceSync({ force: j === 0, source: 'cw_dense_city_features' });
        }
        if (typeof ctx.update === 'function') ctx.update(1 / 60);
        await new Promise((resolve) => window.setTimeout(resolve, 60));
      }
      const snap = ctx.getContinuousWorldValidationSnapshot();
      samples.push({
        road: snap?.road || null,
        featureOwnership: snap?.featureOwnership || null,
        terrain: snap?.terrain || null
      });
    }

    const failures = [];
    let minNearbyBuildings = Infinity;
    let maxOutsideTrackedBuildings = 0;
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      const road = sample.road || {};
      const ownership = sample.featureOwnership || {};
      const buildings = ownership.buildings || {};
      if (!road.onRoad) failures.push(`sample ${i}: road contact lost`);
      if (Number(buildings.total || 0) <= 0) failures.push(`sample ${i}: no loaded buildings reported`);
      if (Number(buildings.nearbyCount || 0) < 6) failures.push(`sample ${i}: nearby building continuity too low (${buildings.nearbyCount || 0})`);
      if (Number(buildings.bands?.near || 0) <= 0) failures.push(`sample ${i}: no near-band buildings`);
      minNearbyBuildings = Math.min(minNearbyBuildings, Number(buildings.nearbyCount || 0));
      maxOutsideTrackedBuildings = Math.max(maxOutsideTrackedBuildings, Number(buildings.bands?.outside || 0));
    }

    return {
      ok: failures.length === 0,
      skipped: false,
      location: spec.label,
      selectedRoad: {
        type: selected.type || null,
        name: selected.name || null,
        length: Number(total.toFixed(2))
      },
      summary: {
        minNearbyBuildings: Number.isFinite(minNearbyBuildings) ? minNearbyBuildings : 0,
        maxOutsideTrackedBuildings
      },
      failures,
      samples: samples.slice(0, 12)
    };
  }, locationSpec);
}

async function runStructureCase(page, locationSpec) {
  return await page.evaluate(async (spec) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    if (!ctx || typeof ctx.getContinuousWorldValidationSnapshot !== 'function') {
      return { ok: false, reason: 'continuous-world diagnostics unavailable' };
    }

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

    const gradeSeparatedLike = (road) => {
      const semantics = road?.structureSemantics || null;
      if (semantics?.gradeSeparated) return true;
      const anchors = Array.isArray(road?.structureTransitionAnchors) ? road.structureTransitionAnchors : [];
      return anchors.some((anchor) => Math.abs(Number(anchor?.targetOffset) || 0) >= 2.6);
    };

    const candidates = (Array.isArray(ctx.roads) ? ctx.roads : [])
      .filter((road) => Array.isArray(road?.pts) && road.pts.length >= 2 && gradeSeparatedLike(road) && roadLength(road) > 180)
      .map((road) => ({
        road,
        score:
          roadLength(road) +
          (Array.isArray(road?.structureTransitionAnchors) ? road.structureTransitionAnchors.length : 0) * 80
      }))
      .sort((a, b) => b.score - a.score);
    const selected = candidates[0]?.road || null;
    if (!selected) {
      return { ok: false, skipped: true, reason: `no elevated structure road found for ${spec.id}` };
    }

    const samples = [];
    const total = roadLength(selected);
    const pad = Math.min(22, total * 0.06);
    const sampleCount = 8;
    for (let i = 0; i < sampleCount; i++) {
      const t = sampleCount <= 1 ? 0.5 : i / (sampleCount - 1);
      const point = pointOnRoadAtDistance(selected, pad + (total - pad * 2) * t);
      if (!point) continue;
      if (typeof ctx.setTravelMode === 'function') {
        ctx.setTravelMode('drive', { source: 'cw_structure_features', force: true, emitTutorial: false });
      } else if (ctx.Walk?.setModeDrive) {
        ctx.Walk.setModeDrive();
      }
      ctx.teleportToLocation(point.x, point.z, {
        source: 'cw_structure_features',
        preferredRoad: selected
      });
      if (ctx.car) {
        ctx.car.speed = 0;
        ctx.car.vx = 0;
        ctx.car.vz = 0;
        ctx.car.vy = 0;
        ctx.car.onRoad = true;
        ctx.car.road = selected;
        ctx.car._lastStableRoad = selected;
      }
      for (let j = 0; j < 6; j++) {
        if (typeof ctx.updateTerrainAround === 'function' && !ctx.worldLoading) {
          ctx.updateTerrainAround(point.x, point.z);
        }
        if (ctx.roadsNeedRebuild && typeof ctx.requestWorldSurfaceSync === 'function') {
          ctx.requestWorldSurfaceSync({ force: j === 0, source: 'cw_structure_features' });
        }
        if (typeof ctx.update === 'function') ctx.update(1 / 60);
        await new Promise((resolve) => window.setTimeout(resolve, 70));
      }
      const snap = ctx.getContinuousWorldValidationSnapshot();
      samples.push({
        road: snap?.road || null,
        featureOwnership: snap?.featureOwnership || null
      });
    }

    const failures = [];
    let minNearbyStructures = Infinity;
    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      const road = sample.road || {};
      const ownership = sample.featureOwnership || {};
      const structures = ownership.structures || {};
      if (!road.onRoad) failures.push(`sample ${i}: road contact lost`);
      if (Number(structures.total || 0) <= 0) failures.push(`sample ${i}: no structures reported`);
      if (Number(structures.nearbyCount || 0) < 1) failures.push(`sample ${i}: no nearby structures`);
      if (Number(structures.bands?.near || 0) <= 0) failures.push(`sample ${i}: no near-band structures`);
      minNearbyStructures = Math.min(minNearbyStructures, Number(structures.nearbyCount || 0));
    }

    return {
      ok: failures.length === 0,
      skipped: false,
      location: spec.label,
      selectedRoad: {
        type: selected.type || null,
        name: selected.name || null,
        length: Number(total.toFixed(2))
      },
      summary: {
        minNearbyStructures: Number.isFinite(minNearbyStructures) ? minNearbyStructures : 0
      },
      failures,
      samples: samples.slice(0, 12)
    };
  }, locationSpec);
}

async function runWaterCase(page, locationSpec) {
  return await page.evaluate(async (spec) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    if (!ctx || typeof ctx.getContinuousWorldValidationSnapshot !== 'function') {
      return { ok: false, reason: 'continuous-world diagnostics unavailable' };
    }

    const roadLength = (feature) => {
      const pts = Array.isArray(feature?.pts) ? feature.pts : [];
      let total = 0;
      for (let i = 1; i < pts.length; i++) {
        total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
      }
      return total;
    };

    const waterways = (Array.isArray(ctx.waterways) ? ctx.waterways : [])
      .filter((entry) => Array.isArray(entry?.pts) && entry.pts.length >= 3)
      .map((entry) => ({ entry, length: roadLength(entry) }))
      .filter((entry) => entry.length > 150)
      .sort((a, b) => b.length - a.length);
    const selected = waterways[0]?.entry || null;
    if (!selected) {
      return { ok: false, skipped: true, reason: `no waterway candidate found for ${spec.id}` };
    }
    const mid = selected.pts[Math.floor(selected.pts.length * 0.5)];
    if (!mid) {
      return { ok: false, skipped: true, reason: 'waterway midpoint unavailable' };
    }

    if (typeof ctx.enterBoatAtWorldPoint === 'function') {
      ctx.enterBoatAtWorldPoint(mid.x, mid.z, {
        source: 'cw_water_features',
        emitTutorial: false,
        maxDistance: 180
      });
    }
    if (typeof ctx.setTravelMode === 'function') {
      ctx.setTravelMode('boat', { source: 'cw_water_features', force: true, emitTutorial: false });
    }
    for (let i = 0; i < 10; i++) {
      if (typeof ctx.updateBoatMode === 'function') ctx.updateBoatMode(1 / 60);
      if (typeof ctx.updateTerrainAround === 'function' && !ctx.worldLoading) {
        const actor = ctx.getContinuousWorldValidationSnapshot()?.actor || { x: mid.x, z: mid.z };
        ctx.updateTerrainAround(Number(actor.x || mid.x), Number(actor.z || mid.z));
      }
      if (ctx.roadsNeedRebuild && typeof ctx.requestWorldSurfaceSync === 'function') {
        ctx.requestWorldSurfaceSync({ force: i === 0, source: 'cw_water_features' });
      }
      if (typeof ctx.update === 'function') ctx.update(1 / 60);
      await new Promise((resolve) => window.setTimeout(resolve, 90));
    }

    const snap = ctx.getContinuousWorldValidationSnapshot();
    const water = snap?.featureOwnership?.water || {};
    const failures = [];
    if (!ctx.boatMode?.active) failures.push('boat mode not active');
    if (Number(water.total || 0) <= 0) failures.push('no water features reported');
    if (Number(water.nearbyCount || 0) <= 0) failures.push('no nearby water features');
    if (Number(water.bands?.near || 0) <= 0) failures.push('no near-band water features');

    return {
      ok: failures.length === 0,
      skipped: false,
      location: spec.label,
      summary: {
        nearbyWater: Number(water.nearbyCount || 0),
        waterTotal: Number(water.total || 0)
      },
      failures,
      snapshot: snap
    };
  }, locationSpec);
}

async function main() {
  await mkdirp(outputDir);
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await context.newPage();
  const rawConsoleErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') rawConsoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    rawConsoleErrors.push(`pageerror:${err.message}`);
  });

  const report = {
    ok: false,
    url: server.baseUrl,
    denseCity: [],
    structureZones: [],
    waterZones: [],
    consoleErrors: [],
    ignoredConsoleErrors: []
  };

  try {
    await page.goto(`${server.baseUrl}/app/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    const boot = await bootstrapEarthRuntime(page, 'baltimore');
    assert(boot?.ok, `continuous-world bootstrap failed: ${JSON.stringify(boot)}`);

    for (const location of denseCityLocations) {
      const load = await loadEarthLocation(page, location);
      assert(load?.ok, `failed to load dense city case ${location.id}: ${JSON.stringify(load)}`);
      const result = await runDenseCityCase(page, location);
      result.id = location.id;
      report.denseCity.push(result);
      await page.screenshot({ path: path.join(outputDir, `dense-city-${location.id}.png`) });
      await writeReport(report);
    }

    for (const location of structureLocations) {
      const load = await loadEarthLocation(page, location);
      assert(load?.ok, `failed to load structure case ${location.id}: ${JSON.stringify(load)}`);
      const result = await runStructureCase(page, location);
      result.id = location.id;
      report.structureZones.push(result);
      await page.screenshot({ path: path.join(outputDir, `structure-zone-${location.id}.png`) });
      await writeReport(report);
    }

    for (const location of waterLocations) {
      const load = await loadEarthLocation(page, location);
      assert(load?.ok, `failed to load water case ${location.id}: ${JSON.stringify(load)}`);
      const result = await runWaterCase(page, location);
      result.id = location.id;
      report.waterZones.push(result);
      await page.screenshot({ path: path.join(outputDir, `water-zone-${location.id}.png`) });
      await writeReport(report);
    }

    report.ignoredConsoleErrors = rawConsoleErrors.filter((text) => isIgnorableConsoleError(text));
    report.consoleErrors = rawConsoleErrors.filter((text) => !isIgnorableConsoleError(text));
    report.ok =
      report.consoleErrors.length === 0 &&
      report.denseCity.every((entry) => entry.ok || entry.skipped) &&
      report.structureZones.every((entry) => entry.ok || entry.skipped) &&
      report.waterZones.every((entry) => entry.ok || entry.skipped) &&
      report.denseCity.some((entry) => entry.ok) &&
      report.structureZones.some((entry) => entry.ok) &&
      report.waterZones.some((entry) => entry.ok);

    await writeReport(report);
    if (!report.ok) {
      throw new Error('continuous-world feature ownership validation failed');
    }
  } finally {
    await context.close();
    await browser.close();
    await server.close();
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch(async (error) => {
    await mkdirp(outputDir);
    const reportPath = path.join(outputDir, 'report.json');
    let existing = {};
    try {
      existing = JSON.parse(await fs.readFile(reportPath, 'utf8'));
    } catch {
      existing = {};
    }
    await fs.writeFile(reportPath, JSON.stringify({
      ...existing,
      ok: false,
      error: String(error?.message || error)
    }, null, 2));
    console.error(error);
    process.exit(1);
  });
