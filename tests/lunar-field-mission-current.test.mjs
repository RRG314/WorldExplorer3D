import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { getDestinationMission } from '../app/js/universe/mission-catalog.js';
import { setMissionCourse, missionNavigationTarget, missionSurfaceBody, missionPodLaunchReady } from '../app/js/universe/mission-navigation.js';
import { canAnalyzeDestination, canResumeDestinationSurvey } from '../app/js/universe/mission-progression.js';
import { LUNAR_FIELD_PLAN } from '../app/js/planetary/lunar-survey.js';
import { secureLunarSample, lunarSamplesAboard } from '../app/js/planetary/lunar-samples.js';
import { createLocalBackpackStore, BACKPACK_STORAGE_KEY } from '../app/js/player/backpack-store.js';
import { createPodJourney, transitionPodJourney } from '../app/js/expedition/pod-journey-authority.js';
import { createLunarFieldPower, createLunarPowerController, validLunarFieldPower } from '../app/js/planetary/lunar-field-power.js';
const moon = getDestinationMission('moon');
const ctx = () => ({ universeRuntime: { current: { id: 'sol' } }, getEnv: () => 'SPACE_FLIGHT', spaceFlight: {active: true} });

function powerFixture() {
 let journey={...createPodJourney({expeditionId:'trip',contactId:'destination-mission:moon',bodyId:'moon',returnFrameId:'sol',initialPhase:'surface'}),fieldPower:createLunarFieldPower()};
 let active=true,fail=false,writes=0;const actor={x:40,z:0},pod={x:0,z:0};
 const deps={readJourney:()=>journey,commitJourney:next=>{writes++;if(fail)throw Error('quota');journey=next;},isActive:()=>active,position:()=>actor,returnPoint:()=>pod};
 return {deps,actor,pod,controller:createLunarPowerController(deps),get journey(){return journey;},set journey(v){journey=v;},get writes(){return writes;},set active(v){active=v;},set fail(v){fail=v;}};
}
test('instrument power reserves durable blocks; pause and reload cannot grant or drain offline power',()=>{
 const f=powerFixture();for(let i=0;i<240;i++)f.controller.update(.25);
 assert.equal(f.controller.snapshot().remainingS,1140);assert.equal(f.writes,4);
 f.active=false;for(let i=0;i<100;i++)f.controller.update(1000);assert.equal(f.writes,4);assert.equal(f.controller.snapshot().remainingS,1140);
 f.active=true;f.controller.update(.25);const reloaded=createLunarPowerController(f.deps);
 assert.equal(reloaded.snapshot().remainingS,1125);assert.ok(f.controller.snapshot().remainingS-reloaded.snapshot().remainingS<15);
 reloaded.update(10000);assert.equal(reloaded.snapshot().remainingS,1124.75,'background delta is bounded, never wall-clock catch-up');
});
test('failed battery write blocks measurements until explicit retry without publishing a false debit',()=>{
 const f=powerFixture(),before=f.journey;f.fail=true;f.controller.update(.25);
 assert.equal(f.journey,before);assert.equal(f.controller.snapshot().canSurvey,false);assert.equal(f.controller.snapshot().saveBlocked,true);
 for(let i=0;i<300;i++)f.controller.update(.25);assert.equal(f.writes,1,'no per-frame storage retries');
 f.fail=false;assert.equal(f.controller.retry().canSurvey,true);assert.equal(f.writes,2);assert.equal(f.journey.fieldPower.remainingS,1185);
});
test('return reserve depends on real pod distance and never consumes the return controller',()=>{
 const f=powerFixture();assert.equal(f.controller.snapshot().reserveS,180);
 f.journey={...f.journey,fieldPower:{...f.journey.fieldPower,remainingS:180}};
 assert.equal(f.controller.snapshot().phase,'return');assert.equal(f.controller.snapshot().canSurvey,false);
 f.actor.x=0;assert.equal(f.controller.snapshot().canSurvey,true);f.pod.x=NaN;assert.equal(f.controller.snapshot().canSurvey,false);
 f.pod.x=0;f.journey={...f.journey,fieldPower:{...f.journey.fieldPower,remainingS:0}};f.controller.update(.25);
 assert.equal(f.controller.snapshot().phase,'empty');assert.equal(f.journey.phase,'surface');
 assert.equal(transitionPodJourney(f.journey,'launch').accepted,true,'even an empty instrument battery permits recovery');
});
test('only a new lunar sortie receives fresh power; failed ascent and landing replay preserve remaining charge',()=>{
 let pod=createPodJourney({expeditionId:'trip',contactId:'destination-mission:moon',bodyId:'moon',returnFrameId:'sol'});
 for(const e of ['launch','course_acquired','begin_descent','surface_ready'])pod=transitionPodJourney(pod,e).journey;
 assert.equal(pod.fieldPower.remainingS,1200);pod={...pod,fieldPower:{...pod.fieldPower,remainingS:150}};
 pod=transitionPodJourney(pod,'launch').journey;pod=transitionPodJourney(pod,'cancel_launch').journey;
 assert.equal(pod.fieldPower.remainingS,150);assert.equal(transitionPodJourney(pod,'surface_ready').accepted,false);
 for(const value of [{version:99,capacityS:1200,remainingS:100},{version:1,capacityS:1200,remainingS:-1},{version:1,capacityS:1200,remainingS:1201},{version:1,capacityS:1200,remainingS:NaN}])assert.equal(validLunarFieldPower(value),false);
});

test('Moon route uses the existing Solar owner and never retargets an interstellar voyage', () => {
 const c=ctx();let solar=0,exo=0;c.setSolarSystemCourse=id=>{assert.equal(id,'moon');solar++;return {accepted:true};};c.travelToUniverseDestination=()=>{exo++;return true;};
 assert.equal(setMissionCourse(c,moon),true);assert.equal(solar,1);assert.equal(exo,0);
 c.activeShipInterior=true;assert.equal(setMissionCourse(c,moon),false);c.activeShipInterior=false;
 c.universeRuntime.current.id='proxima-centauri';assert.equal(setMissionCourse(c,moon),false);
 assert.equal(setMissionCourse(c,getDestinationMission('proxima-centauri-b')),true);assert.equal(exo,1);
});
test('native Moon arrival reads the accepted environment and physical Solar target',()=>{
 const c=ctx();c.onMoon=true;assert.equal(missionSurfaceBody(c),null);c.getEnv=()=> 'MOON';assert.equal(missionSurfaceBody(c),'moon');
 const position=new THREE.Vector3(1,2,3);c.getAllSpaceBodies=()=>[{name:'Moon',position,radius:13.5}];assert.equal(missionNavigationTarget(c,moon).position,position);
 c.universeRuntime.transition={};assert.equal(missionNavigationTarget(c,moon),null);
});
test('local lunar pod custody admits a planned ship without overwriting its Proxima destination',()=>{
 const c=ctx(),expedition={id:'trip',state:'planned',destinationId:'proxima-centauri'},mission={...moon,surfaceRequired:true,phase:'approach',preparation:{version:1,strategy:'samples',expeditionId:'trip',returnBriefed:true,calibratedAtMs:1}};
 assert.equal(missionPodLaunchReady(c,mission,expedition),true);
 expedition.podJourney={phase:'surface',bodyId:'earth'};assert.equal(missionPodLaunchReady(c,mission,expedition),false);
 expedition.podJourney={phase:'recovered',bodyId:'moon',expeditionId:'trip',returnFrameId:'sol'};assert.equal(missionPodLaunchReady(c,mission,expedition),true);
 c.activeShipInterior=true;c.getInterstellarExpeditionSnapshot=()=>expedition;assert.equal(canResumeDestinationSurvey(c,mission),true);expedition.state='in-transit';assert.equal(missionPodLaunchReady(c,mission,expedition),false);
 assert.equal(expedition.destinationId,'proxima-centauri');
});
test('two-site lunar plan has distinct identity for each repeated procedure',()=>{
 assert.equal(LUNAR_FIELD_PLAN.length,4);assert.equal(new Set(LUNAR_FIELD_PLAN.map(e=>e.evidenceId)).size,4);
 const [a,,b]=LUNAR_FIELD_PLAN;assert.ok(Math.hypot(a.offset.x-b.offset.x,a.offset.z-b.offset.z)>150);
 assert.equal(LUNAR_FIELD_PLAN.filter(e=>e.activityId==='geology-inspect').length,2);
});
test('lunar specimens commit before mission evidence, retry once, and refuse remote or rover collection',async()=>{
 const data=new Map();let fail=false;const storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>{if(fail)throw Error('quota');data.set(k,v);},removeItem:k=>data.delete(k)};
 const c={getEnv:()=> 'MOON',Walk:{state:{mode:'walk',walker:{x:1,y:1.7,z:0}}},playerBackpackStore:createLocalBackpackStore(storage)};
 const activity={bodyId:'moon',id:'moon:site:mare-sample',evidenceId:'mare-sample',x:0,y:0,z:0,regionId:'apollo-11-tranquility-base'};
 assert.equal(await secureLunarSample(c,activity),true);const before=data.get(BACKPACK_STORAGE_KEY);
 assert.equal(await secureLunarSample(c,activity),true);assert.equal(data.get(BACKPACK_STORAGE_KEY),before);
 const other={...activity,id:'moon:site:fragment-sample',evidenceId:'fragment-sample'};
 fail=true;assert.equal(await secureLunarSample(c,other),false);assert.equal(c.playerBackpackInventory.has('lunar-field-book:fragment-sample'),false);assert.equal(data.get(BACKPACK_STORAGE_KEY),before);
 fail=false;c.Walk.state.walker.y=100;assert.equal(await secureLunarSample(c,other),false);c.Walk.state.walker.y=1.7;c.Walk.state.mode='drive';assert.equal(await secureLunarSample(c,other),false);
 c.Walk.state.mode='walk';assert.equal(await secureLunarSample(c,other),true);assert.equal(lunarSamplesAboard(c),true);
 const saved=JSON.parse(data.get(BACKPACK_STORAGE_KEY));assert.equal(saved.items.filter(i=>i.catalogId.startsWith('lunar-field-book:')).length,2);
});
test('lunar lab requires both physical specimens and same recovered pod on the command deck',()=>{
 const c=ctx();const expedition={id:'trip',state:'planned',destinationId:'proxima-centauri',podJourney:{phase:'recovered',bodyId:'moon',expeditionId:'trip',returnFrameId:'sol'}};
 Object.assign(c,{activeShipInterior:true,getInterstellarExpeditionSnapshot:()=>expedition,getShipInteriorSnapshot:()=>({active:true,shipId:'solis-reach',deckId:'command'}),activeInterior:{interactions:[{id:'analysis-review',x:1,z:1}]},Walk:{state:{walker:{x:1,z:1}}},playerBackpackInventory:{has:()=>true}});
 assert.equal(canAnalyzeDestination(c,moon),true);expedition.podJourney.bodyId='earth';assert.equal(canAnalyzeDestination(c,moon),false);expedition.podJourney.bodyId='moon';c.playerBackpackInventory.has=()=>false;assert.equal(canAnalyzeDestination(c,moon),false);
});
test('failed pre-departure ascent can return to the same surface custody for retry',()=>{
 let pod=createPodJourney({expeditionId:'trip',contactId:'destination-mission:moon',bodyId:'moon',returnFrameId:'sol',initialPhase:'surface'});
 pod=transitionPodJourney(pod,'launch').journey;const restored=transitionPodJourney(pod,'cancel_launch');assert.equal(restored.accepted,true);assert.equal(restored.journey.phase,'surface');assert.equal(restored.journey.id,pod.id);
});


test('surface support agrees with rendered triangles, including diagonals and grid borders', async()=>{
 const {createRenderedHeightGrid}=await import('../app/js/planetary/runtime/rendered-height-grid.js');
 const geometry=new THREE.PlaneGeometry(4220.256187689549,27953.999960438564,17,39);geometry.rotateX(-Math.PI/2);
 const p=geometry.attributes.position;for(let i=0;i<p.count;i++)p.setY(i,20*Math.sin(p.getX(i)/150)*Math.cos(p.getZ(i)/190));
 const sample=createRenderedHeightGrid(geometry),mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.updateMatrixWorld();
 const ray=new THREE.Raycaster();
 for(let i=1;i<250;i++){
  const x=p.getX(0)+(p.getX(17)-p.getX(0))*((i*67%251)/251),z=p.getZ(0)+(p.getZ(39*18)-p.getZ(0))*((i*43%251)/251);
  ray.set(new THREE.Vector3(x,100,z),new THREE.Vector3(0,-1,0));const hit=ray.intersectObject(mesh)[0];assert.ok(hit);assert.ok(Math.abs(hit.point.y-sample(x,z))<.00001);
 }
 for(const i of [0,17,39*18,p.count-1])assert.ok(Math.abs(sample(p.getX(i),p.getZ(i))-p.getY(i))<.00001);
 assert.equal(sample(5000,0),null);assert.equal(sample(NaN,0),null);geometry.dispose();mesh.material.dispose();
});


test('lunar preparation requires a physical station and persists a locked meaningful field method', async()=>{
 const {createDestinationMissionStore}=await import('../app/js/universe/mission-authority.js');
 const {lunarFieldPlan,atLunarPreparationStation,lunarPreparationReady}=await import('../app/js/planetary/lunar-survey.js');
 const records=new Map();let denied=false;const storage={getItem:k=>records.get(k)??null,setItem:(k,v)=>{if(denied)throw Error('quota');records.set(k,v)}};
 const store=createDestinationMissionStore(storage);store.activate(moon);store.advance(moon,'review_briefing');
 const prepared={strategy:'observe',expeditionId:'trip',returnBriefed:true,calibratedAtMs:100};
 denied=true;assert.throws(()=>store.prepareLunar(moon,prepared),/quota/);assert.equal(store.get(moon).preparation,null);
 denied=false;assert.equal(store.prepareLunar(moon,prepared),true);assert.equal(createDestinationMissionStore(storage).get(moon).preparation.strategy,'observe');
 const plan=lunarFieldPlan('observe');assert.equal(plan.filter(e=>e.activityId==='geology-observe').length,2);assert.equal(plan.filter(e=>e.activityId==='geology-inspect').length,0);
 assert.equal(lunarPreparationReady(store.get(moon).preparation,'trip'),true);assert.equal(lunarPreparationReady(store.get(moon).preparation,'another'),false);
 store.advance(moon,'arrive');assert.equal(store.prepareLunar(moon,{...prepared,strategy:'samples'}),false);
 const c={activeShipInterior:true,getShipInteriorSnapshot:()=>({active:true,shipId:'solis-reach',deckId:'command'}),universeRuntime:{current:{id:'sol'}},Walk:{state:{walker:{x:1,z:2}}},activeInterior:{interactions:[{id:'science-survey',x:1,z:2}]}};
 assert.equal(atLunarPreparationStation(c),true);c.Walk.state.walker.x=20;assert.equal(atLunarPreparationStation(c),false);c.Walk.state.walker.x=1;c.paused=true;assert.equal(atLunarPreparationStation(c),false);
});
