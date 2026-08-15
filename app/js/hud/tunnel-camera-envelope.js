import { polylineDistances } from '../structure-semantics/geometry.js?v=1';
import { sampleTransportSurfaceAtDistance } from '../world/compiler/transport-surface-model.js?v=15';

function projectToFeature(feature, x, z) {
  const points = feature?.pts;
  if (!Array.isArray(points) || points.length < 2) return null;
  const path = polylineDistances(points);
  let best = null;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const lengthSquared = dx * dx + dz * dz;
    if (!(lengthSquared > 1e-8)) continue;
    const t = Math.max(0, Math.min(1, ((x - start.x) * dx + (z - start.z) * dz) / lengthSquared));
    const projectedX = start.x + dx * t;
    const projectedZ = start.z + dz * t;
    const lateralDistance = Math.hypot(x - projectedX, z - projectedZ);
    if (best && lateralDistance >= best.lateralDistance) continue;
    best = {
      distance: Number(path.distances[index]) + Math.sqrt(lengthSquared) * t,
      lateralDistance,
      x: projectedX,
      z: projectedZ
    };
  }
  return best;
}

function distanceInRanges(distance, ranges = [], padding = 0) {
  return ranges.some((range) =>
    distance >= Number(range?.start) - padding &&
    distance <= Number(range?.end) + padding
  );
}

export function resolveTunnelCameraEnvelope(feature, x, z) {
  if (!feature || !Number.isFinite(Number(x)) || !Number.isFinite(Number(z))) {
    return Object.freeze({ inside: false, reason: 'invalid_input' });
  }
  const projection = projectToFeature(feature, Number(x), Number(z));
  if (!projection) return Object.freeze({ inside: false, reason: 'no_projection' });
  const width = Math.max(2.5, Number(feature?.width) || 6);
  if (projection.lateralDistance > width * 0.5 + 1.2) {
    return Object.freeze({ inside: false, reason: 'outside_cross_section' });
  }

  const tunnel = feature?.tunnelSystemModel || null;
  const shellRanges = Array.isArray(tunnel?.shellRanges) ? tunnel.shellRanges : [];
  const portalZones = Array.isArray(tunnel?.portalZones) ? tunnel.portalZones : [];
  const shellInside = distanceInRanges(projection.distance, shellRanges, 0.12);
  const portalZone = portalZones.find((zone) =>
    projection.distance >= Number(zone?.approachStart) - 0.12 &&
    projection.distance <= Number(zone?.approachEnd) + 0.12
  ) || null;
  const inside = shellInside || portalZone !== null;
  if (!inside) {
    return Object.freeze({
      inside: false,
      reason: shellRanges.length > 0 ? 'outside_shell_interval' : 'no_compiled_shell',
      distance: projection.distance
    });
  }

  const floorY = sampleTransportSurfaceAtDistance(
    feature?.transportSurfaceModel,
    projection.distance,
    0
  );
  if (!Number.isFinite(floorY)) {
    return Object.freeze({ inside: false, reason: 'missing_compiled_floor' });
  }
  const clearance = Math.max(
    2.8,
    Number(tunnel?.clearance) ||
    Number(feature?.transportStructureRef?.specification?.tunnelClearance) ||
    4.2
  );
  const ceilingY = floorY + clearance;
  return Object.freeze({
    inside: true,
    reason: shellInside ? 'compiled_shell_interval' : 'compiled_portal_transition',
    shellInside,
    portalTransition: portalZone !== null && !shellInside,
    distance: projection.distance,
    floorY,
    ceilingY,
    clearance,
    chaseDistance: Math.max(4.2, Math.min(6.5, clearance * 1.4)),
    cameraHeight: Math.max(1.7, Math.min(2.35, clearance - 0.7)),
    lookHeight: Math.max(0.55, Math.min(0.9, clearance * 0.2))
  });
}
