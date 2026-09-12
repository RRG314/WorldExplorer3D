import test from 'node:test';
import assert from 'node:assert/strict';
import { publishStreetPavement } from '../app/js/world/street-pavement-runtime.js';

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
    postMessage(data){if(data.type==='prepare')this.prepare=data.input;queueMicrotask(()=>{
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
