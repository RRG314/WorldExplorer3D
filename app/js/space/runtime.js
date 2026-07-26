import { ctx as appCtx } from "../shared-context.js?v=55";
import { SPACE_CONSTANTS } from "./constants.js?v=1";

const _sfForward = new THREE.Vector3();
const _sfTargetPos = new THREE.Vector3();
const _sfTempVec = new THREE.Vector3();
const _sfTempQuat = new THREE.Quaternion();
const _sfGravityTmp = new THREE.Vector3();
const _sfGravitySum = new THREE.Vector3();
const _sfLaunchRadial = new THREE.Vector3();

export function normalizeLandingTargetName(target) {
  const t = String(target || '').trim().toLowerCase();
  if (t === 'earth') return 'Earth';
  if (t === 'moon') return 'Moon';
  if (t === 'mars') return 'Mars';
  return null;
}

export function findLandableBodyByName(target) {
  const normalized = normalizeLandingTargetName(target);
  if (!normalized) return null;
  if (appCtx.universeRuntime?.current?.id && appCtx.universeRuntime.current.id !== 'sol') return null;

  if (typeof appCtx.getAllSpaceBodies === 'function') {
    const body = appCtx.getAllSpaceBodies().find((b) => b.landable && String(b.name).toLowerCase() === normalized.toLowerCase());
    if (body) return body;
  }

  if (normalized === 'Earth' && appCtx.spaceFlight.earth) {
    return {
      name: 'Earth',
      mesh: appCtx.spaceFlight.earth,
      position: appCtx.spaceFlight.earth.position,
      radius: SPACE_CONSTANTS.EARTH_SIZE,
      landable: true
    };
  }
  if (normalized === 'Moon' && appCtx.spaceFlight.moon) {
    return {
      name: 'Moon',
      mesh: appCtx.spaceFlight.moon,
      position: appCtx.spaceFlight.moon.position,
      radius: SPACE_CONSTANTS.MOON_SIZE,
      landable: true
    };
  }
  return null;
}

export function startLandingSequence(targetMesh, targetRadius, targetName, deps = {}, landingDuration = 2000) {
  if (!targetMesh || !appCtx.spaceFlight.rocket) return false;

  const sessionId = appCtx.spaceFlight._sessionId;
  appCtx.spaceFlight.mode = 'landing';
  appCtx.spaceFlight._landingTarget = targetName;
  appCtx.spaceFlight._autopilotTarget = null;
  deps.showFlightMessage?.('LANDING SEQUENCE INITIATED', '#10b981');

  const startTime = Date.now();
  const startPos = appCtx.spaceFlight.rocket.position.clone();
  const landPos = targetMesh.position.clone();
  landPos.y += targetRadius + 10;
  const frozenTargetPos = targetMesh.position.clone();
  const duration = Math.max(1200, landingDuration);
  const landingAxis = new THREE.Vector3(0, -1, 0);
  const toTarget = new THREE.Vector3();
  const scheduleFrame = typeof deps.scheduleFrame === 'function'
    ? deps.scheduleFrame
    : (callback) => requestAnimationFrame(callback);

  function landingAnimation() {
    if (
      !appCtx.spaceFlight.active ||
      appCtx.spaceFlight._sessionId !== sessionId ||
      appCtx.spaceFlight.mode !== 'landing'
    ) return;
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);

    appCtx.spaceFlight.rocket.position.lerpVectors(startPos, landPos, eased);
    appCtx.spaceFlight.velocity.multiplyScalar(0.9);
    if (appCtx.spaceFlight.gravityVelocity) appCtx.spaceFlight.gravityVelocity.multiplyScalar(0.85);

    toTarget.copy(frozenTargetPos).sub(appCtx.spaceFlight.rocket.position).normalize();
    appCtx.spaceFlight.rocket.quaternion.setFromUnitVectors(landingAxis, toTarget);

    if (progress < 1) scheduleFrame(landingAnimation);
    else deps.completeLanding?.(sessionId);
  }

  landingAnimation();
  return true;
}

export function setSpaceFlightLandingTarget(target, options = {}, deps = {}) {
  if (!appCtx.spaceFlight.active || !appCtx.spaceFlight.rocket) return false;

  const normalized = normalizeLandingTargetName(target);
  if (!normalized) return false;
  if (appCtx.universeRuntime?.current?.id && appCtx.universeRuntime.current.id !== 'sol') {
    if (normalized === 'Earth') return Boolean(appCtx.returnToEarthFromUniverse?.());
    deps.showFlightMessage?.('RETURN TO SOL BEFORE PLANETARY LANDING', '#8ab4ff');
    return false;
  }

  const body = findLandableBodyByName(normalized);
  if (!body) return false;

  appCtx.spaceFlight.destination = normalized.toLowerCase();
  appCtx.spaceFlight._manualLandingTarget = normalized;
  appCtx.spaceFlight._autopilotTarget = null;

  const dist = appCtx.spaceFlight.rocket.position.distanceTo(body.position);
  const canLandNow = dist < SPACE_CONSTANTS.LANDING_DISTANCE + body.radius;

  if ((options.autoLand || options.force) && appCtx.spaceFlight.mode !== 'landing' && (canLandNow || options.force)) {
    const dynamicDuration = options.force
      ? Math.min(6500, Math.max(1800, Math.floor(dist * 4)))
      : 2000;
    return startLandingSequence(body.mesh, body.radius, body.name, deps, dynamicDuration);
  }

  deps.showFlightMessage?.(`TARGET SET: ${normalized.toUpperCase()}`, '#10b981');
  return true;
}

export function forceSpaceFlightLanding(target, deps = {}) {
  if (!appCtx.spaceFlight.active || !appCtx.spaceFlight.rocket || appCtx.spaceFlight.mode === 'landing') return false;
  const normalized = normalizeLandingTargetName(target);
  if (!normalized) return false;
  if (appCtx.universeRuntime?.current?.id && appCtx.universeRuntime.current.id !== 'sol') {
    if (normalized === 'Earth') return Boolean(appCtx.returnToEarthFromUniverse?.());
    deps.showFlightMessage?.('RETURN TO SOL BEFORE PLANETARY LANDING', '#8ab4ff');
    return false;
  }

  const body = findLandableBodyByName(normalized);
  if (!body || !body.mesh || !body.position) return false;

  appCtx.spaceFlight.destination = normalized.toLowerCase();
  appCtx.spaceFlight._manualLandingTarget = normalized;
  appCtx.spaceFlight._autopilotTarget = null;

  const dist = appCtx.spaceFlight.rocket.position.distanceTo(body.position);
  const duration = Math.min(7000, Math.max(1800, Math.floor(dist * 4.2)));
  return startLandingSequence(body.mesh, body.radius, body.name, deps, duration);
}

function nearestLandableDistance(rocket, bodies) {
  let minDist = Infinity;
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    if (!b.landable || !b.position) continue;
    const d = rocket.position.distanceTo(b.position);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

function sunGravityWeightByLocalBodies(nearestLandableDist) {
  if (!Number.isFinite(nearestLandableDist)) return 1.0;
  if (nearestLandableDist <= 2200) return 0;
  if (nearestLandableDist >= 7000) return 1.0;
  return (nearestLandableDist - 2200) / (7000 - 2200);
}

function sunGravityRangeByLocalBodies(nearestLandableDist) {
  if (!Number.isFinite(nearestLandableDist)) return 35000;
  if (nearestLandableDist <= 2200) return 0;
  if (nearestLandableDist >= 7000) return 35000;
  const t = sunGravityWeightByLocalBodies(nearestLandableDist);
  return 9000 + t * (35000 - 9000);
}

function bodyGravityRange(body, nearestLandableDist) {
  if (!body || !body.name) return 0;
  if (body.name === 'Sun') return sunGravityRangeByLocalBodies(nearestLandableDist);
  return Math.max((body.radius || 20) * 95, 900);
}

function bodyGravityScale(body, nearestLandableDist) {
  if (!body || !body.name) return 1;
  if (body.name === 'Sun') return sunGravityWeightByLocalBodies(nearestLandableDist);
  return 1;
}

function computeBodyGravityAccel(body, distSq, nearestLandableDist) {
  const mu = getBodyGravityMu(body);
  if (mu <= 0) return 0;

  const scale = bodyGravityScale(body, nearestLandableDist);
  if (scale <= 0) return 0;

  const accel = mu / (distSq + SPACE_CONSTANTS.GRAVITY_SOFTENING);
  return Math.min(SPACE_CONSTANTS.MAX_GRAVITY_ACCEL, accel * scale);
}

function clampTotalGravity(sumVec) {
  if (sumVec && sumVec.length() > SPACE_CONSTANTS.MAX_TOTAL_GRAVITY_ACCEL) {
    sumVec.setLength(SPACE_CONSTANTS.MAX_TOTAL_GRAVITY_ACCEL);
  }
}

function integrateGravityVelocity() {
  if (!appCtx.spaceFlight.gravityVelocity) return;

  const frameScale = appCtx.spaceFlight._frameScale || 1;
  appCtx.spaceFlight.gravityVelocity.addScaledVector(_sfGravitySum, frameScale);
  appCtx.spaceFlight.gravityVelocity.multiplyScalar(Math.pow(SPACE_CONSTANTS.GRAVITY_DAMPING, frameScale));
  if (appCtx.spaceFlight.gravityVelocity.length() > SPACE_CONSTANTS.MAX_GRAVITY_SPEED) {
    appCtx.spaceFlight.gravityVelocity.setLength(SPACE_CONSTANTS.MAX_GRAVITY_SPEED);
  }

  if (appCtx.spaceFlight._gravityVec) appCtx.spaceFlight._gravityVec.copy(_sfGravitySum);
  return true;
}

function getBodyGravityMu(body) {
  const name = String(body?.name || '').toLowerCase();
  if (name === 'sun') return 3200;
  if (name === 'jupiter') return 5600;
  if (name === 'saturn') return 3900;
  if (name === 'neptune') return 2500;
  if (name === 'uranus') return 2300;
  if (name === 'earth') return 1800;
  if (name === 'venus') return 1400;
  if (name === 'mars') return 900;
  if (name === 'mercury') return 700;
  if (name === 'moon') return 300;
  if (body?.landable) return 600;
  return 0;
}

function shouldApplyGravityFromBody(body) {
  if (appCtx.universeRuntime?.current?.id && appCtx.universeRuntime.current.id !== 'sol') return false;
  if (!body || !body.position) return false;
  const name = String(body.name || '').toLowerCase();
  if (name === 'sun') return true;
  if (body.landable) return true;
  return name === 'mercury' ||
    name === 'venus' ||
    name === 'mars' ||
    name === 'jupiter' ||
    name === 'saturn' ||
    name === 'uranus' ||
    name === 'neptune';
}

function getLaunchAssistState(rocket) {
  if (!rocket || !appCtx.spaceFlight._launchSource) return null;
  const source = findLandableBodyByName(appCtx.spaceFlight._launchSource);
  if (!source || !source.position || !Number.isFinite(source.radius)) return null;

  const elapsedMs = Math.max(0, Date.now() - (appCtx.spaceFlight.launchStartMs || Date.now()));
  const dist = rocket.position.distanceTo(source.position);
  const altitude = Math.max(0, dist - source.radius);
  const altitudeFactor = Math.max(0, 1 - altitude / SPACE_CONSTANTS.LAUNCH_ASSIST_ALTITUDE);
  const timeFactor = Math.max(0, 1 - elapsedMs / SPACE_CONSTANTS.LAUNCH_ASSIST_WINDOW_MS);
  const strength = Math.max(altitudeFactor, timeFactor);
  if (strength <= 0) return null;

  return {
    source,
    sourceNameLower: String(source.name || '').toLowerCase(),
    altitude,
    elapsedMs,
    strength
  };
}

function applyPlanetaryGravity(rocket, launchAssist, isThrusting) {
  if (!appCtx.spaceFlight.gravityVelocity || typeof appCtx.getAllSpaceBodies !== 'function') return;

  const bodies = appCtx.getAllSpaceBodies();
  const nearLandableDist = nearestLandableDistance(rocket, bodies);
  _sfGravitySum.set(0, 0, 0);

  for (let i = 0; i < bodies.length; i++) {
    const body = bodies[i];
    if (!shouldApplyGravityFromBody(body)) continue;

    _sfGravityTmp.copy(body.position).sub(rocket.position);
    const distSq = _sfGravityTmp.lengthSq();
    if (distSq < 1) continue;

    const dist = Math.sqrt(distSq);
    const range = bodyGravityRange(body, nearLandableDist);
    if (dist > range) continue;

    let accel = computeBodyGravityAccel(body, distSq, nearLandableDist);
    if (launchAssist && accel > 0) {
      const bodyName = String(body.name || '').toLowerCase();
      if (bodyName === 'sun') {
        accel *= SPACE_CONSTANTS.LAUNCH_SUN_GRAVITY_SCALE;
      } else if (isThrusting && launchAssist.sourceNameLower && bodyName === launchAssist.sourceNameLower) {
        const attenuatedScale = 1 - launchAssist.strength * (1 - SPACE_CONSTANTS.LAUNCH_SOURCE_MIN_GRAVITY_SCALE);
        accel *= Math.max(SPACE_CONSTANTS.LAUNCH_SOURCE_MIN_GRAVITY_SCALE, attenuatedScale);
      }
    }
    if (accel <= 0) continue;
    _sfGravityTmp.multiplyScalar(1 / dist);
    _sfGravitySum.addScaledVector(_sfGravityTmp, accel);
  }

  if (launchAssist && isThrusting && launchAssist.source?.position) {
    _sfGravityTmp.copy(rocket.position).sub(launchAssist.source.position);
    const outLen = _sfGravityTmp.length();
    if (outLen > 1e-3) {
      _sfGravityTmp.multiplyScalar(1 / outLen);
      _sfGravitySum.addScaledVector(_sfGravityTmp, SPACE_CONSTANTS.LAUNCH_ASSIST_ACCEL * launchAssist.strength);
    }
  }

  clampTotalGravity(_sfGravitySum);
  integrateGravityVelocity();
}

export function updateSpaceFlightPhysics() {
  if (appCtx.spaceFlight.mode !== 'flying') return;

  const rocket = appCtx.spaceFlight.rocket;
  const keys = appCtx.spaceFlight.keys;
  const launchAssist = getLaunchAssistState(rocket);
  const cam = appCtx.spaceFlight.camera;
  const frameScale = appCtx.spaceFlight._frameScale || 1;

  if (keys['arrowleft'] || keys['arrowright']) {
    _sfTempVec.setFromMatrixColumn(cam.matrixWorld, 1).normalize();
    const yawDir = keys['arrowleft'] ? 1 : -1;
    _sfTempQuat.setFromAxisAngle(_sfTempVec, SPACE_CONSTANTS.TURN_SPEED * yawDir * frameScale);
    rocket.quaternion.premultiply(_sfTempQuat);
  }

  if (keys['arrowup'] || keys['arrowdown']) {
    _sfTempVec.setFromMatrixColumn(cam.matrixWorld, 0).normalize();
    const pitchDir = keys['arrowup'] ? 1 : -1;
    _sfTempQuat.setFromAxisAngle(_sfTempVec, SPACE_CONSTANTS.PITCH_SPEED * pitchDir * frameScale);
    rocket.quaternion.premultiply(_sfTempQuat);
  }

  rocket.quaternion.normalize();

  _sfTempVec.set(1, 0, 0).applyQuaternion(rocket.quaternion);
  const rollError = _sfTempVec.y;
  if (Math.abs(rollError) > 0.01) {
    _sfForward.set(0, 1, 0).applyQuaternion(rocket.quaternion);
    _sfTempQuat.setFromAxisAngle(_sfForward, -rollError * 0.06 * frameScale);
    rocket.quaternion.premultiply(_sfTempQuat);
    rocket.quaternion.normalize();
  }

  _sfForward.set(0, 1, 0).applyQuaternion(rocket.quaternion).normalize();
  const driveVelocity = appCtx.spaceFlight.velocity;
  if (driveVelocity.lengthSq() < 1e-6 && appCtx.spaceFlight.speed > 0) {
    driveVelocity.copy(_sfForward).multiplyScalar(appCtx.spaceFlight.speed);
  }

  let isThrusting = false;
  if (keys[' ']) {
    const launchBoostMult = launchAssist ? SPACE_CONSTANTS.LAUNCH_BOOST_MULTIPLIER : 1;
    driveVelocity.addScaledVector(_sfForward, SPACE_CONSTANTS.BOOST * launchBoostMult * frameScale);
    if (launchAssist && driveVelocity.length() < SPACE_CONSTANTS.LAUNCH_MIN_SPEED) {
      driveVelocity.copy(_sfForward).multiplyScalar(SPACE_CONSTANTS.LAUNCH_MIN_SPEED);
    }
    if (driveVelocity.length() > SPACE_CONSTANTS.MAX_SPEED) driveVelocity.setLength(SPACE_CONSTANTS.MAX_SPEED);
    isThrusting = true;
  } else if (keys['shift'] && driveVelocity.lengthSq() > 1e-6) {
    const nextSpeed = Math.max(0, driveVelocity.length() - SPACE_CONSTANTS.BRAKE * frameScale);
    if (nextSpeed === 0) driveVelocity.set(0, 0, 0);
    else driveVelocity.setLength(nextSpeed);
  }

  const nearBody = appCtx.spaceFlight._nearestBody;
  if (nearBody && nearBody.landable && nearBody.position) {
    const distToBody = rocket.position.distanceTo(nearBody.position);
    const inSlowZone = distToBody < SPACE_CONSTANTS.LANDING_DISTANCE + nearBody.radius + 180;
    if (inSlowZone) {
      const inLandingZone = distToBody < SPACE_CONSTANTS.LANDING_DISTANCE + nearBody.radius;
      const targetSpeed = inLandingZone ? 0.8 : 2.0;
      if (driveVelocity.length() > targetSpeed) {
        driveVelocity.setLength(Math.max(targetSpeed, driveVelocity.length() - SPACE_CONSTANTS.BRAKE * 1.2 * frameScale));
      }
    }
  }

  appCtx.spaceFlight._isThrusting = isThrusting;
  applyPlanetaryGravity(rocket, launchAssist, isThrusting);
  appCtx.spaceFlight.speed = driveVelocity.length();
  rocket.position.addScaledVector(driveVelocity, frameScale);
  if (appCtx.spaceFlight.gravityVelocity) {
    rocket.position.addScaledVector(appCtx.spaceFlight.gravityVelocity, frameScale);
  }

  const glow = rocket.getObjectByName('engineGlow');
  const exhaust = rocket.getObjectByName('exhaust');
  const thrustLevel = isThrusting ? 1.0 : 0;
  if (glow) {
    glow.material.opacity = 0.2 + thrustLevel * 0.6;
    glow.scale.y = 0.4 + thrustLevel * 0.6 + (isThrusting ? Math.random() * 0.3 : 0);
  }
  if (exhaust) {
    exhaust.children.forEach((p) => {
      p.material.opacity = 0.05 + thrustLevel * 0.35 + (isThrusting ? Math.random() * 0.3 : 0);
      if (thrustLevel > 0.3) {
        p.position.y = -10 - Math.random() * 8;
        p.scale.setScalar(0.3 + thrustLevel * 0.7);
      }
    });
  }

  if (typeof appCtx.getAllSpaceBodies === 'function' && appCtx.universeRuntime?.current?.id !== 'sol') {
    return;
  }

  if (typeof appCtx.getAllSpaceBodies === 'function') {
    const bodies = appCtx.getAllSpaceBodies();
    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i];
      const dist = rocket.position.distanceTo(body.position);
      const minDist = body.radius + 5;
      if (dist < minDist) {
        _sfTempVec.copy(rocket.position).sub(body.position).normalize().multiplyScalar(minDist);
        rocket.position.copy(body.position).add(_sfTempVec);
        if (driveVelocity.lengthSq() > 1e-6) {
          driveVelocity.setLength(Math.max(driveVelocity.length() * 0.5, SPACE_CONSTANTS.MIN_SPEED));
        }
        appCtx.spaceFlight.speed = driveVelocity.length();
        if (appCtx.spaceFlight.gravityVelocity) appCtx.spaceFlight.gravityVelocity.multiplyScalar(0.35);
      }
    }
    return;
  }

  const source = appCtx.spaceFlight.destination === 'moon' ? appCtx.spaceFlight.earth : appCtx.spaceFlight.moon;
  const sourceRadius = appCtx.spaceFlight.destination === 'moon' ? SPACE_CONSTANTS.EARTH_SIZE : SPACE_CONSTANTS.MOON_SIZE;
  const sourceDist = rocket.position.distanceTo(source.position);
  if (sourceDist < sourceRadius + 5) {
    _sfTempVec.copy(rocket.position).sub(source.position).normalize().multiplyScalar(sourceRadius + 5);
    rocket.position.copy(source.position).add(_sfTempVec);
    if (driveVelocity.lengthSq() > 1e-6) {
      driveVelocity.setLength(Math.max(driveVelocity.length() * 0.5, SPACE_CONSTANTS.MIN_SPEED));
    }
    appCtx.spaceFlight.speed = driveVelocity.length();
    if (appCtx.spaceFlight.gravityVelocity) appCtx.spaceFlight.gravityVelocity.multiplyScalar(0.35);
  }
}

export function updateSpaceFlightCamera() {
  const rocket = appCtx.spaceFlight.rocket;
  if (appCtx.spaceFlight.overviewMode) {
    if (appCtx.spaceFlight.overviewMode === 'inner') _sfTargetPos.set(0, 5600, 7200);
    else _sfTargetPos.set(0, 52000, 68000);
    appCtx.spaceFlight.camera.position.lerp(_sfTargetPos, 0.2);
    appCtx.spaceFlight.camera.up.set(0, 1, 0);
    appCtx.spaceFlight.camera.lookAt(0, 0, 0);
    return;
  }
  _sfForward.set(0, 1, 0).applyQuaternion(rocket.quaternion);
  _sfTempVec.set(0, 0, -1).applyQuaternion(rocket.quaternion);
  const launchBody = findLandableBodyByName(appCtx.spaceFlight._launchSource);
  const launchAltitude = launchBody?.position && Number.isFinite(launchBody.radius)
    ? rocket.position.distanceTo(launchBody.position) - launchBody.radius
    : Infinity;
  if (launchBody?.position && launchAltitude < 180) {
    _sfLaunchRadial.copy(rocket.position).sub(launchBody.position).normalize();
    _sfTargetPos.copy(rocket.position)
      .addScaledVector(_sfLaunchRadial, 135)
      .addScaledVector(_sfTempVec, 58);
  } else {
    _sfTargetPos.copy(rocket.position)
      .addScaledVector(_sfForward, -165)
      .addScaledVector(_sfTempVec, 62);
  }

  appCtx.spaceFlight.camera.position.lerp(_sfTargetPos, 0.1);
  appCtx.spaceFlight.camera.up.copy(_sfTempVec);
  appCtx.spaceFlight.camera.lookAt(rocket.position);
}

export function animateSpaceFlight(deps = {}) {
  if (!appCtx.spaceFlight.active) return;

  if (document.hidden) {
    appCtx.spaceFlight.animationId = null;
    appCtx.spaceFlight._lastFrameMs = performance.now();
    return;
  }
  appCtx.spaceFlight.animationId = deps.scheduleFrame?.(() => animateSpaceFlight(deps)) ?? null;
  if (appCtx.spaceFlight.animationId == null) {
    appCtx.spaceFlight.active = false;
    return;
  }

  const frameNow = performance.now();
  const previousFrame = appCtx.spaceFlight._lastFrameMs || frameNow - (1000 / 60);
  appCtx.spaceFlight._frameScale = Math.min(2.5, Math.max(0.25, (frameNow - previousFrame) / (1000 / 60)));
  appCtx.spaceFlight._lastFrameMs = frameNow;

  const elapsedHours = Date.now() / 3600000;
  if (appCtx.spaceFlight.earth) {
    appCtx.spaceFlight.earth.rotation.y = (elapsedHours / 23.9345 * Math.PI * 2) % (Math.PI * 2);
  }
  if (appCtx.spaceFlight.moon) {
    appCtx.spaceFlight.moon.rotation.y = (elapsedHours / 655.7199 * Math.PI * 2) % (Math.PI * 2);
  }

  [appCtx.spaceFlight.earth, appCtx.spaceFlight.moon].forEach((body) => {
    if (!body) return;
    const ring = body.getObjectByName('landingRing');
    if (ring) {
      ring.material.opacity = 0.4 + Math.sin(Date.now() * 0.003) * 0.3;
    }
  });

  if (appCtx.spaceFlight.mode !== 'landing') {
    if (typeof appCtx.getEarthHelioScenePosition === 'function' && appCtx.spaceFlight.earth) {
      const earthPos = appCtx.getEarthHelioScenePosition();
      appCtx.spaceFlight.earth.position.lerp(earthPos, 0.01);

      if (typeof appCtx.getMoonScenePosition === 'function' && appCtx.spaceFlight.moon) {
        const moonPos = appCtx.getMoonScenePosition(appCtx.spaceFlight.earth.position);
        appCtx.spaceFlight.moon.position.copy(moonPos);
      }
    }
  }

  if (typeof appCtx.updateSolarSystem === 'function') {
    appCtx.updateSolarSystem();
  }

  appCtx.updateUniverseRuntime?.(appCtx.spaceFlight._frameScale / 60);
  updateSpaceFlightPhysics();
  deps.updateSpaceFlightHUD?.(findLandableBodyByName);
  updateSpaceFlightCamera();

  if (appCtx.spaceFlight.renderer && appCtx.spaceFlight.scene && appCtx.spaceFlight.camera) {
    appCtx.spaceFlight.renderer.render(appCtx.spaceFlight.scene, appCtx.spaceFlight.camera);
  }
}

export function attemptLanding(deps = {}) {
  let target = null;
  let targetRadius = 0;
  let targetName = '';
  const forcedTarget = normalizeLandingTargetName(appCtx.spaceFlight._manualLandingTarget);

  if (forcedTarget) {
    const forcedBody = findLandableBodyByName(forcedTarget);
    if (forcedBody && forcedBody.mesh && forcedBody.position) {
      target = forcedBody.mesh;
      targetRadius = forcedBody.radius;
      targetName = forcedBody.name;
      const forcedDist = appCtx.spaceFlight.rocket.position.distanceTo(forcedBody.position);
      if (forcedDist >= SPACE_CONSTANTS.LANDING_DISTANCE + targetRadius) return;
    }
  }

  if (!target) {
    if (typeof appCtx.getAllSpaceBodies === 'function') {
      const bodies = appCtx.getAllSpaceBodies();
      let nearestDist = Infinity;
      bodies.forEach((body) => {
        if (!body.landable) return;
        const dist = appCtx.spaceFlight.rocket.position.distanceTo(body.position);
        if (dist < nearestDist) {
          nearestDist = dist;
          target = body.mesh;
          targetRadius = body.radius;
          targetName = body.name;
        }
      });

      if (!target || nearestDist >= SPACE_CONSTANTS.LANDING_DISTANCE + targetRadius) return;
    } else {
      target = appCtx.spaceFlight.destination === 'moon' ? appCtx.spaceFlight.moon : appCtx.spaceFlight.earth;
      targetRadius = appCtx.spaceFlight.destination === 'moon' ? SPACE_CONSTANTS.MOON_SIZE : SPACE_CONSTANTS.EARTH_SIZE;
      targetName = appCtx.spaceFlight.destination === 'moon' ? 'Moon' : 'Earth';
      const dist = appCtx.spaceFlight.rocket.position.distanceTo(target.position);
      if (dist >= SPACE_CONSTANTS.LANDING_DISTANCE + targetRadius) return;
    }
  }

  return startLandingSequence(target, targetRadius, targetName, deps, 2000);
}
