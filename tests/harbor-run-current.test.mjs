import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { HARBOR_RUN, normalizeHarborRun, transitionHarborRun, harborRunBadge } from '../app/js/campaign/harbor-run.js';
import { createMemoryDiscoveryProfileStore } from '../app/js/discovery/profile-store.js';
import { validatePhysicalDeliveryRoute, buildDeliveryOffers, deliveryFixtureClear, findVehicleLoadingStop } from '../app/js/campaign/delivery-routes.js';
const p=(lat=39)=>({lat,lon:-76,y:10});
const route={id:'route-a',regionId:'baltimore',regionLabel:'Baltimore',environment:'EARTH',distance:222,turns:1,pickup:p(),dropoff:p(39.002),pickupCase:p(),dropoffCase:p(39.002),points:[p(),p(39.001),p(39.002)],destinationLabel:'Waterfront loading zone'};
const evidence=(point=p(),patch={})=>({...point,environment:'EARTH',regionId:'baltimore',mode:'drive',road:true,speed:0,continuous:true,...patch});
const begin=()=>transitionHarborRun({}, {type:'accept',revision:0,route},1000);
const apply=(state,type,extra={})=>transitionHarborRun(state,{type,revision:state.revision,...extra},2000);
async function complete(store) {
 let s=await store.updateHarborRun({type:'accept',revision:0,route});
 s=await store.updateHarborRun({type:'load',revision:s.revision,evidence:evidence()});
 for(let i=0;i<route.points.length;i++)s=await store.updateHarborRun({type:'reach',revision:s.revision,pointIndex:i,evidence:evidence(route.points[i])});
 return store.updateHarborRun({type:'unload',revision:s.revision,evidence:evidence(route.dropoff)});
}
test('delivery requires explicit acceptance and preserves a newer schema',()=>{
 assert.equal(normalizeHarborRun().phase,'available');
 const future={schemaVersion:2,route:{future:true},revision:5};assert.deepEqual(normalizeHarborRun(future),future);
 assert.throws(()=>transitionHarborRun(future,{type:'accept',revision:5,route}),/newer/);
 assert.throws(()=>transitionHarborRun({}, {type:'accept',revision:0,route:{...route,points:[]}}),/route/);
});
test('only a stopped car beside the case can take custody; another layer cannot',()=>{
 const s=begin();
 for(const patch of [{speed:4},{mode:'walk'},{road:false},{y:45},{regionId:'elsewhere'},{lat:39.1},{speed:NaN}])assert.throws(()=>apply(s,'load',{evidence:evidence(p(),patch)}),/Stop/);
 const loaded=apply(s,'load',{evidence:evidence()});assert.equal(loaded.cargo,'in-vehicle');assert.equal(s.cargo,'at-pickup');
 assert.throws(()=>apply(loaded,'accept',{route}),/already/);
});
test('driving requires ordered road gates with continuous travel; cannot fly, teleport or skip',()=>{
 const s=apply(begin(),'load',{evidence:evidence()});
 for(const [pointIndex,patch] of [[1,{}],[0,{continuous:false}],[0,{mode:'plane'}],[0,{road:false}],[0,{y:20}]])assert.throws(()=>apply(s,'reach',{pointIndex,evidence:evidence(route.points[pointIndex],patch)}),/marked road/);
 const next=apply(s,'reach',{pointIndex:0,evidence:evidence()});assert.equal(next.nextPoint,1);assert.equal(next.phase,'driving');
 assert.throws(()=>apply(next,'unload',{evidence:evidence(route.dropoff)}),/Stop/);
});
test('all gates plus explicit stationary unload are needed to earn the badge',()=>{
 let s=apply(begin(),'load',{evidence:evidence()});
 for(let i=0;i<route.points.length;i++)s=apply(s,'reach',{pointIndex:i,evidence:evidence(route.points[i])});
 assert.equal(s.phase,'unload');assert.equal(harborRunBadge(s),null);
 assert.throws(()=>apply(s,'unload',{evidence:evidence(route.dropoff,{speed:10})}),/Stop/);
 s=apply(s,'unload',{evidence:evidence(route.dropoff)});assert.equal(harborRunBadge(s).id,'harbor-driver');assert.equal(s.cargo,'delivered');
});
test('one saved receipt, no duplicate XP/currency or overwrite from stale tabs',async()=>{
 const store=createMemoryDiscoveryProfileStore();const before=await store.getProfile();const done=await complete(store);
 const attempts=await Promise.allSettled([store.updateHarborRun({type:'unload',revision:done.revision,evidence:evidence(route.dropoff)}),store.updateHarborRun({type:'load',revision:1,evidence:evidence()})]);
 assert.equal(attempts[1].status,'rejected');
 assert.equal((await store.listEvents()).filter(e=>e.eventId===HARBOR_RUN.receiptId).length,1);
 const after=await store.getProfile();assert.deepEqual(after.characterState,before.characterState);assert.deepEqual(after.explorerProgress,before.explorerProgress);
});
test('cargo and exact route survive export/import; damaged completion does not replace records',async()=>{
 const store=createMemoryDiscoveryProfileStore();let s=await store.updateHarborRun({type:'accept',revision:0,route});
 s=await store.updateHarborRun({type:'load',revision:s.revision,evidence:evidence()});
 const copy=createMemoryDiscoveryProfileStore();await copy.importData(await store.exportData());assert.deepEqual((await copy.getProfile()).harborRun,s);
 const finished=createMemoryDiscoveryProfileStore();await complete(finished);const data=await finished.exportData();await copy.importData(data);
 data.events=[];await assert.rejects(copy.importData(data),/incomplete/);assert.equal((await copy.getProfile()).harborRun.phase,'complete');
});
test('physical route sampling rejects missing road, building intersections and excessive grades',()=>{
 const context={SurfaceQuery:{driveAt:(x,z)=>({kind:'road',position:{y:10}})},checkBuildingCollision:()=>({collision:false})};
 const path=[{x:0,z:0},{x:210,z:0}];const valid=validatePhysicalDeliveryRoute(context,path);assert.equal(valid.distance,210);assert.ok(valid.points.length>=10);
 for(const change of [ {SurfaceQuery:{driveAt:()=>({kind:'terrain',position:{y:10}})}}, {checkBuildingCollision:()=>({collision:true})}, {SurfaceQuery:{driveAt:x=>({kind:'road',position:{y:x*.5}})}} ])assert.equal(validatePhysicalDeliveryRoute({...context,...change},path),null);
});

test('delivery imports the initialized version of the sole road router',()=>{
 const world=readFileSync(new URL('../app/js/world.js',import.meta.url),'utf8');
 const delivery=readFileSync(new URL('../app/js/campaign/delivery-routes.js',import.meta.url),'utf8');
 const version=world.match(/world\/traversal\.js(\?v=\d+)/)[1];
 assert.ok(delivery.includes(`world/traversal.js${version}`));
});

test('a virtual delivery is not offered during Live GPS play',()=>{
 assert.deepEqual(buildDeliveryOffers({getLiveGpsSnapshot:()=>({active:true}),getEnv:()=> 'EARTH'}, {regionId:'baltimore'}),[]);
});
test('inconsistent in-transit cargo backup is rejected without erasing the current save',async()=>{
 const store=createMemoryDiscoveryProfileStore();await store.updateHarborRun({type:'accept',revision:0,route});
 const saved=await store.exportData();const bad=structuredClone(saved);
 Object.assign(bad.profile.harborRun,{phase:'unload',cargo:'in-vehicle',loadedAt:1000,nextPoint:0});
 await assert.rejects(store.importData(bad),/incomplete/);assert.deepEqual((await store.getProfile()).harborRun,saved.profile.harborRun);
});

test('cargo cannot occupy a previously placed street pole or other fixture',()=>{
 const fixtures=[{position:{x:10,z:20}},{userData:{furniturePos:{x:100,z:120}},position:{x:0,z:0}}];
 assert.equal(deliveryFixtureClear(10.5,20.5,fixtures),false);
 assert.equal(deliveryFixtureClear(101,121,fixtures),false);
 assert.equal(deliveryFixtureClear(14,20,fixtures),true);
});

test('loading stops use the actual tapered road support, not the nominal width',()=>{
 const ctx={SurfaceQuery:{driveAt:(x,z)=>Math.abs(z)<=1?{kind:'road',position:{y:10}}:{kind:'terrain',position:{y:10}}},checkBuildingCollision:()=>({collision:false})};
 const placement={x:0,z:6,centerX:0,centerZ:0,road:{width:10},segmentIndex:0};
 const stop=findVehicleLoadingStop(ctx,placement,10);assert.ok(stop&&stop.z<=1);assert.equal(stop.y,10);
 assert.equal(findVehicleLoadingStop({...ctx,checkBuildingCollision:()=>({collision:true})},placement,10),null);
 assert.equal(findVehicleLoadingStop(ctx,{...placement,z:20},10),null,'Do not offer unreachable distant cargo');
});
