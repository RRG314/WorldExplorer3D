import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { CONTINUOUS_WORLD_LOCATIONS } from './continuous-world-scenarios.mjs';
import { host, mkdirp, rootDir, startServer, bootstrapEarthRuntime, loadEarthLocation } from './lib/runtime-browser-harness.mjs';

const outputDir = path.join(rootDir, 'output', 'playwright', 'continuous-world-terrain-road');
const browserProfileDir = path.join(outputDir, '.browser-profile');

const testLocations = [
  CONTINUOUS_WORLD_LOCATIONS.baltimore,
  CONTINUOUS_WORLD_LOCATIONS.newyork,
  CONTINUOUS_WORLD_LOCATIONS.losangeles
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isIgnorableConsoleError(text) {
  return (
    /Failed to load resource:\s+the server responded with a status of\s+(429|500|502|503|504)/i.test(String(text)) ||
    /Road loading failed after all attempts:\s+Error:\s+All Overpass endpoints failed:/i.test(String(text)) ||
    /Could not reach Cloud Firestore backend/i.test(String(text)) ||
    /net::ERR_CONNECTION_CLOSED/i.test(String(text))
  );
}

async function writeReport(report) {
  await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
}

async function sampleTerrainRoadContinuity(page, locationSpec) {
  return await page.evaluate(async (spec) => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    const semMod = await import('/app/js/structure-semantics.js?v=26');
    if (!ctx || typeof ctx.getContinuousWorldValidationSnapshot !== 'function') {
      return { ok: false, reason: 'continuous-world diagnostics unavailable' };
    }

    if (typeof ctx.setTravelMode === 'function') {
      ctx.setTravelMode('drive', { source: 'continuous_world_terrain_road_probe', force: true, emitTutorial: false });
    } else if (ctx.Walk?.setModeDrive) {
      ctx.Walk.setModeDrive();
    }
    ctx.droneMode = false;
    if (ctx.boatMode?.active && typeof ctx.stopBoatMode === 'function') {
      ctx.stopBoatMode({ targetMode: 'drive', source: 'continuous_world_terrain_road_probe' });
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

    const pointAndDirectionAtDistance = (road, distance) => {
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
          const dirX = seg > 1e-6 ? dx / seg : 0;
          const dirZ = seg > 1e-6 ? dz / seg : 1;
          return {
            x: p1.x + dx * local,
            z: p1.z + dz * local,
            dirX,
            dirZ
          };
        }
        traversed += seg;
      }
      return null;
    };

    const roadTerrainProfile = (road, sampleCount = 9) => {
      if (typeof semMod.sampleFeatureSurfaceY !== 'function' || typeof ctx.GroundHeight?.terrainY !== 'function') return null;
      const total = roadLength(road);
      if (!(total > 60)) return null;
      const pad = Math.min(36, total * 0.1);
      const deltas = [];
      for (let i = 0; i < sampleCount; i++) {
        const t = sampleCount <= 1 ? 0.5 : i / (sampleCount - 1);
        const point = pointAndDirectionAtDistance(road, pad + (total - pad * 2) * t);
        if (!point) continue;
        const surfaceY = Number(semMod.sampleFeatureSurfaceY(road, point.x, point.z));
        const terrainY = Number(ctx.GroundHeight.terrainY(point.x, point.z));
        if (!Number.isFinite(surfaceY) || !Number.isFinite(terrainY)) continue;
        deltas.push(surfaceY - terrainY);
      }
      if (!deltas.length) return null;
      return {
        minDelta: Math.min(...deltas),
        maxDelta: Math.max(...deltas),
        maxAbsDelta: Math.max(...deltas.map((value) => Math.abs(value)))
      };
    };

    const previewRoadContinuity = (road, sampleCount = 12) => {
      if (typeof ctx.GroundHeight?.driveSurfaceY !== 'function' || typeof semMod.sampleFeatureSurfaceY !== 'function') {
        return null;
      }
      const total = roadLength(road);
      if (!(total > 60)) return null;
      const pad = Math.min(36, total * 0.1);
      let dropCount = 0;
      let maxSurfaceGap = 0;
      for (let i = 0; i < sampleCount; i++) {
        const t = sampleCount <= 1 ? 0.5 : i / (sampleCount - 1);
        const point = pointAndDirectionAtDistance(road, pad + (total - pad * 2) * t);
        if (!point) continue;
        const terrainY = Number(ctx.GroundHeight.terrainY(point.x, point.z));
        const profileY = Number(semMod.sampleFeatureSurfaceY(road, point.x, point.z));
        const driveSurfaceY = Number(ctx.GroundHeight.driveSurfaceY(point.x, point.z, true, terrainY + 1.2));
        if (!Number.isFinite(profileY) || !Number.isFinite(driveSurfaceY)) continue;
        const gap = Math.abs(driveSurfaceY - profileY);
        if (gap > maxSurfaceGap) maxSurfaceGap = gap;
        if (gap > 1.25) dropCount++;
      }
      return { dropCount, maxSurfaceGap };
    };

    const isVehicleRoad = (road) => {
      const type = String(road?.type || '').toLowerCase();
      if (!type) return false;
      return !/^(footway|path|steps|pedestrian|corridor|cycleway|service_driveway)$/.test(type);
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

    const typeScore = (road) => {
      const type = String(road?.type || '').toLowerCase();
      if (type.startsWith('motorway')) return 6;
      if (type.startsWith('trunk')) return 5;
      if (type.startsWith('primary')) return 4;
      if (type.startsWith('secondary')) return 3;
      if (type.startsWith('tertiary')) return 2;
      return 1;
    };

    const roads = Array.isArray(ctx.roads) ? ctx.roads.map((road) => {
      const type = String(road?.type || '').toLowerCase();
      if (!isVehicleRoad(road)) return null;
      if (/_link$/.test(type)) return null;
      if (type === 'service' || type === 'track') return null;
      if (typeScore(road) < 3) return null;
      if ((roadLength(road) || 0) < 260) return null;
      if (gradeSeparatedLike(road) || tunnelLike(road)) return null;
      const terrainProfile = roadTerrainProfile(road, 9);
      if (!terrainProfile) return null;
      if (terrainProfile.maxAbsDelta > 4.2) return null;
      if (terrainProfile.minDelta < -3.6) return null;
      if (terrainProfile.maxDelta > 3.6) return null;
      const continuityPreview = previewRoadContinuity(road, 12);
      if (!continuityPreview) return null;
      if (continuityPreview.dropCount > 0) return null;
      return {
        road,
        terrainProfile,
        continuityPreview,
        score:
          roadLength(road) +
          typeScore(road) * 100 -
          terrainProfile.maxAbsDelta * 80 -
          Math.abs(terrainProfile.maxDelta - terrainProfile.minDelta) * 40 -
          continuityPreview.maxSurfaceGap * 120
      };
    }).filter(Boolean) : [];

    roads.sort((a, b) => b.score - a.score);
    const roadCandidates = roads.slice(0, 8).map((entry) => entry.road).filter(Boolean);
    if (!roadCandidates.length) {
      return { ok: false, reason: `no qualifying major road found for ${spec.id}` };
    }

    const runRoadProbe = async (road, candidateIndex) => {
      const total = roadLength(road);
      const pad = Math.min(48, total * 0.12);
      const sampleCount = 12;
      const samples = [];
      let sawForwardFocus = false;
      let maxMissingActiveTerrainMeshes = 0;
      let maxDuplicateTerrainMeshes = 0;
      let minLoadedRatio = Infinity;
      let roadDrops = 0;
      let maxSyncRequests = 0;

      for (let i = 0; i < sampleCount; i++) {
        const t = sampleCount <= 1 ? 0.5 : i / (sampleCount - 1);
        const point = pointAndDirectionAtDistance(road, pad + (total - pad * 2) * t);
        if (!point) continue;

        if (typeof ctx.setTravelMode === 'function') {
          ctx.setTravelMode('drive', { source: 'continuous_world_terrain_road_step', force: true, emitTutorial: false });
        } else if (ctx.Walk?.setModeDrive) {
          ctx.Walk.setModeDrive();
        }

        ctx.car.x = point.x;
        ctx.car.z = point.z;
        ctx.car.vx = point.dirX * 42;
        ctx.car.vz = point.dirZ * 42;
        ctx.car.speed = 84;
        ctx.car.angle = Math.atan2(point.dirX, point.dirZ);
        ctx.car.road = road;
        ctx.car._lastStableRoad = road;
        ctx.car.onRoad = true;

        ctx.updateTerrainAround(point.x, point.z);
        await new Promise((resolve) => window.setTimeout(resolve, i === 0 ? 1800 : 850));

        const snap = ctx.getContinuousWorldValidationSnapshot();
        const terrain = snap?.terrain || {};
        const roadSnap = snap?.road || {};
        const loadedRatio = Number(terrain.activeTilesLoaded || 0) / Math.max(1, Number(terrain.activeTileCount || 0));
        if (loadedRatio < minLoadedRatio) minLoadedRatio = loadedRatio;
        if (!roadSnap.onRoad && Math.abs(Number(roadSnap.surfaceDelta) || 0) > 0.75) roadDrops += 1;
        maxMissingActiveTerrainMeshes = Math.max(maxMissingActiveTerrainMeshes, Number(terrain.missingActiveTerrainMeshes || 0));
        maxDuplicateTerrainMeshes = Math.max(maxDuplicateTerrainMeshes, Number(terrain.duplicateTerrainMeshes || 0));
        maxSyncRequests = Math.max(maxSyncRequests, Number(terrain.surfaceSyncRequests || 0));

        if (
          Number(terrain.focusDescriptorCount || 0) > 1 ||
          (Number(terrain.activeFocusTileCount || 0) > 1 && Number(terrain.activeFocusTilesLoaded || 0) > 0) ||
          (Number(terrain.activePrefetchTileCount || 0) > 0 && Number(terrain.activePrefetchTilesLoaded || 0) > 0)
        ) {
          sawForwardFocus = true;
        }

        samples.push({
          index: i,
          lat: snap?.coordinates?.lat ?? null,
          lon: snap?.coordinates?.lon ?? null,
          activeTileCount: terrain.activeTileCount || 0,
          activeTilesLoaded: terrain.activeTilesLoaded || 0,
          activeFocusTileCount: terrain.activeFocusTileCount || 0,
          activeFocusTilesLoaded: terrain.activeFocusTilesLoaded || 0,
          activePrefetchTileCount: terrain.activePrefetchTileCount || 0,
          activePrefetchTilesLoaded: terrain.activePrefetchTilesLoaded || 0,
          focusDescriptorCount: terrain.focusDescriptorCount || 0,
          focusDescriptorKinds: terrain.focusDescriptorKinds || [],
          activeCenterLoaded: !!terrain.activeCenterLoaded,
          roadsNeedRebuild: !!terrain.roadsNeedRebuild,
          rebuildInFlight: !!terrain.rebuildInFlight,
          lastSurfaceSyncSource: terrain.lastSurfaceSyncSource || null,
          surfaceSyncRequests: terrain.surfaceSyncRequests || 0,
          terrainTileLoads: terrain.terrainTileLoads || null,
          onRoad: !!roadSnap.onRoad,
          surfaceDelta: roadSnap.surfaceDelta,
          roundTripError: snap?.coordinates?.roundTripError ?? null,
          minimapCenterDrift: snap?.coordinates?.minimapCenterDrift ?? null
        });
      }

      return {
        ok: true,
        candidateIndex,
        roadName: road?.name || null,
        roadType: road?.type || null,
        roadLength: total,
        sampleCount: samples.length,
        sawForwardFocus,
        maxMissingActiveTerrainMeshes,
        maxDuplicateTerrainMeshes,
        minLoadedRatio: Number.isFinite(minLoadedRatio) ? Number(minLoadedRatio.toFixed(3)) : null,
        roadDrops,
        maxSyncRequests,
        samples
      };
    };

    let bestReport = null;
    for (let i = 0; i < roadCandidates.length; i++) {
      const candidateReport = await runRoadProbe(roadCandidates[i], i);
      if (!bestReport || candidateReport.roadDrops < bestReport.roadDrops) {
        bestReport = candidateReport;
      }
      if (candidateReport.roadDrops === 0) {
        return candidateReport;
      }
    }

    return bestReport || { ok: false, reason: `unable to evaluate major road continuity for ${spec.id}` };
  }, locationSpec);
}

async function main() {
  await mkdirp(outputDir);
  await mkdirp(browserProfileDir);

  const serverHandle = await startServer();
  const context = await chromium.launchPersistentContext(browserProfileDir, {
    headless: true,
    viewport: { width: 1440, height: 900 }
  });
  const page = context.pages()[0] || await context.newPage();
  const errors = [];
  const infraErrors = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = `console:${msg.text()}`;
    if (isIgnorableConsoleError(text)) {
      infraErrors.push(text);
      return;
    }
    errors.push(text);
  });

  const report = {
    ok: false,
    generatedAt: new Date().toISOString(),
    locationReports: [],
    skippedLocations: [],
    errors,
    infraErrors
  };

  try {
    await page.goto(`${serverHandle.baseUrl}/app/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    const bootstrap = await bootstrapEarthRuntime(page, 'baltimore');
    assert(bootstrap?.ok, `bootstrap failed: ${JSON.stringify(bootstrap)}`);
    await page.waitForTimeout(4000);

    for (const location of testLocations) {
      const infraBaseline = infraErrors.length;
      const loaded = await loadEarthLocation(page, location);
      const locationInfraErrors = infraErrors.slice(infraBaseline);
      const overpassInfraFailure = locationInfraErrors.some((text) =>
        /All Overpass endpoints failed|status of 429|status of 500|status of 502|status of 503|status of 504/i.test(text)
      );
      if (!loaded?.ok || !(Number(loaded?.roads) > 0)) {
        if (overpassInfraFailure) {
          report.skippedLocations.push({
            locationId: location.id,
            label: location.label,
            reason: 'overpass_infra_failure_during_load'
          });
          continue;
        }
        assert(loaded?.ok, `load failed for ${location.id}: ${JSON.stringify(loaded)}`);
        assert(Number(loaded?.roads) > 0, `load returned no roads for ${location.id}: ${JSON.stringify(loaded)}`);
      }
      await page.waitForTimeout(2200);
      const locationReport = await sampleTerrainRoadContinuity(page, location);
      if (!locationReport?.ok) {
        if (
          overpassInfraFailure &&
          /no qualifying major road found/i.test(String(locationReport?.reason || ''))
        ) {
          report.skippedLocations.push({
            locationId: location.id,
            label: location.label,
            reason: 'overpass_infra_failure_during_sampling'
          });
          continue;
        }
        assert(locationReport?.ok, `continuity sampling failed for ${location.id}: ${JSON.stringify(locationReport)}`);
      }
      report.locationReports.push({
        locationId: location.id,
        label: location.label,
        ...locationReport
      });
    }

    assert(report.locationReports.length >= 2, `insufficient validated locations (${report.locationReports.length})`);

    for (const entry of report.locationReports) {
      assert(entry.sampleCount >= 10, `${entry.locationId}: insufficient continuity samples (${entry.sampleCount})`);
      assert(entry.maxMissingActiveTerrainMeshes === 0, `${entry.locationId}: missing active terrain meshes detected`);
      assert(entry.maxDuplicateTerrainMeshes === 0, `${entry.locationId}: duplicate active terrain meshes detected`);
      assert(entry.roadDrops === 0, `${entry.locationId}: road contact dropped during sampled travel`);
      assert((entry.minLoadedRatio ?? 0) >= 0.3, `${entry.locationId}: active terrain load ratio too low (${entry.minLoadedRatio})`);
      const last = entry.samples[entry.samples.length - 1] || null;
      assert(last?.activeCenterLoaded === true, `${entry.locationId}: active center tile was not loaded at end of route`);
      assert((last?.terrainTileLoads?.active || 0) > 0, `${entry.locationId}: no active terrain tile load events recorded`);
      assert((last?.surfaceSyncRequests || 0) > 0, `${entry.locationId}: no surface sync requests recorded`);
    }

    report.forwardFocusLocations = report.locationReports
      .filter((entry) => entry.sawForwardFocus)
      .map((entry) => entry.locationId);

    await page.screenshot({ path: path.join(outputDir, 'runtime.png') });
    report.ok = true;
    await writeReport(report);
  } catch (error) {
    report.ok = false;
    report.error = error?.message || String(error);
    await page.screenshot({ path: path.join(outputDir, 'runtime.png') }).catch(() => {});
    await writeReport(report);
    throw error;
  } finally {
    await context.close();
    await serverHandle.close();
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('[test-continuous-world-terrain-road] failed');
    console.error(error);
    process.exit(1);
  });
