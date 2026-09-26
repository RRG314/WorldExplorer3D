import {batchStaticModelTemplate} from '../assets/static-model-batching.js?v=1';
import {ring, polar, bounds, templatePoint} from './ship-ring-plan.js';

// Polygon colliders are derived from the same wall endpoints as their meshes.
export function buildRingDeck(THREE,deck,api) {
 const group=new THREE.Group();group.name=`solis-reach-deck:${deck.id}`;
 const architecture=new THREE.Group();architecture.name=`ring-architecture:${deck.id}`;group.add(architecture);
 const colliders=[],doorStates=[];
 const deckHeight=deck.id==='engineering'?6:3.6;
 const wallMaterial=api.surface('wall',deck.id),floorMaterial=api.surface('floor',deck.id),ceilingMaterial=api.surface('ceiling',deck.id);
 const trim=api.material(0x4d6268,{metalness:.45,roughness:.5});
 const light=api.material(api.accent(deck.id),{emissive:api.accent(deck.id),emissiveIntensity:.8,metalness:.05});
 // Subdivide the circular walking surfaces into short radial bands. A single
 // 32m cap fan produces unstable texture derivatives at corridor grazing angles
 // on the software renderer used by the browser checks.
 const disc=(y,material,ceiling=false)=>{
  const geometry=new THREE.RingGeometry(0,ring.hullRadius,128,16);
  geometry.rotateX(ceiling?Math.PI/2:-Math.PI/2);
  const positions=geometry.attributes.position,uv=geometry.attributes.uv;
  for(let i=0;i<positions.count;i++)uv.setXY(i,positions.getX(i)/4,positions.getZ(i)/4);
  const mesh=new THREE.Mesh(geometry,material);mesh.name=ceiling?'ring-ceiling':'ring-floor';
  mesh.position.y=y;mesh.receiveShadow=true;architecture.add(mesh);return mesh;
 };
 disc(0,floorMaterial);disc(deckHeight,ceilingMaterial,true);
 function wall(a,b,name,{height=deckHeight,base=0,material=wallMaterial,solid=true,width=.24}={}){
  const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz),nx=dz/length*width/2,nz=-dx/length*width/2;
  const mesh=api.box(name.startsWith('door:')?group:architecture,{x:width,y:height,z:length+.035},{x:(a.x+b.x)/2,y:base+height/2,z:(a.z+b.z)/2},material,name);
  mesh.rotation.y=Math.atan2(dx,dz);
  if(solid){const pts=[{x:a.x+nx,z:a.z+nz},{x:b.x+nx,z:b.z+nz},{x:b.x-nx,z:b.z-nz},{x:a.x-nx,z:a.z-nz}];colliders.push({...bounds(pts),pts,baseY:base,height,isInteriorCollider:true,sourceBuildingId:name});}
  return mesh;
 }
 function arc(radius,start,end,name,options={}){
  const n=Math.ceil((end-start)/.04);
  for(let i=0;i<n;i++)wall(polar(radius,start+(end-start)*i/n),polar(radius,start+(end-start)*(i+1)/n),name,options);
 }
 const full=Math.PI*2;
 const windows=deck.rooms.filter(r=>['bridge','observation-gallery','local-craft-bay'].includes(r.id));
 const windowHalf=.16;
 for(let i=0;i<160;i++){
  const a=i*full/160,b=(i+1)*full/160,m=(a+b)/2;
  const window=windows.find(r=>Math.abs(Math.atan2(Math.sin(m-r.angle),Math.cos(m-r.angle)))<windowHalf+.02);
  if(window){arc(ring.hullRadius,a,b,'window-sill',{height:.65});arc(ring.hullRadius,a,b,'window-header',{base:deckHeight-.4,height:.4});}
  else arc(ring.hullRadius,a,b,'circular-pressure-hull');
 }
 const spaceView=api.spaceView?.();
 if(spaceView)for(const room of windows){
  const p=polar(ring.hullRadius-.65,room.angle),bay=room.id==='local-craft-bay';
  const view=new THREE.Mesh(new THREE.PlaneGeometry(12,deckHeight-1),new THREE.MeshBasicMaterial({map:spaceView.texture,side:THREE.DoubleSide,toneMapped:false}));
  view.position.set(p.x,deckHeight/2,p.z);view.rotation.y=room.angle;view.name=`exterior-view:${room.id}`;group.add(view);spaceView.surfaces.push(view);
  if(bay){
   const door=api.box(group,{x:10.8,y:5.15,z:.3},{x:p.x,y:2.9,z:p.z},trim,'pod-bay-launch-door');door.rotation.y=room.angle;
   group.userData.launchDoor=door;group.userData.launchDoorClosedY=2.55;
   // Glazed upper observation strip remains visible with the launch door sealed.
   door.scale.y=.86;door.position.y=2.55;
   // The outer pressure boundary stays solid to walking; launch transfers the
   // player through the controlled flight handoff, never by walking into space.
   const tangent={x:Math.cos(room.angle)*5.4,z:-Math.sin(room.angle)*5.4};
   const normal=polar(.15,room.angle);
   const pts=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v])=>({x:p.x+u*tangent.x+v*normal.x,z:p.z+u*tangent.z+v*normal.z}));
   colliders.push({...bounds(pts),pts,baseY:0,height:deckHeight,isInteriorCollider:true,sourceBuildingId:'pod-bay-pressure-boundary'});
  }
 }

 // Continuous ring corridor; broad radial portals connect to the core.
 const portals=[0,Math.PI/2,Math.PI,3*Math.PI/2];
 if(deck.id==='habitat')portals.push(Math.PI*1.25);
 portals.sort((a,b)=>a-b);
 for(let i=0;i<portals.length;i++)arc(ring.corridorInner,portals[i]+.105,(portals[(i+1)%portals.length]||full)-.105,'inner-corridor-bulkhead');
 for(let i=0;i<4;i++){
  const angle=i*Math.PI/2;
  for(const side of [-1,1]){const start=polar(5,angle),end=polar(19.9,angle),offset=polar(2.05*side,angle+Math.PI/2);wall({x:start.x+offset.x,z:start.z+offset.z},{x:end.x+offset.x,z:end.z+offset.z},'radial-service-bulkhead');}
  const p=polar(12,angle);const fixture=api.box(group,{x:2.4,y:.04,z:9},{x:p.x,y:3.55,z:p.z},light,'radial-passage-light');fixture.rotation.y=angle;
 }
 for(const room of deck.rooms){
  const inner=room.id==='storm-shelter';
  const radius=inner?18:ring.corridorOuter,outer=inner?6:ring.hullRadius;
  const half=inner?Math.PI/4-.18:Math.PI/8-.006,doorHalf=1.25/radius;
  arc(radius,room.angle-half,room.angle-doorHalf,`bulkhead:${room.id}`);
  arc(radius,room.angle+doorHalf,room.angle+half,`bulkhead:${room.id}`);
  for(const a of [room.angle-half,room.angle+half])wall(polar(radius,a),polar(outer,a),`partition:${room.id}`);
  const d=room.door;
  const left=polar(radius,room.angle-doorHalf),right=polar(radius,room.angle+doorHalf);
  wall(left,right,`header:${room.id}`,{base:2.75,height:deckHeight-2.75});
  
  const panel=wall(left,right,`door:${room.id}`,{height:2.72,width:.14,material:trim});
  doorStates.push({id:`door:${room.id}`,deckId:deck.id,roomId:room.id,label:`${room.label} pressure door`,...d,orientation:'radial',yaw:room.angle,open:false,panel,collider:colliders.pop(),targetY:1.36});
  const sign=api.label(room.label,api.accent(deck.id));
  const placard=new THREE.Mesh(new THREE.PlaneGeometry(2.5,.45),new THREE.MeshBasicMaterial({map:sign,side:THREE.DoubleSide}));
  placard.position.set(d.x*.987,3.12,d.z*.987);placard.rotation.y=room.angle+Math.PI;group.add(placard);
  const taskLight=new THREE.PointLight(0xfff5e8,.75,18,2);taskLight.position.set(room.center.x,3.2,room.center.z);group.add(taskLight);
 }
 group.userData.architectureBatching=batchStaticModelTemplate(THREE,architecture);
 // Existing functional room kits are positioned through their room's transform.
 const kit=new THREE.Group();api.details(kit,deck.id);
 for(const child of [...kit.children]){
  if(child.name.startsWith('deck-lift:')){group.add(child);continue;}
  const room=deck.rooms.find(r=>child.position.x>=r.template.minX-.5&&child.position.x<=r.template.maxX+.5&&child.position.z>=r.template.minZ-.5&&child.position.z<=r.template.maxZ+.5)
   ||deck.rooms.reduce((a,r)=>Math.hypot(child.position.x-(r.template.minX+r.template.maxX)/2,child.position.z-(r.template.minZ+r.template.maxZ)/2)<Math.hypot(child.position.x-(a.template.minX+a.template.maxX)/2,child.position.z-(a.template.minZ+a.template.maxZ)/2)?r:a);
  const point=templatePoint(room,child.position);child.position.x=point.x;child.position.z=point.z;child.position.y=(child.isLight||child.name.includes('task-light'))?deckHeight-.35:child.position.y*room.fitScale;child.rotation.y+=room.kitYaw;child.scale.multiplyScalar(room.fitScale);child.userData.shipRoomId=room.id;group.add(child);
 }
 api.wallEquipment?.(group,deck,colliders);
 const oldColliders=[];api.propColliders(oldColliders,deck.id);
 for(const c of oldColliders){const room=deck.rooms.find(r=>c.centerX>=r.template.minX&&c.centerX<=r.template.maxX&&c.centerZ>=r.template.minZ&&c.centerZ<=r.template.maxZ);if(!room)continue;
  const pts=[{x:c.minX,z:c.minZ},{x:c.maxX,z:c.minZ},{x:c.maxX,z:c.maxZ},{x:c.minX,z:c.maxZ}].map(p=>templatePoint(room,p));colliders.push({...c,...bounds(pts),pts,height:c.height*room.fitScale,baseY:c.baseY*room.fitScale});
 }
 group.add(new THREE.HemisphereLight(0xfff7ec,0x424d50,.75));
 const alertLight=new THREE.PointLight(0xff6b45,0,80,2);alertLight.position.y=3.2;group.add(alertLight);
 return {group,colliders,doorStates,alertLight,spaceView};
}
