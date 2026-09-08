// Shared by the review viewer and both in-world representation renderers.
// Placement is relative to the canonical building/interior origin, never the
// model's bounding-box center. This does not solve registration from photos.
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

// Wall regions are normalized ground-to-eaves, not absolute reconstruction
// heights. The existing renderer owns the actual foundation and roof split.
export function photoWallVerticalScale(building, savedHeight) {
  if (!(Number.isFinite(savedHeight) && savedHeight > 0)) return 1;
  const body = building?.bodyHeightMeters;
  const fallback = Number(building?.maxY) - Number(building?.minY) - Math.max(0, finite(building?.roofHeight));
  const height = Number.isFinite(body) && body > 0 ? body : fallback;
  return Number.isFinite(height) && height > 0 ? height / savedHeight : 1;
}

export function applyCaptureAlignment(root, alignment = {}, origin = {}) {
  const offset = alignment.positionOffset || {};
  root.position.set(finite(origin.x) + finite(offset.x), finite(origin.y) + finite(offset.y), finite(origin.z) + finite(offset.z));
  root.rotation.y = finite(alignment.rotationYDegrees) * Math.PI / 180;
  root.scale.setScalar(Math.max(0.05, Math.min(20, finite(alignment.scale, 1))));
  root.updateMatrixWorld?.(true);
}

export function captureBuildingContext(building, entrance) {
  const points = Array.isArray(building?.pts) ? building.pts : [];
  if (points.length < 3 || points.length > 256 || points.some(p => !Number.isFinite(p?.x) || !Number.isFinite(p?.z))) return null;
  const center = { x: finite(building.centerX, points.reduce((s, p) => s + p.x, 0) / points.length),
    z: finite(building.centerZ, points.reduce((s, p) => s + p.z, 0) / points.length) };
  const height = building.buildingProvenance?.fields?.heightMeters;
  return {
    schemaVersion: 1, frame: 'building-local-x-east-y-up-z-south',
    footprint: points.map(p => ({ x: p.x - center.x, z: p.z - center.z })),
    height: height && Number.isFinite(Number(height.value)) ? { meters: Number(height.value), evidence: height.status } : null,
    wallHeightMeters: Number.isFinite(building.bodyHeightMeters) ? building.bodyHeightMeters : null,
    entrance: entrance && Number.isFinite(entrance.x) && Number.isFinite(entrance.z)
      ? { x: entrance.x - center.x, z: entrance.z - center.z } : null,
    // A client snapshot aids review; it cannot authorize changes to mapped data.
    authority: 'client-snapshot-of-existing-building'
  };
}
