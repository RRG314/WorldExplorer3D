// Audit reproduction: actual client queue + actual server reducer, fake DOM,
// controlled clock and transport. Not browser/network/emulator acceptance.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {openSharedMarine} from '../../app/js/ocean/shared-marine-runtime.js';
const {mutateMarineExpedition}=createRequire(import.meta.url)('../../functions/marine-expedition-authority.js');
const original={document:globalThis.document,setInterval:globalThis.setInterval,clearInterval:globalThis.clearInterval,now:Date.now};
let now=1000000, timer, state, subscription, delayed, sequence=0;
const elements=[];
const element=()=>{const e={dataset:{},style:{},children:[],append(...v){this.children.push(...v);},setAttribute(){},replaceChildren(...v){this.children=v;},remove(){},blur(){}};elements.push(e);return e;};
globalThis.document={createElement:element,head:element(),body:element()};
globalThis.setInterval=fn=>{timer=fn;return 1;};globalThis.clearInterval=()=>{timer=null;};Date.now=()=>now;
const events=[];
function mutate(uid,type,extra={}){
  return state=mutateMarineExpedition(state,{roomCode:'AUDIT',uid,activeUids:['captain','pilot'],nowMs:now,newId:'audit-voyage',command:{type,requestId:`audit-command-${++sequence}`,revision:state?.controlRevision||0,deployment:state?.deployment||0,...extra}});
}
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
let api;
try{
  mutate('captain','create');mutate('pilot','join');mutate('pilot','claim',{seat:'pilot'});mutate('captain','deploy');
  const ctx={oceanMode:{active:true,submarine:{position:{x:0,y:-12,z:-65},yaw:0}},boatMode:{active:false},startOceanMode:async()=>true,setPaused(){}};
  let poseCalls=0;
  const transport={uid:'pilot',roomCode:'AUDIT',isCurrent:()=>true,subscribe(fn){subscription=fn;fn(state);return()=>{};},async send(command){
    if(command.type==='pose'&&++poseCalls===1)await new Promise(resolve=>{delayed=resolve;});
    try{
      state=mutateMarineExpedition(state,{roomCode:'AUDIT',uid:'pilot',activeUids:['captain','pilot'],nowMs:now,command});
      events.push({type:command.type,at:now,z:command.pose?.z,accepted:true});subscription(state);return{state};
    }catch(error){events.push({type:command.type,at:now,z:command.pose?.z,accepted:false,error:error.message});throw error;}
  }};
  api=await openSharedMarine(ctx,{transport});
  elements.find(e=>e.id==='sharedMarineJoin').onclick();await flush();
  assert.equal(api.canPilot,true);
  // Local motion is only 14 units/second, under the server's 34-unit limit.
  for(let tick=1;tick<=3;tick++){
    now=1000000+tick*2500;ctx.oceanMode.submarine.position.z=-65+tick*35;timer();await flush();
  }
  delayed();await flush();
  const poseEvents=events.filter(e=>e.type==='pose');
  assert.equal(poseEvents.length,3);assert.equal(poseEvents[0].accepted,true);
  assert.equal(poseEvents[1].error,'Submarine movement exceeds its travel envelope.');
  assert.equal(api.canPilot,false);
  const report={source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),scope:'Controlled component reproduction; real shared-marine client queue and server reducer. Fake DOM, fake clock and delayed transport. No hosted/emulator/browser claim.',scenario:'First pose delayed five seconds while valid local motion continues at 14 units/s; two newer poses enqueue, then drain at one server instant.',events,observedError:api.snapshot().error,controlsStopped:!api.canPilot};
  // A fresh join clears the control fault. A fast client wall clock independently
  // expires an otherwise-live server lease because owns() uses local Date.now.
  elements.find(e=>e.id==='sharedMarineJoin').onclick();await flush();
  assert.equal(api.canPilot,true);
  const serverNow=now,serverLeaseUntil=state.seats.pilot.untilMs;now+=60000;
  assert.equal(api.canPilot,false);
  report.clockSkew={clientAheadMs:60000,serverLeaseStillValid:serverLeaseUntil>serverNow,clientCanPilot:api.canPilot};
  now=serverNow;
  await api.leave({restore:false});
  await fs.mkdir('docs/system-review/2026-10-04',{recursive:true});
  await fs.writeFile('docs/system-review/2026-10-04/marine-timing-reproduction.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}finally{
  globalThis.document=original.document;globalThis.setInterval=original.setInterval;globalThis.clearInterval=original.clearInterval;Date.now=original.now;
}
