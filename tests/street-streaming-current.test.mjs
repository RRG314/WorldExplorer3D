import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker as NodeWorker} from 'node:worker_threads';
import {StreetPacketCache} from '../app/js/world/street-packet-cache.js';
import {createStreetOverview} from '../app/js/world/street-overview.js';

test('packet cache is bounded, rejects changed inputs and never returns mutable retained arrays',()=>{
 const cache=new StreetPacketCache(1200);
 const packet=(key,fingerprint)=>({key,fingerprint,segments:[],mesh:{vertices:[0,0,0,0,0,1,1,0,0],curbVertices:[]}});
 cache.put(packet('a','first'));const read=cache.get('a','first');read.mesh.vertices[0]=900;
 assert.equal(cache.get('a','first').mesh.vertices[0],0);assert.equal(cache.get('a','changed'),null);
 for(let i=0;i<30;i++)cache.put(packet(String(i),'value'));
 assert.ok(cache.bytes<=1200);assert.equal(cache.get('a','first'),null);
 cache.clear();assert.equal(cache.bytes,0);assert.deepEqual(cache.manifest(),{});
});

function harness(t){
 const oldThree=globalThis.THREE,oldWorker=globalThis.Worker,resources=[];
 class Texture{constructor(data,width,height){this.image={data,width,height};resources.push(this);}dispose(){this.disposed=true;}}
 class Vector4{constructor(...v){this.set(...v);}set(...v){this.values=v;}}
 globalThis.THREE={Vector4,DataTexture:Texture,RedFormat:1,RGBAFormat:2,LinearFilter:3,NearestFilter:4};
 const originalCompile=()=>{},material={onBeforeCompile:originalCompile,customProgramCacheKey:()=> 'terrain'};
 const ctx={_worldLoadSequence:1,_groundSurfaceRevision:0,roads:[],buildings:[],landuses:[],linearFeatures:[],urbanSurfaceMeshes:[],terrainGroup:{children:[{userData:{isTerrainMesh:true},material}]},terrainMeshHeightAt:(x,z)=>x*.2+z*.1};
 let calls=0,worker;
 globalThis.Worker=class{
  constructor(){worker=this;this.cursor=0;}
  terminate(){this.terminated=true;}
  postMessage(data){
   if(data.type==='next')assert.deepEqual(Object.keys(data.focus).sort(),['x','z'],'worker messages must exclude live scene objects');
   structuredClone(data);calls++;queueMicrotask(()=>{
    if(this.terminated)return;
    if(data.type==='prepare'){this.cursor=0;this.onmessage({data:{type:'prepared',tiles:2,keys:['0:0','16:0'],sourceCells:2,excludedCells:0}});return;}
    const x=this.cursor++*1024;
    this.onmessage({data:x>1024?{type:'complete'}:{type:'tile',key:`${x/64}:0`,mask:new Uint8Array(data.resolution**2).fill(255),coveredSquareWorldUnits:4096,remaining:this.cursor<2?1:0}});
   });
  }
 };
 t.after(()=>{globalThis.THREE=oldThree;globalThis.Worker=oldWorker;});
 return {ctx,resources,material,originalCompile,get calls(){return calls;},get worker(){return worker;}};
}

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
 assert.ok(plan.tiles>144);
 let count=0,near=0,far=0;
 for(;;){const packet=await request({type:'next',focus:{x:0,z:0}});if(packet.type==='complete')break;assert.equal(packet.type,'tile');count++;
  assert.ok(packet.mask instanceof Uint8Array);if(packet.mask.some(value=>value>0)){if(packet.bounds.minX<384&&packet.bounds.maxX>-384)near++;if(packet.bounds.maxX>1400||packet.bounds.minX<-1400)far++;}
 }
 assert.equal(count,plan.tiles);assert.ok(near>0);assert.ok(far>0,'far pavement must exist, not only source inventory');
 const excluded=await request({type:'prepare',input:{roads:[{type:'motorway',width:20,pts:[{x:-1600,z:0},{x:1600,z:0}],transportRecord:{sourceTags:{highway:'motorway',sidewalk:'no'}}}],metersPerWorldUnit:1}});
 assert.ok(excluded.sourceCells>0);assert.equal(excluded.tiles,0);assert.equal(excluded.excludedCells,excluded.sourceCells);
 assert.equal((await request({type:'next',focus:{x:0,z:0}})).type,'complete');
});
