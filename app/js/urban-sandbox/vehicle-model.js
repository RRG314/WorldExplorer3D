const URBAN_VEHICLE_CATALOG = Object.freeze([
  Object.freeze({ id: 'sedan', label: 'Aster four-door', bodyStyle: 'sedan', width: 1.8, height: 1.46, length: 4.48, wheelRadius: 0.36, color: 0x315f79 }),
  Object.freeze({ id: 'crossover', label: 'Trailmark crossover', bodyStyle: 'crossover', width: 1.9, height: 1.7, length: 4.66, wheelRadius: 0.4, color: 0x7a5141 }),
  Object.freeze({ id: 'pickup', label: 'Harbor utility pickup', bodyStyle: 'pickup', width: 1.94, height: 1.7, length: 5.08, wheelRadius: 0.42, color: 0x596a48 }),
  Object.freeze({ id: 'compact', label: 'Metro compact', bodyStyle: 'compact', width: 1.7, height: 1.48, length: 3.82, wheelRadius: 0.34, color: 0x8a3f45 })
]);

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
  )).sort((a, b) => a.distance - b.distance || a.edgeIndex - b.edgeIndex);

  const selected = [];
  for (const candidate of candidates) {
    if (selected.length >= count) break;
    const yaw = edgeYaw(candidate.edge);
    const definition = stableVehicleDefinition(worldIdentity, candidate.edgeIndex, selected.length);
    const side = ((hashText(definition.id) & 1) === 0 ? -1 : 1) * (driveOnLeft ? -1 : 1);
    const lateralOffset = Math.min(2.6, Math.max(1.25, Number(candidate.edge?.width || 5.4) * 0.34));
    const x = candidate.x + Math.cos(yaw) * lateralOffset * side;
    const z = candidate.z - Math.sin(yaw) * lateralOffset * side;
    if (selected.some((anchor) => Math.hypot(anchor.x - x, anchor.z - z) < 8)) continue;
    if (options.isBlocked?.(x, candidate.y, z, definition.variant) === true) continue;
    selected.push(Object.freeze({
      ...definition,
      edgeIndex: candidate.edgeIndex,
      x,
      y: candidate.y + 1.2,
      z,
      yaw,
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
