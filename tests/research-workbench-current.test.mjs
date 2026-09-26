import test from 'node:test';import assert from 'node:assert/strict';
import {applyResearchCommand,sampleIsMounted} from '../app/js/expedition/research-workbench.js';
import {executeExpeditionCommand} from '../app/js/expedition/command-authority.js';
import {applyShipOperation} from '../app/js/expedition/ship-operations.js';
const plan=()=>({id:'research-test',type:'InterstellarExpedition',scienceSamples:[{id:'a',label:'Basalt',bodyId:'mars',massKg:3},{id:'b',label:'Regolith',bodyId:'moon',massKg:2}],resources:{scienceCargoKg:5,feedstockKg:4,maintenanceKg:0,powerMWh:1},systems:{},crew:[],log:[]});
const command=(e,benchId,researchAction,sampleId)=>executeExpeditionCommand(e,{type:'research',benchId,researchAction,sampleId}).expedition;
test('physical specimens retain their IDs across benches, save reload, measurements and conserved fabrication',()=>{
 let e=plan();const original=JSON.stringify(e);
 for(const bench of ['science-bench','analysis-bench','fabrication-bench']){
  for(const id of ['a','b'])e=command(e,bench,'place',id);
  assert.equal(sampleIsMounted(e,'a'),true);
  assert.throws(()=>command(e,bench,'place','a'),/not_available/);
  assert.equal(applyShipOperation(e,'process-resource-sample').changed,false,'mounted lots cannot enter batch processor');
  e=JSON.parse(JSON.stringify(e));
  if(bench==='fabrication-bench')e=command(e,bench,'fabricate');
  else{
   e=command(e,bench,'measure');const energy=e.resources.powerMWh;
   assert.throws(()=>command(e,bench,'measure'),/not_available/);
   assert.equal(e.resources.powerMWh,energy);
   for(const id of ['a','b'])e=command(e,bench,'return',id);
  }
 }
 assert.equal(e.resources.scienceCargoKg,0);assert.equal(e.resources.feedstockKg,2);assert.equal(e.resources.maintenanceKg,7);
 assert.equal(e.resources.feedstockKg+e.resources.scienceCargoKg+e.resources.maintenanceKg,9);
 assert.throws(()=>command(e,'fabrication-bench','fabricate'),/not_available/);
 assert.throws(()=>command(e,'science-bench','place','a'),/not_available/);
 assert.equal(e.scienceSamples.length,2);assert.equal(e.scienceSamples[0].bodyId,'mars');assert.equal(JSON.stringify(plan()),original);
});
test('insufficient power and uncharacterized or missing samples never mutate the manifest',()=>{
 let e=plan();e=command(e,'fabrication-bench','place','a');e=command(e,'fabrication-bench','place','b');
 assert.equal(applyResearchCommand(e,{benchId:'fabrication-bench',researchAction:'fabricate'}).changed,false);
 e=command(e,'fabrication-bench','return','a');e=command(e,'science-bench','place','a');e.resources.powerMWh=0;
 const before=JSON.stringify(e);assert.equal(applyResearchCommand(e,{benchId:'science-bench',researchAction:'measure'}).changed,false);assert.equal(JSON.stringify(e),before);
 assert.throws(()=>command(e,'unknown','place','a'),/not_available/);
});
test('browser and deployed-engine module apply the same conserved research commands',async()=>{
 const {default:server}=await import('../functions/generated/expedition-command-engine.cjs');
 let browser=plan(),backend=plan();
 const send=(benchId,researchAction,sampleId)=>{
  const cmd={type:'research',benchId,researchAction,sampleId},options={nowMs:123};
  browser=executeExpeditionCommand(browser,cmd,options).expedition;
  backend=server.executeExpeditionCommand(backend,cmd,options).expedition;
  // Commit timestamps belong to each execution clock; gameplay records must agree.
  assert.deepEqual({...backend,updatedAtMs:0},{...browser,updatedAtMs:0});
 };
 for(const bench of ['science-bench','analysis-bench','fabrication-bench']){
  for(const id of ['a','b'])send(bench,'place',id);
  if(bench==='fabrication-bench')send(bench,'fabricate');
  else{send(bench,'measure');for(const id of ['a','b'])send(bench,'return',id);}
 }
 assert.equal(backend.resources.maintenanceKg,7);
});
