import { ctx as appCtx } from "./shared-context.js?v=55"; // ============================================================================
import { worldPointToGeo } from "./map-coordinates.js?v=1";
// hud.js - HUD updates, camera system, sky positioning
// ============================================================================

const COMPASS_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const RAD_TO_DEG = 180 / Math.PI;
const GEO_DECIMALS = 4;
const CAR_BODY_HEIGHT_FROM_GROUND = 1.2;
const CHASE_CAMERA_DISTANCE = 10;
const CHASE_CAMERA_HEIGHT = 5;
const CHASE_CAMERA_RIDE_RATE = 2.2;
const HOOD_FORWARD_OFFSET = 1.2;
const HOOD_LOOK_DISTANCE = 10;
const HOOD_CAMERA_HEIGHT = 1.8;
const OVERHEAD_CAMERA_HEIGHT = 50;
const OVERHEAD_CAMERA_Z_OFFSET = 15;
const WALK_ROAD_EDGE_MIN = 6;
const WALK_ROAD_EDGE_SCALE = 0.75;

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

function ensureCarCameraRig(forceReset = false) {
  if (!appCtx.camera?.userData) return null;
  const drivePose = getDrivePose();
  const carY = Number.isFinite(drivePose.y) ? drivePose.y : (appCtx.car?.y || 0) + CAR_BODY_HEIGHT_FROM_GROUND;
  const angle = Number.isFinite(drivePose.angle) ? drivePose.angle : 0;
  const offsetX = -Math.sin(angle) * CHASE_CAMERA_DISTANCE;
  const offsetZ = -Math.cos(angle) * CHASE_CAMERA_DISTANCE;
  const desiredPos = {
    x: (Number.isFinite(drivePose.x) ? drivePose.x : 0) + offsetX,
    y: carY + CHASE_CAMERA_HEIGHT,
    z: (Number.isFinite(drivePose.z) ? drivePose.z : 0) + offsetZ
  };
  const desiredLook = {
    x: Number.isFinite(drivePose.x) ? drivePose.x : 0,
    y: carY - CAR_BODY_HEIGHT_FROM_GROUND + 0.5,
    z: Number.isFinite(drivePose.z) ? drivePose.z : 0
  };
  const existing = appCtx.camera.userData.carrig;
  const needsReset =
    forceReset ||
    !existing ||
    Math.hypot(
      Number(existing?.pos?.x || 0) - desiredPos.x,
      Number(existing?.pos?.z || 0) - desiredPos.z
    ) > 80 ||
    Math.abs(Number(existing?.pos?.y || 0) - desiredPos.y) > 6;
  if (needsReset) {
    appCtx.camera.userData.carrig = {
      lastTime: performance.now() * 0.001,
      pos: { ...desiredPos },
      lookTarget: { ...desiredLook },
      rideY: carY - CAR_BODY_HEIGHT_FROM_GROUND,
      camMode: Number.isFinite(appCtx.camMode) ? appCtx.camMode : 0
    };
  }
  return appCtx.camera.userData.carrig;
}

function getDrivePose() {
  const pose =
    typeof appCtx.getDriveRenderPose === 'function' ?
      appCtx.getDriveRenderPose() :
      null;
  if (pose) return pose;
  return {
    x: Number(appCtx.car?.x || 0),
    y:
      Number.isFinite(appCtx.carMesh?.position?.y) ?
        appCtx.carMesh.position.y :
      Number.isFinite(appCtx.car?.y) ?
        appCtx.car.y :
        CAR_BODY_HEIGHT_FROM_GROUND,
    z: Number(appCtx.car?.z || 0),
    angle: Number(appCtx.car?.angle || 0)
  };
}

function blendBoatCameraVector(target, source, alpha) {
  target.x += (source.x - target.x) * alpha;
  target.y += (source.y - target.y) * alpha;
  target.z += (source.z - target.z) * alpha;
}

function blendScalar(current, target, alpha) {
  return current + (target - current) * alpha;
}

function updateBoatCamera() {
  const boatY = Number.isFinite(appCtx.boat?.y) ? appCtx.boat.y : 0;
  const rig = ensureBoatCameraRig();
  if (!rig) return;
  const now = performance.now() * 0.001;
  const dt = clampValue(now - (Number.isFinite(rig.lastTime) ? rig.lastTime : now), 1 / 240, 0.05);
  rig.lastTime = now;

  const speed = Math.abs(appCtx.boat?.forwardSpeed || appCtx.boat?.speed || 0);
  const speedNorm = clampValue(speed / 62, 0, 1.4);
  const waveIntensity = clampValue(Number(appCtx.boatMode?.waveIntensity || 0.46), 0, 1);
  const surfaceSteepness = clampValue(Number(appCtx.boat?.surfaceSteepness || 0), 0, 2.4);
  const surfaceNormal = normalizeVec3(
    Number(appCtx.boat?.surfaceNormalX || 0) * 0.28,
    1,
    Number(appCtx.boat?.surfaceNormalZ || 0) * 0.28
  );

  if (appCtx.camMode !== 1 && appCtx.boatMode.mesh) {
    appCtx.boatMode.mesh.visible = true;
  }

  if (appCtx.camMode === 0) {
    const velocityHeading =
      Math.hypot(Number(appCtx.boat?.vx || 0), Number(appCtx.boat?.vz || 0)) > 0.35 ?
        Math.atan2(Number(appCtx.boat?.vx || 0), Number(appCtx.boat?.vz || 0)) :
        appCtx.boat.angle;
    const desiredYaw = lerpValue(
      appCtx.boat.angle,
      velocityHeading,
      clampValue(0.2 + speedNorm * 0.16, 0.2, 0.42)
    );
    rig.yaw += shortestHeadingDelta(desiredYaw, rig.yaw) * expBlend(dt, 4.4 + speedNorm * 2.4, 0.05, 0.3);

    const chaseDistance = 13.4 + speedNorm * 4.8 + waveIntensity * 1.4;
    const chaseHeight = 4.6 + waveIntensity * 0.9 + Math.abs(appCtx.boat?.pitch || 0) * 2.2;
    const lateralOffset = clampValue(-(appCtx.boat?.turnRate || 0) * (1.08 + speedNorm * 0.72), -1.55, 1.55);
    const offsetX = -Math.sin(rig.yaw) * chaseDistance + Math.cos(rig.yaw) * lateralOffset;
    const offsetZ = -Math.cos(rig.yaw) * chaseDistance - Math.sin(rig.yaw) * lateralOffset;
    const desiredPos = {
      x: appCtx.boat.x + offsetX,
      y: boatY + chaseHeight + surfaceSteepness * 0.12,
      z: appCtx.boat.z + offsetZ
    };
    const lookAhead = 8.5 + speedNorm * 13 + waveIntensity * 2.2;
    const desiredLook = {
      x: appCtx.boat.x + Math.sin(appCtx.boat.angle) * lookAhead,
      y: boatY + 1.3 + (appCtx.boat?.pitch || 0) * 2.6 + speedNorm * 0.42,
      z: appCtx.boat.z + Math.cos(appCtx.boat.angle) * lookAhead
    };
    blendBoatCameraVector(rig.pos, desiredPos, expBlend(dt, 4.8 + speedNorm * 1.6, 0.06, 0.26));
    blendBoatCameraVector(rig.look, desiredLook, expBlend(dt, 5.4 + speedNorm * 1.8, 0.08, 0.32));
    blendBoatCameraVector(rig.up, surfaceNormal, expBlend(dt, 2.8 + waveIntensity * 1.6, 0.04, 0.2));
    const stableUp = normalizeVec3(rig.up.x, rig.up.y, rig.up.z);
    appCtx.camera.up.set(stableUp.x, stableUp.y, stableUp.z);
    appCtx.camera.position.set(rig.pos.x, rig.pos.y, rig.pos.z);
    appCtx.camera.lookAt(rig.look.x, rig.look.y, rig.look.z);
  } else if (appCtx.camMode === 1) {
    const fwdX = Math.sin(appCtx.boat.angle);
    const fwdZ = Math.cos(appCtx.boat.angle);
    const desiredPos = {
      x: appCtx.boat.x + fwdX * 1.9,
      y: boatY + 2.45 + clampValue(appCtx.boat.pitch || 0, -0.12, 0.16) * 1.8,
      z: appCtx.boat.z + fwdZ * 1.9
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

function locationName() {
  if (typeof appCtx.getHudLocationLabel === 'function') {
    const detailed = String(appCtx.getHudLocationLabel() || '').trim();
    if (detailed) return detailed;
  }
  return appCtx.selLoc === 'custom' ? appCtx.customLoc?.name || 'Custom' : appCtx.LOCS[appCtx.selLoc].name;
}

function clampText(value, maxLen = 64) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.length > maxLen ? `${text.slice(0, Math.max(8, maxLen - 1)).trim()}…` : text;
}

function setHudUnitLabels(unitLabel, limitLabel) {
  const speedUnitEl = document.getElementById('speedUnitLabel');
  const limitLabelEl = document.getElementById('limitLabel');
  if (speedUnitEl) speedUnitEl.textContent = unitLabel;
  if (limitLabelEl) limitLabelEl.textContent = limitLabel;
}

function setStreetAndLocation(roadLabel, locationLabel) {
  const streetEl = document.getElementById('street');
  const locationEl = document.getElementById('locationLine');
  const rawRoad = String(roadLabel || '').trim();
  const rawLocation = String(locationLabel || '').trim();
  let normalizedRoad = rawRoad;
  let normalizedLocation = rawLocation;

  // Older data can include "Road • Location" in one field; split to keep HUD compact.
  if (rawRoad.includes('•')) {
    const parts = rawRoad.split('•').map((part) => String(part || '').trim()).filter(Boolean);
    if (parts.length) {
      normalizedRoad = parts.shift() || '';
      if (!normalizedLocation && parts.length) normalizedLocation = parts.join(', ');
    }
  }

  if (!normalizedRoad) normalizedRoad = 'Off Road';

  if (streetEl) streetEl.textContent = clampText(normalizedRoad, 32);
  if (locationEl) {
    locationEl.textContent = clampText(normalizedLocation, 52);
    locationEl.style.display = normalizedLocation ? '' : 'none';
  }
}

function geoFromWorldXZ(worldX, worldZ) {
  return worldPointToGeo(worldX, worldZ);
}

function headingDegreesFromYaw(yawRad) {
  let hdg = (-yawRad * RAD_TO_DEG + 90) % 360;
  if (hdg < 0) hdg += 360;
  return hdg;
}

function headingLabel(yawRad) {
  const hdg = headingDegreesFromYaw(yawRad);
  return `${COMPASS_DIRECTIONS[Math.round(hdg / 45) % 8]} ${Math.round(hdg)}°`;
}

function coordsHudText(worldX, worldZ, yawRad, pitchDeg = null) {
  const geo = geoFromWorldXZ(worldX, worldZ);
  const heading = headingLabel(yawRad);
  if (pitchDeg == null) return `${geo.lat.toFixed(GEO_DECIMALS)}, ${geo.lon.toFixed(GEO_DECIMALS)} | ${heading}`;
  return `${geo.lat.toFixed(GEO_DECIMALS)}, ${geo.lon.toFixed(GEO_DECIMALS)} | ${heading} | P:${pitchDeg}°`;
}

function updateBillboardMarkers() {
  appCtx.propMarkers.forEach((marker) => {
    if (marker.userData.isBillboard) marker.lookAt(appCtx.camera.position);
  });
}

function updateCameraLinkedEffects() {
  if (appCtx.starField) appCtx.starField.position.copy(appCtx.camera.position);
  updateSkyPositions();
}

function updateSkyPositions() {
  if (!appCtx.camera) return;

  const cameraY = appCtx.camera.position.y;
  const cameraX = appCtx.camera.position.x;
  const cameraZ = appCtx.camera.position.z;

  const skyState = appCtx.skyState || null;
  const sunDir = skyState?.sun?.direction;
  const moonDir = skyState?.moon?.direction;

  // Sun - anchored to the current astronomical direction relative to the camera.
  if (appCtx.sunSphere) {
    const dirX = Number.isFinite(sunDir?.x) ? sunDir.x : 0.52;
    const dirY = Number.isFinite(sunDir?.y) ? sunDir.y : 0.82;
    const dirZ = Number.isFinite(sunDir?.z) ? sunDir.z : 0.22;
    appCtx.sunSphere.position.set(cameraX + dirX * 1400, cameraY + dirY * 1400, cameraZ + dirZ * 1400);
    // Keep sun glow in sync
    if (appCtx.sunSphere.userData.glow) {
      appCtx.sunSphere.userData.glow.position.copy(appCtx.sunSphere.position);
    }
  }

  // Directional sun light - follow the astronomical sun vector while the target stays near the player.
  if (appCtx.sun) {
    const dirX = Number.isFinite(sunDir?.x) ? sunDir.x : 0.52;
    const dirY = Number.isFinite(sunDir?.y) ? sunDir.y : 0.82;
    const dirZ = Number.isFinite(sunDir?.z) ? sunDir.z : 0.22;
    appCtx.sun.position.set(cameraX + dirX * 220, cameraY + dirY * 220, cameraZ + dirZ * 220);
    if (appCtx.sun.target) {
      appCtx.sun.target.position.set(cameraX, cameraY, cameraZ);
      appCtx.sun.target.updateMatrixWorld();
    }
  }

  // Moon follows the computed lunar direction and stays centered on the observer.
  if (appCtx.moonSphere) {
    const dirX = Number.isFinite(moonDir?.x) ? moonDir.x : -0.42;
    const dirY = Number.isFinite(moonDir?.y) ? moonDir.y : 0.78;
    const dirZ = Number.isFinite(moonDir?.z) ? moonDir.z : -0.22;
    appCtx.moonSphere.position.set(cameraX + dirX * 1400, cameraY + dirY * 1400, cameraZ + dirZ * 1400);
    appCtx.moonSphere.lookAt(cameraX, cameraY, cameraZ);
    appCtx.moonSphere.rotateZ(-(skyState?.moon?.parallacticAngle || 0));
    // Keep moon glow in sync
    if (appCtx.moonSphere.userData.glow) {
      appCtx.moonSphere.userData.glow.position.copy(appCtx.moonSphere.position);
    }
  }

  // Fill light stays opposite the key light and tracks the observer.
  if (appCtx.fillLight) {
    const dirX = Number.isFinite(sunDir?.x) ? -sunDir.x * 0.85 : -0.35;
    const dirY = Number.isFinite(sunDir?.y) ? Math.max(0.25, Math.abs(sunDir.y) * 0.65) : 0.55;
    const dirZ = Number.isFinite(sunDir?.z) ? -sunDir.z * 0.85 : -0.65;
    appCtx.fillLight.position.set(cameraX + dirX * 180, cameraY + dirY * 180, cameraZ + dirZ * 180);
    if (appCtx.fillLight.target) {
      appCtx.fillLight.target.position.set(cameraX, cameraY, cameraZ);
      appCtx.fillLight.target.updateMatrixWorld();
    }
  }

  // Hemisphere light - subtle gradient from sky to ground
  if (appCtx.hemiLight) {
    appCtx.hemiLight.position.set(cameraX, cameraY + 100, cameraZ);
  }

  // Keep the cloud field centered on the observer without per-cloud easing work.
  if (appCtx.cloudGroup) {
    appCtx.cloudGroup.position.set(cameraX, cameraY, cameraZ);
  }
}

function updateCamera() {
  if (appCtx.boatMode?.active) {
    updateBoatCamera();
    updateBillboardMarkers();
    updateCameraLinkedEffects();
    return;
  }

  // Drone camera mode
  if (appCtx.droneMode) {
    appCtx.camera.position.set(appCtx.drone.x, appCtx.drone.y, appCtx.drone.z);

    // Use Euler angles for proper rotation without gimbal lock
    // Order: YXZ (yaw, pitch, roll)
    appCtx.camera.rotation.order = 'YXZ';
    appCtx.camera.rotation.y = appCtx.drone.yaw; // Camera faces movement direction
    appCtx.camera.rotation.x = appCtx.drone.pitch;
    appCtx.camera.rotation.z = appCtx.drone.roll;

    updateCameraLinkedEffects();

    return;
  }

  // Walking module handles camera when in walk mode
  if (appCtx.Walk) {
    const walkCameraApplied = appCtx.Walk.applyCameraIfWalking();
    if (walkCameraApplied) {
      updateBillboardMarkers();
      updateCameraLinkedEffects();
      return;
    }
  }

  // Normal car camera modes
  const lb = appCtx.keys.KeyV;
  const d = CHASE_CAMERA_DISTANCE;
  const h = CHASE_CAMERA_HEIGHT;
  const drivePose = getDrivePose();

  // Get car's actual Y position (follows terrain)
  const carGroundY = Number.isFinite(drivePose.y) ? drivePose.y - CAR_BODY_HEIGHT_FROM_GROUND : appCtx.carMesh.position.y - CAR_BODY_HEIGHT_FROM_GROUND;

  // Show car mesh for non-first-person modes
  if (appCtx.camMode !== 1 && appCtx.carMesh && !appCtx.carMesh.visible) {
    appCtx.carMesh.visible = true;
  }

  if (appCtx.camMode === 0) {
    // Keep the drive camera simple: fixed chase distance with only ride-height filtering.
    const rig = ensureCarCameraRig(appCtx.camera.userData?.carrig?.camMode !== appCtx.camMode);
    const ox = -Math.sin(drivePose.angle) * (lb ? -d : d);
    const oz = -Math.cos(drivePose.angle) * (lb ? -d : d);
    const desiredPos = {
      x: drivePose.x + ox,
      y: carGroundY + h,
      z: drivePose.z + oz
    };
    const desiredLook = {
      x: drivePose.x,
      y: carGroundY + 0.5,
      z: drivePose.z
    };
    if (!rig) {
      appCtx.camera.position.set(desiredPos.x, desiredPos.y, desiredPos.z);
      appCtx.camera.lookAt(desiredLook.x, desiredLook.y, desiredLook.z);
      updateBillboardMarkers();
      updateCameraLinkedEffects();
      return;
    }
    const now = performance.now() * 0.001;
    const dt = clampValue(now - (Number.isFinite(rig.lastTime) ? rig.lastTime : now), 1 / 240, 0.05);
    rig.lastTime = now;
    rig.camMode = appCtx.camMode;
    const rideTargetY = carGroundY;
    const rideAlpha = expBlend(dt, CHASE_CAMERA_RIDE_RATE, 0.02, 0.08);
    rig.rideY = blendScalar(Number.isFinite(rig.rideY) ? rig.rideY : rideTargetY, rideTargetY, rideAlpha);
    const desiredCameraY = rig.rideY + h;
    const desiredLookY = rig.rideY + 0.5;
    rig.pos.x = desiredPos.x;
    rig.pos.z = desiredPos.z;
    rig.pos.y = desiredCameraY;
    rig.lookTarget.x = desiredLook.x;
    rig.lookTarget.z = desiredLook.z;
    rig.lookTarget.y = desiredLookY;
    appCtx.camera.position.set(rig.pos.x, rig.pos.y, rig.pos.z);
    appCtx.camera.userData.lookTarget = rig.lookTarget;
    appCtx.camera.lookAt(
      rig.lookTarget.x,
      rig.lookTarget.y,
      rig.lookTarget.z
    );
  } else if (appCtx.camMode === 1) {
    // Hood camera - positioned at front of car looking forward over the hood
    // Move camera forward to the hood area (1.2 units ahead of car center)
    const fwdX = Math.sin(drivePose.angle) * HOOD_FORWARD_OFFSET;
    const fwdZ = Math.cos(drivePose.angle) * HOOD_FORWARD_OFFSET;
    appCtx.camera.position.set(drivePose.x + fwdX, carGroundY + HOOD_CAMERA_HEIGHT, drivePose.z + fwdZ);
    const dir = lb ? -1 : 1;
    appCtx.camera.lookAt(
      drivePose.x + Math.sin(drivePose.angle) * HOOD_LOOK_DISTANCE * dir,
      carGroundY + 1.6,
      drivePose.z + Math.cos(drivePose.angle) * HOOD_LOOK_DISTANCE * dir
    );
    // Hide car mesh in first-person so you don't see tires/body
    if (appCtx.carMesh) appCtx.carMesh.visible = false;
  } else {
    // Overhead camera - high above car
    appCtx.camera.position.set(drivePose.x, carGroundY + OVERHEAD_CAMERA_HEIGHT, drivePose.z + OVERHEAD_CAMERA_Z_OFFSET);
    appCtx.camera.lookAt(drivePose.x, carGroundY, drivePose.z);
  }

  updateBillboardMarkers();
  updateCameraLinkedEffects();
}

function updateHUD() {
  // Keep controls panel sections and header synchronized with the active mode.
  if (typeof appCtx.updateControlsModeUI === 'function') appCtx.updateControlsModeUI();

  if (appCtx.boatMode?.active) {
    const knots = Math.max(0, Math.round(Math.abs(appCtx.boat.speed) * 0.43));
    const seaLabel = typeof appCtx.boatHudLabel === 'function' ? appCtx.boatHudLabel() : 'Boat Travel';
    const shoreline = Number.isFinite(appCtx.boatMode.shorelineDistance) ? Math.round(appCtx.boatMode.shorelineDistance) : null;
    setHudUnitLabels('KTS', 'SEA');
    document.getElementById('speed').textContent = `${knots}`;
    document.getElementById('speed').classList.toggle('fast', knots >= 18);
    document.getElementById('limit').textContent = getSeaStateLabel();
    setStreetAndLocation(seaLabel, shoreline != null ? `${locationName()} • ${shoreline}m to shore` : locationName());
    const bf = document.getElementById('boostFill');
    bf.style.width = `${Math.max(0, Math.min(100, Math.abs(appCtx.boat.speed) / 24 * 100))}%`;
    bf.classList.toggle('active', Math.abs(appCtx.boat.speed) > 12);
    document.getElementById('indBrake').classList.toggle('on', !!appCtx.keys.Space);
    document.getElementById('indBoost').classList.toggle('on', Math.abs(appCtx.boat.speed) > 18);
    document.getElementById('indBoost').textContent = 'WAKE';
    document.getElementById('indDrift').classList.toggle('on', Math.abs(appCtx.boat.roll) > 0.06 || Math.abs(appCtx.boat.pitch) > 0.05);
    document.getElementById('indDrift').textContent = 'SEA';
    document.getElementById('indOff').classList.remove('on', 'warn');
    document.getElementById('offRoadWarn').classList.toggle('active', false);
    document.getElementById('coords').textContent = coordsHudText(appCtx.boat.x, appCtx.boat.z, appCtx.boat.angle);
    return;
  }

  if (appCtx.droneMode) {
    // Calculate ground elevation for altitude display
    let groundY = 0;
    if (appCtx.onMoon && appCtx.moonSurface) {
      const raycaster = appCtx._getPhysRaycaster();
      appCtx._physRayStart.set(appCtx.drone.x, 2000, appCtx.drone.z);
      raycaster.set(appCtx._physRayStart, appCtx._physRayDir || new globalThis.THREE.Vector3(0, -1, 0));
      const hits = raycaster.intersectObject(appCtx.moonSurface, false);
      if (hits.length > 0) {
        groundY = hits[0].point.y;
      }
    } else if (appCtx.terrainEnabled) {
      groundY = appCtx.elevationWorldYAtWorldXZ(appCtx.drone.x, appCtx.drone.z);
    }

    const altitudeMeters = Math.max(0, Math.round(appCtx.drone.y - groundY));
    const altitudeCap = appCtx.onMoon ? 2000 : 400;

    // Drone mode HUD (everyday wording; avoid aviation jargon like AGL).
    setHudUnitLabels('HEIGHT', 'CEILING');
    document.getElementById('speed').textContent = `${altitudeMeters}`;
    document.getElementById('speed').classList.remove('fast');
    document.getElementById('limit').textContent = `${altitudeCap}`;
    setStreetAndLocation('Drone View', locationName());
    const bf = document.getElementById('boostFill');
    bf.style.width = '0%';
    bf.classList.remove('active');
    document.getElementById('indBrake').classList.remove('on');
    document.getElementById('indBoost').classList.remove('on');
    document.getElementById('indDrift').classList.remove('on');
    document.getElementById('indDrift').textContent = 'DRONE';
    document.getElementById('indOff').classList.remove('on', 'warn');
    document.getElementById('offRoadWarn').classList.remove('active');
    document.getElementById('coords').textContent = coordsHudText(appCtx.drone.x, appCtx.drone.z, appCtx.drone.yaw);

    return;
  }

  // Walking mode HUD - uses Walk module data
  if (appCtx.Walk && appCtx.Walk.state.mode === 'walk') {
    const mph = Math.abs(Math.round(appCtx.Walk.state.walker.speedMph));
    const locName = locationName();
    const running = appCtx.keys.ShiftLeft || appCtx.keys.ShiftRight;
    const activeInterior = appCtx.activeInterior || null;

    let walkSurface = null;
    if (!activeInterior && !appCtx.onMoon && typeof appCtx.findNearestTraversalFeature === 'function') {
      const nearest = appCtx.findNearestTraversalFeature(appCtx.Walk.state.walker.x, appCtx.Walk.state.walker.z, {
        mode: 'walk',
        maxDistance: 18
      });
      if (nearest?.feature) {
        const featureWidth = Number.isFinite(nearest.feature.width) ? nearest.feature.width : 4;
        const edge = Math.max(WALK_ROAD_EDGE_MIN, featureWidth * WALK_ROAD_EDGE_SCALE);
        if (nearest.dist < edge) walkSurface = nearest.feature;
      }
    }

    setHudUnitLabels('MPH', 'LIMIT');
    document.getElementById('speed').textContent = mph;
    document.getElementById('speed').classList.remove('fast');
    document.getElementById('limit').textContent = activeInterior ? '' : (walkSurface?.limit ? walkSurface.limit || 25 : '');
    setStreetAndLocation(
      activeInterior ?
        `${activeInterior.label || 'Interior'} Interior` :
      walkSurface && typeof appCtx.surfaceDisplayName === 'function' ?
        appCtx.surfaceDisplayName(walkSurface) :
        walkSurface?.name || 'Off Road',
      activeInterior ? `${locName} • On-demand` : locName
    );
    const bf = document.getElementById('boostFill');
    bf.style.width = '0%';
    bf.classList.remove('active');
    document.getElementById('indBrake').classList.remove('on');
    document.getElementById('indBoost').classList.remove('on');
    document.getElementById('indDrift').textContent = running ? 'RUN' : 'WALK';
    document.getElementById('indDrift').classList.toggle('on', running);
    document.getElementById('indOff').classList.remove('on', 'warn');
    document.getElementById('offRoadWarn').classList.remove('active');

    // Use WALKER position for coordinates
    document.getElementById('coords').textContent = coordsHudText(
      appCtx.Walk.state.walker.x,
      appCtx.Walk.state.walker.z,
      appCtx.Walk.state.walker.angle
    );

    return;
  }

  // Normal car HUD
  const mph = Math.abs(Math.round(appCtx.car.speed));
  const limit = appCtx.car.road?.limit || 25;
  const locName = locationName();
  setHudUnitLabels('MPH', 'LIMIT');
  document.getElementById('speed').textContent = mph;
  document.getElementById('speed').classList.toggle('fast', mph > limit || appCtx.car.boost);
  document.getElementById('limit').textContent = limit;
  setStreetAndLocation(appCtx.car.road?.name || 'Off Road', locName);
  const bf = document.getElementById('boostFill');
  bf.style.width = appCtx.car.boost ? appCtx.car.boostTime / appCtx.CFG.boostDur * 100 + '%' : appCtx.car.boostReady ? '100%' : '0%';
  bf.classList.toggle('active', appCtx.car.boost);
  document.getElementById('indBrake').classList.toggle('on', appCtx.keys.Space);
  document.getElementById('indBoost').classList.toggle('on', appCtx.car.boost);
  const isDrifting = Math.abs(appCtx.car.driftAngle) > 0.15 && Math.abs(appCtx.car.speed) > 30;
  document.getElementById('indDrift').classList.toggle('on', isDrifting);
  if (isDrifting) document.getElementById('indDrift').textContent = 'DRIFT ' + Math.round(Math.abs(appCtx.car.driftAngle) * 180 / Math.PI) + '°';else
  document.getElementById('indDrift').textContent = 'DRIFT';
  document.getElementById('indOff').classList.toggle('on', appCtx.keys.ShiftLeft || appCtx.keys.ShiftRight);
  document.getElementById('indOff').classList.toggle('warn', !appCtx.car.onRoad && !(appCtx.keys.ShiftLeft || appCtx.keys.ShiftRight));
  document.getElementById('offRoadWarn').classList.toggle('active', !appCtx.car.onRoad && !(appCtx.keys.ShiftLeft || appCtx.keys.ShiftRight));
  document.getElementById('coords').textContent = coordsHudText(appCtx.car.x, appCtx.car.z, appCtx.car.angle);

}

function getSeaStateLabel() {
  const sea = String(appCtx.boatMode?.seaState || 'moderate').toLowerCase();
  if (sea === 'calm') return 'CALM';
  if (sea === 'rough') return 'ROUGH';
  return 'MOD';
}

// OSM Tile functions

Object.assign(appCtx, { updateCamera, updateHUD, updateSkyPositions });

export { updateCamera, updateHUD, updateSkyPositions };
