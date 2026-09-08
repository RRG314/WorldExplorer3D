import { polylineDistances } from '../../structure-semantics/geometry.js?v=2';
import { sampleTransportSurfaceAtDistance } from './transport-surface-model.js?v=25';
import { tunnelCeilingHeight } from './tunnel-envelope.js';
import { queryTunnelSolid } from './tunnel-solid-model.js';

const pathCache = new WeakMap();

function projectToFeature(feature, x, z) {
  const points = feature?.pts;
  if (!Array.isArray(points) || points.length < 2) return null;
  let cached = pathCache.get(feature);
  if (!cached || cached.points !== points || cached.model !== feature.transportSurfaceModel) {
    cached = { points, model: feature.transportSurfaceModel, path: polylineDistances(points) };
    pathCache.set(feature, cached);
  }
  const path = cached.path;
  let best = null;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const lengthSquared = dx * dx + dz * dz;
    if (!(lengthSquared > 1e-8)) continue;
    const rawT = ((x - start.x) * dx + (z - start.z) * dz) / lengthSquared;
    const t = Math.max(0, Math.min(1, rawT));
    const projectedX = start.x + dx * t;
    const projectedZ = start.z + dz * t;
    const lateralDistance = Math.hypot(x - projectedX, z - projectedZ);
    if (best && lateralDistance >= best.lateralDistance) continue;
    best = {
      distance: Number(path.distances[index]) + Math.sqrt(lengthSquared) * t,
      lateralDistance,
      pastEndpoint: (index === 0 && rawT < -0.001) || (index === points.length - 2 && rawT > 1.001),
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

export function resolveTunnelSpace(feature, x, z, y = NaN) {
  if (!feature || !Number.isFinite(Number(x)) || !Number.isFinite(Number(z))) {
    return Object.freeze({ inside: false, reason: 'invalid_input' });
  }
  const solid = feature.tunnelSolidBoundary;
  if (solid) {
    const space = queryTunnelSolid(solid, x, z, y);
    if (space.inside) {
      const clearance = space.ceilingY - space.floorY;
      return { ...space, reason: 'compiled_tunnel_solid', shellInside: true,
        solidBoundary: true, portalTransition: false, clearance,
        lateralDistance: 0, halfWidth: Infinity,
        chaseDistance: Math.max(4.2, Math.min(6.5, clearance * 1.4)),
        cameraHeight: Math.max(1.7, Math.min(2.35, clearance - .7)),
        lookHeight: Math.max(.55, Math.min(.9, clearance * .2)) };
    }
  }
  const projection = projectToFeature(feature, Number(x), Number(z));
  if (!projection) return Object.freeze({ inside: false, reason: 'no_projection' });
  if (projection.pastEndpoint) return Object.freeze({ inside: false, reason: 'outside_shell_interval' });
  const width = Math.max(2.5, Number(feature?.width) || 6);
  if (projection.lateralDistance > width * 0.5 + 0.02) {
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
  if (solid && shellInside) return { inside: false, reason: 'outside_cross_section' };
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
  const ceilingY = shellInside
    ? floorY + tunnelCeilingHeight(clearance, width * 0.5 + 0.02, projection.lateralDistance)
    : Infinity;
  if (Number.isFinite(y) && (y < floorY - 0.5 || y > ceilingY + 0.15)) {
    return Object.freeze({ inside: false, reason: 'outside_vertical_layer' });
  }
  return Object.freeze({
    inside: true,
    reason: shellInside ? 'compiled_shell_interval' : 'compiled_portal_transition',
    shellInside,
    portalTransition: portalZone !== null && !shellInside,
    distance: projection.distance,
    floorY,
    ceilingY,
    clearance,
    lateralDistance: projection.lateralDistance,
    halfWidth: width * 0.5 + 0.02,
    chaseDistance: Math.max(4.2, Math.min(6.5, clearance * 1.4)),
    cameraHeight: Math.max(1.7, Math.min(2.35, clearance - 0.7)),
    lookHeight: Math.max(0.55, Math.min(0.9, clearance * 0.2))
  });
}

export function constrainTunnelActorCeiling(feature, previous, proposedY, headAboveReference = 0.25) {
  const space = resolveTunnelSpace(feature, previous.x, previous.z, previous.y);
  const maximumY = space.ceilingY - headAboveReference;
  return space.inside && Number.isFinite(maximumY) && proposedY > maximumY
    ? { y: maximumY, collided: true }
    : { y: proposedY, collided: false };
}
