// Pointer tools transform the existing shared layout model, not a second schema.
import {containsRegion,pointInRoom,roomRing,splitRoom} from '../../../functions/interior-layout.mjs';
export const snapPlanPoint=p=>({x:Math.round(p.x*10)/10,z:Math.round(p.z*10)/10});
export function drawRectangleRoom(floor,roomId,a,b){
  const x0=Math.min(a.x,b.x),x1=Math.max(a.x,b.x),z0=Math.min(a.z,b.z),z1=Math.max(a.z,b.z);
  if(x1-x0<1.5||z1-z0<1.5)throw Error('Draw a room at least 1.5 metres wide and deep.');
  const center={x:(x0+x1)/2,z:(z0+z1)/2};
  let selected=floor.rooms.find(r=>r.id===roomId);
  if(!selected||!containsRegion(roomRing(floor,selected),[{x:x0,z:z0},{x:x1,z:z0},{x:x1,z:z1},{x:x0,z:z1}]))throw Error('Draw within one existing space. Room boundaries cannot overlap or leave the building.');
  for(const [axis,coordinate]of [['x',x0],['x',x1],['z',z0],['z',z1]]){
    const ring=roomRing(floor,selected),low=Math.min(...ring.map(p=>p[axis])),high=Math.max(...ring.map(p=>p[axis]));
    if(coordinate>low+.01&&coordinate<high-.01){
      splitRoom(floor,selected.id,axis,coordinate);
      selected=floor.rooms.find(r=>pointInRoom(center,roomRing(floor,r)));
    }
  }
  return selected.id;
}
export function nearestPlanWall(walls,point){
  return walls.map(w=>{const dx=w.b.x-w.a.x,dz=w.b.z-w.a.z,length=Math.hypot(dx,dz),t=Math.max(0,Math.min(1,((point.x-w.a.x)*dx+(point.z-w.a.z)*dz)/(length*length)));return {wall:w,offset:t*length,distance:Math.hypot(point.x-w.a.x-t*dx,point.z-w.a.z-t*dz),length};}).sort((a,b)=>a.distance-b.distance)[0];
}
