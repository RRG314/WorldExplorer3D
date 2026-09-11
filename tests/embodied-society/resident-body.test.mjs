import test from 'node:test';import assert from 'node:assert/strict';
import {createResidentMotor} from '../../app/js/experiments/embodied-society/resident-body.mjs';
import {ctx} from '../../app/js/shared-context.js?v=55';
const flat={walkSurfaceAt:()=>({position:{y:0}}),checkBuildingCollision:()=>({collision:false})};
const body=(actorId,world=flat)=>createResidentMotor({actorId,world,spawn:{x:0,y:1.7,z:0,yaw:0}});
test('residents use the real walking integrator with independent commands and state',()=>{
 const a=body('a'),b=body('b');a.command({move:1,frames:60});
 for(let i=0;i<60;i++){a.step();b.step();}
 assert.ok(Math.abs(a.observation().position.z-2.8)<0.01);assert.equal(b.observation().position.z,0);
 for(let i=0;i<60;i++)a.step();assert.ok(Math.abs(a.observation().position.z-2.8)<0.01);
});
test('world collision blocks physical movement; no teleport action exists',()=>{
 const a=body('a',{...flat,checkBuildingCollision:(x,z)=>({collision:z>0.8})});a.command({move:1,frames:120});for(let i=0;i<120;i++)a.step();
 assert.ok(a.observation().position.z<=0.8);assert.throws(()=>a.command({teleport:{x:100},frames:1}),/Unsupported/);
});
test('injected context does not consume active human controls or mutate the player',()=>{
 const old=ctx.readControlActions;ctx.readControlActions=()=>{throw new Error('Human input leaked');};
 try{const a=body('a');a.command({move:1,frames:1});a.step();assert.ok(a.observation().position.z>0);}finally{if(old===undefined)delete ctx.readControlActions;else ctx.readControlActions=old;}
});
test('pause clears held actions; bounded commands and missing surfaces fail closed',()=>{
 const a=body('a');a.command({move:1,frames:20});a.step();a.pause();const before=a.observation().position;a.step();assert.deepEqual(a.observation().position,before);
 a.resume();a.step();assert.deepEqual(a.observation().position,before);
 assert.throws(()=>a.command({move:1,frames:999999}),/duration/);
 const missing=body('b',{...flat,walkSurfaceAt:()=>null});assert.throws(()=>missing.step(),/verified walking surface/);
});
test('mapped walking queries use resident foot height and checkpoints exclude live world object references',()=>{
 let queried;
 const resident=createResidentMotor({actorId:'mapped',spawn:{x:0,y:11.7,z:0,yaw:0},world:{walkSurfaceAt:(_x,_z,options)=>{queried=options;return {position:{y:10},feature:{meshCallback:()=>{}}};},checkBuildingCollision:()=>({collision:false})}});
 resident.step();assert.equal(queried.currentY,10);assert.equal(queried.sampleRenderedMesh,false);
 assert.doesNotThrow(()=>JSON.stringify(resident.checkpoint()));assert.equal(Object.hasOwn(resident.checkpoint().walker,'_walkSupportFeature'),false);
});
