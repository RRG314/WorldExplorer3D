import {PLANETARY_ROVER_CONFIG} from './physics/vehicle-config.js';
import { resolvePlanetaryVehicleObstacle } from './physics/planetary-obstacle-response.js';
import {updateVehicleWheels} from './transport/vehicle-wheel-motion.js';
import { shouldRefreshRoadQuery } from './physics/road-query-policy.js';
import { ctx as appCtx } from "./shared-context.js?v=55";
import { constrainTunnelActorCeiling } from './world/compiler/tunnel-space-query.js';
import { isRoadSurfaceReachable } from "./structure-semantics.js?v=63";
import { updateDrone } from "./physics/drone-flight.js?v=11";
import { updatePlane } from "./plane-mode.js?v=37";
import {
  createEarthVehicleGroundContactSampler,
  stabilizeEarthVehicleSurfaceY,
  updateVehicleSurface
} from "./physics/vehicle-surface.js?v=6";
import { createBuildingCollisionQuery } from "./physics/building-collision.js?v=5";
import { resolveVehicleBuildingCollision } from "./physics/building-collision-response.js?v=8";
import { getEarthTransportControllerSnapshot, updateAlternateTravelMode } from "./physics/mode-dispatch.js?v=5";
import { updatePlanetaryVehicleHeight } from "./physics/planetary-vehicle.js?v=3";
import {prepareVehicleDriveFrame,stepVehiclePlanarDrive,integrateVehiclePlanarPosition} from "./physics/vehicle-planar-dynamics.js";
import {
  carSpeedToMph,
  carSpeedToWorldUnitsPerSecond,
  mphToCarSpeed
} from "./physics/vehicle-speed-units.js?v=2";
import { vehicleConditionDynamics, vehicleHandlingProfile } from "./engine/vehicle-catalog.js?v=6";
import { applyTransportDamage } from './transport/damage-model.js?v=1';
import { updateRoadVehicleVerticalState } from './physics/road-vehicle-airborne.js?v=1';
import { ensureVehicleUpgradeStore, vehicleUpgradeDynamics } from './transport/vehicle-upgrades.js?v=1';
import { samplePhysicalEnvironment } from './planetary/runtime/physical-environment.js?v=2';
import { groundVehicleTuning } from './character/vehicle-assistance.js?v=1';
let _cachedNearRoad = null;

const earthVehicleGroundContactSampler = createEarthVehicleGroundContactSampler(appCtx);

// Invalidate road cache - must be called on road reload, mode change, teleport
function invalidateRoadCache() {
  _cachedNearRoad = null;
  earthVehicleGroundContactSampler.reset();
}

// Reusable raycaster and vectors (avoid GC pressure from per-frame allocations)
let _physRaycaster = null;
const _physRayStart = typeof THREE !== 'undefined' ? new THREE.Vector3() : null;
const _physRayDir = typeof THREE !== 'undefined' ? new THREE.Vector3(0, -1, 0) : null;

function isPlanetarySurface() { return !!(appCtx.onMoon || appCtx.onMars || appCtx.activePlanetaryBodyId); }

function getPlanetarySurfaceMesh() {
  if (appCtx.activePlanetaryBodyId && appCtx.activeSolidWorldSurface) return appCtx.activeSolidWorldSurface;
  if (appCtx.onMars && appCtx.marsSurface) return appCtx.marsSurface;
  if (appCtx.onMoon && appCtx.moonSurface) return appCtx.moonSurface;
  return null;
}

function getPlanetaryGravity() {
  const bodyId = appCtx.activePlanetaryBodyId || (appCtx.onMars ? 'mars' : appCtx.onMoon ? 'moon' : 'earth');
  if (appCtx.activePlanetaryEnvironment?.bodyId === bodyId && Number.isFinite(Number(appCtx.activePlanetaryEnvironment.gravityMagnitudeMps2))) {
    return -Number(appCtx.activePlanetaryEnvironment.gravityMagnitudeMps2);
  }
  return -samplePhysicalEnvironment(bodyId, {
    heightM: 0,
    timestampS: Number(appCtx.astronomicalSkyState?.timestampMs || Date.now()) / 1000
  }).gravityMagnitudeMps2;
}
function _getPhysRaycaster() {
  if (!_physRaycaster && typeof THREE !== 'undefined') {
    _physRaycaster = new THREE.Raycaster();
  }
  return _physRaycaster;
}

// Throttled nearest-road helper (single place to control road querying)
function getNearestRoadThrottled(x, z, forceCheck = false, currentY = NaN) {
  // If roads aren't available, return a safe null shape
  if (!appCtx.roads || appCtx.roads.length === 0 || typeof appCtx.findNearestRoad !== 'function') {
    return { road: null, dist: Infinity, pt: { x, z } };
  }

  const queryTime = performance.now();
  const queryRevision = appCtx._groundSurfaceRevision || 0;
  const shouldCheck = shouldRefreshRoadQuery(_cachedNearRoad, {
    x, z, y: currentY, now: queryTime, revision: queryRevision, force: forceCheck
  });
  let nr;
  if (shouldCheck) {
    nr = appCtx.findNearestRoad(x, z, {
      y: Number.isFinite(currentY) ? currentY : NaN,
      maxVerticalDelta: 18,
      preferredRoad: appCtx.car?.road || null
    });
    // Normalize cache shape so later code can treat it consistently
    _cachedNearRoad = {
      road: nr.road || null,
      dist: typeof nr.dist === 'number' ? nr.dist : Infinity,
      pt: nr.pt ? { x: nr.pt.x, z: nr.pt.z } : { x, z },
      y: Number.isFinite(nr?.y) ? nr.y : NaN,
      verticalDelta: Number.isFinite(nr?.verticalDelta) ? nr.verticalDelta : Infinity,
      distanceAlong: Number.isFinite(nr?.distanceAlong) ? nr.distanceAlong : NaN,
      distanceToEndpoint: Number.isFinite(nr?.distanceToEndpoint) ? nr.distanceToEndpoint : Infinity,
      distanceToTransitionZone: Number.isFinite(nr?.distanceToTransitionZone) ? nr.distanceToTransitionZone : Infinity,
      queryX: x,
      queryZ: z,
      queryY: currentY,
      queryTime,
      queryRevision
    };
  } else {
    nr = _cachedNearRoad;
  }

  // Guarantee pt exists
  if (!nr.pt) nr.pt = { x, z };
  return nr;
}

const checkBuildingCollision = createBuildingCollisionQuery(appCtx);

function update(dt) {
  if (appCtx.paused || !appCtx.gameStarted) {
    if (!appCtx.boatMode?.active && typeof appCtx.updateInteriorInteraction === 'function') appCtx.updateInteriorInteraction();
    return;
  }
  if (dt > 1 / 30) {
    const steps = Math.ceil(dt / (1 / 45));
    for (let i = 0; i < steps; i += 1) update(dt / steps);
    return;
  }
  if (typeof appCtx.updateFlowerChallenge === 'function') appCtx.updateFlowerChallenge(dt);

  if (updateAlternateTravelMode(appCtx, dt, { isPlanetarySurface, updateDrone, updatePlane })) return;

  const liveGpsSnapshot = appCtx.getLiveGpsSnapshot?.() || null;
  const liveGpsOwnsDrive = !isPlanetarySurface() && liveGpsSnapshot?.active === true &&
    liveGpsSnapshot?.following === true && liveGpsSnapshot?.travelMode === 'drive' &&
    appCtx.liveGpsTranslationOwned?.() === true;
  const liveGpsDriveTarget = liveGpsOwnsDrive
    ? appCtx.resolveLiveGpsWalkerTarget?.(dt, { x: appCtx.car.x, z: appCtx.car.z }) || null
    : null;

  appCtx.updateInteriorInteraction?.();

  const actions = appCtx.readControlActions?.('drive') || {};
  const driveFrame=prepareVehicleDriveFrame(appCtx.car,actions,dt,appCtx.CFG);

  const vehicleHandling = vehicleHandlingProfile(appCtx.car.vehicleVariantId || 'sedan', {
    serviceType: appCtx.car.vehicleServiceType || ''
  });
  const vehicleCondition = vehicleConditionDynamics(appCtx.car.condition ?? 1);
  const vehicleUpgradeStore = ensureVehicleUpgradeStore(appCtx);
  const vehicleUpgradeState = vehicleUpgradeStore.snapshot(appCtx.car);
  const vehicleUpgrades = vehicleUpgradeDynamics(vehicleUpgradeState.levels);
  const characterVehicle = groundVehicleTuning(appCtx.resolveCharacterCapability?.('ground-vehicle', {
    vehicleAvailable: true,
    environment: appCtx.getEnv?.() || (isPlanetarySurface() ? 'PLANETARY' : 'EARTH')
  }));
  appCtx.car.handlingProfile = vehicleHandling;
  appCtx.car.characterHandling = characterVehicle;
  appCtx.car.upgradeState = vehicleUpgradeState;
  let maxSpd, friction, accel;
  const planetaryBodyId = appCtx.activePlanetaryBodyId || (appCtx.onMars ? 'mars' : appCtx.onMoon ? 'moon' : null);
  const planetaryDriveProfile = {
    moon: { normal: 24, boost: 29, accel: 0.82, boostAccel: 0.76 },
    mars: { normal: 18, boost: 22, accel: 0.72, boostAccel: 0.66 },
    mercury: { normal: 20, boost: 24, accel: 0.74, boostAccel: 0.68 },
    venus: { normal: 10, boost: 12, accel: 0.55, boostAccel: 0.5 },
    io: { normal: 14, boost: 17, accel: 0.62, boostAccel: 0.56 },
    europa: { normal: 12, boost: 15, accel: 0.5, boostAccel: 0.46 },
    titan: { normal: 16, boost: 19, accel: 0.64, boostAccel: 0.58 },
    enceladus: { normal: 9, boost: 12, accel: 0.42, boostAccel: 0.38 },
    triton: { normal: 12, boost: 15, accel: 0.5, boostAccel: 0.45 },
    ceres: { normal: 10, boost: 13, accel: 0.46, boostAccel: 0.41 },
    vesta: { normal: 9, boost: 12, accel: 0.44, boostAccel: 0.39 },
    pluto: { normal: 11, boost: 14, accel: 0.48, boostAccel: 0.43 }
  }[planetaryBodyId] || { normal: 18, boost: 22, accel: 0.7, boostAccel: 0.64 };
  let planetaryNormalMaxSpd = planetaryDriveProfile.normal;

  // We'll keep a single road query result for this frame (and optional precision check later)
  let nr = null;

  if (isPlanetarySurface()) {
    appCtx.car.onRoad = false;
    appCtx.car.road = null;

    const planetaryBaseAccel = PLANETARY_ROVER_CONFIG.accel * planetaryDriveProfile.accel;
    const planetaryBoostAccel = PLANETARY_ROVER_CONFIG.boostAccel * planetaryDriveProfile.boostAccel;

    maxSpd = appCtx.car.boost ? planetaryDriveProfile.boost : planetaryDriveProfile.normal;
    planetaryNormalMaxSpd = planetaryDriveProfile.normal;
    friction = appCtx.CFG.friction; // same as Earth road
    accel = appCtx.car.boost ? planetaryBoostAccel : planetaryBaseAccel;
  } else {
    const forceCheck = !_cachedNearRoad;

    nr = getNearestRoadThrottled(
      appCtx.car.x,
      appCtx.car.z,
      forceCheck,
      Number.isFinite(appCtx.car.y) ? appCtx.car.y - 1.2 : NaN
    );

    appCtx.car.onRoad = isRoadSurfaceReachable(nr, {
      currentRoad: appCtx.car.road || null,
      extraVerticalAllowance: 0.7
    });
    if (appCtx.car.onRoad) {
      appCtx.car.road = nr.road;
      appCtx.car._roadContinuityTimer = 0.7;
    } else {
      // Keep only the identity of the last reachable deck briefly. This lets
      // the next connected OSM way inherit bridge/ramp continuity after one
      // imperfect endpoint sample without treating the stale road as ground.
      appCtx.car._roadContinuityTimer = Math.max(0, appCtx.car._roadContinuityTimer - dt);
      if (appCtx.car._roadContinuityTimer <= 0) appCtx.car.road = null;
    }

    const vehicleMaxSpd = mphToCarSpeed(vehicleHandling.topSpeedMph);
    maxSpd = Math.min(vehicleMaxSpd, appCtx.car.boost ? appCtx.CFG.boostMax : appCtx.CFG.maxSpd);
    friction = appCtx.CFG.friction;
    accel = (appCtx.car.boost ? appCtx.CFG.boostAccel : appCtx.CFG.accel) * vehicleHandling.accelerationScale;
  }

  const surfaceDynamics = updateVehicleSurface(appCtx, dt);
  const collisionStartYaw=appCtx.car.angle;
  const {wheelBase,steerAngle,isDrifting,spdAbs}=stepVehiclePlanarDrive(appCtx.car,dt,driveFrame,{
    config:appCtx.CFG,planetary:isPlanetarySurface(),metersPerWorldUnit:appCtx.METERS_PER_WORLD_UNIT,
    surfaceDynamics,vehicleHandling,vehicleCondition,vehicleUpgrades,characterVehicle,
    maxSpd,friction,accel,planetaryNormalMaxSpd});

  if (liveGpsDriveTarget && Number.isFinite(liveGpsDriveTarget.headingDegrees)) {
    appCtx.car.angle = Math.PI - liveGpsDriveTarget.headingDegrees * Math.PI / 180;
  }
  let {x:nx,z:nz}=integrateVehiclePlanarPosition(appCtx.car,dt,{wheelBase,isDrifting,spdAbs},appCtx.METERS_PER_WORLD_UNIT,isPlanetarySurface());
  if (liveGpsDriveTarget) {
    nx = liveGpsDriveTarget.x;
    nz = liveGpsDriveTarget.z;
  }

  if (isPlanetarySurface()) {
    const resolved = resolvePlanetaryVehicleObstacle(appCtx.car, {x:nx,z:nz}, planetaryBodyId);
    nx=resolved.x;nz=resolved.z;
    if(resolved.collision) {
      appCtx.car.vx=0;appCtx.car.vz=0;appCtx.car.vFwd=0;appCtx.car.vLat=0;appCtx.car.speed=0;
    }
  }

  // Building collisions remain enforced without a second terrain-handling mode.

  if (!isPlanetarySurface()) {
    const resolved = resolveVehicleBuildingCollision(
      appCtx,
      checkBuildingCollision,
      nx,
      nz
    );
    nx = resolved.x;
    nz = resolved.z;
    if (typeof appCtx.resolveUrbanActorCollision === 'function') {
      const actorCollision = appCtx.resolveUrbanActorCollision(
        { x: appCtx.car.x, z: appCtx.car.z },
        { x: nx, z: nz },
        {
          mode: 'drive',
          actorBaseY: appCtx.car.y-1.2,
          actorHeight: vehicleHandling.height || 1.8,
          fromYaw: collisionStartYaw,
          yaw: appCtx.car.angle,
          radius: (vehicleHandling.width || 1.84)*.5,
          speedMph: carSpeedToMph(appCtx.car.speed),
          velocityX: appCtx.car.vx,
          velocityZ: appCtx.car.vz
        }
      );
      nx = actorCollision.x;
      nz = actorCollision.z;
      if(Number.isFinite(actorCollision.yaw))appCtx.car.angle=actorCollision.yaw;
      if (actorCollision.collision && !actorCollision.responseApplied) {
        appCtx.car.speed *= .18;
        appCtx.car.vFwd *= .18;
        appCtx.car.vLat *= .12;
      }
    }
  }

  if (typeof appCtx.getBuildVehicleContact === 'function') {
    const carFeetY = (Number.isFinite(appCtx.car.y) ? appCtx.car.y : 1.2) - 1.2;
    const heading = appCtx.car.angle || 0;
    const contact = appCtx.getBuildVehicleContact(
      appCtx.car.x,
      appCtx.car.z,
      nx,
      nz,
      carFeetY,
      heading
    );

    if (contact?.blocked) {
      nx = appCtx.car.x;
      nz = appCtx.car.z;
      appCtx.car.speed *= 0.08;
      appCtx.car.vFwd *= 0.08;
      appCtx.car.vLat *= 0.08;
      appCtx.car.vx *= 0.08;
      appCtx.car.vz *= 0.08;
    }
  }

  appCtx.car.x = nx;
  appCtx.car.z = nz;
  if (liveGpsDriveTarget) {
    const gpsMph = Math.max(0, Number(liveGpsDriveTarget.speedMps || 0) * 2.236936);
    appCtx.car.speed = mphToCarSpeed(gpsMph);
    appCtx.car.vFwd = appCtx.car.speed;
    appCtx.car.vLat = 0;
    appCtx.car.rearSlip = 0;
    appCtx.car.isDrifting = false;
  }

  let carY = 1.2;
  const previousCarBodyY = appCtx.car.y;

  const planetarySurface = getPlanetarySurfaceMesh();
  if (planetarySurface) {
    carY = updatePlanetaryVehicleHeight(appCtx, dt, {
      planetarySurface,
      getPlanetaryGravity,
      getRaycaster: _getPhysRaycaster,
      rayStart: _physRayStart,
      rayDir: _physRayDir
    });
  } else if (appCtx.terrainEnabled) {
    const currentY = Number.isFinite(appCtx.car.y) ? appCtx.car.y - 1.2 : NaN;
    const groundContact = earthVehicleGroundContactSampler.sample({
      x: appCtx.car.x,
      z: appCtx.car.z,
      angle: appCtx.car.angle,
      currentY,
      ...(vehicleHandling.assetId?{halfWheelBase:vehicleHandling.wheelBase*.5,halfTrack:vehicleHandling.halfTrack}:{}),
      preferRoad: !!appCtx.car.onRoad,
      nearestRoad: appCtx.car.onRoad ? nr : null
    }, dt, Number.isFinite(appCtx.lastTime) ? appCtx.lastTime : undefined);
    appCtx.car.groundContact = groundContact;
    let rawSurfaceY = Number(groundContact?.supportY);
    if (!Number.isFinite(rawSurfaceY)) rawSurfaceY = Number(appCtx.car._lastRawSurfaceY || 0);
    let surfaceY = stabilizeEarthVehicleSurfaceY(
      rawSurfaceY,
      appCtx.car._lastSurfaceY,
      dt,
      appCtx.car.speed
    );

    if (typeof appCtx.getBuildVehicleSurfaceAtWorldXZ === 'function') {
      const carFeetY = Number.isFinite(appCtx.car.y) ? appCtx.car.y - 1.2 : surfaceY;
      const buildSurfaceY = appCtx.getBuildVehicleSurfaceAtWorldXZ(appCtx.car.x, appCtx.car.z, carFeetY);
      if (Number.isFinite(buildSurfaceY)) {
        rawSurfaceY = Math.max(rawSurfaceY, buildSurfaceY);
        surfaceY = Math.max(surfaceY, buildSurfaceY);
      }
    }

    const previousRawSurfaceY = appCtx.car._lastRawSurfaceY;
    appCtx.car._lastSurfaceY = surfaceY;
    appCtx.car._lastRawSurfaceY = rawSurfaceY;
    const targetY = surfaceY + 1.21;
    const speedAbs = Math.abs(appCtx.car.speed || 0);
    if (appCtx.car.y === undefined || appCtx.car.y === 0) {
      carY = targetY;
    } else {
      const diff = targetY - appCtx.car.y;
      if (diff > 20 || Math.abs(diff) < 0.01) {
        carY = targetY;
      } else {
        const baseLerp = 16;
        const speedBoost = Math.min(8, speedAbs * 0.08);
        const lerpRate = Math.min(1.0, dt * (baseLerp + speedBoost));
        const smoothedY = appCtx.car.y + diff * lerpRate;
        const maximumDownwardStep = Math.max(0.35, dt * (8 + speedAbs * 0.45));
        carY = Math.max(smoothedY, appCtx.car.y - maximumDownwardStep);
      }
    }
    // Suspension smoothing may ease a downward change, but it must never lag
    // behind a rising selected surface far enough to bury the chassis.
    if (Number.isFinite(targetY) && carY < targetY) {
      carY = targetY;
    }
    const verticalState = updateRoadVehicleVerticalState({
      bodyY: appCtx.car.y,
      groundedBodyY: carY,
      supportY: rawSurfaceY,
      previousSupportY: previousRawSurfaceY,
      verticalVelocity: appCtx.car.vy,
      isAirborne: appCtx.car.isAirborne,
      airborneTime: appCtx.car._terrainAirTimer,
      surfacePitch: Number(groundContact?.pitch || 0),
      previousPitch: Number(appCtx.car.terrainPitch || 0),
      horizontalSpeedMps: Math.hypot(appCtx.car.vx || 0, appCtx.car.vz || 0) * appCtx.METERS_PER_WORLD_UNIT,
      metersPerWorldUnit: appCtx.METERS_PER_WORLD_UNIT,
      suspensionResistance: vehicleUpgrades.suspensionResistance,
      dt
    });
    carY = verticalState.y;
    appCtx.car.y = carY;
    appCtx.car.vy = verticalState.verticalVelocity;
    appCtx.car.isAirborne = verticalState.isAirborne;
    appCtx.car._terrainAirTimer = verticalState.airborneTime;
    appCtx.car.lastAirborneReason = verticalState.launchReason || appCtx.car.lastAirborneReason || '';
    if (verticalState.landed && verticalState.landingDamageForce > 0) {
      const damage = applyTransportDamage(appCtx.car, verticalState.landingDamageForce);
      appCtx.car.lastLanding = Object.freeze({
        impactMps: verticalState.landingImpactMps,
        damage: damage.delta,
        condition: damage.after,
        at: Date.now()
      });
      if (damage.delta > 0) {
        appCtx.showToast?.(`Hard landing · vehicle health ${Math.round(damage.after * 100)}%`);
      }
    }
    const attitudeBlend = 1 - Math.exp(-dt * 10);
    appCtx.car.terrainPitch = Number(appCtx.car.terrainPitch || 0) +
      (Number(verticalState.pitch || 0) - Number(appCtx.car.terrainPitch || 0)) * attitudeBlend;
    appCtx.car.terrainRoll = Number(appCtx.car.terrainRoll || 0) +
      (Number(groundContact?.roll || 0) - Number(appCtx.car.terrainRoll || 0)) * attitudeBlend;
  }

  if (!isPlanetarySurface()) {
    const ceiling = constrainTunnelActorCeiling(appCtx.car.road,
      { x: appCtx.car.x, y: previousCarBodyY, z: appCtx.car.z }, carY, 0.75);
    if (ceiling.collided) {
      carY = ceiling.y;
      appCtx.car.y = carY;
      appCtx.car.vy = Math.min(0, Number(appCtx.car.vy) || 0);
    }
  }
  appCtx.carMesh.position.set(appCtx.car.x, carY, appCtx.car.z);
  appCtx.carMesh.rotation.order = 'YXZ';
  appCtx.carMesh.rotation.set(
    isPlanetarySurface() ? 0 : Number(appCtx.car.terrainPitch || 0),
    appCtx.car.angle,
    isPlanetarySurface() ? 0 : Number(appCtx.car.terrainRoll || 0)
  );

  const wheelSpeed = isPlanetarySurface()
    ? appCtx.car.speed
    : carSpeedToWorldUnitsPerSecond(appCtx.car.speed, appCtx.METERS_PER_WORLD_UNIT);
  const wheelRot = wheelSpeed * dt * 0.5;
  appCtx.wheelMeshes.forEach((w) => { if (!w.userData?.radiusMeters) w.rotation.x += wheelRot; });
  updateVehicleWheels(appCtx.wheelMeshes, wheelSpeed * dt, steerAngle);

  appCtx.updateTrack();
  appCtx.updatePolice(dt);
  appCtx.updateMode(dt);
  appCtx.updateNearbyPOI();
  appCtx.updateNavigationRoute();

}

Object.assign(appCtx, {
  _getPhysRaycaster,
  _physRayDir,
  _physRayStart,
  checkBuildingCollision,
  getNearestRoadThrottled,
  getEarthTransportControllerSnapshot: () => getEarthTransportControllerSnapshot(appCtx, { isPlanetarySurface, updateDrone, updatePlane }),
  invalidateRoadCache,
  update,
  updateDrone
});

export {
  _getPhysRaycaster,
  _physRayDir,
  _physRayStart,
  checkBuildingCollision,
  getNearestRoadThrottled,
  invalidateRoadCache,
  update,
  updateDrone };
