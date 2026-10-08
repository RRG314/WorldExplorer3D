import test from 'node:test';import assert from 'node:assert/strict';
import {createRegionalSceneryScheduler} from '../app/js/terrain/regional-scenery-scheduler.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
test('travel updates beyond the old origin, with one in-flight publication and no per-frame rebuild',async()=>{
 const jobs=[],s=createRegionalSceneryScheduler({request:anchor=>{const job=deferred();jobs.push({anchor,...job});return job.promise;}});
 assert.equal(s.step({x:5999,z:0}),null);const first=s.step({x:8000,z:0});await Promise.resolve();
 assert.equal(s.step({x:16000,z:-16000}),first);assert.equal(jobs.length,1);assert.deepEqual(s.snapshot().anchor,{x:0,z:0});
 jobs[0].resolve();await first;assert.deepEqual(s.snapshot().anchor,{x:8000,z:0});
 const second=s.step({x:16000,z:-16000});await Promise.resolve();assert.deepEqual(jobs[1].anchor,{x:16000,z:-16000});jobs[1].resolve();await second;
 assert.equal(s.step({x:16001,z:-16000}),null);
});
test('failure retains the prior region, backs off and retries the same location',async()=>{
 let clock=0,calls=0;const s=createRegionalSceneryScheduler({now:()=>clock,request:()=>{if(++calls===1)throw Error('offline');}});
 await s.step({x:16000,z:0});assert.deepEqual(s.snapshot().anchor,{x:0,z:0});assert.match(s.snapshot().error,/offline/);
 assert.equal(s.step({x:16000,z:0}),null);clock=15001;await s.step({x:16000,z:0});assert.deepEqual(s.snapshot().anchor,{x:16000,z:0});assert.equal(s.snapshot().error,'');
});
test('location reset rejects stale completion and permits the new world to request immediately',async()=>{
 const jobs=[];const s=createRegionalSceneryScheduler({request:()=>{const d=deferred();jobs.push(d);return d.promise;}});
 const old=s.step({x:16000,z:0});await Promise.resolve();s.reset();const fresh=s.step({x:0,z:16000});await Promise.resolve();
 jobs[0].resolve();await old;assert.deepEqual(s.snapshot().anchor,{x:0,z:0});assert.equal(s.snapshot().pending,true);
 jobs[1].resolve();await fresh;assert.deepEqual(s.snapshot().anchor,{x:0,z:16000});
});
test('turning travel scenery off restores the fixed location, then stays fixed; turning it on resumes',async()=>{
 const requests=[];const s=createRegionalSceneryScheduler({request:p=>requests.push(p)});await s.step({x:16000,z:0});s.setEnabled(false);await s.step({x:16000,z:0});
 assert.deepEqual(requests,[{x:16000,z:0},{x:0,z:0}]);assert.equal(s.step({x:24000,z:0}),null);s.setEnabled(true);await s.step({x:24000,z:0});assert.equal(requests.length,3);
});
test('return travel reloads the origin and invalid positions do no work',async()=>{
 const s=createRegionalSceneryScheduler({request:()=>{}});assert.equal(s.step({x:NaN,z:0}),null);await s.step({x:-16000,z:12000});await s.step({x:0,z:0});assert.deepEqual(s.snapshot().anchor,{x:0,z:0});
});


test('travelling terrain axes stay inside the moving region after leaving the starting district',async()=>{
 const {buildClipmapAxis}=await import('../app/js/terrain/far-field-geometry.js');
 for(const [min,max] of [[-22000,22000],[18000,62000],[-62000,-18000]]){
  const axis=buildClipmapAxis(min,-3500,3500,max,320,40);
  assert.equal(axis[0],min);assert.equal(axis.at(-1),max);
  assert.ok(axis.every((x,i)=>x>=min&&x<=max&&(i===0||x>axis[i-1])));
  assert.ok(axis.length<330,'A moving region must not grow a dense strip back to its old origin');
 }
});

test('regional building colors use the existing exterior catalog while preserving mapped heights',async()=>{
 const {resolveFarBuildingMassing}=await import('../app/js/terrain/far-building-massing.js');
 const {selectBuildingExteriorProfile}=await import('../app/js/world/building-exterior-catalog.js');
 const {buildingSeedFromIdentity}=await import('../app/js/building-semantics.js');
 const colors=new Set();
 for(let i=0;i<30;i++){
  const b={identity:`source-house-${i}`,centerLat:39.4347,centerLon:-76.6912,widthMeters:8,depthMeters:12,properties:{building:'house',height:8}};
  const result=resolveFarBuildingMassing(b,null,96,1);assert.equal(result.heightMeters,8);
  const profile=selectBuildingExteriorProfile({tags:b.properties,buildingType:'house',buildingSeed:buildingSeedFromIdentity(b.identity),buildingIdentity:b.identity,heightMeters:8,footprintArea:96,footprintWidth:8,footprintDepth:12,geographicCenter:{lat:b.centerLat,lon:b.centerLon},location:{lat:b.centerLat,lon:b.centerLon},detailTier:'low'});
  const linear=c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4;
  assert.deepEqual(result.color,[16,8,0].map(shift=>linear(((profile.material.color>>shift)&255)/255)));
  colors.add(result.color.join(','));
 }
 assert.ok(colors.size>=3,'The regional district must not collapse to one gray material');
});


test('travel cannot replace a complete region with missing map tiles or a truncated building budget',async()=>{
 const {requireCompleteTravelScenery}=await import('../app/js/terrain/regional-scenery-scheduler.js');
 const good={sourceCoverageComplete:true,buildingBudgetExceeded:false,waterTilesLoaded:4,waterTilesRequested:4};
 assert.doesNotThrow(()=>requireCompleteTravelScenery(good));
 for(const changed of [{sourceCoverageComplete:false},{buildingBudgetExceeded:true},{waterTilesLoaded:3}])assert.throws(()=>requireCompleteTravelScenery({...good,...changed}),/retaining/);
});


test('small high-latitude windows move before the actor can cross their coverage edge',async()=>{
 const requests=[],s=createRegionalSceneryScheduler({request:p=>requests.push(p)});
 await s.step({x:700,z:0},600);assert.equal(requests.length,1);
 assert.equal(s.snapshot().anchor.x,600);assert.equal(s.step({x:750,z:0},600),null);
 await s.step({x:1300,z:0},600);assert.equal(s.snapshot().anchor.x,1200);
});


test('scenery preference survives a menu choice made before lazy Earth startup and tolerates unavailable storage',async()=>{
 const {readRegionalSceneryPreference:read,writeRegionalSceneryPreference:write}=await import('../app/js/terrain/regional-scenery-scheduler.js');
 const entries=new Map(),storage={getItem:key=>entries.get(key),setItem:(key,value)=>entries.set(key,value)};
 assert.equal(read(storage),true);write(false,storage);assert.equal(read(storage),false);
 write(true,storage);assert.equal(read(storage),true);
 const denied={getItem(){throw Error('denied');},setItem(){throw Error('denied');}};
 assert.equal(read(denied),true);assert.doesNotThrow(()=>write(false,denied));
});
