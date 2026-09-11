import { normalizeDepthEvidence } from '../geospatial/bathymetry-evidence.js?v=1';

const POLAR_CRYOSPHERE_LATITUDE = 86;

const VERIFIED_SURFACE_KINDS = new Set([
  'land',
  'open_ocean',
  'cryosphere'
]);

function finiteLatitude(location = {}) {
  const latitude = Number(location.latitude ?? location.lat);
  return Number.isFinite(latitude) ? Math.max(-90, Math.min(90, latitude)) : 0;
}

export function isPolarCryosphereLocation(location = {}) {
  return Math.abs(finiteLatitude(location)) >= POLAR_CRYOSPHERE_LATITUDE;
}

export function normalizeWorldSurfaceEvidence(evidence = null) {
  if (!evidence || typeof evidence !== 'object') return null;
  const kind = String(evidence.kind || '').trim().toLowerCase();
  if (!VERIFIED_SURFACE_KINDS.has(kind) || evidence.verified !== true) return null;
  const elevationMeters = evidence.elevationMeters == null || evidence.elevationMeters === ''
    ? NaN
    : Number(evidence.elevationMeters);
  return Object.freeze({
    kind,
    verified: true,
    source: String(evidence.source || 'unknown').trim().slice(0, 80) || 'unknown',
    elevationMeters: Number.isFinite(elevationMeters) ? elevationMeters : null,
    bathymetry: normalizeDepthEvidence(evidence.bathymetry)
  });
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

  const surfaceEvidence = normalizeWorldSurfaceEvidence(options.surfaceEvidence);
  if (surfaceEvidence?.kind === 'open_ocean') {
    return Object.freeze({
      kind: 'ocean',
      subtype: 'open_ocean',
      hemisphere: latitude >= 0 ? 'north' : 'south',
      groundMode: 'open-ocean-surface-only',
      walkable: false,
      supportsBoatArrival: true,
      sourcePolicy: surfaceEvidence.source,
      reason: 'verified-open-ocean-coordinate',
      surfaceEvidence
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
    reason: surfaceEvidence?.kind === 'land'
      ? 'verified-terrestrial-coordinate'
      : 'terrestrial-location',
    surfaceEvidence
  });
}

export { POLAR_CRYOSPHERE_LATITUDE };
