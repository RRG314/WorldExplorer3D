function finiteNumber(value, fallback = NaN) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function distanceToPath(point, path) {
  let bestDistance = Infinity;
  for (let index = 0; index < path.length - 1; index += 1) {
    const start = path[index];
    const end = path[index + 1];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const lengthSquared = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(
      1,
      ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared
    ));
    const x = start.x + dx * t;
    const z = start.z + dz * t;
    bestDistance = Math.min(bestDistance, Math.hypot(point.x - x, point.z - z));
  }
  return bestDistance;
}

function normalizedVerticalControl(control) {
  const vertical = control?.vertical || {};
  const clearanceMeters = finiteNumber(vertical.clearanceMeters);
  if (
    vertical.kind !== 'minimum_clearance_above_mapped_water' ||
    !(clearanceMeters > 0) ||
    !String(vertical.sourceUrl || '').startsWith('https://')
  ) return null;
  return Object.freeze({
    id: String(control.id || ''),
    physicalSurfaceKind: String(control.physicalSurfaceKind || ''),
    kind: vertical.kind,
    clearanceMeters,
    referenceDatum: String(vertical.referenceDatum || ''),
    measurementStatus: String(vertical.measurementStatus || ''),
    sourceLabel: String(vertical.sourceLabel || ''),
    sourceUrl: String(vertical.sourceUrl || ''),
    authority: 'published_transport_surface_control'
  });
}

function roadMatchesControl(road, control, referencePath) {
  if (!road || !Array.isArray(road.pts) || road.pts.length < 2) return false;
  const match = control?.match || {};
  if (
    String(match.terrainMode || '') &&
    String(road?.structureSemantics?.terrainMode || '') !== String(match.terrainMode)
  ) return false;
  const mappedName = String(match.mappedName || '').trim().toLowerCase();
  if (mappedName && String(road.name || '').trim().toLowerCase() !== mappedName) return false;
  const maximumDistance = Math.max(
    1,
    finiteNumber(match.maximumDistanceFromReferencePathMeters, 30)
  );
  const matchingPoints = road.pts.filter((point) => distanceToPath(point, referencePath) <= maximumDistance).length;
  return matchingPoints >= Math.min(2, road.pts.length);
}

function applyPublishedTransportSurfaceControls({ controls = [], roads = [], referencePath = [] } = {}) {
  if (!Array.isArray(referencePath) || referencePath.length < 2) {
    return Object.freeze({ authority: 'published_transport_surface_control', appliedRoads: 0, controls: [] });
  }
  const applied = [];
  for (const control of controls) {
    const vertical = normalizedVerticalControl(control);
    if (!vertical) continue;
    for (const road of roads) {
      if (!roadMatchesControl(road, control, referencePath)) continue;
      road.transportSurfaceControl = vertical;
      applied.push(Object.freeze({
        controlId: vertical.id,
        sourceFeatureId: String(road.sourceFeatureId || ''),
        mappedName: String(road.name || ''),
        sourceUrl: vertical.sourceUrl
      }));
    }
  }
  return Object.freeze({
    authority: 'published_transport_surface_control',
    appliedRoads: applied.length,
    controls: Object.freeze(applied)
  });
}

export { applyPublishedTransportSurfaceControls };
