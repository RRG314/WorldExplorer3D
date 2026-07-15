import { ctx as appCtx } from "../shared-context.js?v=55";

function latLonToTile(lat, lon, zoom) {
  const n = Math.pow(2, zoom);
  const xtile = Math.floor((lon + 180) / 360 * n);
  const ytile = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n);
  return { x: xtile, y: ytile, zoom };
}

const tileCache = new Map();

function loadTile(x, y, zoom) {
  const key = `${appCtx.satelliteView ? "sat" : "osm"}-${zoom}/${x}/${y}`;
  if (tileCache.has(key)) {
    return tileCache.get(key);
  }

  const img = new Image();
  img.crossOrigin = "anonymous";

  if (appCtx.satelliteView) {
    img.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${y}/${x}`;
  } else {
    img.src = `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`;
  }

  const tileData = { img, loaded: false };
  tileCache.set(key, tileData);

  img.onload = () => {
    tileData.loaded = true;
  };

  return tileData;
}

function getMapReferencePosition() {
  if (appCtx.planeMode?.active) return appCtx.planeMode;
  if (appCtx.boatMode?.active && appCtx.boat) return appCtx.boat;
  if (appCtx.droneMode && appCtx.drone) return appCtx.drone;
  return appCtx.Walk ? appCtx.Walk.getMapRefPosition(appCtx.droneMode, appCtx.drone) : { x: appCtx.car.x, z: appCtx.car.z };
}

function worldToLatLon(worldX, worldZ) {
  return {
    lat: appCtx.LOC.lat - worldZ / appCtx.SCALE,
    lon: appCtx.LOC.lon + worldX / (appCtx.SCALE * Math.cos(appCtx.LOC.lat * Math.PI / 180))
  };
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
  const ref = getMapReferencePosition();
  const refLat = appCtx.LOC.lat - ref.z / appCtx.SCALE;
  const refLon = appCtx.LOC.lon + ref.x / (appCtx.SCALE * Math.cos(appCtx.LOC.lat * Math.PI / 180));
  const zoom = isLarge ? appCtx.largeMapZoom : appCtx.minimapZoom;
  const n = Math.pow(2, zoom);
  const xtileFloat = (refLon + 180) / 360 * n;
  const ytileFloat = (1 - Math.log(Math.tan(refLat * Math.PI / 180) + 1 / Math.cos(refLat * Math.PI / 180)) / Math.PI) / 2 * n;
  const centerTileX = Math.floor(xtileFloat);
  const centerTileY = Math.floor(ytileFloat);
  const pixelOffsetX = (xtileFloat - centerTileX) * 256;
  const pixelOffsetY = (ytileFloat - centerTileY) * 256;
  const mx = w / 2;
  const my = h / 2;
  const view = {
    ref,
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

function worldToScreenLarge(worldX, worldZ) {
  const view = resolveMapView(800, 800, true);
  return view.worldToScreen(worldX, worldZ);
}

export {
  getMapReferencePosition,
  latLonToTile,
  loadTile,
  resolveMapView,
  worldToScreenLarge,
  worldToLatLon
};
