import {Session} from 'node:inspector';
import {performance} from 'node:perf_hooks';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {createCharacter} from '../../app/js/character/model.js';
import {createCapabilityResolver,prepareCharacterCapabilities} from '../../app/js/character/capability-resolver.js';
import {createBackpackModel} from '../../app/js/player/backpack-model.js';
const baseline='61c468b499a42a29e89d6ca6810c3941c4fb6260';
let source=execFileSync('git',['show',`${baseline}:app/js/character/capability-resolver.js`],{encoding:'utf8'});
source=source.replaceAll("'./model.js?v=1'",JSON.stringify(pathToFileURL(`${process.cwd()}/app/js/character/model.js`).href))
 .replaceAll("'./catalog.js?v=1'",JSON.stringify(pathToFileURL(`${process.cwd()}/app/js/character/catalog.js`).href));
const old=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const character=createCharacter({backgroundId:'general-explorer',now:100});
character.rewardLedger=Array.from({length:2048},(_,i)=>`world:city:field-survey:completed-session:reward-${i}`);
character.repetitionLedger=Object.fromEntries(Array.from({length:512},(_,i)=>[`activity-${i}`,{count:2,lastAt:1000,lastDifficulty:'basic'}]));
const backpack=createBackpackModel({items:Array.from({length:512},(_,i)=>({instanceId:`specimen-${i}`,catalogId:`specimen-${i}`,metadata:{label:`Field specimen ${i}`,category:'specimen'}}))});
backpack.upsertItem({catalogId:'metal-detector'});
const before=old.createCapabilityResolver(),after=createCapabilityResolver(),prepared=prepareCharacterCapabilities(character);
const oldRead=()=>before.resolve(character,'detector',{equipmentIds:backpack.snapshot().items.map(item=>item.catalogId)});
const newRead=()=>after.resolve(prepared,'detector',{equipmentIds:backpack.catalogIds()});
assert.deepEqual(oldRead(),newRead());
const inspector=new Session();inspector.connect();
const send=(method,params={})=>new Promise((resolve,reject)=>inspector.post(method,params,(error,result)=>error?reject(error):resolve(result)));
const records=[];
try{
 for(const [variant,read] of [['baseline',oldRead],['projection',newRead],['baseline-restored',oldRead],['projection-repeat',newRead]]){
  await send('HeapProfiler.startSampling',{samplingInterval:16384,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true});
  const start=performance.now();for(let i=0;i<1000;i++)read();const elapsedMs=performance.now()-start;
  const {profile}=await send('HeapProfiler.stopSampling');
  const size=node=>node.selfSize+node.children.reduce((n,child)=>n+size(child),0);
  records.push({variant,queries:1000,elapsedMs,sampledAllocationMiB:size(profile.head)/1048576});
 }
}finally{inspector.disconnect();}
const out='output/architecture-evaluation/capability-projection-1007';await mkdir(out,{recursive:true});
const report={scope:'Isolated Node CPU/allocation replay of actual old/current rules at supported character history limits and 512 owned items; not browser frame acceptance.',baseline,records};
await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
