import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {acceptanceInputs,reusableAcceptance,evidenceReference} from './acceptance-inputs.mjs';

const root=process.cwd(),flag=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];};
const manifest=JSON.parse(await fs.readFile('config/browser-foundation-acceptance.json','utf8'));
const only=flag('--case'),adopt=flag('--adopt'),artifactRoot=flag('--artifact');
const dir='output/research/browser-completion-2026-10-20/acceptance';await fs.mkdir(dir,{recursive:true});
const results=[];
for(const definition of manifest.cases.filter(c=>!only||c.id===only)){
 const identity=await acceptanceInputs(root,definition,{artifactRoot});
 const receiptPath=path.join(dir,`${definition.id}.json`);
 const existing=await fs.readFile(receiptPath,'utf8').then(JSON.parse,()=>null);
 if(await reusableAcceptance(root,existing,identity)){results.push({id:definition.id,status:'reused',observedAt:existing.observedAt});continue;}
 if(process.argv.includes('--plan')){results.push({id:definition.id,status:'needs-execution',inputs:Object.keys(identity.inputs).length});continue;}
 let output=adopt;
 if(adopt){
  if(!only)throw Error('Adoption requires one explicit --case');
  const tap=await fs.readFile(adopt,'utf8');if(!/^# fail 0$/m.test(tap)||!/^# pass [1-9]\d*$/m.test(tap))throw Error('Only completed passing TAP evidence can be adopted');
  const evidenceStat=await fs.stat(adopt);
  for(const file of Object.keys(identity.inputs))if(!file.endsWith('package-lock.json')&&(await fs.stat(file)).mtimeMs>evidenceStat.mtimeMs)throw Error(`Input newer than the passing run: ${file}`);
 }else{
  output=path.join(dir,`${definition.id}-${Date.now()}.log`);
  const handle=await fs.open(output,'w');let exitCode;
  try{exitCode=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,definition.args,{cwd:root,env:{...process.env,WE3D_VERIFY_ROOT:artifactRoot||process.env.WE3D_VERIFY_ROOT||'.'},stdio:['ignore',handle.fd,handle.fd]});const timeout=setTimeout(()=>child.kill('SIGTERM'),definition.timeoutMs);child.once('error',reject);child.once('exit',code=>{clearTimeout(timeout);resolve(code);});});}finally{await handle.close();}
  const after=await acceptanceInputs(root,definition,{artifactRoot});
  const status=exitCode===0&&after.fingerprint===identity.fingerprint?'passed':'failed';
  const receipt={id:definition.id,status,observedAt:new Date().toISOString(),...identity,exitCode,evidence:[await evidenceReference(root,output)]};
  await fs.writeFile(receiptPath,JSON.stringify(receipt,null,2)+'\n');
  results.push({id:definition.id,status,output});if(status!=='passed'){process.exitCode=1;break;}continue;
 }
 await fs.writeFile(receiptPath,JSON.stringify({id:definition.id,status:'passed',observedAt:new Date((await fs.stat(output)).mtimeMs).toISOString(),...identity,method:'adopted-completed-current-input-run',evidence:[await evidenceReference(root,output)]},null,2)+'\n');results.push({id:definition.id,status:'adopted',output});
}
if(only&&!results.length)throw Error(`Unknown acceptance case: ${only}`);
console.log(JSON.stringify({cases:results,fullHistoricalMatrix:false}));
