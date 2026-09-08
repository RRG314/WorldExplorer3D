// Shared by the browser editor, trusted derivative builder and room runtime.
// These are user-supplied room dimensions, never a replacement building record.
export const ROOM_SURFACE_NAMES = Object.freeze(['Wall 1 · entrance side', 'Wall 2', 'Wall 3', 'Wall 4', 'Floor', 'Ceiling']);
export function normalizeManualRoom(input = {}) {
  const result = {};
  for (const [key, min, max] of [['widthMeters',1.5,80],['lengthMeters',1.5,80],['heightMeters',1.8,12]]) {
    const value = input[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw Error('invalid_manual_room_dimensions');
    result[key] = value;
  }
  return {schemaVersion:1,...result};
}
export function manualRoomFootprint(input) {
  const {widthMeters:w,lengthMeters:l}=normalizeManualRoom(input);
  return [{x:-w/2,z:-l/2},{x:w/2,z:-l/2},{x:w/2,z:l/2},{x:-w/2,z:l/2}];
}
export function manualRoomSurfaceSize(input, surface) {
  const r=normalizeManualRoom(input);
  if(!Number.isInteger(surface)||surface<0||surface>5)throw Error('invalid_manual_room_surface');
  return surface<4 ? [surface%2 ? r.lengthMeters:r.widthMeters,r.heightMeters] : [r.widthMeters,r.lengthMeters];
}
export function manualRoomSurfacePoint(input,surface,u,v) {
  const r=normalizeManualRoom(input);manualRoomSurfaceSize(r,surface);
  if (![u,v].every(n=>Number.isFinite(n)&&n>=0&&n<=1))throw Error('invalid_manual_room_coordinate');
  if(surface===4)return [(u-.5)*r.widthMeters,0,(.5-v)*r.lengthMeters];
  if(surface===5)return [(u-.5)*r.widthMeters,r.heightMeters,(v-.5)*r.lengthMeters];
  const pts=manualRoomFootprint(r),a=pts[surface],b=pts[(surface+1)%4];
  return [a.x+(b.x-a.x)*u,r.heightMeters*v,a.z+(b.z-a.z)*u];
}
