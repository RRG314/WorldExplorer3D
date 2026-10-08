import test from 'node:test';
import assert from 'node:assert/strict';
import {followRoadRoute} from '../scripts/verification/travel-road-route.mjs';

test('walking route driver uses camera yaw and finite walking velocity, then releases input',async()=>{
 const oldActor=globalThis.__WE3D_TRAVEL_ACTOR__,signal={stopped:false},keys=[];
 // A walker deliberately has no car.speed or car.yawRate fields.
 globalThis.__WE3D_TRAVEL_ACTOR__={x:0,z:0,angle:2,yaw:0,speedMph:0};
 const page={evaluate:async(fn,arg)=>fn(arg),keyboard:{down:async k=>{keys.push(['down',k]);signal.stopped=true;},up:async k=>keys.push(['up',k])}};
 try{
  const result=await followRoadRoute(page,{length:100,points:[{x:0,z:0},{x:0,z:100}]},signal,{mode:'walk'});
  assert.deepEqual(keys,[['down','w'],['up','w']]);
  assert.equal(result.samples[0].error,0);assert.equal(result.samples[0].speed,0);
 }finally{globalThis.__WE3D_TRAVEL_ACTOR__=oldActor;}
});

test('invalid route input fails visibly instead of silently collecting a stationary window',async()=>{
 const oldActor=globalThis.__WE3D_TRAVEL_ACTOR__;
 globalThis.__WE3D_TRAVEL_ACTOR__={x:0,z:0,angle:NaN,speed:0};
 try{await assert.rejects(followRoadRoute({evaluate:async(fn,arg)=>fn(arg),keyboard:{}},{length:100,points:[{x:0,z:0},{x:0,z:100}]},{stopped:false}),/invalid actor pose/);}
 finally{globalThis.__WE3D_TRAVEL_ACTOR__=oldActor;}
});
