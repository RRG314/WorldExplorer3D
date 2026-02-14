import { ctx as appCtx } from "./shared-context.js?v=54"; // ============================================================================
// ui.js - UI setup, event binding, button handlers
// ============================================================================

function setupUI() {
  // Initialize Property UI References
  appCtx.PropertyUI.panel = document.getElementById('propertyPanel');
  appCtx.PropertyUI.list = document.getElementById('propertyList');
  appCtx.PropertyUI.modal = document.getElementById('propertyModal');
  appCtx.PropertyUI.modalTitle = document.getElementById('modalTitle');
  appCtx.PropertyUI.modalBody = document.getElementById('modalBody');
  appCtx.PropertyUI.button = document.getElementById('realEstateBtn');

  // Real Estate Button
  if (appCtx.PropertyUI.button) {
    appCtx.PropertyUI.button.addEventListener('click', appCtx.toggleRealEstate);
  }

  // Historic Sites Button
  const historicBtn = document.getElementById('historicBtn');
  if (historicBtn) {
    historicBtn.addEventListener('click', appCtx.toggleHistoric);
  }
  if (typeof appCtx.setupMemoryUI === 'function') {
    appCtx.setupMemoryUI();
  }

  // Property Controls
  const radiusSlider = document.getElementById('radiusSlider');
  const radiusValue = document.getElementById('radiusValue');
  const sortSelect = document.getElementById('sortSelect');
  const refreshBtn = document.getElementById('refreshProperties');
  const clearFilterBtn = document.getElementById('clearPropertyFilter');

  if (radiusSlider && radiusValue) {
    radiusSlider.addEventListener('input', (e) => {
      appCtx.propertyRadius = parseFloat(e.target.value);
      radiusValue.textContent = appCtx.propertyRadius.toFixed(1) + ' km';
      if (appCtx.realEstateMode) appCtx.updatePropertyPanel();
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      appCtx.propertySort = e.target.value;
      if (appCtx.realEstateMode) appCtx.updatePropertyPanel();
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      if (appCtx.realEstateMode) appCtx.loadPropertiesAtCurrentLocation();
    });
  }

  // Property type filter buttons
  const propertyTypeButtons = document.querySelectorAll('.property-type-btn');

  propertyTypeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      // Remove active class from all buttons
      propertyTypeButtons.forEach((b) => {
        b.style.background = '#e2e8f0';
        b.style.color = '#64748b';
        b.classList.remove('active');
      });

      // Add active class to clicked button
      btn.style.background = '#667eea';
      btn.style.color = '#ffffff';
      btn.classList.add('active');

      appCtx.propertyTypeFilter = btn.dataset.type;

      // Update the panel
      if (appCtx.realEstateMode) appCtx.updatePropertyPanel();
    });
  });

  if (clearFilterBtn) {
    clearFilterBtn.addEventListener('click', appCtx.clearNavigation);
  }

  // Large Map Canvas Click Detection
  const largeMapCanvas = document.getElementById('largeMapCanvas');
  if (largeMapCanvas) {
    largeMapCanvas.addEventListener('click', (e) => {
      if (!appCtx.showLargeMap) return;

      const rect = largeMapCanvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      // Check if click is on a property marker
      if (appCtx.mapLayers.properties && appCtx.realEstateMode) {
        for (const prop of appCtx.properties) {
          const screenPos = appCtx.worldToScreenLarge(prop.x, prop.z);
          const dist = Math.sqrt((clickX - screenPos.x) ** 2 + (clickY - screenPos.y) ** 2);
          if (dist < 10) {
            appCtx.showMapInfo('property', prop);
            return;
          }
        }
      }

      // Check if click is on a POI marker (based on legend layer filters)
      if (appCtx.pois.length > 0) {
        for (const poi of appCtx.pois) {
          if (!appCtx.isPOIVisible(poi.type)) continue;
          const screenPos = appCtx.worldToScreenLarge(poi.x, poi.z);
          const dist = Math.sqrt((clickX - screenPos.x) ** 2 + (clickY - screenPos.y) ** 2);
          if (dist < 8) {
            appCtx.showMapInfo('poi', poi);
            return;
          }
        }
      }

      // Check if click is on a historic site
      if (appCtx.mapLayers.historic && appCtx.historicSites.length > 0) {
        for (const site of appCtx.historicSites) {
          const screenPos = appCtx.worldToScreenLarge(site.x, site.z);
          const dist = Math.sqrt((clickX - screenPos.x) ** 2 + (clickY - screenPos.y) ** 2);
          if (dist < 8) {
            appCtx.showMapInfo('historic', site);
            return;
          }
        }
      }
    });

    largeMapCanvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!appCtx.showLargeMap) return;

      const rect = largeMapCanvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      const worldPos = appCtx.largeMapScreenToWorld(clickX, clickY);
      appCtx.teleportToLocation(worldPos.x, worldPos.z);
    });
  }

  // Settings Tab - API Keys
  const rentcastKeyInput = document.getElementById('rentcastKeyInput');
  const attomKeyInput = document.getElementById('attomKeyInput');
  const estatedKeyInput = document.getElementById('estatedKeyInput');
  const saveApiKeyBtn = document.getElementById('saveApiKey');
  const realEstateToggle = document.getElementById('realEstateToggle');
  const toggleLabel = document.getElementById('realEstateToggleLabel');
  const perfModeSelect = document.getElementById('perfModeSelect');
  const perfOverlayToggle = document.getElementById('perfOverlayToggle');
  const perfApplyReload = document.getElementById('perfApplyReload');
  const perfCopySnapshot = document.getElementById('perfCopySnapshot');
  const perfSettingsStatus = document.getElementById('perfSettingsStatus');
  const shareExperienceBtn = document.getElementById('shareExperienceBtn');
  const shareExperienceStatus = document.getElementById('shareExperienceStatus');

  // Load saved API keys from localStorage
  const savedRentcast = localStorage.getItem('rentcastApiKey');
  const savedAttom = localStorage.getItem('attomApiKey');
  const savedEstated = localStorage.getItem('estatedApiKey');

  if (savedRentcast) {
    appCtx.apiConfig.rentcast = savedRentcast;
    if (rentcastKeyInput) rentcastKeyInput.value = savedRentcast;
  }
  if (savedAttom) {
    appCtx.apiConfig.attom = savedAttom;
    if (attomKeyInput) attomKeyInput.value = savedAttom;
  }
  if (savedEstated) {
    appCtx.apiConfig.estated = savedEstated;
    if (estatedKeyInput) estatedKeyInput.value = savedEstated;
  }

  // Load real estate mode preference
  const savedRealEstateMode = localStorage.getItem('realEstateEnabled');
  if (savedRealEstateMode === 'true') {
    if (realEstateToggle) realEstateToggle.checked = true;
    if (toggleLabel) toggleLabel.style.background = '#f0f4ff';
  }

  // Save API keys
  if (saveApiKeyBtn) {
    saveApiKeyBtn.addEventListener('click', () => {
      let savedCount = 0;

      // Save Estated
      if (estatedKeyInput) {
        const key = estatedKeyInput.value.trim();
        if (key) {
          appCtx.apiConfig.estated = key;
          localStorage.setItem('estatedApiKey', key);
          savedCount++;
        } else {
          appCtx.apiConfig.estated = null;
          localStorage.removeItem('estatedApiKey');
        }
      }

      // Save ATTOM
      if (attomKeyInput) {
        const key = attomKeyInput.value.trim();
        if (key) {
          appCtx.apiConfig.attom = key;
          localStorage.setItem('attomApiKey', key);
          savedCount++;
        } else {
          appCtx.apiConfig.attom = null;
          localStorage.removeItem('attomApiKey');
        }
      }

      // Save RentCast
      if (rentcastKeyInput) {
        const key = rentcastKeyInput.value.trim();
        if (key) {
          appCtx.apiConfig.rentcast = key;
          localStorage.setItem('rentcastApiKey', key);
          savedCount++;
        } else {
          appCtx.apiConfig.rentcast = null;
          localStorage.removeItem('rentcastApiKey');
        }
      }

      // Show feedback
      if (savedCount > 0) {
        saveApiKeyBtn.textContent = `✓ Saved ${savedCount} API Key${savedCount > 1 ? 's' : ''}!`;
        saveApiKeyBtn.style.background = '#10b981';
      } else {
        saveApiKeyBtn.textContent = '✓ All Keys Cleared!';
        saveApiKeyBtn.style.background = '#64748b';
      }

      setTimeout(() => {
        saveApiKeyBtn.textContent = '💾 Save All API Keys';
        saveApiKeyBtn.style.background = '#667eea';
      }, 2000);
    });
  }

  // Real estate toggle
  if (realEstateToggle && toggleLabel) {
    realEstateToggle.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      localStorage.setItem('realEstateEnabled', enabled);
      toggleLabel.style.background = enabled ? '#f0f4ff' : '#f8fafc';
      toggleLabel.style.borderColor = enabled ? '#667eea' : '#e2e8f0';
    });
  }

  // Performance benchmark controls (RDT vs baseline)
  if (perfModeSelect) {
    const currentMode = typeof appCtx.getPerfMode === 'function' ? appCtx.getPerfMode() : appCtx.perfMode || 'rdt';
    perfModeSelect.value = currentMode === 'baseline' ? 'baseline' : 'rdt';
  }
  if (perfOverlayToggle) {
    const overlayEnabled = typeof appCtx.getPerfOverlayEnabled === 'function' ?
    appCtx.getPerfOverlayEnabled() :
    !!appCtx.perfOverlayEnabled;
    perfOverlayToggle.checked = overlayEnabled;
  }

  if (perfModeSelect) {
    perfModeSelect.addEventListener('change', (e) => {
      const selectedMode = e.target.value === 'baseline' ? 'baseline' : 'rdt';
      if (typeof appCtx.setPerfMode === 'function') appCtx.setPerfMode(selectedMode);
      if (perfSettingsStatus) {
        perfSettingsStatus.textContent = selectedMode === 'baseline' ?
        'Baseline selected. Use Apply + Reload World to rebuild with baseline budgets.' :
        'RDT selected. Use Apply + Reload World to rebuild with adaptive budgets.';
      }
      if (typeof appCtx.updatePerfPanel === 'function') appCtx.updatePerfPanel(true);
    });
  }

  if (perfOverlayToggle) {
    perfOverlayToggle.addEventListener('change', (e) => {
      const enabled = !!e.target.checked;
      if (typeof appCtx.setPerfOverlayEnabled === 'function') appCtx.setPerfOverlayEnabled(enabled);
      if (perfSettingsStatus) {
        perfSettingsStatus.textContent = enabled ?
        'Live overlay enabled. Benchmark values will be shown during gameplay.' :
        'Live overlay disabled.';
      }
      if (typeof appCtx.updatePerfPanel === 'function') appCtx.updatePerfPanel(true);
    });
  }

  if (perfApplyReload) {
    perfApplyReload.addEventListener('click', async () => {
      const selectedMode = perfModeSelect?.value === 'baseline' ? 'baseline' : 'rdt';
      if (typeof appCtx.setPerfMode === 'function') appCtx.setPerfMode(selectedMode);

      if (perfSettingsStatus) {
        perfSettingsStatus.textContent = appCtx.gameStarted ?
        `Applying ${selectedMode.toUpperCase()} mode and reloading world...` :
        `Saved ${selectedMode.toUpperCase()} mode. It will apply when you start.`;
      }

      if (appCtx.gameStarted && typeof appCtx.loadRoads === 'function') {
        await appCtx.loadRoads();
        if (perfSettingsStatus) {
          perfSettingsStatus.textContent = `${selectedMode.toUpperCase()} mode applied and world reloaded.`;
        }
      }
      if (typeof appCtx.updatePerfPanel === 'function') appCtx.updatePerfPanel(true);
    });
  }

  if (perfCopySnapshot) {
    perfCopySnapshot.addEventListener('click', async () => {
      try {
        if (typeof appCtx.copyPerfSnapshotToClipboard !== 'function') {
          throw new Error('Snapshot exporter unavailable');
        }
        await appCtx.copyPerfSnapshotToClipboard();
        if (perfSettingsStatus) perfSettingsStatus.textContent = 'Benchmark snapshot copied to clipboard.';
      } catch (err) {
        if (perfSettingsStatus) {
          perfSettingsStatus.textContent = `Unable to copy snapshot: ${err?.message || err}`;
        }
      }
    });
  }

  const sharedExperienceParams = (() => {
    const params = new URLSearchParams(window.location.search);
    const hasKnown =
    params.has('loc') ||
    params.has('lat') ||
    params.has('lon') ||
    params.has('gm') ||
    params.has('mode') ||
    params.has('camMode') ||
    params.has('seed');
    if (!hasKnown) return null;

    const toNum = (key) => {
      const raw = params.get(key);
      if (raw === null || raw === '') return null;
      const value = Number(raw);
      return Number.isFinite(value) ? value : null;
    };
    const normalizeLaunch = (value) => {
      if (value === 'moon' || value === 'space') return value;
      return 'earth';
    };
    const normalizeGameMode = (value) => {
      if (value === 'trial' || value === 'checkpoint') return value;
      return value === 'free' ? 'free' : null;
    };
    const normalizeTravelMode = (value) => {
      if (value === 'driving' || value === 'walking' || value === 'drone' || value === 'rocket') return value;
      return null;
    };

    return {
      loc: params.get('loc') || null,
      lat: toNum('lat'),
      lon: toNum('lon'),
      name: params.get('lname') || null,
      launch: params.has('launch') ? normalizeLaunch(params.get('launch')) : null,
      gameMode: normalizeGameMode(params.get('gm')),
      perfMode: params.get('pm') === 'baseline' ? 'baseline' : params.get('pm') === 'rdt' ? 'rdt' : null,
      seed: toNum('seed'),
      travelMode: normalizeTravelMode(params.get('mode')),
      camMode: (() => {
        const v = toNum('camMode');
        return Number.isFinite(v) ? Math.max(0, Math.min(2, Math.round(v))) : null;
      })(),
      refX: toNum('rx'),
      refY: toNum('ry'),
      refZ: toNum('rz'),
      yaw: toNum('yaw'),
      pitch: toNum('pitch')
    };
  })();

  function applySharedRuntimeState() {
    const pending = appCtx.pendingExperienceState;
    if (!pending || typeof pending !== 'object') return;

    const setDriveMode = () => {
      appCtx.droneMode = false;
      if (appCtx.Walk) appCtx.Walk.setModeDrive();
      if (appCtx.carMesh) appCtx.carMesh.visible = true;
      const fDriving = document.getElementById('fDriving');
      const fWalk = document.getElementById('fWalk');
      const fDrone = document.getElementById('fDrone');
      if (fDriving) fDriving.classList.add('on');
      if (fWalk) fWalk.classList.remove('on');
      if (fDrone) fDrone.classList.remove('on');
    };
    const setWalkMode = () => {
      appCtx.droneMode = false;
      if (appCtx.Walk && appCtx.Walk.state.mode !== 'walk') appCtx.Walk.toggleWalk();
      const fDriving = document.getElementById('fDriving');
      const fWalk = document.getElementById('fWalk');
      const fDrone = document.getElementById('fDrone');
      if (fDriving) fDriving.classList.remove('on');
      if (fWalk) fWalk.classList.add('on');
      if (fDrone) fDrone.classList.remove('on');
    };
    const setDroneMode = () => {
      if (!appCtx.droneMode) {
        appCtx.droneMode = true;
        if (appCtx.Walk && appCtx.Walk.state.mode === 'walk') appCtx.Walk.setModeDrive();
      }
      const fDriving = document.getElementById('fDriving');
      const fWalk = document.getElementById('fWalk');
      const fDrone = document.getElementById('fDrone');
      if (fDriving) fDriving.classList.remove('on');
      if (fWalk) fWalk.classList.remove('on');
      if (fDrone) fDrone.classList.add('on');
    };

    const mode = pending.travelMode || getCurrentTravelMode();
    if (pending.travelMode === 'walking') setWalkMode();else
    if (pending.travelMode === 'drone') setDroneMode();else
    if (pending.travelMode === 'driving') setDriveMode();

    const x = Number.isFinite(pending.refX) ? pending.refX : null;
    const y = Number.isFinite(pending.refY) ? pending.refY : null;
    const z = Number.isFinite(pending.refZ) ? pending.refZ : null;
    const yaw = Number.isFinite(pending.yaw) ? pending.yaw : null;
    const pitch = Number.isFinite(pending.pitch) ? pending.pitch : null;
    const terrainYAt = (tx, tz) =>
    typeof appCtx.terrainMeshHeightAt === 'function' ?
    appCtx.terrainMeshHeightAt(tx, tz) :
    appCtx.elevationWorldYAtWorldXZ(tx, tz);

    if (mode === 'drone') {
      if (Number.isFinite(x)) appCtx.drone.x = x;
      if (Number.isFinite(z)) appCtx.drone.z = z;
      appCtx.drone.y = Number.isFinite(y) ? y : terrainYAt(appCtx.drone.x, appCtx.drone.z) + 45;
      if (Number.isFinite(yaw)) appCtx.drone.yaw = yaw;
      if (Number.isFinite(pitch)) appCtx.drone.pitch = pitch;
    } else if (mode === 'walking' && appCtx.Walk && appCtx.Walk.state && appCtx.Walk.state.walker) {
      const walker = appCtx.Walk.state.walker;
      if (Number.isFinite(x)) walker.x = x;
      if (Number.isFinite(z)) walker.z = z;
      const groundY = terrainYAt(walker.x, walker.z);
      walker.y = Number.isFinite(y) ? y : groundY + 1.7;
      walker.vy = 0;
      if (Number.isFinite(yaw)) {
        walker.yaw = yaw;
        walker.angle = yaw;
      }
      if (appCtx.Walk.state.characterMesh) {
        appCtx.Walk.state.characterMesh.position.set(walker.x, walker.y - 1.7, walker.z);
        appCtx.Walk.state.characterMesh.rotation.y = Number.isFinite(yaw) ? yaw : appCtx.Walk.state.characterMesh.rotation.y;
      }
      appCtx.car.x = walker.x;
      appCtx.car.z = walker.z;
      appCtx.car.angle = Number.isFinite(yaw) ? yaw : appCtx.car.angle;
    } else {
      if (Number.isFinite(x)) appCtx.car.x = x;
      if (Number.isFinite(z)) appCtx.car.z = z;
      appCtx.car.y = Number.isFinite(y) ? y : terrainYAt(appCtx.car.x, appCtx.car.z) + 1.2;
      if (Number.isFinite(yaw)) appCtx.car.angle = yaw;
      appCtx.car.speed = 0;
      appCtx.car.vx = 0;
      appCtx.car.vz = 0;
      if (appCtx.carMesh) {
        appCtx.carMesh.position.set(appCtx.car.x, appCtx.car.y, appCtx.car.z);
        appCtx.carMesh.rotation.y = appCtx.car.angle;
      }
    }

    if (Number.isFinite(pending.camMode)) {
      appCtx.camMode = pending.camMode;
    }
    if (typeof appCtx.updateControlsModeUI === 'function') appCtx.updateControlsModeUI();
    if (typeof appCtx.updateCamera === 'function') appCtx.updateCamera();
    appCtx.pendingExperienceState = null;
  }

  function getCurrentTravelMode() {
    if (typeof appCtx.isEnv === 'function' && typeof appCtx.ENV !== 'undefined' && appCtx.isEnv(appCtx.ENV.SPACE_FLIGHT)) return 'rocket';
    if (appCtx.droneMode) return 'drone';
    if (appCtx.Walk && appCtx.Walk.state && appCtx.Walk.state.mode === 'walk') return 'walking';
    return 'driving';
  }

  function buildShareableExperienceLink() {
    const url = new URL(window.location.href);
    const params = new URLSearchParams();
    const pending = appCtx.pendingExperienceState && typeof appCtx.pendingExperienceState === 'object' ? appCtx.pendingExperienceState : null;
    const mode = !appCtx.gameStarted && pending && pending.travelMode ? pending.travelMode : getCurrentTravelMode();
    const launchMode =
    typeof appCtx.isEnv === 'function' && typeof appCtx.ENV !== 'undefined' && appCtx.isEnv(appCtx.ENV.SPACE_FLIGHT) ? 'space' :
    appCtx.onMoon ? 'moon' :
    (appCtx.loadingScreenMode === 'moon' || appCtx.loadingScreenMode === 'space' ? appCtx.loadingScreenMode : titleLaunchMode);
    const fmt = (value, digits = 3) => Number(value).toFixed(digits);

    if (appCtx.selLoc === 'custom') {
      params.set('loc', 'custom');
      const cLat = Number(appCtx.customLoc?.lat);
      const cLon = Number(appCtx.customLoc?.lon);
      if (Number.isFinite(cLat)) params.set('lat', cLat.toFixed(6));
      if (Number.isFinite(cLon)) params.set('lon', cLon.toFixed(6));
      const cName = (appCtx.customLoc?.name || 'Custom Location').trim();
      if (cName) params.set('lname', cName.slice(0, 80));
    } else if (appCtx.selLoc && appCtx.LOCS && appCtx.LOCS[appCtx.selLoc]) {
      params.set('loc', appCtx.selLoc);
    }

    if (launchMode) params.set('launch', launchMode);
    if (appCtx.gameMode) params.set('gm', appCtx.gameMode);
    if (typeof appCtx.getPerfMode === 'function') params.set('pm', appCtx.getPerfMode());
    const seedValue = Number.isFinite(Number(appCtx.sharedSeedOverride)) ? Number(appCtx.sharedSeedOverride) : Number(appCtx.rdtSeed);
    if (Number.isFinite(seedValue)) params.set('seed', String((Math.floor(seedValue) | 0) >>> 0));
    const cameraMode = !appCtx.gameStarted && pending && Number.isFinite(pending.camMode) ? pending.camMode : appCtx.camMode;
    if (Number.isFinite(cameraMode)) params.set('camMode', String(Math.max(0, Math.min(2, cameraMode | 0))));
    params.set('mode', mode);

    const pendingX = pending && Number.isFinite(pending.refX) ? pending.refX : null;
    const pendingY = pending && Number.isFinite(pending.refY) ? pending.refY : null;
    const pendingZ = pending && Number.isFinite(pending.refZ) ? pending.refZ : null;
    const pendingYaw = pending && Number.isFinite(pending.yaw) ? pending.yaw : null;
    const pendingPitch = pending && Number.isFinite(pending.pitch) ? pending.pitch : null;

    if (mode === 'drone') {
      params.set('rx', fmt(pendingX ?? appCtx.drone?.x ?? 0));
      params.set('ry', fmt(pendingY ?? appCtx.drone?.y ?? 0));
      params.set('rz', fmt(pendingZ ?? appCtx.drone?.z ?? 0));
      params.set('yaw', fmt(pendingYaw ?? appCtx.drone?.yaw ?? 0, 4));
      params.set('pitch', fmt(pendingPitch ?? appCtx.drone?.pitch ?? 0, 4));
    } else if (mode === 'walking') {
      const walker = appCtx.Walk && appCtx.Walk.state ? appCtx.Walk.state.walker : null;
      params.set('rx', fmt(pendingX ?? walker?.x ?? 0));
      params.set('ry', fmt(pendingY ?? walker?.y ?? 1.7));
      params.set('rz', fmt(pendingZ ?? walker?.z ?? 0));
      params.set('yaw', fmt(pendingYaw ?? walker?.yaw ?? walker?.angle ?? 0, 4));
    } else {
      params.set('rx', fmt(pendingX ?? appCtx.car?.x ?? 0));
      params.set('ry', fmt(pendingY ?? appCtx.car?.y ?? 0));
      params.set('rz', fmt(pendingZ ?? appCtx.car?.z ?? 0));
      params.set('yaw', fmt(pendingYaw ?? appCtx.car?.angle ?? 0, 4));
    }

    url.search = params.toString();
    url.hash = '';
    return url.toString();
  }

  if (shareExperienceBtn) {
    shareExperienceBtn.addEventListener('click', async () => {
      try {
        const experienceLink = buildShareableExperienceLink();
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          await navigator.clipboard.writeText(experienceLink);
          if (shareExperienceStatus) shareExperienceStatus.textContent = 'Experience link copied to clipboard.';
        } else {
          window.prompt('Copy experience link:', experienceLink);
          if (shareExperienceStatus) shareExperienceStatus.textContent = 'Experience link generated.';
        }
      } catch (err) {
        if (shareExperienceStatus) {
          shareExperienceStatus.textContent = `Unable to build share link: ${err?.message || err}`;
        }
      }
    });
  }

  // Tabs
  document.querySelectorAll('.tab-btn').forEach((btn) => btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  }));
  // Locations (main-branch behavior with Moon/Space launch buttons)
  const customPanel = document.getElementById('customPanel');
  const earthLaunchToggle = document.getElementById('earthLaunchToggle');
  const moonLaunchToggle = document.getElementById('moonLaunchToggle');
  const spaceLaunchToggle = document.getElementById('spaceLaunchToggle');
  const launchModeButtons = {
    earth: earthLaunchToggle,
    moon: moonLaunchToggle,
    space: spaceLaunchToggle
  };
  let titleLaunchMode = 'earth'; // earth | moon | space

  const setLaunchMode = (mode) => {
    const nextMode = mode === 'moon' || mode === 'space' ? mode : 'earth';
    titleLaunchMode = nextMode;
    Object.entries(launchModeButtons).forEach(([btnMode, btn]) => {
      if (!btn) return;
      btn.classList.toggle('active', btnMode === nextMode);
    });
    appCtx.loadingScreenMode = nextMode;
  };

  const setTitleLocationMode = (mode) => {
    if (mode === 'moon' || mode === 'space') {
      setLaunchMode(mode);
      return;
    }

    setLaunchMode('earth');

    if (mode === 'custom') {
      const customCard = document.querySelector('.loc[data-loc="custom"]');
      if (customCard) {
        document.querySelectorAll('.loc').forEach((e) => e.classList.remove('sel'));
        customCard.classList.add('sel');
      }
      appCtx.selLoc = 'custom';
      if (customPanel) customPanel.classList.add('show');
      return;
    }

    const selectedSuggested = document.querySelector('.loc.sel:not([data-loc="custom"])') ||
    document.querySelector('.loc[data-loc="baltimore"]');
    if (selectedSuggested) {
      document.querySelectorAll('.loc').forEach((e) => e.classList.remove('sel'));
      selectedSuggested.classList.add('sel');
      appCtx.selLoc = selectedSuggested.dataset.loc;
    }
    if (customPanel) customPanel.classList.remove('show');
  };

  document.querySelectorAll('.loc').forEach((el) => el.addEventListener('click', () => {
    document.querySelectorAll('.loc').forEach((e) => e.classList.remove('sel'));
    el.classList.add('sel');
    appCtx.selLoc = el.dataset.loc;
    if (customPanel) customPanel.classList.toggle('show', appCtx.selLoc === 'custom');
    if (appCtx.selLoc === 'custom') {
      setTitleLocationMode('custom');
    } else {
      setLaunchMode('earth');
    }
  }));

  if (earthLaunchToggle) {
    earthLaunchToggle.addEventListener('click', () => setLaunchMode('earth'));
  }
  if (moonLaunchToggle) {
    moonLaunchToggle.addEventListener('click', () => setLaunchMode('moon'));
  }
  if (spaceLaunchToggle) {
    spaceLaunchToggle.addEventListener('click', () => setLaunchMode('space'));
  }

  // Exposed so searchLocation() can force the custom selector active.
  appCtx.setTitleLocationMode = setTitleLocationMode;
  appCtx.selectSuggestedLocationCard = (targetEl) => {
    if (!targetEl) return;
    const selectedLoc = targetEl.closest('.loc[data-loc]');
    if (!selectedLoc || selectedLoc.dataset.loc === 'custom') return;
    document.querySelectorAll('.loc').forEach((e) => e.classList.remove('sel'));
    selectedLoc.classList.add('sel');
    appCtx.selLoc = selectedLoc.dataset.loc;
    if (customPanel) customPanel.classList.remove('show');
    setLaunchMode('earth');
  };

  // Initial panel state.
  setTitleLocationMode(appCtx.selLoc === 'custom' ? 'custom' : 'suggested');

  // Optional share-link payload: seed/location/mode/camera from URL query.
  if (sharedExperienceParams) {
    const validGameModes = new Set(['free', 'trial', 'checkpoint']);
    if (sharedExperienceParams.gameMode && validGameModes.has(sharedExperienceParams.gameMode)) {
      appCtx.gameMode = sharedExperienceParams.gameMode;
      const targetModeEl = document.querySelector(`.mode[data-mode="${sharedExperienceParams.gameMode}"]`);
      if (targetModeEl) {
        document.querySelectorAll('.mode').forEach((e) => e.classList.remove('sel'));
        targetModeEl.classList.add('sel');
      }
    }

    if (sharedExperienceParams.perfMode && typeof appCtx.setPerfMode === 'function') {
      appCtx.setPerfMode(sharedExperienceParams.perfMode);
      if (perfModeSelect) perfModeSelect.value = sharedExperienceParams.perfMode;
    }

    const hasCustomCoords = Number.isFinite(sharedExperienceParams.lat) && Number.isFinite(sharedExperienceParams.lon);
    const hasPresetLoc = !!(
    sharedExperienceParams.loc &&
    sharedExperienceParams.loc !== 'custom' &&
    appCtx.LOCS &&
    appCtx.LOCS[sharedExperienceParams.loc]);

    if (hasCustomCoords) {
      const lat = sharedExperienceParams.lat;
      const lon = sharedExperienceParams.lon;
      const customLatInput = document.getElementById('customLat');
      const customLonInput = document.getElementById('customLon');
      if (customLatInput && Number.isFinite(lat)) customLatInput.value = lat.toFixed(6);
      if (customLonInput && Number.isFinite(lon)) customLonInput.value = lon.toFixed(6);
      appCtx.customLoc = {
        lat,
        lon,
        name: sharedExperienceParams.name || appCtx.customLoc?.name || 'Shared Location'
      };
      appCtx.selLoc = 'custom';
      setTitleLocationMode('custom');
    } else if (sharedExperienceParams.loc === 'custom' && !hasCustomCoords && perfSettingsStatus) {
      perfSettingsStatus.textContent = 'Share link missing custom coordinates (lat/lon). Using current location selection.';
    } else if (hasPresetLoc) {
      const selectedLocKey = sharedExperienceParams.loc;
      const selectedLocCard = document.querySelector(`.loc[data-loc="${selectedLocKey}"]`);
      if (selectedLocCard) {
        document.querySelectorAll('.loc').forEach((e) => e.classList.remove('sel'));
        selectedLocCard.classList.add('sel');
      }
      appCtx.selLoc = selectedLocKey;
      if (customPanel) customPanel.classList.remove('show');
      setLaunchMode('earth');
    }

    if (sharedExperienceParams.launch) setLaunchMode(sharedExperienceParams.launch);

    if (Number.isFinite(sharedExperienceParams.seed)) {
      appCtx.sharedSeedOverride = (Math.floor(sharedExperienceParams.seed) | 0) >>> 0;
    }

    appCtx.pendingExperienceState = {
      travelMode: sharedExperienceParams.travelMode,
      camMode: sharedExperienceParams.camMode,
      refX: sharedExperienceParams.refX,
      refY: sharedExperienceParams.refY,
      refZ: sharedExperienceParams.refZ,
      yaw: sharedExperienceParams.yaw,
      pitch: sharedExperienceParams.pitch
    };

    if (shareExperienceStatus) {
      shareExperienceStatus.textContent = 'Share link loaded. Start Explore to apply location/mode/camera.';
    } else if (perfSettingsStatus) {
      perfSettingsStatus.textContent = 'Share link loaded. Start Explore to apply location/mode/camera.';
    }
  }

  // Custom location search - universal search for any location
  document.getElementById('locationSearchBtn').addEventListener('click', appCtx.searchLocation);
  document.getElementById('locationSearch').addEventListener('keypress', (e) => {if (e.key === 'Enter') appCtx.searchLocation();});
  // Game modes
  document.querySelectorAll('.mode').forEach((el) => el.addEventListener('click', () => {
    document.querySelectorAll('.mode').forEach((e) => e.classList.remove('sel'));
    el.classList.add('sel');
    appCtx.gameMode = el.dataset.mode;
  }));
  // Start
  document.getElementById('startBtn').addEventListener('click', async () => {
    const launchMode = titleLaunchMode;
    appCtx.loadingScreenMode = launchMode === 'moon' ? 'moon' : launchMode === 'space' ? 'space' : 'earth';
    document.getElementById('titleScreen').classList.add('hidden');
    document.getElementById('hud').classList.add('show');
    document.getElementById('minimap').classList.add('show');
    document.getElementById('modeHud').classList.add('show');
    document.getElementById('floatMenuContainer').classList.add('show');
    document.getElementById('mainMenuBtn').classList.add('show');
    document.getElementById('controlsTab').classList.add('show');
    document.getElementById('coords').classList.add('show');
    document.getElementById('historicBtn').classList.add('show');
    const memoryFlowerFloatBtn = document.getElementById('memoryFlowerFloatBtn');
    if (memoryFlowerFloatBtn) memoryFlowerFloatBtn.classList.add('show');
    appCtx.gameStarted = true;
    if (typeof appCtx.updatePerfPanel === 'function') appCtx.updatePerfPanel(true);
    appCtx.switchEnv(appCtx.ENV.EARTH);

    // Show exploration mode message
    const explorationMsg = document.getElementById('explorationModeMsg');
    // Debug log removed
    let explorationMsgTimeout;

    if (explorationMsg) {
      // Debug log removed
      explorationMsg.style.display = 'block';
      explorationMsg.style.opacity = '0';

      // Function to hide the message
      const hideExplorationMsg = () => {
        // Debug log removed
        if (explorationMsgTimeout) clearTimeout(explorationMsgTimeout);
        explorationMsg.style.opacity = '0';
        setTimeout(() => {
          explorationMsg.style.display = 'none';
        }, 500);
      };

      // Hide on click
      explorationMsg.addEventListener('click', hideExplorationMsg, { once: true });

      // Fade in
      setTimeout(() => {
        explorationMsg.style.transition = 'opacity 0.5s';
        explorationMsg.style.opacity = '1';
        // Debug log removed
      }, 100);

      // Fade out after 5 seconds
      explorationMsgTimeout = setTimeout(() => {
        hideExplorationMsg();
      }, 5000);
    }

    // Load visible terrain immediately so grass appears even while road APIs are pending.
    if (typeof appCtx.updateTerrainAround === 'function' && appCtx.terrainEnabled && !appCtx.onMoon) {
      const startRef = appCtx.Walk && appCtx.Walk.state && appCtx.Walk.state.walker ?
      appCtx.Walk.state.walker : appCtx.car;

      appCtx.updateTerrainAround(startRef.x || 0, startRef.z || 0);
    }

    // Load roads and world data (may take longer if Overpass endpoints are slow).
    await appCtx.loadRoads();

    // Refresh terrain around final spawn/reference position after roads finish.
    if (typeof appCtx.updateTerrainAround === 'function' && appCtx.terrainEnabled && !appCtx.onMoon) {
      const postLoadRef = appCtx.Walk && appCtx.Walk.state && appCtx.Walk.state.mode === 'walk' && appCtx.Walk.state.walker ?
      appCtx.Walk.state.walker : appCtx.car;

      appCtx.updateTerrainAround(postLoadRef.x || 0, postLoadRef.z || 0);
    }

    // Start in WALKING mode with third-person camera
    if (appCtx.Walk) {
      appCtx.Walk.setModeWalk();
      appCtx.Walk.state.view = 'third'; // Ensure third-person view
      if (appCtx.carMesh) appCtx.carMesh.visible = false;
      if (appCtx.Walk.state.characterMesh) appCtx.Walk.state.characterMesh.visible = true;

      // Force initial camera to third-person position behind character
      // Without this, camera starts at origin and looks like first person
      const w = appCtx.Walk.state.walker;
      const back = appCtx.Walk.CFG.thirdPersonDist;
      const up = appCtx.Walk.CFG.thirdPersonHeight;
      appCtx.camera.position.set(
        w.x - Math.sin(w.yaw) * back,
        w.y + up,
        w.z - Math.cos(w.yaw) * back
      );
      appCtx.camera.lookAt(w.x, w.y, w.z);

      // Update UI button states to reflect walking mode
      document.getElementById('fDriving').classList.remove('on');
      document.getElementById('fWalk').classList.add('on');
      document.getElementById('fDrone').classList.remove('on');
    } else {
      // Fallback to driving if Walk module not available
      if (appCtx.carMesh) appCtx.carMesh.visible = true;
      document.getElementById('fDriving').classList.add('on');
      document.getElementById('fWalk').classList.remove('on');
      document.getElementById('fDrone').classList.remove('on');
    }
    if (typeof appCtx.setBuildModeEnabled === 'function') {
      appCtx.setBuildModeEnabled(false);
    }
    updateControlsModeUI();
    applySharedRuntimeState();

    // Set initial map view button states
    document.getElementById('mapRoadsToggle').classList.add('active'); // Roads on by default
    // Land use OFF by default (user can toggle on if needed)
    document.getElementById('fLandUse').classList.remove('on');
    document.getElementById('fLandUseRE').classList.remove('on');
    // Reset default loading theme for normal in-game loading after start.
    appCtx.loadingScreenMode = 'earth';

    // Optional launch-mode shortcuts from title selector.
    if (launchMode === 'moon' && !appCtx.onMoon && !appCtx.travelingToMoon) {
      appCtx.directTravelToMoon();
    } else if (launchMode === 'space' && !appCtx.onMoon && !appCtx.travelingToMoon) {
      appCtx.travelToMoon();
    }
  });

  // Helper function to close all float menus
  function closeAllFloatMenus() {
    document.querySelectorAll('.floatMenu').forEach((m) => m.classList.remove('open'));
  }
  const ctrlHeader = document.getElementById('ctrlHeader');
  const ctrlContent = document.getElementById('ctrlContent');
  const drivingControls = document.getElementById('drivingControls');
  const walkingControls = document.getElementById('walkingControls');
  const droneControls = document.getElementById('droneControls');
  const rocketControls = document.getElementById('rocketControls');

  function detectControlsMode() {
    if (typeof appCtx.isEnv === 'function' && typeof appCtx.ENV !== 'undefined' && appCtx.isEnv(appCtx.ENV.SPACE_FLIGHT)) return 'rocket';
    if (appCtx.droneMode) return 'drone';
    if (appCtx.Walk && appCtx.Walk.state && appCtx.Walk.state.mode === 'walk') return 'walking';
    return 'driving';
  }

  function updateControlsModeUI() {
    const mode = detectControlsMode();
    if (drivingControls) drivingControls.style.display = mode === 'driving' ? 'block' : 'none';
    if (walkingControls) walkingControls.style.display = mode === 'walking' ? 'block' : 'none';
    if (droneControls) droneControls.style.display = mode === 'drone' ? 'block' : 'none';
    if (rocketControls) rocketControls.style.display = mode === 'rocket' ? 'block' : 'none';
    if (ctrlHeader) {
      const modeLabel = mode === 'walking' ? 'Walking' : mode === 'drone' ? 'Drone' : mode === 'rocket' ? 'Rocket' : 'Driving';
      const arrow = ctrlContent && ctrlContent.classList.contains('hidden') ? '▼' : '▲';
      ctrlHeader.textContent = `🛞 ${modeLabel} ${arrow}`;
    }
  }

  appCtx.updateControlsModeUI = updateControlsModeUI;
  function goToMainMenu() {
    appCtx.gameStarted = false;appCtx.paused = false;appCtx.clearObjectives();appCtx.clearPolice();appCtx.policeOn = false;appCtx.eraseTrack();appCtx.closePropertyPanel();appCtx.closeHistoricPanel();appCtx.clearPropertyMarkers();appCtx.realEstateMode = false;appCtx.historicMode = false;
    if (typeof appCtx.setBuildModeEnabled === 'function') appCtx.setBuildModeEnabled(false);
    document.querySelectorAll('.floatMenu').forEach((m) => m.classList.remove('open'));
    document.getElementById('titleScreen').classList.remove('hidden');
    ['hud', 'minimap', 'modeHud', 'police', 'floatMenuContainer', 'mainMenuBtn', 'pauseScreen', 'resultScreen', 'caughtScreen', 'controlsTab', 'coords', 'realEstateBtn', 'historicBtn', 'memoryFlowerFloatBtn'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('show');
    });
    if (ctrlContent) ctrlContent.classList.add('hidden');
    if (typeof appCtx.closeMemoryComposer === 'function') appCtx.closeMemoryComposer();
    const memoryInfoPanel = document.getElementById('memoryInfoPanel');
    if (memoryInfoPanel) memoryInfoPanel.classList.remove('show');
    updateControlsModeUI();
    if (typeof appCtx.updatePerfPanel === 'function') appCtx.updatePerfPanel(true);
  }

  // Float menu
  // Three separate float menu buttons
  document.getElementById('travelBtn').addEventListener('click', () => {
    const menu = document.getElementById('travelMenu');
    const isOpen = menu.classList.contains('open');
    // Close all menus
    document.querySelectorAll('.floatMenu').forEach((m) => m.classList.remove('open'));
    // Toggle this menu
    if (!isOpen) menu.classList.add('open');
  });
  document.getElementById('realEstateFloatBtn').addEventListener('click', () => {
    const menu = document.getElementById('realEstateMenu');
    const isOpen = menu.classList.contains('open');
    document.querySelectorAll('.floatMenu').forEach((m) => m.classList.remove('open'));
    if (!isOpen) menu.classList.add('open');
  });
  document.getElementById('exploreBtn').addEventListener('click', () => {
    const menu = document.getElementById('exploreMenu');
    const isOpen = menu.classList.contains('open');
    document.querySelectorAll('.floatMenu').forEach((m) => m.classList.remove('open'));
    if (!isOpen) menu.classList.add('open');
  });
  document.getElementById('gameBtn').addEventListener('click', () => {
    const menu = document.getElementById('gameMenu');
    const isOpen = menu.classList.contains('open');
    document.querySelectorAll('.floatMenu').forEach((m) => m.classList.remove('open'));
    if (!isOpen) menu.classList.add('open');
  });

  const homeMenuItem = document.getElementById('fHome');
  if (homeMenuItem) homeMenuItem.addEventListener('click', goToMainMenu);
  document.getElementById('fNextCity').addEventListener('click', () => {appCtx.nextCity();closeAllFloatMenus();});
  const memoryFlowerFloatBtn = document.getElementById('memoryFlowerFloatBtn');
  if (memoryFlowerFloatBtn) {
    memoryFlowerFloatBtn.addEventListener('click', () => {
      if (typeof appCtx.openMemoryComposer === 'function') appCtx.openMemoryComposer('flower');
      closeAllFloatMenus();
    });
  }
  document.getElementById('fSatellite').addEventListener('click', () => {
    appCtx.satelliteView = !appCtx.satelliteView;
    document.getElementById('fSatellite').classList.toggle('on', appCtx.satelliteView);
    document.getElementById('mapSatelliteToggle').classList.toggle('active', appCtx.satelliteView);
    closeAllFloatMenus();
  });
  document.getElementById('fRoads').addEventListener('click', () => {
    appCtx.showRoads = !appCtx.showRoads;
    document.getElementById('fRoads').classList.toggle('on', appCtx.showRoads);
    document.getElementById('mapRoadsToggle').classList.toggle('active', appCtx.showRoads);
    closeAllFloatMenus();
  });
  document.getElementById('fLandUse').addEventListener('click', () => {
    appCtx.landUseVisible = !appCtx.landUseVisible;
    document.getElementById('fLandUse').classList.toggle('on', appCtx.landUseVisible);
    document.getElementById('fLandUseRE').classList.toggle('on', appCtx.landUseVisible);
    // Keep water features visible even when general land-use overlay is off.
    appCtx.landuseMeshes.forEach((m) => {
      const alwaysVisible = !!(m && m.userData && m.userData.alwaysVisible);
      m.visible = appCtx.landUseVisible || alwaysVisible;
    });
    closeAllFloatMenus();
  });
  document.getElementById('fLandUseRE').addEventListener('click', () => {
    appCtx.landUseVisible = !appCtx.landUseVisible;
    document.getElementById('fLandUse').classList.toggle('on', appCtx.landUseVisible);
    document.getElementById('fLandUseRE').classList.toggle('on', appCtx.landUseVisible);
    // Keep water features visible even when general land-use overlay is off.
    appCtx.landuseMeshes.forEach((m) => {
      const alwaysVisible = !!(m && m.userData && m.userData.alwaysVisible);
      m.visible = appCtx.landUseVisible || alwaysVisible;
    });
    closeAllFloatMenus();
  });
  document.getElementById('fTimeOfDay').addEventListener('click', () => {appCtx.cycleTimeOfDay();});
  document.getElementById('fPolice').addEventListener('click', () => {
    appCtx.policeOn = !appCtx.policeOn;
    document.getElementById('fPolice').classList.toggle('on', appCtx.policeOn);
    document.getElementById('police').classList.toggle('show', appCtx.policeOn);
    if (appCtx.policeOn) appCtx.spawnPolice();else appCtx.clearPolice();
    closeAllFloatMenus();
  });
  const buildModeItem = document.getElementById('fBlockBuild');
  if (buildModeItem) {
    buildModeItem.addEventListener('click', () => {
      if (typeof appCtx.toggleBlockBuildMode === 'function') appCtx.toggleBlockBuildMode();
      closeAllFloatMenus();
    });
  }
  const clearBlocksItem = document.getElementById('fClearBlocks');
  if (clearBlocksItem) {
    clearBlocksItem.addEventListener('click', () => {
      if (typeof appCtx.clearAllBuildBlocks === 'function') {
        const confirmed = globalThis.confirm('Clear all placed build blocks for this location? This also removes saved blocks from browser storage.');
        if (confirmed) appCtx.clearAllBuildBlocks();
      }
      closeAllFloatMenus();
    });
  }
  // Travel mode switchers - mutually exclusive
  document.getElementById('fDriving').addEventListener('click', () => {
    // Switch to driving mode
    appCtx.droneMode = false;
    if (appCtx.Walk) {
      appCtx.Walk.setModeDrive();
    }
    if (typeof appCtx.camMode !== 'undefined') appCtx.camMode = 0;
    if (appCtx.carMesh) appCtx.carMesh.visible = true;

    // Clear star selection
    appCtx.clearStarSelection();

    // Update button states
    document.getElementById('fDriving').classList.add('on');
    document.getElementById('fWalk').classList.remove('on');
    document.getElementById('fDrone').classList.remove('on');
    updateControlsModeUI();
    closeAllFloatMenus();
  });

  document.getElementById('fWalk').addEventListener('click', () => {
    // Switch to walking mode
    appCtx.droneMode = false;
    if (appCtx.Walk) {
      if (appCtx.Walk.state.mode !== 'walk') {
        appCtx.Walk.toggleWalk();
      }

      // Clear star selection
      appCtx.clearStarSelection();

      // Update button states
      document.getElementById('fDriving').classList.remove('on');
      document.getElementById('fWalk').classList.add('on');
      document.getElementById('fDrone').classList.remove('on');
    }
    updateControlsModeUI();
    closeAllFloatMenus();
  });

  document.getElementById('fDrone').addEventListener('click', () => {
    // Switch to drone mode
    if (!appCtx.droneMode) {
      appCtx.droneMode = true;

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

    // Clear star selection
    appCtx.clearStarSelection();

    // Update button states
    document.getElementById('fDriving').classList.remove('on');
    document.getElementById('fWalk').classList.remove('on');
    document.getElementById('fDrone').classList.add('on');
    updateControlsModeUI();
    closeAllFloatMenus();
  });

  document.getElementById('fSpaceDirect').addEventListener('click', () => {
    if (appCtx.onMoon) {
      appCtx.returnToEarth();
    } else if (!appCtx.travelingToMoon) {
      appCtx.directTravelToMoon();
    }
    closeAllFloatMenus();
  });
  document.getElementById('fSpaceRocket').addEventListener('click', () => {
    if (appCtx.onMoon) {
      appCtx.returnToEarth();
    } else if (!appCtx.travelingToMoon) {
      appCtx.travelToMoon();
    }
    closeAllFloatMenus();
  });
  document.getElementById('fRealEstate').addEventListener('click', () => {
    appCtx.toggleRealEstate();
    document.getElementById('fRealEstate').classList.toggle('on', appCtx.realEstateMode);
    closeAllFloatMenus();
  });
  document.getElementById('fHistoric').addEventListener('click', () => {
    appCtx.toggleHistoric();
    document.getElementById('fHistoric').classList.toggle('on', appCtx.historicMode);
    closeAllFloatMenus();
  });
  document.getElementById('fPOI').addEventListener('click', () => {
    appCtx.poiMode = !appCtx.poiMode;
    document.getElementById('fPOI').classList.toggle('on', appCtx.poiMode);
    appCtx.poiMeshes.forEach((m) => {
      if (m) m.visible = !!appCtx.poiMode;
    });
    if (!appCtx.poiMode) {
      const poiInfo = document.getElementById('poiInfo');
      if (poiInfo) poiInfo.style.display = 'none';
    }
    closeAllFloatMenus();
  });
  document.getElementById('fRespawn').addEventListener('click', () => {appCtx.spawnOnRoad();closeAllFloatMenus();});
  document.getElementById('fRespawnRand').addEventListener('click', () => {
    if (appCtx.roads.length > 0) {
      const rd = appCtx.roads[Math.floor(Math.random() * appCtx.roads.length)];
      const idx = Math.floor(Math.random() * rd.pts.length);
      appCtx.car.x = rd.pts[idx].x;appCtx.car.z = rd.pts[idx].z;
      if (idx < rd.pts.length - 1) appCtx.car.angle = Math.atan2(rd.pts[idx + 1].x - rd.pts[idx].x, rd.pts[idx + 1].z - rd.pts[idx].z);
      appCtx.car.speed = 0;appCtx.car.vx = 0;appCtx.car.vz = 0;
      const _respawnH = typeof appCtx.terrainMeshHeightAt === 'function' ? appCtx.terrainMeshHeightAt : appCtx.elevationWorldYAtWorldXZ;
      const spawnY = typeof appCtx.GroundHeight !== 'undefined' && appCtx.GroundHeight && typeof appCtx.GroundHeight.carCenterY === 'function' ?
      appCtx.GroundHeight.carCenterY(appCtx.car.x, appCtx.car.z, true, 1.2) :
      _respawnH(appCtx.car.x, appCtx.car.z) + 1.2;
      appCtx.car.y = spawnY;
      appCtx.carMesh.position.set(appCtx.car.x, spawnY, appCtx.car.z);appCtx.carMesh.rotation.y = appCtx.car.angle;
      if (appCtx.Walk && appCtx.Walk.state && appCtx.Walk.state.walker) {
        const groundY = spawnY - 1.2;
        appCtx.Walk.state.walker.x = appCtx.car.x;
        appCtx.Walk.state.walker.z = appCtx.car.z;
        appCtx.Walk.state.walker.y = groundY + 1.7;
        appCtx.Walk.state.walker.vy = 0;
        appCtx.Walk.state.walker.angle = appCtx.car.angle;
        appCtx.Walk.state.walker.yaw = appCtx.car.angle;
        if (appCtx.Walk.state.characterMesh && appCtx.Walk.state.mode === 'walk') {
          appCtx.Walk.state.characterMesh.position.set(appCtx.car.x, groundY, appCtx.car.z);
          appCtx.Walk.state.characterMesh.rotation.y = appCtx.car.angle;
        }
      }
    }
    closeAllFloatMenus();
  });
  document.getElementById('fTrack').addEventListener('click', () => {appCtx.toggleTrackRecording();closeAllFloatMenus();});
  document.getElementById('fEraseTrack').addEventListener('click', () => {appCtx.eraseTrack();closeAllFloatMenus();});
  document.getElementById('fClouds').addEventListener('click', () => {
    appCtx.cloudsVisible = !appCtx.cloudsVisible;
    if (appCtx.cloudGroup) appCtx.cloudGroup.visible = appCtx.cloudsVisible;
    document.getElementById('fClouds').classList.toggle('on', !appCtx.cloudsVisible);
    closeAllFloatMenus();
  });
  document.getElementById('fConstellations').addEventListener('click', () => {
    appCtx.constellationsVisible = !appCtx.constellationsVisible;
    if (appCtx.allConstellationLines) appCtx.allConstellationLines.visible = appCtx.constellationsVisible;
    document.getElementById('fConstellations').classList.toggle('on', appCtx.constellationsVisible);
    closeAllFloatMenus();
  });
  if (ctrlHeader && ctrlContent) {
    ctrlHeader.addEventListener('click', (e) => {
      e.stopPropagation();
      ctrlContent.classList.toggle('hidden');
      updateControlsModeUI();
    });
  }

  // Main Menu Button
  document.getElementById('mainMenuBtn').addEventListener('click', () => {
    goToMainMenu();
  });

  // Close float menus when clicking outside
  document.addEventListener('click', (e) => {
    if (!appCtx.gameStarted) return;

    // Check if click is outside float menu container
    const floatContainer = document.getElementById('floatMenuContainer');
    const mainMenuBtn = document.getElementById('mainMenuBtn');
    const controlsTab = document.getElementById('controlsTab');

    if (!floatContainer.contains(e.target) && e.target !== mainMenuBtn) {
      closeAllFloatMenus();
    }
    if (controlsTab && !controlsTab.contains(e.target) && ctrlContent) {
      ctrlContent.classList.add('hidden');
      updateControlsModeUI();
    }
  });

  document.getElementById('resumeBtn').addEventListener('click', () => {appCtx.paused = false;document.getElementById('pauseScreen').classList.remove('show');});
  document.getElementById('restartBtn').addEventListener('click', () => {appCtx.paused = false;document.getElementById('pauseScreen').classList.remove('show');appCtx.startMode();});
  document.getElementById('menuBtn').addEventListener('click', () => goToMainMenu());
  document.getElementById('caughtBtn').addEventListener('click', () => {document.getElementById('caughtScreen').classList.remove('show');appCtx.policeHits = 0;appCtx.paused = false;document.getElementById('police').textContent = '💔 0/3';appCtx.spawnOnRoad();});
  document.getElementById('againBtn').addEventListener('click', () => {appCtx.hideResult();appCtx.paused = false;appCtx.startMode();});
  document.getElementById('freeBtn').addEventListener('click', () => {appCtx.hideResult();appCtx.paused = false;appCtx.gameMode = 'free';appCtx.clearObjectives();});
  document.getElementById('resMenuBtn').addEventListener('click', () => {appCtx.hideResult();goToMainMenu();});

  // Map controls
  document.getElementById('minimap').addEventListener('click', () => {
    appCtx.showLargeMap = true;
    document.getElementById('largeMap').classList.add('show');
  });
  document.getElementById('minimap').addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const rect = e.target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const worldPos = appCtx.minimapScreenToWorld(x, y);
    appCtx.teleportToLocation(worldPos.x, worldPos.z);
  });
  document.getElementById('mapClose').addEventListener('click', () => {
    appCtx.showLargeMap = false;
    document.getElementById('largeMap').classList.remove('show');
  });
  document.getElementById('mapLegend').addEventListener('click', (e) => {
    e.stopPropagation();
    const legend = document.getElementById('legendPanel');
    legend.style.display = legend.style.display === 'none' ? 'block' : 'none';
  });
  document.getElementById('largeMap').addEventListener('click', (e) => {
    if (e.target.id === 'largeMap') {
      appCtx.showLargeMap = false;
      document.getElementById('largeMap').classList.remove('show');
    }
  });
  document.getElementById('mapSatelliteToggle').addEventListener('click', (e) => {
    e.stopPropagation();
    appCtx.satelliteView = !appCtx.satelliteView;
    document.getElementById('mapSatelliteToggle').classList.toggle('active', appCtx.satelliteView);
    document.getElementById('fSatellite').classList.toggle('on', appCtx.satelliteView);
  });
  document.getElementById('mapRoadsToggle').addEventListener('click', (e) => {
    e.stopPropagation();
    appCtx.showRoads = !appCtx.showRoads;
    document.getElementById('mapRoadsToggle').classList.toggle('active', appCtx.showRoads);
    document.getElementById('fRoads').classList.toggle('on', appCtx.showRoads);
  });
  document.getElementById('mapZoomIn').addEventListener('click', (e) => {
    e.stopPropagation();
    if (appCtx.largeMapZoom < 18) {
      appCtx.largeMapZoom++;
      document.getElementById('zoomLevel').textContent = 'Z: ' + appCtx.largeMapZoom;
    }
  });
  document.getElementById('mapZoomOut').addEventListener('click', (e) => {
    e.stopPropagation();
    if (appCtx.largeMapZoom > 10) {
      appCtx.largeMapZoom--;
      document.getElementById('zoomLevel').textContent = 'Z: ' + appCtx.largeMapZoom;
    }
  });

  const legendCloseBtn = document.getElementById('legendCloseBtn');
  if (legendCloseBtn) {
    legendCloseBtn.addEventListener('click', () => appCtx.closeLegend());
  }
  const legendShowAllBtn = document.getElementById('legendShowAllBtn');
  if (legendShowAllBtn) {
    legendShowAllBtn.addEventListener('click', () => appCtx.toggleAllLayers(true));
  }
  const legendHideAllBtn = document.getElementById('legendHideAllBtn');
  if (legendHideAllBtn) {
    legendHideAllBtn.addEventListener('click', () => appCtx.toggleAllLayers(false));
  }
  const mapInfoCloseBtn = document.getElementById('mapInfoCloseBtn');
  if (mapInfoCloseBtn) {
    mapInfoCloseBtn.addEventListener('click', () => appCtx.closeMapInfo());
  }
  const closePropertyPanelBtn = document.getElementById('closePropertyPanelBtn');
  if (closePropertyPanelBtn) {
    closePropertyPanelBtn.addEventListener('click', () => appCtx.closePropertyPanel());
  }
  const propertyFiltersToggle = document.getElementById('propertyFiltersToggle');
  if (propertyFiltersToggle) {
    propertyFiltersToggle.addEventListener('click', () => appCtx.togglePropertyFilters());
  }
  const closeHistoricPanelBtn = document.getElementById('closeHistoricPanelBtn');
  if (closeHistoricPanelBtn) {
    closeHistoricPanelBtn.addEventListener('click', () => appCtx.closeHistoricPanel());
  }
  const closeModalBtn = document.getElementById('closeModalBtn');
  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', () => appCtx.closeModal());
  }

  const legendPanel = document.getElementById('legendPanel');
  if (legendPanel) {
    legendPanel.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (!target.id || !target.id.startsWith('filter')) return;

      if (target.id === 'filterPOIsAll') {
        appCtx.toggleAllPOIs();
        return;
      }
      if (target.id === 'filterGameElementsAll') {
        appCtx.toggleAllGameElements();
        return;
      }
      if (target.id === 'filterRoads') {
        appCtx.toggleRoads();
        return;
      }
      appCtx.updateMapLayers();
    });
  }
}

// Entry point - initialize the application
Object.assign(appCtx, { setupUI });

export { setupUI };
