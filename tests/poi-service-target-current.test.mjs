import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {stableVehicleIdentity,parseUpgradeServiceId} from '../app/js/transport/vehicle-upgrades.js';
import {createCompanionRuntime} from '../app/js/discovery/companion-runtime.js';
import {createStarterCompanionInstance,createCompanionInstance} from '../app/js/discovery/companions.js';
// Execute the actual two runtime functions with their existing domain imports.
// DOM/world rendering is outside this target/receipt race characterization.
const source=await readFile(new URL('../app/js/urban-sandbox/runtime.js',import.meta.url),'utf8');
const start=source.indexOf('function poiServiceTargetId('),end=source.indexOf('function releasePromotedNpc(',start);
assert.ok(start>=0&&end>start);
function services(appCtx){return vm.runInNewContext(source.slice(start,end)+'\n({applyPoiService,poiServiceTargetId})',{appCtx,parseUpgradeServiceId,stableVehicleIdentity,now:()=>1});}
for(const kind of ['vehicle','vessel','companion'])test(`delayed first service receipt cannot affect a replacement ${kind}`,async()=>{
 let calls=0;
 const app={car:{vehicleIdentity:'replacement',condition:.2},boatMode:{transportEntityId:'replacement',condition:.2},worldDiscoveryRuntime:{companionRuntime:{snapshot:()=>({activeInstanceId:'replacement'}),care:async()=>{calls++;return true;},awardXp:async()=>{calls++;return {awarded:true};}}}};
 const {applyPoiService}=services(app);
 const id={vehicle:'vehicle-full-repair',vessel:'vessel-full-repair',companion:'companion-wellness'}[kind];
 assert.equal(await applyPoiService({}, {id}, 'receipt-a', {recovery:false,targetId:'original'}),null);
 assert.equal(app.car.condition,.2);assert.equal(app.boatMode.condition,.2);assert.equal(calls,0);
});
test('companion care binds its delayed XP to the treated companion and never confirms a failed save',async()=>{
 let active='original',awardTarget;
 const runtime={snapshot:()=>({activeInstanceId:active}),care:async()=>{active='replacement';return true;},awardXp:async(_award,target)=>{awardTarget=target;return {awarded:true};}};
 const {applyPoiService}=services({worldDiscoveryRuntime:{companionRuntime:runtime}});
 assert.equal(await applyPoiService({}, {id:'companion-wellness'}, 'receipt-a',{targetId:'original'}),true);
 assert.equal(awardTarget,'original');
 active='original';runtime.awardXp=async()=>false;
 assert.equal(await applyPoiService({}, {id:'companion-wellness'}, 'receipt-a',{targetId:'original'}),null);
});
test('missing companion care does not award XP or report service success',async()=>{
 let awards=0;const runtime={snapshot:()=>({activeInstanceId:'original'}),care:async()=>false,awardXp:async()=>{awards++;return {awarded:true};}};
 assert.equal(await services({worldDiscoveryRuntime:{companionRuntime:runtime}}).applyPoiService({}, {id:'companion-wellness'}, 'receipt-a',{targetId:'original'}),false);
 assert.equal(awards,0);
});
test('real companion owner awards an explicit target once even after selection changes',async()=>{
 const a={...createStarterCompanionInstance({profileIdentity:'test'}),active:true},b={...createCompanionInstance('trail-hound',{worldIdentity:'test',discoveryId:'b'}),active:false};
 const rows=new Map([[a.instanceId,a],[b.instanceId,b]]);
 const profileStore={listCompanions:async()=>[...rows.values()],saveCompanion:async(value,update)=>{const next=update?update(rows.get(value.instanceId)):value;rows.set(next.instanceId,next);return next;},setActiveCompanion:async id=>{for(const [key,value] of rows)rows.set(key,{...value,active:key===id});}};
 const runtime=await createCompanionRuntime({}, {profileStore});
 try {
  await runtime.setActive(b.instanceId);
  const award={receiptId:'poi-care:receipt-a',reasonId:'care-after-outing'};
  assert.equal((await runtime.awardXp(award,a.instanceId)).awarded,true);
  assert.equal(rows.get(a.instanceId).progression.totalXp,5);assert.equal(rows.get(b.instanceId).progression.totalXp,0);
  assert.equal((await runtime.awardXp(award,a.instanceId)).reason,'already-awarded');
  assert.equal((await runtime.awardXp({...award,receiptId:'next'})).awarded,true);
  assert.equal(rows.get(b.instanceId).progression.totalXp,5);
 } finally {runtime.dispose();}
});

test('delayed companion care preserves a concurrent selection and progression update',async()=>{
 const a={...createStarterCompanionInstance({profileIdentity:'care-race'}),active:true},b={...createCompanionInstance('trail-hound',{worldIdentity:'care-race',discoveryId:'b'}),active:false};
 const rows=new Map([[a.instanceId,a],[b.instanceId,b]]);let block=false,release,started;
 const gate=new Promise(resolve=>release=resolve),began=new Promise(resolve=>started=resolve);
 const profileStore={listCompanions:async()=>[...rows.values()],saveCompanion:async(value,update)=>{
  if(block){block=false;started();await gate;}
  const next=update?update(rows.get(value.instanceId)):value;rows.set(next.instanceId,next);return next;
 },setActiveCompanion:async id=>{for(const [key,value] of rows)rows.set(key,{...value,active:key===id});}};
 const runtime=await createCompanionRuntime({}, {profileStore});
 try {
  block=true;const care=runtime.care(a.instanceId,'feed');await began;
  await runtime.setActive(b.instanceId);
  const previous=rows.get(a.instanceId);rows.set(a.instanceId,{...previous,progression:{...previous.progression,totalXp:40}});
  release();assert.equal(await care,true);
  assert.equal(rows.get(a.instanceId).active,false);assert.equal(rows.get(b.instanceId).active,true);
  assert.equal(rows.get(a.instanceId).progression.totalXp,40);
  assert.equal(runtime.snapshot().activeInstanceId,b.instanceId);
 } finally {runtime.dispose();}
});
