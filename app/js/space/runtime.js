import { ctx as appCtx } from "../shared-context.js?v=55";
import {
  getAstronomicalBody,
  LANDING_MODE,
  normalizeAstronomicalBodyId
} from '../astronomy/body-catalog.js?v=1';
import { SPACE_CONSTANTS } from "./constants.js?v=1";

let injectedThree = null;
let math = null;

function createSpaceControlMath(three) {
  if (
    typeof three?.Vector3 !== 'function' ||
    typeof three?.Quaternion !== 'function' ||
    typeof three?.Matrix4 !== 'function'
  ) {
    throw new TypeError('Space runtime requires injected Three.js vector, quaternion, and matrix dependencies.');
  }
  return Object.freeze({
    forward: new three.Vector3(),
    targetPosition: new three.Vector3(),
    temporaryVector: new three.Vector3(),
    temporaryQuaternion: new three.Quaternion(),
    cameraQuaternion: new three.Quaternion(),
    cameraLookMatrix: new three.Matrix4(),
    gravityTemporary: new three.Vector3(),
    gravitySum: new three.Vector3(),
    launchRadial: new three.Vector3(),
    localForward: Object.freeze({ x: 0, y: 1, z: 0 }),
    controlRight: new three.Vector3(),
    controlUp: new three.Vector3(),
    controlYawAxis: new three.Vector3(),
    controlPitchAxis: new three.Vector3()
  });
}

export function configureSpaceRuntimeDependencies(dependencies = {}) {
  const three = dependencies.THREE || dependencies.three;
  if (three === injectedThree && math) return math;
  injectedThree = three;
  math = createSpaceControlMath(three);
  return math;
}

function getSpaceControlMath(dependencies = {}) {
  const three = dependencies.THREE || dependencies.three || injectedThree || globalThis.THREE;
  if (!math || three !== injectedThree) return configureSpaceRuntimeDependencies({ THREE: three });
  return math;
}

export function normalizeLandingTargetName(target) {
  const bodyId = normalizeAstronomicalBodyId(target);
  return bodyId ? getAstronomicalBody(bodyId)?.name || null : null;
}

export function findLandableBodyByName(target) {
  const normalized = normalizeLandingTargetName(target);
  if (!normalized) return null;
  if (appCtx.universeRuntime?.current?.id && appCtx.universeRuntime.current.id !== 'sol') return null;

  if (typeof appCtx.getAllSpaceBodies === 'function') {
    const body = appCtx.getAllSpaceBodies().find((b) => String(b.name).toLowerCase() === normalized.toLowerCase());
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
  getSpaceControlMath(deps);
  const three = deps.THREE || deps.three || injectedThree;

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
  const landingAxis = new three.Vector3(0, -1, 0);
  const toTarget = new three.Vector3();

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

    if (progress < 1) (deps.requestFrame || globalThis.requestAnimationFrame)(landingAnimation);
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
  if (appCtx.spacecraftState && typeof appCtx.requestRenderedJourneyLanding === 'function') {
    const result = appCtx.requestRenderedJourneyLanding(normalized);
    deps.showFlightMessage?.(
      result.accepted ? 'DESCENT GUIDANCE ENGAGED' : String(result.reason || 'LANDING NOT AVAILABLE').replaceAll('-', ' ').toUpperCase(),
      result.accepted ? '#10b981' : '#f59e0b'
    );
    return result.accepted;
  }
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

function integrateGravityVelocity(gravitySum) {
  if (!appCtx.spaceFlight.gravityVelocity) return;

  const frameScale = appCtx.spaceFlight._frameScale || 1;
  appCtx.spaceFlight.gravityVelocity.addScaledVector(gravitySum, frameScale);
  appCtx.spaceFlight.gravityVelocity.multiplyScalar(Math.pow(SPACE_CONSTANTS.GRAVITY_DAMPING, frameScale));
  if (appCtx.spaceFlight.gravityVelocity.length() > SPACE_CONSTANTS.MAX_GRAVITY_SPEED) {
    appCtx.spaceFlight.gravityVelocity.setLength(SPACE_CONSTANTS.MAX_GRAVITY_SPEED);
  }

  if (appCtx.spaceFlight._gravityVec) appCtx.spaceFlight._gravityVec.copy(gravitySum);
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
  const {
    gravitySum: _sfGravitySum,
    gravityTemporary: _sfGravityTmp
  } = getSpaceControlMath();
  if (!appCtx.spaceFlight.gravityVelocity || typeof appCtx.getAllSpaceBodies !== 'function') return;

  if (launchAssist && !isThrusting) {
    appCtx.spaceFlight.gravityVelocity.set(0, 0, 0);
    if (appCtx.spaceFlight._gravityVec) appCtx.spaceFlight._gravityVec.set(0, 0, 0);
    return;
  }

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
  integrateGravityVelocity(_sfGravitySum);
}

export function updateSpaceFlightPhysics() {
  if (appCtx.spaceFlight.mode !== 'flying') return;
  const {
    forward: _sfForward,
    gravitySum: _sfGravitySum,
    gravityTemporary: _sfGravityTmp,
    controlRight: _sfControlRight,
    controlUp: _sfControlUp,
    controlYawAxis: _sfControlYawAxis,
    controlPitchAxis: _sfControlPitchAxis,
    temporaryQuaternion: _sfTempQuat,
    temporaryVector: _sfTempVec
  } = getSpaceControlMath();

  const rocket = appCtx.spaceFlight.rocket;
  const keys = appCtx.spaceFlight.keys;
  const launchAssist = getLaunchAssistState(rocket);
  const frameScale = appCtx.spaceFlight._frameScale || 1;

  // Read the axes the player is looking through before applying either turn.
  // These remain continuous with the chase view and have no world-axis pole.
  _sfForward.set(0, 1, 0).applyQuaternion(rocket.quaternion).normalize();
  _sfControlRight.set(1, 0, 0).applyQuaternion(appCtx.spaceFlight.camera.quaternion);
  _sfControlRight.addScaledVector(_sfForward, -_sfControlRight.dot(_sfForward)).normalize();
  _sfControlUp.set(0, 1, 0).applyQuaternion(appCtx.spaceFlight.camera.quaternion);
  _sfControlUp.addScaledVector(_sfForward, -_sfControlUp.dot(_sfForward)).normalize();
  _sfControlYawAxis.crossVectors(_sfForward, _sfControlRight).normalize();
  _sfControlPitchAxis.crossVectors(_sfForward, _sfControlUp).normalize();

  if (keys['arrowleft'] || keys['arrowright']) {
    const yawDir = keys['arrowleft'] ? -1 : 1;
    _sfTempQuat.setFromAxisAngle(_sfControlYawAxis, SPACE_CONSTANTS.TURN_SPEED * yawDir * frameScale);
    rocket.quaternion.premultiply(_sfTempQuat);
  }

  if (keys['arrowup'] || keys['arrowdown']) {
    const pitchDir = keys['arrowup'] ? 1 : -1;
    _sfTempQuat.setFromAxisAngle(_sfControlPitchAxis, SPACE_CONSTANTS.PITCH_SPEED * pitchDir * frameScale);
    rocket.quaternion.premultiply(_sfTempQuat);
  }

  rocket.quaternion.normalize();

  const siRuntimeActive = appCtx.updateRenderedSpaceJourney?.({
    realDtS: frameScale / 60,
    throttle: keys[' '] ? 1 : 0,
    braking: !!keys['shift'] || appCtx.spaceFlight._atmosphericClimbRequested === true,
    thrustDirection: { x: _sfForward.x, y: _sfForward.y, z: _sfForward.z },
    timeScale: appCtx.spaceFlight.timeScale || 1
  }) === true;
  if (siRuntimeActive) {
    const environment = appCtx.spaceFlightEnvironment;
    const atmosphericFlight = environment?.pressurePa > 0.5 &&
      ['approach', 'atmospheric_exploration', 'descent', 'home_approach', 'home_descent'].includes(appCtx.spaceJourney?.phase);
    if (atmosphericFlight && appCtx.spaceFlight.scene) {
      const fogColors = {
        earth: 0x6f9fc4,
        mars: 0xb06a4e,
        venus: 0xc89155,
        jupiter: 0xc48a5a,
        saturn: 0xd0b57a,
        uranus: 0x7cc8d2,
        neptune: 0x315fa8
      };
      const fogColor = fogColors[environment.bodyId] || 0x8799aa;
      const giantAtmosphere = ['jupiter', 'saturn', 'uranus', 'neptune'].includes(environment.bodyId);
      const pressureRatio = Math.max(0, Math.min(1, environment.pressurePa / (
        environment.bodyId === 'mars' ? 610
          : environment.bodyId === 'venus' ? 9_200_000
            : giantAtmosphere ? 600_000
              : 101_325
      )));
      if (!appCtx.spaceFlight._journeyFogActive) {
        appCtx.spaceFlight.scene.fog = new THREE.FogExp2(fogColor, 0.0004);
        appCtx.spaceFlight._journeyFogActive = true;
      }
      appCtx.spaceFlight.scene.fog.color.setHex(fogColor);
      appCtx.spaceFlight.scene.fog.density = 0.00035 + pressureRatio * 0.0024;
    } else if (appCtx.spaceFlight._journeyFogActive && appCtx.spaceFlight.scene) {
      appCtx.spaceFlight.scene.fog = null;
      appCtx.spaceFlight._journeyFogActive = false;
    }
    const glow = rocket.getObjectByName('engineGlow');
    const exhaust = rocket.getObjectByName('exhaust');
    const thrustLevel = appCtx.spaceFlight._isThrusting ? 1 : 0.16;
    if (glow) {
      glow.material.opacity = 0.2 + thrustLevel * 0.6;
      glow.scale.y = 0.4 + thrustLevel * 0.6;
    }
    if (exhaust) {
      exhaust.children.forEach((particle) => {
        particle.material.opacity = 0.05 + thrustLevel * 0.35;
      });
    }
    return;
  }

  let isThrusting = false;
  if (keys[' ']) {
    const launchBoostMult = launchAssist ? SPACE_CONSTANTS.LAUNCH_BOOST_MULTIPLIER : 1;
    appCtx.spaceFlight.speed = Math.min(appCtx.spaceFlight.speed + SPACE_CONSTANTS.BOOST * launchBoostMult * frameScale, SPACE_CONSTANTS.MAX_SPEED);
    if (launchAssist) {
      appCtx.spaceFlight.speed = Math.max(appCtx.spaceFlight.speed, SPACE_CONSTANTS.LAUNCH_MIN_SPEED);
    }
    isThrusting = true;
  } else if (keys['shift']) {
    appCtx.spaceFlight.speed = Math.max(appCtx.spaceFlight.speed - SPACE_CONSTANTS.BRAKE * frameScale, 0);
  } else if (appCtx.spaceFlight.speed > 0) {
    if (appCtx.spaceFlight.speed > SPACE_CONSTANTS.CRUISE_SPEED) {
      appCtx.spaceFlight.speed = Math.max(appCtx.spaceFlight.speed - SPACE_CONSTANTS.DRIFT_RATE * frameScale, SPACE_CONSTANTS.CRUISE_SPEED);
    }
  }

  const nearBody = appCtx.spaceFlight._nearestBody;
  if (nearBody && nearBody.landable && nearBody.position) {
    const distToBody = rocket.position.distanceTo(nearBody.position);
    const inSlowZone = distToBody < SPACE_CONSTANTS.LANDING_DISTANCE + nearBody.radius + 180;
    if (inSlowZone) {
      const inLandingZone = distToBody < SPACE_CONSTANTS.LANDING_DISTANCE + nearBody.radius;
      const targetSpeed = inLandingZone ? 0.8 : 2.0;
      if (appCtx.spaceFlight.speed > targetSpeed) {
        appCtx.spaceFlight.speed = Math.max(targetSpeed, appCtx.spaceFlight.speed - SPACE_CONSTANTS.BRAKE * 1.2 * frameScale);
      }
    }
  }

  appCtx.spaceFlight._isThrusting = isThrusting;
  applyPlanetaryGravity(rocket, launchAssist, isThrusting);
  _sfForward.set(0, 1, 0).applyQuaternion(rocket.quaternion);
  appCtx.spaceFlight.velocity.copy(_sfForward).multiplyScalar(appCtx.spaceFlight.speed);
  if (appCtx.spaceFlight.gravityVelocity) {
    appCtx.spaceFlight.velocity.add(appCtx.spaceFlight.gravityVelocity);
  }
  rocket.position.addScaledVector(appCtx.spaceFlight.velocity, frameScale);

  const glow = rocket.getObjectByName('engineGlow');
  const exhaust = rocket.getObjectByName('exhaust');
  const thrustLevel = isThrusting ? 1.0 : appCtx.spaceFlight.speed / SPACE_CONSTANTS.MAX_SPEED;
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
        appCtx.spaceFlight.speed = Math.max(appCtx.spaceFlight.speed * 0.5, SPACE_CONSTANTS.MIN_SPEED);
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
    appCtx.spaceFlight.speed = Math.max(appCtx.spaceFlight.speed * 0.5, SPACE_CONSTANTS.MIN_SPEED);
    if (appCtx.spaceFlight.gravityVelocity) appCtx.spaceFlight.gravityVelocity.multiplyScalar(0.35);
  }
}

export function updateSpaceFlightCamera() {
  const {
    cameraLookMatrix,
    cameraQuaternion,
    forward: _sfForward,
    launchRadial: _sfLaunchRadial,
    targetPosition: _sfTargetPos,
    temporaryVector: _sfTempVec
  } = getSpaceControlMath();
  const rocket = appCtx.spaceFlight.rocket;
  if (appCtx.spaceFlight.overviewMode) {
    if (appCtx.spaceFlight.overviewMode === 'inner') _sfTargetPos.set(0, 5600, 7200);
    else _sfTargetPos.set(0, 52000, 68000);
    appCtx.spaceFlight.camera.position.lerp(_sfTargetPos, 0.08);
    appCtx.spaceFlight.camera.up.set(0, 1, 0);
    _sfTempVec.set(0, 0, 0);
    cameraLookMatrix.lookAt(appCtx.spaceFlight.camera.position, _sfTempVec, appCtx.spaceFlight.camera.up);
    cameraQuaternion.setFromRotationMatrix(cameraLookMatrix);
    appCtx.spaceFlight.camera.quaternion.slerp(cameraQuaternion, 0.045).normalize();
    return;
  }
  _sfForward.set(0, 1, 0).applyQuaternion(rocket.quaternion);
  _sfTempVec.set(0, 0, -1).applyQuaternion(rocket.quaternion);
  const launchBody = findLandableBodyByName(appCtx.spaceFlight._launchSource);
  const launchAltitude = launchBody?.position && Number.isFinite(launchBody.radius)
    ? rocket.position.distanceTo(launchBody.position) - launchBody.radius
    : Infinity;
  if (appCtx.spaceFlight.mode === 'launching' && launchBody?.position && launchAltitude < 180) {
    _sfLaunchRadial.copy(rocket.position).sub(launchBody.position).normalize();
    _sfTargetPos.copy(rocket.position)
      .addScaledVector(_sfLaunchRadial, 48)
      .addScaledVector(_sfTempVec, 24);
  } else {
    _sfTargetPos.copy(rocket.position)
      .addScaledVector(_sfForward, -70)
      .addScaledVector(_sfTempVec, 25);
  }

  appCtx.spaceFlight.camera.position.lerp(_sfTargetPos, 0.1);
  // Follow the spacecraft's transported up vector rather than a fixed world-up
  // pole. Physics reads the resulting camera axes, so arrows retain the same
  // visible direction through every world-axis crossing.
  appCtx.spaceFlight.camera.up.copy(_sfTempVec);
  cameraLookMatrix.lookAt(appCtx.spaceFlight.camera.position, rocket.position, _sfTempVec);
  cameraQuaternion.setFromRotationMatrix(cameraLookMatrix);
  appCtx.spaceFlight.camera.quaternion.slerp(cameraQuaternion, 0.045).normalize();
}

export function animateSpaceFlight(deps = {}) {
  if (!appCtx.spaceFlight.active) return;

  const requestFrame = deps.requestFrame || globalThis.requestAnimationFrame;
  appCtx.spaceFlight.animationId = requestFrame(() => animateSpaceFlight(deps));

  const frameNow = performance.now();
  const previousFrame = appCtx.spaceFlight._lastFrameMs || frameNow - (1000 / 60);
  appCtx.spaceFlight._frameScale = Math.min(2.5, Math.max(0.25, (frameNow - previousFrame) / (1000 / 60)));
  appCtx.spaceFlight._lastFrameMs = frameNow;

  if (appCtx.spaceFlight.earth) appCtx.spaceFlight.earth.rotation.y += 0.0005 * appCtx.spaceFlight._frameScale;
  if (appCtx.spaceFlight.moon) appCtx.spaceFlight.moon.rotation.y += 0.0002 * appCtx.spaceFlight._frameScale;

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
  if (
    appCtx.spaceJourney?.phase === 'atmospheric_exploration' &&
    typeof appCtx.requestRenderedAtmosphericDeparture === 'function'
  ) {
    const result = appCtx.requestRenderedAtmosphericDeparture();
    deps.showFlightMessage?.(
      result.accepted ? 'RETURN FLIGHT ENGAGED' : String(result.reason || 'RETURN FLIGHT NOT AVAILABLE').replaceAll('-', ' ').toUpperCase(),
      result.accepted ? '#10b981' : '#f59e0b'
    );
    return result.accepted;
  }
  if (appCtx.spacecraftState && typeof appCtx.requestRenderedJourneyLanding === 'function') {
    const targetName = normalizeLandingTargetName(
      appCtx.spaceFlight._manualLandingTarget || appCtx.spaceFlight.destination
    );
    if (!targetName) return false;
    const targetBody = getAstronomicalBody(targetName);
    if (
      targetBody?.exploration?.landingMode === LANDING_MODE.ATMOSPHERIC_DESCENT &&
      typeof appCtx.requestRenderedAtmosphericEntry === 'function'
    ) {
      const result = appCtx.requestRenderedAtmosphericEntry(targetName);
      deps.showFlightMessage?.(
        result.accepted ? 'ATMOSPHERIC FLIGHT ENGAGED' : String(result.reason || 'ATMOSPHERIC ENTRY NOT AVAILABLE').replaceAll('-', ' ').toUpperCase(),
        result.accepted ? '#10b981' : '#f59e0b'
      );
      return result.accepted;
    }
    const result = appCtx.requestRenderedJourneyLanding(targetName);
    deps.showFlightMessage?.(
      result.accepted ? 'DESCENT GUIDANCE ENGAGED' : String(result.reason || 'LANDING NOT AVAILABLE').replaceAll('-', ' ').toUpperCase(),
      result.accepted ? '#10b981' : '#f59e0b'
    );
    return result.accepted;
  }
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
