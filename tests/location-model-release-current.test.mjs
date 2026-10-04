import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {releaseLocationModels} from '../app/js/world/release-location-models.js';

test('reset retires location models and callbacks that outlive render collections',()=>{
  const oldRoad={pts:[{x:1,z:2},{x:3,z:4}]},oldBuilding={id:'old-building'};
  const ctx={transportNetworkModel:{features:[oldRoad]},transportStructureModel:{id:'old'},transportJunctionProfile:{nodes:[oldRoad]},
    poiLifecycle:{byBuilding:new Map([[oldBuilding,[]]])},refreshActiveFunctionalPois:()=>[oldBuilding],
    functionalPoiRecords:[oldBuilding],activeFunctionalPois:[oldBuilding],poiTenanciesByBuilding:new Map([[oldBuilding,[]]]),
    settings:{volume:.4}};
  releaseLocationModels(ctx);
  assert.equal(ctx.transportNetworkModel,null);assert.equal(ctx.transportStructureModel,null);
  assert.equal(ctx.transportJunctionProfile,null);assert.equal(ctx.poiLifecycle,null);assert.equal(ctx.refreshActiveFunctionalPois,null);
  assert.deepEqual(ctx.activeFunctionalPois,[]);assert.deepEqual(ctx.functionalPoiRecords,[]);assert.equal(ctx.poiTenanciesByBuilding.size,0);
  assert.deepEqual(ctx.settings,{volume:.4});
  releaseLocationModels(ctx);assert.equal(ctx.transportNetworkModel,null);
});

test('the full reset invokes model retirement after runtime consumers stop',()=>{
  const source=readFileSync(new URL('../app/js/world/load-reset.js',import.meta.url),'utf8');
  assert.ok(source.indexOf('releaseLocationModels(appCtx)')>source.indexOf("disposeWorldDiscoveryRuntime?.('world_reload')"));
});

test('disposed living-world samplers retire feature ownership and reject later use', async()=>{
  const {createTrafficVehicleSurfaceSampler,disposeLivingWorldRuntime}=await import('../app/js/living-world/runtime.js');
  const road={pts:[{x:0,z:0},{x:20,z:0}]};
  const trafficCompilation={runtimeFeatureByEdge:new Map([['edge',road]])};
  const pedestrianCompilation={runtimeFeatureByEdge:new Map([['foot',road]])};
  let samples=0,stopped=0,disposed=0;
  const ctx={sampleFeatureSurfaceY:()=>{samples++;return 8;},unregisterRuntimeOwner:()=>stopped++};
  const sampleVehicleSurface=createTrafficVehicleSurfaceSampler(ctx,trafficCompilation);
  const edge={id:'edge',sourceSegmentIndex:0,p1:{x:0,y:8,z:0},p2:{x:20,y:8,z:0},length:20};
  assert.equal(sampleVehicleSurface(edge,1,0),8.08);
  ctx.livingWorldRuntime={owner:'living-test',trafficCompilation,pedestrianCompilation,sampleVehicleSurface,population:{dispose:()=>disposed++}};
  assert.equal(disposeLivingWorldRuntime(ctx),true);
  assert.equal(trafficCompilation.runtimeFeatureByEdge.size,0);assert.equal(pedestrianCompilation.runtimeFeatureByEdge.size,0);
  const before=samples;assert.ok(Number.isNaN(sampleVehicleSurface(edge,1,0)));assert.equal(samples,before);
  assert.equal(disposeLivingWorldRuntime(ctx),false);assert.equal(stopped,1);assert.equal(disposed,1);
});

test('retained condition accessors depend only on their condition authority',async()=>{
  const {bindPlayerConditionAuthority}=await import('../app/js/urban-sandbox/player-condition-binding.js');
  let condition=.8,reason;
  const authority={snapshot:()=>({condition}),set:(value,source)=>{condition=value;reason=source;}};
  const state={playerConditionAuthority:authority,population:{city:'retired'}};
  bindPlayerConditionAuthority(state);
  const descriptor=Object.getOwnPropertyDescriptor(state,'playerCondition');
  delete state.playerConditionAuthority;delete state.population;
  descriptor.set(.4);assert.equal(descriptor.get(),.4);assert.equal(reason,'urban-runtime');
  assert.equal(descriptor.enumerable,true);assert.equal(descriptor.configurable,true);
});

test('disposed population accepts late frames without invoking world callbacks',async()=>{
  const THREE=await import('three'),prior=globalThis.THREE;globalThis.THREE=THREE;
  try{
    const {createLivingWorldPopulation}=await import('../app/js/living-world/population.js');
    const graph={nodes:[],edges:[]};let calls=0;
    const population=createLivingWorldPopulation({pedestrianGraph:graph,trafficGraph:graph,getReferencePosition:()=>{calls++;return {x:0,z:0};}});
    population.dispose();population.dispose();const before=calls;
    population.fixedUpdate(2);assert.equal(calls,before);
    assert.deepEqual(population.vehicleSnapshots(),[]);assert.deepEqual(population.pedestrianSnapshots(),[]);
    assert.deepEqual(population.pickableRoots(),[]);assert.equal(population.group.children.length,0);
  }finally{globalThis.THREE=prior;}
});

test('cleared water cache cannot raycast retired world meshes',async()=>{
  const THREE=await import('three'),prior=globalThis.THREE;globalThis.THREE=THREE;
  const {ctx}=await import('../app/js/shared-context.js?v=55');const previous=ctx.landuseMeshes;
  const {syncWaterMeshCache,clearWaterMeshCache,waterSurfaceBaseYAt}=await import('../app/js/boat-mode/water-query.js?v=21');
  try{
    let hits=0;const mesh=new THREE.Object3D();mesh.userData.landuseType='water';
    mesh.raycast=(_,results)=>{hits++;results.push({distance:1,point:new THREE.Vector3(0,7,0),object:mesh});};
    ctx.landuseMeshes=[mesh];syncWaterMeshCache();assert.equal(waterSurfaceBaseYAt(0,0),7);
    clearWaterMeshCache();const before=hits;waterSurfaceBaseYAt(0,0);assert.equal(hits,before);
  }finally{clearWaterMeshCache();ctx.landuseMeshes=previous;globalThis.THREE=prior;}
});
