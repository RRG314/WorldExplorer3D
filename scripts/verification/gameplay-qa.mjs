import {observationCurrent} from './gameplay-qa/freshness.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {reusableAcceptance,evidenceReference} from './acceptance-inputs.mjs';
import {gameplayQaInputs} from './gameplay-qa/inputs.mjs';
import {gameplayQaEnvironment,environmentIdentity} from './gameplay-qa/environment.mjs';
import {runLoggedStep} from './run-logged-step.mjs';

const root=process.cwd();
const flag=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];};
const output=process.env.WE3D_QA_LEDGER||'output/research/gameplay-qa-2026-10-23';
const selected=flag('--group'), selectedCheck=flag('--check'), retry=process.argv.includes('--retry');
const adopt=flag('--adopt'), plan=process.argv.includes('--plan');
assert.ok(!selectedCheck||selected,'Select --group when selecting --check');
assert.ok(!retry||(selected&&selectedCheck),'Retry requires one --group and --check after diagnosing its failure');
const manifest=JSON.parse(await fs.readFile('config/gameplay-qa.json','utf8'));
const groups=manifest.groups.filter(group=>!selected||group.id===selected);
assert.ok(groups.length,'Unknown QA group');
await fs.mkdir(output+'/receipts',{recursive:true});
let environment;
if(groups.some(group=>group.kind==='browser')){
  environment=await gameplayQaEnvironment(process.env.WE3D_QA_BASE||'https://we3d-staging-20260712.web.app');
}
const sharedCache=new Map();
const identityFor=async(group,id)=>{
  const identity=await gameplayQaInputs(root,group,id,{sharedCache});
  if(group.kind==='browser'){
    identity.environment=environmentIdentity(environment);
    identity.fingerprint=createHash('sha256').update(JSON.stringify({source:identity.fingerprint,environment:identity.environment})).digest('hex');
  }
  return identity;
};
const results=[];
for(const group of groups){
  const checks=(group.checks||[group.id]).filter(id=>!selectedCheck||id===selectedCheck);
  if(selectedCheck)assert.ok(checks.length,'Unknown check in selected group');
  const pending=[],identities=new Map();
  for(const id of checks){
    const identity=await identityFor(group,id);identities.set(id,identity);
    const receipt=await fs.readFile(output+'/receipts/'+id+'.json','utf8').then(JSON.parse,()=>null);
    const forced=retry&&id===selectedCheck;
    if(!forced&&observationCurrent(receipt,group.kind)&&await reusableAcceptance(root,receipt,identity)){
      results.push({id,status:'retained',observedAt:receipt.observedAt,evidence:receipt.evidence});
    }else if(!forced&&['failed','blocked'].includes(receipt?.status)&&await reusableAcceptance(root,{...receipt,status:'passed'},identity)){
      // Preserve a diagnosed failure. An unchanged failed check must not keep
      // launching the same world merely because the default command was rerun.
      results.push({id,status:'retained-failure',failure:receipt.failure,evidence:receipt.evidence});process.exitCode=1;
    }else pending.push(id);
  }
  if(!pending.length)continue;
  if(plan){for(const id of pending)results.push({id,status:'needs-execution'});continue;}
  const attempt=output+'/attempts/'+group.id+'-'+Date.now();
  await fs.mkdir(attempt,{recursive:true});
  const command=[process.execPath,...(group.kind==='unit'?['--test','--test-concurrency=1',...group.tests]:[group.module])];
  const log=adopt||attempt+'/execution.log';
  let execution;
  if(adopt){
    assert.equal(group.kind,'unit');assert.equal(groups.length,1);
    const proof=JSON.parse(await fs.readFile(adopt+'.command.json','utf8'));
    assert.deepEqual(proof.command,command,'Adopted log belongs to a different command');
    assert.equal(proof.fingerprint,identities.get(pending[0]).fingerprint,'Adopted inputs differ');
    assert.equal(proof.exitCode,0);assert.equal(proof.logSha256,(await evidenceReference(root,adopt)).sha256);
    const tap=await fs.readFile(adopt,'utf8');assert.match(tap,/^# fail 0$/m);assert.match(tap,/^# pass [1-9]\d*$/m);
    execution={ok:true,status:0,adoptedCompletedTap:true,command};
  }else{
    console.log(JSON.stringify({group:group.id,status:'running',checks:pending}));
    execution={...await runLoggedStep(command,{cwd:root,env:{...process.env,WE3D_QA_OUTPUT:attempt,WE3D_QA_CHECKS:JSON.stringify(pending)},logPath:log,timeoutMs:group.timeoutMs||600000,quiet:true}),command};
    await fs.writeFile(log+'.command.json',JSON.stringify({command,fingerprint:identities.get(pending[0]).fingerprint,exitCode:execution.status,logSha256:(await evidenceReference(root,log)).sha256},null,2));
  }
  sharedCache.clear();
  for(const id of pending){
    const identity=identities.get(id),after=await identityFor(group,id);
    assert.equal(after.fingerprint,identity.fingerprint,'Relevant inputs changed during '+id);
    const receipt=group.kind!=='browser'?{id,status:execution.ok?'passed':'failed',durationMs:execution.durationMs}:
      await fs.readFile(attempt+'/'+id+'.json','utf8').then(JSON.parse,()=>({id,status:'blocked',failure:{message:'Journey setup failed before this check'}}));
    const evidence=[await evidenceReference(root,log)];
    for(const file of [attempt+'/'+id+'.json',attempt+'/report.json',attempt+'/'+id+'-failed.png',...(group.evidence||[]).map(file=>attempt+'/'+file)]){
      if(await fs.stat(file).catch(()=>null))evidence.push(await evidenceReference(root,file));
      else if((group.evidence||[]).some(name=>file===attempt+'/'+name)){
        receipt.status='failed';receipt.failure={message:'Required evidence missing: '+file};
      }
    }
    const record={...receipt,observedAt:receipt.observedAt||new Date().toISOString(),...identity,execution,evidence};
    if(environment)record.targetObserved=environment;
    await fs.writeFile(attempt+'/'+id+'-receipt.json',JSON.stringify(record,null,2));
    await fs.writeFile(output+'/receipts/'+id+'.json',JSON.stringify(record,null,2));
    results.push({id,status:record.status,evidence});
    if(record.status!=='passed')process.exitCode=1;
  }
}
const summary={at:new Date().toISOString(),cases:results,environment,fullHistoricalMatrix:false,sourceUnchangedWhileMeasured:true};
await fs.writeFile(output+'/latest-summary.json',JSON.stringify(summary,null,2));
console.log(JSON.stringify({cases:results.map(({id,status})=>({id,status})),fullHistoricalMatrix:false,ledger:output+'/latest-summary.json'},null,2));
