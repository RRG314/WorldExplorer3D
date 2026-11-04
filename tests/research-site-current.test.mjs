import test from 'node:test';import assert from 'node:assert/strict';
import {qualifyResearchSite,researchStationEvidence} from '../app/js/campaign/research-site.js';
import {transitionGeologyCareer} from '../app/js/campaign/geology-career.js';
function runtime(){return {gameStarted:true,worldLoading:false,getEnv:()=> 'EARTH',worldPublication:{requestId:'test'},LOC:{lat:39.3189,lon:-76.6363},SCALE:100000,METERS_PER_WORLD_UNIT:1.11,Walk:{state:{walker:{x:0,y:1.7,z:0}}},roads:[],buildings:[],buildingMeshes:[],dynamicBuildingColliders:[],SurfaceQuery:{driveAt:()=>({kind:'terrain',position:{y:0},provenance:{confidence:.9}}),waterAt:()=>null}};}
test('a field site reads supported ground and retains geographic station identity without changing world geometry',()=>{
 const c=runtime(),roads=c.roads,colliders=c.dynamicBuildingColliders,result=qualifyResearchSite(c,{id:'test-site',name:'Field course'});assert.deepEqual(Object.keys(result.points),['a','b','bench']);assert.equal(c.roads,roads);assert.equal(c.dynamicBuildingColliders,colliders);assert.equal(colliders.length,0);
 const restored=qualifyResearchSite(c,{existingSite:result.site});assert.deepEqual(restored.site,result.site);
});
test('unpublished ground, water, steep approaches and nearby roads cannot become a training site',()=>{
 const a=runtime();a.worldPublication=null;assert.throws(()=>qualifyResearchSite(a,{id:'test'}));
 const b=runtime();b.SurfaceQuery.waterAt=()=>({feature:{id:'water'},position:{y:2}});assert.throws(()=>qualifyResearchSite(b,{id:'test'}));
 const c=runtime();c.SurfaceQuery.driveAt=(x,z)=>({kind:'terrain',position:{y:x*2+z*2},provenance:{confidence:.9}});assert.throws(()=>qualifyResearchSite(c,{id:'test'}));
 const d=runtime();for(let x=-160;x<=160;x+=12)d.roads.push({width:6,pts:[{x,z:-200},{x,z:200}]});assert.throws(()=>qualifyResearchSite(d,{id:'test'}));
});
test('a saved site that loses support is retained rather than silently relocated',()=>{
 const c=runtime(),first=qualifyResearchSite(c,{id:'test'}),copy=structuredClone(first.site);c.SurfaceQuery.driveAt=()=>null;assert.throws(()=>qualifyResearchSite(c,{existingSite:first.site}));assert.deepEqual(first.site,copy);
});

test('mapped footpaths and crossings retain clear access around a field course',()=>{
 const c=runtime();c.linearFeatures=[];
 for(let x=-160;x<=160;x+=12)c.linearFeatures.push({kind:'footway',subtype:x%24?'crossing':'footway',width:2,sourceTags:{surface:'paving_stones'},pts:[{x,z:-200},{x,z:200}]});
 assert.throws(()=>qualifyResearchSite(c,{id:'path-clearance'}),/No clear, dry field area/);
 c.linearFeatures=c.linearFeatures.map(feature=>({...feature,kind:'power_line'}));
 assert.ok(qualifyResearchSite(c,{id:'unrelated-line'}).points.a);
});

test('a walking route may run between the stations while all props stay clear',()=>{
 const c=runtime(),z=5/c.METERS_PER_WORLD_UNIT;
 c.linearFeatures=[{kind:'footway',subtype:'footway',width:2,pts:[{x:-200,z},{x:200,z}]}];
 const result=qualifyResearchSite(c,{id:'path-between-stations'});
 assert.ok(Math.abs(result.points.a.z-z)*c.METERS_PER_WORLD_UNIT>4.5);
 assert.ok(Math.abs(result.points.bench.z-z)*c.METERS_PER_WORLD_UNIT>2.6);
});

test('physical station admission uses metres across the world-unit boundary',()=>{
 const c=runtime(),qualified=qualifyResearchSite(c,{id:'unit-contract-site',name:'Field course'});
 c.getCurrentTravelMode=()=> 'walk';c.SurfaceQuery.walkAt=()=>({position:{y:0}});
 Object.assign(c.Walk.state.walker,{x:qualified.points.a.x,z:qualified.points.a.z,y:2.4});
 const state=transitionGeologyCareer(null,{type:'accept',revision:0,runId:'world-unit-study',variantId:'campaign',site:qualified.site},1000).state;
 const command={type:'observe',revision:state.revision,texture:'interlocking-crystals',grain:'coarse'};
 assert.throws(()=>transitionGeologyCareer(state,{...command,evidence:researchStationEvidence(c,qualified,'a',2000)},2000),/Walk to the marked station/);
 c.Walk.state.walker.y=1.7;
 assert.equal(transitionGeologyCareer(state,{...command,evidence:researchStationEvidence(c,qualified,'a',2000)},2000).state.active.phase,'exposure-b');
});
