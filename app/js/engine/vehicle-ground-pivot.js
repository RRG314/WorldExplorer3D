import {VEHICLE_ROOT_TO_GROUND_METERS} from './vehicle-catalog.js?v=6';

// The driving actor keeps its root vertically above the contact center. Both
// ordinary mounted cars and traffic must rotate the prepared body about that
// same center, rather than rotating the root-to-ground displacement with it.
export function vehicleGroundVisual(host) {
  return host?.userData?.mountedVehicleVisualHost?.userData?.curatedTrafficVehicleAttachment?.visual ||
    host?.userData?.curatedTrafficVehicleAttachment?.visual ||
    host?.userData?.curatedVehicleVisual || null;
}

export function vehicleVisualRootHeight(visual) {
  return visual?.userData?.vehicleRootHeightMeters ?? VEHICLE_ROOT_TO_GROUND_METERS;
}

export function syncVehicleGroundPivot(host) {
  const visual = vehicleGroundVisual(host);
  if (!visual) return;
  const pitch = Number(host.rotation?.x || 0), roll = Number(host.rotation?.z || 0);
  const height = vehicleVisualRootHeight(visual);
  visual.position.set(-height * Math.sin(roll) * Math.cos(pitch),
    -height * Math.cos(roll) * Math.cos(pitch), height * Math.sin(pitch));
}
