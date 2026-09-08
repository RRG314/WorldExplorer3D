import { parcelGameValue, pointInGeometry } from '../gis/maryland-parcel-core.js?v=1';

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clean(value, fallback = '') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function parcelKind(parcel, building) {
  if (building?.kind) return building.kind;
  const use = `${parcel.landUseCode || ''} ${parcel.landUseDescription || ''}`.toLowerCase();
  if (/farm|agric|resource|forest/.test(use)) return 'Rural land';
  if (/commercial|retail|office/.test(use)) return 'Commercial land';
  if (/industrial|warehouse/.test(use)) return 'Industrial land';
  if (/residential|town|condo|apartment/.test(use)) return 'Residential land';
  return 'Land parcel';
}

function parcelContainsCandidate(parcel, candidate) {
  if (!Number.isFinite(candidate?.lon) || !Number.isFinite(candidate?.lat)) return false;
  return pointInGeometry(candidate.lon, candidate.lat, parcel.geometry);
}

function makeParcelPropertyCandidates(parcels = [], buildingCandidates = [], options = {}) {
  const actor = options.actor || { x: 0, z: 0 };
  const locationId = clean(options.locationId, 'current-place');
  const locationLabel = clean(options.locationLabel, 'this place');
  const geoToWorld = typeof options.geoToWorld === 'function' ? options.geoToWorld : (() => ({ x: 0, z: 0 }));
  const heightAt = typeof options.heightAt === 'function' ? options.heightAt : (() => 0);
  const associatedIds = new Set();
  const output = [];

  parcels.forEach((parcel) => {
    const buildings = buildingCandidates.filter((candidate) => parcelContainsCandidate(parcel, candidate));
    buildings.forEach((building) => associatedIds.add(building.id));
    const primary = buildings.slice().sort((left, right) => right.area * right.levels - left.area * left.levels)[0] || null;
    const center = geoToWorld(parcel.centroid.lat, parcel.centroid.lon);
    const x = primary ? primary.x : finite(center.x);
    const z = primary ? primary.z : finite(center.z);
    const y = primary ? primary.y : finite(heightAt(x, z));
    const kind = parcelKind(parcel, primary);
    const landUse = clean(parcel.landUseDescription || parcel.landUseCode, 'Mapped land');
    const address = parcel.address || primary?.address || null;
    const label = address?.line1 ? address.line1 : primary?.label || `${kind} in ${locationLabel}`;
    const area = primary?.area || Math.max(16, Math.min(5000000, finite(parcel.parcelAreaSqM, 16)));
    const levels = primary?.levels || 1;
    const legacyWorldPropertyIds = buildings.map((building) => building.worldPropertyId).filter(Boolean);
    output.push(Object.freeze({
      id: `property:${parcel.parcelId}`,
      worldPropertyId: parcel.worldPropertyId,
      legacyWorldPropertyIds: Object.freeze(legacyWorldPropertyIds),
      sharedEligible: true,
      sourceBuildingId: primary?.sourceBuildingId || '',
      sourceAuthority: primary?.sourceAuthority || '',
      sourceParcelId: parcel.sourceParcelId,
      parcelId: parcel.parcelId,
      parcelAuthority: parcel.sourceAuthority,
      jurisdictionCode: parcel.jurisdictionCode,
      jurisdictionName: parcel.jurisdictionName,
      locationId, locationLabel, label, address, kind,
      buildingType: primary?.buildingType || `land:${clean(parcel.landUseCode, 'unspecified').toLowerCase()}`,
      landUseCode: parcel.landUseCode,
      landUseDescription: parcel.landUseDescription,
      zoning: parcel.zoning,
      x, z, y, lat: parcel.centroid.lat, lon: parcel.centroid.lon,
      area: Math.round(area), levels,
      footprintArea: Math.round(buildings.reduce((sum, building) => sum + Math.max(0, finite(building.area)), 0)),
      parcelAreaSqM: parcel.parcelAreaSqM,
      reportedAcres: parcel.reportedAcres,
      sourceAssessment: parcel.sourceAssessment,
      price: parcelGameValue(parcel, buildings),
      storageCapacity: primary?.storageCapacity || 0,
      mappedResidential: primary?.mappedResidential || /residential|town|condo|apartment/i.test(landUse),
      hasStructures: buildings.length > 0,
      buildingCount: buildings.length,
      associatedBuildingIds: Object.freeze(buildings.map((building) => building.sourceBuildingId)),
      entryAnchor: primary?.entryAnchor || null,
      parcelGeometry: parcel.geometry,
      parcelProvenance: parcel.provenance,
      geometryDate: parcel.geometryDate,
      assessmentDate: parcel.assessmentDate,
      distance: Math.hypot(x - finite(actor.x), z - finite(actor.z)),
      provenance: 'maryland-authoritative-parcel'
    }));
  });

  const fallbackBuildings = buildingCandidates.filter((candidate) => !associatedIds.has(candidate.id));
  return Object.freeze({
    candidates: Object.freeze([...output, ...fallbackBuildings]
      .sort((left, right) => left.distance - right.distance)
      .slice(0, Math.max(1, Math.min(500, finite(options.limit, 160))))),
    associatedBuildingCount: associatedIds.size,
    parcelPropertyCount: output.length,
    vacantParcelCount: output.filter((property) => !property.hasStructures).length,
    fallbackBuildingCount: fallbackBuildings.length
  });
}

function parcelAtGeoPoint(candidates = [], lat, lon) {
  return candidates.find((candidate) => candidate.parcelGeometry && pointInGeometry(Number(lon), Number(lat), candidate.parcelGeometry)) || null;
}

function parcelBuildPermissionAt({ candidates = [], homes = [], lat, lon, status = 'idle' } = {}) {
  if (status !== 'ready') return Object.freeze({ allowed: true, authority: 'existing-build-rules' });
  const parcel = parcelAtGeoPoint(candidates, lat, lon);
  if (!parcel) return Object.freeze({
    allowed: false,
    authority: 'maryland-parcel-ownership',
    reason: 'Move closer and reload Real Estate so this Maryland parcel can be verified.'
  });
  const owned = homes.some((home) => home.worldPropertyId === parcel.worldPropertyId ||
    home.canonicalWorldPropertyId === parcel.worldPropertyId || home.parcelId === parcel.parcelId);
  return Object.freeze({
    allowed: owned,
    authority: 'maryland-parcel-ownership',
    parcelId: parcel.parcelId,
    reason: owned ? '' : 'Quick Build on mapped Maryland land is available after you own this parcel.'
  });
}

export { makeParcelPropertyCandidates, parcelAtGeoPoint, parcelBuildPermissionAt, parcelContainsCandidate };
