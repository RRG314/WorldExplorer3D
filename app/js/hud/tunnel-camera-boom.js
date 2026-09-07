import { resolveTunnelCameraEnvelope } from './tunnel-camera-envelope.js?v=6';

// Probe a finite-radius camera along its arm, including the curved shoulders.
// Use the actor's vertical layer to avoid capturing a person ABOVE a tunnel.
export function resolveTunnelCameraBoom(feature, actorAnchor, target, radius = 0.38) {
  const actor = resolveTunnelCameraEnvelope(feature, actorAnchor.x, actorAnchor.z, actorAnchor.y);
  if (!actor.inside) return { ...target, collided: false };
  // The look target may be below the near-plane sphere. Start the collision
  // arm at a valid eye height, not with its lower half already in the road.
  const anchor = { ...actorAnchor, y: Math.max(actor.floorY + radius + .02,
    Math.min(actor.ceilingY - radius - .02, actorAnchor.y)) };
  const dx = target.x - anchor.x;
  const dy = target.y - anchor.y;
  const dz = target.z - anchor.z;
  const length = Math.hypot(dx, dy, dz);
  const steps = Math.max(1, Math.ceil(length / 0.25));
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const point = { x: anchor.x + dx * t, y: anchor.y + dy * t, z: anchor.z + dz * t };
    const envelope = resolveTunnelCameraEnvelope(feature, point.x, point.z, point.y);
    const outsideWall = envelope.reason === 'outside_cross_section';
    const solidBlocked = feature?.tunnelSolidBoundary && [
      [radius, 0, 0], [-radius, 0, 0], [0, radius, 0], [0, -radius, 0], [0, 0, radius], [0, 0, -radius]
    ].some(([x,y,z]) => {
      const probe = resolveTunnelCameraEnvelope(feature, point.x+x, point.z+z, point.y+y);
      return probe.reason === 'outside_cross_section' || probe.reason === 'outside_vertical_layer';
    });
    const blocked = outsideWall || solidBlocked || (envelope.inside && (
      point.y < envelope.floorY + radius || point.y > envelope.ceilingY - radius ||
      envelope.lateralDistance + radius > envelope.halfWidth));
    if (!blocked) continue;
    const safe = Math.max(0, (i - 1) / steps);
    return { x: anchor.x + dx * safe, y: anchor.y + dy * safe, z: anchor.z + dz * safe, collided: true };
  }
  return { ...target, collided: false };
}
