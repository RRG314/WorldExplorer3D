import { ctx as appCtx } from "../shared-context.js?v=55";
import { isRoadSurfaceReachable } from "../structure-semantics.js?v=38";

function roadHeadingAtSegment(road, segmentIndex, fallbackAngle = 0) {
  const points = Array.isArray(road?.pts) ? road.pts : [];
  if (points.length < 2) return fallbackAngle;
  const index = Math.max(0, Math.min(points.length - 2, Math.trunc(Number(segmentIndex) || 0)));
  const start = points[index];
  const end = points[index + 1];
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  return Math.hypot(dx, dz) > 1e-6 ? Math.atan2(dx, dz) : fallbackAngle;
}

function createWorldSpawnSurfaceApi(context) {
  const { getDeps } = context;

  function finiteNumberOr(value, fallback = 0) {
    return Number.isFinite(value) ? value : fallback;
  }

  function clamp01(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, value));
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

    const sample = appCtx.SurfaceQuery?.terrainAt?.(x, z)?.position?.y;
    return finiteNumberOr(sample, 0);
  }

  function driveCenterYAtWorld(x, z, preferRoad = false) {
    if (appCtx.onMoon) return terrainYAtWorld(x, z) + 1.2;
    const sample = appCtx.SurfaceQuery?.driveAt?.(x, z, { preferRoad });
    if (Number.isFinite(sample?.position?.y)) return sample.position.y + 1.2;
    return terrainYAtWorld(x, z) + 1.2;
  }

  function walkBaseYAtWorld(x, z) {
    if (appCtx.onMoon) return terrainYAtWorld(x, z);
    const sample = appCtx.SurfaceQuery?.walkAt?.(x, z);
    if (Number.isFinite(sample?.position?.y)) return sample.position.y;
    return terrainYAtWorld(x, z);
  }

  function traversalFeatureKind(feature) {
    return String(feature?.networkKind || feature?.kind || "road").toLowerCase();
  }

  function featureLength(feature) {
    const pts = Array.isArray(feature?.pts) ? feature.pts : [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    }
    return total;
  }

  function spawnRoadPenalty(type) {
    if (!type) return 0;
    if (type.includes("motorway")) return 120;
    if (type.includes("trunk")) return 45;
    if (type.includes("primary")) return 10;
    if (type.includes("secondary")) return 4;
    if (type.includes("living_street")) return 8;
    if (type.includes("service")) return 72;
    if (type.includes("track")) return 110;
    return 0;
  }

  function spawnSurfacePenalty(feature, mode = "drive") {
    if (!feature) return 0;
    const kind = traversalFeatureKind(feature);
    if (kind === "road") {
      let penalty = spawnRoadPenalty(String(feature.type || ""));
      const semantics = feature?.structureSemantics || null;
      const length = featureLength(feature);
      const width = Number(feature?.width || 0);
      if (semantics?.terrainMode === "elevated" || semantics?.terrainMode === "subgrade") penalty += 120;
      else if (semantics?.rampCandidate) penalty += 70;
      if (!String(feature?.name || "").trim()) penalty += mode === "drive" ? 18 : 10;
      if (length > 0 && length < 22) penalty += 70;
      else if (length < 56) penalty += 28;
      if (mode === "drive") {
        if (width > 0 && width < 4.8) penalty += 68;
        else if (width < 5.8) penalty += 26;
        else if (width >= 7.2 && width <= 11.5) penalty -= 10;
      } else {
        if (width > 0 && width < 3.8) penalty += 22;
        else if (width >= 9 && !String(feature?.name || "").trim()) penalty += 8;
      }
      return penalty;
    }
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
      return roadHeadingAtSegment(road, pointIndex, fallbackAngle);
    }
    if (pointIndex > 0) {
      return roadHeadingAtSegment(road, pointIndex - 1, fallbackAngle);
    }
    return fallbackAngle;
  }

  function driveBuildBlockCollision(x, z, carFeetY) {
    if (typeof appCtx.getBuildVehicleContact === "function") {
      const hit = appCtx.getBuildVehicleContact(x, z, x, z, carFeetY, 0);
      return hit?.blocked ? hit : null;
    }
    if (typeof appCtx.getBuildCollisionAtWorldXZ !== "function") return null;
    const samples = [[0, 0], [2.0, 0], [-2.0, 0], [0, 2.0], [0, -2.0]];
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
    const deps = getDeps();
    if (!buildingCheck?.collision || typeof deps.findNearestRoad !== "function") return false;
    const actorBaseY = Number.isFinite(buildingCheck?.actorBaseY) ? buildingCheck.actorBaseY : NaN;
    const nearestRoad = deps.findNearestRoad(x, z, {
      y: Number.isFinite(actorBaseY) ? actorBaseY + 1.2 : NaN,
      maxVerticalDelta: 14
    });
    const road = nearestRoad?.road;
    if (!deps.isVehicleRoad(road)) return false;
    if (!isRoadSurfaceReachable(nearestRoad, { extraVerticalAllowance: 0.4 })) return false;

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
      ((onRoadCenter && isApproxCollider) || (onRoadCore && buildingCheck.inside) || (onRoadCenter && roofLikeCollider));

    return shallowRoadsideCollision || likelyRoadGhostCollision;
  }

  function spawnDepartureAssessment(x, z, angle, mode = "drive") {
    if (typeof appCtx.checkBuildingCollision !== "function") {
      return { valid: true, reverseHeading: false, penalty: 0 };
    }

    const driveMode = mode === "drive";
    const distances = driveMode ? [5, 9, 14] : [3, 6, 10];
    const radius = driveMode ? 2 : 0.8;
    const actorHeight = driveMode ? 1.9 : 1.75;
    const forwardX = Math.sin(angle);
    const forwardZ = Math.cos(angle);

    const blockedSteps = (direction) => {
      let blocked = 0;
      for (let i = 0; i < distances.length; i++) {
        const sampleX = x + forwardX * distances[i] * direction;
        const sampleZ = z + forwardZ * distances[i] * direction;
        const actorBaseY = terrainYAtWorld(sampleX, sampleZ);
        const buildingCheck = appCtx.checkBuildingCollision(sampleX, sampleZ, radius, {
          actorBaseY,
          actorHeight
        });
        const ignoredRoadGhost = driveMode && shouldIgnoreDriveCollision(buildingCheck, sampleX, sampleZ);
        const buildBlock = driveMode
          ? driveBuildBlockCollision(sampleX, sampleZ, actorBaseY)
          : walkBuildBlockCollision(sampleX, sampleZ, actorBaseY);
        if ((buildingCheck?.collision && !ignoredRoadGhost) || buildBlock?.blocked) blocked += 1;
      }
      return blocked;
    };

    const forwardBlocked = blockedSteps(1);
    const reverseBlocked = blockedSteps(-1);
    const forwardClosed = forwardBlocked >= 2;
    const reverseClosed = reverseBlocked >= 2;
    if (forwardClosed && reverseClosed) {
      return { valid: false, reverseHeading: false, penalty: Infinity, forwardBlocked, reverseBlocked };
    }

    return {
      valid: true,
      reverseHeading: forwardClosed && !reverseClosed,
      penalty: Math.min(forwardBlocked, reverseBlocked) * (driveMode ? 18 : 8),
      forwardBlocked,
      reverseBlocked
    };
  }

  function nearestPointOnBounds(x, z, building) {
    const minX = Number(building?.minX);
    const maxX = Number(building?.maxX);
    const minZ = Number(building?.minZ);
    const maxZ = Number(building?.maxZ);
    if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) {
      return null;
    }
    return {
      x: Math.max(minX, Math.min(maxX, x)),
      z: Math.max(minZ, Math.min(maxZ, z)),
      width: Math.max(0, maxX - minX),
      depth: Math.max(0, maxZ - minZ)
    };
  }

  function buildingHeightMeters(building) {
    const minY = Number.isFinite(building?.minY) ? Number(building.minY) : Number(building?.baseY);
    const maxY = Number.isFinite(building?.maxY) ? Number(building.maxY) : NaN;
    if (Number.isFinite(minY) && Number.isFinite(maxY) && maxY >= minY) return maxY - minY;
    return Math.max(0, Number(building?.height) || 0);
  }

  function spawnEnclosurePenalty(x, z, angle, mode = "drive") {
    const buildings = typeof appCtx.getNearbyBuildings === "function"
      ? appCtx.getNearbyBuildings(x, z, 42)
      : Array.isArray(appCtx.buildings)
        ? appCtx.buildings
        : [];
    if (!Array.isArray(buildings) || buildings.length === 0) return 0;

    const forwardX = Math.sin(angle);
    const forwardZ = Math.cos(angle);
    const rightX = Math.cos(angle);
    const rightZ = -Math.sin(angle);
    const scanRadius = mode === "drive" ? 34 : 28;
    const lateralBand = mode === "drive" ? 24 : 18;
    const alongBand = mode === "drive" ? 22 : 16;

    let leftMass = 0;
    let rightMass = 0;
    let forwardMass = 0;
    let nearbyMass = 0;
    let closeCount = 0;

    for (let i = 0; i < buildings.length; i++) {
      const building = buildings[i];
      if (!building || building.collisionDisabled || building.allowsPassageBelow === true) continue;

      const nearest = nearestPointOnBounds(x, z, building);
      if (!nearest) continue;

      const dx = nearest.x - x;
      const dz = nearest.z - z;
      const dist = Math.hypot(dx, dz);
      if (!(dist <= scanRadius)) continue;

      const height = buildingHeightMeters(building);
      const heightFactor = clamp01((height - (mode === "drive" ? 8 : 10)) / (mode === "drive" ? 22 : 26));
      const footprintScale = clamp01((Math.max(nearest.width, nearest.depth) - 8) / 36);
      const closeness = clamp01(1 - dist / scanRadius);
      const lateral = dx * rightX + dz * rightZ;
      const forward = dx * forwardX + dz * forwardZ;
      const lateralFactor = clamp01(1 - Math.max(0, Math.abs(lateral) - 2.5) / lateralBand);
      const forwardFactor = clamp01(1 - Math.abs(forward) / alongBand);
      const mass = closeness * (0.6 + heightFactor * 1.15 + footprintScale * 0.45);

      nearbyMass += mass;
      if (dist <= (mode === "drive" ? 20 : 16)) closeCount += 1;

      if (forwardFactor > 0 && lateralFactor > 0) {
        const sideMass = mass * forwardFactor * lateralFactor;
        if (lateral <= -2.5) leftMass += sideMass;
        else if (lateral >= 2.5) rightMass += sideMass;
      }

      if (Math.abs(lateral) <= lateralBand * 0.72) {
        forwardMass += mass * clamp01(1 - Math.max(0, forward) / alongBand);
      }
    }

    const canyonMass = Math.min(leftMass, rightMass);
    const corridorMass = leftMass + rightMass;
    const densityPenalty = Math.max(0, closeCount - (mode === "drive" ? 3 : 4)) * (mode === "drive" ? 7 : 4);
    const openRoadBonus = corridorMass < 0.75 && nearbyMass < 1.35 ? (mode === "drive" ? -10 : -5) : 0;
    const penalty =
      canyonMass * (mode === "drive" ? 34 : 18) +
      Math.max(0, corridorMass - 2.25) * (mode === "drive" ? 10 : 5) +
      Math.max(0, forwardMass - 1.35) * (mode === "drive" ? 8 : 4) +
      Math.max(0, nearbyMass - 3.6) * (mode === "drive" ? 5 : 2.5) +
      densityPenalty +
      openRoadBonus;

    return Math.max(openRoadBonus, penalty);
  }

  return {
    driveBuildBlockCollision,
    driveCenterYAtWorld,
    finiteNumberOr,
    resolveRoadHeading,
    shouldIgnoreDriveCollision,
    spawnDepartureAssessment,
    slopeDegreesAt,
    slopePenaltyAt,
    spawnEnclosurePenalty,
    spawnSurfacePenalty,
    terrainYAtWorld,
    walkBaseYAtWorld,
    walkBuildBlockCollision
  };
}

export { createWorldSpawnSurfaceApi, roadHeadingAtSegment };
