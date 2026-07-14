import { ctx as appCtx } from "../shared-context.js?v=55";
import { createGlobeSelector } from "./globe-selector.js?v=59";
import { readSharedExperienceParams } from "./share-links.js?v=60";

function initTitleScreenUi({
  lastLocationStorageKey,
  perfModeSelect,
  shareExperienceStatus,
  perfSettingsStatus,
  gameShareFloatBtn,
  closeGameShareMenu,
  applySharedRuntimeState,
  updateControlsModeUI,
  isTouchPreferredClient
}) {
  const customPanel = document.getElementById('customPanel');
  const titleUseMyLocationBtn = document.getElementById('titleUseMyLocationBtn');
  const titleUseMyLocationStatus = document.getElementById('titleUseMyLocationStatus');
  const earthLaunchToggle = document.getElementById('earthLaunchToggle');
  const moonLaunchToggle = document.getElementById('moonLaunchToggle');
  const marsLaunchToggle = document.getElementById('marsLaunchToggle');
  const spaceLaunchToggle = document.getElementById('spaceLaunchToggle');
  const oceanLaunchToggle = document.getElementById('oceanLaunchToggle');
  const launchModeButtons = {
    earth: earthLaunchToggle,
    moon: moonLaunchToggle,
    mars: marsLaunchToggle,
    space: spaceLaunchToggle,
    ocean: oceanLaunchToggle
  };
  const geolocationOptions = { enableHighAccuracy: true, timeout: 12000, maximumAge: 120000 };
  const sharedExperienceParams = readSharedExperienceParams();
  let titleLaunchMode = 'earth';
  let globeSelector = null;
  let skipGlobeGateOnce = false;
  let geolocationBusy = false;
  let oceanEntryHadEarthWorld = false;
  let pendingTitleBoatEntryTimer = 0;
  let multiplayerWarmupPromise = null;

  const primeMultiplayerUi = () => {
    if (multiplayerWarmupPromise) return multiplayerWarmupPromise;
    const panel = document.getElementById('tab-multiplayer');
    const status = document.getElementById('mpTitleStatus');
    panel?.classList.add('mp-initializing');
    panel?.setAttribute('aria-busy', 'true');
    if (status && !status.textContent.trim()) status.textContent = 'Loading multiplayer...';
    const waitForInitializer = new Promise((resolve, reject) => {
      const startedAt = performance.now();
      const attempt = () => {
        if (typeof appCtx.ensureMultiplayerPlatformReady === 'function') {
          resolve(appCtx.ensureMultiplayerPlatformReady());
          return;
        }
        if (performance.now() - startedAt >= 10000) {
          reject(new Error('Multiplayer initializer did not become available.'));
          return;
        }
        window.setTimeout(attempt, 50);
      };
      attempt();
    });
    multiplayerWarmupPromise = waitForInitializer
      .then((api) => {
        panel?.classList.remove('mp-initializing');
        panel?.removeAttribute('aria-busy');
        if (status?.textContent === 'Loading multiplayer...') {
          status.textContent = 'Multiplayer ready. Create or join a room.';
        }
        return api;
      })
      .catch((error) => {
        multiplayerWarmupPromise = null;
        panel?.classList.remove('mp-initializing');
        panel?.removeAttribute('aria-busy');
        if (status) status.textContent = 'Multiplayer could not start. Try opening this tab again.';
        console.warn('[ui] Multiplayer platform warmup failed.', error);
        return null;
      });
    return multiplayerWarmupPromise;
  };
  const hasLoadedEarthWorld = () => appCtx.worldLoading || (Array.isArray(appCtx.roads) && appCtx.roads.length > 0) || (Array.isArray(appCtx.roadMeshes) && appCtx.roadMeshes.length > 0) || (Array.isArray(appCtx.buildings) && appCtx.buildings.length > 0) || (Array.isArray(appCtx.buildingMeshes) && appCtx.buildingMeshes.length > 0);
  const emitTutorialEvent = (eventName, payload = {}) => {
    if (typeof appCtx.tutorialOnEvent === 'function') appCtx.tutorialOnEvent(eventName, payload);
  };
  const clearPendingTitleBoatEntryTimer = () => {
    if (!pendingTitleBoatEntryTimer) return;
    clearTimeout(pendingTitleBoatEntryTimer);
    pendingTitleBoatEntryTimer = 0;
  };
  const tryAutoBoatEntry = (source = 'title_custom_start_water') => {
    if (
      appCtx.selLoc !== 'custom' ||
      !appCtx.gameStarted ||
      appCtx.boatMode?.active ||
      appCtx.oceanMode?.active ||
      appCtx.onMoon ||
      appCtx.travelingToMoon ||
      appCtx.spaceFlight?.active
    ) {
      return false;
    }

    const directCandidate =
      typeof appCtx.inspectBoatCandidate === 'function' ?
        appCtx.inspectBoatCandidate(0, 0, 220) :
        null;
    if (directCandidate?.inside && typeof appCtx.setTravelMode === 'function') {
      return appCtx.setTravelMode('boat', {
        source,
        force: true,
        candidate: directCandidate,
        spawnX: directCandidate.spawnX,
        spawnZ: directCandidate.spawnZ,
        entryMode: 'walk'
      }) === 'boat';
    }

    if (typeof appCtx.refreshBoatAvailability === 'function') {
      appCtx.refreshBoatAvailability(true);
    }
    const shouldAutoEnterBoat =
      appCtx.boatMode?.available === true &&
      appCtx.boatMode?.candidate?.inside === true;
    if (!shouldAutoEnterBoat || typeof appCtx.handleBoatAction !== 'function') return false;
    return appCtx.handleBoatAction() === true;
  };
  const schedulePendingTitleBoatEntry = (options = {}) => {
    clearPendingTitleBoatEntryTimer();
    const source = options.source || 'title_custom_start_water';
    const expiresAt = Number.isFinite(options.expiresAt) ? options.expiresAt : Date.now() + 45000;

    const run = () => {
      pendingTitleBoatEntryTimer = 0;
      if (
        !appCtx.gameStarted ||
        appCtx.selLoc !== 'custom' ||
        titleLaunchMode !== 'earth' ||
        appCtx.oceanMode?.active ||
        appCtx.onMoon ||
        appCtx.travelingToMoon ||
        appCtx.spaceFlight?.active
      ) {
        return;
      }
      if (appCtx.boatMode?.active) {
        if (appCtx.pendingAutoBoatEntry?.source === source) {
          appCtx.pendingAutoBoatEntry = null;
        }
        return;
      }
      if (Date.now() > expiresAt) {
        if (appCtx.pendingAutoBoatEntry?.source === source) {
          appCtx.pendingAutoBoatEntry = null;
        }
        return;
      }
      if (tryAutoBoatEntry(source)) {
        if (appCtx.pendingAutoBoatEntry?.source === source) {
          appCtx.pendingAutoBoatEntry = null;
        }
        return;
      }
      if (appCtx.worldLoading) {
        pendingTitleBoatEntryTimer = window.setTimeout(run, 400);
        return;
      }
      pendingTitleBoatEntryTimer = window.setTimeout(run, 400);
    };

    pendingTitleBoatEntryTimer = window.setTimeout(run, 220);
  };

  const setLaunchMode = (mode) => {
    titleLaunchMode = mode === 'moon' || mode === 'mars' || mode === 'space' || mode === 'ocean' ? mode : 'earth';
    Object.entries(launchModeButtons).forEach(([buttonMode, button]) => {
      if (button) button.classList.toggle('active', buttonMode === titleLaunchMode);
    });
    appCtx.loadingScreenMode = titleLaunchMode;
  };
  const setTitleLocationMode = (mode) => {
    if (mode === 'moon' || mode === 'mars' || mode === 'space' || mode === 'ocean') return void setLaunchMode(mode);
    setLaunchMode('earth');
    if (mode === 'custom') {
      const customCard = document.querySelector('.loc[data-loc="custom"]');
      if (customCard) {
        document.querySelectorAll('.loc').forEach((element) => element.classList.remove('sel'));
        customCard.classList.add('sel');
      }
      appCtx.selLoc = 'custom';
      customPanel?.classList.remove('show');
      return;
    }
    const selectedSuggested = document.querySelector('.loc.sel:not([data-loc="custom"])') || document.querySelector('.loc[data-loc="baltimore"]');
    if (selectedSuggested) {
      document.querySelectorAll('.loc').forEach((element) => element.classList.remove('sel'));
      selectedSuggested.classList.add('sel');
      appCtx.selLoc = selectedSuggested.dataset.loc;
    }
    customPanel?.classList.remove('show');
  };
  const triggerTitleStart = () => document.getElementById('startBtn')?.click();
  const persistLastLocationSelection = (launchMode = 'earth') => {
    try {
      const payload = {
        selLoc: appCtx.selLoc === 'custom' ? 'custom' : String(appCtx.selLoc || 'baltimore'),
        launchMode: launchMode === 'moon' || launchMode === 'mars' || launchMode === 'space' || launchMode === 'ocean' ? launchMode : 'earth',
        ts: Date.now()
      };
      if (payload.selLoc === 'custom') {
        if (appCtx.customLocTransient === true) return;
        const lat = Number(appCtx.customLoc?.lat ?? document.getElementById('customLat')?.value);
        const lon = Number(appCtx.customLoc?.lon ?? document.getElementById('customLon')?.value);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
        payload.customLoc = { lat, lon, name: String(appCtx.customLoc?.name || 'Custom Location') };
      }
      localStorage.setItem(lastLocationStorageKey, JSON.stringify(payload));
    } catch {}
  };
  const applyLastLocationSelection = (record) => {
    if (!record || typeof record !== 'object') return false;
    const launch = record.launchMode === 'moon' || record.launchMode === 'mars' || record.launchMode === 'space' || record.launchMode === 'ocean' ? record.launchMode : 'earth';
    if (record.selLoc === 'custom' && record.customLoc) {
      const lat = Number(record.customLoc.lat);
      const lon = Number(record.customLoc.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
      const customLatInput = document.getElementById('customLat');
      const customLonInput = document.getElementById('customLon');
      if (customLatInput) customLatInput.value = lat.toFixed(6);
      if (customLonInput) customLonInput.value = lon.toFixed(6);
      appCtx.customLoc = { lat, lon, name: String(record.customLoc.name || 'Custom Location') };
      appCtx.customLocTransient = false;
      appCtx.selLoc = 'custom';
      setTitleLocationMode('custom');
      setLaunchMode(launch);
      return true;
    }
    const locKey = String(record.selLoc || '');
    if (!locKey || !appCtx.LOCS?.[locKey]) return false;
    const card = document.querySelector(`.loc[data-loc="${locKey}"]`);
    if (card instanceof HTMLElement) {
      document.querySelectorAll('.loc').forEach((element) => element.classList.remove('sel'));
      card.classList.add('sel');
    }
    appCtx.selLoc = locKey;
    setTitleLocationMode('suggested');
    setLaunchMode(launch);
    return true;
  };

  const setTitleUseMyLocationStatus = (message = '', color = '#6b7280') => {
    if (!(titleUseMyLocationStatus instanceof HTMLElement)) return;
    titleUseMyLocationStatus.textContent = message || '';
    titleUseMyLocationStatus.style.color = color || '#6b7280';
  };
  const setUseMyLocationBusy = (isBusy) => {
    geolocationBusy = !!isBusy;
    if (titleUseMyLocationBtn) {
      titleUseMyLocationBtn.disabled = geolocationBusy;
      titleUseMyLocationBtn.textContent = geolocationBusy ? 'Locating…' : 'Use My Location';
    }
    if (globeSelector && typeof globeSelector.setLocateButtonBusy === 'function') globeSelector.setLocateButtonBusy(geolocationBusy);
  };
  const geolocationErrorMessage = (error) => {
    const code = Number(error?.code);
    if (code === 1) return 'Location access denied. You can still pick a location manually.';
    if (code === 2) return 'Could not determine your location. Try again or choose manually.';
    if (code === 3) return 'Location request timed out. Try again or choose manually.';
    return 'Could not determine your location. You can still choose manually.';
  };
  const requestCurrentPosition = () => new Promise((resolve, reject) => {
    if (!navigator.geolocation || typeof navigator.geolocation.getCurrentPosition !== 'function') {
      reject({ userMessage: 'Geolocation is not supported in this browser.' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = Number(position?.coords?.latitude);
        const lon = Number(position?.coords?.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
          reject({ userMessage: 'Could not determine your location. Try again or choose manually.' });
          return;
        }
        resolve({ lat, lon });
      },
      (error) => reject({ ...error, userMessage: geolocationErrorMessage(error) }),
      geolocationOptions
    );
  });
  const clampDetectedCoords = (lat, lon) => {
    const safeLat = Math.max(-90, Math.min(90, Number(lat) || 0));
    let safeLon = Number(lon) || 0;
    while (safeLon > 180) safeLon -= 360;
    while (safeLon < -180) safeLon += 360;
    return { lat: safeLat, lon: safeLon };
  };
  const runUseMyLocation = async (source = 'menu') => {
    if (geolocationBusy) return;
    if (globeSelector && typeof globeSelector.isOpen === 'function' && !globeSelector.isOpen()) {
      setTitleLocationMode('custom');
      globeSelector.open();
      emitTutorialEvent('opened_globe_selector');
    }
    setUseMyLocationBusy(true);
    setTitleUseMyLocationStatus('Locating…', '#64748b');
    globeSelector?.setSearchStatus?.('Locating…', '#64748b');
    try {
      const position = await requestCurrentPosition();
      const coords = clampDetectedCoords(position.lat, position.lon);
      const coordsName = `Current Location ${coords.lat.toFixed(3)}, ${coords.lon.toFixed(3)}`;
      appCtx.customLocTransient = true;
      if (globeSelector?.applySelectionAndResolve) {
        globeSelector.applySelectionAndResolve(coords.lat, coords.lon, {
          name: coordsName,
          searchLabel: 'Current Location',
          focus: true,
          zoomDistance: 2.05,
          fromGeolocation: true,
          skipAutoFavorite: true
        });
      } else {
        appCtx.customLoc = { lat: coords.lat, lon: coords.lon, name: coordsName };
        appCtx.selLoc = 'custom';
      }
      const successMessage = 'Location found. Review it on the globe, then press Start Here.';
      setTitleUseMyLocationStatus(successMessage, '#059669');
      globeSelector?.setSearchStatus?.(successMessage, '#059669');
    } catch (error) {
      const failureMessage = error?.userMessage || geolocationErrorMessage(error);
      setTitleUseMyLocationStatus(failureMessage, '#dc2626');
      globeSelector?.setSearchStatus?.(failureMessage, '#dc2626');
      if (source === 'menu') setTitleLocationMode('custom');
    } finally {
      setUseMyLocationBusy(false);
    }
  };

  appCtx.triggerTitleStart = (options = {}) => {
    if (options?.bypassCustomGate) {
      skipGlobeGateOnce = true;
      appCtx.pendingCustomLaunchBypass = true;
    }
    clearPendingTitleBoatEntryTimer();
    triggerTitleStart();
  };

  document.querySelectorAll('.tab-btn').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((element) => element.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((element) => element.classList.remove('active'));
    button.classList.add('active');
    document.getElementById(`tab-${button.dataset.tab}`)?.classList.add('active');
    if (button.dataset.tab === 'multiplayer') primeMultiplayerUi();
  }));
  titleUseMyLocationBtn?.addEventListener('click', () => runUseMyLocation('menu'));

  globeSelector = createGlobeSelector({
    onOpen: () => emitTutorialEvent('opened_globe_selector'),
    onUseMyLocation: () => runUseMyLocation('globe'),
    onBack: () => customPanel?.classList.remove('show'),
    onStartHere: (selection = null) => {
      emitTutorialEvent('location_selected', selection || {});
      setTitleLocationMode('custom');
      if (!appCtx.gameStarted) {
        skipGlobeGateOnce = true;
        triggerTitleStart();
      } else if (typeof appCtx.loadRoads === 'function') {
        appCtx.loadRoads().then(() => {
          const preferredMode = appCtx.Walk?.state?.mode === 'walk' ? 'walk' : 'drive';
          if (typeof appCtx.applyCustomLocationSpawn === 'function') {
            appCtx.applyCustomLocationSpawn(preferredMode, { source: 'custom_location', preferBoatIfWater: true });
          } else if (typeof appCtx.spawnOnRoad === 'function') {
            appCtx.spawnOnRoad();
          }
        });
      }
    },
    onMoonShortcut: () => {
      if (!appCtx.gameStarted) {
        setLaunchMode('moon');
        skipGlobeGateOnce = true;
        triggerTitleStart();
      } else if (!appCtx.onMoon && !appCtx.travelingToMoon && typeof appCtx.directTravelToMoon === 'function') {
        appCtx.directTravelToMoon();
      }
    },
    onSpaceShortcut: () => {
      if (!appCtx.gameStarted) {
        setLaunchMode('space');
        skipGlobeGateOnce = true;
        triggerTitleStart();
      } else if (!appCtx.onMoon && !appCtx.travelingToMoon && typeof appCtx.travelToMoon === 'function') {
        appCtx.travelToMoon();
      }
    }
  });

  appCtx.globeSelector = globeSelector;
  appCtx.openGlobeSelector = () => {
    setTitleLocationMode('custom');
    globeSelector.open();
    emitTutorialEvent('opened_globe_selector');
  };
  appCtx.closeGlobeSelector = () => globeSelector.close();
  appCtx.setTitleLocationMode = setTitleLocationMode;
  appCtx.selectSuggestedLocationCard = (targetElement) => {
    if (!targetElement) return;
    const selectedLoc = targetElement.closest('.loc[data-loc]');
    if (!selectedLoc || selectedLoc.dataset.loc === 'custom') return;
    document.querySelectorAll('.loc').forEach((element) => element.classList.remove('sel'));
    selectedLoc.classList.add('sel');
    appCtx.selLoc = selectedLoc.dataset.loc;
    customPanel?.classList.remove('show');
    setLaunchMode('earth');
  };

  document.querySelectorAll('.loc').forEach((element) => element.addEventListener('click', () => {
    document.querySelectorAll('.loc').forEach((node) => node.classList.remove('sel'));
    element.classList.add('sel');
    appCtx.selLoc = element.dataset.loc;
    if (appCtx.selLoc === 'custom') {
      setTitleLocationMode('custom');
      globeSelector.open();
      return;
    }
    globeSelector.close();
    customPanel?.classList.remove('show');
    setLaunchMode('earth');
  }));
  earthLaunchToggle?.addEventListener('click', () => setLaunchMode('earth'));
  moonLaunchToggle?.addEventListener('click', () => setLaunchMode('moon'));
  marsLaunchToggle?.addEventListener('click', () => setLaunchMode('mars'));
  spaceLaunchToggle?.addEventListener('click', () => setLaunchMode('space'));
  oceanLaunchToggle?.addEventListener('click', () => setLaunchMode('ocean'));

  setTitleLocationMode(appCtx.selLoc === 'custom' ? 'custom' : 'suggested');

  try {
    const raw = localStorage.getItem(lastLocationStorageKey);
    if (raw) applyLastLocationSelection(JSON.parse(raw));
  } catch {}

  if (sharedExperienceParams) {
    const validGameModes = new Set(['free', 'trial', 'checkpoint', 'painttown', 'police', 'flower']);
    if (sharedExperienceParams.gameMode && validGameModes.has(sharedExperienceParams.gameMode)) {
      appCtx.gameMode = sharedExperienceParams.gameMode;
      const targetMode = document.querySelector(`.mode[data-mode="${sharedExperienceParams.gameMode}"]`);
      if (targetMode) {
        document.querySelectorAll('.mode').forEach((element) => element.classList.remove('sel'));
        targetMode.classList.add('sel');
      }
    }
    if (sharedExperienceParams.perfMode && typeof appCtx.setPerfMode === 'function') {
      appCtx.setPerfMode(sharedExperienceParams.perfMode);
      if (perfModeSelect) perfModeSelect.value = sharedExperienceParams.perfMode;
    }
    const hasCustomCoords = Number.isFinite(sharedExperienceParams.lat) && Number.isFinite(sharedExperienceParams.lon);
    const hasPresetLoc = !!(sharedExperienceParams.loc && sharedExperienceParams.loc !== 'custom' && appCtx.LOCS?.[sharedExperienceParams.loc]);
    if (hasCustomCoords) {
      const customLatInput = document.getElementById('customLat');
      const customLonInput = document.getElementById('customLon');
      if (customLatInput) customLatInput.value = sharedExperienceParams.lat.toFixed(6);
      if (customLonInput) customLonInput.value = sharedExperienceParams.lon.toFixed(6);
      appCtx.customLoc = {
        lat: sharedExperienceParams.lat,
        lon: sharedExperienceParams.lon,
        name: sharedExperienceParams.name || appCtx.customLoc?.name || 'Shared Location'
      };
      appCtx.customLocTransient = false;
      appCtx.selLoc = 'custom';
      setTitleLocationMode('custom');
    } else if (sharedExperienceParams.loc === 'custom' && !hasCustomCoords && perfSettingsStatus) {
      perfSettingsStatus.textContent = 'Share link missing custom coordinates (lat/lon). Using current location selection.';
    } else if (hasPresetLoc) {
      const selectedLocCard = document.querySelector(`.loc[data-loc="${sharedExperienceParams.loc}"]`);
      if (selectedLocCard) {
        document.querySelectorAll('.loc').forEach((element) => element.classList.remove('sel'));
        selectedLocCard.classList.add('sel');
      }
      appCtx.selLoc = sharedExperienceParams.loc;
      customPanel?.classList.remove('show');
      setLaunchMode('earth');
    }
    if (sharedExperienceParams.launch) setLaunchMode(sharedExperienceParams.launch);
    if (Number.isFinite(sharedExperienceParams.seed)) appCtx.sharedSeedOverride = (Math.floor(sharedExperienceParams.seed) | 0) >>> 0;
    appCtx.pendingExperienceState = {
      travelMode: sharedExperienceParams.travelMode,
      camMode: sharedExperienceParams.camMode,
      refX: sharedExperienceParams.refX,
      refY: sharedExperienceParams.refY,
      refZ: sharedExperienceParams.refZ,
      yaw: sharedExperienceParams.yaw,
      pitch: sharedExperienceParams.pitch
    };
    if (shareExperienceStatus) shareExperienceStatus.textContent = 'Share link loaded. Start Explore to apply location/mode/camera.';
    else if (perfSettingsStatus) perfSettingsStatus.textContent = 'Share link loaded. Start Explore to apply location/mode/camera.';
  }

  document.getElementById('locationSearchBtn')?.addEventListener('click', appCtx.searchLocation);
  document.getElementById('locationSearch')?.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') appCtx.searchLocation();
  });
  document.querySelectorAll('.mode').forEach((element) => element.addEventListener('click', () => {
    document.querySelectorAll('.mode').forEach((node) => node.classList.remove('sel'));
    element.classList.add('sel');
    appCtx.gameMode = element.dataset.mode;
  }));

  document.getElementById('startBtn')?.addEventListener('click', async () => {
    const externalBypassCustomGate = appCtx.pendingCustomLaunchBypass === true;
    const shouldGateToGlobe = !appCtx.gameStarted && !skipGlobeGateOnce && !externalBypassCustomGate && titleLaunchMode === 'earth' && String(appCtx.selLoc || '') === 'custom';
    if (shouldGateToGlobe) {
      setTitleLocationMode('custom');
      globeSelector?.open?.();
      emitTutorialEvent('opened_globe_selector');
      return;
    }
    if (skipGlobeGateOnce) skipGlobeGateOnce = false;
    if (externalBypassCustomGate) appCtx.pendingCustomLaunchBypass = false;
    if (globeSelector?.isOpen?.()) globeSelector.close();

    const pendingFlowerChallengeRequested = typeof appCtx.consumePendingFlowerChallengeStart === 'function' ? appCtx.consumePendingFlowerChallengeStart() : false;
    appCtx.loadingScreenMode = titleLaunchMode === 'moon' ? 'moon' : titleLaunchMode === 'space' ? 'space' : titleLaunchMode === 'ocean' ? 'ocean' : 'earth';
    document.getElementById('titleScreen')?.classList.add('hidden');
    document.getElementById('hud')?.classList.add('show');
    document.getElementById('minimap')?.classList.add('show');
    document.getElementById('minimapZoomControls')?.classList.add('show');
    document.getElementById('floatMenuContainer')?.classList.add('show');
    document.getElementById('mainMenuBtn')?.classList.add('show');
    document.getElementById('controlsTab')?.classList.add('show');
    document.getElementById('coords')?.classList.add('show');
    document.getElementById('historicBtn')?.classList.add('show');
    document.getElementById('memoryFlowerFloatBtn')?.classList.add('show');
    gameShareFloatBtn?.classList.add('show');
    closeGameShareMenu?.();
    appCtx.gameStarted = true;
    if (typeof appCtx.updatePerfPanel === 'function') appCtx.updatePerfPanel(true);
    appCtx.disableNearBuildingBatching = appCtx.gameMode === 'painttown';

    if (titleLaunchMode === 'ocean' && typeof appCtx.startOceanMode === 'function') {
      oceanEntryHadEarthWorld = hasLoadedEarthWorld();
      if (typeof appCtx.showTransitionLoad === 'function') await appCtx.showTransitionLoad('ocean', 1100);
      if (typeof appCtx.setBuildModeEnabled === 'function') appCtx.setBuildModeEnabled(false);
      appCtx.startOceanMode();
      updateControlsModeUI?.();
      appCtx.loadingScreenMode = 'earth';
      return;
    }

    appCtx.switchEnv(appCtx.ENV.EARTH);
    const explorationMsg = document.getElementById('explorationModeMsg');
    let explorationMsgTimeout;
    if (explorationMsg && !isTouchPreferredClient) {
      explorationMsg.style.display = 'block';
      explorationMsg.style.opacity = '0';
      const hideExplorationMsg = () => {
        if (explorationMsgTimeout) clearTimeout(explorationMsgTimeout);
        explorationMsg.style.opacity = '0';
        setTimeout(() => {
          explorationMsg.style.display = 'none';
        }, 500);
      };
      explorationMsg.addEventListener('click', hideExplorationMsg, { once: true });
      setTimeout(() => {
        explorationMsg.style.transition = 'opacity 0.5s';
        explorationMsg.style.opacity = '1';
      }, 100);
      explorationMsgTimeout = setTimeout(() => hideExplorationMsg(), 5000);
    } else if (explorationMsg) {
      explorationMsg.style.display = 'none';
    }

    if (typeof appCtx.updateTerrainAround === 'function' && appCtx.terrainEnabled && !appCtx.onMoon) {
      const startRef = appCtx.Walk?.state?.walker || appCtx.car;
      appCtx.updateTerrainAround(startRef.x || 0, startRef.z || 0);
    }
    let customSpawn = null;
    let customBoatEntryPending = false;
    let customBoatEntryExpiresAt = 0;
    const shouldPrimeCustomBoatEntry = appCtx.selLoc === 'custom' && titleLaunchMode === 'earth';
    if (shouldPrimeCustomBoatEntry) {
      customBoatEntryPending = true;
      customBoatEntryExpiresAt = Date.now() + 45000;
      appCtx.pendingAutoBoatEntry = {
        source: 'title_custom_start_water',
        entryMode: 'walk',
        emitTutorial: false,
        expiresAt: customBoatEntryExpiresAt
      };
      schedulePendingTitleBoatEntry({
        source: 'title_custom_start_water',
        expiresAt: customBoatEntryExpiresAt
      });
    } else {
      clearPendingTitleBoatEntryTimer();
    }
    await appCtx.loadRoads();
    if (typeof appCtx.updateTerrainAround === 'function' && appCtx.terrainEnabled && !appCtx.onMoon) {
      const postLoadRef = appCtx.Walk?.state?.mode === 'walk' && appCtx.Walk?.state?.walker ? appCtx.Walk.state.walker : appCtx.car;
      appCtx.updateTerrainAround(postLoadRef.x || 0, postLoadRef.z || 0);
    }
    if (appCtx.selLoc === 'custom' && typeof appCtx.applyCustomLocationSpawn === 'function') {
      if (appCtx.boatMode?.active) {
        customSpawn = { mode: 'boat' };
      } else {
        customSpawn = appCtx.applyCustomLocationSpawn('walk', { source: 'title_custom_start', preferBoatIfWater: true });
        if (customSpawn?.mode === 'boat' || tryAutoBoatEntry()) {
          customBoatEntryPending = true;
          if (!customBoatEntryExpiresAt) customBoatEntryExpiresAt = Date.now() + 45000;
        } else {
          if (!customBoatEntryExpiresAt) customBoatEntryExpiresAt = Date.now() + 45000;
          appCtx.pendingAutoBoatEntry = {
            source: 'title_custom_start_water',
            entryMode: 'walk',
            emitTutorial: false,
            expiresAt: customBoatEntryExpiresAt
          };
          customBoatEntryPending = true;
          schedulePendingTitleBoatEntry({
            source: 'title_custom_start_water',
            expiresAt: customBoatEntryExpiresAt
          });
        }
      }
    }

    if (appCtx.boatMode?.active) {
      if (appCtx.carMesh) appCtx.carMesh.visible = false;
      if (appCtx.Walk?.state?.characterMesh) appCtx.Walk.state.characterMesh.visible = false;
      if (typeof appCtx.syncTravelModeButtons === 'function') appCtx.syncTravelModeButtons();
    } else if (appCtx.Walk) {
      appCtx.Walk.setModeWalk();
      appCtx.Walk.state.view = 'third';
      if (appCtx.carMesh) appCtx.carMesh.visible = false;
      if (appCtx.Walk.state.characterMesh) appCtx.Walk.state.characterMesh.visible = true;
      const walker = appCtx.Walk.state.walker;
      const back = appCtx.Walk.CFG.thirdPersonDist;
      const up = appCtx.Walk.CFG.thirdPersonHeight;
      appCtx.camera.position.set(walker.x - Math.sin(walker.yaw) * back, walker.y + up, walker.z - Math.cos(walker.yaw) * back);
      appCtx.camera.lookAt(walker.x, walker.y, walker.z);
      document.getElementById('fDriving')?.classList.remove('on');
      document.getElementById('fWalk')?.classList.add('on');
      document.getElementById('fDrone')?.classList.remove('on');
    } else {
      if (appCtx.carMesh) appCtx.carMesh.visible = true;
      document.getElementById('fDriving')?.classList.add('on');
      document.getElementById('fWalk')?.classList.remove('on');
      document.getElementById('fDrone')?.classList.remove('on');
    }

    if (typeof appCtx.setBuildModeEnabled === 'function') appCtx.setBuildModeEnabled(false);
    updateControlsModeUI?.();
    applySharedRuntimeState?.();
    if (typeof appCtx.startMode === 'function') appCtx.startMode();
    if (customBoatEntryPending) {
      schedulePendingTitleBoatEntry({
        source: 'title_custom_start_water',
        expiresAt: customBoatEntryExpiresAt || Number(appCtx.pendingAutoBoatEntry?.expiresAt) || Date.now() + 45000
      });
    } else {
      clearPendingTitleBoatEntryTimer();
    }
    persistLastLocationSelection(titleLaunchMode);
    emitTutorialEvent('spawned_in_world', {
      location: appCtx.selLoc === 'custom' ? appCtx.customLoc : appCtx.LOCS?.[appCtx.selLoc] || null,
      launchMode: titleLaunchMode
    });
    if (pendingFlowerChallengeRequested && typeof appCtx.startFlowerChallenge === 'function') {
      let challengeStartAttempts = 0;
      const attemptStartChallenge = () => {
        challengeStartAttempts++;
        const started = appCtx.startFlowerChallenge('title');
        if (!started && challengeStartAttempts < 4) setTimeout(attemptStartChallenge, 1200);
      };
      attemptStartChallenge();
    }

    document.getElementById('mapRoadsToggle')?.classList.add('active');
    document.getElementById('mapPathsToggle')?.classList.remove('active');
    document.getElementById('fPaths')?.classList.remove('on');
    document.getElementById('fLandUse')?.classList.remove('on');
    document.getElementById('fLandUseRE')?.classList.remove('on');
    appCtx.loadingScreenMode = 'earth';

    if (titleLaunchMode === 'moon' && !appCtx.onMoon && !appCtx.travelingToMoon) {
      appCtx.directTravelToMoon();
    } else if (titleLaunchMode === 'mars' && !appCtx.onMars && !appCtx.travelingToMoon) {
      appCtx.startSpaceFlightToMars?.();
    } else if (titleLaunchMode === 'space' && !appCtx.onMoon && !appCtx.travelingToMoon) {
      appCtx.travelToMoon();
    }
  });

  return {
    getTitleLaunchMode: () => titleLaunchMode,
    setTitleLaunchMode: (mode) => setLaunchMode(mode),
    getGlobeSelector: () => globeSelector,
    isTouchPreferredClient
  };
}

export { initTitleScreenUi };
