// Pointer tools transform the existing shared layout model, not a second schema.
import {floorWalls} from '../../../functions/interior-layout.mjs';
export const snapPlanPoint=p=>({x:Math.round(p.x*10)/10,z:Math.round(p.z*10)/10});
export function drawRectangleRoom(floor,roomId,a,b){
  const x0=Math.min(a.x,b.x),x1=Math.max(a.x,b.x),z0=Math.min(a.z,b.z),z1=Math.max(a.z,b.z);
  if(x1-x0<1.5||z1-z0<1.5)throw Error('Draw a room at least 1.5 metres wide and deep.');
  const oldWalls=floorWalls(floor),doors=floor.doors.map(door=>{const wall=oldWalls.find(w=>w.id===door.wall),length=Math.hypot(wall.b.x-wall.a.x,wall.b.z-wall.a.z);return {door,point:{x:wall.a.x+(wall.b.x-wall.a.x)*door.offset/length,z:wall.a.z+(wall.b.z-wall.a.z)*door.offset/length}};});
  const next=structuredClone(floor),ring=[{x:x0,z:z0},{x:x1,z:z0},{x:x1,z:z1},{x:x0,z:z1}];
  // One gesture creates one room. Containment/overlap validation is performed by
  // the shared layout authority before the editor commits this transaction.
  const id=`room_${crypto.randomUUID().replaceAll('-','')}`;
  const vertex=p=>{const found=Object.entries(next.vertices).find(([,q])=>Math.hypot(p.x-q.x,p.z-q.z)<1e-6);if(found)return found[0];const key=`v_${crypto.randomUUID().replaceAll('-','')}`;next.vertices[key]=p;return key;};
  next.rooms.push({id,label:`Room ${next.rooms.length+1}`,type:'room',vertices:ring.map(vertex)});
  // Normalize shared segments without creating duplicate walls or doors.
  for(const r of next.rooms)r.vertices=r.vertices.flatMap((key,i)=>{const end=r.vertices[(i+1)%r.vertices.length],a=next.vertices[key],b=next.vertices[end],dx=b.x-a.x,dz=b.z-a.z,len=dx*dx+dz*dz;return [key,...Object.entries(next.vertices).filter(([k,p])=>k!==key&&k!==end&&Math.abs(dx*(p.z-a.z)-dz*(p.x-a.x))<1e-6).map(([k,p])=>({k,t:((p.x-a.x)*dx+(p.z-a.z)*dz)/len})).filter(p=>p.t>1e-6&&p.t<1-1e-6).sort((a,b)=>a.t-b.t).map(p=>p.k)];});
  const walls=floorWalls(next);next.doors=doors.map(({door,point})=>{const candidates=walls.map(w=>nearestPlanWall([w],point));const hit=candidates.find(v=>v.distance<1e-6&&v.offset>door.width/2+.01&&v.length-v.offset>door.width/2+.01);if(!hit)throw Error('This room corner would cross an existing doorway. Move the corner or doorway first.');return {...door,wall:hit.wall.id,offset:hit.offset,entry:door.entry&&hit.wall.rooms.length===1};});
  Object.assign(floor,next);return id;
}
export function nearestPlanWall(walls,point){
  return walls.map(w=>{const dx=w.b.x-w.a.x,dz=w.b.z-w.a.z,length=Math.hypot(dx,dz),t=Math.max(0,Math.min(1,((point.x-w.a.x)*dx+(point.z-w.a.z)*dz)/(length*length)));return {wall:w,offset:t*length,distance:Math.hypot(point.x-w.a.x-t*dx,point.z-w.a.z-t*dz),length};}).sort((a,b)=>a.distance-b.distance)[0];
}

// Weld coincident corners and split shared segments after a drag. This lets rooms
// meet on the grid while keeping a single wall and preserving doorway positions.
export function joinPlanWalls(floor){
  const wallsBefore=floorWalls(floor),doors=floor.doors.map(door=>{const wall=wallsBefore.find(w=>w.id===door.wall);if(!wall)throw Error('Remove the doorway before removing its wall.');const length=Math.hypot(wall.b.x-wall.a.x,wall.b.z-wall.a.z);return {door,point:{x:wall.a.x+(wall.b.x-wall.a.x)*door.offset/length,z:wall.a.z+(wall.b.z-wall.a.z)*door.offset/length}};});
  const used=new Set(floor.rooms.flatMap(r=>r.vertices)),canonical=[],mapping={};
  for(const id of used){const p=floor.vertices[id],match=canonical.find(key=>Math.hypot(p.x-floor.vertices[key].x,p.z-floor.vertices[key].z)<1e-6);mapping[id]=match||id;if(!match)canonical.push(id);}
  for(const r of floor.rooms)r.vertices=r.vertices.map(id=>mapping[id]);
  for(const id of Object.keys(floor.vertices))if(!canonical.includes(id))delete floor.vertices[id];
  for(const r of floor.rooms)r.vertices=r.vertices.flatMap((id,i)=>{const end=r.vertices[(i+1)%r.vertices.length],a=floor.vertices[id],b=floor.vertices[end],dx=b.x-a.x,dz=b.z-a.z,len=dx*dx+dz*dz;return [id,...canonical.filter(key=>key!==id&&key!==end).map(key=>{const p=floor.vertices[key];return {key,t:((p.x-a.x)*dx+(p.z-a.z)*dz)/len,cross:dx*(p.z-a.z)-dz*(p.x-a.x)};}).filter(p=>Math.abs(p.cross)<1e-6&&p.t>1e-6&&p.t<1-1e-6).sort((a,b)=>a.t-b.t).map(p=>p.key)];});
  const walls=floorWalls(floor);
  floor.doors=doors.map(({door,point})=>{const hit=walls.map(w=>nearestPlanWall([w],point)).find(v=>v.distance<1e-6&&v.offset>door.width/2+.01&&v.length-v.offset>door.width/2+.01);if(!hit)throw Error('This corner would cross a doorway. Move the doorway first.');return {...door,wall:hit.wall.id,offset:hit.offset,entry:door.entry&&hit.wall.rooms.length===1};});
}
