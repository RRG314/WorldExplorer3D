// ============================================================================
// input.js - Keyboard handling, track recording, city switching
// ============================================================================

function onKey(code) {
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
            }
        } else {
            console.error('Walk module does not exist!');
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
            drone.y = 50;
            drone.z = ref.z;
            drone.pitch = -0.3;
            drone.yaw = car.angle;
            drone.roll = 0;
        }

        // Update all travel mode button states
        document.getElementById('fDrone').classList.toggle('on', droneMode);
        document.getElementById('fDriving').classList.toggle('on', !droneMode);
        document.getElementById('fWalk').classList.remove('on');
    }
    // Debug overlay toggle (Backtick ` key)
    if (code === 'Backquote') {
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
            window._debugMarker = null;
        }
    }

    if (code === 'KeyR') toggleTrackRecording();
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

        // Use allorigins.win as CORS proxy - reliable and works from file://
        // Debug log removed
        const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(searchQuery)}`;
        let url = `https://api.allorigins.win/get?url=${encodeURIComponent(nominatimUrl)}`;

        // Debug log removed
        status.textContent = 'Searching...';
        status.style.color = '#6b7280';

        let res = await fetchWithRetry(url);

        if (!res || !res.ok) {
            throw new Error(`HTTP ${res?.status || 'unknown'}: ${res?.statusText || 'Request failed'}`);
        }

        let response = await res.json();
        let data = JSON.parse(response.contents); // allorigins wraps the response
        // Debug log removed
        // Debug log removed

        // If no results and it's just a city name, try adding USA
        if (data.length === 0 && !query.includes(',')) {
            // Debug log removed
            searchQuery = query + ', USA';
            const retryNominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(searchQuery)}`;
            url = `https://api.allorigins.win/get?url=${encodeURIComponent(retryNominatimUrl)}`;
            // Debug log removed
            res = await fetchWithRetry(url);

            if (!res || !res.ok) {
                throw new Error(`HTTP ${res?.status || 'unknown'}: ${res?.statusText || 'Request failed'}`);
            }

            response = await res.json();
            data = JSON.parse(response.contents);
            // Debug log removed
        }

        // If still no results, try one more time with lowercase
        if (data.length === 0) {
            // Debug log removed
            searchQuery = query.toLowerCase();
            const retryLowerUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(searchQuery)}`;
            url = `https://api.allorigins.win/get?url=${encodeURIComponent(retryLowerUrl)}`;
            // Debug log removed
            res = await fetchWithRetry(url);

            if (!res || !res.ok) {
                throw new Error(`HTTP ${res?.status || 'unknown'}: ${res?.statusText || 'Request failed'}`);
            }

            response = await res.json();
            data = JSON.parse(response.contents);
            // Debug log removed
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

        // Update UI to show custom location as selected
        const customCard = document.querySelector('.loc[data-loc="custom"]');
        // Debug log removed

        if (customCard) {
            document.querySelectorAll('.loc').forEach(e => e.classList.remove('sel'));
            customCard.classList.add('sel');
            document.getElementById('customPanel').classList.add('show');
            // Debug log removed
        } else {
            console.warn('Custom location card not found in DOM');
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

            // Reset vehicle position
            car.x = car.z = 0;
            car.angle = 0;
            car.speed = car.vx = car.vz = 0;

            if (carMesh) {
                carMesh.position.set(0, 0, 0);
                carMesh.rotation.y = 0;
            }

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
            drone.y = 50;
            drone.z = ref.z;
            drone.pitch = -0.3;
            drone.yaw = car.angle;
            drone.roll = 0;
        }

        // Update all travel mode button states
        document.getElementById('fDrone').classList.toggle('on', droneMode);
        document.getElementById('fDriving').classList.toggle('on', !droneMode);
        document.getElementById('fWalk').classList.remove('on');
    }
    // Debug overlay toggle (Backtick ` key)
    if (code === 'Backquote') {
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
            window._debugMarker = null;
        }
    }

    if (code === 'KeyR') toggleTrackRecording();
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

        // Use allorigins.win as CORS proxy - reliable and works from file://
        // Debug log removed
        const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(searchQuery)}`;
        let url = `https://api.allorigins.win/get?url=${encodeURIComponent(nominatimUrl)}`;

        // Debug log removed
        status.textContent = 'Searching...';
        status.style.color = '#6b7280';

        let res = await fetchWithRetry(url);

        if (!res || !res.ok) {
            throw new Error(`HTTP ${res?.status || 'unknown'}: ${res?.statusText || 'Request failed'}`);
        }

        let response = await res.json();
        let data = JSON.parse(response.contents); // allorigins wraps the response
        // Debug log removed
        // Debug log removed

        // If no results and it's just a city name, try adding USA
        if (data.length === 0 && !query.includes(',')) {
            // Debug log removed
            searchQuery = query + ', USA';
            const retryNominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(searchQuery)}`;
            url = `https://api.allorigins.win/get?url=${encodeURIComponent(retryNominatimUrl)}`;
            // Debug log removed
            res = await fetchWithRetry(url);

            if (!res || !res.ok) {
                throw new Error(`HTTP ${res?.status || 'unknown'}: ${res?.statusText || 'Request failed'}`);
            }

            response = await res.json();
            data = JSON.parse(response.contents);
            // Debug log removed
        }

        // If still no results, try one more time with lowercase
        if (data.length === 0) {
            // Debug log removed
            searchQuery = query.toLowerCase();
            const retryLowerUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(searchQuery)}`;
            url = `https://api.allorigins.win/get?url=${encodeURIComponent(retryLowerUrl)}`;
            // Debug log removed
            res = await fetchWithRetry(url);

            if (!res || !res.ok) {
                throw new Error(`HTTP ${res?.status || 'unknown'}: ${res?.statusText || 'Request failed'}`);
            }

            response = await res.json();
            data = JSON.parse(response.contents);
            // Debug log removed
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

        // Update UI to show custom location as selected
        const customCard = document.querySelector('.loc[data-loc="custom"]');
        // Debug log removed

        if (customCard) {
            document.querySelectorAll('.loc').forEach(e => e.classList.remove('sel'));
            customCard.classList.add('sel');
            document.getElementById('customPanel').classList.add('show');
            // Debug log removed
        } else {
            console.warn('Custom location card not found in DOM');
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

            // Reset vehicle position
            car.x = car.z = 0;
            car.angle = 0;
            car.speed = car.vx = car.vz = 0;

            if (carMesh) {
                carMesh.position.set(0, 0, 0);
                carMesh.rotation.y = 0;
            }

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
