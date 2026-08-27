const BALTIMORE_FACILITY_PACK = Object.freeze({
  id: 'baltimore-civic-facilities',
  version: '2026-08-26.1',
  center: Object.freeze({ lat: 39.2904, lon: -76.6122 }),
  radiusDegrees: 0.035,
  provider: 'OpenStreetMap',
  license: 'ODbL-1.0',
  attribution: '© OpenStreetMap contributors',
  retrievedAt: '2026-08-26',
  facilities: Object.freeze([
    Object.freeze({
      osmType: 'way', osmId: 337697103, amenity: 'police',
      name: 'Baltimore Police Department Headquarters', lat: 39.2902036, lon: -76.6076870
    }),
    Object.freeze({
      osmType: 'way', osmId: 178328329, amenity: 'police',
      name: 'Inner Harbor Kiosk', lat: 39.2825246, lon: -76.6121894
    }),
    Object.freeze({
      osmType: 'way', osmId: 107442323, amenity: 'hospital',
      name: 'Mercy Medical Center', lat: 39.2932695, lon: -76.6128049
    }),
    Object.freeze({
      osmType: 'way', osmId: 674170598, amenity: 'hospital',
      name: 'University of Maryland Hospital', lat: 39.2879585, lon: -76.6246143
    })
  ])
});

function reviewedCivicFacilitiesForLocation(location = {}) {
  const lat = Number(location.lat);
  const lon = Number(location.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) ||
    Math.hypot(lat - BALTIMORE_FACILITY_PACK.center.lat, lon - BALTIMORE_FACILITY_PACK.center.lon) > BALTIMORE_FACILITY_PACK.radiusDegrees) {
    return Object.freeze([]);
  }
  return Object.freeze(BALTIMORE_FACILITY_PACK.facilities.map((facility) => Object.freeze({
    type: 'node',
    id: `reviewed:${facility.osmType}:${facility.osmId}`,
    lat: facility.lat,
    lon: facility.lon,
    tags: Object.freeze({
      amenity: facility.amenity,
      name: facility.name,
      _sourceElementType: facility.osmType,
      _sourceElementId: String(facility.osmId),
      _we3dProvider: BALTIMORE_FACILITY_PACK.provider,
      _we3dLicense: BALTIMORE_FACILITY_PACK.license,
      _we3dAttribution: BALTIMORE_FACILITY_PACK.attribution,
      _we3dRetrievedAt: BALTIMORE_FACILITY_PACK.retrievedAt,
      _we3dRegionalPackId: BALTIMORE_FACILITY_PACK.id,
      _we3dRegionalPackVersion: BALTIMORE_FACILITY_PACK.version
    }),
    sourceElementType: facility.osmType,
    sourceElementId: facility.osmId,
    provider: BALTIMORE_FACILITY_PACK.provider,
    license: BALTIMORE_FACILITY_PACK.license,
    attribution: BALTIMORE_FACILITY_PACK.attribution,
    retrievedAt: BALTIMORE_FACILITY_PACK.retrievedAt,
    regionalPackId: BALTIMORE_FACILITY_PACK.id,
    regionalPackVersion: BALTIMORE_FACILITY_PACK.version
  })));
}

export { BALTIMORE_FACILITY_PACK, reviewedCivicFacilitiesForLocation };
