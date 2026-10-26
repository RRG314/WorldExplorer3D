import test from 'node:test';
import assert from 'node:assert/strict';
import {createRuntimeKernel} from '../app/js/runtime/kernel.js?v=3';
import {createCoreFrameSystems,updateSuspendedFrameInput} from '../app/js/runtime/core-frame-systems.js?v=12';
import {dedicatedPresentationActive} from '../app/js/runtime/renderer-owners.js';
function fixture(t){
 const calls=[];const ctx={gameStarted:true,spaceFlight:{active:false},oceanMode:{active:false},vrPresentation:{guard:()=>calls.push('guard'),beforeInput:()=>calls.push('before')},updateControlInput:()=>calls.push('input')};
 const kernel=createRuntimeKernel({now:()=>0,getContext:()=>({ctx}),isSuspended:()=>dedicatedPresentationActive(ctx),onSuspendedFrame:frame=>updateSuspendedFrameInput(ctx,frame)});
 kernel.registerSystem(createCoreFrameSystems(ctx).find(system=>system.id==='core.input'));
 kernel.registerSystem({id:'fixture-simulation',owner:'fixture',phase:'simulation',update:()=>calls.push('simulation')});
 t.after(()=>kernel.dispose());let timestamp=0;return {ctx,calls,kernel,step:()=>kernel.runFrame(timestamp+=20)};
}
test('one existing input frame continues across Earth, Space and Ocean without resuming suspended simulation',t=>{
 const {ctx,calls,step}=fixture(t);step();assert.equal(calls.filter(c=>c==='input').length,1);assert.ok(calls.includes('simulation'));calls.length=0;
 for(const mode of ['spaceFlight','oceanMode']){
  ctx[mode].active=true;step();assert.deepEqual(calls,['guard','before','input']);assert.equal(ctx.lastTime,40+(mode==='oceanMode'?20:0));calls.length=0;ctx[mode].active=false;
 }
 step();assert.equal(calls.filter(c=>c==='input').length,1);assert.ok(calls.includes('simulation'));
});
test('dedicated presentation keeps readiness, AR and hidden-page boundaries, while a menu pause can refresh control visibility',t=>{
 const {ctx,calls,step}=fixture(t);ctx.spaceFlight.active=true;
 for(const field of ['worldLoading','titleLaunchPending','arSessionActive']){ctx[field]=true;step();assert.deepEqual(calls,['guard'],field);calls.length=0;ctx[field]=false;}
 ctx.gameStarted=false;step();assert.deepEqual(calls,['guard']);calls.length=0;ctx.gameStarted=true;
 ctx.paused=true;step();assert.deepEqual(calls,['guard','before','input']);calls.length=0;
 const saved=Object.getOwnPropertyDescriptor(globalThis,'document');try{globalThis.document={hidden:true};step();assert.deepEqual(calls,['guard']);}finally{if(saved)Object.defineProperty(globalThis,'document',saved);else delete globalThis.document;}
});
