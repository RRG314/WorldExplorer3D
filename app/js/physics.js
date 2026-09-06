import { ctx as appCtx } from "./shared-context.js?v=55";
import { isRoadSurfaceReachable } from "./structure-semantics.js?v=63";
import { updateDrone } from "./physics/drone-flight.js?v=10";
import { updatePlane } from "./plane-mode.js?v=36";
import {
  createEarthVehicleGroundContactSampler,
  stabilizeEarthVehicleSurfaceY,
  updateVehicleSurface
} from "./physics/vehicle-surface.js?v=6";
import { createBuildingCollisionQuery } from "./physics/building-collision.js?v=4";
import { resolveVehicleBuildingCollision } from "./physics/building-collision-response.js?v=8";
import { getEarthTransportControllerSnapshot, updateAlternateTravelMode } from "./physics/mode-dispatch.js?v=4";
import { updatePlanetaryVehicleHeight } from "./physics/planetary-vehicle.js?v=3";
import {
  arcadeSteeringYawTarget,
  earthDrivingSteeringProfile,
  resolveCarDriveCommand
} from "./controls/traversal-control-policy.js?v=8";
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
// RDT-based adaptive throttling state
// At high complexity, skip findNearestRoad on some frames (reuse cached result)
let _rdtPhysFrame = 0;
let _rdtRoadSkipInterval = 2; // 2 = every other rendered frame, etc.
let _cachedNearRoad = null;
let _rdtLastFrameToken;

const earthVehicleGroundContactSampler = createEarthVehicleGroundContactSampler(appCtx);

// Invalidate road cache - must be called on road reload, mode change, teleport
function invalidateRoadCache() {
  _cachedNearRoad = null;
  _rdtPhysFrame = 0;
  _rdtLastFrameToken = undefined;
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

  const frameToken = Number.isFinite(appCtx.lastTime) ? appCtx.lastTime : undefined;
  const sameRenderedFrame = frameToken !== undefined && frameToken === _rdtLastFrameToken;
  if (!sameRenderedFrame) {
    _rdtPhysFrame++;
    _rdtLastFrameToken = frameToken;
  }
  _rdtRoadSkipInterval = typeof appCtx.rdtComplexity === 'number' ?
  appCtx.rdtComplexity >= 6 ? 3 : 2 :
  2;

  let nr;
  const movedBeyondCache = Number.isFinite(_cachedNearRoad?.queryX) &&
    Math.hypot(x - _cachedNearRoad.queryX, z - _cachedNearRoad.queryZ) > 4;
  const shouldCheck = !_cachedNearRoad || (!sameRenderedFrame && (
    forceCheck ||
    _rdtPhysFrame % _rdtRoadSkipInterval === 0 ||
    movedBeyondCache ||
    (Number.isFinite(currentY) && Number.isFinite(_cachedNearRoad?.y) && Math.abs(_cachedNearRoad.y - currentY) > 6)
  ));

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
      queryZ: z
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
  const steerControl = Number(actions.steer) || 0;
  const throttleControl = Math.max(0, Number(actions.throttle) || 0);
  const reverseControl = Math.max(0, Number(actions.reverse) || 0);
  const brakeControl = Math.max(0, Number(actions.brake) || 0);
  const left = steerControl > 0.05, right = steerControl < -0.05;
  const driveCommand = resolveCarDriveCommand({
    speed: appCtx.car.speed,
    throttle: throttleControl,
    reverse: reverseControl,
    brake: brakeControl
  });
  const gas = driveCommand.forward > 0.05;
  const reverse = driveCommand.reverse > 0.05;
  const braking = driveCommand.handbrake;
  const boostKey = Number(actions.boost) > 0.05;

  // Ensure new handling state exists (safe even if car object persisted)
  if (appCtx.car.yawRate === undefined) appCtx.car.yawRate = 0;
  if (appCtx.car.vFwd === undefined) appCtx.car.vFwd = 0;
  if (appCtx.car.vLat === undefined) appCtx.car.vLat = 0;
  if (appCtx.car.rearSlip === undefined) appCtx.car.rearSlip = 0;
  if (appCtx.car.steerSm === undefined) appCtx.car.steerSm = 0;
  if (appCtx.car.throttleSm === undefined) appCtx.car.throttleSm = 0;
  if (appCtx.car.isDrifting === undefined) appCtx.car.isDrifting = false;
  if (appCtx.car._driftHoldTimer === undefined) appCtx.car._driftHoldTimer = 0;
  if (appCtx.car.vy === undefined) appCtx.car.vy = 0;
  if (appCtx.car._lastSurfaceY === undefined) appCtx.car._lastSurfaceY = null;
  if (appCtx.car._lastRawSurfaceY === undefined) appCtx.car._lastRawSurfaceY = null;
  if (appCtx.car._terrainAirTimer === undefined) appCtx.car._terrainAirTimer = 0;
  if (appCtx.car._roadContinuityTimer === undefined) appCtx.car._roadContinuityTimer = 0;
  if (appCtx.car._driveDirection === undefined) appCtx.car._driveDirection = 1;

  if (boostKey && appCtx.car.boostReady && !appCtx.car.boost) {
    appCtx.car.boost = true;
    appCtx.car.boostTime = appCtx.CFG.boostDur;
    appCtx.car.boostReady = false;
    appCtx.car.boostDecayTime = 0;
  }
  if (appCtx.car.boost) {
    appCtx.car.boostTime -= dt;
    if (appCtx.car.boostTime <= 0) {
      appCtx.car.boost = false;
      appCtx.car.boostTime = 0;
      appCtx.car.boostDecayTime = 1.5;
    }
  }
  if (!boostKey && !appCtx.car.boost) appCtx.car.boostReady = true;

  let boostDecayFactor = 0;
  if (appCtx.car.boostDecayTime > 0) {
    appCtx.car.boostDecayTime -= dt;
    boostDecayFactor = Math.max(0, appCtx.car.boostDecayTime / 1.5);
  }

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

    const planetaryBaseAccel = appCtx.CFG.accel * planetaryDriveProfile.accel;
    const planetaryBoostAccel = appCtx.CFG.boostAccel * planetaryDriveProfile.boostAccel;

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
  maxSpd *= surfaceDynamics.topSpeed;
  friction *= surfaceDynamics.rolling;
  accel *= surfaceDynamics.accel;
  if (!isPlanetarySurface()) {
    maxSpd *= vehicleCondition.topSpeedScale;
    accel *= vehicleCondition.accelerationScale;
  }
  accel *= characterVehicle.accelerationScale;
  accel *= vehicleUpgrades.accelerationScale;

  const spd = Math.abs(appCtx.car.speed);
  const hasGroundControl = !appCtx.car.isAirborne;
  const canAccelerate = hasGroundControl && (isPlanetarySurface() || vehicleCondition.operable);
  const driftBrakeSpeed = 10;
  const earthDriftBrakeIntent = !isPlanetarySurface() && braking && (left || right) && spd > driftBrakeSpeed;

  if (driveCommand.serviceBrake && hasGroundControl) {
    const stopRate = Math.max(6, Number(appCtx.CFG.brake) || 18) *
      (isPlanetarySurface() ? 1 : vehicleHandling.brakeScale * vehicleCondition.brakeScale) *
      characterVehicle.brakingScale * vehicleUpgrades.brakeScale;
    const nextMagnitude = Math.max(0, Math.abs(appCtx.car.speed) - stopRate * dt);
    appCtx.car.speed = Math.sign(appCtx.car.speed) * nextMagnitude;
    if (nextMagnitude < 0.5) appCtx.car.speed = 0;
  }

  if (gas && !braking && !driveCommand.serviceBrake && canAccelerate) {
    let throttleAccel = accel;
    if (isPlanetarySurface()) {
      const lowSpeedBoost = Math.max(0, 1 - spd / 14);
      throttleAccel *= 1 + lowSpeedBoost * 0.75;
    }
    appCtx.car.speed += throttleAccel * driveCommand.forward * (1 - spd / maxSpd * 0.7) * dt;
  }

  if (braking && spd > 0.5 && hasGroundControl) {
    if (earthDriftBrakeIntent) {
      // Handbrake-like brake response: keep momentum so brake+steer can initiate drift.
      const driftBrakeRate = 0.72;
      appCtx.car.speed *= Math.exp(-driftBrakeRate * dt);
    } else {
      appCtx.car.speed *= 1 - appCtx.CFG.brakeForce * brakeControl * dt;
    }
    if (Math.abs(appCtx.car.speed) < 0.5) appCtx.car.speed = 0;
  }

  if (reverse && !braking && !driveCommand.serviceBrake && canAccelerate) {
    const reverseAccelScale = isPlanetarySurface() ? 0.65 : 0.5;
    appCtx.car.speed -= accel * reverseAccelScale * driveCommand.reverse * dt;
  }

  // Natural friction when coasting
  if (!gas && !reverse && !braking && !driveCommand.serviceBrake) {
    appCtx.car.speed *= 1 - friction * dt * 0.01;
    if (Math.abs(appCtx.car.speed) < 0.5) appCtx.car.speed = 0;
  }

  appCtx.car.speed = Math.max(-maxSpd * 0.3, Math.min(maxSpd, appCtx.car.speed));

  if (boostDecayFactor > 0 && !appCtx.car.boost) {
    const normalMaxSpd = isPlanetarySurface()
      ? planetaryNormalMaxSpd
      : Math.min(appCtx.CFG.maxSpd, mphToCarSpeed(vehicleHandling.topSpeedMph));
    if (Math.abs(appCtx.car.speed) > normalMaxSpd) {
      const targetSpeed = normalMaxSpd + (Math.abs(appCtx.car.speed) - normalMaxSpd) * boostDecayFactor;
      const sign = appCtx.car.speed >= 0 ? 1 : -1;
      appCtx.car.speed = sign * Math.max(normalMaxSpd, targetSpeed);
    }
  }

  // =========================================================================
  // Slowroads-like handling core (yaw inertia + slip)
  // =========================================================================

  const steerInput = steerControl;
  const throttleInput = gas && !reverse ? throttleControl : 0;

  const steerSmooth = 1 - Math.exp(-dt * 14 * characterVehicle.steeringResponseScale);
  const throttleSmooth = 1 - Math.exp(-dt * 6);
  if (Math.abs(steerInput) > 0.05 && steerInput * appCtx.car.steerSm < 0) {
    // A deliberate steering reversal must not spend visible frames applying
    // the previous steering sign.
    appCtx.car.steerSm = 0;
    appCtx.car.yawRate *= 0.28;
    appCtx.car.rearSlip *= 0.2;
  }
  appCtx.car.steerSm += (steerInput - appCtx.car.steerSm) * steerSmooth;
  appCtx.car.throttleSm += (throttleInput - appCtx.car.throttleSm) * throttleSmooth;

  const spdAbs = Math.abs(appCtx.car.speed);
  const driveDirection =
    appCtx.car.speed < -0.5 ? -1 :
    appCtx.car.speed > 0.5 ? 1 :
    reverse ? -1 :
    1;
  if (driveDirection !== appCtx.car._driveDirection) {
    appCtx.car.yawRate = 0;
    appCtx.car.vLat = 0;
    appCtx.car.rearSlip = 0;
    appCtx.car._driveDirection = driveDirection;
  }

  const earthSteering = earthDrivingSteeringProfile(carSpeedToMph(spdAbs));
  const maxSteer = isPlanetarySurface()
    ? 1.02 + (0.28 - 1.02) * Math.max(0, Math.min(1, (spdAbs - 5) / 90))
    : earthSteering.maxSteeringAngle * vehicleHandling.steeringScale * vehicleCondition.steeringScale * characterVehicle.steeringAngleScale;

  const clamp01 = (n) => Math.max(0, Math.min(1, n));
  const steerMag = Math.abs(appCtx.car.steerSm);
  const speedNorm = clamp01((spdAbs - 8) / 70);
  const parkingTurnBlend = clamp01(1 - spdAbs / 14);
  const reverseTurnBlend = appCtx.car.speed < -1 ? clamp01((Math.abs(appCtx.car.speed) - 1) / 12) : 0;
  const lowSpeedTurnBoost = Math.max(parkingTurnBlend, reverseTurnBlend);
  const handbrakeTurnIntent = !isPlanetarySurface() && braking && steerMag >= 0.1 && spdAbs >= 16;
  const handbrakeSteerBoost = handbrakeTurnIntent ? 1 + (0.20 + 0.35 * speedNorm) : 1;
  // The signed-speed yaw target below reverses chassis rotation in reverse so
  // the rear trajectory continues toward the requested A/D side.
  const steerAngle = appCtx.car.steerSm * Math.min(
    1.08,
    maxSteer * handbrakeSteerBoost * (1 + lowSpeedTurnBoost * 0.42)
  );
  const driftStartSteer = 0.12;
  const driftHoldSteer = 0.05;
  const driftStartSpeed = 15;
  const driftHoldSpeed = 10;
  const driftStartIntent = !isPlanetarySurface() && braking && steerMag >= driftStartSteer && spdAbs >= driftStartSpeed;

  if (isPlanetarySurface()) {
    appCtx.car._driftHoldTimer = 0;
  } else if (driftStartIntent) {
    appCtx.car._driftHoldTimer = 0.65;
  } else {
    appCtx.car._driftHoldTimer = Math.max(0, appCtx.car._driftHoldTimer - dt);
  }

  const driftCanSustain = !isPlanetarySurface() &&
  (braking || appCtx.car._driftHoldTimer > 0) &&
  steerMag >= driftHoldSteer &&
  spdAbs >= driftHoldSpeed;
  const isDrifting = driftStartIntent || !!appCtx.car.isDrifting && driftCanSustain;

  // Surface grip baseline using existing runtime config values.
  let gripBase = Number(appCtx.CFG.gripRoad || 0.88) * surfaceDynamics.grip * (isPlanetarySurface() ? 1 : vehicleHandling.gripScale * vehicleCondition.gripScale * vehicleUpgrades.gripScale);

  // Moon handling remains unchanged by drift tuning.
  if (isPlanetarySurface()) gripBase = 1.0;

  let driftGrip = gripBase;
  if (isDrifting) {
    const brakeGrip = Number(appCtx.CFG.gripBrake || 0.60);
    const driftGripFloor = Number(appCtx.CFG.gripDrift || 0.36);
    const blend = (0.72 + 0.28 * speedNorm) * surfaceDynamics.drift;
    driftGrip = Math.max(driftGripFloor, gripBase * (1 - blend) + brakeGrip * blend);
  }
  const grip = Math.max(0.2, Math.min(1.2, driftGrip));

  let latDamp, yawDamp, yawResponse;
  if (isPlanetarySurface()) {
    // Preserve moon handling behavior exactly as before.
    latDamp = 11.0 * (0.75 + grip * 0.55);
    yawDamp = 8.8 * (0.7 + grip * 0.6);
    yawResponse = 2.4 * (0.65 + grip * 0.45);
  } else {
    latDamp = 15.5 * (0.72 + grip * 0.58);
    yawDamp = 9.2 * (0.7 + grip * 0.6);
    yawResponse = 4.4 * (0.64 + grip * 0.42);
    if (lowSpeedTurnBoost > 0) {
      yawResponse += lowSpeedTurnBoost * 1.35;
      yawDamp *= 1 - lowSpeedTurnBoost * 0.12;
    }

    if (isDrifting) {
      latDamp *= 0.28;
      yawDamp *= 0.58;
      yawResponse *= 1.78;
    } else {
      const driftRecovery = Math.max(0, Number(appCtx.CFG.driftRec || 6));
      latDamp += driftRecovery * 0.55;
      yawDamp += driftRecovery * 0.32;
    }
  }

  if (!isDrifting) {
    latDamp *= characterVehicle.recoveryScale * vehicleUpgrades.recoveryScale;
    yawResponse *= characterVehicle.steeringResponseScale;
  }

  const wheelBase = isPlanetarySurface() ? 2.6 : vehicleHandling.wheelBase;
  const v = isPlanetarySurface()
    ? appCtx.car.speed
    : carSpeedToWorldUnitsPerSecond(appCtx.car.speed, appCtx.METERS_PER_WORLD_UNIT);
  let steerAuthority = 1.08;
  if (!isPlanetarySurface() && lowSpeedTurnBoost > 0) {
    steerAuthority *= 1 + lowSpeedTurnBoost * 0.48;
  }
  if (!isPlanetarySurface() && (isDrifting || handbrakeTurnIntent)) {
    steerAuthority *= 1.22;
  }
  const radiusAuthority = Math.max(.76, Math.min(1.22, 5.2 / vehicleHandling.turningRadius));
  const maxYawRate = isPlanetarySurface()
    ? Infinity
    : earthSteering.maxYawRate * vehicleHandling.steeringScale * radiusAuthority * characterVehicle.steeringAngleScale;
  const yawRateTarget = arcadeSteeringYawTarget(
    v,
    steerAngle * steerAuthority,
    wheelBase,
    maxYawRate
  );

  appCtx.car.yawRate += (yawRateTarget - appCtx.car.yawRate) * (1 - Math.exp(-dt * yawResponse));
  if (isPlanetarySurface()) {
    appCtx.car.yawRate *= Math.exp(-dt * yawDamp);
  } else if (steerMag < 0.04) {
    appCtx.car.yawRate *= Math.exp(-dt * yawDamp);
  } else if (!isDrifting) {
    appCtx.car.yawRate *= Math.exp(-dt * yawDamp * 0.08);
  }
  if (hasGroundControl) {
    appCtx.car.angle += appCtx.car.yawRate * dt;
  } else {
    appCtx.car.yawRate *= Math.exp(-dt * 2.0);
    appCtx.car.angle += appCtx.car.yawRate * dt;
  }

  appCtx.car.vFwd += (appCtx.car.speed - appCtx.car.vFwd) * (1 - Math.exp(-dt * 8));
  appCtx.car.vLat *= Math.exp(-dt * latDamp);

  // Rear-biased slip model:
  // front axle keeps more grip while handbrake drifting, rear axle breaks loose.
  const halfWheelBase = wheelBase * 0.5;
  let frontLat = appCtx.car.vLat + appCtx.car.yawRate * halfWheelBase;
  let rearLat = appCtx.car.vLat - appCtx.car.yawRate * halfWheelBase;

  let frontGripDamp = 22 * (0.7 + grip * 0.55);
  let rearGripDamp = 18 * (0.72 + grip * 0.52);
  if (!isPlanetarySurface()) {
    if (isDrifting) {
      frontGripDamp *= 0.90;
      rearGripDamp *= 0.12;
      rearLat += appCtx.car.steerSm * 2.35 * (0.5 + 0.5 * speedNorm);
    }
  }

  frontLat *= Math.exp(-dt * frontGripDamp);
  rearLat *= Math.exp(-dt * rearGripDamp);
  appCtx.car.vLat = (frontLat + rearLat) * 0.5;

  let slipGain = 0.005 * steerMag * speedNorm;
  if (!isPlanetarySurface()) {
    if (isDrifting) {
      const driftSlip = 0.064;
      slipGain = driftSlip * steerMag * (0.45 + 0.55 * speedNorm);
    } else {
      slipGain = 0.0012 * steerMag * speedNorm;
    }
  }
  appCtx.car.vLat += appCtx.car.yawRate * spdAbs * slipGain;

  if (!isPlanetarySurface() && isDrifting) {
    const rearStep = rearLat - frontLat;
    const rearSlipGain = 1.38;
    const steerSlipGain = 1.05;
    appCtx.car.rearSlip += rearStep * dt * rearSlipGain;
    appCtx.car.rearSlip += appCtx.car.steerSm * dt * steerSlipGain;
    const rearSlipLimit = 1.75;
    appCtx.car.rearSlip = Math.max(-rearSlipLimit, Math.min(rearSlipLimit, appCtx.car.rearSlip));
    appCtx.car.rearSlip *= Math.exp(-dt * 3.1);
    appCtx.car.yawRate += appCtx.car.rearSlip * (0.86 + 0.34 * speedNorm);
    // Keep front axle planted so drift pivots from the rear instead of full-body slide.
    appCtx.car.vLat *= Math.exp(-dt * 4.3);
  } else {
    appCtx.car.rearSlip *= Math.exp(-dt * 9.5);
  }

  if (isDrifting) {
    const yawKick = appCtx.car.steerSm * 1.28 * (0.35 + 0.65 * speedNorm);
    appCtx.car.yawRate += yawKick * dt * 4.6;
  }
  appCtx.car.isDrifting = isDrifting;

  if (liveGpsDriveTarget && Number.isFinite(liveGpsDriveTarget.headingDegrees)) {
    appCtx.car.angle = Math.PI - liveGpsDriveTarget.headingDegrees * Math.PI / 180;
  }
  const sinA = Math.sin(appCtx.car.angle),cosA = Math.cos(appCtx.car.angle);
  const lateralVelForPosition = !isPlanetarySurface() && isDrifting ?
    appCtx.car.vLat * 0.34 :
    appCtx.car.vLat;
  const worldForwardVelocity = isPlanetarySurface()
    ? appCtx.car.vFwd
    : carSpeedToWorldUnitsPerSecond(appCtx.car.vFwd, appCtx.METERS_PER_WORLD_UNIT);
  const worldLateralVelocity = isPlanetarySurface()
    ? lateralVelForPosition
    : carSpeedToWorldUnitsPerSecond(lateralVelForPosition, appCtx.METERS_PER_WORLD_UNIT);
  appCtx.car.vx = sinA * worldForwardVelocity + cosA * worldLateralVelocity;
  appCtx.car.vz = cosA * worldForwardVelocity - sinA * worldLateralVelocity;

  const velMag = Math.hypot(appCtx.car.vx, appCtx.car.vz);
  if (velMag > 5) {
    const velAngle = Math.atan2(appCtx.car.vx, appCtx.car.vz);
    let da = appCtx.car.angle - velAngle;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    appCtx.car.driftAngle = da;
  } else {
    appCtx.car.driftAngle = 0;
  }

  let nx;
  let nz;
  if (!isPlanetarySurface() && isDrifting && spdAbs > 6) {
    const frontPivotDist = wheelBase * 0.42;
    const frontX = appCtx.car.x + sinA * frontPivotDist;
    const frontZ = appCtx.car.z + cosA * frontPivotDist;
    const frontVx = sinA * worldForwardVelocity + cosA * (worldLateralVelocity * 0.35);
    const frontVz = cosA * worldForwardVelocity - sinA * (worldLateralVelocity * 0.35);
    const nextFrontX = frontX + frontVx * dt;
    const nextFrontZ = frontZ + frontVz * dt;
    nx = nextFrontX - Math.sin(appCtx.car.angle) * frontPivotDist;
    nz = nextFrontZ - Math.cos(appCtx.car.angle) * frontPivotDist;
  } else {
    nx = appCtx.car.x + appCtx.car.vx * dt;
    nz = appCtx.car.z + appCtx.car.vz * dt;
  }
  if (liveGpsDriveTarget) {
    nx = liveGpsDriveTarget.x;
    nz = liveGpsDriveTarget.z;
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
          radius: .92,
          speedMph: carSpeedToMph(appCtx.car.speed),
          velocityX: appCtx.car.vx,
          velocityZ: appCtx.car.vz
        }
      );
      nx = actorCollision.x;
      nz = actorCollision.z;
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
  appCtx.wheelMeshes.forEach((w) => w.rotation.x += wheelRot);

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
