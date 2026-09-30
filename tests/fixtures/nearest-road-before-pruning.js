// Reference selector preserved from 3720ff18 for differential behavior checks.
export function evaluateNearestRoadCandidate(road, x, z, targetY, maxVerticalDelta, preferredRoad, runtime, isNumericProfileArray) {
  const pts = Array.isArray(road?.pts) ? road.pts : null;
  if (!pts || pts.length < 2) return null;
  const semantics = road?.structureSemantics || null;
  const profileDistances = isNumericProfileArray(road?.surfaceDistances) ? road.surfaceDistances : null;
  const transitionAnchors = Array.isArray(road?.structureTransitionAnchors) ? road.structureTransitionAnchors : [];
  let totalDistance = Number.isFinite(profileDistances?.[profileDistances.length - 1]) ? Number(profileDistances[profileDistances.length - 1]) : NaN;
  if (!Number.isFinite(totalDistance) || totalDistance <= 0) {
    totalDistance = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      totalDistance += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].z - pts[i].z);
    }
  }
  let best = null;
  let cumulativeDistance = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const len2 = dx * dx + dz * dz;
    if (len2 === 0) continue;
    const segLen = Math.sqrt(len2);
    let t = ((x - p1.x) * dx + (z - p1.z) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const nx = p1.x + t * dx;
    const nz = p1.z + t * dz;
    const d = Math.hypot(x - nx, z - nz);
    const projected = { x: nx, z: nz, dist: d, segIndex: i, t };
    const roadY = runtime.sampleFeatureSurfaceY(road, x, z, projected);
    const verticalDelta = Number.isFinite(targetY) && Number.isFinite(roadY) ? Math.abs(roadY - targetY) : 0;
    const distanceAlong =
      profileDistances && profileDistances.length > i ?
        Number(profileDistances[i]) + segLen * t :
        cumulativeDistance + segLen * t;
    const distanceToEndpoint = Math.min(distanceAlong, Math.max(0, totalDistance - distanceAlong));
    let distanceToTransitionZone = Infinity;
    for (let j = 0; j < transitionAnchors.length; j++) {
      const anchor = transitionAnchors[j];
      const anchorDistance = Number(anchor?.distance);
      if (!Number.isFinite(anchorDistance)) continue;
      const span = Math.max(0, Number(anchor?.span) || 0);
      const zoneDistance = Math.max(0, Math.abs(distanceAlong - anchorDistance) - span);
      if (zoneDistance < distanceToTransitionZone) distanceToTransitionZone = zoneDistance;
    }
    if (verticalDelta > maxVerticalDelta) {
      cumulativeDistance += segLen;
      continue;
    }
    let verticalWeight =
      semantics?.terrainMode === 'elevated' ? 0.82 :
      semantics?.terrainMode === 'subgrade' ? 0.72 :
      0.38;
    let weightedDist = d + (Number.isFinite(targetY) && Number.isFinite(roadY) ? verticalDelta * verticalWeight : 0);
    if (preferredRoad) {
      const sameRoad = road === preferredRoad;
      const connectedRoad = !sameRoad && (
        Array.isArray(preferredRoad?.connectedFeatures?.start) && preferredRoad.connectedFeatures.start.some((entry) => entry?.feature === road) ||
        Array.isArray(preferredRoad?.connectedFeatures?.end) && preferredRoad.connectedFeatures.end.some((entry) => entry?.feature === road)
      );
      if (sameRoad) {
        weightedDist = d + verticalDelta * 0.12;
      } else if (connectedRoad) {
        weightedDist = d + verticalDelta * 0.2;
      }
      if (sameRoad) weightedDist -= 3.4;
      else if (connectedRoad) weightedDist -= 2.25;
      if ((sameRoad || connectedRoad) && (t < 0.08 || t > 0.92)) weightedDist -= 0.55;
    }
    const continuityAccess =
      !!preferredRoad && (
        road === preferredRoad ||
        runtime.areRoadsConnected(preferredRoad, road)
      );
    if (semantics?.gradeSeparated && !continuityAccess && Number.isFinite(verticalDelta)) {
      const directLockThreshold = semantics.terrainMode === 'elevated' ? 1.25 : 1.35;
      const transitionLockThreshold = semantics.terrainMode === 'elevated' ? 1.65 : 1.85;
      const nearTransition = Number.isFinite(distanceToTransitionZone) && distanceToTransitionZone <= 1.2;
      const attachable =
        verticalDelta <= directLockThreshold ||
        (nearTransition && verticalDelta <= transitionLockThreshold);
      if (!attachable) {
        weightedDist += 5.5 + Math.min(10, verticalDelta * 1.8);
      }
    }
    if (!best || weightedDist < best.weightedDist) {
      best = {
        road,
        dist: d,
        pt: { x: nx, z: nz },
        y: roadY,
        segIndex: i,
        t,
        verticalDelta,
        weightedDist,
        distanceAlong,
        distanceToEndpoint,
        distanceToTransitionZone
      };
    }
    cumulativeDistance += segLen;
  }
  return best;
}

