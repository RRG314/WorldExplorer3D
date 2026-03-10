import { ctx as appCtx } from "./shared-context.js?v=55"; // ============================================================================
// hud.js - HUD updates, camera system, sky positioning
// ============================================================================

const COMPASS_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const RAD_TO_DEG = 180 / Math.PI;
const GEO_DECIMALS = 4;
const CAR_BODY_HEIGHT_FROM_GROUND = 1.2;
const CHASE_CAMERA_DISTANCE = 10;
const CHASE_CAMERA_HEIGHT = 5;
const CHASE_CAMERA_SMOOTH_FACTOR = 0.7;
const HOOD_FORWARD_OFFSET = 1.2;
const HOOD_LOOK_DISTANCE = 10;
const HOOD_CAMERA_HEIGHT = 1.8;
const OVERHEAD_CAMERA_HEIGHT = 50;
const OVERHEAD_CAMERA_Z_OFFSET = 15;
const WALK_ROAD_EDGE_MIN = 6;
const WALK_ROAD_EDGE_SCALE = 0.75;

function locationName() {
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

  // Sun - always high above camera, maintaining horizontal offset
  if (appCtx.sunSphere) {
    appCtx.sunSphere.position.set(cameraX + 500, cameraY + 800, cameraZ + 200);
    // Keep sun glow in sync
    if (appCtx.sunSphere.userData.glow) {
      appCtx.sunSphere.userData.glow.position.copy(appCtx.sunSphere.position);
    }
  }

  // Directional sun light - follow camera position for proper shadows
  if (appCtx.sun) {
    appCtx.sun.position.set(cameraX + 100, cameraY + 150, cameraZ + 50);
    // Update shadow camera to follow as well
    if (appCtx.sun.shadow && appCtx.sun.shadow.camera) {
      appCtx.sun.shadow.camera.position.copy(appCtx.sun.position);
      appCtx.sun.shadow.camera.updateProjectionMatrix();
    }
  }

  // Moon - always high above camera, on opposite side from sun
  if (appCtx.moonSphere) {
    appCtx.moonSphere.position.set(cameraX - 500, cameraY + 800, cameraZ - 200);
    // Keep moon glow in sync
    if (appCtx.moonSphere.userData.glow) {
      appCtx.moonSphere.userData.glow.position.copy(appCtx.moonSphere.position);
    }
  }

  // Fill light - subtle ambient lighting from opposite direction
  if (appCtx.fillLight) {
    appCtx.fillLight.position.set(cameraX - 50, cameraY + 50, cameraZ - 50);
  }

  // Hemisphere light - subtle gradient from sky to ground
  if (appCtx.hemiLight) {
    appCtx.hemiLight.position.set(cameraX, cameraY + 100, cameraZ);
  }

  // Clouds - float at camera level + offset
  if (appCtx.cloudGroup) {
    // Keep clouds at a reasonable height above camera (400-600 units)
    appCtx.cloudGroup.children.forEach((cloud, i) => {
      // Each cloud has a different base height offset
      const baseOffset = 400 + i % 5 * 50;
      const targetY = cameraY + baseOffset;

      // Smoothly transition cloud height to follow camera
      cloud.position.y += (targetY - cloud.position.y) * 0.02;
    });
  }
}

function updateCamera() {
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

  // Get car's actual Y position (follows terrain)
  const carGroundY = appCtx.carMesh.position.y - CAR_BODY_HEIGHT_FROM_GROUND;

  // Show car mesh for non-first-person modes
  if (appCtx.camMode !== 1 && appCtx.carMesh && !appCtx.carMesh.visible) {
    appCtx.carMesh.visible = true;
  }

  if (appCtx.camMode === 0) {
    // Chase camera - follow behind car at terrain height
    const ox = -Math.sin(appCtx.car.angle) * (lb ? -d : d);
    const oz = -Math.cos(appCtx.car.angle) * (lb ? -d : d);
    const targetX = appCtx.car.x + ox;
    const targetY = carGroundY + h;
    const targetZ = appCtx.car.z + oz;
    const lookX = appCtx.car.x;
    const lookY = carGroundY + 0.5;
    const lookZ = appCtx.car.z;

    // Smooth both camera position and lookAt target together
    // Higher factor = camera stays more rigidly fixed to car
    const smoothFactor = CHASE_CAMERA_SMOOTH_FACTOR;
    appCtx.camera.position.x += (targetX - appCtx.camera.position.x) * smoothFactor;
    appCtx.camera.position.y += (targetY - appCtx.camera.position.y) * smoothFactor;
    appCtx.camera.position.z += (targetZ - appCtx.camera.position.z) * smoothFactor;

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
    const fwdX = Math.sin(appCtx.car.angle) * HOOD_FORWARD_OFFSET;
    const fwdZ = Math.cos(appCtx.car.angle) * HOOD_FORWARD_OFFSET;
    appCtx.camera.position.set(appCtx.car.x + fwdX, carGroundY + HOOD_CAMERA_HEIGHT, appCtx.car.z + fwdZ);
    const dir = lb ? -1 : 1;
    appCtx.camera.lookAt(
      appCtx.car.x + Math.sin(appCtx.car.angle) * HOOD_LOOK_DISTANCE * dir,
      carGroundY + 1.6,
      appCtx.car.z + Math.cos(appCtx.car.angle) * HOOD_LOOK_DISTANCE * dir
    );
    // Hide car mesh in first-person so you don't see tires/body
    if (appCtx.carMesh) appCtx.carMesh.visible = false;
  } else {
    // Overhead camera - high above car
    appCtx.camera.position.set(appCtx.car.x, carGroundY + OVERHEAD_CAMERA_HEIGHT, appCtx.car.z + OVERHEAD_CAMERA_Z_OFFSET);
    appCtx.camera.lookAt(appCtx.car.x, carGroundY, appCtx.car.z);
  }

  updateBillboardMarkers();
  updateCameraLinkedEffects();
}

function updateHUD() {
  // Keep controls panel sections and header synchronized with the active mode.
  if (typeof appCtx.updateControlsModeUI === 'function') appCtx.updateControlsModeUI();

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

    let walkRoad = null;
    if (!appCtx.onMoon && appCtx.roads && appCtx.roads.length > 0) {
      let nearest = null;
      if (typeof appCtx.getNearestRoadThrottled === 'function') {
        nearest = appCtx.getNearestRoadThrottled(appCtx.Walk.state.walker.x, appCtx.Walk.state.walker.z, false);
      } else if (typeof appCtx.findNearestRoad === 'function') {
        nearest = appCtx.findNearestRoad(appCtx.Walk.state.walker.x, appCtx.Walk.state.walker.z);
      }
      if (nearest && nearest.road) {
        const edge = Math.max(WALK_ROAD_EDGE_MIN, (nearest.road.w || 10) * WALK_ROAD_EDGE_SCALE);
        if (nearest.dist < edge) walkRoad = nearest.road;
      }
    }

    setHudUnitLabels('MPH', 'LIMIT');
    document.getElementById('speed').textContent = mph;
    document.getElementById('speed').classList.remove('fast');
    document.getElementById('limit').textContent = walkRoad ? walkRoad.limit || 25 : '';
    setStreetAndLocation(walkRoad?.name || 'Off Road', locName);
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
  const mph = Math.abs(Math.round(appCtx.car.speed * 0.5));
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

// OSM Tile functions

Object.assign(appCtx, { updateCamera, updateHUD, updateSkyPositions });

export { updateCamera, updateHUD, updateSkyPositions };
