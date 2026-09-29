import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyTerrainSurfaceProfile} from '../app/js/surface-rules.js';
import {terrainSurfaceMixForProfile, terrainSurfaceClassForWorldCover, terrainSurfaceMixForClass} from '../app/js/terrain/surface-material-blend.js';

test('flat polar fallback is snow; alpine mixed material retains snow', () => {
  for (const latitude of [-83.1664, -70, 80]) {
    const profile = classifyTerrainSurfaceProfile({bounds:{latS:latitude-.01,latN:latitude+.01,lonW:0,lonE:.01},minElevationMeters:0,maxElevationMeters:5});
    assert.equal(profile.mode,'snow');
    assert.deepEqual(terrainSurfaceMixForProfile(profile.mode).mixB,[0,1]);
  }
  assert.deepEqual(terrainSurfaceMixForProfile('snowRock').mixB,[.35,.65]);
});

test('every mapped land-cover family has finite normalized material weights', () => {
  for (const name of ['built','tree','mangrove','crop','bare','snow','moss','wetland','grass','shrub']) {
    const mix=terrainSurfaceMixForClass(terrainSurfaceClassForWorldCover(name,39));
    const values=[...mix.mixA,...mix.mixB];
    assert.ok(values.every(v=>Number.isFinite(v)&&v>=0&&v<=1),name);
    assert.ok(values.reduce((a,b)=>a+b,0)<=1.00001,name);
  }
  assert.deepEqual(terrainSurfaceMixForProfile('sand').mixA,[0,1,0,0]);
  assert.deepEqual(terrainSurfaceMixForProfile('forest').mixA,[0,0,1,0]);
  assert.deepEqual(terrainSurfaceMixForProfile('rock').mixB,[1,0]);
  assert.notEqual(terrainSurfaceClassForWorldCover('moss'),terrainSurfaceClassForWorldCover('snow'));
});

test('reused land-cover blending preserves every normalized material byte',async()=>{
 const THREE=await import('three'),previous=globalThis.THREE;globalThis.THREE=THREE;
 const {applyWorldCoverSurfaceMaterialMix}=await import('../app/js/terrain/surface-material-blend.js');
 try{
  const count=2048,size=8,classes=Uint8Array.from({length:size*size},(_,i)=>i%11);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(count*3),3));
  const uvs=Float32Array.from({length:count*2},(_,i)=>((i*7919)%2200)/2000-.05);geometry.setAttribute('uv',new THREE.BufferAttribute(uvs,2));
  const mesh=new THREE.Mesh(geometry);assert.equal(applyWorldCoverSurfaceMaterialMix(mesh,{surfaceMaterialClasses:classes,surfaceMaterialClassSize:size}),true);
  for(let i=0;i<count;i++){
   const x=Math.max(0,Math.min(size-1,uvs[i*2]*(size-1))),y=Math.max(0,Math.min(size-1,(1-uvs[i*2+1])*(size-1)));
   const x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(size-1,x0+1),y1=Math.min(size-1,y0+1),tx=x-x0,ty=y-y0,a=[0,0,0,0],b=[0,0];
   for(const [sx,sy,w] of [[x0,y0,(1-tx)*(1-ty)],[x1,y0,tx*(1-ty)],[x0,y1,(1-tx)*ty],[x1,y1,tx*ty]]){
    if(w<=0)continue;const mix=terrainSurfaceMixForClass(classes[sy*size+sx]);
    for(let c=0;c<4;c++)a[c]+=mix.mixA[c]*w;for(let c=0;c<2;c++)b[c]+=mix.mixB[c]*w;
   }
   for(const [name,values]of [['terrainSurfaceMixA',a],['terrainSurfaceMixB',b]])for(let c=0;c<values.length;c++)assert.equal(geometry.attributes[name].array[i*values.length+c],Math.round(Math.max(0,Math.min(1,values[c]))*255));
  }geometry.dispose();mesh.material.dispose();
 }finally{globalThis.THREE=previous;}
});
