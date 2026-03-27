import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { CONTINUOUS_WORLD_LOCATIONS, CONTINUOUS_WORLD_SCENARIOS } from './continuous-world-scenarios.mjs';
import { host, mkdirp, rootDir, startServer, bootstrapEarthRuntime, loadEarthLocation } from './lib/runtime-browser-harness.mjs';

const outputDir = path.join(rootDir, 'output', 'playwright', 'continuous-world-scenarios');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isTransientConsoleError(text = '') {
  const msg = String(text || '');
  return (
    /Failed to load resource:\s+the server responded with a status of\s+(400|429|500|502|503|504)/i.test(msg) ||
    /Failed to load resource:\s+net::ERR_CONNECTION_CLOSED/i.test(msg)
  );
}

async function writeReport(report) {
  await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
}

async function runScenarioCase(page, scenario, locationSpec) {
  return await page.evaluate(async ({ scenarioSpec, location }) => {
    const mod = await import('/app/js/shared-context.js?v=55');
    const ctx = mod?.ctx || {};
    if (!ctx || typeof ctx.getContinuousWorldValidationSnapshot !== 'function') {
      return { ok: false, skipped: false, reason: 'continuous-world diagnostics unavailable' };
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
      if (pts.length === 0) return null;
      const total = roadLength(road);
      if (!(total > 0)) return { x: pts[0].x, z: pts[0].z };
      const target = Math.max(0, Math.min(total, Number(distance) || 0));
      let traversed = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const seg = Math.hypot(p2.x - p1.x, p2.z - p1.z);
        if (traversed + seg >= target || i === pts.length - 2) {
          const local = seg > 1e-6 ? (target - traversed) / seg : 0;
          return {
            x: p1.x + (p2.x - p1.x) * local,
            z: p1.z + (p2.z - p1.z) * local
          };
        }
        traversed += seg;
      }
      return { x: pts[pts.length - 1].x, z: pts[pts.length - 1].z };
    };

    const isVehicleRoad = (road) => {
      const type = String(road?.type || '').toLowerCase();
      if (!type) return false;
      return !/^(footway|path|steps|pedestrian|corridor|cycleway|service_driveway)$/.test(type);
    };

    const roadTypeValue = (road) => String(road?.type || '').toLowerCase();
    const isLinkRoad = (road) => /_link$/.test(roadTypeValue(road));
    const isServiceRoad = (road) => roadTypeValue(road) === 'service' || roadTypeValue(road) === 'track';

    const majorRoadScore = (road) => {
      const type = String(road?.type || '').toLowerCase();
      if (type.startsWith('motorway')) return 6;
      if (type.startsWith('trunk')) return 5;
      if (type.startsWith('primary')) return 4;
      if (type.startsWith('secondary')) return 3;
      if (type.startsWith('tertiary')) return 2;
      return 1;
    };

    const buildingDensityAt = (x, z, radius = 90) => {
      const buildings = Array.isArray(ctx.buildings) ? ctx.buildings : [];
      let count = 0;
      for (let i = 0; i < buildings.length; i++) {
        const b = buildings[i];
        const cx = Number.isFinite(b?.centerX) ? b.centerX : (Number(b?.minX || 0) + Number(b?.maxX || 0)) * 0.5;
        const cz = Number.isFinite(b?.centerZ) ? b.centerZ : (Number(b?.minZ || 0) + Number(b?.maxZ || 0)) * 0.5;
        if (Math.hypot(cx - x, cz - z) <= radius) count++;
      }
      return count;
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

    const elevatedLike = (road) => {
      const semantics = road?.structureSemantics || null;
      return semantics?.terrainMode === 'elevated' || (gradeSeparatedLike(road) && !tunnelLike(road));
    };

    const roadTerrainProfile = (road, sampleCount = 6) => {
      if (typeof ctx.sampleFeatureSurfaceY !== 'function' || typeof ctx.terrainYAtWorld !== 'function') return null;
      const points = sampleRoadRoute(road, sampleCount);
      if (!points.length) return null;
      const deltas = [];
      let elevatedSamples = 0;
      let subgradeSamples = 0;
      let atGradeSamples = 0;
      for (let i = 0; i < points.length; i++) {
        const point = points[i];
        const surfaceY = Number(ctx.sampleFeatureSurfaceY(road, point.x, point.z));
        const terrainY = Number(ctx.terrainYAtWorld(point.x, point.z));
        if (!Number.isFinite(surfaceY) || !Number.isFinite(terrainY)) continue;
        const delta = surfaceY - terrainY;
        deltas.push(delta);
        if (delta >= 2.6) elevatedSamples++;
        else if (delta <= -2.6) subgradeSamples++;
        else atGradeSamples++;
      }
      if (!deltas.length) return null;
      const maxDelta = Math.max(...deltas);
      const minDelta = Math.min(...deltas);
      const maxAbsDelta = Math.max(...deltas.map((value) => Math.abs(value)));
      const avgAbsDelta = deltas.reduce((sum, value) => sum + Math.abs(value), 0) / deltas.length;
      return {
        sampleCount: deltas.length,
        minDelta,
        maxDelta,
        maxAbsDelta,
        avgAbsDelta,
        elevatedSamples,
        subgradeSamples,
        atGradeSamples
      };
    };

    const sampleRoadRoute = (road, sampleCount) => {
      const total = roadLength(road);
      if (!(total > 24)) return [];
      const pad = Math.min(22, total * 0.06);
      const samples = [];
      for (let i = 0; i < sampleCount; i++) {
        const t = sampleCount <= 1 ? 0.5 : i / (sampleCount - 1);
        const distance = pad + (total - pad * 2) * t;
        const point = pointOnRoadAtDistance(road, distance);
        if (point) samples.push({ ...point, distance });
      }
      return samples;
    };

    const roadMatchesScenario = (road, selector, scenarioSpec) => {
      const length = roadLength(road);
      if (length < (Number(scenarioSpec.minRoadLength) || 0)) return false;
      if (scenarioSpec.allowLinks === false && isLinkRoad(road)) return false;
      if (scenarioSpec.allowService === false && isServiceRoad(road)) return false;
      const transitionAnchors = Array.isArray(road?.structureTransitionAnchors) ? road.structureTransitionAnchors : [];
      const hasStrongTransitionAnchor = transitionAnchors.some((anchor) => {
        const targetOffset = Math.abs(Number(anchor?.targetOffset) || 0);
        const span = Math.max(0, Number(anchor?.span) || 0);
        return targetOffset >= 2.2 || span >= 54;
      });
      const terrainProfile = roadTerrainProfile(road, selector === 'urban_entry' ? 6 : 5);
      if (scenarioSpec.surfaceExpectation === 'at_grade') {
        if (elevatedLike(road) || tunnelLike(road)) return false;
        if (hasStrongTransitionAnchor) return false;
        if (!terrainProfile) return false;
        if (terrainProfile.maxDelta > 3.2) return false;
        if (terrainProfile.minDelta < -2.8) return false;
      }
      if (scenarioSpec.surfaceExpectation === 'elevated') {
        if (!elevatedLike(road)) return false;
        if (!terrainProfile) return false;
        if (terrainProfile.maxDelta < 2.6) return false;
      }
      if (scenarioSpec.surfaceExpectation === 'tunnel') {
        if (!tunnelLike(road)) return false;
        if (!terrainProfile) return false;
        if (terrainProfile.minDelta > -2.4) return false;
      }
      return true;
    };

    const selectRoadForScenario = (scenarioSpec) => {
      const roads = Array.isArray(ctx.roads) ? ctx.roads.filter((road) => Array.isArray(road?.pts) && road.pts.length >= 2 && isVehicleRoad(road)) : [];
      if (roads.length === 0) return null;
      const candidates = [];
      for (let i = 0; i < roads.length; i++) {
        const road = roads[i];
        const selector = scenarioSpec.selector;
        if (!roadMatchesScenario(road, selector, scenarioSpec)) continue;
        const length = roadLength(road);
        const start = road.pts[0];
        const end = road.pts[road.pts.length - 1];
        const startDensity = buildingDensityAt(start.x, start.z);
        const endDensity = buildingDensityAt(end.x, end.z);
        const densityDelta = Math.abs(endDensity - startDensity);
        const scoreBase = length + majorRoadScore(road) * 120;
        if (selector === 'long_drive') {
          if (majorRoadScore(road) < 3) continue;
          candidates.push({ road, score: scoreBase + Math.max(startDensity, endDensity) * 2 });
        } else if (selector === 'urban_entry') {
          if (densityDelta < 5) continue;
          const urbanScore = densityDelta * 28 + Math.max(startDensity, endDensity) * 10;
          candidates.push({ road, score: scoreBase + urbanScore });
        } else if (selector === 'elevated') {
          const anchorCount = Array.isArray(road?.structureTransitionAnchors) ? road.structureTransitionAnchors.length : 0;
          candidates.push({ road, score: scoreBase + anchorCount * 80 });
        } else if (selector === 'tunnel') {
          candidates.push({ road, score: scoreBase });
        }
      }
      candidates.sort((a, b) => b.score - a.score);
      return candidates[0]?.road || null;
    };

    const polygonArea = (pts = []) => {
      if (!Array.isArray(pts) || pts.length < 3) return 0;
      let area = 0;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        area += (pts[j].x + pts[i].x) * (pts[j].z - pts[i].z);
      }
      return Math.abs(area * 0.5);
    };

    const pointInPolygonXZ = (x, z, polygon) => {
      if (!Array.isArray(polygon) || polygon.length < 3) return false;
      let inside = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x;
        const zi = polygon[i].z;
        const xj = polygon[j].x;
        const zj = polygon[j].z;
        const intersects = (zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / ((zj - zi) || 1e-9) + xi;
        if (intersects) inside = !inside;
      }
      return inside;
    };

    const sampleBoatRoute = (sampleCount) => {
      const actor = ctx.getContinuousWorldValidationSnapshot?.()?.actor || { x: 0, z: 0 };
      const waterwayCandidate = (Array.isArray(ctx.waterways) ? ctx.waterways : [])
        .filter((entry) => Array.isArray(entry?.pts) && entry.pts.length >= 3)
        .map((entry) => {
          const mid = entry.pts[Math.floor(entry.pts.length * 0.5)];
          const length = roadLength(entry);
          return {
            type: 'waterway',
            source: entry,
            centerX: mid?.x || 0,
            centerZ: mid?.z || 0,
            length,
            distance: Math.hypot((mid?.x || 0) - actor.x, (mid?.z || 0) - actor.z)
          };
        })
        .filter((entry) => entry.length > 140)
        .sort((a, b) => (b.length - a.length) - (a.distance - b.distance))[0] || null;
      if (waterwayCandidate) {
        return {
          candidate: waterwayCandidate,
          points: sampleRoadRoute(waterwayCandidate.source, sampleCount)
        };
      }

      const areas = Array.isArray(ctx.waterAreas) ? ctx.waterAreas : [];
      const area = areas
        .filter((entry) => Array.isArray(entry?.pts) && entry.pts.length >= 4)
        .map((entry) => {
          const centerX = entry.pts.reduce((sum, point) => sum + point.x, 0) / entry.pts.length;
          const centerZ = entry.pts.reduce((sum, point) => sum + point.z, 0) / entry.pts.length;
          return {
            source: entry,
            area: polygonArea(entry.pts),
            centerX,
            centerZ,
            distance: Math.hypot(centerX - actor.x, centerZ - actor.z)
          };
        })
        .filter((entry) => entry.area > 12000)
        .sort((a, b) => (b.area - a.area) - (a.distance - b.distance))[0];
      if (!area) return null;
      const centerX = area.centerX;
      const centerZ = area.centerZ;
      const polygon = area.source?.pts || [];
      const bounds = polygon.reduce((acc, point) => ({
        minX: Math.min(acc.minX, point.x),
        maxX: Math.max(acc.maxX, point.x),
        minZ: Math.min(acc.minZ, point.z),
        maxZ: Math.max(acc.maxZ, point.z)
      }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
      const radius = Math.max(18, Math.min((bounds.maxX - bounds.minX) * 0.18, (bounds.maxZ - bounds.minZ) * 0.18, 90));
      const points = [];
      for (let i = 0; i < sampleCount * 2 && points.length < sampleCount; i++) {
        const angle = (i / Math.max(1, sampleCount * 2)) * Math.PI * 2;
        const x = centerX + Math.cos(angle) * radius;
        const z = centerZ + Math.sin(angle) * radius;
        if (pointInPolygonXZ(x, z, polygon)) points.push({ x, z, distance: i });
      }
      if (points.length < Math.max(4, Math.floor(sampleCount * 0.5))) {
        points.push({ x: centerX, z: centerZ, distance: 0 });
      }
      return {
        candidate: {
          type: 'water_area',
          source: area.source,
          centerX,
          centerZ,
          area: area.area
        },
        points
      };
    };

    const terrainCenterReady = (snapshot) => {
      const terrain = snapshot?.terrain || null;
      if (!terrain || !terrain.activeCenterKey) return false;
      if (!terrain.activeCenterLoaded) return false;
      const focusTotal = Number(terrain.activeFocusTileCount || 0);
      const focusLoaded = Number(terrain.activeFocusTilesLoaded || 0);
      if (focusTotal > 0 && focusLoaded <= 0) return false;
      return true;
    };

    const settleRuntime = async (mode) => {
      let lastSnapshot = null;
      const tick = async (delayMs, { forceSurfaceSync = false } = {}) => {
        if (mode === 'boat' && typeof ctx.updateBoatMode === 'function') {
          ctx.updateBoatMode(1 / 60);
        }
        if (typeof ctx.updateTerrainAround === 'function' && !ctx.worldLoading) {
          const actor = ctx.getContinuousWorldValidationSnapshot?.()?.actor || { x: 0, z: 0 };
          ctx.updateTerrainAround(Number(actor.x || 0), Number(actor.z || 0));
        }
        if (ctx.roadsNeedRebuild && typeof ctx.requestWorldSurfaceSync === 'function') {
          ctx.requestWorldSurfaceSync({
            force: forceSurfaceSync,
            source: `continuous_world_${scenarioSpec.id}`
          });
        }
        if (typeof ctx.update === 'function') ctx.update(1 / 60);
        await new Promise((resolve) => window.setTimeout(resolve, delayMs));
        lastSnapshot = ctx.getContinuousWorldValidationSnapshot?.() || null;
        return lastSnapshot;
      };

      for (let i = 0; i < 6; i++) {
        await tick(45, { forceSurfaceSync: i === 0 });
      }

      if (mode === 'boat') {
        const deadline = performance.now() + 3200;
        while (performance.now() < deadline) {
          if (terrainCenterReady(lastSnapshot)) break;
          await tick(110, { forceSurfaceSync: true });
        }
      }
      return lastSnapshot || ctx.getContinuousWorldValidationSnapshot();
    };

    const takeDriveStep = async (point) => {
      if (typeof ctx.setTravelMode === 'function') {
        ctx.setTravelMode('drive', { source: 'continuous_world_case', force: true, emitTutorial: false });
      }
      ctx.teleportToLocation(point.x, point.z, {
        source: 'continuous_world_route',
        preferredRoad: selectedFeature || ctx.car?.road || ctx.car?._lastStableRoad || null
      });
      if (ctx.car) {
        ctx.car.speed = 0;
        ctx.car.vx = 0;
        ctx.car.vz = 0;
        ctx.car.vy = 0;
        ctx.car.vFwd = 0;
        ctx.car.vLat = 0;
      }
      return await settleRuntime('drive');
    };

    const takeBoatStep = async (candidate, point) => {
      let entered = false;
      if (typeof ctx.enterBoatAtWorldPoint === 'function') {
        entered = !!ctx.enterBoatAtWorldPoint(point.x, point.z, {
          source: 'continuous_world_boat',
          emitTutorial: false,
          maxDistance: 180
        });
      }
      if (!entered && typeof ctx.setTravelMode === 'function') {
        ctx.setTravelMode('boat', { source: 'continuous_world_boat', force: true, emitTutorial: false });
      }
      if (!entered && ctx.boat) {
        ctx.boat.x = point.x;
        ctx.boat.z = point.z;
        ctx.boat.y = Number(candidate?.surfaceY || ctx.boat.y || 0);
        ctx.boat.speed = 0;
      }
      if (ctx.boat) {
        ctx.boat.speed = 0;
        ctx.boat.forwardSpeed = 0;
        ctx.boat.vx = 0;
        ctx.boat.vz = 0;
      }
      if (ctx.car) {
        ctx.car.x = point.x;
        ctx.car.z = point.z;
      }
      return await settleRuntime('boat');
    };

    let selectedRoute = null;
    let selectedCandidate = null;
    let selectedFeature = null;
    if (scenarioSpec.kind === 'boat_route') {
      const result = sampleBoatRoute(scenarioSpec.sampleCount);
      selectedCandidate = result?.candidate || null;
      selectedRoute = result?.points || [];
      if (!selectedCandidate || selectedRoute.length < 4) {
        return {
          ok: false,
          skipped: true,
          reason: 'no water route found',
          location: location.label
        };
      }
    } else {
      const road = selectRoadForScenario(scenarioSpec);
      if (!road) {
        return {
          ok: false,
          skipped: true,
          reason: 'no road route found',
          location: location.label
        };
      }
      selectedFeature = road;
      selectedCandidate = {
        type: 'road',
        roadType: road.type || null,
        roadName: road.name || null,
        length: Number(roadLength(road).toFixed(2)),
        gradeSeparated: elevatedLike(road),
        tunnel: tunnelLike(road),
        terrainProfile: roadTerrainProfile(road, 5)
      };
      selectedRoute = sampleRoadRoute(road, scenarioSpec.sampleCount);
      if (selectedRoute.length < Math.max(6, Math.floor(scenarioSpec.sampleCount * 0.6))) {
        return {
          ok: false,
          skipped: true,
          reason: 'route sampling too short',
          location: location.label,
          candidate: selectedCandidate
        };
      }
    }

    const samples = [];
    for (let i = 0; i < selectedRoute.length; i++) {
      const point = selectedRoute[i];
      const snapshot = scenarioSpec.kind === 'boat_route' ?
        await takeBoatStep(selectedCandidate, point) :
        await takeDriveStep(point);
      samples.push({
        index: i,
        routeDistance: Number(point.distance || i),
        actor: snapshot?.actor || null,
        coordinates: snapshot?.coordinates || null,
        terrain: snapshot?.terrain || null,
        road: snapshot?.road || null,
        water: snapshot?.water || null,
        perf: snapshot?.perf ? {
          fps: snapshot.perf.fps,
          frameMs: snapshot.perf.frameMs,
          spikes: snapshot.perf.spikes || null
        } : null
      });
    }

    const thresholds = scenarioSpec.thresholds || {};
    const failures = [];
    const warnings = [];
    let maxRoundTripError = 0;
    let maxMinimapCenterDrift = 0;
    let maxSurfaceDeltaAbs = 0;
    let minTerrainDelta = Infinity;
    let maxFrameMs = 0;
    let maxMissingActiveTerrainMeshes = 0;
    let maxDuplicateTerrainMeshes = 0;
    let maxStaleTerrainMeshes = 0;
    let centerMissingCount = 0;

    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];
      const coordinates = sample.coordinates || {};
      const terrain = sample.terrain || {};
      const road = sample.road || {};
      const frameMs = Number(sample.perf?.frameMs || 0);
      const roundTripError = Number(coordinates.roundTripError || 0);
      const minimapCenterDrift = Number(coordinates.minimapCenterDrift || 0);
      const surfaceDelta = Math.abs(Number(road.surfaceDelta || 0));
      const terrainDelta = Number(road.terrainDelta || 0);

      maxRoundTripError = Math.max(maxRoundTripError, roundTripError);
      maxMinimapCenterDrift = Math.max(maxMinimapCenterDrift, minimapCenterDrift);
      maxSurfaceDeltaAbs = Math.max(maxSurfaceDeltaAbs, surfaceDelta);
      minTerrainDelta = Math.min(minTerrainDelta, terrainDelta);
      maxFrameMs = Math.max(maxFrameMs, frameMs);
      maxMissingActiveTerrainMeshes = Math.max(maxMissingActiveTerrainMeshes, Number(terrain.missingActiveTerrainMeshes || 0));
      maxDuplicateTerrainMeshes = Math.max(maxDuplicateTerrainMeshes, Number(terrain.duplicateTerrainMeshes || 0));
      maxStaleTerrainMeshes = Math.max(maxStaleTerrainMeshes, Number(terrain.staleTerrainMeshes || 0));
      if (!terrain.activeCenterLoaded) centerMissingCount++;

      if (scenarioSpec.kind !== 'boat_route' && !road.onRoad) {
        failures.push(`sample ${i}: road contact lost`);
      }
      if (Number.isFinite(thresholds.maxRoundTripError) && roundTripError > thresholds.maxRoundTripError) {
        failures.push(`sample ${i}: round-trip error ${roundTripError.toFixed(3)} > ${thresholds.maxRoundTripError}`);
      }
      if (Number.isFinite(thresholds.maxMinimapCenterDrift) && minimapCenterDrift > thresholds.maxMinimapCenterDrift) {
        failures.push(`sample ${i}: minimap center drift ${minimapCenterDrift.toFixed(3)} > ${thresholds.maxMinimapCenterDrift}`);
      }
      if (Number.isFinite(thresholds.maxSurfaceDeltaAbs) && surfaceDelta > thresholds.maxSurfaceDeltaAbs) {
        failures.push(`sample ${i}: surface delta ${surfaceDelta.toFixed(3)} > ${thresholds.maxSurfaceDeltaAbs}`);
      }
      if (Number.isFinite(thresholds.maxTerrainDeltaBelow) && terrainDelta < thresholds.maxTerrainDeltaBelow) {
        failures.push(`sample ${i}: terrain delta ${terrainDelta.toFixed(3)} < ${thresholds.maxTerrainDeltaBelow}`);
      }
      if (Number.isFinite(thresholds.maxMissingActiveTerrainMeshes) && Number(terrain.missingActiveTerrainMeshes || 0) > thresholds.maxMissingActiveTerrainMeshes) {
        failures.push(`sample ${i}: missing active terrain meshes ${terrain.missingActiveTerrainMeshes}`);
      }
      if (Number.isFinite(thresholds.maxDuplicateTerrainMeshes) && Number(terrain.duplicateTerrainMeshes || 0) > thresholds.maxDuplicateTerrainMeshes) {
        failures.push(`sample ${i}: duplicate terrain meshes ${terrain.duplicateTerrainMeshes}`);
      }
      if (Number.isFinite(thresholds.warnMaxStaleTerrainMeshes) && Number(terrain.staleTerrainMeshes || 0) > thresholds.warnMaxStaleTerrainMeshes) {
        warnings.push(`sample ${i}: stale terrain meshes ${terrain.staleTerrainMeshes}`);
      }
      if (Number.isFinite(thresholds.warnMaxFrameMs) && frameMs > thresholds.warnMaxFrameMs) {
        warnings.push(`sample ${i}: frame ${frameMs.toFixed(2)}ms > ${thresholds.warnMaxFrameMs}`);
      }
      if (!terrain.activeCenterLoaded) {
        failures.push(`sample ${i}: center terrain tile not loaded`);
      }
    }

    return {
      ok: failures.length === 0,
      skipped: false,
      location: location.label,
      selector: scenarioSpec.selector,
      kind: scenarioSpec.kind,
      candidate: selectedCandidate,
      sampleCount: samples.length,
      summary: {
        maxRoundTripError: Number(maxRoundTripError.toFixed(4)),
        maxMinimapCenterDrift: Number(maxMinimapCenterDrift.toFixed(4)),
        maxSurfaceDeltaAbs: Number(maxSurfaceDeltaAbs.toFixed(4)),
        minTerrainDelta: Number.isFinite(minTerrainDelta) ? Number(minTerrainDelta.toFixed(4)) : null,
        maxFrameMs: Number(maxFrameMs.toFixed(2)),
        maxMissingActiveTerrainMeshes,
        maxDuplicateTerrainMeshes,
        maxStaleTerrainMeshes,
        centerMissingCount
      },
      failures: failures.slice(0, 20),
      warnings: warnings.slice(0, 20),
      samples: samples.slice(0, 24)
    };
  }, { scenarioSpec: scenario, location: locationSpec });
}

async function main() {
  await mkdirp(outputDir);
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const consoleErrors = [];

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (isTransientConsoleError(text)) return;
    consoleErrors.push(text);
  });

  const report = {
    ok: false,
    branchGuardrail: 'continuous-world-validation',
    url: server.baseUrl,
    scenarios: [],
    consoleErrors: []
  };

  try {
    await page.goto(`${server.baseUrl}/app/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    const bootstrap = await bootstrapEarthRuntime(page, 'baltimore');
    assert(bootstrap?.ok, `continuous-world bootstrap failed: ${JSON.stringify(bootstrap)}`);

    for (const scenario of CONTINUOUS_WORLD_SCENARIOS) {
      console.log(`[test-continuous-world-scenarios] scenario ${scenario.id}`);
      const scenarioReport = {
        id: scenario.id,
        kind: scenario.kind,
        selector: scenario.selector,
        cases: [],
        ok: true
      };

      for (const locationId of scenario.locationIds) {
        const locationSpec = CONTINUOUS_WORLD_LOCATIONS[locationId];
        assert(locationSpec, `Unknown continuous-world location: ${locationId}`);
        console.log(`[test-continuous-world-scenarios] load ${scenario.id}:${locationId}`);
        const loadResult = await loadEarthLocation(page, locationSpec);
        assert(loadResult?.ok, `${scenario.id}:${locationId} failed to load: ${JSON.stringify(loadResult)}`);
        console.log(`[test-continuous-world-scenarios] run ${scenario.id}:${locationId}`);
        const caseReport = await Promise.race([
          runScenarioCase(page, scenario, locationSpec),
          new Promise((resolve) => {
            setTimeout(() => resolve({
              ok: false,
              skipped: false,
              location: locationSpec.label,
              selector: scenario.selector,
              kind: scenario.kind,
              reason: `case timeout after 120000ms`,
              failures: ['case timed out before report completion']
            }), 120000);
          })
        ]);
        caseReport.id = `${scenario.id}:${locationId}`;
        scenarioReport.cases.push(caseReport);
        if (!caseReport.ok && !caseReport.skipped) scenarioReport.ok = false;

        const shotPath = path.join(outputDir, `${scenario.id}-${locationId}.png`);
        await page.screenshot({ path: shotPath, fullPage: false });
        report.scenarios = [...report.scenarios.filter((entry) => entry.id !== scenarioReport.id), scenarioReport];
        report.consoleErrors = consoleErrors;
        await writeReport(report);
      }

      const usableCases = scenarioReport.cases.filter((entry) => !entry.skipped);
      if (usableCases.length === 0) {
        scenarioReport.ok = false;
        scenarioReport.reason = 'all cases skipped';
      }
      report.scenarios = [...report.scenarios.filter((entry) => entry.id !== scenarioReport.id), scenarioReport];
      await writeReport(report);
    }

    report.consoleErrors = consoleErrors;
    report.ok = report.scenarios.every((scenario) => scenario.ok) && consoleErrors.length === 0;
    await writeReport(report);
    if (!report.ok) {
      throw new Error(`continuous-world scenarios failed: ${JSON.stringify(report.scenarios.map((scenario) => ({ id: scenario.id, ok: scenario.ok, reason: scenario.reason || null })))}`);
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('[test-continuous-world-scenarios] failed');
    console.error(error);
    process.exit(1);
  });
