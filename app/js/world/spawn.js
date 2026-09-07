import { ctx as appCtx } from "../shared-context.js?v=55";
import { featuredArrivalNear } from "./featured-arrivals.js?v=3";
import { isRoadSurfaceReachable } from "../structure-semantics.js?v=63";
import { createWorldSpawnSurfaceApi, roadHeadingAtSegment } from "./spawn-surface.js?v=14";
import { findGradeSeparatedRoad } from "./spawn-structure-search.js?v=2";
import { resolveCustomLocationArrival } from './spawn-location-arrival.js?v=6';

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
  finiteNumberOr,
  resolveRoadHeading,
  shouldIgnoreDriveCollision,
  spawnDepartureAssessment,
  spawnEnclosurePenalty,
  slopeDegreesAt,
  slopePenaltyAt,
  spawnSurfacePenalty,
  terrainYAtWorld,
  walkBaseYAtWorld,
  walkBuildBlockCollision
} = createWorldSpawnSurfaceApi({
  getDeps: () => worldSpawnDeps
});
function evaluateWalkSpawnCandidate(x, z, options = {}) {
  const angle = finiteNumberOr(options.angle, finiteNumberOr(appCtx.car?.angle, 0));
  const terrainY = terrainYAtWorld(x, z);
  const walkBaseY = walkBaseYAtWorld(x, z);
  if (!Number.isFinite(terrainY)) return { valid: false, reason: "terrain_missing" };
  const hasExplicitFeetY = Number.isFinite(options.feetY);
  const actorFeetY = hasExplicitFeetY ? options.feetY : walkBaseY;
  const collisionBaseY = hasExplicitFeetY ? actorFeetY : terrainY;
  const nearestRoad = !options.skipRoadQuery && typeof worldSpawnDeps.findNearestRoad === "function" ? worldSpawnDeps.findNearestRoad(x, z, {
    y: actorFeetY + 1.2,
    maxVerticalDelta: 12,
    preferredRoad: options.preferredRoad || null
  }) : null;
  const onRoadSurface = isRoadSurfaceReachable(nearestRoad, {
    extraLateralPadding: 0.25,
    currentRoad: options.preferredRoad || null
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
  const buildingCheck = !standingOnRoof && typeof appCtx.checkBuildingCollision === "function" ?
    appCtx.checkBuildingCollision(x, z, 1.5, {
      actorBaseY: collisionBaseY,
      actorHeight: 1.9
    }) :
    { collision: false };
  if (buildingCheck?.collision) {
    return { valid: false, reason: "building_clearance", terrainY, buildingCheck };
  }
  if (options.preserveElevatedSurface === true && hasExplicitFeetY && actorFeetY > surfaceY + 1) {
    surfaceY = actorFeetY;
  }
  if (walkBuildBlockCollision(x, z, terrainY)?.blocked) return { valid: false, reason: "build_block", terrainY };

  const slopeDeg = slopeDegreesAt(x, z);
  if (slopeDeg > 40) return { valid: false, reason: "slope_too_steep", terrainY, slopeDeg };

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
    extraVerticalAllowance: 0.5,
    currentRoad: options.preferredRoad || null
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

function searchNearestSafeGroundSpawn(targetX, targetZ, options = {}) {
  const maxRadius = Number.isFinite(options.maxRadius) ? Math.max(4, options.maxRadius) : 72;
  const step = Number.isFinite(options.step) ? Math.max(2, options.step) : 6;
  let best = null;

  for (let radius = step; radius <= maxRadius; radius += step) {
    const steps = Math.max(8, Math.round(radius * 1.6));
    for (let i = 0; i < steps; i++) {
      const theta = i / steps * Math.PI * 2;
      const x = targetX + Math.cos(theta) * radius;
      const z = targetZ + Math.sin(theta) * radius;
      const evaluated = evaluateWalkSpawnCandidate(x, z, {
        angle: options.angle,
        source: "ground_search"
      });
      if (!evaluated.valid) continue;
      const score = radius + evaluated.slopeDeg * 0.6;
      if (!best || score < best.score) best = { ...evaluated, score };
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
  const result = findGradeSeparatedRoad(appCtx.roads, worldSpawnDeps.sampleFeatureSurfaceY, x, z);
  appCtx._lastCustomStructureProbe = result.diagnostic;
  return result.best;
}

function terrainCorridorAssessment(x, z, angle) {
  const baseY = terrainYAtWorld(x, z);
  if (!Number.isFinite(baseY) || !Number.isFinite(angle)) {
    return { penalty: 0, reverseHeading: false, maxDelta: 0 };
  }

  const forwardX = Math.sin(angle);
  const forwardZ = Math.cos(angle);
  const distances = [8, 16, 28, 40];
  const directionDelta = (direction) => {
    let maxDelta = 0;
    for (const distance of distances) {
      const sampleY = terrainYAtWorld(
        x + forwardX * distance * direction,
        z + forwardZ * distance * direction
      );
      if (Number.isFinite(sampleY)) maxDelta = Math.max(maxDelta, Math.abs(sampleY - baseY));
    }
    return maxDelta;
  };

  const forwardDelta = directionDelta(1);
  const reverseDelta = directionDelta(-1);
  const reverseHeading = reverseDelta + 0.75 < forwardDelta;
  const maxDelta = reverseHeading ? reverseDelta : forwardDelta;
  return {
    penalty: Math.max(0, maxDelta - 2) * 18 + maxDelta * 1.5,
    reverseHeading,
    maxDelta
  };
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

    const pushCandidate = (evaluated, feature, baseScore, spawnMeta = {}) => {
      const nextResult = {
        ...evaluated,
        ...spawnMeta,
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
      if (feature?.structureSemantics?.terrainMode === "subgrade") continue;
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
          const evaluated = requestedMode === "drive" ?
            evaluateDriveSpawnCandidate(candidate.x, candidate.z, {
              angle,
              feetY: options.feetY,
              requireRoad: true,
              source: "road_search"
            }) :
            evaluateWalkSpawnCandidate(candidate.x, candidate.z, {
              angle,
              feetY: options.feetY,
              source: "walk_surface_search"
            });
          if (!evaluated.valid) continue;

          const terrainCorridor = terrainCorridorAssessment(
            candidate.x,
            candidate.z,
            evaluated.angle
          );
          if (terrainCorridor.reverseHeading) evaluated.angle += Math.PI;

          const departure = spawnDepartureAssessment(
            candidate.x,
            candidate.z,
            evaluated.angle,
            requestedMode
          );
          if (!departure.valid) continue;
          if (departure.reverseHeading) evaluated.angle += Math.PI;

          const endpointPenalty =
            endpointClearance >= 22 ? 0 :
            endpointConnected ? (22 - endpointClearance) * 0.45 :
            45 + (22 - endpointClearance) * 4;
          const spawnSlopePenalty = Math.max(
            0,
            (Number(evaluated.slopeDeg) || 0) - (requestedMode === "drive" ? 8 : 12)
          ) * (requestedMode === "drive" ? 4.5 : 2.6);
          const score =
            dist +
            spawnSurfacePenalty(feature, requestedMode) +
            slopePenaltyAt(candidate.x, candidate.z) +
            spawnSlopePenalty +
            endpointPenalty +
            terrainCorridor.penalty +
            departure.penalty;
          pushCandidate(evaluated, feature, score, {
            featureEndpointClearance: endpointClearance,
            endpointConnected,
            terrainCorridorMaxDelta: terrainCorridor.maxDelta,
            departureClearance: {
              forwardBlocked: departure.forwardBlocked,
              reverseBlocked: departure.reverseBlocked,
              reversed: departure.reverseHeading
            }
          });
        }
        distanceBeforeSegment += segmentLengths[i] || 0;
      }
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
    maxVerticalDelta: 18,
    preferredRoad: options.preferredRoad || null
  });
  const road = nearest?.road;
  if (!road || !worldSpawnDeps.isVehicleRoad(road) || Number(nearest.dist) > maxDistance) return null;
  if (road?.structureSemantics?.terrainMode === "subgrade") return null;
  const point = { x: Number(nearest.pt?.x), z: Number(nearest.pt?.z) };
  if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) return null;
  const angle = roadHeadingAtSegment(road, nearest.segIndex, options.angle);
  const evaluated = evaluateDriveSpawnCandidate(point.x, point.z, {
    angle,
    feetY: options.feetY,
    preferredRoad: options.preferredRoad || null,
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
  const terrainY = terrainYAtWorld(x, z);
  return {
    valid: true,
    mode: mode === "walk" ? "walk" : "drive",
    x,
    z,
    angle: finiteNumberOr(options.angle, 0),
    road: null,
    onRoad: false,
    terrainY,
    walkY: walkBaseYAtWorld(x, z) + 1.7,
    carY: driveCenterYAtWorld(x, z, false),
    slopeDeg: slopeDegreesAt(x, z),
    source: options.source || "fallback_origin"
  };
}

function isSubgradeArrival(spawn) { return spawn?.road?.structureSemantics?.terrainMode === "subgrade"; }
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
      preferredRoad: options.preferredRoad || null,
      allowBuildingRoof: options.allowBuildingRoof,
      source: options.source || "direct"
    });
    if (direct.valid && !isSubgradeArrival(direct)) return direct;

    const surfaceFallback = searchNearestSafeRoadSpawn(x, z, {
      mode: "walk",
      angle,
      maxDistance: options.maxRoadDistance
    });
    if (surfaceFallback) return surfaceFallback;

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
    preferredRoad: options.preferredRoad || null,
    source: options.source || "direct"
  });
  if (direct.valid && !isSubgradeArrival(direct) && (!preferRoad || direct.onRoad)) return direct;

  const projectedRoad = resolveProjectedRoadSpawn(x, z, {
    angle,
    feetY: options.feetY,
    preferredRoad: options.preferredRoad || null,
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
  if (roadFallback && !isSubgradeArrival(roadFallback)) return roadFallback;
  if (direct.valid && !isSubgradeArrival(direct)) return direct;

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
  const resolved = spawn.valid === false ?
    fallbackResolvedSpawn(options.mode || spawn.mode || "drive", {
      x: spawn.x,
      z: spawn.z,
      angle: spawn.angle,
      source: "invalid_spawn_fallback"
    }) :
    spawn;

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
    appCtx.car.groundContact = null;
    appCtx.car.isAirborne = false;
    appCtx.car.onRoad = !!resolved.onRoad;
    appCtx.car.road = resolved.road || null;
    if (typeof appCtx.invalidateRoadCache === "function") appCtx.invalidateRoadCache();
    // GroundHeight keeps its own walking-road cache. A world load first places
    // the shared actors on a generic road and can then resolve a custom arrival
    // on a different vertical layer (for example, the Jones Falls Expressway).
    // Keeping the earlier cached feature makes the first walking physics frame
    // sample the lower road/terrain and drop the actor through the bridge deck.
    // Invalidate the surface selector at the same authoritative handoff where
    // car.road changes so every consumer starts from the resolved feature.
    appCtx.GroundHeight?.invalidate?.();
    if (appCtx.carMesh) {
      appCtx.carMesh.position.set(resolved.x, resolved.carY, resolved.z);
      appCtx.carMesh.rotation.y = appCtx.car.angle;
      appCtx.carMesh.updateMatrixWorld(true);
    }
  }

  if (syncWalker && appCtx.Walk?.state?.walker) {
    const walker = appCtx.Walk.state.walker;
    walker._resolvedGroundState = null;
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

function applySpawnTarget(worldX, worldZ, options = {}) {
  const resolved = resolveSafeWorldSpawn(worldX, worldZ, options);
  return applyResolvedWorldSpawn(resolved, options);
}

function tryAutoEnterBoatAt(worldX, worldZ, options = {}) {
  if (!options?.preferBoatIfWater || typeof appCtx.enterBoatAtWorldPoint !== "function") return null;
  const surfaceDomain = appCtx.worldLoadRuntimeState?.surfaceDomain || null;
  if (surfaceDomain?.kind === 'cryosphere') return null;
  const entryMode = options.mode === "walk" ? "walk" : "drive";
  const allowSynthetic = options.allowSyntheticWater === true || surfaceDomain?.kind === 'ocean';
  const started = appCtx.enterBoatAtWorldPoint(worldX, worldZ, {
    source: options.source || "water_target",
    entryMode,
    emitTutorial: options.emitTutorial !== false,
    maxDistance: Number.isFinite(options.maxWaterDistance) ? options.maxWaterDistance : undefined,
    allowSynthetic,
    waterKind: options.waterKind || surfaceDomain?.subtype || "open_ocean"
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
  return resolveCustomLocationArrival({
    appCtx,
    applyResolvedWorldSpawn,
    applySpawnTarget,
    featuredArrivalNear,
    findGradeSeparatedRoadAt,
    isSubgradeArrival,
    resolveSafeWorldSpawn,
    searchNearestSafeRoadSpawn,
    tryAutoEnterBoatAt
  }, mode, options);
}

function spawnOnRoad(options = {}) {
  const opts = options && typeof options === "object" ? options : {};

  if (!appCtx.roads || appCtx.roads.length === 0) {
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
  const bestRoadSpawn = searchNearestSafeRoadSpawn(originX, originZ, {
    mode: "drive",
    angle: appCtx.car?.angle,
    maxDistance: 320
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
  spawnOnRoad,
  terrainYAtWorld,
  tryAutoEnterBoatAt
};
