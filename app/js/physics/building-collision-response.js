function stopVehicle(car) {
  car.speed = 0;
  car.vFwd = 0;
  car.vLat = 0;
  car.vx = 0;
  car.vz = 0;
}

function slowVehicle(car, factor) {
  car.speed *= factor;
  car.vFwd *= factor;
  car.vLat *= factor;
  car.vx *= factor;
  car.vz *= factor;
}

// The rendered car body is 1.8 m wide and 3.5 m long. Model it as a capsule
// instead of the former 2 m-radius circle, which made a visually fitting car
// behave as if it were more than 4 m wide on narrow mapped bridges.
export const VEHICLE_COLLISION_PROFILE = Object.freeze({
  radius: 0.92,
  centerlineHalfLength: 0.84
});

function isRoadGhostCollision(buildingCheck, nearestRoad) {
  const roadDist = Number.isFinite(nearestRoad?.dist)
    ? nearestRoad.dist
    : Infinity;
  const roadHalfWidth = nearestRoad?.road?.width
    ? nearestRoad.road.width * 0.5
    : 0;
  const onRoadCenter =
    roadHalfWidth > 0 &&
    roadDist <= Math.max(2.2, roadHalfWidth - 0.35);
  const onRoadCore =
    roadHalfWidth > 0 &&
    roadDist <= Math.max(1.6, roadHalfWidth - 0.95);
  const building = buildingCheck?.building || {};
  const colliderDetail = building.colliderDetail === 'bbox' ? 'bbox' : 'full';
  const buildingType = String(building.buildingType || '').toLowerCase();
  const partKind = String(building.buildingPartKind || '').toLowerCase();
  const roofLikeCollider =
    buildingType === 'roof' ||
    buildingType === 'canopy' ||
    buildingType === 'carport' ||
    partKind === 'roof' ||
    partKind === 'balcony' ||
    partKind === 'canopy' ||
    building.collisionKind === 'thin_part' ||
    building.allowsPassageBelow === true;
  const neighboringTunnelShellOnRoadCore =
    onRoadCore &&
    building.geometrySource === 'compiled_transport_structures';
  const shallowRoadsideCollision =
    !!buildingCheck?.collision &&
    onRoadCenter &&
    (colliderDetail !== 'full' || roofLikeCollider) &&
    !buildingCheck.inside &&
    Number.isFinite(buildingCheck.penetration) &&
    buildingCheck.penetration < 1.25;
  const likelyRoadGhostCollision =
    !!buildingCheck?.collision &&
    (
      (onRoadCenter && colliderDetail !== 'full') ||
      (onRoadCore && buildingCheck.inside && colliderDetail !== 'full') ||
      (onRoadCenter && roofLikeCollider) ||
      neighboringTunnelShellOnRoadCore
    );
  return shallowRoadsideCollision || likelyRoadGhostCollision;
}

export function isVehicleBuildingCollisionBlocking(
  buildingCheck,
  nearestRoad
) {
  return (
    buildingCheck?.collision === true &&
    !isRoadGhostCollision(buildingCheck, nearestRoad)
  );
}

function queryVehicleBuildingCollision(appCtx, checkBuildingCollision, x, z, carFeetY) {
  const angle = Number(appCtx.car?.angle) || 0;
  const forwardX = Math.sin(angle);
  const forwardZ = Math.cos(angle);
  const nearestRoad = typeof appCtx.findNearestRoad === 'function'
    ? appCtx.findNearestRoad(x, z, {
        y: Number.isFinite(carFeetY) ? carFeetY + 1.2 : NaN,
        maxVerticalDelta: 18,
        preferredRoad: appCtx.car?.road || null
      })
    : null;
  for (const longitudinalOffset of [
    VEHICLE_COLLISION_PROFILE.centerlineHalfLength,
    0,
    -VEHICLE_COLLISION_PROFILE.centerlineHalfLength
  ]) {
    const probeX = x + forwardX * longitudinalOffset;
    const probeZ = z + forwardZ * longitudinalOffset;
    const buildingCheck = checkBuildingCollision(
      probeX,
      probeZ,
      VEHICLE_COLLISION_PROFILE.radius,
      {
        actorBaseY: carFeetY,
        actorHeight: 1.9,
        acceptCollision: (collision) =>
          isVehicleBuildingCollisionBlocking(collision, nearestRoad)
      }
    );
    if (buildingCheck?.collision) {
      return { buildingCheck, nearestRoad, longitudinalOffset };
    }
  }
  return null;
}

export function findSweptVehicleBuildingCollision(
  appCtx,
  checkBuildingCollision,
  startX,
  startZ,
  endX,
  endZ,
  carFeetY
) {
  const dx = endX - startX;
  const dz = endZ - startZ;
  const distance = Math.hypot(dx, dz);
  // Sampling below the collider radius prevents a fast vehicle from crossing
  // an entire narrow wall between two physics positions.
  const steps = Math.max(1, Math.ceil(distance / 0.75));
  let lastSafeX = startX;
  let lastSafeZ = startZ;
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    const x = startX + dx * t;
    const z = startZ + dz * t;
    const collision = queryVehicleBuildingCollision(
      appCtx,
      checkBuildingCollision,
      x,
      z,
      carFeetY
    );
    if (collision) {
      return {
        ...collision,
        x,
        z,
        t,
        lastSafeX,
        lastSafeZ
      };
    }
    lastSafeX = x;
    lastSafeZ = z;
  }
  return null;
}

export function resolveVehicleBuildingCollision(
  appCtx,
  checkBuildingCollision,
  nextX,
  nextZ
) {
  const carFeetY = Number.isFinite(appCtx.car.y)
    ? appCtx.car.y - 1.2
    : NaN;
  const sweptCollision = findSweptVehicleBuildingCollision(
    appCtx,
    checkBuildingCollision,
    appCtx.car.x,
    appCtx.car.z,
    nextX,
    nextZ,
    carFeetY
  );
  if (!sweptCollision) {
    return { x: nextX, z: nextZ };
  }
  const { buildingCheck } = sweptCollision;

  if (buildingCheck.inside) {
    if (buildingCheck.nearestPoint) {
      const pushDistance = 3;
      stopVehicle(appCtx.car);
      return {
        x: buildingCheck.nearestPoint.x + buildingCheck.pushX * pushDistance,
        z: buildingCheck.nearestPoint.z + buildingCheck.pushZ * pushDistance
      };
    }
    slowVehicle(appCtx.car, 0.1);
    return { x: appCtx.car.x, z: appCtx.car.z };
  }

  const pushDistance = buildingCheck.penetration + 1;
  const pushedX = sweptCollision.x + buildingCheck.pushX * pushDistance;
  const pushedZ = sweptCollision.z + buildingCheck.pushZ * pushDistance;
  const hitAngle = Math.atan2(appCtx.car.vz, appCtx.car.vx);
  const wallAngle = Math.atan2(buildingCheck.pushZ, buildingCheck.pushX);
  let angleDifference = Math.abs(hitAngle - wallAngle);
  if (angleDifference > Math.PI) {
    angleDifference = 2 * Math.PI - angleDifference;
  }
  const headOnFactor = Math.abs(Math.cos(angleDifference));
  slowVehicle(appCtx.car, 0.1 + (1 - headOnFactor) * 0.3);
  const pushedPastSafePoint =
    Math.hypot(pushedX - sweptCollision.lastSafeX, pushedZ - sweptCollision.lastSafeZ) > 3.5;
  return pushedPastSafePoint
    ? { x: sweptCollision.lastSafeX, z: sweptCollision.lastSafeZ }
    : { x: pushedX, z: pushedZ };
}
