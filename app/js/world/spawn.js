import { ctx as appCtx } from "../shared-context.js?v=55";
import { isRoadSurfaceReachable } from "../structure-semantics.js?v=9";

let worldSpawnDeps = {
  buildingContainingPoint: () => null,
  findNearestRoad: () => null,
  isInsideWaterArea: () => false,
  isVehicleRoad: () => false,
  traversableFeaturesForMode: () => []
};

function initWorldSpawning(deps = {}) {
  worldSpawnDeps = {
    ...worldSpawnDeps,
    ...deps
  };
  return worldSpawnDeps;
}

function finiteNumberOr(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function terrainYAtWorld(x, z) {
  if (appCtx.onMoon && appCtx.moonSurface) {
    appCtx.moonSurface.updateMatrixWorld(true);
    const raycaster = typeof appCtx._getPhysRaycaster === "function" ? appCtx._getPhysRaycaster() : null;
    if (raycaster && appCtx._physRayStart && appCtx._physRayDir) {
      appCtx._physRayStart.set(x, 1200, z);
      raycaster.set(appCtx._physRayStart, appCtx._physRayDir);
      const hits = raycaster.intersectObject(appCtx.moonSurface, false);
      if (hits.length > 0 && Number.isFinite(hits[0]?.point?.y)) return hits[0].point.y;
    }
  }

  const sample = typeof appCtx.terrainMeshHeightAt === "function" ?
    appCtx.terrainMeshHeightAt(x, z) :
    typeof appCtx.elevationWorldYAtWorldXZ === "function" ?
      appCtx.elevationWorldYAtWorldXZ(x, z) :
      0;
  return finiteNumberOr(sample, 0);
}

function driveCenterYAtWorld(x, z, preferRoad = false) {
  if (appCtx.onMoon) return terrainYAtWorld(x, z) + 1.2;
  if (typeof appCtx.GroundHeight !== "undefined" &&
      appCtx.GroundHeight &&
      typeof appCtx.GroundHeight.carCenterY === "function") {
    return finiteNumberOr(appCtx.GroundHeight.carCenterY(x, z, preferRoad, 1.2), terrainYAtWorld(x, z) + 1.2);
  }
  return terrainYAtWorld(x, z) + 1.2;
}

function walkBaseYAtWorld(x, z) {
  if (appCtx.onMoon) return terrainYAtWorld(x, z);
  if (typeof appCtx.GroundHeight !== "undefined" &&
      appCtx.GroundHeight &&
      typeof appCtx.GroundHeight.walkSurfaceY === "function") {
    return finiteNumberOr(appCtx.GroundHeight.walkSurfaceY(x, z), terrainYAtWorld(x, z));
  }
  return terrainYAtWorld(x, z);
}

function traversalFeatureKind(feature) {
  return String(feature?.networkKind || feature?.kind || "road").toLowerCase();
}

function spawnRoadPenalty(type) {
  if (!type) return 0;
  if (type.includes("motorway") || type.includes("trunk")) return 120;
  if (type.includes("primary")) return 40;
  if (type.includes("secondary")) return 20;
  if (type.includes("service")) return 12;
  return 0;
}

function spawnSurfacePenalty(feature, mode = "drive") {
  if (!feature) return 0;
  const kind = traversalFeatureKind(feature);
  if (kind === "road") return spawnRoadPenalty(String(feature.type || ""));
  if (mode === "walk") {
    if (kind === "footway") return 0;
    if (kind === "cycleway") return 4;
    if (kind === "railway") return 16;
  }
  return 10;
}

function slopePenaltyAt(x, z) {
  const step = 8;
  const hL = terrainYAtWorld(x - step, z);
  const hR = terrainYAtWorld(x + step, z);
  const hU = terrainYAtWorld(x, z - step);
  const hD = terrainYAtWorld(x, z + step);
  const slopeX = (hR - hL) / (step * 2);
  const slopeZ = (hD - hU) / (step * 2);
  const gradient = Math.hypot(slopeX, slopeZ);
  const slopeDeg = Math.atan(gradient) * 180 / Math.PI;
  if (!Number.isFinite(slopeDeg)) return 0;
  if (slopeDeg <= 16) return 0;
  if (slopeDeg >= 55) return 1800;
  return (slopeDeg - 16) * 42;
}

function slopeDegreesAt(x, z) {
  const step = 6;
  const hL = terrainYAtWorld(x - step, z);
  const hR = terrainYAtWorld(x + step, z);
  const hU = terrainYAtWorld(x, z - step);
  const hD = terrainYAtWorld(x, z + step);
  const slopeX = (hR - hL) / (step * 2);
  const slopeZ = (hD - hU) / (step * 2);
  const gradient = Math.hypot(slopeX, slopeZ);
  return Number.isFinite(gradient) ? Math.atan(gradient) * 180 / Math.PI : 0;
}

function resolveRoadHeading(road, pointIndex, fallbackAngle = 0) {
  if (!road || !Array.isArray(road.pts) || road.pts.length < 2) return fallbackAngle;
  if (pointIndex < road.pts.length - 1) {
    return Math.atan2(road.pts[pointIndex + 1].x - road.pts[pointIndex].x, road.pts[pointIndex + 1].z - road.pts[pointIndex].z);
  }
  if (pointIndex > 0) {
    return Math.atan2(road.pts[pointIndex].x - road.pts[pointIndex - 1].x, road.pts[pointIndex].z - road.pts[pointIndex - 1].z);
  }
  return fallbackAngle;
}

function driveBuildBlockCollision(x, z, carFeetY) {
  if (typeof appCtx.getBuildCollisionAtWorldXZ !== "function") return null;
  const samples = [
    [0, 0],
    [2.0, 0],
    [-2.0, 0],
    [0, 2.0],
    [0, -2.0]
  ];
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const hit = appCtx.getBuildCollisionAtWorldXZ(x + sample[0], z + sample[1], carFeetY, 0.12);
    if (hit && hit.blocked) return hit;
  }
  return null;
}

function walkBuildBlockCollision(x, z, terrainY) {
  if (typeof appCtx.getBuildCollisionAtWorldXZ !== "function") return null;
  return appCtx.getBuildCollisionAtWorldXZ(x, z, terrainY, 0.65, 1.7 * 0.95);
}

function shouldIgnoreDriveCollision(buildingCheck, x, z) {
  if (!buildingCheck?.collision || typeof worldSpawnDeps.findNearestRoad !== "function") return false;
  const actorBaseY = Number.isFinite(buildingCheck?.actorBaseY) ? buildingCheck.actorBaseY : NaN;
  const nearestRoad = worldSpawnDeps.findNearestRoad(x, z, {
    y: Number.isFinite(actorBaseY) ? actorBaseY + 1.2 : NaN,
    maxVerticalDelta: 14
  });
  const road = nearestRoad?.road;
  if (!worldSpawnDeps.isVehicleRoad(road)) return false;
  if (!isRoadSurfaceReachable(nearestRoad, {
    extraVerticalAllowance: 0.4
  })) return false;

  const roadHalfWidth = Number.isFinite(road?.width) ? road.width * 0.5 : 0;
  const onRoadCenter = nearestRoad.dist <= Math.max(2.2, roadHalfWidth - 0.35);
  const onRoadCore = nearestRoad.dist <= Math.max(1.6, roadHalfWidth - 0.95);
  const colliderDetail = buildingCheck?.building?.colliderDetail === "bbox" ? "bbox" : "full";
  const buildingType = String(buildingCheck?.building?.buildingType || "").toLowerCase();
  const isApproxCollider = colliderDetail !== "full";
  const partKind = String(buildingCheck?.building?.buildingPartKind || "").toLowerCase();
  const roofLikeCollider =
    buildingType === "roof" ||
    buildingType === "canopy" ||
    buildingType === "carport" ||
    partKind === "roof" ||
    partKind === "balcony" ||
    partKind === "canopy" ||
    buildingCheck?.building?.collisionKind === "thin_part" ||
    buildingCheck?.building?.allowsPassageBelow === true;
  const shallowRoadsideCollision = !!buildingCheck.collision &&
    onRoadCenter &&
    !buildingCheck.inside &&
    Number.isFinite(buildingCheck.penetration) &&
    buildingCheck.penetration < 1.25;
  const likelyRoadGhostCollision = !!buildingCheck.collision &&
    ((onRoadCenter && isApproxCollider) ||
      (onRoadCore && buildingCheck.inside) ||
      (onRoadCenter && roofLikeCollider));

  return shallowRoadsideCollision || likelyRoadGhostCollision;
}

function evaluateWalkSpawnCandidate(x, z, options = {}) {
  const angle = finiteNumberOr(options.angle, finiteNumberOr(appCtx.car?.angle, 0));
  const terrainY = terrainYAtWorld(x, z);
  const walkBaseY = walkBaseYAtWorld(x, z);
  if (!Number.isFinite(terrainY)) return { valid: false, reason: "terrain_missing" };
  const actorFeetY = Number.isFinite(options.feetY) ? options.feetY : walkBaseY;
  const nearestRoad = typeof worldSpawnDeps.findNearestRoad === "function" ? worldSpawnDeps.findNearestRoad(x, z, {
    y: actorFeetY + 1.2,
    maxVerticalDelta: 12
  }) : null;
  const onRoadSurface = isRoadSurfaceReachable(nearestRoad, {
    extraLateralPadding: 0.25
  });
  if (worldSpawnDeps.isInsideWaterArea(x, z) && !onRoadSurface) {
    return { valid: false, reason: "inside_water", terrainY };
  }
  if (worldSpawnDeps.buildingContainingPoint(x, z, 4, {
    y: actorFeetY,
    actorHeight: 1.9,
    tolerance: 0.45
  })) return { valid: false, reason: "inside_building", terrainY };
  if (walkBuildBlockCollision(x, z, terrainY)?.blocked) return { valid: false, reason: "build_block", terrainY };

  const slopeDeg = slopeDegreesAt(x, z);
  if (slopeDeg > 40) return { valid: false, reason: "slope_too_steep", terrainY, slopeDeg };

  return {
    valid: true,
    mode: "walk",
    x,
    z,
    angle,
    road: null,
    onRoad: false,
    terrainY,
    walkY: walkBaseY + 1.7,
    carY: driveCenterYAtWorld(x, z, false),
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
  const nearestRoad = typeof worldSpawnDeps.findNearestRoad === "function" ? worldSpawnDeps.findNearestRoad(x, z, {
    y: actorFeetY + 1.2,
    maxVerticalDelta: 18
  }) : null;
  const road = worldSpawnDeps.isVehicleRoad(nearestRoad?.road) ? nearestRoad.road : null;
  const onRoad = isRoadSurfaceReachable(nearestRoad, {
    extraVerticalAllowance: 0.5
  }) && !!road;
  if (worldSpawnDeps.isInsideWaterArea(x, z) && !onRoad) {
    return { valid: false, reason: "inside_water", terrainY, onRoad, road };
  }

  if (Number.isFinite(desiredFeetY) && desiredFeetY > terrainY + 2.8 && !onRoad) {
    return { valid: false, reason: "elevated_surface", terrainY, onRoad, road };
  }
  if (driveBuildBlockCollision(x, z, actorFeetY)) {
    return { valid: false, reason: "build_block", terrainY, onRoad, road };
  }

  const buildingCheck = typeof appCtx.checkBuildingCollision === "function" ?
    appCtx.checkBuildingCollision(x, z, 2.0, {
      actorBaseY: actorFeetY,
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
    walkY: terrainY + 1.7,
    carY: Number.isFinite(nearestRoad?.y) ? nearestRoad.y + 1.2 : driveCenterYAtWorld(x, z, !!road),
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

function searchNearestSafeRoadSpawn(targetX, targetZ, options = {}) {
  const requestedMode = options.mode === "walk" ? "walk" : "drive";
  const traversableFeatures = worldSpawnDeps.traversableFeaturesForMode(requestedMode);
  if (!Array.isArray(traversableFeatures) || traversableFeatures.length === 0) return null;
  const maxDistance = Number.isFinite(options.maxDistance) ? Math.max(32, options.maxDistance) : 220;
  const limits = [maxDistance, Infinity];

  for (let pass = 0; pass < limits.length; pass++) {
    const limit = limits[pass];
    let best = null;

    for (let r = 0; r < traversableFeatures.length; r++) {
      const feature = traversableFeatures[r];
      if (!Array.isArray(feature?.pts) || feature.pts.length < 2) continue;
      for (let i = 0; i < feature.pts.length; i++) {
        const basePoint = feature.pts[i];
        const candidates = [{ x: basePoint.x, z: basePoint.z, idx: i }];
        if (i < feature.pts.length - 1 && (i % 2 === 0 || feature.pts.length <= 12)) {
          const next = feature.pts[i + 1];
          candidates.push({
            x: (basePoint.x + next.x) * 0.5,
            z: (basePoint.z + next.z) * 0.5,
            idx: i
          });
        }

        for (let c = 0; c < candidates.length; c++) {
          const candidate = candidates[c];
          const dist = Math.hypot(candidate.x - targetX, candidate.z - targetZ);
          if (dist > limit) continue;

          const angle = resolveRoadHeading(feature, candidate.idx, options.angle);
          const evaluated = requestedMode === "drive" ?
            evaluateDriveSpawnCandidate(candidate.x, candidate.z, {
              angle,
              feetY: options.feetY,
              requireRoad: true,
              source: "road_search"
            }) :
            evaluateWalkSpawnCandidate(candidate.x, candidate.z, {
              angle,
              source: "walk_surface_search"
            });
          if (!evaluated.valid) continue;

          const score = dist + spawnSurfacePenalty(feature, requestedMode) + slopePenaltyAt(candidate.x, candidate.z);
          if (!best || score < best.score) {
            const nextResult = { ...evaluated, score };
            if (requestedMode === "walk" && worldSpawnDeps.isVehicleRoad(feature)) {
              nextResult.road = feature;
              nextResult.onRoad = true;
            }
            best = nextResult;
          }
        }
      }
    }

    if (best) return best;
  }

  return null;
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

function resolveSafeWorldSpawn(targetX, targetZ, options = {}) {
  const mode = options.mode === "walk" ? "walk" : "drive";
  const x = finiteNumberOr(targetX, 0);
  const z = finiteNumberOr(targetZ, 0);
  const angle = finiteNumberOr(options.angle, finiteNumberOr(appCtx.car?.angle, 0));

  if (mode === "walk") {
    const direct = evaluateWalkSpawnCandidate(x, z, {
      angle,
      source: options.source || "direct"
    });
    if (direct.valid) return direct;

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
    source: options.source || "direct"
  });
  if (direct.valid) return direct;

  const roadFallback = searchNearestSafeRoadSpawn(x, z, {
    mode: "drive",
    angle,
    feetY: options.feetY,
    maxDistance: options.maxRoadDistance
  });
  if (roadFallback) return roadFallback;

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

function applySpawnTarget(worldX, worldZ, options = {}) {
  const resolved = resolveSafeWorldSpawn(worldX, worldZ, options);
  return applyResolvedWorldSpawn(resolved, options);
}

function tryAutoEnterBoatAt(worldX, worldZ, options = {}) {
  if (!options?.preferBoatIfWater || typeof appCtx.enterBoatAtWorldPoint !== "function") return null;
  const entryMode = options.mode === "walk" ? "walk" : "drive";
  const allowSynthetic = !!(
    options.allowSyntheticWater ||
    (
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
    waterKind: options.waterKind || "open_ocean"
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
  return applySpawnTarget(0, 0, {
    ...options,
    mode
  });
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
