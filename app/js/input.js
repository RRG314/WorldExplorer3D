import { ctx as appCtx } from "./shared-context.js?v=55"; // ============================================================================
// input.js - Keyboard handling, track recording, city switching
// ============================================================================

function isDebugToggleKey(code, event) {
  if (code === 'F4') return true;
  if (code === 'Backquote') return true;
  const key = event?.key;
  return key === '`' || key === '~' || key === 'Dead';
}

function isPerfToggleKey(code) {
  return code === 'F8';
}

function toggleLargeMap() {
  if (appCtx.showLargeMap) appCtx.closeLargeMap?.();
  else appCtx.openLargeMap?.();
  if (typeof appCtx.openLargeMap !== 'function') {
    appCtx.showLargeMap = !appCtx.showLargeMap;
    document.getElementById('largeMap').classList.toggle('show', appCtx.showLargeMap);
  }
}

function onKey(code, event) {
  if (!appCtx.gameStarted) return;
  const target = event?.target;
  const typing = target?.isContentEditable === true || ['INPUT', 'TEXTAREA', 'SELECT'].includes(String(target?.tagName || '').toUpperCase());
  if (typing && code !== 'Escape') return;

  if (appCtx.fishingGame?.open) {
    if (code === 'Escape') {
      event?.preventDefault?.();
      appCtx.closeFishingGame?.();
      return;
    }
    if (['KeyE', 'Space', 'KeyQ', 'KeyJ', 'KeyK', 'KeyL', 'ArrowLeft', 'ArrowRight'].includes(code)) return;
  }

  if (code === 'KeyE') {
    if (event?.repeat) return;
    const runInteriorFallback = () => {
      if (typeof appCtx.handleInteriorAction !== 'function') return;
      return appCtx.handleInteriorAction();
    };
    const runGameplayFallback = () => {
      if (typeof appCtx.handleGameplayInteraction !== 'function') return runInteriorFallback();
      return Promise.resolve(appCtx.handleGameplayInteraction()).then((handled) => {
        if (handled !== true) return runInteriorFallback();
        return undefined;
      });
    };
    const runPrimaryContext = () => {
      if (typeof appCtx.handlePrimaryContextInteraction !== 'function') return runGameplayFallback();
      return Promise.resolve(appCtx.handlePrimaryContextInteraction()).then((handled) => {
        if (handled !== true) return runGameplayFallback();
        return undefined;
      });
    };
    const interiorPromptVisible = document.getElementById('interiorPrompt')?.classList.contains('show') === true;
    if (interiorPromptVisible) {
      Promise.resolve(runInteriorFallback()).then((handled) => {
        if (handled !== true) return runPrimaryContext();
        return undefined;
      }).catch((err) => {
        console.warn('[interior] Door interaction failed:', err);
      });
      return;
    }
    if (typeof appCtx.handlePrimaryContextInteraction === 'function') {
      Promise.resolve(appCtx.handlePrimaryContextInteraction()).then((handled) => {
        if (handled !== true) return runGameplayFallback();
        return undefined;
      }).catch((err) => {
        console.warn('[interaction] Primary action failed:', err);
      });
      return;
    }
    Promise.resolve(runGameplayFallback()).catch((err) => {
      console.warn('[interior] Interaction failed:', err);
    });
    return;
  }

  if (code === 'KeyI' && typeof appCtx.toggleUrbanEquipment === 'function') {
    if (event?.repeat) return;
    appCtx.toggleWorldDiscoveryJournal?.(false);
    if (appCtx.toggleUrbanEquipment()) return;
  }

  if (code === 'KeyJ' && typeof appCtx.toggleWorldDiscoveryJournal === 'function') {
    if (event?.repeat) return;
    appCtx.toggleUrbanEquipment?.(false);
    if (appCtx.toggleWorldDiscoveryJournal()) return;
  }

  if (/^Digit[1-6]$/.test(code) && typeof appCtx.equipUrbanEquipmentSlot === 'function') {
    if (event?.repeat) return;
    if (appCtx.equipUrbanEquipmentSlot(Number(code.slice(-1)))) return;
  }

  if (code === 'KeyV' && typeof appCtx.handleUrbanEquipmentUse === 'function') {
    if (event?.repeat) return;
    if (appCtx.handleUrbanEquipmentUse()) return;
  }

  if (code === 'KeyT' && typeof appCtx.handleUrbanNpcTake === 'function') {
    if (event?.repeat) return;
    if (appCtx.handleUrbanNpcTake()) return;
  }

  // Primary travel mode cycle (F key)
  if (code === 'KeyF') {
    if (event?.repeat) return;
    if (appCtx.activeInterior && typeof appCtx.clearActiveInterior === 'function') {
      appCtx.clearActiveInterior({ restorePlayer: true, preserveCache: true });
    }
    if (typeof appCtx.cyclePrimaryTravelMode === 'function') {
      appCtx.cyclePrimaryTravelMode({ source: 'keyboard_f' });
    } else {
      console.error('Travel mode controller is unavailable.');
    }
    if (typeof appCtx.updateControlsModeUI === 'function') appCtx.updateControlsModeUI();
    return;
  }

  if (code === 'KeyP') {
    if (event?.repeat) return;
    appCtx.togglePlaneMode?.({ source: 'keyboard_p' });
    appCtx.updateControlsModeUI?.();
    return;
  }

  // Builder mode toggle (B key)
  if (code === 'KeyB') {
    if (typeof appCtx.toggleBlockBuildMode === 'function') {
      appCtx.toggleBlockBuildMode();
    }
    return;
  }

  if (code === 'KeyG') {
    if (event?.repeat) return;
    if (typeof appCtx.handleBoatAction === 'function') {
      appCtx.handleBoatAction();
      if (typeof appCtx.updateControlsModeUI === 'function') appCtx.updateControlsModeUI();
    }
    return;
  }

  // Camera view toggle when walking (C key) - first/third person
  if (code === 'KeyC') {
    if (appCtx.Walk && appCtx.Walk.state.mode === 'walk') {
      appCtx.Walk.toggleView();
    } else {
      appCtx.cycleCameraMode();
    }
    return;
  }

  // Performance overlay toggle (F8)
  if (isPerfToggleKey(code)) {
    if (!appCtx.developerDiagnosticsEnabled) return;
    if (event?.repeat) return;
    const nextEnabled = !(typeof appCtx.getPerfOverlayEnabled === 'function' ?
    appCtx.getPerfOverlayEnabled() :
    !!appCtx.perfOverlayEnabled);
    if (typeof appCtx.setPerfOverlayEnabled === 'function') {
      appCtx.setPerfOverlayEnabled(nextEnabled);
    } else {
      appCtx.perfOverlayEnabled = nextEnabled;
    }
    if (nextEnabled && typeof appCtx.logBaselineSnapshot === 'function') {
      appCtx.logBaselineSnapshot({ trigger: 'F8' });
    }
    if (typeof appCtx.updatePerfPanel === 'function') appCtx.updatePerfPanel(true);
    if (typeof appCtx.positionTopOverlays === 'function') appCtx.positionTopOverlays();
    return;
  }

  // Debug overlay toggle (Backtick key)
  if (isDebugToggleKey(code, event)) {
    if (!appCtx.developerDiagnosticsEnabled) return;
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
    if (
      appCtx.developerDiagnosticsEnabled &&
      event &&
      event.shiftKey &&
      typeof appCtx.toggleRoadDebugMode === 'function'
    ) {
      appCtx.toggleRoadDebugMode();
    } else {
      toggleTrackRecording();
    }
  }
  if (code === 'KeyN') {
    if (event?.repeat) return;
    nextCity();
  }
  if (code === 'KeyM') {
    if (event?.repeat) return;
    toggleLargeMap();
  }
  if (appCtx.showLargeMap && (code === 'Equal' || code === 'NumpadAdd')) {
    if (typeof appCtx.adjustLargeMapZoom === 'function') appCtx.adjustLargeMapZoom(1);
    else if (appCtx.largeMapZoom < 18) {
      appCtx.largeMapZoom++;
      document.getElementById('zoomLevel').textContent = 'Z ' + appCtx.largeMapZoom;
    }
  }
  if (appCtx.showLargeMap && (code === 'Minus' || code === 'NumpadSubtract')) {
    if (typeof appCtx.adjustLargeMapZoom === 'function') appCtx.adjustLargeMapZoom(-1);
    else if (appCtx.largeMapZoom > 10) {
      appCtx.largeMapZoom--;
      document.getElementById('zoomLevel').textContent = 'Z ' + appCtx.largeMapZoom;
    }
  }
  if (code === 'Escape' && !document.getElementById('resultScreen').classList.contains('show') && !document.getElementById('caughtScreen').classList.contains('show')) {
    if (appCtx.worldDiscoveryRuntime?.ui?.open) {
      appCtx.toggleWorldDiscoveryJournal?.(false);
      return;
    }
    if (appCtx.urbanSandboxRuntime?.equipmentOpen) {
      appCtx.toggleUrbanEquipment?.(false);
      return;
    }
    if (appCtx.activeInterior && typeof appCtx.clearActiveInterior === 'function') {
      appCtx.clearActiveInterior({ restorePlayer: true, preserveCache: true });
      return;
    }
    if (appCtx.showLargeMap) {
      if (typeof appCtx.closeLargeMap === 'function') appCtx.closeLargeMap();
      else {
        appCtx.showLargeMap = false;
        document.getElementById('largeMap').classList.remove('show');
      }
    } else {
      const paused = appCtx.togglePauseReason?.('manual_pause') ?? appCtx.paused;
      document.getElementById('pauseScreen').classList.toggle('show', paused);
    }
  }
}

function toggleTrackRecording() {
  appCtx.isRecording = !appCtx.isRecording;
  document.getElementById('fTrack').classList.toggle('recording', appCtx.isRecording);
  document.getElementById('fTrack').textContent = appCtx.isRecording ? '⏹️ Stop Recording' : '🏁 Record Track';
  if (appCtx.isRecording) {
    appCtx.customTrack = [];
  }
}

function eraseTrack() {
  appCtx.customTrack = [];
  appCtx.isRecording = false;
  document.getElementById('fTrack').classList.remove('recording');
  document.getElementById('fTrack').textContent = '🏁 Record Track';
}

function appendTrackPoint(x, z) {
  if (!appCtx.isRecording || !Number.isFinite(x) || !Number.isFinite(z)) return false;
  const last = appCtx.customTrack[appCtx.customTrack.length - 1];
  if (last && Math.hypot(x - last.x, z - last.z) < 8) return false;
  appCtx.customTrack.push({ x, z });
  if (appCtx.customTrack.length > 4096) {
    const retained = appCtx.customTrack.filter((_point, index) => index % 2 === 0);
    appCtx.customTrack.splice(0, appCtx.customTrack.length, ...retained);
  }
  return true;
}

function updateTrack() {
  appendTrackPoint(appCtx.car.x, appCtx.car.z);
}

function nextCity() {
  if (appCtx.selLoc === 'custom') {
    appCtx.selectPresetLocation?.(appCtx.locKeys[0]);
  } else {
    const idx = appCtx.locKeys.indexOf(appCtx.selLoc);
    appCtx.selectPresetLocation?.(appCtx.locKeys[(idx + 1) % appCtx.locKeys.length]);
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

    // Attempt direct fetch (works when served from http/https)
    res = await fetchWithRetry(nominatimUrl);

    if (!res || !res.ok) {
      throw new Error(`HTTP ${res?.status || 'unknown'}: ${res?.statusText || 'Request failed'}`);
    }

    data = await res.json();
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
        // Keep prior result set when retry fails.
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
        // Keep prior result set when retry fails.
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
    appCtx.setCustomLocation?.({ lat, lon, name: locationName });

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

      // Re-enter the world through the same safe custom-location resolver used by
      // title-screen geolocation and globe launches.
      const currentMode = appCtx.Walk?.state?.mode === 'walk' ? 'walk' : 'drive';
      if (typeof appCtx.applyCustomLocationSpawn === 'function') {
        appCtx.applyCustomLocationSpawn(currentMode, {
          source: 'search_location'
        });
      } else if (typeof appCtx.spawnOnRoad === 'function') {
        appCtx.spawnOnRoad();
      }

      // Debug log removed
    } else {



      // Debug log removed
    } // Debug log removed

    // The title screen only needs the side effects above, while the globe
    // selector needs the resolved location as an explicit handoff. Returning
    // the canonical result keeps both entry points on the same geocoder
    // contract instead of making the overlay infer success from status text.
    return {
      lat,
      lon,
      name: locationName,
      country,
      displayName: result.display_name || query,
      arrivalMode: 'walk'
    };
  } catch (e) {
    console.error('=== SEARCH LOCATION DEBUG END - ERROR ===');
    console.error('Search error:', e);
    console.error('Error stack:', e.stack);
    status.textContent = `✗ Search failed: ${e.message}`;
    status.style.color = '#dc2626';
  }
}

Object.assign(appCtx, {
  appendTrackPoint,
  eraseTrack,
  nextCity,
  onKey,
  searchLocation,
  toggleTrackRecording,
  updateTrack
});

export {
  appendTrackPoint,
  eraseTrack,
  nextCity,
  onKey,
  searchLocation,
  toggleTrackRecording,
  updateTrack };
