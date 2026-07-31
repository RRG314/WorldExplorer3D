import { ctx as appCtx } from "../shared-context.js?v=55";

const AERIAL_SURFACE_ZOOM = 12;
const AERIAL_SURFACE_TILE_RING = 2;
// The legacy 10 km ground plane has no coastline mask. In aerial modes it
// therefore paints grass across any water polygon that is missing, loading,
// or below the plane. Local terrain still supplies the detailed land surface;
// the regional OSM context supplies continuous land/water coverage beneath it.
const AERIAL_SURFACE_HIDE_FALLBACK_ALTITUDE = 0;
const TILE_SIZE = 256;
const TILE_TIMEOUT_MS = 9000;

let loadGeneration = 0;
let pendingSignature = '';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function latLonToTile(lat, lon, zoom = AERIAL_SURFACE_ZOOM) {
  const safeLat = clamp(Number(lat) || 0, -85.05112878, 85.05112878);
  const safeLon = ((Number(lon) || 0) + 540) % 360 - 180;
  const n = 2 ** zoom;
  const latRad = safeLat * Math.PI / 180;
  return {
    x: clamp(Math.floor((safeLon + 180) / 360 * n), 0, n - 1),
    y: clamp(
      Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) * 0.5 * n),
      0,
      n - 1
    ),
    z: zoom
  };
}

function tileXToLon(x, zoom) {
  return x / (2 ** zoom) * 360 - 180;
}

function tileYToLat(y, zoom) {
  return 180 / Math.PI * Math.atan(Math.sinh(Math.PI * (1 - 2 * y / (2 ** zoom))));
}

function aerialSurfaceTilePlan(lat, lon, options = {}) {
  const zoom = Number.isFinite(options.zoom) ? Math.round(options.zoom) : AERIAL_SURFACE_ZOOM;
  const ring = Number.isFinite(options.ring) ? Math.max(1, Math.round(options.ring)) : AERIAL_SURFACE_TILE_RING;
  const center = latLonToTile(lat, lon, zoom);
  const n = 2 ** zoom;
  const xMin = clamp(center.x - ring, 0, n - 1);
  const xMax = clamp(center.x + ring, 0, n - 1);
  const yMin = clamp(center.y - ring, 0, n - 1);
  const yMax = clamp(center.y + ring, 0, n - 1);
  const tiles = [];
  for (let y = yMin; y <= yMax; y += 1) {
    for (let x = xMin; x <= xMax; x += 1) {
      tiles.push({
        x,
        y,
        z: zoom,
        column: x - xMin,
        row: y - yMin,
        url: `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`
      });
    }
  }
  return {
    center,
    zoom,
    ring,
    columns: xMax - xMin + 1,
    rows: yMax - yMin + 1,
    tiles,
    bounds: {
      latN: tileYToLat(yMin, zoom),
      latS: tileYToLat(yMax + 1, zoom),
      lonW: tileXToLon(xMin, zoom),
      lonE: tileXToLon(xMax + 1, zoom)
    }
  };
}

function surfaceSignature() {
  const lat = Number(appCtx.LOC?.lat);
  const lon = Number(appCtx.LOC?.lon);
  return Number.isFinite(lat) && Number.isFinite(lon)
    ? `${lat.toFixed(6)}:${lon.toFixed(6)}`
    : '';
}

function disposeAerialSurfaceContext() {
  loadGeneration += 1;
  pendingSignature = '';
  const context = appCtx.aerialSurfaceContext;
  const mesh = context?.mesh;
  if (mesh?.parent) mesh.parent.remove(mesh);
  mesh?.geometry?.dispose?.();
  mesh?.material?.map?.dispose?.();
  mesh?.material?.dispose?.();
  appCtx.aerialSurfaceContext = null;
}

function loadTileImage(tile) {
  return new Promise((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = (loaded) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      image.onload = null;
      image.onerror = null;
      resolve(loaded ? image : null);
    };
    const timeoutId = setTimeout(() => finish(false), TILE_TIMEOUT_MS);
    image.crossOrigin = 'anonymous';
    image.onload = () => finish(true);
    image.onerror = () => finish(false);
    image.src = tile.url;
  });
}

function minimumTerrainY() {
  let minimum = 0;
  for (const mesh of appCtx.terrainGroup?.children || []) {
    const positions = mesh?.geometry?.attributes?.position;
    if (!positions) continue;
    const meshY = Number(mesh.position?.y) || 0;
    for (let i = 0; i < positions.count; i += Math.max(1, Math.floor(positions.count / 512))) {
      minimum = Math.min(minimum, meshY + positions.getY(i));
    }
  }
  return minimum - 2.5;
}

async function ensureAerialSurfaceContext() {
  if (typeof document === 'undefined' || typeof Image === 'undefined' || typeof THREE === 'undefined') return null;
  const signature = surfaceSignature();
  if (!signature || !appCtx.scene || typeof appCtx.geoToWorld !== 'function') return null;
  if (appCtx.aerialSurfaceContext?.signature === signature) return appCtx.aerialSurfaceContext;
  if (pendingSignature === signature) return null;

  disposeAerialSurfaceContext();
  pendingSignature = signature;
  const generation = ++loadGeneration;
  const plan = aerialSurfaceTilePlan(appCtx.LOC.lat, appCtx.LOC.lon);
  const canvas = document.createElement('canvas');
  canvas.width = plan.columns * TILE_SIZE;
  canvas.height = plan.rows * TILE_SIZE;
  const context2d = canvas.getContext('2d');
  if (!context2d) {
    pendingSignature = '';
    return null;
  }
  context2d.fillStyle = '#49694b';
  context2d.fillRect(0, 0, canvas.width, canvas.height);

  const images = await Promise.all(plan.tiles.map(async (tile) => ({
    tile,
    image: await loadTileImage(tile)
  })));
  if (generation !== loadGeneration || signature !== surfaceSignature()) return null;

  let loadedTiles = 0;
  for (const entry of images) {
    if (!entry.image) continue;
    loadedTiles += 1;
    context2d.drawImage(
      entry.image,
      entry.tile.column * TILE_SIZE,
      entry.tile.row * TILE_SIZE,
      TILE_SIZE,
      TILE_SIZE
    );
  }
  if (loadedTiles === 0) {
    pendingSignature = '';
    return null;
  }
  const nw = appCtx.geoToWorld(plan.bounds.latN, plan.bounds.lonW);
  const ne = appCtx.geoToWorld(plan.bounds.latN, plan.bounds.lonE);
  const sw = appCtx.geoToWorld(plan.bounds.latS, plan.bounds.lonW);
  const center = appCtx.geoToWorld(
    (plan.bounds.latN + plan.bounds.latS) * 0.5,
    (plan.bounds.lonW + plan.bounds.lonE) * 0.5
  );
  const width = Math.hypot(ne.x - nw.x, ne.z - nw.z);
  const depth = Math.hypot(sw.x - nw.x, sw.z - nw.z);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = typeof THREE.SRGBColorSpace !== 'undefined' ? THREE.SRGBColorSpace : texture.colorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = Math.min(4, Number(appCtx.renderer?.capabilities?.getMaxAnisotropy?.() || 1));
  texture.needsUpdate = true;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    color: 0xffffff,
    depthWrite: true,
    fog: true,
    side: THREE.DoubleSide,
    toneMapped: true
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth, 1, 1), material);
  mesh.name = 'AerialOsmSurfaceContext';
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(center.x, minimumTerrainY(), center.z);
  mesh.renderOrder = -2;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.userData = {
    aerialSurfaceContext: true,
    source: 'OpenStreetMap raster tiles',
    sourceUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    signature,
    zoom: plan.zoom,
    loadedTiles,
    requestedTiles: plan.tiles.length,
    bounds: plan.bounds,
    width,
    depth
  };
  (appCtx.earthSceneRoot || appCtx.scene).add(mesh);
  appCtx.aerialSurfaceContext = {
    signature,
    status: 'ready',
    mesh,
    loadedTiles,
    requestedTiles: plan.tiles.length,
    width,
    depth
  };
  pendingSignature = '';
  return appCtx.aerialSurfaceContext;
}

function groundPlanes() {
  const planes = [];
  (appCtx.earthSceneRoot || appCtx.scene)?.traverse?.((object) => {
    if (object?.userData?.isGroundPlane) planes.push(object);
  });
  return planes;
}

function syncAerialSurfaceContext(aerialMode = false, altitudeMeters = 0) {
  const signature = surfaceSignature();
  if (aerialMode && signature && appCtx.aerialSurfaceContext?.signature !== signature) {
    void ensureAerialSurfaceContext();
  }
  const context = appCtx.aerialSurfaceContext;
  const ready = context?.status === 'ready' && context.signature === signature;
  if (context?.mesh) context.mesh.visible = !!(aerialMode && ready);

  const suppressFallback = !!(
    aerialMode &&
    ready &&
    Number(altitudeMeters) >= AERIAL_SURFACE_HIDE_FALLBACK_ALTITUDE
  );
  for (const plane of groundPlanes()) {
    if (suppressFallback) {
      plane.userData.aerialContextSuppressed = true;
      plane.visible = false;
    } else if (plane.userData?.aerialContextSuppressed) {
      plane.userData.aerialContextSuppressed = false;
      plane.visible = !plane.userData?.boatSuppressed;
    }
  }
  return {
    ready,
    visible: !!context?.mesh?.visible,
    fallbackSuppressed: suppressFallback,
    loadedTiles: Number(context?.loadedTiles || 0),
    requestedTiles: Number(context?.requestedTiles || 0),
    width: Number(context?.width || 0),
    depth: Number(context?.depth || 0)
  };
}

export {
  AERIAL_SURFACE_HIDE_FALLBACK_ALTITUDE,
  aerialSurfaceTilePlan,
  disposeAerialSurfaceContext,
  ensureAerialSurfaceContext,
  syncAerialSurfaceContext
};
