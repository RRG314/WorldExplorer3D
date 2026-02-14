import { ctx } from "./shared-context.js?v=52"; // ============================================================================
// ui.js - UI setup, event binding, button handlers
// ============================================================================

function setupUI() {
  // Initialize Property UI References
  ctx.PropertyUI.panel = document.getElementById('propertyPanel');
  ctx.PropertyUI.list = document.getElementById('propertyList');
  ctx.PropertyUI.modal = document.getElementById('propertyModal');
  ctx.PropertyUI.modalTitle = document.getElementById('modalTitle');
  ctx.PropertyUI.modalBody = document.getElementById('modalBody');
  ctx.PropertyUI.button = document.getElementById('realEstateBtn');

  // Real Estate Button
  if (ctx.PropertyUI.button) {
    ctx.PropertyUI.button.addEventListener('click', ctx.toggleRealEstate);
  }

  // Historic Sites Button
  const historicBtn = document.getElementById('historicBtn');
  if (historicBtn) {
    historicBtn.addEventListener('click', ctx.toggleHistoric);
  }
  if (typeof ctx.setupMemoryUI === 'function') {
    ctx.setupMemoryUI();
  }

  // Property Controls
  const radiusSlider = document.getElementById('radiusSlider');
  const radiusValue = document.getElementById('radiusValue');
  const sortSelect = document.getElementById('sortSelect');
  const refreshBtn = document.getElementById('refreshProperties');
  const clearFilterBtn = document.getElementById('clearPropertyFilter');

  if (radiusSlider && radiusValue) {
    radiusSlider.addEventListener('input', (e) => {
      ctx.propertyRadius = parseFloat(e.target.value);
      radiusValue.textContent = ctx.propertyRadius.toFixed(1) + ' km';
      if (ctx.realEstateMode) ctx.updatePropertyPanel();
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      ctx.propertySort = e.target.value;
      if (ctx.realEstateMode) ctx.updatePropertyPanel();
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      if (ctx.realEstateMode) ctx.loadPropertiesAtCurrentLocation();
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

      ctx.propertyTypeFilter = btn.dataset.type;

      // Update the panel
      if (ctx.realEstateMode) ctx.updatePropertyPanel();
    });
  });

  if (clearFilterBtn) {
    clearFilterBtn.addEventListener('click', ctx.clearNavigation);
  }

  // Large Map Canvas Click Detection
  const largeMapCanvas = document.getElementById('largeMapCanvas');
  if (largeMapCanvas) {
    largeMapCanvas.addEventListener('click', (e) => {
      if (!ctx.showLargeMap) return;

      const rect = largeMapCanvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      // Check if click is on a property marker
      if (ctx.mapLayers.properties && ctx.realEstateMode) {
        for (const prop of ctx.properties) {
          const screenPos = ctx.worldToScreenLarge(prop.x, prop.z);
          const dist = Math.sqrt((clickX - screenPos.x) ** 2 + (clickY - screenPos.y) ** 2);
          if (dist < 10) {
            ctx.showMapInfo('property', prop);
            return;
          }
        }
      }

      // Check if click is on a POI marker (based on legend layer filters)
      if (ctx.pois.length > 0) {
        for (const poi of ctx.pois) {
          if (!ctx.isPOIVisible(poi.type)) continue;
          const screenPos = ctx.worldToScreenLarge(poi.x, poi.z);
          const dist = Math.sqrt((clickX - screenPos.x) ** 2 + (clickY - screenPos.y) ** 2);
          if (dist < 8) {
            ctx.showMapInfo('poi', poi);
            return;
          }
        }
      }

      // Check if click is on a historic site
      if (ctx.mapLayers.historic && ctx.historicSites.length > 0) {
        for (const site of ctx.historicSites) {
          const screenPos = ctx.worldToScreenLarge(site.x, site.z);
          const dist = Math.sqrt((clickX - screenPos.x) ** 2 + (clickY - screenPos.y) ** 2);
          if (dist < 8) {
            ctx.showMapInfo('historic', site);
            return;
          }
        }
      }
    });

    largeMapCanvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!ctx.showLargeMap) return;

      const rect = largeMapCanvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      const worldPos = ctx.largeMapScreenToWorld(clickX, clickY);
      ctx.teleportToLocation(worldPos.x, worldPos.z);
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

  // Load saved API keys from localStorage
  const savedRentcast = localStorage.getItem('rentcastApiKey');
  const savedAttom = localStorage.getItem('attomApiKey');
  const savedEstated = localStorage.getItem('estatedApiKey');

  if (savedRentcast) {
    ctx.apiConfig.rentcast = savedRentcast;
    if (rentcastKeyInput) rentcastKeyInput.value = savedRentcast;
  }
  if (savedAttom) {
    ctx.apiConfig.attom = savedAttom;
    if (attomKeyInput) attomKeyInput.value = savedAttom;
  }
  if (savedEstated) {
    ctx.apiConfig.estated = savedEstated;
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
          ctx.apiConfig.estated = key;
          localStorage.setItem('estatedApiKey', key);
          savedCount++;
        } else {
          ctx.apiConfig.estated = null;
          localStorage.removeItem('estatedApiKey');
        }
      }

      // Save ATTOM
      if (attomKeyInput) {
        const key = attomKeyInput.value.trim();
        if (key) {
          ctx.apiConfig.attom = key;
          localStorage.setItem('attomApiKey', key);
          savedCount++;
        } else {
          ctx.apiConfig.attom = null;
          localStorage.removeItem('attomApiKey');
        }
      }

      // Save RentCast
      if (rentcastKeyInput) {
        const key = rentcastKeyInput.value.trim();
        if (key) {
          ctx.apiConfig.rentcast = key;
          localStorage.setItem('rentcastApiKey', key);
          savedCount++;
        } else {
          ctx.apiConfig.rentcast = null;
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
    const currentMode = typeof ctx.getPerfMode === 'function' ? ctx.getPerfMode() : ctx.perfMode || 'rdt';
    perfModeSelect.value = currentMode === 'baseline' ? 'baseline' : 'rdt';
  }
  if (perfOverlayToggle) {
    const overlayEnabled = typeof ctx.getPerfOverlayEnabled === 'function' ?
    ctx.getPerfOverlayEnabled() :
    !!ctx.perfOverlayEnabled;
    perfOverlayToggle.checked = overlayEnabled;
  }

  if (perfModeSelect) {
    perfModeSelect.addEventListener('change', (e) => {
      const selectedMode = e.target.value === 'baseline' ? 'baseline' : 'rdt';
      if (typeof ctx.setPerfMode === 'function') ctx.setPerfMode(selectedMode);
      if (perfSettingsStatus) {
        perfSettingsStatus.textContent = selectedMode === 'baseline' ?
        'Baseline selected. Use Apply + Reload World to rebuild with baseline budgets.' :
        'RDT selected. Use Apply + Reload World to rebuild with adaptive budgets.';
      }
      if (typeof ctx.updatePerfPanel === 'function') ctx.updatePerfPanel(true);
    });
  }

  if (perfOverlayToggle) {
    perfOverlayToggle.addEventListener('change', (e) => {
      const enabled = !!e.target.checked;
      if (typeof ctx.setPerfOverlayEnabled === 'function') ctx.setPerfOverlayEnabled(enabled);
      if (perfSettingsStatus) {
        perfSettingsStatus.textContent = enabled ?
        'Live overlay enabled. Benchmark values will be shown during gameplay.' :
        'Live overlay disabled.';
      }
      if (typeof ctx.updatePerfPanel === 'function') ctx.updatePerfPanel(true);
    });
  }

  if (perfApplyReload) {
    perfApplyReload.addEventListener('click', async () => {
      const selectedMode = perfModeSelect?.value === 'baseline' ? 'baseline' : 'rdt';
      if (typeof ctx.setPerfMode === 'function') ctx.setPerfMode(selectedMode);

      if (perfSettingsStatus) {
        perfSettingsStatus.textContent = ctx.gameStarted ?
        `Applying ${selectedMode.toUpperCase()} mode and reloading world...` :
        `Saved ${selectedMode.toUpperCase()} mode. It will apply when you start.`;
      }

      if (ctx.gameStarted && typeof ctx.loadRoads === 'function') {
        await ctx.loadRoads();
        if (perfSettingsStatus) {
          perfSettingsStatus.textContent = `${selectedMode.toUpperCase()} mode applied and world reloaded.`;
        }
      }
      if (typeof ctx.updatePerfPanel === 'function') ctx.updatePerfPanel(true);
    });
  }

  if (perfCopySnapshot) {
    perfCopySnapshot.addEventListener('click', async () => {
      try {
        if (typeof ctx.copyPerfSnapshotToClipboard !== 'function') {
          throw new Error('Snapshot exporter unavailable');
        }
        await ctx.copyPerfSnapshotToClipboard();
        if (perfSettingsStatus) perfSettingsStatus.textContent = 'Benchmark snapshot copied to clipboard.';
      } catch (err) {
        if (perfSettingsStatus) {
          perfSettingsStatus.textContent = `Unable to copy snapshot: ${err?.message || err}`;
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
    ctx.loadingScreenMode = nextMode;
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
      ctx.selLoc = 'custom';
      if (customPanel) customPanel.classList.add('show');
      return;
    }

    const selectedSuggested = document.querySelector('.loc.sel:not([data-loc="custom"])') ||
    document.querySelector('.loc[data-loc="baltimore"]');
    if (selectedSuggested) {
      document.querySelectorAll('.loc').forEach((e) => e.classList.remove('sel'));
      selectedSuggested.classList.add('sel');
      ctx.selLoc = selectedSuggested.dataset.loc;
    }
    if (customPanel) customPanel.classList.remove('show');
  };

  document.querySelectorAll('.loc').forEach((el) => el.addEventListener('click', () => {
    document.querySelectorAll('.loc').forEach((e) => e.classList.remove('sel'));
    el.classList.add('sel');
    ctx.selLoc = el.dataset.loc;
    if (customPanel) customPanel.classList.toggle('show', ctx.selLoc === 'custom');
    if (ctx.selLoc === 'custom') {
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
  ctx.setTitleLocationMode = setTitleLocationMode;
  ctx.selectSuggestedLocationCard = (targetEl) => {
    if (!targetEl) return;
    const selectedLoc = targetEl.closest('.loc[data-loc]');
    if (!selectedLoc || selectedLoc.dataset.loc === 'custom') return;
    document.querySelectorAll('.loc').forEach((e) => e.classList.remove('sel'));
    selectedLoc.classList.add('sel');
    ctx.selLoc = selectedLoc.dataset.loc;
    if (customPanel) customPanel.classList.remove('show');
    setLaunchMode('earth');
  };

  // Initial panel state.
  setTitleLocationMode(ctx.selLoc === 'custom' ? 'custom' : 'suggested');

  // Custom location search - universal search for any location
  document.getElementById('locationSearchBtn').addEventListener('click', ctx.searchLocation);
  document.getElementById('locationSearch').addEventListener('keypress', (e) => {if (e.key === 'Enter') ctx.searchLocation();});
  // Game modes
  document.querySelectorAll('.mode').forEach((el) => el.addEventListener('click', () => {
    document.querySelectorAll('.mode').forEach((e) => e.classList.remove('sel'));
    el.classList.add('sel');
    ctx.gameMode = el.dataset.mode;
  }));
  // Start
  document.getElementById('startBtn').addEventListener('click', async () => {
    const launchMode = titleLaunchMode;
    ctx.loadingScreenMode = launchMode === 'moon' ? 'moon' : launchMode === 'space' ? 'space' : 'earth';
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
    ctx.gameStarted = true;
    if (typeof ctx.updatePerfPanel === 'function') ctx.updatePerfPanel(true);
    ctx.switchEnv(ctx.ENV.EARTH);

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
    if (typeof ctx.updateTerrainAround === 'function' && ctx.terrainEnabled && !ctx.onMoon) {
      const startRef = ctx.Walk && ctx.Walk.state && ctx.Walk.state.walker ?
      ctx.Walk.state.walker : ctx.car;

      ctx.updateTerrainAround(startRef.x || 0, startRef.z || 0);
    }

    // Load roads and world data (may take longer if Overpass endpoints are slow).
    await ctx.loadRoads();

    // Refresh terrain around final spawn/reference position after roads finish.
    if (typeof ctx.updateTerrainAround === 'function' && ctx.terrainEnabled && !ctx.onMoon) {
      const postLoadRef = ctx.Walk && ctx.Walk.state && ctx.Walk.state.mode === 'walk' && ctx.Walk.state.walker ?
      ctx.Walk.state.walker : ctx.car;

      ctx.updateTerrainAround(postLoadRef.x || 0, postLoadRef.z || 0);
    }

    // Start in WALKING mode with third-person camera
    if (ctx.Walk) {
      ctx.Walk.setModeWalk();
      ctx.Walk.state.view = 'third'; // Ensure third-person view
      if (ctx.carMesh) ctx.carMesh.visible = false;
      if (ctx.Walk.state.characterMesh) ctx.Walk.state.characterMesh.visible = true;

      // Force initial camera to third-person position behind character
      // Without this, camera starts at origin and looks like first person
      const w = ctx.Walk.state.walker;
      const back = ctx.Walk.CFG.thirdPersonDist;
      const up = ctx.Walk.CFG.thirdPersonHeight;
      ctx.camera.position.set(
        w.x - Math.sin(w.yaw) * back,
        w.y + up,
        w.z - Math.cos(w.yaw) * back
      );
      ctx.camera.lookAt(w.x, w.y, w.z);

      // Update UI button states to reflect walking mode
      document.getElementById('fDriving').classList.remove('on');
      document.getElementById('fWalk').classList.add('on');
      document.getElementById('fDrone').classList.remove('on');
    } else {
      // Fallback to driving if Walk module not available
      if (ctx.carMesh) ctx.carMesh.visible = true;
      document.getElementById('fDriving').classList.add('on');
      document.getElementById('fWalk').classList.remove('on');
      document.getElementById('fDrone').classList.remove('on');
    }
    if (typeof ctx.setBuildModeEnabled === 'function') {
      ctx.setBuildModeEnabled(false);
    }
    updateControlsModeUI();

    // Set initial map view button states
    document.getElementById('mapRoadsToggle').classList.add('active'); // Roads on by default
    // Land use OFF by default (user can toggle on if needed)
    document.getElementById('fLandUse').classList.remove('on');
    document.getElementById('fLandUseRE').classList.remove('on');
    // Reset default loading theme for normal in-game loading after start.
    ctx.loadingScreenMode = 'earth';

    // Optional launch-mode shortcuts from title selector.
    if (launchMode === 'moon' && !ctx.onMoon && !ctx.travelingToMoon) {
      ctx.directTravelToMoon();
    } else if (launchMode === 'space' && !ctx.onMoon && !ctx.travelingToMoon) {
      ctx.travelToMoon();
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
    if (typeof ctx.isEnv === 'function' && typeof ctx.ENV !== 'undefined' && ctx.isEnv(ctx.ENV.SPACE_FLIGHT)) return 'rocket';
    if (ctx.droneMode) return 'drone';
    if (ctx.Walk && ctx.Walk.state && ctx.Walk.state.mode === 'walk') return 'walking';
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

  ctx.updateControlsModeUI = updateControlsModeUI;
  function goToMainMenu() {
    ctx.gameStarted = false;ctx.paused = false;ctx.clearObjectives();ctx.clearPolice();ctx.policeOn = false;ctx.eraseTrack();ctx.closePropertyPanel();ctx.closeHistoricPanel();ctx.clearPropertyMarkers();ctx.realEstateMode = false;ctx.historicMode = false;
    if (typeof ctx.setBuildModeEnabled === 'function') ctx.setBuildModeEnabled(false);
    document.querySelectorAll('.floatMenu').forEach((m) => m.classList.remove('open'));
    document.getElementById('titleScreen').classList.remove('hidden');
    ['hud', 'minimap', 'modeHud', 'police', 'floatMenuContainer', 'mainMenuBtn', 'pauseScreen', 'resultScreen', 'caughtScreen', 'controlsTab', 'coords', 'realEstateBtn', 'historicBtn', 'memoryFlowerFloatBtn'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('show');
    });
    if (ctrlContent) ctrlContent.classList.add('hidden');
    if (typeof ctx.closeMemoryComposer === 'function') ctx.closeMemoryComposer();
    const memoryInfoPanel = document.getElementById('memoryInfoPanel');
    if (memoryInfoPanel) memoryInfoPanel.classList.remove('show');
    updateControlsModeUI();
    if (typeof ctx.updatePerfPanel === 'function') ctx.updatePerfPanel(true);
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
  document.getElementById('fNextCity').addEventListener('click', () => {ctx.nextCity();closeAllFloatMenus();});
  const memoryFlowerFloatBtn = document.getElementById('memoryFlowerFloatBtn');
  if (memoryFlowerFloatBtn) {
    memoryFlowerFloatBtn.addEventListener('click', () => {
      if (typeof ctx.openMemoryComposer === 'function') ctx.openMemoryComposer('flower');
      closeAllFloatMenus();
    });
  }
  document.getElementById('fSatellite').addEventListener('click', () => {
    ctx.satelliteView = !ctx.satelliteView;
    document.getElementById('fSatellite').classList.toggle('on', ctx.satelliteView);
    document.getElementById('mapSatelliteToggle').classList.toggle('active', ctx.satelliteView);
    closeAllFloatMenus();
  });
  document.getElementById('fRoads').addEventListener('click', () => {
    ctx.showRoads = !ctx.showRoads;
    document.getElementById('fRoads').classList.toggle('on', ctx.showRoads);
    document.getElementById('mapRoadsToggle').classList.toggle('active', ctx.showRoads);
    closeAllFloatMenus();
  });
  document.getElementById('fLandUse').addEventListener('click', () => {
    ctx.landUseVisible = !ctx.landUseVisible;
    document.getElementById('fLandUse').classList.toggle('on', ctx.landUseVisible);
    document.getElementById('fLandUseRE').classList.toggle('on', ctx.landUseVisible);
    // Keep water features visible even when general land-use overlay is off.
    ctx.landuseMeshes.forEach((m) => {
      const alwaysVisible = !!(m && m.userData && m.userData.alwaysVisible);
      m.visible = ctx.landUseVisible || alwaysVisible;
    });
    closeAllFloatMenus();
  });
  document.getElementById('fLandUseRE').addEventListener('click', () => {
    ctx.landUseVisible = !ctx.landUseVisible;
    document.getElementById('fLandUse').classList.toggle('on', ctx.landUseVisible);
    document.getElementById('fLandUseRE').classList.toggle('on', ctx.landUseVisible);
    // Keep water features visible even when general land-use overlay is off.
    ctx.landuseMeshes.forEach((m) => {
      const alwaysVisible = !!(m && m.userData && m.userData.alwaysVisible);
      m.visible = ctx.landUseVisible || alwaysVisible;
    });
    closeAllFloatMenus();
  });
  document.getElementById('fTimeOfDay').addEventListener('click', () => {ctx.cycleTimeOfDay();});
  document.getElementById('fPolice').addEventListener('click', () => {
    ctx.policeOn = !ctx.policeOn;
    document.getElementById('fPolice').classList.toggle('on', ctx.policeOn);
    document.getElementById('police').classList.toggle('show', ctx.policeOn);
    if (ctx.policeOn) ctx.spawnPolice();else ctx.clearPolice();
    closeAllFloatMenus();
  });
  const buildModeItem = document.getElementById('fBlockBuild');
  if (buildModeItem) {
    buildModeItem.addEventListener('click', () => {
      if (typeof ctx.toggleBlockBuildMode === 'function') ctx.toggleBlockBuildMode();
      closeAllFloatMenus();
    });
  }
  const clearBlocksItem = document.getElementById('fClearBlocks');
  if (clearBlocksItem) {
    clearBlocksItem.addEventListener('click', () => {
      if (typeof ctx.clearAllBuildBlocks === 'function') {
        const confirmed = globalThis.confirm('Clear all placed build blocks for this location? This also removes saved blocks from browser storage.');
        if (confirmed) ctx.clearAllBuildBlocks();
      }
      closeAllFloatMenus();
    });
  }
  // Travel mode switchers - mutually exclusive
  document.getElementById('fDriving').addEventListener('click', () => {
    // Switch to driving mode
    ctx.droneMode = false;
    if (ctx.Walk) {
      ctx.Walk.setModeDrive();
    }
    if (typeof ctx.camMode !== 'undefined') ctx.camMode = 0;
    if (ctx.carMesh) ctx.carMesh.visible = true;

    // Clear star selection
    ctx.clearStarSelection();

    // Update button states
    document.getElementById('fDriving').classList.add('on');
    document.getElementById('fWalk').classList.remove('on');
    document.getElementById('fDrone').classList.remove('on');
    updateControlsModeUI();
    closeAllFloatMenus();
  });

  document.getElementById('fWalk').addEventListener('click', () => {
    // Switch to walking mode
    ctx.droneMode = false;
    if (ctx.Walk) {
      if (ctx.Walk.state.mode !== 'walk') {
        ctx.Walk.toggleWalk();
      }

      // Clear star selection
      ctx.clearStarSelection();

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
    if (!ctx.droneMode) {
      ctx.droneMode = true;

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

    // Clear star selection
    ctx.clearStarSelection();

    // Update button states
    document.getElementById('fDriving').classList.remove('on');
    document.getElementById('fWalk').classList.remove('on');
    document.getElementById('fDrone').classList.add('on');
    updateControlsModeUI();
    closeAllFloatMenus();
  });

  document.getElementById('fSpaceDirect').addEventListener('click', () => {
    if (ctx.onMoon) {
      ctx.returnToEarth();
    } else if (!ctx.travelingToMoon) {
      ctx.directTravelToMoon();
    }
    closeAllFloatMenus();
  });
  document.getElementById('fSpaceRocket').addEventListener('click', () => {
    if (ctx.onMoon) {
      ctx.returnToEarth();
    } else if (!ctx.travelingToMoon) {
      ctx.travelToMoon();
    }
    closeAllFloatMenus();
  });
  document.getElementById('fRealEstate').addEventListener('click', () => {
    ctx.toggleRealEstate();
    document.getElementById('fRealEstate').classList.toggle('on', ctx.realEstateMode);
    closeAllFloatMenus();
  });
  document.getElementById('fHistoric').addEventListener('click', () => {
    ctx.toggleHistoric();
    document.getElementById('fHistoric').classList.toggle('on', ctx.historicMode);
    closeAllFloatMenus();
  });
  document.getElementById('fPOI').addEventListener('click', () => {
    ctx.poiMode = !ctx.poiMode;
    document.getElementById('fPOI').classList.toggle('on', ctx.poiMode);
    ctx.poiMeshes.forEach((m) => {
      if (m) m.visible = !!ctx.poiMode;
    });
    if (!ctx.poiMode) {
      const poiInfo = document.getElementById('poiInfo');
      if (poiInfo) poiInfo.style.display = 'none';
    }
    closeAllFloatMenus();
  });
  document.getElementById('fRespawn').addEventListener('click', () => {ctx.spawnOnRoad();closeAllFloatMenus();});
  document.getElementById('fRespawnRand').addEventListener('click', () => {
    if (ctx.roads.length > 0) {
      const rd = ctx.roads[Math.floor(Math.random() * ctx.roads.length)];
      const idx = Math.floor(Math.random() * rd.pts.length);
      ctx.car.x = rd.pts[idx].x;ctx.car.z = rd.pts[idx].z;
      if (idx < rd.pts.length - 1) ctx.car.angle = Math.atan2(rd.pts[idx + 1].x - rd.pts[idx].x, rd.pts[idx + 1].z - rd.pts[idx].z);
      ctx.car.speed = 0;ctx.car.vx = 0;ctx.car.vz = 0;
      const _respawnH = typeof ctx.terrainMeshHeightAt === 'function' ? ctx.terrainMeshHeightAt : ctx.elevationWorldYAtWorldXZ;
      const spawnY = typeof ctx.GroundHeight !== 'undefined' && ctx.GroundHeight && typeof ctx.GroundHeight.carCenterY === 'function' ?
      ctx.GroundHeight.carCenterY(ctx.car.x, ctx.car.z, true, 1.2) :
      _respawnH(ctx.car.x, ctx.car.z) + 1.2;
      ctx.car.y = spawnY;
      ctx.carMesh.position.set(ctx.car.x, spawnY, ctx.car.z);ctx.carMesh.rotation.y = ctx.car.angle;
      if (ctx.Walk && ctx.Walk.state && ctx.Walk.state.walker) {
        const groundY = spawnY - 1.2;
        ctx.Walk.state.walker.x = ctx.car.x;
        ctx.Walk.state.walker.z = ctx.car.z;
        ctx.Walk.state.walker.y = groundY + 1.7;
        ctx.Walk.state.walker.vy = 0;
        ctx.Walk.state.walker.angle = ctx.car.angle;
        ctx.Walk.state.walker.yaw = ctx.car.angle;
        if (ctx.Walk.state.characterMesh && ctx.Walk.state.mode === 'walk') {
          ctx.Walk.state.characterMesh.position.set(ctx.car.x, groundY, ctx.car.z);
          ctx.Walk.state.characterMesh.rotation.y = ctx.car.angle;
        }
      }
    }
    closeAllFloatMenus();
  });
  document.getElementById('fTrack').addEventListener('click', () => {ctx.toggleTrackRecording();closeAllFloatMenus();});
  document.getElementById('fEraseTrack').addEventListener('click', () => {ctx.eraseTrack();closeAllFloatMenus();});
  document.getElementById('fClouds').addEventListener('click', () => {
    ctx.cloudsVisible = !ctx.cloudsVisible;
    if (ctx.cloudGroup) ctx.cloudGroup.visible = ctx.cloudsVisible;
    document.getElementById('fClouds').classList.toggle('on', !ctx.cloudsVisible);
    closeAllFloatMenus();
  });
  document.getElementById('fConstellations').addEventListener('click', () => {
    ctx.constellationsVisible = !ctx.constellationsVisible;
    if (ctx.allConstellationLines) ctx.allConstellationLines.visible = ctx.constellationsVisible;
    document.getElementById('fConstellations').classList.toggle('on', ctx.constellationsVisible);
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
    if (!ctx.gameStarted) return;

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

  document.getElementById('resumeBtn').addEventListener('click', () => {ctx.paused = false;document.getElementById('pauseScreen').classList.remove('show');});
  document.getElementById('restartBtn').addEventListener('click', () => {ctx.paused = false;document.getElementById('pauseScreen').classList.remove('show');ctx.startMode();});
  document.getElementById('menuBtn').addEventListener('click', () => goToMainMenu());
  document.getElementById('caughtBtn').addEventListener('click', () => {document.getElementById('caughtScreen').classList.remove('show');ctx.policeHits = 0;ctx.paused = false;document.getElementById('police').textContent = '💔 0/3';ctx.spawnOnRoad();});
  document.getElementById('againBtn').addEventListener('click', () => {ctx.hideResult();ctx.paused = false;ctx.startMode();});
  document.getElementById('freeBtn').addEventListener('click', () => {ctx.hideResult();ctx.paused = false;ctx.gameMode = 'free';ctx.clearObjectives();});
  document.getElementById('resMenuBtn').addEventListener('click', () => {ctx.hideResult();goToMainMenu();});

  // Map controls
  document.getElementById('minimap').addEventListener('click', () => {
    ctx.showLargeMap = true;
    document.getElementById('largeMap').classList.add('show');
  });
  document.getElementById('minimap').addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const rect = e.target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const worldPos = ctx.minimapScreenToWorld(x, y);
    ctx.teleportToLocation(worldPos.x, worldPos.z);
  });
  document.getElementById('mapClose').addEventListener('click', () => {
    ctx.showLargeMap = false;
    document.getElementById('largeMap').classList.remove('show');
  });
  document.getElementById('mapLegend').addEventListener('click', (e) => {
    e.stopPropagation();
    const legend = document.getElementById('legendPanel');
    legend.style.display = legend.style.display === 'none' ? 'block' : 'none';
  });
  document.getElementById('largeMap').addEventListener('click', (e) => {
    if (e.target.id === 'largeMap') {
      ctx.showLargeMap = false;
      document.getElementById('largeMap').classList.remove('show');
    }
  });
  document.getElementById('mapSatelliteToggle').addEventListener('click', (e) => {
    e.stopPropagation();
    ctx.satelliteView = !ctx.satelliteView;
    document.getElementById('mapSatelliteToggle').classList.toggle('active', ctx.satelliteView);
    document.getElementById('fSatellite').classList.toggle('on', ctx.satelliteView);
  });
  document.getElementById('mapRoadsToggle').addEventListener('click', (e) => {
    e.stopPropagation();
    ctx.showRoads = !ctx.showRoads;
    document.getElementById('mapRoadsToggle').classList.toggle('active', ctx.showRoads);
    document.getElementById('fRoads').classList.toggle('on', ctx.showRoads);
  });
  document.getElementById('mapZoomIn').addEventListener('click', (e) => {
    e.stopPropagation();
    if (ctx.largeMapZoom < 18) {
      ctx.largeMapZoom++;
      document.getElementById('zoomLevel').textContent = 'Z: ' + ctx.largeMapZoom;
    }
  });
  document.getElementById('mapZoomOut').addEventListener('click', (e) => {
    e.stopPropagation();
    if (ctx.largeMapZoom > 10) {
      ctx.largeMapZoom--;
      document.getElementById('zoomLevel').textContent = 'Z: ' + ctx.largeMapZoom;
    }
  });

  const legendCloseBtn = document.getElementById('legendCloseBtn');
  if (legendCloseBtn) {
    legendCloseBtn.addEventListener('click', () => ctx.closeLegend());
  }
  const legendShowAllBtn = document.getElementById('legendShowAllBtn');
  if (legendShowAllBtn) {
    legendShowAllBtn.addEventListener('click', () => ctx.toggleAllLayers(true));
  }
  const legendHideAllBtn = document.getElementById('legendHideAllBtn');
  if (legendHideAllBtn) {
    legendHideAllBtn.addEventListener('click', () => ctx.toggleAllLayers(false));
  }
  const mapInfoCloseBtn = document.getElementById('mapInfoCloseBtn');
  if (mapInfoCloseBtn) {
    mapInfoCloseBtn.addEventListener('click', () => ctx.closeMapInfo());
  }
  const closePropertyPanelBtn = document.getElementById('closePropertyPanelBtn');
  if (closePropertyPanelBtn) {
    closePropertyPanelBtn.addEventListener('click', () => ctx.closePropertyPanel());
  }
  const propertyFiltersToggle = document.getElementById('propertyFiltersToggle');
  if (propertyFiltersToggle) {
    propertyFiltersToggle.addEventListener('click', () => ctx.togglePropertyFilters());
  }
  const closeHistoricPanelBtn = document.getElementById('closeHistoricPanelBtn');
  if (closeHistoricPanelBtn) {
    closeHistoricPanelBtn.addEventListener('click', () => ctx.closeHistoricPanel());
  }
  const closeModalBtn = document.getElementById('closeModalBtn');
  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', () => ctx.closeModal());
  }

  const legendPanel = document.getElementById('legendPanel');
  if (legendPanel) {
    legendPanel.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      if (!target.id || !target.id.startsWith('filter')) return;

      if (target.id === 'filterPOIsAll') {
        ctx.toggleAllPOIs();
        return;
      }
      if (target.id === 'filterGameElementsAll') {
        ctx.toggleAllGameElements();
        return;
      }
      if (target.id === 'filterRoads') {
        ctx.toggleRoads();
        return;
      }
      ctx.updateMapLayers();
    });
  }
}

// Entry point - initialize the application
Object.assign(ctx, { setupUI });

export { setupUI };
