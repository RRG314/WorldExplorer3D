import { ctx as appCtx } from "../shared-context.js?v=55";
import {
  applyTerrainVisualProfile,
  classifyTerrainVisualProfile,
  TERRAIN_GRASS_COLOR_HEX
} from "./surface-profiles.js?v=11";

const TERRAIN_TILE_CACHE_LIMIT = 72;

function touchTerrainTile(tile) {
  if (tile) tile.lastUsedAt = performance.now();
  return tile;
}

export function latLonToTileXY(lat, lon, z) {
  const n = Math.pow(2, z);
  const xt = (lon + 180) / 360 * n;
  const yt = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n;
  return { x: Math.floor(xt), y: Math.floor(yt), xf: xt, yf: yt };
}

export function tileXYToLatLonBounds(x, y, z) {
  const n = Math.pow(2, z);
  const lonW = x / n * 360 - 180;
  const lonE = (x + 1) / n * 360 - 180;

  const latN = 180 / Math.PI * Math.atan(Math.sinh(Math.PI * (1 - 2 * (y / n))));
  const latS = 180 / Math.PI * Math.atan(Math.sinh(Math.PI * (1 - 2 * ((y + 1) / n))));

  return { latN, latS, lonW, lonE };
}

export function decodeTerrariumRGB(r, g, b) {
  return r * 256 + g + b / 256 - 32768;
}

export function getOrLoadTerrainTile(z, x, y, deps = {}) {
  const key = `${z}/${x}/${y}`;
  if (appCtx.terrainTileCache.has(key)) return touchTerrainTile(appCtx.terrainTileCache.get(key));

  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = appCtx.TERRAIN_TILE_URL(z, x, y);

  let resolveReady;
  const ready = new Promise((resolve) => { resolveReady = resolve; });
  const tile = {
    img,
    loaded: false,
    failed: false,
    evicted: false,
    elev: null,
    w: 256,
    h: 256,
    ready,
    lastUsedAt: performance.now()
  };
  appCtx.terrainTileCache.set(key, tile);

  img.onload = () => {
    try {
      if (tile.evicted) {
        resolveReady(false);
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, 256, 256);

      const elev = new Float32Array(256 * 256);
      for (let i = 0, p = 0; i < elev.length; i++, p += 4) {
        elev[i] = decodeTerrariumRGB(data[p], data[p + 1], data[p + 2]);
      }

      tile.loaded = true;
      tile.failed = false;
      tile.elev = elev;
      touchTerrainTile(tile);

      if (appCtx.terrainGroup && typeof deps.reapplyTerrainMeshHeights === "function") {
        appCtx.terrainGroup.children.forEach((mesh) => {
          const tileInfo = mesh.userData?.terrainTile;
          if (tileInfo && tileInfo.z === z && tileInfo.tx === x && tileInfo.ty === y) {
            deps.reapplyTerrainMeshHeights(mesh);
          }
        });
      }

      if (typeof deps.scheduleRoadAndBuildingRebuild === "function") {
        deps.scheduleRoadAndBuildingRebuild();
      }
      resolveReady(true);
    } catch (e) {
      console.warn("Terrain tile decode failed:", z, x, y, e);
      tile.loaded = false;
      tile.failed = true;
      tile.elev = null;
      resolveReady(false);
    }
  };

  img.onerror = () => {
    tile.loaded = false;
    tile.failed = true;
    tile.elev = null;
    resolveReady(false);
  };

  return tile;
}

export function terrainTileCacheSnapshot() {
  let loaded = 0;
  let pending = 0;
  let failed = 0;
  let elevationBytes = 0;
  appCtx.terrainTileCache.forEach((tile) => {
    if (tile?.loaded) loaded += 1;
    else if (tile?.failed) failed += 1;
    else pending += 1;
    if (tile?.elev?.byteLength) elevationBytes += tile.elev.byteLength;
  });
  return {
    entries: appCtx.terrainTileCache.size,
    loaded,
    pending,
    failed,
    elevationBytes,
    limit: TERRAIN_TILE_CACHE_LIMIT
  };
}

export function pruneTerrainTileCache(limit = TERRAIN_TILE_CACHE_LIMIT) {
  const safeLimit = Math.max(25, Math.round(Number(limit) || TERRAIN_TILE_CACHE_LIMIT));
  if (appCtx.terrainTileCache.size <= safeLimit) return terrainTileCacheSnapshot();

  const protectedKeys = new Set();
  appCtx.terrainGroup?.children?.forEach?.((mesh) => {
    const key = mesh?.userData?.terrainTileKey;
    if (key) protectedKeys.add(key);
  });
  const candidates = [...appCtx.terrainTileCache.entries()]
    .filter(([key, tile]) => !protectedKeys.has(key) && (tile?.loaded || tile?.failed))
    .sort((a, b) => Number(a[1]?.lastUsedAt || 0) - Number(b[1]?.lastUsedAt || 0));

  let removeCount = appCtx.terrainTileCache.size - safeLimit;
  for (let i = 0; i < candidates.length && removeCount > 0; i += 1) {
    const [key, tile] = candidates[i];
    if (!appCtx.terrainTileCache.delete(key)) continue;
    tile.evicted = true;
    if (tile.img) {
      tile.img.onload = null;
      tile.img.onerror = null;
      tile.img.src = '';
    }
    tile.img = null;
    tile.elev = null;
    removeCount -= 1;
  }
  return terrainTileCacheSnapshot();
}

export async function waitForTerrainReadyAt(x, z, timeoutMs = 3000, deps = {}) {
  const { lat, lon } = worldToLatLon(x, z);
  const tilePoint = latLonToTileXY(lat, lon, appCtx.TERRAIN_ZOOM);
  const tile = getOrLoadTerrainTile(appCtx.TERRAIN_ZOOM, tilePoint.x, tilePoint.y, deps);
  if (tile.loaded) return true;
  if (tile.failed) return false;

  const timeout = Math.max(0, Number(timeoutMs) || 0);
  if (!(tile.ready instanceof Promise) || timeout === 0) return false;
  return Promise.race([
    tile.ready,
    new Promise((resolve) => globalThis.setTimeout(() => resolve(false), timeout))
  ]);
}

export function sampleTileElevationMeters(tile, u, v, clampElevationMeters = null) {
  if (!tile || !tile.loaded || !tile.elev) return 0;

  const w = 256;
  const h = 256;
  const x = Math.max(0, Math.min(w - 1, u * (w - 1)));
  const y = Math.max(0, Math.min(h - 1, v * (h - 1)));

  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);

  const sx = x - x0;
  const sy = y - y0;

  const i00 = y0 * w + x0;
  const i10 = y0 * w + x1;
  const i01 = y1 * w + x0;
  const i11 = y1 * w + x1;

  const e00 = tile.elev[i00];
  const e10 = tile.elev[i10];
  const e01 = tile.elev[i01];
  const e11 = tile.elev[i11];

  const ex0 = e00 + (e10 - e00) * sx;
  const ex1 = e01 + (e11 - e01) * sx;
  const value = ex0 + (ex1 - ex0) * sy;
  return typeof clampElevationMeters === "function" ? clampElevationMeters(value) : value;
}

export function worldToLatLon(x, z) {
  const lat = appCtx.LOC.lat - z / appCtx.SCALE;
  const lon = appCtx.LOC.lon + x / (appCtx.SCALE * Math.cos(appCtx.LOC.lat * Math.PI / 180));
  return { lat, lon };
}

export function elevationMetersAtLatLon(lat, lon, deps = {}) {
  const t = latLonToTileXY(lat, lon, appCtx.TERRAIN_ZOOM);
  const tile = getOrLoadTerrainTile(appCtx.TERRAIN_ZOOM, t.x, t.y, deps);
  if (!tile.loaded) return 0;

  const u = t.xf - t.x;
  const v = t.yf - t.y;
  return sampleTileElevationMeters(tile, u, v, deps.clampElevationMeters);
}

export function elevationWorldYAtWorldXZ(x, z, deps = {}) {
  const { lat, lon } = worldToLatLon(x, z);
  const meters = elevationMetersAtLatLon(lat, lon, deps);
  return meters * appCtx.WORLD_UNITS_PER_METER * appCtx.TERRAIN_Y_EXAGGERATION;
}

export function ensureTerrainGroup() {
  if (!appCtx.terrainGroup) {
    appCtx.terrainGroup = new THREE.Group();
    appCtx.terrainGroup.name = "TerrainGroup";
    appCtx.scene.add(appCtx.terrainGroup);
  }
}

export function terrainTileMeshKey(z, tx, ty) {
  return `${z}/${tx}/${ty}`;
}

export function getTerrainMeshKey(mesh) {
  const info = mesh?.userData?.terrainTile;
  if (!info) return "";
  return terrainTileMeshKey(info.z, info.tx, info.ty);
}

export function disposeTerrainMesh(mesh) {
  if (!mesh) return;
  if (mesh.userData) mesh.userData.terrainDisposed = true;
  mesh?.userData?.worldCoverAbortController?.abort?.();
  const worldCoverTexture = mesh?.userData?.worldCoverTexture;
  if (worldCoverTexture && typeof worldCoverTexture.dispose === "function") {
    worldCoverTexture.dispose();
  }
  const texSet = mesh?.userData?.terrainTextureSet;
  if (texSet && typeof texSet === "object") {
    Object.values(texSet).forEach((tex) => {
      if (tex && typeof tex.dispose === "function") tex.dispose();
    });
  }
  if (mesh.geometry) mesh.geometry.dispose();
  if (mesh.material) mesh.material.dispose();
}

export function clearTerrainMeshes() {
  if (!appCtx.terrainGroup) return;
  while (appCtx.terrainGroup.children.length) {
    const mesh = appCtx.terrainGroup.children.pop();
    disposeTerrainMesh(mesh);
  }
}

export function buildTerrainTileMesh(z, tx, ty, deps = {}) {
  const bounds = tileXYToLatLonBounds(tx, ty, z);
  const pNW = appCtx.geoToWorld(bounds.latN, bounds.lonW);
  const pNE = appCtx.geoToWorld(bounds.latN, bounds.lonE);
  const pSW = appCtx.geoToWorld(bounds.latS, bounds.lonW);
  const pCenter = appCtx.geoToWorld((bounds.latN + bounds.latS) * 0.5, (bounds.lonW + bounds.lonE) * 0.5);

  const width = Math.hypot(pNE.x - pNW.x, pNE.z - pNW.z);
  const depth = Math.hypot(pSW.x - pNW.x, pSW.z - pNW.z);

  const cx = pCenter.x;
  const cz = pCenter.z;

  const geo = new THREE.PlaneGeometry(width, depth, appCtx.TERRAIN_SEGMENTS, appCtx.TERRAIN_SEGMENTS);
  geo.rotateX(-Math.PI / 2);

  const repeats = Math.max(10, Math.round(width / 25));
  const mat = new THREE.MeshStandardMaterial({
    color: typeof appCtx.grassDiffuse !== "undefined" && appCtx.grassDiffuse ? 0xffffff : TERRAIN_GRASS_COLOR_HEX,
    roughness: 0.95,
    metalness: 0.0,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
    wireframe: false
  });
  mat.needsUpdate = true;

  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 0;
  mesh.position.set(cx, 0, cz);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.frustumCulled = false;
  mesh.userData = { terrainTile: { z, tx, ty, bounds } };
  mesh.userData.terrainTileKey = terrainTileMeshKey(z, tx, ty);
  mesh.userData.isTerrainMesh = true;
  mesh.userData.terrainTextureRepeats = repeats;

  applyTerrainVisualProfile(mesh, classifyTerrainVisualProfile(bounds), repeats);

  if (typeof deps.applyHeightsToTerrainMesh === "function") {
    deps.applyHeightsToTerrainMesh(mesh);
  }

  return mesh;
}

export function applyFlatFallbackToTerrainMesh(mesh) {
  if (!mesh || !mesh.geometry || !mesh.geometry.attributes?.position) return;
  const pos = mesh.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, 0);
  }
  pos.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  mesh.position.y = 0;
  mesh.visible = true;
  const bounds = mesh.userData?.terrainTile?.bounds || null;
  applyTerrainVisualProfile(mesh, classifyTerrainVisualProfile(bounds));
}

export function applyHeightsToTerrainMesh(mesh, deps = {}) {
  const info = mesh.userData?.terrainTile;
  if (!info) return;

  const { z, tx, ty, bounds } = info;
  const tile = getOrLoadTerrainTile(z, tx, ty, deps);
  if (!tile.loaded) {
    mesh.userData.pendingTerrainTile = true;
    applyFlatFallbackToTerrainMesh(mesh);
    return;
  }

  const pos = mesh.geometry.attributes.position;
  const latRange = bounds.latN - bounds.latS || 1;
  const lonRange = bounds.lonE - bounds.lonW || 1;

  let minElevation = Infinity;
  let maxElevation = -Infinity;
  const elevations = [];
  const elevationMetersSamples = [];

  for (let i = 0; i < pos.count; i++) {
    const wx = pos.getX(i) + mesh.position.x;
    const wz = pos.getZ(i) + mesh.position.z;
    const { lat, lon } = worldToLatLon(wx, wz);
    const u = (lon - bounds.lonW) / lonRange;
    const v = (bounds.latN - lat) / latRange;
    const meters = sampleTileElevationMeters(tile, u, v, deps.clampElevationMeters);
    elevationMetersSamples.push(meters);
    const baseY = meters * appCtx.WORLD_UNITS_PER_METER * appCtx.TERRAIN_Y_EXAGGERATION;
    const y = typeof deps.applyStructureTerrainCuts === "function" ? deps.applyStructureTerrainCuts(wx, wz, baseY) : baseY;
    elevations.push(y);
    minElevation = Math.min(minElevation, y);
    maxElevation = Math.max(maxElevation, y);
  }

  mesh.position.y = minElevation - 10;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, elevations[i] - mesh.position.y);
  }

  pos.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  mesh.userData.pendingTerrainTile = false;
  mesh.visible = true;

  const unitsPerMeter = (appCtx.WORLD_UNITS_PER_METER || 1) * (appCtx.TERRAIN_Y_EXAGGERATION || 1);
  const minMeters = Number.isFinite(minElevation) && unitsPerMeter > 0 ? minElevation / unitsPerMeter : 0;
  const maxMeters = Number.isFinite(maxElevation) && unitsPerMeter > 0 ? maxElevation / unitsPerMeter : 0;

  mesh.userData.minElevation = minElevation;
  mesh.userData.maxElevation = maxElevation;
  mesh.userData.minElevationMeters = minMeters;
  mesh.userData.maxElevationMeters = maxMeters;
  const elevationStats = typeof deps.computeElevationStatsMeters === "function" ?
    deps.computeElevationStatsMeters(elevationMetersSamples) :
    { min: minMeters, max: maxMeters, p75: maxMeters, p90: maxMeters };
  mesh.userData.elevationStatsMeters = elevationStats;
  applyTerrainVisualProfile(mesh, classifyTerrainVisualProfile(bounds, minMeters, maxMeters, elevationStats));
}
