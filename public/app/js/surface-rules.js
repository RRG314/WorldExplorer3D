import { ctx as appCtx } from "./shared-context.js?v=55";

const POLAR_SNOW_LAT_THRESHOLD = 66;
const POLAR_ICE_LAT_THRESHOLD = 66;
const DEEP_POLAR_LAT_THRESHOLD = 72;
const SUBPOLAR_SNOW_LAT_THRESHOLD = 58;
const ALPINE_SNOWLINE_METERS = 3200;
const SUBPOLAR_SNOWLINE_METERS = 1800;
const ARID_LAT_MIN = 12;
const ARID_LAT_MAX = 35;
const TILE_SAMPLE_GRID = 5;
const COASTAL_SAMPLE_PADDING_WORLD = 65;
const ROAD_SAMPLE_PADDING_WORLD = 24;

const VEGETATED_SURFACE_TYPES = new Set([
  'forest',
  'wood',
  'park',
  'garden',
  'grass',
  'meadow',
  'orchard',
  'vineyard',
  'allotments',
  'farmland',
  'recreation_ground',
  'village_green',
  'cemetery'
]);

const URBAN_SURFACE_TYPES = new Set([
  'residential',
  'commercial',
  'industrial',
  'retail',
  'construction',
  'brownfield',
  'garages',
  'railway',
  'harbour',
  'port',
  'military'
]);

const SOIL_SURFACE_TYPES = new Set([
  'farmland',
  'farmyard',
  'orchard',
  'vineyard',
  'allotments',
  'plant_nursery',
  'greenhouse_horticulture'
]);

const ROCKY_SURFACE_TYPES = new Set([
  'barren',
  'quarry'
]);

const EXPLICIT_SAND_SURFACE_TYPES = new Set([
  'sand',
  'dune'
]);

function midpointLatitude(bounds) {
  if (Number.isFinite(bounds?.latN) && Number.isFinite(bounds?.latS)) {
    return (bounds.latN + bounds.latS) * 0.5;
  }
  return Number(appCtx.LOC?.lat || 0);
}

function normalizeLanduseSurfaceType(tags = {}) {
  if (!tags || typeof tags !== 'object') return null;
  if (tags.landuse && appCtx.LANDUSE_STYLES?.[tags.landuse]) return tags.landuse;
  if (tags.landuse === 'quarry') return 'quarry';
  if (tags.landuse === 'plant_nursery') return 'plant_nursery';
  if (tags.landuse === 'farmyard') return 'farmyard';
  if (tags.landuse === 'greenhouse_horticulture') return 'greenhouse_horticulture';
  if (tags.landuse === 'reservoir' || tags.landuse === 'basin') return 'water';
  if (tags.natural === 'water' || !!tags.water) return 'water';
  if (tags.natural === 'glacier') return 'glacier';
  if (tags.natural === 'sand') return tags.sand === 'dune' ? 'dune' : 'sand';
  if (tags.natural === 'beach') return 'sand';
  if (tags.natural === 'bare_rock' || tags.natural === 'scree' || tags.natural === 'shingle') return 'barren';
  if (tags.natural === 'forest') return 'forest';
  if (tags.natural === 'wood') return 'wood';
  if (tags.natural === 'scrub') return 'scrub';
  if (tags.natural === 'grassland' || tags.natural === 'heath') return 'meadow';
  if (tags.natural === 'wetland') return 'grass';
  if (tags.leisure === 'park') return 'park';
  if (tags.leisure === 'garden') return 'garden';
  if (tags.leisure === 'nature_reserve') return 'forest';
  return null;
}

function accumulateSurfaceSignals(tags = {}, signals) {
  if (!signals) return;
  const type = normalizeLanduseSurfaceType(tags);
  if (!type) return;
  signals.total += 1;

  if (VEGETATED_SURFACE_TYPES.has(type)) signals.vegetated += 1;
  if (type === 'water') signals.water += 1;
  if (type === 'glacier') {
    signals.cryo += 1.8;
    signals.explicitCryo += 1;
  }
  if (type === 'sand') {
    signals.arid += 0.9;
    signals.explicitSand += 0.9;
  }
  if (type === 'dune') {
    signals.arid += 1.35;
    signals.explicitSand += 1.2;
  }
  if (type === 'barren') {
    signals.arid += 0.55;
    signals.barren += 1;
  }
  if (type === 'scrub') {
    signals.arid += 0.28;
    signals.vegetated += 0.18;
    signals.scrub += 1;
  }

  if (tags.natural === 'beach') {
    signals.coastalSand += 1;
  }
  if (tags.natural === 'wetland') {
    signals.water += 0.3;
  }
}

function normalizeSignalValue(value, total) {
  if (!Number.isFinite(value) || total <= 0) return 0;
  return value / total;
}

function summarizeSurfaceSignals(landuseWays = [], waterwayWays = []) {
  const signals = {
    total: 0,
    vegetated: 0,
    water: 0,
    cryo: 0,
    arid: 0,
    explicitSand: 0,
    explicitCryo: 0,
    barren: 0,
    scrub: 0,
    coastalSand: 0
  };

  if (Array.isArray(landuseWays)) {
    for (let i = 0; i < landuseWays.length; i++) {
      accumulateSurfaceSignals(landuseWays[i]?.tags || {}, signals);
    }
  }

  if (Array.isArray(waterwayWays) && waterwayWays.length > 0) {
    signals.water += Math.min(12, waterwayWays.length * 0.18);
  }

  const total = Math.max(1, signals.total);
  const normalized = {
    vegetated: normalizeSignalValue(signals.vegetated, total),
    water: normalizeSignalValue(signals.water, total),
    cryo: normalizeSignalValue(signals.cryo, total),
    arid: normalizeSignalValue(signals.arid, total),
    explicitSand: normalizeSignalValue(signals.explicitSand, total),
    explicitCryo: normalizeSignalValue(signals.explicitCryo, total),
    barren: normalizeSignalValue(signals.barren, total),
    scrub: normalizeSignalValue(signals.scrub, total),
    coastalSand: normalizeSignalValue(signals.coastalSand, total)
  };

  return { raw: signals, normalized, total };
}

function classifyWorldSurfaceProfile({
  centerLat = null,
  landuseWays = [],
  waterwayWays = []
} = {}) {
  const lat = Number.isFinite(centerLat) ? centerLat : Number(appCtx.LOC?.lat || 0);
  const absLat = Math.abs(lat);
  const signals = summarizeSurfaceSignals(landuseWays, waterwayWays);
  const norm = signals.normalized;

  const polar = absLat >= DEEP_POLAR_LAT_THRESHOLD ||
    absLat >= POLAR_SNOW_LAT_THRESHOLD && (norm.explicitCryo > 0 || norm.water >= 0.08);
  const frozenWater = polar ||
    absLat >= POLAR_ICE_LAT_THRESHOLD ||
    absLat >= 60 && norm.explicitCryo >= 0.05;

  const latitudeDry = absLat >= ARID_LAT_MIN && absLat <= ARID_LAT_MAX;
  const sparseVegetation = norm.vegetated <= 0.28;
  const sparseSurfaceWater = norm.water <= 0.22;
  const explicitDesert = norm.explicitSand >= 0.07 || norm.barren >= 0.1 && norm.explicitSand >= 0.03;
  const inferredDesert = latitudeDry && sparseVegetation && sparseSurfaceWater && norm.arid >= 0.24;
  const lowDetailAridFallback = latitudeDry && signals.total < 6 && sparseVegetation && sparseSurfaceWater;
  const aridTerrain = !polar && (explicitDesert || inferredDesert || lowDetailAridFallback);

  return {
    absLat,
    centerLat: lat,
    terrainModeHint: polar ? 'snow' : aridTerrain ? 'sand' : 'grass',
    waterModeHint: frozenWater ? 'ice' : 'water',
    reason: polar ? 'polar_latitude' : aridTerrain ? 'arid_surface' : 'temperate',
    signals
  };
}

function classifyTerrainSurfaceProfile({
  bounds = null,
  minElevationMeters = null,
  maxElevationMeters = null,
  elevationStats = null,
  worldSurfaceProfile = null
} = {}) {
  const latMid = midpointLatitude(bounds);
  const absLat = Math.abs(latMid);
  const maxMeters = Number.isFinite(maxElevationMeters) ? maxElevationMeters : 0;
  const minMeters = Number.isFinite(minElevationMeters) ? minElevationMeters : 0;
  const p75Meters = Number.isFinite(elevationStats?.p75) ? elevationStats.p75 : maxMeters;
  const p90Meters = Number.isFinite(elevationStats?.p90) ? elevationStats.p90 : maxMeters;
  const worldProfile = worldSurfaceProfile || appCtx.worldSurfaceProfile || null;

  const polar = absLat >= POLAR_SNOW_LAT_THRESHOLD || worldProfile?.terrainModeHint === 'snow';
  const alpine = p90Meters >= ALPINE_SNOWLINE_METERS ||
    maxMeters >= ALPINE_SNOWLINE_METERS + 700 ||
    maxMeters >= ALPINE_SNOWLINE_METERS && p75Meters >= ALPINE_SNOWLINE_METERS * 0.5;
  const subpolarSnow = absLat >= SUBPOLAR_SNOW_LAT_THRESHOLD &&
    (p90Meters >= SUBPOLAR_SNOWLINE_METERS || maxMeters >= SUBPOLAR_SNOWLINE_METERS + 500 || minMeters >= SUBPOLAR_SNOWLINE_METERS * 0.55);
  const localSignals = summarizeLocalGroundSignals(bounds);
  const norm = localSignals.normalized;
  const hasExplicitUrbanLanduse = (localSignals.candidates?.urbanLanduses || 0) > 0;
  const hasExplicitGreenLanduse = (localSignals.candidates?.greenLanduses || 0) > 0;
  const denseBuiltWithoutGreen = !hasExplicitGreenLanduse &&
    (
      ((localSignals.candidates?.buildings || 0) >= 10 && (localSignals.candidates?.roads || 0) >= 7) ||
      ((localSignals.candidates?.buildings || 0) >= 8 && (localSignals.candidates?.roads || 0) >= 10)
    );
  const weatherSnow = shouldApplySnowOverlay(absLat, maxMeters);
  const useSnow = polar || alpine || subpolarSnow || weatherSnow;
  const aridWorldHint = worldProfile?.terrainModeHint === 'sand';

  const mixedGreenContext = hasExplicitGreenLanduse ||
    norm.grass >= 0.24 ||
    (
      localSignals.candidates.urbanLanduses === 0 &&
      (norm.grass + norm.soil + norm.uncovered) >= 0.52 &&
      localSignals.candidates.buildings < 18
    );
  const openGroundShare = norm.grass + norm.soil + norm.uncovered;
  const strongExplicitUrban = localSignals.candidates.urbanLanduses >= 1;
  const extremeBuiltCore =
    localSignals.candidates.greenLanduses === 0 &&
    localSignals.candidates.buildings >= 24 &&
    localSignals.candidates.roads >= 12 &&
    openGroundShare < 0.18 &&
    norm.urban >= 0.42;
  const urbanDominantBase =
    (strongExplicitUrban && openGroundShare < 0.46) ||
    (hasExplicitUrbanLanduse && localSignals.candidates.buildings >= 4 && norm.urban >= 0.34 && openGroundShare < 0.42) ||
    extremeBuiltCore;
  const urbanDominant = aridWorldHint ?
    (
      localSignals.candidates.urbanLanduses >= 1 ||
      localSignals.candidates.buildings >= 22 ||
      (
        localSignals.candidates.buildings >= 16 &&
        localSignals.candidates.roads >= 10 &&
        localSignals.candidates.greenLanduses === 0 &&
        norm.urban >= 0.38 &&
        openGroundShare < 0.24
      )
    ) :
    (
      urbanDominantBase &&
      !(openGroundShare >= 0.28 && localSignals.candidates.greenLanduses === 0) &&
      !(mixedGreenContext && openGroundShare >= 0.18) &&
      !(!strongExplicitUrban && norm.urban < 0.52)
    );
  const steepTerrain = maxMeters - minMeters >= 210 || (Number.isFinite(p90Meters) && Number.isFinite(p75Meters) && (p90Meters - p75Meters) >= 85);
  const waterNearby = localSignals.waterAdjacent || norm.water >= 0.08;
  const explicitBeachSand = norm.sand >= 0.08 && waterNearby && (
    norm.urban < 0.18 ||
    (norm.sand >= 0.1 && localSignals.candidates.urbanLanduses === 0)
  );
  const aridFallback = shouldUseAridFallback(absLat, worldProfile, norm, localSignals);
  const useSand = !useSnow && (explicitBeachSand || (!urbanDominant && aridFallback));
  const useUrban = !useSnow && !useSand && urbanDominant;
  const useRock = !useSnow && !useSand && !useUrban && (norm.rock >= 0.18 || (steepTerrain && norm.rock >= 0.06));
  const useSoil = !useSnow && !useSand && !useUrban && !useRock && (norm.soil >= 0.2 || (norm.soil >= 0.1 && norm.grass < 0.24));
  const mode = useSnow ?
    ((polar || useRock || steepTerrain) ? 'snowRock' : 'snow') :
    useSand ? 'sand' :
    useUrban ? 'urban' :
    useRock ? 'rock' :
    useSoil ? 'soil' :
    'grass';

  return {
    mode,
    reason: useSnow ?
      (weatherSnow ? 'live_weather_snow' : polar ? 'polar_latitude' : alpine ? 'high_elevation' : 'cold_highland') :
      useSand ? (explicitBeachSand ? 'localized_beach' : 'arid_surface') :
      useUrban ? 'urban_ground' :
      useRock ? 'rocky_surface' :
      useSoil ? 'soil_surface' :
      'vegetated_ground',
    absLat,
    localSignals
  };
}

function classifyWaterSurfaceProfile({
  bounds = null,
  worldSurfaceProfile = null
} = {}) {
  const latMid = midpointLatitude(bounds);
  const absLat = Math.abs(latMid);
  const worldProfile = worldSurfaceProfile || appCtx.worldSurfaceProfile || null;
  const frozen = worldProfile?.waterModeHint === 'ice' || absLat >= POLAR_ICE_LAT_THRESHOLD;
  return {
    mode: frozen ? 'ice' : 'water',
    reason: frozen ? 'frozen_surface' : 'liquid_surface',
    absLat
  };
}

function pointInPolygonXZ(x, z, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const zi = polygon[i].z;
    const xj = polygon[j].x;
    const zj = polygon[j].z;
    const intersects = (zi > z) !== (zj > z) &&
      x < (xj - xi) * (z - zi) / ((zj - zi) || 1e-9) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointToSegmentDistanceXZ(x, z, p1, p2) {
  const dx = p2.x - p1.x;
  const dz = p2.z - p1.z;
  const len2 = dx * dx + dz * dz;
  if (len2 <= 1e-9) return Math.hypot(x - p1.x, z - p1.z);
  let t = ((x - p1.x) * dx + (z - p1.z) * dz) / len2;
  t = Math.max(0, Math.min(1, t));
  const px = p1.x + dx * t;
  const pz = p1.z + dz * t;
  return Math.hypot(x - px, z - pz);
}

function pointNearRoadCorridor(x, z, roadCandidates = []) {
  const probeBounds = { minX: x, maxX: x, minZ: z, maxZ: z };
  for (let i = 0; i < roadCandidates.length; i++) {
    const road = roadCandidates[i];
    const roadBounds = ensureRecordBounds(road);
    const roadWidth = Number.isFinite(road?.width) ? road.width : 8;
    const extraSidewalkRoom =
      String(road?.type || '').includes('motorway') || String(road?.type || '').includes('trunk') ? 1.2 :
      3.6;
    const corridorRadius = roadWidth * 0.5 + extraSidewalkRoom;
    if (!boundsIntersect(roadBounds, probeBounds, corridorRadius)) continue;
    const pts = Array.isArray(road?.pts) ? road.pts : [];
    for (let p = 0; p < pts.length - 1; p++) {
      if (pointToSegmentDistanceXZ(x, z, pts[p], pts[p + 1]) <= corridorRadius) {
        return true;
      }
    }
  }
  return false;
}

function boundsFromPoints(points = []) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) {
    return null;
  }
  return { minX, maxX, minZ, maxZ };
}

function ensureRecordBounds(record) {
  if (!record || typeof record !== 'object') return null;
  if (
    Number.isFinite(record.minX) &&
    Number.isFinite(record.maxX) &&
    Number.isFinite(record.minZ) &&
    Number.isFinite(record.maxZ)
  ) {
    return { minX: record.minX, maxX: record.maxX, minZ: record.minZ, maxZ: record.maxZ };
  }
  if (record.bounds && Number.isFinite(record.bounds.minX)) return record.bounds;
  const points = Array.isArray(record.pts) ? record.pts : null;
  const bounds = boundsFromPoints(points || []);
  if (bounds) record.bounds = bounds;
  return bounds;
}

function boundsIntersect(a, b, padding = 0) {
  if (!a || !b) return false;
  return !(
    a.maxX < b.minX - padding ||
    a.minX > b.maxX + padding ||
    a.maxZ < b.minZ - padding ||
    a.minZ > b.maxZ + padding
  );
}

function geoBoundsToWorldBounds(bounds, padding = 0) {
  if (!bounds || typeof appCtx.geoToWorld !== 'function') return null;
  const points = [
    appCtx.geoToWorld(bounds.latN, bounds.lonW),
    appCtx.geoToWorld(bounds.latN, bounds.lonE),
    appCtx.geoToWorld(bounds.latS, bounds.lonW),
    appCtx.geoToWorld(bounds.latS, bounds.lonE)
  ];
  const worldBounds = boundsFromPoints(points);
  if (!worldBounds) return null;
  if (!padding) return worldBounds;
  return {
    minX: worldBounds.minX - padding,
    maxX: worldBounds.maxX + padding,
    minZ: worldBounds.minZ - padding,
    maxZ: worldBounds.maxZ + padding
  };
}

function classifyLocalSurfaceBucket(type) {
  if (!type) return null;
  if (EXPLICIT_SAND_SURFACE_TYPES.has(type)) return 'sand';
  if (ROCKY_SURFACE_TYPES.has(type)) return 'rock';
  if (SOIL_SURFACE_TYPES.has(type)) return 'soil';
  if (URBAN_SURFACE_TYPES.has(type)) return 'urban';
  if (VEGETATED_SURFACE_TYPES.has(type) || type === 'grass' || type === 'meadow' || type === 'scrub') return 'grass';
  return null;
}

function surfacePriority(type) {
  if (EXPLICIT_SAND_SURFACE_TYPES.has(type)) return 6;
  if (ROCKY_SURFACE_TYPES.has(type)) return 5;
  if (URBAN_SURFACE_TYPES.has(type)) return 4;
  if (SOIL_SURFACE_TYPES.has(type)) return 3;
  if (VEGETATED_SURFACE_TYPES.has(type) || type === 'grass' || type === 'meadow' || type === 'scrub') return 2;
  return 1;
}

function normalizedLocalSignals(samples) {
  const total = Math.max(1, Number(samples.total) || 0);
  return {
    sand: (samples.sand || 0) / total,
    grass: (samples.grass || 0) / total,
    urban: (samples.urban || 0) / total,
    soil: (samples.soil || 0) / total,
    rock: (samples.rock || 0) / total,
    water: (samples.water || 0) / total,
    uncovered: (samples.uncovered || 0) / total
  };
}

function getWeatherForTerrain() {
  if (appCtx.weatherMode && appCtx.weatherMode !== 'live' && appCtx.weatherState) return appCtx.weatherState;
  return appCtx.liveWeatherState || appCtx.weatherState || null;
}

function shouldApplySnowOverlay(absLat, maxMeters = 0) {
  const weather = getWeatherForTerrain();
  if (!weather) return false;
  const tempC = Number.isFinite(weather.temperatureC) ? weather.temperatureC : Number(weather.apparentC);
  const snowCategory = weather.category === 'snow' || weather.mode === 'snow';
  if (snowCategory && (!Number.isFinite(tempC) || tempC <= 2.5)) return true;
  if (Number.isFinite(tempC) && tempC <= -2 && absLat >= 45 && maxMeters >= 500) return true;
  return false;
}

function shouldUseAridFallback(absLat, worldProfile, norm, localSignals) {
  const worldArid = worldProfile?.terrainModeHint === 'sand' || worldProfile?.reason === 'arid_surface';
  if (!worldArid) return false;
  const worldNorm = worldProfile?.signals?.normalized || {};
  const worldSupportsDesertFallback =
    Number(worldNorm.explicitSand || 0) >= 0.35 ||
    (
      Number(worldNorm.vegetated || 0) < 0.14 &&
      Number(worldNorm.water || 0) < 0.06 &&
      Number(worldNorm.arid || 0) >= 0.12
    );
  if (!worldSupportsDesertFallback) return false;
  const builtPressure = Math.max(norm.urban, Math.min(1, localSignals.candidates.buildings / 12));
  const lowUrban = builtPressure < 0.18;
  const lowVegetation = norm.grass < 0.16;
  const lowWater = norm.water < 0.08 && !localSignals.waterAdjacent;
  const openGround = norm.rock + norm.soil + norm.uncovered >= 0.42 ||
    (norm.uncovered >= 0.28 && localSignals.candidates.landuses <= 1 && localSignals.candidates.buildings <= 2);
  const desertLatitude = absLat >= ARID_LAT_MIN && absLat <= ARID_LAT_MAX;
  return desertLatitude && lowUrban && lowVegetation && lowWater && openGround;
}

function summarizeLocalGroundSignals(bounds) {
  const tileBounds = geoBoundsToWorldBounds(bounds);
  const coastalBounds = geoBoundsToWorldBounds(bounds, COASTAL_SAMPLE_PADDING_WORLD);
  const roadBounds = geoBoundsToWorldBounds(bounds, ROAD_SAMPLE_PADDING_WORLD);
  const samples = {
    total: 0,
    sand: 0,
    grass: 0,
    urban: 0,
    soil: 0,
    rock: 0,
    water: 0,
    uncovered: 0
  };

  if (!tileBounds) {
    return {
      raw: samples,
      normalized: normalizedLocalSignals(samples),
      waterAdjacent: false,
      candidates: { landuses: 0, water: 0, buildings: 0 }
    };
  }

  const preciseLanduseCandidates = (Array.isArray(appCtx.landuses) ? appCtx.landuses : []).filter((entry) => {
    const entryBounds = ensureRecordBounds(entry);
    return boundsIntersect(entryBounds, tileBounds);
  });
  const fallbackLanduseCandidates = preciseLanduseCandidates.length === 0 ?
    (Array.isArray(appCtx.surfaceFeatureHints) ? appCtx.surfaceFeatureHints : []).filter((entry) => {
      const entryBounds = ensureRecordBounds(entry);
      return boundsIntersect(entryBounds, tileBounds);
    }) :
    [];
  const landuseCandidates = preciseLanduseCandidates.length > 0 ? preciseLanduseCandidates : fallbackLanduseCandidates;
  const waterCandidates = (Array.isArray(appCtx.waterAreas) ? appCtx.waterAreas : []).filter((entry) => {
    const entryBounds = ensureRecordBounds(entry);
    return boundsIntersect(entryBounds, coastalBounds);
  });
  const roadCandidates = (Array.isArray(appCtx.roads) ? appCtx.roads : []).filter((entry) => {
    const entryBounds = ensureRecordBounds(entry);
    return boundsIntersect(entryBounds, roadBounds || tileBounds);
  });
  const buildingCandidates = (Array.isArray(appCtx.buildings) ? appCtx.buildings : []).filter((entry) => {
    const entryBounds = ensureRecordBounds(entry);
    return boundsIntersect(entryBounds, tileBounds);
  });
  const hasExplicitUrbanLanduse = landuseCandidates.some((entry) => URBAN_SURFACE_TYPES.has(entry?.type));
  const hasExplicitGreenLanduse = landuseCandidates.some((entry) =>
    VEGETATED_SURFACE_TYPES.has(entry?.type) || entry?.type === 'grass' || entry?.type === 'meadow' || entry?.type === 'scrub'
  );
  const denseBuiltWithoutGreen = !hasExplicitGreenLanduse &&
    (
      (buildingCandidates.length >= 10 && roadCandidates.length >= 7) ||
      (buildingCandidates.length >= 8 && roadCandidates.length >= 10)
    );

  const tileWidth = Math.max(1, tileBounds.maxX - tileBounds.minX);
  const tileDepth = Math.max(1, tileBounds.maxZ - tileBounds.minZ);
  for (let row = 0; row < TILE_SAMPLE_GRID; row++) {
    for (let col = 0; col < TILE_SAMPLE_GRID; col++) {
      const x = tileBounds.minX + ((col + 0.5) / TILE_SAMPLE_GRID) * tileWidth;
      const z = tileBounds.minZ + ((row + 0.5) / TILE_SAMPLE_GRID) * tileDepth;
      samples.total += 1;

      let insideBuilding = false;
      for (let i = 0; i < buildingCandidates.length; i++) {
        const building = buildingCandidates[i];
        const buildingBounds = ensureRecordBounds(building);
        if (!boundsIntersect(buildingBounds, { minX: x, maxX: x, minZ: z, maxZ: z })) continue;
        if (Array.isArray(building.pts) && building.pts.length >= 3) {
          if (!pointInPolygonXZ(x, z, building.pts)) continue;
        }
        insideBuilding = true;
        break;
      }
      if (insideBuilding) {
        samples.urban += 1.25;
        continue;
      }

      let matchedType = null;
      let matchedPriority = -1;
      for (let i = 0; i < landuseCandidates.length; i++) {
        const landuse = landuseCandidates[i];
        const luBounds = ensureRecordBounds(landuse);
        if (!boundsIntersect(luBounds, { minX: x, maxX: x, minZ: z, maxZ: z })) continue;
        if (!pointInPolygonXZ(x, z, landuse.pts)) continue;
        const type = landuse.type || null;
        const priority = surfacePriority(type);
        if (priority >= matchedPriority) {
          matchedPriority = priority;
          matchedType = type;
        }
      }

      if (!matchedType) {
        let waterHit = false;
        for (let i = 0; i < waterCandidates.length; i++) {
          const area = waterCandidates[i];
          const waterBounds = ensureRecordBounds(area);
          if (!boundsIntersect(waterBounds, { minX: x, maxX: x, minZ: z, maxZ: z })) continue;
          if (pointInPolygonXZ(x, z, area.pts)) {
            waterHit = true;
            break;
          }
        }
        if (waterHit) {
          samples.water += 1;
          continue;
        }
        const nearRoadCorridor = roadCandidates.length > 0 && pointNearRoadCorridor(x, z, roadCandidates);
        const corridorUrbanEligible =
          hasExplicitUrbanLanduse ||
          (
            denseBuiltWithoutGreen &&
            buildingCandidates.length >= 18 &&
            roadCandidates.length >= 10
          );
        if (nearRoadCorridor && corridorUrbanEligible) {
          samples.urban += hasExplicitUrbanLanduse ? 0.82 : 0.38;
          samples.uncovered += hasExplicitUrbanLanduse ? 0.18 : 0.62;
        } else if (nearRoadCorridor) {
          const corridorGrassWeight = hasExplicitGreenLanduse ? 0.82 : buildingCandidates.length <= 8 ? 0.72 : 0.62;
          samples.grass += corridorGrassWeight;
          samples.uncovered += 1 - corridorGrassWeight;
        } else if (hasExplicitUrbanLanduse && buildingCandidates.length >= 6 && roadCandidates.length >= 4) {
          samples.urban += 0.3;
          samples.uncovered += 0.7;
        } else {
          samples.uncovered += 1;
        }
        continue;
      }

      const bucket = classifyLocalSurfaceBucket(matchedType);
      if (bucket === 'sand') samples.sand += 1;
      else if (bucket === 'urban') samples.urban += 1;
      else if (bucket === 'soil') samples.soil += 1;
      else if (bucket === 'rock') samples.rock += 1;
      else if (bucket === 'grass') samples.grass += 1;
      else samples.uncovered += 1;
    }
  }

  return {
    raw: samples,
    normalized: normalizedLocalSignals(samples),
    waterAdjacent: waterCandidates.length > 0,
    candidates: {
      landuses: landuseCandidates.length,
      water: waterCandidates.length,
      buildings: buildingCandidates.length,
      roads: roadCandidates.length,
      urbanLanduses: hasExplicitUrbanLanduse ? 1 : 0,
      greenLanduses: hasExplicitGreenLanduse ? 1 : 0
    }
  };
}

export {
  ALPINE_SNOWLINE_METERS,
  POLAR_ICE_LAT_THRESHOLD,
  POLAR_SNOW_LAT_THRESHOLD,
  SUBPOLAR_SNOW_LAT_THRESHOLD,
  classifyTerrainSurfaceProfile,
  classifyWaterSurfaceProfile,
  classifyWorldSurfaceProfile,
  normalizeLanduseSurfaceType,
  summarizeLocalGroundSignals,
  summarizeSurfaceSignals
};
