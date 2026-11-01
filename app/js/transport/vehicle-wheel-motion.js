// Presentation only. Called by existing physics/population frame owners; never
// changes the actor's pose, velocity, contacts or control input.
export function updateVehicleWheels(wheels, distanceMeters, steeringAngle = 0) {
  if (!wheels?.length || !Number.isFinite(distanceMeters) || !Number.isFinite(steeringAngle)) return;
  for (const wheel of wheels) {
    const radius = Number(wheel.userData?.radiusMeters);
    if (!(radius > 0)) continue;
    wheel.rotation.x = (wheel.rotation.x + distanceMeters / radius) % (Math.PI * 2);
    if (wheel.parent?.userData?.front === true) wheel.parent.rotation.y = Math.max(-.65, Math.min(.65, steeringAngle));
  }
}

export function vehicleWheelRig(root) {
  const wheels=[];
  root?.traverse?.(node => {
    if (node.userData?.transportPart === 'wheel-spin') wheels.push(node);
  });
  return Object.freeze(wheels);
}
