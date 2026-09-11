import { ctx as appCtx } from "../shared-context.js?v=55";

function createWalkingGeometryHelpers() {
  function pointInPolygonSafe(x, z, polygon) {
    if (!Array.isArray(polygon) || polygon.length < 3) return false;
    if (typeof appCtx.pointInPolygon === "function") {
      return appCtx.pointInPolygon(x, z, polygon) === true;
    }
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x;
      const zi = polygon[i].z;
      const xj = polygon[j].x;
      const zj = polygon[j].z;
      const intersect = zi > z !== zj > z && x < (xj - xi) * (z - zi) / (zj - zi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function pointToSegmentDistanceXZ(x, z, p1, p2) {
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const len2 = dx * dx + dz * dz;
    if (len2 <= 1e-9) {
      return { dist: Math.hypot(x - p1.x, z - p1.z), x: p1.x, z: p1.z };
    }
    let t = ((x - p1.x) * dx + (z - p1.z) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = p1.x + dx * t;
    const pz = p1.z + dz * t;
    return { dist: Math.hypot(x - px, z - pz), x: px, z: pz };
  }

  function clampPointInsideFootprint(x, z, footprint, margin = 0.28) {
    if (!Array.isArray(footprint) || footprint.length < 3) return { x, z };
    if (pointInPolygonSafe(x, z, footprint)) return { x, z };

    let best = null;
    for (let i = 0; i < footprint.length; i += 1) {
      const p1 = footprint[i];
      const p2 = footprint[(i + 1) % footprint.length];
      const hit = pointToSegmentDistanceXZ(x, z, p1, p2);
      if (!best || hit.dist < best.dist) best = hit;
    }
    if (!best) return { x, z };

    const cx = footprint.reduce((sum, point) => sum + point.x, 0) / footprint.length;
    const cz = footprint.reduce((sum, point) => sum + point.z, 0) / footprint.length;
    const inwardX = cx - best.x;
    const inwardZ = cz - best.z;
    const inwardLen = Math.hypot(inwardX, inwardZ) || 1;
    return {
      x: best.x + inwardX / inwardLen * margin,
      z: best.z + inwardZ / inwardLen * margin
    };
  }

  return {
    clampPointInsideFootprint,
    pointInPolygonSafe
  };
}

export { createWalkingGeometryHelpers };
