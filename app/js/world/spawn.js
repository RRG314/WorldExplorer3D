import { ctx as appCtx } from "../shared-context.js?v=55";
import { inferSelectedLocationWaterKind } from "./water-location-hint.js?v=2";
import { featuredArrivalNear } from "./featured-arrivals.js?v=6";
import { isRoadSurfaceReachable } from "../structure-semantics.js?v=22";
import { createWorldSpawnSurfaceApi } from "./spawn-surface.js?v=6";

let worldSpawnDeps = {
  buildingContainingPoint: () => null,
  findNearestRoad: () => null,
  isInsideWaterArea: () => false,
  isVehicleRoad: () => false,
  sampleFeatureSurfaceY: () => NaN,
  traversableFeaturesForMode: () => []
};
function initWorldSpawning(deps = {}) {
  worldSpawnDeps = {
    ...worldSpawnDeps,
    ...deps
  };
  return worldSpawnDeps;
}
const {
  driveBuildBlockCollision,
  driveCenterYAtWorld,
  cameraTerrainObstructionAt,
  finiteNumberOr,
  resolveRoadHeading,
  shouldIgnoreDriveCollision,
  spawnDepartureAssessment,
  spawnEnclosurePenalty,
  slopeDegreesAt,
  slopePenaltyAt,
  terrainVistaHeadingAt,
  spawnSurfacePenalty,
  terrainYAtWorld,
  walkBaseYAtWorld,
  walkBuildBlockCollision
} = createWorldSpawnSurfaceApi({
  getDeps: () => worldSpawnDeps
});
function evaluateWalkSpawnCandidate(x, z, options = {}) {
  let angle = finiteNumberOr(options.angle, finiteNumberOr(appCtx.car?.angle, 0));
  const terrainY = terrainYAtWorld(x, z);
  const walkBaseY = walkBaseYAtWorld(x, z);
  if (!Number.isFinite(terrainY)) return { valid: false, reason: "terrain_missing" };
  const hasExplicitFeetY = Number.isFinite(options.feetY);
  const actorFeetY = hasExplicitFeetY ? options.feetY : walkBaseY;
  const collisionBaseY = hasExplicitFeetY ? actorFeetY : terrainY;
  const nearestRoad = !options.skipRoadQuery && typeof worldSpawnDeps.findNearestRoad === "function" ? worldSpawnDeps.findNearestRoad(x, z, {
    y: actorFeetY + 1.2,
    maxVerticalDelta: 12
  }) : null;
  const onRoadSurface = isRoadSurfaceReachable(nearestRoad, {
    extraLateralPadding: 0.25
  });
  const road = onRoadSurface ? nearestRoad?.road || null : null;
  let surfaceY = onRoadSurface && Number.isFinite(nearestRoad?.y) ? nearestRoad.y : walkBaseY;
  if (worldSpawnDeps.isInsideWaterArea(x, z) && !onRoadSurface) {
    return { valid: false, reason: "inside_water", terrainY };
  }
  const containingBuilding = worldSpawnDeps.buildingContainingPoint(x, z, 4, {
    y: collisionBaseY,
    actorHeight: 1.9,
    tolerance: 0.45
  });
  let standingOnRoof = false;
  if (containingBuilding) {
    const minY = Number.isFinite(containingBuilding.minY) ? containingBuilding.minY : containingBuilding.baseY;
    const maxY = Number.isFinite(containingBuilding.maxY) ?
      containingBuilding.maxY :
      Number.isFinite(minY) && Number.isFinite(containingBuilding.height) ? minY + containingBuilding.height : NaN;
    standingOnRoof = options.allowBuildingRoof === true && Number.isFinite(maxY) &&
      actorFeetY >= maxY - 0.12 && actorFeetY <= maxY + 1.2;
    if (!standingOnRoof) return { valid: false, reason: "inside_building", terrainY };
  }
  if (!standingOnRoof && typeof appCtx.checkBuildingCollision === "function") {
    const buildingCheck = appCtx.checkBuildingCollision(x, z, 1.5, {
      actorBaseY: collisionBaseY,
      actorHeight: 1.9
    });
    if (buildingCheck?.collision) {
      return { valid: false, reason: "building_clearance", terrainY, buildingCheck };
    }
  }
  if (options.preserveElevatedSurface === true && hasExplicitFeetY && actorFeetY > surfaceY + 1) {
    surfaceY = actorFeetY;
  }
  if (walkBuildBlockCollision(x, z, terrainY)?.blocked) return { valid: false, reason: "build_block", terrainY };

  const slopeDeg = slopeDegreesAt(x, z);
  if (slopeDeg > 22) return { valid: false, reason: "slope_too_steep", terrainY, slopeDeg };
  let vistaScore = 0;
  const preserveExplicitHeading =
    options.source === 'featured_landmark_arrival' ||
    options.source === 'walk_mode_switch';
  if (!road && slopeDeg > 10 && !preserveExplicitHeading) {
    const vista = terrainVistaHeadingAt(x, z, angle);
    angle = finiteNumberOr(vista?.angle, angle);
    vistaScore = finiteNumberOr(vista?.score, 0);
  }

  return {
    valid: true,
    mode: "walk",
    x,
    z,
    angle,
    road,
    onRoad: !!road,
    terrainY,
    walkY: surfaceY + 1.7,
    carY: surfaceY + 1.2,
    slopeDeg,
    vistaScore,
    source: options.source || "direct"
  };
}

function evaluateDriveSpawnCandidate(x, z, options = {}) {
  const angle = finiteNumberOr(options.angle, finiteNumberOr(appCtx.car?.angle, 0));
  const terrainY = terrainYAtWorld(x, z);
  if (!Number.isFinite(terrainY)) return { valid: false, reason: "terrain_missing" };

  const desiredFeetY = Number.isFinite(options.feetY) ? options.feetY : NaN;
  const actorFeetY = Number.isFinite(desiredFeetY) ? desiredFeetY : terrainY;
  const nearestRoad = !options.skipRoadQuery && typeof worldSpawnDeps.findNearestRoad === "function" ? worldSpawnDeps.findNearestRoad(x, z, {
    y: actorFeetY + 1.2,
    maxVerticalDelta: 18,
    preferredRoad: options.preferredRoad || null
  }) : null;
  const road = worldSpawnDeps.isVehicleRoad(nearestRoad?.road) ? nearestRoad.road : null;
  const onRoad = isRoadSurfaceReachable(nearestRoad, {
    extraVerticalAllowance: 0.5
  }) && !!road;
  const resolvedSurfaceY = onRoad && Number.isFinite(nearestRoad?.y) ? nearestRoad.y : terrainY;
  const collisionBaseY = onRoad ? resolvedSurfaceY : actorFeetY;
  if (worldSpawnDeps.isInsideWaterArea(x, z) && !onRoad) {
    return { valid: false, reason: "inside_water", terrainY, onRoad, road };
  }

  if (Number.isFinite(desiredFeetY) && desiredFeetY > terrainY + 2.8 && !onRoad) {
    return { valid: false, reason: "elevated_surface", terrainY, onRoad, road };
  }
  if (driveBuildBlockCollision(x, z, collisionBaseY)) {
    return { valid: false, reason: "build_block", terrainY, onRoad, road };
  }

  const buildingCheck = typeof appCtx.checkBuildingCollision === "function" ?
    appCtx.checkBuildingCollision(x, z, 2.0, {
      actorBaseY: collisionBaseY,
      actorHeight: 1.9
    }) :
    { collision: false };
  if (buildingCheck?.collision && !shouldIgnoreDriveCollision(buildingCheck, x, z)) {
    return { valid: false, reason: "building_collision", terrainY, onRoad, road, buildingCheck };
  }

  const slopeDeg = slopeDegreesAt(x, z);
  if (!onRoad && slopeDeg > 30) {
    return { valid: false, reason: "slope_too_steep", terrainY, slopeDeg, onRoad, road };
  }
  if (options.requireRoad && !onRoad) {
    return { valid: false, reason: "road_required", terrainY, slopeDeg, onRoad, road };
  }
  return {
    valid: true,
    mode: "drive",
    x,
    z,
    angle,
    road,
    onRoad,
    terrainY,
    walkY: resolvedSurfaceY + 1.7,
    carY: Number.isFinite(nearestRoad?.y) ? resolvedSurfaceY + 1.2 : driveCenterYAtWorld(x, z, !!road),
    slopeDeg,
    source: options.source || "direct"
  };
}

function historicLandmarkDistanceAt(x, z) {
  let nearest = Infinity;
  const matrix = typeof THREE !== 'undefined' ? new THREE.Matrix4() : null;
  for (const mesh of appCtx.historicMarkers || []) {
    if (!mesh?.userData?.isHistoricLandmark) continue;
    if (matrix && mesh.isInstancedMesh && typeof mesh.getMatrixAt === 'function') {
      for (let index = 0; index < mesh.count; index += 1) {
        mesh.getMatrixAt(index, matrix);
        const elements = matrix.elements;
        nearest = Math.min(nearest, Math.hypot(x - elements[12], z - elements[14]));
      }
      continue;
    }
    if (Number.isFinite(mesh.position?.x) && Number.isFinite(mesh.position?.z)) {
      nearest = Math.min(nearest, Math.hypot(x - mesh.position.x, z - mesh.position.z));
    }
  }
  return nearest;
}

function searchNearestSafeGroundSpawn(targetX, targetZ, options = {}) {
  const maxRadius = Number.isFinite(options.maxRadius) ? Math.max(4, options.maxRadius) : 72;
  const step = Number.isFinite(options.step) ? Math.max(2, options.step) : 6;
  const maxSlopeDeg = Number.isFinite(options.maxSlopeDeg) ?
    Math.max(2, Math.min(22, options.maxSlopeDeg)) :
    22;
  const minLandmarkDistance = Number.isFinite(options.minLandmarkDistance) ?
    Math.max(0, options.minLandmarkDistance) :
    0;
  let best = null;

  for (let radius = step; radius <= maxRadius; radius += step) {
    const steps = Math.max(8, Math.round(radius * 1.6));
    for (let i = 0; i < steps; i++) {
      const theta = i / steps * Math.PI * 2;
      const x = targetX + Math.cos(theta) * radius;
      const z = targetZ + Math.sin(theta) * radius;
      const candidateAngle =
        Number.isFinite(options.lookAtX) && Number.isFinite(options.lookAtZ) ?
          Math.atan2(options.lookAtX - x, options.lookAtZ - z) :
          options.angle;
      const evaluated = evaluateWalkSpawnCandidate(x, z, {
        angle: candidateAngle,
        source: options.source || "ground_search"
      });
      if (!evaluated.valid) continue;
      if (evaluated.slopeDeg > maxSlopeDeg) continue;
      const landmarkDistance = minLandmarkDistance > 0 ? historicLandmarkDistanceAt(x, z) : Infinity;
      if (landmarkDistance < minLandmarkDistance) continue;
      const cameraObstruction = Number.isFinite(options.maxCameraObstruction) ?
        cameraTerrainObstructionAt(x, z, evaluated.angle) :
        0;
      if (cameraObstruction > options.maxCameraObstruction) continue;
      const score =
        radius +
        evaluated.slopeDeg * 0.6 +
        evaluated.vistaScore * 0.08 +
        cameraObstruction * 8;
      if (!best || score < best.score) {
        best = { ...evaluated, score, landmarkDistance, cameraObstruction };
      }
    }
    if (best) break;
  }

  return best;
}

function searchNearestSafeDriveGroundSpawn(targetX, targetZ, options = {}) {
  const maxRadius = Number.isFinite(options.maxRadius) ? Math.max(8, options.maxRadius) : 36;
  for (let radius = 4; radius <= maxRadius; radius += 4) {
    const steps = Math.max(8, Math.round(radius * 0.8));
    for (let i = 0; i < steps; i += 1) {
      const theta = i / steps * Math.PI * 2;
      const candidate = evaluateDriveSpawnCandidate(
        targetX + Math.cos(theta) * radius,
        targetZ + Math.sin(theta) * radius,
        {
          angle: options.angle,
          skipRoadQuery: true,
          source: 'local_drive_ground'
        }
      );
      if (candidate.valid) return candidate;
    }
  }
  return null;
}

function findGradeSeparatedRoadAt(x, z) {
  let best = null;
  let nearest = null;
  for (const road of appCtx.roads || []) {
    if (road?.structureSemantics?.terrainMode === "at_grade" || !Array.isArray(road?.pts)) continue;
    for (let i = 0; i < road.pts.length - 1; i++) {
      const p1 = road.pts[i];
      const p2 = road.pts[i + 1];
      const dx = p2.x - p1.x;
      const dz = p2.z - p1.z;
      const t = Math.max(0, Math.min(1, ((x - p1.x) * dx + (z - p1.z) * dz) / (dx * dx + dz * dz || 1)));
      const projectedX = p1.x + dx * t;
      const projectedZ = p1.z + dz * t;
      const dist = Math.hypot(x - projectedX, z - projectedZ);
      if (!nearest || dist < nearest.dist) nearest = { road, dist };
      const snapDistance = road.structureSemantics?.structureKind === "bridge" ? 42 : 18;
      if (dist > snapDistance) continue;
      if (best && dist >= best.dist) continue;
      const y = worldSpawnDeps.sampleFeatureSurfaceY(road, x, z, { segIndex: i, t });
      if (Number.isFinite(y)) best = { road, dist, y, x: projectedX, z: projectedZ };
    }
  }
  appCtx._lastCustomStructureProbe = nearest ? {
    distance: nearest.dist,
    kind: nearest.road?.structureSemantics?.structureKind || null,
    width: Number(nearest.road?.width || 0)
  } : null;
  return best;
}

function searchNearestSafeRoadSpawn(targetX, targetZ, options = {}) {
  const requestedMode = options.mode === "walk" ? "walk" : "drive";
  const traversableFeatures = worldSpawnDeps.traversableFeaturesForMode(requestedMode);
  if (!Array.isArray(traversableFeatures) || traversableFeatures.length === 0) return null;
  const maxDistance = Number.isFinite(options.maxDistance) ? Math.max(32, options.maxDistance) : 220;
  const limits = [maxDistance, Infinity];
  const shortlistLimit = requestedMode === "drive" ? 18 : 12;

  const sampleSegmentCandidates = (p1, p2) => {
    const segLen = Math.hypot(p2.x - p1.x, p2.z - p1.z);
    if (!(segLen > 1e-6)) return [];
    const tValues =
      segLen >= 42 ? [0.18, 0.38, 0.62, 0.82] :
      segLen >= 20 ? [0.25, 0.5, 0.75] :
      [0.5];
    return tValues.map((t) => ({
      x: p1.x + (p2.x - p1.x) * t,
      z: p1.z + (p2.z - p1.z) * t,
      t,
      segLen
    }));
  };

  for (let pass = 0; pass < limits.length; pass++) {
    const limit = limits[pass];
    const shortlist = [];
    const rawCandidates = [];
    const rawCandidateLimit = requestedMode === "drive" ? 64 : 48;
    const pushRawCandidate = (candidate) => {
      rawCandidates.push(candidate);
      rawCandidates.sort((a, b) => a.roughScore - b.roughScore);
      if (rawCandidates.length > rawCandidateLimit) rawCandidates.length = rawCandidateLimit;
    };

    const pushCandidate = (evaluated, feature, baseScore, spawnMeta = {}) => {
      const nextResult = {
        ...evaluated,
        ...spawnMeta,
        surfaceFeature: feature,
        surfaceKind: String(feature?.networkKind || feature?.kind || "road").toLowerCase(),
        onWalkSurface: requestedMode === "walk",
        baseScore,
        score: baseScore
      };
      if (requestedMode === "walk" && worldSpawnDeps.isVehicleRoad(feature)) {
        nextResult.road = feature;
        nextResult.onRoad = true;
      }
      shortlist.push(nextResult);
      shortlist.sort((a, b) => a.baseScore - b.baseScore);
      if (shortlist.length > shortlistLimit) shortlist.length = shortlistLimit;
    };

    for (let r = 0; r < traversableFeatures.length; r++) {
      const feature = traversableFeatures[r];
      if (!Array.isArray(feature?.pts) || feature.pts.length < 2) continue;
      const segmentLengths = [];
      let featureLength = 0;
      for (let i = 0; i < feature.pts.length - 1; i++) {
        const segmentLength = Math.hypot(
          feature.pts[i + 1].x - feature.pts[i].x,
          feature.pts[i + 1].z - feature.pts[i].z
        );
        segmentLengths.push(segmentLength);
        featureLength += segmentLength;
      }
      let distanceBeforeSegment = 0;
      for (let i = 0; i < feature.pts.length - 1; i++) {
        const p1 = feature.pts[i];
        const p2 = feature.pts[i + 1];
        const candidates = sampleSegmentCandidates(p1, p2);
        for (let c = 0; c < candidates.length; c++) {
          const candidate = candidates[c];
          const dist = Math.hypot(candidate.x - targetX, candidate.z - targetZ);
          if (dist > limit) continue;

          const distanceAlong = distanceBeforeSegment + candidate.t * candidate.segLen;
          const distanceFromEnd = Math.max(0, featureLength - distanceAlong);
          const nearestEndpoint = distanceAlong <= distanceFromEnd ? "start" : "end";
          const endpointClearance = Math.min(distanceAlong, distanceFromEnd);
          const endpointConnected = Array.isArray(feature.connectedFeatures?.[nearestEndpoint]) &&
            feature.connectedFeatures[nearestEndpoint].length > 0;
          let angle = Math.atan2(p2.x - p1.x, p2.z - p1.z);
          if (nearestEndpoint === "end" && !endpointConnected) angle += Math.PI;
          const endpointPenalty =
            endpointClearance >= 22 ? 0 :
            endpointConnected ? (22 - endpointClearance) * 0.45 :
            45 + (22 - endpointClearance) * 4;
          pushRawCandidate({
            angle,
            candidate,
            endpointClearance,
            endpointConnected,
            feature,
            roughScore:
            dist +
            spawnSurfacePenalty(feature, requestedMode) +
            endpointPenalty
          });
        }
        distanceBeforeSegment += segmentLengths[i] || 0;
      }
    }

    for (let i = 0; i < rawCandidates.length; i++) {
      const raw = rawCandidates[i];
      const evaluated = requestedMode === "drive" ?
        evaluateDriveSpawnCandidate(raw.candidate.x, raw.candidate.z, {
          angle: raw.angle,
          feetY: options.feetY,
          requireRoad: true,
          source: "road_search"
        }) :
        evaluateWalkSpawnCandidate(raw.candidate.x, raw.candidate.z, {
          angle: raw.angle,
          feetY: options.feetY,
          source: "walk_surface_search"
        });
      if (!evaluated.valid) continue;

      const departure = spawnDepartureAssessment(
        raw.candidate.x,
        raw.candidate.z,
        evaluated.angle,
        requestedMode
      );
      if (!departure.valid) continue;
      if (departure.reverseHeading) evaluated.angle += Math.PI;

      const spawnSlopePenalty = Math.max(
        0,
        (Number(evaluated.slopeDeg) || 0) - (requestedMode === "drive" ? 8 : 12)
      ) * (requestedMode === "drive" ? 4.5 : 2.6);
      const score =
        raw.roughScore +
        slopePenaltyAt(raw.candidate.x, raw.candidate.z) +
        spawnSlopePenalty +
        departure.penalty;
      pushCandidate(evaluated, raw.feature, score, {
        featureEndpointClearance: raw.endpointClearance,
        endpointConnected: raw.endpointConnected,
        departureClearance: {
          forwardBlocked: departure.forwardBlocked,
          reverseBlocked: departure.reverseBlocked,
          reversed: departure.reverseHeading
        }
      });
    }

    if (shortlist.length > 0) {
      let best = null;
      for (let i = 0; i < shortlist.length; i++) {
        const candidate = shortlist[i];
        const enclosurePenalty = spawnEnclosurePenalty(
          candidate.x,
          candidate.z,
          candidate.angle,
          requestedMode
        );
        const score = candidate.baseScore + enclosurePenalty;
        if (!best || score < best.score) {
          best = {
            ...candidate,
            enclosurePenalty,
            score
          };
        }
      }
      if (best) return best;
    }
  }

  return null;
}

function resolveProjectedRoadSpawn(targetX, targetZ, options = {}) {
  if (typeof worldSpawnDeps.findNearestRoad !== 'function') return null;
  const maxDistance = Number.isFinite(options.maxDistance) ? Math.max(8, options.maxDistance) : 220;
  const nearest = worldSpawnDeps.findNearestRoad(targetX, targetZ, {
    y: Number.isFinite(options.feetY) ? options.feetY + 1.2 : NaN,
    maxVerticalDelta: 18
  });
  const road = nearest?.road;
  if (!road || !worldSpawnDeps.isVehicleRoad(road) || Number(nearest.dist) > maxDistance) return null;
  const point = { x: Number(nearest.pt?.x), z: Number(nearest.pt?.z) };
  if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) return null;
  let nearestPointIndex = 0;
  let nearestPointDistance = Infinity;
  for (let i = 0; i < road.pts.length; i += 1) {
    const distance = Math.hypot(point.x - road.pts[i].x, point.z - road.pts[i].z);
    if (distance < nearestPointDistance) {
      nearestPointDistance = distance;
      nearestPointIndex = i;
    }
  }
  const angle = resolveRoadHeading(road, nearestPointIndex, options.angle);
  const evaluated = evaluateDriveSpawnCandidate(point.x, point.z, {
    angle,
    feetY: options.feetY,
    requireRoad: true,
    source: 'projected_road'
  });
  if (!evaluated.valid) return null;
  const departure = spawnDepartureAssessment(point.x, point.z, angle, 'drive');
  if (!departure.valid) return null;
  if (departure.reverseHeading) evaluated.angle += Math.PI;
  return evaluated;
}

function fallbackResolvedSpawn(mode = "drive", options = {}) {
  const x = finiteNumberOr(options.x, 0);
  const z = finiteNumberOr(options.z, 0);
  const angle = finiteNumberOr(options.angle, 0);
  const direct = mode === "walk"
    ? evaluateWalkSpawnCandidate(x, z, { angle, source: options.source || "verified_fallback" })
    : evaluateDriveSpawnCandidate(x, z, { angle, source: options.source || "verified_fallback" });
  if (direct.valid) return direct;

  const broadGround = searchNearestSafeGroundSpawn(x, z, {
    angle,
    maxRadius: 720,
    step: 12
  });
  if (broadGround) {
    if (mode === "walk") return broadGround;
    return {
      ...broadGround,
      mode: "drive",
      carY: driveCenterYAtWorld(broadGround.x, broadGround.z, !!broadGround.onRoad),
      source: "verified_drive_fallback"
    };
  }
  return { valid: false, mode, x, z, angle, reason: direct.reason || "no_safe_spawn" };
}

function resolveSafeWorldSpawn(targetX, targetZ, options = {}) {
  const mode = options.mode === "walk" ? "walk" : "drive";
  const x = finiteNumberOr(targetX, 0);
  const z = finiteNumberOr(targetZ, 0);
  const angle = finiteNumberOr(options.angle, finiteNumberOr(appCtx.car?.angle, 0));
  const preferRoad = options.preferRoad === true;

  if (mode === "walk") {
    const direct = evaluateWalkSpawnCandidate(x, z, {
      angle,
      feetY: options.feetY,
      preserveElevatedSurface: options.preserveElevatedSurface,
      allowBuildingRoof: options.allowBuildingRoof,
      source: options.source || "direct"
    });
    if (direct.valid && options.preferWalkSurface !== true) return direct;

    if (
      options.preferWalkSurface !== true &&
      (options.preferGroundFallback === true || options.preferRoad !== true)
    ) {
      const nearbyGround = searchNearestSafeGroundSpawn(x, z, {
        angle,
        maxRadius: options.maxGroundRadius,
        maxSlopeDeg: options.maxGroundSlope,
        minLandmarkDistance: options.minLandmarkDistance,
        maxCameraObstruction: options.maxCameraObstruction,
        lookAtX: options.lookAtX,
        lookAtZ: options.lookAtZ,
        source: options.source
      });
      if (nearbyGround) {
        return {
          ...nearbyGround,
          source: options.source === 'featured_landmark_arrival' ?
            'featured_ground_search' :
            'ground_search'
        };
      }
    }

    const surfaceFallback = searchNearestSafeRoadSpawn(x, z, {
      mode: "walk",
      angle,
      maxDistance: options.maxRoadDistance
    });
    if (surfaceFallback) return surfaceFallback;
    if (direct.valid) return direct;

    const groundFallback = searchNearestSafeGroundSpawn(x, z, {
      angle,
      maxRadius: options.maxGroundRadius
    });
    if (groundFallback) return groundFallback;

    return fallbackResolvedSpawn("walk", { x, z, angle, source: "walk_fallback" });
  }

  const direct = evaluateDriveSpawnCandidate(x, z, {
    angle,
    feetY: options.feetY,
    preferredRoad: options.preferredRoad,
    source: options.source || "direct"
  });
  if (direct.valid && (!preferRoad || direct.onRoad)) return direct;

  const projectedRoad = resolveProjectedRoadSpawn(x, z, {
    angle,
    feetY: options.feetY,
    maxDistance: options.maxRoadDistance
  });
  const localGroundFallback = options.fastLocalFallback === true && !projectedRoad ?
    searchNearestSafeDriveGroundSpawn(x, z, {
      angle,
      maxRadius: options.maxGroundRadius
    }) : null;
  const roadFallback = projectedRoad || localGroundFallback || searchNearestSafeRoadSpawn(x, z, {
    mode: "drive",
    angle,
    feetY: options.feetY,
    maxDistance: options.maxRoadDistance
  });
  if (roadFallback) return roadFallback;
  if (direct.valid) return direct;

  const groundFallback = searchNearestSafeGroundSpawn(x, z, {
    angle,
    maxRadius: options.maxGroundRadius
  });
  if (groundFallback) {
    return {
      ...groundFallback,
      mode: "drive",
      carY: driveCenterYAtWorld(groundFallback.x, groundFallback.z, !!groundFallback.onRoad),
      source: "drive_ground_fallback"
    };
  }

  return fallbackResolvedSpawn("drive", { x, z, angle, source: "drive_fallback" });
}

function applyResolvedWorldSpawn(spawn, options = {}) {
  if (!spawn) return null;
  const resolved = spawn.valid === false ? null : spawn;
  if (!resolved) return null;

  const syncCar = options.syncCar !== false;
  const syncWalker = options.syncWalker !== false;

  if (syncCar && appCtx.car) {
    appCtx.car.x = resolved.x;
    appCtx.car.z = resolved.z;
    appCtx.car.angle = finiteNumberOr(resolved.angle, appCtx.car.angle);
    appCtx.car.y = resolved.carY;
    appCtx.car.speed = 0;
    appCtx.car.vx = 0;
    appCtx.car.vz = 0;
    appCtx.car.vy = 0;
    appCtx.car.vFwd = 0;
    appCtx.car.vLat = 0;
    appCtx.car.yawRate = 0;
    appCtx.car.rearSlip = 0;
    appCtx.car._lastSurfaceY = null;
    appCtx.car._terrainAirTimer = 0;
    appCtx.car.isAirborne = false;
    appCtx.car.onRoad = !!resolved.onRoad;
    appCtx.car.road = resolved.road || null;
    if (typeof appCtx.invalidateRoadCache === "function") appCtx.invalidateRoadCache();
    if (appCtx.carMesh) {
      appCtx.carMesh.position.set(resolved.x, resolved.carY, resolved.z);
      appCtx.carMesh.rotation.y = appCtx.car.angle;
      appCtx.carMesh.updateMatrixWorld(true);
    }
  }

  if (syncWalker && appCtx.Walk?.state?.walker) {
    const walker = appCtx.Walk.state.walker;
    walker.x = resolved.x;
    walker.z = resolved.z;
    walker.y = resolved.walkY;
    walker.vy = 0;
    walker.angle = finiteNumberOr(resolved.angle, walker.angle);
    walker.yaw = finiteNumberOr(resolved.angle, walker.yaw);
    walker.speedMph = 0;
    walker.onBuilding = false;
    if (appCtx.Walk.state.characterMesh && appCtx.Walk.state.mode === "walk") {
      appCtx.Walk.state.characterMesh.position.set(resolved.x, resolved.walkY - 1.7, resolved.z);
      appCtx.Walk.state.characterMesh.rotation.y = walker.angle;
    }
  }

  return resolved;
}

function revalidateActiveWorldSpawn(options = {}) {
  const walking = appCtx.Walk?.state?.mode === "walk";
  const actor = walking ? appCtx.Walk?.state?.walker : appCtx.car;
  if (!actor || !Number.isFinite(actor.x) || !Number.isFinite(actor.z)) return null;
  const mode = walking ? "walk" : "drive";
  const direct = mode === "walk"
    ? evaluateWalkSpawnCandidate(actor.x, actor.z, {
      angle: actor.angle,
      source: options.source || "post_load_recheck"
    })
    : evaluateDriveSpawnCandidate(actor.x, actor.z, {
      angle: actor.angle,
      source: options.source || "post_load_recheck"
    });
  if (direct.valid) return direct;
  const resolved = resolveSafeWorldSpawn(actor.x, actor.z, {
    mode,
    angle: actor.angle,
    preferRoad: mode === "drive",
    maxGroundRadius: 360,
    maxRoadDistance: 480,
    source: options.source || "post_load_recovery"
  });
  return applyResolvedWorldSpawn(resolved, { mode });
}

function applySpawnTarget(worldX, worldZ, options = {}) {
  const resolved = resolveSafeWorldSpawn(worldX, worldZ, options);
  return applyResolvedWorldSpawn(resolved, options);
}

function tryAutoEnterBoatAt(worldX, worldZ, options = {}) {
  if (!options?.preferBoatIfWater || typeof appCtx.enterBoatAtWorldPoint !== "function") return null;
  const entryMode = options.mode === "walk" ? "walk" : "drive";
  const inferredWaterKind = inferSelectedLocationWaterKind(appCtx);
  const allowSynthetic = !!(
    options.allowSyntheticWater ||
    (
      inferredWaterKind &&
      appCtx.selLoc === "custom" &&
      (!Array.isArray(appCtx.roads) || appCtx.roads.length === 0) &&
      (!Array.isArray(appCtx.waterAreas) || appCtx.waterAreas.length === 0) &&
      (!Array.isArray(appCtx.waterways) || appCtx.waterways.length === 0)
    )
  );
  const started = appCtx.enterBoatAtWorldPoint(worldX, worldZ, {
    source: options.source || "water_target",
    entryMode,
    emitTutorial: options.emitTutorial !== false,
    maxDistance: Number.isFinite(options.maxWaterDistance) ? options.maxWaterDistance : undefined,
    allowSynthetic,
    waterKind: options.waterKind || inferredWaterKind || "open_ocean"
  });
  if (!started) return null;
  return {
    valid: true,
    mode: "boat",
    x: Number(appCtx.boat?.x || worldX),
    z: Number(appCtx.boat?.z || worldZ),
    y: Number(appCtx.boat?.y || 0),
    angle: Number(appCtx.boat?.angle || 0),
    onRoad: false,
    source: options.source || "water_target"
  };
}

function applyCustomLocationSpawn(mode = "walk", options = {}) {
  const boatSpawn = tryAutoEnterBoatAt(0, 0, {
    ...options,
    mode,
    source: options.source || "custom_location"
  });
  if (boatSpawn) return boatSpawn;
  const preferMappedWalkSurface =
    mode === "walk" &&
    (!Array.isArray(appCtx.roads) || appCtx.roads.length === 0) &&
    worldSpawnDeps.traversableFeaturesForMode("walk").length > 0;
  const arrival = featuredArrivalNear(appCtx.LOC);
  if (arrival) {
    const viewpoint = appCtx.geoToWorld(arrival.viewpoint.lat, arrival.viewpoint.lon);
    const lookAt = appCtx.geoToWorld(arrival.lookAt.lat, arrival.lookAt.lon);
    const angle = Math.atan2(lookAt.x - viewpoint.x, lookAt.z - viewpoint.z);
    const resolved = resolveSafeWorldSpawn(viewpoint.x, viewpoint.z, {
      ...options,
      angle,
      mode,
      preferRoad: false,
      preferGroundFallback: !preferMappedWalkSurface,
      preferWalkSurface: preferMappedWalkSurface,
      maxGroundRadius: 160,
      maxGroundSlope: 18,
      minLandmarkDistance: 35,
      maxCameraObstruction: 1.5,
      lookAtX: lookAt.x,
      lookAtZ: lookAt.z,
      maxRoadDistance: 160,
      source: "featured_landmark_arrival"
    });
    if (resolved) resolved.angle = Math.atan2(lookAt.x - resolved.x, lookAt.z - resolved.z);
    return applyResolvedWorldSpawn(resolved, options);
  }
  const exactRoad = findGradeSeparatedRoadAt(0, 0);
  const structureMode = exactRoad?.road?.structureSemantics?.terrainMode || "at_grade";
  const roadHalfWidth = Math.max(2, Number(exactRoad?.road?.width || 0) * 0.5 + 1);
  const structureFeetY = structureMode !== "at_grade" && exactRoad?.dist <= roadHalfWidth && Number.isFinite(exactRoad?.y) ? exactRoad.y : null;
  return applySpawnTarget(exactRoad?.x || 0, exactRoad?.z || 0, {
    ...options,
    mode,
    feetY: Number.isFinite(structureFeetY) ? structureFeetY : options.feetY,
    preferRoad: mode === "drive" || Number.isFinite(structureFeetY),
    preferWalkSurface: preferMappedWalkSurface
  });
}

function spawnOnRoad(options = {}) {
  const opts = options && typeof options === "object" ? options : {};

  if (!appCtx.roads || appCtx.roads.length === 0) {
    const walkSurfaces = worldSpawnDeps.traversableFeaturesForMode("walk");
    if (Array.isArray(walkSurfaces) && walkSurfaces.length > 0) {
      const mappedWalkSpawn = resolveSafeWorldSpawn(0, 0, {
        mode: "walk",
        preferWalkSurface: true,
        maxRoadDistance: 640,
        source: "sparse_walk_surface"
      });
      if (mappedWalkSpawn?.onWalkSurface) {
        return applyResolvedWorldSpawn(mappedWalkSpawn, { mode: "walk" });
      }
    }
    return applySpawnTarget(0, 0, {
      mode: "drive",
      source: "no_roads_fallback"
    });
  }

  if (opts.random === true) {
    const randomRoad = appCtx.roads[Math.floor(Math.random() * appCtx.roads.length)];
    if (randomRoad?.pts?.length) {
      const point = randomRoad.pts[Math.floor(Math.random() * randomRoad.pts.length)];
      const randomSpawn = searchNearestSafeRoadSpawn(point.x, point.z, {
        mode: "drive",
        angle: appCtx.car?.angle,
        maxDistance: 180
      });
      if (randomSpawn) return applyResolvedWorldSpawn(randomSpawn, { mode: "drive" });
    }
  }

  const originX = finiteNumberOr(opts.x, 0);
  const originZ = finiteNumberOr(opts.z, 0);
  const bestRoadSpawn = resolveSafeWorldSpawn(originX, originZ, {
    mode: "drive",
    angle: appCtx.car?.angle,
    preferRoad: true,
    fastLocalFallback: true,
    maxGroundRadius: 36,
    maxRoadDistance: 320,
    source: "initial_world_spawn"
  });
  if (bestRoadSpawn) return applyResolvedWorldSpawn(bestRoadSpawn, { mode: "drive" });

  return applySpawnTarget(originX, originZ, {
    mode: "drive",
    source: "spawn_on_road_fallback"
  });
}

export {
  applyCustomLocationSpawn,
  applyResolvedWorldSpawn,
  applySpawnTarget,
  initWorldSpawning,
  resolveSafeWorldSpawn,
  revalidateActiveWorldSpawn,
  spawnOnRoad,
  terrainYAtWorld,
  tryAutoEnterBoatAt
};
