import { ctx as appCtx } from '../shared-context.js?v=55';
import { getMaritimeCatalogEntry } from '../transport/maritime-catalog.js?v=1';

function clampValue(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerpValue(a, b, t) {
  return a + (b - a) * t;
}

function normalizeHeading(angle = 0) {
  let value = Number(angle) || 0;
  while (value <= -Math.PI) value += Math.PI * 2;
  while (value > Math.PI) value -= Math.PI * 2;
  return value;
}

function shortestHeadingDelta(target = 0, current = 0) {
  return normalizeHeading(target - current);
}

function expBlend(dt, rate, min = 0.04, max = 0.32) {
  return clampValue(1 - Math.exp(-Math.max(0, dt) * rate), min, max);
}

function normalizeVec3(x = 0, y = 1, z = 0) {
  const len = Math.hypot(x, y, z) || 1;
  return { x: x / len, y: y / len, z: z / len };
}

function resolveBoatCameraFraming(input = {}) {
  const fishingOpen = input.fishingOpen === true;
  const waterKind = String(input.waterKind || '').toLowerCase();
  const narrowWater = waterKind === 'harbor' || waterKind === 'channel';
  const classLength = Math.max(1, Number(input.classLength) || 1);
  const classHeight = Math.max(1, Number(input.classHeight) || 1);
  const speedNorm = clampValue(Number(input.speedNorm) || 0, 0, 1.4);
  const waveIntensity = clampValue(Number(input.waveIntensity) || 0, 0, 1);
  if (fishingOpen) {
    return Object.freeze({
      chaseDistance: Math.max(6.4, classLength * .38) + waveIntensity * .45,
      chaseHeight: Math.max(3.25, classHeight * .34) + waveIntensity * .52,
      lookAhead: Math.max(1.8, classLength * .12),
      classLength,
      classHeight,
      narrowWater
    });
  }
  if (narrowWater) {
    const largeVessel = classLength >= 60;
    if (largeVessel) {
      return Object.freeze({
        chaseDistance: classLength * .53 + 10 + speedNorm * 8 + waveIntensity * .6,
        chaseHeight: Math.max(classHeight * .82, Math.min(30, classLength * .1)) + waveIntensity * .55,
        lookAhead: classLength * .52 + 26 + speedNorm * 18,
        classLength,
        classHeight,
        narrowWater
      });
    }
    return Object.freeze({
      chaseDistance: Math.max(9.2, Math.min(36, classLength * .46)) + speedNorm * Math.min(4.8, classLength * .035) + waveIntensity * .45,
      chaseHeight: Math.max(4.8, Math.min(17, classHeight * .66)) + waveIntensity * .55,
      lookAhead: Math.max(10, Math.min(52, classLength * .28)) + speedNorm * Math.min(12, classLength * .08),
      classLength,
      classHeight,
      narrowWater
    });
  }
  return Object.freeze({
    chaseDistance: Math.max(10.8, classLength * .68) + speedNorm * Math.max(4.2, classLength * .08) + waveIntensity * 1.15,
    chaseHeight: Math.max(4.25, classHeight * .72) + waveIntensity * .82,
    lookAhead: Math.max(7.4, classLength * .34) + speedNorm * Math.max(12, classLength * .1) + waveIntensity * 2,
    classLength,
    classHeight,
    narrowWater
  });
}

function ensureBoatCameraRig(forceReset = false) {
  if (!appCtx.camera?.userData) return null;
  if (forceReset || !appCtx.camera.userData.boatrig) {
    const boatY = Number.isFinite(appCtx.boat?.y) ? appCtx.boat.y : 0;
    const angle = Number.isFinite(appCtx.boat?.angle) ? appCtx.boat.angle : 0;
    appCtx.camera.userData.boatrig = {
      lastTime: performance.now() * 0.001,
      yaw: angle,
      pos: {
        x: Number.isFinite(appCtx.camera.position?.x) ? appCtx.camera.position.x : appCtx.boat?.x || 0,
        y: Number.isFinite(appCtx.camera.position?.y) ? appCtx.camera.position.y : boatY + 4.5,
        z: Number.isFinite(appCtx.camera.position?.z) ? appCtx.camera.position.z : appCtx.boat?.z || 0
      },
      look: {
        x: Number.isFinite(appCtx.boat?.x) ? appCtx.boat.x : 0,
        y: boatY + 1.4,
        z: Number.isFinite(appCtx.boat?.z) ? appCtx.boat.z : 0
      },
      up: { x: 0, y: 1, z: 0 }
    };
  }
  return appCtx.camera.userData.boatrig;
}

function blendBoatCameraVector(target, source, alpha) {
  target.x += (source.x - target.x) * alpha;
  target.y += (source.y - target.y) * alpha;
  target.z += (source.z - target.z) * alpha;
}

function updateBoatCamera() {
  const boatY = Number.isFinite(appCtx.boat?.y) ? appCtx.boat.y : 0;
  const rig = ensureBoatCameraRig();
  if (!rig) return;
  const now = performance.now() * 0.001;
  const dt = clampValue(now - (Number.isFinite(rig.lastTime) ? rig.lastTime : now), 1 / 240, 0.05);
  rig.lastTime = now;

  const speed = Math.abs(appCtx.boat?.forwardSpeed || appCtx.boat?.speed || 0);
  const catalog = getMaritimeCatalogEntry(appCtx.boatMode?.transportCatalogId);
  const metersPerWorldUnit = Math.max(.01, Number(appCtx.METERS_PER_WORLD_UNIT) || 1);
  const classTopSpeed = Math.max(1, catalog.performance.topSpeed / 1.943844 / metersPerWorldUnit);
  const speedNorm = clampValue(speed / classTopSpeed, 0, 1.4);
  const waveIntensity = clampValue(Number(appCtx.boatMode?.waveIntensity || 0.46), 0, 1);
  const surfaceSteepness = clampValue(Number(appCtx.boat?.surfaceSteepness || 0), 0, 2.4);
  const surfaceNormal = normalizeVec3(
    Number(appCtx.boat?.surfaceNormalX || 0) * 0.28,
    1,
    Number(appCtx.boat?.surfaceNormalZ || 0) * 0.28
  );
  const fishingOpen = appCtx.fishingGame?.open === true;

  if (appCtx.camMode !== 1 && appCtx.boatMode.mesh) {
    appCtx.boatMode.mesh.visible = true;
  }

  if (appCtx.camMode === 0) {
    const velocityHeading =
      Math.hypot(Number(appCtx.boat?.vx || 0), Number(appCtx.boat?.vz || 0)) > 0.35 ?
        Math.atan2(Number(appCtx.boat?.vx || 0), Number(appCtx.boat?.vz || 0)) :
        appCtx.boat.angle;
    const followYaw = lerpValue(
      appCtx.boat.angle,
      velocityHeading,
      clampValue(0.2 + speedNorm * 0.16, 0.2, 0.42)
    );
    const desiredYaw = normalizeHeading(followYaw + (fishingOpen ? 0.12 : Number(appCtx.boatMode?.cameraYawOffset) || 0));
    rig.yaw += shortestHeadingDelta(desiredYaw, rig.yaw) * expBlend(dt, 4.4 + speedNorm * 2.4, 0.05, 0.3);

    const classLength = catalog.dimensions.length;
    const classHeight = catalog.dimensions.height;
    const framing = resolveBoatCameraFraming({
      fishingOpen,
      waterKind: appCtx.boatMode?.waterKind,
      classLength,
      classHeight,
      speedNorm,
      waveIntensity
    });
    const chaseDistance = framing.chaseDistance;
    const cameraPitch = Number(appCtx.boatMode?.cameraPitch) || 0;
    const chaseHeight = framing.chaseHeight + (fishingOpen ? 0 : Math.abs(appCtx.boat?.pitch || 0) * Math.max(2.2, Math.min(8, classLength * .03)) + Math.sin(cameraPitch) * Math.max(5.2, classHeight * .22));
    const lateralOffset = fishingOpen ? -2.25 : clampValue(-(appCtx.boat?.turnRate || 0) * (1.08 + speedNorm * 0.72), -1.55, 1.55);
    const offsetX = -Math.sin(rig.yaw) * chaseDistance + Math.cos(rig.yaw) * lateralOffset;
    const offsetZ = -Math.cos(rig.yaw) * chaseDistance - Math.sin(rig.yaw) * lateralOffset;
    const boatForwardX = Math.sin(appCtx.boat.angle);
    const boatForwardZ = Math.cos(appCtx.boat.angle);
    const boatRightX = Math.cos(appCtx.boat.angle);
    const boatRightZ = -Math.sin(appCtx.boat.angle);
    const desiredPos = fishingOpen ? {
      x: appCtx.boat.x + boatForwardX * 0.2 + boatRightX * 0.48,
      y: boatY + 2.24 + waveIntensity * 0.16,
      z: appCtx.boat.z + boatForwardZ * 0.2 + boatRightZ * 0.48
    } : {
      x: appCtx.boat.x + offsetX,
      y: boatY + chaseHeight + surfaceSteepness * 0.12,
      z: appCtx.boat.z + offsetZ
    };
    const lookAhead = framing.lookAhead;
    const fishingSide = fishingOpen ? 15 + Number(appCtx.fishingGame?.fishDirection || 0) * 1.8 : 0;
    const desiredLook = {
      x: appCtx.boat.x + Math.sin(appCtx.boat.angle) * lookAhead + Math.cos(appCtx.boat.angle) * fishingSide,
      y: fishingOpen ? boatY + 0.35 : boatY + 1.3 + (appCtx.boat?.pitch || 0) * 2.6 + speedNorm * 0.42,
      z: appCtx.boat.z + Math.cos(appCtx.boat.angle) * lookAhead - Math.sin(appCtx.boat.angle) * fishingSide
    };
    if (Math.abs(rig.pos.y - desiredPos.y) > 18 || Math.abs(rig.look.y - desiredLook.y) > 18) {
      Object.assign(rig.pos, desiredPos);
      Object.assign(rig.look, desiredLook);
    }
    blendBoatCameraVector(rig.pos, desiredPos, expBlend(dt, 4.8 + speedNorm * 1.6, 0.06, 0.26));
    blendBoatCameraVector(rig.look, desiredLook, expBlend(dt, 5.4 + speedNorm * 1.8, 0.08, 0.32));
    blendBoatCameraVector(rig.up, surfaceNormal, expBlend(dt, 2.8 + waveIntensity * 1.6, 0.04, 0.2));
    const stableUp = normalizeVec3(rig.up.x, rig.up.y, rig.up.z);
    appCtx.camera.up.set(stableUp.x, stableUp.y, stableUp.z);
    appCtx.camera.position.set(rig.pos.x, rig.pos.y, rig.pos.z);
    appCtx.camera.lookAt(rig.look.x, rig.look.y, rig.look.z);
    rig.framing = Object.freeze({ ...framing, waterKind: String(appCtx.boatMode?.waterKind || '') });
  } else if (appCtx.camMode === 1) {
    const fwdX = Math.sin(appCtx.boat.angle);
    const fwdZ = Math.cos(appCtx.boat.angle);
    const bridgeZRatio = catalog.role === 'cargo' ? -.34 : catalog.role === 'research' ? .14 : catalog.role === 'ferry' ? .25 : .08;
    const bridgeOffset = catalog.dimensions.length * bridgeZRatio;
    const eyeHeight = Math.max(2.45, catalog.dimensions.height * (catalog.role === 'runabout' ? .62 : .72));
    const desiredPos = {
      x: appCtx.boat.x + fwdX * bridgeOffset,
      y: boatY + eyeHeight + clampValue(appCtx.boat.pitch || 0, -0.12, 0.16) * 1.8,
      z: appCtx.boat.z + fwdZ * bridgeOffset
    };
    const desiredLook = {
      x: appCtx.boat.x + fwdX * 22,
      y: boatY + 1.7 + clampValue(appCtx.boat.pitch || 0, -0.12, 0.16) * 4.2,
      z: appCtx.boat.z + fwdZ * 22
    };
    blendBoatCameraVector(rig.pos, desiredPos, expBlend(dt, 7.2, 0.1, 0.38));
    blendBoatCameraVector(rig.look, desiredLook, expBlend(dt, 8.4, 0.12, 0.42));
    blendBoatCameraVector(rig.up, surfaceNormal, expBlend(dt, 2.2, 0.03, 0.14));
    const stableUp = normalizeVec3(rig.up.x * 0.35, 1, rig.up.z * 0.35);
    appCtx.camera.up.set(stableUp.x, stableUp.y, stableUp.z);
    appCtx.camera.position.set(rig.pos.x, rig.pos.y, rig.pos.z);
    appCtx.camera.lookAt(rig.look.x, rig.look.y, rig.look.z);
    if (appCtx.boatMode.mesh) appCtx.boatMode.mesh.visible = false;
  } else {
    appCtx.camera.up.set(0, 1, 0);
    appCtx.camera.position.set(appCtx.boat.x, boatY + 42, appCtx.boat.z + 18);
    appCtx.camera.lookAt(appCtx.boat.x, boatY, appCtx.boat.z);
  }
}


export { clampValue, normalizeHeading, resolveBoatCameraFraming, updateBoatCamera };
