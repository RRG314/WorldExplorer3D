import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { mkdirp, rootDir, startServer, bootstrapEarthRuntime } from './lib/runtime-browser-harness.mjs';

const outputDir = path.join(rootDir, 'output', 'playwright', 'drive-camera-smoothness');
const failureContext = {
  baseUrl: null,
  loader: null,
  report: null,
  consoleErrors: []
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isIgnorableConsoleError(text = '') {
  return /(429 \(Too Many Requests\)|504 \(Gateway Timeout\)|502 \(Bad Gateway\)|503 \(Service Unavailable\)|Failed to load resource.*favicon\.ico|Could not reach Cloud Firestore backend|net::ERR_CONNECTION_CLOSED|blocked by CORS policy|Failed to load resource: net::ERR_FAILED)/i.test(String(text));
}

function isOverpassInfraFailure(text = '') {
  return /All Overpass endpoints failed|status of 429|status of 500|status of 502|status of 503|status of 504|HTTP 429|HTTP 500|HTTP 502|HTTP 503|HTTP 504|timeout after \d+ms/i.test(String(text));
}

async function collectDriveReport(page) {
  return page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    if (!ctx) return { ok: false, reason: 'shared context unavailable' };

    const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
    const roadLength = (road) => {
      const pts = Array.isArray(road?.pts) ? road.pts : [];
      if (pts.length < 2) return 0;
      if (road?.surfaceDistances instanceof Float32Array && road.surfaceDistances.length > 0) {
        return Number(road.surfaceDistances[road.surfaceDistances.length - 1]) || 0;
      }
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
      return !!type && !/^(footway|path|steps|pedestrian|corridor|cycleway|service|service_driveway)$/.test(type);
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
    const sampleRoadRoute = (road, sampleCount = 6, range = null) => {
      const total = roadLength(road);
      if (!(total > 24)) return [];
      const startBound =
        Number.isFinite(Number(range?.startDistance)) ?
          Math.max(0, Math.min(total, Number(range.startDistance))) :
          Math.min(22, total * 0.06);
      const endBound =
        Number.isFinite(Number(range?.endDistance)) ?
          Math.max(startBound, Math.min(total, Number(range.endDistance))) :
          Math.max(startBound, total - Math.min(22, total * 0.06));
      if (!(endBound - startBound > 12)) return [];
      const samples = [];
      for (let i = 0; i < sampleCount; i++) {
        const t = sampleCount <= 1 ? 0.5 : i / (sampleCount - 1);
        const distance = startBound + (endBound - startBound) * t;
        const point = pointOnRoadAtDistance(road, distance);
        if (point) samples.push({ ...point, distance });
      }
      return samples;
    };
    const roadTerrainProfile = (road, sampleCount = 6, range = null) => {
      if (typeof ctx.sampleFeatureSurfaceY !== 'function' || typeof ctx.terrainYAtWorld !== 'function') return null;
      const points = sampleRoadRoute(road, sampleCount, range);
      if (!points.length) return null;
      const deltas = [];
      const surfaceYs = [];
      for (let i = 0; i < points.length; i++) {
        const point = points[i];
        const surfaceY = Number(ctx.sampleFeatureSurfaceY(road, point.x, point.z));
        const terrainY = Number(ctx.terrainYAtWorld(point.x, point.z));
        if (!Number.isFinite(surfaceY) || !Number.isFinite(terrainY)) continue;
        deltas.push(surfaceY - terrainY);
        surfaceYs.push(surfaceY);
      }
      if (!deltas.length) return null;
      let maxStepDelta = 0;
      for (let i = 1; i < surfaceYs.length; i++) {
        maxStepDelta = Math.max(maxStepDelta, Math.abs(surfaceYs[i] - surfaceYs[i - 1]));
      }
      return {
        minDelta: Math.min(...deltas),
        maxDelta: Math.max(...deltas),
        maxAbsDelta: Math.max(...deltas.map((value) => Math.abs(value))),
        avgAbsDelta: deltas.reduce((sum, value) => sum + Math.abs(value), 0) / deltas.length,
        maxStepDelta
      };
    };
    const roadMinDistanceToWorldPoint = (road, x, z) => {
      const pts = Array.isArray(road?.pts) ? road.pts : [];
      let min = Infinity;
      for (let i = 0; i < pts.length; i++) {
        const pt = pts[i];
        const dist = Math.hypot(pt.x - x, pt.z - z);
        if (dist < min) min = dist;
      }
      return min;
    };
    const majorRoadScore = (road) => {
      const type = String(road?.type || '').toLowerCase();
      if (type.startsWith('motorway')) return 6;
      if (type.startsWith('trunk')) return 5;
      if (type.startsWith('primary')) return 4;
      if (type.startsWith('secondary')) return 3;
      if (type.startsWith('tertiary')) return 2;
      return 1;
    };
    const selectDriveProbeRoad = (originX, originZ) => {
      const roads = Array.isArray(ctx.roads) ? ctx.roads.filter((road) => Array.isArray(road?.pts) && road.pts.length >= 2 && isVehicleRoad(road)) : [];
      let best = null;
      for (let i = 0; i < roads.length; i++) {
        const road = roads[i];
        const semantics = road?.structureSemantics || null;
        if (semantics?.terrainMode === 'subgrade') continue;
        if (semantics?.terrainMode === 'elevated') continue;
        if (gradeSeparatedLike(road) || tunnelLike(road)) continue;
        if (/_link$/.test(String(road?.type || '').toLowerCase())) continue;
        const transitionAnchors = Array.isArray(road?.structureTransitionAnchors) ? road.structureTransitionAnchors : [];
        const hasStrongTransitionAnchor = transitionAnchors.some((anchor) => {
          const targetOffset = Math.abs(Number(anchor?.targetOffset) || 0);
          const span = Math.max(0, Number(anchor?.span) || 0);
          return targetOffset >= 2.2 || span >= 54;
        });
        if (hasStrongTransitionAnchor) continue;
        const length = roadLength(road);
        if (length < 180) continue;
        const minDist = roadMinDistanceToWorldPoint(road, originX, originZ);
        if (!Number.isFinite(minDist) || minDist > 260) continue;
        const segmentLength = Math.min(Math.max(140, length * 0.24), 220);
        const segmentStep = Math.max(32, segmentLength * 0.28);
        for (let startDistance = 14; startDistance + segmentLength <= length - 14; startDistance += segmentStep) {
          const range = {
            startDistance,
            endDistance: startDistance + segmentLength
          };
          const terrainProfile = roadTerrainProfile(road, 10, range);
          if (!terrainProfile) continue;
          if (terrainProfile.maxStepDelta > 0.18) continue;
          const segmentMid = pointOnRoadAtDistance(road, startDistance + segmentLength * 0.5);
          const segmentDist =
            segmentMid ?
              Math.hypot(segmentMid.x - originX, segmentMid.z - originZ) :
              minDist;
          const score =
            length +
            majorRoadScore(road) * 220 -
            segmentDist * 6 -
            terrainProfile.maxStepDelta * 620 -
            terrainProfile.avgAbsDelta * 40;
          if (!best || score > best.score) {
            best = {
              road,
              score,
              startDistance,
              segmentLength,
              lookDistance: Math.min(length, startDistance + segmentLength * 0.62)
            };
          }
        }
      }
      return best || null;
    };
    const median = (values = []) => {
      const finite = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
      if (!finite.length) return 0;
      const mid = Math.floor(finite.length * 0.5);
      return finite.length % 2 ? finite[mid] : (finite[mid - 1] + finite[mid]) * 0.5;
    };
    const percentile = (values = [], ratio = 0.95) => {
      const finite = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
      if (!finite.length) return 0;
      const index = Math.max(0, Math.min(finite.length - 1, Math.round((finite.length - 1) * ratio)));
      return finite[index];
    };
    const waitForPlayableCore = async () => {
      const deadline = performance.now() + 30000;
      while (performance.now() < deadline) {
        const validation = typeof ctx.getContinuousWorldValidationSnapshot === 'function' ? ctx.getContinuousWorldValidationSnapshot() : null;
        const carX = Number(ctx.car?.x || 0);
        const carZ = Number(ctx.car?.z || 0);
        const roads = Array.isArray(ctx.roads) ? ctx.roads.length : 0;
        const buildingMeshes = Array.isArray(ctx.buildingMeshes) ? ctx.buildingMeshes.length : 0;
        const visibleRoads =
          typeof ctx.countVisibleRoadMeshesNearWorldPoint === 'function' ?
            ctx.countVisibleRoadMeshesNearWorldPoint(carX, carZ, 240) :
            0;
        const nearbyRoadFeatures =
          typeof ctx.countDriveableRoadFeaturesNearWorldPoint === 'function' ?
            ctx.countDriveableRoadFeaturesNearWorldPoint(carX, carZ, 280) :
            0;
        const visibleBuildings =
          typeof ctx.countVisibleBuildingMeshesNearWorldPoint === 'function' ?
            ctx.countVisibleBuildingMeshesNearWorldPoint(carX, carZ, 360) :
            0;
        const visibleDetailedBuildings =
          typeof ctx.countVisibleDetailedBuildingMeshesNearWorldPoint === 'function' ?
            ctx.countVisibleDetailedBuildingMeshesNearWorldPoint(carX, carZ, 360) :
            visibleBuildings;
        if (
          validation?.playableCore?.ready &&
          Number(validation?.playableCore?.roadMeshCount || 0) > 0 &&
          validation?.terrain?.activeCenterLoaded &&
          roads >= 1200 &&
          (
            visibleRoads >= 16 ||
            (visibleRoads >= 6 && nearbyRoadFeatures >= 80)
          ) &&
          (buildingMeshes >= 420 || (visibleBuildings >= 120 && visibleDetailedBuildings >= 24))
        ) {
          return {
            ready: true,
            roads,
            buildingMeshes,
            visibleRoads,
            nearbyRoadFeatures,
            visibleBuildings,
            visibleDetailedBuildings
          };
        }
        if (typeof ctx.updateTerrainAround === 'function') ctx.updateTerrainAround(ctx.car?.x || 0, ctx.car?.z || 0);
        if (typeof ctx.updateWorldLod === 'function') ctx.updateWorldLod(true);
        await sleep(160);
      }
      return {
        ready: false,
        roads: Array.isArray(ctx.roads) ? ctx.roads.length : 0,
        buildingMeshes: Array.isArray(ctx.buildingMeshes) ? ctx.buildingMeshes.length : 0,
        visibleRoads:
          typeof ctx.countVisibleRoadMeshesNearWorldPoint === 'function' ?
            ctx.countVisibleRoadMeshesNearWorldPoint(ctx.car?.x || 0, ctx.car?.z || 0, 240) :
            0,
        nearbyRoadFeatures:
          typeof ctx.countDriveableRoadFeaturesNearWorldPoint === 'function' ?
            ctx.countDriveableRoadFeaturesNearWorldPoint(ctx.car?.x || 0, ctx.car?.z || 0, 280) :
            0,
        visibleBuildings:
          typeof ctx.countVisibleBuildingMeshesNearWorldPoint === 'function' ?
            ctx.countVisibleBuildingMeshesNearWorldPoint(ctx.car?.x || 0, ctx.car?.z || 0, 360) :
            0,
        visibleDetailedBuildings:
          typeof ctx.countVisibleDetailedBuildingMeshesNearWorldPoint === 'function' ?
            ctx.countVisibleDetailedBuildingMeshesNearWorldPoint(ctx.car?.x || 0, ctx.car?.z || 0, 360) :
            0
      };
    };

    const sample = (label, t) => {
      const validation = typeof ctx.getContinuousWorldValidationSnapshot === 'function' ? ctx.getContinuousWorldValidationSnapshot() : null;
      const interactive = typeof ctx.getContinuousWorldInteractiveStreamSnapshot === 'function' ? ctx.getContinuousWorldInteractiveStreamSnapshot() : null;
      const visibleRoads =
        typeof ctx.countVisibleRoadMeshesNearWorldPoint === 'function' ?
          ctx.countVisibleRoadMeshesNearWorldPoint(ctx.car?.x || 0, ctx.car?.z || 0, 220) :
          0;
      const nearbyRoadFeatures =
        typeof ctx.countDriveableRoadFeaturesNearWorldPoint === 'function' ?
          ctx.countDriveableRoadFeaturesNearWorldPoint(ctx.car?.x || 0, ctx.car?.z || 0, 240) :
          0;
      return {
        label,
        t,
        carY: Number(ctx.car?.y || 0),
        surfaceTargetY: Number.isFinite(ctx.car?._surfaceTargetY) ? Number(ctx.car._surfaceTargetY) : null,
        surfaceDeltaY: Number.isFinite(ctx.car?._surfaceDeltaY) ? Number(ctx.car._surfaceDeltaY) : null,
        camY: Number(ctx.camera?.position?.y || 0),
        x: Number(ctx.car?.x || 0),
        z: Number(ctx.car?.z || 0),
        surfaceResidualY:
          Number.isFinite(ctx.car?._surfaceTargetY) ?
            Number(ctx.car?.y || 0) - Number(ctx.car._surfaceTargetY) :
            null,
        cameraOffsetY: Number(ctx.camera?.position?.y || 0) - Number(ctx.car?.y || 0),
        chaseDistance: Math.hypot(
          Number(ctx.camera?.position?.x || 0) - Number(ctx.car?.x || 0),
          Number(ctx.camera?.position?.z || 0) - Number(ctx.car?.z || 0)
        ),
        speed: Number(ctx.car?.speed || 0),
        onRoad: !!ctx.car?.onRoad,
        visibleRoads,
        nearbyRoadFeatures,
        roadCenterError: Number(ctx.car?._roadCenterError || 0),
        roadCenterAssist: Number(ctx.car?._roadCenterAssist || 0),
        frameMs: Number(ctx.perfStats?.live?.frameMs || 0),
        runtimeUpdateMs: Number(ctx.perfStats?.live?.runtimeSections?.update?.lastMs || 0),
        runtimeStreamKickMs: Number(ctx.perfStats?.live?.runtimeSections?.interactiveStreamingKick?.lastMs || 0),
        runtimeWorldLodMs: Number(ctx.perfStats?.live?.runtimeSections?.worldLod?.lastMs || 0),
        runtimeMapMs: Number(ctx.perfStats?.live?.runtimeSections?.map?.lastMs || 0),
        streamPending: !!interactive?.pending,
        lastLoadReason: String(interactive?.lastLoadReason || ''),
        pendingSurfaceSyncRoads: Number(validation?.terrain?.pendingSurfaceSyncRoads || 0),
        lastSurfaceSyncMs: Number(validation?.terrain?.lastSurfaceSyncDurationMs || 0)
      };
    };

    const maxStep = (samples, key) => {
      let max = 0;
      for (let i = 1; i < samples.length; i++) {
        const prev = Number(samples[i - 1]?.[key]);
        const next = Number(samples[i]?.[key]);
        if (Number.isFinite(prev) && Number.isFinite(next)) max = Math.max(max, Math.abs(next - prev));
      }
      return max;
    };
    const stepSeries = (samples, key) => {
      const values = [];
      for (let i = 1; i < samples.length; i++) {
        const prev = Number(samples[i - 1]?.[key]);
        const next = Number(samples[i]?.[key]);
        if (Number.isFinite(prev) && Number.isFinite(next)) values.push(Math.abs(next - prev));
      }
      return values;
    };
    const waitForDriveProbeSettle = async () => {
      const samples = [];
      const startedAt = performance.now();
      let stableFrames = 0;
      while (performance.now() - startedAt < 9000) {
        if (typeof ctx.updateTerrainAround === 'function') ctx.updateTerrainAround(ctx.car?.x || 0, ctx.car?.z || 0);
        if (typeof ctx.updateWorldLod === 'function') ctx.updateWorldLod(true);
        const entry = sample('settle', performance.now() - startedAt);
        samples.push(entry);
        const surfaceResidual = Math.abs(Number(entry.surfaceResidualY || 0));
        const chaseDistance = Number(entry.chaseDistance || 0);
        const roadReady = Number(entry.visibleRoads || 0) >= 6 || Number(entry.nearbyRoadFeatures || 0) >= 18;
        const cameraReady = chaseDistance >= 4 && chaseDistance <= 18;
        const speedReady = Math.abs(Number(entry.speed || 0)) < 0.15;
        const surfaceReady = surfaceResidual < 0.025;
        const syncReady = Number(entry.lastSurfaceSyncMs || 0) < 40;
        if (entry.onRoad && roadReady && cameraReady && speedReady && surfaceReady && syncReady) {
          stableFrames += 1;
          if (stableFrames >= 3) {
            return {
              ok: true,
              settledAtMs: performance.now() - startedAt,
              samples
            };
          }
        } else {
          stableFrames = 0;
        }
        await sleep(120);
      }
      return {
        ok: false,
        settledAtMs: performance.now() - startedAt,
        samples
      };
    };

    const ready = await waitForPlayableCore();
    if (!ready?.ready) {
      return {
        ok: false,
        reason: 'playable core never became ready',
        startup: ready
      };
    }

    ctx.camMode = 0;
    if (typeof ctx.setTravelMode === 'function') {
      ctx.setTravelMode('drive', { source: 'drive_camera_smoothness_probe', force: true, emitTutorial: false });
    }
    const probeOriginX = Number(ctx.car?.x || 0);
    const probeOriginZ = Number(ctx.car?.z || 0);
    const probeRoad = selectDriveProbeRoad(probeOriginX, probeOriginZ);
    if (probeRoad && typeof ctx.teleportToLocation === 'function') {
      const probeRoadFeature = probeRoad.road;
      const startDistance = Math.max(8, Number(probeRoad.startDistance || 0));
      const lookDistance = Math.max(startDistance + 24, Number(probeRoad.lookDistance || (startDistance + 80)));
      const startPoint = pointOnRoadAtDistance(probeRoadFeature, startDistance);
      const lookPoint = pointOnRoadAtDistance(probeRoadFeature, lookDistance) || startPoint;
      if (startPoint) {
        ctx.teleportToLocation(startPoint.x, startPoint.z, {
          source: 'drive_camera_smoothness_probe',
          preferredRoad: probeRoadFeature
        });
        if (ctx.car) {
          ctx.car.angle = Math.atan2((lookPoint?.x || startPoint.x) - startPoint.x, (lookPoint?.z || startPoint.z) - startPoint.z);
        }
      }
    } else {
      return {
        ok: false,
        reason: 'no flat at-grade drive probe road found',
        startup: ready,
        probeRoad: null
      };
    }
    if (ctx.car) {
      ctx.car.speed = 0;
      ctx.car.vx = 0;
      ctx.car.vz = 0;
      ctx.car.vy = 0;
      ctx.car.vFwd = 0;
      ctx.car.vLat = 0;
      ctx.car.yawRate = 0;
      ctx.car.steerSm = 0;
      ctx.car.throttleSm = 0;
    }
    if (typeof ctx.updateTerrainAround === 'function') ctx.updateTerrainAround(ctx.car?.x || 0, ctx.car?.z || 0);
    if (typeof ctx.updateWorldLod === 'function') ctx.updateWorldLod(true);
    const settle = await waitForDriveProbeSettle();
    if (!settle?.ok) {
      return {
        ok: false,
        reason: 'drive probe never settled onto a stable local shell',
      startup: ready,
      probeRoad: probeRoad ? {
        type: probeRoad.road?.type || null,
        name: probeRoad.road?.name || null,
        length: Number(roadLength(probeRoad.road).toFixed(2)),
        segmentLength: Number((probeRoad.segmentLength || 0).toFixed(2))
      } : null,
      settle
    };
    }

    const idleSamples = [];
    const driveSamples = [];
    const idleStart = performance.now();
    while (performance.now() - idleStart < 900) {
      idleSamples.push(sample('idle', performance.now() - idleStart));
      await sleep(80);
    }

    const driveDurationMs = 11000;
    const driveStart = performance.now();
    while (performance.now() - driveStart < driveDurationMs) {
      const elapsed = performance.now() - driveStart;
      ctx.keys.KeyW = true;
      ctx.keys.ArrowUp = true;
      ctx.keys.KeyD = false;
      ctx.keys.ArrowRight = false;
      driveSamples.push(sample('drive', elapsed));
      await sleep(80);
    }
    ctx.keys.KeyW = false;
    ctx.keys.ArrowUp = false;
    ctx.keys.KeyD = false;
    ctx.keys.ArrowRight = false;
    await sleep(260);
    if (typeof ctx.updateWorldLod === 'function') ctx.updateWorldLod(true);

    const allDriveRoads = driveSamples.map((entry) => Number(entry.visibleRoads || 0));
    const allDriveRoadFeatures = driveSamples.map((entry) => Number(entry.nearbyRoadFeatures || 0));
    const allChaseDistances = driveSamples.map((entry) => Number(entry.chaseDistance || 0)).filter((value) => Number.isFinite(value) && value > 0);
    const allRoadCenterErrors = driveSamples.map((entry) => Number(entry.roadCenterError || 0)).filter((value) => Number.isFinite(value));
    const allSpeeds = driveSamples.map((entry) => Number(entry.speed || 0)).filter((value) => Number.isFinite(value));
    const onRoadSamples = driveSamples.filter((entry) => entry.onRoad).length;
    const intervals = [];
    let totalDistanceTravelled = 0;
    for (let i = 1; i < driveSamples.length; i++) {
      const prev = driveSamples[i - 1];
      const next = driveSamples[i];
      const dtMs = Math.max(1, Number(next.t || 0) - Number(prev.t || 0));
      const stepDistance = Math.hypot(Number(next.x || 0) - Number(prev.x || 0), Number(next.z || 0) - Number(prev.z || 0));
      totalDistanceTravelled += stepDistance;
      intervals.push({
        dtMs,
        stepDistance,
        speed: Number(prev.speed || 0),
        onRoad: !!prev.onRoad,
        streamPending: !!next.streamPending,
        frameMs: Number(next.frameMs || 0),
        pendingSurfaceSyncRoads: Number(next.pendingSurfaceSyncRoads || 0),
        lastSurfaceSyncMs: Number(next.lastSurfaceSyncMs || 0)
      });
    }
    const meaningfulIntervals = intervals.filter((entry) => entry.onRoad && entry.speed >= 10);
    const medianMeaningfulStepDistance = median(meaningfulIntervals.map((entry) => entry.stepDistance));
    const loadCoupledStutterIntervals = meaningfulIntervals.filter((entry) =>
      medianMeaningfulStepDistance > 0 &&
      entry.stepDistance < medianMeaningfulStepDistance * 0.45 &&
      (
        entry.streamPending ||
        entry.pendingSurfaceSyncRoads > 0 ||
        entry.lastSurfaceSyncMs >= 18 ||
        entry.frameMs >= 55
      )
    );
    const maxMeaningfulStepDistance = meaningfulIntervals.length ? Math.max(...meaningfulIntervals.map((entry) => entry.stepDistance)) : 0;
    const maxMeaningfulStepDistanceRatio =
      medianMeaningfulStepDistance > 0 ?
        maxMeaningfulStepDistance / medianMeaningfulStepDistance :
        0;
    const highSpeedSamples = driveSamples.filter((entry) => Number(entry.speed || 0) >= 4).length;

    const idleSurfaceResidualSteps = stepSeries(idleSamples, 'surfaceResidualY');
    const driveSurfaceResidualSteps = stepSeries(driveSamples, 'surfaceResidualY');
    const driveCameraOffsetSteps = stepSeries(driveSamples, 'cameraOffsetY');
    return {
      ok: true,
      startup: ready,
      probeRoad: probeRoad ? {
        type: probeRoad.road?.type || null,
        name: probeRoad.road?.name || null,
        length: Number(roadLength(probeRoad.road).toFixed(2)),
        segmentLength: Number((probeRoad.segmentLength || 0).toFixed(2))
      } : null,
      settle,
      idleSamples,
      driveSamples,
      metrics: {
        idleMaxCarYStep: maxStep(idleSamples, 'carY'),
        idleMaxCameraYStep: maxStep(idleSamples, 'camY'),
        driveMaxCarYStep: maxStep(driveSamples, 'carY'),
        driveMaxCameraYStep: maxStep(driveSamples, 'camY'),
        idleMaxSurfaceResidualStep: maxStep(idleSamples, 'surfaceResidualY'),
        driveMaxSurfaceResidualStep: maxStep(driveSamples, 'surfaceResidualY'),
        idleSurfaceResidualStepP95: Number(percentile(idleSurfaceResidualSteps, 0.95).toFixed(4)),
        driveSurfaceResidualStepP95: Number(percentile(driveSurfaceResidualSteps, 0.95).toFixed(4)),
        idleMaxCameraOffsetStep: maxStep(idleSamples, 'cameraOffsetY'),
        driveMaxCameraOffsetStep: maxStep(driveSamples, 'cameraOffsetY'),
        driveCameraOffsetStepP95: Number(percentile(driveCameraOffsetSteps, 0.95).toFixed(4)),
        maxSurfaceDeltaY: Math.max(0, ...driveSamples.map((entry) => Math.abs(Number(entry.surfaceDeltaY || 0)))),
        minVisibleRoadsWhileDriving: allDriveRoads.length ? Math.min(...allDriveRoads) : 0,
        maxVisibleRoadsWhileDriving: allDriveRoads.length ? Math.max(...allDriveRoads) : 0,
        minNearbyRoadFeaturesWhileDriving: allDriveRoadFeatures.length ? Math.min(...allDriveRoadFeatures) : 0,
        maxNearbyRoadFeaturesWhileDriving: allDriveRoadFeatures.length ? Math.max(...allDriveRoadFeatures) : 0,
        minChaseDistanceWhileDriving: allChaseDistances.length ? Math.min(...allChaseDistances) : 0,
        maxChaseDistanceWhileDriving: allChaseDistances.length ? Math.max(...allChaseDistances) : 0,
        maxRoadCenterErrorWhileDriving: allRoadCenterErrors.length ? Math.max(...allRoadCenterErrors) : 0,
        onRoadRatio: driveSamples.length ? onRoadSamples / driveSamples.length : 0,
        finalSpeed: Number(ctx.car?.speed || 0),
        maxSpeed: allSpeeds.length ? Math.max(...allSpeeds) : 0,
        highSpeedSampleCount: highSpeedSamples,
        distanceTravelled: Number(totalDistanceTravelled.toFixed(3)),
        meaningfulStepDistanceMedian: Number(medianMeaningfulStepDistance.toFixed(4)),
        loadCoupledStutterCount: loadCoupledStutterIntervals.length,
        loadCoupledStutterRatio:
          meaningfulIntervals.length ?
            Number((loadCoupledStutterIntervals.length / meaningfulIntervals.length).toFixed(4)) :
            0,
        maxMeaningfulStepDistanceRatio: Number(maxMeaningfulStepDistanceRatio.toFixed(4))
      }
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
  let loader = null;
  let report = null;

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (isIgnorableConsoleError(text)) {
        ignoredConsoleErrors.push(text);
      } else {
        consoleErrors.push(text);
        failureContext.consoleErrors = consoleErrors.slice();
      }
    }
  });
  page.on('pageerror', (err) => {
    const text = String(err?.message || err);
    if (isIgnorableConsoleError(text)) {
      ignoredConsoleErrors.push(text);
    } else {
      consoleErrors.push(text);
      failureContext.consoleErrors = consoleErrors.slice();
    }
  });

  try {
    await page.goto(`${server.baseUrl}/app/`, { waitUntil: 'domcontentloaded' });
    failureContext.baseUrl = `${server.baseUrl}/app/`;
    loader = await bootstrapEarthRuntime(page, 'baltimore');
    failureContext.loader = loader;
    assert(loader?.ok, `bootstrap failed: ${loader?.reason || 'unknown'}`);

    report = await collectDriveReport(page);
    failureContext.report = report;
    const infraSignals = [
      ...ignoredConsoleErrors,
      ...consoleErrors,
      report?.reason,
      report?.startup?.reason
    ].filter(Boolean);
    const overpassInfraFailure = infraSignals.some((text) => isOverpassInfraFailure(text));
    if (overpassInfraFailure && !report?.ok) {
      throw new Error(`overpass_infra_failure_during_drive_probe: ${infraSignals.find((text) => isOverpassInfraFailure(text))}`);
    }
    assert(report?.ok, report?.reason || 'drive report failed');
    assert(report.metrics.maxSpeed >= 6, `drive probe never reached meaningful speed: ${report.metrics.maxSpeed}`);
    assert(report.metrics.highSpeedSampleCount >= 6, `drive probe never sustained higher-speed movement long enough: ${report.metrics.highSpeedSampleCount}`);
    assert(report.metrics.distanceTravelled >= 5, `drive probe covered too little distance to exercise streaming/runtime: ${report.metrics.distanceTravelled}`);
    assert(report.metrics.idleSurfaceResidualStepP95 < 0.02, `idle surface residual jitter too high: ${report.metrics.idleSurfaceResidualStepP95}`);
    assert(report.metrics.driveSurfaceResidualStepP95 < 0.03, `drive surface residual jitter too high: ${report.metrics.driveSurfaceResidualStepP95}`);
    assert(report.metrics.driveMaxSurfaceResidualStep < 0.08, `drive surface residual spike too high: ${report.metrics.driveMaxSurfaceResidualStep}`);
    assert(report.metrics.driveMaxCameraOffsetStep < 0.14, `drive camera offset spike too high: ${report.metrics.driveMaxCameraOffsetStep}`);
    assert(report.metrics.driveCameraOffsetStepP95 < 0.06, `drive camera offset jitter too high: ${report.metrics.driveCameraOffsetStepP95}`);
    assert(report.metrics.maxSurfaceDeltaY < 0.06, `surface sync jitter too high: ${report.metrics.maxSurfaceDeltaY}`);
    assert(report.metrics.minNearbyRoadFeaturesWhileDriving > 0, 'drive corridor disappeared completely while driving');
    assert(report.metrics.maxChaseDistanceWhileDriving - report.metrics.minChaseDistanceWhileDriving < 0.5, `camera chase distance drifted too much: ${report.metrics.minChaseDistanceWhileDriving}..${report.metrics.maxChaseDistanceWhileDriving}`);
    assert(report.metrics.onRoadRatio > 0.97, `car fell off road too often during probe: ${report.metrics.onRoadRatio}`);
    assert(report.metrics.loadCoupledStutterRatio < 0.22, `drive had too many load-coupled stutter intervals: ${report.metrics.loadCoupledStutterCount}/${Math.max(1, report.metrics.highSpeedSampleCount)}`);
    assert(consoleErrors.length === 0, `Unexpected console errors: ${consoleErrors.join(' | ')}`);

    await page.screenshot({ path: path.join(outputDir, 'runtime.png') });
    const finalReport = {
      ok: true,
      baseUrl: `${server.baseUrl}/app/`,
      loader,
      report,
      consoleErrors,
      ignoredConsoleErrors
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
  const failure = {
    ok: false,
    error: String(error?.message || error),
    ...failureContext
  };
  await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(failure, null, 2)).catch(() => {});
  console.error('[test-drive-camera-smoothness] Failed:', error);
  process.exitCode = 1;
});
