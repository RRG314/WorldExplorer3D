const WEB_MERCATOR_LIMIT = 85.05112878;
const GLOBAL_TILE_ZOOM = 2;
const LOCAL_DETAIL_THRESHOLD_METERS = 4_000_000;
const TILE_CACHE_LIMIT = 112;
const MAP_MODE_STORAGE_KEY = 'worldExplorer3D.globeSelector.basemap';

const BASEMAPS = Object.freeze({
  map: Object.freeze({
    id: 'map',
    label: 'Map',
    attribution: '© OpenStreetMap contributors',
    attributionUrl: 'https://www.openstreetmap.org/copyright',
    tileUrl: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`
  }),
  satellite: Object.freeze({
    id: 'satellite',
    label: 'Satellite',
    attribution: 'Imagery © Esri and contributors',
    attributionUrl: 'https://www.esri.com/en-us/legal/terms/full-master-agreement',
    tileUrl: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`
  })
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeMode(value) {
  return value === 'satellite' ? 'satellite' : 'map';
}

function readStoredMode() {
  try {
    return normalizeMode(localStorage.getItem(MAP_MODE_STORAGE_KEY));
  } catch {
    return 'map';
  }
}

function storeMode(mode) {
  try {
    localStorage.setItem(MAP_MODE_STORAGE_KEY, normalizeMode(mode));
  } catch {
    // Private browsing may reject persistence; the active session still works.
  }
}

function tileYToLatitude(y, zoom) {
  const n = 2 ** zoom;
  return Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;
}

function longitudeToTileX(lon, zoom) {
  return (Number(lon) + 180) / 360 * (2 ** zoom);
}

function latitudeToTileY(lat, zoom) {
  const safeLat = clamp(Number(lat), -WEB_MERCATOR_LIMIT, WEB_MERCATOR_LIMIT);
  const radians = safeLat * Math.PI / 180;
  return (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) * 0.5 * (2 ** zoom);
}

function latLonPoint(lat, lon, radius = 1.000006) {
  const latRad = Number(lat) * Math.PI / 180;
  const lonRad = Number(lon) * Math.PI / 180;
  const cosLat = Math.cos(latRad);
  return {
    x: radius * cosLat * Math.cos(lonRad),
    y: radius * Math.sin(latRad),
    z: -radius * cosLat * Math.sin(lonRad)
  };
}

function createTileGeometry(THREE, zoom, x, y) {
  const divisions = zoom <= GLOBAL_TILE_ZOOM ? 24 : zoom <= 5 ? 16 : 8;
  const n = 2 ** zoom;
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let row = 0; row <= divisions; row += 1) {
    const rowFraction = row / divisions;
    const lat = tileYToLatitude(y + rowFraction, zoom);
    for (let column = 0; column <= divisions; column += 1) {
      const columnFraction = column / divisions;
      const lon = (x + columnFraction) / n * 360 - 180;
      const point = latLonPoint(lat, lon);
      positions.push(point.x, point.y, point.z);
      uvs.push(columnFraction, 1 - rowFraction);
    }
  }
  const stride = divisions + 1;
  for (let row = 0; row < divisions; row += 1) {
    for (let column = 0; column < divisions; column += 1) {
      const a = row * stride + column;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}

function desiredTileZoom(zoomState, centerLat, canvasHeight) {
  if (!zoomState || zoomState.verticalSpanMeters > LOCAL_DETAIL_THRESHOLD_METERS) return GLOBAL_TILE_ZOOM;
  const metersPerPixel = Math.max(0.2, Number(zoomState.verticalSpanMeters) / Math.max(1, Number(canvasHeight) || 1));
  const latitudeScale = Math.max(0.12, Math.cos(Number(centerLat) * Math.PI / 180));
  return clamp(Math.round(Math.log2(156543.03392 * latitudeScale / metersPerPixel)), 3, 18);
}

function tileKeysForView(zoom, centerLat, centerLon, canvasAspect = 1) {
  const n = 2 ** zoom;
  if (zoom === GLOBAL_TILE_ZOOM) {
    const all = [];
    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n; x += 1) all.push({ zoom, x, y });
    }
    return all;
  }
  const centerX = Math.floor(longitudeToTileX(centerLon, zoom));
  const centerY = Math.floor(latitudeToTileY(centerLat, zoom));
  const radiusY = 2;
  const radiusX = clamp(Math.ceil(2 * Math.max(1, Number(canvasAspect) || 1)), 2, 4);
  const visible = [];
  const seen = new Set();
  for (let dy = -radiusY; dy <= radiusY; dy += 1) {
    const y = centerY + dy;
    if (y < 0 || y >= n) continue;
    for (let dx = -radiusX; dx <= radiusX; dx += 1) {
      const x = ((centerX + dx) % n + n) % n;
      const key = `${zoom}/${x}/${y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      visible.push({ zoom, x, y });
    }
  }
  return visible;
}

export function createGlobeBasemapTiles(options = {}) {
  const {
    THREE,
    globeRoot,
    renderer,
    canvas,
    mapButton,
    satelliteButton,
    attributionElement,
    getZoomState,
    getViewCenter,
    requestRender
  } = options;
  const group = new THREE.Group();
  group.name = 'GlobeBasemapTileGroup';
  globeRoot.add(group);
  const textureLoader = new THREE.TextureLoader();
  textureLoader.setCrossOrigin?.('anonymous');
  const textureCache = new Map();
  const activeMeshes = new Map();
  let mode = readStoredMode();
  let activeViewKey = '';
  let loadedTiles = 0;
  let failedTiles = 0;
  let destroyed = false;

  function touchCache(key, entry) {
    textureCache.delete(key);
    textureCache.set(key, entry);
  }

  function enforceCacheLimit() {
    let protectedAttempts = 0;
    while (textureCache.size > TILE_CACHE_LIMIT && protectedAttempts < textureCache.size) {
      const oldestKey = textureCache.keys().next().value;
      const entry = textureCache.get(oldestKey);
      const textureIsVisible = entry?.texture && [...activeMeshes.values()].some((mesh) => mesh.material?.map === entry.texture);
      if (textureIsVisible) {
        touchCache(oldestKey, entry);
        protectedAttempts += 1;
        continue;
      }
      textureCache.delete(oldestKey);
      entry?.texture?.dispose?.();
      protectedAttempts = 0;
    }
  }

  function loadTexture(tile, material) {
    const provider = BASEMAPS[mode];
    const cacheKey = `${mode}:${tile.zoom}/${tile.x}/${tile.y}`;
    const cached = textureCache.get(cacheKey);
    if (cached?.texture) {
      touchCache(cacheKey, cached);
      material.map = cached.texture;
      material.opacity = 1;
      material.needsUpdate = true;
      return;
    }
    if (cached?.promise) {
      cached.promise.then((texture) => {
        if (!material.userData.disposed && texture) {
          material.map = texture;
          material.opacity = 1;
          material.needsUpdate = true;
          requestRender?.();
        }
      });
      return;
    }
    const cacheEntry = { promise: null, texture: null };
    cacheEntry.promise = new Promise((resolve) => {
      textureLoader.load(provider.tileUrl(tile.zoom, tile.x, tile.y), (texture) => {
        if (destroyed) {
          texture.dispose?.();
          resolve(null);
          return;
        }
        if (typeof texture.colorSpace !== 'undefined' && typeof THREE.SRGBColorSpace !== 'undefined') texture.colorSpace = THREE.SRGBColorSpace;
        else if (typeof texture.encoding !== 'undefined' && typeof THREE.sRGBEncoding !== 'undefined') texture.encoding = THREE.sRGBEncoding;
        const maxAnisotropy = renderer?.capabilities?.getMaxAnisotropy?.();
        if (Number.isFinite(maxAnisotropy)) texture.anisotropy = Math.max(1, Math.min(4, maxAnisotropy));
        cacheEntry.texture = texture;
        cacheEntry.promise = null;
        loadedTiles += 1;
        touchCache(cacheKey, cacheEntry);
        enforceCacheLimit();
        resolve(texture);
      }, undefined, () => {
        cacheEntry.promise = null;
        textureCache.delete(cacheKey);
        failedTiles += 1;
        resolve(null);
      });
    });
    textureCache.set(cacheKey, cacheEntry);
    cacheEntry.promise.then((texture) => {
      if (!material.userData.disposed && texture) {
        material.map = texture;
        material.opacity = 1;
        material.needsUpdate = true;
        requestRender?.();
      }
    });
  }

  function disposeMesh(mesh) {
    if (!mesh) return;
    mesh.material.userData.disposed = true;
    mesh.geometry?.dispose?.();
    mesh.material?.dispose?.();
    group.remove(mesh);
  }

  function updateControls() {
    const provider = BASEMAPS[mode];
    mapButton?.classList.toggle('active', mode === 'map');
    satelliteButton?.classList.toggle('active', mode === 'satellite');
    mapButton?.setAttribute('aria-pressed', String(mode === 'map'));
    satelliteButton?.setAttribute('aria-pressed', String(mode === 'satellite'));
    if (attributionElement) {
      attributionElement.textContent = provider.attribution;
      attributionElement.href = provider.attributionUrl;
    }
  }

  function rebuildTiles(tileRecords, viewKey) {
    const wanted = new Set(tileRecords.map((tile) => `${tile.zoom}/${tile.x}/${tile.y}`));
    for (const [key, mesh] of activeMeshes) {
      if (wanted.has(key)) continue;
      activeMeshes.delete(key);
      disposeMesh(mesh);
    }
    tileRecords.forEach((tile) => {
      const key = `${tile.zoom}/${tile.x}/${tile.y}`;
      if (activeMeshes.has(key)) return;
      const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthTest: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      });
      const mesh = new THREE.Mesh(createTileGeometry(THREE, tile.zoom, tile.x, tile.y), material);
      mesh.name = `BasemapTile:${mode}:${key}`;
      mesh.renderOrder = 1;
      group.add(mesh);
      activeMeshes.set(key, mesh);
      loadTexture(tile, material);
    });
    activeViewKey = viewKey;
  }

  function update(force = false) {
    const center = getViewCenter?.() || { lat: 0, lon: 0 };
    const zoomState = getZoomState?.();
    const rect = canvas?.getBoundingClientRect?.() || { width: 1, height: 1 };
    const zoom = desiredTileZoom(zoomState, center.lat, rect.height);
    const records = tileKeysForView(zoom, center.lat, center.lon, rect.width / Math.max(1, rect.height));
    const anchor = zoom === GLOBAL_TILE_ZOOM
      ? 'world'
      : `${Math.floor(longitudeToTileX(center.lon, zoom))}:${Math.floor(latitudeToTileY(center.lat, zoom))}`;
    const viewKey = `${mode}:${zoom}:${anchor}:${records.length}`;
    if (!force && viewKey === activeViewKey) return;
    rebuildTiles(records, viewKey);
  }

  function setMode(nextMode) {
    const normalized = normalizeMode(nextMode);
    if (normalized === mode && activeViewKey) return;
    mode = normalized;
    storeMode(mode);
    for (const mesh of activeMeshes.values()) disposeMesh(mesh);
    activeMeshes.clear();
    activeViewKey = '';
    updateControls();
    update(true);
    requestRender?.();
  }

  function destroy() {
    destroyed = true;
    mapButton?.removeEventListener('click', onMapClick);
    satelliteButton?.removeEventListener('click', onSatelliteClick);
    for (const mesh of activeMeshes.values()) disposeMesh(mesh);
    activeMeshes.clear();
    for (const entry of textureCache.values()) entry?.texture?.dispose?.();
    textureCache.clear();
    globeRoot.remove(group);
  }

  function getState() {
    const zoomState = getZoomState?.();
    const center = getViewCenter?.() || { lat: 0, lon: 0 };
    return {
      mode,
      label: BASEMAPS[mode].label,
      attribution: BASEMAPS[mode].attribution,
      center,
      tileZoom: Number(activeViewKey.split(':')[1]) || GLOBAL_TILE_ZOOM,
      visibleTiles: activeMeshes.size,
      cachedTiles: textureCache.size,
      loadedTiles,
      failedTiles,
      verticalSpanMeters: Number(zoomState?.verticalSpanMeters) || null
    };
  }

  const onMapClick = () => setMode('map');
  const onSatelliteClick = () => setMode('satellite');
  mapButton?.addEventListener('click', onMapClick);
  satelliteButton?.addEventListener('click', onSatelliteClick);
  updateControls();
  update(true);
  return Object.freeze({ destroy, getState, setMode, update });
}

export { BASEMAPS, GLOBAL_TILE_ZOOM, LOCAL_DETAIL_THRESHOLD_METERS };
