import { ctx as appCtx } from "./shared-context.js?v=55";
import { createLocalSurfaceAnalysisApi } from "./surface-rules-local.js?v=1";

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
  'paved',
  'parking',
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
  if (tags.amenity === 'parking') return 'parking';
  if (tags['area:highway'] || tags.place === 'square') return 'paved';
  if (tags.highway === 'pedestrian' && tags.area === 'yes') return 'paved';
  if (tags.area === 'yes' && /^(paved|asphalt|concrete|concrete:plates|paving_stones|sett|cobblestone)$/.test(tags.surface || '')) return 'paved';
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
  const dryLatitudeExplicitSand =
    latitudeDry &&
    sparseSurfaceWater &&
    norm.vegetated <= 0.45 &&
    Number(signals.raw?.explicitSand || 0) >= 0.9;
  const explicitDesert =
    norm.explicitSand >= 0.07 ||
    dryLatitudeExplicitSand ||
    (
      latitudeDry &&
      sparseSurfaceWater &&
      norm.explicitSand >= 0.025 &&
      norm.arid >= 0.035
    ) ||
    norm.barren >= 0.1 && norm.explicitSand >= 0.03;
  const inferredDesert = latitudeDry && sparseVegetation && sparseSurfaceWater && norm.arid >= 0.24;
  const lowDetailAridFallback = latitudeDry && signals.total < 6 && sparseVegetation && sparseSurfaceWater;
  const subtropicalDryFallback =
    absLat >= 18 &&
    absLat <= ARID_LAT_MAX &&
    signals.total >= 6 &&
    norm.vegetated <= 0.02 &&
    norm.water <= 0.02 &&
    norm.arid <= 0.01;
  const aridTerrain = !polar && (
    explicitDesert ||
    inferredDesert ||
    lowDetailAridFallback ||
    subtropicalDryFallback
  );

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
  const weatherSnow = shouldApplySnowOverlay(absLat, maxMeters);
  const useSnow = polar || alpine || subpolarSnow || weatherSnow;
  const waterNearby = localSignals.waterAdjacent || norm.water >= 0.08;
  const steepTerrain = maxMeters - minMeters >= 210 || (Number.isFinite(p90Meters) && Number.isFinite(p75Meters) && (p90Meters - p75Meters) >= 85);
  const explicitBeachSand = norm.sand >= 0.08 && waterNearby && (
    norm.urban < 0.18 ||
    (norm.sand >= 0.1 && localSignals.candidates.urbanLanduses === 0)
  );
  const aridFallback = shouldUseAridFallback(absLat, worldProfile, norm, localSignals);
  const useSand = !useSnow && (explicitBeachSand || aridFallback);
  const useRock = !useSnow && !useSand && (norm.rock >= 0.18 || (steepTerrain && norm.rock >= 0.06));
  const useSoil = !useSnow && !useSand && !useRock && (norm.soil >= 0.2 || (norm.soil >= 0.1 && norm.grass < 0.24));
  const mode = useSnow ?
    ((polar || useRock || steepTerrain) ? 'snowRock' : 'snow') :
    useSand ? 'sand' :
    useRock ? 'rock' :
    useSoil ? 'soil' :
    'grass';

  return {
    mode,
    // Base elevation tiles represent natural ground. Roads and hardscape own
    // their mapped footprints; urban density must never pave an entire hill.
    visualMode: mode,
    reason: useSnow ?
      (weatherSnow ? 'live_weather_snow' : polar ? 'polar_latitude' : alpine ? 'high_elevation' : 'cold_highland') :
      useSand ? (explicitBeachSand ? 'localized_beach' : 'arid_surface') :
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
const { summarizeLocalGroundSignals } = createLocalSurfaceAnalysisApi({
  appCtx,
  constants: {
    COASTAL_SAMPLE_PADDING_WORLD,
    EXPLICIT_SAND_SURFACE_TYPES,
    ROAD_SAMPLE_PADDING_WORLD,
    ROCKY_SURFACE_TYPES,
    SOIL_SURFACE_TYPES,
    TILE_SAMPLE_GRID,
    URBAN_SURFACE_TYPES,
    VEGETATED_SURFACE_TYPES
  }
});

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
  const worldRaw = worldProfile?.signals?.raw || {};
  const lowDetailAridWorld =
    worldProfile?.reason === 'arid_surface' &&
    Number(worldProfile?.signals?.total || 0) < 6;
  const dryBeltNoMoistureWorld =
    worldProfile?.reason === 'arid_surface' &&
    absLat >= 18 &&
    absLat <= ARID_LAT_MAX &&
    Number(worldProfile?.signals?.total || 0) >= 6 &&
    Number(worldNorm.vegetated || 0) <= 0.02 &&
    Number(worldNorm.water || 0) <= 0.02 &&
    Number(worldNorm.arid || 0) <= 0.01;
  const explicitAridWorld =
    worldProfile?.reason === 'arid_surface' &&
    Number(worldNorm.water || 0) < 0.08 &&
    (
      Number(worldNorm.explicitSand || 0) >= 0.1 ||
      Number(worldNorm.arid || 0) >= 0.1
    );
  const mappedAridRegion =
    worldProfile?.reason === 'arid_surface' &&
    Number(worldNorm.water || 0) < 0.08 &&
    Number(worldNorm.explicitSand || 0) >= 0.025 &&
    Number(worldNorm.arid || 0) >= 0.035;
  const worldSupportsDesertFallback =
    Number(worldNorm.explicitSand || 0) >= 0.35 ||
    lowDetailAridWorld ||
    dryBeltNoMoistureWorld ||
    explicitAridWorld ||
    mappedAridRegion ||
    (
      Number(worldNorm.vegetated || 0) < 0.14 &&
      Number(worldNorm.water || 0) < 0.06 &&
      Number(worldNorm.arid || 0) >= 0.12
    ) ||
    (
      worldProfile?.reason === 'arid_surface' &&
      absLat >= ARID_LAT_MIN &&
      absLat <= ARID_LAT_MAX &&
      Number(worldRaw.explicitSand || 0) >= 0.9
    );
  if (!worldSupportsDesertFallback) return false;
  const builtPressure = Math.max(norm.urban, Math.min(1, localSignals.candidates.buildings / 12));
  const lowUrban = builtPressure < 0.18;
  const moderateUrban = builtPressure < 0.34;
  const lowVegetation = norm.grass < (localSignals.candidates.greenLanduses > 0 ? 0.16 : 0.28);
  const moderateVegetation =
    norm.grass < (localSignals.candidates.greenLanduses > 0 ? 0.22 : 0.5);
  const lowWater = norm.water < 0.08;
  const openGround = norm.rock + norm.soil + norm.uncovered >= 0.42 ||
    (norm.uncovered >= 0.28 && localSignals.candidates.landuses <= 1 && localSignals.candidates.buildings <= 2);
  const desertLatitude = absLat >= ARID_LAT_MIN && absLat <= ARID_LAT_MAX;
  const aridWorldOverride =
    worldProfile?.reason === 'arid_surface' &&
    desertLatitude &&
    moderateVegetation &&
    norm.water < 0.12 &&
    (openGround || norm.uncovered >= 0.24 || norm.soil + norm.rock >= 0.18);
  return desertLatitude && (
    (lowUrban && lowVegetation && lowWater && openGround) ||
    aridWorldOverride
  );
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
