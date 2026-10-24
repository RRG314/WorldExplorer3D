import {observationCurrent} from './freshness.mjs';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {gameplayQaInputs} from './inputs.mjs';
import {reusableAcceptance} from '../acceptance-inputs.mjs';

// Read existing evidence only. Reporting never starts a browser or retries a failure.
const root=process.cwd(),out=process.env.WE3D_QA_LEDGER||'output/research/gameplay-qa-2026-10-23';
const manifest=JSON.parse(await fs.readFile('config/gameplay-qa.json','utf8'));
const cache=new Map(),cases=[];
for(const group of manifest.groups){
 for(const id of group.checks||[group.id]){
  const receipt=await fs.readFile(out+'/receipts/'+id+'.json','utf8').then(JSON.parse,()=>null);
  if(!receipt){cases.push({id,status:'not-run'});continue;}
  const identity=await gameplayQaInputs(root,group,id,{sharedCache:cache});
  if(group.kind==='browser'){
   identity.environment=receipt.environment;
   identity.fingerprint=createHash('sha256').update(JSON.stringify({source:identity.fingerprint,environment:identity.environment})).digest('hex');
  }
  const valid=await reusableAcceptance(root,{...receipt,status:'passed'},identity);
  cases.push({id,status:valid?(observationCurrent(receipt,group.kind)?receipt.status:'expired-evidence'):'stale-evidence',observedAt:receipt.observedAt,
   failure:receipt.failure,details:receipt.details,evidence:receipt.evidence,
   targetObserved:receipt.targetObserved,retentionReview:receipt.retentionReview});
 }
}
const report={at:new Date().toISOString(),source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
 scope:'Source-checked saved evidence; no new browser run or live-service verification',cases,
 unresolved:cases.filter(c=>c.status!=='passed').map(c=>({id:c.id,status:c.status,failure:c.failure})),
 qualification:['Touch emulation uses the desktop GPU; physical iPhone/Android and Safari remain unverified.',
 'Native desktop samples are short gameplay windows, not sustained thermal or full-city capacity certification.',
 'Sensor and AR tests control permissions/sensor input; they do not certify real GPS/camera alignment.',
 'Headless staging App Check/reCAPTCHA failures remain separate from local gameplay assertions.'],
 fullHistoricalMatrix:false};
await fs.mkdir(out,{recursive:true});await fs.writeFile(out+'/coverage-report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({cases:cases.map(({id,status})=>({id,status})),unresolved:report.unresolved,report:out+'/coverage-report.json'},null,2));
