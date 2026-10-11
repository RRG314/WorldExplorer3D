import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createWildlifeObservation,wildlifeObservationCandidate} from '../app/js/ocean/wildlife-observation.js';
import {createMemoryDiscoveryProfileStore} from '../app/js/discovery/profile-store.js';
import {prepareSurfaceVoyage} from '../app/js/ocean/voyage.js';
const animal=()=>{const mesh=new THREE.Group();mesh.position.set(100,-2,20);mesh.userData.speciesId='short_beaked_common_dolphin';return {mesh,visualState:'licensed'};};

test('wildlife observation requires a visible loaded animal, stationary actor, clear view and range',()=>{
 const a=animal(),base={animals:[a],position:{x:100,y:-2,z:0},units:1,inView:()=>true,lineClear:()=>true};
 assert.equal(wildlifeObservationCandidate(base).distance,20);
 for(const override of [{speed:1},{verticalSpeed:2},{inView:()=>false},{lineClear:()=>false},{units:0},{position:{x:NaN,y:0,z:0}}])assert.equal(wildlifeObservationCandidate({...base,...override}),null);
 a.mesh.visible=false;assert.equal(wildlifeObservationCandidate(base),null);a.mesh.visible=true;
 a.visualState='loading';assert.equal(wildlifeObservationCandidate(base),null);a.visualState='licensed';a.mesh.position.z=46;assert.equal(wildlifeObservationCandidate(base),null);
});

test('wildlife uses real Journal records, preserves failed saves, deduplicates, and fences messages after travel',async()=>{
 const m={active:true,cetaceanPlan:{allowed:true,region:'california-current'},cetaceans:[animal()],launchSite:{lat:34,lon:-120,name:'Offshore California'},
  submarine:{position:{x:100,y:-2,z:0},speed:0,verticalSpeed:0},waterSurface:{sample:()=>({volume:{surfaceY:0,bottomY:-180,metersPerWorldUnit:1}})},
  camera:new THREE.PerspectiveCamera(60,1,.1,1000)};
 m.camera.position.set(100,-2,-6);m.camera.lookAt(100,-2,20);m.camera.updateMatrixWorld(true);
 const ctx={oceanMode:m,METERS_PER_WORLD_UNIT:1,SCALE:111000,oceanVoyage:{current:prepareSurfaceVoyage({lat:34,lon:-120,name:'California'})}},backing=createMemoryDiscoveryProfileStore();
 let fail=true,release=null;const store={...backing,recordExplorerEvent:async value=>{if(release)await new Promise(resolve=>{release=resolve;});if(fail)throw Error('quota');return backing.recordExplorerEvent(value)}};
 const api=createWildlifeObservation(ctx,{store:()=>store,now:()=>10000000});
 assert.equal(api.snapshot().allowed,true);assert.equal(await api.record(),false);assert.match(api.snapshot().message,/could not be saved/);
 fail=false;assert.equal(await api.record(),true);assert.match(api.snapshot().message,/saved/);assert.equal(await api.record(),true);assert.match(api.snapshot().message,/already recorded/);
 const id='marine-wildlife:short_beaked_common_dolphin:34.00:-120.00:2',records=await backing.getEventsById([id]);assert.equal(records.length,1);
 assert.equal(records[0].metadata.voyage.subId,ctx.oceanVoyage.current.subId);
 assert.equal(records[0].metadata.depthMeters,2);assert.equal(records[0].metadata.livePresenceClaim,false);assert.equal(records[0].progress.points,0);
 ctx.paused=true;assert.equal(await api.record(),false);ctx.paused=false;
 m.cetaceans[0].mesh.position.z=-20;assert.equal(api.snapshot().allowed,false);m.cetaceans[0].mesh.position.z=20;
 release=()=>{};const pending=api.record();const done=release;m.cetaceanPlan={allowed:false};m.active=false;done();assert.equal(await pending,true);assert.equal(api.snapshot().message,'');assert.equal(api.snapshot().visible,false);
});
