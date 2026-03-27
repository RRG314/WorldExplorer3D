import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { CONTINUOUS_WORLD_LOCATIONS } from './continuous-world-scenarios.mjs';
import { mkdirp, rootDir, startServer, bootstrapEarthRuntime, loadEarthLocation } from './lib/runtime-browser-harness.mjs';

const outputDir = path.join(rootDir, 'output', 'playwright', 'continuous-world-feature-regions');

function isIgnorableConsoleError(text = '') {
  return /(400 \(\)|429 \(Too Many Requests\)|504 \(Gateway Timeout\)|Could not reach Cloud Firestore backend|net::ERR_CONNECTION_CLOSED)/i.test(String(text));
}

async function captureCase(page, locationSpec, mode) {
  return await page.evaluate(async ({ spec, nextMode }) => {
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

    const featureCenter = (feature) => {
      if (Array.isArray(feature?.pts) && feature.pts.length > 0) {
        let sx = 0;
        let sz = 0;
        for (const pt of feature.pts) {
          sx += Number(pt?.x || 0);
          sz += Number(pt?.z || 0);
        }
        return { x: sx / feature.pts.length, z: sz / feature.pts.length };
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

    const gradeSeparatedLike = (road) => {
      const semantics = road?.structureSemantics || null;
      if (semantics?.gradeSeparated) return true;
      const anchors = Array.isArray(road?.structureTransitionAnchors) ? road.structureTransitionAnchors : [];
      return anchors.some((anchor) => Math.abs(Number(anchor?.targetOffset) || 0) >= 2.6);
    };

    const isVehicleRoad = (road) => {
      const type = String(road?.type || '').toLowerCase();
      return !!type && !/^(footway|path|steps|pedestrian|corridor|cycleway)$/.test(type);
    };

    const travelToDenseRoad = async () => {
      const roads = Array.isArray(ctx.roads) ? ctx.roads : [];
      const candidates = [];
      for (const road of roads) {
        if (!isVehicleRoad(road) || gradeSeparatedLike(road)) continue;
        const length = roadLength(road);
        if (length < 220) continue;
        const mid = pointOnRoadAtDistance(road, length * 0.5);
        if (!mid) continue;
        const density = buildingDensityAt(mid.x, mid.z, 220);
        if (density < 18) continue;
        candidates.push({ road, score: density * 10 + length });
      }
      candidates.sort((a, b) => b.score - a.score);
      const selected = candidates[0]?.road || null;
      if (!selected) return { ok: false, reason: `no dense road found for ${spec.id}` };
      const point = pointOnRoadAtDistance(selected, roadLength(selected) * 0.5);
      if (!point) return { ok: false, reason: 'dense road midpoint unavailable' };
      if (typeof ctx.setTravelMode === 'function') {
        ctx.setTravelMode('drive', { source: 'cw_feature_regions_dense', force: true, emitTutorial: false });
      }
      ctx.teleportToLocation(point.x, point.z, { source: 'cw_feature_regions_dense', preferredRoad: selected });
      if (ctx.car) {
        ctx.car.speed = 0;
        ctx.car.vx = 0;
        ctx.car.vz = 0;
        ctx.car.vy = 0;
        ctx.car.onRoad = true;
        ctx.car.road = selected;
        ctx.car._lastStableRoad = selected;
      }
      return { ok: true };
    };

    const travelToStructureRoad = async () => {
      const roads = (Array.isArray(ctx.roads) ? ctx.roads : [])
        .filter((road) => isVehicleRoad(road) && gradeSeparatedLike(road) && roadLength(road) > 180)
        .sort((a, b) => roadLength(b) - roadLength(a));
      const selected = roads[0] || null;
      if (!selected) return { ok: false, reason: `no elevated road found for ${spec.id}` };
      const point = pointOnRoadAtDistance(selected, roadLength(selected) * 0.5);
      if (!point) return { ok: false, reason: 'structure road midpoint unavailable' };
      if (typeof ctx.setTravelMode === 'function') {
        ctx.setTravelMode('drive', { source: 'cw_feature_regions_structure', force: true, emitTutorial: false });
      }
      ctx.teleportToLocation(point.x, point.z, { source: 'cw_feature_regions_structure', preferredRoad: selected });
      if (ctx.car) {
        ctx.car.speed = 0;
        ctx.car.vx = 0;
        ctx.car.vz = 0;
        ctx.car.vy = 0;
        ctx.car.onRoad = true;
        ctx.car.road = selected;
        ctx.car._lastStableRoad = selected;
      }
      return { ok: true };
    };

    const travelToWater = async () => {
      const waterways = (Array.isArray(ctx.waterways) ? ctx.waterways : [])
        .filter((entry) => Array.isArray(entry?.pts) && entry.pts.length >= 3)
        .sort((a, b) => roadLength(b) - roadLength(a));
      const selected = waterways[0] || null;
      if (!selected) return { ok: false, reason: `no waterway found for ${spec.id}` };
      const point = selected.pts[Math.floor(selected.pts.length * 0.5)];
      if (!point) return { ok: false, reason: 'waterway midpoint unavailable' };
      if (typeof ctx.enterBoatAtWorldPoint === 'function') {
        ctx.enterBoatAtWorldPoint(point.x, point.z, {
          source: 'cw_feature_regions_water',
          emitTutorial: false,
          maxDistance: 180
        });
      }
      if (typeof ctx.setTravelMode === 'function') {
        ctx.setTravelMode('boat', { source: 'cw_feature_regions_water', force: true, emitTutorial: false });
      }
      return { ok: true };
    };

    let travel = null;
    if (nextMode === 'dense') travel = await travelToDenseRoad();
    else if (nextMode === 'structure') travel = await travelToStructureRoad();
    else travel = await travelToWater();
    if (!travel?.ok) return travel;

    for (let i = 0; i < 8; i++) {
      if (typeof ctx.updateTerrainAround === 'function' && !ctx.worldLoading) {
        const actor = ctx.getContinuousWorldValidationSnapshot()?.actor || { x: 0, z: 0 };
        ctx.updateTerrainAround(Number(actor.x || 0), Number(actor.z || 0));
      }
      if (ctx.roadsNeedRebuild && typeof ctx.requestWorldSurfaceSync === 'function') {
        ctx.requestWorldSurfaceSync({ force: i === 0, source: 'cw_feature_regions' });
      }
      if (typeof ctx.updateBoatMode === 'function' && nextMode === 'water') ctx.updateBoatMode(1 / 60);
      if (typeof ctx.update === 'function') ctx.update(1 / 60);
      await new Promise((resolve) => window.setTimeout(resolve, 80));
    }

    const snap = ctx.getContinuousWorldValidationSnapshot();
    return { ok: true, snapshot: snap };
  }, { spec: locationSpec, nextMode: mode });
}

function validateSnapshot(snapshot, family) {
  const failures = [];
  const cw = snapshot?.continuousWorld || null;
  const regions = snapshot?.featureRegions || null;
  if (!cw) failures.push('continuous-world snapshot missing');
  if (!regions) failures.push('feature region snapshot missing');
  if (cw && regions) {
    if (regions.sessionEpoch !== cw.sessionEpoch) failures.push('feature region session epoch mismatch');
    if (regions.activeRegionKey !== cw.activeRegion?.key) failures.push('feature region active key mismatch');
    if ((regions.regionCount || 0) <= 0) failures.push('feature region map empty');
  }
  const activeRegion = regions?.activeRegion || null;
  if (family === 'buildings') {
    if ((regions?.totals?.buildingRegions || 0) <= 0) failures.push('no building regions tracked');
    if ((regions?.byBand?.near?.buildings || 0) <= 0) failures.push('no near-band building regions');
    if ((activeRegion?.buildings?.count || 0) <= 0) failures.push('active region has no building ownership');
  } else if (family === 'structures') {
    if (!snapshot?.road?.onRoad) failures.push('structure case lost road contact');
    if (!snapshot?.road?.currentRoadGradeSeparated) failures.push('structure case not on grade-separated road');
    if ((regions?.totals?.structureRegions || 0) <= 0) failures.push('no structure regions tracked');
    if ((regions?.byBand?.near?.structures || 0) <= 0) failures.push('no near-band structure regions');
    if ((activeRegion?.structures?.count || 0) <= 0) failures.push('active region has no structure ownership');
  } else if (family === 'water') {
    if (!snapshot?.water?.boat?.active) failures.push('water case not in boat mode');
    if ((regions?.totals?.waterRegions || 0) <= 0) failures.push('no water regions tracked');
    if ((regions?.byBand?.near?.water || 0) <= 0) failures.push('no near-band water regions');
    if ((activeRegion?.water?.count || 0) <= 0) failures.push('active region has no water ownership');
  }
  return failures;
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

  const cases = [
    { id: 'baltimore-dense', location: CONTINUOUS_WORLD_LOCATIONS.baltimore, mode: 'dense', family: 'buildings' },
    { id: 'newyork-structure', location: CONTINUOUS_WORLD_LOCATIONS.newyork, mode: 'structure', family: 'structures' },
    { id: 'monaco-water', location: CONTINUOUS_WORLD_LOCATIONS.monaco, mode: 'water', family: 'water' }
  ];

  const report = {
    ok: false,
    url: server.baseUrl,
    cases: [],
    consoleErrors: [],
    ignoredConsoleErrors: []
  };

  try {
    await page.goto(`${server.baseUrl}/app/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    const boot = await bootstrapEarthRuntime(page, 'baltimore');
    if (!boot?.ok) throw new Error(`continuous-world bootstrap failed: ${JSON.stringify(boot)}`);

    for (const testCase of cases) {
      const load = await loadEarthLocation(page, testCase.location);
      if (!load?.ok) throw new Error(`failed to load case ${testCase.id}: ${JSON.stringify(load)}`);
      const result = await captureCase(page, testCase.location, testCase.mode);
      const snapshot = result?.snapshot || null;
      const failures = result?.ok ? validateSnapshot(snapshot, testCase.family) : [result?.reason || 'case execution failed'];
      report.cases.push({
        id: testCase.id,
        location: testCase.location.label,
        mode: testCase.mode,
        family: testCase.family,
        ok: failures.length === 0,
        failures,
        summary: {
          activeRegionKey: snapshot?.featureRegions?.activeRegionKey || null,
          regionCount: Number(snapshot?.featureRegions?.regionCount || 0),
          activeRegion: snapshot?.featureRegions?.activeRegion || null,
          totals: snapshot?.featureRegions?.totals || null
        },
        snapshot
      });
      await page.screenshot({ path: path.join(outputDir, `${testCase.id}.png`) });
      await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
    }

    report.ignoredConsoleErrors = rawConsoleErrors.filter((text) => isIgnorableConsoleError(text));
    report.consoleErrors = rawConsoleErrors.filter((text) => !isIgnorableConsoleError(text));
    report.ok =
      report.consoleErrors.length === 0 &&
      report.cases.every((entry) => entry.ok) &&
      report.cases.length === cases.length;
    await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
    if (!report.ok) {
      throw new Error('continuous-world feature region validation failed');
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
