import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Quaternion} from 'three';
import {projectCatalogStar} from '../app/js/space/observer-sky.js';
import {BRIGHT_STARS,CONSTELLATION_STAR_IDS} from '../app/js/sky/catalog.js';
import {roomBulkheadSpan,SHIP_DECKS} from '../app/js/expedition/ship-layout.js';
import {resolveSpaceControlInput} from '../app/js/space/runtime.js';

test('aircraft controls rotate the nose down for forward input and up for back input',()=>{
  for(const [keys,shared,sign] of [[{arrowup:true},{},-1],[{arrowdown:true},{},1],[{},{move:1},-1],[{},{move:-1},1]]) {
    const {pitch}=resolveSpaceControlInput(keys,shared);
    const forward=new Vector3(0,1,0),up=new Vector3(0,0,1);
    const axis=new Vector3().crossVectors(forward,up).normalize();
    const moved=forward.clone().applyQuaternion(new Quaternion().setFromAxisAngle(axis,pitch*.1));
    assert.equal(Math.sign(moved.dot(up)),sign);
  }
});
test('catalog projects Earth patterns unchanged and shifts both direction and brightness at a new observer',()=>{
  const star={ra:0,dec:0,dist:10,mag:1};
  assert.deepEqual(projectCatalogStar(star,{x:0,y:0,z:0},1),{x:1,y:0,z:0,distanceLy:10,magnitude:1});
  const nearby=projectCatalogStar(star,{x:5,y:0,z:0},1);
  assert.equal(nearby.distanceLy,5);assert.ok(nearby.magnitude<1);
  const shifted=projectCatalogStar(star,{x:0,y:10,z:0},1);
  assert.ok(shifted.y<-.7);assert.ok(shifted.x>.7);
  assert.equal(projectCatalogStar({...star,dist:null},{x:1,y:0,z:0}),null);
  assert.equal(projectCatalogStar(star,{x:10,y:0,z:0}),null);
});
test('all 88 line figures reference measured HIP stars with a single identity per point',()=>{
  const ids=new Set(BRIGHT_STARS.map(s=>s.hip));assert.equal(ids.size,BRIGHT_STARS.length);
  assert.equal(Object.keys(CONSTELLATION_STAR_IDS).length,88);
  for(const segments of Object.values(CONSTELLATION_STAR_IDS)) for(const pair of segments) for(const id of pair) assert.ok(ids.has(id));
  const elnath=BRIGHT_STARS.find(s=>s.name==='Elnath');
  assert.ok(elnath.ra>5.4&&elnath.ra<5.5);assert.ok(elnath.dec>28&&elnath.dec<29);
});
test('every corridor room wall meets its transverse bulkheads with no open corner seams',()=>{
  for(const deck of SHIP_DECKS) for(const side of ['port','starboard']) {
    const rooms=deck.rooms.filter(r=>r.side===side).sort((a,b)=>a.minZ-b.minZ);
    let previous;
    for(const room of rooms) {
      const span=roomBulkheadSpan(room);
      assert.ok(span.minZ<=room.minZ&&span.maxZ>=room.maxZ);
      if(previous) assert.equal(previous.maxZ,span.minZ,`${deck.id}/${side}/${room.id}`);
      previous=span;
    }
  }
});


test('Gaia observer updates reuse GPU geometry and exclude inactive capacity from picking', async()=>{
  const THREE=await import('three');globalThis.THREE=THREE;
  const {rebuildGaiaSkyLayers}=await import('../app/js/sky/gaia-catalog.js');
  const state={radius:100,brightMagnitude:5.2,stars:[
    {sourceId:'1',raDeg:0,decDeg:0,parallaxMas:1000,magnitude:5,bpRp:1},
    {sourceId:'2',raDeg:90,decDeg:0,parallaxMas:1000,magnitude:7,bpRp:1}
  ],brightPoints:new THREE.Points(),faintPoints:new THREE.Points()};
  rebuildGaiaSkyLayers(state,new THREE.Vector3());
  const geometry=state.brightPoints.geometry,position=geometry.getAttribute('position');
  assert.equal(geometry.drawRange.count,1);
  rebuildGaiaSkyLayers(state,new THREE.Vector3(-10,0,0));
  assert.equal(state.brightPoints.geometry,geometry);
  assert.equal(geometry.getAttribute('position'),position);
  assert.equal(geometry.drawRange.count,0);
  assert.equal(state.brightPoints.userData.catalogEntries.length,0);
  assert.equal(state.faintPoints.geometry.drawRange.count,2);
  state.brightPoints.geometry.dispose();state.faintPoints.geometry.dispose();
});


test('a stalled Pathfinder model cannot hang boarding or attach after its deadline', async()=>{
  const THREE=await import('three');
  const {attachCuratedExpeditionPod}=await import('../app/js/space/curated-expedition-pod.js');
  let finish;
  const api={...THREE,GLTFLoader:class {load(url,success){finish=success;}}};
  const scene=new THREE.Group(),host=new THREE.Group(),fallback=new THREE.Group();
  fallback.userData.defaultPodFallback=true;host.add(fallback);scene.add(host);
  const originalWarn=console.warn;console.warn=()=>{};
  try {
    const pending=attachCuratedExpeditionPod(api,host,{timeoutMs:10});
    assert.equal(fallback.visible,false);
    assert.equal(await pending,false);
    assert.equal(fallback.visible,true);
    assert.equal(host.userData.curatedPodStatus,'fallback');
    finish({scene:new THREE.Group()});
    await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal(host.children.length,1,'late model must not replace a resolved fallback');
  } finally {console.warn=originalWarn;}
});
