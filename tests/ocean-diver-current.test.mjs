import test from 'node:test';import assert from 'node:assert/strict';
import {oceanDiveAdmission,resolveOceanDiverCameraPose,parentVesselExitPose} from '../app/js/ocean/diver.js';
import {parentHullCollision} from '../app/js/ocean/parent-vessel.js';
test('parent vessel hull uses catalogue draft and blocks its submerged volume at every heading',()=>{
 for(const yaw of [0,.5,Math.PI/2,Math.PI]){
  const ship={transportCatalogId:'ocean-research-vessel',yaw};
  assert.equal(parentHullCollision(ship,{x:0,y:-3,z:0},.3,0),true);
  assert.equal(parentHullCollision(ship,{x:0,y:-8,z:0},.3,0),false);
  assert.equal(parentHullCollision(ship,{x:100,y:-3,z:100},.3,0),false);
 }
});
test('research-vessel water entry remains outside the hull and rotates with its heading',()=>{
 for(const yaw of [0,.5,Math.PI/2,Math.PI]){
  const ship={transportCatalogId:'ocean-research-vessel',yaw};
  const ladder=parentVesselExitPose(ship,1),jump=parentVesselExitPose(ship,1,true);
  assert.equal(parentHullCollision(ship,ladder,.4,1),false);
  assert.ok(jump.y-ladder.y>5);assert.equal(jump.x,ladder.x);assert.equal(jump.z,ladder.z);
  assert.ok(Math.abs(Math.hypot(ladder.x,ladder.z)-Math.hypot(9,23.4))<1e-9);
 }
 assert.equal(parentVesselExitPose(null,0),null);
});
test('a diver may leave only a stopped sub at playable human depth with bottom clearance',()=>{
 assert.equal(oceanDiveAdmission({depthMeters:10,bottomClearance:8}).allowed,true);
 assert.match(oceanDiveAdmission({speed:3,depthMeters:10,bottomClearance:8}).reason,/Stop/);
 assert.equal(oceanDiveAdmission({depthMeters:40,bottomClearance:8}).allowed,false);
 assert.equal(oceanDiveAdmission({depthMeters:10,bottomClearance:1}).allowed,false);
 assert.equal(oceanDiveAdmission({depthMeters:null,bottomClearance:8}).allowed,false);
});

import {ctx} from '../app/js/shared-context.js?v=55';
import {activeTransportActor} from '../app/js/transport/actor-contract.js';
import {resolveObservedEarthLocation} from '../app/js/earth-location.js';
import {createBoatOceanTransferApi} from '../app/js/boat-mode/ocean-transfer.js';
test('Ocean actor and coordinates follow the diver until boarding the same submarine',()=>{
 const before={oceanMode:ctx.oceanMode,SCALE:ctx.SCALE};
 try{
  ctx.SCALE=100000;
  ctx.oceanMode={active:true,launchSite:{lat:0,lon:0},submarine:{position:{x:10,y:-8,z:20}},diver:{active:true,navigationActor:()=>({position:{x:25,y:-6,z:40},vx:1,vy:0,vz:2})}};
  const actor=activeTransportActor();assert.equal(actor.identity.domain,'person');assert.equal(actor.contact.grounded,false);assert.equal(actor.interaction.companionAboard,false);assert.equal(actor.position.x,25);assert.equal(actor.velocity.z,2);
  assert.deepEqual(resolveObservedEarthLocation(),{lat:-.0004,lon:.00025,source:'ocean_diver'});
  ctx.oceanMode.diver.active=false;assert.equal(activeTransportActor().position.x,10);assert.equal(resolveObservedEarthLocation().source,'ocean_sub');
 }finally{Object.assign(ctx,before)}
});
test('surface boat handoff cannot abandon an active diver',async()=>{
 let notice='';const api=createBoatOceanTransferApi({appCtx:{oceanMode:{active:true,diver:{active:true}}},showBoatPrompt:text=>notice=text});
 assert.equal(await api.transferSubmarineToBoat(),false);assert.match(notice,/Board the submarine/);
});

test('hull clearance keeps the camera out of the explorer body',()=>{
 const anchor={x:3,y:-8,z:0};
 const camera=resolveOceanDiverCameraPose({anchor,target:{x:-2,y:-7,z:0},submarinePosition:{x:0,y:-8,z:0},checkBuildingCollision:(x,z,r)=>({collision:x<2+r&&x>-2-r&&Math.abs(z)<4+r})});
 assert.ok(camera.x>anchor.x+2);assert.ok(Math.hypot(camera.x-anchor.x,camera.y-anchor.y,camera.z-anchor.z)>2);
});
