export function signedPolygonAreaXZ(pts) {
  if (!pts || pts.length < 3) return 0;
  let area = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    area += pts[j].x * pts[i].z - pts[i].x * pts[j].z;
  }
  return area * 0.5;
}

export function decimatePoints(pts, maxPoints, preserveClosedRing = false) {
  if (!pts || pts.length <= maxPoints) return pts;
  if (maxPoints < 3) return pts.slice(0, Math.max(2, maxPoints));

  const out = [];
  const end = preserveClosedRing ? pts.length - 1 : pts.length;
  const step = Math.max(1, Math.ceil((end - 1) / (maxPoints - 1)));
  for (let i = 0; i < end; i += step) out.push(pts[i]);
  if (out[out.length - 1] !== pts[end - 1]) out.push(pts[end - 1]);
  if (preserveClosedRing && pts.length > 2 && out[0] !== out[out.length - 1]) {
    out.push(out[0]);
  }
  return out;
}

export function isFiniteWorldPointXZ(point) {
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.z);
}

export function sanitizeWorldPathPoints(pts, options = {}) {
  if (!Array.isArray(pts) || pts.length < 2) return [];
  const maxDistanceFromOrigin = Number.isFinite(options.maxDistanceFromOrigin) ? Math.max(32, options.maxDistanceFromOrigin) : Infinity;
  const maxSegmentLength = Number.isFinite(options.maxSegmentLength) ? Math.max(12, options.maxSegmentLength) : Infinity;
  const cleaned = [];

  for (let i = 0; i < pts.length; i++) {
    const point = pts[i];
    if (!isFiniteWorldPointXZ(point)) continue;
    if (Math.hypot(point.x, point.z) > maxDistanceFromOrigin) continue;
    if (cleaned.length > 0) {
      const prev = cleaned[cleaned.length - 1];
      const segLen = Math.hypot(point.x - prev.x, point.z - prev.z);
      if (segLen <= 1e-4) continue;
      if (segLen > maxSegmentLength) {
        const steps = Math.ceil(segLen / maxSegmentLength);
        if (steps > 64) return [];
        for (let step = 1; step < steps; step++) {
          const t = step / steps;
          cleaned.push({
            x: prev.x + (point.x - prev.x) * t,
            z: prev.z + (point.z - prev.z) * t
          });
        }
      }
    }
    cleaned.push({ x: point.x, z: point.z });
  }

  return cleaned.length >= 2 ? cleaned : [];
}

export function sanitizeWorldFootprintPoints(pts, minArea = 8, options = {}) {
  if (!Array.isArray(pts) || pts.length < 3) return [];
  const maxDistanceFromOrigin = Number.isFinite(options.maxDistanceFromOrigin) ? Math.max(32, options.maxDistanceFromOrigin) : Infinity;
  const maxSegmentLength = Number.isFinite(options.maxSegmentLength) ? Math.max(12, options.maxSegmentLength) : Infinity;
  const maxSpan = Number.isFinite(options.maxSpan) ? Math.max(40, options.maxSpan) : Infinity;
  const maxArea = Number.isFinite(options.maxArea) ? Math.max(200, options.maxArea) : Infinity;
  const cleaned = [];

  for (let i = 0; i < pts.length; i++) {
    const point = pts[i];
    if (!isFiniteWorldPointXZ(point)) continue;
    if (Math.hypot(point.x, point.z) > maxDistanceFromOrigin) continue;
    if (cleaned.length > 0) {
      const prev = cleaned[cleaned.length - 1];
      const segLen = Math.hypot(point.x - prev.x, point.z - prev.z);
      if (segLen <= 1e-4) continue;
      if (segLen > maxSegmentLength) return [];
    }
    cleaned.push({ x: point.x, z: point.z });
  }

  if (cleaned.length >= 2) {
    const first = cleaned[0];
    const last = cleaned[cleaned.length - 1];
    const closeLen = Math.hypot(first.x - last.x, first.z - last.z);
    if (closeLen <= 1e-4) {
      cleaned.pop();
    } else if (closeLen > maxSegmentLength * 1.35) {
      return [];
    }
  }
  if (cleaned.length < 3) return [];

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < cleaned.length; i++) {
    const point = cleaned[i];
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.z < minZ) minZ = point.z;
    if (point.z > maxZ) maxZ = point.z;
  }
  if ((maxX - minX) > maxSpan || (maxZ - minZ) > maxSpan) return [];

  const area = Math.abs(signedPolygonAreaXZ(cleaned));
  if (area < minArea || area > maxArea) return [];
  return cleaned;
}

export function appendIndexedGeometry(targetVerts, targetIndices, verts, indices) {
  if (!Array.isArray(verts) || verts.length === 0) return;
  const baseVertex = targetVerts.length / 3;
  targetVerts.push(...verts);
  if (Array.isArray(indices) && indices.length > 0) {
    for (let i = 0; i < indices.length; i++) {
      targetIndices.push(indices[i] + baseVertex);
    }
  } else {
    const addedVerts = verts.length / 3;
    for (let i = 0; i < addedVerts; i++) {
      targetIndices.push(baseVertex + i);
    }
  }
}

function pointToSegmentDistanceXZ(x, z, p1, p2) {
  const dx = p2.x - p1.x;
  const dz = p2.z - p1.z;
  const len2 = dx * dx + dz * dz;
  if (len2 <= 1e-9) return Math.hypot(x - p1.x, z - p1.z);
  let t = ((x - p1.x) * dx + (z - p1.z) * dz) / len2;
  t = Math.max(0, Math.min(1, t));
  const px = p1.x + dx * t;
  const pz = p1.z + dz * t;
  return Math.hypot(x - px, z - pz);
}

export function distanceToPolygonEdgeXZ(x, z, pts) {
  if (!Array.isArray(pts) || pts.length < 2) return 0;
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const dist = pointToSegmentDistanceXZ(x, z, pts[i], pts[(i + 1) % pts.length]);
    if (dist < best) best = dist;
  }
  return Number.isFinite(best) ? best : 0;
}
