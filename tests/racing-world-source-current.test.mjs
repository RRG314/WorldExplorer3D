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
test('recommended races accept densely surveyed real-road topology, not only long fixture edges',()=>{
 const points=[{x:0,y:0,z:0},{x:0,y:0,z:120},{x:120,y:0,z:120},{x:120,y:0,z:0}],roads=[];
 for(let side=0;side<4;side++)for(let i=0;i<12;i++){
  const from=points[side],to=points[(side+1)%4],at=t=>({x:from.x+(to.x-from.x)*t,y:0,z:from.z+(to.z-from.z)*t});
  roads.push({sourceId:`survey:${side}:${i}`,a:at(i/12),b:at((i+1)/12),widthMeters:8,driveable:true,supported:true});
 }
 const result=recommendRaceCourses({roads,metersPerUnit:1,locationId:'survey',locationLabel:'Survey district',anchor:{lat:43,lon:7}});
 assert.ok(result.events.some(e=>e.discipline==='circuit'));assert.ok(result.events.some(e=>e.discipline==='sprint'));
 assert.ok(result.events.every(e=>e.points.length>15),'segmented source geometry is retained');
});

test('the actual coordinate-only origin uses published world identity and matching load metadata',async()=>{
 const h=setup();h.context.LOC={lat:43,lon:7};h.context.worldPublication.sequence=12;
 h.context.livingWorldPublication={worldIdentity:{latitudeE7:430000000,longitudeE7:70000000,locationKey:'custom'}};
 h.context.worldLoadRuntimeState={sequence:12,location:{lat:43,lon:7,name:'Monaco'}};
 const district=await collectRaceDistrict(h.context,{yieldWork:async()=>{}});
 assert.equal(district.locationId,'earth:430000000:70000000');assert.equal(district.locationLabel,'Monaco');
 assert.ok(recommendRaceCourses(district).events.length>0);
 h.context.worldLoadRuntimeState.sequence=13;const stale=await collectRaceDistrict(h.context,{yieldWork:async()=>{}});
 assert.notEqual(stale.locationLabel,'Monaco','new selection metadata cannot relabel an older published world');
});

// Integration with the real published-triangle index. Grading inputs and the
// final terrain-owned road can differ; bridges retain a separate height fence.
import {createRoadContactIndex} from '../app/js/terrain/road-contact-index.js';
function published({start=.00037,grade=0,crossfall=0,base=1.5,mode='at_grade',width=8}={}){
 const feature={sourceFeatureId:'osm:way:measured',width:8,metersPerWorldUnit:1,pts:[{x:0,z:0},{x:40,z:0}],
  structureSemantics:{terrainMode:mode,structureKind:mode==='elevated'?'bridge':'none'}};
 const y=(x,z)=>base+x*grade+z*crossfall,positions=Float32Array.from([start,y(start,-width/2),-width/2,start,y(start,width/2),width/2,40,y(40,-width/2),-width/2,40,y(40,width/2),width/2]);
 const contact=createRoadContactIndex([{geometry:{attributes:{position:{array:positions}},getIndex:()=>({array:new Uint16Array([0,1,2,2,1,3])})},userData:{terrainMode:mode}}]);
 const segment={feature,p1:feature.pts[0],p2:feature.pts[1],segIndex:0,sourceTStart:0,sourceTEnd:1,fromId:0,toId:1,direction:'forward'};
 const context={METERS_PER_WORLD_UNIT:1,worldPublication:{requestId:'physical',location:{lat:52,lon:-1}},buildings:[],roadContactIndex:contact,
  buildTraversalNetworks:()=>({drive:{segments:[segment]}}),sampleFeatureSurfaceY:()=>0,transportDetail:{hasReadyCoverageAt:()=>true},
  SurfaceQuery:{driveAt:(x,z,options)=>{assert.equal(options.nearestRoad.road,feature);const y=contact.sampleAt(x,z,options.currentY);return {kind:Number.isFinite(y)?'road':'terrain',position:{y:y??0}};}}};
 return {context,contact,feature};
}
test('qualification reads the published ground-road height and projects only compiler precision onto real support',async()=>{
 const h=published();assert.equal(h.contact.sampleAt(0,0),null);
 const result=await collectRaceDistrict(h.context,{yieldWork:async()=>{}}),r=result.roads[0];
 assert.ok(Math.abs(r.a.x-.00037)<1e-8);assert.ok(Math.abs(r.a.y-1.5)<1e-6);
 assert.ok(result.diagnostics.precisionContacts>0);assert.ok(result.diagnostics.maximumPrecisionDistanceWorld<.000371);
 assert.equal(h.contact.sampleAt(0,0),null,'source projection never expands actual collision');
 assert.ok(result.diagnostics.maximumGroundProfileDepartureMeters>=1.5);
 h.contact.dispose();
});
test('qualification samples actual wheel crossfall and rejects slopes, missing side support and unrendered gaps',async()=>{
 const h=published({start:0,crossfall:.1});
 const result=await collectRaceDistrict(h.context,{yieldWork:async()=>{}}),s=result.roads[0].heightSamples[1];
 assert.ok(Math.abs(s.leftY-s.y-.12)<1e-6);assert.ok(Math.abs(s.rightY-s.y+.12)<1e-6);
 for(const options of [{start:.02},{start:0,crossfall:.2},{start:0,grade:.3},{start:0,width:1}]){
  const bad=published(options);await assert.rejects(collectRaceDistrict(bad.context,{yieldWork:async()=>{}}),/no_qualified/);bad.contact.dispose();
 }
 h.contact.dispose();
});
test('another deck or a wrong structural profile cannot supply missing ground support',async()=>{
 const h=published({mode:'elevated'});
 await assert.rejects(collectRaceDistrict(h.context,{yieldWork:async()=>{}}),/no_qualified/,'bridge profile fence remains');
 h.feature.structureSemantics.terrainMode='at_grade';
 await assert.rejects(collectRaceDistrict(h.context,{yieldWork:async()=>{}}),/no_qualified/,'elevated triangles cannot substitute for absent at-grade geometry');
 h.contact.dispose();
});
