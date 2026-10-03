import * as THREE from 'three';
import {createVesselVisual} from '../app/js/transport/vessel-visual-recipe.js';
import {getMaritimeCatalogEntry} from '../app/js/transport/maritime-catalog.js';
import {parentHullCollision} from '../app/js/ocean/parent-vessel.js';
import test from 'node:test';import assert from 'node:assert/strict';
import {OCEAN_VOYAGE_KEY,createOceanVoyageStore,validateOceanVoyage} from '../app/js/ocean/voyage-store.js';
import {ensureOceanVoyage} from '../app/js/ocean/voyage.js';
import {createBoatOceanTransferApi} from '../app/js/boat-mode/ocean-transfer.js';
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)}};
const record=()=>({version:1,id:'voyage-1',subId:'sub-1',revision:0,savedAt:100,stage:'underwater',site:{lat:10,lon:20,name:'Sea',region:'Ocean'},ship:{transportEntityId:'ship-1',transportCatalogId:'ocean-research-vessel',condition:.8,yaw:.5,anchor:{lat:10,lon:20}},sub:{x:1,y:-20,z:-52,yaw:.5,condition:.7},waveOffset:{x:100,z:300}});
test('voyage store validates finite coordinates and preserves malformed/future saves',()=>{
 const storage=memory(),store=createOceanVoyageStore({storage,now:()=>200});assert.equal(store.read(),null);assert.equal(store.write(record()).saved,true);assert.equal(store.read().revision,1);
 for(const mutate of [v=>v.site.lat=91,v=>v.sub.x=Infinity,v=>v.ship.condition=-1,v=>v.version=2,v=>v.subId='',v=>v.waveOffset.z=NaN]){const value=record();mutate(value);assert.equal(validateOceanVoyage(value),null);}
 storage.setItem(OCEAN_VOYAGE_KEY,JSON.stringify({...record(),version:9}));assert.equal(store.read(),null);const before=storage.getItem(OCEAN_VOYAGE_KEY);assert.equal(store.write(record()).saved,false);assert.equal(storage.getItem(OCEAN_VOYAGE_KEY),before);
});
test('another tab cannot silently replace a newer voyage, and quota failures preserve saved data',()=>{
 const storage=memory(),a=createOceanVoyageStore({storage}),b=createOceanVoyageStore({storage});a.read();b.read();assert.equal(a.write(record()).saved,true);assert.equal(b.write(record()).reason,'conflict');
 const quota=createOceanVoyageStore({storage:{getItem:storage.getItem,setItem(){throw Error('quota')}}});const before=quota.read();assert.equal(quota.write({...before,sub:{...before.sub,x:200}}).saved,false);assert.deepEqual(a.read(),before);
});
test('same ship/sub identity survives saved dive, recovery, re-launch and local reload without touching inventory',()=>{
 const storage=memory(),store=createOceanVoyageStore({storage});
 const ctx={boatMode:{},backpack:{cargo:['sample-original']},oceanMode:{active:true,launchSite:{lat:10,lon:20,name:'Sea'},waveOffset:{x:2,z:3},submarine:{position:{x:0,y:-20,z:-52},yaw:.5}}};
 const voyage=ensureOceanVoyage(ctx,{store});voyage.begin({},ctx.oceanMode);const ship={...voyage.current.ship},subId=voyage.current.subId;
 ctx.oceanMode.submarine.position.x=80;voyage.checkpoint();voyage.surfaced();assert.equal(voyage.current.stage,'aboard');
 voyage.begin({parentVessel:ship},ctx.oceanMode);assert.equal(voyage.current.subId,subId);assert.equal(voyage.current.ship.transportEntityId,ship.transportEntityId);
 const restored=createOceanVoyageStore({storage}).read();assert.equal(restored.sub.x,80);assert.deepEqual(ctx.backpack,{cargo:['sample-original']});assert.equal(Object.hasOwn(restored,'backpack'),false);
 const replacement={...ctx,oceanVoyage:null,boatMode:{},oceanMode:{...ctx.oceanMode,submarine:{...ctx.oceanMode.submarine}}};ensureOceanVoyage(replacement,{store:createOceanVoyageStore({storage})}).begin({voyageResume:restored},replacement.oceanMode);assert.equal(replacement.oceanMode.submarine.transportEntityId,subId);assert.equal(replacement.oceanMode.condition,restored.sub.condition);
});
function transferFixture(){
 const water={waterKind:'open_ocean',source:{synthetic:true,waveOffset:{x:300,z:700}}},calls=[];
 const ctx={LOC:{lat:10,lon:20},SCALE:100000,ENV:{EARTH:'EARTH'},getEnv:()=> 'EARTH',boat:{x:12,z:18,angle:.7},boatMode:{active:true,currentWater:water,transportEntityId:'ship-1',transportCatalogId:'ocean-research-vessel',condition:.8,mesh:{visible:true}},oceanMode:{active:false},startOceanMode:async opts=>{calls.push(opts);return false}};
 let restores=0;const api=createBoatOceanTransferApi({appCtx:ctx,canDiveBoatMode:()=>true,captureEarthWorldSession(){},setPromptSignature(){},showBoatPrompt(){},hideBoatPrompt(){},resetBoatDynamics(){},resetBoatFoamFx(){},updateWaterWaveVisuals(){},updateBoatMenuUi(){},startBoatMode:opts=>{restores++;assert.equal(opts.candidate,water);ctx.boatMode.active=true;return true}});
 return {ctx,api,calls,restores:()=>restores};
}
test('rejected submarine launches restore original vessel and retain water phase before suspension',async()=>{
 const f=transferFixture();assert.equal(await f.api.transferBoatToSubmarine(),false);assert.equal(f.restores(),1);assert.equal(f.ctx.boatMode.active,true);assert.deepEqual(f.calls[0].waveOffset,{x:312,z:718});assert.ok(Math.hypot(f.calls[0].submarinePose.x,f.calls[0].submarinePose.z)>=51);assert.equal(f.ctx.boatMode.oceanTransferVessel,undefined);
});
test('duplicate launch and a changed region during loading cannot create or revive old vessels',async()=>{
 const f=transferFixture();let release;f.ctx.showTransitionLoad=()=>new Promise(resolve=>release=resolve);const pending=f.api.transferBoatToSubmarine();assert.equal(await f.api.transferBoatToSubmarine(),false);f.ctx.LOC={lat:30,lon:40};release();assert.equal(await pending,false);assert.equal(f.calls.length,0);assert.equal(f.restores(),0);
});

test('parent hull is closed from outside and rejects submerged hull overlaps at rotated headings',()=>{
 const ship=record().ship,catalog=getMaritimeCatalogEntry(ship.transportCatalogId),visual=createVesselVisual(THREE,catalog);visual.root.updateMatrixWorld(true);
 const hits=new THREE.Raycaster(new THREE.Vector3(0,-1,-100),new THREE.Vector3(0,0,1)).intersectObject(visual.root,true);assert.ok(hits.length);assert.ok(Math.abs(hits[0].point.z+39*1.002)<1e-6);assert.ok(hits[0].face.normal.z<-.9);visual.dispose();
 assert.equal(parentHullCollision(ship,{x:0,y:-3,z:0},1),true);assert.equal(parentHullCollision(ship,{x:0,y:-30,z:0},1),false);
 const distance=51;assert.equal(parentHullCollision(ship,{x:-Math.sin(ship.yaw)*distance,y:-8.5,z:-Math.cos(ship.yaw)*distance},3),false);
});
test('surface spawn failure preserves the submarine, failed handoff rolls back, and duplicates stay single-flight',async()=>{
 const originalDocument=globalThis.document;globalThis.document={getElementById:()=>null};
 try{
  const f=transferFixture();Object.assign(f.ctx.boatMode,{active:false});f.ctx.oceanMode={active:true,launchSite:{lat:10,lon:20,name:'Sea'},waveOffset:{x:300,z:700},submarine:{position:{x:40,y:-20,z:60},yaw:.7}};
  let exits=0,starts=0,resolveLoad;
  const common={appCtx:f.ctx,buildSyntheticBoatCandidate:()=>null,setPromptSignature(){},showBoatPrompt(){},hideBoatPrompt(){},resetBoatDynamics(){},resetBoatFoamFx(){},updateWaterWaveVisuals(){},updateBoatMenuUi(){},startBoatMode:()=>false};
  f.ctx.exitCurrentEnvironmentSync=()=>{exits++;f.ctx.oceanMode.active=false};
  assert.equal(await createBoatOceanTransferApi(common).transferSubmarineToBoat(),false);assert.equal(exits,0);assert.equal(f.ctx.oceanMode.active,true);
  f.ctx.showTransitionLoad=()=>new Promise(r=>resolveLoad=r);f.ctx.startOceanMode=async options=>{starts++;assert.deepEqual(options.submarinePose,{x:40,y:-20,z:60,yaw:.7});assert.deepEqual(options.waveOffset,{x:300,z:700});f.ctx.oceanMode.active=true;return true};
  const api=createBoatOceanTransferApi({...common,buildSyntheticBoatCandidate:()=>({spawnX:0,spawnZ:0,waterKind:'open_ocean'})});
  const pending=api.transferSubmarineToBoat();assert.equal(await api.transferSubmarineToBoat(),false);resolveLoad();assert.equal(await pending,false);assert.equal(starts,1);assert.equal(f.ctx.oceanMode.active,true);
 }finally{globalThis.document=originalDocument;}
});
test('surface checkpoints retain a moved ship anchor and air/gear stay outside the voyage inventory contract',()=>{
 const storage=memory(),ctx={LOC:{lat:10,lon:20},SCALE:100000,boat:{x:100,z:200,angle:1},boatMode:{},oceanMode:{active:true,launchSite:{lat:10,lon:20},waveOffset:{x:0,z:0},submarine:{position:{x:0,y:-10,z:62},yaw:0}}};
 const voyage=ensureOceanVoyage(ctx,{store:createOceanVoyageStore({storage})});voyage.begin({},ctx.oceanMode);const subId=voyage.current.subId;voyage.surfaced();ctx.oceanMode.active=false;Object.assign(ctx.boatMode,{active:true,transportEntityId:voyage.current.ship.transportEntityId,condition:.75,currentWater:{source:{waveOffset:{x:7,z:9}}}});assert.equal(voyage.surfaceCheckpoint(),true);
 assert.equal(voyage.saved.subId,subId);assert.equal(voyage.saved.ship.condition,.75);assert.equal(voyage.saved.site.lat,9.998);assert.deepEqual(voyage.saved.waveOffset,{x:107,z:209});assert.deepEqual(voyage.saved.ship.anchor,{lat:voyage.saved.site.lat,lon:voyage.saved.site.lon});
});
