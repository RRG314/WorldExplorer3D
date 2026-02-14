import { ctx as appCtx } from "./shared-context.js?v=53"; // ============================================================================
// input.js - Keyboard handling, track recording, city switching
// ============================================================================

function isDebugToggleKey(code, event) {
  if (code === 'Backquote' || code === 'F8') return true;
  const key = event?.key;
  return key === '`' || key === '~';
}

function onKey(code, event) {
  if (!appCtx.gameStarted) return;

  // Walking mode toggle (F key)
  if (code === 'KeyF') {
    // Debug log removed
    if (appCtx.Walk) {
      // Debug log removed
      appCtx.Walk.toggleWalk();

      // Clear star selection when switching modes
      appCtx.clearStarSelection();

      // Disable drone mode if walking
      if (appCtx.Walk.state.mode === 'walk') {
        appCtx.droneMode = false;
      }

      // Update all travel mode button states
      if (document.getElementById('fWalk')) {
        const isWalking = appCtx.Walk.state.mode === 'walk';
        document.getElementById('fWalk').classList.toggle('on', isWalking);
        document.getElementById('fDriving').classList.toggle('on', !isWalking);
        document.getElementById('fDrone').classList.remove('on');
        if (!isWalking) {
          appCtx.droneMode = false;
          if (typeof appCtx.camMode !== 'undefined') appCtx.camMode = 0;
          if (appCtx.carMesh) appCtx.carMesh.visible = true;
        }
      }
    } else {
      console.error('Walk module does not exist!');
    }
    if (typeof appCtx.updateControlsModeUI === 'function') appCtx.updateControlsModeUI();
    return;
  }

  // Builder mode toggle (B key)
  if (code === 'KeyB') {
    if (typeof appCtx.toggleBlockBuildMode === 'function') {
      appCtx.toggleBlockBuildMode();
    }
    return;
  }

  // Camera view toggle when walking (C key) - first/third person
  if (code === 'KeyC') {
    if (appCtx.Walk && appCtx.Walk.state.mode === 'walk') {
      appCtx.Walk.toggleView();
    } else {
      appCtx.camMode = (appCtx.camMode + 1) % 3; // Normal car camera cycling
    }
    return;
  }

  if (code === 'Digit6') {
    appCtx.droneMode = !appCtx.droneMode;

    // Clear star selection when switching modes
    appCtx.clearStarSelection();

    if (appCtx.droneMode) {
      // Disable walking mode if active
      if (appCtx.Walk && appCtx.Walk.state.mode === 'walk') {
        appCtx.Walk.setModeDrive();
      }
      // Initialize drone position above current position
      const ref = appCtx.Walk ? appCtx.Walk.getMapRefPosition(false, null) : { x: appCtx.car.x, z: appCtx.car.z };
      appCtx.drone.x = ref.x;
      appCtx.drone.z = ref.z;
      appCtx.drone.yaw = appCtx.car.angle;
      appCtx.drone.roll = 0;

      // On the moon, raycast to find actual ground height so drone spawns near surface
      if (appCtx.onMoon && appCtx.moonSurface) {
        const rc = appCtx._getPhysRaycaster();
        appCtx._physRayStart.set(ref.x, 2000, ref.z);
        rc.set(appCtx._physRayStart, appCtx._physRayDir);
        const hits = rc.intersectObject(appCtx.moonSurface, false);
        appCtx.drone.y = (hits.length > 0 ? hits[0].point.y : -100) + 10;
        appCtx.drone.pitch = -0.2;
      } else {
        appCtx.drone.y = 50;
        appCtx.drone.pitch = -0.3;
      }
    }

    // Update all travel mode button states
    document.getElementById('fDrone').classList.toggle('on', appCtx.droneMode);
    document.getElementById('fDriving').classList.toggle('on', !appCtx.droneMode);
    document.getElementById('fWalk').classList.remove('on');
    if (typeof appCtx.updateControlsModeUI === 'function') appCtx.updateControlsModeUI();
  }
  // Debug overlay toggle (Backtick key; F8 fallback for keyboard-layout variance)
  if (isDebugToggleKey(code, event)) {
    if (event?.repeat) return;
    window._debugMode = !window._debugMode;
    const overlay = document.getElementById('debugOverlay');
    if (overlay) overlay.style.display = window._debugMode ? 'block' : 'none';
    if (typeof appCtx.positionTopOverlays === 'function') appCtx.positionTopOverlays();

    // Create/destroy debug marker under car
    if (window._debugMode && !window._debugMarker) {
      const markerGeo = new THREE.SphereGeometry(0.4, 8, 8);
      const markerMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, depthTest: false, transparent: true, opacity: 0.8 });
      window._debugMarker = new THREE.Mesh(markerGeo, markerMat);
      window._debugMarker.renderOrder = 999;
      appCtx.scene.add(window._debugMarker);
    }
    if (!window._debugMode && window._debugMarker) {
      appCtx.scene.remove(window._debugMarker);
      if (window._debugMarker.geometry) window._debugMarker.geometry.dispose();
      if (window._debugMarker.material) window._debugMarker.material.dispose();
      window._debugMarker = null;
    }
    return;
  }

  if (code === 'KeyR') {
    // Shift+R: Toggle Road Debug Mode (terrain conformance visualization)
    // R: Toggle track recording (default)
    if (event && event.shiftKey && typeof appCtx.toggleRoadDebugMode === 'function') {
      appCtx.toggleRoadDebugMode();
    } else {
      toggleTrackRecording();
    }
  }
  if (code === 'KeyN') nextCity();
  if (code === 'KeyM') {
    appCtx.showLargeMap = !appCtx.showLargeMap;
    document.getElementById('largeMap').classList.toggle('show', appCtx.showLargeMap);
  }
  if (appCtx.showLargeMap && (code === 'Equal' || code === 'NumpadAdd')) {
    if (appCtx.largeMapZoom < 18) {
      appCtx.largeMapZoom++;
      document.getElementById('zoomLevel').textContent = 'Z: ' + appCtx.largeMapZoom;
    }
  }
  if (appCtx.showLargeMap && (code === 'Minus' || code === 'NumpadSubtract')) {
    if (appCtx.largeMapZoom > 10) {
      appCtx.largeMapZoom--;
      document.getElementById('zoomLevel').textContent = 'Z: ' + appCtx.largeMapZoom;
    }
  }
  if (code === 'Escape' && !document.getElementById('resultScreen').classList.contains('show') && !document.getElementById('caughtScreen').classList.contains('show')) {
    if (appCtx.showLargeMap) {
      appCtx.showLargeMap = false;
      document.getElementById('largeMap').classList.remove('show');
    } else {
      appCtx.paused = !appCtx.paused;
      document.getElementById('pauseScreen').classList.toggle('show', appCtx.paused);
    }
  }
}

function toggleTrackRecording() {
  appCtx.isRecording = !appCtx.isRecording;
  document.getElementById('fTrack').classList.toggle('recording', appCtx.isRecording);
  document.getElementById('fTrack').textContent = appCtx.isRecording ? '⏹️ Stop Recording' : '🏁 Record Track';
  if (appCtx.isRecording) appCtx.customTrack = [];
}

function eraseTrack() {
  appCtx.customTrack = [];
  appCtx.isRecording = false;
  document.getElementById('fTrack').classList.remove('recording');
  document.getElementById('fTrack').textContent = '🏁 Record Track';
  if (appCtx.trackMesh) {appCtx.scene.remove(appCtx.trackMesh);appCtx.trackMesh = null;}
}

function updateTrack() {
  if (!appCtx.isRecording) return;
  const last = appCtx.customTrack[appCtx.customTrack.length - 1];
  if (!last || Math.hypot(appCtx.car.x - last.x, appCtx.car.z - last.z) > 5) {
    appCtx.customTrack.push({ x: appCtx.car.x, z: appCtx.car.z });
    rebuildTrackMesh();
  }
}

function rebuildTrackMesh() {
  if (appCtx.trackMesh) appCtx.scene.remove(appCtx.trackMesh);
  if (appCtx.customTrack.length < 2) return;
  const hw = 8;
  const verts = [],indices = [];
  for (let i = 0; i < appCtx.customTrack.length; i++) {
    const p = appCtx.customTrack[i];
    let dx, dz;
    if (i === 0) {dx = appCtx.customTrack[1].x - p.x;dz = appCtx.customTrack[1].z - p.z;} else
    if (i === appCtx.customTrack.length - 1) {dx = p.x - appCtx.customTrack[i - 1].x;dz = p.z - appCtx.customTrack[i - 1].z;} else
    {dx = appCtx.customTrack[i + 1].x - appCtx.customTrack[i - 1].x;dz = appCtx.customTrack[i + 1].z - appCtx.customTrack[i - 1].z;}
    const len = Math.sqrt(dx * dx + dz * dz) || 1;
    const nx = -dz / len,nz = dx / len;
    verts.push(p.x + nx * hw, 0.03, p.z + nz * hw);
    verts.push(p.x - nx * hw, 0.03, p.z - nz * hw);
    if (i < appCtx.customTrack.length - 1) {
      const vi = i * 2;
      indices.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  appCtx.trackMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: appCtx.isRecording ? 0xff6644 : 0xffaa00, side: THREE.DoubleSide, transparent: true, opacity: 0.7 }));
  appCtx.scene.add(appCtx.trackMesh);
}

function nextCity() {
  if (appCtx.selLoc === 'custom') {
    appCtx.selLoc = appCtx.locKeys[0];
  } else {
    const idx = appCtx.locKeys.indexOf(appCtx.selLoc);
    appCtx.selLoc = appCtx.locKeys[(idx + 1) % appCtx.locKeys.length];
  }
  appCtx.loadRoads();
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
            await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second
            continue;
          }
        }

        return res;
      } catch (error) {
        if (error.name === 'AbortError') {
          // Debug log removed
          if (i < retries) {
            // Debug log removed
            await new Promise((resolve) => setTimeout(resolve, 1000));
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
    let result = data.find((d) => d.type === 'city' || d.type === 'town' || d.class === 'place') || data[0];
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
    appCtx.customLoc = { lat, lon, name: locationName };
    appCtx.selLoc = 'custom';

    // Debug log removed
    // Debug log removed

    // Update UI to show custom location panel as active
    if (typeof appCtx.setTitleLocationMode === 'function') {
      appCtx.setTitleLocationMode('custom');
    }

    // Debug log removed

    // Update status
    status.textContent = `✓ Found: ${locationName}${country ? ', ' + country : ''}`;
    status.style.color = '#059669';

    // Debug log removed

    // If game is running, reload the world
    if (typeof appCtx.gameStarted !== 'undefined' && appCtx.gameStarted) {
      // Debug log removed
      await appCtx.loadRoads();
      // Debug log removed

      // Keep the vehicle on a valid road spawn after reloading location data.
      if (typeof appCtx.spawnOnRoad === 'function') appCtx.spawnOnRoad();

      // Debug log removed
    } else {



      // Debug log removed
    } // Debug log removed
  } catch (e) {
    console.error('=== SEARCH LOCATION DEBUG END - ERROR ===');
    console.error('Search error:', e);
    console.error('Error stack:', e.stack);
    status.textContent = `✗ Search failed: ${e.message}`;
    status.style.color = '#dc2626';
  }
}

Object.assign(appCtx, {
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
  updateTrack };