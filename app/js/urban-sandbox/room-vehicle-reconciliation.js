import { VEHICLE_CATALOG } from '../engine/vehicle-catalog.js?v=6';

export function publishedRoomVehicleDefinition(entity, driveOnLeft = false) {
  if (entity?.kind !== 'vehicle' || !entity.entityId) return null;
  const variant = VEHICLE_CATALOG.find(entry => entry.bodyStyle === entity.style && entry.label === entity.label)
    || VEHICLE_CATALOG.find(entry => entry.bodyStyle === entity.style);
  if (!variant || !['x', 'y', 'z', 'yaw'].every(key => Number.isFinite(entity.pose?.[key]))) return null;
  return {
    id: entity.entityId, variant, color: entity.color, condition: entity.condition,
    durabilityPolicy: variant.durabilityPolicy, resistance: variant.resistance,
    playable: variant.playable, enterable: variant.enterable,
    source: 'room-published-vehicle', roomPublished: true,
    driverSide: driveOnLeft ? 1 : -1, ...entity.pose
  };
}

// Server-published cars must not depend on this client's local parking/traffic
// seed budget. Keep a bounded nearby set and release its visual resources when
// it leaves range or its room disappears. Never retire the player's active car.
export function reconcilePublishedRoomVehicles(state, options) {
  const protectedVehicle = vehicle => vehicle.attachedToPlayer || vehicle.occupied ||
    state.activeVehicle === vehicle || state.transition?.vehicle === vehicle;
  const reference = options.reference || {};
  state.roomTrafficOwnership ||= new Map();
  for (const [id, agentId] of state.roomTrafficOwnership) {
    if (state.remoteEntities.has(id) || state.vehicles.some(vehicle => vehicle.id === id && protectedVehicle(vehicle))) continue;
    options.releaseTrafficAgent?.(agentId);
    state.roomTrafficOwnership.delete(id);
  }
  for (const entity of state.remoteEntities.values()) {
    if (!publishedRoomVehicleDefinition(entity, state.driveOnLeft)) continue;
    if (!state.roomTrafficOwnership.has(entity.entityId)) {
      const agentId = options.claimTrafficAgent?.(entity.entityId);
      if (agentId) state.roomTrafficOwnership.set(entity.entityId, agentId);
    }
    const local = state.vehicles.find(vehicle => vehicle.id === entity.entityId && vehicle.ambientTraffic);
    if (local) {
      local.ambientTraffic = false;
      local.roomPublished = true;
      local.source = 'room-published-vehicle';
      local.driver = '';
      local.speed = 0;
    }
  }
  const existingIds = new Set(state.vehicles.filter(vehicle => !vehicle.roomPublished).map(vehicle => vehicle.id));
  const protectedPublished = state.vehicles.filter(vehicle => vehicle.roomPublished && protectedVehicle(vehicle));
  const localCount = state.vehicles.filter(vehicle => !vehicle.roomPublished && !vehicle.ambientTraffic).length;
  const capacity = Math.max(0, state.budget - localCount - protectedPublished.length);
  const protectedIds = new Set(protectedPublished.map(vehicle => vehicle.id));
  const desired = [...state.remoteEntities.values()]
    .filter(entity => !existingIds.has(entity.entityId) && !protectedIds.has(entity.entityId))
    .map(entity => ({ definition: publishedRoomVehicleDefinition(entity, state.driveOnLeft), entity }))
    .filter(entry => entry.definition)
    .map(entry => ({ ...entry, distance: Math.hypot(entry.definition.x - Number(reference.x || 0), entry.definition.z - Number(reference.z || 0)) }))
    .filter(entry => entry.distance <= 120)
    .sort((a, b) => a.distance - b.distance || (a.entity.entityId < b.entity.entityId ? -1 : a.entity.entityId > b.entity.entityId ? 1 : 0))
    .slice(0, capacity);
  const desiredIds = new Set([...protectedIds, ...desired.map(entry => entry.entity.entityId)]);
  for (const vehicle of state.vehicles.slice()) {
    if (!vehicle.roomPublished || desiredIds.has(vehicle.id) || protectedVehicle(vehicle)) continue;
    options.disposeVehicle(vehicle);
    state.vehicles.splice(state.vehicles.indexOf(vehicle), 1);
  }
  for (const { definition } of desired) {
    if (state.vehicles.some(vehicle => vehicle.id === definition.id)) continue;
    const vehicle = options.createVehicle(definition);
    if (vehicle) state.vehicles.push(vehicle);
  }
}
