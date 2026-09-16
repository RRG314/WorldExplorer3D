// Refresh by physical motion and elapsed time, independently of location seeds
// and rendered frame rate. Reusing a query never spans a surface publication.
export function shouldRefreshRoadQuery(cached, { x, z, y, now, revision, force = false }) {
  if (!cached || force || revision !== cached.queryRevision) return true;
  const elapsed = now - cached.queryTime;
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed >= 50) return true;
  const movement = Math.hypot(x - cached.queryX, z - cached.queryZ);
  const transitionDistance = Math.min(cached.distanceToEndpoint, cached.distanceToTransitionZone);
  const movementLimit = Math.min(1, Math.max(0.05, transitionDistance * 0.25));
  if (!Number.isFinite(movement) || movement >= movementLimit) return true;
  return Number.isFinite(y) && Number.isFinite(cached.queryY) && Math.abs(y - cached.queryY) >= 0.25;
}
