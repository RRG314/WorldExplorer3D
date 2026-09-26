// Walk around the end of the vehicle before approaching its driver side.
// All points derive from the published pose; callers still use normal input.
export function vehicleApproachWaypoints(actor, vehicle) {
  const yaw = Number(vehicle.yaw || 0), c = Math.cos(yaw), s = Math.sin(yaw);
  const local = point => ({ side: (point.x - vehicle.x) * c - (point.z - vehicle.z) * s,
    along: (point.x - vehicle.x) * s + (point.z - vehicle.z) * c });
  const from = local(actor), door = local(vehicle.driverDoor);
  const side = (Math.sign(door.side) || -1) * (Number(vehicle.dimensionsMeters.width) / 2 + .85);
  const end = (Math.sign(from.along) || 1) * Math.max(Math.abs(from.along), Number(vehicle.dimensionsMeters.length) / 2 + .85);
  return [[from.side, end], [side, end], [side, door.along]].map(([right, forward]) => ({
    x: vehicle.x + right * c + forward * s, z: vehicle.z - right * s + forward * c
  }));
}
