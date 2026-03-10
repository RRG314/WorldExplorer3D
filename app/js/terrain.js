import { ctx as appCtx } from "./shared-context.js?v=55"; // ============================================================================
// terrain.js - Terrain elevation system (Terrarium tiles)
// ============================================================================

// =====================
// TERRAIN HELPER FUNCTIONS
// =====================

// Namespace for terrain internal state
const terrain = {
  _rebuildTimer: null,
  _rebuildInFlight: false,
  _lastRoadRebuildAt: 0,
  _raycaster: null,
  _rayOrigin: null,
  _rayDir: null,
  _roadMaterialCacheKey: '',
  _roadMaterials: null,
  // Performance optimization caching
  _lastUpdatePos: { x: 0, z: 0 },
  _cachedIntersections: null,
  _lastRoadCount: 0,
  _lastTerrainTileCount: 0
};
const ROAD_ENDPOINT_EXTENSION_SCALE = 0.5;
const ROAD_ENDPOINT_EXTENSION_MIN = 0.35;
const ROAD_ENDPOINT_EXTENSION_MAX = 2.0;
const ROAD_REBUILD_DEBOUNCE_MS = 90;
const ROAD_REBUILD_MIN_INTERVAL_MS = 420;
const POLAR_SNOW_LAT_THRESHOLD = 66;
const SUBPOLAR_SNOW_LAT_THRESHOLD = 58;
const ALPINE_SNOWLINE_METERS = 3200;
const SUBPOLAR_SNOWLINE_METERS = 1800;
const SNOW_COLOR_HEX = 0xffffff;
const ALPINE_SNOW_COLOR_HEX = 0xe5ebf2;
const GRASS_COLOR_HEX = 0x6b8e4a;
const GROUND_FALLBACK_GRASS_HEX = 0x4a7a2e;
const GROUND_FALLBACK_SNOW_HEX = 0xd6e2ef;
const GROUND_FALLBACK_ALPINE_HEX = 0xc6d0d8;
const MIN_VALID_ELEVATION_METERS = -500;
const MAX_VALID_ELEVATION_METERS = 9000;

function clampElevationMeters(meters) {
  if (!Number.isFinite(meters)) return 0;
  return Math.max(MIN_VALID_ELEVATION_METERS, Math.min(MAX_VALID_ELEVATION_METERS, meters));
}

function disposeRoadMaterialCache() {
  if (!terrain._roadMaterials) return;
  Object.values(terrain._roadMaterials).forEach((mat) => {
    if (mat && typeof mat.dispose === 'function') mat.dispose();
  });
  terrain._roadMaterials = null;
  terrain._roadMaterialCacheKey = '';
}

function getSharedRoadMaterials() {
  const key = `${appCtx.asphaltTex ? 'tex' : 'flat'}:${appCtx.asphaltNormal ? 1 : 0}:${appCtx.asphaltRoughness ? 1 : 0}`;
  if (terrain._roadMaterials && terrain._roadMaterialCacheKey === key) return terrain._roadMaterials;

  disposeRoadMaterialCache();

  const roadMat = typeof appCtx.asphaltTex !== 'undefined' && appCtx.asphaltTex ? new THREE.MeshStandardMaterial({
    map: appCtx.asphaltTex,
    normalMap: appCtx.asphaltNormal || undefined,
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughnessMap: appCtx.asphaltRoughness || undefined,
    roughness: 0.95,
    metalness: 0.05,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    depthWrite: true,
    depthTest: true
  }) : new THREE.MeshStandardMaterial({
    color: 0x333333,
    roughness: 0.95,
    metalness: 0.05,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    depthWrite: true,
    depthTest: true
  });

  const skirtMat = new THREE.MeshStandardMaterial({
    color: 0x222222,
    roughness: 0.95,
    metalness: 0.05,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });

  const capMat = typeof appCtx.asphaltTex !== 'undefined' && appCtx.asphaltTex ? new THREE.MeshStandardMaterial({
    map: appCtx.asphaltTex,
    normalMap: appCtx.asphaltNormal || undefined,
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughnessMap: appCtx.asphaltRoughness || undefined,
    roughness: 0.95,
    metalness: 0.05,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
    depthWrite: true,
    depthTest: true
  }) : new THREE.MeshStandardMaterial({
    color: 0x3a3a3a,
    roughness: 0.95,
    metalness: 0.05,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
    depthWrite: true,
    depthTest: true
  });

  terrain._roadMaterialCacheKey = key;
  terrain._roadMaterials = { roadMat, skirtMat, capMat };
  return terrain._roadMaterials;
}

function scheduleRoadAndBuildingRebuild() {
  if (!appCtx.terrainEnabled || appCtx.onMoon || appCtx.roads.length === 0) return;
  appCtx.roadsNeedRebuild = true;
  if (terrain._rebuildTimer) return;

  const now = performance.now();
  const elapsed = now - terrain._lastRoadRebuildAt;
  const waitMs = elapsed >= ROAD_REBUILD_MIN_INTERVAL_MS ?
  ROAD_REBUILD_DEBOUNCE_MS :
  Math.max(ROAD_REBUILD_DEBOUNCE_MS, ROAD_REBUILD_MIN_INTERVAL_MS - elapsed);

  terrain._rebuildTimer = setTimeout(() => {
    terrain._rebuildTimer = null;
    if (!appCtx.roadsNeedRebuild || appCtx.onMoon || !appCtx.terrainEnabled || appCtx.roads.length === 0) return;
    if (terrain._rebuildInFlight) {
      scheduleRoadAndBuildingRebuild();
      return;
    }

    terrain._rebuildInFlight = true;
    try {
      rebuildRoadsWithTerrain();
      repositionBuildingsWithTerrain();
      terrain._lastRoadRebuildAt = performance.now();
    } finally {
      terrain._rebuildInFlight = false;
      if (appCtx.roadsNeedRebuild) scheduleRoadAndBuildingRebuild();
    }
  }, waitMs);
}

// =====================
// TERRAIN MESH GRID SAMPLER
// Reads vertex heights directly from terrain mesh geometry - O(1) per query.
// This gives the exact same height as the rendered terrain surface without
// expensive raycasting (which was O(triangles) and caused browser freezes).
// =====================
function terrainMeshHeightAt(x, z) {
  if (!appCtx.terrainGroup || appCtx.terrainGroup.children.length === 0) {
    return elevationWorldYAtWorldXZ(x, z);
  }

  const segs = appCtx.TERRAIN_SEGMENTS;
  const vps = segs + 1; // vertices per side

  for (let c = 0; c < appCtx.terrainGroup.children.length; c++) {
    const mesh = appCtx.terrainGroup.children[c];
    const info = mesh.userData?.terrainTile;
    if (!info) continue;

    const pos = mesh.geometry.attributes.position;
    if (!pos || pos.count < 4) continue;

    // Convert world position to mesh local space
    const lx = x - mesh.position.x;
    const lz = z - mesh.position.z;

    // Get mesh extents from corner vertices
    // Vertex 0 = top-left (-width/2, ?, -depth/2)
    // Vertex [segs] = top-right (width/2, ?, -depth/2)
    // Vertex [segs*vps] = bottom-left (-width/2, ?, depth/2)
    const x0 = pos.getX(0);
    const x1 = pos.getX(segs);
    const z0 = pos.getZ(0);
    const z1 = pos.getZ(segs * vps);

    // Bounds check - is point within this terrain tile?
    if (lx < x0 || lx > x1 || lz < z0 || lz > z1) continue;

    // Compute grid cell coordinates
    const fx = (lx - x0) / (x1 - x0) * segs;
    const fz = (lz - z0) / (z1 - z0) * segs;

    const col = Math.max(0, Math.min(segs - 1, Math.floor(fx)));
    const row = Math.max(0, Math.min(segs - 1, Math.floor(fz)));

    const sx = fx - col; // 0..1 within cell
    const sz = fz - row;

    // Get four corner vertex Y values + mesh base position
    const baseY = mesh.position.y;
    const y00 = pos.getY(row * vps + col) + baseY;
    const y10 = pos.getY(row * vps + col + 1) + baseY;
    const y01 = pos.getY((row + 1) * vps + col) + baseY;
    const y11 = pos.getY((row + 1) * vps + col + 1) + baseY;

    // Bilinear interpolation - matches GPU linear triangle interpolation
    const y0 = y00 + (y10 - y00) * sx;
    const y1 = y01 + (y11 - y01) * sx;
    return y0 + (y1 - y0) * sz;
  }

  // Point not on any terrain tile - use raw elevation
  return elevationWorldYAtWorldXZ(x, z);
}

// =====================
// TERRAIN HEIGHT CACHE
// Cache terrain height lookups to avoid repeated queries during road generation
// =====================
const terrainHeightCache = new Map();
let terrainHeightCacheEnabled = true;

function cachedTerrainHeight(x, z) {
  if (!terrainHeightCacheEnabled) return terrainMeshHeightAt(x, z);

  // Round to 0.1 precision for caching (10cm grid)
  const key = `${Math.round(x * 10)},${Math.round(z * 10)}`;
  if (terrainHeightCache.has(key)) return terrainHeightCache.get(key);

  const h = terrainMeshHeightAt(x, z);
  terrainHeightCache.set(key, h);
  return h;
}

function clearTerrainHeightCache() {
  terrainHeightCache.clear();
}

function cloneTerrainTextureWithRepeat(sourceTexture, repeats) {
  if (!sourceTexture) return null;
  const texture = sourceTexture.clone();
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeats, repeats);
  texture.needsUpdate = true;
  return texture;
}

const proceduralTerrainTextureBases = {
  snow: null,
  snowRock: null
};

function hashNoise2D(x, y, seed = 1) {
  const v = Math.sin((x * 127.1 + y * 311.7 + seed * 101.3) * 0.017453292519943295) * 43758.5453123;
  return v - Math.floor(v);
}

function makeProceduralTerrainTextureSet(mode = 'snow', size = 128) {
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const colorCtx = colorCanvas.getContext('2d');
  if (!colorCtx) return null;
  const colorImage = colorCtx.createImageData(size, size);

  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = size;
  normalCanvas.height = size;
  const normalCtx = normalCanvas.getContext('2d');
  if (!normalCtx) return null;
  const normalImage = normalCtx.createImageData(size, size);

  const roughnessCanvas = document.createElement('canvas');
  roughnessCanvas.width = size;
  roughnessCanvas.height = size;
  const roughnessCtx = roughnessCanvas.getContext('2d');
  if (!roughnessCtx) return null;
  const roughnessImage = roughnessCtx.createImageData(size, size);

  const isAlpine = mode === 'snowRock';
  const colorSeed = isAlpine ? 9 : 5;
  const normalSeed = isAlpine ? 12 : 7;
  const roughSeed = isAlpine ? 15 : 11;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const macro = hashNoise2D(x * 0.06, y * 0.06, colorSeed);
      const micro = hashNoise2D(x * 0.26, y * 0.26, colorSeed + 3);
      const rockMaskRaw = isAlpine ? Math.max(0, macro * 1.25 - 0.55) : 0;
      const rockMask = isAlpine ? Math.min(1, Math.max(0, rockMaskRaw * 1.8 + micro * 0.22)) : 0;
      const snowTone = 232 + macro * 18 + micro * 10;
      const rockTone = 122 + macro * 34 + micro * 26;
      const tintBlue = isAlpine ? 2 : 6;

      const r = snowTone * (1 - rockMask) + rockTone * rockMask;
      const g = (snowTone + 3) * (1 - rockMask) + (rockTone + 7) * rockMask;
      const b = (snowTone + tintBlue) * (1 - rockMask) + (rockTone + 14) * rockMask;

      colorImage.data[idx] = Math.max(0, Math.min(255, Math.round(r)));
      colorImage.data[idx + 1] = Math.max(0, Math.min(255, Math.round(g)));
      colorImage.data[idx + 2] = Math.max(0, Math.min(255, Math.round(b)));
      colorImage.data[idx + 3] = 255;

      const nx = (hashNoise2D(x * 0.16, y * 0.16, normalSeed) - 0.5) * (isAlpine ? 54 : 34);
      const ny = (hashNoise2D(x * 0.16 + 41, y * 0.16 - 29, normalSeed + 2) - 0.5) * (isAlpine ? 54 : 34);
      normalImage.data[idx] = Math.max(0, Math.min(255, Math.round(128 + nx)));
      normalImage.data[idx + 1] = Math.max(0, Math.min(255, Math.round(128 + ny)));
      normalImage.data[idx + 2] = 255;
      normalImage.data[idx + 3] = 255;

      const roughBase = isAlpine ? 168 : 224;
      const roughVar = hashNoise2D(x * 0.18, y * 0.18, roughSeed) * (isAlpine ? 64 : 28);
      const roughMask = isAlpine ? rockMask * 18 : 0;
      const rough = Math.max(0, Math.min(255, Math.round(roughBase + roughVar + roughMask)));
      roughnessImage.data[idx] = rough;
      roughnessImage.data[idx + 1] = rough;
      roughnessImage.data[idx + 2] = rough;
      roughnessImage.data[idx + 3] = 255;
    }
  }

  colorCtx.putImageData(colorImage, 0, 0);
  normalCtx.putImageData(normalImage, 0, 0);
  roughnessCtx.putImageData(roughnessImage, 0, 0);

  const makeTexture = (canvas, isColor = false) => {
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    if (isColor) {
      if (typeof texture.colorSpace !== 'undefined' && typeof THREE.SRGBColorSpace !== 'undefined') {
        texture.colorSpace = THREE.SRGBColorSpace;
      } else if (typeof texture.encoding !== 'undefined' && typeof THREE.sRGBEncoding !== 'undefined') {
        texture.encoding = THREE.sRGBEncoding;
      }
    }
    texture.needsUpdate = true;
    return texture;
  };

  return {
    map: makeTexture(colorCanvas, true),
    normalMap: makeTexture(normalCanvas, false),
    roughnessMap: makeTexture(roughnessCanvas, false)
  };
}

function getProceduralTerrainTextureBase(mode = 'snow') {
  const key = mode === 'snowRock' ? 'snowRock' : 'snow';
  if (!proceduralTerrainTextureBases[key]) {
    proceduralTerrainTextureBases[key] = makeProceduralTerrainTextureSet(key, 128);
  }
  return proceduralTerrainTextureBases[key];
}

function ensureTerrainTextureSet(mesh, repeats, mode = 'grass') {
  if (!mesh || !mesh.userData) return null;
  if (!mesh.userData.terrainTextureSetsByMode) mesh.userData.terrainTextureSetsByMode = {};
  const modeKey = mode === 'snowRock' ? 'snowRock' : mode === 'snow' ? 'snow' : 'grass';
  const textureCacheKey = `${modeKey}:${Number(repeats) || 12}`;
  if (mesh.userData.terrainTextureSetsByMode[textureCacheKey]) {
    mesh.userData.terrainTextureSet = mesh.userData.terrainTextureSetsByMode[textureCacheKey];
    return mesh.userData.terrainTextureSet;
  }

  const source = modeKey === 'grass' ?
    {
      map: appCtx.grassDiffuse,
      normalMap: appCtx.grassNormal,
      roughnessMap: appCtx.grassRoughness
    } :
    getProceduralTerrainTextureBase(modeKey);
  if (!source) return null;

  const textureSet = {
    map: cloneTerrainTextureWithRepeat(source.map, repeats),
    normalMap: cloneTerrainTextureWithRepeat(source.normalMap, repeats),
    roughnessMap: cloneTerrainTextureWithRepeat(source.roughnessMap, repeats)
  };
  mesh.userData.terrainTextureSetsByMode[textureCacheKey] = textureSet;
  mesh.userData.terrainTextureSet = textureSet;
  return textureSet;
}

let cachedGroundFallbackMesh = null;

function getGroundFallbackMesh() {
  if (cachedGroundFallbackMesh && cachedGroundFallbackMesh.parent) return cachedGroundFallbackMesh;
  cachedGroundFallbackMesh = null;
  if (!appCtx.scene) return null;
  for (let i = 0; i < appCtx.scene.children.length; i++) {
    const child = appCtx.scene.children[i];
    if (child?.userData?.isGroundPlane) {
      cachedGroundFallbackMesh = child;
      break;
    }
  }
  return cachedGroundFallbackMesh;
}

function applyGroundFallbackProfile(profile = null) {
  const ground = getGroundFallbackMesh();
  const material = ground?.material;
  if (!ground || !material || Array.isArray(material)) return;
  const mode = profile?.mode === 'snow' || profile?.mode === 'snowRock' ? profile.mode : 'grass';
  const colorHex = mode === 'snow' ?
    GROUND_FALLBACK_SNOW_HEX :
    mode === 'snowRock' ?
      GROUND_FALLBACK_ALPINE_HEX :
      GROUND_FALLBACK_GRASS_HEX;
  material.color.setHex(colorHex);
  material.roughness = mode === 'grass' ? 0.95 : 0.86;
  material.metalness = mode === 'grass' ? 0 : 0.02;
  material.needsUpdate = true;
}

function computeElevationStatsMeters(samplesMeters) {
  if (!Array.isArray(samplesMeters) || samplesMeters.length === 0) {
    return { min: 0, max: 0, p75: 0, p90: 0 };
  }
  const sorted = samplesMeters.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return { min: 0, max: 0, p75: 0, p90: 0 };
  const pick = (p) => {
    const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p)));
    return sorted[idx];
  };
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p75: pick(0.75),
    p90: pick(0.9)
  };
}

function classifyTerrainVisualProfile(bounds, minElevationMeters = null, maxElevationMeters = null, elevationStats = null) {
  const latMid = Number.isFinite(bounds?.latN) && Number.isFinite(bounds?.latS) ?
  (bounds.latN + bounds.latS) * 0.5 :
  appCtx.LOC?.lat || 0;
  const absLat = Math.abs(latMid);
  const maxMeters = Number.isFinite(maxElevationMeters) ? maxElevationMeters : 0;
  const minMeters = Number.isFinite(minElevationMeters) ? minElevationMeters : 0;
  const p75Meters = Number.isFinite(elevationStats?.p75) ? elevationStats.p75 : maxMeters;
  const p90Meters = Number.isFinite(elevationStats?.p90) ? elevationStats.p90 : maxMeters;
  const polar = absLat >= POLAR_SNOW_LAT_THRESHOLD;
  // Use high-percentile terrain elevation so one bad pixel cannot force snow in temperate cities.
  const alpine = p90Meters >= ALPINE_SNOWLINE_METERS ||
  maxMeters >= ALPINE_SNOWLINE_METERS + 700 ||
  maxMeters >= ALPINE_SNOWLINE_METERS && p75Meters >= ALPINE_SNOWLINE_METERS * 0.5;
  const subpolarSnow = absLat >= SUBPOLAR_SNOW_LAT_THRESHOLD &&
  (p90Meters >= SUBPOLAR_SNOWLINE_METERS || maxMeters >= SUBPOLAR_SNOWLINE_METERS + 500 || minMeters >= SUBPOLAR_SNOWLINE_METERS * 0.55);
  const useSnow = polar || alpine || subpolarSnow;
  const mode = !useSnow ? 'grass' : polar ? 'snow' : 'snowRock';
  return {
    mode,
    reason: polar ? 'polar_latitude' : alpine ? 'high_elevation' : subpolarSnow ? 'cold_highland' : 'temperate',
    absLat
  };
}

function applyTerrainVisualProfile(mesh, profile, repeats = null) {
  if (!mesh || !mesh.material || Array.isArray(mesh.material)) return;
  if (!mesh.userData) mesh.userData = {};
  const mat = mesh.material;
  const tileBounds = mesh.userData.terrainTile?.bounds || null;
  const nextProfile = profile || classifyTerrainVisualProfile(tileBounds);
  const nextMode = nextProfile.mode === 'snowRock' ? 'snowRock' : nextProfile.mode === 'snow' ? 'snow' : 'grass';
  const textureRepeats = Number.isFinite(repeats) && repeats > 0 ?
  repeats :
  Number(mesh.userData.terrainTextureRepeats) || 12;
  mesh.userData.terrainTextureRepeats = textureRepeats;

  if (nextMode === 'snow' || nextMode === 'snowRock') {
    const textures = ensureTerrainTextureSet(mesh, textureRepeats, nextMode);
    mat.map = textures?.map || null;
    mat.normalMap = textures?.normalMap || null;
    mat.roughnessMap = textures?.roughnessMap || null;
    mat.color.setHex(nextMode === 'snow' ? SNOW_COLOR_HEX : ALPINE_SNOW_COLOR_HEX);
    if (mat.emissive) mat.emissive.setHex(0x000000);
    mat.emissiveIntensity = 0;
    mat.roughness = nextMode === 'snow' ? 0.94 : 0.86;
    mat.metalness = 0.01;
    mat.normalScale = nextMode === 'snow' ? new THREE.Vector2(0.2, 0.2) : new THREE.Vector2(0.45, 0.45);
  } else {
    const textures = ensureTerrainTextureSet(mesh, textureRepeats, 'grass');
    mat.map = textures?.map || null;
    mat.normalMap = textures?.normalMap || null;
    mat.roughnessMap = textures?.roughnessMap || null;
    mat.color.setHex(mat.map ? 0xffffff : GRASS_COLOR_HEX);
    if (mat.emissive) mat.emissive.setHex(0x000000);
    mat.emissiveIntensity = 0;
    mat.roughness = 0.95;
    mat.metalness = 0.0;
    if (mat.normalMap) mat.normalScale = new THREE.Vector2(0.6, 0.6);
  }

  mesh.userData.terrainVisualProfile = nextProfile;
  applyGroundFallbackProfile(nextProfile);
  mat.needsUpdate = true;
}

// =====================
// CURVATURE-AWARE ROAD RESAMPLING
// Subdivides road polylines with adaptive density based on curvature
// =====================

// Calculate curvature at point i using neighboring points
function calculateCurvature(pts, i) {
  if (i === 0 || i >= pts.length - 1) return 0;

  const p0 = pts[i - 1];
  const p1 = pts[i];
  const p2 = pts[i + 1];

  // Vector from p0 to p1
  const dx1 = p1.x - p0.x;
  const dz1 = p1.z - p0.z;
  const len1 = Math.sqrt(dx1 * dx1 + dz1 * dz1) || 1;

  // Vector from p1 to p2
  const dx2 = p2.x - p1.x;
  const dz2 = p2.z - p1.z;
  const len2 = Math.sqrt(dx2 * dx2 + dz2 * dz2) || 1;

  // Normalize
  const nx1 = dx1 / len1,nz1 = dz1 / len1;
  const nx2 = dx2 / len2,nz2 = dz2 / len2;

  // Dot product gives cos(angle)
  const dot = nx1 * nx2 + nz1 * nz2;
  const angle = Math.acos(Math.max(-1, Math.min(1, dot)));

  // Curvature = angle / average segment length
  const avgLen = (len1 + len2) / 2;
  return angle / (avgLen || 1);
}

// Subdivide road points with curvature-aware adaptive sampling
// Straight segments: 2-5 meters, Curves: 0.5-2 meters
function subdivideRoadPoints(pts, maxDist) {
  if (pts.length < 2) return pts;

  const result = [pts[0]];

  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    const dx = cur.x - prev.x;
    const dz = cur.z - prev.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    // Calculate curvature at prev and cur points
    const curvPrev = calculateCurvature(pts, i - 1);
    const curvCur = calculateCurvature(pts, i);
    const avgCurv = (curvPrev + curvCur) / 2;

    // Adaptive spacing based on curvature
    // Low curvature (< 0.1): use maxDist (2-5m)
    // High curvature (> 0.5): use minDist (0.5-2m)
    const minDist = maxDist * 0.2; // 0.5-1m for tight curves
    const curvFactor = Math.max(0, Math.min(1, avgCurv / 0.5));
    const adaptiveDist = maxDist * (1 - curvFactor * 0.8) || maxDist;

    if (dist > adaptiveDist) {
      const steps = Math.ceil(dist / adaptiveDist);
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        result.push({ x: prev.x + dx * t, z: prev.z + dz * t });
      }
    }
    result.push(cur);
  }

  return result;
}

function latLonToTileXY(lat, lon, z) {
  const n = Math.pow(2, z);
  const xt = (lon + 180) / 360 * n;
  const yt = (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * n;
  return { x: Math.floor(xt), y: Math.floor(yt), xf: xt, yf: yt };
}

function tileXYToLatLonBounds(x, y, z) {
  const n = Math.pow(2, z);
  const lonW = x / n * 360 - 180;
  const lonE = (x + 1) / n * 360 - 180;

  const latN = 180 / Math.PI * Math.atan(Math.sinh(Math.PI * (1 - 2 * (y / n))));
  const latS = 180 / Math.PI * Math.atan(Math.sinh(Math.PI * (1 - 2 * ((y + 1) / n))));

  return { latN, latS, lonW, lonE };
}

// Terrarium encoding: height_m = (R*256 + G + B/256) - 32768
function decodeTerrariumRGB(r, g, b) {
  return r * 256 + g + b / 256 - 32768;
}

function getOrLoadTerrainTile(z, x, y) {
  const key = `${z}/${x}/${y}`;
  if (appCtx.terrainTileCache.has(key)) return appCtx.terrainTileCache.get(key);

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = appCtx.TERRAIN_TILE_URL(z, x, y);

  const tile = { img, loaded: false, failed: false, elev: null, w: 256, h: 256 };
  appCtx.terrainTileCache.set(key, tile);

  img.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 256;canvas.height = 256;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, 256, 256);

      // Store elevation as Float32Array (meters)
      const elev = new Float32Array(256 * 256);
      for (let i = 0, p = 0; i < elev.length; i++, p += 4) {
        elev[i] = decodeTerrariumRGB(data[p], data[p + 1], data[p + 2]);
      }

      tile.loaded = true;
      tile.failed = false;
      tile.elev = elev;

      // IMPORTANT: After tile loads, reapply heights to any terrain meshes using this tile
      if (appCtx.terrainGroup) {
        appCtx.terrainGroup.children.forEach((mesh) => {
          const tileInfo = mesh.userData?.terrainTile;
          if (tileInfo && tileInfo.z === z && tileInfo.tx === x && tileInfo.ty === y) {
            // Tile loaded - reapply heights
            applyHeightsToTerrainMesh(mesh);
          }
        });
      }

      // Immediately schedule road + building rebuild when terrain data arrives
      // Batch rebuild work to avoid repeated expensive bursts during tile streaming.
      scheduleRoadAndBuildingRebuild();
    } catch (e) {
      console.warn('Terrain tile decode failed:', z, x, y, e);
      tile.loaded = false;
      tile.failed = true;
      tile.elev = null;
    }
  };

  img.onerror = () => {
    tile.loaded = false;
    tile.failed = true;
    tile.elev = null;
  };

  return tile;
}

// Sample elevation (meters) from a loaded tile using bilinear interpolation
function sampleTileElevationMeters(tile, u, v) {
  if (!tile || !tile.loaded || !tile.elev) return 0;

  const w = 256,h = 256;
  const x = Math.max(0, Math.min(w - 1, u * (w - 1)));
  const y = Math.max(0, Math.min(h - 1, v * (h - 1)));

  const x0 = Math.floor(x),y0 = Math.floor(y);
  const x1 = Math.min(w - 1, x0 + 1),y1 = Math.min(h - 1, y0 + 1);

  const sx = x - x0,sy = y - y0;

  const i00 = y0 * w + x0;
  const i10 = y0 * w + x1;
  const i01 = y1 * w + x0;
  const i11 = y1 * w + x1;

  const e00 = tile.elev[i00],e10 = tile.elev[i10],e01 = tile.elev[i01],e11 = tile.elev[i11];

  const ex0 = e00 + (e10 - e00) * sx;
  const ex1 = e01 + (e11 - e01) * sx;
  return clampElevationMeters(ex0 + (ex1 - ex0) * sy);
}

function worldToLatLon(x, z) {
  const lat = appCtx.LOC.lat - z / appCtx.SCALE;
  const lon = appCtx.LOC.lon + x / (appCtx.SCALE * Math.cos(appCtx.LOC.lat * Math.PI / 180));
  return { lat, lon };
}

function elevationMetersAtLatLon(lat, lon) {
  const t = latLonToTileXY(lat, lon, appCtx.TERRAIN_ZOOM);
  const tile = getOrLoadTerrainTile(appCtx.TERRAIN_ZOOM, t.x, t.y);
  if (!tile.loaded) return 0;

  const u = t.xf - t.x;
  const v = t.yf - t.y;
  return sampleTileElevationMeters(tile, u, v);
}

function elevationWorldYAtWorldXZ(x, z) {
  const { lat, lon } = worldToLatLon(x, z);
  const meters = elevationMetersAtLatLon(lat, lon);
  return meters * appCtx.WORLD_UNITS_PER_METER * appCtx.TERRAIN_Y_EXAGGERATION;
}

function ensureTerrainGroup() {
  if (!appCtx.terrainGroup) {
    appCtx.terrainGroup = new THREE.Group();
    appCtx.terrainGroup.name = 'TerrainGroup';
    appCtx.scene.add(appCtx.terrainGroup);
  }
}

function clearTerrainMeshes() {
  if (!appCtx.terrainGroup) return;
  while (appCtx.terrainGroup.children.length) {
    const m = appCtx.terrainGroup.children.pop();
    const texSet = m?.userData?.terrainTextureSet;
    if (texSet && typeof texSet === 'object') {
      Object.values(texSet).forEach((tex) => {
        if (tex && typeof tex.dispose === 'function') tex.dispose();
      });
    }
    if (m.geometry) m.geometry.dispose();
    if (m.material) m.material.dispose();
  }
}

function buildTerrainTileMesh(z, tx, ty) {
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

  // Tile grass every ~25 world units (~28 meters) for visible detail from car/walking
  const repeats = Math.max(10, Math.round(width / 25));

  const mat = new THREE.MeshStandardMaterial({
    color: typeof appCtx.grassDiffuse !== 'undefined' && appCtx.grassDiffuse ? 0xffffff : GRASS_COLOR_HEX,
    roughness: 0.95,
    metalness: 0.0,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
    wireframe: false
  });

  // Mark material for update
  mat.needsUpdate = true;

  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 0;
  mesh.position.set(cx, 0, cz);
  mesh.receiveShadow = true;
  mesh.castShadow = false; // Terrain doesn't cast shadows (performance)
  mesh.frustumCulled = false; // Don't cull terrain - always render it
  mesh.userData = { terrainTile: { z, tx, ty, bounds } };
  mesh.userData.isTerrainMesh = true; // Mark as terrain for debug mode
  mesh.userData.terrainTextureRepeats = repeats;

  applyTerrainVisualProfile(mesh, classifyTerrainVisualProfile(bounds), repeats);

  applyHeightsToTerrainMesh(mesh);

  return mesh;
}

function applyFlatFallbackToTerrainMesh(mesh) {
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

function applyHeightsToTerrainMesh(mesh) {
  const info = mesh.userData?.terrainTile;
  if (!info) return;

  const { z, tx, ty, bounds } = info;
  const tile = getOrLoadTerrainTile(z, tx, ty);
  if (!tile.loaded) {
    mesh.userData.pendingTerrainTile = true;
    // Mobile networks can fail/lag elevation tile fetches; keep terrain visible
    // with a flat fallback mesh until decoded heights arrive.
    applyFlatFallbackToTerrainMesh(mesh);
    return;
  }

  const pos = mesh.geometry.attributes.position;
  const latRange = bounds.latN - bounds.latS || 1;
  const lonRange = bounds.lonE - bounds.lonW || 1;

  // First pass: sample elevations and find range
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
    const meters = clampElevationMeters(sampleTileElevationMeters(tile, u, v));
    elevationMetersSamples.push(meters);
    const y = meters * appCtx.WORLD_UNITS_PER_METER * appCtx.TERRAIN_Y_EXAGGERATION;
    elevations.push(y);
    minElevation = Math.min(minElevation, y);
    maxElevation = Math.max(maxElevation, y);
  }

  // Position mesh base well below all vertices
  mesh.position.y = minElevation - 10;

  // Second pass: set vertex Y relative to mesh base
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

  // Store elevation range for debugging / style classification
  mesh.userData.minElevation = minElevation;
  mesh.userData.maxElevation = maxElevation;
  mesh.userData.minElevationMeters = minMeters;
  mesh.userData.maxElevationMeters = maxMeters;
  const elevationStats = computeElevationStatsMeters(elevationMetersSamples);
  mesh.userData.elevationStatsMeters = elevationStats;
  applyTerrainVisualProfile(mesh, classifyTerrainVisualProfile(bounds, minMeters, maxMeters, elevationStats));
}

function resetTerrainStreamingState() {
  lastTerrainCenterKey = null;
  lastDynamicTerrainRing = appCtx.TERRAIN_RING;
  terrain._lastUpdatePos.x = 0;
  terrain._lastUpdatePos.z = 0;
  terrain._cachedIntersections = null;
  terrain._lastRoadCount = 0;
  clearTerrainHeightCache();
}

// =====================
// INTERSECTION DETECTION
// Detect road intersections by finding shared endpoint nodes
// =====================

function detectRoadIntersections(roads) {
  const intersections = new Map(); // key: "x,z" -> array of road indices

  roads.forEach((road, roadIdx) => {
    if (!road.pts || road.pts.length < 2) return;

    // Check first and last points (endpoints)
    [0, road.pts.length - 1].forEach((idx) => {
      const pt = road.pts[idx];
      const key = `${Math.round(pt.x * 10)},${Math.round(pt.z * 10)}`; // 0.1 precision

      if (!intersections.has(key)) {
        intersections.set(key, { x: pt.x, z: pt.z, roads: [] });
      }
      let dirX = 0;
      let dirZ = 0;
      if (idx === 0) {
        dirX = road.pts[1].x - road.pts[0].x;
        dirZ = road.pts[1].z - road.pts[0].z;
      } else {
        const last = road.pts.length - 1;
        dirX = road.pts[last - 1].x - road.pts[last].x;
        dirZ = road.pts[last - 1].z - road.pts[last].z;
      }
      const dirLen = Math.hypot(dirX, dirZ) || 1;
      intersections.get(key).roads.push({
        roadIdx,
        ptIdx: idx,
        width: road.width || 8,
        dir: { x: dirX / dirLen, z: dirZ / dirLen }
      });
    });
  });

  // Filter to only actual intersections (2+ roads meeting)
  const result = [];
  intersections.forEach((data, key) => {
    if (data.roads.length >= 2) {
      // Calculate max width for intersection cap sizing
      const maxWidth = Math.max(...data.roads.map((r) => r.width));
      result.push({ x: data.x, z: data.z, roads: data.roads, maxWidth });
    }
  });

  return result;
}

function shouldBuildIntersectionCap(intersection) {
  if (!intersection || !Array.isArray(intersection.roads)) return false;
  // Caps are now only used for dense 4+ way intersections; lower branch joints
  // stay clean and rely on strip overlap to avoid circular bulges.
  if (intersection.roads.length < 4) return false;
  return true;
}

function computeIntersectionCapRadius(intersection) {
  const maxWidth = Number(intersection?.maxWidth || 8);
  const roads = Array.isArray(intersection?.roads) ? intersection.roads : [];
  const branchCount = Math.max(2, roads.length);
  const avgWidth = roads.length > 0 ?
  roads.reduce((sum, r) => sum + Number(r?.width || maxWidth), 0) / roads.length :
  maxWidth;

  const halfWidth = Math.max(avgWidth * 0.46, maxWidth * 0.44);
  const branchBoost = Math.min(0.08, Math.max(0, (branchCount - 4) * 0.04));
  const unclamped = halfWidth * (1 + branchBoost);
  const minRadius = maxWidth * 0.40;
  const maxRadius = maxWidth * 0.52;
  return Math.max(minRadius, Math.min(maxRadius, unclamped));
}

function appendIndexedGeometry(targetVerts, targetIndices, verts, indices) {
  if (!Array.isArray(verts) || verts.length === 0) return;
  const baseVertex = targetVerts.length / 3;
  targetVerts.push(...verts);
  if (Array.isArray(indices) && indices.length > 0) {
    for (let i = 0; i < indices.length; i++) {
      targetIndices.push(indices[i] + baseVertex);
    }
  } else {
    const count = verts.length / 3;
    for (let i = 0; i < count; i++) {
      targetIndices.push(baseVertex + i);
    }
  }
}

// Build road skirts (vertical curtains) to hide terrain peeking
function buildRoadSkirts(leftEdge, rightEdge, skirtDepth = 1.5) {
  const verts = [];
  const indices = [];

  // Left skirt (curtain hanging down from left edge)
  for (let i = 0; i < leftEdge.length; i++) {
    const top = leftEdge[i];
    verts.push(top.x, top.y, top.z); // Top vertex
    verts.push(top.x, top.y - skirtDepth, top.z); // Bottom vertex

    if (i < leftEdge.length - 1) {
      const vi = i * 2;
      // Two triangles forming a quad
      indices.push(vi, vi + 1, vi + 2);
      indices.push(vi + 1, vi + 3, vi + 2);
    }
  }

  const leftSkirtStartIdx = indices.length;

  // Right skirt (curtain hanging down from right edge)
  for (let i = 0; i < rightEdge.length; i++) {
    const top = rightEdge[i];
    const baseIdx = leftEdge.length * 2 + i * 2;
    verts.push(top.x, top.y, top.z); // Top vertex
    verts.push(top.x, top.y - skirtDepth, top.z); // Bottom vertex

    if (i < rightEdge.length - 1) {
      const vi = baseIdx;
      indices.push(vi, vi + 1, vi + 2);
      indices.push(vi + 1, vi + 3, vi + 2);
    }
  }

  return { verts, indices };
}

// Build intersection cap patch (circular/square mesh covering intersection)
function buildIntersectionCap(x, z, radius, segments = 16) {
  const verts = [];
  const indices = [];

  // Center vertex
  const centerY = cachedTerrainHeight(x, z) + 0.35; // Slightly above roads
  verts.push(x, centerY, z);

  // Ring vertices
  for (let i = 0; i <= segments; i++) {
    const angle = i / segments * Math.PI * 2;
    const px = x + Math.cos(angle) * radius;
    const pz = z + Math.sin(angle) * radius;
    const py = cachedTerrainHeight(px, pz) + 0.35;
    verts.push(px, py, pz);
  }

  // Triangles from center to ring
  for (let i = 0; i < segments; i++) {
    indices.push(0, i + 1, i + 2);
  }

  return { verts, indices };
}

let lastTerrainCenterKey = null;
let lastDynamicTerrainRing = appCtx.TERRAIN_RING;

function getStreamingSpeedMph() {
  if (appCtx.droneMode && appCtx.drone) return Math.max(0, Math.abs((appCtx.drone.speed || 0) * 1.8));
  if (appCtx.Walk && appCtx.Walk.state && appCtx.Walk.state.mode === 'walk') {
    return Math.max(0, Math.abs(appCtx.Walk.state.walker?.speedMph || 0));
  }
  return Math.max(0, Math.abs((appCtx.car?.speed || 0) * 0.5));
}

function getDynamicTerrainRing() {
  const baseRing = Math.max(1, appCtx.TERRAIN_RING);
  const mode = typeof appCtx.getPerfMode === 'function' ? appCtx.getPerfMode() : appCtx.perfMode || 'rdt';
  if (mode === 'baseline') return baseRing;

  const mph = getStreamingSpeedMph();
  if (mph >= 120) return Math.max(1, baseRing - 2);
  if (mph >= 70) return Math.max(1, baseRing - 1);
  return baseRing;
}

function updateTerrainAround(x, z) {
  if (!appCtx.terrainEnabled) return;

  ensureTerrainGroup();

  const { lat, lon } = worldToLatLon(x, z);
  const t = latLonToTileXY(lat, lon, appCtx.TERRAIN_ZOOM);
  const centerKey = `${appCtx.TERRAIN_ZOOM}/${t.x}/${t.y}`;
  const activeRing = getDynamicTerrainRing();
  const ringChanged = activeRing !== lastDynamicTerrainRing;
  const needsRoadRebuild = !!appCtx.roadsNeedRebuild && appCtx.roads.length > 0 && !appCtx.onMoon;
  lastDynamicTerrainRing = activeRing;
  if (typeof appCtx.setPerfLiveStat === 'function') appCtx.setPerfLiveStat('terrainRing', activeRing);

  // OPTIMIZATION: Skip if same tile AND haven't moved enough (but always run on first call)
  if (lastTerrainCenterKey !== null) {
    const dx = x - terrain._lastUpdatePos.x;
    const dz = z - terrain._lastUpdatePos.z;
    const distMoved = Math.sqrt(dx * dx + dz * dz);

    if (centerKey === lastTerrainCenterKey && distMoved < 5.0 && !ringChanged && !needsRoadRebuild) return;
  }

  const tilesChanged = centerKey !== lastTerrainCenterKey || ringChanged;
  lastTerrainCenterKey = centerKey;
  terrain._lastUpdatePos.x = x;
  terrain._lastUpdatePos.z = z;

  // Only rebuild terrain meshes if tiles actually changed
  if (tilesChanged) {
    clearTerrainMeshes();

    for (let dx = -activeRing; dx <= activeRing; dx++) {
      for (let dy = -activeRing; dy <= activeRing; dy++) {
        const tx = t.x + dx;
        const ty = t.y + dy;
        const mesh = buildTerrainTileMesh(appCtx.TERRAIN_ZOOM, tx, ty);
        appCtx.terrainGroup.add(mesh);
      }
    }

    // Only rebuild roads when terrain tiles actually change (not every frame)
    if (appCtx.roads.length > 0 && !appCtx.onMoon) {
      scheduleRoadAndBuildingRebuild();
    }
  } else if (needsRoadRebuild) {
    scheduleRoadAndBuildingRebuild();
  }
}

// Rebuild roads to follow current terrain elevation with improved conformance
function rebuildRoadsWithTerrain() {
  if (!appCtx.terrainEnabled || appCtx.roads.length === 0 || appCtx.onMoon) return;

  // Disable debug mode before rebuild to prevent stuck materials
  if (roadDebugMode && typeof disableRoadDebugMode === 'function') {
    disableRoadDebugMode();
  }

  // Check if terrain tiles are loaded
  let tilesLoaded = 0;
  let tilesTotal = 0;
  appCtx.terrainTileCache.forEach((tile) => {
    tilesTotal++;
    if (tile.loaded) tilesLoaded++;
  });

  if (tilesLoaded === 0 || tilesTotal === 0) return;

  // OPTIMIZATION: Only clear height cache if road count changed (roads added/removed)
  // Otherwise keep cached heights for better performance
  const roadCountChanged = appCtx.roads.length !== terrain._lastRoadCount;
  if (roadCountChanged) {
    clearTerrainHeightCache();
    terrain._lastRoadCount = appCtx.roads.length;
  }

  // Remove old road meshes
  appCtx.roadMeshes.forEach((m) => {
    appCtx.scene.remove(m);
    if (m.geometry) m.geometry.dispose();
    // Road batch materials are shared/reused across rebuilds; don't dispose here.
    if (m.material && !m.userData?.sharedRoadMaterial) {
      if (Array.isArray(m.material)) {
        m.material.forEach((mat) => {
          if (mat && typeof mat.dispose === 'function') mat.dispose();
        });
      } else if (typeof m.material.dispose === 'function') {
        m.material.dispose();
      }
    }
  });
  appCtx.roadMeshes = [];

  // OPTIMIZATION: Cache intersection detection - only recalculate if roads changed
  let intersections;
  if (roadCountChanged || !terrain._cachedIntersections) {
    intersections = detectRoadIntersections(appCtx.roads);
    terrain._cachedIntersections = intersections;
  } else {
    intersections = terrain._cachedIntersections;
  }

  const roadMainBatchVerts = [];
  const roadMainBatchIdx = [];
  const roadSkirtBatchVerts = [];
  const roadSkirtBatchIdx = [];
  const roadCapBatchVerts = [];
  const roadCapBatchIdx = [];

  const sharedRoadMaterials = getSharedRoadMaterials();
  const roadMat = sharedRoadMaterials.roadMat;
  const skirtMat = sharedRoadMaterials.skirtMat;
  const capMat = sharedRoadMaterials.capMat;

  // Rebuild each road with improved terrain conformance
  appCtx.roads.forEach((road) => {
    const { width } = road;
    const hw = width / 2;

    // Curvature-aware subdivision: straight = 2-5m, curves = 0.5-2m
    const detail = Number.isFinite(road?.subdivideMaxDist) ? road.subdivideMaxDist : 3.5;
    const pts = subdivideRoadPoints(road.pts, detail);

    const verts = [];
    const indices = [];
    const leftEdge = [];
    const rightEdge = [];

    // First pass: sample terrain heights at center of each road point
    const centerHeights = new Float64Array(pts.length);
    for (let i = 0; i < pts.length; i++) {
      centerHeights[i] = cachedTerrainHeight(pts[i].x, pts[i].z);
    }

    // OPTIMIZATION: Smooth center heights to eliminate stair-stepping (reduced from 3 to 1 pass)
    for (let pass = 0; pass < 1; pass++) {
      for (let i = 1; i < pts.length - 1; i++) {
        centerHeights[i] = centerHeights[i] * 0.6 +
        (centerHeights[i - 1] + centerHeights[i + 1]) * 0.2;
      }
    }

    // Build road strip with DIRECT edge snapping (not tilt from center)
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];

      // Calculate tangent direction
      let dx, dz;
      if (i === 0) {
        dx = pts[1].x - p.x;
        dz = pts[1].z - p.z;
      } else if (i === pts.length - 1) {
        dx = p.x - pts[i - 1].x;
        dz = p.z - pts[i - 1].z;
      } else {
        dx = pts[i + 1].x - pts[i - 1].x;
        dz = pts[i + 1].z - pts[i - 1].z;
      }

      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      const nx = -dz / len;
      const nz = dx / len;
      const endpointExtend = Math.max(
        ROAD_ENDPOINT_EXTENSION_MIN,
        Math.min(ROAD_ENDPOINT_EXTENSION_MAX, hw * ROAD_ENDPOINT_EXTENSION_SCALE)
      );
      const isEndpoint = i === 0 || i === pts.length - 1;
      const endpointDir = i === 0 ? -1 : 1;
      const px = isEndpoint ? p.x + endpointDir * (dx / len) * endpointExtend : p.x;
      const pz = isEndpoint ? p.z + endpointDir * (dz / len) * endpointExtend : p.z;

      const leftX = px + nx * hw;
      const leftZ = pz + nz * hw;
      const rightX = px - nx * hw;
      const rightZ = pz - nz * hw;

      let leftY = cachedTerrainHeight(leftX, leftZ);
      let rightY = cachedTerrainHeight(rightX, rightZ);
      const verticalBias = 0.42;
      leftY += verticalBias;
      rightY += verticalBias;

      leftEdge.push({ x: leftX, y: leftY, z: leftZ });
      rightEdge.push({ x: rightX, y: rightY, z: rightZ });
    }

    // OPTIMIZATION: Smooth edge heights to eliminate micro-bumps (reduced from 2 to 1 pass)
    for (let pass = 0; pass < 1; pass++) {
      for (let i = 1; i < leftEdge.length - 1; i++) {
        leftEdge[i].y = leftEdge[i].y * 0.6 + (leftEdge[i - 1].y + leftEdge[i + 1].y) * 0.2;
        rightEdge[i].y = rightEdge[i].y * 0.6 + (rightEdge[i - 1].y + rightEdge[i + 1].y) * 0.2;
      }
    }

    for (let i = 0; i < leftEdge.length; i++) {
      verts.push(leftEdge[i].x, leftEdge[i].y, leftEdge[i].z);
      verts.push(rightEdge[i].x, rightEdge[i].y, rightEdge[i].z);
      if (i < leftEdge.length - 1) {
        const vi = i * 2;
        indices.push(vi, vi + 1, vi + 2, vi + 1, vi + 3, vi + 2);
      }
    }
    appendIndexedGeometry(roadMainBatchVerts, roadMainBatchIdx, verts, indices);

    // Build road skirts (edge curtains) to hide terrain peeking
    const skirtData = buildRoadSkirts(leftEdge, rightEdge, 3.6);
    if (skirtData.verts.length > 0) {
      appendIndexedGeometry(roadSkirtBatchVerts, roadSkirtBatchIdx, skirtData.verts, skirtData.indices);
    }
  });

  // Build intersection cap patches
  intersections.forEach((intersection) => {
    if (!shouldBuildIntersectionCap(intersection)) return;
    const radius = computeIntersectionCapRadius(intersection);
    const capData = buildIntersectionCap(intersection.x, intersection.z, radius, 24);
    appendIndexedGeometry(roadCapBatchVerts, roadCapBatchIdx, capData.verts, capData.indices);
  });

  const buildRoadBatchMesh = (verts, indices, material, renderOrder, userData = {}) => {
    if (!verts.length || !indices.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    const vertexCount = verts.length / 3;
    const indexArray = vertexCount > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
    geo.setIndex(new THREE.BufferAttribute(indexArray, 1));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material);
    mesh.renderOrder = renderOrder;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    Object.assign(mesh.userData, userData, { sharedRoadMaterial: true });
    appCtx.scene.add(mesh);
    appCtx.roadMeshes.push(mesh);
    return mesh;
  };

  buildRoadBatchMesh(roadMainBatchVerts, roadMainBatchIdx, roadMat, 2, { isRoadBatch: true });
  buildRoadBatchMesh(roadSkirtBatchVerts, roadSkirtBatchIdx, skirtMat, 1, { isRoadBatch: true, isRoadSkirt: true });
  buildRoadBatchMesh(roadCapBatchVerts, roadCapBatchIdx, capMat, 3, { isRoadBatch: true, isIntersectionCap: true });

  appCtx.roadsNeedRebuild = false;

  // Run validation if enabled
  if (typeof validateRoadTerrainConformance === 'function') {
    setTimeout(() => validateRoadTerrainConformance(), 100);
  }
}

function reprojectWaterwayMeshToTerrain(mesh) {
  const centerline = mesh.userData?.waterwayCenterline;
  if (!centerline || centerline.length < 2) return false;

  const width = mesh.userData?.waterwayWidth || 6;
  const halfWidth = width * 0.5;
  const verticalBias = Number.isFinite(mesh.userData?.waterwayBias) ? mesh.userData.waterwayBias : 0.08;
  const positions = mesh.geometry?.attributes?.position;
  if (!positions || positions.count < centerline.length * 2) return false;

  for (let i = 0; i < centerline.length; i++) {
    const p = centerline[i];

    let dx, dz;
    if (i === 0) {
      dx = centerline[1].x - p.x;
      dz = centerline[1].z - p.z;
    } else if (i === centerline.length - 1) {
      dx = p.x - centerline[i - 1].x;
      dz = p.z - centerline[i - 1].z;
    } else {
      dx = centerline[i + 1].x - centerline[i - 1].x;
      dz = centerline[i + 1].z - centerline[i - 1].z;
    }

    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;

    const leftX = p.x + nx * halfWidth;
    const leftZ = p.z + nz * halfWidth;
    const rightX = p.x - nx * halfWidth;
    const rightZ = p.z - nz * halfWidth;
    const leftY = terrainMeshHeightAt(leftX, leftZ) + verticalBias;
    const rightY = terrainMeshHeightAt(rightX, rightZ) + verticalBias;

    positions.setXYZ(i * 2, leftX, leftY, leftZ);
    positions.setXYZ(i * 2 + 1, rightX, rightY, rightZ);
  }

  positions.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  return true;
}

// Reposition buildings and landuse to follow terrain
function repositionBuildingsWithTerrain() {
  if (!appCtx.terrainEnabled || appCtx.onMoon) return;

  let buildingsRepositioned = 0;
  let landuseRepositioned = 0;
  let poisRepositioned = 0;

  // Reposition buildings using terrain mesh surface
  appCtx.buildingMeshes.forEach((mesh) => {
    const pts = mesh.userData.buildingFootprint;
    if (!pts || pts.length === 0) return;

    const fallbackElevation = Number.isFinite(mesh.userData?.avgElevation) ?
    mesh.userData.avgElevation :
    0;

    // Use minimum elevation of footprint corners so building sits on terrain.
    // Prefer terrain mesh samples; if unavailable, fall back to base elevation
    // model to avoid buildings popping/floating while tiles stream in.
    let minElevation = Infinity;
    let maxElevation = -Infinity;
    let sampleCount = 0;
    pts.forEach((p) => {
      let h = terrainMeshHeightAt(p.x, p.z);
      if ((!Number.isFinite(h) || h === 0) && typeof elevationWorldYAtWorldXZ === 'function') {
        h = elevationWorldYAtWorldXZ(p.x, p.z);
      }
      if (h === 0 && Math.abs(fallbackElevation) > 2) h = fallbackElevation;
      if (!Number.isFinite(h)) return;
      minElevation = Math.min(minElevation, h);
      maxElevation = Math.max(maxElevation, h);
      sampleCount++;
    });
    if (!Number.isFinite(minElevation) || sampleCount === 0) {
      minElevation = Number.isFinite(fallbackElevation) ? fallbackElevation : 0;
      maxElevation = minElevation;
    }
    const slopeRange = Number.isFinite(maxElevation) && Number.isFinite(minElevation) ?
    Math.max(0, maxElevation - minElevation) :
    0;
    const reliefLift = slopeRange >= 0.15 ?
    Math.min(0.35, slopeRange * 0.22) :
    0.05;
    const baseElevation = minElevation + reliefLift;

    const midLodHalfHeight = Number.isFinite(mesh.userData?.midLodHalfHeight) ?
    mesh.userData.midLodHalfHeight :
    0;
    mesh.position.y = baseElevation + midLodHalfHeight;
    mesh.userData.avgElevation = baseElevation;
    buildingsRepositioned++;
  });

  // Reposition landuse areas - deform vertices to follow terrain mesh surface
  appCtx.landuseMeshes.forEach((mesh) => {
    if (mesh.userData?.isWaterwayLine) {
      if (reprojectWaterwayMeshToTerrain(mesh)) landuseRepositioned++;
      return;
    }

    const pts = mesh.userData.landuseFootprint;
    if (!pts || pts.length === 0) return;

    // Recalculate average elevation from terrain mesh
    let avgElevation = 0;
    pts.forEach((p) => {
      avgElevation += terrainMeshHeightAt(p.x, p.z);
    });
    avgElevation /= pts.length;

    mesh.position.y = avgElevation;

    // Deform each vertex to follow actual terrain mesh surface
    const positions = mesh.geometry.attributes.position;
    if (positions) {
      const isWaterPolygon = mesh.userData?.landuseType === 'water';
      const flattenFactor = isWaterPolygon ?
      Number.isFinite(mesh.userData?.waterFlattenFactor) ? mesh.userData.waterFlattenFactor : 0.12 :
      1.0;
      const vertexOffset = isWaterPolygon ? 0.08 : 0.05;
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const z = positions.getZ(i);
        const tY = terrainMeshHeightAt(x, z);
        positions.setY(i, (tY - avgElevation) * flattenFactor + vertexOffset);
      }
      positions.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
      landuseRepositioned++;
    }
  });

  // Reposition POI markers using terrain mesh surface
  appCtx.poiMeshes.forEach((mesh) => {
    const pos = mesh.userData.poiPosition;
    if (!pos) return;

    const tY = terrainMeshHeightAt(pos.x, pos.z);
    const offset = mesh.userData.isCapMesh ? 4 : 2;
    mesh.position.y = tY + offset;
    poisRepositioned++;
  });

  // Reposition street furniture using terrain mesh surface
  appCtx.streetFurnitureMeshes.forEach((group) => {
    if (!group.userData || !group.userData.furniturePos) return;
    const pos = group.userData.furniturePos;
    const tY = terrainMeshHeightAt(pos.x, pos.z);
    group.position.y = tY;
  });

  // Debug log removed
}

// =====================
// ROAD DEBUG MODE
// Toggle with 'R' key to visualize road-terrain conformance issues
// =====================
let roadDebugMode = false;
let roadDebugMeshes = [];

// Force disable debug mode and restore materials (useful if stuck)
function disableRoadDebugMode() {
  if (!roadDebugMode) return;

  roadDebugMode = false;

  // Clear debug meshes
  roadDebugMeshes.forEach((m) => {
    appCtx.scene.remove(m);
    if (m.geometry) m.geometry.dispose();
    if (m.material) m.material.dispose();
  });
  roadDebugMeshes = [];

  // DISABLED: Terrain materials are no longer overridden in debug mode
  // No need to restore them
  /*
  if (terrainGroup) {
    terrainGroup.children.forEach(mesh => {
      if (mesh.userData._originalMaterial) {
        mesh.material.dispose();
        mesh.material = mesh.userData._originalMaterial;
        delete mesh.userData._originalMaterial;
      }
    });
  }
  */

  // Restore original road materials
  appCtx.roadMeshes.forEach((mesh) => {
    if (mesh.userData._originalMaterial) {
      mesh.material.dispose();
      mesh.material = mesh.userData._originalMaterial;
      delete mesh.userData._originalMaterial;
    }
  });

  console.log('🔍 Road Debug Mode FORCE DISABLED - Materials restored');
}

function toggleRoadDebugMode() {
  roadDebugMode = !roadDebugMode;

  // Clear existing debug meshes
  roadDebugMeshes.forEach((m) => {
    appCtx.scene.remove(m);
    if (m.geometry) m.geometry.dispose();
    if (m.material) m.material.dispose();
  });
  roadDebugMeshes = [];

  if (roadDebugMode) {
    console.log('🔍 Road Debug Mode ENABLED');

    // DISABLED: Do NOT override terrain materials - keep grass visible
    // Users complained grass disappeared in debug mode
    // Terrain stays normal, only roads are highlighted
    /*
    if (terrainGroup) {
      terrainGroup.children.forEach(mesh => {
        if (!mesh.userData._originalMaterial) {
          mesh.userData._originalMaterial = mesh.material;
        }
        mesh.material = new THREE.MeshBasicMaterial({
          color: 0x00ff00, // Green terrain
          wireframe: false
        });
      });
    }
    */

    // Override road materials with solid color
    appCtx.roadMeshes.forEach((mesh) => {
      if (mesh.userData.isRoadSkirt || mesh.userData.isIntersectionCap) return;

      if (!mesh.userData._originalMaterial) {
        mesh.userData._originalMaterial = mesh.material;
      }
      mesh.material = new THREE.MeshBasicMaterial({
        color: 0xff0000, // Red roads
        side: THREE.DoubleSide
      });
    });

    // Draw road edge lines and sample points
    appCtx.roadMeshes.forEach((mesh) => {
      if (mesh.userData.isRoadSkirt || mesh.userData.isIntersectionCap) return;

      const pos = mesh.geometry.attributes.position;
      if (!pos) return;

      // Extract edge points
      const points = [];
      for (let i = 0; i < pos.count; i += 2) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        points.push(new THREE.Vector3(x, y + 0.5, z));
      }

      // Draw yellow line along edge
      if (points.length > 1) {
        const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
        const lineMat = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 2 });
        const line = new THREE.Line(lineGeo, lineMat);
        appCtx.scene.add(line);
        roadDebugMeshes.push(line);
      }

      // Draw sample point spheres every 10 points
      for (let i = 0; i < points.length; i += 10) {
        const sphereGeo = new THREE.SphereGeometry(0.3, 8, 8);
        const sphereMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const sphere = new THREE.Mesh(sphereGeo, sphereMat);
        sphere.position.copy(points[i]);
        appCtx.scene.add(sphere);
        roadDebugMeshes.push(sphere);
      }
    });

    // Highlight problem areas (road below terrain)
    appCtx.roadMeshes.forEach((mesh) => {
      if (mesh.userData.isRoadSkirt || mesh.userData.isIntersectionCap) return;

      const pos = mesh.geometry.attributes.position;
      if (!pos) return;

      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const terrainY = terrainMeshHeightAt(x, z);
        const delta = y - terrainY;

        // Flag if road is significantly below terrain
        if (delta < -0.05) {
          const markerGeo = new THREE.BoxGeometry(0.5, 2, 0.5);
          const markerMat = new THREE.MeshBasicMaterial({ color: 0xff00ff }); // Magenta warning
          const marker = new THREE.Mesh(markerGeo, markerMat);
          marker.position.set(x, y + 1, z);
          appCtx.scene.add(marker);
          roadDebugMeshes.push(marker);
        }
      }
    });

  } else {
    console.log('🔍 Road Debug Mode DISABLED');

    // DISABLED: Terrain materials are never overridden now, so nothing to restore
    /*
    if (terrainGroup) {
      terrainGroup.children.forEach(mesh => {
        if (mesh.userData._originalMaterial) {
          mesh.material = mesh.userData._originalMaterial;
          delete mesh.userData._originalMaterial;
        }
      });
    }
    */

    // Restore original road materials
    appCtx.roadMeshes.forEach((mesh) => {
      if (mesh.userData._originalMaterial) {
        mesh.material = mesh.userData._originalMaterial;
        delete mesh.userData._originalMaterial;
      }
    });
  }
}

// =====================
// ROAD-TERRAIN CONFORMANCE VALIDATOR
// Automated runtime checks for road-terrain alignment
// =====================

function validateRoadTerrainConformance() {
  if (!appCtx.terrainEnabled || appCtx.roads.length === 0 || appCtx.onMoon) return;

  console.log('🔬 Validating road-terrain conformance...');

  let totalSamples = 0;
  let issuesFound = 0;
  const worstDeltas = [];

  appCtx.roadMeshes.forEach((mesh, meshIdx) => {
    if (mesh.userData.isRoadSkirt || mesh.userData.isIntersectionCap) return;

    const pos = mesh.geometry.attributes.position;
    if (!pos) return;

    const roadIdx = mesh.userData.roadIdx;
    const road = appCtx.roads[roadIdx];
    if (!road) return;

    // Sample every 5th vertex (performance)
    for (let i = 0; i < pos.count; i += 5) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);

      const terrainY = terrainMeshHeightAt(x, z);
      const delta = y - terrainY;

      totalSamples++;

      // Flag issues
      if (delta < -0.05) {
        issuesFound++;
        const { lat, lon } = worldToLatLon(x, z);
        worstDeltas.push({
          roadName: road.name || `Road ${roadIdx}`,
          delta: delta.toFixed(3),
          lat: lat.toFixed(6),
          lon: lon.toFixed(6),
          worldPos: `(${x.toFixed(1)}, ${z.toFixed(1)})`
        });
      }
    }
  });

  // Sort by worst delta
  worstDeltas.sort((a, b) => parseFloat(a.delta) - parseFloat(b.delta));

  console.log(`✅ Validation complete: ${totalSamples} samples checked`);

  if (issuesFound > 0) {
    console.warn(`⚠️  Found ${issuesFound} points where road is below terrain (delta < -0.05)`);
    console.warn('Worst 10 deltas:');
    worstDeltas.slice(0, 10).forEach((d) => {
      console.warn(`  ${d.roadName}: delta=${d.delta}m at ${d.worldPos} (${d.lat}, ${d.lon})`);
    });
  } else {
    console.log('✅ No issues found - all roads conform to terrain!');
  }

  // Check for gaps at intersections
  const intersections = detectRoadIntersections(appCtx.roads);
  console.log(`📍 Detected ${intersections.length} intersections`);

  return {
    totalSamples,
    issuesFound,
    worstDeltas: worstDeltas.slice(0, 10),
    intersectionCount: intersections.length
  };
}

Object.assign(appCtx, {
  applyTerrainVisualProfile,
  applyHeightsToTerrainMesh,
  buildRoadSkirts,
  buildTerrainTileMesh,
  cachedTerrainHeight,
  classifyTerrainVisualProfile,
  clearTerrainHeightCache,
  clearTerrainMeshes,
  decodeTerrariumRGB,
  detectRoadIntersections,
  elevationMetersAtLatLon,
  elevationWorldYAtWorldXZ,
  ensureTerrainGroup,
  getOrLoadTerrainTile,
  latLonToTileXY,
  rebuildRoadsWithTerrain,
  repositionBuildingsWithTerrain,
  resetTerrainStreamingState,
  sampleTileElevationMeters,
  subdivideRoadPoints,
  terrainMeshHeightAt,
  tileXYToLatLonBounds,
  toggleRoadDebugMode,
  updateTerrainAround,
  validateRoadTerrainConformance,
  worldToLatLon
});

export {
  applyTerrainVisualProfile,
  applyHeightsToTerrainMesh,
  buildRoadSkirts,
  buildTerrainTileMesh,
  cachedTerrainHeight,
  classifyTerrainVisualProfile,
  clearTerrainHeightCache,
  clearTerrainMeshes,
  decodeTerrariumRGB,
  detectRoadIntersections,
  elevationMetersAtLatLon,
  elevationWorldYAtWorldXZ,
  ensureTerrainGroup,
  getOrLoadTerrainTile,
  latLonToTileXY,
  rebuildRoadsWithTerrain,
  repositionBuildingsWithTerrain,
  resetTerrainStreamingState,
  sampleTileElevationMeters,
  subdivideRoadPoints,
  terrainMeshHeightAt,
  tileXYToLatLonBounds,
  toggleRoadDebugMode,
  updateTerrainAround,
  validateRoadTerrainConformance,
  worldToLatLon };
