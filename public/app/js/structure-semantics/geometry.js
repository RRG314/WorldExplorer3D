function smoothstep01(value) {
  const t = Math.max(0, Math.min(1, Number(value) || 0));
  return t * t * (3 - 2 * t);
}

function polylineDistances(points = []) {
  const distances = new Float32Array(points.length);
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
    distances[i] = total;
  }
  return { distances, total };
}

function sampleProfileAtDistance(distances, values, distance) {
  if (!(distances instanceof Float32Array) || !Array.isArray(values) && !(values instanceof Float32Array)) return NaN;
  if (distances.length === 0 || values.length === 0) return NaN;
  if (distance <= 0) return Number(values[0]) || NaN;
  const lastIndex = Math.min(distances.length, values.length) - 1;
  if (distance >= distances[lastIndex]) return Number(values[lastIndex]) || NaN;

  for (let i = 0; i < lastIndex; i++) {
    const start = distances[i];
    const end = distances[i + 1];
    if (distance < start || distance > end) continue;
    const span = end - start;
    const t = span > 1e-6 ? (distance - start) / span : 0;
    const from = Number(values[i]) || 0;
    const to = Number(values[i + 1]) || from;
    return from + (to - from) * t;
  }
  return Number(values[lastIndex]) || NaN;
}

function segmentIntersection2D(a1, a2, b1, b2) {
  const x1 = a1.x;
  const z1 = a1.z;
  const x2 = a2.x;
  const z2 = a2.z;
  const x3 = b1.x;
  const z3 = b1.z;
  const x4 = b2.x;
  const z4 = b2.z;
  const denom = (x1 - x2) * (z3 - z4) - (z1 - z2) * (x3 - x4);
  if (Math.abs(denom) < 1e-7) return null;

  const t = ((x1 - x3) * (z3 - z4) - (z1 - z3) * (x3 - x4)) / denom;
  const u = ((x1 - x3) * (z1 - z2) - (z1 - z3) * (x1 - x2)) / denom;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;

  return {
    x: x1 + (x2 - x1) * t,
    z: z1 + (z2 - z1) * t,
    t,
    u
  };
}

function polylineBounds(points = [], padding = 0) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) continue;
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) return null;
  const pad = Math.max(0, Number(padding) || 0);
  return {
    minX: minX - pad,
    maxX: maxX + pad,
    minZ: minZ - pad,
    maxZ: maxZ + pad
  };
}

function boundsIntersect(a, b, padding = 0) {
  if (!a || !b) return false;
  const pad = Math.max(0, Number(padding) || 0);
  return !(
    a.maxX < b.minX - pad ||
    a.minX > b.maxX + pad ||
    a.maxZ < b.minZ - pad ||
    a.minZ > b.maxZ + pad
  );
}

function pointInPolygonXZ(x, z, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const zi = polygon[i].z;
    const xj = polygon[j].x;
    const zj = polygon[j].z;
    const intersects = (zi > z) !== (zj > z) &&
      x < (xj - xi) * (z - zi) / ((zj - zi) || 1e-9) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}


export { boundsIntersect, pointInPolygonXZ, polylineBounds, polylineDistances, sampleProfileAtDistance, segmentIntersection2D, smoothstep01 };
