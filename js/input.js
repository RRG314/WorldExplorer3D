import { ctx } from "./shared-context.js?v=52"; // ============================================================================
// input.js - Keyboard handling, track recording, city switching
// ============================================================================

function isDebugToggleKey(code, event) {
  if (code === 'Backquote' || code === 'F8') return true;
  const key = event?.key;
  return key === '`' || key === '~';
}

function onKey(code, event) {
  if (!ctx.gameStarted) return;

  // Walking mode toggle (F key)
  if (code === 'KeyF') {
    // Debug log removed
    if (ctx.Walk) {
      // Debug log removed
      ctx.Walk.toggleWalk();

      // Clear star selection when switching modes
      ctx.clearStarSelection();

      // Disable drone mode if walking
      if (ctx.Walk.state.mode === 'walk') {
        ctx.droneMode = false;
      }

      // Update all travel mode button states
      if (document.getElementById('fWalk')) {
        const isWalking = ctx.Walk.state.mode === 'walk';
        document.getElementById('fWalk').classList.toggle('on', isWalking);
        document.getElementById('fDriving').classList.toggle('on', !isWalking);
        document.getElementById('fDrone').classList.remove('on');
        if (!isWalking) {
          ctx.droneMode = false;
          if (typeof ctx.camMode !== 'undefined') ctx.camMode = 0;
          if (ctx.carMesh) ctx.carMesh.visible = true;
        }
      }
    } else {
      console.error('Walk module does not exist!');
    }
    if (typeof ctx.updateControlsModeUI === 'function') ctx.updateControlsModeUI();
    return;
  }

  // Builder mode toggle (B key)
  if (code === 'KeyB') {
    if (typeof ctx.toggleBlockBuildMode === 'function') {
      ctx.toggleBlockBuildMode();
    }
    return;
  }

  // Camera view toggle when walking (C key) - first/third person
  if (code === 'KeyC') {
    if (ctx.Walk && ctx.Walk.state.mode === 'walk') {
      ctx.Walk.toggleView();
    } else {
      ctx.camMode = (ctx.camMode + 1) % 3; // Normal car camera cycling
    }
    return;
  }

  if (code === 'Digit6') {
    ctx.droneMode = !ctx.droneMode;

    // Clear star selection when switching modes
    ctx.clearStarSelection();

    if (ctx.droneMode) {
      // Disable walking mode if active
      if (ctx.Walk && ctx.Walk.state.mode === 'walk') {
        ctx.Walk.setModeDrive();
      }
      // Initialize drone position above current position
      const ref = ctx.Walk ? ctx.Walk.getMapRefPosition(false, null) : { x: ctx.car.x, z: ctx.car.z };
      ctx.drone.x = ref.x;
      ctx.drone.z = ref.z;
      ctx.drone.yaw = ctx.car.angle;
      ctx.drone.roll = 0;

      // On the moon, raycast to find actual ground height so drone spawns near surface
      if (ctx.onMoon && ctx.moonSurface) {
        const rc = ctx._getPhysRaycaster();
        ctx._physRayStart.set(ref.x, 2000, ref.z);
        rc.set(ctx._physRayStart, ctx._physRayDir);
        const hits = rc.intersectObject(ctx.moonSurface, false);
        ctx.drone.y = (hits.length > 0 ? hits[0].point.y : -100) + 10;
        ctx.drone.pitch = -0.2;
      } else {
        ctx.drone.y = 50;
        ctx.drone.pitch = -0.3;
      }
    }

    // Update all travel mode button states
    document.getElementById('fDrone').classList.toggle('on', ctx.droneMode);
    document.getElementById('fDriving').classList.toggle('on', !ctx.droneMode);
    document.getElementById('fWalk').classList.remove('on');
    if (typeof ctx.updateControlsModeUI === 'function') ctx.updateControlsModeUI();
  }
  // Debug overlay toggle (Backtick key; F8 fallback for keyboard-layout variance)
  if (isDebugToggleKey(code, event)) {
    if (event?.repeat) return;
    window._debugMode = !window._debugMode;
    const overlay = document.getElementById('debugOverlay');
    if (overlay) overlay.style.display = window._debugMode ? 'block' : 'none';
    if (typeof ctx.positionTopOverlays === 'function') ctx.positionTopOverlays();

    // Create/destroy debug marker under car
    if (window._debugMode && !window._debugMarker) {
      const markerGeo = new THREE.SphereGeometry(0.4, 8, 8);
      const markerMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, depthTest: false, transparent: true, opacity: 0.8 });
      window._debugMarker = new THREE.Mesh(markerGeo, markerMat);
      window._debugMarker.renderOrder = 999;
      ctx.scene.add(window._debugMarker);
    }
    if (!window._debugMode && window._debugMarker) {
      ctx.scene.remove(window._debugMarker);
      if (window._debugMarker.geometry) window._debugMarker.geometry.dispose();
      if (window._debugMarker.material) window._debugMarker.material.dispose();
      window._debugMarker = null;
    }
    return;
  }

  if (code === 'KeyR') {
    // Shift+R: Toggle Road Debug Mode (terrain conformance visualization)
    // R: Toggle track recording (default)
    if (event && event.shiftKey && typeof ctx.toggleRoadDebugMode === 'function') {
      ctx.toggleRoadDebugMode();
    } else {
      toggleTrackRecording();
    }
  }
  if (code === 'KeyN') nextCity();
  if (code === 'KeyM') {
    ctx.showLargeMap = !ctx.showLargeMap;
    document.getElementById('largeMap').classList.toggle('show', ctx.showLargeMap);
  }
  if (ctx.showLargeMap && (code === 'Equal' || code === 'NumpadAdd')) {
    if (ctx.largeMapZoom < 18) {
      ctx.largeMapZoom++;
      document.getElementById('zoomLevel').textContent = 'Z: ' + ctx.largeMapZoom;
    }
  }
  if (ctx.showLargeMap && (code === 'Minus' || code === 'NumpadSubtract')) {
    if (ctx.largeMapZoom > 10) {
      ctx.largeMapZoom--;
      document.getElementById('zoomLevel').textContent = 'Z: ' + ctx.largeMapZoom;
    }
  }
  if (code === 'Escape' && !document.getElementById('resultScreen').classList.contains('show') && !document.getElementById('caughtScreen').classList.contains('show')) {
    if (ctx.showLargeMap) {
      ctx.showLargeMap = false;
      document.getElementById('largeMap').classList.remove('show');
    } else {
      ctx.paused = !ctx.paused;
      document.getElementById('pauseScreen').classList.toggle('show', ctx.paused);
    }
  }
}

function toggleTrackRecording() {
  ctx.isRecording = !ctx.isRecording;
  document.getElementById('fTrack').classList.toggle('recording', ctx.isRecording);
  document.getElementById('fTrack').textContent = ctx.isRecording ? '⏹️ Stop Recording' : '🏁 Record Track';
  if (ctx.isRecording) ctx.customTrack = [];
}

function eraseTrack() {
  ctx.customTrack = [];
  ctx.isRecording = false;
  document.getElementById('fTrack').classList.remove('recording');
  document.getElementById('fTrack').textContent = '🏁 Record Track';
  if (ctx.trackMesh) {ctx.scene.remove(ctx.trackMesh);ctx.trackMesh = null;}
}

function updateTrack() {
  if (!ctx.isRecording) return;
  const last = ctx.customTrack[ctx.customTrack.length - 1];
  if (!last || Math.hypot(ctx.car.x - last.x, ctx.car.z - last.z) > 5) {
    ctx.customTrack.push({ x: ctx.car.x, z: ctx.car.z });
    rebuildTrackMesh();
  }
}

function rebuildTrackMesh() {
  if (ctx.trackMesh) ctx.scene.remove(ctx.trackMesh);
  if (ctx.customTrack.length < 2) return;
  const hw = 8;
  const verts = [],indices = [];
  for (let i = 0; i < ctx.customTrack.length; i++) {
    const p = ctx.customTrack[i];
    let dx, dz;
    if (i === 0) {dx = ctx.customTrack[1].x - p.x;dz = ctx.customTrack[1].z - p.z;} else
    if (i === ctx.customTrack.length - 1) {dx = p.x - ctx.customTrack[i - 1].x;dz = p.z - ctx.customTrack[i - 1].z;} else
    {dx = ctx.customTrack[i + 1].x - ctx.customTrack[i - 1].x;dz = ctx.customTrack[i + 1].z - ctx.customTrack[i - 1].z;}
    const len = Math.sqrt(dx * dx + dz * dz) || 1;
    const nx = -dz / len,nz = dx / len;
    verts.push(p.x + nx * hw, 0.03, p.z + nz * hw);
    verts.push(p.x - nx * hw, 0.03, p.z - nz * hw);
    if (i < ctx.customTrack.length - 1) {
      const vi = i * 2;
      indices.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  ctx.trackMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: ctx.isRecording ? 0xff6644 : 0xffaa00, side: THREE.DoubleSide, transparent: true, opacity: 0.7 }));
  ctx.scene.add(ctx.trackMesh);
}

function nextCity() {
  if (ctx.selLoc === 'custom') {
    ctx.selLoc = ctx.locKeys[0];
  } else {
    const idx = ctx.locKeys.indexOf(ctx.selLoc);
    ctx.selLoc = ctx.locKeys[(idx + 1) % ctx.locKeys.length];
  }
  ctx.loadRoads();
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
    ctx.customLoc = { lat, lon, name: locationName };
    ctx.selLoc = 'custom';

    // Debug log removed
    // Debug log removed

    // Update UI to show custom location panel as active
    if (typeof ctx.setTitleLocationMode === 'function') {
      ctx.setTitleLocationMode('custom');
    }

    // Debug log removed

    // Update status
    status.textContent = `✓ Found: ${locationName}${country ? ', ' + country : ''}`;
    status.style.color = '#059669';

    // Debug log removed

    // If game is running, reload the world
    if (typeof ctx.gameStarted !== 'undefined' && ctx.gameStarted) {
      // Debug log removed
      await ctx.loadRoads();
      // Debug log removed

      // Keep the vehicle on a valid road spawn after reloading location data.
      if (typeof ctx.spawnOnRoad === 'function') ctx.spawnOnRoad();

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

Object.assign(ctx, {
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