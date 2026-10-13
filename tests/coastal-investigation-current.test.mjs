import test from 'node:test';
import assert from 'node:assert/strict';
import {createCoastalInvestigation} from '../app/js/campaign/coastal-investigation-runtime.js';
import {investigationState,investigationId,validateInvestigationBackup,contactAdmission,contactLineClear,investigationBadges} from '../app/js/campaign/coastal-investigation.js';
import {createMemoryDiscoveryProfileStore} from '../app/js/discovery/profile-store.js';
import {createMarineHabitatPlan,CORAL_SHELF_SITE,marineStudyOffset} from '../app/js/ocean/habitat-plan.js';
import {prepareSurfaceVoyage} from '../app/js/ocean/voyage.js';
import {createSwimState,stepSwimming} from '../app/js/walking/water/model.js';
import {createOceanBathymetryApi} from '../app/js/ocean/bathymetry.js';
function fixture(){
 const store=createMemoryDiscoveryProfileStore(),voyage=prepareSurfaceVoyage(CORAL_SHELF_SITE);voyage.stage='underwater';let lab=false,diving=false,fail=false,hold=null;
 const plan=createMarineHabitatPlan({site:CORAL_SHELF_SITE,sampleSeabedHeight:()=>-30});
 const actor={position:{x:0,y:-10,z:0},yaw:0,speed:0,verticalSpeed:0};
 const ctx={SCALE:100000,METERS_PER_WORLD_UNIT:1,boat:{x:0,y:0,z:0},boatDeck:{active:false},boatMode:{moored:true},oceanVoyage:{current:voyage},oceanMode:{active:true,launchSite:CORAL_SHELF_SITE,habitat:{plan,sampleSeabedHeight:()=>-30,group:{userData:{habitat:{assetState:'ready'}}}},submarine:actor,diver:{get active(){return diving},navigationActor:()=>actor,snapshot:()=>({returnTarget:'submarine',distanceToSubMeters:5})}}};
 const coastal=()=>({completed:true,plan:{metadata:{voyageId:voyage.id}}});
 const api=createCoastalInvestigation(ctx,{store:()=>({...store,recordExplorerEvent:async value=>{if(hold)await hold;if(fail)throw Error('quota');return store.recordExplorerEvent(value)}}),coastal,atLab:()=>lab,now:()=>100});
 function aim(id,height=10,x=0){const t=plan.contacts.find(t=>t.id===id);actor.position={x:t.x+x,y:t.y+height,z:t.z-2};actor.yaw=Math.atan2(t.x-actor.position.x,t.z-actor.position.z);api.select(id);}
 return {ctx,api,store,actor,plan,set hold(value){hold=value},set fail(value){fail=value},set diving(value){diving=value},surface(){ctx.oceanMode.active=false;ctx.boatDeck.active=true;lab=true},aim,async chart(){await api.refresh();assert.equal(await api.act('begin'),true);for(const id of ['habitat','rock','case']){aim(id);assert.equal(await api.act('ping'),true);}assert.equal(await api.act('chart'),true);},async views(){api.select('case');assert.equal(await api.act('select'),true);diving=true;aim('case',2,-2);assert.equal(await api.act('observe'),true);aim('case',2,2);assert.equal(await api.act('observe'),true);},async board(){api.onBoard();diving=false;await new Promise(r=>setTimeout(r,10));}};
}
test('geometric sonar requires range, heading, stopped controls and clear terrain',()=>{
 const target={id:'case',x:0,y:-30,z:20,radius:1},actor={position:{x:0,y:-20,z:0},yaw:0,speed:0};const base={actor,target,ready:true};assert.equal(contactAdmission(base).allowed,true);
 for(const patch of [{actor:{...actor,yaw:Math.PI}},{actor:{...actor,speed:2}},{actor:{...actor,position:{x:100,y:0,z:0}}},{ready:false},{paused:true},{lineClear:()=>false}])assert.equal(contactAdmission({...base,...patch}).allowed,false);
 assert.equal(contactLineClear({rocks:[]},()=>-40,actor.position,target),true);assert.equal(contactLineClear({rocks:[]},()=>-18,actor.position,target),false);assert.equal(contactLineClear({rocks:[{x:0,y:-25,z:10,rx:5,ry:5,rz:5}]},()=>-40,actor.position,target),false);
});
test('three contacts, chosen target, distinct observations, actual boarding and supported conclusion form one saved expedition',async()=>{
 const f=fixture();await f.chart();assert.equal(f.api.snapshot().phase,'selection');assert.equal(f.api.snapshot().annotations.length,3);assert.deepEqual(f.api.diveEquipment(),{airCapacity:300,maximumDiveMeters:40});await f.views();assert.equal(f.api.snapshot().phase,'return');assert.equal(await f.api.act('return'),false);await f.board();assert.equal(f.api.snapshot().phase,'report');assert.equal(f.api.diveEquipment().airCapacity,360);f.surface();f.api.conclude('wreck');assert.equal(await f.api.act('report'),false);f.api.conclude('case');assert.equal(await f.api.act('report'),true);assert.equal(f.api.snapshot().completed,true);
 const events=await f.store.listEvents(100);assert.equal(events.length,10);assert.equal(investigationBadges(events).length,2);assert.equal((await f.store.getProfile()).explorerProgress.points,0);validateInvestigationBackup(events);await f.store.importData(await f.store.exportData());await f.api.refresh();assert.equal(f.api.snapshot().completed,true);
});
test('partial report and failed writes preserve the next real step; wrong vessel and rescue do not grant return',async()=>{
 const f=fixture();await f.chart();await f.views();f.fail=true;await f.board();assert.equal(f.api.snapshot().phase,'return');assert.equal(f.api.snapshot().failure,true);f.fail=false;assert.equal(await f.api.act('return'),true);f.surface();assert.equal(await f.api.act('partial'),true);assert.equal(f.api.snapshot().completed,false);const before=await f.store.listEvents();await f.api.act('partial');assert.equal((await f.store.listEvents()).length,before.length);
 f.ctx.oceanVoyage.current={...f.ctx.oceanVoyage.current,id:'different'};assert.equal(await f.api.act('report'),false);assert.equal(f.api.diveEquipment(),null);
});
test('pause, missing assets, moving, same viewpoint and unmoored submission are refused',async()=>{
 const f=fixture();await f.chart();f.api.select('case');await f.api.act('select');f.diving=true;f.aim('case',2,-2);f.ctx.paused=true;assert.equal(await f.api.act('observe'),false);f.ctx.paused=false;f.ctx.oceanMode.habitat.group.userData.habitat.assetState='unavailable';assert.equal(await f.api.act('observe'),false);f.ctx.oceanMode.habitat.group.userData.habitat.assetState='ready';assert.equal(await f.api.act('observe'),true);assert.equal(await f.api.act('observe'),false);f.aim('case',2,2);await f.api.act('observe');await f.board();f.surface();f.ctx.boatMode.moored=false;f.api.conclude('case');assert.equal(await f.api.act('report'),false);
});
test('orphan, mismatched identity, contradictory conclusion and damaged backup cannot claim a badge',async()=>{
 const f=fixture();await f.chart();await f.views();await f.board();f.surface();f.api.conclude('case');await f.api.act('report');const events=await f.store.listEvents();
 for(const mutate of [rows=>rows.filter(e=>e.eventId!==investigationId('brief')),rows=>rows.map(e=>e.eventId===investigationId('report')?{...e,metadata:{...e.metadata,conclusion:'wreck'}}:e),rows=>rows.map(e=>e.eventId===investigationId('return')?{...e,metadata:{...e.metadata,subId:'foreign'}}:e),rows=>rows.filter(e=>e.eventId!==investigationId('view:1'))]){const invalid=mutate(events);assert.equal(investigationState(invalid).completed,false);assert.throws(()=>validateInvestigationBackup(invalid));await assert.rejects(async()=>f.store.importData({...await f.store.exportData(),events:invalid}));}
 assert.equal(investigationState(await f.store.listEvents()).completed,true);
});
test('game survey equipment has bounded added air and depth without changing ordinary swimming',()=>{
 const ordinary=createSwimState(),survey=createSwimState({}, {airCapacity:300,maximumDiveMeters:40}),reserve=createSwimState({}, {airCapacity:360,maximumDiveMeters:40});assert.equal(ordinary.airSeconds,180);assert.equal(survey.airSeconds,300);assert.equal(reserve.airSeconds,360);
 assert.equal(createSwimState({}, {airCapacity:Infinity,maximumDiveMeters:900}).airSeconds,360);assert.equal(createSwimState({}, {airCapacity:900,maximumDiveMeters:900}).maximumDiveMeters,40);
 const step=s=>stepSwimming(s,{eyeY:-30,surfaceY:0,bottomY:-55,dt:.1,vertical:-1,metersPerUnit:1});assert.equal(step(ordinary).y,-18);assert.ok(step(survey).y< -30);assert.equal(step({...reserve,airSeconds:19,equipment:'scuba'}).recovering,true);
});
test('the same geographic study keeps target positions and procedural seabed across alternate launch origins',()=>{
 const sites=[CORAL_SHELF_SITE,{lat:-18.2849,lon:147.7006}],plans=sites.map(site=>createMarineHabitatPlan({site,sampleSeabedHeight:()=>-30}));
 for(const id of ['habitat','rock','case']){const a=plans[0].contacts.find(c=>c.id===id),b=plans[1].contacts.find(c=>c.id===id),off=marineStudyOffset(sites[1]);assert.ok(Math.abs(a.x-(b.x-off.x))<1e-6);assert.ok(Math.abs(a.z-(b.z-off.z))<1e-6);}
 const apis=sites.map(site=>createOceanBathymetryApi({appCtx:{SCALE:100000},oceanMode:{launchSite:site},constants:{}}));const offset=marineStudyOffset(sites[1]);assert.ok(Math.abs(apis[0].sampleSeabedHeight(23,60)-apis[1].sampleSeabedHeight(23+offset.x,60+offset.z))<1e-6);
});
test('completed expedition offers physical follow-up observations with hourly deduplication and no repeated reward',async()=>{
 const f=fixture();await f.chart();await f.views();await f.board();f.surface();f.api.conclude('case');await f.api.act('report');
 f.ctx.oceanMode.active=true;f.ctx.boatDeck.active=false;f.diving=true;f.aim('habitat',3);assert.equal(await f.api.act('followup'),true);assert.equal(await f.api.act('followup'),true);
 const rows=await f.store.listEvents();assert.equal(rows.filter(e=>e.eventId.includes(':followup:')).length,1);assert.equal(investigationBadges(rows).length,2);assert.equal((await f.store.getProfile()).explorerProgress.points,0);validateInvestigationBackup(rows);
 const changed=rows.map(e=>e.eventId.includes(':followup:')?{...e,metadata:{...e.metadata,distanceMeters:900}}:e);assert.throws(()=>validateInvestigationBackup(changed));
});

test('normal boarding while the second observation commits retains its return proof without duplicate awards',async()=>{
 const f=fixture();await f.chart();f.api.select('case');await f.api.act('select');f.diving=true;f.aim('case',2,-2);await f.api.act('observe');f.aim('case',2,2);
 let release;f.hold=new Promise(resolve=>release=resolve);const writing=f.api.act('observe');await new Promise(r=>setTimeout(r,1));f.api.onBoard();f.diving=false;f.hold=null;release();await writing;await new Promise(r=>setTimeout(r,10));assert.equal(f.api.snapshot().diver,true);assert.equal((await f.store.listEvents()).filter(e=>e.eventId===investigationId('return')).length,1);
});
