// ============================================================================
// hud.js - HUD updates, camera system, sky positioning
// ============================================================================

function updateSkyPositions() {
    if (!camera) return;
    
    const cameraY = camera.position.y;
    const cameraX = camera.position.x;
    const cameraZ = camera.position.z;
    
    // Sun - always high above camera, maintaining horizontal offset
    if (sunSphere) {
        sunSphere.position.set(cameraX + 500, cameraY + 800, cameraZ + 200);
        // Keep sun glow in sync
        if (sunSphere.userData.glow) {
            sunSphere.userData.glow.position.copy(sunSphere.position);
        }
    }
    
    // Directional sun light - follow camera position for proper shadows
    if (sun) {
        sun.position.set(cameraX + 100, cameraY + 150, cameraZ + 50);
        // Update shadow camera to follow as well
        if (sun.shadow && sun.shadow.camera) {
            sun.shadow.camera.position.copy(sun.position);
            sun.shadow.camera.updateProjectionMatrix();
        }
    }
    
    // Moon - always high above camera, on opposite side from sun
    if (moonSphere) {
        moonSphere.position.set(cameraX - 500, cameraY + 800, cameraZ - 200);
        // Keep moon glow in sync
        if (moonSphere.userData.glow) {
            moonSphere.userData.glow.position.copy(moonSphere.position);
        }
    }
    
    // Fill light - subtle ambient lighting from opposite direction
    if (fillLight) {
        fillLight.position.set(cameraX - 50, cameraY + 50, cameraZ - 50);
    }
    
    // Hemisphere light - subtle gradient from sky to ground
    if (hemiLight) {
        hemiLight.position.set(cameraX, cameraY + 100, cameraZ);
    }
    
    // Clouds - float at camera level + offset
    if (cloudGroup) {
        // Keep clouds at a reasonable height above camera (400-600 units)
        cloudGroup.children.forEach((cloud, i) => {
            // Each cloud has a different base height offset
            const baseOffset = 400 + (i % 5) * 50;
            const targetY = cameraY + baseOffset;
            
            // Smoothly transition cloud height to follow camera
            cloud.position.y += (targetY - cloud.position.y) * 0.02;
        });
    }
}

function updateCamera() {
    // Drone camera mode
    if (droneMode) {
        camera.position.set(drone.x, drone.y, drone.z);

        // Use Euler angles for proper rotation without gimbal lock
        // Order: YXZ (yaw, pitch, roll)
        camera.rotation.order = 'YXZ';
        camera.rotation.y = drone.yaw;  // Camera faces movement direction
        camera.rotation.x = drone.pitch;
        camera.rotation.z = drone.roll;

        // Update star field to follow camera
        if (starField) {
            starField.position.copy(camera.position);
        }

        // Update sun/moon positions to be relative to camera
        updateSkyPositions();

        return;
    }

    // Walking module handles camera when in walk mode
    if (Walk) {
        const walkCameraApplied = Walk.applyCameraIfWalking();
        if (walkCameraApplied) {
            // Update billboards to face camera
            propMarkers.forEach(marker => {
                if (marker.userData.isBillboard) {
                    marker.lookAt(camera.position);
                }
            });
            // Update star field to follow camera
            if (starField) {
                starField.position.copy(camera.position);
            }
            // Update sun/moon positions to be relative to camera
            updateSkyPositions();
            return;
        }
    }

    // Normal car camera modes
    const lb = keys.KeyV;
    const d = 10, h = 5;

    // Get car's actual Y position (follows terrain)
    const carGroundY = carMesh.position.y - 1.2; // Car body is 1.2 above ground

    // Show car mesh for non-first-person modes
    if (camMode !== 1 && carMesh && !carMesh.visible) {
        carMesh.visible = true;
    }

    if (camMode === 0) {
        // Chase camera - follow behind car at terrain height
        const ox = -Math.sin(car.angle) * (lb ? -d : d);
        const oz = -Math.cos(car.angle) * (lb ? -d : d);
        const targetX = car.x + ox;
        const targetY = carGroundY + h;
        const targetZ = car.z + oz;
        const lookX = car.x;
        const lookY = carGroundY + 0.5;
        const lookZ = car.z;

        // Smooth both camera position and lookAt target together
        // Higher factor = camera stays more rigidly fixed to car
        const smoothFactor = 0.7;
        camera.position.x += (targetX - camera.position.x) * smoothFactor;
        camera.position.y += (targetY - camera.position.y) * smoothFactor;
        camera.position.z += (targetZ - camera.position.z) * smoothFactor;

        // Initialize lookAt target if needed
        if (!camera.userData.lookTarget) {
            camera.userData.lookTarget = { x: lookX, y: lookY, z: lookZ };
        }

        // Smooth the lookAt target
        camera.userData.lookTarget.x += (lookX - camera.userData.lookTarget.x) * smoothFactor;
        camera.userData.lookTarget.y += (lookY - camera.userData.lookTarget.y) * smoothFactor;
        camera.userData.lookTarget.z += (lookZ - camera.userData.lookTarget.z) * smoothFactor;

        camera.lookAt(camera.userData.lookTarget.x, camera.userData.lookTarget.y, camera.userData.lookTarget.z);
    } else if (camMode === 1) {
        // Hood camera - positioned at front of car looking forward over the hood
        // Move camera forward to the hood area (1.2 units ahead of car center)
        const fwdX = Math.sin(car.angle) * 1.2;
        const fwdZ = Math.cos(car.angle) * 1.2;
        camera.position.set(car.x + fwdX, carGroundY + 1.8, car.z + fwdZ);
        const dir = lb ? -1 : 1;
        camera.lookAt(
            car.x + Math.sin(car.angle) * 10 * dir,
            carGroundY + 1.6,
            car.z + Math.cos(car.angle) * 10 * dir
        );
        // Hide car mesh in first-person so you don't see tires/body
        if (carMesh) carMesh.visible = false;
    } else {
        // Overhead camera - high above car
        camera.position.set(car.x, carGroundY + 50, car.z + 15);
        camera.lookAt(car.x, carGroundY, car.z);
    }

    // Update billboards to face camera
    propMarkers.forEach(marker => {
        if (marker.userData.isBillboard) {
            marker.lookAt(camera.position);
        }
    });

    // Update star field to follow camera (must be at end after camera position is set)
    if (starField) {
        starField.position.copy(camera.position);
    }

    // Update sun/moon positions to be relative to camera
    updateSkyPositions();
}

function updateHUD() {
    // Keep controls panel sections and header synchronized with the active mode.
    if (typeof updateControlsModeUI === 'function') updateControlsModeUI();

    if (droneMode) {
        // Calculate ground elevation for altitude display
        let groundY = 0;
        if (onMoon && moonSurface) {
            const raycaster = _getPhysRaycaster();
            _physRayStart.set(drone.x, 2000, drone.z);
            raycaster.set(_physRayStart, _physRayDir || new THREE.Vector3(0, -1, 0));
            const hits = raycaster.intersectObject(moonSurface, false);
            if (hits.length > 0) {
                groundY = hits[0].point.y;
            }
        } else if (terrainEnabled) {
            groundY = elevationWorldYAtWorldXZ(drone.x, drone.z);
        }
        
        const altitudeAGL = Math.round(drone.y - groundY); // AGL = Above Ground Level
        const altitudeMSL = Math.round(drone.y); // MSL = Mean Sea Level (absolute)
        
        // Drone mode HUD
        document.getElementById('speed').textContent = altitudeAGL + 'm AGL';
        document.getElementById('speed').classList.remove('fast');
        document.getElementById('limit').textContent = '';
        const locName = selLoc === 'custom' ? (customLoc?.name || 'Custom') : LOCS[selLoc].name;
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
        const geo = { lat: LOC.lat - (drone.z / SCALE), lon: LOC.lon + (drone.x / (SCALE * Math.cos(LOC.lat * Math.PI / 180))) };
        let hdg = (-drone.yaw * 180 / Math.PI + 90) % 360; if (hdg < 0) hdg += 360;
        const dirs = ['N','NE','E','SE','S','SW','W','NW'];
        const pitch = Math.round(drone.pitch * 180 / Math.PI);
        document.getElementById('coords').textContent = geo.lat.toFixed(4) + ', ' + geo.lon.toFixed(4) + ' | ' + dirs[Math.round(hdg/45)%8] + ' ' + Math.round(hdg) + '° | P:' + pitch + '°';

        // Mode HUD - show mode and altitude (both AGL and MSL)
        document.getElementById('modeTitle').textContent = '🚁 Drone Mode';
        const modeTimer = document.getElementById('modeTimer');
        modeTimer.textContent = 'Alt: ' + altitudeAGL + 'm AGL (' + altitudeMSL + 'm MSL)';
        modeTimer.classList.add('show');
        document.getElementById('modeInfo').classList.remove('show');
        return;
    }

    // Walking mode HUD - uses Walk module data
    if (Walk && Walk.state.mode === 'walk') {
        const mph = Math.abs(Math.round(Walk.state.walker.speedMph));
        const locName = selLoc === 'custom' ? (customLoc?.name || 'Custom') : LOCS[selLoc].name;
        const running = keys.ShiftLeft || keys.ShiftRight;
        const viewMode = Walk.state.view === 'third' ? ' [3rd Person]' :
                         Walk.state.view === 'first' ? ' [1st Person]' :
                         ' [Overhead]';
        document.getElementById('speed').textContent = mph;
        document.getElementById('speed').classList.remove('fast');
        document.getElementById('limit').textContent = '';
        document.getElementById('street').textContent = (running ? '🏃 RUNNING' : '🚶 WALKING') + viewMode + ' • ' + locName;
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
        const geo = { lat: LOC.lat - (Walk.state.walker.z / SCALE), lon: LOC.lon + (Walk.state.walker.x / (SCALE * Math.cos(LOC.lat * Math.PI / 180))) };
        let hdg = (-Walk.state.walker.angle * 180 / Math.PI + 90) % 360; if (hdg < 0) hdg += 360;
        const dirs = ['N','NE','E','SE','S','SW','W','NW'];
        document.getElementById('coords').textContent = geo.lat.toFixed(4) + ', ' + geo.lon.toFixed(4) + ' | ' + dirs[Math.round(hdg/45)%8] + ' ' + Math.round(hdg) + '°';

        // Mode HUD - just show mode name
        document.getElementById('modeTitle').textContent = '🚶 Walking Mode';
        document.getElementById('modeTimer').classList.remove('show');
        document.getElementById('modeInfo').classList.remove('show');
        return;
    }

    // Normal car HUD
    const mph = Math.abs(Math.round(car.speed * 0.5));
    const limit = car.road?.limit || 25;
    const locName = selLoc === 'custom' ? (customLoc?.name || 'Custom') : LOCS[selLoc].name;
    document.getElementById('speed').textContent = mph;
    document.getElementById('speed').classList.toggle('fast', mph > limit || car.boost);
    document.getElementById('limit').textContent = limit;
    document.getElementById('street').textContent = (car.road?.name || 'Off Road') + ' • ' + locName;
    const bf = document.getElementById('boostFill');
    bf.style.width = car.boost ? (car.boostTime / CFG.boostDur * 100) + '%' : (car.boostReady ? '100%' : '0%');
    bf.classList.toggle('active', car.boost);
    document.getElementById('indBrake').classList.toggle('on', keys.Space);
    document.getElementById('indBoost').classList.toggle('on', car.boost);
    const isDrifting = Math.abs(car.driftAngle) > 0.15 && Math.abs(car.speed) > 30;
    document.getElementById('indDrift').classList.toggle('on', isDrifting);
    if (isDrifting) document.getElementById('indDrift').textContent = 'DRIFT ' + Math.round(Math.abs(car.driftAngle) * 180 / Math.PI) + '°';
    else document.getElementById('indDrift').textContent = 'DRIFT';
    document.getElementById('indOff').classList.toggle('on', keys.ShiftLeft || keys.ShiftRight);
    document.getElementById('indOff').classList.toggle('warn', !car.onRoad && !(keys.ShiftLeft || keys.ShiftRight));
    document.getElementById('offRoadWarn').classList.toggle('active', !car.onRoad && !(keys.ShiftLeft || keys.ShiftRight));
    const geo = { lat: LOC.lat - (car.z / SCALE), lon: LOC.lon + (car.x / (SCALE * Math.cos(LOC.lat * Math.PI / 180))) };
    let hdg = (-car.angle * 180 / Math.PI + 90) % 360; if (hdg < 0) hdg += 360;
    const dirs = ['N','NE','E','SE','S','SW','W','NW'];
    document.getElementById('coords').textContent = geo.lat.toFixed(4) + ', ' + geo.lon.toFixed(4) + ' | ' + dirs[Math.round(hdg/45)%8] + ' ' + Math.round(hdg) + '°';

    const modeTimer = document.getElementById('modeTimer');
    const modeInfo = document.getElementById('modeInfo');

    if (gameMode === 'free') {
        document.getElementById('modeTitle').textContent = '🚗 Driving';
        modeTimer.classList.remove('show');
        modeInfo.classList.remove('show');
    }
    else if (gameMode === 'trial') {
        document.getElementById('modeTitle').textContent = '⏱️ Time Trial';
        modeTimer.textContent = fmtTime(Math.max(0, CFG.trialTime - gameTimer));
        modeTimer.classList.add('show');
        modeInfo.textContent = destination ? Math.round(Math.hypot(destination.x - car.x, destination.z - car.z)) + 'm' : '';
        modeInfo.classList.add('show');
    }
    else {
        document.getElementById('modeTitle').textContent = '🏁 Checkpoint';
        modeTimer.textContent = fmtTime(gameTimer);
        modeTimer.classList.add('show');
        modeInfo.textContent = cpCollected + '/' + checkpoints.length;
        modeInfo.classList.add('show');
    }

}

// OSM Tile functions

Object.assign(globalThis, { updateCamera, updateHUD, updateSkyPositions });

export { updateCamera, updateHUD, updateSkyPositions };
