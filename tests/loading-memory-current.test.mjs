import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {packTraversalAdjacency,traversalSourceInterval} from '../app/js/world/traversal-graph-storage.js';
import {ctx} from '../app/js/shared-context.js?v=55';
import {initWorldTraversal,buildTraversalNetworks,invalidateTraversalNetworks,findTraversalRoute} from '../app/js/world/traversal.js';

test('packed adjacency preserves directed edge order and double-precision weights',()=>{
 const segments=[{fromId:0,toId:1,length:Math.PI,penalty:1.08,direction:'both'},
 {fromId:0,toId:2,length:5,penalty:.92,direction:'forward'},
 {fromId:1,toId:2,length:9,penalty:1,direction:'reverse'}];
 const packed=packTraversalAdjacency(4,segments);
 const expected=Array.from({length:4},()=>[]);
 for(const s of segments){if(s.direction!=='reverse')expected[s.fromId].push([s.toId,s.length*s.penalty]);if(s.direction!=='forward')expected[s.toId].push([s.fromId,s.length*s.penalty]);}
 for(let n=0;n<4;n++)assert.deepEqual(Array.from({length:packed.offsets[n+1]-packed.offsets[n]},(_,i)=>{const p=packed.offsets[n]+i;return [packed.targets[p],packed.weights[p]];}),expected[n]);
 assert.equal(packed.weights.BYTES_PER_ELEMENT,8);
 assert.deepEqual([...packTraversalAdjacency(0,[]).offsets],[0]);
});

test('binary source lookup matches the original cumulative scan at corners and duplicate points',()=>{
 let seed=71;const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
 const points=[{x:0,z:0}],distances=[0];
 for(let i=1;i<700;i++){const a=points[i-1],b=i%17?{x:a.x+rand()*25,z:a.z+(rand()-.5)*25}:{...a};points.push(b);distances.push(distances[i-1]+Math.hypot(b.x-a.x,b.z-a.z));}
 const original=(start,end)=>{const mid=(start+end)*.5;let walked=0;for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1],length=Math.hypot(b.x-a.x,b.z-a.z);if(mid<=walked+length+1e-6||i===points.length-2)return{segmentIndex:i,startT:Math.max(0,Math.min(1,(start-walked)/Math.max(1e-6,length))),endT:Math.max(0,Math.min(1,(end-walked)/Math.max(1e-6,length)))};walked+=length;}};
 for(const d of [...distances,...Array.from({length:2000},()=>rand()*distances.at(-1))])for(const delta of [0,1e-7,2])assert.deepEqual(traversalSourceInterval(points,distances,d-delta,d+delta),original(d-delta,d+delta));
});

test('real route search retains one-way restrictions, walking and disconnected levels with packed graphs',()=>{
 const saved=ctx.traversalNetworks;let roads=[{pts:[{x:0,z:0},{x:100,z:0},{x:100,z:100}],width:12,driveable:true,transportGraphRef:{direction:'forward'}}];
 initWorldTraversal({enableLinearFeatures:()=>false,featureTraversalKey:f=>f.level||0,isFiniteWorldPointXZ:p=>Number.isFinite(p.x)&&Number.isFinite(p.z),isVehicleRoad:r=>r.driveable!==false,runtimeRoadFeatures:()=>roads});
 try{
  invalidateTraversalNetworks();const graph=buildTraversalNetworks();assert.ok(graph.drive.adjacency.offsets instanceof Uint32Array);
  const opts={mode:'drive',maxAnchorDistance:4};
  assert.equal(findTraversalRoute(0,0,100,100,opts)?.distance,200);
  assert.equal(findTraversalRoute(100,100,0,0,opts),null);
  assert.equal(findTraversalRoute(100,100,0,0,{...opts,mode:'walk'})?.distance,200);
  roads=[{...roads[0],pts:[{x:0,z:0},{x:100,z:0}]},{...roads[0],level:1,pts:[{x:100,z:0},{x:100,z:100}]}];
  invalidateTraversalNetworks();assert.equal(findTraversalRoute(0,0,100,100,opts),null);
 }finally{invalidateTraversalNetworks();ctx.traversalNetworks=saved;}
});

test('furniture publication releases its road index on success, failure and reset',async()=>{
 const source=(await readFile(new URL('../app/js/world/furniture.js',import.meta.url),'utf8')).replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\s*/gm,'').replaceAll('export function','function');
 const appCtx={roads:[],pois:[]};
 const context=vm.createContext({appCtx,THREE,performance,collectWorldVegetationPlacements:()=>[],buildWorldVegetationInstancing:()=>0,disposeVegetationBatch(){},createRoadsidePlacementResolver:roads=>({roads}),resetStreetLampFixtures(){}});
 vm.runInContext(source,context);
 context.generateStreetFurniture();assert.equal(vm.runInContext('roadsideResolver',context),null);
 appCtx.pois={forEach(){throw new Error('publication failed');}};
 assert.throws(()=>context.generateStreetFurniture(),/publication failed/);
 assert.equal(vm.runInContext('roadsideResolver',context),null);
 vm.runInContext('roadsideResolver={retainedRoads:[1,2,3]}',context);context.resetWorldFurnitureCaches();
 assert.equal(vm.runInContext('roadsideResolver',context),null);
});


test('world reset releases derived transport models as well as scene objects',async()=>{
 const source=(await readFile(new URL('../app/js/world/load-reset.js',import.meta.url),'utf8')).replace(/^import[^;]+;\s*/gm,'').replaceAll('export function','function');
 const keys=['transportNetworkModel','transportStructureModel','transportStructureAssembly','transportJunctionProfile','sharedTransportSurfacePresentation','tunnelSolidCompilation','structureProfileCompilation'];
 const appCtx={resetEarthStreaming(){},replaceWorldCollection(k){this[k]=[];},clearWorldCollections(keys){for(const k of keys)this[k]=[];}};
 let groundInvalidations=0;appCtx.GroundHeight={invalidate(){groundInvalidations++;}};
 for(const key of keys)appCtx[key]={oldWorldFeature:{}};
 const context=vm.createContext({appCtx,resetRoadMapIndex(){},resetRoadSearchIndex(){},releaseLocationModels(){},clearBuildingExteriorMaterialPool(){},clearBuildingExteriorDetails(){}});
 vm.runInContext(source,context);context.resetWorldForReload({showLoading:false});
 for(const key of keys)assert.equal(appCtx[key],null,key);
 assert.equal(groundInvalidations,1);
});

test('shared vegetation cells cull independently, re-enter view and keep LOD distances',async()=>{
 const {createVegetationCell}=await import('../app/js/world/vegetation-cell.js');
 const camera=new THREE.PerspectiveCamera(60,1,.1,3000);camera.updateMatrixWorld(true);
 const geometry=new THREE.BoxGeometry(2,8,2);geometry.userData.sharedRuntimeGeometry=true;
 const make=x=>{const cell=createVegetationCell(THREE);cell.position.set(x,0,-100);for(const d of [0,300]){const mesh=new THREE.InstancedMesh(geometry,new THREE.MeshBasicMaterial(),1);mesh.frustumCulled=false;cell.addLevel(mesh,d);}cell.addLevel(new THREE.Group(),1600);cell.includeBounds(new THREE.Box3(new THREE.Vector3(-2,-2,-2),new THREE.Vector3(2,8,2)));cell.updateMatrixWorld(true);return cell;};
 const a=make(0),b=make(1000);a.update(camera);b.update(camera);
 assert.equal(a.levels[0].object.visible,true);assert.ok(b.levels.every(l=>!l.object.visible));
 assert.equal(a.levels[0].object.geometry,b.levels[0].object.geometry);
 b.position.x=0;b.updateMatrixWorld(true);b.update(camera);assert.equal(b.levels[0].object.visible,true);
 a.position.z=-500;a.updateMatrixWorld(true);a.update(camera);assert.equal(a.levels[1].object.visible,true);assert.equal(a.levels[0].object.visible,false);
 a.position.z=-1700;a.updateMatrixWorld(true);a.update(camera);assert.equal(a.levels[2].object.visible,true);
 const source=(await readFile(new URL('../app/js/world/vegetation-models.js',import.meta.url),'utf8')).replace(/^import[^;]+;\s*/gm,'').replaceAll('export function','function');
 const context=vm.createContext({});vm.runInContext(source,context);
 let geometryDisposals=0,instanceDisposals=0;
 geometry.addEventListener('dispose',()=>geometryDisposals++);
 for(const l of a.levels)l.object.addEventListener('dispose',()=>instanceDisposals++);
 context.disposeVegetationBatch(a);assert.equal(geometryDisposals,0);assert.equal(instanceDisposals,2);
 b.update(camera);assert.equal(b.levels[0].object.visible,true);
});


test('road search reset drops old source roots and rebuilds for the next city',async()=>{
 const source=(await readFile(new URL('../app/js/world/navigation.js',import.meta.url),'utf8')).replace(/^import[^;]+;\s*/gm,'').replaceAll('export function','function');
 const roads=[{pts:[{x:0,z:0},{x:50,z:0}],width:10}], appCtx={roads};
 const context=vm.createContext({appCtx});vm.runInContext(source,context);
 vm.runInContext('rebuildRoadSearchIndexIfNeeded(); nearRoadResult.road=appCtx.roads[0]',context);
 assert.ok(vm.runInContext('roadSearchIndex.size',context)>0);
 context.resetRoadSearchIndex();
 for(const expression of ['roadSearchIndex.size','roadSearchFeatureSet.size'])assert.equal(vm.runInContext(expression,context),0);
 for(const expression of ['roadSearchBaseRef','nearRoadResult.road'])assert.equal(vm.runInContext(expression,context),null);
 appCtx.roads=[{pts:[{x:500,z:0},{x:550,z:0}],width:10}];
 vm.runInContext('rebuildRoadSearchIndexIfNeeded()',context);
 assert.equal(vm.runInContext('roadSearchFeatureSet.has(appCtx.roads[0])',context),true);
 assert.equal(vm.runInContext('roadSearchBaseRef',context),appCtx.roads);
});


test('minimap reset releases the entire previous road index before the next view',async()=>{
 const source=(await readFile(new URL('../app/js/map/earth-base.js',import.meta.url),'utf8')).replace(/export \{[^}]+\};/g,'').replace(/^import[^;]+;\s*/gm,'').replaceAll('export function','function');
 const context=vm.createContext({appCtx:{},roads:[{pts:[{x:0,z:0},{x:100,z:0}]}]});vm.runInContext(source,context);
 vm.runInContext('rebuildRoadMapIndex(roads)',context);assert.equal(vm.runInContext('roadMapIndex.source===roads',context),true);
 context.resetRoadMapIndex();assert.equal(vm.runInContext('roadMapIndex',context),null);
 vm.runInContext('rebuildRoadMapIndex(roads)',context);assert.equal(vm.runInContext('roadMapIndexIsCurrent(roads)',context),true);
});
