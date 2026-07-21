import { ctx as appCtx } from "../shared-context.js?v=55";
import { createGlobeSelectorScene } from './globe-selector/scene.js?v=5';
import { createGlobeSelectorLaunch } from './globe-selector/launch.js?v=2';
import { getGlobeSelectorElements } from './globe-selector/dom.js?v=1';
import {
  addSelectionToSavedFavorites,
  buildFavoriteCities as buildFavoriteCitiesFromData,
  buildNearbyCities as buildNearbyCitiesFromData,
  cityLocationLabel,
  cityMatchesGlobeSelection,
  clampLatLon,
  fetchReversePayload,
  getFavoriteCityGroups as getFavoriteCityGroupsFromData,
  getMenuFavoriteCities as getMenuFavoriteCitiesFromLocs,
  latLonToLocalPoint,
  loadSavedFavoriteCities as loadSavedFavoriteCitiesFromStorage,
  normalizeCityRecord,
  parseReverseAddress,
  persistSavedFavoriteCities as persistSavedFavoriteCitiesToStorage,
  syncLegacyCustomSelection,
  setGlobeSelectorScrollLock,
  toFiniteNumber
} from "./globe-selector/helpers.js?v=1";

function createGlobeSelector(options = {}) {
  const {
    root, stage, canvas, latLonReadout, placeReadout, searchInput, mobileSearchInput,
    mobileSearchBtn, searchStatus, latInput, lonInput, startBtn, backBtn, moonBtn,
    spaceBtn, searchBtn, locateBtn, exploreModeBtn, liveEarthModeBtn, explorePanel,
    liveEarthPanel, liveEarthStatus, liveEarthCategoryChips, liveEarthLayerList,
    liveEarthDetails, liveEarthRefreshBtn, nearbyTabBtn, favoritesTabBtn,
    cityListHint, cityList
  } = getGlobeSelectorElements();

  if (!root || !canvas) {
    return {
      close() {},
      isOpen() { return false; },
      open() {},
      setSelection() {},
      setSearchStatus() {},
      setLocateButtonBusy() {},
      applySelectionAndResolve() {}
    };
  }

  let openState = false;
  let selected = null;
  let searchInFlight = false;
  let coordinateInputsDirty = false;
  let reverseLookupToken = 0;
  let activeCityTab = 'nearby';
  let nearbyCities = [];
  let liveNearbyCity = null;
  let favoritePresetList = [];
  let favoriteSavedList = [];
  let panelMode = 'explore';
  const reverseLookupCache = new Map();

  let savedFavoriteCities = [];

  const globeScene = createGlobeSelectorScene({
    appCtx,
    canvas,
    stage,
    placeReadout,
    getActiveCityTab: () => activeCityTab,
    getPanelMode: () => panelMode,
    getOpenState: () => openState,
    cityMatchesSelection,
    onFavoritePick(city) {
      setSelection(city.lat, city.lon, { name: city.name, focus: true });
      if (searchInput) searchInput.value = city.name;
    },
    onGlobePick(next) {
      const fallbackName = `Selected ${next.lat.toFixed(2)}, ${next.lon.toFixed(2)}`;
      setSelection(next.lat, next.lon, { name: fallbackName });
      reverseLookupPlace(next.lat, next.lon);
      if (searchInput) searchInput.value = fallbackName;
    }
  });

  function saveSelectionAsFavorite(nextSelection) {
    savedFavoriteCities = addSelectionToSavedFavorites(nextSelection, savedFavoriteCities);
  }

  function cityMatchesSelection(city) {
    return cityMatchesGlobeSelection(selected, city);
  }

  function setFavoriteMarkersVisible() {
    globeScene.setFavoriteMarkersVisible(activeCityTab === 'favorites');
  }

  function setPanelMode(nextMode = 'explore') {
    panelMode = nextMode === 'live-earth' ? 'live-earth' : 'explore';
    exploreModeBtn?.classList.toggle('active', panelMode === 'explore');
    liveEarthModeBtn?.classList.toggle('active', panelMode === 'live-earth');
    explorePanel?.classList.toggle('active', panelMode === 'explore');
    liveEarthPanel?.classList.toggle('active', panelMode === 'live-earth');
    if (explorePanel) explorePanel.hidden = panelMode !== 'explore';
    if (liveEarthPanel) liveEarthPanel.hidden = panelMode !== 'live-earth';
    document.querySelector('.globe-selector-hint')?.replaceChildren(
      document.createTextNode(
        panelMode === 'live-earth' ?
          'Drag to rotate · Scroll to zoom · Tap markers to inspect Live Earth layers' :
          'Drag to rotate · Scroll to zoom · Tap/Click to pick'
      )
    );
    if (appCtx.liveEarth && typeof appCtx.liveEarth.setPanelMode === 'function') {
      appCtx.liveEarth.setPanelMode(panelMode);
    }
    globeScene.setSelectionMarker(selected);
    globeScene.startRenderLoop();
    globeScene.renderFrame();
  }

  function renderFavoriteMarkers() {
    const favorites = buildFavoriteCitiesFromData({
      menuFavoriteCities: getMenuFavoriteCitiesFromLocs(appCtx.LOCS || {}),
      savedFavoriteCities
    });
    globeScene.renderFavoriteMarkers(favorites);
  }

  function setCityTab(nextTab) {
    activeCityTab = nextTab === 'favorites' ? 'favorites' : 'nearby';
    nearbyTabBtn?.classList.toggle('active', activeCityTab === 'nearby');
    favoritesTabBtn?.classList.toggle('active', activeCityTab === 'favorites');
    if (cityListHint) {
      cityListHint.textContent = activeCityTab === 'favorites' ?
      'Favorites list includes preset cities and your saved cities. Saved entries can be deleted.' :
      'Nearest mapped place plus closest saved custom locations.';
    }
    renderCityList();
    setFavoriteMarkersVisible();
  }

  function renderCityList() {
    if (!cityList) return;
    if (activeCityTab === 'nearby') {
      const list = nearbyCities;
      if (!Array.isArray(list) || list.length === 0) {
        cityList.innerHTML = '<li class="globe-selector-city-empty">Pick a point on the globe to see nearby cities.</li>';
        return;
      }
      cityList.innerHTML = list.map((city, index) => {
        const selectedClass = cityMatchesSelection(city) ? ' style="border-color:#667eea;background:#eef2ff"' : '';
        const isLive = city.source === 'live';
        const meta = Number.isFinite(city.distanceKm) ?
          `${isLive ? 'Nearest mapped place • ' : ''}${city.distanceKm.toFixed(0)} km away` :
          (isLive ? `Nearest mapped place • ${cityLocationLabel(city)}` : cityLocationLabel(city));
        return `<li class="globe-selector-city-item" data-city-source="nearby" data-city-index="${index}"${selectedClass}><div class="globe-selector-city-item-main"><span class="globe-selector-city-item-name">${city.name}</span><span class="globe-selector-city-item-meta">${meta}</span></div></li>`;
      }).join('');
      return;
    }

    const groups = getFavoriteCityGroupsFromData({
      menuFavoriteCities: getMenuFavoriteCitiesFromLocs(appCtx.LOCS || {}),
      savedFavoriteCities
    });
    favoritePresetList = groups.presets;
    favoriteSavedList = groups.saved;

    if (!favoritePresetList.length && !favoriteSavedList.length) {
      cityList.innerHTML = '<li class="globe-selector-city-empty">No favorite cities yet. Explore a location to save it.</li>';
      return;
    }

    const html = [];
    if (favoritePresetList.length) {
      html.push('<li class="globe-selector-city-section">Preset Cities</li>');
      favoritePresetList.forEach((city, index) => {
        const selectedClass = cityMatchesSelection(city) ? ' style="border-color:#667eea;background:#eef2ff"' : '';
        html.push(
          `<li class="globe-selector-city-item" data-city-source="preset" data-city-index="${index}"${selectedClass}><div class="globe-selector-city-item-main"><span class="globe-selector-city-item-name">${city.name}</span><span class="globe-selector-city-item-meta">${cityLocationLabel(city)}</span></div></li>`
        );
      });
    }

    html.push('<li class="globe-selector-city-section">Your Saved Favorites</li>');
    if (favoriteSavedList.length) {
      favoriteSavedList.forEach((city, index) => {
        const selectedClass = cityMatchesSelection(city) ? ' style="border-color:#667eea;background:#eef2ff"' : '';
        html.push(
          `<li class="globe-selector-city-item" data-city-source="saved" data-city-index="${index}"${selectedClass}><div class="globe-selector-city-item-main"><span class="globe-selector-city-item-name">${city.name}</span><span class="globe-selector-city-item-meta">${cityLocationLabel(city)}</span></div><button class="globe-selector-city-delete" type="button" data-delete-saved-index="${index}" aria-label="Delete saved favorite ${city.name}">Delete</button></li>`
        );
      });
    } else {
      html.push('<li class="globe-selector-city-empty">No saved favorites yet. Explore a location to save it.</li>');
    }
    cityList.innerHTML = html.join('');
  }

  function focusOnSelection(lat, lon) {
    globeScene.focusOnSelection(lat, lon);
  }

  function syncLegacyCustomState(next) {
    syncLegacyCustomSelection(appCtx, next);
  }

  function renderSelection() {
    if (!selected) {
      if (latLonReadout) latLonReadout.textContent = 'No point selected';
      if (placeReadout) placeReadout.textContent = 'Click the globe to choose a location.';
      globeScene.setSelectionMarker(null);
      nearbyCities = [];
      renderCityList();
      setStartButtonBusy(false);
      if (appCtx.liveEarth && typeof appCtx.liveEarth.onSelectorSelectionChanged === 'function') {
        appCtx.liveEarth.onSelectorSelectionChanged();
      }
      return;
    }

    if (latLonReadout) {
      latLonReadout.textContent = `${selected.lat.toFixed(6)}, ${selected.lon.toFixed(6)}`;
    }
    if (placeReadout) {
      placeReadout.textContent = selected.name || 'Selected from globe';
    }
    if (latInput) latInput.value = selected.lat.toFixed(6);
    if (lonInput) lonInput.value = selected.lon.toFixed(6);
    coordinateInputsDirty = false;

    globeScene.setSelectionMarker(selected);
    nearbyCities = buildNearbyCitiesFromData({
      savedFavoriteCities,
      liveNearbyCity,
      lat: selected.lat,
      lon: selected.lon
    });
    renderCityList();
    renderFavoriteMarkers();
    if (appCtx.liveEarth && typeof appCtx.liveEarth.onSelectorSelectionChanged === 'function') {
      appCtx.liveEarth.onSelectorSelectionChanged();
    }
    setStartButtonBusy(false);
  }

  function setLocateButtonBusy(isBusy) {
    if (!locateBtn) return;
    locateBtn.disabled = !!isBusy;
    locateBtn.textContent = isBusy ? 'Locating…' : 'Use My Location';
  }

  function setStartButtonBusy(isBusy) {
    if (!startBtn) return;
    startBtn.disabled = !!isBusy || !selected;
    startBtn.setAttribute('aria-busy', isBusy ? 'true' : 'false');
    startBtn.textContent = isBusy ? 'Loading...' : 'Explore';
  }

  function setSelection(lat, lon, meta = {}) {
    const clamped = clampLatLon(lat, lon);
    const coordsChanged = !selected ||
      Math.abs(selected.lat - clamped.lat) > 0.00001 ||
      Math.abs(selected.lon - clamped.lon) > 0.00001;
    if (coordsChanged) liveNearbyCity = null;
    const named = typeof meta.name === 'string' ? meta.name.trim() : '';
    selected = {
      lat: clamped.lat,
      lon: clamped.lon,
      name: named || selected?.name || appCtx.customLoc?.name || 'Custom Location',
      skipAutoFavorite: !!meta.skipAutoFavorite,
      fromGeolocation: !!meta.fromGeolocation
    };
    if (meta.focus) focusOnSelection(selected.lat, selected.lon);
    syncLegacyCustomState(selected);
    renderSelection();
  }

  function applySelectionAndResolve(lat, lon, meta = {}) {
    setSelection(lat, lon, {
      name: meta.name || selected?.name || appCtx.customLoc?.name || 'Custom Location',
      focus: meta.focus !== false,
      skipAutoFavorite: !!meta.skipAutoFavorite,
      fromGeolocation: !!meta.fromGeolocation
    });
    if (Number.isFinite(meta.zoomDistance)) globeScene.setCameraDistance(Number(meta.zoomDistance));
    if (searchInput && typeof meta.searchLabel === 'string' && meta.searchLabel.trim()) {
      searchInput.value = meta.searchLabel.trim();
    }
    if (selected) reverseLookupPlace(selected.lat, selected.lon);
  }

  async function reverseLookupPlace(lat, lon) {
    const requestToken = ++reverseLookupToken;
    const cacheKey = `${Number(lat).toFixed(3)},${Number(lon).toFixed(3)}`;
    const cached = reverseLookupCache.get(cacheKey);
    if (cached && selected && Math.abs(selected.lat - lat) <= 0.00001 && Math.abs(selected.lon - lon) <= 0.00001) {
      selected.name = cached.display;
      selected.locationDetails = cached.details || null;
      liveNearbyCity = normalizeCityRecord({
        key: 'live-nearby',
        name: cached.queryLabel || cached.display,
        lat,
        lon
      }, 'live');
      syncLegacyCustomState(selected);
      renderSelection();
      return;
    }
    try {
      const payload = await fetchReversePayload(lat, lon);
      if (!openState || requestToken !== reverseLookupToken || !selected) return;
      if (Math.abs(selected.lat - lat) > 0.00001 || Math.abs(selected.lon - lon) > 0.00001) return;

      const parsed = parseReverseAddress(payload);
      if (parsed.display) {
        reverseLookupCache.set(cacheKey, parsed);
        const payloadLat = toFiniteNumber(payload?.lat ?? payload?.latitude);
        const payloadLon = toFiniteNumber(payload?.lon ?? payload?.longitude);
        const liveCandidate = normalizeCityRecord({
          key: 'live-nearby',
          name: parsed.queryLabel || parsed.display,
          lat: payloadLat == null ? lat : payloadLat,
          lon: payloadLon == null ? lon : payloadLon
        }, 'live');
        if (liveCandidate) liveNearbyCity = liveCandidate;
        selected.name = parsed.display;
        selected.locationDetails = parsed.details;
        syncLegacyCustomState(selected);
        renderSelection();
        if (searchInput && !searchInput.value.trim()) searchInput.value = parsed.queryLabel || parsed.display;
      }
    } catch {
      if (!openState || requestToken !== reverseLookupToken || !selected) return;
      if (Math.abs(selected.lat - lat) > 0.00001 || Math.abs(selected.lon - lon) > 0.00001) return;
      const previousName = String(selected.name || '').trim();
      const preservePrevious =
        previousName &&
        !/^selected\s/i.test(previousName) &&
        !/^custom location/i.test(previousName) &&
        !/^current location/i.test(previousName);
      selected.name = preservePrevious ? previousName : `Remote Region ${lat.toFixed(2)}, ${lon.toFixed(2)}`;
      liveNearbyCity = normalizeCityRecord({
        key: 'live-nearby',
        name: selected.name || 'Remote Region',
        lat,
        lon
      }, 'live');
      syncLegacyCustomState(selected);
      renderSelection();
    }
  }

  async function runSearchFromOverlay() {
    const query = (searchInput?.value || '').trim();
    if (!query) {
      if (searchStatus) {
        searchStatus.textContent = 'Please enter a location.';
        searchStatus.style.color = '#dc2626';
      }
      return;
    }

    const legacyInput = document.getElementById('locationSearch');
    const legacyStatus = document.getElementById('locationSearchStatus');
    if (legacyInput) legacyInput.value = query;
    if (searchStatus) {
      searchStatus.textContent = 'Searching...';
      searchStatus.style.color = '#64748b';
    }

    try {
      if (typeof appCtx.searchLocation === 'function') {
        searchInFlight = true;
        if (searchBtn) searchBtn.disabled = true;
        await appCtx.searchLocation();
      } else {
        throw new Error('Search function unavailable');
      }

      const foundLat = toFiniteNumber(appCtx.customLoc?.lat ?? document.getElementById('customLat')?.value);
      const foundLon = toFiniteNumber(appCtx.customLoc?.lon ?? document.getElementById('customLon')?.value);
      if (foundLat != null && foundLon != null) {
        setSelection(foundLat, foundLon, {
          name: appCtx.customLoc?.name || query,
          focus: true
        });
        reverseLookupPlace(foundLat, foundLon);
      }

      if (searchStatus) {
        const legacyText = legacyStatus?.textContent || 'Search complete.';
        searchStatus.textContent = legacyText;
        const legacyColor = legacyStatus?.style?.color || '#64748b';
        searchStatus.style.color = legacyColor;
      }
    } catch (error) {
      if (searchStatus) {
        searchStatus.textContent = `Search failed: ${error?.message || error}`;
        searchStatus.style.color = '#dc2626';
      }
    } finally {
      searchInFlight = false;
      if (searchBtn) searchBtn.disabled = false;
    }
  }

  function applySelectionFromInputs() {
    const lat = toFiniteNumber(latInput?.value);
    const lon = toFiniteNumber(lonInput?.value);
    if (lat == null || lon == null || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      if (searchStatus) {
        searchStatus.textContent = 'Enter latitude from -90 to 90 and longitude from -180 to 180.';
        searchStatus.style.color = '#dc2626';
      }
      return false;
    }
    setSelection(lat, lon, { name: 'Manual Coordinates' });
    coordinateInputsDirty = false;
    reverseLookupPlace(lat, lon);
    return true;
  }

  const launchCoordinator = createGlobeSelectorLaunch({
    applyCoordinateSelection: applySelectionFromInputs,
    close,
    getSelection: () => selected,
    hasDirtyCoordinates: () => coordinateInputsDirty,
    isOpen: () => openState,
    onStartHere: options.onStartHere,
    prepareSelection(nextSelection) {
      if (!nextSelection.skipAutoFavorite) saveSelectionAsFavorite(nextSelection);
      renderFavoriteMarkers();
      renderCityList();
      syncLegacyCustomState(nextSelection);
    },
    setShortcutButtonsBusy(isBusy) {
      if (moonBtn) moonBtn.disabled = isBusy;
      if (spaceBtn) spaceBtn.disabled = isBusy;
    },
    setStartButtonBusy,
    setStatus(message, color) {
      if (!searchStatus) return;
      searchStatus.textContent = message;
      searchStatus.style.color = color;
    }
  });

  function triggerStartHere() {
    return launchCoordinator.startHere();
  }

  function bindLiveEarthBridge() {
    if (!appCtx.liveEarth || typeof appCtx.liveEarth.bindGlobeSelector !== 'function') return;
    appCtx.liveEarth.bindGlobeSelector({
      root,
      stage,
      canvas,
      ...globeScene.getBridgeRefs(),
      getSelection() {
        return selected ? { ...selected } : null;
      },
      isOpen() {
        return openState;
      },
      latLonToLocalPoint,
      setCameraDistance: globeScene.setCameraDistance,
      setSelection,
      applySelectionAndResolve,
      startHere: triggerStartHere,
      liveEarthUi: {
        exploreModeBtn,
        liveEarthModeBtn,
        explorePanel,
        liveEarthPanel,
        status: liveEarthStatus,
        categoryChips: liveEarthCategoryChips,
        layerList: liveEarthLayerList,
        details: liveEarthDetails,
        refreshBtn: liveEarthRefreshBtn,
        hint: document.querySelector('.globe-selector-hint')
      }
    });
  }

  function open() {
    if (openState) return;
    openState = true;
    document.body.classList.add('start-hub-open');
    setGlobeSelectorScrollLock(true);
    root.classList.add('show');
    root.setAttribute('aria-hidden', 'false');

    globeScene.init();
    bindLiveEarthBridge();
    globeScene.ensureSize();

    if (searchStatus) {
      searchStatus.textContent = 'Uses the same search flow as Custom Location.';
      searchStatus.style.color = '#64748b';
    }
    setLocateButtonBusy(false);
    setStartButtonBusy(false);
    savedFavoriteCities = loadSavedFavoriteCitiesFromStorage();
    setCityTab(activeCityTab);
    setPanelMode(panelMode);

    const savedLat = toFiniteNumber(appCtx.customLoc?.lat);
    const savedLon = toFiniteNumber(appCtx.customLoc?.lon);
    if (savedLat != null && savedLon != null) {
      setSelection(savedLat, savedLon, { name: appCtx.customLoc?.name || 'Custom Location', focus: true });
    } else {
      const selectedLoc = String(appCtx.selLoc || '').trim();
      const preset = selectedLoc && selectedLoc !== 'custom' ? appCtx.LOCS?.[selectedLoc] : null;
      const presetLat = toFiniteNumber(preset?.lat);
      const presetLon = toFiniteNumber(preset?.lon);
      if (presetLat != null && presetLon != null) {
        setSelection(presetLat, presetLon, { name: String(preset?.name || selectedLoc || 'Custom Location'), focus: true });
      } else {
        const fallback = buildFavoriteCitiesFromData({
          menuFavoriteCities: getMenuFavoriteCitiesFromLocs(appCtx.LOCS || {}),
          savedFavoriteCities
        })[0] || null;
        if (fallback) {
          setSelection(fallback.lat, fallback.lon, { name: fallback.name, focus: true });
        } else {
          selected = null;
          renderSelection();
        }
      }
    }

    if (searchInput) searchInput.value = appCtx.customLoc?.name || '';
    if (mobileSearchInput) mobileSearchInput.value = searchInput?.value || appCtx.customLoc?.name || '';
    if (selected) reverseLookupPlace(selected.lat, selected.lon);

    if (appCtx.liveEarth && typeof appCtx.liveEarth.onSelectorOpen === 'function') {
      appCtx.liveEarth.onSelectorOpen();
    }
    globeScene.startRenderLoop();
    globeScene.renderFrame();
    if (typeof options.onOpen === 'function') options.onOpen();
  }

  function close() {
    if (!openState) return;
    openState = false;
    document.body.classList.remove('start-hub-open');
    setGlobeSelectorScrollLock(false);
    reverseLookupToken += 1;
    root.classList.remove('show');
    root.setAttribute('aria-hidden', 'true');
    setLocateButtonBusy(false);
    launchCoordinator.cancel();
    if (appCtx.liveEarth && typeof appCtx.liveEarth.onSelectorClose === 'function') {
      appCtx.liveEarth.onSelectorClose();
    }
    globeScene.stopRenderLoop();
    globeScene.destroy();
    if (typeof options.onClose === 'function') options.onClose();
  }

  if (startBtn) startBtn.addEventListener('click', () => void triggerStartHere());
  if (backBtn) backBtn.addEventListener('click', () => {
    if (typeof options.onBack === 'function') options.onBack();
    close();
  });
  if (moonBtn) {
    moonBtn.addEventListener('click', () => void launchCoordinator.startEnvironment(options.onMoonShortcut, 'Moon'));
  }
  if (spaceBtn) {
    spaceBtn.addEventListener('click', () => void launchCoordinator.startEnvironment(options.onSpaceShortcut, 'Space'));
  }
  for (const coordinateInput of [latInput, lonInput]) {
    coordinateInput?.addEventListener('input', () => {
      coordinateInputsDirty = true;
    });
    coordinateInput?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      if (applySelectionFromInputs()) setStartButtonBusy(false);
    });
  }
  if (searchInput) {
    searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') searchInput.blur();
      if (event.key === 'Enter' && !searchInFlight) runSearchFromOverlay();
    });
  }
  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      if (!searchInFlight) runSearchFromOverlay();
    });
  }
  const runMobileSearch = () => {
    if (!searchInput || !mobileSearchInput || searchInFlight) return;
    searchInput.value = mobileSearchInput.value;
    runSearchFromOverlay();
  };
  mobileSearchBtn?.addEventListener('click', runMobileSearch);
  mobileSearchInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') mobileSearchInput.blur();
    if (event.key === 'Enter') {
      event.preventDefault();
      runMobileSearch();
    }
  });
  if (locateBtn) {
    locateBtn.addEventListener('click', () => {
      if (typeof options.onUseMyLocation === 'function') options.onUseMyLocation();
    });
  }
  if (exploreModeBtn) {
    exploreModeBtn.addEventListener('click', () => setPanelMode('explore'));
  }
  if (liveEarthModeBtn) {
    liveEarthModeBtn.addEventListener('click', () => setPanelMode('live-earth'));
  }
  if (nearbyTabBtn) {
    nearbyTabBtn.addEventListener('click', () => setCityTab('nearby'));
  }
  if (favoritesTabBtn) {
    favoritesTabBtn.addEventListener('click', () => setCityTab('favorites'));
  }
  if (cityList) {
    cityList.addEventListener('click', (event) => {
      const deleteBtn = event.target instanceof Element ? event.target.closest('[data-delete-saved-index]') : null;
      if (deleteBtn instanceof HTMLElement) {
        event.preventDefault();
        event.stopPropagation();
        const deleteIndex = Number.parseInt(deleteBtn.dataset.deleteSavedIndex || '', 10);
        if (!Number.isFinite(deleteIndex) || deleteIndex < 0 || deleteIndex >= favoriteSavedList.length) return;
        const cityToDelete = favoriteSavedList[deleteIndex];
        if (!cityToDelete) return;
        savedFavoriteCities = savedFavoriteCities.filter(
          (city) => Math.abs(city.lat - cityToDelete.lat) > 0.0005 || Math.abs(city.lon - cityToDelete.lon) > 0.0005
        );
        persistSavedFavoriteCitiesToStorage(savedFavoriteCities);
        renderFavoriteMarkers();
        renderCityList();
        if (searchStatus) {
          searchStatus.textContent = `Removed saved favorite: ${cityToDelete.name}`;
          searchStatus.style.color = '#64748b';
        }
        return;
      }

      const target = event.target instanceof Element ? event.target.closest('[data-city-source][data-city-index]') : null;
      if (!(target instanceof HTMLElement)) return;
      const index = Number.parseInt(target.dataset.cityIndex || '', 10);
      if (!Number.isFinite(index) || index < 0) return;
      const source = String(target.dataset.citySource || '');
      const city = source === 'nearby' ?
        nearbyCities[index] :
        source === 'preset' ?
          favoritePresetList[index] :
          source === 'saved' ?
            favoriteSavedList[index] :
            null;
      if (!city) return;
      setSelection(city.lat, city.lon, {
        name: city.name,
        focus: true
      });
      if (searchInput) searchInput.value = city.name;
    });
  }

  window.addEventListener('keydown', (event) => {
    if (!openState) return;
    if (event.key !== 'Escape') return;
    event.preventDefault();
    if (typeof options.onBack === 'function') options.onBack();
    close();
  });

  return {
    close,
    getSelection() {
      return selected ? { ...selected } : null;
    },
    isOpen() {
      return openState;
    },
    open,
    startHere: triggerStartHere,
    applySelectionAndResolve,
    setPanelMode,
    setSelection,
    setLocateButtonBusy,
    setSearchStatus(message, color = null) {
      if (!searchStatus) return;
      searchStatus.textContent = message || '';
      if (color) searchStatus.style.color = color;
    }
  };
}

Object.assign(appCtx, { createGlobeSelector });

export { createGlobeSelector };
