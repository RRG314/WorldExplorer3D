import { ctx as appCtx } from "../shared-context.js?v=55";
import {
  applyTerrainVisualProfile,
  classifyTerrainVisualProfile,
  releaseTerrainTextureSets,
  TERRAIN_GRASS_COLOR_HEX
} from "./surface-profiles.js?v=35";

const TERRAIN_TILE_CACHE_LIMIT = 72;
const TERRAIN_TILE_MAX_ATTEMPTS = 3;
const TERRAIN_TILE_RETRY_BASE_MS = 300;
const TERRAIN_TILE_ATTEMPT_TIMEOUT_MS = 6000;
const terrainTileLifetime = { failures: 0, retries: 0, recovered: 0 };
const recentTerrainFailures = new Map();
const TERRAIN_FAILURE_HISTORY_MS = 30000;
const TERRAIN_FAILURE_HISTORY_LIMIT = 128;
const INVALID_TERRAIN_TILE = Object.freeze({
  key: "invalid",
  img: null,
  loaded: false,
  failed: true,
  loading: false,
  evicted: false,
  elev: null,
  w: 256,
  h: 256,
  ready: null,
  attempts: TERRAIN_TILE_MAX_ATTEMPTS,
  recovered: false,
  failedAt: 0,
  nextRetryAt: Number.POSITIVE_INFINITY,
  lastError: "invalid terrain tile coordinates",
  lastUsedAt: 0
});

function terrainNow() {
  return typeof globalThis.performance?.now === "function" ? globalThis.performance.now() : Date.now();
}

function touchTerrainTile(tile) {
  if (tile) tile.lastUsedAt = terrainNow();
  return tile;
}

function failTerrainTileAttempt(tile, reason) {
  if (!tile || tile.evicted || tile.failed) return;
  tile.loaded = false;
  tile.loading = false;
  tile.failed = true;
  tile.elev = null;
  tile.failedAt = terrainNow();
  tile.nextRetryAt = tile.failedAt + TERRAIN_TILE_RETRY_BASE_MS * (2 ** Math.max(0, tile.attempts - 1));
  tile.lastError = String(reason?.message || reason || "terrain tile request failed").slice(0, 160);
  terrainTileLifetime.failures += 1;
  recentTerrainFailures.set(tile.key, { attempts: tile.attempts, failedAt: tile.failedAt });
  while (recentTerrainFailures.size > TERRAIN_FAILURE_HISTORY_LIMIT) {
    recentTerrainFailures.delete(recentTerrainFailures.keys().next().value);
  }
  tile.resolveReady?.(false);
}

function startTerrainTileAttempt(tile, z, x, y, deps) {
  const img = new Image();
  const attempt = tile.attempts + 1;
  let resolveReady;
  tile.ready = new Promise((resolve) => { resolveReady = resolve; });
  tile.resolveReady = resolveReady;
  tile.img = img;
  tile.attempts = attempt;
  if (attempt > 1) terrainTileLifetime.retries += 1;
  tile.loaded = false;
  tile.loading = true;
  tile.failed = false;
  tile.lastError = "";
  img.crossOrigin = "anonymous";

  img.onload = () => {
    if (tile.evicted || tile.attempts !== attempt) {
      resolveReady(false);
      return;
    }
    try {
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
      tile.loading = false;
      tile.failed = false;
      tile.elev = elev;
      tile.recovered = attempt > 1;
      if (tile.recovered) terrainTileLifetime.recovered += 1;
      recentTerrainFailures.delete(tile.key);
      touchTerrainTile(tile);

      if (appCtx.terrainGroup && typeof deps.reapplyTerrainMeshHeights === "function") {
        appCtx.terrainGroup.children.forEach((mesh) => {
          const tileInfo = mesh.userData?.terrainTile;
          if (tileInfo && tileInfo.z === z && tileInfo.tx === x && tileInfo.ty === y) {
            deps.reapplyTerrainMeshHeights(mesh);
          }
        });
      }

      deps.scheduleRoadAndBuildingRebuild?.();
      resolveReady(true);
    } catch (error) {
      console.warn("Terrain tile decode failed:", z, x, y, error);
      failTerrainTileAttempt(tile, error);
    }
  };
  img.onerror = () => failTerrainTileAttempt(tile, "terrain tile image request failed");
  img.src = appCtx.TERRAIN_TILE_URL(z, x, y);
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
  if (![z, x, y].every(Number.isFinite)) return INVALID_TERRAIN_TILE;

  const key = `${z}/${x}/${y}`;
  const cached = appCtx.terrainTileCache.get(key);
  if (cached) {
    touchTerrainTile(cached);
    if (
      cached.failed &&
      cached.attempts >= TERRAIN_TILE_MAX_ATTEMPTS &&
      terrainNow() - cached.failedAt >= TERRAIN_FAILURE_HISTORY_MS
    ) {
      cached.attempts = 0;
      cached.nextRetryAt = terrainNow();
      recentTerrainFailures.delete(key);
    }
    if (
      cached.failed &&
      cached.attempts < TERRAIN_TILE_MAX_ATTEMPTS &&
      terrainNow() >= cached.nextRetryAt
    ) startTerrainTileAttempt(cached, z, x, y, deps);
    return cached;
  }

  const recentFailure = recentTerrainFailures.get(key);
  const initialAttempts = recentFailure && terrainNow() - recentFailure.failedAt <= TERRAIN_FAILURE_HISTORY_MS
    ? Math.min(TERRAIN_TILE_MAX_ATTEMPTS, Number(recentFailure.attempts) || 0)
    : 0;
  if (!initialAttempts) recentTerrainFailures.delete(key);
  const tile = {
    key,
    img: null,
    loaded: false,
    failed: false,
    loading: false,
    evicted: false,
    elev: null,
    w: 256,
    h: 256,
    ready: null,
    resolveReady: null,
    attempts: initialAttempts,
    recovered: false,
    failedAt: 0,
    nextRetryAt: 0,
    lastError: "",
    lastUsedAt: terrainNow()
  };
  appCtx.terrainTileCache.set(key, tile);
  if (initialAttempts >= TERRAIN_TILE_MAX_ATTEMPTS) {
    tile.failed = true;
    tile.failedAt = recentFailure.failedAt;
    tile.nextRetryAt = tile.failedAt + TERRAIN_FAILURE_HISTORY_MS;
    tile.lastError = "terrain tile retry budget exhausted";
    return tile;
  }
  return startTerrainTileAttempt(tile, z, x, y, deps);
}

export function terrainTileCacheSnapshot() {
  let loaded = 0;
  let pending = 0;
  let failed = 0;
  let cachedRetries = 0;
  let cachedRecovered = 0;
  let elevationBytes = 0;
  appCtx.terrainTileCache.forEach((tile) => {
    if (tile?.loaded) loaded += 1;
    else if (tile?.failed) failed += 1;
    else pending += 1;
    cachedRetries += Math.max(0, Number(tile?.attempts || 0) - 1);
    if (tile?.recovered) cachedRecovered += 1;
    if (tile?.elev?.byteLength) elevationBytes += tile.elev.byteLength;
  });
  return {
    entries: appCtx.terrainTileCache.size,
    loaded,
    pending,
    failed,
    retries: terrainTileLifetime.retries,
    recovered: terrainTileLifetime.recovered,
    failures: terrainTileLifetime.failures,
    cachedRetries,
    cachedRecovered,
    elevationBytes,
    limit: TERRAIN_TILE_CACHE_LIMIT,
    maxAttempts: TERRAIN_TILE_MAX_ATTEMPTS
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

async function waitForTerrainTileReady(z, x, y, deadline, deps) {
  while (terrainNow() < deadline) {
    const tile = getOrLoadTerrainTile(z, x, y, deps);
    if (tile.loaded) return true;
    if (tile.failed) {
      if (tile.attempts >= TERRAIN_TILE_MAX_ATTEMPTS) return false;
      const delay = Math.min(Math.max(0, tile.nextRetryAt - terrainNow()), deadline - terrainNow());
      if (delay > 0) await new Promise((resolve) => globalThis.setTimeout(resolve, delay));
      continue;
    }
    if (!(tile.ready instanceof Promise)) return false;
    const remaining = Math.max(0, deadline - terrainNow());
    const attemptTimeout = Math.min(TERRAIN_TILE_ATTEMPT_TIMEOUT_MS, remaining);
    const timedOut = Symbol("terrain-timeout");
    const result = await Promise.race([
      tile.ready,
      new Promise((resolve) => globalThis.setTimeout(() => resolve(timedOut), attemptTimeout))
    ]);
    if (result === true) return true;
    if (result === timedOut) {
      if (tile.img) {
        tile.img.onload = null;
        tile.img.onerror = null;
        tile.img.src = "";
      }
      failTerrainTileAttempt(tile, `terrain tile request timed out after ${Math.round(attemptTimeout)}ms`);
    }
  }
  return false;
}

export async function waitForTerrainReadyAt(x, z, timeoutMs = 3000, deps = {}) {
  const { lat, lon } = worldToLatLon(x, z);
  const tilePoint = latLonToTileXY(lat, lon, appCtx.TERRAIN_ZOOM);
  const timeout = Math.max(0, Number(timeoutMs) || 0);
  return waitForTerrainTileReady(
    appCtx.TERRAIN_ZOOM,
    tilePoint.x,
    tilePoint.y,
    terrainNow() + timeout,
    deps
  );
}

export async function waitForTerrainReadyBounds(bounds, timeoutMs = 6000, deps = {}) {
  const latN = Number(bounds?.latN);
  const latS = Number(bounds?.latS);
  const lonW = Number(bounds?.lonW);
  const lonE = Number(bounds?.lonE);
  if (![latN, latS, lonW, lonE].every(Number.isFinite)) return false;

  const zoom = appCtx.TERRAIN_ZOOM;
  const epsilon = 1e-8;
  const northWest = latLonToTileXY(latN - epsilon, lonW + epsilon, zoom);
  const southEast = latLonToTileXY(latS + epsilon, lonE - epsilon, zoom);
  const minY = Math.min(northWest.y, southEast.y);
  const maxY = Math.max(northWest.y, southEast.y);
  const tileCount = 2 ** zoom;
  const xValues = [];
  if (lonW <= lonE) {
    for (let x = Math.min(northWest.x, southEast.x); x <= Math.max(northWest.x, southEast.x); x += 1) xValues.push(x);
  } else {
    for (let x = northWest.x; x < tileCount; x += 1) xValues.push(x);
    for (let x = 0; x <= southEast.x; x += 1) xValues.push(x);
  }
  const deadline = terrainNow() + Math.max(0, Number(timeoutMs) || 0);
  const waits = [];
  xValues.forEach((x) => {
    for (let y = minY; y <= maxY; y += 1) {
      waits.push(waitForTerrainTileReady(zoom, x, y, deadline, deps));
    }
  });
  if (waits.length === 0) return false;
  const results = await Promise.all(waits);
  return results.every(Boolean);
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
  const ownedTextures = new Set();
  const registerTexture = (texture) => {
    if (texture && typeof texture.dispose === "function") ownedTextures.add(texture);
  };
  registerTexture(mesh?.userData?.worldCoverTexture);
  registerTexture(mesh?.userData?.worldCoverResult?.texture);
  ownedTextures.forEach((texture) => texture.dispose());
  releaseTerrainTextureSets(mesh);
  if (mesh.userData) {
    mesh.userData.worldCoverTexture = null;
    mesh.userData.worldCoverResult = null;
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
  mesh.frustumCulled = true;
  mesh.userData = { terrainTile: { z, tx, ty, bounds } };
  mesh.userData.terrainTileKey = terrainTileMeshKey(z, tx, ty);
  mesh.userData.isTerrainMesh = true;
  mesh.userData.terrainTextureRepeats = repeats;
  mesh.userData.renderProvenance = {
    version: 1,
    profile: appCtx.getContinuousWorldEnabled?.() === true ? 'continuous_global' : 'location_osm',
    provider: 'AWS Open Data / ESA / mapped vector provider',
    dataset: 'Mapzen Terrarium elevation + semantic surface classification',
    release: '',
    tileKey: mesh.userData.terrainTileKey,
    layer: 'terrain',
    role: 'terrain',
    sources: ['mapzen-terrarium', 'esa-worldcover'],
    fallback: false
  };

  applyTerrainVisualProfile(mesh, classifyTerrainVisualProfile(bounds), repeats);

  if (typeof deps.applyHeightsToTerrainMesh === "function") {
    deps.applyHeightsToTerrainMesh(mesh);
  }

  return mesh;
}

function computeHeightfieldNormals(geometry, segments = appCtx.TERRAIN_SEGMENTS) {
  const positions = geometry?.attributes?.position;
  const side = Math.max(2, Math.round(Number(segments) || 0) + 1);
  if (!positions || positions.count !== side * side) {
    geometry?.computeVertexNormals?.();
    return;
  }

  let normals = geometry.attributes.normal;
  if (!normals || normals.count !== positions.count) {
    normals = new THREE.BufferAttribute(new Float32Array(positions.count * 3), 3);
    geometry.setAttribute('normal', normals);
  }
  const sample = (row, column, axis) => {
    const index = Math.max(0, Math.min(side - 1, row)) * side + Math.max(0, Math.min(side - 1, column));
    return axis === 'x' ? positions.getX(index) : axis === 'y' ? positions.getY(index) : positions.getZ(index);
  };

  for (let row = 0; row < side; row += 1) {
    for (let column = 0; column < side; column += 1) {
      const left = Math.max(0, column - 1);
      const right = Math.min(side - 1, column + 1);
      const north = Math.max(0, row - 1);
      const south = Math.min(side - 1, row + 1);
      const dx = sample(row, right, 'x') - sample(row, left, 'x') || 1;
      const dz = sample(south, column, 'z') - sample(north, column, 'z') || 1;
      const slopeX = (sample(row, right, 'y') - sample(row, left, 'y')) / dx;
      const slopeZ = (sample(south, column, 'y') - sample(north, column, 'y')) / dz;
      const length = Math.hypot(slopeX, 1, slopeZ) || 1;
      normals.setXYZ(row * side + column, -slopeX / length, 1 / length, -slopeZ / length);
    }
  }
  normals.needsUpdate = true;
}

export function applyFlatFallbackToTerrainMesh(mesh) {
  if (!mesh || !mesh.geometry || !mesh.geometry.attributes?.position) return;
  const pos = mesh.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, 0);
  }
  pos.needsUpdate = true;
  computeHeightfieldNormals(mesh.geometry);
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
    mesh.visible = false;
    return;
  }

  const pos = mesh.geometry.attributes.position;
  const latRange = bounds.latN - bounds.latS || 1;
  const lonRange = bounds.lonE - bounds.lonW || 1;
  const latRadians = appCtx.LOC.lat * Math.PI / 180;
  const lonWorldScale = appCtx.SCALE * Math.cos(latRadians);
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  const tileBounds = mesh.geometry.boundingBox;
  const tileMinX = Number(tileBounds?.min?.x || 0) + mesh.position.x;
  const tileMaxX = Number(tileBounds?.max?.x || 0) + mesh.position.x;
  const tileMinZ = Number(tileBounds?.min?.z || 0) + mesh.position.z;
  const tileMaxZ = Number(tileBounds?.max?.z || 0) + mesh.position.z;
  const structureCuts = Array.isArray(appCtx.structureTerrainCuts)
    ? appCtx.structureTerrainCuts.filter((cut) => cut?.bounds && !(
      cut.bounds.maxX < tileMinX || cut.bounds.minX > tileMaxX ||
      cut.bounds.maxZ < tileMinZ || cut.bounds.minZ > tileMaxZ
    ))
    : [];

  let minElevation = Infinity;
  let maxElevation = -Infinity;
  const elevations = new Float32Array(pos.count);
  const elevationMetersSamples = [];

  for (let i = 0; i < pos.count; i++) {
    const wx = pos.getX(i) + mesh.position.x;
    const wz = pos.getZ(i) + mesh.position.z;
    const lat = appCtx.LOC.lat - wz / appCtx.SCALE;
    const lon = appCtx.LOC.lon + wx / lonWorldScale;
    const u = (lon - bounds.lonW) / lonRange;
    const v = (bounds.latN - lat) / latRange;
    const meters = sampleTileElevationMeters(tile, u, v, deps.clampElevationMeters);
    if (i % 16 === 0) elevationMetersSamples.push(meters);
    const baseY = meters * appCtx.WORLD_UNITS_PER_METER * appCtx.TERRAIN_Y_EXAGGERATION;
    const y = typeof deps.applyStructureTerrainCuts === "function"
      ? deps.applyStructureTerrainCuts(wx, wz, baseY, structureCuts)
      : baseY;
    elevations[i] = y;
    minElevation = Math.min(minElevation, y);
    maxElevation = Math.max(maxElevation, y);
  }

  mesh.position.y = minElevation - 10;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, elevations[i] - mesh.position.y);
  }

  pos.needsUpdate = true;
  computeHeightfieldNormals(mesh.geometry);
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
