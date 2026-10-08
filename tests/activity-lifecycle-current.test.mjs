import test from 'node:test';import assert from 'node:assert/strict';
import {ctx} from '../app/js/shared-context.js?v=55';
import {startActivity,stopActivity,updateActivityRuntime,getRuntimeSnapshot,getCompletionState,replayLastActivity} from '../app/js/activity-discovery/runtime.js?v=9';
import {createGameplayPluginRegistry} from '../app/js/gameplay/plugin-registry.js';
const disk=new Map();globalThis.localStorage={getItem:k=>disk.get(k),setItem:(k,v)=>disk.set(k,v)};
let mode='walk',environment='EARTH',records=[];
Object.assign(ctx,{_worldLoadSequence:1,paused:false,worldLoading:false,getEnv:()=>environment,getCurrentTravelMode:()=>mode,setTravelMode:m=>{mode=m;return true},Walk:{state:{walker:{x:0,y:1.7,z:0}}},car:{x:0,y:1,z:0},recordExplorerEvent:async event=>{records.push(event);return {recorded:true,event}}});
const route=id=>({id,title:id,traversalMode:'walk',requiresNearbyStart:false,anchors:[{id:'a',typeId:'start',x:0,y:0,z:0},{id:'b',typeId:'checkpoint',label:'View',x:0,y:0,z:50},{id:'c',typeId:'finish',label:'Finish',x:0,y:0,z:100}]});
test('route mode, pause and world ownership prevent invalid completion; legitimate completion records once',async()=>{
 assert.equal(startActivity(route('lifecycle-route')),true);updateActivityRuntime(.05);const elapsed=getRuntimeSnapshot().elapsedMs;
 mode='drive';ctx.car.z=100;updateActivityRuntime(.05);assert.equal(getRuntimeSnapshot().targetIndex,1);assert.equal(getRuntimeSnapshot().elapsedMs,elapsed);
 mode='walk';ctx.paused=true;ctx.Walk.state.walker.z=50;updateActivityRuntime(.05);assert.equal(getRuntimeSnapshot().targetIndex,1);ctx.paused=false;
 updateActivityRuntime(.05);assert.equal(getRuntimeSnapshot().targetIndex,2);ctx.Walk.state.walker.z=100;updateActivityRuntime(.05);updateActivityRuntime(.05);updateActivityRuntime(.05);await new Promise(r=>setTimeout(r,0));
 assert.equal(records.length,1);assert.equal(getCompletionState('lifecycle-route').count,1);assert.equal(getRuntimeSnapshot().active,false);
 startActivity(route('world-change'));environment='OCEAN';updateActivityRuntime(.05);assert.equal(getRuntimeSnapshot().active,false);assert.equal(records.length,1);environment='EARTH';
 startActivity(route('reload-world'));ctx._worldLoadSequence++;updateActivityRuntime(.05);assert.equal(getRuntimeSnapshot().active,false);assert.equal(records.length,1);
});
test('selected replay restarts that activity, abort has no reward, and invalid routes never start',()=>{
 startActivity(route('old-route'));stopActivity();assert.equal(replayLastActivity(route('selected-route')),true);assert.equal(getRuntimeSnapshot().activityId,'selected-route');stopActivity();assert.equal(getCompletionState('selected-route'),null);
 assert.equal(startActivity({...route('invalid'),anchors:[]}),false);assert.equal(getRuntimeSnapshot().active,false);
 assert.equal(startActivity({...route('unsupported'),traversalMode:'submarine'}),false);
});
test('registry decline releases partial resources and pause suppresses plugin updates',()=>{
 const r=createGameplayPluginRegistry();let stopped=0,updates=0;r.register({id:'declined',start:()=>false,stop:()=>stopped++});assert.equal(r.start('declined'),false);assert.equal(r.getActiveId(),null);assert.equal(stopped,1);
 r.register({id:'good',start:()=>true,update:()=>updates++,stop:()=>stopped++});r.start('good');r.update(.1,{appCtx:{paused:true}});r.update(.1,{appCtx:{worldLoading:true}});assert.equal(updates,0);r.update(.1,{appCtx:{}});assert.equal(updates,1);r.stop();assert.equal(stopped,2);assert.equal(r.getActiveId(),null);
});
test('asynchronous plugin starts cannot regain ownership after replacement, and declined starts release it',async()=>{
 const r=createGameplayPluginRegistry();let ready,updates=0,stops=0;r.register({id:'lazy',start:()=>new Promise(resolve=>ready=resolve),update:()=>updates++,stop:()=>stops++});r.register({id:'free'});
 const pending=r.start('lazy');assert.equal(r.snapshot().starting,true);r.update(.1,{});assert.equal(updates,0);r.start('free');ready(true);assert.equal(await pending,false);assert.equal(r.getActiveId(),'free');assert.equal(stops,1);
 const declined=r.start('lazy');ready(false);assert.equal(await declined,false);assert.equal(r.getActiveId(),null);assert.equal(stops,2);
});
test('failed location-game loads release the current owner but cannot stop a replacement',async()=>{
 const {readFile}=await import('node:fs/promises');const vm=await import('node:vm');
 const source=(await readFile(new URL('../app/js/runtime/on-demand-location-games.js',import.meta.url),'utf8')).replace(/^import .*;\n/,'').replace(/import\('[^']+'\)/g,'loadModule()').replace(/export \{[\s\S]*?\};/,'');
 for(const mode of ['deflock','livegps']){
  const rejections=[],notices=[];let stopped=0;const appCtx={gameMode:mode,stopGameplayPlugin(){stopped++;this.gameMode='free'},showToast:m=>notices.push(m)};
  const context=vm.createContext({appCtx,loadModule:()=>new Promise((_,reject)=>rejections.push(reject)),console:{error(){}}});vm.runInContext(source,context);
  const start=mode==='deflock'?'startDeFlockMode()':'startLiveGpsMode()';
  vm.runInContext(start,context);rejections.shift()(Error('offline'));await new Promise(r=>setImmediate(r));assert.equal(stopped,1);assert.equal(notices.length,1);assert.equal(appCtx.gameMode,'free');
  appCtx.gameMode=mode;vm.runInContext(start,context);appCtx.gameMode='trial';rejections.shift()(Error('late failure'));await new Promise(r=>setImmediate(r));assert.equal(stopped,1);assert.equal(appCtx.gameMode,'trial');
 }
});
