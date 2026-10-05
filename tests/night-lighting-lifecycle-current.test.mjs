import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
const source=(await readFile(new URL('../app/js/engine/night-lighting.js',import.meta.url),'utf8')).replace(/^import .*\n/gm,'').replaceAll('export function','function');
function harness(){
 let now=1000,tier='quality';
 const appCtx={scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(),carMesh:{visible:false},timeOfDay:'night',getDynamicBudgetState:()=>({tier})};
 const facadeNightUniform={value:0};
 const c=vm.createContext({THREE,appCtx,facadeNightUniform,performance:{now:()=>now}});vm.runInContext(source,c);
 for(let i=0;i<12;i++){const group=new THREE.Group(),head=new THREE.Object3D();group.position.x=i;group.add(head);appCtx.scene.add(group);c.registerStreetLamp(group,head);}
 return {appCtx,c,tick:()=>{now+=250;c.updateNightLighting();},tier:value=>{tier=value;},active:()=>appCtx.streetLightPool.filter(e=>e.light.visible&&e.light.intensity>0).length};
}
test('lowering quality enforces the active street-light budget after pool growth',()=>{
 const h=harness();h.tick();assert.equal(h.active(),12);h.tier('performance');h.tick();assert.equal(h.active(),5);h.tier('balanced');h.tick();assert.equal(h.active(),8);
});

test('the existing day/night owner updates window illumination and clears it on other planets',()=>{
 const h=harness();h.tick();assert.equal(h.c.facadeNightUniform.value,1);
 h.appCtx.timeOfDay='sunset';h.tick();assert.equal(h.c.facadeNightUniform.value,.52);
 h.appCtx.timeOfDay='day';h.tick();assert.equal(h.c.facadeNightUniform.value,0);
 h.appCtx.timeOfDay='night';h.appCtx.onMoon=true;h.tick();assert.equal(h.c.facadeNightUniform.value,0);
});

test('short seating lamps share the fixed light pool at a lower output than tall road lamps',()=>{
 const h=harness();h.c.resetStreetLampFixtures();
 for(const [index,scale] of [.18,1,NaN,5].entries()){
  const group=new THREE.Group(),head=new THREE.Object3D();group.position.x=index;group.add(head);h.appCtx.scene.add(group);
  h.c.registerStreetLamp(group,head,null,{intensityScale:scale});
 }
 h.tick();assert.deepEqual(Array.from(h.appCtx.streetLightPool.slice(0,4),p=>p.light.intensity),[46.8,260,260,260]);
 assert.equal(h.appCtx.streetLightPool.length,12);
});
test('reset removes the previous world lighting immediately',()=>{
 const h=harness();h.tick();assert.equal(h.active(),12);h.c.resetStreetLampFixtures();assert.equal(h.active(),0);assert.equal(h.appCtx.streetLampFixtures.length,0);
});
test('lamp slots stay registered as fixtures leave range or turn off',()=>{
 const h=harness();h.tick();const pool=h.appCtx.streetLightPool;
 assert.equal(pool.length,12);
 h.appCtx.camera.position.x=1000;h.tick();assert.equal(h.active(),0);
 assert.ok(pool.every(e=>e.light.visible));
 h.appCtx.camera.position.x=0;h.tick();assert.equal(h.active(),12);
 h.appCtx.timeOfDay='day';h.tick();assert.equal(h.active(),0);
 assert.ok(pool.every(e=>e.light.visible));
 h.c.resetStreetLampFixtures();assert.ok(pool.every(e=>e.light.visible&&e.light.intensity===0));
});
test('headlight slots preserve intensity and positions across mode changes',()=>{
 const h=harness();const car=new THREE.Group();car.position.set(10,2,20);h.appCtx.scene.add(car);h.appCtx.carMesh=car;
 const rig=h.c.createVehicleHeadlightRig(car);h.tick();
 assert.ok(rig.every(e=>e.light.visible&&e.light.intensity===180));
 const positions=rig.map(e=>e.light.position.clone());car.visible=false;h.tick();
 assert.ok(rig.every(e=>e.light.visible&&e.light.intensity===0));
 car.visible=true;car.position.x+=15;h.tick();
 rig.forEach((e,i)=>assert.ok(Math.abs(e.light.position.x-positions[i].x-15)<1e-12));
});
test('inactive spotlight shader shortcut is idempotent and rejects an unknown chunk',()=>{
 const h=harness();const chunk=THREE.ShaderChunk.lights_fragment_begin;
 assert.equal(chunk.split('// WE3D inactive spotlight slot').length,2);
 assert.equal(h.c.installInactiveSpotLightShortcut(THREE),false);
 const other={ShaderChunk:{lights_fragment_begin:'different shader'}};
 assert.equal(h.c.installInactiveSpotLightShortcut(other),false);
 assert.equal(other.ShaderChunk.lights_fragment_begin,'different shader');
});

test('raising automatic quality activates existing slots without changing scene light count',()=>{
 const h=harness();h.tier('performance');h.tick();const pool=[...h.appCtx.streetLightPool];
 assert.equal(h.active(),5);assert.equal(pool.length,12);
 h.tier('quality');h.tick();assert.equal(h.active(),12);assert.equal(h.appCtx.streetLightPool.length,pool.length);pool.forEach((entry,i)=>assert.equal(h.appCtx.streetLightPool[i],entry));
});
