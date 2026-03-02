import { ctx as appCtx } from "../shared-context.js?v=55";

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clampLatLon(lat, lon) {
  const clampedLat = Math.max(-90, Math.min(90, Number(lat) || 0));
  let clampedLon = Number(lon) || 0;
  while (clampedLon > 180) clampedLon -= 360;
  while (clampedLon < -180) clampedLon += 360;
  return { lat: clampedLat, lon: clampedLon };
}

const FAVORITE_STORAGE_KEY = 'worldExplorer3D.globeSelector.savedFavorites';
const MAX_SAVED_FAVORITES = 10;

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
  const nearbyTabBtn = document.getElementById('globeNearbyTabBtn');
  const favoritesTabBtn = document.getElementById('globeFavoritesTabBtn');
  const cityListHint = document.getElementById('globeCityListHint');
  const cityList = document.getElementById('globeCityList');

  if (!root || !canvas) {
    return {
      close() {},
      isOpen() { return false; },
      open() {},
      setSelection() {}
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
  let favoritePresetList = [];
  let favoriteSavedList = [];
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

  function getMenuFavoriteCities() {
    return Object.entries(appCtx.LOCS || {}).map(([key, entry]) => {
      const lat = toFiniteNumber(entry?.lat);
      const lon = toFiniteNumber(entry?.lon);
      if (lat == null || lon == null) return null;
      return {
        key: String(key || ''),
        name: String(entry?.name || key || 'City').trim(),
        lat: Number(lat),
        lon: Number(lon),
        source: 'menu'
      };
    }).filter(Boolean);
  }

  function setBodyScrollLock(locked) {
    document.body?.classList.toggle('globe-selector-open', !!locked);
  }

  function normalizeCityName(name, lat, lon, fallbackPrefix = 'Custom Location') {
    const trimmed = String(name || '').trim();
    if (trimmed && !/^resolving city/i.test(trimmed)) return trimmed;
    return `${fallbackPrefix} ${Number(lat).toFixed(3)}, ${Number(lon).toFixed(3)}`;
  }

  function normalizeCityRecord(raw, source = 'menu') {
    if (!raw || typeof raw !== 'object') return null;
    const lat = toFiniteNumber(raw.lat);
    const lon = toFiniteNumber(raw.lon);
    if (lat == null || lon == null) return null;
    const clamped = clampLatLon(lat, lon);
    const name = normalizeCityName(raw.name, clamped.lat, clamped.lon, source === 'saved' ? 'Saved Custom' : 'City');
    return {
      key: String(raw.key || ''),
      name,
      lat: Number(clamped.lat),
      lon: Number(clamped.lon),
      source: source === 'saved' ? 'saved' : 'menu',
      savedAt: Number(raw.savedAt || 0)
    };
  }

  function cityDedupKey(city) {
    if (!city) return '';
    return `${Number(city.lat).toFixed(4)},${Number(city.lon).toFixed(4)}`;
  }

  function buildFavoriteCities() {
    const out = [];
    const seen = new Set();
    const merged = [...savedFavoriteCities, ...getMenuFavoriteCities()];
    merged.forEach((city) => {
      const normalized = normalizeCityRecord(city, city?.source || 'menu');
      if (!normalized) return;
      const key = cityDedupKey(normalized);
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(normalized);
    });
    return out;
  }

  function getFavoriteCityGroups() {
    const presets = getMenuFavoriteCities().
    map((city) => normalizeCityRecord(city, 'menu')).
    filter(Boolean);
    const saved = savedFavoriteCities.
    map((city) => normalizeCityRecord(city, 'saved')).
    filter(Boolean);

    const dedupe = (list = []) => {
      const out = [];
      const seen = new Set();
      list.forEach((city) => {
        const key = cityDedupKey(city);
        if (!key || seen.has(key)) return;
        seen.add(key);
        out.push(city);
      });
      return out;
    };

    return {
      presets: dedupe(presets),
      saved: dedupe(saved)
    };
  }

  function findNearestKnownCity(lat, lon) {
    const cities = buildFavoriteCities();
    if (!cities.length || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    let best = null;
    let bestDist = Infinity;
    cities.forEach((city) => {
      const d = distanceKmBetween(lat, lon, city.lat, city.lon);
      if (d < bestDist) {
        bestDist = d;
        best = city;
      }
    });
    return best;
  }

  function cityLocationLabel(city) {
    if (!city) return '';
    return `${Number(city.lat).toFixed(2)}, ${Number(city.lon).toFixed(2)}`;
  }

  function loadSavedFavoriteCities() {
    try {
      const raw = localStorage.getItem(FAVORITE_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.
      map((entry) => normalizeCityRecord(entry, 'saved')).
      filter(Boolean).
      sort((a, b) => Number(b.savedAt || 0) - Number(a.savedAt || 0)).
      slice(0, MAX_SAVED_FAVORITES);
    } catch {
      return [];
    }
  }

  function persistSavedFavoriteCities() {
    try {
      const payload = savedFavoriteCities.
      map((city) => ({
        key: String(city.key || ''),
        name: String(city.name || ''),
        lat: Number(city.lat),
        lon: Number(city.lon),
        savedAt: Number(city.savedAt || Date.now())
      })).
      slice(0, MAX_SAVED_FAVORITES);
      localStorage.setItem(FAVORITE_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Storage can fail in private mode; keep runtime-only list.
    }
  }

  function saveSelectionAsFavorite(nextSelection) {
    if (!nextSelection) return;
    const lat = toFiniteNumber(nextSelection.lat);
    const lon = toFiniteNumber(nextSelection.lon);
    if (lat == null || lon == null) return;
    const now = Date.now();
    const normalized = normalizeCityRecord(
      {
        key: `saved-${now}`,
        name: normalizeCityName(nextSelection.name, lat, lon, 'Saved Custom'),
        lat,
        lon,
        savedAt: now
      },
      'saved'
    );
    if (!normalized) return;
    savedFavoriteCities = savedFavoriteCities.
    filter((city) => Math.abs(city.lat - normalized.lat) > 0.0005 || Math.abs(city.lon - normalized.lon) > 0.0005);
    savedFavoriteCities.unshift(normalized);
    savedFavoriteCities = savedFavoriteCities.slice(0, MAX_SAVED_FAVORITES);
    persistSavedFavoriteCities();
  }

  function distanceKmBetween(latA, lonA, latB, lonB) {
    const toRad = Math.PI / 180;
    const dLat = (latB - latA) * toRad;
    const dLon = (lonB - lonA) * toRad;
    const aLat = latA * toRad;
    const bLat = latB * toRad;
    const sinLat = Math.sin(dLat * 0.5);
    const sinLon = Math.sin(dLon * 0.5);
    const a = sinLat * sinLat + Math.cos(aLat) * Math.cos(bLat) * sinLon * sinLon;
    const c = 2 * Math.atan2(Math.sqrt(Math.max(0, a)), Math.sqrt(Math.max(0, 1 - a)));
    return 6371 * c;
  }

  function cityMatchesSelection(city) {
    if (!selected || !city) return false;
    return Math.abs(selected.lat - city.lat) < 0.0005 && Math.abs(selected.lon - city.lon) < 0.0005;
  }

  function buildNearbyCities(lat, lon) {
    const favorites = buildFavoriteCities();
    if (!favorites.length) return [];
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return favorites.slice(0, 6).map((city) => ({ ...city, distanceKm: NaN }));
    }
    return favorites.
    map((city) => ({
      ...city,
      distanceKm: distanceKmBetween(lat, lon, city.lat, city.lon)
    })).
    sort((a, b) => a.distanceKm - b.distanceKm).
    slice(0, 6);
  }

  function getActiveCityList() {
    if (activeCityTab !== 'favorites') return nearbyCities;
    return [...favoriteSavedList, ...favoritePresetList];
  }

  function setFavoriteMarkersVisible() {
    if (!favoriteMarkerGroup) return;
    favoriteMarkerGroup.visible = activeCityTab === 'favorites';
  }

  function renderFavoriteMarkers() {
    if (!favoriteMarkerGroup || !favoriteMarkerGeometry || !menuFavoriteMaterial || !savedFavoriteMaterial) return;
    while (favoriteMarkerGroup.children.length) {
      favoriteMarkerGroup.remove(favoriteMarkerGroup.children[0]);
    }
    favoriteMarkerNodes = [];
    const favorites = buildFavoriteCities();
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
      'Closest menu cities to your selected point.';
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
        const meta = Number.isFinite(city.distanceKm) ?
          `${city.distanceKm.toFixed(0)} km away` :
          cityLocationLabel(city);
        return `<li class="globe-selector-city-item" data-city-source="nearby" data-city-index="${index}"${selectedClass}><div class="globe-selector-city-item-main"><span class="globe-selector-city-item-name">${city.name}</span><span class="globe-selector-city-item-meta">${meta}</span></div></li>`;
      }).join('');
      return;
    }

    const groups = getFavoriteCityGroups();
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
    if (!next) return;
    const legacyLat = document.getElementById('customLat');
    const legacyLon = document.getElementById('customLon');
    if (legacyLat) legacyLat.value = Number(next.lat).toFixed(6);
    if (legacyLon) legacyLon.value = Number(next.lon).toFixed(6);
    appCtx.customLoc = {
      lat: next.lat,
      lon: next.lon,
      name: next.name || appCtx.customLoc?.name || 'Custom Location'
    };
    appCtx.selLoc = 'custom';
  }

  function latLonToLocalPoint(lat, lon, radius = 1.01) {
    const latRad = lat * Math.PI / 180;
    const lonRad = lon * Math.PI / 180;
    const cosLat = Math.cos(latRad);
    return {
      x: radius * cosLat * Math.cos(lonRad),
      y: radius * Math.sin(latRad),
      z: -radius * cosLat * Math.sin(lonRad)
    };
  }

  function localPointToLatLon(point) {
    const len = Math.hypot(point.x, point.y, point.z) || 1;
    const nx = point.x / len;
    const ny = point.y / len;
    const nz = point.z / len;
    const lat = 90 - Math.acos(Math.max(-1, Math.min(1, ny))) * 180 / Math.PI;
    // SphereGeometry UV orientation is mirrored versus geodetic east/west.
    // Negating Z keeps click-picked longitude aligned with search/manual inputs.
    const lon = Math.atan2(-nz, nx) * 180 / Math.PI;
    return clampLatLon(lat, lon);
  }

  function renderSelection() {
    if (!selected) {
      if (latLonReadout) latLonReadout.textContent = 'No point selected';
      if (placeReadout) placeReadout.textContent = 'Click the globe to choose a location.';
      if (markerMesh) markerMesh.visible = false;
      nearbyCities = [];
      renderCityList();
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
    nearbyCities = buildNearbyCities(selected.lat, selected.lon);
    renderCityList();
    renderFavoriteMarkers();
  }

  function setSelection(lat, lon, meta = {}) {
    const clamped = clampLatLon(lat, lon);
    const named = typeof meta.name === 'string' ? meta.name.trim() : '';
    selected = {
      lat: clamped.lat,
      lon: clamped.lon,
      name: named || selected?.name || appCtx.customLoc?.name || 'Custom Location'
    };
    if (meta.focus) focusOnSelection(selected.lat, selected.lon);
    syncLegacyCustomState(selected);
    renderSelection();
  }

  function uniqueNonEmptyParts(parts = []) {
    const out = [];
    const seen = new Set();
    parts.forEach((part) => {
      const text = String(part || '').trim();
      if (!text) return;
      const key = text.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(text);
    });
    return out;
  }

  function parseReverseAddress(payload = {}) {
    const addr = payload?.address || {};
    const adminRows = Array.isArray(payload?.localityInfo?.administrative) ? payload.localityInfo.administrative : [];
    const countyFromBdc = adminRows.find((row) => Number(row?.adminLevel) === 6)?.name ||
      adminRows.find((row) => /county/i.test(String(row?.description || '')))?.name ||
      '';
    const cleanCountry = (value) => String(value || '').replace(/\s*\(the\)\s*$/i, '').trim();
    const city =
      addr.city ||
      addr.town ||
      addr.village ||
      addr.municipality ||
      addr.city_district ||
      addr.suburb ||
      addr.hamlet ||
      payload?.city ||
      payload?.locality ||
      '';
    const county =
      addr.county ||
      addr.borough ||
      addr.district ||
      addr.state_district ||
      countyFromBdc ||
      '';
    const region =
      addr.state ||
      addr.region ||
      addr.province ||
      addr.territory ||
      payload?.principalSubdivision ||
      '';
    const country = cleanCountry(addr.country || payload?.countryName || '');
    const parts = uniqueNonEmptyParts([city, county, region, country]);
    const display =
      parts.join(', ') ||
      String(payload?.display_name || '').split(',').slice(0, 4).map((v) => String(v || '').trim()).filter(Boolean).join(', ');

    return {
      display,
      queryLabel: city || county || region || country || '',
      details: { city, county, region, country }
    };
  }

  async function fetchJsonWithTimeout(url, timeoutMs = 6000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async function fetchReversePayload(lat, lon) {
    const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&addressdetails=1&lat=${encodeURIComponent(lat.toFixed(6))}&lon=${encodeURIComponent(lon.toFixed(6))}`;
    try {
      return await fetchJsonWithTimeout(nominatimUrl, 6000);
    } catch {
      const bdcUrl = `https://api-bdc.io/data/reverse-geocode-client?latitude=${encodeURIComponent(lat.toFixed(6))}&longitude=${encodeURIComponent(lon.toFixed(6))}&localityLanguage=en`;
      return await fetchJsonWithTimeout(bdcUrl, 7000);
    }
  }

  async function reverseLookupPlace(lat, lon) {
    const requestToken = ++reverseLookupToken;
    const cacheKey = `${Number(lat).toFixed(3)},${Number(lon).toFixed(3)}`;
    const cached = reverseLookupCache.get(cacheKey);
    if (cached && selected && Math.abs(selected.lat - lat) <= 0.00001 && Math.abs(selected.lon - lon) <= 0.00001) {
      selected.name = cached.display;
      selected.locationDetails = cached.details || null;
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
        selected.name = parsed.display;
        selected.locationDetails = parsed.details;
        syncLegacyCustomState(selected);
        renderSelection();
        if (searchInput && !searchInput.value.trim()) searchInput.value = parsed.queryLabel || parsed.display;
      }
    } catch {
      if (!openState || requestToken !== reverseLookupToken || !selected) return;
      if (Math.abs(selected.lat - lat) > 0.00001 || Math.abs(selected.lon - lon) > 0.00001) return;
      const fallbackCity = findNearestKnownCity(lat, lon);
      if (fallbackCity) {
        selected.name = fallbackCity.name;
        syncLegacyCustomState(selected);
        renderSelection();
      }
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
    const hits = raycaster.intersectObject(earthMesh, false);
    if (!hits || hits.length === 0) return;

    const localPoint = hits[0].point.clone();
    earthMesh.worldToLocal(localPoint);
    const next = localPointToLatLon(localPoint);
    const nearestCity = findNearestKnownCity(next.lat, next.lon);
    const fallbackName = nearestCity?.name || `Selected ${next.lat.toFixed(2)}, ${next.lon.toFixed(2)}`;
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

    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'low-power'
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      if (typeof renderer.outputColorSpace !== 'undefined' && typeof THREE.SRGBColorSpace !== 'undefined') {
        renderer.outputColorSpace = THREE.SRGBColorSpace;
      } else if (typeof renderer.outputEncoding !== 'undefined' && typeof THREE.sRGBEncoding !== 'undefined') {
        renderer.outputEncoding = THREE.sRGBEncoding;
      }
    } catch {
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

  function open() {
    if (openState) return;
    openState = true;
    setBodyScrollLock(true);
    root.classList.add('show');
    root.setAttribute('aria-hidden', 'false');

    initGlobeScene();
    ensureRendererSize();

    if (searchStatus) {
      searchStatus.textContent = 'Uses the same search flow as Custom Location.';
      searchStatus.style.color = '#64748b';
    }
    savedFavoriteCities = loadSavedFavoriteCities();
    setCityTab(activeCityTab);

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
        const fallback = buildFavoriteCities()[0] || null;
        if (fallback) {
          setSelection(fallback.lat, fallback.lon, { name: fallback.name, focus: true });
        } else {
          selected = null;
          renderSelection();
        }
      }
    }

    if (searchInput) searchInput.value = appCtx.customLoc?.name || '';

    startRenderLoop();
    renderFrame();
    if (typeof options.onOpen === 'function') options.onOpen();
  }

  function close() {
    if (!openState) return;
    openState = false;
    setBodyScrollLock(false);
    pointerActive = false;
    pointerDragDistance = 0;
    reverseLookupToken += 1;
    root.classList.remove('show');
    root.setAttribute('aria-hidden', 'true');
    stopRenderLoop();
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
    saveSelectionAsFavorite(selected);
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
        persistSavedFavoriteCities();
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
    setSelection,
    setSearchStatus(message, color = null) {
      if (!searchStatus) return;
      searchStatus.textContent = message || '';
      if (color) searchStatus.style.color = color;
    }
  };
}

Object.assign(appCtx, { createGlobeSelector });

export { createGlobeSelector };
