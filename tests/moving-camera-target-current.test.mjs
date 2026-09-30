import test from 'node:test';
import assert from 'node:assert/strict';
import {smoothMovingCameraTarget as follow, beginCameraFollowFrame, cameraFollowHistory} from '../app/js/hud/moving-camera-target.js';

for (const rate of [12, 14, 60]) test(`moving chase target has constant lag at ${rate}/s across uneven frames`, () => {
  const velocity = {x:75,y:-3,z:26}, target = {x:0,y:10,z:0};
  const position = Object.fromEntries(Object.keys(target).map(k => [k,target[k]-velocity[k]/rate]));
  const history = {...target,valid:true};
  for(let i=0;i<600;i++) {
    const dt=[1/60,1/30,1/60,0.08,1/60][i%5];
    for(const key of Object.keys(target))target[key]+=velocity[key]*dt;
    follow(position,history,target.x,target.y,target.z,rate,dt);
    for(const key of Object.keys(target))assert.ok(Math.abs(target[key]-position[key]-velocity[key]/rate)<1e-9);
  }
});
test('stationary target retains original exponential response',()=>{
  const p={x:-3,y:1,z:10}, h={x:2,y:6,z:4,valid:true}, blend=1-Math.exp(-12/30);
  const expected={x:p.x+(2-p.x)*blend,y:p.y+(6-p.y)*blend,z:p.z+(4-p.z)*blend};
  follow(p,h,2,6,4,12,1/30);for(const k of Object.keys(p))assert.ok(Math.abs(p[k]-expected[k])<1e-12);
});
test('initialization and constrained camera use endpoint response without stale path history',()=>{
  for(const continuous of [true,false]){
    const p={x:0,y:0,z:0},h={x:-100,y:0,z:0,valid:false};
    follow(p,h,10,0,0,12,1/60,continuous);
    assert.ok(Math.abs(p.x-10*(1-Math.exp(-.2)))<1e-12);
    assert.equal(h.valid,continuous);
  }
});
test('zero duration and zero rate stay finite and do not move the camera',()=>{
  for(const dt of [0,1e-12,1/60]) {
    const p={x:1,y:2,z:3},h={x:-10,y:8,z:9,valid:true};
    follow(p,h,10,20,30,0,dt);assert.deepEqual(p,{x:1,y:2,z:3});
  }
});

test('camera modes cannot reuse a stale target path when returning to chase',()=>{
  const camera={userData:{}};
  beginCameraFollowFrame(camera);const first=cameraFollowHistory(camera,'plane');first.valid=true;
  beginCameraFollowFrame(camera);assert.equal(cameraFollowHistory(camera,'plane').valid,true);
  beginCameraFollowFrame(camera); // cockpit frame: no chase history used
  beginCameraFollowFrame(camera);assert.equal(cameraFollowHistory(camera,'plane').valid,false);
});

test('collision retraction ignores a valid previous path and invalidates it',()=>{
  const p={x:10,y:4,z:-12},h={x:100,y:80,z:90,valid:true};
  const before={...p},target={x:2,y:3,z:-4},blend=1-Math.exp(-42/30);
  follow(p,h,target.x,target.y,target.z,42,1/30,false);
  for(const k of Object.keys(p))assert.ok(Math.abs(p[k]-(before[k]+(target[k]-before[k])*blend))<1e-12);
  assert.equal(h.valid,false);
});
