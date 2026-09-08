import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveChaseCameraTerrainCollision as solve} from '../app/js/hud/chase-camera-terrain.js';
import {vehicleCameraProbeRadius} from '../app/js/hud/vehicle-camera-body.js';
const origin={x:0,y:.5,z:0},target={x:0,y:5,z:-10};
for(const height of [800,505,360])test(`legacy rear framing survives flat ground at 1280x${height}`,()=>{
 const clearance=vehicleCameraProbeRadius({near:.5,fov:70,aspect:1280/height});
 const result=solve(origin,target,()=>0,{clearance});
 assert.deepEqual(result,{...target,collided:false});
});
test('real hillside still retracts the rear boom before ground intersection',()=>{
 const result=solve(origin,target,(_x,z)=>z < -5?8:0,{clearance:1.08});
 assert.equal(result.collided,true);assert.ok(result.z>-5);
});
test('full endpoint clearance still protects the camera near plane',()=>{
 const result=solve(origin,target,(_x,z)=>z < -9?4.5:0,{clearance:1.08});
 assert.equal(result.collided,true);assert.ok(result.z>-9);
});
