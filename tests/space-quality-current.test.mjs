import {ring,ringRoute,pointInRoom} from '../app/js/expedition/ship-ring-plan.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Quaternion} from 'three';
import {projectCatalogStar,skyArcPoints} from '../app/js/space/observer-sky.js';
import {BRIGHT_STARS,CONSTELLATION_STAR_IDS} from '../app/js/sky/catalog.js';
import {SHIP_DECKS} from '../app/js/expedition/ship-layout.js';
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
test('circular layout keeps every station inside its room and routes around the ring',()=>{
 for(const deck of SHIP_DECKS){
  for(const room of deck.rooms){
   assert.ok(pointInRoom(room.center,room));
   for(const station of deck.stations.filter(s=>s.roomId===room.id))assert.ok(pointInRoom(station,room),station.id);
  }
  const a=deck.rooms[0],b=deck.rooms[4];
  const route=ringRoute(a.center,b.center,a,b);
  for(const point of route.slice(2,-2))assert.ok(Math.abs(Math.hypot(point.x,point.z)-21.8)<1e-7);
 }
 assert.ok(Math.abs(ring.corridorOuter-ring.corridorInner-3.6)<1e-9);
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


test('unresolved planet textures join at longitude and poles without painted seams',async()=>{
  const {fillPlanetSurface}=await import('../app/js/universe/planet-surface.js');
  const width=33,height=17,profile={seed:17,kind:'arid-rocky',palette:[0x886644,0xccaa88,0x554433]};
  const pixels=fillPlanetSurface(profile,width,height,new Uint8ClampedArray(width*height*4));
  const pixel=(x,y)=>[...pixels.slice((y*width+x)*4,(y*width+x)*4+4)];
  for(let y=0;y<height;y++)assert.deepEqual(pixel(0,y),pixel(width-1,y));
  for(const y of [0,height-1])for(let x=1;x<width;x++)assert.deepEqual(pixel(0,y),pixel(x,y));
  assert.deepEqual(pixels,fillPlanetSurface(profile,width,height,new Uint8ClampedArray(pixels.length)));
  assert.notDeepEqual(pixels,fillPlanetSurface({...profile,seed:18},width,height,new Uint8ClampedArray(pixels.length)));
});


test('browser readiness waits for resolved truth, and false promises reach their deadline',async()=>{
 const {waitForAsyncCondition}=await import('../scripts/verification/async-browser-condition.mjs');
 let calls=0;
 const page={evaluate:async(predicate,arg)=>{calls++;return predicate(arg);}};
 await waitForAsyncCondition(page,async()=>calls>=3,null,{timeout:200,polling:1});
 assert.equal(calls,3);
 await assert.rejects(waitForAsyncCondition(page,async()=>false,null,{timeout:10,polling:1}),/timed out/);
 await assert.rejects(waitForAsyncCondition({evaluate:()=>new Promise(()=>{})},()=>true,null,{timeout:10}),/timed out/);
});

test('constellation annotation vertices remain on the sky shell from every viewing direction',()=>{
 const arc=skyArcPoints({x:1,y:0,z:0},{x:0,y:1,z:0},300000);
 assert.equal(arc.length,13);
 for(const point of arc)assert.ok(Math.abs(Math.hypot(point.x,point.y,point.z)-300000)<1e-6);
 assert.equal(skyArcPoints(null,{x:1,y:0,z:0},1).every(p=>p.x===0&&p.y===0&&p.z===0),true);
});
