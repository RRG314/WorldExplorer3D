import test from'node:test';import assert from'node:assert/strict';
import {collectRaceDistrict,recommendRaceCourses}from'../app/js/racing/world-course-source.js';
function setup(){const points=[{x:0,z:0},{x:0,z:120},{x:120,z:120},{x:120,z:0}];const segments=points.map((p1,i)=>({fromId:i,toId:(i+1)%4,segIndex:0,sourceTStart:0,sourceTEnd:1,p1,p2:points[(i+1)%4],feature:{id:'osm:way:'+i,width:9,metersPerWorldUnit:1,driveable:true,structureSemantics:{structureKind:'none'}},direction:'both'}));
 const context={METERS_PER_WORLD_UNIT:1,LOC:{name:'Actual fixture city'},worldPublication:{requestId:'one',location:{lat:43,lon:7}},buildings:[],buildTraversalNetworks:()=>({drive:{segments}}),
 sampleFeatureSurfaceY:()=>0,SurfaceQuery:{driveAt:()=>({kind:'road',position:{y:0}})},transportDetail:{hasReadyCoverageAt:()=>true}};
 return {context,segments};}
test('source qualification uses actual published roads, surface and readiness owners and produces driveable routes',async()=>{
 const h=setup(),district=await collectRaceDistrict(h.context,{locationId:'fixture',yieldWork:async()=>{}});assert.equal(district.roads.length,4);assert.ok(district.roads.every(r=>r.heightSamples.length>2));
 const {events}=recommendRaceCourses(district);assert.ok(events.some(e=>e.discipline==='circuit'));assert.ok(events.some(e=>e.discipline==='sprint'));assert.ok(events.some(e=>e.discipline==='time-trial'));
});
test('pending roads and layer mismatches are rejected instead of inventing support',async()=>{
 const h=setup();h.context.transportDetail.hasReadyCoverageAt=()=>false;await assert.rejects(collectRaceDistrict(h.context,{locationId:'fixture',yieldWork:async()=>{}}),/no_qualified/);
 h.context.transportDetail.hasReadyCoverageAt=()=>true;h.context.SurfaceQuery.driveAt=()=>({kind:'road',position:{y:8}});
 await assert.rejects(collectRaceDistrict(h.context,{locationId:'fixture',yieldWork:async()=>{}}),/no_qualified/);
});
test('a replacement publication cancels qualification without publishing a stale graph',async()=>{
 const h=setup();let reads=0;h.context.sampleFeatureSurfaceY=()=>{if(++reads===5)h.context.worldPublication={requestId:'two'};return 0;};
 await assert.rejects(collectRaceDistrict(h.context,{locationId:'fixture',yieldWork:async()=>{}}),/changed|superseded/);
});
