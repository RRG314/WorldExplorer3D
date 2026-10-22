// Rooms share one selected Earth coordinate origin. Residency within that
// origin is disposable geometry; a different destination is a different session.
export function sameRoomEarthLocation(world, location) {
  const values=[world?.lat,world?.lon,location?.lat,location?.lon].map(Number);
  return values.every(Number.isFinite)&&Math.abs(values[0]-values[2])<1e-7&&Math.abs(values[1]-values[3])<1e-7;
}
export function leavesRoomForEarthLocation(room, location) {
  return !!room&&(room.world?.kind!=='earth'||!sameRoomEarthLocation(room.world,location));
}
export function roomPoseReady(room, snapshot, {playing,loading}={}) {
  if(!room||!snapshot||!playing||loading)return false;
  // Contained interiors and shared maritime/space activities retain their own
  // frame contracts. Earth coordinates may only publish from this room's origin.
  return room.world?.kind!=='earth'||snapshot.frame?.kind!=='earth'||sameRoomEarthLocation(room.world,{lat:snapshot.frame.locLat,lon:snapshot.frame.locLon});
}
