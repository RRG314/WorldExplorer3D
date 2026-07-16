export function updatePlanetaryVehicleHeight(appCtx, dt, options = {}) {
  const { planetarySurface, getPlanetaryGravity, getRaycaster, rayStart, rayDir } = options;
  let carY = Number.isFinite(appCtx.car?.y) ? appCtx.car.y : 1.2;

  planetarySurface.updateMatrixWorld(true);
  const raycaster = getRaycaster();
  const sampleMoonSurfaceY = (sx, sz) => {
    rayStart.set(sx, 1200, sz);
    raycaster.set(rayStart, rayDir || new THREE.Vector3(0, -1, 0));
    const sampleHits = raycaster.intersectObject(planetarySurface, false);
    return sampleHits.length > 0 ? sampleHits[0].point.y + 1.2 : null;
  };

  const targetY = sampleMoonSurfaceY(appCtx.car.x, appCtx.car.z);

  if (targetY !== null) {
    const speedAbs = Math.abs(appCtx.car.speed || 0);
    const smoothedTargetY = Number.isFinite(appCtx.car._lastSurfaceY) ?
    appCtx.car._lastSurfaceY * 0.35 + targetY * 0.65 :
    targetY;
    const prevSurfaceY = Number.isFinite(appCtx.car._lastSurfaceY) ? appCtx.car._lastSurfaceY : smoothedTargetY;
    const surfaceDelta = smoothedTargetY - prevSurfaceY;
    const surfaceVel = dt > 1e-4 ? surfaceDelta / dt : 0;
    const currentY = Number.isFinite(appCtx.car.y) ? appCtx.car.y : smoothedTargetY;
    const clearanceAboveGround = currentY - smoothedTargetY;

    // Detect crest/drop transitions ahead of the car so launches work with keyboard or touch.
    const fwdStep = Math.min(12, Math.max(3, speedAbs * 0.14 + 2.5));
    const dirX = Math.sin(appCtx.car.angle || 0);
    const dirZ = Math.cos(appCtx.car.angle || 0);
    const aheadY = sampleMoonSurfaceY(appCtx.car.x + dirX * fwdStep, appCtx.car.z + dirZ * fwdStep);
    const forwardSlope = aheadY === null ? 0 : (aheadY - smoothedTargetY) / fwdStep;
    const dropAhead = aheadY === null ? 0 : smoothedTargetY - aheadY;

    const alreadyAirborne = !!appCtx.car.isAirborne;
    const crestLaunch =
    speedAbs > 11 &&
    surfaceVel > 0.9 &&
    forwardSlope < -0.08;
    const craterDropLaunch =
    speedAbs > 10 &&
    dropAhead > 0.9;
    const separationLaunch = clearanceAboveGround > 0.85 && speedAbs > 8;

    if (!alreadyAirborne && (crestLaunch || craterDropLaunch || separationLaunch)) {
    const launchFromRise = Math.max(0, surfaceVel * 0.16);
    const launchFromSpeed = Math.max(0, (speedAbs - 8) * 0.03);
    appCtx.car.vy = Math.max(appCtx.car.vy, launchFromRise + launchFromSpeed);
    appCtx.car.isAirborne = true;
    appCtx.car._terrainAirTimer = 0;
    }

    if (appCtx.car.isAirborne) {
    appCtx.car._terrainAirTimer += dt;
    appCtx.car.vy += getPlanetaryGravity() * dt;
    appCtx.car.y = currentY + appCtx.car.vy * dt;

    const canLand = appCtx.car._terrainAirTimer > 0.02;
    if (canLand && appCtx.car.y <= smoothedTargetY) {
      appCtx.car.y = smoothedTargetY;
      appCtx.car.vy = 0;
      appCtx.car.isAirborne = false;
      appCtx.car._terrainAirTimer = 0;
    }
    carY = appCtx.car.y;
    } else {
    const diff = smoothedTargetY - currentY;
    if (Math.abs(diff) > 20 || Math.abs(diff) < 0.005) {
      carY = smoothedTargetY;
    } else {
      const baseLerp = 18;
      const speedBoost = Math.min(12, speedAbs * 0.09);
      const lerpRate = Math.min(1.0, dt * (baseLerp + speedBoost));
      carY = currentY + diff * lerpRate;
    }
    if (Math.abs(carY - smoothedTargetY) < 0.04) carY = smoothedTargetY;
    appCtx.car.y = carY;
    appCtx.car.vy = 0;
    appCtx.car.isAirborne = false;
    appCtx.car._terrainAirTimer = 0;
    }

    appCtx.car._lastSurfaceY = smoothedTargetY;
  } else {
    appCtx.car.isAirborne = false;
    appCtx.car._terrainAirTimer = 0;
    appCtx.car._lastSurfaceY = null;
    if (!Number.isFinite(appCtx.car.y)) appCtx.car.y = (planetarySurface.position?.y || -100) + 1.2;
    carY = appCtx.car.y;
  }

  return carY;
}
