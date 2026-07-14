import { ctx as appCtx } from "../shared-context.js?v=55";
import {
  createAuxiliaryRenderer,
  disposeThreeObjectTree,
  disposeThreeRenderer
} from "../engine/webgl-lifecycle.js?v=1";
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
  localPointToLatLon,
  normalizeCityRecord,
  parseReverseAddress,
  persistSavedFavoriteCities as persistSavedFavoriteCitiesToStorage,
  syncLegacyCustomSelection,
  setGlobeSelectorScrollLock,
  toFiniteNumber
} from "./globe-selector/helpers.js?v=1";

function createGlobeSelector(options = {}) {
  const root = document.getElementById('globeSelectorScreen');
  const stage = document.querySelector('.globe-selector-stage');
  const canvas = document.getElementById('globeSelectorCanvas');
  const latLonReadout = document.getElementById('globeSelectorLatLon');
  const placeReadout = document.getElementById('globeSelectorPlace');
  const searchInput = document.getElementById('globeLocationSearch');
  const searchStatus = document.getElementById('globeLocationSearchStatus');
  const latInput = document.getElementById('globeCustomLat');
  const lonInput = document.getElementById('globeCustomLon');
  const startBtn = document.getElementById('globeSelectorStartBtn');
  const backBtn = document.getElementById('globeSelectorBackBtn');
  const moonBtn = document.getElementById('globeSelectorMoonBtn');
  const spaceBtn = document.getElementById('globeSelectorSpaceBtn');
  const searchBtn = document.getElementById('globeLocationSearchBtn');
  const locateBtn = document.getElementById('globeSelectorLocateBtn');
  const exploreModeBtn = document.getElementById('globeSelectorExploreModeBtn');
  const liveEarthModeBtn = document.getElementById('globeSelectorLiveEarthModeBtn');
  const explorePanel = document.getElementById('globeSelectorExplorePanel');
  const liveEarthPanel = document.getElementById('globeSelectorLiveEarthPanel');
  const liveEarthStatus = document.getElementById('globeLiveEarthStatus');
  const liveEarthCategoryChips = document.getElementById('globeLiveEarthCategoryChips');
  const liveEarthLayerList = document.getElementById('globeLiveEarthLayerList');
  const liveEarthDetails = document.getElementById('globeLiveEarthDetails');
  const liveEarthRefreshBtn = document.getElementById('globeLiveEarthRefreshBtn');
  const nearbyTabBtn = document.getElementById('globeNearbyTabBtn');
  const favoritesTabBtn = document.getElementById('globeFavoritesTabBtn');
  const cityListHint = document.getElementById('globeCityListHint');
  const cityList = document.getElementById('globeCityList');

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
  let renderLoopId = 0;
  let sceneReady = false;
  let searchInFlight = false;
  let reverseLookupToken = 0;
  let activeCityTab = 'nearby';
  let nearbyCities = [];
  let liveNearbyCity = null;
  let favoritePresetList = [];
  let favoriteSavedList = [];
  let panelMode = 'explore';
  const reverseLookupCache = new Map();

  let scene = null;
  let camera = null;
  let renderer = null;
  let globeRoot = null;
  let earthMesh = null;
  let markerMesh = null;
  let raycaster = null;
  let favoriteMarkerGroup = null;
  let favoriteMarkerGeometry = null;
  let menuFavoriteMaterial = null;
  let savedFavoriteMaterial = null;
  let favoriteMarkerNodes = [];

  let savedFavoriteCities = [];

  let cameraDistance = 2.8;
  const minDistance = 1.35;
  const maxDistance = 4.4;

  let pointerActive = false;
  let pointerDragDistance = 0;
  let pointerDownX = 0;
  let pointerDownY = 0;
  let pointerDownTime = 0;
  let dragLastX = 0;
  let dragLastY = 0;

  function saveSelectionAsFavorite(nextSelection) {
    savedFavoriteCities = addSelectionToSavedFavorites(nextSelection, savedFavoriteCities);
  }

  function cityMatchesSelection(city) {
    return cityMatchesGlobeSelection(selected, city);
  }

  function setFavoriteMarkersVisible() {
    if (!favoriteMarkerGroup) return;
    favoriteMarkerGroup.visible = activeCityTab === 'favorites';
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
  }

  function renderFavoriteMarkers() {
    if (!favoriteMarkerGroup || !favoriteMarkerGeometry || !menuFavoriteMaterial || !savedFavoriteMaterial) return;
    while (favoriteMarkerGroup.children.length) {
      favoriteMarkerGroup.remove(favoriteMarkerGroup.children[0]);
    }
    favoriteMarkerNodes = [];
    const favorites = buildFavoriteCitiesFromData({
      menuFavoriteCities: getMenuFavoriteCitiesFromLocs(appCtx.LOCS || {}),
      savedFavoriteCities
    });
    favorites.forEach((city) => {
      const marker = new THREE.Mesh(
        favoriteMarkerGeometry,
        city.source === 'saved' ? savedFavoriteMaterial : menuFavoriteMaterial
      );
      const position = latLonToLocalPoint(city.lat, city.lon, 1.018);
      marker.position.set(position.x, position.y, position.z);
      marker.userData.favoriteCity = city;
      favoriteMarkerGroup.add(marker);
      favoriteMarkerNodes.push({ city, mesh: marker });
    });
    applyMarkerScales();
    setFavoriteMarkersVisible();
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
      cityList.innerHTML = '<li class="globe-selector-city-empty">No favorite cities yet. Save one with Start Here.</li>';
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
      html.push('<li class="globe-selector-city-empty">No saved favorites yet. Use Start Here to save this location.</li>');
    }
    cityList.innerHTML = html.join('');
  }

  function focusOnSelection(lat, lon) {
    if (!globeRoot) return;
    const latRad = lat * Math.PI / 180;
    const lonRad = lon * Math.PI / 180;
    // Camera sits on +Z looking toward origin; to center selected longitude on
    // the front hemisphere we need lon + rotY = -90deg.
    globeRoot.rotation.y = -(lonRad + Math.PI * 0.5);
    globeRoot.rotation.x = Math.max(-1.2, Math.min(1.2, latRad));
  }

  function syncLegacyCustomState(next) {
    syncLegacyCustomSelection(appCtx, next);
  }

  function renderSelection() {
    if (!selected) {
      if (latLonReadout) latLonReadout.textContent = 'No point selected';
      if (placeReadout) placeReadout.textContent = 'Click the globe to choose a location.';
      if (markerMesh) markerMesh.visible = false;
      nearbyCities = [];
      renderCityList();
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

    if (markerMesh) {
      const p = latLonToLocalPoint(selected.lat, selected.lon, 1.02);
      markerMesh.position.set(p.x, p.y, p.z);
      markerMesh.visible = true;
    }
    applyMarkerScales();
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
  }

  function setLocateButtonBusy(isBusy) {
    if (!locateBtn) return;
    locateBtn.disabled = !!isBusy;
    locateBtn.textContent = isBusy ? 'Locating…' : 'Use My Location';
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
    if (Number.isFinite(meta.zoomDistance) && camera) {
      cameraDistance = Math.max(minDistance, Math.min(maxDistance, Number(meta.zoomDistance)));
      camera.position.z = cameraDistance;
      camera.updateProjectionMatrix();
    }
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

  function ensureRendererSize() {
    if (!renderer || !camera) return;
    const bounds = stage?.getBoundingClientRect();
    const width = Math.max(1, Math.floor(bounds?.width || canvas.clientWidth || 1));
    const height = Math.max(1, Math.floor(bounds?.height || canvas.clientHeight || 1));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    applyMarkerScales();
  }

  function getMarkerScale() {
    const zoomScale = cameraDistance / 2.8;
    return Math.max(0.34, Math.min(1.0, zoomScale));
  }

  function applyMarkerScales() {
    const zoomScale = getMarkerScale();
    if (markerMesh) markerMesh.scale.setScalar(zoomScale);
    favoriteMarkerNodes.forEach((entry) => {
      const selectedScale = cityMatchesSelection(entry.city) ? 1.26 : 1.0;
      entry.mesh.scale.setScalar(selectedScale * zoomScale);
    });
  }

  function renderFrame() {
    if (!openState) return;
    if (appCtx.liveEarth && typeof appCtx.liveEarth.updateSelectorFrame === 'function') {
      appCtx.liveEarth.updateSelectorFrame();
    }
    applyMarkerScales();
    if (renderer && scene && camera) renderer.render(scene, camera);
  }

  function loopRender() {
    if (!openState) {
      renderLoopId = 0;
      return;
    }
    renderFrame();
    renderLoopId = requestAnimationFrame(loopRender);
  }

  function startRenderLoop() {
    if (renderLoopId || !sceneReady) return;
    renderLoopId = requestAnimationFrame(loopRender);
  }

  function stopRenderLoop() {
    if (!renderLoopId) return;
    cancelAnimationFrame(renderLoopId);
    renderLoopId = 0;
  }

  function destroyGlobeScene() {
    stopRenderLoop();
    favoriteMarkerNodes = [];
    sceneReady = false;
    if (scene) {
      disposeThreeObjectTree(scene);
    }
    renderer = disposeThreeRenderer(renderer);
    scene = null;
    camera = null;
    globeRoot = null;
    earthMesh = null;
    markerMesh = null;
    raycaster = null;
    favoriteMarkerGroup = null;
    favoriteMarkerGeometry = null;
    menuFavoriteMaterial = null;
    savedFavoriteMaterial = null;
  }

  function handlePick(clientX, clientY) {
    if (!renderer || !camera || !raycaster || !earthMesh) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const ndc = {
      x: (clientX - rect.left) / rect.width * 2 - 1,
      y: -((clientY - rect.top) / rect.height) * 2 + 1
    };
    raycaster.setFromCamera(ndc, camera);
    if (activeCityTab === 'favorites' && favoriteMarkerNodes.length > 0) {
      const markerHits = raycaster.intersectObjects(favoriteMarkerNodes.map((entry) => entry.mesh), false);
      const markerHit = markerHits && markerHits.length ? markerHits[0] : null;
      const favoriteCity = markerHit?.object?.userData?.favoriteCity || null;
      if (favoriteCity) {
        setSelection(favoriteCity.lat, favoriteCity.lon, {
          name: favoriteCity.name,
          focus: true
        });
        if (searchInput) searchInput.value = favoriteCity.name;
        return;
      }
    }
    if (appCtx.liveEarth && typeof appCtx.liveEarth.handleGlobePick === 'function' && appCtx.liveEarth.handleGlobePick(raycaster)) {
      return;
    }
    const hits = raycaster.intersectObject(earthMesh, false);
    if (!hits || hits.length === 0) return;

    const localPoint = hits[0].point.clone();
    earthMesh.worldToLocal(localPoint);
    const next = localPointToLatLon(localPoint);
    const fallbackName = `Selected ${next.lat.toFixed(2)}, ${next.lon.toFixed(2)}`;
    setSelection(next.lat, next.lon, { name: fallbackName });
    reverseLookupPlace(next.lat, next.lon);
    if (searchInput) searchInput.value = fallbackName;
  }

  function initGlobeScene() {
    if (scene || !canvas || typeof THREE === 'undefined') {
      if (typeof THREE === 'undefined' && placeReadout) {
        placeReadout.textContent = 'Three.js not ready. You can still use manual search.';
      }
      return;
    }

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(42, 1, 0.1, 20);
    camera.position.set(0, 0, cameraDistance);

    renderer = createAuxiliaryRenderer({
      canvas,
      pixelRatioCap: 1.5,
      optionsList: [
        {
          antialias: true,
          alpha: true,
          powerPreference: 'low-power'
        },
        {
          antialias: false,
          alpha: true,
          powerPreference: 'low-power'
        },
        {
          antialias: false,
          alpha: true
        }
      ]
    });
    if (!renderer) {
      renderer = null;
      scene = null;
      camera = null;
      globeRoot = null;
      earthMesh = null;
      markerMesh = null;
      raycaster = null;
      sceneReady = false;
      if (placeReadout) {
        placeReadout.textContent = '3D globe unavailable on this device. You can still use search and coordinates.';
      }
      return;
    }
    if (typeof renderer.outputColorSpace !== 'undefined' && typeof THREE.SRGBColorSpace !== 'undefined') {
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    } else if (typeof renderer.outputEncoding !== 'undefined' && typeof THREE.sRGBEncoding !== 'undefined') {
      renderer.outputEncoding = THREE.sRGBEncoding;
    }

    const ambient = new THREE.AmbientLight(0xffffff, 1.15);
    scene.add(ambient);
    const hemi = new THREE.HemisphereLight(0xe7f3ff, 0x8aa6c9, 0.45);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.05);
    sun.position.set(2.2, 1.6, 1.3);
    scene.add(sun);

    globeRoot = new THREE.Group();
    scene.add(globeRoot);

    const earthMaterial = new THREE.MeshStandardMaterial({
      color: 0x2f6fbb,
      roughness: 0.95,
      metalness: 0.0,
      emissive: new THREE.Color(0x1b2b44),
      emissiveIntensity: 0.12
    });
    earthMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), earthMaterial);
    globeRoot.add(earthMesh);

    markerMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 14, 12),
      new THREE.MeshBasicMaterial({ color: 0xff3b30 })
    );
    markerMesh.visible = false;
    globeRoot.add(markerMesh);

    favoriteMarkerGroup = new THREE.Group();
    favoriteMarkerGeometry = new THREE.SphereGeometry(0.009, 10, 9);
    menuFavoriteMaterial = new THREE.MeshBasicMaterial({ color: 0x60a5fa });
    savedFavoriteMaterial = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
    globeRoot.add(favoriteMarkerGroup);

    try {
      const loader = new THREE.TextureLoader();
      loader.load(
        '/app/assets/textures/earth_atmos_2048.jpg',
        (texture) => {
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.ClampToEdgeWrapping;
          if (typeof texture.colorSpace !== 'undefined' && typeof THREE.SRGBColorSpace !== 'undefined') {
            texture.colorSpace = THREE.SRGBColorSpace;
          } else if (typeof texture.encoding !== 'undefined' && typeof THREE.sRGBEncoding !== 'undefined') {
            texture.encoding = THREE.sRGBEncoding;
          }
          if (renderer?.capabilities && Number.isFinite(renderer.capabilities.getMaxAnisotropy?.())) {
            texture.anisotropy = Math.max(1, Math.min(8, renderer.capabilities.getMaxAnisotropy()));
          }
          earthMaterial.map = texture;
          earthMaterial.emissiveMap = texture;
          earthMaterial.emissiveIntensity = 0.28;
          earthMaterial.color.setHex(0xffffff);
          earthMaterial.needsUpdate = true;
        },
        undefined,
        () => {
          // Keep blue fallback material if texture fetch fails.
        }
      );
    } catch {
      // Keep fallback material.
    }

    raycaster = new THREE.Raycaster();
    ensureRendererSize();
    renderFavoriteMarkers();
    applyMarkerScales();

    canvas.addEventListener('pointerdown', (event) => {
      pointerActive = true;
      pointerDragDistance = 0;
      pointerDownX = event.clientX;
      pointerDownY = event.clientY;
      pointerDownTime = performance.now();
      dragLastX = event.clientX;
      dragLastY = event.clientY;
      canvas.setPointerCapture?.(event.pointerId);
    });

    canvas.addEventListener('pointermove', (event) => {
      if (!pointerActive || !globeRoot) return;
      const dx = event.clientX - dragLastX;
      const dy = event.clientY - dragLastY;
      dragLastX = event.clientX;
      dragLastY = event.clientY;
      pointerDragDistance += Math.hypot(dx, dy);
      globeRoot.rotation.y += dx * 0.0055;
      globeRoot.rotation.x += dy * 0.0038;
      globeRoot.rotation.x = Math.max(-1.2, Math.min(1.2, globeRoot.rotation.x));
    });

    canvas.addEventListener('pointerup', (event) => {
      if (!pointerActive) return;
      pointerActive = false;
      canvas.releasePointerCapture?.(event.pointerId);
      const tapDist = Math.hypot(event.clientX - pointerDownX, event.clientY - pointerDownY);
      const tapTime = performance.now() - pointerDownTime;
      const looksLikeTap = pointerDragDistance < 7 && tapDist < 7 && tapTime < 420;
      if (looksLikeTap) handlePick(event.clientX, event.clientY);
    });

    canvas.addEventListener('pointercancel', () => {
      pointerActive = false;
    });

    canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      const delta = Math.sign(event.deltaY || 0);
      cameraDistance += delta * 0.16;
      cameraDistance = Math.max(minDistance, Math.min(maxDistance, cameraDistance));
      camera.position.z = cameraDistance;
    }, { passive: false });

    window.addEventListener('resize', () => {
      ensureRendererSize();
    });
    sceneReady = true;
  }

  function applySelectionFromInputs() {
    const lat = toFiniteNumber(latInput?.value);
    const lon = toFiniteNumber(lonInput?.value);
    if (lat == null || lon == null) return false;
    setSelection(lat, lon, { name: selected?.name || appCtx.customLoc?.name || 'Manual Coordinates' });
    reverseLookupPlace(lat, lon);
    return true;
  }

  function bindLiveEarthBridge() {
    if (!appCtx.liveEarth || typeof appCtx.liveEarth.bindGlobeSelector !== 'function') return;
    appCtx.liveEarth.bindGlobeSelector({
      root,
      stage,
      canvas,
      globeRoot,
      earthMesh,
      getSelection() {
        return selected ? { ...selected } : null;
      },
      isOpen() {
        return openState;
      },
      latLonToLocalPoint,
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
    setGlobeSelectorScrollLock(true);
    root.classList.add('show');
    root.setAttribute('aria-hidden', 'false');

    initGlobeScene();
    bindLiveEarthBridge();
    ensureRendererSize();

    if (searchStatus) {
      searchStatus.textContent = 'Uses the same search flow as Custom Location.';
      searchStatus.style.color = '#64748b';
    }
    setLocateButtonBusy(false);
    savedFavoriteCities = loadSavedFavoriteCitiesFromStorage();
    setCityTab(activeCityTab);
    setPanelMode(panelMode);

    const savedLat = toFiniteNumber(appCtx.customLoc?.lat ?? document.getElementById('customLat')?.value);
    const savedLon = toFiniteNumber(appCtx.customLoc?.lon ?? document.getElementById('customLon')?.value);
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

    if (appCtx.liveEarth && typeof appCtx.liveEarth.onSelectorOpen === 'function') {
      appCtx.liveEarth.onSelectorOpen();
    }
    startRenderLoop();
    renderFrame();
    if (typeof options.onOpen === 'function') options.onOpen();
  }

  function close() {
    if (!openState) return;
    openState = false;
    setGlobeSelectorScrollLock(false);
    pointerActive = false;
    pointerDragDistance = 0;
    reverseLookupToken += 1;
    root.classList.remove('show');
    root.setAttribute('aria-hidden', 'true');
    setLocateButtonBusy(false);
    if (appCtx.liveEarth && typeof appCtx.liveEarth.onSelectorClose === 'function') {
      appCtx.liveEarth.onSelectorClose();
    }
    stopRenderLoop();
    destroyGlobeScene();
    if (typeof options.onClose === 'function') options.onClose();
  }

  function triggerStartHere() {
    if (!selected && !applySelectionFromInputs()) {
      if (searchStatus) {
        searchStatus.textContent = 'Select a point on the globe or enter valid coordinates first.';
        searchStatus.style.color = '#dc2626';
      }
      return;
    }
    if (!selected?.skipAutoFavorite) {
      saveSelectionAsFavorite(selected);
    }
    renderFavoriteMarkers();
    renderCityList();
    syncLegacyCustomState(selected);
    if (typeof options.onStartHere === 'function') options.onStartHere({ ...selected });
  }

  if (startBtn) startBtn.addEventListener('click', triggerStartHere);
  if (backBtn) backBtn.addEventListener('click', () => {
    if (typeof options.onBack === 'function') options.onBack();
    close();
  });
  if (moonBtn) {
    moonBtn.addEventListener('click', () => {
      if (typeof options.onMoonShortcut === 'function') options.onMoonShortcut();
      close();
    });
  }
  if (spaceBtn) {
    spaceBtn.addEventListener('click', () => {
      if (typeof options.onSpaceShortcut === 'function') options.onSpaceShortcut();
      close();
    });
  }
  if (latInput) {
    latInput.addEventListener('change', () => {
      applySelectionFromInputs();
    });
  }
  if (lonInput) {
    lonInput.addEventListener('change', () => {
      applySelectionFromInputs();
    });
  }
  if (searchInput) {
    searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') close();
      if (event.key === 'Enter' && !searchInFlight) runSearchFromOverlay();
    });
  }
  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      if (!searchInFlight) runSearchFromOverlay();
    });
  }
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
        savedFavoriteCities = savedFavoriteCities.
        filter((city) => Math.abs(city.lat - cityToDelete.lat) > 0.0005 || Math.abs(city.lon - cityToDelete.lon) > 0.0005);
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
