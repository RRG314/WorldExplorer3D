import {LC39B_SURVEY,LC39B_MAST_OUTLINES} from './launch-pad-survey.js';
import {batchOwnedStaticStructure} from './static-structure-batching.js';
import {publishFacilitySurface,facilitySurfaceFor} from './facility-surface-owner.js';
import {applyTerrainPortalMasksForContext} from '../terrain/structure-terrain-portals.js?v=2';
import {finishVenueSurface} from './venue-surface-materials.js';

export function publishLaunchPad(ctx,T){
 const origin=ctx.geoToWorld(28.62725,-80.62085),radius=ctx.worldLoadRuntimeState?.buildingVisibleRadiusWorld||0;
 if(Math.hypot(origin.x,origin.z)>radius-600||facilitySurfaceFor(ctx))return null;
 const k=1/(ctx.METERS_PER_WORLD_UNIT||1),survey=new Map(LC39B_SURVEY.map(s=>[s.id,{...s,pts:s.points.map(p=>ctx.geoToWorld(p.lat,p.lon))}]));
 const root=new T.Group();root.name='Kennedy Launch Complex 39B';root.userData={reviewedLaunchSite:true,sourceClaim:'NASA dimensions and mapped footprints; reconstructed ground tour'};
 const mat=color=>{const m=new T.MeshStandardMaterial({color,roughness:.85,side:T.DoubleSide});m.color.convertSRGBToLinear();return m;};
 const grass=mat(0xa5b192),concrete=mat(0xd4d4c9),brick=mat(0x96786d),steel=mat(0xc7cccb),dark=mat(0x313e43),contact=[],colliders=[];
 const ground=(x,z)=>Number(ctx.terrainMeshHeightAt?.(x,z)??ctx.elevationWorldYAtWorldXZ?.(x,z))||0;
 const foot=ctx.geoToWorld(28.62373,-80.62082),plateau=Math.max(15*k,ground(origin.x,origin.z)+.05),footY=ground(foot.x,foot.z)+.05;
 const rampEnd=ctx.geoToWorld(28.62623,-80.62082);
 const top=(x,z)=>footY+(plateau-footY)*Math.max(0,Math.min(1,(foot.z-z)/(foot.z-rampEnd.z)));
 const polygon=(pts,holes,height,material)=>{
  const shape=new T.Shape(pts.map(p=>new T.Vector2(p.x,-p.z)));for(const hole of holes)shape.holes.push(new T.Path(hole.map(p=>new T.Vector2(p.x,-p.z))));
  const g=new T.ShapeGeometry(shape),p=g.attributes.position;
  for(let i=0;i<p.count;i++){const x=p.getX(i),z=-p.getY(i);p.setXYZ(i,x,height(x,z),z);}g.computeVertexNormals();const mesh=new T.Mesh(g,material);mesh.receiveShadow=true;root.add(mesh);contact.push(mesh);return mesh;
 };
 const beam=(a,b,width,material=steel)=>{const delta=new T.Vector3().subVectors(b,a),mesh=new T.Mesh(new T.BoxGeometry(width,delta.length(),width),material);mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());root.add(mesh);};
 const trench=survey.get('1218169056').pts.slice(0,-1),bed=plateau-12.8*k;
 // This compact cap surrounds the mapped trench opening. Its render triangles
 // also own walk/drive support; the same bounded terrain cut removes DEM infill.
 const minX=Math.min(...trench.map(p=>p.x))-4*k,maxX=Math.max(...trench.map(p=>p.x))+4*k,minZ=Math.min(...trench.map(p=>p.z))-4*k,maxZ=Math.max(...trench.map(p=>p.z))+4*k;
 const cap=[{x:minX,z:minZ},{x:maxX,z:minZ},{x:maxX,z:maxZ},{x:minX,z:maxZ}];
 const pad=survey.get('1074042259').pts.slice(0,-1);
 const clip=(pts,north)=>{const result=[];for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length],ia=north?a.z<=rampEnd.z:a.z>=rampEnd.z,ib=north?b.z<=rampEnd.z:b.z>=rampEnd.z;if(ia)result.push(a);if(ia!==ib){const t=(rampEnd.z-a.z)/(b.z-a.z);result.push({x:a.x+(b.x-a.x)*t,z:rampEnd.z});}}return result;};
 for(const north of [true,false])polygon(clip(pad,north),[],(x,z)=>top(x,z)+.015,concrete);
 polygon(cap,[trench],()=>plateau+.035,concrete);polygon(trench,[],()=>bed,brick);
 // The raised hardstand sits on a grass embankment, not a floating plane.
 // These bounded reconstruction slopes share the same contact publication.
 const cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
 const hull=points=>{const sorted=[...points].sort((a,b)=>a.x-b.x||a.z-b.z),a=[],b=[];for(const p of sorted){while(a.length>1&&cross(a.at(-2),a.at(-1),p)<=0)a.pop();a.push(p);}for(const p of sorted.reverse()){while(b.length>1&&cross(b.at(-2),b.at(-1),p)<=0)b.pop();b.push(p);}return [...a.slice(0,-1),...b.slice(0,-1)];};
 const shoulder=hull([...clip(pad,true),...cap]);polygon(shoulder,[trench],()=>plateau-.025,grass);
 const slope=(a,b,c,d)=>{const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute([a,b,d,b,c,d].flatMap(p=>[p.x,p.y,p.z]),3));g.computeVertexNormals();const mesh=new T.Mesh(g,grass);mesh.receiveShadow=true;root.add(mesh);contact.push(mesh);};
 const center=shoulder.reduce((s,p)=>({x:s.x+p.x/shoulder.length,z:s.z+p.z/shoulder.length}),{x:0,z:0});
 const outer=shoulder.map(p=>{const length=Math.hypot(p.x-center.x,p.z-center.z),width=Math.max(1,2*(plateau-ground(p.x,p.z)));return{x:p.x+(p.x-center.x)/length*width,z:p.z+(p.z-center.z)/length*width};});
 for(let i=0;i<shoulder.length;i++){const j=(i+1)%shoulder.length,a=shoulder[i],b=shoulder[j],c=outer[j],d=outer[i];slope({...a,y:plateau-.025},{...b,y:plateau-.025},{...c,y:ground(c.x,c.z)+.02},{...d,y:ground(d.x,d.z)+.02});}
 const ramp=clip(pad,false),signed=ramp.reduce((sum,a,i)=>{const b=ramp[(i+1)%ramp.length];return sum+a.x*b.z-b.x*a.z;},0);
 for(let i=0;i<ramp.length;i++){const a=ramp[i],b=ramp[(i+1)%ramp.length];if(Math.max(a.z,b.z)<=rampEnd.z+.1)continue;const length=Math.hypot(b.x-a.x,b.z-a.z);if(length<.01)continue;const sign=signed>0?1:-1,nx=(b.z-a.z)/length*sign,nz=-(b.x-a.x)/length*sign;
  const outside=p=>{const width=Math.max(.2,1.8*(top(p.x,p.z)-ground(p.x,p.z)));return{x:p.x+nx*width,z:p.z+nz*width};},c=outside(b),d=outside(a);slope({...a,y:top(a.x,a.z)},{...b,y:top(b.x,b.z)},{...c,y:ground(c.x,c.z)+.02},{...d,y:ground(d.x,d.z)+.02});
 }
 for(let i=0;i<trench.length;i++){
  const a=trench[i],b=trench[(i+1)%trench.length],values=[a,b,a,b,b,a].flatMap((p,j)=>[p.x,j===2||j===4||j===5?bed:plateau,p.z]);
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(values,3));g.computeVertexNormals();root.add(new T.Mesh(g,brick));
  const length=Math.hypot(b.x-a.x,b.z-a.z),segments=Math.max(1,Math.ceil(length/(4*k)));
  for(let j=0;j<=segments;j++){const x=a.x+(b.x-a.x)*j/segments,z=a.z+(b.z-a.z)*j/segments;beam(new T.Vector3(x,plateau,z),new T.Vector3(x,plateau+1.1*k,z),.06*k);}
  beam(new T.Vector3(a.x,plateau+1.1*k,a.z),new T.Vector3(b.x,plateau+1.1*k,b.z),.075*k);
  const nx=-(b.z-a.z)/(length||1)*.16*k,nz=(b.x-a.x)/(length||1)*.16*k;
  colliders.push({pts:[{x:a.x+nx,z:a.z+nz},{x:b.x+nx,z:b.z+nz},{x:b.x-nx,z:b.z-nz},{x:a.x-nx,z:a.z-nz}],minX:Math.min(a.x,b.x)-.2*k,maxX:Math.max(a.x,b.x)+.2*k,minZ:Math.min(a.z,b.z)-.2*k,maxZ:Math.max(a.z,b.z)+.2*k,baseY:bed,minY:bed,maxY:plateau+1.1*k,height:13.9*k,sourceBuildingId:'lc39b-trench-guardrail',geometrySource:'compiled_transport_structures'});
 }
 const tops=[];
 for(const id of ['3281217398','3281217399','3281217400']){
  const p=survey.get(id).pts[0],base=ground(p.x,p.z),height=182.88*k;tops.push(new T.Vector3(p.x,base+height,p.z));
  const corners=LC39B_MAST_OUTLINES.find(m=>m.node===id).points.map(q=>ctx.geoToWorld(q.lat,q.lon));
  const tower=(y,side)=>({x:p.x+(side.x-p.x)*(1-.72*y/(146*k)),y:base+y,z:p.z+(side.z-p.z)*(1-.72*y/(146*k))});
  for(let y=0;y<146*k;y+=12*k)for(let i=0;i<corners.length;i++){
   const a=tower(y,corners[i]),b=tower(Math.min(146*k,y+12*k),corners[i]),c=tower(Math.min(146*k,y+12*k),corners[(i+1)%corners.length]);
   beam(new T.Vector3(a.x,a.y,a.z),new T.Vector3(b.x,b.y,b.z),.42*k);beam(new T.Vector3(a.x,a.y,a.z),new T.Vector3(c.x,c.y,c.z),.22*k);
  }
  beam(new T.Vector3(p.x,base+146*k,p.z),tops.at(-1),1*k);
  colliders.push({minX:p.x-8*k,maxX:p.x+8*k,minZ:p.z-8*k,maxZ:p.z+8*k,minY:base,maxY:base+1.2*k,baseY:base,height:1.2*k,sourceBuildingId:'lc39b-mast-base'});
 }
 for(let i=0;i<3;i++)for(let step=0;step<16;step++){
  const a=tops[i],b=tops[(i+1)%3],point=t=>a.clone().lerp(b,t).add(new T.Vector3(0,-14*k*4*t*(1-t),0));beam(point(step/16),point((step+1)/16),.08*k,dark);
 }
 const water=survey.get('8651215902').pts[0],y=ground(water.x,water.z);
 for(const dx of [-5,5])for(const dz of [-5,5])beam(new T.Vector3(water.x+dx*k,y,water.z+dz*k),new T.Vector3(water.x+dx*k,y+80.5*k,water.z+dz*k),.5*k);
 const tank=new T.Mesh(new T.SphereGeometry(8*k,20,12),steel);tank.scale.y=.7;tank.position.set(water.x,y+83*k,water.z);root.add(tank);
 const cuts=[{kind:'facility',x:(minX+maxX)/2,z:(minZ+maxZ)/2,tangentX:0,tangentZ:1,halfWidth:(maxX-minX)/2,halfDepth:(maxZ-minZ)/2,roadY:bed,grade:0,cutHeight:250*k}];
 // Build contact before static batching; references remain owned until reset.
 publishFacilitySurface(ctx,root,contact,cuts);batchOwnedStaticStructure(T,root);
 finishVenueSurface(T,root,concrete,'../../assets/textures/earth/brushed_concrete_diffuse.jpg',4*k);
 finishVenueSurface(T,root,grass,'../../assets/textures/earth/grass_001_diffuse.jpg',6*k);
 root.userData={...root.userData,plateau,bed,modelCount:3,foot:{...foot,y:footY}};ctx.addEarthWorldObject(root);ctx.buildingMeshes.push(root);ctx.dynamicBuildingColliders.push(...colliders);
 applyTerrainPortalMasksForContext(ctx,ctx.structureTerrainPortalDescriptors||[]);ctx.clearTerrainHeightCache?.();return root;
}
