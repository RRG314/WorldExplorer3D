import { assessStreetQuality } from '../app/js/world/street-quality-assessment.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoadContactIndex } from '../app/js/terrain/road-contact-index.js?v=1';
import { markGroundSurfaceChanged } from '../app/js/terrain/surface-revision.js';
import { publishStreetPavement, updateStreetPavementFocus } from '../app/js/world/street-pavement-runtime.js';

function harness(t, mode='success') {
  const resources=[];
  const install=(name,descriptor)=>{const prior=Object.getOwnPropertyDescriptor(globalThis,name);Object.defineProperty(globalThis,name,descriptor);t.after(()=>{if(prior)Object.defineProperty(globalThis,name,prior);else delete globalThis[name];});};
  class Resource { constructor(){resources.push(this);} dispose(){this.disposed=true;} }
  class Geometry extends Resource {setAttribute(name,value){(this.attributes ||= {})[name]=value;}computeVertexNormals(){}computeBoundingSphere(){}}
  class Attribute {constructor(values){this.array=new Float32Array(values);}}
  class Mesh {constructor(geometry,material){this.geometry=geometry;this.material=material;this.userData={};}}
  install('THREE',{value:{CanvasTexture:Resource,MeshStandardMaterial:Resource,BufferGeometry:Geometry,Float32BufferAttribute:Attribute,Mesh,RepeatWrapping:1,SRGBColorSpace:1,DoubleSide:2},configurable:true});
  install('document',{value:{createElement(){return {getContext(){return {createImageData(){return {data:new Uint8ClampedArray(128*128*4)};},putImageData(){},strokeRect(){}};}};},querySelector(){return null;}},configurable:true});
  install('location',{value:{search:''},configurable:true});
  let worker;
  const ctx={_worldLoadSequence:1,terrainEnabled:true,scene:{},roads:[{pts:[{x:0,z:0},{x:10,z:0}],width:4}],roadMeshes:[],buildings:[],landuses:[],linearFeatures:[],linearFeatureMeshes:[],urbanSurfaceMeshes:[],car:{x:0,z:0},
    terrainMeshHeightAt:()=>10,sampleFeatureSurfaceY:()=>10.18,addEarthWorldObject(mesh){mesh.parent={remove(){}};}};
  class Worker {
    constructor(){worker=this;this.next=0;}
    terminate(){this.terminated=true;}
    postMessage(data){if(mode==='clone-error')throw new Error('cannot clone source');if(data.type==='prepare')this.prepare=data.input;queueMicrotask(()=>{
      if(mode==='pending') return;
      if(mode==='failure') return this.onmessage({data:{type:'error',message:'invalid source polygon'}});
      if(data.type==='prepare') {if(mode==='stale')ctx._worldLoadSequence++;return this.onmessage({data:{type:'prepared',tiles:1}});}
      if(this.next++) return this.onmessage({data:{type:'complete'}});
      const ps=[{x:0,y:.12/1.11,z:3},{x:0,y:.12/1.11,z:4},{x:1,y:.12/1.11,z:3}];
      this.onmessage({data:{type:'tile',key:'0:0',completed:1,total:1,inferredFrontages:0,
        segments:[{roadIndex:0,index:0,t0:0,t1:1,a:{x:0,z:0},b:{x:10,z:0},wa:4,wb:4}],
        mesh:{vertices:ps.flatMap(p=>[p.x,p.y,p.z]),curbVertices:[],triangles:[ps]}}});
    });}
  }
  install('Worker',{value:Worker,configurable:true});
  return {ctx,resources,get worker(){return worker;}};
}

test('published contact interpolates the same elevated triangles used by the mesh',async t=>{
  const h=harness(t); await publishStreetPavement(h.ctx);
  const p=h.ctx.streetPavement;
  assert.equal(p.meshes.length,1); assert.equal(p.stats.drawCalls,1);
  const y=p.sampleAt(.2,3.2);
  assert.ok(y>10 && y<10.4);
  const a=p.meshes[0].geometry.attributes.position.array;
  const expected=.6*a[1]+.2*a[4]+.2*a[7];
  assert.ok(Math.abs(y-expected)<1e-5);
  assert.equal(p.sampleAt(20,20),null); assert.equal(h.worker.terminated,true);
  p.dispose(); assert.ok(h.resources.every(r=>r.disposed));
});
test('failed compilation retains the previously accepted render and contact publication',async t=>{
  const h=harness(t,'failure');let removed=false;
  const previous={meshes:[],dispose(){removed=true;},sampleAt(){return 12;}};h.ctx.streetPavement=previous;
  await assert.rejects(publishStreetPavement(h.ctx),/invalid source polygon/);
  assert.equal(h.ctx.streetPavement,previous);assert.equal(removed,false);
  assert.equal(h.worker.terminated,true);assert.ok(h.resources.every(r=>r.disposed));
});
test('a superseded world cannot publish surfaces and releases its compilation resources',async t=>{
  const h=harness(t,'stale');assert.equal(await publishStreetPavement(h.ctx),null);
  assert.equal(h.ctx.streetPavement,undefined);assert.equal(h.ctx.urbanSurfaceMeshes.length,0);
  assert.equal(h.worker.terminated,true);assert.ok(h.resources.every(r=>r.disposed));
});

test('worker input is resident-only while retaining global road identities',async t=>{
  const h=harness(t);
  h.ctx.roads.unshift({pts:[{x:5000,z:5000},{x:5100,z:5100}],width:4});
  h.ctx.buildings=[{pts:[{x:5000,z:5000},{x:5010,z:5000},{x:5000,z:5010}]}];
  await publishStreetPavement(h.ctx);
  assert.equal(h.worker.prepare.roads.length,1);
  assert.equal(h.worker.prepare.roads[0].auditIndex,1);
  assert.equal(h.worker.prepare.buildings.length,0);
  h.ctx.streetPavement.dispose();
});
test('curb elevation follows the accepted road when its earlier profile is below terrain',async t=>{
  const h=harness(t);h.ctx.sampleFeatureSurfaceY=()=>7;
  h.ctx.roadContactIndex={sampleAt:()=>10.18};
  await publishStreetPavement(h.ctx);
  assert.ok(h.ctx.streetPavement.sampleAt(.2,3.2)>10.24);
  h.ctx.streetPavement.dispose();
});

for (const [name, ground] of [
  ['flat', () => 0], ['uphill', (x,z) => x*.3+z*.1],
  ['downhill', (x,z) => -x*.4-z*.2], ['cross slope', (x,z) => z*.45],
  ['below sea level', (x,z) => -80+x*.2], ['high elevation', (x,z) => 3000+x*.2+z*.1]
]) test(`sidewalk contact shares final Float32 rendering on ${name}`, async t => {
  const h=harness(t);h.ctx.terrainMeshHeightAt=ground;
  h.ctx.sampleFeatureSurfaceY=(road,x,z)=>ground(x,z)+.18;
  h.ctx.roadContactIndex={sampleAt:(x,z)=>ground(x,z)+.18};
  await publishStreetPavement(h.ctx);
  const p=h.ctx.streetPavement,a=p.meshes[0].geometry.attributes.position.array;
  assert.ok(Math.abs(p.sampleAt(.2,3.2)-(.6*a[1]+.2*a[4]+.2*a[7]))<1e-10);
  assert.equal(p.stats.positionBytes,a.byteLength);
  p.dispose();assert.equal(p.sampleAt(.2,3.2),null);assert.equal(p.meshes.length,0);
});

test('an active worker cancels immediately without waiting for the 15 second timeout',async t=>{
  const h=harness(t,'pending');const pending=publishStreetPavement(h.ctx);
  assert.equal(typeof h.ctx._cancelStreetPavementBuild,'function');
  h.ctx._cancelStreetPavementBuild();
  assert.equal(await pending,null);assert.equal(h.worker.terminated,true);
  assert.equal(h.worker.onmessage,null);assert.equal(h.worker.onerror,null);
  assert.equal(h.ctx._cancelStreetPavementBuild,null);
  assert.ok(h.resources.every(r=>r.disposed));
});

test('repeated replacements release old contact and owned GPU resources',async t=>{
  const h=harness(t);let previous;
  for(let i=0;i<8;i++){
    const boundary=h.resources.length;await publishStreetPavement(h.ctx);
    if(previous){assert.equal(previous.sampleAt(.2,3.2),null);assert.equal(previous.meshes.length,0);}
    assert.ok(h.resources.slice(0,boundary).every(r=>r.disposed));
    assert.equal(h.ctx.urbanSurfaceMeshes.length,1);
    previous=h.ctx.streetPavement;
  }
  previous.dispose();assert.ok(h.resources.every(r=>r.disposed));
});

test('curb clearance samples changing road-edge elevation between segment endpoints',async t=>{
  const h=harness(t);h.ctx.terrainMeshHeightAt=()=>0;h.ctx.sampleFeatureSurfaceY=()=>.18;
  h.ctx.roadContactIndex={sampleAt:(x,z)=>.18+.4*Math.max(0,1-Math.abs(x-1))};
  await publishStreetPavement(h.ctx);
  const a=h.ctx.streetPavement.meshes[0].geometry.attributes.position.array;
  assert.ok(a[7]>.6,'interior edge correction must reach the sidewalk');
  h.ctx.streetPavement.dispose();
});

test('a synchronous worker send failure releases handlers, timer ownership and resources',async t=>{
  const h=harness(t,'clone-error');
  await assert.rejects(publishStreetPavement(h.ctx),/cannot clone source/);
  assert.equal(h.ctx._cancelStreetPavementBuild,null);
  assert.equal(h.worker.onmessage,null);assert.equal(h.worker.onerror,null);
  assert.equal(h.worker.terminated,true);assert.ok(h.resources.every(r=>r.disposed));
});


test('a sidewalk beside an overpass never borrows elevated triangles or an unconfirmed profile',async t=>{
  const h=harness(t);h.ctx.terrainMeshHeightAt=()=>0;h.ctx.sampleFeatureSurfaceY=()=>12;
  h.ctx.roadContactIndex=createRoadContactIndex([{userData:{terrainMode:'elevated'},geometry:{
    attributes:{position:{array:new Float32Array([-10,12,-10,-10,12,10,10,12,10,-10,12,-10,10,12,10,10,12,-10])}}
  }}]);
  await publishStreetPavement(h.ctx);
  const vertices=h.ctx.streetPavement.meshes[0].geometry.attributes.position.array;
  for(let i=1;i<vertices.length;i+=3)assert.ok(vertices[i]<.4);
  assert.ok(h.ctx.streetPavement.sampleAt(.2,3.2)<.4);
  h.ctx.streetPavement.dispose();h.ctx.roadContactIndex.dispose();
});


test('terrain changes during sampling cannot replace accepted pavement with mixed heights',async t=>{
  const h=harness(t);const previous={meshes:[],sampleAt:()=>10.3,dispose(){this.disposed=true;}};
  h.ctx.streetPavement=previous;
  let changed=false;
  h.ctx.terrainMeshHeightAt=()=>{if(!changed){changed=true;markGroundSurfaceChanged(h.ctx);}return 14;};
  assert.equal(await publishStreetPavement(h.ctx),null);
  assert.equal(h.ctx.streetPavement,previous);assert.equal(previous.disposed,undefined);
  assert.equal(h.ctx._streetPavementDirty,true);assert.equal(h.worker.terminated,true);
  assert.ok(h.resources.every(r=>r.disposed));
  await publishStreetPavement(h.ctx);
  assert.equal(h.ctx.streetPavement.groundRevision,h.ctx._groundSurfaceRevision);
  assert.ok(h.ctx.streetPavement.sampleAt(.2,3.2)>14);
  assert.equal(previous.disposed,true);h.ctx.streetPavement.dispose();
});

test('an interrupted first pavement build can recover without an existing publication',async t=>{
  const h=harness(t);let changed=false;
  h.ctx.terrainMeshHeightAt=()=>{if(!changed){changed=true;markGroundSurfaceChanged(h.ctx);}return 14;};
  assert.equal(await publishStreetPavement(h.ctx),null);
  assert.equal(h.ctx.streetPavement,undefined);assert.equal(h.ctx._streetPavementDirty,true);
  updateStreetPavementFocus(h.ctx);
  for(let i=0;i<100 && h.ctx._streetPavementUpdating;i++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(h.ctx._streetPavementUpdating,false);
  assert.ok(h.ctx.streetPavement.sampleAt(.2,3.2)>14);h.ctx.streetPavement.dispose();
});


test('city quality assessment fails slow, oversized pavement even when geometry exists',()=>{
 const result=assessStreetQuality({javascriptHeapBytes:1481165846,worldLoading:false,pavementBuildActive:false,deferredWork:{firstPlayDetail:{loadDurationMs:124795},budgets:{firstPlayTargetMs:25000}},street:{triangles:432538,terrainRefinementTriangles:398994,positionBytes:18881604}});
 assert.equal(result.status,'fail');assert.equal(result.failures.length,4);
});
test('missing browser measurements cannot produce a passing city assessment',()=>{
 assert.equal(assessStreetQuality({}).status,'pending');
});
