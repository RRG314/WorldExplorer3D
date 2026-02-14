// ============================================================================
// input.js - Keyboard handling, track recording, city switching
// ============================================================================

function isDebugToggleKey(code, event) {
    if (code === 'Backquote' || code === 'F8') return true;
    const key = event?.key;
    return key === '`' || key === '~';
}

function onKey(code, event) {
    if (!gameStarted) return;

    // Walking mode toggle (F key)
    if (code === 'KeyF') {
        // Debug log removed
        if (Walk) {
            // Debug log removed
            Walk.toggleWalk();

            // Clear star selection when switching modes
            clearStarSelection();

            // Disable drone mode if walking
            if (Walk.state.mode === 'walk') {
                droneMode = false;
            }

            // Update all travel mode button states
            if (document.getElementById('fWalk')) {
                const isWalking = Walk.state.mode === 'walk';
                document.getElementById('fWalk').classList.toggle('on', isWalking);
                document.getElementById('fDriving').classList.toggle('on', !isWalking);
                document.getElementById('fDrone').classList.remove('on');
                if (!isWalking) {
                    droneMode = false;
                    if (typeof camMode !== 'undefined') camMode = 0;
                    if (carMesh) carMesh.visible = true;
                }
            }
        } else {
            console.error('Walk module does not exist!');
        }
        if (typeof updateControlsModeUI === 'function') updateControlsModeUI();
        return;
    }

    // Builder mode toggle (B key)
    if (code === 'KeyB') {
        if (typeof toggleBlockBuildMode === 'function') {
            toggleBlockBuildMode();
        }
        return;
    }

    // Camera view toggle when walking (C key) - first/third person
    if (code === 'KeyC') {
        if (Walk && Walk.state.mode === 'walk') {
            Walk.toggleView();
        } else {
            camMode = (camMode + 1) % 3; // Normal car camera cycling
        }
        return;
    }

    if (code === 'Digit6') {
        droneMode = !droneMode;

        // Clear star selection when switching modes
        clearStarSelection();

        if (droneMode) {
            // Disable walking mode if active
            if (Walk && Walk.state.mode === 'walk') {
                Walk.setModeDrive();
            }
            // Initialize drone position above current position
            const ref = Walk ? Walk.getMapRefPosition(false, null) : { x: car.x, z: car.z };
            drone.x = ref.x;
            drone.z = ref.z;
            drone.yaw = car.angle;
            drone.roll = 0;

            // On the moon, raycast to find actual ground height so drone spawns near surface
            if (onMoon && moonSurface) {
                const rc = _getPhysRaycaster();
                _physRayStart.set(ref.x, 2000, ref.z);
                rc.set(_physRayStart, _physRayDir);
                const hits = rc.intersectObject(moonSurface, false);
                drone.y = (hits.length > 0 ? hits[0].point.y : -100) + 10;
                drone.pitch = -0.2;
            } else {
                drone.y = 50;
                drone.pitch = -0.3;
            }
        }

        // Update all travel mode button states
        document.getElementById('fDrone').classList.toggle('on', droneMode);
        document.getElementById('fDriving').classList.toggle('on', !droneMode);
        document.getElementById('fWalk').classList.remove('on');
        if (typeof updateControlsModeUI === 'function') updateControlsModeUI();
    }
    // Debug overlay toggle (Backtick key; F8 fallback for keyboard-layout variance)
    if (isDebugToggleKey(code, event)) {
        if (event?.repeat) return;
        window._debugMode = !window._debugMode;
        const overlay = document.getElementById('debugOverlay');
        if (overlay) overlay.style.display = window._debugMode ? 'block' : 'none';

        // Create/destroy debug marker under car
        if (window._debugMode && !window._debugMarker) {
            const markerGeo = new THREE.SphereGeometry(0.4, 8, 8);
            const markerMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, depthTest: false, transparent: true, opacity: 0.8 });
            window._debugMarker = new THREE.Mesh(markerGeo, markerMat);
            window._debugMarker.renderOrder = 999;
            scene.add(window._debugMarker);
        }
        if (!window._debugMode && window._debugMarker) {
            scene.remove(window._debugMarker);
            if (window._debugMarker.geometry) window._debugMarker.geometry.dispose();
            if (window._debugMarker.material) window._debugMarker.material.dispose();
            window._debugMarker = null;
        }
        return;
    }

    if (code === 'KeyR') {
        // Shift+R: Toggle Road Debug Mode (terrain conformance visualization)
        // R: Toggle track recording (default)
        if (event && event.shiftKey && typeof toggleRoadDebugMode === 'function') {
            toggleRoadDebugMode();
        } else {
            toggleTrackRecording();
        }
    }
    if (code === 'KeyN') nextCity();
    if (code === 'KeyM') {
        showLargeMap = !showLargeMap;
        document.getElementById('largeMap').classList.toggle('show', showLargeMap);
    }
    if (showLargeMap && (code === 'Equal' || code === 'NumpadAdd')) {
        if (largeMapZoom < 18) {
            largeMapZoom++;
            document.getElementById('zoomLevel').textContent = 'Z: ' + largeMapZoom;
        }
    }
    if (showLargeMap && (code === 'Minus' || code === 'NumpadSubtract')) {
        if (largeMapZoom > 10) {
            largeMapZoom--;
            document.getElementById('zoomLevel').textContent = 'Z: ' + largeMapZoom;
        }
    }
    if (code === 'Escape' && !document.getElementById('resultScreen').classList.contains('show') && !document.getElementById('caughtScreen').classList.contains('show')) {
        if (showLargeMap) {
            showLargeMap = false;
            document.getElementById('largeMap').classList.remove('show');
        } else {
            paused = !paused;
            document.getElementById('pauseScreen').classList.toggle('show', paused);
        }
    }
}

function toggleTrackRecording() {
    isRecording = !isRecording;
    document.getElementById('fTrack').classList.toggle('recording', isRecording);
    document.getElementById('fTrack').textContent = isRecording ? '⏹️ Stop Recording' : '🏁 Record Track';
    if (isRecording) customTrack = [];
}

function eraseTrack() {
    customTrack = [];
    isRecording = false;
    document.getElementById('fTrack').classList.remove('recording');
    document.getElementById('fTrack').textContent = '🏁 Record Track';
    if (trackMesh) { scene.remove(trackMesh); trackMesh = null; }
}

function updateTrack() {
    if (!isRecording) return;
    const last = customTrack[customTrack.length - 1];
    if (!last || Math.hypot(car.x - last.x, car.z - last.z) > 5) {
        customTrack.push({ x: car.x, z: car.z });
        rebuildTrackMesh();
    }
}

function rebuildTrackMesh() {
    if (trackMesh) scene.remove(trackMesh);
    if (customTrack.length < 2) return;
    const hw = 8;
    const verts = [], indices = [];
    for (let i = 0; i < customTrack.length; i++) {
        const p = customTrack[i];
        let dx, dz;
        if (i === 0) { dx = customTrack[1].x - p.x; dz = customTrack[1].z - p.z; }
        else if (i === customTrack.length - 1) { dx = p.x - customTrack[i-1].x; dz = p.z - customTrack[i-1].z; }
        else { dx = customTrack[i+1].x - customTrack[i-1].x; dz = customTrack[i+1].z - customTrack[i-1].z; }
        const len = Math.sqrt(dx*dx + dz*dz) || 1;
        const nx = -dz / len, nz = dx / len;
        verts.push(p.x + nx * hw, 0.03, p.z + nz * hw);
        verts.push(p.x - nx * hw, 0.03, p.z - nz * hw);
        if (i < customTrack.length - 1) {
            const vi = i * 2;
            indices.push(vi, vi+1, vi+2, vi+1, vi+3, vi+2);
        }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    trackMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: isRecording ? 0xff6644 : 0xffaa00, side: THREE.DoubleSide, transparent: true, opacity: 0.7 }));
    scene.add(trackMesh);
}

function nextCity() {
    if (selLoc === 'custom') {
        selLoc = locKeys[0];
    } else {
        const idx = locKeys.indexOf(selLoc);
        selLoc = locKeys[(idx + 1) % locKeys.length];
    }
    loadRoads();
}

async function searchLocation() {
    const input = document.getElementById('locationSearch');
    const status = document.getElementById('locationSearchStatus');

    // Debug log removed
    // Debug log removed
    // Debug log removed

    if (!input || !status) {
        console.error('Search elements not found!', { input, status });
        return;
    }

    const query = input.value.trim();
    // Debug log removed

    if (!query) {
        status.textContent = 'Please enter a location';
        status.style.color = '#dc2626';
        return;
    }

    // Helper function to fetch with timeout and retry
    async function fetchWithRetry(url, retries = 2) {
        for (let i = 0; i <= retries; i++) {
            try {
                // Debug log removed

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

                const res = await fetch(url, { signal: controller.signal });
                clearTimeout(timeoutId);

                // Debug log removed

                if (res.status === 408 || res.status === 504) {
                    // Timeout or gateway timeout - retry
                    if (i < retries) {
                        // Debug log removed
                        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
                        continue;
                    }
                }

                return res;
            } catch (error) {
                if (error.name === 'AbortError') {
                    // Debug log removed
                    if (i < retries) {
                        // Debug log removed
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        continue;
                    }
                }
                throw error;
            }
        }
    }

    try {
        // Make search case-insensitive by not modifying the query
        // Nominatim handles case-insensitivity automatically
        let searchQuery = query;

        status.textContent = 'Searching...';
        status.style.color = '#6b7280';

        // Try direct Nominatim first (supports CORS)
        let nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(searchQuery)}`;

        let res;
        let data;

        try {
            // Attempt direct fetch (works when served from http/https)
            res = await fetchWithRetry(nominatimUrl);

            if (!res || !res.ok) {
                throw new Error(`Direct fetch failed: ${res?.status}`);
            }

            data = await res.json();
        } catch (directError) {
            // If direct fetch fails (likely CORS from file://), use CORS proxy
            console.log('Direct fetch failed, trying CORS proxy:', directError.message);

            // Use cors.sh proxy as fallback (more reliable than allorigins)
            const proxyUrl = `https://cors.sh/${nominatimUrl}`;

            res = await fetchWithRetry(proxyUrl);

            if (!res || !res.ok) {
                throw new Error(`HTTP ${res?.status || 'unknown'}: ${res?.statusText || 'Request failed'}`);
            }

            data = await res.json();
        }
        // Debug log removed
        // Debug log removed

        // If no results and it's just a city name, try adding USA
        if (data.length === 0 && !query.includes(',')) {
            searchQuery = query + ', USA';
            nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(searchQuery)}`;

            try {
                res = await fetchWithRetry(nominatimUrl);
                if (res && res.ok) {
                    data = await res.json();
                }
            } catch (err) {
                // Try proxy fallback
                const proxyUrl = `https://cors.sh/${nominatimUrl}`;
                res = await fetchWithRetry(proxyUrl);
                if (res && res.ok) {
                    data = await res.json();
                }
            }
        }

        // If still no results, try one more time with lowercase
        if (data.length === 0) {
            searchQuery = query.toLowerCase();
            nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(searchQuery)}`;

            try {
                res = await fetchWithRetry(nominatimUrl);
                if (res && res.ok) {
                    data = await res.json();
                }
            } catch (err) {
                // Try proxy fallback
                const proxyUrl = `https://cors.sh/${nominatimUrl}`;
                res = await fetchWithRetry(proxyUrl);
                if (res && res.ok) {
                    data = await res.json();
                }
            }
        }

        if (!data || data.length === 0) {
            // Debug log removed
            status.textContent = '✗ Location not found. Try "City, State" or "City, Country"';
            status.style.color = '#dc2626';
            return;
        }

        // Prioritize actual cities
        let result = data.find(d => d.type === 'city' || d.type === 'town' || d.class === 'place') || data[0];
        // Debug log removed

        const lat = parseFloat(result.lat);
        const lon = parseFloat(result.lon);

        // Debug log removed

        if (isNaN(lat) || isNaN(lon)) {
            throw new Error('Invalid coordinates received');
        }

        // Debug log removed

        // Update coordinate inputs
        const latInput = document.getElementById('customLat');
        const lonInput = document.getElementById('customLon');

        // Debug log removed
        // Debug log removed

        if (latInput) {
            latInput.value = lat.toFixed(4);
            // Debug log removed
        }
        if (lonInput) {
            lonInput.value = lon.toFixed(4);
            // Debug log removed
        }

        // Get display name
        const displayParts = (result.display_name || query).split(',');
        const locationName = displayParts[0] || query;
        const country = displayParts.length > 1 ? displayParts[displayParts.length - 1].trim() : '';

        // Debug log removed

        // Set custom location
        customLoc = { lat, lon, name: locationName };
        selLoc = 'custom';

        // Debug log removed
        // Debug log removed

        // Update UI to show custom location panel as active
        if (typeof globalThis.setTitleLocationMode === 'function') {
            globalThis.setTitleLocationMode('custom');
        }

        // Debug log removed

        // Update status
        status.textContent = `✓ Found: ${locationName}${country ? ', ' + country : ''}`;
        status.style.color = '#059669';

        // Debug log removed

        // If game is running, reload the world
        if (typeof gameStarted !== 'undefined' && gameStarted) {
            // Debug log removed
            await loadRoads();
            // Debug log removed

            // Keep the vehicle on a valid road spawn after reloading location data.
            if (typeof spawnOnRoad === 'function') spawnOnRoad();

            // Debug log removed
        } else {
            // Debug log removed
        }

        // Debug log removed

    } catch (e) {
        console.error('=== SEARCH LOCATION DEBUG END - ERROR ===');
        console.error('Search error:', e);
        console.error('Error stack:', e.stack);
        status.textContent = `✗ Search failed: ${e.message}`;
        status.style.color = '#dc2626';
    }
}

Object.assign(globalThis, {
    eraseTrack,
    nextCity,
    onKey,
    rebuildTrackMesh,
    searchLocation,
    toggleTrackRecording,
    updateTrack
});

export {
    eraseTrack,
    nextCity,
    onKey,
    rebuildTrackMesh,
    searchLocation,
    toggleTrackRecording,
    updateTrack
};
