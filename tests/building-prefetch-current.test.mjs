import test from'node:test';import assert from'node:assert/strict';
import{shouldLoadDetailedBuildings,canPrefetchDetailedBuildings}from'../app/js/world/settlement-density-policy.js';
import{createPreferredBuildingRequest}from'../app/js/world/load-building-detail.js';
const roads=count=>Array.from({length:count},()=>({type:'way',tags:{highway:'residential'}}));
test('early download eligibility remains valid under every current climate and requires road evidence',()=>{
 for(const elements of[[],roads(11),roads(12),roads(79),roads(80),[{tags:{place:'city'}}],[...roads(1),{tags:{building:'yes'}}]]){
  const data={elements},early=canPrefetchDetailedBuildings(data);
  if(early)for(const terrainModeHint of['sand','snow','grass','rock',''])assert.equal(shouldLoadDetailedBuildings(data,{worldSurfaceProfile:{terrainModeHint}}).shouldLoad,true);
 }
 assert.equal(canPrefetchDetailedBuildings({elements:roads(12)}),false);
 assert.equal(canPrefetchDetailedBuildings({elements:roads(80)}),true);
 assert.equal(canPrefetchDetailedBuildings({elements:[{tags:{place:'city'}}]}),false);
});
test('early and final callers share one session-coordinated request and observe failure without a second download',async()=>{
 let complete,calls=0,current=true;
 const start=createPreferredBuildingRequest({isCurrent:()=>current,request:()=>{calls++;return new Promise(resolve=>{complete=resolve;});}});
 const early=start();assert.equal(start(),early);complete({elements:[]});assert.deepEqual(await early,{data:{elements:[]}});assert.equal(start(),early);assert.equal(calls,1);
 current=false;assert.equal(start(),null);assert.equal(calls,1);
 const error=Error('Provider unavailable'),failed=createPreferredBuildingRequest({isCurrent:()=>true,request:async()=>{throw error;}}),pending=failed();assert.deepEqual(await pending,{error});assert.equal(failed(),pending);
});
test('obsolete sessions never request data and synchronous provider failure is observed',async()=>{
 let calls=0;assert.equal(createPreferredBuildingRequest({isCurrent:()=>false,request:()=>{calls++;}})(),null);assert.equal(calls,0);
 const error=Error('Synchronous failure'),start=createPreferredBuildingRequest({isCurrent:()=>true,request:()=>{throw error;}});assert.deepEqual(await start(),{error});
});
