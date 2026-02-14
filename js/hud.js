import { ctx as appCtx } from "./shared-context.js?v=52"; // ============================================================================
// hud.js - HUD updates, camera system, sky positioning
// ============================================================================

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

    // Update star field to follow camera
    if (appCtx.starField) {
      appCtx.starField.position.copy(appCtx.camera.position);
    }

    // Update sun/moon positions to be relative to camera
    updateSkyPositions();

    return;
  }

  // Walking module handles camera when in walk mode
  if (appCtx.Walk) {
    const walkCameraApplied = appCtx.Walk.applyCameraIfWalking();
    if (walkCameraApplied) {
      // Update billboards to face camera
      appCtx.propMarkers.forEach((marker) => {
        if (marker.userData.isBillboard) {
          marker.lookAt(appCtx.camera.position);
        }
      });
      // Update star field to follow camera
      if (appCtx.starField) {
        appCtx.starField.position.copy(appCtx.camera.position);
      }
      // Update sun/moon positions to be relative to camera
      updateSkyPositions();
      return;
    }
  }

  // Normal car camera modes
  const lb = appCtx.keys.KeyV;
  const d = 10,h = 5;

  // Get car's actual Y position (follows terrain)
  const carGroundY = appCtx.carMesh.position.y - 1.2; // Car body is 1.2 above ground

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
    const smoothFactor = 0.7;
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
    const fwdX = Math.sin(appCtx.car.angle) * 1.2;
    const fwdZ = Math.cos(appCtx.car.angle) * 1.2;
    appCtx.camera.position.set(appCtx.car.x + fwdX, carGroundY + 1.8, appCtx.car.z + fwdZ);
    const dir = lb ? -1 : 1;
    appCtx.camera.lookAt(
      appCtx.car.x + Math.sin(appCtx.car.angle) * 10 * dir,
      carGroundY + 1.6,
      appCtx.car.z + Math.cos(appCtx.car.angle) * 10 * dir
    );
    // Hide car mesh in first-person so you don't see tires/body
    if (appCtx.carMesh) appCtx.carMesh.visible = false;
  } else {
    // Overhead camera - high above car
    appCtx.camera.position.set(appCtx.car.x, carGroundY + 50, appCtx.car.z + 15);
    appCtx.camera.lookAt(appCtx.car.x, carGroundY, appCtx.car.z);
  }

  // Update billboards to face camera
  appCtx.propMarkers.forEach((marker) => {
    if (marker.userData.isBillboard) {
      marker.lookAt(appCtx.camera.position);
    }
  });

  // Update star field to follow camera (must be at end after camera position is set)
  if (appCtx.starField) {
    appCtx.starField.position.copy(appCtx.camera.position);
  }

  // Update sun/moon positions to be relative to camera
  updateSkyPositions();
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
      raycaster.set(appCtx._physRayStart, appCtx._physRayDir || new THREE.Vector3(0, -1, 0));
      const hits = raycaster.intersectObject(appCtx.moonSurface, false);
      if (hits.length > 0) {
        groundY = hits[0].point.y;
      }
    } else if (appCtx.terrainEnabled) {
      groundY = appCtx.elevationWorldYAtWorldXZ(appCtx.drone.x, appCtx.drone.z);
    }

    const altitudeAGL = Math.round(appCtx.drone.y - groundY); // AGL = Above Ground Level
    const altitudeMSL = Math.round(appCtx.drone.y); // MSL = Mean Sea Level (absolute)

    // Drone mode HUD
    document.getElementById('speed').textContent = altitudeAGL + 'm AGL';
    document.getElementById('speed').classList.remove('fast');
    document.getElementById('limit').textContent = '';
    const locName = appCtx.selLoc === 'custom' ? appCtx.customLoc?.name || 'Custom' : appCtx.LOCS[appCtx.selLoc].name;
    document.getElementById('street').textContent = '🚁 DRONE MODE • ' + locName;
    const bf = document.getElementById('boostFill');
    bf.style.width = '0%';
    bf.classList.remove('active');
    document.getElementById('indBrake').classList.remove('on');
    document.getElementById('indBoost').classList.remove('on');
    document.getElementById('indDrift').classList.remove('on');
    document.getElementById('indDrift').textContent = 'DRONE';
    document.getElementById('indOff').classList.remove('on', 'warn');
    document.getElementById('offRoadWarn').classList.remove('active');
    const geo = { lat: appCtx.LOC.lat - appCtx.drone.z / appCtx.SCALE, lon: appCtx.LOC.lon + appCtx.drone.x / (appCtx.SCALE * Math.cos(appCtx.LOC.lat * Math.PI / 180)) };
    let hdg = (-appCtx.drone.yaw * 180 / Math.PI + 90) % 360;if (hdg < 0) hdg += 360;
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const pitch = Math.round(appCtx.drone.pitch * 180 / Math.PI);
    document.getElementById('coords').textContent = geo.lat.toFixed(4) + ', ' + geo.lon.toFixed(4) + ' | ' + dirs[Math.round(hdg / 45) % 8] + ' ' + Math.round(hdg) + '° | P:' + pitch + '°';

    // Mode HUD - show mode and altitude (both AGL and MSL)
    document.getElementById('modeTitle').textContent = '🚁 Drone Mode';
    const modeTimer = document.getElementById('modeTimer');
    modeTimer.textContent = 'Alt: ' + altitudeAGL + 'm AGL (' + altitudeMSL + 'm MSL)';
    modeTimer.classList.add('show');
    document.getElementById('modeInfo').classList.remove('show');
    return;
  }

  // Walking mode HUD - uses Walk module data
  if (appCtx.Walk && appCtx.Walk.state.mode === 'walk') {
    const mph = Math.abs(Math.round(appCtx.Walk.state.walker.speedMph));
    const locName = appCtx.selLoc === 'custom' ? appCtx.customLoc?.name || 'Custom' : appCtx.LOCS[appCtx.selLoc].name;
    const running = appCtx.keys.ShiftLeft || appCtx.keys.ShiftRight;
    const viewMode = appCtx.Walk.state.view === 'third' ? ' [3rd Person]' :
    appCtx.Walk.state.view === 'first' ? ' [1st Person]' :
    ' [Overhead]';

    let walkRoad = null;
    if (!appCtx.onMoon && appCtx.roads && appCtx.roads.length > 0) {
      let nearest = null;
      if (typeof appCtx.getNearestRoadThrottled === 'function') {
        nearest = appCtx.getNearestRoadThrottled(appCtx.Walk.state.walker.x, appCtx.Walk.state.walker.z, false);
      } else if (typeof appCtx.findNearestRoad === 'function') {
        nearest = appCtx.findNearestRoad(appCtx.Walk.state.walker.x, appCtx.Walk.state.walker.z);
      }
      if (nearest && nearest.road) {
        const edge = Math.max(6, (nearest.road.w || 10) * 0.75);
        if (nearest.dist < edge) walkRoad = nearest.road;
      }
    }

    document.getElementById('speed').textContent = mph;
    document.getElementById('speed').classList.remove('fast');
    document.getElementById('limit').textContent = walkRoad ? walkRoad.limit || 25 : '';
    document.getElementById('street').textContent = (walkRoad?.name || 'Off Road') + ' • ' + locName;
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
    const geo = { lat: appCtx.LOC.lat - appCtx.Walk.state.walker.z / appCtx.SCALE, lon: appCtx.LOC.lon + appCtx.Walk.state.walker.x / (appCtx.SCALE * Math.cos(appCtx.LOC.lat * Math.PI / 180)) };
    let hdg = (-appCtx.Walk.state.walker.angle * 180 / Math.PI + 90) % 360;if (hdg < 0) hdg += 360;
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    document.getElementById('coords').textContent = geo.lat.toFixed(4) + ', ' + geo.lon.toFixed(4) + ' | ' + dirs[Math.round(hdg / 45) % 8] + ' ' + Math.round(hdg) + '°';

    // Mode HUD - just show mode name
    document.getElementById('modeTitle').textContent = '🚶 Walking Mode' + viewMode;
    document.getElementById('modeTimer').classList.remove('show');
    document.getElementById('modeInfo').classList.remove('show');
    return;
  }

  // Normal car HUD
  const mph = Math.abs(Math.round(appCtx.car.speed * 0.5));
  const limit = appCtx.car.road?.limit || 25;
  const locName = appCtx.selLoc === 'custom' ? appCtx.customLoc?.name || 'Custom' : appCtx.LOCS[appCtx.selLoc].name;
  document.getElementById('speed').textContent = mph;
  document.getElementById('speed').classList.toggle('fast', mph > limit || appCtx.car.boost);
  document.getElementById('limit').textContent = limit;
  document.getElementById('street').textContent = (appCtx.car.road?.name || 'Off Road') + ' • ' + locName;
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
  const geo = { lat: appCtx.LOC.lat - appCtx.car.z / appCtx.SCALE, lon: appCtx.LOC.lon + appCtx.car.x / (appCtx.SCALE * Math.cos(appCtx.LOC.lat * Math.PI / 180)) };
  let hdg = (-appCtx.car.angle * 180 / Math.PI + 90) % 360;if (hdg < 0) hdg += 360;
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  document.getElementById('coords').textContent = geo.lat.toFixed(4) + ', ' + geo.lon.toFixed(4) + ' | ' + dirs[Math.round(hdg / 45) % 8] + ' ' + Math.round(hdg) + '°';

  const modeTimer = document.getElementById('modeTimer');
  const modeInfo = document.getElementById('modeInfo');

  if (appCtx.gameMode === 'free') {
    document.getElementById('modeTitle').textContent = '🚗 Driving';
    modeTimer.classList.remove('show');
    modeInfo.classList.remove('show');
  } else
  if (appCtx.gameMode === 'trial') {
    document.getElementById('modeTitle').textContent = '⏱️ Time Trial';
    modeTimer.textContent = appCtx.fmtTime(Math.max(0, appCtx.CFG.trialTime - appCtx.gameTimer));
    modeTimer.classList.add('show');
    modeInfo.textContent = appCtx.destination ? Math.round(Math.hypot(appCtx.destination.x - appCtx.car.x, appCtx.destination.z - appCtx.car.z)) + 'm' : '';
    modeInfo.classList.add('show');
  } else
  {
    document.getElementById('modeTitle').textContent = '🏁 Checkpoint';
    modeTimer.textContent = appCtx.fmtTime(appCtx.gameTimer);
    modeTimer.classList.add('show');
    modeInfo.textContent = appCtx.cpCollected + '/' + appCtx.checkpoints.length;
    modeInfo.classList.add('show');
  }

}

// OSM Tile functions

Object.assign(appCtx, { updateCamera, updateHUD, updateSkyPositions });

export { updateCamera, updateHUD, updateSkyPositions };