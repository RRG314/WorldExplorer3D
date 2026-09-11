import test from 'node:test';
import assert from 'node:assert/strict';
import {createGeologyService,normalizeUSGS,normalizeMacrostrat,geologyRecord} from '../app/js/geospatial/geology.js';
import {compileFieldActivityPlan,createFieldActivitySession} from '../app/js/discovery/field-activities.js';
import {createMemoryDiscoveryProfileStore} from '../app/js/discovery/profile-store.js';
const usgs={features:[{attributes:{f_mapunitpolys_id:708875,name:'Wissahickon Formation (undivided)',geomaterial:'Schist and gneiss, of sedimentary-rock origin',geomaterialconfidence:'High',age:'Late Precambrian?',map_citation:'Maryland Geological Survey, 1968, scale 1:250,000',ngmdb_url:'https://ngmdb.usgs.gov/Prodesc/proddesc_16548.htm'}}]};
const macro={success:{data:[{map_id:1,source_id:2,name:'Regional claystone',lith:'claystone',best_int_name:'Eocene'}],refs:{2:'Regional survey'}}};
const response=body=>({ok:true,text:async()=>JSON.stringify(body)});
test('exact coordinates, request deduplication and source provenance',async()=>{
  const urls=[];const service=createGeologyService({fetchImpl:async url=>{urls.push(url);return response(usgs);}});
  const [a,b]=await Promise.all([service.lookup({lat:39.6572814,lon:-76.8875391}),service.lookup({lat:39.6572814,lon:-76.8875391})]);
  assert.equal(urls.length,1);assert.deepEqual(a.items,b.items);assert.match(a.items[0].citation,/1:250,000/);
  assert.equal(new URL(urls[0]).searchParams.get('geometry'),'-76.8875391,39.6572814');
  await service.lookup({lat:39.6572815,lon:-76.8875391});assert.equal(urls.length,2);
  assert.equal((await service.lookup({lat:39.6572814,lon:-76.8875391})).fromCache,true);
  const record=geologyRecord(a);assert.equal(record.geologyEvidence.exposure,'not-established');assert.match(record.name,/Wissahickon/);
});
test('missing coverage uses attributed regional data, not a guessed mineral',async()=>{
  const service=createGeologyService({fetchImpl:async url=>response(url.includes('usgs')?{features:[]}:macro)});
  const result=await service.lookup({lat:51.5,lon:-.12});assert.equal(result.items[0].provider,'macrostrat');assert.equal(result.items[0].license,'CC-BY-4.0');
  assert.throws(()=>geologyRecord({items:[]}),/No mapped geology/);
  assert.throws(()=>normalizeUSGS({features:[],exceededTransferLimit:true}),/incomplete/);
  assert.throws(()=>normalizeMacrostrat({}),/schema/);
});
test('invalid coordinates do not issue requests',async()=>{
  let requests=0;const service=createGeologyService({fetchImpl:async()=>{requests++;return response(usgs);}});
  for(const lat of [null,undefined,'',false,91,NaN])await assert.rejects(service.lookup({lat,lon:0}));
  assert.equal(requests,0);
});
function sessionFixture(){
  const worldIdentity={type:'WorldIdentity',id:'geology-test',location:{lat:39.65,lon:-76.88}};
  const environment={type:'EnvironmentContextPublication',worldIdentity,temporal:{},cells:[{cellId:'a',contexts:['outcrop','mountain'],bounds:{minX:0,maxX:20,minZ:0,maxZ:20}}]};
  const eligibility={type:'GeographicEligibilityPublication',catalogBundleVersion:'test',eligible:[{catalogId:'geology-inspect',cellIds:['a']}]};
  const plan=compileFieldActivityPlan(environment,eligibility);assert.ok(plan.slots.every(s=>s.catalogId==='mapped-geology-study'));
  const slot=plan.slots[0],session=createFieldActivitySession({plan});session.beginSlot(slot.id,slot.position);session.update(4,slot.position);
  return {session,slot};
}
test('mapped study uses the existing journal transaction, not a free specimen',async()=>{
  const {session,slot}=sessionFixture(),store=createMemoryDiscoveryProfileStore();
  const mapped=geologyRecord({items:normalizeUSGS(usgs),query:{lat:39.65,lon:-76.88},fetchedAt:'2026-09-09',warnings:[]});
  assert.equal(await session.record(store,{localPosition:slot.position,resolveGeology:async()=>mapped}),true);
  assert.equal((await store.listItems()).length,0);
  const events=await store.listEvents();assert.equal(events.length,1);assert.match(events[0].name,/Wissahickon/);assert.equal(events[0].evidencePayload.geologyEvidence.units[0].id,'usgs-surface:708875');
  assert.equal((await store.listFieldGuide())[0].geologyEvidence.units.length,1);
  assert.equal(await session.record(store,{}),false);
});
test('failure and a cancelled activity cannot create a journal reward',async()=>{
  const {session}=sessionFixture(),store=createMemoryDiscoveryProfileStore();
  assert.equal(await session.record(store,{resolveGeology:async()=>{throw Error('Offline');}}),false);
  assert.equal(session.snapshot().phase,'revealed');assert.match(session.snapshot().error,/Offline/);
  let finish;const pending=session.record(store,{resolveGeology:()=>new Promise(resolve=>finish=resolve)});
  assert.equal(await session.record(store,{}),false);session.reset();finish({});assert.equal(await pending,false);assert.equal((await store.listEvents()).length,0);
});
