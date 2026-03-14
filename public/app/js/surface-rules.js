import { ctx as appCtx } from "./shared-context.js?v=55";

const POLAR_SNOW_LAT_THRESHOLD = 66;
const POLAR_ICE_LAT_THRESHOLD = 66;
const DEEP_POLAR_LAT_THRESHOLD = 72;
const SUBPOLAR_SNOW_LAT_THRESHOLD = 58;
const ALPINE_SNOWLINE_METERS = 3200;
const SUBPOLAR_SNOWLINE_METERS = 1800;
const ARID_LAT_MIN = 12;
const ARID_LAT_MAX = 35;

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

function midpointLatitude(bounds) {
  if (Number.isFinite(bounds?.latN) && Number.isFinite(bounds?.latS)) {
    return (bounds.latN + bounds.latS) * 0.5;
  }
  return Number(appCtx.LOC?.lat || 0);
}

function normalizeLanduseSurfaceType(tags = {}) {
  if (!tags || typeof tags !== 'object') return null;
  if (tags.landuse && appCtx.LANDUSE_STYLES?.[tags.landuse]) return tags.landuse;
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
  const useSnow = polar || alpine || subpolarSnow;

  const useSand = !useSnow && worldProfile?.terrainModeHint === 'sand';
  const mode = useSnow ? (polar ? 'snow' : 'snowRock') : useSand ? 'sand' : 'grass';

  return {
    mode,
    reason: useSnow ?
      (polar ? 'polar_latitude' : alpine ? 'high_elevation' : 'cold_highland') :
      useSand ? 'arid_surface' : 'temperate',
    absLat
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

export {
  ALPINE_SNOWLINE_METERS,
  POLAR_ICE_LAT_THRESHOLD,
  POLAR_SNOW_LAT_THRESHOLD,
  SUBPOLAR_SNOW_LAT_THRESHOLD,
  classifyTerrainSurfaceProfile,
  classifyWaterSurfaceProfile,
  classifyWorldSurfaceProfile,
  normalizeLanduseSurfaceType,
  summarizeSurfaceSignals
};
