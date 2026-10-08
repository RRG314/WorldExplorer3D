import test from 'node:test';
import assert from 'node:assert/strict';
import {createEarthReturnAction} from '../app/js/travel/earth-return.js';
test('Earth menu awaits restoration from space, planets and ocean and coalesces repeated presses',async()=>{
 for(const environment of ['SPACE_FLIGHT','MOON','MARS','OCEAN']){
  const calls=[];let release;
  const ctx={ENV:{EARTH:'EARTH'},getEnv:()=>environment,updateControlsModeUI:()=>calls.push('ui')};
  const action=createEarthReturnAction({ctx,exitEnvironment:(target)=>calls.push(target),resumeEarth:()=>{calls.push('resume');return new Promise(r=>release=r)}});
  const first=action(),second=action();assert.equal(first,second);assert.deepEqual(calls,['EARTH','resume']);
  release({resumed:true});assert.equal(await first,true);assert.deepEqual(calls,['EARTH','resume','ui']);
 }
});
test('failed Earth restoration reports failure, preserves retry and never calls it success',async()=>{
 let attempts=0,notices=0,updates=0;
 const ctx={ENV:{EARTH:'EARTH'},showToast:()=>notices++,updateControlsModeUI:()=>updates++};
 const action=createEarthReturnAction({ctx,exitEnvironment:()=>{},resumeEarth:async()=>{attempts++;if(attempts===1)throw new Error('controlled failure');return {resumed:false}}});
 assert.equal(await action(),false);assert.equal(notices,1);assert.equal(updates,0);
 assert.equal(await action(),true);assert.equal(attempts,2);assert.equal(updates,1);
});
test('superseded Earth return does not publish successful UI',async()=>{
 let updates=0;
 const action=createEarthReturnAction({ctx:{ENV:{EARTH:'EARTH'},updateControlsModeUI:()=>updates++},exitEnvironment:()=>{},resumeEarth:async()=>({aborted:true})});
 assert.equal(await action(),false);assert.equal(updates,0);
});
