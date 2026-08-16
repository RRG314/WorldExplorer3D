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

export function refreshWorldBiomeFromWorldCoverStats(appCtx, stats) {
  const counts = stats?.classes || {};
  const total = Object.values(counts).reduce(
    (sum, value) => sum + Math.max(0, Number(value) || 0),
    0
  );
  if (!(total > 0) || !appCtx.worldSurfaceProfile) return null;
  const ratio = (name) => Math.max(0, Number(counts[name] || 0)) / total;
  const signals = {
    vegetated: ratio('tree') + ratio('mangrove') + ratio('wetland') +
      ratio('shrub') + ratio('grass') + ratio('crop') + ratio('moss'),
    water: ratio('water'),
    arid: ratio('bare'),
    cryo: ratio('snow'),
    scrub: ratio('shrub')
  };
  const biome = classifyBiomeProfile({
    latitude: Number(appCtx.LOC?.lat || 0),
    signals
  });
  appCtx.worldSurfaceProfile = {
    ...appCtx.worldSurfaceProfile,
    biome,
    biomeEvidence: {
      authority: 'aggregated-worldcover-semantic-classes',
      recognizedPixels: total,
      signals
    }
  };
  return biome;
}
