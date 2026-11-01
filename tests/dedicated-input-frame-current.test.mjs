import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {parse} from '@babel/parser';
import {createRuntimeKernel} from '../app/js/runtime/kernel.js?v=3';
import {createCoreFrameSystems} from '../app/js/runtime/core-frame-systems.js?v=13';
import {dedicatedPresentationActive} from '../app/js/runtime/renderer-owners.js';
import {acceptedSimulationDelta} from '../app/js/runtime/simulation-clock.js';
import {updateControlInputFrame} from '../app/js/controls/input-frame.js';
function context(){const calls=[];const ctx={gameStarted:true,spaceFlight:{active:false},oceanMode:{active:false},vrPresentation:{beforeInput:()=>calls.push('before')},updateControlInput:()=>calls.push('input')};return {ctx,calls};}
test('the existing Earth kernel polls once per active frame and yields input with dedicated presentation',t=>{
 const {ctx,calls}=context();const kernel=createRuntimeKernel({now:()=>0,isSuspended:()=>dedicatedPresentationActive(ctx)});t.after(()=>kernel.dispose());kernel.registerSystem(createCoreFrameSystems(ctx).find(s=>s.id==='core.input'));
 kernel.runFrame(0);assert.deepEqual(calls,['before','input']);calls.length=0;
 for(const mode of ['spaceFlight','oceanMode']){ctx[mode].active=true;kernel.runFrame(20);assert.deepEqual(calls,[]);ctx[mode].active=false;}
 kernel.runFrame(40);assert.deepEqual(calls,['before','input']);
});
test('the shared input boundary keeps readiness, AR and hidden-page guards while refreshing a menu pause',()=>{
 const {ctx,calls}=context();for(const field of ['worldLoading','titleLaunchPending','arSessionActive']){ctx[field]=true;assert.equal(updateControlInputFrame(ctx,{}),false);ctx[field]=false;}
 ctx.gameStarted=false;assert.equal(updateControlInputFrame(ctx,{}),false);ctx.gameStarted=true;assert.deepEqual(calls,[]);
 ctx.paused=true;assert.equal(updateControlInputFrame(ctx,{}),true);assert.deepEqual(calls,['before','input']);calls.length=0;
 const saved=Object.getOwnPropertyDescriptor(globalThis,'document');try{globalThis.document={hidden:true};assert.equal(updateControlInputFrame(ctx,{}),false);assert.deepEqual(calls,[]);}finally{if(saved)Object.defineProperty(globalThis,'document',saved);else delete globalThis.document;}
});
test('actual Space and Ocean callback prefixes poll once on fresh launch, through pause, without an Earth kernel',async()=>{
 // Execute the real entry guards, scheduling and input statements in isolation.
 // The remainder renders/advances its world and belongs to browser acceptance.
 for(const [file,name,frame] of [['space/runtime.js','animateSpaceFlight','spaceFlight'],['ocean.js','animateOceanMode','oceanMode']]){
  const source=await readFile(new URL('../app/js/'+file,import.meta.url),'utf8');const ast=parse(source,{sourceType:'module'});const fn=ast.program.body.map(n=>n.declaration||n).find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);assert.ok(fn);
  const step=ast.program.body.map(n=>n.declaration||n).find(n=>n.type==='FunctionDeclaration'&&n.id.name===(frame==='spaceFlight'?'stepSpaceFlight':'stepOceanMode'));assert.ok(step);
  const statements=step.body.body.filter(n=>n.type==='ExpressionStatement'&&n.expression.type==='CallExpression'&&n.expression.callee.name==='updateControlInputFrame');assert.equal(statements.length,1);const prefix=source.slice(fn.start,fn.end)+'\n'+source.slice(step.start,statements[0].end)+'\n}';
  const {ctx,calls}=context();ctx[frame].active=true;ctx.paused=true;let scheduled=0;const schedule=()=>++scheduled;const bindings={acceptedSimulationDelta,appCtx:ctx,oceanMode:ctx.oceanMode,oceanSessionScope:{animationFrame:schedule},updateControlInputFrame,performance:{now:()=>1000},requestAnimationFrame:schedule};
  vm.runInNewContext(prefix+`;${name}();`,bindings);assert.deepEqual(calls,['before','input'],file);assert.equal(scheduled,1,file+' uses its one existing callback');calls.length=0;ctx[frame].active=false;
  vm.runInNewContext(prefix+`;${name}();`,bindings);assert.deepEqual(calls,[]);assert.equal(scheduled,1,'Inactive owner cannot schedule or poll');
 }
});
