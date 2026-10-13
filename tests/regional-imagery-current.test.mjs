import test from 'node:test';
import assert from 'node:assert/strict';
import {regionalImagerySpec, regionalImageryUv, regionalImageryTileLayout} from '../app/js/terrain/regional-imagery.js';
import {imageryUvTransform,attachRegionalImagery,updateRegionalImageryFocus,regionalImagerySnapshot} from '../app/js/terrain/regional-imagery.js';
import * as THREE from 'three';

test('moving local imagery stays geographically registered independently of the coarse region center',()=>{
 for(const lat of [0,39.3,-64]){
  const broad=regionalImagerySpec(lat,10),local=regionalImagerySpec(lat+.12,10.04,6000),t=imageryUvTransform(broad,local);
  for(const point of [[lat+.12,10.04],[lat+.125,10.045],[lat+.115,10.02]]){
   const source=regionalImageryUv(broad,...point),actual=[source[0]*t[0]+t[2],source[1]*t[1]+t[3]],expected=regionalImageryUv(local,...point);
   assert.ok(actual.every((n,i)=>Math.abs(n-expected[i])<1e-10));
  }
 }
});

test('one shared moving image retains its predecessor until ready, evicts it, and cancels on final disposal',async()=>{
 const before={fetch:globalThis.fetch,THREE:globalThis.THREE,document:globalThis.document,bitmap:globalThis.createImageBitmap};
 let gate=null,aborted=0;
 globalThis.THREE=THREE;globalThis.document={createElement:()=>({getContext:()=>({drawImage(){}})})};
 globalThis.createImageBitmap=async()=>({width:256,height:256,close(){}});
 globalThis.fetch=async(_url,{signal})=>{
  if(gate)await Promise.race([gate,new Promise((_,reject)=>signal.addEventListener('abort',()=>{aborted++;reject(Error('aborted'));},{once:true}))]);
  return {ok:true,blob:async()=>new Blob(['image'],{type:'image/png'})};
 };
 const ctx={LOC:{lat:39.3,lon:-76.6},WORLD_UNITS_PER_METER:1,renderer:{capabilities:{maxTextures:16}},worldToGeo:(x,z)=>({lat:39.3-z/111000,lon:-76.6+x/86000})};
 const mesh=()=>new THREE.Mesh(new THREE.PlaneGeometry(4,4),new THREE.MeshStandardMaterial());
 const uniforms=()=>({terrainRegionalMap:{value:null},terrainRegionalReady:{value:0},terrainLocalMap:{value:null},terrainLocalReady:{value:0},terrainLocalUvTransform:{value:[1,1,0,0]}});
 const a=mesh(),b=mesh(),ua=uniforms(),ub=uniforms();
 const settle=async predicate=>{for(let i=0;i<60;i++){if(predicate())return;await new Promise(r=>setTimeout(r,0));}assert.fail('Imagery did not settle');};
 try{
  attachRegionalImagery(a,ctx,ua);attachRegionalImagery(b,ctx,ub);await settle(()=>ua.terrainLocalReady.value===1);
  assert.equal(ua.terrainLocalMap.value,ub.terrainLocalMap.value);const old=ua.terrainLocalMap.value;let retired=0;old.addEventListener('dispose',()=>retired++);
  let ready;gate=new Promise(r=>ready=r);updateRegionalImageryFocus(ctx,{x:12000,z:0});
  const pending=regionalImagerySnapshot(ctx).local.pending;updateRegionalImageryFocus(ctx,{x:12500,z:0});
  assert.equal(regionalImagerySnapshot(ctx).local.pending,pending);assert.equal(regionalImagerySnapshot(ctx).entries.length,3);assert.equal(ua.terrainLocalMap.value,old);
  gate=null;ready();await settle(()=>ua.terrainLocalMap.value!==old);assert.equal(retired,1);assert.equal(regionalImagerySnapshot(ctx).entries.length,2);
  const current=regionalImagerySnapshot(ctx).local.current,c=mesh(),uc=uniforms();c.userData.regionalImageryCenter=ctx.worldToGeo(12000,0);
  attachRegionalImagery(c,ctx,uc);assert.equal(regionalImagerySnapshot(ctx).local.current,current);assert.equal(regionalImagerySnapshot(ctx).local.pending,null,'New far terrain must not request the origin again');
  c.material.dispose();gate=new Promise(()=>{});updateRegionalImageryFocus(ctx,{x:24000,z:0});
  a.material.dispose();assert.equal(regionalImagerySnapshot(ctx).local.users,1);b.material.dispose();await settle(()=>regionalImagerySnapshot(ctx).entries.length===0);
  assert.equal(regionalImagerySnapshot(ctx).local,null);assert.ok(aborted>0);
 }finally{a.material.dispose();b.material.dispose();globalThis.fetch=before.fetch;globalThis.THREE=before.THREE;globalThis.document=before.document;globalThis.createImageBitmap=before.bitmap;}
});
test('regional imagery is geographically registered at tropical, canyon and polar latitudes', () => {
  for (const [lat,lon] of [[0,0],[36.1069,-112.1129],[-64.774,-64.053]]) {
    const spec=regionalImagerySpec(lat,lon), uv=regionalImageryUv(spec,lat,lon);
    assert.ok(uv.every(v=>Math.abs(v-.5)<1e-10));
    assert.ok(regionalImageryUv(spec,lat+.01,lon)[1]>.5);
    assert.ok(regionalImageryUv(spec,lat,lon+.01)[0]>.5);
    const b=spec.bounds;assert.ok(Math.abs((b[2]-b[0])-(b[3]-b[1]))<1e-6);
  }
});
test('unsupported poles, date-line exports and invalid locations retain semantic materials',()=>{
  assert.equal(regionalImagerySpec(90,0),null);assert.equal(regionalImagerySpec(0,179.99),null);
  assert.equal(regionalImagerySpec(NaN,0),null);
});

test('two shared imagery scales are cancelled when the last terrain material is disposed',async()=>{
  const {attachRegionalImagery}=await import('../app/js/terrain/regional-imagery.js');
  const originalFetch=globalThis.fetch,originalThree=globalThis.THREE,originalDocument=globalThis.document;let requests=0,aborted=0;
  globalThis.document={createElement:()=>({getContext:()=>({drawImage(){}})})};
  globalThis.fetch=(_url,{signal})=>new Promise((_resolve,reject)=>{requests++;signal.addEventListener('abort',()=>{aborted++;reject(Error('aborted'));},{once:true});});
  globalThis.THREE={Vector3:class{fromBufferAttribute(){this.x=0;this.z=0;return this;}applyMatrix4(){return this;}},BufferAttribute:class{constructor(array,size){this.array=array;this.itemSize=size;}}};
  const ctx={LOC:{lat:36,lon:-112},renderer:{capabilities:{maxTextures:16}},worldToGeo:()=>({lat:36,lon:-112})};
  const mesh=()=>{const listeners=new Map();return{userData:{},geometry:{attributes:{position:{count:1}},setAttribute(){}},updateMatrixWorld(){},material:{addEventListener(k,fn){listeners.set(k,fn);},removeEventListener(k){listeners.delete(k);},dispose(){listeners.get('dispose')?.();}}};};
  const a=mesh(),b=mesh(),uniforms=()=>({terrainRegionalMap:{value:null},terrainRegionalReady:{value:0},terrainLocalMap:{value:null},terrainLocalReady:{value:0}});
  try {
    assert.equal(attachRegionalImagery(a,ctx,uniforms()),true);assert.equal(attachRegionalImagery(b,ctx,uniforms()),true);assert.equal(requests,6);
    a.material.dispose();assert.equal(aborted,0);b.material.dispose();assert.equal(aborted,6);
    await new Promise(resolve=>setImmediate(resolve));assert.notEqual(a.userData.regionalImagery.status,'available');
  }finally{a.material.dispose();b.material.dispose();globalThis.fetch=originalFetch;globalThis.THREE=originalThree;globalThis.document=originalDocument;}
});


test('cached tile mosaics cover the registered extent with a fixed request budget',()=>{
  for(const lat of [0.001,36.1069,-64.774,-80]){
    const spec=regionalImagerySpec(lat,-112,6000),tiles=regionalImageryTileLayout(spec);
    assert.ok(tiles.length<=81);assert.ok(tiles.length>0);
    assert.ok(Math.min(...tiles.map(t=>t.left))<=0);
    assert.ok(Math.min(...tiles.map(t=>t.top))<=0);
    assert.ok(Math.max(...tiles.map(t=>t.left+t.size))>=2048);
    assert.ok(Math.max(...tiles.map(t=>t.top+t.size))>=2048);
    const centered=tiles.filter(t=>t.left<=1024&&t.left+t.size>1024&&t.top<=1024&&t.top+t.size>1024);
    assert.equal(centered.length,1);
    const tile=centered[0],n=2**tile.zoom;
    assert.equal(tile.x,Math.floor((-112+180)/360*n));
    assert.equal(tile.y,Math.floor((1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*n));
  }
});


test('overlapping mosaics reuse bounded compressed tiles and release them with the final owner',async()=>{
 const originals={fetch:globalThis.fetch,THREE:globalThis.THREE,document:globalThis.document,bitmap:globalThis.createImageBitmap};
 let requests=0,decoded=0,closed=0;
 globalThis.THREE=THREE;globalThis.document={createElement:()=>({getContext:()=>({drawImage(){}})})};
 globalThis.createImageBitmap=async()=>{decoded++;return{width:256,height:256,close(){closed++;}};};
 globalThis.fetch=async()=>{requests++;return{ok:true,blob:async()=>new Blob([new Uint8Array(65536)],{type:'image/png'})};};
 const ctx={LOC:{lat:39.3,lon:-76.6},WORLD_UNITS_PER_METER:1,renderer:{capabilities:{maxTextures:16}},worldToGeo:(x,z)=>({lat:39.3-z/111000,lon:-76.6+x/86000})};
 const mesh=new THREE.Mesh(new THREE.PlaneGeometry(4,4),new THREE.MeshStandardMaterial());
 const uniforms={terrainRegionalMap:{value:null},terrainRegionalReady:{value:0},terrainLocalMap:{value:null},terrainLocalReady:{value:0}};
 const settle=async()=>{for(let i=0;i<100;i++){const s=regionalImagerySnapshot(ctx);if(s.entries.every(e=>e.status==='available')&&!s.local.pending)return;await new Promise(r=>setTimeout(r,0));}assert.fail('Mosaic did not settle');};
 try{
  attachRegionalImagery(mesh,ctx,uniforms);await settle();const before=requests,previous=uniforms.terrainLocalMap.value;
  updateRegionalImageryFocus(ctx,{x:1200,z:0});await settle();
  assert.notEqual(uniforms.terrainLocalMap.value,previous);
  const next=ctx.worldToGeo(1200,0),tileCount=regionalImageryTileLayout(regionalImagerySpec(next.lat,next.lon,6000)).length;
  assert.ok(requests-before<tileCount/2,'Adjacent mosaic should fetch only its new edge tiles');
  for(let i=2;i<=12;i++){updateRegionalImageryFocus(ctx,{x:1200*i,z:0});await settle();const c=regionalImagerySnapshot(ctx).tileCache;assert.ok(c.bytes<=c.byteLimit&&c.count<=c.countLimit);}
  assert.equal(closed,decoded,'Decoded bitmap is closed after every composite');
  mesh.material.dispose();assert.deepEqual(regionalImagerySnapshot(ctx).tileCache,{count:0,bytes:0,byteLimit:4194304,countLimit:128});
 }finally{mesh.material.dispose();mesh.geometry.dispose();globalThis.fetch=originals.fetch;globalThis.THREE=originals.THREE;globalThis.document=originals.document;globalThis.createImageBitmap=originals.bitmap;}
});
