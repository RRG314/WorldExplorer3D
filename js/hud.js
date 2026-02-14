import { ctx } from "./shared-context.js?v=52"; // ============================================================================
// hud.js - HUD updates, camera system, sky positioning
// ============================================================================

function updateSkyPositions() {
  if (!ctx.camera) return;

  const cameraY = ctx.camera.position.y;
  const cameraX = ctx.camera.position.x;
  const cameraZ = ctx.camera.position.z;

  // Sun - always high above camera, maintaining horizontal offset
  if (ctx.sunSphere) {
    ctx.sunSphere.position.set(cameraX + 500, cameraY + 800, cameraZ + 200);
    // Keep sun glow in sync
    if (ctx.sunSphere.userData.glow) {
      ctx.sunSphere.userData.glow.position.copy(ctx.sunSphere.position);
    }
  }

  // Directional sun light - follow camera position for proper shadows
  if (ctx.sun) {
    ctx.sun.position.set(cameraX + 100, cameraY + 150, cameraZ + 50);
    // Update shadow camera to follow as well
    if (ctx.sun.shadow && ctx.sun.shadow.camera) {
      ctx.sun.shadow.camera.position.copy(ctx.sun.position);
      ctx.sun.shadow.camera.updateProjectionMatrix();
    }
  }

  // Moon - always high above camera, on opposite side from sun
  if (ctx.moonSphere) {
    ctx.moonSphere.position.set(cameraX - 500, cameraY + 800, cameraZ - 200);
    // Keep moon glow in sync
    if (ctx.moonSphere.userData.glow) {
      ctx.moonSphere.userData.glow.position.copy(ctx.moonSphere.position);
    }
  }

  // Fill light - subtle ambient lighting from opposite direction
  if (ctx.fillLight) {
    ctx.fillLight.position.set(cameraX - 50, cameraY + 50, cameraZ - 50);
  }

  // Hemisphere light - subtle gradient from sky to ground
  if (ctx.hemiLight) {
    ctx.hemiLight.position.set(cameraX, cameraY + 100, cameraZ);
  }

  // Clouds - float at camera level + offset
  if (ctx.cloudGroup) {
    // Keep clouds at a reasonable height above camera (400-600 units)
    ctx.cloudGroup.children.forEach((cloud, i) => {
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
  if (ctx.droneMode) {
    ctx.camera.position.set(ctx.drone.x, ctx.drone.y, ctx.drone.z);

    // Use Euler angles for proper rotation without gimbal lock
    // Order: YXZ (yaw, pitch, roll)
    ctx.camera.rotation.order = 'YXZ';
    ctx.camera.rotation.y = ctx.drone.yaw; // Camera faces movement direction
    ctx.camera.rotation.x = ctx.drone.pitch;
    ctx.camera.rotation.z = ctx.drone.roll;

    // Update star field to follow camera
    if (ctx.starField) {
      ctx.starField.position.copy(ctx.camera.position);
    }

    // Update sun/moon positions to be relative to camera
    updateSkyPositions();

    return;
  }

  // Walking module handles camera when in walk mode
  if (ctx.Walk) {
    const walkCameraApplied = ctx.Walk.applyCameraIfWalking();
    if (walkCameraApplied) {
      // Update billboards to face camera
      ctx.propMarkers.forEach((marker) => {
        if (marker.userData.isBillboard) {
          marker.lookAt(ctx.camera.position);
        }
      });
      // Update star field to follow camera
      if (ctx.starField) {
        ctx.starField.position.copy(ctx.camera.position);
      }
      // Update sun/moon positions to be relative to camera
      updateSkyPositions();
      return;
    }
  }

  // Normal car camera modes
  const lb = ctx.keys.KeyV;
  const d = 10,h = 5;

  // Get car's actual Y position (follows terrain)
  const carGroundY = ctx.carMesh.position.y - 1.2; // Car body is 1.2 above ground

  // Show car mesh for non-first-person modes
  if (ctx.camMode !== 1 && ctx.carMesh && !ctx.carMesh.visible) {
    ctx.carMesh.visible = true;
  }

  if (ctx.camMode === 0) {
    // Chase camera - follow behind car at terrain height
    const ox = -Math.sin(ctx.car.angle) * (lb ? -d : d);
    const oz = -Math.cos(ctx.car.angle) * (lb ? -d : d);
    const targetX = ctx.car.x + ox;
    const targetY = carGroundY + h;
    const targetZ = ctx.car.z + oz;
    const lookX = ctx.car.x;
    const lookY = carGroundY + 0.5;
    const lookZ = ctx.car.z;

    // Smooth both camera position and lookAt target together
    // Higher factor = camera stays more rigidly fixed to car
    const smoothFactor = 0.7;
    ctx.camera.position.x += (targetX - ctx.camera.position.x) * smoothFactor;
    ctx.camera.position.y += (targetY - ctx.camera.position.y) * smoothFactor;
    ctx.camera.position.z += (targetZ - ctx.camera.position.z) * smoothFactor;

    // Initialize lookAt target if needed
    if (!ctx.camera.userData.lookTarget) {
      ctx.camera.userData.lookTarget = { x: lookX, y: lookY, z: lookZ };
    }

    // Smooth the lookAt target
    ctx.camera.userData.lookTarget.x += (lookX - ctx.camera.userData.lookTarget.x) * smoothFactor;
    ctx.camera.userData.lookTarget.y += (lookY - ctx.camera.userData.lookTarget.y) * smoothFactor;
    ctx.camera.userData.lookTarget.z += (lookZ - ctx.camera.userData.lookTarget.z) * smoothFactor;

    ctx.camera.lookAt(ctx.camera.userData.lookTarget.x, ctx.camera.userData.lookTarget.y, ctx.camera.userData.lookTarget.z);
  } else if (ctx.camMode === 1) {
    // Hood camera - positioned at front of car looking forward over the hood
    // Move camera forward to the hood area (1.2 units ahead of car center)
    const fwdX = Math.sin(ctx.car.angle) * 1.2;
    const fwdZ = Math.cos(ctx.car.angle) * 1.2;
    ctx.camera.position.set(ctx.car.x + fwdX, carGroundY + 1.8, ctx.car.z + fwdZ);
    const dir = lb ? -1 : 1;
    ctx.camera.lookAt(
      ctx.car.x + Math.sin(ctx.car.angle) * 10 * dir,
      carGroundY + 1.6,
      ctx.car.z + Math.cos(ctx.car.angle) * 10 * dir
    );
    // Hide car mesh in first-person so you don't see tires/body
    if (ctx.carMesh) ctx.carMesh.visible = false;
  } else {
    // Overhead camera - high above car
    ctx.camera.position.set(ctx.car.x, carGroundY + 50, ctx.car.z + 15);
    ctx.camera.lookAt(ctx.car.x, carGroundY, ctx.car.z);
  }

  // Update billboards to face camera
  ctx.propMarkers.forEach((marker) => {
    if (marker.userData.isBillboard) {
      marker.lookAt(ctx.camera.position);
    }
  });

  // Update star field to follow camera (must be at end after camera position is set)
  if (ctx.starField) {
    ctx.starField.position.copy(ctx.camera.position);
  }

  // Update sun/moon positions to be relative to camera
  updateSkyPositions();
}

function updateHUD() {
  // Keep controls panel sections and header synchronized with the active mode.
  if (typeof ctx.updateControlsModeUI === 'function') ctx.updateControlsModeUI();

  if (ctx.droneMode) {
    // Calculate ground elevation for altitude display
    let groundY = 0;
    if (ctx.onMoon && ctx.moonSurface) {
      const raycaster = ctx._getPhysRaycaster();
      ctx._physRayStart.set(ctx.drone.x, 2000, ctx.drone.z);
      raycaster.set(ctx._physRayStart, ctx._physRayDir || new THREE.Vector3(0, -1, 0));
      const hits = raycaster.intersectObject(ctx.moonSurface, false);
      if (hits.length > 0) {
        groundY = hits[0].point.y;
      }
    } else if (ctx.terrainEnabled) {
      groundY = ctx.elevationWorldYAtWorldXZ(ctx.drone.x, ctx.drone.z);
    }

    const altitudeAGL = Math.round(ctx.drone.y - groundY); // AGL = Above Ground Level
    const altitudeMSL = Math.round(ctx.drone.y); // MSL = Mean Sea Level (absolute)

    // Drone mode HUD
    document.getElementById('speed').textContent = altitudeAGL + 'm AGL';
    document.getElementById('speed').classList.remove('fast');
    document.getElementById('limit').textContent = '';
    const locName = ctx.selLoc === 'custom' ? ctx.customLoc?.name || 'Custom' : ctx.LOCS[ctx.selLoc].name;
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
    const geo = { lat: ctx.LOC.lat - ctx.drone.z / ctx.SCALE, lon: ctx.LOC.lon + ctx.drone.x / (ctx.SCALE * Math.cos(ctx.LOC.lat * Math.PI / 180)) };
    let hdg = (-ctx.drone.yaw * 180 / Math.PI + 90) % 360;if (hdg < 0) hdg += 360;
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const pitch = Math.round(ctx.drone.pitch * 180 / Math.PI);
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
  if (ctx.Walk && ctx.Walk.state.mode === 'walk') {
    const mph = Math.abs(Math.round(ctx.Walk.state.walker.speedMph));
    const locName = ctx.selLoc === 'custom' ? ctx.customLoc?.name || 'Custom' : ctx.LOCS[ctx.selLoc].name;
    const running = ctx.keys.ShiftLeft || ctx.keys.ShiftRight;
    const viewMode = ctx.Walk.state.view === 'third' ? ' [3rd Person]' :
    ctx.Walk.state.view === 'first' ? ' [1st Person]' :
    ' [Overhead]';

    let walkRoad = null;
    if (!ctx.onMoon && ctx.roads && ctx.roads.length > 0) {
      let nearest = null;
      if (typeof ctx.getNearestRoadThrottled === 'function') {
        nearest = ctx.getNearestRoadThrottled(ctx.Walk.state.walker.x, ctx.Walk.state.walker.z, false);
      } else if (typeof ctx.findNearestRoad === 'function') {
        nearest = ctx.findNearestRoad(ctx.Walk.state.walker.x, ctx.Walk.state.walker.z);
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
    const geo = { lat: ctx.LOC.lat - ctx.Walk.state.walker.z / ctx.SCALE, lon: ctx.LOC.lon + ctx.Walk.state.walker.x / (ctx.SCALE * Math.cos(ctx.LOC.lat * Math.PI / 180)) };
    let hdg = (-ctx.Walk.state.walker.angle * 180 / Math.PI + 90) % 360;if (hdg < 0) hdg += 360;
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    document.getElementById('coords').textContent = geo.lat.toFixed(4) + ', ' + geo.lon.toFixed(4) + ' | ' + dirs[Math.round(hdg / 45) % 8] + ' ' + Math.round(hdg) + '°';

    // Mode HUD - just show mode name
    document.getElementById('modeTitle').textContent = '🚶 Walking Mode' + viewMode;
    document.getElementById('modeTimer').classList.remove('show');
    document.getElementById('modeInfo').classList.remove('show');
    return;
  }

  // Normal car HUD
  const mph = Math.abs(Math.round(ctx.car.speed * 0.5));
  const limit = ctx.car.road?.limit || 25;
  const locName = ctx.selLoc === 'custom' ? ctx.customLoc?.name || 'Custom' : ctx.LOCS[ctx.selLoc].name;
  document.getElementById('speed').textContent = mph;
  document.getElementById('speed').classList.toggle('fast', mph > limit || ctx.car.boost);
  document.getElementById('limit').textContent = limit;
  document.getElementById('street').textContent = (ctx.car.road?.name || 'Off Road') + ' • ' + locName;
  const bf = document.getElementById('boostFill');
  bf.style.width = ctx.car.boost ? ctx.car.boostTime / ctx.CFG.boostDur * 100 + '%' : ctx.car.boostReady ? '100%' : '0%';
  bf.classList.toggle('active', ctx.car.boost);
  document.getElementById('indBrake').classList.toggle('on', ctx.keys.Space);
  document.getElementById('indBoost').classList.toggle('on', ctx.car.boost);
  const isDrifting = Math.abs(ctx.car.driftAngle) > 0.15 && Math.abs(ctx.car.speed) > 30;
  document.getElementById('indDrift').classList.toggle('on', isDrifting);
  if (isDrifting) document.getElementById('indDrift').textContent = 'DRIFT ' + Math.round(Math.abs(ctx.car.driftAngle) * 180 / Math.PI) + '°';else
  document.getElementById('indDrift').textContent = 'DRIFT';
  document.getElementById('indOff').classList.toggle('on', ctx.keys.ShiftLeft || ctx.keys.ShiftRight);
  document.getElementById('indOff').classList.toggle('warn', !ctx.car.onRoad && !(ctx.keys.ShiftLeft || ctx.keys.ShiftRight));
  document.getElementById('offRoadWarn').classList.toggle('active', !ctx.car.onRoad && !(ctx.keys.ShiftLeft || ctx.keys.ShiftRight));
  const geo = { lat: ctx.LOC.lat - ctx.car.z / ctx.SCALE, lon: ctx.LOC.lon + ctx.car.x / (ctx.SCALE * Math.cos(ctx.LOC.lat * Math.PI / 180)) };
  let hdg = (-ctx.car.angle * 180 / Math.PI + 90) % 360;if (hdg < 0) hdg += 360;
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  document.getElementById('coords').textContent = geo.lat.toFixed(4) + ', ' + geo.lon.toFixed(4) + ' | ' + dirs[Math.round(hdg / 45) % 8] + ' ' + Math.round(hdg) + '°';

  const modeTimer = document.getElementById('modeTimer');
  const modeInfo = document.getElementById('modeInfo');

  if (ctx.gameMode === 'free') {
    document.getElementById('modeTitle').textContent = '🚗 Driving';
    modeTimer.classList.remove('show');
    modeInfo.classList.remove('show');
  } else
  if (ctx.gameMode === 'trial') {
    document.getElementById('modeTitle').textContent = '⏱️ Time Trial';
    modeTimer.textContent = ctx.fmtTime(Math.max(0, ctx.CFG.trialTime - ctx.gameTimer));
    modeTimer.classList.add('show');
    modeInfo.textContent = ctx.destination ? Math.round(Math.hypot(ctx.destination.x - ctx.car.x, ctx.destination.z - ctx.car.z)) + 'm' : '';
    modeInfo.classList.add('show');
  } else
  {
    document.getElementById('modeTitle').textContent = '🏁 Checkpoint';
    modeTimer.textContent = ctx.fmtTime(ctx.gameTimer);
    modeTimer.classList.add('show');
    modeInfo.textContent = ctx.cpCollected + '/' + ctx.checkpoints.length;
    modeInfo.classList.add('show');
  }

}

// OSM Tile functions

Object.assign(ctx, { updateCamera, updateHUD, updateSkyPositions });

export { updateCamera, updateHUD, updateSkyPositions };