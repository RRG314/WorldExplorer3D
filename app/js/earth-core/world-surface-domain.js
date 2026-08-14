const POLAR_CRYOSPHERE_LATITUDE = 86;

function finiteLatitude(location = {}) {
  const latitude = Number(location.latitude ?? location.lat);
  return Number.isFinite(latitude) ? Math.max(-90, Math.min(90, latitude)) : 0;
}

export function isPolarCryosphereLocation(location = {}) {
  return Math.abs(finiteLatitude(location)) >= POLAR_CRYOSPHERE_LATITUDE;
}

export function resolveWorldSurfaceDomain(options = {}) {
  const location = options.location || options;
  const latitude = finiteLatitude(location);
  const polar = Math.abs(latitude) >= POLAR_CRYOSPHERE_LATITUDE;
  if (polar) {
    const hemisphere = latitude >= 0 ? 'north' : 'south';
    return Object.freeze({
      kind: 'cryosphere',
      subtype: hemisphere === 'north' ? 'sea_ice' : 'ice_sheet',
      hemisphere,
      groundMode: 'polar-cryosphere-local',
      walkable: true,
      supportsBoatArrival: false,
      sourcePolicy: hemisphere === 'north'
        ? 'fixed-arctic-sea-ice-surface'
        : 'fixed-antarctic-ice-sheet-surface',
      reason: 'polar-coordinate-and-web-mercator-limit'
    });
  }

  const mappedWaterKind = String(options.mappedWaterKind || '').trim().toLowerCase();
  const requestedBoatArrival = options.requestedArrivalMode === 'boat';
  if (mappedWaterKind === 'open_ocean' || requestedBoatArrival) {
    return Object.freeze({
      kind: 'ocean',
      subtype: mappedWaterKind || 'open_ocean',
      hemisphere: latitude >= 0 ? 'north' : 'south',
      groundMode: 'open-ocean-surface-only',
      walkable: false,
      supportsBoatArrival: true,
      sourcePolicy: 'mapped-open-ocean',
      reason: requestedBoatArrival ? 'explicit-boat-arrival' : 'mapped-open-ocean'
    });
  }

  return Object.freeze({
    kind: 'land',
    subtype: 'terrestrial',
    hemisphere: latitude >= 0 ? 'north' : 'south',
    groundMode: 'accepted-ground',
    walkable: true,
    supportsBoatArrival: false,
    sourcePolicy: 'accepted-ground-or-worldwide-fallback',
    reason: 'terrestrial-location'
  });
}

export { POLAR_CRYOSPHERE_LATITUDE };
