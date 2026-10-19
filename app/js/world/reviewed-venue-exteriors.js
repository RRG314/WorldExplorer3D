import {AQUARIUM_EXTERIOR_PARTS} from './aquarium-exterior-survey.js';
import {AQUARIUM_GEOGRAPHY} from '../interiors/aquarium-geography.js';
import {reviewedVenueForBuilding} from '../interiors/venue-exterior-policy.js';
import {createBuildingBodyGeometry} from './building-body-geometry.js';
import {batchOwnedStaticStructure} from './static-structure-batching.js';
import {detachSceneObject} from '../engine/scene-object-lifecycle.js';
import {finishVenueSurface} from './venue-surface-materials.js';
import {replaceVenueCollision,venueComponentCollider} from './venue-collision.js';

const inside=(p,ring)=>{let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
 const a=ring[i],b=ring[j];if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)hit=!hit;
}return hit;};
const onBoundary=(p,ring)=>ring.some((a,i)=>{const b=ring[(i+1)%ring.length],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz)<.02;});
const center=pts=>pts.reduce((p,v)=>({x:p.x+v.x/pts.length,z:p.z+v.z/pts.length}),{x:0,z:0});
function material(THREE,color,roughness=.8,metalness=0){const m=new THREE.MeshStandardMaterial({color,roughness,metalness,side:THREE.DoubleSide});m.color.convertSRGBToLinear();return m;}
function box(THREE,root,mat,w,h,d,x,y,z){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;root.add(m);return m;}
function beam(THREE,root,mat,a,b,width=.075){
 const d=new THREE.Vector3().subVectors(b,a),m=new THREE.Mesh(new THREE.BoxGeometry(width,d.length(),width),mat);
 m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());m.castShadow=true;root.add(m);
}
function triangle(THREE,root,mat,a,b,c){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([...a.toArray(),...b.toArray(),...c.toArray()],3));g.computeVertexNormals();root.add(new THREE.Mesh(g,mat));}
function planarRoofGrid(THREE,root,frame,points,heightAt){
 // Clip parallel glazing bars to the mapped polygon. A fan of bars to its
 // centre would incorrectly make a single sloping plane look like a pyramid.
 const origin=points[0],edge=points[1],length=Math.hypot(edge.x-origin.x,edge.z-origin.z);
 const ux=(edge.x-origin.x)/length,uz=(edge.z-origin.z)/length;
 const local=points.map(p=>({u:(p.x-origin.x)*ux+(p.z-origin.z)*uz,v:-(p.x-origin.x)*uz+(p.z-origin.z)*ux}));
 const world=(u,v)=>{const p={x:origin.x+u*ux-v*uz,z:origin.z+u*uz+v*ux};return new THREE.Vector3(p.x,heightAt(p)+.015,p.z);};
 for(const axis of ['u','v']){const other=axis==='u'?'v':'u',lo=Math.min(...local.map(p=>p[axis])),hi=Math.max(...local.map(p=>p[axis]));
  for(let cut=lo+2.25;cut<hi;cut+=2.25){const hits=[];
   for(let i=0;i<local.length;i++){const a=local[i],b=local[(i+1)%local.length];if((a[axis]<=cut&&b[axis]>cut)||(b[axis]<=cut&&a[axis]>cut))hits.push(a[other]+(b[other]-a[other])*(cut-a[axis])/(b[axis]-a[axis]));}
   hits.sort((a,b)=>a-b);for(let i=1;i<hits.length;i+=2)beam(THREE,root,frame,axis==='u'?world(cut,hits[i-1]):world(hits[i-1],cut),axis==='u'?world(cut,hits[i]):world(hits[i],cut),.06);
  }
 }
}
function sign(THREE,root,text,width,height){
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=128;const g=canvas.getContext('2d');
 g.fillStyle='#e5e8e4';g.fillRect(0,0,1024,128);g.fillStyle='#263b43';g.font='600 58px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText(text,512,64,980);
 const tex=new THREE.CanvasTexture(canvas);tex.encoding=THREE.sRGBEncoding;
 const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshStandardMaterial({map:tex,roughness:.7,side:THREE.DoubleSide}));root.add(mesh);return mesh;
}
export function addReviewedVenueDoor(THREE,root,door,label){
 if(!door)return;
 const group=new THREE.Group();group.position.set(door.x,door.y,door.z);group.rotation.y=Math.atan2(door.normalX,door.normalZ);root.add(group);
 const metal=material(THREE,0x65777b,.35,.55),glass=material(THREE,0x27464d,.15,.4);
 for(const x of [-.7,.7]){box(THREE,group,glass,1.34,2.45,.07,x,1.23,.045);box(THREE,group,metal,.025,.5,.1,x+.4,1.15,.14);}
 for(const x of [-1.42,0,1.42])box(THREE,group,metal,.07,2.52,.14,x,1.26,.10);
 for(const y of [.04,2.5])box(THREE,group,metal,2.9,.08,.14,0,y,.10);
 const labelMesh=sign(THREE,group,label,5.6,.65);labelMesh.position.set(0,3.12,.14);
}
function glassWall(THREE,root,glass,frame,a,b,topA,topB,base=0){
 const length=Math.hypot(b.x-a.x,b.z-a.z),n=Math.max(1,Math.ceil(length/2.25));
 const v=(t,y)=>new THREE.Vector3(a.x+(b.x-a.x)*t,y,a.z+(b.z-a.z)*t);
 triangle(THREE,root,glass,v(0,base),v(1,base),v(1,topB));triangle(THREE,root,glass,v(0,base),v(1,topB),v(0,topA));
 for(let i=0;i<=n;i++){const t=i/n;beam(THREE,root,frame,v(t,base),v(t,topA+(topB-topA)*t));}
 for(let y=base+2.3;y<Math.max(topA,topB);y+=2.3){
  const t=topA===topB?0:(y-topA)/(topB-topA);let lo=0,hi=1;
  if(topA<y)lo=Math.max(0,Math.min(1,t));if(topB<y)hi=Math.max(0,Math.min(1,t));
  if(lo<hi)beam(THREE,root,frame,v(lo,y),v(hi,y),.055);
 }
 beam(THREE,root,frame,v(0,topA),v(1,topB),.11);
}
function aquarium(THREE,ctx,baseY,door){
 const root=new THREE.Group();root.name='National Aquarium — mapped Pier 3 architecture';root.position.y=baseY;
 root.userData={sourceBuildingId:AQUARIUM_GEOGRAPHY.sourceId,reviewedVenueExterior:true,sourceClaim:'OSM outlines and mapped heights; public-photo facade interpretation'};
 const concrete=material(THREE,0xd6d5ce,.9),frame=material(THREE,0x829799,.38,.45),glass=material(THREE,0x427984,.2,.45),blue=material(THREE,0x144b69,.55,.15);
 const parts=new Map(AQUARIUM_EXTERIOR_PARTS.map(p=>[p.id,{...p,pts:p.points.slice(0,-1).map(p=>ctx.geoToWorld(p.lat,p.lon))}]));
 const pavilion=parts.get('1061954708'),main=parts.get('178328374');
 const shell=createBuildingBodyGeometry(THREE,main.pts,18);
 // The sloped pavilion replaces this section of the concrete facade. Keeping
 // both would reproduce the covered-door conflict at the architectural level.
 const p=shell.attributes.position,kept=[];
 for(let i=0;i<p.count;i+=3){let y=0,x=0,z=0;for(let j=0;j<3;j++){x+=p.getX(i+j)/3;y+=p.getY(i+j)/3;z+=p.getZ(i+j)/3;}
  // Shared perimeter faces are part of the replacement too. A strict polygon
  // interior test leaves coplanar concrete over the lower glass pavilion.
  if(y>0&&y<18&&(inside({x,z},pavilion.pts)||onBoundary({x,z},pavilion.pts)))continue;
  for(let j=0;j<3;j++)kept.push(p.getX(i+j),p.getY(i+j),p.getZ(i+j));
 }
 shell.dispose();const body=new THREE.BufferGeometry();body.setAttribute('position',new THREE.Float32BufferAttribute(kept,3));body.computeVertexNormals();const bodyMesh=new THREE.Mesh(body,concrete);bodyMesh.castShadow=bodyMesh.receiveShadow=true;root.add(bodyMesh);
 const projection=p=>p.x+p.z,values=pavilion.pts.map(projection),min=Math.min(...values),max=Math.max(...values);
 const roofY=p=>18+18*(1-(projection(p)-min)/(max-min));
 const panelCenter=center(pavilion.pts),roofCenter=new THREE.Vector3(panelCenter.x,roofY(panelCenter),panelCenter.z);
 for(let i=0;i<pavilion.pts.length;i++){
  const a=pavilion.pts[i],b=pavilion.pts[(i+1)%pavilion.pts.length];
  glassWall(THREE,root,glass,frame,a,b,roofY(a),roofY(b));
  triangle(THREE,root,glass,roofCenter,new THREE.Vector3(a.x,roofY(a),a.z),new THREE.Vector3(b.x,roofY(b),b.z));
 }
 planarRoofGrid(THREE,root,frame,pavilion.pts,roofY);
 const ticket=parts.get('440962471'),ticketCenter=center(ticket.pts),ticketHeight=p=>5+3*(p.z-Math.min(...ticket.pts.map(p=>p.z)))/(Math.max(...ticket.pts.map(p=>p.z))-Math.min(...ticket.pts.map(p=>p.z)));
 for(let i=0;i<ticket.pts.length;i++){const a=ticket.pts[i],b=ticket.pts[(i+1)%ticket.pts.length];glassWall(THREE,root,glass,frame,a,b,ticketHeight(a),ticketHeight(b));triangle(THREE,root,frame,new THREE.Vector3(ticketCenter.x,ticketHeight(ticketCenter),ticketCenter.z),new THREE.Vector3(a.x,ticketHeight(a),a.z),new THREE.Vector3(b.x,ticketHeight(b),b.z));}
 for(const id of ['1061954705','1061954706']){
  const part=parts.get(id),c=center(part.pts),base=id==='1061954705'?18:8,apex=new THREE.Vector3(c.x,base+Number(part.tags['roof:height']),c.z);
  if(base===8){const mesh=new THREE.Mesh(createBuildingBodyGeometry(THREE,part.pts,8),blue);root.add(mesh);}
  for(let i=0;i<part.pts.length;i++){
   const a=part.pts[i],b=part.pts[(i+1)%part.pts.length],va=new THREE.Vector3(a.x,base,a.z),vb=new THREE.Vector3(b.x,base,b.z);
   triangle(THREE,root,glass,va,vb,apex);beam(THREE,root,frame,va,apex,.11);beam(THREE,root,frame,va,vb,.1);
   const divisions=Math.max(1,Math.ceil(va.distanceTo(vb)/2.5));
   for(let n=1;n<divisions;n++)beam(THREE,root,frame,va.clone().lerp(vb,n/divisions),apex,.045);
   for(let t=.12;t<.99;t+=.12)beam(THREE,root,frame,va.clone().lerp(apex,t),vb.clone().lerp(apex,t),.055);
  }
 }
 const canopy=parts.get('440962468');const canopyMesh=new THREE.Mesh(createBuildingBodyGeometry(THREE,canopy.pts,.22),frame);canopyMesh.position.y=3.78;root.add(canopyMesh);
 // Keep the actual entrance's approach clear. Columns follow the outside edge,
 // with a gap around the door, and use the existing collision owner below.
 for(let i=0;i<canopy.pts.length;i++){const a=canopy.pts[i],b=canopy.pts[(i+1)%canopy.pts.length],n=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/12);
  for(let j=0;j<n;j++){const x=a.x+(b.x-a.x)*j/n,z=a.z+(b.z-a.z)*j/n;if(door&&Math.hypot(x-door.x,z-door.z)<4)continue;box(THREE,root,frame,.16,3.8,.16,x,1.9,z);}
 }
 addReviewedVenueDoor(THREE,root,door&&{...door,y:door.y-baseY},'NATIONAL AQUARIUM');
 batchOwnedStaticStructure(THREE,root);
 finishVenueSurface(THREE,root,concrete,'../../assets/textures/earth/concrete_diffuse.jpg',4);
 return root;
}
function peale(THREE,mesh,door){
 if(!door)return null;
 const root=new THREE.Group();root.name='The Peale — Federal entrance surround';root.position.set(door.x,door.y,door.z);root.rotation.y=Math.atan2(door.normalX,door.normalZ);
 root.userData={sourceBuildingId:mesh.userData.sourceBuildingId,reviewedVenueExterior:true,sourceClaim:'Public-photo facade reconstruction; dimensions estimated'};
 const stone=material(THREE,0xd6d4c7,.86),dark=material(THREE,0x233536,.45,.1),metal=material(THREE,0x272c2b,.6,.3);
 const brick=material(THREE,0xc28b75,.93),width=door.facadeWidth,height=11.4;
 // Cover this single front face, retaining the mapped footprint and side
 // walls. The generic office window shader cannot express the seven bays.
 box(THREE,root,brick,width,height,.025,0,height/2,.035);
 for(const x of [-width*.405,-width*.285,width*.285,width*.405])for(const y of [1.75,5.58,9.35]){
  box(THREE,root,dark,1.24,2.12,.055,x,y,.081);
  for(const dx of [-.66,.66])box(THREE,root,stone,.095,2.27,.1,x+dx,y,.13);
  for(const dy of [-1.1,1.1])box(THREE,root,stone,1.41,.11,.14,x,y+dy,.14);
  box(THREE,root,stone,.04,2.14,.12,x,y,.16);
  for(const dy of [-.53,0,.53])box(THREE,root,stone,1.24,.04,.12,x,y+dy,.16);
 }
 box(THREE,root,dark,2.7,2.7,.055,0,1.35,.08);
 for(const x of [-1.3,0,1.3])box(THREE,root,metal,.065,2.7,.1,x,1.35,.16);
 for(const y of [.2,3.25,11.22,11.39])box(THREE,root,stone,width+.16,.15,.36,0,y,.16);
 for(let x=-width/2+.25;x<width/2;x+=.4)box(THREE,root,stone,.16,.15,.25,x,11.04,.15);
 // The central upper relief is presented as architectural stone ornament;
 // it is not a scan or reproduction of the institution's collection.
 box(THREE,root,stone,4.42,1.5,.1,0,9.12,.10);
 for(const x of [-2.08,2.08])box(THREE,root,stone,.12,1.7,.19,x,9.12,.17);
 box(THREE,root,stone,4.6,.16,.22,0,8.29,.18);
 // Four columns, entablature and three tall central windows are the facade's
 // distinctive composition. The existing accessible ground route stays level.
 for(const x of [-2.05,-.7,.7,2.05]){
  const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.16,.2,2.85,16),stone);shaft.position.set(x,1.44,.35);shaft.castShadow=true;root.add(shaft);
  box(THREE,root,stone,.5,.18,.58,x,.1,.35);box(THREE,root,stone,.5,.17,.58,x,2.94,.35);
 }
 for(const [y,w,h,d] of [[3.12,4.85,.3,.78],[3.35,5.02,.12,.86],[3.68,4.65,.45,.55],[4,5.08,.14,.7]])box(THREE,root,stone,w,h,d,0,y,.3);
 for(const x of [-1.42,0,1.42]){
  box(THREE,root,dark,1.18,2.72,.08,x,5.48,.08);
  for(const dx of [-.65,.65])box(THREE,root,stone,.13,3,.25,x+dx,5.5,.17);
  for(const dy of [-1.42,0,1.42])box(THREE,root,stone,1.4,.1,.25,x,5.48+dy,.17);
  box(THREE,root,stone,.035,2.7,.09,x,5.48,.19);
  const arc=new THREE.Mesh(new THREE.TorusGeometry(.61,.085,6,24,Math.PI),stone);arc.position.set(x,7.08,.2);root.add(arc);
 }
 box(THREE,root,stone,5, .22,.65,0,7.88,.22);
 for(const x of [-2.2,-.71,.71,2.2])box(THREE,root,stone,.16,3.9,.2,x,5.98,.15);
 const name=sign(THREE,root,'THE PEALE',3.65,.35);name.position.set(0,3.68,.59);
 for(const x of [-2.65,2.65]){box(THREE,root,metal,.05,2.3,.05,x,1.15,1);const lamp=box(THREE,root,dark,.3,.4,.3,x,2.25,1);lamp.material=lamp.material.clone();lamp.material.emissive.setHex(0xffe0a0);lamp.material.emissiveIntensity=.18;}
 batchOwnedStaticStructure(THREE,root);
 finishVenueSurface(THREE,root,brick,'../../assets/textures/facades/polyhaven-brick-wall-07-diff-1k.jpg',2.4);
 return root;
}
export function publishReviewedVenueExteriors(ctx,THREE){
 const sources=ctx.buildingMeshes.filter(m=>!m.userData?.isRoofDetail&&m.userData?.buildingFootprint?.length&&reviewedVenueForBuilding(m.userData));
 const aquariumSources=sources.filter(m=>reviewedVenueForBuilding(m.userData)==='national-aquarium-baltimore');
 const added=[];
 if(aquariumSources.length){
  const door=ctx.buildingFacadeEntrances?.find?.(e=>e.buildingSourceId===AQUARIUM_GEOGRAPHY.sourceId)||ctx.buildingEntranceCatalog?.entrances?.find(e=>e.buildingSourceId===AQUARIUM_GEOGRAPHY.sourceId);
  const root=aquarium(THREE,ctx,Math.min(...aquariumSources.map(m=>m.position.y)),door);
  const footprint=AQUARIUM_GEOGRAPHY.footprint.map(p=>ctx.geoToWorld(p.lat,p.lon));
  const removed=new Set();
  for(const mesh of ctx.buildingMeshes){const d=mesh.userData,p=d?.buildingFootprint;
   if(!p?.length||d.isMappedVessel)continue;
   const isVenue=reviewedVenueForBuilding(d)==='national-aquarium-baltimore';
   // Roof parts are mapped independently. Only the surveyed Pier 3 envelope
   // can transfer ownership; unrelated neighboring buildings remain untouched.
   const roofPart=d.buildingSemantics?.roofLike&&inside(center(p),footprint);
   if(!isVenue&&!roofPart)continue;
   detachSceneObject(mesh);mesh.geometry?.dispose();if(!mesh.material?.userData?.sharedRuntimeMaterial)mesh.material?.dispose();removed.add(mesh);
  }
  ctx.replaceWorldCollection('buildingMeshes',ctx.buildingMeshes.filter(m=>!removed.has(m)));
  const retiredColliders=(ctx.buildings||[]).filter(b=>reviewedVenueForBuilding(b)==='national-aquarium-baltimore'||b.buildingSemantics?.roofLike&&inside({x:b.centerX,z:b.centerZ},footprint));
  const ranges={'178328374':[0,18],'440962468':[3.65,4],'440962471':[0,8],'1061954705':[18,38],'1061954706':[0,24],'1061954708':[0,36]};
  replaceVenueCollision(ctx,retiredColliders,AQUARIUM_EXTERIOR_PARTS.map(part=>{
   const [bottom,top]=ranges[part.id];return venueComponentCollider(`aquarium-part:${part.id}`,part.points.slice(0,-1).map(p=>ctx.geoToWorld(p.lat,p.lon)),root.position.y+bottom,root.position.y+top);
  }));
  added.push(root);
 }
 for(const mesh of sources.filter(m=>reviewedVenueForBuilding(m.userData)==='peale-baltimore')){
  const door=ctx.buildingEntranceCatalog?.entrances?.find(e=>e.buildingSourceId===mesh.userData.sourceBuildingId);
  const root=peale(THREE,mesh,door);if(root)added.push(root);
 }
 for(const root of added){ctx.addEarthWorldObject(root);ctx.buildingMeshes.push(root);}
 return {published:added.map(r=>r.name)};
}
