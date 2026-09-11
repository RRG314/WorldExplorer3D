import { activateNearbyPois, normalizePois } from './semantic-authority.js?v=3';
import { associatePoisToBuildings } from './building-association.js?v=1';

function compilePoiLifecycle(inputs = [], buildings = [], options = {}) {
  const normalized = normalizePois(inputs);
  const associated = associatePoisToBuildings(normalized, buildings, {
    entranceByBuilding: options.entranceByBuilding,
    radiusMeters: options.radiusMeters
  }).map((record) => Object.freeze({
    ...record,
    lifecycle: record.buildingAssociation?.entrance
      ? 'entrance-associated'
      : record.buildingAssociation
        ? 'building-associated'
        : record.semantic.functional
          ? 'exterior-fallback'
          : 'informational'
  }));
  const byId = new Map(associated.map((record) => [record.id, record]));
  const byBuilding = new Map();
  associated.forEach((record) => {
    const sourceBuildingId = String(record.buildingAssociation?.sourceBuildingId || '');
    if (!sourceBuildingId) return;
    const tenants = byBuilding.get(sourceBuildingId) || [];
    tenants.push(record);
    byBuilding.set(sourceBuildingId, tenants);
  });
  byBuilding.forEach((tenants, key) => byBuilding.set(key, Object.freeze(tenants.slice())));
  const functional = Object.freeze(associated.filter((record) => record.semantic.functional));
  const activation = Object.freeze({
    radiusMeters: Math.max(1, Number(options.activation?.radiusMeters) || 240),
    limit: Math.max(1, Math.min(64, Math.floor(Number(options.activation?.limit) || 12)))
  });
  const activeFor = (actor = { x: 0, z: 0 }) => activateNearbyPois(functional, actor, activation);
  const active = activeFor(options.actor || { x: 0, z: 0 });
  return Object.freeze({
    type: 'WorldExplorerPoiLifecycle',
    schemaVersion: 1,
    records: Object.freeze(associated),
    functional,
    active,
    byId,
    byBuilding,
    activation,
    activeFor,
    metrics: Object.freeze({
      indexed: associated.length,
      functional: functional.length,
      associated: functional.filter((record) => record.buildingAssociation).length,
      entranceAssociated: functional.filter((record) => record.buildingAssociation?.entrance).length,
      exteriorFallback: functional.filter((record) => !record.buildingAssociation).length,
      active: active.length
    })
  });
}

export { compilePoiLifecycle };
