// View coordinates only: persisted vertices, photo surfaces and 3D stay in world coordinates.
import {normalizeLayout} from '../../../functions/interior-layout.mjs';
import {drawRectangleRoom} from './layout-drawing.js';
export function planFrame(outline){
  let longest=0,angle=0;
  outline.forEach((a,i)=>{const b=outline[(i+1)%outline.length],length=Math.hypot(b.x-a.x,b.z-a.z);if(length>longest){longest=length;angle=Math.atan2(b.z-a.z,b.x-a.x);}});
  angle=((angle+Math.PI/4)% (Math.PI/2)+Math.PI/2)%(Math.PI/2)-Math.PI/4;
  const c=Math.cos(angle),s=Math.sin(angle);
  return {angle,to:p=>({x:c*p.x+s*p.z,z:-s*p.x+c*p.z}),from:p=>({x:c*p.x-s*p.z,z:s*p.x+c*p.z})};
}
export function drawAlignedRoom(floor,a,b,frame){
  const copy=structuredClone(floor);
  for(const [id,p] of Object.entries(copy.vertices))copy.vertices[id]=frame.to(p);
  const id=drawRectangleRoom(copy,null,a,b);
  for(const [key,p] of Object.entries(copy.vertices))copy.vertices[key]=frame.from(p);
  Object.assign(floor,copy);return id;
}
export function addPlanRoom(layout,floorIndex,envelope,frame,shape='rectangle'){
  if(layout.floors[floorIndex].rooms.length>=32)throw Error('This floor already has 32 rooms. Edit or remove an existing room first.');
  const points=(layout.unitOutline||envelope.footprint).map(frame.to),xs=points.map(p=>p.x),zs=points.map(p=>p.z);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs),cx=(minX+maxX)/2,cz=(minZ+maxZ)/2;
  // Search valid placements from the centre outward. Authority checks courtyards,
  // concave boundaries, existing rooms and wall clearance before anything changes.
  for(const size of [3,2,1.5]){
    const candidates=[],step=Math.max(.5,Math.ceil(Math.max(maxX-minX,maxZ-minZ)/40*10)/10);
    for(let x=Math.ceil(minX*2)/2;x<=maxX-size;x+=step)for(let z=Math.ceil(minZ*2)/2;z<=maxZ-size;z+=step)candidates.push({x,z});
    candidates.sort((a,b)=>Math.hypot(a.x+size/2-cx,a.z+size/2-cz)-Math.hypot(b.x+size/2-cx,b.z+size/2-cz));
    for(const p of candidates){
      const candidate=structuredClone(layout),floor=candidate.floors[floorIndex];
      try{
        const id=drawAlignedRoom(floor,p,{x:p.x+size,z:p.z+size},frame),room=floor.rooms.find(r=>r.id===id);
        if(shape==='L'){
          const ring=[[0,0],[size,0],[size,size/2],[size/2,size/2],[size/2,size],[0,size]];
          room.vertices=ring.map(([x,z])=>{const key=`v_${crypto.randomUUID().replaceAll('-','')}`;floor.vertices[key]=frame.from({x:p.x+x,z:p.z+z});return key;});
        }
        return {layout:normalizeLayout(candidate,envelope),roomId:id};
      }catch{}
    }
  }
  throw Error('No clear space for another room. Resize an existing room or divide it to make space.');
}
