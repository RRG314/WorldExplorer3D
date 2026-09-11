import {
  DEPTH_TRUTH_TYPE,
  GEBCO_WMS_ENDPOINT,
  createGebcoDepthEvidence,
  fetchGebcoDepthEvidence,
  normalizeDepthEvidence
} from '../geospatial/bathymetry-evidence.js?v=1';

export function createOceanBathymetryApi({
  appCtx,
  oceanMode,
  bathymetryGridUrl,
  constants
}) {
  const GEBCO_GRID_SIZE = 5;
  const GEBCO_GRID_EXTENT = 900;
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
    return {
      rows,
      cols,
      latMin,
      latMax,
      lonMin,
      lonMax,
      values,
      source: payload.source && typeof payload.source === 'object' ? { ...payload.source } : null,
      generatedAt: String(payload.generatedAt || '') || null,
      spacingDegreesLat: Number.isFinite(Number(grid.spacingDegreesLat)) ? Number(grid.spacingDegreesLat) : null,
      spacingDegreesLon: Number.isFinite(Number(grid.spacingDegreesLon)) ? Number(grid.spacingDegreesLon) : null
    };
  }

  function primeLocalBathymetryGrid() {
    if (oceanMode.localBathymetryPromise) return oceanMode.localBathymetryPromise;
    oceanMode.localBathymetryPromise = (async () => {
      try {
        const response = await fetch(bathymetryGridUrl, { cache: 'no-cache' });
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

  async function primeGlobalBathymetryGrid() {
    if (oceanMode.globalBathymetryPromise) return oceanMode.globalBathymetryPromise;
    const launchSignature = `${Number(oceanMode.launchSite?.lat).toFixed(6)},${Number(oceanMode.launchSite?.lon).toFixed(6)}`;
    oceanMode.globalBathymetryPromise = (async () => {
      const samples = [];
      for (let row = 0; row < GEBCO_GRID_SIZE; row += 1) {
        const z = -GEBCO_GRID_EXTENT + row / (GEBCO_GRID_SIZE - 1) * GEBCO_GRID_EXTENT * 2;
        for (let column = 0; column < GEBCO_GRID_SIZE; column += 1) {
          const x = -GEBCO_GRID_EXTENT + column / (GEBCO_GRID_SIZE - 1) * GEBCO_GRID_EXTENT * 2;
          const geo = oceanWorldToLatLon(x, z);
          samples.push(fetchGebcoDepthEvidence(geo.lat, geo.lon)
            .then((evidence) => evidence.elevationMeters)
            .catch(() => null));
        }
      }
      const values = await Promise.all(samples);
      const validCount = values.filter(Number.isFinite).length;
      const currentSignature = `${Number(oceanMode.launchSite?.lat).toFixed(6)},${Number(oceanMode.launchSite?.lon).toFixed(6)}`;
      if (currentSignature !== launchSignature || validCount < Math.ceil(values.length * 0.6)) return false;
      oceanMode.globalBathymetryGrid = {
        size: GEBCO_GRID_SIZE,
        extent: GEBCO_GRID_EXTENT,
        values,
        dataset: 'GEBCO current WMS grid',
        datasetRelease: 'service-layer-current',
        source: GEBCO_WMS_ENDPOINT
      };
      oceanMode.globalBathymetryReady = true;
      oceanMode.bathymetryCache.clear();
      return true;
    })().catch((error) => {
      console.warn('[OceanMode] Global GEBCO bathymetry unavailable; retaining local/procedural seabed.', error);
      oceanMode.globalBathymetryGrid = null;
      oceanMode.globalBathymetryReady = false;
      return false;
    });
    return oceanMode.globalBathymetryPromise;
  }

  function sampleGlobalBathymetryMeters(x, z) {
    const grid = oceanMode.globalBathymetryGrid;
    if (!grid || !Array.isArray(grid.values) || grid.size < 2) return null;
    const gridX = clamp01((x + grid.extent) / (grid.extent * 2)) * (grid.size - 1);
    const gridY = clamp01((z + grid.extent) / (grid.extent * 2)) * (grid.size - 1);
    const x0 = Math.floor(gridX);
    const y0 = Math.floor(gridY);
    const x1 = Math.min(grid.size - 1, x0 + 1);
    const y1 = Math.min(grid.size - 1, y0 + 1);
    const valueAt = (row, column) => Number(grid.values[row * grid.size + column]);
    const h00 = valueAt(y0, x0);
    const h10 = valueAt(y0, x1);
    const h01 = valueAt(y1, x0);
    const h11 = valueAt(y1, x1);
    if (![h00, h10, h01, h11].every(Number.isFinite)) return null;
    const top = lerp(h00, h10, gridX - x0);
    const bottom = lerp(h01, h11, gridX - x0);
    return lerp(top, bottom, gridY - y0);
  }

  function sampleTerrainMetersAtLatLon(lat, lon) {
    if (typeof appCtx.elevationMetersAtLatLon === 'function') {
      const meters = appCtx.elevationMetersAtLatLon(lat, lon);
      return Number.isFinite(meters) ? meters : null;
    }

    return null;
  }

  function sampleBathymetryEvidence(x, z) {
    const { lat, lon } = oceanWorldToLatLon(x, z);
    const localMeters = sampleLocalBathymetryMeters(lat, lon);
    if (Number.isFinite(localMeters)) {
      const source = oceanMode.localBathymetryGrid?.source || {};
      const spacingLat = oceanMode.localBathymetryGrid?.spacingDegreesLat;
      const spacingLon = oceanMode.localBathymetryGrid?.spacingDegreesLon;
      return normalizeDepthEvidence({
        truthType: DEPTH_TRUTH_TYPE.MODELED,
        elevationMeters: localMeters,
        sourceId: 'bundled-gebco2020-opentopodata-grid',
        dataset: source.dataset || 'gebco2020',
        datasetRelease: 'GEBCO_2020',
        verticalDatum: 'assumed-mean-sea-level',
        sampleWindowDegrees: Math.max(Number(spacingLat) || 0, Number(spacingLon) || 0) || null,
        qualityClass: 'mixed-source-grid-without-tid-cell-classification',
        fetchedAt: source.queryDateUtc || oceanMode.localBathymetryGrid?.generatedAt,
        sourceUrl: 'https://www.opentopodata.org/',
        navigationSafe: false
      });
    }

    const globalMeters = sampleGlobalBathymetryMeters(x, z);
    if (Number.isFinite(globalMeters)) {
      return createGebcoDepthEvidence(globalMeters, {
        datasetRelease: oceanMode.globalBathymetryGrid?.datasetRelease || 'service-layer-current',
        sampleWindowDegrees: 0.02
      });
    }

    const terrainMeters = sampleTerrainMetersAtLatLon(lat, lon);
    if (Number.isFinite(terrainMeters)) {
      return normalizeDepthEvidence({
        truthType: DEPTH_TRUTH_TYPE.DERIVED,
        elevationMeters: terrainMeters,
        sourceId: 'accepted-ground-elevation-sampler',
        dataset: 'active accepted ground',
        verticalDatum: 'accepted-ground-runtime-datum',
        qualityClass: 'terrain-sample-not-bathymetric-survey',
        navigationSafe: false
      });
    }

    return normalizeDepthEvidence({ reason: 'no-bathymetry-at-coordinate' });
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

    const evidence = sampleBathymetryEvidence(x, z);
    const mapped = mapBathymetryMetersToWorldY(evidence.elevationMeters);
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

  function sampleSeabedEvidence(x, z) {
    const bathymetry = sampleBathymetryEvidence(x, z);
    const proceduralWorldY = sampleProceduralSeabedHeight(x, z);
    const bathymetryWorldY = mapBathymetryMetersToWorldY(bathymetry.elevationMeters);
    if (!Number.isFinite(bathymetryWorldY)) {
      return Object.freeze({
        bathymetry,
        presentationMode: 'procedural-only',
        presentationWorldY: proceduralWorldY,
        bathymetryWorldY: null,
        proceduralWorldY,
        bathymetryBlend: 0
      });
    }
    const reefDx = x - 24;
    const reefDz = z - 124;
    const reefWeight = Math.exp(-(reefDx * reefDx + reefDz * reefDz) / 25000);
    const bathymetryBlend = clamp01(0.52 * (1 - reefWeight * 0.44));
    return Object.freeze({
      bathymetry,
      presentationMode: 'procedural-bathymetry-blend',
      presentationWorldY: lerp(proceduralWorldY, bathymetryWorldY, bathymetryBlend),
      bathymetryWorldY,
      proceduralWorldY,
      bathymetryBlend
    });
  }

  function primeBathymetryTiles() {
    if (oceanMode.bathymetryPromise) return oceanMode.bathymetryPromise;
    oceanMode.bathymetryPromise = primeGlobalBathymetryGrid().then((globalReady) => {
      const groundActive = appCtx.getAcceptedGroundRuntimeSnapshot?.().status === 'accepted';
      oceanMode.bathymetryReady = oceanMode.localBathymetryReady || globalReady || groundActive;
      oceanMode.bathymetryBlend = oceanMode.bathymetryReady ? 1 : 0;
      if (oceanMode.bathymetryReady) oceanMode.bathymetryCache.clear();
      return oceanMode.bathymetryReady;
    });
    return oceanMode.bathymetryPromise;
  }

  return {
    clamp01,
    expApproachFactor,
    lerp,
    primeBathymetryTiles,
    primeGlobalBathymetryGrid,
    primeLocalBathymetryGrid,
    sampleBathymetryEvidence,
    sampleSeabedEvidence,
    sampleSeabedHeight,
    smoothstep,
    valueNoise2D
  };
}
