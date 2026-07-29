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
  const shallowRoadsideCollision =
    !!buildingCheck?.collision &&
    onRoadCenter &&
    !buildingCheck.inside &&
    Number.isFinite(buildingCheck.penetration) &&
    buildingCheck.penetration < 1.25;
  const likelyRoadGhostCollision =
    !!buildingCheck?.collision &&
    (
      (onRoadCenter && colliderDetail !== 'full') ||
      (onRoadCore && buildingCheck.inside) ||
      (onRoadCenter && roofLikeCollider)
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

export function resolveVehicleBuildingCollision(
  appCtx,
  checkBuildingCollision,
  nextX,
  nextZ
) {
  const carFeetY = Number.isFinite(appCtx.car.y)
    ? appCtx.car.y - 1.2
    : NaN;
  const buildingCheck = checkBuildingCollision(nextX, nextZ, 2.0, {
    actorBaseY: carFeetY,
    actorHeight: 1.9
  });
  const nearestRoad = typeof appCtx.findNearestRoad === 'function'
    ? appCtx.findNearestRoad(nextX, nextZ, {
        y: Number.isFinite(carFeetY) ? carFeetY + 1.2 : NaN,
        maxVerticalDelta: 18,
        preferredRoad: appCtx.car?.road || null
      })
    : null;

  if (!isVehicleBuildingCollisionBlocking(buildingCheck, nearestRoad)) {
    return { x: nextX, z: nextZ };
  }

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
  const pushedX = nextX + buildingCheck.pushX * pushDistance;
  const pushedZ = nextZ + buildingCheck.pushZ * pushDistance;
  const hitAngle = Math.atan2(appCtx.car.vz, appCtx.car.vx);
  const wallAngle = Math.atan2(buildingCheck.pushZ, buildingCheck.pushX);
  let angleDifference = Math.abs(hitAngle - wallAngle);
  if (angleDifference > Math.PI) {
    angleDifference = 2 * Math.PI - angleDifference;
  }
  const headOnFactor = Math.abs(Math.cos(angleDifference));
  slowVehicle(appCtx.car, 0.1 + (1 - headOnFactor) * 0.3);
  return { x: pushedX, z: pushedZ };
}
