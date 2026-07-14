import { ctx as appCtx } from "./shared-context.js?v=55"; // ============================================================================
import { isRoadSurfaceReachable } from "./structure-semantics.js?v=12";
import { updateDrone } from "./physics/drone-flight.js?v=2";
import { updateVehicleSurface } from "./physics/vehicle-surface.js?v=1";
import { createBuildingCollisionQuery } from "./physics/building-collision.js?v=1";
// physics.js - Car physics, building collision, drone movement
// ============================================================================

// RDT-based adaptive throttling state
// At high complexity, skip findNearestRoad on some frames (reuse cached result)
let _rdtPhysFrame = 0;
let _rdtRoadSkipInterval = 1; // 1 = check every frame, 2 = every other, etc.
let _cachedNearRoad = null;

// Invalidate road cache - must be called on road reload, mode change, teleport
function invalidateRoadCache() {
  _cachedNearRoad = null;
  _rdtPhysFrame = 0;
}

// Reusable raycaster and vectors (avoid GC pressure from per-frame allocations)
let _physRaycaster = null;
const _physRayStart = typeof THREE !== 'undefined' ? new THREE.Vector3() : null;
const _physRayDir = typeof THREE !== 'undefined' ? new THREE.Vector3(0, -1, 0) : null;

function isPlanetarySurface() {
  return !!(appCtx.onMoon || appCtx.onMars);
}

function getPlanetarySurfaceMesh() {
  if (appCtx.onMars && appCtx.marsSurface) return appCtx.marsSurface;
  if (appCtx.onMoon && appCtx.moonSurface) return appCtx.moonSurface;
  return null;
}

function getPlanetaryGravity() {
  if (appCtx.onMars) return -3.71;
  if (appCtx.onMoon) return -1.62;
  return -9.80665;
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

  _rdtPhysFrame++;
  _rdtRoadSkipInterval = typeof appCtx.rdtComplexity === 'number' ?
  appCtx.rdtComplexity >= 6 ? 3 : appCtx.rdtComplexity >= 4 ? 2 : 1 :
  1;

  let nr;
  const shouldCheck = forceCheck ||
  _rdtRoadSkipInterval <= 1 ||
  _rdtPhysFrame % _rdtRoadSkipInterval === 0 ||
  !_cachedNearRoad ||
  (Number.isFinite(currentY) && Number.isFinite(_cachedNearRoad?.y) && Math.abs(_cachedNearRoad.y - currentY) > 6);

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
      distanceToTransitionZone: Number.isFinite(nr?.distanceToTransitionZone) ? nr.distanceToTransitionZone : Infinity
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
  if (typeof appCtx.updateFlowerChallenge === 'function') appCtx.updateFlowerChallenge(dt);

  if (appCtx.boatMode?.active) {
    if (typeof appCtx.updateBoatMode === 'function') {
      appCtx.updateBoatMode(dt);
    }
    if (typeof appCtx.updateMode === 'function') appCtx.updateMode(dt);
    return;
  }

  if (appCtx.droneMode) {
    updateDrone(dt);
    if (typeof appCtx.updateMode === 'function') appCtx.updateMode(dt);
    if (typeof appCtx.updateInteriorInteraction === 'function') appCtx.updateInteriorInteraction();
    if (!isPlanetarySurface() && !appCtx.worldLoading) appCtx.updateTerrainAround(appCtx.drone.x, appCtx.drone.z);
    return;
  }

  if (appCtx.Walk) {
    appCtx.Walk.update(dt);
    if (appCtx.Walk.state.mode === 'walk') {
      if (appCtx.isRecording && appCtx.customTrack.length > 0) {
        const lp = appCtx.customTrack[appCtx.customTrack.length - 1];
        const d = Math.hypot(appCtx.Walk.state.walker.x - lp.x, appCtx.Walk.state.walker.z - lp.z);
        if (d > 5) appCtx.customTrack.push({ x: appCtx.Walk.state.walker.x, z: appCtx.Walk.state.walker.z });
      } else if (appCtx.isRecording) {
        appCtx.customTrack.push({ x: appCtx.Walk.state.walker.x, z: appCtx.Walk.state.walker.z });
      }

      appCtx.police.forEach((p) => {
        const dx = appCtx.Walk.state.walker.x - p.x,dz = appCtx.Walk.state.walker.z - p.z,d = Math.hypot(dx, dz);
        if (d < 15 && !p.caught) {
          p.caught = true;appCtx.policeHits++;
          document.getElementById('police').textContent = '💔 ' + appCtx.policeHits + '/3';
          document.getElementById('police').classList.add('warn');
          if (appCtx.policeHits >= 3) {
            appCtx.paused = true;
            document.getElementById('caughtScreen').classList.add('show');
          }
        }
      });

      if (typeof appCtx.updateMode === 'function') appCtx.updateMode(dt);
      if (typeof appCtx.updateInteriorInteraction === 'function') appCtx.updateInteriorInteraction();
      return;
    }
  }

  if (typeof appCtx.updateInteriorInteraction === 'function') appCtx.updateInteriorInteraction();

  const left = appCtx.keys.KeyA,right = appCtx.keys.KeyD;
  const gas = appCtx.keys.KeyW,reverse = appCtx.keys.KeyS;
  const braking = appCtx.keys.Space;
  const boostKey = appCtx.keys.ControlLeft || appCtx.keys.ControlRight;

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
  if (appCtx.car._terrainAirTimer === undefined) appCtx.car._terrainAirTimer = 0;

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

  let maxSpd, friction, accel;
  let planetaryNormalMaxSpd = appCtx.onMars ? 18 : 24;

  // We'll keep a single road query result for this frame (and optional precision check later)
  let nr = null;

  if (isPlanetarySurface()) {
    appCtx.car.onRoad = false;
    appCtx.car.road = null;

    const moonMaxSpeed = appCtx.onMars ? 18 : 24;
    const moonBoostSpeed = appCtx.onMars ? 22 : 29;
    const moonBaseAccel = appCtx.CFG.accel * (appCtx.onMars ? 0.72 : 0.82);
    const moonBoostAccel = appCtx.CFG.boostAccel * (appCtx.onMars ? 0.66 : 0.76);

    maxSpd = appCtx.car.boost ? moonBoostSpeed : moonMaxSpeed;
    planetaryNormalMaxSpd = moonMaxSpeed;
    friction = appCtx.CFG.friction; // same as Earth road
    accel = appCtx.car.boost ? moonBoostAccel : moonBaseAccel;
  } else {
    const isSteering = left || right;
    const isHighSpeed = Math.abs(appCtx.car.speed) > 40;
    const wasOffRoad = !appCtx.car.onRoad;
    const forceCheck = isHighSpeed || isSteering || wasOffRoad || !_cachedNearRoad;

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
    appCtx.car.road = appCtx.car.onRoad ? nr.road : null;

    const baseMax = appCtx.car.onRoad ? appCtx.CFG.maxSpd : appCtx.CFG.offMax;
    maxSpd = appCtx.car.boost ? appCtx.CFG.boostMax : baseMax;
    friction = appCtx.car.onRoad ? appCtx.CFG.friction : appCtx.CFG.offFriction;
    accel = appCtx.car.boost ? appCtx.CFG.boostAccel : appCtx.CFG.accel;
  }

  const surfaceDynamics = updateVehicleSurface(appCtx, dt);
  maxSpd *= surfaceDynamics.topSpeed;
  friction *= surfaceDynamics.rolling;
  accel *= surfaceDynamics.accel;

  const spd = Math.abs(appCtx.car.speed);
  const canAccelerate = !appCtx.car.isAirborne;
  const driftBrakeSpeed = appCtx.car.onRoad ? 10 : 12;
  const earthDriftBrakeIntent = !isPlanetarySurface() && braking && (left || right) && spd > driftBrakeSpeed;

  if (gas && !braking && canAccelerate) {
    let throttleAccel = accel;
    if (isPlanetarySurface()) {
      const lowSpeedBoost = Math.max(0, 1 - spd / 14);
      throttleAccel *= 1 + lowSpeedBoost * 0.75;
    }
    appCtx.car.speed += throttleAccel * (1 - spd / maxSpd * 0.7) * dt;
  }

  if (braking && spd > 0.5 && canAccelerate) {
    if (earthDriftBrakeIntent) {
      // Handbrake-like brake response: keep momentum so brake+steer can initiate drift.
      const driftBrakeRate = appCtx.car.onRoad ? 0.72 : 1.1;
      appCtx.car.speed *= Math.exp(-driftBrakeRate * dt);
    } else {
      appCtx.car.speed *= 1 - appCtx.CFG.brakeForce * dt;
    }
    if (Math.abs(appCtx.car.speed) < 0.5) appCtx.car.speed = 0;
  }

  if (reverse && !braking && canAccelerate) {
    if (appCtx.car.speed > 10) {
      appCtx.car.speed -= appCtx.CFG.brake * dt;
      if (Math.abs(appCtx.car.speed) < 0.5) appCtx.car.speed = 0;
    } else {
      const reverseAccelScale = isPlanetarySurface() ? 0.65 : 0.5;
      appCtx.car.speed -= accel * reverseAccelScale * dt;
    }
  }

  // Natural friction when coasting
  if (!gas && !reverse && !braking) {
    appCtx.car.speed *= 1 - friction * dt * 0.01;
    if (Math.abs(appCtx.car.speed) < 0.5) appCtx.car.speed = 0;
  }

  appCtx.car.speed = Math.max(-maxSpd * 0.3, Math.min(maxSpd, appCtx.car.speed));

  if (boostDecayFactor > 0 && !appCtx.car.boost) {
    const normalMaxSpd = isPlanetarySurface() ? planetaryNormalMaxSpd : appCtx.car.onRoad ? appCtx.CFG.maxSpd : appCtx.CFG.offMax;
    if (Math.abs(appCtx.car.speed) > normalMaxSpd) {
      const targetSpeed = normalMaxSpd + (Math.abs(appCtx.car.speed) - normalMaxSpd) * boostDecayFactor;
      const sign = appCtx.car.speed >= 0 ? 1 : -1;
      appCtx.car.speed = sign * Math.max(normalMaxSpd, targetSpeed);
    }
  }

  // =========================================================================
  // Slowroads-like handling core (yaw inertia + slip)
  // =========================================================================

  const steerInput = (left ? 1 : 0) - (right ? 1 : 0);
  const throttleInput = gas && !reverse ? 1 : 0;

  const steerSmooth = 1 - Math.exp(-dt * 14);
  const throttleSmooth = 1 - Math.exp(-dt * 6);
  appCtx.car.steerSm += (steerInput - appCtx.car.steerSm) * steerSmooth;
  appCtx.car.throttleSm += (throttleInput - appCtx.car.throttleSm) * throttleSmooth;

  const spdAbs = Math.abs(appCtx.car.speed);

  const maxSteerLow = 0.72;
  const maxSteerHigh = 0.22;
  const steerFadeMin = 5;
  const steerFadeMax = 95;

  let steerAlpha = 0;
  if (spdAbs > steerFadeMin) {
    steerAlpha = Math.min(1, (spdAbs - steerFadeMin) / (steerFadeMax - steerFadeMin));
  }
  const maxSteer = maxSteerLow + (maxSteerHigh - maxSteerLow) * steerAlpha;

  const clamp01 = (n) => Math.max(0, Math.min(1, n));
  const steerMag = Math.abs(appCtx.car.steerSm);
  const speedNorm = clamp01((spdAbs - 8) / 70);
  const parkingTurnBlend = clamp01(1 - spdAbs / 14);
  const reverseTurnBlend = appCtx.car.speed < -1 ? clamp01((Math.abs(appCtx.car.speed) - 1) / 12) : 0;
  const lowSpeedTurnBoost = Math.max(parkingTurnBlend, reverseTurnBlend);
  const handbrakeTurnIntent = !isPlanetarySurface() && braking && steerMag >= 0.1 && spdAbs >= 16;
  const handbrakeSteerBoost = handbrakeTurnIntent ? 1 + (0.20 + 0.35 * speedNorm) : 1;
  // Reverse steering keeps the same direction (arcade style).
  const steerAngle = appCtx.car.steerSm * Math.min(
    1.08,
    maxSteer * handbrakeSteerBoost * (1 + lowSpeedTurnBoost * (appCtx.car.onRoad ? 0.22 : 0.12))
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
  let gripBase = Number(appCtx.CFG.gripRoad || 0.88) * surfaceDynamics.grip;

  // Moon handling remains unchanged by drift tuning.
  if (isPlanetarySurface()) gripBase = 1.0;

  let driftGrip = gripBase;
  if (isDrifting) {
    const brakeGrip = Number(appCtx.CFG.gripBrake || 0.60);
    const driftGripFloor = Number(appCtx.CFG.gripDrift || 0.36);
    const blend = (appCtx.car.onRoad ? 0.72 + 0.28 * speedNorm : 0.62 + 0.30 * speedNorm) * surfaceDynamics.drift;
    driftGrip = Math.max(driftGripFloor, gripBase * (1 - blend) + brakeGrip * blend);
  }
  const grip = Math.max(0.2, Math.min(1.2, driftGrip));

  let latDamp, yawDamp, yawResponse;
  if (isPlanetarySurface()) {
    // Preserve moon handling behavior exactly as before.
    latDamp = (appCtx.car.onRoad ? 13.0 : 11.0) * (0.75 + grip * 0.55);
    yawDamp = (appCtx.car.onRoad ? 8.3 : 8.8) * (0.7 + grip * 0.6);
    yawResponse = (appCtx.car.onRoad ? 4.6 : 2.4) * (0.65 + grip * 0.45);
  } else {
    // Earth-only: stronger off-road lateral damping unless drift is explicitly requested.
    latDamp = (appCtx.car.onRoad ? 15.5 : 19.0) * (0.72 + grip * 0.58);
    yawDamp = (appCtx.car.onRoad ? 9.2 : 11.6) * (0.7 + grip * 0.6);
    yawResponse = (appCtx.car.onRoad ? 4.4 : 2.1) * (0.64 + grip * 0.42);
    if (lowSpeedTurnBoost > 0) {
      yawResponse += lowSpeedTurnBoost * (appCtx.car.onRoad ? 1.35 : 0.72);
      yawDamp *= 1 - lowSpeedTurnBoost * (appCtx.car.onRoad ? 0.12 : 0.08);
    }

    if (isDrifting) {
      latDamp *= 0.28;
      yawDamp *= 0.58;
      yawResponse *= 1.78;
    } else {
      const driftRecovery = Math.max(0, Number(appCtx.CFG.driftRec || 6));
      latDamp += driftRecovery * (appCtx.car.onRoad ? 0.55 : 0.85);
      yawDamp += driftRecovery * 0.32;
    }
  }

  const wheelBase = 2.6;
  const v = appCtx.car.speed;
  let steerAuthority = appCtx.car.onRoad ? 1.02 : 0.76;
  if (!isPlanetarySurface() && lowSpeedTurnBoost > 0) {
    steerAuthority *= 1 + lowSpeedTurnBoost * (appCtx.car.onRoad ? 0.24 : 0.12);
  }
  if (!isPlanetarySurface() && (isDrifting || handbrakeTurnIntent)) {
    steerAuthority *= appCtx.car.onRoad ? 1.22 : 1.1;
  }
  const yawRateTarget = v / Math.max(1e-3, wheelBase) * Math.tan(steerAngle * steerAuthority);

  appCtx.car.yawRate += (yawRateTarget - appCtx.car.yawRate) * (1 - Math.exp(-dt * yawResponse));
  appCtx.car.yawRate *= Math.exp(-dt * yawDamp);
  const parkingPivotIntent = !isPlanetarySurface() && steerMag >= 0.16 && spdAbs < 9.5 && (braking || reverse || throttleInput === 0);
  if (parkingPivotIntent) {
    const pivotBlend = clamp01(1 - spdAbs / 9.5);
    appCtx.car.yawRate += appCtx.car.steerSm * (appCtx.car.onRoad ? 1.95 : 1.15) * pivotBlend * dt * 3.1;
  }

  if (canAccelerate) {
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

  let frontGripDamp = (appCtx.car.onRoad ? 22 : 26) * (0.7 + grip * 0.55);
  let rearGripDamp = (appCtx.car.onRoad ? 18 : 24) * (0.72 + grip * 0.52);
  if (!isPlanetarySurface()) {
    if (isDrifting) {
      frontGripDamp *= 0.90;
      rearGripDamp *= 0.12;
      rearLat += appCtx.car.steerSm * (appCtx.car.onRoad ? 2.35 : 1.45) * (0.5 + 0.5 * speedNorm);
    } else if (!appCtx.car.onRoad) {
      // Off-road should feel planted unless drift is explicitly initiated.
      frontGripDamp *= 1.4;
      rearGripDamp *= 1.6;
    }
  }

  frontLat *= Math.exp(-dt * frontGripDamp);
  rearLat *= Math.exp(-dt * rearGripDamp);
  appCtx.car.vLat = (frontLat + rearLat) * 0.5;

  let slipGain = 0.005 * steerMag * speedNorm;
  if (!isPlanetarySurface()) {
    if (isDrifting) {
      const driftSlip = appCtx.car.onRoad ? 0.064 : 0.042;
      slipGain = driftSlip * steerMag * (0.45 + 0.55 * speedNorm);
    } else if (appCtx.car.onRoad) {
      slipGain = 0.0012 * steerMag * speedNorm;
    } else {
      slipGain = 0.00022 * steerMag * speedNorm;
    }
  }
  appCtx.car.vLat += appCtx.car.yawRate * spdAbs * slipGain;

  if (!isPlanetarySurface() && isDrifting) {
    const rearStep = rearLat - frontLat;
    const rearSlipGain = appCtx.car.onRoad ? 1.38 : 0.88;
    const steerSlipGain = appCtx.car.onRoad ? 1.05 : 0.62;
    appCtx.car.rearSlip += rearStep * dt * rearSlipGain;
    appCtx.car.rearSlip += appCtx.car.steerSm * dt * steerSlipGain;
    const rearSlipLimit = appCtx.car.onRoad ? 1.75 : 1.15;
    appCtx.car.rearSlip = Math.max(-rearSlipLimit, Math.min(rearSlipLimit, appCtx.car.rearSlip));
    appCtx.car.rearSlip *= Math.exp(-dt * (appCtx.car.onRoad ? 3.1 : 4.0));
    appCtx.car.yawRate += appCtx.car.rearSlip * (0.86 + 0.34 * speedNorm);
    // Keep front axle planted so drift pivots from the rear instead of full-body slide.
    appCtx.car.vLat *= Math.exp(-dt * (appCtx.car.onRoad ? 4.3 : 5.2));
  } else {
    appCtx.car.rearSlip *= Math.exp(-dt * 9.5);
    if (!isPlanetarySurface() && !appCtx.car.onRoad) {
      // Kill residual drift when off-road and not braking into a drift.
      appCtx.car.vLat *= Math.exp(-dt * 8.2);
    }
  }

  if (isDrifting) {
    const yawKick = appCtx.car.steerSm * (appCtx.car.onRoad ? 1.28 : 0.82) * (0.35 + 0.65 * speedNorm);
    appCtx.car.yawRate += yawKick * dt * 4.6;
  }
  appCtx.car.isDrifting = isDrifting;

  const sinA = Math.sin(appCtx.car.angle),cosA = Math.cos(appCtx.car.angle);
  const lateralVelForPosition = !isPlanetarySurface() && isDrifting ?
  appCtx.car.vLat * 0.34 :
  !isPlanetarySurface() && !appCtx.car.onRoad ?
  appCtx.car.vLat * 0.58 :
  appCtx.car.vLat;
  appCtx.car.vx = sinA * appCtx.car.vFwd + cosA * lateralVelForPosition;
  appCtx.car.vz = cosA * appCtx.car.vFwd - sinA * lateralVelForPosition;

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
    const frontVx = sinA * appCtx.car.vFwd + cosA * (lateralVelForPosition * 0.35);
    const frontVz = cosA * appCtx.car.vFwd - sinA * (lateralVelForPosition * 0.35);
    const nextFrontX = frontX + frontVx * dt;
    const nextFrontZ = frontZ + frontVz * dt;
    nx = nextFrontX - Math.sin(appCtx.car.angle) * frontPivotDist;
    nz = nextFrontZ - Math.cos(appCtx.car.angle) * frontPivotDist;
  } else {
    nx = appCtx.car.x + appCtx.car.vx * dt;
    nz = appCtx.car.z + appCtx.car.vz * dt;
  }

  // Street boundaries removed — car can drive freely off-road.
  // Building collisions are still enforced below.

  if (!isPlanetarySurface()) {
    const carFeetY = Number.isFinite(appCtx.car.y) ? appCtx.car.y - 1.2 : NaN;
    const buildingCheck = checkBuildingCollision(nx, nz, 2.0, {
      actorBaseY: carFeetY,
      actorHeight: 1.9
    });
    const nearestRoadForCollision = typeof appCtx.findNearestRoad === 'function' ? appCtx.findNearestRoad(nx, nz, {
      y: Number.isFinite(carFeetY) ? carFeetY + 1.2 : NaN,
      maxVerticalDelta: 18,
      preferredRoad: appCtx.car?.road || null
    }) : null;
    const roadDist = Number.isFinite(nearestRoadForCollision?.dist) ? nearestRoadForCollision.dist : Infinity;
    const roadHalfWidth = nearestRoadForCollision?.road?.width ? nearestRoadForCollision.road.width * 0.5 : 0;
    const onRoadCenter = roadHalfWidth > 0 &&
    roadDist <= Math.max(2.2, roadHalfWidth - 0.35);
    const onRoadCore = roadHalfWidth > 0 &&
    roadDist <= Math.max(1.6, roadHalfWidth - 0.95);
    const colliderDetail = buildingCheck?.building?.colliderDetail === 'bbox' ? 'bbox' : 'full';
    const buildingType = String(buildingCheck?.building?.buildingType || '').toLowerCase();
    const isApproxCollider = colliderDetail !== 'full';
  const partKind = String(buildingCheck?.building?.buildingPartKind || '').toLowerCase();
  const roofLikeCollider =
    buildingType === 'roof' ||
    buildingType === 'canopy' ||
    buildingType === 'carport' ||
    partKind === 'roof' ||
    partKind === 'balcony' ||
    partKind === 'canopy' ||
    buildingCheck?.building?.collisionKind === 'thin_part' ||
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

    if (buildingCheck.collision && !(shallowRoadsideCollision || likelyRoadGhostCollision)) {
      if (buildingCheck.inside) {
        if (buildingCheck.nearestPoint) {
          const pushDist = 3.0;
          nx = buildingCheck.nearestPoint.x + buildingCheck.pushX * pushDist;
          nz = buildingCheck.nearestPoint.z + buildingCheck.pushZ * pushDist;

          appCtx.car.speed = 0;
          appCtx.car.vFwd = 0;
          appCtx.car.vLat = 0;
          appCtx.car.vx = 0;
          appCtx.car.vz = 0;
        } else {
          nx = appCtx.car.x;
          nz = appCtx.car.z;
          appCtx.car.speed *= 0.1;
          appCtx.car.vFwd *= 0.1;
          appCtx.car.vLat *= 0.1;
          appCtx.car.vx *= 0.1;
          appCtx.car.vz *= 0.1;
        }
      } else {
        const pushDist = buildingCheck.penetration + 1.0;
        nx += buildingCheck.pushX * pushDist;
        nz += buildingCheck.pushZ * pushDist;

        const hitAngle = Math.atan2(appCtx.car.vz, appCtx.car.vx);
        const wallAngle = Math.atan2(buildingCheck.pushZ, buildingCheck.pushX);
        let angleDiff = Math.abs(hitAngle - wallAngle);
        if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;

        const headOnFactor = Math.abs(Math.cos(angleDiff));
        const speedReduction = 0.1 + (1 - headOnFactor) * 0.3;

        appCtx.car.speed *= speedReduction;
        appCtx.car.vFwd *= speedReduction;
        appCtx.car.vLat *= speedReduction;
        appCtx.car.vx *= speedReduction;
        appCtx.car.vz *= speedReduction;
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

  let carY = 1.2;

  const planetarySurface = getPlanetarySurfaceMesh();
  if (planetarySurface) {
    planetarySurface.updateMatrixWorld(true);
    const raycaster = _getPhysRaycaster();
    const sampleMoonSurfaceY = (sx, sz) => {
      _physRayStart.set(sx, 1200, sz);
      raycaster.set(_physRayStart, _physRayDir || new THREE.Vector3(0, -1, 0));
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
  } else if (appCtx.terrainEnabled) {
    let surfaceY = typeof appCtx.GroundHeight !== 'undefined' && appCtx.GroundHeight && typeof appCtx.GroundHeight.driveSurfaceY === 'function' ?
    appCtx.GroundHeight.driveSurfaceY(appCtx.car.x, appCtx.car.z, !!appCtx.car.onRoad, Number.isFinite(appCtx.car.y) ? appCtx.car.y - 1.2 : NaN) :
    (typeof appCtx.terrainMeshHeightAt === 'function' ?
    appCtx.terrainMeshHeightAt(appCtx.car.x, appCtx.car.z) :
    appCtx.elevationWorldYAtWorldXZ(appCtx.car.x, appCtx.car.z)) + (appCtx.car.onRoad ? 0.2 : 0);

    if (typeof appCtx.getBuildVehicleSurfaceAtWorldXZ === 'function') {
      const carFeetY = Number.isFinite(appCtx.car.y) ? appCtx.car.y - 1.2 : surfaceY;
      const buildSurfaceY = appCtx.getBuildVehicleSurfaceAtWorldXZ(appCtx.car.x, appCtx.car.z, carFeetY);
      if (Number.isFinite(buildSurfaceY)) surfaceY = Math.max(surfaceY, buildSurfaceY);
    }

    const targetY = surfaceY + 1.2;
    const speedAbs = Math.abs(appCtx.car.speed || 0);
    if (appCtx.car.y === undefined || appCtx.car.y === 0) {
      carY = targetY;
    } else {
      const diff = targetY - appCtx.car.y;
      if (Math.abs(diff) > 20 || Math.abs(diff) < 0.01) {
        carY = targetY;
      } else {
        const baseLerp = appCtx.car.onRoad ? 16 : 10;
        const speedBoost = Math.min(8, speedAbs * 0.08);
        const lerpRate = Math.min(1.0, dt * (baseLerp + speedBoost));
        carY = appCtx.car.y + diff * lerpRate;
      }
    }
    if (appCtx.car.onRoad && Number.isFinite(targetY) && carY < targetY - 0.04) {
      carY = targetY - 0.04;
    }
    appCtx.car.y = carY;
    appCtx.car.vy = 0;
    appCtx.car.isAirborne = false;
    appCtx.car._terrainAirTimer = 0;
    appCtx.car._lastSurfaceY = null;
  }

  appCtx.carMesh.position.set(appCtx.car.x, carY, appCtx.car.z);
  appCtx.carMesh.rotation.y = appCtx.car.angle;

  const wheelRot = appCtx.car.speed * dt * 0.5;
  appCtx.wheelMeshes.forEach((w) => w.rotation.x += wheelRot);

  appCtx.updateTrack();
  appCtx.updatePolice(dt);
  appCtx.updateMode(dt);
  appCtx.updateNearbyPOI();
  appCtx.updateNavigationRoute();

  if (!isPlanetarySurface() && !appCtx.worldLoading) {
    appCtx.updateTerrainAround(appCtx.car.x, appCtx.car.z);

    const now = performance.now();
    const rebuildInterval = appCtx.lastRoadRebuildCheck === 0 ? 500 : 2000;
    if (appCtx.roadsNeedRebuild && now - appCtx.lastRoadRebuildCheck > rebuildInterval) {
      appCtx.lastRoadRebuildCheck = now;
      appCtx.rebuildRoadsWithTerrain();
      appCtx.repositionBuildingsWithTerrain();
    }
  }
}

// Check for nearby POIs and display info

Object.assign(appCtx, {
  _getPhysRaycaster,
  _physRayDir,
  _physRayStart,
  checkBuildingCollision,
  getNearestRoadThrottled,
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
