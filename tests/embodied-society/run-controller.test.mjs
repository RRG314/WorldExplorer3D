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
test('movement evidence distinguishes queued, completed, and interrupted travel',async()=>{
 const f=fixture({maxDecisions:2,decide:async()=>({kind:'move',move:1,frames:60})});
 await f.controller.resume();await f.controller.decide();
 assert.equal(f.saved().actionEvidence[0].status,'movement-queued');
 await f.controller.step(60);
 const e=f.saved().actionEvidence[0];assert.equal(e.status,'movement-completed');assert.ok(Math.abs(e.pathMeters-2.8)<.01);assert.equal(e.before.position.z,0);assert.ok(e.after.position.z>2.7);
 await f.controller.decide();await f.controller.step(20);await f.controller.pause();
 assert.equal(f.saved().actionEvidence[1].status,'movement-interrupted');assert.ok(f.saved().actionEvidence[1].pathMeters<2.8);
});
test('consumption evidence records authoritative inventory and need changes',async()=>{
 const {applyAcceptanceNeeds}=await import('../../app/js/experiments/embodied-society/acceptance-profile.mjs');
 const initial=applyAcceptanceNeeds(createWorkshopState({runId:'evidence',actorIds:['a'],nodes:[{id:'water',materialId:'trail-water',remaining:2}]}));
 const workshop=createWorkshopService({initialState:initial,authorize:()=>({allowed:true,inReach:true,targetId:'water'}),persist:async()=>{}});
 const actions=[{kind:'gather',targetId:'water',quantity:1},{kind:'consume',materialId:'trail-water',quantity:1}];
 const f=fixture({workshop,maxDecisions:2,decide:async()=>actions.shift()});
 await f.controller.resume();await f.controller.decide();await f.controller.decide();
 const [g,c]=f.saved().actionEvidence;assert.equal(g.before.resources.water-g.after.resources.water,1);
 assert.equal(c.status,'applied');assert.equal(c.before.inventory.length,1);assert.equal(c.after.inventory.length,0);assert.ok(Math.abs(c.after.needs.water-c.before.needs.water-.4)<1e-9);
});

test('delayed dispatch and response cannot shorten the next provider interval',async()=>{
 const {createDecisionCadence}=await import('../../app/js/experiments/embodied-society/decision-cadence.mjs');
 let clock=1000,complete;const cadence=createDecisionCadence(60000,{now:()=>clock});
 const pending=cadence.run(()=>new Promise(resolve=>{complete=resolve;}));
 clock=4000;assert.equal(cadence.ready(),false); // server dispatch occurs after local start
 clock=9000;complete('response');await pending;
 clock=64000;assert.equal(cadence.ready(),false); // one minute from dispatch still isn't a minute from settlement
 clock=69000;assert.equal(cadence.ready(),true);
});
test('failed decisions cannot cause a rapid automatic retry',async()=>{
 const {createDecisionCadence}=await import('../../app/js/experiments/embodied-society/decision-cadence.mjs');
 let clock=0;const cadence=createDecisionCadence(60000,{now:()=>clock});
 await assert.rejects(cadence.run(async()=>{clock=5000;throw Error('provider failed');}),/provider failed/);
 assert.equal(cadence.ready(),false);clock=65000;assert.equal(cadence.ready(),true);
});

test('model observes remaining decisions and time after the current reservation',async()=>{
 let seen;
 const f=fixture({maxDecisions:2,wallDeadlineMs:10000,now:()=>4000,decide:async o=>{seen=o;return {kind:'wait'};}});
 await f.controller.resume();await f.controller.decide();
 assert.deepEqual(seen.experimentBudget,{maximumDecisions:2,decisionAttempts:1,furtherDecisions:1,simulatedSecondsRemaining:900,wallSecondsRemaining:6});
 await f.controller.step(60);await f.controller.decide();assert.equal(seen.experimentBudget.furtherDecisions,0);assert.equal(seen.experimentBudget.simulatedSecondsRemaining,899);
});
test('unusable material choice returns feedback and permits the next bounded decision',async()=>{
 let calls=0;
 const f=fixture({maxDecisions:2,decide:async()=>++calls===1?{kind:'consume',materialId:'material:route-snack'}:{kind:'wait'}});
 await f.controller.resume();await f.controller.decide();
 assert.equal(f.controller.state().status,'running');assert.equal(f.controller.observation().lastOutcome.reason,'not-consumable');
 assert.equal(f.workshop.snapshot().revision,0);assert.equal(f.saved().actionEvidence[0].status,'rejected');
 await f.controller.decide();assert.equal(f.controller.state().calls,2);assert.equal(f.controller.state().error,null);
});
test('closing a failed controller preserves the failure status and error',async()=>{
 const f=fixture({maxDecisions:1,decide:async()=>({kind:'unsupported'})});
 await f.controller.resume();await assert.rejects(f.controller.decide());await f.controller.end();
 assert.equal(f.saved().status,'failed');assert.ok(f.saved().error);
});
test('decision summaries survive checkpoints and report copies cannot mutate resident evidence',async()=>{
 const f=fixture({maxDecisions:1,decide:async()=>({action:{kind:'move',move:1,frames:60},decisionSummary:'Approach the supplies.'})});
 await f.controller.resume();await f.controller.decide();await f.controller.step(60);await f.controller.end();
 assert.equal(f.saved().actionEvidence[0].decisionSummary,'Approach the supplies.');
 const report=f.controller.report();assert.equal(report.actionEvidence[0].status,'movement-completed');
 report.actionEvidence[0].decisionSummary='changed';assert.equal(f.controller.report().actionEvidence[0].decisionSummary,'Approach the supplies.');
 assert.ok(report.actionEvidence[0].pathMeters>0);
});
test('memory comparison returns prior intent only in its declared condition and preserves actual rejection',async()=>{
 for(const memoryCondition of ['outcomes-only','intent-and-outcomes']){
  const f=fixture({maxDecisions:2,memoryCondition,decide:async()=>({action:{kind:'consume',materialId:'route-snack',quantity:1},decisionSummary:'Eat the snack I believe I carry.'})});
  await f.controller.resume();await f.controller.decide();
  const observation=f.controller.observation(),entry=observation.recentMemory[0];
  assert.equal(observation.memoryCondition,memoryCondition);assert.equal(entry.status,'rejected');
  assert.equal(entry.decisionSummary,memoryCondition==='intent-and-outcomes'?'Eat the snack I believe I carry.':undefined);
  assert.equal(f.saved().memoryCondition,memoryCondition);
  assert.equal(f.saved().actionEvidence[0].status,'rejected');
  entry.status='accepted';assert.equal(f.controller.observation().recentMemory[0].status,'rejected');
 }
 assert.throws(()=>fixture({memoryCondition:'invented'}),/Unknown resident memory/);
});
