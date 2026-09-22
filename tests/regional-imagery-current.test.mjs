import test from 'node:test';
import assert from 'node:assert/strict';
import {regionalImagerySpec, regionalImageryUv, regionalImageryTileLayout} from '../app/js/terrain/regional-imagery.js';
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
