import test from 'node:test';
import assert from 'node:assert/strict';
import {ctx} from '../app/js/shared-context.js?v=55';
import {createWalkingRuntimeHelpers} from '../app/js/walking/runtime.js';
import {readControlActions,updateControlInput,clearControlInputState,setMobileTouchEnabled} from '../app/js/controls/action-input.js?v=12';
import {frameWindow} from '../scripts/verification/gameplay-qa/session.mjs';

test('walking camera cycles third, first, overhead and restores a visible third-person character',()=>{
 const state={view:'third',characterMesh:{visible:true}},runtime=createWalkingRuntimeHelpers({state});
 runtime.toggleView();assert.equal(state.view,'first');assert.equal(state.characterMesh.visible,false);
 runtime.toggleView();assert.equal(state.view,'overhead');assert.equal(state.characterMesh.visible,true);
 runtime.toggleView();assert.equal(state.view,'third');assert.equal(state.characterMesh.visible,true);
});
test('standard controller movement, look and jump work, dead zones stay still, disconnect releases held input',t=>{
 const navigatorDescriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator'),keys=ctx.keys;
 let pads=[];Object.defineProperty(globalThis,'navigator',{configurable:true,value:{getGamepads:()=>pads}});ctx.keys={};setMobileTouchEnabled(false);clearControlInputState();
 t.after(()=>{clearControlInputState();ctx.keys=keys;if(navigatorDescriptor)Object.defineProperty(globalThis,'navigator',navigatorDescriptor);else delete globalThis.navigator;});
 const pad={id:'Synthetic standard controller',connected:true,axes:[.5,-.7,.4,-.3],buttons:Array.from({length:16},()=>({value:0,pressed:false}))};pad.buttons[0]={value:1,pressed:true};pads=[pad];updateControlInput();
 for(const mode of ['walk','drive','plane','drone','boat','ocean']){const a=readControlActions(mode);assert.ok(a.move>0,mode+' forward');assert.ok(Math.abs(a.lookYaw)>0,mode+' camera');assert.equal(a.jump,1);}
 pad.axes=[.05,-.05,.05,-.05];pad.buttons[0]={value:0,pressed:false};updateControlInput();assert.equal(readControlActions('walk').move,0);assert.equal(readControlActions('walk').lookYaw,0);
 pads=[];updateControlInput();assert.equal(readControlActions('walk').move,0);assert.equal(readControlActions('walk').jump,0);
});
test('frame recorder counts published renderer frames rather than every browser animation callback',async t=>{
 const raf=globalThis.requestAnimationFrame,context=globalThis.qaContext;const render={frame:0};let tick=0;
 globalThis.qaContext={renderer:{info:{render}}};globalThis.requestAnimationFrame=callback=>queueMicrotask(()=>{tick++;if(tick%2===0)render.frame++;callback(tick*1000/60);});
 t.after(()=>{if(raf)globalThis.requestAnimationFrame=raf;else delete globalThis.requestAnimationFrame;if(context)globalThis.qaContext=context;else delete globalThis.qaContext;});
 const sample=await frameWindow({evaluate:(fn,arg)=>fn(arg)},1000);assert.ok(sample.averageFps>=28&&sample.averageFps<=32,JSON.stringify(sample));assert.ok(sample.p95Ms>30);assert.equal(sample.protocol,'native-published-render-frame-changes-v1');
});
