import {floorWalls} from '../../../functions/interior-layout.mjs';
import {buildAquariumArchitecture} from './aquarium-architecture.js';

// Venue finishes follow the shared compiled walls and floors. All physical
// furniture is published to the existing interior collision collection.
export function addAquariumFixtures(T,state,definition,createWallCollider){
 if(definition.aquariumContent?.venueType!=='aquarium')return;
 const root=state.group,plan=definition.aquariumPlan,k=1/plan.metersPerUnit,layout=definition.authoredLayout,local=plan.local;
 root.name='aquarium:National-Aquarium-reef-route';
 const owned=new Set();let disposed=false;
 root.userData.releaseAquariumTextures=()=>{disposed=true;owned.forEach(t=>t.dispose());owned.clear();root.traverse(o=>{if(o.isLight&&o.shadow){o.shadow.map?.dispose();o.shadow.mapPass?.dispose();}});};
 const photo=(path,repeat,color=true)=>{const t=new T.TextureLoader().load(path,x=>{if(disposed)x.dispose();});t.encoding=color?T.sRGBEncoding:T.LinearEncoding;t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(repeat,repeat);t.anisotropy=4;owned.add(t);return t;};
 const concreteMap=photo('/app/assets/textures/earth/brushed_concrete_diffuse.jpg',.5/k),concreteNormal=photo('/app/assets/textures/earth/brushed_concrete_normal.jpg',.5/k,false),concreteRoughness=photo('/app/assets/textures/earth/brushed_concrete_roughness.jpg',.5/k,false);
 const carpetMap=photo('/app/assets/textures/ship/carpet-color.png',1.5/k),carpetRoughness=photo('/app/assets/textures/ship/carpet-roughness-metalness.png',1.5/k,false);
 const stoneMap=photo('/app/assets/textures/interiors/terrazzo-tiles/diffuse.jpg',.5/k);
 const floorNormal=photo('/app/assets/textures/interiors/terrazzo-tiles/normal.jpg',.5/k,false),floorRoughness=photo('/app/assets/textures/interiors/terrazzo-tiles/roughness.jpg',.5/k,false);
 const sandMap=photo('/app/assets/textures/earth/sand_01_diffuse.jpg',.4/k);
 const material=(color,extra={})=>{const m=new T.MeshStandardMaterial({color,roughness:.75,...extra});m.color.convertSRGBToLinear();return m;};
 const concrete=material(0xaaa69b,{map:concreteMap,normalMap:concreteNormal,normalScale:new T.Vector2(.2,.2),roughnessMap:concreteRoughness,side:T.DoubleSide}),carpet=material(0x737579,{map:carpetMap,roughnessMap:carpetRoughness,roughness:1,side:T.DoubleSide}),terrazzo=material(0xd3d2cc,{map:stoneMap,normalMap:floorNormal,normalScale:new T.Vector2(.3,.3),roughnessMap:floorRoughness,roughness:.8,side:T.DoubleSide}),ceiling=material(0x23272a,{roughness:.92,side:T.DoubleSide});
 const metal=material(0x3e4448,{metalness:.72,roughness:.38}),dark=material(0x25282d),diffuser=new T.MeshBasicMaterial({color:0xd3efef,toneMapped:false});
 const old=new Set(),kept=new Set();
 root.traverse(o=>{if(!o.isMesh)return;if(o.userData.glazing||o.userData.kind==='glazing-frame'){kept.add(o.material);return;}if(['wall','floor','ceiling'].includes(o.userData.kind)){old.add(o.material);o.material=o.userData.kind==='wall'?concrete:o.userData.kind==='floor'?terrazzo:ceiling;o.receiveShadow=true;}});old.forEach(m=>{if(!kept.has(m))m.dispose();});
 const batches=new Map();
 function box(mat,x,y,z,w,h,d,yaw=0){if(!batches.has(mat))batches.set(mat,[]);batches.get(mat).push({x,y,z,w,h,d,yaw});}
 const world=p=>({x:p.x+state.center.x,z:p.z+state.center.z});
 function solidBox(u,v,w,d,h,y=0){const p=local(u,v),axis=local(w/2,0),collider=createWallCollider(world({x:p.x-axis.x,z:p.z-axis.z}),world({x:p.x+axis.x,z:p.z+axis.z}),state.floorBaseY+y*k,h*k,d*k,.000001);if(collider)state.dynamicColliders.push(collider);box(dark,p.x,(y+h/2)*k,p.z,w*k,h*k,d*k,Math.atan2(.75,.66));}
 function sign(title,subtitle,u,v,y,yaw=0,width=2.8){
  const c=document.createElement('canvas');c.width=1024;c.height=256;const g=c.getContext('2d');g.fillStyle='#173540';g.fillRect(0,0,1024,256);g.fillStyle='#63c9c5';g.fillRect(35,34,7,175);g.fillStyle='#ecf4ee';g.font='500 44px sans-serif';g.fillText(title,67,98,910);g.font='28px sans-serif';g.fillStyle='#c1d5d8';g.fillText(subtitle,67,170,910);
  const t=new T.CanvasTexture(c);t.encoding=T.sRGBEncoding;owned.add(t);const m=new T.Mesh(new T.PlaneGeometry(width*k,width*.25*k),new T.MeshBasicMaterial({map:t,side:T.DoubleSide})),p=local(u,v);m.position.set(p.x,y*k,p.z);m.rotation.y=yaw+Math.atan2(.75,.66);root.add(m);return m;
 }
 const addWallCollider=(a,b,y,h,d)=>{const collider=createWallCollider(world(a),world(b),state.floorBaseY+y,h,d,.000001);if(collider)state.dynamicColliders.push(collider);};
 buildAquariumArchitecture(T,{root,plan,layout,box,addWallCollider,materials:{concrete,metal,dark,ceiling,diffuser,carpet}});
 // The same verified elevator stops drive the portal, standing position and UI.
 for(const lift of state.authoredLifts||[])for(const stop of lift.stops){

  state.interactions.push({kind:'elevator',liftId:lift.id,level:stop.level,x:stop.x,z:stop.z,radius:1.5*k,label:lift.label});

 }
 solidBox(-4,13,3.2,1,1);sign('Blacktip Reef','Elevator → 1 · Overlook / M · Underwater',-4,12.47,1.7,Math.PI,3.5);
 sign('GLASS PAVILION','Exit to the harbor · G',2,1.1,2.8,0,4);
 sign('BLUE WONDERS','Blacktip Reef → Elevator A → Underwater',-7,28,10.6,Math.PI,3.8);
 function mapStation(u,v,y,level){
  // The approach and its visible lectern belong to one station. Keep map
  // interaction ranges clear of both elevator landing ranges.
  const approach=local(u,v);state.interactions.push({kind:'aquarium-map',level,...world(approach),radius:1.15*k,label:'Aquarium visitor map'});
  solidBox(u,v+1,.7,.24,1.1,y);sign('VISITOR MAP','Floors · lifts · your observations',u,v+.86,y+1.45,Math.PI,1.05);
 }
 mapStation(0,10,0,0);
 for(const o of definition.aquariumContent.observations){const floor=layout.floors.find(f=>f.id===o.floorId),level=layout.floors.indexOf(floor),p=local(o.u,o.v);state.interactions.push({kind:'aquarium-observation',observationId:o.id,level,...world(p),radius:1.6*k,label:o.title});sign(o.title,'Interact · Read and save an observation',o.u+1,o.v,floor.elevation/k+1.25,-Math.PI/2,1.7);}
 mapStation(-32,76.5,4.2,1);
 // Sand and underwater backdrop use real, already licensed material maps.
 const path=new T.Shape();plan.habitat.outline.forEach((p,i)=>i?path.lineTo(p.x,-p.z):path.moveTo(p.x,-p.z));path.closePath();
 const bottom=new T.Mesh(new T.ShapeGeometry(path),material(0xd6cbb0,{map:sandMap,roughness:.94,side:T.DoubleSide}));bottom.rotation.x=-Math.PI/2;bottom.position.y=plan.habitat.floor;bottom.name='reef-substrate';bottom.userData.aquariumSubmerged=true;bottom.receiveShadow=true;root.add(bottom);
 const habitatRoof=layout.floors.at(-1).elevation+layout.floors.at(-1).height;
 const roof=new T.Mesh(new T.ShapeGeometry(path),ceiling);roof.rotation.x=-Math.PI/2;roof.position.y=habitatRoof;roof.name='reef-atrium-ceiling';root.add(roof);
 // Enclose the habitat's back; keep every viewing segment transparent. This is
 // habitat construction, never added to visitor walkable surfaces.
 const upperWalls=floorWalls(layout.floors.at(-1));
 const belongsToVisitorWall=(a,b)=>upperWalls.some(w=>{const dx=w.b.x-w.a.x,dz=w.b.z-w.a.z,len=Math.hypot(dx,dz);return[a,b].every(p=>Math.abs((p.x-w.a.x)*dz-(p.z-w.a.z)*dx)/len<.001&&((p.x-w.a.x)*dx+(p.z-w.a.z)*dz)>=-.001&&((p.x-w.a.x)*dx+(p.z-w.a.z)*dz)<=len*len+.001);});
 const back=material(0x3c5153,{roughness:.84});back.userData.aquariumSubmerged=true;for(let i=0;i<plan.habitat.outline.length;i++){
  if(i>=plan.habitat.viewingEdgeStart&&i<plan.habitat.viewingEdgeStart+plan.habitat.viewingEdgeCount)continue;const a=plan.habitat.outline[i],b=plan.habitat.outline[(i+1)%plan.habitat.outline.length],len=Math.hypot(b.x-a.x,b.z-a.z);const top=belongsToVisitorWall(a,b)?layout.floors.at(-1).elevation:habitatRoof;box(back,(a.x+b.x)/2,(plan.habitat.floor+top)/2,(a.z+b.z)/2,len,top-plan.habitat.floor,.25*k,-Math.atan2(b.z-a.z,b.x-a.x));
 }
 // A single cool area fill and a warm visitor key preserve readable contrast.
 root.children.filter(o=>o.isHemisphereLight).forEach(l=>{l.color.setHex(0xe1f4f2);l.groundColor.setHex(0x617a80);l.intensity=.62;});
 const key=new T.DirectionalLight(0xffead2,1.1);key.position.set(15,28,10);root.add(key);
 const galleryFill=new T.PointLight(0xe1dacb,40,35*k,2);const galleryPoint=local(-17.8,64);galleryFill.position.set(galleryPoint.x,6.8*k,galleryPoint.z);root.add(galleryFill);
 const reefLight=new T.SpotLight(0xd3f2ff,240,48*k,1.14,.6,2);reefLight.position.set(plan.habitat.routeCenter.x,habitatRoof-.35*k,plan.habitat.routeCenter.z);reefLight.target.position.set(plan.habitat.routeCenter.x,plan.habitat.floor,plan.habitat.routeCenter.z);reefLight.castShadow=true;reefLight.shadow.mapSize.set(1024,1024);reefLight.shadow.camera.near=.25*k;reefLight.shadow.camera.far=48*k;reefLight.shadow.camera.layers.set(1);reefLight.shadow.bias=-.0002;reefLight.shadow.normalBias=.025*k;root.add(reefLight,reefLight.target);
 for(const y of [2.8,10.8]){const p=local(3,9),fill=new T.PointLight(0xffeedb,100,24*k,2);fill.position.set(p.x,y*k,p.z);root.add(fill);}
 const geometry=new T.BoxGeometry(1,1,1),matrix=new T.Matrix4(),q=new T.Quaternion(),axis=new T.Vector3(0,1,0);
 for(const [mat,items]of batches){const mesh=new T.InstancedMesh(geometry,mat,items.length);mesh.name='aquarium-architectural-finishes';mesh.castShadow=true;mesh.receiveShadow=true;if(mat.userData.aquariumSubmerged)mesh.userData.aquariumSubmerged=true;items.forEach((b,i)=>{q.setFromAxisAngle(axis,b.yaw);matrix.compose(new T.Vector3(b.x,b.y,b.z),q,new T.Vector3(b.w,b.h,b.d));mesh.setMatrixAt(i,matrix);});mesh.instanceMatrix.needsUpdate=true;root.add(mesh);}
}
