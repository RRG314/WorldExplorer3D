import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {ctx} from '../app/js/shared-context.js?v=55';
import {configureSpaceRuntimeDependencies,updateSpaceFlightCamera} from '../app/js/space/runtime.js';
import {createRuntimeKernel} from '../app/js/runtime/kernel.js';
import {acceptedSimulationDelta,frameDamping} from '../app/js/runtime/simulation-clock.js';
configureSpaceRuntimeDependencies({THREE});
test('actual Space overview and chase position response matches 30/60/120 Hz',()=>{
 for(const overviewMode of ['inner',null]){
  const rows=[];
  for(const fps of [30,60,120]){
   ctx.spaceFlight={overviewMode,camera:new THREE.PerspectiveCamera(),rocket:new THREE.Object3D(),_frameScale:60/fps};
   for(let i=0;i<fps;i++)updateSpaceFlightCamera();rows.push(ctx.spaceFlight.camera.position.clone());
  }
  for(const row of rows)assert.ok(row.distanceTo(rows[1])<1e-8);
 }
 for(const fps of [30,60,120]){
  const q=new THREE.Quaternion(),target=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),1.7);
  for(let i=0;i<fps;i++)q.slerp(target,frameDamping(.045,1/fps));
  assert.ok(Math.abs(q.angleTo(target)-1.7*Math.pow(.955,60))<1e-10);
 }
});
test('player and fixed population share accepted time through cadences and repeated stalls',()=>{
 for(const fps of [30,60,120]){
  let player=0,population=0,captured=false;const deltas=[];
  const kernel=createRuntimeKernel({fixedDelta:1/60,maxFixedSteps:2,maxDelta:.1});
  kernel.registerSystem({id:'input',phase:'input',update(){captured=true;}});
  kernel.registerSystem({id:'npc',fixedUpdate(frame){assert.equal(captured,true);population+=frame.dt;}});
  kernel.registerSystem({id:'player',phase:'simulation',update(frame){player+=frame.dt;deltas.push(frame.dt);}});
  let time=0;kernel.runFrame(time);
  for(let frame=0;frame<fps*2;frame++){captured=false;time+=1000/fps+(frame%17===0?1000:frame%13===0?250:frame%11===0?100:0);kernel.runFrame(time);assert.ok(Math.abs(player-population)<=1/60+1e-9);}
  assert.ok(deltas.every(dt=>dt<=1/30+1e-10));kernel.dispose();
 }
});
test('pause, unavailable collision and resume do not accumulate replayable simulation debt',()=>{
 let paused=false,blocked=false,player=0,population=0;
 const kernel=createRuntimeKernel({fixedDelta:1/60,maxFixedSteps:2,isSimulationPaused:()=>paused});
 kernel.registerSystem({id:'readiness',phase:'input',update:f=>{f.flags.simulationBlocked=blocked;}});
 kernel.registerSystem({id:'npc',fixedUpdate:f=>population+=f.dt});kernel.registerSystem({id:'player',update:f=>player+=f.dt});
 kernel.runFrame(0);kernel.runFrame(1000/60);const prior=player;
 paused=true;kernel.runFrame(10000);kernel.runFrame(20000);assert.equal(player,prior);assert.equal(population,prior);
 paused=false;blocked=true;kernel.runFrame(20017);assert.equal(player,prior);assert.equal(population,prior);
 blocked=false;kernel.runFrame(20034);assert.ok(player-prior<.018);assert.ok(population-prior<.018);kernel.dispose();
 for(const interval of [.1,.25,1])assert.equal(acceptedSimulationDelta(interval),1/30);
});
