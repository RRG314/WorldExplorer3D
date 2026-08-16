import { ctx as appCtx } from "../shared-context.js?v=55";

function latLonToTile(lat, lon, zoom) {
  const n = Math.pow(2, zoom);
  const xtile = Math.floor((lon + 180) / 360 * n);
  const ytile = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n);
  return { x: xtile, y: ytile, zoom };
}

const MAP_TILE_CACHE_LIMIT = 96;
const tileCache = new Map();
const tileCacheLifetime = {
  hits: 0,
  misses: 0,
  evictions: 0,
  failures: 0
};
let minimapCenter = null;

function mapLocationKey() {
  return `${Number(appCtx.LOC?.lat).toFixed(6)},${Number(appCtx.LOC?.lon).toFixed(6)}`;
}

function tileCoordinates(lat, lon, zoom) {
  const n = Math.pow(2, zoom);
  return {
    x: (lon + 180) / 360 * n,
    y: (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n
  };
}

function touchTile(key, tile) {
  tile.lastUsedAt = performance.now();
  tileCache.delete(key);
  tileCache.set(key, tile);
  return tile;
}

function enforceTileCacheLimit() {
  while (tileCache.size > MAP_TILE_CACHE_LIMIT) {
    const oldestKey = tileCache.keys().next().value;
    if (oldestKey === undefined) break;
    const oldest = tileCache.get(oldestKey);
    tileCache.delete(oldestKey);
    if (oldest?.img) {
      oldest.img.onload = null;
      oldest.img.onerror = null;
    }
    tileCacheLifetime.evictions += 1;
  }
}

function loadTile(x, y, zoom) {
  const key = `${appCtx.satelliteView ? "sat" : "osm"}-${zoom}/${x}/${y}`;
  if (tileCache.has(key)) {
    tileCacheLifetime.hits += 1;
    return touchTile(key, tileCache.get(key));
  }
  tileCacheLifetime.misses += 1;

  const img = new Image();
  img.crossOrigin = "anonymous";
  const source = appCtx.satelliteView
    ? `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${y}/${x}`
    : `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;

  const tileData = { img, loaded: false, failed: false, lastUsedAt: performance.now() };
  tileCache.set(key, tileData);
  enforceTileCacheLimit();

  img.onload = () => {
    tileData.loaded = true;
  };
  img.onerror = () => {
    tileData.failed = true;
    tileCacheLifetime.failures += 1;
  };
  img.src = source;

  return tileData;
}

function getMapReferencePosition() {
  if (appCtx.planeMode?.active) return appCtx.planeMode;
  if (appCtx.boatMode?.active && appCtx.boat) return appCtx.boat;
  if (appCtx.droneMode && appCtx.drone) return appCtx.drone;
  return appCtx.Walk ? appCtx.Walk.getMapRefPosition(appCtx.droneMode, appCtx.drone) : { x: appCtx.car.x, z: appCtx.car.z };
}

function worldToLatLon(worldX, worldZ) {
  if (typeof appCtx.worldToGeo === 'function') return appCtx.worldToGeo(worldX, worldZ);
  return {
    lat: appCtx.LOC.lat - worldZ / appCtx.SCALE,
    lon: appCtx.LOC.lon + worldX / (appCtx.SCALE * Math.cos(appCtx.LOC.lat * Math.PI / 180))
  };
}

function resolveMinimapCenter(actorRef, zoom) {
  const actor = worldToLatLon(actorRef.x, actorRef.z);
  const locationKey = mapLocationKey();
  // The minimap is an actor-follow view. Keeping a dead zone made the vehicle
  // visibly drift away from the center and contradicted the map interaction
  // contract. The large map remains independently actor-centered below.
  minimapCenter = { ...actor, locationKey, zoom };
  return minimapCenter;
}

function createLatLonToScreenProjector(view) {
  const { zoom, centerTileX, centerTileY, pixelOffsetX, pixelOffsetY, mx, my } = view;
  return (lat, lon) => {
    const n = Math.pow(2, zoom);
    const xt = (lon + 180) / 360 * n;
    const yt = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n;
    const px = (xt - centerTileX) * 256 - pixelOffsetX;
    const py = (yt - centerTileY) * 256 - pixelOffsetY;
    return { x: mx + px, y: my + py };
  };
}

function createWorldToScreenProjector(view) {
  const latLonToScreen = createLatLonToScreenProjector(view);
  return (worldX, worldZ) => {
    const { lat, lon } = worldToLatLon(worldX, worldZ);
    return latLonToScreen(lat, lon);
  };
}

function resolveMapView(w, h, isLarge) {
  const actorRef = getMapReferencePosition();
  const zoom = isLarge ? appCtx.largeMapZoom : appCtx.minimapZoom;
  const actorLatLon = worldToLatLon(actorRef.x, actorRef.z);
  const centerLatLon = isLarge ? actorLatLon : resolveMinimapCenter(actorRef, zoom);
  const centerTile = tileCoordinates(centerLatLon.lat, centerLatLon.lon, zoom);
  const xtileFloat = centerTile.x;
  const ytileFloat = centerTile.y;
  const centerTileX = Math.floor(xtileFloat);
  const centerTileY = Math.floor(ytileFloat);
  const pixelOffsetX = (xtileFloat - centerTileX) * 256;
  const pixelOffsetY = (ytileFloat - centerTileY) * 256;
  const mx = w / 2;
  const my = h / 2;
  const view = {
    ref: actorRef,
    centerLatLon,
    zoom,
    centerTileX,
    centerTileY,
    pixelOffsetX,
    pixelOffsetY,
    mx,
    my,
    tilesWide: Math.ceil(w / 256) + 1,
    tilesHigh: Math.ceil(h / 256) + 1,
    startX: mx - pixelOffsetX,
    startY: my - pixelOffsetY
  };
  view.worldToScreen = createWorldToScreenProjector(view);
  view.latLonToScreen = createLatLonToScreenProjector(view);
  return view;
}

function mapTileCacheSnapshot() {
  let loaded = 0;
  let failed = 0;
  tileCache.forEach((tile) => {
    if (tile.loaded) loaded += 1;
    if (tile.failed) failed += 1;
  });
  return {
    entries: tileCache.size,
    limit: MAP_TILE_CACHE_LIMIT,
    loaded,
    failed,
    ...tileCacheLifetime
  };
}

function resetMinimapView() {
  minimapCenter = null;
}

function worldToScreenLarge(worldX, worldZ) {
  const view = resolveMapView(800, 800, true);
  return view.worldToScreen(worldX, worldZ);
}

export {
  getMapReferencePosition,
  latLonToTile,
  loadTile,
  mapTileCacheSnapshot,
  resetMinimapView,
  resolveMapView,
  worldToScreenLarge,
  worldToLatLon
};
