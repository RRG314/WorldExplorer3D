import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createMarineClock,createMarineLink} from '../app/js/ocean/shared-marine-link.js';
import {openSharedMarine} from '../app/js/ocean/shared-marine-runtime.js';
const {mutateMarineExpedition}=createRequire(import.meta.url)('../functions/marine-expedition-authority.js');
const settle=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
test('lease ownership uses monotonic server time, independent of ±60 second local clock corrections',t=>{
 let now=20;const clock=createMarineClock(()=>now);assert.equal(clock.leaseNow(),Infinity);
 now=220;clock.observe(1000000,20);assert.equal(clock.leaseNow(),1000200);
 for(const skew of [-60000,60000]){t.mock.method(Date,'now',()=>1000000+skew);now+=100;assert.equal(clock.leaseNow(),1000000+now-20);}
 now+=15000;assert.ok(clock.leaseNow()>1015000);
});
test('delayed actual client movement cannot build a FIFO; recovery reconciles before resuming',async t=>{
 let now=1000000,state,timer,subscription,release,sequence=0,delay=true;
 const elements=[],events=[];
 const element=()=>{const e={dataset:{},style:{},children:[],append(...v){this.children.push(...v);},setAttribute(){},replaceChildren(...v){this.children=v;},remove(){},blur(){}};elements.push(e);return e;};
 const previousDocument=globalThis.document;globalThis.document={createElement:element,head:element(),body:element()};t.after(()=>{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;});
 t.mock.method(globalThis,'setInterval',fn=>{timer=fn;return 1;});t.mock.method(globalThis,'clearInterval',()=>{});
 function mutate(uid,type,extra={}){return state=mutateMarineExpedition(state,{roomCode:'TEST',uid,activeUids:['captain','pilot'],nowMs:now,newId:'test-voyage',command:{type,requestId:`test-command-${++sequence}`,revision:state?.controlRevision||0,deployment:state?.deployment||0,...extra}});}
 mutate('captain','create');mutate('pilot','join');mutate('pilot','claim',{seat:'pilot'});mutate('captain','deploy');
 const ctx={oceanMode:{active:true,submarine:{position:{x:0,y:-12,z:-65},yaw:0}},boatMode:{active:false},startOceanMode:async()=>true,setPaused(){}};
 const transport={uid:'pilot',roomCode:'TEST',isCurrent:()=>true,subscribe(fn){subscription=fn;fn(state);return()=>{};},async send(command){
  if(command.type==='pose'&&delay){delay=false;await new Promise(resolve=>release=resolve);}
  state=mutateMarineExpedition(state,{roomCode:'TEST',uid:'pilot',activeUids:['captain','pilot'],nowMs:now,command});events.push(command);subscription(state);return{state,serverNowMs:now};
 }};
 const api=await openSharedMarine(ctx,{transport,now:()=>now});elements.find(e=>e.id==='sharedMarineJoin').onclick();await settle();assert.equal(api.canPilot,true);
 now+=2500;ctx.oceanMode.submarine.position.z+=35;timer();await settle();
 now+=1000;assert.equal(api.canPilot,false,'stop predicting after a slow acknowledgment');
 for(let i=0;i<3;i++){now+=500;timer();await settle();assert.equal(api.snapshot().connection.pending,1);}
 release();await settle();assert.equal(events.filter(e=>e.type==='pose').length,1);assert.equal(api.canPilot,true);
 assert.equal(ctx.oceanMode.submarine.position.z,state.submarine.pose.z);
 now+=2500;ctx.oceanMode.submarine.position.z+=35;timer();await settle();assert.equal(api.canPilot,true);assert.equal(api.snapshot().error,'');assert.equal(events.filter(e=>e.type==='pose').length,2);
 await api.leave({restore:false});
});
test('uncertain response stops prediction; rejoin adopts authoritative state and clears recovery',async()=>{
 let now=0,current=true,fail=true,reconciled=0,state={controlRevision:1,deployment:1,updatedAtMs:1000000};
 const link=createMarineLink({now:()=>now,state:()=>state,transport:{isCurrent:()=>current,send:async()=>{if(fail)throw Error('offline');return {state,serverNowMs:1000000+now};}},onState:s=>state=s,onFault:()=>{},reconcile:()=>reconciled++});
 await assert.rejects(link.sample('pose',()=>({pose:{}})),/offline/);assert.equal(link.blocked(),true);assert.equal(link.sample('pose',()=>({})),null);
 fail=false;now=2500;await link.send('join');assert.equal(link.blocked(),false);assert.equal(reconciled,1);
 current=false;await assert.rejects(link.send('pose'),/Room connection changed/);assert.equal(reconciled,1);link.dispose();
});
test('stage publications converge during entry and leaving cancels a pending entry',async t=>{
 const elements=[],pending=[];let subscription,recovered=0;
 const element=()=>{const e={dataset:{},style:{},append(){},setAttribute(){},replaceChildren(){},remove(){},blur(){}};elements.push(e);return e;};
 const previous=globalThis.document;globalThis.document={createElement:element,head:element(),body:element()};t.after(()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;});
 t.mock.method(globalThis,'setInterval',()=>1);t.mock.method(globalThis,'clearInterval',()=>{});
 let state={id:'lifecycle',revision:1,deployment:0,stage:'aboard',updatedAtMs:1000,site:{},ship:{id:'ship',anchor:{}},submarine:{id:'sub',pose:{x:0,y:-12,z:-65,yaw:0},poseAtMs:1000},crew:{},seats:{},manifest:[],rescues:[]};
 const ctx={oceanMode:{active:false},boatMode:{active:false},startOceanMode:options=>new Promise(resolve=>pending.push({options,resolve})),transferSubmarineToBoat:async()=>{recovered++;return true;}};
 const transport={uid:'pilot',roomCode:'TEST',isCurrent:()=>true,subscribe:fn=>{subscription=fn;fn(state);return()=>{};},send:async()=>({state,serverNowMs:1000})};
 const api=await openSharedMarine(ctx,{transport,now:()=>0});elements.find(e=>e.id==='sharedMarineJoin').onclick();await settle();assert.equal(pending.length,1);
 state={...state,revision:2,deployment:1,stage:'underwater'};subscription(state);assert.equal(pending[0].options.isTransferCurrent(),false);
 pending[0].resolve(true);await settle();assert.equal(pending.length,2,'latest stage is applied without another server publication');assert.equal(recovered,0);
 const leaving=api.leave({restore:false});assert.equal(api.active,false);assert.equal(pending[1].options.isTransferCurrent(),false);
 pending[1].resolve(false);await leaving;assert.equal(ctx.sharedMarine,null);assert.equal(recovered,0);
});
