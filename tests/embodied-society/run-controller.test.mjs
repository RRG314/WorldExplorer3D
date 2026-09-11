import test from 'node:test';
import assert from 'node:assert/strict';
import {createRunController} from '../../app/js/experiments/embodied-society/run-controller.mjs';
import {createResidentMotor} from '../../app/js/experiments/embodied-society/resident-body.mjs';
import {createWorkshopState,createWorkshopService} from '../../app/js/experiments/embodied-society/workshop.mjs';
function fixture(options={}) {
 const body=createResidentMotor({actorId:'a',spawn:{x:0,y:1.7,z:0,yaw:0},world:{walkSurfaceAt:()=>({position:{y:0}}),checkBuildingCollision:()=>({collision:false})}});
 const workshop=createWorkshopService({initialState:createWorkshopState({runId:'supervised',actorIds:['a','private-b']}),authorize:()=>({allowed:true}),persist:async()=>{}});
 let saved;
 const controller=createRunController({actorId:'a',body,workshop,perceive:()=>[],persistCheckpoint:async state=>{saved=state;},...options});
 return {body,workshop,controller,saved:()=>saved};
}
test('bounded decision drives real walking, progresses needs, and saves full body checkpoint',async()=>{
 const f=fixture({maxDecisions:1,decide:async()=>({kind:'move',move:1,frames:60})});
 await f.controller.resume();await f.controller.decide();await f.controller.step(60);
 assert.ok(Math.abs(f.body.observation().position.z-2.8)<.01);
 assert.equal(f.saved().frames,60);assert.equal(f.saved().workshop.tick,1);assert.ok(f.saved().workshop.actors.a.needs.water<1);
 assert.equal(f.saved().body.walker.z,f.body.observation().position.z);
 await assert.rejects(f.controller.decide(),/allowance/);
 assert.equal(JSON.stringify(f.controller.observation()).includes('private-b'),false);
});
test('pause aborts an in-flight response and late movement is never applied',async()=>{
 let complete,started;
 const ready=new Promise(resolve=>{started=resolve;});
 const f=fixture({maxDecisions:1,decide:()=>{started();return new Promise(resolve=>{complete=resolve;});}});
 await f.controller.resume();const decision=f.controller.decide();await ready;
 await f.controller.pause();complete({kind:'move',move:1,frames:60});
 assert.deepEqual(await decision,{cancelled:true});await f.controller.resume();await f.controller.step(60);
 assert.equal(f.body.observation().position.z,0);assert.equal(f.controller.state().calls,1);
});
test('invalid model action cannot impersonate another actor or execute code',async()=>{
 const f=fixture({maxDecisions:1,decide:async()=>({kind:'consume',actorId:'private-b',javascript:'bad'})});
 await f.controller.resume();await assert.rejects(f.controller.decide(),/Unsupported/);
 assert.equal(f.controller.state().status,'failed');assert.equal(f.workshop.snapshot().revision,0);
 await assert.rejects(f.controller.resume(),/Only a paused/);
});
test('failed budget reservation never dispatches a model and timeout ends the run',async()=>{
 let calls=0,fail=false;
 const f=fixture({maxDecisions:1,decide:async()=>{calls++;return {kind:'wait'};},persistCheckpoint:async()=>{if(fail)throw Error('disk full');}});
 await f.controller.resume();fail=true;await assert.rejects(f.controller.decide(),/disk full/);assert.equal(calls,0);
 const slow=fixture({maxDecisions:1,decisionTimeoutMs:5,decide:()=>new Promise(()=>{})});
 await slow.controller.resume();await assert.rejects(slow.controller.decide(),/cancelled|timed out/i);assert.equal(slow.controller.state().status,'failed');
});
test('simulation duration is bounded and zero allowance means no model call',async()=>{
 const f=fixture({maxSeconds:1});await f.controller.resume();await assert.rejects(f.controller.decide(),/allowance/);
 await f.controller.step(60);await f.controller.step(60);assert.equal(f.controller.state().frames,60);assert.equal(f.controller.state().status,'ended');
});
test('ordinary material failure becomes next-observation feedback without ending the resident',async()=>{
 const f=fixture({maxDecisions:2,decide:async()=>({kind:'craft',recipeId:'twist-cord'})});
 await f.controller.resume();const result=await f.controller.decide();assert.equal(result.reason,'insufficient-material');
 assert.equal(f.controller.state().status,'running');assert.equal(f.controller.observation().lastOutcome.reason,'insufficient-material');
});
