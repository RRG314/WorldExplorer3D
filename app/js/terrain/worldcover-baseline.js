import { createProviderOutageCircuit } from '../earth-core/provider-outage-circuit.js?v=1';

const WORLDCOVER_WMS_ENDPOINT = 'https://titiler.terrascope.be/wms';
const WORLDCOVER_LAYER = 'esa-worldcover-map-10m-2021-v2_map';
const WORLDCOVER_DATE = '2021-01-01';
const WORLDCOVER_MIN_LAT = -60;
const WORLDCOVER_MAX_LAT = 83;
const DEFAULT_TEXTURE_SIZE = 64;
const REQUEST_TIMEOUT_MS = 6500;
const CACHE_DB_NAME = 'worldexplorer3d-worldcover-cache';
const CACHE_STORE_NAME = 'tiles';
const CACHE_MAX_ENTRIES = 160;
const CACHE_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_PARALLEL_REQUESTS = 6;
const PROVIDER_OUTAGE_COOLDOWN_MS = 60 * 1000;
const providerCircuit = createProviderOutageCircuit({
  provider: 'esa-worldcover-titiler',
  cooldownMs: PROVIDER_OUTAGE_COOLDOWN_MS
});

const WORLD_COVER_CLASSES = [
  { id: 10, name: 'tree', source: [0, 100, 0], tint: [0.76, 0.88, 0.72] },
  { id: 20, name: 'shrub', source: [255, 187, 34], tint: [0.96, 0.98, 0.78] },
  { id: 30, name: 'grass', source: [255, 255, 76], tint: [1.03, 1.05, 0.94] },
  { id: 40, name: 'crop', source: [240, 150, 255], tint: [1.08, 0.97, 0.74] },
  // Built-up classification is a neutral urban continuity tint, not proof
  // that every pixel is asphalt. Exact mapped roads and developed land-use
  // polygons still own their physical surfaces; this only prevents uncovered
  // regional city pixels from reverting to bright grass.
  { id: 50, name: 'built', source: [250, 0, 0], tint: [0.76, 0.78, 0.80] },
  { id: 60, name: 'bare', source: [180, 180, 180], tint: [1.08, 0.94, 0.76] },
  { id: 70, name: 'snow', source: [240, 240, 240], tint: [1.32, 1.34, 1.38] },
  { id: 80, name: 'water', source: [0, 100, 200], tint: [0.82, 0.91, 0.96] },
  { id: 90, name: 'wetland', source: [0, 150, 160], tint: [0.78, 0.94, 0.82] },
  { id: 95, name: 'mangrove', source: [0, 207, 117], tint: [0.70, 0.86, 0.72] },
  { id: 100, name: 'moss', source: [250, 230, 160], tint: [1.02, 0.98, 0.78] }
];

const SURFACE_TINT_ENCODING_SCALE = 170;

function buildSmoothedSurfaceTints(classes, size) {
  const encoded = new Uint8Array(size * size * 3);
  for (let pixel = 0; pixel < classes.length; pixel += 1) {
    const tint = classes[pixel]?.tint || [1, 1, 1];
    const offset = pixel * 3;
    encoded[offset] = Math.round(Math.min(1.5, Math.max(0, tint[0])) * SURFACE_TINT_ENCODING_SCALE);
    encoded[offset + 1] = Math.round(Math.min(1.5, Math.max(0, tint[1])) * SURFACE_TINT_ENCODING_SCALE);
    encoded[offset + 2] = Math.round(Math.min(1.5, Math.max(0, tint[2])) * SURFACE_TINT_ENCODING_SCALE);
  }

  // WorldCover is categorical 10 m data. Blend only the macro transition
  // between classes; the visible fine detail comes from repeating PBR ground
  // maps, so class pixels never become the terrain's diffuse texels.
  const radius = 3;
  const horizontal = new Uint8Array(encoded.length);
  const smoothed = new Uint8Array(encoded.length);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const from = Math.max(0, x - radius);
      const to = Math.min(size - 1, x + radius);
      const count = to - from + 1;
      for (let channel = 0; channel < 3; channel += 1) {
        let sum = 0;
        for (let sx = from; sx <= to; sx += 1) sum += encoded[(y * size + sx) * 3 + channel];
        horizontal[(y * size + x) * 3 + channel] = Math.round(sum / count);
      }
    }
  }
  for (let y = 0; y < size; y += 1) {
    const from = Math.max(0, y - radius);
    const to = Math.min(size - 1, y + radius);
    const count = to - from + 1;
    for (let x = 0; x < size; x += 1) {
      for (let channel = 0; channel < 3; channel += 1) {
        let sum = 0;
        for (let sy = from; sy <= to; sy += 1) sum += horizontal[(sy * size + x) * 3 + channel];
        smoothed[(y * size + x) * 3 + channel] = Math.round(sum / count);
      }
    }
  }
  return smoothed;
}

let databasePromise = null;
let activeRequests = 0;
let drainScheduled = false;
const requestQueue = [];
const memoryBlobCache = new Map();

function rememberBlob(key, blob) {
  memoryBlobCache.delete(key);
  memoryBlobCache.set(key, blob);
  while (memoryBlobCache.size > CACHE_MAX_ENTRIES) {
    memoryBlobCache.delete(memoryBlobCache.keys().next().value);
  }
}

function drainRequestQueue() {
  drainScheduled = false;
  requestQueue.sort((a, b) => b.priority - a.priority);
  while (activeRequests < MAX_PARALLEL_REQUESTS && requestQueue.length > 0) {
    const entry = requestQueue.shift();
    if (entry.signal?.aborted) {
      entry.reject(new DOMException('WorldCover request aborted', 'AbortError'));
      continue;
    }
    try {
      providerCircuit.assertAvailable();
    } catch (error) {
      entry.reject(error);
      continue;
    }
    activeRequests += 1;
    Promise.resolve()
      .then(entry.task)
      .then(entry.resolve, entry.reject)
      .finally(() => {
        activeRequests = Math.max(0, activeRequests - 1);
        drainRequestQueue();
      });
  }
}

function scheduleRequestDrain() {
  if (drainScheduled) return;
  drainScheduled = true;
  queueMicrotask(drainRequestQueue);
}

function withRequestSlot(task, signal, priority = 0) {
  return new Promise((resolve, reject) => {
    try {
      providerCircuit.assertAvailable();
    } catch (error) {
      reject(error);
      return;
    }
    requestQueue.push({ task, signal, priority: Number(priority) || 0, resolve, reject });
    scheduleRequestDrain();
  });
}

function openDatabase() {
  if (databasePromise) return databasePromise;
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  databasePromise = new Promise((resolve) => {
    const request = indexedDB.open(CACHE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CACHE_STORE_NAME)) {
        const store = db.createObjectStore(CACHE_STORE_NAME, { keyPath: 'key' });
        store.createIndex('savedAt', 'savedAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return databasePromise;
}

async function readCachedBlob(key) {
  const db = await openDatabase();
  if (!db) return null;
  return new Promise((resolve) => {
    const tx = db.transaction(CACHE_STORE_NAME, 'readonly');
    const request = tx.objectStore(CACHE_STORE_NAME).get(key);
    request.onsuccess = () => {
      const record = request.result || null;
      if (!record || !(record.blob instanceof Blob) || Date.now() - Number(record.savedAt || 0) > CACHE_TTL_MS) {
        resolve(null);
        return;
      }
      resolve(record.blob);
    };
    request.onerror = () => resolve(null);
  });
}

async function writeCachedBlob(key, blob) {
  const db = await openDatabase();
  if (!db || !(blob instanceof Blob)) return false;
  return new Promise((resolve) => {
    const tx = db.transaction(CACHE_STORE_NAME, 'readwrite');
    const store = tx.objectStore(CACHE_STORE_NAME);
    store.put({ key, blob, savedAt: Date.now() });
    const countRequest = store.count();
    countRequest.onsuccess = () => {
      let removeCount = Math.max(0, Number(countRequest.result || 0) - CACHE_MAX_ENTRIES);
      if (!removeCount) return;
      const cursorRequest = store.index('savedAt').openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor || removeCount <= 0) return;
        cursor.delete();
        removeCount -= 1;
        cursor.continue();
      };
    };
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
    tx.onabort = () => resolve(false);
  });
}

function finiteBounds(bounds) {
  return bounds &&
    Number.isFinite(bounds.latN) &&
    Number.isFinite(bounds.latS) &&
    Number.isFinite(bounds.lonW) &&
    Number.isFinite(bounds.lonE);
}

export function worldCoverSupportsBounds(bounds) {
  if (!finiteBounds(bounds)) return false;
  return bounds.latS < WORLDCOVER_MAX_LAT && bounds.latN > WORLDCOVER_MIN_LAT;
}

function normalizedBounds(bounds) {
  return {
    latN: Math.min(WORLDCOVER_MAX_LAT, Math.max(bounds.latN, bounds.latS)),
    latS: Math.max(WORLDCOVER_MIN_LAT, Math.min(bounds.latN, bounds.latS)),
    lonW: Math.max(-180, Math.min(bounds.lonW, bounds.lonE)),
    lonE: Math.min(180, Math.max(bounds.lonW, bounds.lonE))
  };
}

export function worldCoverTileKey(bounds, size = DEFAULT_TEXTURE_SIZE) {
  const safe = normalizedBounds(bounds);
  return [
    'v200',
    safe.latS.toFixed(6),
    safe.lonW.toFixed(6),
    safe.latN.toFixed(6),
    safe.lonE.toFixed(6),
    Math.max(16, Math.round(size))
  ].join(':');
}

export function classifyWorldCoverSurface(result, latitude = 0) {
  const counts = result?.counts || {};
  const total = Math.max(1, Number(result?.recognizedPixels || result?.totalPixels || 0));
  const ratio = (name) => Number(counts[name] || 0) / total;
  const bare = ratio('bare');
  const built = ratio('built');
  const snow = ratio('snow');
  const forest = ratio('tree') + ratio('mangrove');
  const crop = ratio('crop');
  const vegetated = forest + ratio('shrub') + ratio('grass') + crop + ratio('wetland') + ratio('moss');
  const absLat = Math.abs(Number(latitude) || 0);
  const aridBare = absLat >= 12 && absLat <= 35 && (
    bare >= 0.34 || (bare >= 0.12 && bare + built >= 0.68 && vegetated <= 0.25)
  );
  if (snow >= 0.35) return { mode: 'snow', reason: 'worldcover_snow', confidence: snow };
  if (forest >= 0.34) return { mode: 'forest', reason: 'worldcover_forest', confidence: forest };
  if (crop >= 0.48) return { mode: 'soil', reason: 'worldcover_crop', confidence: crop };
  if (built >= 0.52 && built >= vegetated * 1.35) {
    return { mode: 'built', reason: 'worldcover_built', confidence: built };
  }
  if (aridBare) return { mode: 'sand', reason: 'worldcover_arid_bare', confidence: bare };
  if (bare >= 0.62 && vegetated <= 0.16) {
    return { mode: 'rock', reason: 'worldcover_bare_ground', confidence: bare };
  }
  return null;
}

function buildWorldCoverUrl(bounds, size) {
  const safe = normalizedBounds(bounds);
  const params = new URLSearchParams({
    service: 'WMS',
    version: '1.3.0',
    request: 'GetMap',
    layers: WORLDCOVER_LAYER,
    styles: '',
    crs: 'EPSG:4326',
    bbox: `${safe.latS},${safe.lonW},${safe.latN},${safe.lonE}`,
    width: String(size),
    height: String(size),
    format: 'image/png',
    transparent: 'false',
    time: WORLDCOVER_DATE
  });
  return `${WORLDCOVER_WMS_ENDPOINT}?${params.toString()}`;
}

async function fetchWorldCoverBlob(
  bounds,
  size,
  key,
  signal = null,
  priority = 0,
  requestTimeoutMs = REQUEST_TIMEOUT_MS
) {
  const memoryBlob = memoryBlobCache.get(key);
  if (memoryBlob) {
    rememberBlob(key, memoryBlob);
    return { blob: memoryBlob, source: 'memory-cache' };
  }
  const cached = await readCachedBlob(key);
  if (cached) {
    rememberBlob(key, cached);
    return { blob: cached, source: 'persistent-cache' };
  }
  return withRequestSlot(async () => {
    if (signal?.aborted) throw new DOMException('WorldCover request aborted', 'AbortError');
    const controller = new AbortController();
    const untrackController = providerCircuit.track(controller);
    const relayAbort = () => controller.abort();
    signal?.addEventListener?.('abort', relayAbort, { once: true });
    let timedOut = false;
    const timeoutMs = Math.max(25, Number(requestTimeoutMs) || REQUEST_TIMEOUT_MS);
    const timeoutId = globalThis.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    try {
      const response = await fetch(buildWorldCoverUrl(bounds, size), {
        mode: 'cors',
        credentials: 'omit',
        cache: 'default',
        signal: controller.signal
      });
      if (!response.ok) {
        const error = new Error(`WorldCover WMS HTTP ${response.status}`);
        error.status = Number(response.status);
        throw error;
      }
      const blob = await response.blob();
      if (!String(blob.type || '').startsWith('image/')) throw new Error('WorldCover WMS returned a non-image response');
      rememberBlob(key, blob);
      void writeCachedBlob(key, blob);
      return { blob, source: 'network' };
    } catch (error) {
      if (signal?.aborted) throw signal.reason || error;
      if (providerCircuit.isOpen()) throw providerCircuit.unavailableError();
      const status = Number(error?.status || 0);
      const outage = timedOut || error instanceof TypeError || status === 429 || status >= 500;
      if (outage) {
        const reason = timedOut
          ? `request timed out after ${timeoutMs} ms`
          : status
            ? `HTTP ${status}`
            : String(error?.message || 'network request failed');
        throw providerCircuit.trip(reason, controller);
      }
      throw error;
    } finally {
      globalThis.clearTimeout(timeoutId);
      signal?.removeEventListener?.('abort', relayAbort);
      untrackController();
    }
  }, signal, priority);
}

function nearestWorldCoverClass(r, g, b) {
  if (r < 8 && g < 8 && b < 8) return null;
  let nearest = null;
  let bestDistance = Infinity;
  for (let i = 0; i < WORLD_COVER_CLASSES.length; i++) {
    const entry = WORLD_COVER_CLASSES[i];
    const dr = r - entry.source[0];
    const dg = g - entry.source[1];
    const db = b - entry.source[2];
    const distance = dr * dr + dg * dg + db * db;
    if (distance < bestDistance) {
      nearest = entry;
      bestDistance = distance;
    }
  }
  return bestDistance <= 7200 ? nearest : null;
}

async function imageFromBlob(blob) {
  if (typeof createImageBitmap === 'function') return createImageBitmap(blob);
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('WorldCover image decode failed'));
    };
    image.src = url;
  });
}

async function createSemanticTexture(blob, size) {
  const sourceImage = await imageFromBlob(blob);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('WorldCover canvas context unavailable');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(sourceImage, 0, 0, size, size);
  if (typeof sourceImage.close === 'function') sourceImage.close();
  const imageData = context.getImageData(0, 0, size, size);
  const counts = {};
  const classes = new Array(size * size);
  let recognized = 0;

  for (let i = 0; i < imageData.data.length; i += 4) {
    const entry = nearestWorldCoverClass(imageData.data[i], imageData.data[i + 1], imageData.data[i + 2]);
    classes[i / 4] = entry;
    if (!entry) {
      continue;
    }
    counts[entry.name] = Number(counts[entry.name] || 0) + 1;
    recognized += 1;
  }
  const builtClass = WORLD_COVER_CLASSES.find((entry) => entry.name === 'built');
  for (let pixel = 0; pixel < classes.length; pixel += 1) {
    const x = pixel % size;
    const y = Math.floor(pixel / size);
    let entry = classes[pixel];
    if (entry && entry.name !== 'built') {
      let nearbyBuilt = 0;
      for (let oy = -2; oy <= 2; oy += 1) {
        for (let ox = -2; ox <= 2; ox += 1) {
          const sx = x + ox;
          const sy = y + oy;
          if (sx < 0 || sy < 0 || sx >= size || sy >= size) continue;
          if (classes[sy * size + sx]?.name === 'built') nearbyBuilt += 1;
        }
      }
      if (nearbyBuilt >= 12) entry = builtClass;
    }
    classes[pixel] = entry;
  }
  if (recognized < size * size * 0.2) throw new Error('WorldCover tile contained insufficient classified coverage');
  const vegetationSamples = [];
  const vegetationKinds = new Set(['tree', 'shrub', 'wetland', 'mangrove']);
  const sampleStep = Math.max(6, Math.round(size / 16));
  for (let y = Math.floor(sampleStep / 2); y < size; y += sampleStep) {
    for (let x = Math.floor(sampleStep / 2); x < size; x += sampleStep) {
      const kind = classes[y * size + x]?.name || '';
      if (!vegetationKinds.has(kind)) continue;
      vegetationSamples.push({
        kind,
        u: (x + 0.5) / size,
        v: (y + 0.5) / size
      });
    }
  }
  return {
    surfaceTints: buildSmoothedSurfaceTints(classes, size),
    surfaceTintSize: size,
    surfaceTintEncodingScale: SURFACE_TINT_ENCODING_SCALE,
    counts,
    recognizedPixels: recognized,
    totalPixels: size * size,
    dominantClass: Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown',
    vegetationSamples
  };
}

export async function loadWorldCoverBaseline(bounds, options = {}) {
  if (!worldCoverSupportsBounds(bounds) || typeof document === 'undefined') return null;
  const size = Math.max(32, Math.min(128, Math.round(Number(options.size) || DEFAULT_TEXTURE_SIZE)));
  const key = String(options.key || worldCoverTileKey(bounds, size));
  const loaded = await fetchWorldCoverBlob(
    bounds,
    size,
    key,
    options.signal || null,
    Number(options.priority) || 0,
    Number(options.timeoutMs) || REQUEST_TIMEOUT_MS
  );
  const result = await createSemanticTexture(loaded.blob, size);
  return { ...result, key, source: loaded.source };
}

export function worldCoverProviderSnapshot() {
  return providerCircuit.snapshot();
}

export const WORLD_COVER_ATTRIBUTION =
  'ESA WorldCover 2021 / Contains modified Copernicus Sentinel data (2021) processed by the ESA WorldCover consortium';
