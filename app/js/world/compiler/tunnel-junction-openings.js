import { polylineDistances } from '../../structure-semantics/geometry.js?v=2';
import { sampleTransportSurfaceAtDistance } from './transport-surface-model.js?v=25';
import { canPublishTunnelGeometry } from './tunnel-envelope.js';

// Clip an existing wall to a graph-connected branch's clearance corridor.
// A planar crossing or another vertical layer never creates an opening.
function clipAxis(a, b, minimum, maximum, interval) {
  const delta = b - a;
  if (Math.abs(delta) < 1e-9) return a >= minimum && a <= maximum;
  const t0 = (minimum - a) / delta, t1 = (maximum - a) / delta;
  interval[0] = Math.max(interval[0], Math.min(t0, t1));
  interval[1] = Math.min(interval[1], Math.max(t0, t1));
  return interval[1] > interval[0];
}

export function compileTunnelWallOpenings(feature) {
  const model = feature?.tunnelSystemModel;
  if (!canPublishTunnelGeometry(feature) || !model?.shellRanges?.length) return Object.freeze([]);
  const points = feature.pts, path = polylineDistances(points);
  const halfWidth = Math.max(3.4, Number(feature.width) || 6) * 0.5 + 0.02;
  const intervals = [];
  for (const endpoint of ['start', 'end']) {
    const seen = new Set();
    for (const link of feature.connectedFeatures?.[endpoint] || []) {
      const other = link.feature;
      if (!other || other === feature || seen.has(other) || !canPublishTunnelGeometry(other) ||
          !other.tunnelSystemModel?.shellRanges?.length ||
          (Number(other.structureSemantics?.layer) || 0) !== (Number(feature.structureSemantics?.layer) || 0)) continue;
      seen.add(other);
      const otherPath = polylineDistances(other.pts);
      const branchHalfWidth = Math.max(3.4, Number(other.width) || 6) * 0.5 + 0.04;
      const reach = Math.min(path.total, Math.max(12, (halfWidth + branchHalfWidth) * 4));
      for (let i = 0; i < points.length - 1; i++) {
        const startDistance = path.distances[i], endDistance = path.distances[i + 1];
        if (endpoint === 'start' ? startDistance > reach : endDistance < path.total - reach) continue;
        const a = points[i], b = points[i + 1];
        const length = endDistance - startDistance;
        if (!(length > 1e-5)) continue;
        const nx = -(b.z - a.z) / length, nz = (b.x - a.x) / length;
        for (const side of [-1, 1]) {
          const ax = a.x + nx * halfWidth * side, az = a.z + nz * halfWidth * side;
          const bx = b.x + nx * halfWidth * side, bz = b.z + nz * halfWidth * side;
          for (let j = 0; j < other.pts.length - 1; j++) {
            const c = other.pts[j], d = other.pts[j + 1];
            const branchLength = otherPath.distances[j + 1] - otherPath.distances[j];
            if (!(branchLength > 1e-5)) continue;
            const tx = (d.x - c.x) / branchLength, tz = (d.z - c.z) / branchLength;
            const alongA = (ax - c.x) * tx + (az - c.z) * tz;
            const alongB = (bx - c.x) * tx + (bz - c.z) * tz;
            const acrossA = -(ax - c.x) * tz + (az - c.z) * tx;
            const acrossB = -(bx - c.x) * tz + (bz - c.z) * tx;
            const t = endpoint === 'start'
              ? [0, Math.min(1, (reach - startDistance) / length)]
              : [Math.max(0, (path.total - reach - startDistance) / length), 1];
            if (!clipAxis(alongA, alongB, 0, branchLength, t) ||
                !clipAxis(acrossA, acrossB, -branchHalfWidth, branchHalfWidth, t)) continue;
            const start = startDistance + t[0] * length, end = startDistance + t[1] * length;
            const mid = (start + end) * 0.5;
            const otherDistance = otherPath.distances[j] + alongA + (alongB - alongA) * (t[0] + t[1]) * 0.5;
            if (!other.tunnelSystemModel.shellRanges.some(r => otherDistance >= r.start - 0.1 && otherDistance <= r.end + 0.1)) continue;
            const y = sampleTransportSurfaceAtDistance(feature.transportSurfaceModel, mid, 0);
            const otherY = sampleTransportSurfaceAtDistance(other.transportSurfaceModel, otherDistance, 0);
            if (!Number.isFinite(y) || !Number.isFinite(otherY) || Math.abs(y - otherY) > 0.6) continue;
            if (end - start > 0.03) intervals.push({ side, start, end });
          }
        }
      }
    }
  }
  const merged = [];
  for (const side of [-1, 1]) {
    for (const next of intervals.filter(r => r.side === side).sort((a, b) => a.start - b.start)) {
      const last = merged[merged.length - 1];
      if (last?.side === side && next.start <= last.end + 0.04) last.end = Math.max(last.end, next.end);
      else merged.push({ ...next });
    }
  }
  return Object.freeze(merged.map(Object.freeze));
}

export function tunnelWallIsOpen(model, side, distance) {
  return (model?.wallOpenings || []).some(opening => opening.side === side &&
    distance > opening.start - 0.001 && distance < opening.end + 0.001);
}
