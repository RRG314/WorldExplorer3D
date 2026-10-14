import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {createAquariumLayout,REEF_WINDOW,reefViewingFront} from '../app/js/interiors/aquarium-layout.js';
import {AQUARIUM_CONTENT,resolveAquariumInterior} from '../app/js/interiors/aquarium-content.js';
import {AQUARIUM_GEOGRAPHY as GEO} from '../app/js/interiors/aquarium-geography.js';
import {earthCoordinateFrame} from '../app/js/earth-core/coordinate-frame.js';
import {normalizeLayout,assertPlayableLayout,compileLayout,roomRing,pointInRoom,polygons} from '../functions/interior-layout.mjs';
import {attachAquarium,disposeAquarium,updateAquarium,aquariumSwimPose,aquariumObservationId} from '../app/js/interiors/aquarium-runtime.js';
import {buildAuthoredInterior} from '../app/js/interiors/authored-geometry.js';
import {compileEntranceCatalog} from '../app/js/living-world/entrance-catalog.js';
import {createAquariumWater,aquariumTransmittance,aquariumWaterPath} from '../app/js/interiors/aquarium-water.js';
import {habitatPopulation,habitatSwimPose,aquariumHabitatQuality} from '../app/js/interiors/aquarium-habitat.js';
const frame=earthCoordinateFrame({lat:39.28551,lon:-76.6086},100000),geo=(lat,lon)=>frame.toWorld(lat,lon),plan=()=>createAquariumLayout(geo,1.11);
function support(){const p=geo(GEO.entrance.lat,GEO.entrance.lon);return {enterable:true,key:GEO.sourceId,exteriorEntrance:{x:p.x-.75*5.5,z:p.z-.66*5.5},building:{sourceBuildingId:GEO.sourceId,buildingPartKind:'full',bodyHeightMeters:9,pts:GEO.component.map(p=>geo(p.lat,p.lon))}};}
const ctxGeo={geoToWorld:geo,METERS_PER_WORLD_UNIT:1.11};
test('geographic compound venue requires the exact entry wing and mapped door, preserving prior access',()=>{
 const d={mode:'generated'},s=support();assert.equal(resolveAquariumInterior(ctxGeo,s,d).aquariumContent,AQUARIUM_CONTENT);
 for(const prior of [{accessDenied:true},{mode:'mapped'},{communityRealityCapture:{}},{curatedContent:{}}])assert.equal(resolveAquariumInterior(ctxGeo,s,prior),prior);
 const wrong=support();wrong.building.pts=wrong.building.pts.map(p=>({...p,x:p.x+20}));assert.equal(resolveAquariumInterior(ctxGeo,wrong,d),d);
 const noDoor=support();delete noDoor.exteriorEntrance;assert.equal(resolveAquariumInterior(ctxGeo,noDoor,d),d);
});
test('public multi-level route is connected, glazed boundaries stay collidable, habitat has no visitor floor',()=>{
 const p=plan(),c=compileLayout(p.layout);assertPlayableLayout(p.layout);assert.equal(p.layout.lifts.length,2);assert.equal(p.layout.floors.length,3);
 for(const floor of p.layout.floors)for(const r of floor.rooms){
  const overlap=polygons.intersection([roomRing(floor,r).map(v=>[v.x,v.z])],[p.habitat.outline.map(v=>[v.x,v.z])]);
  assert.equal(overlap.length,0,`${r.id} must not overlap the habitat`);
 }
 assert.ok(c.solids.filter(s=>['glazed','guard'].includes(s.presentation)).length>=24);
 const shell=buildAuthoredInterior(T,p.layout);assert.ok(shell.group.children.some(o=>o.userData.glazing&&o.material.transparent));assert.equal(shell.compiled.solids.length,c.solids.length);shell.dispose();
});
test('malformed glass, orphan floors and unsafe or horizontally displaced lift stops are rejected',()=>{
 const p=plan(),edit=()=>structuredClone(p.layout);
 let x=edit();x.lifts[0].stops[1].x+=1;assert.throws(()=>normalizeLayout(x,p.envelope),/shaft/);
 x=edit();x.lifts[0].stops[0].x=999;assert.throws(()=>normalizeLayout(x,p.envelope),/standing space/);
 x=edit();x.floors[0].boundaries[0].presentation='none';assert.throws(()=>normalizeLayout(x,p.envelope),/glazed/);
 x=edit();x.lifts=[];assert.throws(()=>assertPlayableLayout(x),/no route/);
});
test('lift construction reserves a closed shaft, removes slab support and leaves landings clear',()=>{
 const p=plan(),c=compileLayout(p.layout);assert.equal(c.cores.length,2);
 for(const core of c.cores){
  const middle={x:core.outline.reduce((n,p)=>n+p.x,0)/4,z:core.outline.reduce((n,p)=>n+p.z,0)/4};
  assert.equal(c.solids.filter(s=>s.coreId===core.id).length,4);
  for(const stop of core.stops){
   const floor=c.floors.find(f=>f.roomId===stop.roomId);
   const supported=point=>floor.polygons.some(p=>pointInRoom(point,p[0].map(([x,z])=>({x,z})))&&!p.slice(1).some(r=>pointInRoom(point,r.map(([x,z])=>({x,z})))));
   assert.equal(supported(middle),false);assert.equal(supported(stop),true);
  }
 }
 const bad=structuredClone(p.layout);bad.lifts[0].shaft.width=4;bad.lifts[0].shaft.depth=4;assert.throws(()=>normalizeLayout(bad,p.envelope),/complete lift core/);
});
test('overlook guards stop at guard height while underwater glazing remains full height',()=>{
 const p=plan(),c=compileLayout(p.layout),guards=c.solids.filter(s=>s.presentation==='guard');assert.equal(guards.length,p.viewing.points.length-1);
 assert.ok(guards.every(s=>Math.abs(s.top-s.bottom-1.15/p.metersPerUnit)<1e-6));
 assert.ok(c.solids.filter(s=>s.floorId==='reef-m'&&s.presentation==='glazed').every(s=>s.top-s.bottom>3));
});
test('reef front retains published central-window dimensions, four flat windows and supported observation approaches',()=>{
 const p=plan(),f=reefViewingFront(),a=f.arc[0],b=f.arc.at(-1),middle=f.arc[REEF_WINDOW.segments/2];
 assert.ok(Math.abs(b[1]-a[1]-27*.3048)<1e-8);assert.ok(Math.abs(-20-middle[0]-4*.3048)<1e-8);assert.equal(f.flatEdges.length,4);
 for(const o of AQUARIUM_CONTENT.observations){const floor=p.layout.floors.find(f=>f.id===o.floorId),point=p.local(o.u,o.v);assert.ok(floor.rooms.some(r=>pointInRoom(point,roomRing(floor,r))));assert.equal(pointInRoom(point,p.habitat.outline),false);}
 const c=compileLayout(p.layout);assert.ok(c.solids.filter(s=>s.floorId&&s.presentation!=='glazed').every(s=>Math.abs(s.thickness-.32/p.metersPerUnit)<1e-8));
});
test('architectural mesh slabs keep support height, door frames preserve clear openings and wall UVs retain scale',()=>{
 const p=plan(),built=buildAuthoredInterior(T,p.layout);built.group.updateMatrixWorld(true);
 for(const o of built.group.children.filter(o=>o.userData.kind==='floor')){
  const s=built.compiled.surfaces.find(s=>s.id===o.userData.surfaceId),bounds=new T.Box3().setFromObject(o);
  assert.ok(Math.abs(bounds.max.y-s.y)<1e-5);assert.ok(Math.abs(bounds.min.y-(s.y-s.thickness))<1e-5);
 }
 for(const o of built.compiled.openings){
  const frames=built.group.children.filter(m=>m.userData.openingId===o.id);assert.equal(frames.length,3);
  const center=new T.Vector3((o.a.x+o.b.x)/2,o.bottom+o.height/2,(o.a.z+o.b.z)/2),n=new T.Vector3(-(o.b.z-o.a.z)/o.width,0,(o.b.x-o.a.x)/o.width);
  const ray=new T.Raycaster(center.clone().addScaledVector(n,1),n.clone().negate(),0,2);
  assert.equal(ray.intersectObjects(frames,false).length,0,'Frame must not fill the clear passage');
 }
 const wall=built.group.children.find(o=>o.userData.kind==='wall'&&o.geometry.parameters.width>8),uv=wall.geometry.attributes.uv;
 assert.ok(Math.max(...Array.from({length:uv.count},(_,i)=>Math.abs(uv.getX(i))))>4,'Long walls must not stretch a normalized 0–1 texture');built.dispose();
});
test('a multipart provider cannot project one mapped entrance onto distant wings',()=>{
 const s=support(),far={...s.building,pts:s.building.pts.map(p=>({...p,x:p.x+50}))};
 const catalog=compileEntranceCatalog({buildings:[far,s.building],mappedEntrances:[{...s.exteriorEntrance,buildingSourceId:GEO.sourceId,maxFacadeProjectionMeters:8}],limit:10});
 assert.equal(catalog.entrances.length,1);assert.ok(Math.hypot(catalog.entrances[0].x-s.exteriorEntrance.x,catalog.entrances[0].z-s.exteriorEntrance.z)<3);
});
test('swimming poses remain in the habitat across a complete long cycle and avoid its substrate and surface',()=>{
 const p=plan();for(let index=0;index<4;index++)for(let time=0;time<500;time+=.25){const v=aquariumSwimPose(p,index,time);assert.ok(pointInRoom(v,p.habitat.outline));assert.ok(v.y>p.habitat.floor+.5&&v.y<p.habitat.surface-.5);for(let i=0;i<8;i++)assert.ok(pointInRoom({x:v.x+Math.cos(i*Math.PI/4)*.85,z:v.z+Math.sin(i*Math.PI/4)*.85},p.habitat.outline));}
});
function runtime(){const p=plan(),active={definition:{aquariumContent:AQUARIUM_CONTENT,aquariumPlan:p,authoredLayout:p.layout},group:new T.Group(),outsideWorldSequence:5,activeLevel:1};const ctx={activeInterior:active,_worldLoadSequence:5,camera:new T.PerspectiveCamera(),sun:new T.DirectionalLight(),LOC:{id:'baltimore'},discoveryProfileStore:{getEventsById:async()=>[],recordExplorerEvent:async event=>event}};return{ctx,active};}
function instance(){const root=new T.Group();let disposed=0;return {root,animations:[new T.AnimationClip('Swim',2,[])],dispose(){disposed++;root.parent?.remove(root);},get disposed(){return disposed;}};}
test('habitat uses independent leases, simulation time, journal identity, and restores the exact exterior state',async()=>{
 const {ctx,active}=runtime(),leases=[];ctx.camera.layers.enable(4);const mask=ctx.camera.layers.mask;await attachAquarium(ctx,T,active,{load:async()=>{const i=instance();leases.push(i);return i;}});
 assert.equal(leases.length,22);assert.equal(active.aquarium.animals.length,4);assert.equal(ctx.sun.visible,false);
 const a=active.aquarium.animals[0],before=a.instance.root.position.clone();updateAquarium(active,.05);assert.ok(before.distanceTo(a.instance.root.position)>0);
 const paused=a.instance.root.position.clone();updateAquarium(active,0);assert.deepEqual(a.instance.root.position.toArray(),paused.toArray());
 const event=await active.aquarium.save('blacktip-motion');assert.equal(event.eventId,aquariumObservationId(AQUARIUM_CONTENT.id,'blacktip-motion'));assert.equal(event.projections.journal,true);assert.equal(event.projections.missionProgress,false);
 ctx.sun.intensity=4;disposeAquarium(ctx,active);assert.equal(ctx.camera.layers.mask,mask);assert.equal(ctx.sun.visible,true);assert.equal(ctx.sun.intensity,4);assert.ok(leases.every(i=>i.disposed===1));assert.equal(active.group.children.length,0);
});
test('late models cannot attach after exit, and network failure remains retryable',async()=>{
 const {ctx,active}=runtime();let resolve;const waiting=attachAquarium(ctx,T,active,{load:()=>new Promise(r=>{resolve=r;})});disposeAquarium(ctx,active);ctx.activeInterior=null;const late=instance();resolve(late);await waiting;assert.equal(late.disposed,1);assert.equal(active.group.children.length,0);
 const next=runtime();let failed=true;await attachAquarium(next.ctx,T,next.active,{load:async()=>{if(failed)throw Error('offline');return instance();}});assert.equal(next.active.aquarium.error,true);failed=false;await next.active.aquarium.load();assert.equal(next.active.aquarium.error,false);assert.equal(next.active.aquarium.animals.length,4);disposeAquarium(next.ctx,next.active);
});
test('habitat records reuse motion with a different coordinate frame and retain species provenance',()=>{
 const h=structuredClone(AQUARIUM_CONTENT.habitat),members=habitatPopulation(h),p=plan();
 assert.equal(members.length,4);assert.equal(members[3].species.scientificName,'Chelonia mydas');
 const translated={...p,local:(u,v)=>{const q=p.local(u,v);return{x:q.x+100,z:q.z-80};}};
 for(const member of members){const a=habitatSwimPose(p,member,21),b=habitatSwimPose(translated,member,21);assert.ok(Math.abs(b.x-a.x-100)<1e-8);assert.ok(Math.abs(b.z-a.z+80)<1e-8);assert.ok(Math.abs(b.yaw-a.yaw)<1e-8);}
 const before=habitatSwimPose(p,members[0],21);h.species[0].route.u+=12;assert.notEqual(habitatSwimPose(p,habitatPopulation(h)[0],21).x,before.x);
 assert.equal(AQUARIUM_CONTENT.habitat.species[0].route.u,-39);
 h.species[0].population=33;assert.throws(()=>habitatPopulation(h),/bounds/);
 h.species[0].population=3;h.species[0].route.radiusVStep=NaN;assert.throws(()=>habitatPopulation(h),/finite/);
});
test('viewing-floor changes reuse one population and low quality keeps educational species',async()=>{
 const {ctx,active}=runtime(),leases=[];ctx.renderQualityLevel='low';await attachAquarium(ctx,T,active,{load:async()=>{const i=instance();leases.push(i);return i;}});
 assert.equal(active.aquarium.furnishings.length,9);assert.equal(active.aquarium.animals.length,4);
 assert.equal(active.aquarium.water.mesh.getRenderTargets()[0].width,256);assert.equal(aquariumHabitatQuality('high').waterTargetSize,768);
 const s=active.aquarium;active.activeLevel=0;updateAquarium(active,.1);assert.equal(s.clock,0);
 for(const level of [1,2,1,2]){active.activeLevel=level;updateAquarium(active,.1);assert.equal(active.aquarium,s);assert.equal(leases.length,13);}
 assert.ok(s.clock>0);ctx.paused=true;const clock=s.clock;updateAquarium(active,.1);assert.equal(s.clock,clock);
 const event=await s.save('turtle-observation');assert.equal(event.metadata.habitatId,'blacktip-reef');assert.equal(event.metadata.floorId,'reef-m');assert.equal(event.metadata.reconstructionConfidence,'INFERRED');assert.equal(event.projections.fieldGuide,false);
 disposeAquarium(ctx,active);assert.ok(leases.every(i=>i.disposed===1));
});
test('malformed animal animation releases its lease before a successful retry',async()=>{
 const {ctx,active}=runtime(),bad=instance();bad.animations=[];let fail=true;
 await attachAquarium(ctx,T,active,{load:async()=>fail?bad:instance()});
 assert.equal(bad.disposed,1);assert.equal(bad.root.parent,null);assert.equal(active.aquarium.animals.length,0);assert.equal(active.aquarium.error,true);
 fail=false;await active.aquarium.load();assert.equal(active.aquarium.animals.length,4);assert.equal(active.aquarium.error,false);disposeAquarium(ctx,active);assert.equal(bad.disposed,1);
});
test('bundled animal bytes retain attribution, animation and reviewed budget records',async()=>{
 const manifest=JSON.parse(await readFile('app/assets/models/interiors/aquarium/PROVENANCE.json','utf8'));
 for(const r of manifest.records){const b=await readFile(`app/assets/models/interiors/aquarium/${r.file}`);assert.equal(createHash('sha256').update(b).digest('hex'),r.sha256);assert.ok(b.length<=4000000);const n=b.readUInt32LE(12),gltf=JSON.parse(b.subarray(20,20+n).toString());assert.equal(gltf.skins.length,1);assert.equal(gltf.animations.length,1);assert.ok(r.author&&r.license==='CC-BY-4.0');assert.ok(gltf.images.every(i=>!i.uri));}
});
test('contained water attenuates only the ray inside the tank and absorbs red faster than blue',()=>{
 const habitat={floor:0,surface:4,outline:[{x:0,z:0},{x:10,z:0},{x:10,z:10},{x:0,z:10}]};
 assert.equal(aquariumWaterPath({x:5,y:2,z:5},{x:-5,y:2,z:5},habitat),5);
 assert.equal(aquariumWaterPath({x:5,y:1,z:5},{x:5,y:9,z:5},habitat),3);
 const near=aquariumTransmittance(1),far=aquariumTransmittance(12);assert.ok(near.every((n,i)=>n>far[i]));assert.ok(far[0]<far[1]&&far[1]<far[2]);
});
test('water owns bounded offscreen targets and material variants, preserves shared source materials and disposes once',()=>{
 const root=new T.Group(),p=plan(),water=createAquariumWater(T,root,p),original=new T.MeshStandardMaterial(),a=new T.Mesh(new T.BoxGeometry(),original),b=a.clone();root.add(a,b);
 water.apply(a);water.apply(b);assert.notEqual(a.material,original);assert.equal(a.material,b.material);
 const shader={uniforms:{},vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader};a.material.onBeforeCompile(shader);assert.ok(shader.vertexShader.includes('vTankWorld'));assert.ok(shader.fragmentShader.includes('tankDistance'));assert.equal(shader.uniforms.weTankEdges.value.length,p.habitat.outline.length);
 assert.equal(water.mesh.geometry.attributes.position.count%3,0);assert.ok(water.mesh.geometry.attributes.position.count<36000);
 let targetsDisposed=0;for(const r of water.mesh.getRenderTargets()){assert.equal(r.width,512);r.addEventListener('dispose',()=>targetsDisposed++);}
 water.update(12);assert.equal(water.snapshot().time,12);water.update(12);assert.equal(water.snapshot().time,12);
 water.dispose();water.dispose();assert.equal(targetsDisposed,2);assert.equal(a.material,original);assert.equal(b.material,original);assert.equal(water.snapshot().renderTargets,0);assert.equal(root.children.length,2);a.geometry.dispose();original.dispose();
});

test('water auxiliary cameras retain venue layers, invert their actual depth projections and restore failed renders',()=>{
 const p=plan(),root=new T.Group(),water=createAquariumWater(T,root,p),camera=new T.PerspectiveCamera(62,1.6,.04,200);
 root.position.set(12,3,-18);root.updateMatrixWorld(true);camera.layers.set(1);
 const scene=new T.Scene(),background=new T.Color(0x7799aa);scene.background=background;
 const priorTarget={},renders=[],renderer={clearColor:new T.Color(0x123456),clearAlpha:.7,outputEncoding:T.sRGBEncoding,toneMapping:T.ACESFilmicToneMapping,xr:{enabled:true},shadowMap:{autoUpdate:true},autoClear:true,target:priorTarget,
  getRenderTarget(){return this.target;},setRenderTarget(value){this.target=value;},getClearAlpha(){return this.clearAlpha;},getClearColor(out){return out.copy(this.clearColor);},setClearColor(value,alpha){this.clearColor.set(value);this.clearAlpha=alpha;},state:{buffers:{depth:{setMask(){}}}},render(scene,view){renders.push(view.clone());}};
 const center=new T.Vector3(p.habitat.routeCenter.x,p.habitat.surface,p.habitat.routeCenter.z).add(root.position);
 for(const side of [-1,1]){
  camera.position.copy(center).add(new T.Vector3(8,side*3,2));camera.lookAt(center);camera.updateMatrixWorld(true);renders.length=0;
  water.mesh.onBeforeRender(renderer,scene,camera);
  assert.equal(water.mesh.material.uniforms.waterSide.value,side);assert.equal(renders.length,2);
  for(const [i,prefix] of ['reflection','refraction'].entries()){
   assert.equal(renders[i].layers.mask,camera.layers.mask);
   const point=center.clone().add(new T.Vector3(-2,(i===0?side:-side)*1.5,-1));
   const projected=point.clone().project(renders[i]);
   const reconstructed=new T.Vector3(projected.x,projected.y,projected.z).applyMatrix4(water.mesh.material.uniforms[`${prefix}Inverse`].value);
   assert.ok(reconstructed.distanceTo(point)<1e-6,'Clipped depth must reconstruct the original world point');
   const uv=point.clone().applyMatrix4(water.mesh.material.uniforms[`${prefix}Matrix`].value);
   assert.ok(Math.abs(uv.x-(projected.x*.5+.5))<1e-7);assert.ok(Math.abs(uv.y-(projected.y*.5+.5))<1e-7);
  }
 }
 renderer.render=()=>{throw Error('injected auxiliary render failure');};
 assert.throws(()=>water.mesh.onBeforeRender(renderer,scene,camera),/injected/);
 assert.equal(renderer.target,priorTarget);assert.equal(renderer.outputEncoding,T.sRGBEncoding);assert.equal(renderer.toneMapping,T.ACESFilmicToneMapping);
 assert.equal(renderer.xr.enabled,true);assert.equal(renderer.shadowMap.autoUpdate,true);assert.equal(water.mesh.visible,true);
 assert.equal(scene.background,background);assert.equal(renderer.clearAlpha,.7);assert.equal(renderer.clearColor.getHex(),0x123456);
 water.dispose();
 const fallback=createAquariumWater(T,new T.Group(),p,{depthTexture:false});
 assert.ok(fallback.mesh.getRenderTargets().every(t=>!t.depthTexture));assert.equal(fallback.mesh.material.defines.DEPTH_OPTICS,undefined);fallback.dispose();
});
