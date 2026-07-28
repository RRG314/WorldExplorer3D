function cross(origin, a, b) {
  return (a.x - origin.x) * (b.z - origin.z) -
    (a.z - origin.z) * (b.x - origin.x);
}

function convexHull(points = []) {
  const unique = [];
  const seen = new Set();
  for (const point of points) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) continue;
    const key = `${Math.round(point.x * 1000)},${Math.round(point.z * 1000)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ x: point.x, z: point.z });
  }
  if (unique.length < 3) return unique;
  unique.sort((left, right) => left.x - right.x || left.z - right.z);
  const lower = [];
  for (const point of unique) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }
  const upper = [];
  for (let index = unique.length - 1; index >= 0; index -= 1) {
    const point = unique[index];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function polygonArea(points = []) {
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length];
    twiceArea += points[index].x * next.z - next.x * points[index].z;
  }
  return Math.abs(twiceArea) * 0.5;
}

function compileIntersectionTopologyGeometry(intersection, roads = [], options = {}) {
  const branches = Array.isArray(intersection?.roads) ? intersection.roads : [];
  if (branches.length < 3 || intersection?.hasGradeSeparatedRoad) {
    return { verts: [], indices: [], polygon: [], area: 0 };
  }
  const centerX = Number(intersection.x);
  const centerZ = Number(intersection.z);
  if (!Number.isFinite(centerX) || !Number.isFinite(centerZ)) {
    return { verts: [], indices: [], polygon: [], area: 0 };
  }

  const computeRadius = typeof options.computeRadius === 'function'
    ? options.computeRadius
    : () => Math.max(2, Number(intersection.maxWidth || 8) * 0.28);
  const reach = Math.max(1.8, Number(computeRadius(intersection)) || 0);
  const candidates = [];
  for (const branch of branches) {
    const dx = Number(branch?.dir?.x);
    const dz = Number(branch?.dir?.z);
    const directionLength = Math.hypot(dx, dz);
    if (!(directionLength > 1e-6)) continue;
    const dirX = dx / directionLength;
    const dirZ = dz / directionLength;
    const normalX = -dirZ;
    const normalZ = dirX;
    const halfWidth = Math.max(1.5, Number(branch.width || intersection.maxWidth || 8) * 0.5);
    const branchReach = Math.max(reach, halfWidth * 0.62);
    candidates.push(
      {
        x: centerX + dirX * branchReach + normalX * halfWidth,
        z: centerZ + dirZ * branchReach + normalZ * halfWidth
      },
      {
        x: centerX + dirX * branchReach - normalX * halfWidth,
        z: centerZ + dirZ * branchReach - normalZ * halfWidth
      }
    );
  }

  const polygon = convexHull(candidates);
  if (polygon.length < 3) return { verts: [], indices: [], polygon: [], area: 0 };

  const projectPointToFeature = options.projectPointToFeature;
  const sampleFeatureSurfaceY = options.sampleFeatureSurfaceY;
  const sampleGroundY = typeof options.sampleGroundY === 'function' ? options.sampleGroundY : () => 0;
  const surfaceBias = Number.isFinite(options.surfaceBias) ? Number(options.surfaceBias) : 0.08;
  const roadIndexes = [...new Set(branches.map((branch) => Number(branch.roadIdx)).filter(Number.isInteger))];
  const surfaceYAt = (x, z) => {
    let nearest = null;
    if (typeof projectPointToFeature === 'function' && typeof sampleFeatureSurfaceY === 'function') {
      for (const roadIndex of roadIndexes) {
        const road = roads[roadIndex];
        if (!road) continue;
        const projected = projectPointToFeature(road, x, z);
        if (!projected || !Number.isFinite(projected.dist)) continue;
        const y = sampleFeatureSurfaceY(road, x, z, projected);
        if (!Number.isFinite(y)) continue;
        if (!nearest || projected.dist < nearest.dist) nearest = { dist: projected.dist, y };
      }
    }
    if (nearest) return nearest.y;
    const groundY = Number(sampleGroundY(x, z));
    return (Number.isFinite(groundY) ? groundY : 0) + surfaceBias;
  };

  const centerY = surfaceYAt(centerX, centerZ);
  const verts = [centerX, centerY, centerZ];
  for (const point of polygon) {
    verts.push(point.x, surfaceYAt(point.x, point.z), point.z);
  }
  const indices = [];
  for (let index = 0; index < polygon.length; index += 1) {
    indices.push(0, index + 1, (index + 1) % polygon.length + 1);
  }
  return {
    verts,
    indices,
    polygon,
    area: polygonArea(polygon),
    branchCount: branches.length
  };
}

export {
  compileIntersectionTopologyGeometry,
  convexHull,
  polygonArea
};
