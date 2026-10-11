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

test('licensed animals admit only their reviewed region, water and depth plan',()=>{
 const context=opts=>createFishPopulationContext({latitude:-12.5,longitude:130.9,waterKind:'coastal',accessMode:'underwater',...opts});
 assert.ok(context().candidateSpeciesIds.includes('barramundi'));
 for(const options of [{longitude:-80},{latitude:35},{waterKind:'open_ocean'},{habitat:'coral-reef'},{habitat:'abyssal-bottom'}])assert.equal(context(options).candidateSpeciesIds.includes('barramundi'),false);
 assert.ok(context({waterKind:'river',habitat:'freshwater'}).candidateSpeciesIds.includes('barramundi'));
});
test('late animal assets cannot repopulate a retired region; current instances animate, pause and release once',async()=>{
 const previous=globalThis.THREE;globalThis.THREE=THREE;
 const scene=new THREE.Scene(),mode={fishEntities:[],fishSchools:[]},loads=[],leases=[];
 const ctx=createFishPopulationContext({latitude:-12.5,longitude:130.9,waterKind:'coastal',accessMode:'underwater',candidateSpeciesIds:['barramundi']});
 const api=createOceanFishLifeApi({oceanMode:mode,disposeObject3D(){},sampleWater:()=>({volume:volume()}),loadVisual:()=>new Promise(resolve=>loads.push(()=>{
  const lease={root:new THREE.Group(),updates:[],count:0,update(phase){this.updates.push(phase)},dispose(){this.count++}};leases.push(lease);resolve(lease);
 }))});
 try{
  api.initFishLife(scene,ctx);const first=mode.fishVisualsReady;assert.equal(loads.length,3);assert.ok(mode.fishEntities.every(f=>!f.mesh.visible));
  api.initFishLife(scene,ctx);assert.equal(loads.length,6);loads.slice(0,3).forEach(done=>done());await first;assert.ok(leases.every(l=>l.count===1));assert.ok(mode.fishEntities.every(f=>f.mesh.children.length===0));
  loads.slice(3).forEach(done=>done());await mode.fishVisualsReady;api.updateFishLife(10,.05);assert.ok(mode.fishEntities.every(f=>f.mesh.visible&&f.visualState==='licensed'));
  const phases=leases.slice(3).map(l=>l.updates.at(-1));api.updateFishLife(1000,0);assert.deepEqual(leases.slice(3).map(l=>l.updates.at(-1)),phases);
  api.updateFishLife(1001,.05);assert.ok(leases.slice(3).every((l,i)=>l.updates.at(-1)>phases[i]));
  api.clearFishLife();api.clearFishLife();assert.equal(scene.children.length,0);assert.ok(leases.every(l=>l.count===1));
 }finally{api.clearFishLife();if(previous===undefined)delete globalThis.THREE;else globalThis.THREE=previous;}
});
test('unavailable licensed animal does not become a generic species stand-in',async()=>{
 const previous=globalThis.THREE;globalThis.THREE=THREE;
 const mode={fishEntities:[],fishSchools:[]},scene=new THREE.Scene();
 const api=createOceanFishLifeApi({oceanMode:mode,disposeObject3D(){},sampleWater:()=>({volume:volume()}),loadVisual:async()=>{throw Error('asset unavailable')}});
 try{
  api.initFishLife(scene,createFishPopulationContext({latitude:-12.5,longitude:130.9,waterKind:'coastal',accessMode:'underwater',candidateSpeciesIds:['barramundi']}));
  await mode.fishVisualsReady;api.updateFishLife(1,.1);assert.ok(mode.fishEntities.every(f=>f.visualState==='unavailable'&&!f.mesh.visible&&f.mesh.children.length===0));
 }finally{api.clearFishLife();if(previous===undefined)delete globalThis.THREE;else globalThis.THREE=previous;}
});
