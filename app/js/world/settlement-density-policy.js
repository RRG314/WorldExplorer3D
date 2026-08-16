const DEVELOPED_LANDUSE = new Set([
  'commercial', 'construction', 'industrial', 'residential', 'retail'
]);
const SETTLEMENT_PLACES = new Set([
  'city', 'town', 'village', 'hamlet', 'suburb', 'quarter', 'neighbourhood'
]);
const SETTLEMENT_AMENITIES = new Set([
  'college', 'hospital', 'marketplace', 'school', 'university'
]);
const LOW_SIGNAL_HIGHWAYS = new Set([
  'bridleway', 'cycleway', 'footway', 'path', 'steps', 'track'
]);

export function analyzeSettlementEvidence(data = {}) {
  const evidence = {
    buildings: 0,
    developedLanduse: 0,
    settlementPlaces: 0,
    settlementAmenities: 0,
    driveableRoads: 0
  };
  for (const element of data.elements || []) {
    const tags = element?.tags || {};
    if (tags.building || tags['building:part']) evidence.buildings += 1;
    if (DEVELOPED_LANDUSE.has(String(tags.landuse || '').toLowerCase())) {
      evidence.developedLanduse += 1;
    }
    if (SETTLEMENT_PLACES.has(String(tags.place || '').toLowerCase())) {
      evidence.settlementPlaces += 1;
    }
    if (
      tags.amenity &&
      SETTLEMENT_AMENITIES.has(String(tags.amenity).toLowerCase())
    ) {
      evidence.settlementAmenities += 1;
    }
    if (
      element?.type === 'way' && tags.highway &&
      !LOW_SIGNAL_HIGHWAYS.has(String(tags.highway).toLowerCase())
    ) {
      evidence.driveableRoads += 1;
    }
  }
  return evidence;
}

export function shouldLoadDetailedBuildings(data = {}, options = {}) {
  const evidence = analyzeSettlementEvidence(data);
  const sparseBiome = ['sand', 'snow'].includes(
    String(options.worldSurfaceProfile?.terrainModeHint || '').toLowerCase()
  );
  const explicitSettlement = (
    evidence.buildings > 0 ||
    evidence.developedLanduse > 0 ||
    evidence.settlementPlaces > 0 ||
    evidence.settlementAmenities >= 2
  );
  const shouldLoad = (
    explicitSettlement ||
    (!sparseBiome && evidence.driveableRoads >= 12)
  );
  return Object.freeze({
    shouldLoad,
    sparseBiome,
    evidence: Object.freeze(evidence)
  });
}
