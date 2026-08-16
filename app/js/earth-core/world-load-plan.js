export function createWorldLoadPlan(options = {}) {
  const surfaceDomain = options.surfaceDomain || {};
  const kind = String(surfaceDomain.kind || 'land');
  if (kind === 'cryosphere') {
    return Object.freeze({
      id: 'cryosphere-surface-only',
      surfaceOnly: true,
      providerPolicy: 'fixed-cryosphere-no-map-features',
      loadTransport: false,
      loadBuildings: false,
      loadLanduse: false,
      loadVegetation: false
    });
  }
  if (kind === 'ocean') {
    return Object.freeze({
      id: 'verified-open-ocean-surface-only',
      surfaceOnly: true,
      providerPolicy: 'verified-ocean-no-land-features',
      loadTransport: false,
      loadBuildings: false,
      loadLanduse: false,
      loadVegetation: false
    });
  }
  return Object.freeze({
    id: 'mapped-terrestrial-world',
    surfaceOnly: false,
    providerPolicy: 'mapped-features-by-observed-settlement',
    loadTransport: true,
    loadBuildings: 'when-settlement-evidence-exists',
    loadLanduse: true,
    loadVegetation: true
  });
}
