import { ctx as appCtx } from "../shared-context.js?v=55";
import { createGlobeSelectorScene } from './globe-selector/scene.js?v=17';
import { createGlobeSelectorLaunch } from './globe-selector/launch.js?v=2';
import { getGlobeSelectorElements } from './globe-selector/dom.js?v=2';
import { fetchNearbyCities, nearbyMajorCities } from './globe-selector/catalog.js?v=2';
import { bindCityListInteractions, renderNearbyCityItems, renderPresetCityItems } from './globe-selector/city-list-view.js?v=4';
import {
  addSelectionToSavedFavorites,
  addRecentPlace,
  buildFavoriteCities as buildFavoriteCitiesFromData,
  buildNearbyCities as buildNearbyCitiesFromData,
  cityMatchesGlobeSelection,
  clampLatLon,
  fetchReversePayload,
  getFavoriteCityGroups as getFavoriteCityGroupsFromData,
  getMenuFavoriteCities as getMenuFavoriteCitiesFromLocs,
  latLonToLocalPoint,
  localPointToLatLon,
  loadSavedFavoriteCities as loadSavedFavoriteCitiesFromStorage,
  loadRecentPlaces,
  normalizeCityRecord,
  parseReverseAddress,
  persistSavedFavoriteCities as persistSavedFavoriteCitiesToStorage,
  resolveCoordinateSurfaceEvidence,
  syncLegacyCustomSelection,
  setGlobeSelectorScrollLock,
  toFiniteNumber
} from "./globe-selector/helpers.js?v=9";

function createGlobeSelector(options = {}) {
  const {
    root, stage, canvas, zoomInBtn, zoomOutBtn, scaleReadout, latLonReadout, placeReadout, searchInput, mobileSearchInput,
    mobileSearchBtn, searchStatus, latInput, lonInput, startBtn, backBtn, moonBtn,
    spaceBtn, oceanBtn, searchBtn, locateBtn, exploreModeBtn, liveEarthModeBtn, explorePanel,
    liveEarthPanel, liveEarthStatus, liveEarthCategoryChips, liveEarthLayerList,
    liveEarthDetails, liveEarthRefreshBtn, nearbyTabBtn, favoritesTabBtn, saveFavoriteBtn,
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

  let openState = false, selected = null, searchInFlight = false;
  let selectionResolvePromise = Promise.resolve();
  let coordinateInputsDirty = false, reverseLookupToken = 0;
  let activeCityTab = 'nearby';
  let nearbyCities = [], mappedNearbyCities = [], liveNearbyCity = null;
  let favoritePresetList = [], favoriteSavedList = [], favoriteRecentList = [];
  let panelMode = 'explore';
  const reverseLookupCache = new Map();
  let nearbyLookupController = null, nearbyLookupToken = 0;
  let savedFavoriteCities = [], recentPlaces = [];

  const globeScene = createGlobeSelectorScene({
    appCtx,
    canvas,
    stage,
    zoomInBtn,
    zoomOutBtn,
    scaleReadout,
    placeReadout,
    getActiveCityTab: () => activeCityTab,
    getPanelMode: () => panelMode,
    getOpenState: () => openState,
    cityMatchesSelection,
    onFavoritePick(city) {
      setSelection(city.lat, city.lon, { name: city.name, focus: true, arrivalMode: 'walk' });
      if (searchInput) searchInput.value = city.name;
    },
    onFavoriteActivate(city) {
      setSelection(city.lat, city.lon, { name: city.name, focus: true, arrivalMode: 'walk' });
      if (searchInput) searchInput.value = city.name;
      void triggerStartHere();
    },
    onGlobePick(next, interaction = {}) {
      const fallbackName = `Selected ${next.lat.toFixed(2)}, ${next.lon.toFixed(2)}`;
      setSelection(next.lat, next.lon, { name: fallbackName, fetchNearby: true });
      beginReverseLookup(next.lat, next.lon);
      if (searchInput) searchInput.value = fallbackName;
      if (interaction.activate === true) void triggerStartHere();
    }
  });

  function saveSelectionAsFavorite(nextSelection) {
    savedFavoriteCities = addSelectionToSavedFavorites(nextSelection, savedFavoriteCities);
  }

  function getLibraryPresets() {
    return getMenuFavoriteCitiesFromLocs(appCtx.LOCS || {});
  }

  function selectionIsSaved() { return savedFavoriteCities.some((city) => cityMatchesGlobeSelection(selected, city)); }
  function cityMatchesSelection(city) { return cityMatchesGlobeSelection(selected, city); }
  function setFavoriteMarkersVisible() { globeScene.setFavoriteMarkersVisible(activeCityTab === 'favorites'); }

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
          `${globalThis.matchMedia?.('(pointer: coarse)')?.matches ? 'Drag to rotate · Pinch to zoom · Tap' : 'Drag to rotate · Scroll to zoom · Click'} markers to inspect Live Earth systems` :
          `${globalThis.matchMedia?.('(pointer: coarse)')?.matches ? 'Drag to rotate · Pinch to zoom · Tap' : 'Drag to rotate · Scroll to zoom · Click'} to pick`
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
      menuFavoriteCities: getLibraryPresets(),
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
      'The original World Explorer city presets. Double-click to explore.' :
      'Major cities within 100 miles of the selected point, from OpenStreetMap.';
    }
    renderCityList();
    setFavoriteMarkersVisible();
    if (activeCityTab === 'nearby' && selected) {
      void refreshNearbyCities(selected.lat, selected.lon);
    }
  }

  function renderCityList() {
    if (!cityList) return;
    if (activeCityTab === 'nearby') {
      renderNearbyCityItems(cityList, nearbyCities, cityMatchesSelection);
      return;
    }

    favoritePresetList = getFavoriteCityGroupsFromData({
      menuFavoriteCities: getLibraryPresets(),
      savedFavoriteCities: []
    }).presets;
    favoriteSavedList = [];
    renderPresetCityItems(cityList, favoritePresetList, cityMatchesSelection);
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
      if (saveFavoriteBtn) {
        saveFavoriteBtn.disabled = true;
        saveFavoriteBtn.textContent = '☆';
        saveFavoriteBtn.classList.remove('saved');
      }
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
    if (saveFavoriteBtn) {
      const saved = selectionIsSaved();
      saveFavoriteBtn.disabled = false;
      saveFavoriteBtn.textContent = saved ? '★' : '☆';
      saveFavoriteBtn.classList.toggle('saved', saved);
      saveFavoriteBtn.title = saved ? 'Remove selected place from favorites' : 'Add selected place to favorites';
      saveFavoriteBtn.setAttribute('aria-label', saveFavoriteBtn.title);
    }
    if (latInput) latInput.value = selected.lat.toFixed(6);
    if (lonInput) lonInput.value = selected.lon.toFixed(6);
    coordinateInputsDirty = false;

    globeScene.setSelectionMarker(selected);
    nearbyCities = buildNearbyCitiesFromData({
      mappedCities: mappedNearbyCities,
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
    if (coordsChanged) {
      liveNearbyCity = null;
      mappedNearbyCities = [];
      selectionResolvePromise = Promise.resolve();
    }
    const named = typeof meta.name === 'string' ? meta.name.trim() : '';
    selected = {
      lat: clamped.lat,
      lon: clamped.lon,
      name: named || selected?.name || appCtx.customLoc?.name || 'Custom Location',
      skipAutoFavorite: !!meta.skipAutoFavorite,
      fromGeolocation: !!meta.fromGeolocation,
      arrivalMode: meta.arrivalMode === 'walk' || meta.arrivalMode === 'boat'
        ? meta.arrivalMode
        : coordsChanged ? 'auto' : selected?.arrivalMode || 'auto',
      waterKind: coordsChanged ? null : meta.waterKind || selected?.waterKind || null,
      countryCode: coordsChanged ? null : meta.countryCode || selected?.countryCode || null,
      locationDetails: coordsChanged ? null : meta.locationDetails || selected?.locationDetails || null,
      surfaceEvidence: coordsChanged
        ? null
        : meta.surfaceEvidence || selected?.surfaceEvidence || null
    };
    if (meta.focus) focusOnSelection(selected.lat, selected.lon);
    syncLegacyCustomState(selected);
    renderSelection();
    if (coordsChanged && meta.fetchNearby === true) {
      void refreshNearbyCities(selected.lat, selected.lon);
    }
  }
  async function refreshNearbyCities(lat, lon) {
    const token = ++nearbyLookupToken;
    nearbyLookupController?.abort();
    nearbyLookupController = new AbortController();
    mappedNearbyCities = nearbyMajorCities(lat, lon); nearbyCities = buildNearbyCitiesFromData({ mappedCities: mappedNearbyCities, liveNearbyCity, lat, lon }); renderCityList();
    if (activeCityTab === 'nearby' && cityListHint) cityListHint.textContent = 'Finding nearby cities and towns…';
    try {
      const cities = await fetchNearbyCities(lat, lon, { signal: nearbyLookupController.signal });
      if (!openState || token !== nearbyLookupToken || !selected) return;
      if (Math.abs(selected.lat - lat) > 0.00001 || Math.abs(selected.lon - lon) > 0.00001) return;
      mappedNearbyCities = cities;
      nearbyCities = buildNearbyCitiesFromData({ mappedCities: mappedNearbyCities, liveNearbyCity, lat, lon });
      if (activeCityTab === 'nearby' && cityListHint) cityListHint.textContent = 'Nearby cities and towns from OpenStreetMap.';
      renderCityList();
    } catch (error) {
      if (error?.name === 'AbortError' || token !== nearbyLookupToken) return;
      if (activeCityTab === 'nearby' && cityListHint) cityListHint.textContent = 'Showing the nearest mapped area; live nearby cities are temporarily unavailable.';
    }
  }

  function applySelectionAndResolve(lat, lon, meta = {}) {
    setSelection(lat, lon, {
      name: meta.name || selected?.name || appCtx.customLoc?.name || 'Custom Location',
      focus: meta.focus !== false,
      skipAutoFavorite: !!meta.skipAutoFavorite,
      fromGeolocation: !!meta.fromGeolocation,
      fetchNearby: true
    });
    if (Number.isFinite(meta.zoomDistance)) globeScene.setCameraDistance(Number(meta.zoomDistance));
    if (searchInput && typeof meta.searchLabel === 'string' && meta.searchLabel.trim()) {
      searchInput.value = meta.searchLabel.trim();
    }
    if (selected) beginReverseLookup(selected.lat, selected.lon);
  }

  function beginReverseLookup(lat, lon) {
    const lookup = reverseLookupPlace(lat, lon);
    selectionResolvePromise = Promise.resolve(lookup).catch(() => null);
    return selectionResolvePromise;
  }

  async function reverseLookupPlace(lat, lon) {
    const requestToken = ++reverseLookupToken;
    const cacheKey = `${Number(lat).toFixed(3)},${Number(lon).toFixed(3)}`;
    const cached = reverseLookupCache.get(cacheKey);
    if (cached && selected && Math.abs(selected.lat - lat) <= 0.00001 && Math.abs(selected.lon - lon) <= 0.00001) {
      selected.name = cached.display;
      selected.locationDetails = cached.details || null;
      selected.countryCode = cached.details?.countryCode || null;
      selected.surfaceEvidence = cached.surfaceEvidence || null;
      selected.waterKind = cached.surfaceEvidence?.kind === 'open_ocean' ? 'open_ocean' : null;
      selected.arrivalMode = selected.waterKind ? 'boat' : 'auto';
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
      parsed.surfaceEvidence = await resolveCoordinateSurfaceEvidence(lat, lon, payload);
      parsed.waterKind = parsed.surfaceEvidence?.kind === 'open_ocean' ? 'open_ocean' : null;
      if (parsed.waterKind) {
        parsed.details = {
          ...(parsed.details || {}),
          waterKind: parsed.waterKind,
          surfaceEvidence: parsed.surfaceEvidence
        };
        parsed.display ||= `Open Ocean ${lat.toFixed(2)}, ${lon.toFixed(2)}`;
        parsed.queryLabel ||= 'Open Ocean';
      } else {
        parsed.details = {
          ...(parsed.details || {}),
          waterKind: null,
          surfaceEvidence: parsed.surfaceEvidence
        };
      }
      if (!openState || requestToken !== reverseLookupToken || !selected) return;
      if (Math.abs(selected.lat - lat) > 0.00001 || Math.abs(selected.lon - lon) > 0.00001) return;
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
        selected.countryCode = parsed.details?.countryCode || null;
        selected.surfaceEvidence = parsed.surfaceEvidence || null;
        selected.waterKind = parsed.waterKind || null;
        selected.arrivalMode = parsed.waterKind ? 'boat' : 'auto';
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
        const result = await appCtx.searchLocation();
        if (!result || !Number.isFinite(result.lat) || !Number.isFinite(result.lon)) {
          throw new Error(legacyStatus?.textContent || 'Location was not found');
        }
        setSelection(result.lat, result.lon, {
          name: result.name || query,
          focus: true,
          fetchNearby: true,
          arrivalMode: result.arrivalMode || 'walk'
        });
        beginReverseLookup(result.lat, result.lon);
      } else {
        throw new Error('Search function unavailable');
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
    setSelection(lat, lon, { name: 'Manual Coordinates', fetchNearby: true });
    coordinateInputsDirty = false;
    beginReverseLookup(lat, lon);
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
      recentPlaces = addRecentPlace(nextSelection, recentPlaces);
      favoriteRecentList = recentPlaces;
      renderFavoriteMarkers();
      renderCityList();
      syncLegacyCustomState(nextSelection);
    },
    setShortcutButtonsBusy(isBusy) {
      if (moonBtn) moonBtn.disabled = isBusy;
      if (spaceBtn) spaceBtn.disabled = isBusy;
      if (oceanBtn) oceanBtn.disabled = isBusy;
    },
    setStartButtonBusy,
    setStatus(message, color) {
      if (!searchStatus) return;
      searchStatus.textContent = message;
      searchStatus.style.color = color;
    }
  });

  async function triggerStartHere() {
    if (coordinateInputsDirty && !applySelectionFromInputs()) return false;
    await selectionResolvePromise;
    return launchCoordinator.startHere();
  }

  function startSelectedOcean() {
    if (coordinateInputsDirty && !applySelectionFromInputs()) {
      return Promise.resolve(false);
    }
    if (!selected) {
      if (searchStatus) {
        searchStatus.textContent = 'Choose an ocean point on the globe first.';
        searchStatus.style.color = '#dc2626';
      }
      return Promise.resolve(false);
    }
    setSelection(selected.lat, selected.lon, {
      name: selected.name,
      arrivalMode: 'boat'
    });
    if (typeof options.onOceanShortcut === 'function') {
      recentPlaces = addRecentPlace(selected, recentPlaces);
      favoriteRecentList = recentPlaces;
      syncLegacyCustomState(selected);
      return launchCoordinator.startEnvironment(
        () => options.onOceanShortcut({ ...selected }),
        'Ocean'
      );
    }
    return triggerStartHere();
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
      localPointToLatLon,
      getCameraDistance: globeScene.getCameraDistance,
      getPointHitThresholdWorld: globeScene.getPointHitThresholdWorld,
      getRenderStats: globeScene.getRenderStats,
      getZoomState: globeScene.getZoomState,
      projectLatLonToClient: globeScene.projectLatLonToClient,
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
      searchStatus.textContent = 'Search for a place or choose one from the globe.';
      searchStatus.style.color = '#64748b';
    }
    setLocateButtonBusy(false);
    setStartButtonBusy(false);
    savedFavoriteCities = loadSavedFavoriteCitiesFromStorage();
    recentPlaces = loadRecentPlaces();
    favoriteRecentList = recentPlaces;
    setCityTab(activeCityTab);
    setPanelMode(panelMode);

    const savedLat = toFiniteNumber(appCtx.customLoc?.lat);
    const savedLon = toFiniteNumber(appCtx.customLoc?.lon);
    if (savedLat != null && savedLon != null) {
      setSelection(savedLat, savedLon, {
        name: appCtx.customLoc?.name || 'Custom Location',
        focus: true,
        arrivalMode: appCtx.customLoc?.arrivalMode || 'auto'
      });
    } else {
      const selectedLoc = String(appCtx.selLoc || '').trim();
      const preset = selectedLoc && selectedLoc !== 'custom' ? appCtx.LOCS?.[selectedLoc] : null;
      const presetLat = toFiniteNumber(preset?.lat);
      const presetLon = toFiniteNumber(preset?.lon);
      if (presetLat != null && presetLon != null) {
        setSelection(presetLat, presetLon, {
          name: String(preset?.name || selectedLoc || 'Custom Location'),
          focus: true,
          arrivalMode: 'walk'
        });
      } else {
        const fallback = buildFavoriteCitiesFromData({
          menuFavoriteCities: getLibraryPresets(),
          savedFavoriteCities
        })[0] || null;
        if (fallback) {
          setSelection(fallback.lat, fallback.lon, { name: fallback.name, focus: true, arrivalMode: 'walk' });
        } else {
          selected = null;
          renderSelection();
        }
      }
    }

    if (searchInput) searchInput.value = appCtx.customLoc?.name || '';
    if (mobileSearchInput) mobileSearchInput.value = searchInput?.value || appCtx.customLoc?.name || '';
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
    nearbyLookupToken += 1;
    nearbyLookupController?.abort();
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
  moonBtn?.addEventListener('click', () => void launchCoordinator.startEnvironment(options.onMoonShortcut, 'Moon'));
  spaceBtn?.addEventListener('click', () => void launchCoordinator.startEnvironment(options.onSpaceShortcut, 'Space'));
  oceanBtn?.addEventListener('click', () => void startSelectedOcean());
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
  exploreModeBtn?.addEventListener('click', () => setPanelMode('explore'));
  liveEarthModeBtn?.addEventListener('click', () => setPanelMode('live-earth'));
  nearbyTabBtn?.addEventListener('click', () => setCityTab('nearby'));
  favoritesTabBtn?.addEventListener('click', () => setCityTab('favorites'));
  saveFavoriteBtn?.addEventListener('click', () => {
    if (!selected) return;
    if (selectionIsSaved()) {
      savedFavoriteCities = savedFavoriteCities.filter((city) => !cityMatchesGlobeSelection(selected, city));
      persistSavedFavoriteCitiesToStorage(savedFavoriteCities);
    } else {
      saveSelectionAsFavorite(selected);
    }
    renderSelection();
    renderFavoriteMarkers();
  });
  bindCityListInteractions(cityList, {
    getLists: () => ({ nearby: nearbyCities, preset: favoritePresetList, saved: favoriteSavedList, recent: favoriteRecentList }),
    getSavedCities: () => favoriteSavedList,
    onDelete(cityToDelete) {
      savedFavoriteCities = savedFavoriteCities.filter((city) => !cityMatchesGlobeSelection(city, cityToDelete));
      persistSavedFavoriteCitiesToStorage(savedFavoriteCities);
      renderFavoriteMarkers();
      renderCityList();
      if (searchStatus) searchStatus.textContent = `Removed saved favorite: ${cityToDelete.name}`;
    },
    onSelect(city) {
      setSelection(city.lat, city.lon, { name: city.name, focus: true, arrivalMode: 'walk' });
      if (searchInput) searchInput.value = city.name;
    },
    onActivate(city) {
      setSelection(city.lat, city.lon, { name: city.name, focus: true, arrivalMode: 'walk' });
      if (searchInput) searchInput.value = city.name;
      void triggerStartHere();
    }
  });

  window.addEventListener('keydown', (event) => {
    if (!openState) return;
    if (event.key !== 'Escape') return;
    event.preventDefault();
    if (typeof options.onBack === 'function') options.onBack();
    close();
  });

  return {
    close,
    getSelection() { return selected ? { ...selected } : null; },
    isOpen() { return openState; },
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
