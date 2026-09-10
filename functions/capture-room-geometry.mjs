// Shared by the browser editor, trusted derivative builder and room runtime.
// These are user-supplied room dimensions, never a replacement building record.
import {validateRing,polygons} from './interior-layout.mjs';
import * as bundledEarcut from './vendor/earcut/index.js';
const earcut=bundledEarcut.default||globalThis.earcut;
export const ROOM_PHOTO_SURFACE_INSET = .006;
export const ROOM_SURFACE_NAMES = Object.freeze(['Wall 1 · entrance side', 'Wall 2', 'Wall 3', 'Wall 4', 'Floor', 'Ceiling']);
export function normalizeManualRoom(input = {}) {
  const result = {};
  for (const [key, min, max] of [['widthMeters',1.5,80],['lengthMeters',1.5,80],['heightMeters',1.8,12]]) {
    const value = input[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < (input.outline&&key!=='heightMeters'?.1:min) || value > max) throw Error('invalid_manual_room_dimensions');
    result[key] = value;
  }
  const extras={};
  if(input.outline)extras.outline=validateRing(input.outline);
  if(input.openings){
    if(!Array.isArray(input.openings)||input.openings.length>64)throw Error('invalid_room_openings');
    extras.openings=input.openings.map(o=>{if(!Number.isInteger(o.wall)||o.wall<0||o.wall>=(extras.outline?.length||4)||![o.offset,o.width,o.height].every(Number.isFinite)||o.offset<0||o.width<=0||o.height<=0||o.height>result.heightMeters)throw Error('invalid_room_opening');return {wall:o.wall,offset:o.offset,width:o.width,height:o.height};});
  }
  for(const key of ['floorCutouts','ceilingCutouts'])if(input[key]){if(!Array.isArray(input[key])||input[key].length>64)throw Error('invalid_room_cutouts');extras[key]=input[key].map(validateRing);}
  if(input.wallInset!==undefined){if(!Number.isFinite(input.wallInset)||input.wallInset<0||input.wallInset>.1)throw Error('invalid_room_inset');extras.wallInset=input.wallInset;}
  return {schemaVersion:1,...result,...extras};
}
export function manualRoomFootprint(input) {
  const {widthMeters:w,lengthMeters:l}=normalizeManualRoom(input);
  if(input.outline)return validateRing(input.outline);
  return [{x:-w/2,z:-l/2},{x:w/2,z:-l/2},{x:w/2,z:l/2},{x:-w/2,z:l/2}];
}
export function manualRoomSurfaceSize(input, surface) {
  const r=normalizeManualRoom(input);
  const pts=manualRoomFootprint(input),count=pts.length;
  if(!Number.isInteger(surface)||surface<0||surface>count+1)throw Error('invalid_manual_room_surface');
  return surface<count ? [Math.hypot(pts[(surface+1)%count].x-pts[surface].x,pts[(surface+1)%count].z-pts[surface].z),r.heightMeters] : [r.widthMeters,r.lengthMeters];
}
export function manualRoomSurfacePoint(input,surface,u,v) {
  const r=normalizeManualRoom(input);manualRoomSurfaceSize(r,surface);
  if (![u,v].every(n=>Number.isFinite(n)&&n>=0&&n<=1))throw Error('invalid_manual_room_coordinate');
  const pts=manualRoomFootprint(r),count=pts.length,minX=Math.min(...pts.map(p=>p.x)),minZ=Math.min(...pts.map(p=>p.z));
  if(surface===count)return [minX+u*r.widthMeters,ROOM_PHOTO_SURFACE_INSET,minZ+(1-v)*r.lengthMeters];
  if(surface===count+1)return [minX+u*r.widthMeters,r.heightMeters-ROOM_PHOTO_SURFACE_INSET,minZ+v*r.lengthMeters];
  const a=pts[surface],b=pts[(surface+1)%count];
  const signed=pts.reduce((sum,p,i)=>{const q=pts[(i+1)%count];return sum+p.x*q.z-q.x*p.z;},0),length=Math.hypot(b.x-a.x,b.z-a.z),inset=(r.wallInset||0)*(signed>=0?1:-1);
  return [a.x+(b.x-a.x)*u-(b.z-a.z)/length*inset,r.heightMeters*v,a.z+(b.z-a.z)*u+(b.x-a.x)/length*inset];
}

export function manualRoomPatchGeometry(input,surface,region) {
  const room=normalizeManualRoom(input),pts=manualRoomFootprint(room),count=pts.length,[left,bottom,right,top]=region;
  const rectangle=[[[left,bottom],[right,bottom],[right,top],[left,top]]];let clipped=[rectangle];
  if(surface>=count){const minX=Math.min(...pts.map(p=>p.x)),minZ=Math.min(...pts.map(p=>p.z));const project=p=>[(p.x-minX)/room.widthMeters,surface===count?1-(p.z-minZ)/room.lengthMeters:(p.z-minZ)/room.lengthMeters];clipped=polygons.intersection(rectangle,[pts.map(project)]);const cuts=room[surface===count?'floorCutouts':'ceilingCutouts']||[];if(cuts.length)clipped=polygons.difference(clipped,...cuts.map(r=>[r.map(project)]));}
  else {const [width,height]=manualRoomSurfaceSize(room,surface);const cuts=(room.openings||[]).filter(o=>o.wall===surface).map(o=>[[(o.offset-o.width/2)/width,0],[(o.offset+o.width/2)/width,0],[(o.offset+o.width/2)/width,o.height/height],[(o.offset-o.width/2)/width,o.height/height]]);if(cuts.length)clipped=polygons.difference(rectangle,...cuts.map(r=>[r]));}
  const positions=[],uv=[],indices=[];
  for(const polygon of clipped){const flat=earcut.flatten(polygon),triangles=earcut(flat.vertices,flat.holes,2),base=positions.length/3;for(let i=0;i<flat.vertices.length;i+=2){const u=flat.vertices[i],v=flat.vertices[i+1];positions.push(...manualRoomSurfacePoint(room,surface,u,v));uv.push((u-left)/(right-left),(v-bottom)/(top-bottom));}indices.push(...triangles.map(i=>i+base));}
  if(surface<count&&pts.reduce((sum,p,i)=>{const q=pts[(i+1)%count];return sum+p.x*q.z-q.x*p.z;},0)<0)for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];
  return {positions,uv,indices};
}
