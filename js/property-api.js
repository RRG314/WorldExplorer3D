import { postProtectedFunction } from './function-api.js?v=3';

function worldPayload(input = {}) {
  const roomCode = String(input.roomCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  const worldSeed = String(input.worldSeed || '').trim().slice(0, 180);
  if (!worldSeed) throw new Error('Load an Earth location before using connected property.');
  return { roomCode, worldSeed };
}

function propertyPayload(property = {}) {
  return {
    propertyId: String(property.worldPropertyId || property.propertyId || property.id || '').slice(0, 420),
    sourceBuildingId: String(property.sourceBuildingId || '').slice(0, 220),
    sourceAuthority: String(property.sourceAuthority || '').slice(0, 40),
    sourceParcelId: String(property.sourceParcelId || '').slice(0, 120),
    parcelId: String(property.parcelId || '').slice(0, 120),
    parcelAuthority: String(property.parcelAuthority || '').slice(0, 60),
    jurisdictionCode: String(property.jurisdictionCode || '').slice(0, 8),
    jurisdictionName: String(property.jurisdictionName || '').slice(0, 80),
    locationId: String(property.locationId || '').slice(0, 180),
    locationLabel: String(property.locationLabel || '').slice(0, 80),
    label: String(property.label || '').slice(0, 100),
    address: property.address && typeof property.address === 'object' ? {
      line1: String(property.address.line1 || '').slice(0, 120),
      locality: String(property.address.locality || '').slice(0, 80),
      region: String(property.address.region || '').slice(0, 80),
      postalCode: String(property.address.postalCode || '').slice(0, 24),
      country: String(property.address.country || '').slice(0, 48),
      formatted: String(property.address.formatted || '').slice(0, 240),
      source: String(property.address.source || (property.parcelId ? 'maryland-imap-parcels' : 'mapped-building-tags')).slice(0, 60)
    } : null,
    kind: String(property.kind || '').slice(0, 40),
    buildingType: String(property.buildingType || '').slice(0, 60),
    area: Number(property.area || 0),
    footprintArea: Number(property.footprintArea || property.area || 0),
    parcelAreaSqM: Number(property.parcelAreaSqM || 0),
    reportedAcres: Number(property.reportedAcres || 0),
    sourceAssessment: Number(property.sourceAssessment || 0),
    landUseCode: String(property.landUseCode || '').slice(0, 24),
    landUseDescription: String(property.landUseDescription || '').slice(0, 100),
    zoning: String(property.zoning || '').slice(0, 60),
    geometryDate: String(property.geometryDate || '').slice(0, 24),
    assessmentDate: String(property.assessmentDate || '').slice(0, 24),
    associatedBuildingIds: (Array.isArray(property.associatedBuildingIds) ? property.associatedBuildingIds : [])
      .slice(0, 40).map((value) => String(value || '').slice(0, 220)),
    levels: Number(property.levels || 1),
    x: Number(property.x || 0),
    z: Number(property.z || 0)
  };
}

async function commitWorldPropertyAction(input = {}) {
  return postProtectedFunction('/commitWorldPropertyAction', {
    ...worldPayload(input),
    action: String(input.action || '').slice(0, 32),
    requestId: String(input.requestId || '').slice(0, 120),
    salePrice: Number(input.salePrice || 0),
    rentPrice: Number(input.rentPrice || 0),
    rentTermDays: Number(input.rentTermDays || 0),
    actorPose: input.actorPose && typeof input.actorPose === 'object' ? {
      x: Number(input.actorPose.x || 0),
      z: Number(input.actorPose.z || 0)
    } : null,
    property: propertyPayload(input.property)
  }, { label: 'Shared property', forceRefreshToken: false });
}

async function commitWorldPropertyTradeAction(input = {}) {
  const payload = {
    ...worldPayload(input),
    action: String(input.action || '').slice(0, 32),
    requestId: String(input.requestId || '').slice(0, 120),
    offerId: String(input.offerId || '').slice(0, 120),
    creditOffer: Number(input.creditOffer || 0)
  };
  if (input.offeredProperty) payload.offeredProperty = propertyPayload(input.offeredProperty);
  if (input.requestedProperty) payload.requestedProperty = propertyPayload(input.requestedProperty);
  return postProtectedFunction('/commitWorldPropertyAction', payload, { label: 'Property trade', forceRefreshToken: false });
}

export { commitWorldPropertyAction, commitWorldPropertyTradeAction };
