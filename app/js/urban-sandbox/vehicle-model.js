import { PARKED_VEHICLE_CATALOG, VEHICLE_ROOT_TO_GROUND_METERS } from '../engine/vehicle-catalog.js?v=1';
import { directedSurfacePitch } from '../engine/vehicle-road-attitude.js?v=1';

// Compatibility export only. Parked and traffic vehicles now share one data owner.
const URBAN_VEHICLE_CATALOG = PARKED_VEHICLE_CATALOG;

function hashText(value = '') {
  let hash = 2166136261;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableVehicleDefinition(worldIdentity, edgeIndex, slot = 0) {
  const seed = hashText(`${worldIdentity}:${edgeIndex}:${slot}`);
  const variant = URBAN_VEHICLE_CATALOG[seed % URBAN_VEHICLE_CATALOG.length];
  const palette = [variant.color, 0x2f3d4a, 0x9b9a8d, 0x6f3e39, 0x426255, 0x6b587b];
  return Object.freeze({
    id: `urban-vehicle:${hashText(`${worldIdentity}:${edgeIndex}:${slot}:vehicle`).toString(16)}`,
    variant,
    color: palette[(seed >>> 5) % palette.length],
    condition: 1,
    source: 'deterministic-parked-vehicle'
  });
}

function edgeYaw(edge) {
  return Math.atan2(Number(edge?.p2?.x || 0) - Number(edge?.p1?.x || 0), Number(edge?.p2?.z || 0) - Number(edge?.p1?.z || 0));
}

function parkedVehicleAnchors(graph, reference = {}, options = {}) {
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  const count = Math.max(1, Math.min(6, Number(options.count) || 3));
  const minDistance = Math.max(8, Number(options.minDistance) || 14);
  const maxDistance = Math.max(minDistance + 10, Number(options.maxDistance) || 72);
  const worldIdentity = String(options.worldIdentity || 'world');
  const driveOnLeft = options.driveOnLeft === true;
  const candidates = edges.map((edge, edgeIndex) => {
    const x = (Number(edge?.p1?.x) + Number(edge?.p2?.x)) * 0.5;
    const y = (Number(edge?.p1?.y) + Number(edge?.p2?.y)) * 0.5;
    const z = (Number(edge?.p1?.z) + Number(edge?.p2?.z)) * 0.5;
    const distance = Math.hypot(x - Number(reference.x || 0), z - Number(reference.z || 0));
    return { edge, edgeIndex, x, y, z, distance };
  }).filter(({ edge, distance, x, y, z }) => (
    [x, y, z, distance].every(Number.isFinite) &&
    distance >= minDistance && distance <= maxDistance &&
    Number(edge?.length || 0) >= 12 &&
    !/motorway|trunk/i.test(String(edge?.roadClass || ''))
  )).sort((a, b) => {
    const parkingPriority = (entry) => /residential|living_street|service|unclassified/i.test(String(entry.edge?.roadClass || '')) ? 0 : 1;
    return parkingPriority(a) - parkingPriority(b) || a.distance - b.distance || a.edgeIndex - b.edgeIndex;
  });

  const selected = [];
  for (const candidate of candidates) {
    if (selected.length >= count) break;
    const yaw = edgeYaw(candidate.edge);
    const definition = stableVehicleDefinition(worldIdentity, candidate.edgeIndex, selected.length);
    // Traffic graph positions are lane centers, not road centerlines. Move to
    // the curb on the lane's outside only; choosing a random side can put a
    // parked vehicle back in the opposing or through lane.
    const roadHalfWidth = Math.max(2.4, Number(candidate.edge?.roadWidth || 5.4) * .5);
    const laneOffset = Math.max(0, Number(candidate.edge?.laneOffset || 0));
    const vehicleHalfWidth = Number(definition.variant.width || 1.8) * .5;
    const curbMargin = .18;
    const curbSpace = roadHalfWidth - laneOffset;
    // A road without a full vehicle-width curb zone is not a valid parking
    // source. Skipping it is preferable to fabricating a car in a travel lane.
    if (curbSpace < vehicleHalfWidth * 2 + curbMargin) continue;
    const lateralOffset = Math.max(0, roadHalfWidth - vehicleHalfWidth - curbMargin - laneOffset);
    const curbNormalX = Number(candidate.edge?.curbNormalX);
    const curbNormalZ = Number(candidate.edge?.curbNormalZ);
    if (![curbNormalX, curbNormalZ].every(Number.isFinite) || Math.hypot(curbNormalX, curbNormalZ) < .9) continue;
    const x = candidate.x + curbNormalX * lateralOffset;
    const z = candidate.z + curbNormalZ * lateralOffset;
    if (selected.some((anchor) => Math.hypot(anchor.x - x, anchor.z - z) < 8)) continue;
    if (options.isBlocked?.(x, candidate.y, z, definition.variant) === true) continue;
    selected.push(Object.freeze({
      ...definition,
      edgeIndex: candidate.edgeIndex,
      x,
      y: candidate.y + VEHICLE_ROOT_TO_GROUND_METERS,
      z,
      yaw,
      pitch: Number.isFinite(Number(candidate.edge?.surfacePitch))
        ? Number(candidate.edge.surfacePitch)
        : directedSurfacePitch(candidate.edge?.p1, candidate.edge?.p2),
      roadHalfWidth,
      laneOffset,
      curbOffset: laneOffset + lateralOffset,
      curbNormalX,
      curbNormalZ,
      driverSide: driveOnLeft ? 1 : -1
    }));
  }
  return Object.freeze(selected);
}

function vehicleDoorPosition(vehicle, side = vehicle?.driverSide || -1, longitudinal = 0.18) {
  const yaw = Number(vehicle?.yaw || 0);
  const width = Number(vehicle?.variant?.width || 1.8);
  const x = Number(vehicle?.x || 0) + Math.cos(yaw) * side * (width * 0.54) + Math.sin(yaw) * longitudinal;
  const z = Number(vehicle?.z || 0) - Math.sin(yaw) * side * (width * 0.54) + Math.cos(yaw) * longitudinal;
  return Object.freeze({ x, z, yaw });
}

function vehicleExitCandidates(vehicle) {
  const clearance = Number(vehicle?.variant?.width || 1.8) * 0.5 + 0.9;
  const yaw = Number(vehicle?.yaw || 0);
  const preferredSide = Number(vehicle?.driverSide || -1) < 0 ? -1 : 1;
  return Object.freeze([preferredSide, -preferredSide].map((side) => Object.freeze({
    side,
    x: Number(vehicle?.x || 0) + Math.cos(yaw) * side * clearance,
    z: Number(vehicle?.z || 0) - Math.sin(yaw) * side * clearance,
    yaw
  })));
}

export {
  URBAN_VEHICLE_CATALOG,
  edgeYaw,
  hashText,
  parkedVehicleAnchors,
  stableVehicleDefinition,
  vehicleDoorPosition,
  vehicleExitCandidates
};
