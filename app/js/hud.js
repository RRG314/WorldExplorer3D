import { ctx as appCtx } from "./shared-context.js?v=55"; // ============================================================================
import { updateNightLighting } from "./engine/night-lighting.js?v=7";
import { updateStableDirectionalShadow } from "./engine/shadow-policy.js?v=1";
import { clampValue, normalizeHeading, updateBoatCamera } from "./hud/boat-camera.js?v=3";
import {
  carSpeedToMph,
  worldUnitsPerSecondToKnots,
  worldUnitsPerSecondToMph
} from "./physics/vehicle-speed-units.js?v=2";
import { resolveChaseCameraTerrainCollision } from "./hud/chase-camera-terrain.js?v=1";
import { resolveTunnelCameraState } from "./hud/tunnel-camera-controller.js?v=6";
import { cameraSmoothingBlend } from "./controls/traversal-control-policy.js?v=8";
import { planetarySurfaceYAtRenderXZ } from './planetary/runtime/surface-query.js?v=2';
// hud.js - HUD updates, camera system, sky positioning
// ============================================================================

const COMPASS_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const RAD_TO_DEG = 180 / Math.PI;
const GEO_DECIMALS = 4;
const CAR_BODY_HEIGHT_FROM_GROUND = 1.2;
const CHASE_CAMERA_DISTANCE = 10;
const CHASE_CAMERA_HEIGHT = 5;
// The deployed 0.7-per-frame chase factor corresponds to roughly 72/s at
// 60 Hz. Keep the time-based response close to that feel without bringing
// back refresh-rate-dependent camera motion.
const CHASE_CAMERA_SMOOTH_RATE = 60;
const HOOD_FORWARD_OFFSET = 1.2;
const HOOD_LOOK_DISTANCE = 10;
const HOOD_CAMERA_HEIGHT = 1.8;
const OVERHEAD_CAMERA_HEIGHT = 50;
const OVERHEAD_CAMERA_Z_OFFSET = 15;
const WALK_ROAD_EDGE_MIN = 6;
const WALK_ROAD_EDGE_SCALE = 0.75;
let chaseCameraCollisionFrame = 0;
let chaseCameraCollisionRatio = 1;
let chaseCameraCollisionTargetRatio = 1;
let chaseCameraCollisionCacheValid = false;
let chaseCameraCollisionLookX = NaN;
let chaseCameraCollisionLookZ = NaN;

function resolveChaseCameraStructureCollision(lookX, lookY, lookZ, targetX, targetY, targetZ, dt = 1 / 60) {
  if (typeof appCtx.checkBuildingCollision !== 'function') {
    chaseCameraCollisionCacheValid = false;
    chaseCameraCollisionRatio = 1;
    chaseCameraCollisionTargetRatio = 1;
    return { x: targetX, y: targetY, z: targetZ, collided: false };
  }

  const deltaX = targetX - lookX;
  const deltaY = targetY - lookY;
  const deltaZ = targetZ - lookZ;
  const distance = Math.hypot(deltaX, deltaY, deltaZ);
  if (!(distance > 1.5)) return { x: targetX, y: targetY, z: targetZ, collided: false };
  chaseCameraCollisionFrame += 1;
  const movedSinceProbe = Number.isFinite(chaseCameraCollisionLookX)
    ? Math.hypot(lookX - chaseCameraCollisionLookX, lookZ - chaseCameraCollisionLookZ)
    : Infinity;
  const shouldProbe =
    !chaseCameraCollisionCacheValid ||
    movedSinceProbe > 3 ||
    chaseCameraCollisionFrame % 8 === 0;
  if (!shouldProbe) {
    const ratioBlend = cameraSmoothingBlend(
      chaseCameraCollisionTargetRatio < chaseCameraCollisionRatio ? 42 : 22,
      dt
    );
    chaseCameraCollisionRatio += (chaseCameraCollisionTargetRatio - chaseCameraCollisionRatio) * ratioBlend;
    return {
      x: lookX + deltaX * chaseCameraCollisionRatio,
      y: lookY + deltaY * chaseCameraCollisionRatio,
      z: lookZ + deltaZ * chaseCameraCollisionRatio,
      collided: chaseCameraCollisionRatio < 0.999
    };
  }

  // Query the existing spatial collision index along the short camera arm.
  // Raycasting the merged regional road/bridge meshes scanned hundreds of
  // thousands of triangles on a fixed eight-frame cadence.
  const probeCount = Math.max(8, Math.ceil(distance / 0.7));
  let blockedRatio = 1;
  for (let probe = 2; probe <= probeCount; probe += 1) {
    const ratio = probe / probeCount;
    const y = lookY + deltaY * ratio;
    const collision = appCtx.checkBuildingCollision(
      lookX + deltaX * ratio,
      lookZ + deltaZ * ratio,
      0.38,
      {
        actorBaseY: y - 0.34,
        actorHeight: 0.68,
        acceptCollision: (candidate) => candidate?.building?.buildingType !== 'bridge_guardrail'
      }
    );
    if (collision?.collision === true) {
      blockedRatio = Math.max(0.12, ratio - 1.2 / probeCount);
      break;
    }
  }
  chaseCameraCollisionCacheValid = true;
  chaseCameraCollisionLookX = lookX;
  chaseCameraCollisionLookZ = lookZ;
  chaseCameraCollisionTargetRatio = blockedRatio;
  const ratioBlend = cameraSmoothingBlend(
    chaseCameraCollisionTargetRatio < chaseCameraCollisionRatio ? 42 : 22,
    dt
  );
  chaseCameraCollisionRatio += (chaseCameraCollisionTargetRatio - chaseCameraCollisionRatio) * ratioBlend;
  return {
    x: lookX + deltaX * chaseCameraCollisionRatio,
    y: lookY + deltaY * chaseCameraCollisionRatio,
    z: lookZ + deltaZ * chaseCameraCollisionRatio,
    collided: chaseCameraCollisionRatio < 0.999
  };
}

function locationName() {
  if (appCtx.onMars) return 'Olympus Mons, Mars';
  if (appCtx.onMoon) return 'Mare Tranquillitatis, Moon';
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

  if (!normalizedRoad) normalizedRoad = 'Exploring';

  if (streetEl) streetEl.textContent = clampText(normalizedRoad, 32);
  if (locationEl) {
    locationEl.textContent = clampText(normalizedLocation, 52);
    locationEl.style.display = normalizedLocation ? '' : 'none';
  }
}

function geoFromWorldXZ(worldX, worldZ) {
  return {
    lat: appCtx.LOC.lat - worldZ / appCtx.SCALE,
    lon: appCtx.LOC.lon + worldX / (appCtx.SCALE * Math.cos(appCtx.LOC.lat * Math.PI / 180))
  };
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
  const heading = headingLabel(yawRad);
  if (appCtx.onMoon || appCtx.onMars) {
    const worldName = appCtx.onMars ? 'MARS' : 'LUNAR';
    const planetaryPosition = `${worldName} X ${Math.round(worldX)}m, Z ${Math.round(worldZ)}m`;
    return pitchDeg == null ? `${planetaryPosition} | ${heading}` : `${planetaryPosition} | ${heading} | P:${pitchDeg}°`;
  }
  const geo = geoFromWorldXZ(worldX, worldZ);
  if (pitchDeg == null) return `${geo.lat.toFixed(GEO_DECIMALS)}, ${geo.lon.toFixed(GEO_DECIMALS)} | ${heading}`;
  return `${geo.lat.toFixed(GEO_DECIMALS)}, ${geo.lon.toFixed(GEO_DECIMALS)} | ${heading} | P:${pitchDeg}°`;
}

function updateCoordinatesHud(worldX, worldZ, yawRad, pitchDeg = null) {
  const coords = document.getElementById('coords');
  const text = document.getElementById('coordsText') || coords;
  if (text) text.textContent = coordsHudText(worldX, worldZ, yawRad, pitchDeg);

  const earthCoordinatesAvailable = !appCtx.onMoon && !appCtx.onMars && !appCtx.spaceFlight?.active;
  let osmUrl = 'https://www.openstreetmap.org';
  if (earthCoordinatesAvailable) {
    const geo = geoFromWorldXZ(worldX, worldZ);
    osmUrl = `https://www.openstreetmap.org/edit?editor=id#map=19/${geo.lat.toFixed(7)}/${geo.lon.toFixed(7)}`;
  }
  document.querySelectorAll('[data-osm-location-link]').forEach((link) => {
    link.href = osmUrl;
    link.hidden = !earthCoordinatesAvailable;
    link.setAttribute('aria-disabled', earthCoordinatesAvailable ? 'false' : 'true');
  });
}

function updateBillboardMarkers() {
  appCtx.propMarkers.forEach((marker) => {
    if (marker.userData.isBillboard) marker.lookAt(appCtx.camera.position);
  });
}

function updateCameraLinkedEffects() {
  if (appCtx.starField) appCtx.starField.position.copy(appCtx.camera.position);
  updateSkyPositions();
  updateNightLighting();
}

function updateSkyPositions() {
  if (!appCtx.camera) return;

  const cameraY = appCtx.camera.position.y;
  const cameraX = appCtx.camera.position.x;
  const cameraZ = appCtx.camera.position.z;

  const skyState = appCtx.skyState || null;
  const sunDir = skyState?.sun?.direction;
  const moonDir = skyState?.moon?.direction;

  if (appCtx.onMoon) {
    const lunarSun = { x: -0.55, y: 0.72, z: -0.42 };
    appCtx.updateLunarEarthPosition?.(cameraX, cameraY, cameraZ);
    if (appCtx.sunSphere) {
      appCtx.sunSphere.visible = true;
      appCtx.sunSphere.position.set(
        cameraX + lunarSun.x * 1400,
        cameraY + lunarSun.y * 1400,
        cameraZ + lunarSun.z * 1400
      );
    }
    if (appCtx.sun) {
      updateStableDirectionalShadow(appCtx, lunarSun, appCtx.camera.position);
    }
    if (appCtx.moonSphere) appCtx.moonSphere.visible = false;
    return;
  }

  if (appCtx.onMars) {
    const marsSun = { x: -0.42, y: 0.68, z: -0.6 };
    if (appCtx.sunSphere) {
      appCtx.sunSphere.visible = true;
      appCtx.sunSphere.scale.setScalar(0.66);
      appCtx.sunSphere.position.set(
        cameraX + marsSun.x * 1400,
        cameraY + marsSun.y * 1400,
        cameraZ + marsSun.z * 1400
      );
      const glow = appCtx.sunSphere.userData.glow;
      if (glow) {
        glow.visible = true;
        glow.position.copy(appCtx.sunSphere.position);
        glow.scale.setScalar(0.66);
      }
    }
    if (appCtx.sun) {
      updateStableDirectionalShadow(appCtx, marsSun, appCtx.camera.position);
    }
    if (appCtx.fillLight) {
      appCtx.fillLight.position.set(cameraX - marsSun.x * 150, cameraY + 70, cameraZ - marsSun.z * 150);
      appCtx.fillLight.target?.position.set(cameraX, cameraY, cameraZ);
      appCtx.fillLight.target?.updateMatrixWorld();
    }
    if (appCtx.moonSphere) appCtx.moonSphere.visible = false;
    if (appCtx.hemiLight) appCtx.hemiLight.position.set(cameraX, cameraY + 100, cameraZ);
    return;
  }

  if (appCtx.sunSphere) appCtx.sunSphere.scale.setScalar(1);
  if (appCtx.sunSphere?.userData?.glow) appCtx.sunSphere.userData.glow.scale.setScalar(1);
  if (!appCtx.onMoon && appCtx.moonSphere) appCtx.moonSphere.visible = true;

  // Earth celestial discs must sit behind the full terrain draw distance.
  // Keeping them at the old 1.4 km distance made a low sun render in front of
  // distant hills and gave it an unrealistically large angular diameter.
  const earthCelestialDistance = 11000;

  // Sun - anchored to the current astronomical direction relative to the camera.
  if (appCtx.sunSphere) {
    const dirX = Number.isFinite(sunDir?.x) ? sunDir.x : 0.52;
    const dirY = Number.isFinite(sunDir?.y) ? sunDir.y : 0.82;
    const dirZ = Number.isFinite(sunDir?.z) ? sunDir.z : 0.22;
    appCtx.sunSphere.position.set(
      cameraX + dirX * earthCelestialDistance,
      cameraY + dirY * earthCelestialDistance,
      cameraZ + dirZ * earthCelestialDistance
    );
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
    updateStableDirectionalShadow(appCtx, { x: dirX, y: dirY, z: dirZ }, appCtx.camera.position);
  }

  // Moon follows the computed lunar direction and stays centered on the observer.
  if (appCtx.moonSphere) {
    const dirX = Number.isFinite(moonDir?.x) ? moonDir.x : -0.42;
    const dirY = Number.isFinite(moonDir?.y) ? moonDir.y : 0.78;
    const dirZ = Number.isFinite(moonDir?.z) ? moonDir.z : -0.22;
    appCtx.moonSphere.position.set(
      cameraX + dirX * earthCelestialDistance,
      cameraY + dirY * earthCelestialDistance,
      cameraZ + dirZ * earthCelestialDistance
    );
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

function updateCamera(dt = 1 / 60) {
  if (appCtx.planeMode?.active && appCtx.applyPlaneCamera?.(dt)) {
    updateBillboardMarkers();
    updateCameraLinkedEffects();
    return;
  }
  if (appCtx.boatMode?.active) {
    updateBoatCamera();
    updateBillboardMarkers();
    updateCameraLinkedEffects();
    return;
  }

  // Drone camera mode
  if (appCtx.droneMode) {
    const dronePose = appCtx.presentationPose?.mode === 'drone'
      ? appCtx.presentationPose.drone
      : appCtx.drone;
    appCtx.camera.position.set(dronePose.x, dronePose.y, dronePose.z);

    // Use Euler angles for proper rotation without gimbal lock
    // Order: YXZ (yaw, pitch, roll)
    appCtx.camera.rotation.order = 'YXZ';
    appCtx.camera.rotation.y = dronePose.yaw + (Number(dronePose.cameraYawOffset) || 0);
    appCtx.camera.rotation.x = dronePose.pitch + (Number(dronePose.cameraPitchOffset) || 0);
    appCtx.camera.rotation.z = dronePose.roll;

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

  const carLook = appCtx.camera.userData.carLook || { yaw: 0, pitch: 0 };
  const presentationCar = appCtx.presentationPose?.car || appCtx.car;
  appCtx.camera.userData.carLook = carLook;
  const cameraLookSpeed = 1.8 * clampValue(dt, 1 / 240, 0.05);
  const cameraActions = appCtx.readControlActions?.('drive') || {};
  const lookYaw = Number(cameraActions.lookYaw) || 0;
  const lookPitch = Number(cameraActions.lookPitch) || 0;
  const manualCameraInput = Math.abs(lookYaw) > 0.05 || Math.abs(lookPitch) > 0.05;
  carLook.yaw += lookYaw * cameraLookSpeed;
  carLook.pitch += lookPitch * cameraLookSpeed;
  if (manualCameraInput) carLook.lastInputAt = performance.now();
  const cameraIdleMs = performance.now() - (Number(carLook.lastInputAt) || 0);
  const liveGpsVehicleFollow = appCtx.getLiveGpsSnapshot?.().travelMode === 'drive' &&
    appCtx.liveGpsTranslationOwned?.() === true;
  if ((!manualCameraInput && cameraIdleMs > 900 || liveGpsVehicleFollow) && appCtx.camMode === 0) {
    const returnBlend = 1 - Math.exp(-4.2 * clampValue(dt, 1 / 240, 0.05));
    carLook.yaw += (0 - carLook.yaw) * returnBlend;
    carLook.pitch += (0 - carLook.pitch) * returnBlend;
    if (Math.abs(carLook.yaw) < 0.002) carLook.yaw = 0;
    if (Math.abs(carLook.pitch) < 0.002) carLook.pitch = 0;
  }
  carLook.yaw = normalizeHeading(carLook.yaw);
  carLook.pitch = clampValue(carLook.pitch, -0.62, 0.62);

  // Normal car camera modes
  const lb = appCtx.keys.KeyV;
  const planetaryChase = !!(appCtx.onMoon || appCtx.onMars || appCtx.activePlanetaryBodyId);

  // Get car's actual Y position (follows terrain)
  const carGroundY = Number(presentationCar?.y ?? appCtx.carMesh.position.y) - CAR_BODY_HEIGHT_FROM_GROUND;
  const carX = Number(presentationCar?.x ?? appCtx.car.x);
  const carZ = Number(presentationCar?.z ?? appCtx.car.z);
  const carAngle = Number(presentationCar?.angle ?? appCtx.car.angle);
  const tunnelCameraState = resolveTunnelCameraState({
    disabled: planetaryChase,
    road: appCtx.car?.road || null,
    x: carX,
    z: carZ,
    angle: carAngle,
    lookYaw: carLook.yaw,
    reverse: lb,
    trailingDistance: CHASE_CAMERA_DISTANCE
  });
  const tunnelCameraEnvelope = tunnelCameraState.envelope;
  const tunnelCameraTransitionOnly = tunnelCameraState.transitionOnly;
  const insideTunnel = tunnelCameraState.inside;
  const d = insideTunnel
    ? tunnelCameraEnvelope.chaseDistance
    : planetaryChase ? 12 : CHASE_CAMERA_DISTANCE;
  const h = insideTunnel
    ? tunnelCameraEnvelope.cameraHeight
    : planetaryChase ? 6.5 : CHASE_CAMERA_HEIGHT;
  const viewAngle = carAngle + carLook.yaw + (lb ? Math.PI : 0);

  // Show car mesh for non-first-person modes
  if (appCtx.camMode !== 1 && appCtx.carMesh && !appCtx.carMesh.visible) {
    appCtx.carMesh.visible = true;
  }

  if (appCtx.camMode === 0) {
    // Chase camera - follow behind car at terrain height
    const horizontalDistance = d * Math.cos(carLook.pitch * 0.55);
    const ox = -Math.sin(viewAngle) * horizontalDistance;
    const oz = -Math.cos(viewAngle) * horizontalDistance;
    let targetX = carX + ox;
    const cameraFloorY = insideTunnel ? tunnelCameraEnvelope.floorY : carGroundY;
    const maximumTunnelCameraY = insideTunnel
      ? tunnelCameraEnvelope.ceilingY - 0.35
      : Infinity;
    let targetY = Math.min(
      maximumTunnelCameraY,
      cameraFloorY + h + Math.sin(carLook.pitch) * d * 0.72
    );
    let targetZ = carZ + oz;
    const lookX = carX;
    const lookY = insideTunnel
      ? tunnelCameraTransitionOnly
        ? carGroundY + 0.5
        : tunnelCameraEnvelope.floorY + tunnelCameraEnvelope.lookHeight
      : carGroundY + (planetaryChase ? 2.1 : 0.5);
    const lookZ = carZ;
    let collisionTarget = planetaryChase
      ? { x: targetX, y: targetY, z: targetZ, collided: false }
      : resolveChaseCameraStructureCollision(
          lookX, lookY, lookZ,
          targetX, targetY, targetZ,
          dt
        );
    if (!planetaryChase && !insideTunnel) {
      const terrainTarget = resolveChaseCameraTerrainCollision(
        { x: lookX, y: lookY, z: lookZ },
        collisionTarget,
        (x, z) => appCtx.SurfaceQuery?.terrainAt?.(x, z)?.position?.y
      );
      collisionTarget = {
        ...terrainTarget,
        collided: collisionTarget.collided || terrainTarget.collided
      };
    }
    targetX = collisionTarget.x;
    targetY = collisionTarget.y;
    targetZ = collisionTarget.z;

    // Smooth both camera position and lookAt target together
    // Higher factor = camera stays more rigidly fixed to car
    const smoothFactor = cameraSmoothingBlend(
      collisionTarget.collided ? 42 : CHASE_CAMERA_SMOOTH_RATE,
      dt
    );
    appCtx.camera.position.x += (targetX - appCtx.camera.position.x) * smoothFactor;
    appCtx.camera.position.y += (targetY - appCtx.camera.position.y) * smoothFactor;
    appCtx.camera.position.z += (targetZ - appCtx.camera.position.z) * smoothFactor;
    if (insideTunnel) {
      appCtx.camera.position.y = Math.max(
        tunnelCameraEnvelope.floorY + 0.35,
        Math.min(tunnelCameraEnvelope.ceilingY - 0.28, appCtx.camera.position.y)
      );
    }

    // Initialize lookAt target if needed
    if (!appCtx.camera.userData.lookTarget) {
      appCtx.camera.userData.lookTarget = { x: lookX, y: lookY, z: lookZ };
    }

    // Smooth the lookAt target
    appCtx.camera.userData.lookTarget.x += (lookX - appCtx.camera.userData.lookTarget.x) * smoothFactor;
    appCtx.camera.userData.lookTarget.y += (lookY - appCtx.camera.userData.lookTarget.y) * smoothFactor;
    appCtx.camera.userData.lookTarget.z += (lookZ - appCtx.camera.userData.lookTarget.z) * smoothFactor;

    appCtx.camera.lookAt(appCtx.camera.userData.lookTarget.x, appCtx.camera.userData.lookTarget.y, appCtx.camera.userData.lookTarget.z);
  } else if (appCtx.camMode === 1) {
    // Hood camera - positioned at front of car looking forward over the hood
    // Move camera forward to the hood area (1.2 units ahead of car center)
    const fwdX = Math.sin(carAngle) * HOOD_FORWARD_OFFSET;
    const fwdZ = Math.cos(carAngle) * HOOD_FORWARD_OFFSET;
    appCtx.camera.position.set(carX + fwdX, carGroundY + HOOD_CAMERA_HEIGHT, carZ + fwdZ);
    appCtx.camera.lookAt(
      carX + Math.sin(viewAngle) * HOOD_LOOK_DISTANCE,
      carGroundY + 1.6 + Math.sin(carLook.pitch) * HOOD_LOOK_DISTANCE,
      carZ + Math.cos(viewAngle) * HOOD_LOOK_DISTANCE
    );
    // Hide car mesh in first-person so you don't see tires/body
    if (appCtx.carMesh) appCtx.carMesh.visible = false;
  } else {
    // Overhead camera - high above car
    appCtx.camera.position.set(carX, carGroundY + OVERHEAD_CAMERA_HEIGHT, carZ + OVERHEAD_CAMERA_Z_OFFSET);
    appCtx.camera.lookAt(carX, carGroundY, carZ);
  }

  updateBillboardMarkers();
  updateCameraLinkedEffects();
}

function updateHUD() {
  // Keep controls panel sections and header synchronized with the active mode.
  if (typeof appCtx.updateControlsModeUI === 'function') appCtx.updateControlsModeUI();

  if (appCtx.boatMode?.active) {
    const knots = Math.max(0, Math.round(Math.abs(worldUnitsPerSecondToKnots(
      appCtx.boat.forwardSpeed ?? appCtx.boat.speed,
      appCtx.METERS_PER_WORLD_UNIT
    ))));
    const seaLabel = typeof appCtx.boatHudLabel === 'function' ? appCtx.boatHudLabel() : 'Boat Travel';
    const shorelineKnown = appCtx.boatMode.currentWater?.shorelineDistanceKnown !== false;
    const shoreline = shorelineKnown && Number.isFinite(appCtx.boatMode.shorelineDistance) ?
      Math.round(appCtx.boatMode.shorelineDistance) : null;
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
    updateCoordinatesHud(appCtx.boat.x, appCtx.boat.z, appCtx.boat.angle);
    return;
  }

  if (appCtx.planeMode?.active) {
    const plane = appCtx.planeMode;
    const groundY = appCtx.SurfaceQuery?.terrainAt?.(plane.x, plane.z)?.position?.y ?? 0;
    const altitude = Math.max(0, Math.round(plane.y - groundY));
    const mph = Math.max(0, Math.round(worldUnitsPerSecondToMph(plane.speed, appCtx.METERS_PER_WORLD_UNIT)));
    setHudUnitLabels('MPH', 'ALT');
    document.getElementById('speed').textContent = `${mph}`;
    document.getElementById('speed').classList.toggle('fast', mph > 105);
    document.getElementById('limit').textContent = `${altitude}`;
    setStreetAndLocation(plane.airborne ? 'Flight' : 'Taxi', locationName());
    const bf = document.getElementById('boostFill');
    bf.style.width = `${Math.round(clampValue(plane.throttle, 0, 1) * 100)}%`;
    bf.classList.toggle('active', plane.throttle > 0.82);
    document.getElementById('indBrake').classList.toggle('on', Number(appCtx.readControlActions?.('plane')?.brake) > 0.05 && !plane.airborne);
    document.getElementById('indBoost').classList.toggle('on', plane.throttle > 0.82);
    document.getElementById('indBoost').textContent = 'PWR';
    document.getElementById('indDrift').classList.toggle('on', plane.airborne);
    document.getElementById('indDrift').textContent = plane.airborne ? 'AIR' : 'GEAR';
    updateCoordinatesHud(plane.x, plane.z, plane.yaw);
    return;
  }

  if (appCtx.droneMode) {
    // Calculate ground elevation for altitude display
    let groundY = 0;
    if (appCtx.onMars || appCtx.onMoon) {
      const surfaceY = planetarySurfaceYAtRenderXZ(appCtx, appCtx.drone.x, appCtx.drone.z);
      if (Number.isFinite(surfaceY)) groundY = surfaceY;
    } else if (appCtx.terrainEnabled) {
      groundY = appCtx.SurfaceQuery?.terrainAt?.(appCtx.drone.x, appCtx.drone.z)?.position?.y ?? 0;
    }

    const altitudeMeters = Math.max(0, Math.round(appCtx.drone.y - groundY));
    const droneSpeedMph = Math.max(0, Math.round(worldUnitsPerSecondToMph(
      Math.hypot(Number(appCtx.drone.vx) || 0, Number(appCtx.drone.vy) || 0, Number(appCtx.drone.vz) || 0),
      appCtx.METERS_PER_WORLD_UNIT
    )));
    // Keep the primary readout semantically consistent across traversal modes:
    // speed stays speed, while the secondary value carries height.
    setHudUnitLabels('MPH', 'HEIGHT');
    document.getElementById('speed').textContent = `${droneSpeedMph}`;
    document.getElementById('speed').classList.remove('fast');
    document.getElementById('limit').textContent = `${altitudeMeters}m`;
    setStreetAndLocation('Drone View', locationName());
    const bf = document.getElementById('boostFill');
    bf.style.width = '0%';
    bf.classList.remove('active');
    document.getElementById('indBrake').classList.remove('on');
    document.getElementById('indBoost').classList.remove('on');
    document.getElementById('indDrift').classList.remove('on');
    document.getElementById('indDrift').textContent = 'DRONE';
    updateCoordinatesHud(appCtx.drone.x, appCtx.drone.z, appCtx.drone.yaw);

    return;
  }

  // Walking mode HUD - uses Walk module data
  if (appCtx.Walk && appCtx.Walk.state.mode === 'walk') {
    const mph = Math.abs(Math.round(appCtx.Walk.state.walker.speedMph));
    const locName = locationName();
    const running = appCtx.keys.ShiftLeft || appCtx.keys.ShiftRight;
    const activeInterior = appCtx.activeInterior || null;

    let walkSurface = null;
    if (!activeInterior && !appCtx.onMoon && !appCtx.onMars) {
      const walker = appCtx.Walk.state.walker;
      const authoritativeWalkSurface = appCtx.SurfaceQuery?.walkAt?.(
        walker.x,
        walker.z,
        {
          currentY: Number(walker.y) - 1.7,
          // The HUD needs mapped identity and speed-limit metadata, not a
          // second rendered-geometry height sample. Walking physics already
          // owns contact resolution through this same SurfaceQuery authority.
          sampleRenderedMesh: false
        }
      );
      if (authoritativeWalkSurface?.feature) {
        walkSurface = authoritativeWalkSurface.feature;
      } else if (typeof appCtx.findNearestTraversalFeature === 'function') {
        const nearest = appCtx.findNearestTraversalFeature(walker.x, walker.z, {
          mode: 'walk',
          maxDistance: 18
        });
        if (nearest?.feature) {
          const featureWidth = Number.isFinite(nearest.feature.width) ? nearest.feature.width : 4;
          const edge = Math.max(WALK_ROAD_EDGE_MIN, featureWidth * WALK_ROAD_EDGE_SCALE);
          if (nearest.dist < edge) walkSurface = nearest.feature;
        }
      }
    }

    setHudUnitLabels('MPH', 'LIMIT');
    document.getElementById('speed').textContent = mph;
    document.getElementById('speed').classList.remove('fast');
    document.getElementById('limit').textContent = activeInterior ? '' : (walkSurface?.limit ? walkSurface.limit || 25 : '');
    const planetaryWalkLabel = appCtx.onMars ? 'Martian Surface' : appCtx.onMoon ? 'Lunar Surface' : null;
    const walkLabel = planetaryWalkLabel || (
      walkSurface && typeof appCtx.surfaceDisplayName === 'function'
        ? appCtx.surfaceDisplayName(walkSurface)
        : walkSurface?.name || 'Terrain'
    );
    setStreetAndLocation(
      activeInterior ?
        `${activeInterior.label || 'Interior'} Interior` :
        walkLabel,
      activeInterior ? `${locName} • On-demand` : locName
    );
    const bf = document.getElementById('boostFill');
    bf.style.width = '0%';
    bf.classList.remove('active');
    document.getElementById('indBrake').classList.remove('on');
    document.getElementById('indBoost').classList.remove('on');
    document.getElementById('indDrift').textContent = running ? 'RUN' : 'WALK';
    document.getElementById('indDrift').classList.toggle('on', running);

    // Use WALKER position for coordinates
    updateCoordinatesHud(
      appCtx.Walk.state.walker.x,
      appCtx.Walk.state.walker.z,
      appCtx.Walk.state.walker.angle
    );

    return;
  }

  // Normal car HUD
  const mph = Math.abs(Math.round(carSpeedToMph(appCtx.car.speed)));
  const limit = appCtx.onMars ? 15 : appCtx.onMoon ? 12 : appCtx.car.road?.limit || 25;
  const locName = locationName();
  setHudUnitLabels('MPH', 'LIMIT');
  document.getElementById('speed').textContent = mph;
  document.getElementById('speed').classList.toggle('fast', mph > limit || appCtx.car.boost);
  document.getElementById('limit').textContent = limit;
  const planetarySurfaceLabel = appCtx.onMars ? 'Martian Surface' : appCtx.onMoon ? 'Lunar Surface' : null;
  setStreetAndLocation(planetarySurfaceLabel || appCtx.car.road?.name || 'Exploring', locName);
  const bf = document.getElementById('boostFill');
  bf.style.width = appCtx.car.boost ? appCtx.car.boostTime / appCtx.CFG.boostDur * 100 + '%' : appCtx.car.boostReady ? '100%' : '0%';
  bf.classList.toggle('active', appCtx.car.boost);
  document.getElementById('indBrake').classList.toggle('on', appCtx.keys.Space);
  document.getElementById('indBoost').classList.toggle('on', appCtx.car.boost);
  const isDrifting = appCtx.car.isDrifting === true && Math.abs(appCtx.car.driftAngle) > 0.08;
  document.getElementById('indDrift').classList.toggle('on', isDrifting);
  if (isDrifting) document.getElementById('indDrift').textContent = 'DRIFT ' + Math.round(Math.abs(appCtx.car.driftAngle) * 180 / Math.PI) + '°';else
  document.getElementById('indDrift').textContent = 'DRIFT';
  updateCoordinatesHud(appCtx.car.x, appCtx.car.z, appCtx.car.angle);

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
