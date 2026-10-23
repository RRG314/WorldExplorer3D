import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker as NodeWorker} from 'node:worker_threads';
import {StreetPacketCache} from '../app/js/world/street-packet-cache.js';
import {updateStreetOverviewFrame,updateStreetPavementFocus,prepareInitialStreetCoverage} from '../app/js/world/street-pavement-runtime.js';
import {createStreetOverview} from '../app/js/world/street-overview.js';
import {prepareStreetPavement} from '../app/js/world/compiler/street-pavement.js';
import {createPavementBaseSampler} from '../app/js/world/pavement-height-sampler.js';
import {indexPavementPositions} from '../app/js/world/pavement-indexed-mesh.js';
import {createPavementBatch,createPavementBatchContacts} from '../app/js/world/pavement-batch-ownership.js';
import {createRoadContactIndex} from '../app/js/terrain/road-contact-index.js?v=1';

test('batch leases retain geometry and walking contact together through cancellation and handover',()=>{
 const counts={geometry:0,contact:0,removed:0},material={},surfaceOwner={};
 const mesh={material,geometry:{dispose(){counts.geometry++;}},parent:{remove(){counts.removed++;}}};
 const contactIndex={sampleAt:()=>12,dispose(){counts.contact++;}};
 const first=createPavementBatch({key:'0:0:sidewalk',signature:'shape',surfaceOwner,mesh,contactIndex});
 assert.equal(first.retain('changed',surfaceOwner,material),null);assert.equal(first.retain('shape',{},material),null);assert.equal(first.retain('shape',surfaceOwner,{}),null);
 const cancelled=first.retain('shape',surfaceOwner,material);cancelled.release();cancelled.release();assert.deepEqual(counts,{geometry:0,contact:0,removed:0});
 const next=first.retain('shape',surfaceOwner,material);first.release();assert.equal(next.mesh,mesh);assert.equal(next.contactIndex.sampleAt(0,0),12);assert.equal(first.retain('shape',surfaceOwner,material),null);
 next.release();next.release();assert.deepEqual(counts,{geometry:1,contact:1,removed:1});assert.equal(next.mesh,null);assert.equal(next.contactIndex,null);
});

test('retained batch contact exactly matches the combined index at slopes, negative coordinates and shared boundaries',()=>{
 const meshes=[],batches=new Map(),owner={};
 for(let ix=-1;ix<=1;ix++)for(let iz=-1;iz<=1;iz++){
  const x=ix*128,z=iz*128,y=(x,z)=>x*.13+z*.07+(ix===0?.2:0);
  const points=[[x,z],[x,z+128],[x+128,z],[x+128,z],[x,z+128],[x+128,z+128]];
  const mesh={userData:{},material:{},geometry:{attributes:{position:{array:new Float32Array(points.flatMap(([x,z])=>[x,y(x,z),z]))}},dispose(){}}};
  meshes.push(mesh);
  const key=`${ix}:${iz}:sidewalk`;batches.set(key,createPavementBatch({key,signature:key,surfaceOwner:owner,mesh,contactIndex:createRoadContactIndex([mesh],4)}));
 }
 const mapped={userData:{},geometry:{attributes:{position:{array:new Float32Array([0,90,0,0,90,5,5,90,0])}}}};
 const combined=createRoadContactIndex([...meshes,mapped],4),partitioned=createPavementBatchContacts(batches,createRoadContactIndex([mapped],4));
 const values=[-128,-.000001,0,.000001,1,128-.000001,128,128+.000001,256];
 for(let x=-132;x<=260;x+=7.3)for(let z=-132;z<=260;z+=9.7)assert.equal(partitioned.sampleAt(x,z),combined.sampleAt(x,z));
 for(const x of values)for(const z of values)assert.equal(partitioned.sampleAt(x,z),combined.sampleAt(x,z));
 partitioned.dispose();assert.equal(partitioned.sampleAt(1,1),null);
 assert.ok(batches.get('0:0:sidewalk').contactIndex.sampleAt(1,1)>0,'retiring the lookup must not retire another publication’s leases');
 for(const batch of batches.values())batch.release();combined.dispose();
});

test('changed remote sidewalk context reuses an identical fitted product, while real height and geometry changes rebuild',{timeout:30000},async t=>{
 const url=new URL('../app/js/world/compiler/street-pavement-worker.js',import.meta.url).href;
 const code=`const {parentPort}=require('node:worker_threads');globalThis.self={postMessage:(m,transfer)=>parentPort.postMessage(m,transfer)};import(${JSON.stringify(url)}).then(()=>parentPort.on('message',data=>self.onmessage({data})));`;
 const worker=new NodeWorker(code,{eval:true});t.after(()=>worker.terminate());
 const request=data=>new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);worker.postMessage(data);}).finally(()=>worker.removeAllListeners('error'));
 const road={auditIndex:0,type:'residential',width:8,metersPerWorldUnit:1,surfaceBias:.18,pts:[{x:-400,z:20},{x:400,z:20}],tags:{sidewalk:'both'}};
 const input={roads:[road],metersPerWorldUnit:1,coverageBounds:{minX:0,maxX:64,minZ:0,maxZ:64}};
 assert.equal((await request({type:'prepare',input})).tiles,1);
 const first=await request({type:'next'});assert.equal(first.type,'tile');assert.ok(first.mesh.vertices.length>0);
 const cache=new StreetPacketCache(),owner=cache.setSurfaceOwner({revision:1,terrain:{},contact:{},portals:[]});
 cache.put(first);cache.putSurface(first.key,first.fingerprint,owner,{vertices:new Float32Array(first.mesh.vertices),curbVertices:new Float32Array(first.mesh.curbVertices),markingVertices:new Float32Array(first.mesh.markingVertices),addedTriangles:0,baseTriangles:first.mesh.vertices.length/9});
 const changed={...input,linearFeatures:[{kind:'footway',subtype:'sidewalk',width:2,pts:[{x:300,z:26},{x:350,z:26}]}]};
 await request({type:'prepare',input:changed,cached:cache.manifest(),surfaces:cache.surfaceManifest(owner)});
 const reused=await request({type:'next'});assert.equal(reused.type,'cached');
 assert.notEqual(reused.fingerprint,first.fingerprint,'the conservative source context really changed');
 assert.equal(reused.reuseFingerprint,first.fingerprint);assert.equal(reused.surfaceFingerprint,first.surfaceFingerprint);
 assert.equal(cache.revalidateSurface(reused,{}),false,'a retired physical owner cannot authorize reuse');
 assert.equal(cache.revalidateSurface({...reused,surfaceFingerprint:'wrong product'},owner),false);
 assert.equal(cache.revalidateSurface({...reused,reuseFingerprint:'wrong source'},owner),false);
 assert.equal(cache.revalidateSurface(reused,owner),true);assert.equal(cache.getPublication(first.key,first.fingerprint,owner),null);
 assert.deepEqual(cache.getPublication(reused.key,reused.fingerprint,owner).surface.vertices,new Float32Array(first.mesh.vertices));
 assert.ok(cache.bytes<=cache.maxBytes);assert.equal(cache.bytes,[...cache.entries.values()].reduce((n,e)=>n+e.bytes,0));
 const retry=await request({type:'retry'});assert.equal(retry.type,'tile');assert.deepEqual(retry.mesh,first.mesh,'an evicted fitted product can always be reconstructed exactly');
 for(const mutation of [v=>v.roads[0].surfaceBias=.4,v=>v.roads[0].metersPerWorldUnit=2,v=>v.roads[0].width=10,v=>v.buildings=[{pts:[{x:10,z:24},{x:20,z:24},{x:20,z:30},{x:10,z:30}]}]]){
  const next=structuredClone(changed);mutation(next);
  await request({type:'prepare',input:next,cached:cache.manifest(),surfaces:cache.surfaceManifest(owner)});
  const rebuilt=await request({type:'next'});assert.equal(rebuilt.type,'tile');assert.notEqual(rebuilt.surfaceFingerprint,reused.surfaceFingerprint);
 }
 cache.setSurfaceOwner({revision:2});assert.deepEqual(cache.surfaceManifest(owner),{});assert.equal(cache.revalidateSurface(reused,owner),false);
 cache.clear();assert.equal(cache.bytes,0);
});

test('actual pavement worker transfers exact final indexes and recovers after invalid input',{timeout:30000},async t=>{
 const url=new URL('../app/js/world/compiler/street-pavement-worker.js',import.meta.url).href;
 const code=`const {parentPort}=require('node:worker_threads');globalThis.self={postMessage:(m,transfer)=>parentPort.postMessage(m,transfer)};import(${JSON.stringify(url)}).then(()=>parentPort.on('message',data=>self.onmessage({data})));`;
 const worker=new NodeWorker(code,{eval:true});t.after(()=>worker.terminate());
 const request=(data,transfer=[])=>new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);worker.postMessage(data,transfer);}).finally(()=>worker.removeAllListeners('error'));
 const invalid=await request({type:'index',positions:new Float64Array(9)});
 assert.equal(invalid.type,'error');assert.match(invalid.message,/Float32/);
 const malformed=await request({type:'index',positions:new Float32Array(4)});
 assert.equal(malformed.type,'error');assert.match(malformed.message,/triangle/);
 for(const triangles of [0,200,23000]){
  const source=new Float32Array(triangles*9);
  for(let i=0;i<triangles;i++)source.set([i*2,0,0,i*2,.25,1,i*2+1,-0,0],i*9);
  const expected=indexPavementPositions(source),snapshot=source.slice();
  const pending=request({type:'index',positions:source},[source.buffer]);
  assert.equal(source.byteLength,0,'Sender relinquishes the private construction buffer');
  const result=await pending;assert.equal(result.type,'indexed');
  assert.deepEqual(result.positions,expected.positions);assert.deepEqual(result.indices,expected.indices);
  assert.equal(result.collapsedTriangles,expected.collapsedTriangles);
  for(let i=0;i<result.indices.length;i++)for(let axis=0;axis<3;axis++)assert.equal(result.positions[result.indices[i]*3+axis],snapshot[i*3+axis]);
 }
});

test('packet cache is bounded, rejects changed inputs and never returns mutable retained arrays',()=>{
 const cache=new StreetPacketCache(1200);
 const packet=(key,fingerprint)=>({key,fingerprint,segments:[],mesh:{vertices:[0,0,0,0,0,1,1,0,0],curbVertices:[]}});
 cache.put(packet('a','first'));const read=cache.get('a','first');read.mesh.vertices[0]=900;
 assert.equal(cache.get('a','first').mesh.vertices[0],0);assert.equal(cache.get('a','changed'),null);
 for(let i=0;i<30;i++)cache.put(packet(String(i),'value'));
 assert.ok(cache.bytes<=1200);assert.equal(cache.get('a','first'),null);
 cache.clear();assert.equal(cache.bytes,0);assert.deepEqual(cache.manifest(),{});
});

test('actual detail worker consumes retained cells before a larger scan evicts them',{timeout:30000},async t=>{
 const url=new URL('../app/js/world/compiler/street-pavement-worker.js',import.meta.url).href;
 const code=`const {parentPort}=require('node:worker_threads');globalThis.self={postMessage:(m,transfer)=>parentPort.postMessage(m,transfer)};import(${JSON.stringify(url)}).then(()=>parentPort.on('message',data=>self.onmessage({data})));`;
 const worker=new NodeWorker(code,{eval:true});t.after(()=>worker.terminate());
 const request=data=>new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);worker.postMessage(data);}).finally(()=>worker.removeAllListeners('error'));
 const input={roads:[{auditIndex:0,type:'residential',width:8,pts:[{x:-160,z:0},{x:160,z:0}],transportRecord:{sourceTags:{highway:'residential',sidewalk:'both'}}}],metersPerWorldUnit:1};
 const first=await request({type:'prepare',input}),packets=[];
 for(;;){const packet=await request({type:'next'});if(packet.type==='complete')break;assert.equal(packet.type,'tile');packets.push(packet);}
 assert.ok(packets.length>3);assert.equal(packets.length,first.tiles);
 const plan=prepareStreetPavement(input);
 for(const packet of packets){
  for(const s of packet.segments)assert.deepEqual(Object.keys(s).sort(),['a','b','offset','roadIndex','wa','wb']);
  const original=plan.tiles.find(tile=>tile.key===packet.key);
  const common={ground:(x,z)=>x*.07-z*.03,roadContactIndex:{sampleAt:(x,z,base)=>base+.2+Math.abs(z)*.001}};
  const before=createPavementBaseSampler({...common,segments:original.segments});
  const after=createPavementBaseSampler({...common,segments:packet.segments.map(s=>({...s,road:input.roads[s.roadIndex]}))});
  for(let i=0;i<packet.mesh.vertices.length;i+=9)assert.equal(after(packet.mesh.vertices[i],packet.mesh.vertices[i+2]),before(packet.mesh.vertices[i],packet.mesh.vertices[i+2]));
 }
 const retained=packets.slice(-2),cached=Object.fromEntries(retained.map(p=>[p.key,p.fingerprint]));
 assert.deepEqual(await request({type:'prepare',input,cached}),first);
 for(const expected of retained){const packet=await request({type:'next'});assert.equal(packet.type,'cached');assert.equal(packet.key,expected.key);assert.equal(packet.fingerprint,expected.fingerprint);}
 for(const expected of packets.slice(0,-2)){
  const packet=await request({type:'next'});assert.equal(packet.type,'tile');assert.equal(packet.key,expected.key);
  assert.equal(packet.fingerprint,expected.fingerprint);assert.deepEqual(packet.mesh,expected.mesh);
 }
 assert.equal((await request({type:'next'})).type,'complete');
});

test('terrain-fitted cache uses the original byte limit and rejects retired physical owners',()=>{
 const cache=new StreetPacketCache(1800);
 const packet=key=>({key,fingerprint:key,segments:[],mesh:{vertices:[0,0,0,0,0,1,1,0,0],curbVertices:[]}});
 const fields={revision:1,contact:{},portals:[],terrain:{}};
 const owner=cache.setSurfaceOwner(fields),surface={vertices:new Float32Array([0,2,0,0,2,1,1,2,0]),curbVertices:new Float32Array(),markingVertices:new Float32Array(),addedTriangles:2,baseTriangles:1};
 cache.put(packet('a'));assert.equal(cache.putSurface('a','a',owner,surface),true);
 assert.equal(cache.get('a','a'),null,'a finished cell must retire its unused construction buffer');
 assert.deepEqual(cache.manifest(),{a:'a'});
 surface.vertices[1]=99;const read=cache.getSurface('a','a',owner);assert.equal(read.vertices[1],2);
 read.vertices[1]=77;assert.equal(cache.getSurface('a','a',owner).vertices[1],2);
 assert.equal(cache.setSurfaceOwner({...fields}),owner);assert.equal(cache.getSurface('a','changed',owner),null);
 for(const field of ['revision','contact','portals','terrain']){
  const old=cache.surfaceOwner,changed={...fields,[field]:field==='revision'?2:{}};
  cache.setSurfaceOwner(changed);assert.equal(cache.getSurface('a','a',old),null);
  assert.equal(cache.putSurface('a','a',old,surface),false);
  assert.equal(cache.getSurface('a','a',cache.surfaceOwner),null);
  assert.equal(cache.getPublication('a','a',cache.surfaceOwner),null);
  assert.deepEqual(cache.manifest(),{},'changed owners require worker recompilation of finished cells');
  cache.put(packet('a'));
  cache.putSurface('a','a',cache.surfaceOwner,surface);
 }
 for(let i=0;i<30;i++){const key=String(i);cache.put(packet(key));cache.putSurface(key,key,cache.surfaceOwner,surface);assert.ok(cache.bytes<=1800);}
 assert.equal(cache.get('a','a'),null);cache.clear();assert.equal(cache.bytes,0);assert.equal(cache.surfaceOwner,null);
});

test('finished cache cells retain only one geometry representation within the same budget',()=>{
 const cache=new StreetPacketCache(1800),owner=cache.setSurfaceOwner({revision:0});
 const surface={vertices:new Float32Array(90).fill(4),curbVertices:new Float32Array(),markingVertices:new Float32Array(),addedTriangles:0,baseTriangles:10};
 for(const key of ['a','b']){
  cache.put({key,fingerprint:key,segments:[],mesh:{vertices:new Float64Array(90),curbVertices:[]}});
  assert.equal(cache.putSurface(key,key,owner,surface),true);
 }
 assert.deepEqual(cache.manifest(),{a:'a',b:'b'});
 assert.ok(cache.bytes<=1800);
 const publication=cache.getPublication('a','a',owner);
 assert.equal(publication.packet.mesh,undefined);
 publication.surface.vertices[0]=99;
 assert.equal(cache.getPublication('a','a',owner).surface.vertices[0],4);
 assert.equal(cache.getPublication('a','wrong-input',owner),null);
 assert.equal(cache.getPublication('a','a',{}),null);
 cache.put({key:'raw',fingerprint:'raw',segments:[],mesh:{vertices:[0,0,0],curbVertices:[]}});
 cache.setSurfaceOwner({revision:1});
 assert.deepEqual(cache.manifest(),{raw:'raw'},'unfitted packets remain valid across terrain changes');
 assert.equal(cache.getPublication('raw','raw',cache.surfaceOwner).surface,null);
 cache.clear();assert.equal(cache.bytes,0);
});

function harness(t,{holdType,keys=['0:0','16:0']}={}){
 const oldThree=globalThis.THREE,oldWorker=globalThis.Worker,resources=[];
 class Texture{constructor(data,width,height){this.image={data,width,height};resources.push(this);}dispose(){this.disposed=true;}}
 class Vector4{constructor(...v){this.set(...v);}set(...v){this.values=v;}}
 globalThis.THREE={Vector2:class{set(x,y){this.x=x;this.y=y;return this;}},Vector4,DataTexture:Texture,RedFormat:1,RGBAFormat:2,LinearFilter:3,NearestFilter:4};
 const originalCompile=()=>{},material={onBeforeCompile:originalCompile,customProgramCacheKey:()=> 'terrain'};
 const ctx={renderer:{copyTextureToTexture(position,source,target){assert.ok(Number.isFinite(position.x));assert.ok(source.image.data.length>0);assert.ok(resources.includes(target));}},_worldLoadSequence:1,_groundSurfaceRevision:0,roads:[],buildings:[],landuses:[],linearFeatures:[],urbanSurfaceMeshes:[],terrainGroup:{children:[{userData:{isTerrainMesh:true},material}]},terrainMeshHeightAt:(x,z)=>x*.2+z*.1};
 let calls=0,worker;
 globalThis.Worker=class{
  constructor(){worker=this;this.cursor=0;}
  terminate(){this.terminated=true;}
  postMessage(data){
   if(data.type==='next')assert.deepEqual(Object.keys(data.focus).sort(),['x','z'],'worker messages must exclude live scene objects');
   structuredClone(data);calls++;const deliver=()=>{
    if(this.terminated)return;
    if(data.type==='source-begin'||data.type==='source-chunk'){this.onmessage({data:{type:'source-ready'}});return;}
    if(data.type==='prepare'){this.keys=keys.filter(key=>!data.completedKeys?.includes(key));this.resumeKeys=data.completedKeys;this.onmessage({data:{type:'prepared',tiles:keys.length,keys,sourceCells:keys.length,excludedCells:0}});return;}
    const key=this.keys.shift();
    this.onmessage({data:key===undefined?{type:'complete'}:{type:'tile',key,mask:new Uint8Array(data.resolution**2).fill(255),coveredSquareWorldUnits:4096,remaining:this.keys.length}});
   };
   if(data.type===holdType){this.held={data,deliver};return;}
   queueMicrotask(deliver);
  }
 };
 t.after(()=>{globalThis.THREE=oldThree;globalThis.Worker=oldWorker;});
 return {ctx,resources,material,originalCompile,get calls(){return calls;},get worker(){return worker;}};
}

test('initial coverage finishes every cell and awaits mapped path publication before readiness',async t=>{
 const h=harness(t);h.ctx.worldLoading=true;
 let finishPaths,ready=false,callbacks=0;const progress=[];
 const overview=createStreetOverview(h.ctx,{onComplete:()=>{callbacks++;return new Promise(resolve=>{finishPaths=resolve;});}});
 const pending=overview.prepareInitialCoverage({x:0,z:0},{onProgress:p=>progress.push(p)}).then(value=>{ready=value;});
 for(let i=0;i<20&&!finishPaths;i++)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(overview.stats.completedCells,2);assert.equal(overview.stats.status,'finishing');
 assert.equal(ready,false);assert.equal(h.worker.terminated,true);
 finishPaths();await pending;assert.equal(ready,true);assert.equal(overview.stats.status,'complete');
 assert.deepEqual(progress.at(-1),{completed:2,total:2});
 assert.equal(await overview.prepareInitialCoverage({x:0,z:0}),true);assert.equal(callbacks,1);
 h.ctx.roads=[];const repeat=overview.prepareInitialCoverage({x:0,z:0});
 for(let i=0;i<20&&callbacks<2;i++)await new Promise(resolve=>setImmediate(resolve));
 finishPaths();assert.equal(await repeat,true);assert.equal(callbacks,2);
 overview.dispose();
});

test('initial coverage accepts an empty plan without inventing cells',async t=>{
 const h=harness(t,{keys:[]});h.ctx.worldLoading=true;let bounds='unset';
 const overview=createStreetOverview(h.ctx,{onComplete:value=>{bounds=value;}});
 assert.equal(await overview.prepareInitialCoverage({x:0,z:0}),true);
 assert.equal(overview.stats.totalCells,0);assert.equal(overview.stats.completedCells,0);assert.equal(bounds,null);
 overview.dispose();
});

test('cancelled initial coverage cannot advance a new loading screen or restart a retired worker',async t=>{
 const h=harness(t,{holdType:'prepare'});h.ctx.worldLoading=true;
 let current=true,progress=0;const overview=createStreetOverview(h.ctx);
 const pending=overview.prepareInitialCoverage({x:0,z:0},{current:()=>current,onProgress:()=>progress++});
 for(let i=0;i<20&&!h.worker?.held;i++)await new Promise(resolve=>setImmediate(resolve));
 current=false;overview.dispose();assert.equal(await pending,false);
 assert.equal(h.worker.terminated,true);assert.equal(progress,0);assert.equal(overview.stats.status,'disposed');
});

test('initial coverage reports publication failure and cannot run as a gameplay loading workaround',async t=>{
 const h=harness(t);const overview=createStreetOverview(h.ctx,{onComplete:()=>{throw Error('mapped path publication failed');}});
 await assert.rejects(overview.prepareInitialCoverage({x:0,z:0}),/loading cover/);assert.equal(h.calls,0);
 h.ctx.worldLoading=true;
 await assert.rejects(overview.prepareInitialCoverage({x:0,z:0}),/mapped path publication failed/);
 assert.equal(overview.stats.status,'failed');assert.equal(overview.stats.workerActive,false);overview.dispose();
});

test('initial preparation skips worlds without pavement and reports measured coverage through the existing loader',async t=>{
 assert.equal(await prepareInitialStreetCoverage({},()=>false),false);
 assert.equal(await prepareInitialStreetCoverage({},()=>true),true);
 const h=harness(t),messages=[];Object.assign(h.ctx,{worldLoading:true,car:{x:3,z:5},streetPavement:{},linearFeatureMeshes:[],showLoad:(_text,options)=>messages.push(options)});
 assert.equal(await prepareInitialStreetCoverage(h.ctx,()=>true),true);
 assert.equal(h.ctx.streetOverview.stats.status,'complete');
 assert.deepEqual(messages.at(-1),{phase:'prepareLocationScenery',completed:2,total:2});
 h.ctx.streetOverview.dispose();
});

test('terrain coverage survives movement and terrain revisions without rebuilding geometry',async t=>{
 const h=harness(t),overview=createStreetOverview(h.ctx);
 for(let i=0;i<2;i++){overview.step({x:0,z:0});await overview.pause();}
 assert.equal(overview.stats.status,'complete');assert.equal(h.ctx.urbanSurfaceMeshes.length,0);
 assert.equal(overview.stats.coveredSquareWorldUnits,8192);const calls=h.calls;
 h.ctx.streetPavement={coverageBounds:{minX:700,maxX:1400,minZ:-300,maxZ:300}};
 h.ctx._groundSurfaceRevision++;
 overview.step({x:1024,z:0});await overview.pause();assert.equal(h.calls,calls);
 const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <color_fragment>'};
 h.material.onBeforeCompile(shader);assert.deepEqual(shader.uniforms.nearPavementBounds.value.values,[700,-300,1400,300]);
 assert.match(shader.fragmentShader,/pavementCoverage/);assert.ok(overview.stats.retainedBytes>0);
 h.ctx.roads=[];
 for(let i=0;i<2;i++){overview.step({x:0,z:0});await overview.pause();}
 assert.equal(overview.stats.status,'complete');assert.ok(h.calls>calls);
 overview.dispose();assert.equal(h.material.onBeforeCompile,h.originalCompile);assert.equal(overview.stats.retainedBytes,0);assert.ok(h.worker.terminated);assert.ok(h.resources.every(r=>r.disposed));
});

for(const holdType of ['source-begin','prepare'])test(`nearby detail interrupts pending ${holdType} without awaiting city preparation`,async t=>{
 const h=harness(t,{holdType}),overview=createStreetOverview(h.ctx);
 overview.step({x:0,z:0});
 for(let i=0;i<20&&!h.worker?.held;i++)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.worker.held.data.type,holdType);
 const inFlight=overview.pause(),prior=h.worker;
 await overview.suspendForDetail();await inFlight;
 assert.equal(prior.terminated,true);assert.equal(overview.stats.status,'suspended');
 assert.equal(overview.stats.workerActive,false);assert.equal(overview.stats.error,null);
 assert.equal(overview.stats.completedCells,0);
 prior.onmessage({data:{type:'tile',key:'bad',mask:new Uint8Array(1),remaining:0}});
 assert.equal(overview.stats.completedCells,0,'late retired worker data cannot publish');
 overview.dispose();
});

test('suspension retains accepted distant cells and resumes remaining work without a replacement atlas',async t=>{
 const h=harness(t),overview=createStreetOverview(h.ctx);
 overview.step({x:0,z:0});await overview.pause();
 const resources=h.resources.length,bytes=overview.stats.retainedBytes;
 assert.equal(overview.stats.completedCells,1);
 await overview.suspendForDetail();assert.equal(overview.stats.completedCells,1);
 assert.equal(overview.stats.retainedBytes,bytes);
 overview.step({x:1024,z:0});await overview.pause();
 assert.deepEqual(h.worker.resumeKeys,['0:0']);
 assert.equal(h.resources.length,resources,'accepted coverage atlas must survive interruption');
 assert.equal(overview.stats.status,'complete');assert.equal(overview.stats.completedCells,2);
 assert.equal(overview.stats.coveredSquareWorldUnits,8192);
 overview.dispose();
});

test('source replacement after suspension never reuses prior world cell acknowledgements',async t=>{
 const h=harness(t),overview=createStreetOverview(h.ctx);
 overview.step({x:0,z:0});await overview.pause();await overview.suspendForDetail();
 h.ctx.roads=[];
 overview.step({x:1024,z:0});await overview.pause();
 assert.deepEqual(h.worker.resumeKeys,[]);assert.equal(overview.stats.completedCells,1);
 overview.step({x:0,z:0});await overview.pause();assert.equal(overview.stats.status,'complete');
 overview.dispose();
});

test('disposed or superseded overview work cannot publish a late cell',async t=>{
 const h=harness(t),overview=createStreetOverview(h.ctx);
 overview.step({x:0,z:0});overview.dispose();await overview.pause();
 assert.equal(h.ctx.urbanSurfaceMeshes.length,0);assert.equal(overview.stats.status,'disposed');
});

test('overview sends only coordinates from a live actor with uncloneable scene state',async t=>{
 const h=harness(t),overview=createStreetOverview(h.ctx);
 const actor={x:17,z:-23,render(){},scene:{}};actor.scene.actor=actor;
 for(let i=0;i<2;i++){overview.step(actor);await overview.pause();}
 assert.equal(overview.stats.status,'complete');assert.equal(overview.stats.error,null);
 overview.dispose();
});

test('distant pavement uses the rendered terrain without sampling a second height surface',async t=>{
 const h=harness(t),overview=createStreetOverview(h.ctx);
 h.ctx.terrainMeshHeightAt=()=>{throw new Error('must not resample terrain');};
 for(let i=0;i<2;i++){overview.step({x:0,z:0});await overview.pause();}
 assert.equal(overview.stats.status,'complete');overview.dispose();
});

test('actual overview worker covers a multi-kilometre network beyond the old 144-cell window',{timeout:30000},async t=>{
 const url=new URL('../app/js/world/compiler/street-overview-worker.js',import.meta.url).href;
 const code=`const {parentPort}=require('node:worker_threads');globalThis.self={postMessage:(m,transfer)=>parentPort.postMessage(m,transfer)};import(${JSON.stringify(url)}).then(()=>parentPort.on('message',data=>self.onmessage({data})));`;
 const worker=new NodeWorker(code,{eval:true});t.after(()=>worker.terminate());
 const request=data=>new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);worker.postMessage(data);}).finally(()=>worker.removeAllListeners('error'));
 const roads=[-640,0,640].map(z=>({type:'residential',width:8,pts:[{x:-1600,z},{x:1600,z}],transportRecord:{sourceTags:{highway:'residential',sidewalk:'both'}}}));
 const plan=await request({type:'prepare',input:{roads,metersPerWorldUnit:1}});
 await request({type:'source-begin',metersPerWorldUnit:1});
 for(const road of roads)await request({type:'source-chunk',field:'roads',items:[road]});
 const stagedPlan=await request({type:'prepare'});
 assert.deepEqual(stagedPlan,plan,'staged worker transfer must preserve complete coverage');
 assert.ok(plan.tiles>144);
 let count=0,near=0,far=0;
 for(;;){const packet=await request({type:'next',focus:{x:0,z:0}});if(packet.type==='complete')break;assert.equal(packet.type,'tile');count++;
  assert.ok(packet.mask instanceof Uint8Array);if(packet.mask.some(value=>value>0)){if(packet.bounds.minX<384&&packet.bounds.maxX>-384)near++;if(packet.bounds.maxX>1400||packet.bounds.minX<-1400)far++;}
 }
 assert.equal(count,plan.tiles);assert.ok(near>0);assert.ok(far>0,'far pavement must exist, not only source inventory');
 const resumed=await request({type:'prepare',input:{roads,metersPerWorldUnit:1},completedKeys:plan.keys.slice(1)});
 assert.deepEqual(resumed,plan,'resumed plans retain the complete coverage inventory');
 const remaining=await request({type:'next',focus:{x:0,z:0}});
 assert.equal(remaining.key,plan.keys[0]);assert.equal(remaining.remaining,0);
 assert.equal((await request({type:'next',focus:{x:0,z:0}})).type,'complete');
 const excluded=await request({type:'prepare',input:{roads:[{type:'motorway',width:20,pts:[{x:-1600,z:0},{x:1600,z:0}],transportRecord:{sourceTags:{highway:'motorway',sidewalk:'no'}}}],metersPerWorldUnit:1}});
 assert.ok(excluded.sourceCells>0);assert.equal(excluded.tiles,0);assert.equal(excluded.excludedCells,excluded.sourceCells);
 assert.equal((await request({type:'next',focus:{x:0,z:0}})).type,'complete');
});


test('active flight advances at most one overview cell per presentation tick',async t=>{
 const h=harness(t);h.ctx.gameStarted=true;h.ctx.planeMode={active:true};
 const overview=createStreetOverview(h.ctx);
 overview.step({x:500,z:500});await overview.pause();
 assert.equal(overview.stats.completedCells,1);
 assert.equal(overview.stats.status,'building');
 overview.step({x:550,z:550});await overview.pause();
 assert.equal(overview.stats.completedCells,2);
 assert.equal(overview.stats.status,'complete');overview.dispose();
});

 test('frame advancement is single-flight and yields to detail publication and world changes',async t=>{
 const h=harness(t),overview=createStreetOverview(h.ctx);
 Object.assign(h.ctx,{streetOverview:overview,gameStarted:true,car:{x:0,z:0}});
 updateStreetOverviewFrame(h.ctx);updateStreetOverviewFrame(h.ctx);
 assert.ok(h.calls<=1,'only one source preparation may be in flight');
 await overview.pause();assert.equal(overview.stats.completedCells,1);
 for(const flag of ['worldLoading','onMoon','_streetPavementUpdating','_cancelStreetPavementBuild']){
  h.ctx[flag]=true;updateStreetOverviewFrame(h.ctx);await overview.pause();
  assert.equal(overview.stats.completedCells,1,flag);h.ctx[flag]=false;
 }
 updateStreetOverviewFrame(h.ctx);await overview.pause();
 assert.equal(overview.stats.completedCells,2,'next frame need not wait for a 200 ms LOD tick');
 overview.dispose();
});


test('high flight outside the near terrain retains accepted pavement without starting a detail worker',t=>{
 const previousDocument=globalThis.document;globalThis.document={getElementById:()=>null};t.after(()=>{globalThis.document=previousDocument;});
 let overviewSteps=0;
 const accepted={coverageBounds:{minX:-384,maxX:384,minZ:-384,maxZ:384},stats:{triangles:500}};
 const ctx={gameStarted:true,planeMode:{active:true,airborne:true,x:4000,y:300,z:6000},streetPavement:accepted,
  terrainMeshHeightAt:()=>null,elevationWorldYAtWorldXZ:()=>20,streetOverview:{stats:{},step:()=>{overviewSteps++;}}};
 updateStreetPavementFocus(ctx);assert.equal(ctx.streetPavement,accepted);assert.equal(ctx._streetPavementUpdating,undefined);assert.equal(overviewSteps,1);
 ctx.elevationWorldYAtWorldXZ=()=>NaN;updateStreetPavementFocus(ctx);
 assert.equal(ctx.streetPavement,accepted);assert.equal(ctx._streetPavementUpdating,undefined);assert.equal(overviewSteps,2);
});

test('early initial coverage coalesces its worker and keeps path publication behind the final handoff',async t=>{
 const h=harness(t);h.ctx.worldLoading=true;let callbacks=0,finishPaths;
 const overview=createStreetOverview(h.ctx,{deferPresentation:true,onComplete:()=>{callbacks++;return new Promise(resolve=>{finishPaths=resolve;});}});
 const first=overview.prepareInitialCoverage({x:0,z:0}),second=overview.prepareInitialCoverage({x:0,z:0});
 assert.equal(await first,true);assert.equal(await second,true);
 assert.equal(overview.stats.status,'prepared');assert.equal(overview.stats.completedCells,overview.stats.totalCells);
 assert.equal(callbacks,0);assert.equal(overview.completedBounds,null);assert.equal(h.worker.terminated,true);
 const published=overview.publishPreparedCoverage();
 assert.equal(callbacks,1);assert.equal(overview.stats.status,'finishing');
 finishPaths();assert.equal(await published,true);assert.equal(overview.stats.status,'complete');
 assert.equal(overview.initialPreparationPending,false);assert.equal(await overview.publishPreparedCoverage(),true);assert.equal(callbacks,1);
 overview.dispose();
});
test('retired prepared coverage cannot publish mapped paths into a replacement world',async t=>{
 const h=harness(t);h.ctx.worldLoading=true;let calls=0;
 const overview=createStreetOverview(h.ctx,{deferPresentation:true,onComplete:()=>calls++});
 await overview.prepareInitialCoverage({x:0,z:0});overview.dispose();
 assert.equal(await overview.publishPreparedCoverage(),false);assert.equal(calls,0);
 assert.equal(h.worker.terminated,true);assert.equal(overview.stats.workerActive,false);
});
