import {polylineDistances} from '../../structure-semantics/geometry.js?v=2';
import {tunnelClearance, TUNNEL_ROOF_THICKNESS, MINIMUM_TUNNEL_ROOF_COVER} from './tunnel-envelope.js';

// Clip an actual foundation footprint into the tunnel's roof corridor. Keep
// the resulting longitudinal interval, not the source building or a callback
// into a retired world. This is compiled once before vertical reconciliation.
function clip(points, axis, bound, direction) {
  const result = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const insideA = direction * (a[axis] - bound) >= 0;
    const insideB = direction * (b[axis] - bound) >= 0;
    if (insideA) result.push(a);
    if (insideA !== insideB) {
      const t = (bound - a[axis]) / (b[axis] - a[axis]);
      result.push({x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t});
    }
  }
  return result;
}

export function compileTunnelObstructionLimits(feature, nearbyBuildings) {
  if (feature?.structureSemantics?.terrainMode !== 'subgrade' ||
      feature?.transportRecord?.routeState !== 'complete' ||
      typeof nearbyBuildings !== 'function') return Object.freeze([]);
  const pts = feature.pts || [], path = polylineDistances(pts), limits = [];
  const halfWidth = Math.max(3.4, Number(feature.width) || 6) * .5 + .95;
  const height = tunnelClearance(feature.structureSemantics) + TUNNEL_ROOF_THICKNESS + MINIMUM_TUNNEL_ROOF_COVER;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], length = Math.hypot(b.x - a.x, b.z - a.z);
    if (!(length > 1e-5)) continue;
    const tx = (b.x - a.x) / length, tz = (b.z - a.z) / length;
    for (const building of nearbyBuildings((a.x + b.x) * .5, (a.z + b.z) * .5, length * .5 + halfWidth)) {
      if (!building || building.collisionDisabled || building.geometrySource === 'compiled_transport_structures' ||
          !Number.isFinite(building.minY) || !Array.isArray(building.pts) || building.pts.length < 3) continue;
      let polygon = building.pts.map(p => ({x: (p.x - a.x) * tx + (p.z - a.z) * tz, z: -(p.x - a.x) * tz + (p.z - a.z) * tx}));
      for (const [axis, bound, direction] of [['x', 0, 1], ['x', length, -1], ['z', -halfWidth, 1], ['z', halfWidth, -1]]) {
        polygon = clip(polygon, axis, bound, direction);
        if (!polygon.length) break;
      }
      if (!polygon.length) continue;
      const start = path.distances[i - 1] + Math.min(...polygon.map(p => p.x));
      const end = path.distances[i - 1] + Math.max(...polygon.map(p => p.x));
      if (end - start > 1e-5) limits.push(Object.freeze({start, end, maximumSurfaceY: building.minY - height}));
    }
  }
  return Object.freeze(limits);
}

export function tunnelObstructionMaximumY(limits, distance) {
  let ceiling = Infinity;
  for (const limit of limits || []) {
    if (distance >= limit.start - 1e-5 && distance <= limit.end + 1e-5) ceiling = Math.min(ceiling, limit.maximumSurfaceY);
  }
  return ceiling;
}
