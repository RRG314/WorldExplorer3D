import { ctx as appCtx } from "./shared-context.js?v=55";

const OCEAN_SITE = Object.freeze({
  name: 'Coral Shelf Reserve',
  region: 'Great Barrier Reef',
  lat: -18.2861,
  lon: 147.7000
});
const OCEAN_BATHYMETRY_GRID_URL = './data/ocean-bathymetry-great-barrier-reef.json';

const OCEAN_CONSTANTS = Object.freeze({
  MAX_SPEED: 16.0,
  MAX_VERTICAL_SPEED: 7.4,
  MAX_TURN_SPEED: 1.8,
  SPEED_RESPONSE: 2.7,
  TURN_RESPONSE: 4.4,
  VERTICAL_RESPONSE: 3.4,
  DRAG: 0.94,
  MIN_CLEARANCE: 1.6,
  SURFACE_Y: -0.15,
  HARD_MIN_Y: -210,
  WORLD_RADIUS: 1200,
  SUB_SCALE: 0.86,
  FOLLOW_DISTANCE: 19,
  FOLLOW_HEIGHT: 6.6,
  LOOK_AHEAD: 13,
  LOOK_HEIGHT: 1.8,
  FOLLOW_LERP: 4.4,
  LOOK_LERP: 5.6,
  MODEL_YAW_OFFSET: 0,
  MAX_PITCH: 0.52,
  MAX_ROLL: 0.5,
  PITCH_FROM_VERTICAL: 0.09,
  ROLL_FROM_TURN: 0.3,
  BATHYMETRY_WAIT_MS: 3200
});

const oceanMode = appCtx.oceanMode && typeof appCtx.oceanMode === 'object' ? appCtx.oceanMode : {};
Object.assign(oceanMode, {
  active: false,
  scene: null,
  camera: null,
  renderer: null,
  canvas: null,
  animationId: null,
  fishEntities: [],
  fishSchools: [],
  sharkEntity: null,
  launchSite: OCEAN_SITE,
  lastFrameMs: 0,
  cameraLookTarget: null,
  seabedMesh: null,
  reefGroup: null,
  marineParticles: null,
  deepBackdrop: null,
  bathymetryReady: false,
  bathymetryBlend: 0.0,
  bathymetryCache: new Map(),
  bathymetryPromise: null,
  bathymetryTileKeys: [],
  localBathymetryGrid: null,
  localBathymetryReady: false,
  localBathymetryPromise: null,
  submarine: {
    mesh: null,
    position: new THREE.Vector3(0, -10.5, 62),
    yaw: 0,
    pitch: 0,
    roll: 0,
    speed: 0,
    turnSpeed: 0,
    verticalSpeed: 0
  }
});
appCtx.oceanMode = oceanMode;

const _tmpVecA = new THREE.Vector3();
const _tmpVecB = new THREE.Vector3();
const _tmpVecC = new THREE.Vector3();
const _tmpVecD = new THREE.Vector3();
const _tmpObj = new THREE.Object3D();
let _seabedTextureSet = null;
let _rockTextureSet = null;

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(edge0, edge1, x) {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function expApproachFactor(rate, dt) {
  return 1 - Math.exp(-rate * dt);
}

function fract(v) {
  return v - Math.floor(v);
}

function hash2D(x, y, seed = 1) {
  return fract(Math.sin((x * 127.1 + y * 311.7 + seed * 74.7) * 0.017453292519943295) * 43758.5453);
}

function valueNoise2D(x, y, seed = 1) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const sx = x - x0;
  const sy = y - y0;

  const n00 = hash2D(x0, y0, seed);
  const n10 = hash2D(x1, y0, seed);
  const n01 = hash2D(x0, y1, seed);
  const n11 = hash2D(x1, y1, seed);

  const ix0 = lerp(n00, n10, sx);
  const ix1 = lerp(n01, n11, sx);
  return lerp(ix0, ix1, sy);
}

function oceanWorldToLatLon(x, z) {
  const lat = oceanMode.launchSite.lat - z / appCtx.SCALE;
  const lonDenom = appCtx.SCALE * Math.cos(oceanMode.launchSite.lat * Math.PI / 180);
  const lon = oceanMode.launchSite.lon + x / (Math.abs(lonDenom) > 0.0001 ? lonDenom : appCtx.SCALE);
  return { lat, lon };
}

function parseLocalBathymetryGrid(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const bounds = payload.bounds;
  const grid = payload.grid;
  const values = payload.elevationsMeters;
  if (!bounds || !grid || !Array.isArray(values)) return null;
  const rows = Number(grid.rows);
  const cols = Number(grid.cols);
  if (!Number.isFinite(rows) || !Number.isFinite(cols) || rows < 2 || cols < 2) return null;
  if (values.length !== rows * cols) return null;
  const latMin = Number(bounds.latMin);
  const latMax = Number(bounds.latMax);
  const lonMin = Number(bounds.lonMin);
  const lonMax = Number(bounds.lonMax);
  if (![latMin, latMax, lonMin, lonMax].every((v) => Number.isFinite(v))) return null;
  if (latMax <= latMin || lonMax <= lonMin) return null;
  return { rows, cols, latMin, latMax, lonMin, lonMax, values };
}

function primeLocalBathymetryGrid() {
  if (oceanMode.localBathymetryPromise) return oceanMode.localBathymetryPromise;
  oceanMode.localBathymetryPromise = (async () => {
    try {
      const response = await fetch(OCEAN_BATHYMETRY_GRID_URL, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const parsed = parseLocalBathymetryGrid(payload);
      if (!parsed) throw new Error('Invalid local bathymetry payload');
      oceanMode.localBathymetryGrid = parsed;
      oceanMode.localBathymetryReady = true;
      oceanMode.bathymetryReady = true;
      oceanMode.bathymetryCache.clear();
      return true;
    } catch (error) {
      console.warn('[OceanMode] Local bathymetry grid unavailable, falling back to procedural/terrain blend.', error);
      oceanMode.localBathymetryGrid = null;
      oceanMode.localBathymetryReady = false;
      return false;
    }
  })();
  return oceanMode.localBathymetryPromise;
}

function sampleLocalBathymetryMeters(lat, lon) {
  const grid = oceanMode.localBathymetryGrid;
  if (!grid) return null;
  if (lat < grid.latMin || lat > grid.latMax || lon < grid.lonMin || lon > grid.lonMax) return null;

  const u = (lon - grid.lonMin) / (grid.lonMax - grid.lonMin);
  const v = (grid.latMax - lat) / (grid.latMax - grid.latMin); // north->south rows
  const x = clamp01(u) * (grid.cols - 1);
  const y = clamp01(v) * (grid.rows - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(grid.cols - 1, x0 + 1);
  const y1 = Math.min(grid.rows - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;

  const idx = (r, c) => r * grid.cols + c;
  const h00 = Number(grid.values[idx(y0, x0)]);
  const h10 = Number(grid.values[idx(y0, x1)]);
  const h01 = Number(grid.values[idx(y1, x0)]);
  const h11 = Number(grid.values[idx(y1, x1)]);
  if (![h00, h10, h01, h11].every((v2) => Number.isFinite(v2))) return null;

  const h0 = lerp(h00, h10, fx);
  const h1 = lerp(h01, h11, fx);
  return lerp(h0, h1, fy);
}

function sampleTerrainMetersAtLatLon(lat, lon) {
  if (
    typeof appCtx.latLonToTileXY === 'function' &&
    typeof appCtx.getOrLoadTerrainTile === 'function' &&
    typeof appCtx.sampleTileElevationMeters === 'function' &&
    Number.isFinite(appCtx.TERRAIN_ZOOM)
  ) {
    const t = appCtx.latLonToTileXY(lat, lon, appCtx.TERRAIN_ZOOM);
    const tile = appCtx.getOrLoadTerrainTile(appCtx.TERRAIN_ZOOM, t.x, t.y);
    if (!tile || !tile.loaded || !tile.elev) return null;
    const u = t.xf - t.x;
    const v = t.yf - t.y;
    const meters = appCtx.sampleTileElevationMeters(tile, u, v);
    return Number.isFinite(meters) ? meters : null;
  }

  if (typeof appCtx.elevationMetersAtLatLon === 'function') {
    const meters = Number(appCtx.elevationMetersAtLatLon(lat, lon));
    return Number.isFinite(meters) ? meters : null;
  }

  return null;
}

function mapBathymetryMetersToWorldY(meters) {
  if (!Number.isFinite(meters)) return null;

  // Many terrain rasters report ~0m for open water. Treat near sea-level reads as unknown
  // so ocean mode keeps the procedural reef profile instead of flattening to a shallow slab.
  if (Math.abs(meters) <= 1.5) {
    return null;
  }

  if (meters >= 0) {
    const shelfLift = Math.min(18, meters * 0.028);
    return -14 + shelfLift;
  }

  const depthMeters = Math.min(9000, Math.abs(meters));
  const curve = 1 - Math.exp(-depthMeters / 1800);
  return -14 - curve * 134;
}

function sampleRealSeabedHeight(x, z) {
  const key = `${Math.round(x / 18)},${Math.round(z / 18)}`;
  if (oceanMode.bathymetryCache.has(key)) {
    return oceanMode.bathymetryCache.get(key);
  }

  const { lat, lon } = oceanWorldToLatLon(x, z);
  const localMeters = sampleLocalBathymetryMeters(lat, lon);
  const meters = Number.isFinite(localMeters) ? localMeters : sampleTerrainMetersAtLatLon(lat, lon);
  const mapped = mapBathymetryMetersToWorldY(meters);
  const sampled = Number.isFinite(mapped) ? mapped : null;
  oceanMode.bathymetryCache.set(key, sampled);
  return sampled;
}

function sampleProceduralSeabedHeight(x, z) {
  const reefDx = x - 24;
  const reefDz = z - 124;
  const reefLift = Math.exp(-(reefDx * reefDx + reefDz * reefDz) / 23000) * 30;

  const shelfDx = x + 125;
  const shelfDz = z - 10;
  const shelfLift = Math.exp(-(shelfDx * shelfDx + shelfDz * shelfDz) / 110000) * 11;

  const canyonMask = smoothstep(65, 420, -z + 65);
  const abyssDrop = canyonMask * 76;

  const ridgeNoise = valueNoise2D(x * 0.02 + 80, z * 0.02 - 45, 7);
  const fineNoise = valueNoise2D(x * 0.085 - 30, z * 0.085 + 19, 13);
  const wave = Math.sin(x * 0.013) * 2.1 + Math.cos(z * 0.014) * 1.8;
  const ripples = (ridgeNoise - 0.5) * 6.3 + (fineNoise - 0.5) * 2.9 + wave;

  return -58 + reefLift + shelfLift + ripples - abyssDrop;
}

function sampleSeabedHeight(x, z) {
  const procedural = sampleProceduralSeabedHeight(x, z);
  const real = sampleRealSeabedHeight(x, z);
  if (!Number.isFinite(real)) return procedural;

  const reefDx = x - 24;
  const reefDz = z - 124;
  const reefWeight = Math.exp(-(reefDx * reefDx + reefDz * reefDz) / 25000);

  const baseBlend = oceanMode.bathymetryReady ? 0.52 : 0.3;
  const blend = baseBlend * (1 - reefWeight * 0.44);
  return lerp(procedural, real, clamp01(blend));
}

function primeBathymetryTiles() {
  if (oceanMode.bathymetryPromise) return oceanMode.bathymetryPromise;

  if (
    typeof appCtx.latLonToTileXY !== 'function' ||
    typeof appCtx.getOrLoadTerrainTile !== 'function' ||
    !Number.isFinite(appCtx.TERRAIN_ZOOM)
  ) {
    oceanMode.bathymetryReady = oceanMode.localBathymetryReady;
    oceanMode.bathymetryBlend = 0;
    return Promise.resolve(oceanMode.localBathymetryReady);
  }

  const offsets = [-0.12, -0.08, -0.04, 0, 0.04, 0.08, 0.12];
  const tileKeys = new Set();

  for (let i = 0; i < offsets.length; i++) {
    for (let j = 0; j < offsets.length; j++) {
      const lat = oceanMode.launchSite.lat + offsets[i];
      const lon = oceanMode.launchSite.lon + offsets[j];
      const t = appCtx.latLonToTileXY(lat, lon, appCtx.TERRAIN_ZOOM);
      appCtx.getOrLoadTerrainTile(appCtx.TERRAIN_ZOOM, t.x, t.y);
      tileKeys.add(`${appCtx.TERRAIN_ZOOM}/${t.x}/${t.y}`);
    }
  }

  oceanMode.bathymetryTileKeys = Array.from(tileKeys);

  oceanMode.bathymetryPromise = new Promise((resolve) => {
    const startedAt = performance.now();

    const poll = () => {
      let loadedCount = 0;
      let doneCount = 0;

      for (let i = 0; i < oceanMode.bathymetryTileKeys.length; i++) {
        const key = oceanMode.bathymetryTileKeys[i];
        const tile = appCtx.terrainTileCache && appCtx.terrainTileCache.get(key);
        if (!tile) continue;
        if (tile.loaded) {
          loadedCount += 1;
          doneCount += 1;
        } else if (tile.failed) {
          doneCount += 1;
        }
      }

      const elapsed = performance.now() - startedAt;
      const complete = doneCount >= oceanMode.bathymetryTileKeys.length;
      const timedOut = elapsed >= OCEAN_CONSTANTS.BATHYMETRY_WAIT_MS;

      if (complete || timedOut) {
        oceanMode.bathymetryReady = oceanMode.localBathymetryReady || loadedCount > 0;
        oceanMode.bathymetryBlend = oceanMode.bathymetryReady ? 1 : 0;
        if (oceanMode.bathymetryReady) oceanMode.bathymetryCache.clear();
        resolve(oceanMode.bathymetryReady);
        return;
      }

      setTimeout(poll, 120);
    };

    poll();
  });

  return oceanMode.bathymetryPromise;
}

function makeCanvasTexture(canvas, isColor = false) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(26, 26);
  if (isColor) {
    if (typeof texture.colorSpace !== 'undefined' && typeof THREE.SRGBColorSpace !== 'undefined') {
      texture.colorSpace = THREE.SRGBColorSpace;
    } else if (typeof texture.encoding !== 'undefined' && typeof THREE.sRGBEncoding !== 'undefined') {
      texture.encoding = THREE.sRGBEncoding;
    }
  }
  texture.userData = texture.userData || {};
  texture.userData.sharedOceanTexture = true;
  texture.needsUpdate = true;
  return texture;
}

function createSeabedTextureSet(size = 384) {
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const colorCtx = colorCanvas.getContext('2d');

  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = size;
  normalCanvas.height = size;
  const normalCtx = normalCanvas.getContext('2d');

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const roughCtx = roughCanvas.getContext('2d');

  if (!colorCtx || !normalCtx || !roughCtx) {
    return {
      map: null,
      normalMap: null,
      roughnessMap: null
    };
  }

  const colorImage = colorCtx.createImageData(size, size);
  const normalImage = normalCtx.createImageData(size, size);
  const roughImage = roughCtx.createImageData(size, size);

  const heightField = new Float32Array(size * size);
  const reefField = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    const yNorm = y / (size - 1);
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const p = idx * 4;

      const macro = valueNoise2D(x * 0.018, y * 0.018, 5);
      const detail = valueNoise2D(x * 0.07 + 16, y * 0.07 - 8, 11);
      const micro = valueNoise2D(x * 0.21 - 37, y * 0.21 + 13, 17);
      const crack = Math.abs(valueNoise2D(x * 0.042 + 61, y * 0.042 - 29, 23) - 0.5);

      const reef = smoothstep(0.38, 0.85, macro * 0.72 + detail * 0.4 - yNorm * 0.24 + micro * 0.18);
      const algae = smoothstep(0.48, 0.92, detail + micro * 0.35);

      const heightValue = macro * 0.58 + detail * 0.28 + micro * 0.16 + crack * 0.24;
      heightField[idx] = heightValue;
      reefField[idx] = reef;

      const sandR = 182 + macro * 36 + detail * 18;
      const sandG = 196 + macro * 28 + detail * 16;
      const sandB = 171 + macro * 22 + detail * 10;

      const reefR = 126 + detail * 52 + micro * 32;
      const reefG = 152 + detail * 58 + micro * 28;
      const reefB = 132 + detail * 42 + micro * 22;

      const algaeR = 98 + algae * 32;
      const algaeG = 138 + algae * 56;
      const algaeB = 103 + algae * 20;

      const r = lerp(lerp(sandR, reefR, reef * 0.82), algaeR, algae * 0.28);
      const g = lerp(lerp(sandG, reefG, reef * 0.82), algaeG, algae * 0.34);
      const b = lerp(lerp(sandB, reefB, reef * 0.82), algaeB, algae * 0.25);

      colorImage.data[p] = Math.max(0, Math.min(255, Math.round(r)));
      colorImage.data[p + 1] = Math.max(0, Math.min(255, Math.round(g)));
      colorImage.data[p + 2] = Math.max(0, Math.min(255, Math.round(b)));
      colorImage.data[p + 3] = 255;

      const rough = 170 + (1 - reef) * 34 + crack * 48 + micro * 18;
      const roughClamped = Math.max(0, Math.min(255, Math.round(rough)));
      roughImage.data[p] = roughClamped;
      roughImage.data[p + 1] = roughClamped;
      roughImage.data[p + 2] = roughClamped;
      roughImage.data[p + 3] = 255;
    }
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const p = idx * 4;

      const xL = x > 0 ? x - 1 : x;
      const xR = x < size - 1 ? x + 1 : x;
      const yT = y > 0 ? y - 1 : y;
      const yB = y < size - 1 ? y + 1 : y;

      const hL = heightField[y * size + xL];
      const hR = heightField[y * size + xR];
      const hT = heightField[yT * size + x];
      const hB = heightField[yB * size + x];

      const dx = hR - hL;
      const dy = hB - hT;

      const nx = -dx * 2.1;
      const ny = -dy * 2.1;
      const nz = 1.0;
      const invLen = 1 / Math.max(0.00001, Math.sqrt(nx * nx + ny * ny + nz * nz));

      normalImage.data[p] = Math.round((nx * invLen * 0.5 + 0.5) * 255);
      normalImage.data[p + 1] = Math.round((ny * invLen * 0.5 + 0.5) * 255);
      normalImage.data[p + 2] = 255;
      normalImage.data[p + 3] = 255;

      if (reefField[idx] > 0.68) {
        const sparkle = Math.round(reefField[idx] * 8);
        colorImage.data[p] = Math.min(255, colorImage.data[p] + sparkle);
        colorImage.data[p + 1] = Math.min(255, colorImage.data[p + 1] + sparkle);
      }
    }
  }

  colorCtx.putImageData(colorImage, 0, 0);
  normalCtx.putImageData(normalImage, 0, 0);
  roughCtx.putImageData(roughImage, 0, 0);

  return {
    map: makeCanvasTexture(colorCanvas, true),
    normalMap: makeCanvasTexture(normalCanvas, false),
    roughnessMap: makeCanvasTexture(roughCanvas, false)
  };
}

function getSeabedTextureSet(renderer = null) {
  if (!_seabedTextureSet) _seabedTextureSet = createSeabedTextureSet(384);

  if (renderer && _seabedTextureSet) {
    const maxAniso = renderer.capabilities && typeof renderer.capabilities.getMaxAnisotropy === 'function' ?
      renderer.capabilities.getMaxAnisotropy() :
      1;
    const anisotropy = Math.min(8, Math.max(1, maxAniso));
    Object.values(_seabedTextureSet).forEach((texture) => {
      if (!texture) return;
      texture.anisotropy = anisotropy;
      texture.needsUpdate = true;
    });
  }

  return _seabedTextureSet;
}

function createRockTextureSet(size = 256) {
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const colorCtx = colorCanvas.getContext('2d');

  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = size;
  normalCanvas.height = size;
  const normalCtx = normalCanvas.getContext('2d');

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const roughCtx = roughCanvas.getContext('2d');

  if (!colorCtx || !normalCtx || !roughCtx) {
    return {
      map: null,
      normalMap: null,
      roughnessMap: null
    };
  }

  const colorImage = colorCtx.createImageData(size, size);
  const normalImage = normalCtx.createImageData(size, size);
  const roughImage = roughCtx.createImageData(size, size);
  const heightField = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const p = idx * 4;

      const macro = valueNoise2D(x * 0.022 + 41, y * 0.022 - 17, 41);
      const detail = valueNoise2D(x * 0.085 - 22, y * 0.085 + 61, 53);
      const cracks = Math.abs(valueNoise2D(x * 0.16 + 73, y * 0.16 - 37, 67) - 0.5);
      const h = macro * 0.64 + detail * 0.28 + cracks * 0.32;
      heightField[idx] = h;

      const r = 88 + macro * 62 + detail * 42;
      const g = 102 + macro * 56 + detail * 34;
      const b = 111 + macro * 52 + detail * 30;

      colorImage.data[p] = Math.max(0, Math.min(255, Math.round(r)));
      colorImage.data[p + 1] = Math.max(0, Math.min(255, Math.round(g)));
      colorImage.data[p + 2] = Math.max(0, Math.min(255, Math.round(b)));
      colorImage.data[p + 3] = 255;

      const rough = 148 + cracks * 96 + (1 - detail) * 28;
      const roughClamped = Math.max(0, Math.min(255, Math.round(rough)));
      roughImage.data[p] = roughClamped;
      roughImage.data[p + 1] = roughClamped;
      roughImage.data[p + 2] = roughClamped;
      roughImage.data[p + 3] = 255;
    }
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const p = idx * 4;
      const xL = x > 0 ? x - 1 : x;
      const xR = x < size - 1 ? x + 1 : x;
      const yT = y > 0 ? y - 1 : y;
      const yB = y < size - 1 ? y + 1 : y;
      const hL = heightField[y * size + xL];
      const hR = heightField[y * size + xR];
      const hT = heightField[yT * size + x];
      const hB = heightField[yB * size + x];

      const nx = -(hR - hL) * 2.3;
      const ny = -(hB - hT) * 2.3;
      const nz = 1;
      const invLen = 1 / Math.max(0.00001, Math.sqrt(nx * nx + ny * ny + nz * nz));
      normalImage.data[p] = Math.round((nx * invLen * 0.5 + 0.5) * 255);
      normalImage.data[p + 1] = Math.round((ny * invLen * 0.5 + 0.5) * 255);
      normalImage.data[p + 2] = 255;
      normalImage.data[p + 3] = 255;
    }
  }

  colorCtx.putImageData(colorImage, 0, 0);
  normalCtx.putImageData(normalImage, 0, 0);
  roughCtx.putImageData(roughImage, 0, 0);

  const set = {
    map: makeCanvasTexture(colorCanvas, true),
    normalMap: makeCanvasTexture(normalCanvas, false),
    roughnessMap: makeCanvasTexture(roughCanvas, false)
  };
  Object.values(set).forEach((tex) => {
    if (tex) tex.repeat.set(7, 7);
  });
  return set;
}

function getRockTextureSet(renderer = null) {
  if (!_rockTextureSet) _rockTextureSet = createRockTextureSet(256);

  if (renderer && _rockTextureSet) {
    const maxAniso = renderer.capabilities && typeof renderer.capabilities.getMaxAnisotropy === 'function' ?
      renderer.capabilities.getMaxAnisotropy() :
      1;
    const anisotropy = Math.min(8, Math.max(1, maxAniso));
    Object.values(_rockTextureSet).forEach((texture) => {
      if (!texture) return;
      texture.anisotropy = anisotropy;
      texture.needsUpdate = true;
    });
  }

  return _rockTextureSet;
}

function disposeObject3D(obj) {
  if (!obj) return;
  obj.traverse((child) => {
    if (!child || !child.isMesh) return;
    if (child.geometry && typeof child.geometry.dispose === 'function') {
      child.geometry.dispose();
    }
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((mat) => {
      if (!mat) return;
      ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap'].forEach((k) => {
        const texture = mat[k];
        if (
          texture &&
          typeof texture.dispose === 'function' &&
          !(texture.userData && texture.userData.sharedOceanTexture)
        ) {
          texture.dispose();
        }
      });
      if (typeof mat.dispose === 'function') mat.dispose();
    });
  });
}

function createSeabedMesh(renderer = null) {
  const geo = new THREE.PlaneGeometry(1800, 1800, 220, 220);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const color = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = sampleSeabedHeight(x, z);
    pos.setY(i, y);

    const reefWeight = Math.exp(-((x - 24) ** 2 + (z - 124) ** 2) / 25500);
    const deepWeight = smoothstep(55, 420, -z + 70);
    const noise = valueNoise2D(x * 0.028 + 20, z * 0.028 - 14, 31);

    const sandR = 0.72 + noise * 0.08;
    const sandG = 0.80 + noise * 0.08;
    const sandB = 0.74 + noise * 0.06;

    const reefR = 0.58 + noise * 0.1;
    const reefG = 0.69 + noise * 0.1;
    const reefB = 0.62 + noise * 0.08;

    const deepR = 0.17 + noise * 0.03;
    const deepG = 0.25 + noise * 0.04;
    const deepB = 0.30 + noise * 0.05;

    const r = lerp(lerp(sandR, reefR, reefWeight * 0.8), deepR, deepWeight * 0.75);
    const g = lerp(lerp(sandG, reefG, reefWeight * 0.8), deepG, deepWeight * 0.75);
    const b = lerp(lerp(sandB, reefB, reefWeight * 0.8), deepB, deepWeight * 0.75);

    color.setRGB(r, g, b);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const seabedTextures = getSeabedTextureSet(renderer);

  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    map: seabedTextures.map,
    normalMap: seabedTextures.normalMap,
    roughnessMap: seabedTextures.roughnessMap,
    roughness: 0.92,
    metalness: 0.02
  });
  mat.normalScale = new THREE.Vector2(0.48, 0.48);

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.name = 'OceanSeabed';
  return mesh;
}

function createReefCluster(renderer = null) {
  const group = new THREE.Group();
  group.name = 'OceanReefCluster';

  const palette = [0xffa986, 0xff88c1, 0x8be8da, 0xffd6a4, 0xa8f2bc, 0xf8b6de];
  const branchGeo = new THREE.CylinderGeometry(0.16, 0.44, 2.8, 8);
  const fanGeo = new THREE.ConeGeometry(0.7, 1.5, 8);
  const moundGeo = new THREE.IcosahedronGeometry(0.85, 0);
  const rockGeo = new THREE.IcosahedronGeometry(1.7, 1);
  const spikeGeo = new THREE.ConeGeometry(0.55, 2.8, 7);
  const rockTextures = getRockTextureSet(renderer);

  const branchMat = new THREE.MeshStandardMaterial({
    roughness: 0.64,
    metalness: 0.04,
    emissive: 0x11222a,
    emissiveIntensity: 0.35,
    vertexColors: true
  });
  const fanMat = branchMat.clone();
  const moundMat = branchMat.clone();

  const rockMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: rockTextures.map,
    normalMap: rockTextures.normalMap,
    roughnessMap: rockTextures.roughnessMap,
    roughness: 0.89,
    metalness: 0.02
  });
  rockMat.normalScale = new THREE.Vector2(0.58, 0.58);
  const darkRockMat = new THREE.MeshStandardMaterial({
    color: 0x7f97ad,
    map: rockTextures.map,
    normalMap: rockTextures.normalMap,
    roughnessMap: rockTextures.roughnessMap,
    roughness: 0.94,
    metalness: 0.03
  });
  darkRockMat.normalScale = new THREE.Vector2(0.66, 0.66);

  const branchMesh = new THREE.InstancedMesh(branchGeo, branchMat, 620);
  const fanMesh = new THREE.InstancedMesh(fanGeo, fanMat, 360);
  const moundMesh = new THREE.InstancedMesh(moundGeo, moundMat, 560);
  const rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, 700);
  const spikeMesh = new THREE.InstancedMesh(spikeGeo, darkRockMat, 320);

  function randomReefPoint(radiusMin, radiusMax, centerX = 24, centerZ = 124) {
    const angle = Math.random() * Math.PI * 2;
    const radius = radiusMin + Math.random() * (radiusMax - radiusMin);
    const x = centerX + Math.cos(angle) * radius + (Math.random() - 0.5) * 18;
    const z = centerZ + Math.sin(angle) * radius + (Math.random() - 0.5) * 22;
    return { x, z, y: sampleSeabedHeight(x, z) };
  }

  const setInstancedColor = (mesh, index, hex) => {
    if (!mesh || typeof mesh.setColorAt !== 'function') return;
    mesh.setColorAt(index, new THREE.Color(hex));
  };

  for (let i = 0; i < branchMesh.count; i++) {
    const p = randomReefPoint(8, 250);
    const scale = 0.8 + Math.random() * 1.8;
    _tmpObj.position.set(p.x, p.y + 0.2, p.z);
    _tmpObj.rotation.set((Math.random() - 0.5) * 0.28, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.28);
    _tmpObj.scale.set(scale * 0.6, scale, scale * 0.6);
    _tmpObj.updateMatrix();
    branchMesh.setMatrixAt(i, _tmpObj.matrix);
    setInstancedColor(branchMesh, i, palette[(Math.random() * palette.length) | 0]);
  }

  for (let i = 0; i < fanMesh.count; i++) {
    const p = randomReefPoint(10, 220);
    const scale = 0.75 + Math.random() * 1.5;
    _tmpObj.position.set(p.x, p.y + 0.55, p.z);
    _tmpObj.rotation.set(Math.random() * 0.22, Math.random() * Math.PI * 2, Math.random() * 0.22);
    _tmpObj.scale.set(scale, scale * (0.7 + Math.random() * 0.55), scale);
    _tmpObj.updateMatrix();
    fanMesh.setMatrixAt(i, _tmpObj.matrix);
    setInstancedColor(fanMesh, i, palette[(Math.random() * palette.length) | 0]);
  }

  for (let i = 0; i < moundMesh.count; i++) {
    const p = randomReefPoint(8, 330);
    const sx = 0.8 + Math.random() * 2.3;
    const sy = 0.6 + Math.random() * 1.6;
    const sz = 0.7 + Math.random() * 2.1;
    _tmpObj.position.set(p.x, p.y + 0.35, p.z);
    _tmpObj.rotation.set(Math.random() * 0.35, Math.random() * Math.PI * 2, Math.random() * 0.35);
    _tmpObj.scale.set(sx, sy, sz);
    _tmpObj.updateMatrix();
    moundMesh.setMatrixAt(i, _tmpObj.matrix);
    setInstancedColor(moundMesh, i, palette[(Math.random() * palette.length) | 0]);
  }

  for (let i = 0; i < rockMesh.count; i++) {
    const area = Math.random();
    const angle = Math.random() * Math.PI * 2;
    const radius = area < 0.8 ? 24 + Math.random() * 430 : 260 + Math.random() * 520;
    const x = 6 + Math.cos(angle) * radius + (Math.random() - 0.5) * 22;
    const z = 84 + Math.sin(angle) * radius + (Math.random() - 0.5) * 28;
    const y = sampleSeabedHeight(x, z);
    const sx = 1.1 + Math.random() * 3.4;
    const sy = 0.6 + Math.random() * 1.8;
    const sz = 1.0 + Math.random() * 3.0;
    _tmpObj.position.set(x, y + 0.3, z);
    _tmpObj.rotation.set(Math.random() * 0.45, Math.random() * Math.PI * 2, Math.random() * 0.45);
    _tmpObj.scale.set(sx, sy, sz);
    _tmpObj.updateMatrix();
    rockMesh.setMatrixAt(i, _tmpObj.matrix);
  }

  for (let i = 0; i < spikeMesh.count; i++) {
    const p = randomReefPoint(40, 610, 0, 40);
    const sy = 0.6 + Math.random() * 2.8;
    _tmpObj.position.set(p.x, p.y + sy * 0.5, p.z);
    _tmpObj.rotation.set(0, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.12);
    _tmpObj.scale.set(0.45 + Math.random() * 0.9, sy, 0.45 + Math.random() * 0.9);
    _tmpObj.updateMatrix();
    spikeMesh.setMatrixAt(i, _tmpObj.matrix);
  }

  if (branchMesh.instanceColor) branchMesh.instanceColor.needsUpdate = true;
  if (fanMesh.instanceColor) fanMesh.instanceColor.needsUpdate = true;
  if (moundMesh.instanceColor) moundMesh.instanceColor.needsUpdate = true;

  [branchMesh, fanMesh, moundMesh, rockMesh, spikeMesh].forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  });

  const kelpGeo = new THREE.CylinderGeometry(0.05, 0.12, 2.8, 6);
  const kelpMat = new THREE.MeshStandardMaterial({
    color: 0x2f7e60,
    roughness: 0.82,
    metalness: 0.01,
    emissive: 0x0c2a21,
    emissiveIntensity: 0.24
  });
  const kelp = new THREE.InstancedMesh(kelpGeo, kelpMat, 520);
  for (let i = 0; i < kelp.count; i++) {
    const p = randomReefPoint(10, 280);
    const sy = 0.7 + Math.random() * 2.6;
    _tmpObj.position.set(p.x, p.y + sy * 0.5, p.z);
    _tmpObj.rotation.set((Math.random() - 0.5) * 0.2, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.2);
    _tmpObj.scale.set(0.9, sy, 0.9);
    _tmpObj.updateMatrix();
    kelp.setMatrixAt(i, _tmpObj.matrix);
  }
  kelp.instanceMatrix.needsUpdate = true;
  kelp.castShadow = true;
  kelp.receiveShadow = true;
  group.add(kelp);

  return group;
}

function createMarineParticles() {
  const count = 2600;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * 840;
    positions[i3] = Math.cos(angle) * radius;
    positions[i3 + 1] = -3 - Math.random() * 160;
    positions[i3 + 2] = Math.sin(angle) * radius;
    sizes[i] = 0.35 + Math.random() * 1.05;
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const mat = new THREE.PointsMaterial({
    color: 0xb8defa,
    size: 0.78,
    transparent: true,
    opacity: 0.3,
    depthWrite: false
  });

  const points = new THREE.Points(geo, mat);
  points.name = 'OceanSuspendedParticles';
  return points;
}

function createDeepOceanBackdrop() {
  const group = new THREE.Group();
  group.name = 'OceanBackdrop';

  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(2900, 48, 32),
    new THREE.MeshBasicMaterial({
      color: 0x04162a,
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.94
    })
  );
  group.add(shell);

  const abyssCurtain = new THREE.Mesh(
    new THREE.PlaneGeometry(2600, 1100),
    new THREE.MeshBasicMaterial({
      color: 0x02101f,
      transparent: true,
      opacity: 0.88,
      depthWrite: false
    })
  );
  abyssCurtain.position.set(0, -120, -500);
  group.add(abyssCurtain);

  const farFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(2800, 2800),
    new THREE.MeshBasicMaterial({
      color: 0x031120,
      transparent: true,
      opacity: 0.86
    })
  );
  farFloor.rotation.x = -Math.PI / 2;
  farFloor.position.set(0, -165, -430);
  group.add(farFloor);

  return group;
}

function createSubmarineMesh() {
  const submarine = new THREE.Group();
  submarine.name = 'MiniSub';

  const hullMat = new THREE.MeshStandardMaterial({
    color: 0xf4ead9,
    roughness: 0.38,
    metalness: 0.16
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0x2f8ab8,
    roughness: 0.52,
    metalness: 0.14
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xaee4ff,
    roughness: 0.04,
    metalness: 0.1,
    transparent: true,
    opacity: 0.82
  });

  const hull = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.65, 9.0, 24), hullMat);
  hull.rotation.x = Math.PI / 2;
  hull.castShadow = true;
  submarine.add(hull);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.38, 2.2, 22), hullMat);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 5.45;
  nose.castShadow = true;
  submarine.add(nose);

  const tail = new THREE.Mesh(new THREE.ConeGeometry(1.0, 2.0, 18), hullMat);
  tail.rotation.x = -Math.PI / 2;
  tail.position.z = -5.45;
  tail.castShadow = true;
  submarine.add(tail);

  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(1.15, 18, 16), glassMat);
  cockpit.position.set(0, 1.05, 1.65);
  cockpit.castShadow = true;
  submarine.add(cockpit);

  const tower = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.55, 1.45), accentMat);
  tower.position.set(0, 1.45, -0.4);
  tower.castShadow = true;
  submarine.add(tower);

  const wingL = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.14, 0.7), accentMat);
  wingL.position.set(-1.4, -0.52, -2.4);
  wingL.rotation.z = 0.18;
  submarine.add(wingL);

  const wingR = wingL.clone();
  wingR.position.x = 1.4;
  wingR.rotation.z = -0.18;
  submarine.add(wingR);

  const dorsalFin = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.78, 8), accentMat);
  dorsalFin.rotation.z = Math.PI;
  dorsalFin.position.set(0, 0.95, -4.2);
  submarine.add(dorsalFin);

  const propellerHub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.26, 10), accentMat);
  propellerHub.rotation.x = Math.PI / 2;
  propellerHub.position.set(0, 0, -6.1);
  submarine.add(propellerHub);

  const propeller = new THREE.Group();
  propeller.position.copy(propellerHub.position);
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.72, 0.22), accentMat);
    blade.position.y = 0.37;
    blade.rotation.z = (Math.PI * 2 * i) / 3;
    propeller.add(blade);
  }
  submarine.add(propeller);

  const lamp = new THREE.SpotLight(0xc8efff, 2.2, 170, Math.PI / 8, 0.5, 1.1);
  lamp.position.set(0, 0.5, 4.8);
  lamp.target.position.set(0, 0.1, 32);
  submarine.add(lamp);
  submarine.add(lamp.target);

  submarine.scale.setScalar(OCEAN_CONSTANTS.SUB_SCALE);
  submarine.userData.propeller = propeller;

  return submarine;
}

function createFishTemplate(options = {}) {
  const group = new THREE.Group();

  const bodyColor = options.bodyColor || 0xffb88f;
  const finColor = options.finColor || bodyColor;
  const bodyMat = new THREE.MeshStandardMaterial({
    color: bodyColor,
    roughness: 0.48,
    metalness: 0.03
  });
  const finMat = new THREE.MeshStandardMaterial({
    color: finColor,
    roughness: 0.52,
    metalness: 0.02
  });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.62, 14, 11), bodyMat);
  body.scale.set(1.9, 0.86, 0.92);
  group.add(body);

  const belly = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xf5f0e4, roughness: 0.62, metalness: 0.0 })
  );
  belly.scale.set(1.3, 0.6, 0.84);
  belly.position.set(0.08, -0.22, 0.15);
  group.add(belly);

  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.05, 10), finMat);
  tail.name = 'fishTail';
  tail.rotation.x = -Math.PI / 2;
  tail.position.z = -1.06;
  group.add(tail);

  const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.5, 8), finMat);
  dorsal.rotation.z = Math.PI;
  dorsal.position.set(-0.06, 0.52, -0.05);
  group.add(dorsal);

  const pectoralL = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.32, 6), finMat);
  pectoralL.rotation.z = Math.PI * 0.52;
  pectoralL.rotation.x = Math.PI * 0.5;
  pectoralL.position.set(-0.14, -0.1, 0.34);
  group.add(pectoralL);

  const pectoralR = pectoralL.clone();
  pectoralR.rotation.z = -Math.PI * 0.52;
  pectoralR.position.x = 0.14;
  group.add(pectoralR);

  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x0f1117, roughness: 0.25, metalness: 0.04 });
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), eyeMat);
  eyeL.position.set(-0.22, 0.12, 0.68);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.22;
  group.add(eyeL);
  group.add(eyeR);

  return group;
}

function createSharkModel() {
  const group = new THREE.Group();
  group.name = 'OceanShark';

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x6f7f92,
    roughness: 0.5,
    metalness: 0.05
  });
  const bellyMat = new THREE.MeshStandardMaterial({
    color: 0xc8d0d8,
    roughness: 0.58,
    metalness: 0.01
  });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.0, 6.0, 18), bodyMat);
  body.rotation.x = Math.PI / 2;
  body.castShadow = true;
  group.add(body);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.35, 14), bodyMat);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 3.55;
  group.add(nose);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.66, 14, 10), bellyMat);
  belly.position.y = -0.24;
  belly.scale.set(1.18, 0.58, 2.24);
  group.add(belly);

  const dorsal = new THREE.Mesh(new THREE.ConeGeometry(0.23, 0.95, 10), bodyMat);
  dorsal.rotation.z = Math.PI;
  dorsal.position.set(0, 0.96, -0.05);
  group.add(dorsal);

  const pectoralL = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.42), bodyMat);
  pectoralL.position.set(-0.76, -0.2, 0.25);
  pectoralL.rotation.z = 0.35;
  pectoralL.rotation.x = -0.18;
  group.add(pectoralL);

  const pectoralR = pectoralL.clone();
  pectoralR.position.x = 0.76;
  pectoralR.rotation.z = -0.35;
  group.add(pectoralR);

  const tailHub = new THREE.Group();
  tailHub.name = 'sharkTailHub';
  tailHub.position.set(0, 0, -3.2);
  const tailUpper = new THREE.Mesh(new THREE.ConeGeometry(0.26, 1.2, 10), bodyMat);
  tailUpper.rotation.x = -Math.PI / 2;
  tailUpper.rotation.z = -0.5;
  tailUpper.position.y = 0.18;
  tailHub.add(tailUpper);
  const tailLower = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.95, 10), bodyMat);
  tailLower.rotation.x = -Math.PI / 2;
  tailLower.rotation.z = 0.42;
  tailLower.position.y = -0.12;
  tailHub.add(tailLower);
  group.add(tailHub);

  group.scale.setScalar(2.1);
  return group;
}

function clearFishLife(scene) {
  for (let i = 0; i < oceanMode.fishEntities.length; i++) {
    const fish = oceanMode.fishEntities[i];
    if (fish && fish.mesh && fish.mesh.parent === scene) scene.remove(fish.mesh);
    if (fish && fish.mesh) disposeObject3D(fish.mesh);
  }
  oceanMode.fishEntities = [];
  oceanMode.fishSchools = [];

  if (oceanMode.sharkEntity && oceanMode.sharkEntity.mesh) {
    if (oceanMode.sharkEntity.mesh.parent === scene) scene.remove(oceanMode.sharkEntity.mesh);
    disposeObject3D(oceanMode.sharkEntity.mesh);
  }
  oceanMode.sharkEntity = null;
}

function initFishLife(scene) {
  clearFishLife(scene);

  const templates = [
    createFishTemplate({ bodyColor: 0xffc18c, finColor: 0xff9d78 }),
    createFishTemplate({ bodyColor: 0x8cdfff, finColor: 0x67c7ea }),
    createFishTemplate({ bodyColor: 0xff94bf, finColor: 0xff7da8 }),
    createFishTemplate({ bodyColor: 0xb9f7a8, finColor: 0x96e08a })
  ];

  const schoolDefs = [
    { anchor: new THREE.Vector3(34, -16, 124), radius: 16, speed: 0.6, verticalAmp: 2.0, count: 24, scaleMin: 1.0, scaleMax: 1.8 },
    { anchor: new THREE.Vector3(-30, -20, 88), radius: 24, speed: 0.48, verticalAmp: 2.8, count: 20, scaleMin: 1.1, scaleMax: 2.1 },
    { anchor: new THREE.Vector3(96, -28, 42), radius: 32, speed: 0.4, verticalAmp: 3.4, count: 16, scaleMin: 1.4, scaleMax: 2.7 },
    { anchor: new THREE.Vector3(-105, -45, 28), radius: 40, speed: 0.32, verticalAmp: 4.2, count: 14, scaleMin: 1.8, scaleMax: 3.3 },
    { anchor: new THREE.Vector3(22, -58, -88), radius: 62, speed: 0.24, verticalAmp: 5.2, count: 10, scaleMin: 2.2, scaleMax: 4.5 }
  ];

  oceanMode.fishSchools = schoolDefs.map((def, idx) => ({
    ...def,
    center: def.anchor.clone(),
    driftPhase: Math.random() * Math.PI * 2,
    driftX: 4 + idx * 1.7,
    driftY: 1.4 + idx * 0.4,
    driftZ: 5 + idx * 1.5,
    driftSpeed: 0.06 + idx * 0.02
  }));

  oceanMode.fishSchools.forEach((school, schoolIndex) => {
    for (let i = 0; i < school.count; i++) {
      const template = templates[(Math.random() * templates.length) | 0];
      const fish = template.clone(true);
      const fishScale = school.scaleMin + Math.random() * (school.scaleMax - school.scaleMin);
      fish.scale.setScalar(fishScale);
      fish.traverse((child) => {
        if (child && child.isMesh) {
          child.castShadow = false;
          child.receiveShadow = false;
        }
      });
      scene.add(fish);

      oceanMode.fishEntities.push({
        mesh: fish,
        tail: fish.getObjectByName('fishTail') || null,
        schoolIndex,
        phase: Math.random() * Math.PI * 2,
        orbitScale: 0.58 + Math.random() * 0.9,
        drift: (Math.random() - 0.5) * 2.6,
        tailPhase: Math.random() * Math.PI * 2,
        tailSpeed: 7.0 + Math.random() * 4.0,
        tailAmp: 0.26 + Math.random() * 0.22
      });
    }
  });

  const sharkMesh = createSharkModel();
  scene.add(sharkMesh);
  oceanMode.sharkEntity = {
    mesh: sharkMesh,
    tailHub: sharkMesh.getObjectByName('sharkTailHub') || null,
    center: new THREE.Vector3(64, -24, 118),
    radiusX: 80,
    radiusZ: 52,
    speed: 0.16,
    verticalAmp: 4,
    phase: Math.random() * Math.PI * 2
  };

  templates.forEach((template) => disposeObject3D(template));
}

function updateFishLife(t) {
  for (let i = 0; i < oceanMode.fishSchools.length; i++) {
    const school = oceanMode.fishSchools[i];
    const drift = t * school.driftSpeed + school.driftPhase;
    school.center.set(
      school.anchor.x + Math.sin(drift * 1.1) * school.driftX,
      school.anchor.y + Math.sin(drift * 1.6) * school.driftY,
      school.anchor.z + Math.cos(drift * 0.9) * school.driftZ
    );
  }

  for (let i = 0; i < oceanMode.fishEntities.length; i++) {
    const fish = oceanMode.fishEntities[i];
    const school = oceanMode.fishSchools[fish.schoolIndex];
    if (!fish || !fish.mesh || !school) continue;

    const orbit = t * school.speed + fish.phase;
    const wobble = Math.sin(orbit * 0.8 + fish.phase * 1.7) * 1.05;
    const radius = school.radius * fish.orbitScale;

    const x = school.center.x + Math.cos(orbit) * radius + wobble;
    const y = school.center.y + Math.sin(orbit * 1.45 + fish.phase) * school.verticalAmp + fish.drift;
    const z = school.center.z + Math.sin(orbit) * radius * 0.75 + Math.cos(orbit * 0.92 + fish.phase) * 2.4;

    fish.mesh.position.set(x, y, z);

    const nextOrbit = orbit + 0.07;
    _tmpVecA.set(
      school.center.x + Math.cos(nextOrbit) * radius,
      school.center.y + Math.sin(nextOrbit * 1.45 + fish.phase) * school.verticalAmp + fish.drift,
      school.center.z + Math.sin(nextOrbit) * radius * 0.75
    );
    fish.mesh.lookAt(_tmpVecA);

    const tail = fish.tail;
    if (tail) {
      tail.rotation.y = Math.sin(t * fish.tailSpeed + fish.tailPhase) * fish.tailAmp;
    }
  }

  if (oceanMode.sharkEntity && oceanMode.sharkEntity.mesh) {
    const shark = oceanMode.sharkEntity;
    const orbit = t * shark.speed + shark.phase;
    const x = shark.center.x + Math.cos(orbit) * shark.radiusX;
    const y = shark.center.y + Math.sin(orbit * 0.48) * shark.verticalAmp;
    const z = shark.center.z + Math.sin(orbit) * shark.radiusZ;

    shark.mesh.position.set(x, y, z);

    _tmpVecB.set(
      shark.center.x + Math.cos(orbit + 0.08) * shark.radiusX,
      shark.center.y + Math.sin((orbit + 0.08) * 0.48) * shark.verticalAmp,
      shark.center.z + Math.sin(orbit + 0.08) * shark.radiusZ
    );
    shark.mesh.lookAt(_tmpVecB);

    const tailHub = shark.tailHub;
    if (tailHub) {
      tailHub.rotation.y = Math.sin(t * 4.4 + shark.phase) * 0.38;
    }
  }
}

function rebuildOceanTerrainLayers(scene = oceanMode.scene, renderer = oceanMode.renderer) {
  if (!scene) return;

  if (oceanMode.seabedMesh) {
    scene.remove(oceanMode.seabedMesh);
    disposeObject3D(oceanMode.seabedMesh);
    oceanMode.seabedMesh = null;
  }
  if (oceanMode.reefGroup) {
    scene.remove(oceanMode.reefGroup);
    disposeObject3D(oceanMode.reefGroup);
    oceanMode.reefGroup = null;
  }

  oceanMode.bathymetryCache.clear();

  const seabed = createSeabedMesh(renderer);
  const reef = createReefCluster(renderer);
  scene.add(seabed);
  scene.add(reef);

  oceanMode.seabedMesh = seabed;
  oceanMode.reefGroup = reef;
}

function createOceanScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0f496e);
  scene.fog = new THREE.FogExp2(0x0b3551, 0.0032);

  const camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, 0.1, 3600);
  camera.position.set(0, -9, 44);

  const renderer = new THREE.WebGLRenderer({
    canvas: oceanMode.canvas,
    antialias: true,
    alpha: false
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  if (typeof renderer.outputColorSpace !== 'undefined' && typeof THREE.SRGBColorSpace !== 'undefined') {
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  } else {
    renderer.outputEncoding = THREE.sRGBEncoding;
  }
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  getSeabedTextureSet(renderer);
  getRockTextureSet(renderer);

  const ambient = new THREE.AmbientLight(0x84d9ef, 0.8);
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(0xa8e9ff, 0x143246, 0.94);
  scene.add(hemi);

  const keyLight = new THREE.DirectionalLight(0xb8f1ff, 1.3);
  keyLight.position.set(110, 210, 40);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 560;
  keyLight.shadow.camera.left = -220;
  keyLight.shadow.camera.right = 220;
  keyLight.shadow.camera.top = 220;
  keyLight.shadow.camera.bottom = -220;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x3f9dca, 0.48);
  fillLight.position.set(-140, 120, -60);
  scene.add(fillLight);

  const backdrop = createDeepOceanBackdrop();
  scene.add(backdrop);

  const particles = createMarineParticles();
  scene.add(particles);

  const submarineMesh = createSubmarineMesh();
  scene.add(submarineMesh);

  oceanMode.scene = scene;
  oceanMode.camera = camera;
  oceanMode.renderer = renderer;
  oceanMode.cameraLookTarget = new THREE.Vector3(0, -15, 96);
  oceanMode.submarine.mesh = submarineMesh;
  oceanMode.deepBackdrop = backdrop;
  oceanMode.marineParticles = particles;

  rebuildOceanTerrainLayers(scene, renderer);
  initFishLife(scene);

  primeLocalBathymetryGrid().then((ready) => {
    if (!ready || oceanMode.scene !== scene) return;
    rebuildOceanTerrainLayers(scene, renderer);
  });

  primeBathymetryTiles().then((ready) => {
    if (!ready || oceanMode.scene !== scene) return;
    rebuildOceanTerrainLayers(scene, renderer);
  });
}

function getWorldCanvas() {
  return appCtx.renderer && appCtx.renderer.domElement ? appCtx.renderer.domElement : null;
}

function updateOceanHud(nowSeconds = 0) {
  const speedEl = document.getElementById('speed');
  const limitEl = document.getElementById('limit');
  const streetEl = document.getElementById('street');
  const locationLineEl = document.getElementById('locationLine');
  const speedUnitLabel = document.getElementById('speedUnitLabel');
  const limitLabel = document.getElementById('limitLabel');
  const coordsEl = document.getElementById('coords');
  const indBrake = document.getElementById('indBrake');
  const indBoost = document.getElementById('indBoost');
  const indDrift = document.getElementById('indDrift');
  const indOff = document.getElementById('indOff');
  const boostFill = document.getElementById('boostFill');
  const offRoadWarn = document.getElementById('offRoadWarn');
  const sub = oceanMode.submarine;

  const speedKnots = Math.abs(sub.speed) * 1.94;
  const depth = Math.max(0, Math.round(-sub.position.y));
  const batteryPct = Math.round(76 + Math.sin(nowSeconds * 0.09) * 7);

  if (speedUnitLabel) speedUnitLabel.textContent = 'KTS';
  if (limitLabel) limitLabel.textContent = 'DEPTH';
  if (speedEl) {
    speedEl.textContent = String(Math.round(speedKnots));
    speedEl.classList.remove('fast');
  }
  if (limitEl) limitEl.textContent = `${depth}m`;
  if (streetEl) streetEl.textContent = 'Ocean Mode';
  if (locationLineEl) {
    locationLineEl.style.display = '';
    locationLineEl.textContent = `${oceanMode.launchSite.name}, ${oceanMode.launchSite.region}`;
  }

  const lat = oceanMode.launchSite.lat - sub.position.z / appCtx.SCALE;
  const lonDenom = appCtx.SCALE * Math.cos(oceanMode.launchSite.lat * Math.PI / 180);
  const lon = oceanMode.launchSite.lon + sub.position.x / (Math.abs(lonDenom) > 0.0001 ? lonDenom : appCtx.SCALE);
  if (coordsEl) coordsEl.textContent = `${lat.toFixed(4)}, ${lon.toFixed(4)} | DEPTH ${depth}m`;

  if (boostFill) {
    boostFill.style.width = `${batteryPct}%`;
    boostFill.classList.add('active');
  }
  if (indBrake) {
    indBrake.textContent = 'ASC';
    indBrake.classList.toggle('on', !!(appCtx.keys.Space || appCtx.keys.KeyR));
  }
  if (indBoost) {
    indBoost.textContent = 'DSC';
    indBoost.classList.toggle('on', !!(appCtx.keys.ShiftLeft || appCtx.keys.ShiftRight || appCtx.keys.ControlLeft || appCtx.keys.ControlRight));
  }
  if (indDrift) {
    indDrift.textContent = 'SUB';
    indDrift.classList.add('on');
  }
  if (indOff) {
    indOff.textContent = 'SONAR';
    indOff.classList.remove('warn');
    indOff.classList.toggle('on', speedKnots > 11);
  }
  if (offRoadWarn) offRoadWarn.classList.remove('active');

}

function resetSubmarineAtLaunch() {
  const sub = oceanMode.submarine;
  sub.position.set(0, -10.5, 62);
  sub.yaw = 0;
  sub.pitch = 0;
  sub.roll = 0;
  sub.speed = 0;
  sub.turnSpeed = 0;
  sub.verticalSpeed = 0;

  if (sub.mesh) {
    sub.mesh.position.copy(sub.position);
    sub.mesh.rotation.order = 'YXZ';
    sub.mesh.rotation.set(0, sub.yaw + OCEAN_CONSTANTS.MODEL_YAW_OFFSET, 0);
  }

  if (oceanMode.camera) {
    const sinYaw = Math.sin(sub.yaw);
    const cosYaw = Math.cos(sub.yaw);
    oceanMode.camera.position.set(
      sub.position.x - sinYaw * OCEAN_CONSTANTS.FOLLOW_DISTANCE,
      sub.position.y + OCEAN_CONSTANTS.FOLLOW_HEIGHT,
      sub.position.z - cosYaw * OCEAN_CONSTANTS.FOLLOW_DISTANCE
    );
  }
  if (oceanMode.cameraLookTarget) {
    const sinYaw = Math.sin(sub.yaw);
    const cosYaw = Math.cos(sub.yaw);
    oceanMode.cameraLookTarget.set(
      sub.position.x + sinYaw * OCEAN_CONSTANTS.LOOK_AHEAD,
      sub.position.y + OCEAN_CONSTANTS.LOOK_HEIGHT,
      sub.position.z + cosYaw * OCEAN_CONSTANTS.LOOK_AHEAD
    );
  }
}

function updateSubmarine(dt) {
  const sub = oceanMode.submarine;
  const forwardInput = (appCtx.keys.KeyW || appCtx.keys.ArrowUp ? 1 : 0) - (appCtx.keys.KeyS || appCtx.keys.ArrowDown ? 1 : 0);
  const yawInput = (appCtx.keys.KeyA || appCtx.keys.ArrowLeft ? 1 : 0) - (appCtx.keys.KeyD || appCtx.keys.ArrowRight ? 1 : 0);
  const verticalInput = (appCtx.keys.Space || appCtx.keys.KeyR ? 1 : 0) - (
    appCtx.keys.ShiftLeft || appCtx.keys.ShiftRight || appCtx.keys.ControlLeft || appCtx.keys.ControlRight ? 1 : 0
  );

  const targetSpeed = forwardInput * OCEAN_CONSTANTS.MAX_SPEED;
  const speedFactor = expApproachFactor(OCEAN_CONSTANTS.SPEED_RESPONSE, dt);
  sub.speed += (targetSpeed - sub.speed) * speedFactor;
  sub.speed *= Math.pow(OCEAN_CONSTANTS.DRAG, dt * 60);

  const targetTurnSpeed = yawInput * OCEAN_CONSTANTS.MAX_TURN_SPEED;
  const turnFactor = expApproachFactor(OCEAN_CONSTANTS.TURN_RESPONSE, dt);
  sub.turnSpeed += (targetTurnSpeed - sub.turnSpeed) * turnFactor;
  sub.turnSpeed *= Math.pow(0.9, dt * 60);
  sub.yaw += sub.turnSpeed * dt;

  const targetVertical = verticalInput * OCEAN_CONSTANTS.MAX_VERTICAL_SPEED;
  const verticalFactor = expApproachFactor(OCEAN_CONSTANTS.VERTICAL_RESPONSE, dt);
  sub.verticalSpeed += (targetVertical - sub.verticalSpeed) * verticalFactor;
  sub.verticalSpeed *= Math.pow(0.9, dt * 60);

  const sinYaw = Math.sin(sub.yaw);
  const cosYaw = Math.cos(sub.yaw);
  sub.position.x += sinYaw * sub.speed * dt;
  sub.position.z += cosYaw * sub.speed * dt;
  sub.position.y += sub.verticalSpeed * dt;

  _tmpVecA.set(sub.position.x, 0, sub.position.z);
  if (_tmpVecA.length() > OCEAN_CONSTANTS.WORLD_RADIUS) {
    _tmpVecA.setLength(OCEAN_CONSTANTS.WORLD_RADIUS);
    sub.position.x = _tmpVecA.x;
    sub.position.z = _tmpVecA.z;
    sub.speed *= 0.84;
  }

  const floorY = sampleSeabedHeight(sub.position.x, sub.position.z);
  const minY = Math.max(floorY + OCEAN_CONSTANTS.MIN_CLEARANCE, OCEAN_CONSTANTS.HARD_MIN_Y);
  if (sub.position.y < minY) {
    sub.position.y = minY;
    if (sub.verticalSpeed < 0) sub.verticalSpeed = 0;
  }
  if (sub.position.y > OCEAN_CONSTANTS.SURFACE_Y) {
    sub.position.y = OCEAN_CONSTANTS.SURFACE_Y;
    if (sub.verticalSpeed > 0) sub.verticalSpeed = 0;
  }

  const targetPitch = THREE.MathUtils.clamp(-sub.verticalSpeed * OCEAN_CONSTANTS.PITCH_FROM_VERTICAL, -OCEAN_CONSTANTS.MAX_PITCH, OCEAN_CONSTANTS.MAX_PITCH);
  const targetRoll = THREE.MathUtils.clamp(-sub.turnSpeed * OCEAN_CONSTANTS.ROLL_FROM_TURN, -OCEAN_CONSTANTS.MAX_ROLL, OCEAN_CONSTANTS.MAX_ROLL);
  sub.pitch += (targetPitch - sub.pitch) * expApproachFactor(5.6, dt);
  sub.roll += (targetRoll - sub.roll) * expApproachFactor(4.5, dt);

  if (sub.mesh) {
    sub.mesh.position.copy(sub.position);
    sub.mesh.rotation.order = 'YXZ';
    sub.mesh.rotation.set(sub.pitch, sub.yaw + OCEAN_CONSTANTS.MODEL_YAW_OFFSET, sub.roll);

    const propeller = sub.mesh.userData && sub.mesh.userData.propeller;
    if (propeller) {
      propeller.rotation.z += (sub.speed * 0.36 + 0.22) * dt * 12;
    }
  }

  _tmpVecB.set(
    sub.position.x - sinYaw * OCEAN_CONSTANTS.FOLLOW_DISTANCE,
    sub.position.y + OCEAN_CONSTANTS.FOLLOW_HEIGHT,
    sub.position.z - cosYaw * OCEAN_CONSTANTS.FOLLOW_DISTANCE
  );
  oceanMode.camera.position.lerp(_tmpVecB, expApproachFactor(OCEAN_CONSTANTS.FOLLOW_LERP, dt));

  _tmpVecC.set(
    sub.position.x + sinYaw * OCEAN_CONSTANTS.LOOK_AHEAD,
    sub.position.y + OCEAN_CONSTANTS.LOOK_HEIGHT,
    sub.position.z + cosYaw * OCEAN_CONSTANTS.LOOK_AHEAD
  );
  oceanMode.cameraLookTarget.lerp(_tmpVecC, expApproachFactor(OCEAN_CONSTANTS.LOOK_LERP, dt));
  oceanMode.camera.lookAt(oceanMode.cameraLookTarget);
}

function animateOceanMode(nowMs = 0) {
  if (!oceanMode.active) return;
  oceanMode.animationId = requestAnimationFrame(animateOceanMode);

  if (!oceanMode.lastFrameMs) oceanMode.lastFrameMs = nowMs;
  const dt = Math.min(0.05, Math.max(0.001, (nowMs - oceanMode.lastFrameMs) / 1000));
  oceanMode.lastFrameMs = nowMs;

  updateSubmarine(dt);
  updateFishLife(nowMs * 0.001);

  if (oceanMode.marineParticles) {
    oceanMode.marineParticles.rotation.y += dt * 0.02;
    oceanMode.marineParticles.position.y = -10 + Math.sin(nowMs * 0.00025) * 1.2;
  }

  updateOceanHud(nowMs * 0.001);
  oceanMode.renderer.render(oceanMode.scene, oceanMode.camera);
}

function startOceanMode() {
  if (oceanMode.active) return true;
  try {
    if (typeof appCtx.switchEnv === 'function' && appCtx.ENV && appCtx.ENV.OCEAN) {
      appCtx.switchEnv(appCtx.ENV.OCEAN);
    }

    if (!oceanMode.scene) createOceanScene();
    resetSubmarineAtLaunch();

    const worldCanvas = getWorldCanvas();
    if (worldCanvas) worldCanvas.style.display = 'none';
    if (oceanMode.canvas) oceanMode.canvas.style.display = 'block';

    oceanMode.active = true;
    oceanMode.lastFrameMs = 0;
    oceanMode.animationId = requestAnimationFrame(animateOceanMode);

    if (typeof appCtx.updateControlsModeUI === 'function') appCtx.updateControlsModeUI();
    updateOceanHud(performance.now() * 0.001);

    primeLocalBathymetryGrid().then((ready) => {
      if (!ready || !oceanMode.scene) return;
      rebuildOceanTerrainLayers(oceanMode.scene, oceanMode.renderer);
    });

    primeBathymetryTiles().then((ready) => {
      if (!ready || !oceanMode.scene) return;
      rebuildOceanTerrainLayers(oceanMode.scene, oceanMode.renderer);
    });

    return true;
  } catch (error) {
    console.error('[OceanMode] start failed', error);
    oceanMode.active = false;
    if (oceanMode.animationId) {
      cancelAnimationFrame(oceanMode.animationId);
      oceanMode.animationId = null;
    }
    if (oceanMode.canvas) oceanMode.canvas.style.display = 'none';
    const worldCanvas = getWorldCanvas();
    if (worldCanvas) worldCanvas.style.display = 'block';
    if (typeof appCtx.switchEnv === 'function' && appCtx.ENV && appCtx.ENV.EARTH) {
      appCtx.switchEnv(appCtx.ENV.EARTH);
    }
    if (typeof appCtx.updateControlsModeUI === 'function') appCtx.updateControlsModeUI();
    return false;
  }
}

function stopOceanMode() {
  if (!oceanMode.active) return false;

  oceanMode.active = false;
  if (oceanMode.animationId) {
    cancelAnimationFrame(oceanMode.animationId);
    oceanMode.animationId = null;
  }

  if (oceanMode.canvas) oceanMode.canvas.style.display = 'none';
  const worldCanvas = getWorldCanvas();
  if (worldCanvas) worldCanvas.style.display = 'block';

  const speedUnitEl = document.getElementById('speedUnitLabel');
  const limitLabelEl = document.getElementById('limitLabel');
  const indBrake = document.getElementById('indBrake');
  const indBoost = document.getElementById('indBoost');
  const indDrift = document.getElementById('indDrift');
  const indOff = document.getElementById('indOff');
  const offRoadWarn = document.getElementById('offRoadWarn');
  if (speedUnitEl) speedUnitEl.textContent = 'MPH';
  if (limitLabelEl) limitLabelEl.textContent = 'LIMIT';
  if (indBrake) {
    indBrake.textContent = 'BRK';
    indBrake.classList.remove('on');
  }
  if (indBoost) {
    indBoost.textContent = 'BOOST';
    indBoost.classList.remove('on');
  }
  if (indDrift) indDrift.textContent = 'DRIFT';
  if (indOff) {
    indOff.textContent = 'OFF';
    indOff.classList.remove('on', 'warn');
  }
  if (offRoadWarn) offRoadWarn.classList.remove('active');

  if (typeof appCtx.switchEnv === 'function' && appCtx.ENV && appCtx.ENV.EARTH) {
    appCtx.switchEnv(appCtx.ENV.EARTH);
  }
  if (typeof appCtx.updateControlsModeUI === 'function') appCtx.updateControlsModeUI();
  return true;
}

function initOceanModeUI() {
  if (oceanMode.canvas) return;

  const canvas = document.createElement('canvas');
  canvas.id = 'oceanModeCanvas';
  canvas.style.cssText = [
    'position:fixed',
    'inset:0',
    'width:100vw',
    'height:100vh',
    'display:none',
    'z-index:2',
    'pointer-events:none'
  ].join(';');
  document.body.appendChild(canvas);
  oceanMode.canvas = canvas;
  const legacyHud = document.getElementById('oceanModeHUD');
  if (legacyHud && legacyHud.parentElement) legacyHud.parentElement.removeChild(legacyHud);

  window.addEventListener('resize', () => {
    if (!oceanMode.renderer || !oceanMode.camera) return;
    oceanMode.camera.aspect = window.innerWidth / window.innerHeight;
    oceanMode.camera.updateProjectionMatrix();
    oceanMode.renderer.setSize(window.innerWidth, window.innerHeight, false);
  });
}

function getOceanModeDebugState() {
  const sub = oceanMode.submarine || {};
  return {
    active: !!oceanMode.active,
    env: typeof appCtx.getEnv === 'function' ? appCtx.getEnv() : null,
    yaw: Number.isFinite(sub.yaw) ? sub.yaw : null,
    pitch: Number.isFinite(sub.pitch) ? sub.pitch : null,
    roll: Number.isFinite(sub.roll) ? sub.roll : null,
    speed: Number.isFinite(sub.speed) ? sub.speed : null,
    verticalSpeed: Number.isFinite(sub.verticalSpeed) ? sub.verticalSpeed : null,
    position: sub.position ? {
      x: Number.isFinite(sub.position.x) ? sub.position.x : null,
      y: Number.isFinite(sub.position.y) ? sub.position.y : null,
      z: Number.isFinite(sub.position.z) ? sub.position.z : null
    } : null,
    localBathymetryReady: !!oceanMode.localBathymetryReady,
    bathymetryReady: !!oceanMode.bathymetryReady
  };
}

Object.assign(appCtx, {
  animateOceanMode,
  startOceanMode,
  stopOceanMode,
  getOceanModeDebugState
});

export { animateOceanMode, startOceanMode, stopOceanMode };

if (typeof globalThis !== 'undefined') {
  globalThis.getOceanModeDebugState = getOceanModeDebugState;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initOceanModeUI);
} else {
  initOceanModeUI();
}
