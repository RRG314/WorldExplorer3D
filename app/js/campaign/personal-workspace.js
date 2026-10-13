// Coordinates are metres relative to the current interior center. Furniture is
// never resized to fit: unsupported rooms/positions fail admission instead.
export const WORKSPACE_PARTS=Object.freeze([
  {id:'workspace-table',x:0,z:0,halfX:.568,halfZ:.354,height:.801},
  {id:'workspace-chair',x:0,z:.94,halfX:.284,halfZ:.339,height:1.007}
]);
export function normalizeWorkspace(value) {
  if (!value) return {schemaVersion:1,revision:0,purpose:'journal',pose:null,previous:null,rotated:false,undone:false,usedAt:0};
  if (value.schemaVersion!==1) return structuredClone(value);
  return {...value,revision:Math.max(0,Number(value.revision)||0),rotated:value.rotated===true,undone:value.undone===true,usedAt:Math.max(0,Number(value.usedAt)||0)};
}
const turnPoint=(x,z,turn)=>{
  const a=turn*Math.PI/2,c=Math.cos(a),s=Math.sin(a);return {x:c*x+s*z,z:-s*x+c*z};
};
export function workspaceGeometry(active,pose) {
  if (!active?.center || !pose || ![pose.x,pose.z].every(Number.isFinite) || !Number.isInteger(pose.turn) || pose.turn<0 || pose.turn>3) return null;
  const cx=active.center.x+pose.x,cz=active.center.z+pose.z;
  const y=Number(active.floorBaseY||0)+.032;
  const parts=WORKSPACE_PARTS.map(part=>{
    const p=turnPoint(part.x,part.z,pose.turn),swapped=pose.turn%2===1;
    const hx=swapped?part.halfZ:part.halfX,hz=swapped?part.halfX:part.halfZ;
    return {...part,x:cx+p.x,z:cz+p.z,y,yaw:pose.turn*Math.PI/2,minX:cx+p.x-hx,maxX:cx+p.x+hx,minZ:cz+p.z-hz,maxZ:cz+p.z+hz,minY:y,maxY:y+part.height};
  });
  const use=turnPoint(-1.1,0,pose.turn);
  return {parts,use:{x:cx+use.x,z:cz+use.z,y},origin:{x:cx,z:cz,y},yaw:pose.turn*Math.PI/2};
}
export function workspaceCollisionProxies(geometry) {
  return geometry.parts.map(part=>({...part,sourceBuildingId:'personal-workspace',buildingType:'interior_furniture',isInteriorCollider:true,collisionKind:'solid',baseY:part.minY,height:part.maxY-part.minY}));
}
function inside(x,z,pts) {
  let hit=false;
  for(let i=0,j=pts.length-1;i<pts.length;j=i++)if((pts[i].z>z)!==(pts[j].z>z)&&x<(pts[j].x-pts[i].x)*(z-pts[i].z)/(pts[j].z-pts[i].z)+pts[i].x)hit=!hit;
  return hit;
}
function segmentDistance(x,z,a,b) {
  const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));
  return Math.hypot(x-a.x-dx*t,z-a.z-dz*t);
}
function circleFits(x,z,r,pts) {
  return inside(x,z,pts)&&pts.every((p,i)=>segmentDistance(x,z,p,pts[(i+1)%pts.length])>=r);
}
export function validateWorkspacePlacement(active,pose,colliders=[]) {
  const geometry=workspaceGeometry(active,pose),pts=active?.usableFootprint;
  if (!geometry || !pts?.length || !active.entryPoint || Number(active.activeLevel||0)!==0) return {ok:false,reason:'Choose a ground-floor room.'};
  const obstacles=colliders.filter(c=>c.sourceBuildingId!=='personal-workspace'&&Number(c.maxY)>geometry.origin.y+.1&&Number(c.minY??c.baseY??0)<geometry.origin.y+1.75);
  for(const part of geometry.parts) {
    for(const x of [part.minX,part.maxX])for(const z of [part.minZ,part.maxZ])if(!circleFits(x,z,.25,pts))return {ok:false,reason:'Keep the furniture clear of the walls.'};
    if (obstacles.some(c=>part.maxX+.15>c.minX&&part.minX-.15<c.maxX&&part.maxZ+.15>c.minZ&&part.minZ-.15<c.maxZ)) return {ok:false,reason:'That position overlaps part of the room.'};
    if (Math.hypot((part.minX+part.maxX)/2-active.entryPoint.x,(part.minZ+part.maxZ)/2-active.entryPoint.z)<2) return {ok:false,reason:'Leave the entrance clear.'};
  }
  // Bounded four-neighbor flood fill checks a 0.8 m wide walking route around
  // the furniture. No diagonal corner cutting or terrain/road modifications.
  const all=[...obstacles,...geometry.parts],entry=active.entryPoint,end=geometry.use;
  const free=(x,z)=>circleFits(x,z,.4,pts)&&!all.some(c=>x>c.minX-.4&&x<c.maxX+.4&&z>c.minZ-.4&&z<c.maxZ+.4);
  if(!free(entry.x,entry.z)||!free(end.x,end.z))return {ok:false,reason:'Leave a clear walking route from the entrance to the side of the desk.'};
  const step=.4,minX=Math.floor((Math.min(...pts.map(p=>p.x))-entry.x)/step),maxX=Math.ceil((Math.max(...pts.map(p=>p.x))-entry.x)/step);
  const minZ=Math.floor((Math.min(...pts.map(p=>p.z))-entry.z)/step),maxZ=Math.ceil((Math.max(...pts.map(p=>p.z))-entry.z)/step);
  const width=maxX-minX+1,height=maxZ-minZ+1;
  if(width*height>16384)return {ok:false,reason:'Choose a smaller personal room.'};
  const key=(x,z)=>(z-minZ)*width+x-minX,seen=new Uint8Array(width*height),queue=[[0,0]];seen[key(0,0)]=1;
  for(let i=0;i<queue.length;i++){
    const [gx,gz]=queue[i],x=entry.x+gx*step,z=entry.z+gz*step;
    if(Math.hypot(x-end.x,z-end.z)<=step&&free((x+end.x)/2,(z+end.z)/2))return {ok:true,geometry};
    for(const [nx,nz] of [[gx-1,gz],[gx+1,gz],[gx,gz-1],[gx,gz+1]]){
      if(nx<minX||nx>maxX||nz<minZ||nz>maxZ||seen[key(nx,nz)])continue;seen[key(nx,nz)]=1;
      if(free(entry.x+nx*step,entry.z+nz*step))queue.push([nx,nz]);
    }
  }
  return {ok:false,reason:'Leave a clear walking route from the entrance to the side of the desk.'};
}
export function findWorkspacePlacement(active,colliders=[]) {
  for (const offset of [0,1.5,-1.5,3,-3])for(const z of [0,1.5,-1.5,3,-3])for(const turn of [0,1,2,3]) {
    const pose={x:offset,z,turn};if(validateWorkspacePlacement(active,pose,colliders).ok)return pose;
  }
  return null;
}
export function transitionWorkspace(value,command,now=Date.now()) {
  const current=normalizeWorkspace(value);
  if (current.schemaVersion!==1) throw Error('This workspace needs a newer version of World Explorer.');
  if (command.revision!==current.revision) throw Error('The workspace changed. Reopen it before editing.');
  const next={...current,revision:current.revision+1};
  if (command.type==='place') {
    if(!['journal','album'].includes(command.purpose))throw Error('Choose a workspace purpose.');
    const p=command.pose;if(!p || ![p.x,p.z].every(n=>Number.isFinite(n)&&Math.abs(n)<=100)||![0,1,2,3].includes(p.turn))throw Error('Choose an available furniture position.');
    next.previous=current.pose?{...current.pose}:null;next.pose={...p};next.purpose=command.purpose;
    next.rotated=current.rotated||!!current.pose&&p.turn!==current.pose.turn;
    next.usedAt=0;
  } else if(command.type==='undo') {
    if(!current.pose)throw Error('Place the desk first.');
    next.pose=current.previous?{...current.previous}:null;next.previous=null;next.undone=true;next.usedAt=0;
  } else if(command.type==='record') {
    if(!current.pose||typeof command.recordId!=='string'||!command.recordId.trim()||command.recordId.length>200)throw Error('Choose a saved Journal record for your desk.');
    next.recordId=command.recordId;
  } else if(command.type==='use') {
    if(!current.pose||!current.rotated||!current.undone)throw Error('Place the desk, try rotating it, then undo a change before reviewing your records.');
    next.usedAt=current.usedAt||Math.max(1,now);
  } else throw Error('Unknown workspace action.');
  return next;
}
