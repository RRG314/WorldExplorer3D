// ============================================================================
// main.js - Main game loop, render loop, loading helpers
// ============================================================================

let _hudTimer = 0;
let _mapTimer = 0;

function renderLoop(t = 0) {
    requestAnimationFrame(renderLoop);

    // Skip main rendering entirely during space flight (huge perf save)
    if (isEnv(ENV.SPACE_FLIGHT) || (window.spaceFlight && window.spaceFlight.active)) {
        lastTime = t;
        return;
    }

    const dt = Math.min((t - lastTime) / 1000, 0.1);
    lastTime = t;
    if (gameStarted) {
        update(dt);
        updateCamera();

        // Throttle HUD DOM writes to ~15fps (every ~66ms)
        _hudTimer += dt;
        if (_hudTimer > 0.066) {
            _hudTimer = 0;
            updateHUD();
        }

        // Throttle minimap to ~10fps (every ~100ms)
        _mapTimer += dt;
        if (_mapTimer > 0.1) {
            _mapTimer = 0;
            drawMinimap();
            if (showLargeMap) drawLargeMap();
        }
    }

    // Animate Apollo 11 beacon pulse (only on moon, throttled)
    if (window.apollo11Beacon && isEnv(ENV.MOON) && _hudTimer === 0) {
        const pulseTime = t / 1000;
        const pulse = 0.5 + 0.5 * Math.sin(pulseTime * 2);

        const beam = window.apollo11Beacon.children[0];
        const glow = window.apollo11Beacon.children[1];

        if (beam && beam.material) {
            beam.material.opacity = 0.3 + pulse * 0.2;
        }
        if (glow && glow.material) {
            glow.material.opacity = 0.6 + pulse * 0.3;
        }
    }

    // Debug overlay update (throttled to HUD rate)
    if (window._debugMode && gameStarted && !droneMode && _hudTimer === 0) {
        const overlay = document.getElementById('debugOverlay');
        if (overlay) {
            const onRd = car.onRoad ? 'YES' : 'no';
            const tY = elevationWorldYAtWorldXZ(car.x, car.z).toFixed(2);
            const carYVal = car.y !== undefined ? car.y.toFixed(2) : '?';
            const roadName = car.road ? car.road.name : '-';
            const nr = findNearestRoad(car.x, car.z);
            const rdist = nr.dist !== undefined ? nr.dist.toFixed(1) : '?';
            overlay.textContent =
                `Car Y: ${carYVal}  Terrain Y: ${tY}\n` +
                `On road: ${onRd}  dist: ${rdist}\n` +
                `Road: ${roadName}`;
        }
        // Update debug marker position
        if (window._debugMarker) {
            const debugY = elevationWorldYAtWorldXZ(car.x, car.z);
            window._debugMarker.position.set(car.x, debugY, car.z);
            window._debugMarker.material.color.setHex(car.onRoad ? 0x00ff00 : 0xffff00);
        }
    }

    if (composer) {
        composer.render();
    } else {
        renderer.render(scene, camera);
    }
}

function showLoad(txt) { document.getElementById('loadText').textContent = txt; document.getElementById('loading').classList.add('show'); }
function hideLoad() { document.getElementById('loading').classList.remove('show'); }    }

    // Animate Apollo 11 beacon pulse (only on moon, throttled)
    if (window.apollo11Beacon && isEnv(ENV.MOON) && _hudTimer === 0) {
        const pulseTime = t / 1000;
        const pulse = 0.5 + 0.5 * Math.sin(pulseTime * 2);

        const beam = window.apollo11Beacon.children[0];
        const glow = window.apollo11Beacon.children[1];

        if (beam && beam.material) {
            beam.material.opacity = 0.3 + pulse * 0.2;
        }
        if (glow && glow.material) {
            glow.material.opacity = 0.6 + pulse * 0.3;
        }
    }

    // Debug overlay update (throttled to HUD rate)
    if (window._debugMode && gameStarted && !droneMode && _hudTimer === 0) {
        const overlay = document.getElementById('debugOverlay');
        if (overlay) {
            const onRd = car.onRoad ? 'YES' : 'no';
            const tY = elevationWorldYAtWorldXZ(car.x, car.z).toFixed(2);
            const carYVal = car.y !== undefined ? car.y.toFixed(2) : '?';
            const roadName = car.road ? car.road.name : '-';
            const nr = findNearestRoad(car.x, car.z);
            const rdist = nr.dist !== undefined ? nr.dist.toFixed(1) : '?';
            overlay.textContent =
                `Car Y: ${carYVal}  Terrain Y: ${tY}\n` +
                `On road: ${onRd}  dist: ${rdist}\n` +
                `Road: ${roadName}`;
        }
        // Update debug marker position
        if (window._debugMarker) {
            const debugY = elevationWorldYAtWorldXZ(car.x, car.z);
            window._debugMarker.position.set(car.x, debugY, car.z);
            window._debugMarker.material.color.setHex(car.onRoad ? 0x00ff00 : 0xffff00);
        }
    }

    if (composer) {
        composer.render();
    } else {
        renderer.render(scene, camera);
    }
}

function showLoad(txt) { document.getElementById('loadText').textContent = txt; document.getElementById('loading').classList.add('show'); }
function hideLoad() { document.getElementById('loading').classList.remove('show'); }
