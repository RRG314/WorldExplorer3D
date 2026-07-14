export function createOceanBathymetryApi({
  appCtx,
  oceanMode,
  bathymetryGridUrl,
  constants
}) {
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
        const timedOut = elapsed >= constants.BATHYMETRY_WAIT_MS;

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

  return {
    clamp01,
    expApproachFactor,
    lerp,
    primeBathymetryTiles,
    primeLocalBathymetryGrid,
    sampleSeabedHeight,
    smoothstep,
    valueNoise2D
  };
}
