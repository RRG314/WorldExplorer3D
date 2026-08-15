import { resolveTunnelCameraEnvelope } from './tunnel-camera-envelope.js?v=2';

let activeRoad = null;
let activeEnvelope = null;

export function resetTunnelCameraController() {
  activeRoad = null;
  activeEnvelope = null;
}

export function resolveTunnelCameraState(options = {}) {
  if (options.disabled === true) {
    resetTunnelCameraController();
    return Object.freeze({
      road: null,
      envelope: Object.freeze({ inside: false, reason: 'disabled' }),
      inside: false,
      transitionOnly: false
    });
  }

  const x = Number(options.x);
  const z = Number(options.z);
  const angle = Number(options.angle) || 0;
  const lookYaw = Number(options.lookYaw) || 0;
  let road = options.road || null;
  let envelope = resolveTunnelCameraEnvelope(road, x, z);
  let transitionOnly = false;

  if (!envelope.inside && activeRoad) {
    const retainedAtActor = resolveTunnelCameraEnvelope(activeRoad, x, z);
    if (retainedAtActor.inside) {
      envelope = retainedAtActor;
      road = activeRoad;
    }
  }

  if (!envelope.inside && activeRoad) {
    const trailingDistance = Math.max(
      4,
      Number(options.trailingDistance) || 0,
      Number(activeEnvelope?.chaseDistance) || 0
    );
    const trailingAngle = angle + lookYaw + (options.reverse === true ? Math.PI : 0);
    const retainedAtCamera = resolveTunnelCameraEnvelope(
      activeRoad,
      x - Math.sin(trailingAngle) * trailingDistance,
      z - Math.cos(trailingAngle) * trailingDistance
    );
    if (retainedAtCamera.inside) {
      envelope = retainedAtCamera;
      road = activeRoad;
      transitionOnly = true;
    }
  }

  activeRoad = envelope.inside ? road : null;
  activeEnvelope = envelope.inside ? envelope : null;
  return Object.freeze({
    road: activeRoad,
    envelope,
    inside: envelope.inside === true,
    transitionOnly
  });
}
