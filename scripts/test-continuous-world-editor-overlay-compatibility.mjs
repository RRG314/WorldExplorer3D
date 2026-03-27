import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { CONTINUOUS_WORLD_LOCATIONS } from './continuous-world-scenarios.mjs';
import { mkdirp, rootDir, startServer, bootstrapEarthRuntime, loadEarthLocation } from './lib/runtime-browser-harness.mjs';

const outputDir = path.join(rootDir, 'output', 'playwright', 'continuous-world-editor-overlay-compatibility');

function isIgnorableConsoleError(text = '') {
  return /(400 \(\)|429 \(Too Many Requests\)|504 \(Gateway Timeout\)|Could not reach Cloud Firestore backend|net::ERR_CONNECTION_CLOSED|net::ERR_SOCKET_NOT_CONNECTED)/i.test(String(text));
}

async function captureCase(page, locationSpec, mode) {
  return page.evaluate(async ({ spec, nextMode }) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const { computeOverlayAreaKey } = await import('/app/js/editor/schema.js?v=1');
    if (!ctx || typeof ctx.getContinuousWorldValidationSnapshot !== 'function') {
      return { ok: false, reason: 'continuous-world diagnostics unavailable' };
    }
    if (
      typeof ctx.openEditorSession !== 'function' ||
      typeof ctx.captureEditorHereTarget !== 'function' ||
      typeof ctx.getEditorSnapshot !== 'function' ||
      typeof ctx.getApprovedEditorContributionSnapshot !== 'function'
    ) {
      return { ok: false, reason: 'editor compatibility helpers unavailable' };
    }

    const roadLength = (road) => {
      if (road?.surfaceDistances instanceof Float32Array && road.surfaceDistances.length > 0) {
        return Number(road.surfaceDistances[road.surfaceDistances.length - 1]) || 0;
      }
      const pts = Array.isArray(road?.pts) ? road.pts : [];
      let total = 0;
      for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
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

    const buildingDensityAt = (x, z, radius = 220) => {
      const buildings = Array.isArray(ctx.buildings) ? ctx.buildings : [];
      let count = 0;
      for (let i = 0; i < buildings.length; i++) {
        const center = featureCenter(buildings[i]);
        if (!center) continue;
        if (Math.hypot(center.x - x, center.z - z) <= radius) count += 1;
      }
      return count;
    };

    const isVehicleRoad = (road) => {
      const type = String(road?.type || '').toLowerCase();
      return !!type && !/^(footway|path|steps|pedestrian|corridor|cycleway|service_driveway)$/.test(type);
    };

    const gradeSeparatedLike = (road) => {
      const semantics = road?.structureSemantics || null;
      if (semantics?.gradeSeparated) return true;
      const anchors = Array.isArray(road?.structureTransitionAnchors) ? road.structureTransitionAnchors : [];
      return anchors.some((anchor) => Math.abs(Number(anchor?.targetOffset) || 0) >= 2.6);
    };

    const pickDenseRoad = () => {
      const roads = Array.isArray(ctx.roads) ? ctx.roads : [];
      const candidates = [];
      for (const road of roads) {
        if (!isVehicleRoad(road) || gradeSeparatedLike(road)) continue;
        const length = roadLength(road);
        if (length < 220) continue;
        const mid = pointOnRoadAtDistance(road, length * 0.5);
        if (!mid) continue;
        const density = buildingDensityAt(mid.x, mid.z, 220);
        if (density < 12) continue;
        candidates.push({ road, score: density * 10 + length });
      }
      candidates.sort((a, b) => b.score - a.score);
      return candidates[0]?.road || null;
    };

    const pickWaterwayPoint = () => {
      const waterways = (Array.isArray(ctx.waterways) ? ctx.waterways : [])
        .filter((entry) => Array.isArray(entry?.pts) && entry.pts.length >= 3)
        .sort((a, b) => roadLength(b) - roadLength(a));
      const selected = waterways[0] || null;
      if (!selected) return null;
      return selected.pts[Math.floor(selected.pts.length * 0.5)] || null;
    };

    const enterMode = async () => {
      if (nextMode === 'boat') {
        const point = pickWaterwayPoint();
        if (!point) return { ok: false, reason: `no boat entry point found for ${spec.id}` };
        if (typeof ctx.enterBoatAtWorldPoint === 'function') {
          ctx.enterBoatAtWorldPoint(point.x, point.z, {
            source: 'cw_editor_overlay_boat',
            emitTutorial: false,
            maxDistance: 180
          });
        }
        if (typeof ctx.setTravelMode === 'function') {
          ctx.setTravelMode('boat', { source: 'cw_editor_overlay_boat', force: true, emitTutorial: false });
        }
        return { ok: true };
      }

      const road = pickDenseRoad();
      if (!road) return { ok: false, reason: `no dense road found for ${spec.id}` };
      const point = pointOnRoadAtDistance(road, roadLength(road) * 0.5);
      if (!point) return { ok: false, reason: 'dense road midpoint unavailable' };
      if (typeof ctx.setTravelMode === 'function') {
        ctx.setTravelMode(nextMode === 'walk' ? 'walk' : 'drive', {
          source: `cw_editor_overlay_${nextMode}`,
          force: true,
          emitTutorial: false
        });
      }
      ctx.teleportToLocation(point.x, point.z, {
        source: `cw_editor_overlay_${nextMode}`,
        preferredRoad: road
      });
      if (ctx.car) {
        ctx.car.speed = 0;
        ctx.car.vx = 0;
        ctx.car.vz = 0;
        ctx.car.vy = 0;
        ctx.car.onRoad = true;
        ctx.car.road = road;
        ctx.car._lastStableRoad = road;
      }
      return { ok: true };
    };

    const settleRuntime = async () => {
      for (let i = 0; i < 8; i++) {
        if (typeof ctx.updateTerrainAround === 'function' && !ctx.worldLoading) {
          const actor = ctx.getContinuousWorldValidationSnapshot()?.actor || { x: 0, z: 0 };
          ctx.updateTerrainAround(Number(actor.x || 0), Number(actor.z || 0));
        }
        if (ctx.roadsNeedRebuild && typeof ctx.requestWorldSurfaceSync === 'function') {
          ctx.requestWorldSurfaceSync({ force: i === 0, source: 'cw_editor_overlay' });
        }
        if (typeof ctx.updateBoatMode === 'function' && nextMode === 'boat') ctx.updateBoatMode(1 / 60);
        if (typeof ctx.update === 'function') ctx.update(1 / 60);
        if (typeof ctx.updateWorldLod === 'function') ctx.updateWorldLod(true);
        await new Promise((resolve) => window.setTimeout(resolve, 80));
      }
    };

    const entry = await enterMode();
    if (!entry?.ok) return entry;
    if (typeof ctx.updateContinuousWorldRuntime === 'function') ctx.updateContinuousWorldRuntime();
    await settleRuntime();

    ctx.refreshApprovedEditorContributions?.();
    await ctx.openEditorSession({ skipTutorial: true, captureWorkspace: true });
    await new Promise((resolve) => window.setTimeout(resolve, 120));

    const snapshot = ctx.getContinuousWorldValidationSnapshot();
    const actor = snapshot?.actor || { x: 0, z: 0 };
    const target = ctx.captureEditorHereTarget();
    const editorSnapshot = ctx.getEditorSnapshot();
    const approved = ctx.getApprovedEditorContributionSnapshot();
    const expectedAreaKey =
      Number.isFinite(target?.lat) && Number.isFinite(target?.lon) ?
        computeOverlayAreaKey(target.lat, target.lon, 'earth') :
        '';

    return {
      ok: true,
      mode: nextMode,
      snapshot,
      target,
      editorSnapshot,
      approved,
      actor,
      expectedAreaKey
    };
  }, { spec: locationSpec, nextMode: mode });
}

function validateCase(result) {
  const failures = [];
  const coordinates = result?.snapshot?.coordinates || null;
  const target = result?.target || null;
  if (!coordinates) failures.push('coordinate snapshot missing');
  if (!result?.editorSnapshot?.active) failures.push('editor session not active');
  if (!result?.editorSnapshot?.capturedTarget) failures.push('editor target not captured');
  if (!Number.isFinite(target?.lat) || !Number.isFinite(target?.lon)) failures.push('editor target lat/lon missing');
  if (!Number.isFinite(target?.x) || !Number.isFinite(target?.z)) failures.push('editor target x/z missing');
  if (Number.isFinite(target?.lat) && Number.isFinite(coordinates?.lat) && Math.abs(target.lat - coordinates.lat) > 0.000001) {
    failures.push(`editor target latitude drift too high: ${Math.abs(target.lat - coordinates.lat).toFixed(7)}`);
  }
  if (Number.isFinite(target?.lon) && Number.isFinite(coordinates?.lon) && Math.abs(target.lon - coordinates.lon) > 0.000001) {
    failures.push(`editor target longitude drift too high: ${Math.abs(target.lon - coordinates.lon).toFixed(7)}`);
  }
  if (Number.isFinite(target?.x) && Number.isFinite(result?.actor?.x) && Math.abs(target.x - result.actor.x) > 0.01) {
    failures.push(`editor target x drift too high: ${Math.abs(target.x - result.actor.x).toFixed(4)}`);
  }
  if (Number.isFinite(target?.z) && Number.isFinite(result?.actor?.z) && Math.abs(target.z - result.actor.z) > 0.01) {
    failures.push(`editor target z drift too high: ${Math.abs(target.z - result.actor.z).toFixed(4)}`);
  }
  if (!result?.approved?.activeAreaSignature) failures.push('approved overlay area signature missing');
  if (result?.expectedAreaKey && !String(result.approved?.activeAreaSignature || '').includes(result.expectedAreaKey)) {
    failures.push(`approved overlay area signature missing base area key ${result.expectedAreaKey}`);
  }
  if (result?.approved?.visible !== true) failures.push('approved overlay layer not visible');
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
    { id: 'baltimore-drive', location: CONTINUOUS_WORLD_LOCATIONS.baltimore, mode: 'drive' },
    { id: 'newyork-walk', location: CONTINUOUS_WORLD_LOCATIONS.newyork, mode: 'walk' },
    { id: 'monaco-boat', location: CONTINUOUS_WORLD_LOCATIONS.monaco, mode: 'boat' }
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
      if (!result?.ok) throw new Error(`capture failed for ${testCase.id}: ${JSON.stringify(result)}`);
      const failures = validateCase(result);
      await page.screenshot({ path: path.join(outputDir, `${testCase.id}.png`), fullPage: true });
      report.cases.push({
        id: testCase.id,
        mode: testCase.mode,
        failures,
        ok: failures.length === 0,
        coordinates: result.snapshot?.coordinates || null,
        target: result.target,
        approved: result.approved
      });
    }

    const ignoredConsoleErrors = rawConsoleErrors.filter(isIgnorableConsoleError);
    const consoleErrors = rawConsoleErrors.filter((entry) => !isIgnorableConsoleError(entry));
    report.ignoredConsoleErrors = ignoredConsoleErrors;
    report.consoleErrors = consoleErrors;
    report.ok = report.cases.every((entry) => entry.ok) && consoleErrors.length === 0;
  } finally {
    await browser.close();
    await server.close();
  }

  await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
  if (!report.ok) {
    process.stderr.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
