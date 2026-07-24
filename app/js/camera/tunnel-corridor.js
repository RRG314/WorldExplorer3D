function projectToSegment(pointX, pointZ, start, end) {
  const dx = Number(end?.x) - Number(start?.x);
  const dz = Number(end?.z) - Number(start?.z);
  const lengthSq = dx * dx + dz * dz;
  if (!(lengthSq > 1e-8)) return null;
  const t = Math.max(0, Math.min(1, (
    (pointX - Number(start.x)) * dx +
    (pointZ - Number(start.z)) * dz
  ) / lengthSq));
  const x = Number(start.x) + dx * t;
  const z = Number(start.z) + dz * t;
  return {
    x,
    z,
    t,
    distanceSq: (pointX - x) ** 2 + (pointZ - z) ** 2
  };
}
function nearestRoadSegment(points, pointX, pointZ, startIndex = 0, endIndex = points.length - 2) {
  let best = null;
  const first = Math.max(0, Math.min(points.length - 2, startIndex));
  const last = Math.max(first, Math.min(points.length - 2, endIndex));
  for (let segmentIndex = first; segmentIndex <= last; segmentIndex += 1) {
    const projection = projectToSegment(pointX, pointZ, points[segmentIndex], points[segmentIndex + 1]);
    if (!projection || (best && projection.distanceSq >= best.distanceSq)) continue;
    best = { ...projection, segmentIndex };
  }
  return best;
}

export function constrainTunnelCameraXZ(road, desiredX, desiredZ, actorX, actorZ, options = {}) {
  const points = Array.isArray(road?.pts) ? road.pts : [];
  if (
    points.length < 2 ||
    ![desiredX, desiredZ, actorX, actorZ].every(Number.isFinite)
  ) {
    return { x: desiredX, z: desiredZ, applied: false, segmentIndex: -1, t: 0 };
  }

  const actorProjection = nearestRoadSegment(points, actorX, actorZ);
  if (!actorProjection) {
    return { x: desiredX, z: desiredZ, applied: false, segmentIndex: -1, t: 0 };
  }

  // Limit the search to the actor's local tunnel run. This prevents a camera
  // from jumping to the adjacent bore where long tunnel polylines double back.
  const segmentWindow = Math.max(2, Math.floor(Number(options.segmentWindow) || 28));
  const localProjection = nearestRoadSegment(
    points,
    desiredX,
    desiredZ,
    actorProjection.segmentIndex - segmentWindow,
    actorProjection.segmentIndex + segmentWindow
  );
  if (!localProjection) {
    return { x: desiredX, z: desiredZ, applied: false, segmentIndex: -1, t: 0 };
  }
  return {
    x: localProjection.x,
    z: localProjection.z,
    applied: true,
    segmentIndex: localProjection.segmentIndex,
    t: localProjection.t,
    correctionDistance: Math.sqrt(localProjection.distanceSq)
  };
}
