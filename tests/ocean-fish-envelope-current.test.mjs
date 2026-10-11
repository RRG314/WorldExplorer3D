import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {fitFishToWater,fishSeededRandom} from '../app/js/ocean/fish-water-envelope.js';
import {createOceanFishLifeApi} from '../app/js/ocean/fish-life.js';
import {createFishPopulationContext} from '../app/js/fishing/population-authority.js';
const volume=(bottomY=-30)=>({surfaceY:0,bottomY,metersPerWorldUnit:1.1});
test('water envelope respects depth, bottom, units, missing water and bottom-associated habitat',()=>{
 const sample={x:1,y:-100,z:2,radius:.4,water:volume(),depthBand:[1,20]};
 assert.ok(Math.abs(fitFishToWater(sample).y+20/1.1)<1e-9);
 assert.equal(fitFishToWater({...sample,nearBottom:true}),null,'Bottom species cannot float over a deep bed');
 assert.equal(fitFishToWater({...sample,water:volume(-.5)}),null);
 assert.equal(fitFishToWater({...sample,water:null}),null);
 assert.equal(fitFishToWater({...sample,water:{...volume(),bottomY:null}}),null);
 assert.equal(fitFishToWater({...sample,water:volume(-10),nearBottom:true}).y,-9.35);
 assert.equal(fitFishToWater({...sample,y:10}).y,-1/1.1);
});
test('school random sequence is reproducible per world, without consuming global random',()=>{
 const a=fishSeededRandom('a'),b=fishSeededRandom('a'),c=fishSeededRandom('c');
 const av=Array.from({length:100},a),bv=Array.from({length:100},b),cv=Array.from({length:100},c);
 assert.deepEqual(av,bv);assert.notDeepEqual(av,cv);assert.ok(av.every(v=>v>=0&&v<1));
});
test('real Three fish stay bounded above changing bed, outside reef, and dispose shared resources exactly once',()=>{
 const previous=globalThis.THREE;globalThis.THREE=THREE;
 const scene=new THREE.Scene(),mode={fishEntities:[],fishSchools:[],habitat:{plan:{featured:true,offset:{x:90,z:100}}}};
 const bottom=(x,z)=>-26+Math.sin(x*.08)*3+Math.cos(z*.07)*3;
 const blocked=p=>Math.hypot(p.x-52,p.z-166)<6;
 const water=(x,z)=>({volume:volume(bottom(x,z))});
 const context=createFishPopulationContext({latitude:-18,longitude:147,waterKind:'open_ocean',accessMode:'underwater',candidateSpeciesIds:['giant_trevally']});
 const api=createOceanFishLifeApi({oceanMode:mode,disposeObject3D:()=>{},sampleWater:water,isBlocked:blocked,metersPerUnit:1.1});
 try{
  api.initFishLife(scene,context);assert.equal(mode.fishEntities.length,8);
  const initial=mode.fishEntities.map(f=>f.mesh.position.toArray());
  const geometries=new Map(),materials=new Map();
  for(const fish of mode.fishEntities)fish.mesh.traverse(o=>{
   if(o.geometry&&!geometries.has(o.geometry)){geometries.set(o.geometry,0);o.geometry.addEventListener('dispose',()=>geometries.set(o.geometry,geometries.get(o.geometry)+1));}
   if(o.material&&!materials.has(o.material)){materials.set(o.material,0);o.material.addEventListener('dispose',()=>materials.set(o.material,materials.get(o.material)+1));}
  });
  for(let frame=0;frame<2400;frame++){
   const before=mode.fishEntities.map(f=>f.mesh.position.clone());
   api.updateFishLife(frame/30);
   mode.fishEntities.forEach((fish,i)=>{
    const p=fish.mesh.position;
    assert.ok(p.y>=bottom(p.x,p.z)+fish.radius+.149);assert.ok(p.y<=-fish.radius-.149);assert.equal(blocked(p),false);
    assert.ok(p.distanceTo(before[i])<.06,'Fish teleported rather than steered');
   });
  }
  assert.notDeepEqual(initial,mode.fishEntities.map(f=>f.mesh.position.toArray()));
  const held=mode.fishEntities.map(f=>f.mesh.position.toArray());api.updateFishLife(5000,0);
  assert.deepEqual(mode.fishEntities.map(f=>f.mesh.position.toArray()),held,'Paused simulation must not catch up to wall time');
  api.updateFishLife(6000,1/60);
  mode.fishEntities.forEach((fish,i)=>assert.ok(fish.mesh.position.distanceTo(new THREE.Vector3(...held[i]))<.03));
  assert.ok([...geometries.values(),...materials.values()].every(n=>n===0),'Live shared resources were disposed');
  api.clearFishLife(scene);api.clearFishLife(scene);
  assert.equal(scene.children.length,0);assert.equal(mode.fishEntities.length,0);
  assert.ok([...geometries.values(),...materials.values()].every(n=>n===1),'Shared resources disposed more than once');
  api.initFishLife(scene,context);assert.deepEqual(mode.fishEntities.map(f=>f.mesh.position.toArray()),initial);
  api.clearFishLife(scene);assert.equal(scene.children.length,0);
 }finally{api.clearFishLife(scene);if(previous===undefined)delete globalThis.THREE;else globalThis.THREE=previous;}
});
