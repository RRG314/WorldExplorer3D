import test from 'node:test';
import assert from 'node:assert/strict';
import {ctx} from '../app/js/shared-context.js?v=55';
import {clearActiveInterior} from '../app/js/interiors/runtime.js?v=20';
const deps={isWalkModeActive:()=>false,finiteNumber:(v,f)=>Number.isFinite(v)?v:f,listSupportedInteriorsNear:()=>[]};
test('interior exit restores this world exterior obstacles without reviving a prior world',()=>{
 const keys=['activeInterior','dynamicBuildingColliders','replaceWorldCollection','_worldLoadSequence','Walk'];const saved=Object.fromEntries(keys.map(k=>[k,ctx[k]]));
 try{
  ctx.Walk=null;ctx._worldLoadSequence=2;ctx.replaceWorldCollection=(key,value=[])=>{ctx[key]=value};const bench={id:'bench'},wall={id:'wall'};
  ctx.dynamicBuildingColliders=[bench];ctx.activeInterior=null;
  assert.equal(clearActiveInterior({preservePrompt:true},deps),false);assert.deepEqual(ctx.dynamicBuildingColliders,[bench]);
  ctx.activeInterior={outsideWorldSequence:2,outsideColliders:[bench]};ctx.dynamicBuildingColliders=[wall];
  assert.equal(clearActiveInterior({preservePrompt:true},deps),true);assert.deepEqual(ctx.dynamicBuildingColliders,[bench]);assert.equal(ctx.activeInterior,null);
  ctx.activeInterior={outsideWorldSequence:1,outsideColliders:[bench]};ctx.dynamicBuildingColliders=[wall];
  clearActiveInterior({preservePrompt:true},deps);assert.deepEqual(ctx.dynamicBuildingColliders,[]);
 }finally{Object.assign(ctx,saved)}
});
