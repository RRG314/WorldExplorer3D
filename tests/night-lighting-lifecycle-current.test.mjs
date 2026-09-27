import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
const source=(await readFile(new URL('../app/js/engine/night-lighting.js',import.meta.url),'utf8')).replace(/^import .*\n/,'').replaceAll('export function','function');
function harness(){
 let now=1000,tier='quality';
 const appCtx={scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(),carMesh:{visible:false},timeOfDay:'night',getDynamicBudgetState:()=>({tier})};
 const c=vm.createContext({THREE,appCtx,performance:{now:()=>now}});vm.runInContext(source,c);
 for(let i=0;i<12;i++){const group=new THREE.Group(),head=new THREE.Object3D();group.position.x=i;group.add(head);appCtx.scene.add(group);c.registerStreetLamp(group,head);}
 return {appCtx,c,tick:()=>{now+=250;c.updateNightLighting();},tier:value=>{tier=value;},active:()=>appCtx.streetLightPool.filter(e=>e.light.visible&&e.light.intensity>0).length};
}
test('lowering quality enforces the active street-light budget after pool growth',()=>{
 const h=harness();h.tick();assert.equal(h.active(),12);h.tier('performance');h.tick();assert.equal(h.active(),5);h.tier('balanced');h.tick();assert.equal(h.active(),8);
});
test('reset removes the previous world lighting immediately',()=>{
 const h=harness();h.tick();assert.equal(h.active(),12);h.c.resetStreetLampFixtures();assert.equal(h.active(),0);assert.equal(h.appCtx.streetLampFixtures.length,0);
});
