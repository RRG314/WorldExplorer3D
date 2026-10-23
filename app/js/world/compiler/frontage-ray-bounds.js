// Conservative rejection only. The caller's original ray/segment predicate
// still resolves visibility, endpoint tolerances and facade eligibility.
export function frontageRayMayReach(point, nx, nz, distance, a, b) {
  if (!Number.isFinite(distance) || distance < 0) return true;
  const endX = point.x + nx * distance, endZ = point.z + nz * distance;
  const padX = 1e-7 * (Math.abs(b.x - a.x) + Math.abs(nx)) +
    8 * Number.EPSILON * (Math.abs(point.x) + Math.abs(a.x) + Math.abs(b.x) + Math.abs(endX));
  const padZ = 1e-7 * (Math.abs(b.z - a.z) + Math.abs(nz)) +
    8 * Number.EPSILON * (Math.abs(point.z) + Math.abs(a.z) + Math.abs(b.z) + Math.abs(endZ));
  return !(Math.max(a.x, b.x) < Math.min(point.x, endX) - padX ||
    Math.min(a.x, b.x) > Math.max(point.x, endX) + padX ||
    Math.max(a.z, b.z) < Math.min(point.z, endZ) - padZ ||
    Math.min(a.z, b.z) > Math.max(point.z, endZ) + padZ);
}
