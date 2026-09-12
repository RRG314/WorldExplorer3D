import test from 'node:test';
import assert from 'node:assert/strict';
import {runWindow} from '../../app/js/experiments/embodied-society/run-window.mjs';
import {createWorkshopService,createWorkshopState} from '../../app/js/experiments/embodied-society/workshop.mjs';
import {applyAcceptanceNeeds} from '../../app/js/experiments/embodied-society/acceptance-profile.mjs';
import {createRunController} from '../../app/js/experiments/embodied-society/run-controller.mjs';

test('eight-hour needs clock crosses depletion thresholds without acceleration or journal overflow',async()=>{
 const window=runWindow('needs-8h');let writes=0;
 const service=createWorkshopService({initialState:applyAcceptanceNeeds(createWorkshopState({runId:'clock-load',actorIds:['a']})),maxEvents:window.maxEvents,authorize:()=>({allowed:true}),persist:async()=>{writes++;}});
 await service.advanceTo(900);const pilot=service.stateView().actors.a.needs;
 assert.ok(Math.abs(pilot.water-.3875)<1e-9);assert.ok(Math.abs(pilot.food-.51875)<1e-9);
 for(let tick=930;tick<=window.maxSeconds;tick+=window.clockIntervalSeconds)await service.advanceTo(tick);
 const final=service.snapshot();assert.equal(final.tick,28800);assert.equal(final.actors.a.needs.water,0);assert.equal(final.actors.a.needs.food,0);assert.equal(final.actors.a.needs.rest,0);
 assert.equal(writes,931);assert.ok(final.events.length<window.maxEvents);
 assert.equal(Object.hasOwn(service.stateView(),'events'),false);assert.equal(Object.hasOwn(service.stateView(),'receipts'),false);
});

test('long controller passes 900 seconds, flushes current needs before deciding, and skips perception for HUD',async()=>{
 const service=createWorkshopService({initialState:createWorkshopState({runId:'controller-long',actorIds:['a']}),maxEvents:4096,authorize:()=>({allowed:true}),persist:async()=>{}});
 let frames=0,perceptions=0,seen,checkpoints=0;
 const body={pause(){},resume(){},command(){},step(){frames++;},observation:()=>({position:{x:0,y:0,z:0},remainingFrames:0}),checkpoint:()=>({frames})};
 const controller=createRunController({actorId:'a',body,workshop:service,perceive:()=>{perceptions++;return [];},persistCheckpoint:async()=>{checkpoints++;},maxDecisions:2,maxSeconds:28800,clockIntervalSeconds:30,decide:async o=>{seen=o;return {kind:'wait'};}});
 await controller.resume();for(let n=0;n<1001;n++)await controller.step(60);
 assert.equal(controller.state().status,'running');assert.equal(controller.state().frames,60060);
 assert.equal(service.stateView().tick,990);assert.ok(checkpoints<40);
 controller.observation({includePerception:false});assert.equal(perceptions,0);
 await controller.decide();assert.equal(seen.needs.lastTick,1001);assert.equal(perceptions,1);
 assert.ok(Math.abs(seen.needs.water-(1-1001/14400))<1e-9);
 await controller.step(60);await controller.end();assert.equal(service.stateView().tick,1002);
 assert.equal(controller.state().status,'ended');
});

test('long window reserves journal capacity for clock flushes and all allowed actions',()=>{
 const w=runWindow('needs-8h');assert.ok(w.maxEvents>w.maxSeconds/w.clockIntervalSeconds+2*w.maxCalls);
 assert.equal(w.maxCalls,600);assert.equal(w.maxWallMs,36000000);
 assert.throws(()=>runWindow('forever'),/Unknown/);
});
