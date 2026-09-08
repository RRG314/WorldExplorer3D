import { classifyBiomeProfile } from '../earth-core/biome-profile.js?v=1';

function locationKey(appCtx) {
  return [Number(appCtx.LOC?.lat || 0), Number(appCtx.LOC?.lon || 0)]
    .map((value) => value.toFixed(5))
    .join(':');
}

export function worldCoverStatsForLocation(appCtx) {
  const key = locationKey(appCtx);
  if (!appCtx.worldCoverStats || appCtx.worldCoverStats.locationKey !== key) {
    appCtx.worldCoverStats = {
      locationKey: key,
      requested: 0,
      ready: 0,
      failed: 0,
      network: 0,
      persistentCache: 0,
      classes: {}
    };
  }
  return appCtx.worldCoverStats;
}

export function refreshWorldBiomeFromWorldCoverStats(appCtx, stats, tile = null) {
  // Diagnostic totals are not environmental evidence: far tiles resolve in
  // network-dependent order. Only the nearest accepted tile owns local biome.
  if (!tile || stats?.locationKey !== locationKey(appCtx)) return null;
  const { bounds, counts, key, elevationMeters } = tile;
  if (!bounds || !counts) return null;
  const lat = Number(appCtx.LOC?.lat), lon = Number(appCtx.LOC?.lon);
  const latitudeDistance = Math.max(bounds.latS - lat, 0, lat - bounds.latN);
  const longitudeDistance = Math.max(bounds.lonW - lon, 0, lon - bounds.lonE);
  const distance = Math.hypot(latitudeDistance, longitudeDistance * Math.cos(lat * Math.PI / 180));
  if (!Number.isFinite(distance)) return null;
  const owner = stats.biomeOwner;
  if (owner && (distance > owner.distance || (distance === owner.distance && String(key) > owner.key))) return null;
  const total = Object.values(counts).reduce(
    (sum, value) => sum + Math.max(0, Number(value) || 0),
    0
  );
  if (!(total > 0) || !appCtx.worldSurfaceProfile) return null;
  stats.biomeOwner = {distance, key:String(key)};
  const ratio = (name) => Math.max(0, Number(counts[name] || 0)) / total;
  const signals = {
    woody: ratio('tree') + ratio('mangrove'),
    vegetated: ratio('tree') + ratio('mangrove') + ratio('wetland') +
      ratio('shrub') + ratio('grass') + ratio('crop') + ratio('moss'),
    water: ratio('water'),
    arid: ratio('bare'),
    cryo: ratio('snow'),
    scrub: ratio('shrub')
  };
  const biome = classifyBiomeProfile({
    latitude: Number(appCtx.LOC?.lat || 0),
    elevationMeters,
    signals
  });
  appCtx.worldSurfaceProfile = {
    ...appCtx.worldSurfaceProfile,
    biome,
    biomeEvidence: {
      authority: 'nearest-worldcover-semantic-tile',
      tileKey: String(key),
      bounds: {...bounds},
      elevationMeters: Number.isFinite(elevationMeters) ? elevationMeters : null,
      recognizedPixels: total,
      signals
    }
  };
  return biome;
}
