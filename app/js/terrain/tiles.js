import { ctx as appCtx } from "../shared-context.js?v=55";
import {
  decodeTerrariumRGB,
  latLonToTileXY,
  tileXYToLatLonBounds
} from './tile-coordinates.js?v=1';
import {
  clearTerrainMeshes,
  disposeTerrainMesh,
  ensureTerrainGroup,
  getTerrainMeshKey,
  terrainTileMeshKey
} from './mesh-lifecycle.js?v=1';
import {
  adaptTerrariumTileSample
} from "./provider-adapter.js?v=2";
import {
  applyTerrainVisualProfile,
  classifyTerrainVisualProfile,
  TERRAIN_GRASS_COLOR_HEX
} from "./surface-profiles.js?v=51";
import { stitchTerrainMeshEdges } from "./seams.js?v=2";
import {
  cancelTerrainTileRequest as cancelTileRequest,
  waitForTerrainTileRequest
} from './tile-request-lifecycle.js?v=1';

const TERRAIN_TILE_CACHE_LIMIT = 72;
const TERRAIN_TILE_MAX_ATTEMPTS = 3;
const TERRAIN_TILE_RETRY_BASE_MS = 300;
const TERRAIN_TILE_ATTEMPT_TIMEOUT_MS = 2400;
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
          const suppliesSharedEdge = tileInfo && tileInfo.z === z && (
            (tileInfo.tx === x && tileInfo.ty === y) ||
            (tileInfo.tx + 1 === x && tileInfo.ty === y) ||
            (tileInfo.tx === x && tileInfo.ty + 1 === y) ||
            (tileInfo.tx + 1 === x && tileInfo.ty + 1 === y)
          );
          if (suppliesSharedEdge) {
            deps.reapplyTerrainMeshHeights(mesh);
          }
        });
      }

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

export function peekTerrainTile(z, x, y) {
  if (![z, x, y].every(Number.isFinite)) return null;
  return appCtx.terrainTileCache.get(`${z}/${x}/${y}`) || null;
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

function releaseTerrainTile(tile) {
  if (!tile) return;
  tile.evicted = true;
  tile.resolveReady?.(false);
  tile.resolveReady = null;
  if (tile.img) {
    tile.img.onload = null;
    tile.img.onerror = null;
    tile.img.src = '';
  }
  tile.img = null;
  tile.elev = null;
  tile.ready = null;
  tile.loading = false;
  tile.loaded = false;
}

export function clearTerrainTileCache() {
  const before = terrainTileCacheSnapshot();
  appCtx.terrainTileCache.forEach(releaseTerrainTile);
  appCtx.terrainTileCache.clear();
  recentTerrainFailures.clear();
  return Object.freeze({
    releasedEntries: before.entries,
    releasedElevationBytes: before.elevationBytes,
    remaining: terrainTileCacheSnapshot()
  });
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
    releaseTerrainTile(tile);
    removeCount -= 1;
  }
  return terrainTileCacheSnapshot();
}

function waitForTerrainTileReady(z, x, y, deadline, deps, options = {}) {
  return waitForTerrainTileRequest({
    z, x, y, deadline, deps, signal: options.signal,
    getOrLoadTerrainTile, failTerrainTileAttempt, terrainNow,
    cancelTile: (tileZ, tileX, tileY) => cancelTileRequest(appCtx.terrainTileCache, tileZ, tileX, tileY),
    maxAttempts: TERRAIN_TILE_MAX_ATTEMPTS,
    attemptTimeoutMs: TERRAIN_TILE_ATTEMPT_TIMEOUT_MS
  });
}

export async function waitForTerrainTileReadyAtZoom(z, x, y, timeoutMs = 6000, deps = {}, options = {}) {
  const timeout = Math.max(0, Number(timeoutMs) || 0);
  return waitForTerrainTileReady(z, x, y, terrainNow() + timeout, deps, options);
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
  if (!tile || !tile.loaded || !tile.elev) return null;

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
  if (typeof appCtx.worldToGeo === 'function') return appCtx.worldToGeo(x, z);
  const lat = appCtx.LOC.lat - z / appCtx.SCALE;
  const lon = appCtx.LOC.lon + x / (appCtx.SCALE * Math.cos(appCtx.LOC.lat * Math.PI / 180));
  return { lat, lon };
}

export function elevationMetersAtLatLon(lat, lon, deps = {}) {
  const t = latLonToTileXY(lat, lon, appCtx.TERRAIN_ZOOM);
  const tile = getOrLoadTerrainTile(appCtx.TERRAIN_ZOOM, t.x, t.y, deps);
  if (!tile.loaded) return null;

  const u = t.xf - t.x;
  const v = t.yf - t.y;
  return sampleTileElevationMeters(tile, u, v, deps.clampElevationMeters);
}

export function terrainSourceSampleAtLatLon(lat, lon, deps = {}) {
  const preflight = adaptTerrariumTileSample({
    latitude: lat,
    longitude: lon,
    zoom: appCtx.TERRAIN_ZOOM,
    tile: null
  });
  if (preflight.status === "outside-coverage") return preflight;
  const tilePoint = latLonToTileXY(lat, lon, appCtx.TERRAIN_ZOOM);
  const tile = getOrLoadTerrainTile(
    appCtx.TERRAIN_ZOOM,
    tilePoint.x,
    tilePoint.y,
    deps
  );
  return adaptTerrariumTileSample({
    latitude: lat,
    longitude: lon,
    zoom: appCtx.TERRAIN_ZOOM,
    tile,
    clampElevationMeters: deps.clampElevationMeters
  });
}

export function peekTerrainSourceSampleAtLatLon(lat, lon, deps = {}) {
  const preflight = adaptTerrariumTileSample({
    latitude: lat,
    longitude: lon,
    zoom: appCtx.TERRAIN_ZOOM,
    tile: null
  });
  if (preflight.status === "outside-coverage") return preflight;
  const tilePoint = latLonToTileXY(lat, lon, appCtx.TERRAIN_ZOOM);
  return adaptTerrariumTileSample({
    latitude: lat,
    longitude: lon,
    zoom: appCtx.TERRAIN_ZOOM,
    tile: peekTerrainTile(appCtx.TERRAIN_ZOOM, tilePoint.x, tilePoint.y),
    clampElevationMeters: deps.clampElevationMeters
  });
}

export function terrainSourceSampleAtWorldXZ(x, z, deps = {}) {
  const { lat, lon } = worldToLatLon(x, z);
  return terrainSourceSampleAtLatLon(lat, lon, deps);
}

export function peekTerrainSourceSampleAtWorldXZ(x, z, deps = {}) {
  const { lat, lon } = worldToLatLon(x, z);
  return peekTerrainSourceSampleAtLatLon(lat, lon, deps);
}

export function elevationWorldYAtWorldXZ(x, z, deps = {}) {
  const { lat, lon } = worldToLatLon(x, z);
  const meters = elevationMetersAtLatLon(lat, lon, deps);
  return Number.isFinite(meters)
    ? meters * appCtx.WORLD_UNITS_PER_METER * appCtx.TERRAIN_Y_EXAGGERATION
    : null;
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
    // Only the physical top face is visible. Rendering the underside places
    // terrain over the ceiling from inside a subgrade transport structure.
    side: THREE.FrontSide,
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
  mesh.userData.renderProvenance = {
    version: 1,
    profile: 'accepted-ground-pending',
    provider: null,
    dataset: 'accepted-ground-artifact-pending',
    release: '',
    tileKey: mesh.userData.terrainTileKey,
    layer: 'terrain',
    role: 'terrain',
    sources: [],
    fallback: false
  };

  if (typeof deps.applyHeightsToTerrainMesh === "function") {
    deps.applyHeightsToTerrainMesh(mesh);
  }
  return mesh;
}

export function applyHeightsToTerrainMesh(mesh, deps = {}, options = {}) {
  const info = mesh.userData?.terrainTile;
  if (!info) return;

  const { z, tx, ty, bounds } = info;
  const usesAcceptedGround = typeof deps.usesAcceptedGround === 'function'
    ? deps.usesAcceptedGround()
    : deps.usesAcceptedGround !== false;
  const acceptedSampler =
    usesAcceptedGround && typeof deps.sampleAcceptedGroundAtLatLon === 'function'
      ? deps.sampleAcceptedGroundAtLatLon
      : null;
  const tile = acceptedSampler ? null : getOrLoadTerrainTile(z, tx, ty, deps);
  if (!acceptedSampler && !tile.loaded) {
    mesh.userData.pendingTerrainTile = true;
    mesh.visible = false;
    return;
  }

  const pos = mesh.geometry.attributes.position;
  const cachedBaseElevations = mesh.userData?.baseTerrainWorldY;
  const reuseBaseElevations = options.reuseBaseElevations === true &&
    cachedBaseElevations?.length === pos.count;
  const nextBaseElevations = reuseBaseElevations
    ? cachedBaseElevations
    : new Float32Array(pos.count);
  const latRange = bounds.latN - bounds.latS || 1;
  const lonRange = bounds.lonE - bounds.lonW || 1;

  let minElevation = Infinity;
  let maxElevation = -Infinity;
  let waterMaskedVertices = 0;
  let transportCorridorAdjustedVertices = 0;
  const elevations = [];
  const elevationMetersSamples = [];
  const segments = Math.max(1, Number(appCtx.TERRAIN_SEGMENTS) || 1);
  const verticesPerSide = segments + 1;
  const waterTerrainContext = typeof deps.createWaterTerrainContext === "function"
    ? deps.createWaterTerrainContext(bounds)
    : null;

  for (let i = 0; i < pos.count; i++) {
    const wx = pos.getX(i) + mesh.position.x;
    const wz = pos.getZ(i) + mesh.position.z;
    let meters;
    let acceptedSample = null;
    if (reuseBaseElevations) {
      const unitsPerMeter =
        (appCtx.WORLD_UNITS_PER_METER || 1) *
        (appCtx.TERRAIN_Y_EXAGGERATION || 1);
      meters = nextBaseElevations[i] / unitsPerMeter;
    } else if (acceptedSampler) {
      const { lat, lon } = worldToLatLon(wx, wz);
      acceptedSample = acceptedSampler(lat, lon);
      if (
        acceptedSample?.status !== 'available' ||
        !Number.isFinite(Number(acceptedSample.groundElevationMeters))
      ) {
        mesh.userData.pendingTerrainTile = true;
        mesh.userData.groundUnavailableReason =
          acceptedSample?.reason || 'accepted-ground-sample-unavailable';
        mesh.visible = false;
        return;
      }
      meters = deps.clampElevationMeters(
        Number(acceptedSample.groundElevationMeters)
      );
      if (i === 0) {
        mesh.userData.renderProvenance = {
          version: 1,
          profile: 'accepted-ground',
          provider: acceptedSample.providerId,
          dataset: acceptedSample.artifactId,
          release: acceptedSample.sourceRelease,
          verticalDatum: acceptedSample.verticalDatum,
          tileKey: mesh.userData.terrainTileKey,
          layer: 'terrain',
          role: 'terrain',
          sources: [acceptedSample.artifactId],
          fallback: false
        };
      }
    } else {
      const { lat, lon } = worldToLatLon(wx, wz);
      if (i === 0) {
        mesh.userData.renderProvenance = {
          version: 1,
          profile: 'worldwide-terrain-fallback',
          provider: 'mapzen-terrarium',
          dataset: 'Mapzen Terrain Tiles',
          release: '',
          verticalDatum: 'mixed-source',
          tileKey: mesh.userData.terrainTileKey,
          layer: 'terrain',
          role: 'terrain',
          sources: ['mapzen-terrarium'],
          fallback: true
        };
      }
      const u = (lon - bounds.lonW) / lonRange;
      const v = (bounds.latN - lat) / latRange;
      const column = i % verticesPerSide;
      const row = Math.floor(i / verticesPerSide);
      const eastEdge = column === segments;
      const southEdge = row === segments;
      let sampleSource = tile;
      let sampleU = u;
      let sampleV = v;
      if (eastEdge || southEdge) {
        const tileCount = 2 ** z;
        const adjacent = getOrLoadTerrainTile(
          z,
          eastEdge ? (tx + 1) % tileCount : tx,
          Math.min(tileCount - 1, ty + (southEdge ? 1 : 0)),
          deps
        );
        if (adjacent.loaded && adjacent.elev) {
          sampleSource = adjacent;
          if (eastEdge) sampleU = 0;
          if (southEdge) sampleV = 0;
        }
      }
      meters = sampleTileElevationMeters(
        sampleSource,
        sampleU,
        sampleV,
        deps.clampElevationMeters
      );
    }
    if (!Number.isFinite(meters)) {
      mesh.userData.pendingTerrainTile = true;
      mesh.userData.groundUnavailableReason = 'invalid-ground-elevation';
      mesh.visible = false;
      return;
    }
    elevationMetersSamples.push(meters);
    const baseY = meters * appCtx.WORLD_UNITS_PER_METER * appCtx.TERRAIN_Y_EXAGGERATION;
    if (!reuseBaseElevations) nextBaseElevations[i] = baseY;
    const structureY = typeof deps.applyStructureTerrainCuts === "function" ? deps.applyStructureTerrainCuts(wx, wz, baseY) : baseY;
    if (Math.abs(structureY - baseY) > 1e-6) transportCorridorAdjustedVertices += 1;
    const y = typeof deps.resolveWaterTerrainY === "function"
      ? deps.resolveWaterTerrainY(wx, wz, structureY, waterTerrainContext)
      : structureY;
    if (y < structureY - 1e-6) waterMaskedVertices += 1;
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
  stitchTerrainMeshEdges(appCtx, mesh);
  mesh.userData.pendingTerrainTile = false;
  mesh.userData.baseTerrainWorldY = nextBaseElevations;
  mesh.userData.waterMaskedVertices = waterMaskedVertices;
  mesh.userData.transportCorridorAdjustedVertices = transportCorridorAdjustedVertices;
  mesh.userData.groundUnavailableReason = null;
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

export {
  clearTerrainMeshes,
  decodeTerrariumRGB,
  disposeTerrainMesh,
  ensureTerrainGroup,
  getTerrainMeshKey,
  latLonToTileXY,
  terrainTileMeshKey,
  tileXYToLatLonBounds
};
