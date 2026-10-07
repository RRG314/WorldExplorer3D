import test from 'node:test';
import {Worker as NodeWorker} from 'node:worker_threads';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {planTransportRegions,nearestTransportRegion,actorNeedsRoadDetail,actorRequestsRoadDetail,
 transportRegionBounds,MAX_MOVING_TRANSPORT_REGIONS} from '../app/js/terrain/transport-detail-plan.js';
import {createTransportDetailCompiler,prepareTransportDetailPlan} from '../app/js/terrain/transport-detail-compiler.js';
import {restoreTransportTerrain} from '../app/js/terrain/transport-terrain-snapshot.js';
import {createRegionalRoadContact} from '../app/js/terrain/regional-road-contact.js';
import {createRoadContactIndex} from '../app/js/terrain/road-contact-index.js';
import {prepareCarriagewayTiles} from '../app/js/world/compiler/street-carriageway.js';
import {meshCarriagewayTile} from '../app/js/world/compiler/street-carriageway-mesh.js';
import {createPavementTerrainPartition} from '../app/js/world/pavement-terrain-partition.js';

function terrain(){
 const xValues=[-4096,0,4096],zValues=[-4096,0,4096],worldYs=xValues.flatMap((_,row)=>xValues.map(x=>x*.01+zValues[row]*.02));
 const positions=Float32Array.from(zValues.flatMap(z=>xValues.flatMap(x=>[x,x*.01+z*.02,z]))),indices=[];
 for(let row=0;row<2;row++)for(let col=0;col<2;col++){const a=row*3+col;indices.push(a,a+3,a+1,a+1,a+3,a+4);}
 return {segments:2,meshes:[{position:{x:0,y:0,z:0},positions,indices:Uint16Array.from(indices),userData:{isFarTerrainClipmap:true}}],far:{grid:{xValues,zValues,worldYs},portals:[]}};
}
const roads=[{auditIndex:0,pts:[{x:-3500,z:0},{x:3500,z:0}],width:8,metersPerWorldUnit:1,structureSemantics:{terrainMode:'at_grade'}},
 {auditIndex:1,pts:[{x:64,z:-2500},{x:64,z:2500}],width:6,metersPerWorldUnit:1,structureSemantics:{terrainMode:'at_grade'}}];
const meshes=batches=>batches.map(b=>({geometry:{attributes:{position:{array:b.positions}},getIndex:()=>({array:b.indices})},userData:{terrainMode:'at_grade'}}));
function triangles(batches){const rows=[];for(const b of batches)for(let i=0;i<b.indices.length;i+=3)rows.push([...b.indices.slice(i,i+3)].map(n=>[...b.positions.slice(n*3,n*3+3)].join(',')).sort().join('|'));return createHash('sha256').update(rows.sort().join('\n')).digest('hex');}

test('regional staging partitions every compiler cell once and prioritizes a moved observer',()=>{
 const tiles=prepareCarriagewayTiles(roads),plan=planTransportRegions(tiles,{x:0,z:0},1024);
 assert.equal(new Set([...plan.initial,...plan.pending].flatMap(r=>r.tiles.map(t=>t.key))).size,tiles.length);
 assert.equal([...plan.initial,...plan.pending].reduce((n,r)=>n+r.tiles.length,0),tiles.length);
 const i=nearestTransportRegion(plan.pending,{x:3400,z:0});assert.ok(plan.pending[i].bounds.minX>=2048);
});

test('staged exact regions retain the complete compiler geometry and contact, including boundaries',()=>{
 const input=terrain(),restored=restoreTransportTerrain(input),partition=createPavementTerrainPartition(restored.meshes,{includeFarTerrain:true});
 const expected=prepareCarriagewayTiles(roads).map(t=>meshCarriagewayTile(t,restored.sampleTop,partition));
 const compiler=createTransportDetailCompiler({roads,terrain:input,radius:1024});
 assert.ok(compiler.initial.pending.length>0);
 const initial=compiler.initial.regions.flatMap(r=>r.batches),all=[...initial];
 const index=createRegionalRoadContact(createRoadContactIndex(meshes(initial)));
 let packet;while((packet=compiler.next({x:3400,z:0}))){all.push(...packet.batches);index.add(packet.key,createRoadContactIndex(meshes(packet.batches)));}
 assert.equal(triangles(all),triangles(expected));
 for(let x=-3400;x<=3400;x+=31.3)assert.ok(Math.abs(index.sampleAt(x,0)-(x*.01+.18))<1e-4);
 for(const x of [-3072,-2048,-1024,0,1024,2048,3072])assert.ok(Number.isFinite(index.sampleAt(x,0)));
 assert.ok(index.stats().regions>0);index.dispose();assert.equal(index.stats().triangles,0);
 compiler.dispose();partition.dispose();restored.dispose();
});

test('final terrain snapshot carries cuts into road rendering and contact without lowering an upper street',()=>{
 const input=terrain(),mask={x:0,z:0,tangentX:1,tangentZ:0,halfWidth:8,halfDepth:5,roadY:-5,grade:0,cutHeight:10};
 input.portalMasks=[mask];input.far.portals=[mask];
 const restored=restoreTransportTerrain(input);
 assert.equal(restored.sampleTop(0,0),-4.82);assert.equal(restored.sampleUncutTop(0,0),.18);
 restored.dispose();
 const compiler=createTransportDetailCompiler({roads:[roads[0]],terrain:input,radius:1024,heightProbes:[{x:0,z:0,y:-4.82}]});
 const index=createRoadContactIndex(meshes(compiler.initial.regions.flatMap(r=>r.batches)));
 assert.equal(index.sampleAt(0,0),null,'removed asphalt cannot remain as an invisible driving floor');
 assert.ok(Math.abs(index.sampleAt(8,0)-.26)<1e-5,'surviving road remains on the original terrain');
 index.dispose();compiler.dispose();
});

test('regional contact selects the matching deck and ground and rejects duplicate owners',()=>{
 const batch=y=>({positions:Float32Array.from([0,y,0,10,y,0,0,y,10]),indices:Uint16Array.from([0,2,1])});
 const index=createRegionalRoadContact(createRoadContactIndex(meshes([batch(20)])));
 index.add('0:0',createRoadContactIndex(meshes([batch(0)])));
 assert.equal(index.sampleAt(1,1,1),0);assert.equal(index.sampleAt(1,1,19),20);
 assert.throws(()=>index.add('0:0',{}),/Duplicate/);index.dispose();
});

test('preparation cancellation terminates the worker immediately and cannot publish a stale world',async t=>{
 const previous=globalThis.Worker;let instance;
 globalThis.Worker=class {constructor(){instance=this;this.terminated=false;}postMessage(){}terminate(){this.terminated=true;}};
 t.after(()=>globalThis.Worker=previous);
 const {prepareTransportDetail}=await import('../app/js/terrain/transport-detail-runtime.js');
 const ctx={terrainGroup:{children:[]},renderer:{capabilities:{maxTextureSize:4096}},terrainMeshHeightAt:()=>0};
 const pending=prepareTransportDetail(ctx,[],{isCurrent:()=>true});
 assert.equal(typeof ctx._cancelTransportPreparation,'function');
 ctx._cancelTransportPreparation();
 await assert.rejects(pending,{name:'AbortError'});
 assert.equal(instance.terminated,true);assert.equal(ctx._cancelTransportPreparation,null);
});

test('regional readiness changes only after the publication callback commits and survives cancellation',async t=>{
 const previousWorker=globalThis.Worker,previousThree=globalThis.THREE;
 globalThis.THREE=await import('three');let worker;
 globalThis.Worker=class {
  constructor(){worker=this;this.terminated=false;}
  postMessage(message){queueMicrotask(()=>this.onmessage?.({data:message.type==='prepare'?
   {type:'prepared',keys:[],layout:{resolution:64},masks:new Uint8Array(),regions:[],pending:[{key:'2:0',bounds:{minX:2048,maxX:3072,minZ:0,maxZ:1024}}]}:
   {type:'region',key:'2:0',keys:[],batches:[],remaining:0}}));}
  terminate(){this.terminated=true;}
 };
 t.after(()=>{globalThis.Worker=previousWorker;globalThis.THREE=previousThree;});
 const {prepareTransportDetail}=await import('../app/js/terrain/transport-detail-runtime.js');
 const ctx={terrainGroup:{children:[]},renderer:{capabilities:{maxTextureSize:4096}},terrainMeshHeightAt:()=>0};
 const detail=await prepareTransportDetail(ctx,[],{isCurrent:()=>true});
 let finish;const publication=new Promise(resolve=>finish=resolve);let called=false;
 detail.attach(async()=>{called=true;await publication;});
 assert.equal(detail.readyAt({x:2500,z:300},0),false);
 detail.step({x:2500,z:300});await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(called,true);assert.equal(detail.readyAt({x:2500,z:300},0),false);
 finish();await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(detail.readyAt({x:2500,z:300},0),true);
 detail.dispose();assert.equal(worker.terminated,true);assert.equal(detail.stats.status,'disposed');
 detail.step({x:2500,z:300});assert.equal(detail.stats.status,'disposed');
 // Reset while asynchronous main-thread publication is still outstanding.
 const cancelled=await prepareTransportDetail(ctx,[],{isCurrent:()=>true});
 let release;cancelled.attach(()=>new Promise(resolve=>release=resolve));
 cancelled.step({x:2500,z:300});await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(typeof release,'function');
 cancelled.dispose();release();await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(worker.terminated,true);assert.equal(cancelled.stats.status,'disposed');
 assert.equal(cancelled.stats.completedRegions,0);assert.equal(cancelled.stats.pendingRegions,0);
});

test('render publication accepts transferred typed buffers and retains terrain mode for contacts',async t=>{
 const previous=globalThis.THREE;const THREE=await import('three');globalThis.THREE=THREE;t.after(()=>globalThis.THREE=previous);
 const {buildIndexedBatchMesh}=await import('../app/js/road-render.js');
 const scene=new THREE.Group(),list=[],material=new THREE.MeshStandardMaterial();
 buildIndexedBatchMesh({scene,targetList:list,material,verts:new Float32Array([0,2,0,10,2,0,0,2,10]),indices:new Uint32Array([0,2,1]),
  userData:{isRoadBatch:true,surfaceRanges:[{start:0,count:3,terrainMode:'at_grade'}]}});
 assert.equal(list.length,1,'a transferred region must not silently disappear at the renderer boundary');
 const contact=createRoadContactIndex(list);assert.equal(contact.sampleAt(1,1,NaN,'at_grade'),2);
 contact.dispose();list[0].geometry.dispose();material.dispose();
});


test('ground readiness protects landing and driving without pausing water or high-altitude flight',()=>{
 assert.equal(actorNeedsRoadDetail({source:'boat',y:0},0),false);
 assert.equal(actorNeedsRoadDetail({source:'plane',y:300},0),false);
 assert.equal(actorNeedsRoadDetail({source:'plane',y:100},0),true);
 assert.equal(actorNeedsRoadDetail({source:'drone',y:300},NaN),true);
 assert.equal(actorNeedsRoadDetail({source:'drive',y:300},0),true);
 assert.equal(actorRequestsRoadDetail({source:'plane',y:700},0),false);
 assert.equal(actorRequestsRoadDetail({source:'plane',y:300},0),true,'landing prefetch precedes contact protection');
 assert.equal(actorRequestsRoadDetail({source:'boat'},0),false);
});

test('failed road readiness retains collision protection and an owned retry with wait accounting',async t=>{
 const prior={Worker:globalThis.Worker,THREE:globalThis.THREE,document:globalThis.document};
 globalThis.THREE=await import('three');
 const elements=[];
 globalThis.document={createElement(tag){const element={tag,style:{},dataset:{},children:[],setAttribute(){},append(child){this.children.push(child);},remove(){this.removed=true;}};elements.push(element);return element;},body:{appendChild(){}}};
 globalThis.Worker=class {
  postMessage(message){queueMicrotask(()=>this.onmessage?.({data:message.type==='prepare'?
   {type:'prepared',keys:[],layout:{resolution:64},masks:new Uint8Array(),regions:[],pending:[{key:'2:0',bounds:{}}]}:
   {type:'error',message:'Controlled worker failure'}}));}
  terminate(){}
 };
 t.after(()=>Object.assign(globalThis,prior));
 const {prepareTransportDetail}=await import('../app/js/terrain/transport-detail-runtime.js');
 let reloads=0,current=true,rejectRetry;
 const ctx={terrainGroup:{children:[]},renderer:{capabilities:{maxTextureSize:4096}},terrainMeshHeightAt:()=>0};
 const detail=await prepareTransportDetail(ctx,[],{isCurrent:()=>current,retryWorldLoad:()=>{
  reloads++;return new Promise((_resolve,reject)=>{rejectRetry=reject;});
 }});t.after(()=>detail.dispose());
 detail.attach(()=>{});assert.equal(detail.readyAt({x:2500,z:300},0),false);
 const button=elements.find(e=>e.tag==='button');assert.equal(button.hidden,true);
 detail.step({x:2500,z:300});await new Promise(r=>setTimeout(r,5));
 assert.equal(detail.readyAt({x:2500,z:300},0),false);assert.equal(button.hidden,false);
 assert.equal(detail.stats.blockedCount,1);assert.equal(detail.stats.status,'failed');
 const retry=button.onclick();assert.equal(reloads,1);assert.equal(button.disabled,true);
 await button.onclick();assert.equal(reloads,1,'a repeated retry must not replace the in-flight load');
 rejectRetry(Error('Controlled retry failure'));await retry;assert.equal(button.disabled,false);
 assert.equal(detail.readyAt({x:0,z:0},0),true);assert.ok(detail.stats.blockedTotalMs>0);assert.equal(detail.stats.blockedAtMs,null);
 current=false;await button.onclick();assert.equal(reloads,1);detail.dispose();
 assert.equal(elements.find(e=>e.tag==='div').removed,true);
});


test('plan-ahead transport produces byte-identical masks and complete geometry from the final terrain',()=>{
 const serial=createTransportDetailCompiler({roads,terrain:terrain(),radius:1024});
 const preplanned=prepareTransportDetailPlan({roads,radius:1024});
 const overlapped=createTransportDetailCompiler({terrain:terrain(),preparedPlan:preplanned});
 assert.deepEqual(overlapped.initial.masks,serial.initial.masks);
 assert.deepEqual(overlapped.initial.keys,serial.initial.keys);
 const serialBatches=serial.initial.regions.flatMap(r=>r.batches),overlapBatches=overlapped.initial.regions.flatMap(r=>r.batches);
 let packet;while((packet=serial.next()))serialBatches.push(...packet.batches);
 while((packet=overlapped.next()))overlapBatches.push(...packet.batches);
 assert.equal(triangles(overlapBatches),triangles(serialBatches));
 serial.dispose();overlapped.dispose();
});

test('plan-ahead preparation cannot capture provisional terrain and cancels while waiting for the final surface',async t=>{
 const previous=globalThis.Worker;const messages=[];let worker;
 globalThis.Worker=class {
  constructor(){worker=this;this.terminated=false;}
  postMessage(message){messages.push(message.type);if(message.type==='plan')queueMicrotask(()=>this.onmessage({data:{type:'planned'}}));}
  terminate(){this.terminated=true;}
 };
 t.after(()=>globalThis.Worker=previous);
 const {prepareTransportDetail}=await import('../app/js/terrain/transport-detail-runtime.js');
 let release;const terrainReady=new Promise(resolve=>release=resolve);
 const ctx={renderer:{capabilities:{maxTextureSize:4096}},get terrainGroup(){throw new Error('Provisional terrain sampled');}};
 const pending=prepareTransportDetail(ctx,[],{isCurrent:()=>true,terrainReady});
 const rejected=assert.rejects(pending,{name:'AbortError'});
 await new Promise(resolve=>setTimeout(resolve,0));assert.deepEqual(messages,['plan']);
 ctx._cancelTransportPreparation();release();await rejected;assert.equal(worker.terminated,true);assert.deepEqual(messages,['plan']);
});


test('actual transport worker accepts an early planar plan and transfers final terrain geometry',{timeout:30000},async t=>{
 const url=new URL('../app/js/terrain/transport-detail-worker.js',import.meta.url).href;
 const code=`const {parentPort}=require('node:worker_threads');globalThis.self={postMessage:(m,transfer)=>parentPort.postMessage(m,transfer)};import(${JSON.stringify(url)}).then(()=>parentPort.on('message',data=>self.onmessage({data})));`;
 const worker=new NodeWorker(code,{eval:true});t.after(()=>worker.terminate());
 const request=data=>new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);worker.postMessage(data);}).finally(()=>worker.removeAllListeners('error'));
 assert.equal((await request({type:'plan',input:{roads,radius:1024}})).type,'planned');
 const result=await request({type:'prepare',input:{terrain:terrain(),heightProbes:[{x:0,z:0,y:.18}]}});
 assert.equal(result.type,'prepared');assert.equal(result.heightParity.maximumDifference,0);
 const key=result.pending[0].key;
 const first=await request({type:'compile',key});
 const returned=await request({type:'compile',key});
 assert.equal(triangles(first.batches),triangles(returned.batches),'returning to a region recompiles the same exact geometry after transfer');
 const batches=result.regions.flatMap(r=>r.batches);
 for(;;){const next=await request({type:'next',focus:{x:1000,z:0}});if(next.type==='complete')break;assert.equal(next.type,'region');batches.push(...next.batches);}
 const serial=createTransportDetailCompiler({roads,terrain:terrain(),radius:1024});const expected=serial.initial.regions.flatMap(r=>r.batches);
 let next;while((next=serial.next({x:1000,z:0})))expected.push(...next.batches);
 assert.equal(triangles(batches),triangles(expected));serial.dispose();
 // Reusing the worker must discard the previous plan and geometry.
 await request({type:'plan',input:{roads:[],radius:1024}});
 const empty=await request({type:'prepare',input:{terrain:terrain()}});assert.equal(empty.totalCells,0);
 assert.equal((await request({type:'next',focus:{x:0,z:0}})).type,'complete');
});

test('an existing regional overview avoids duplicate mask allocation without changing physical road footprints',()=>{
 const roads=[{pts:[{x:0,z:0},{x:600,z:0}],width:7,metersPerWorldUnit:1.11,structureSemantics:{terrainMode:'at_grade'}}];
 const ordinary=prepareTransportDetailPlan({roads});
 const regional=prepareTransportDetailPlan({roads,includeOverview:false});
 assert.ok(ordinary.masks.length>0);assert.equal(regional.masks.length,0);
 assert.deepEqual(regional.keys,ordinary.keys);
 assert.ok(regional.tiles.every(tile=>tile.polygons===undefined),'unused remote polygon unions are deferred');
 const eager=createTransportDetailCompiler({terrain:terrain(),preparedPlan:ordinary});
 const lazy=createTransportDetailCompiler({terrain:terrain(),preparedPlan:regional});
 assert.equal(triangles(eager.initial.regions.flatMap(r=>r.batches)),triangles(lazy.initial.regions.flatMap(r=>r.batches)));
 eager.dispose();lazy.dispose();
});

test('moving road detail evicts render/contact ownership and recompiles on return without thinning the overview',async t=>{
 const previous=globalThis.Worker,requests=[];let worker;
 const regions=[];for(let x=-12;x<=12;x++)for(let z=-3;z<=3;z++){
  const key=`${x}:${z}`;regions.push({key,bounds:transportRegionBounds(key)});
 }
 globalThis.Worker=class {
  constructor(){worker=this;this.terminated=false;}
  postMessage(message){requests.push(message);queueMicrotask(()=>this.onmessage?.({data:message.type==='prepare'?
   {type:'prepared',keys:[],masks:new Uint8Array(),regions:[],pending:regions}:
   {type:'region',key:message.key,keys:[],batches:[]}}));}
  terminate(){this.terminated=true;}
 };
 t.after(()=>globalThis.Worker=previous);
 const {prepareTransportDetail}=await import('../app/js/terrain/transport-detail-runtime.js');
 const ctx={farTerrainClipmapState:{regionalRoadCoverage:{status:'ready'}},terrainGroup:{children:[]},renderer:{capabilities:{maxTextureSize:4096}},terrainMeshHeightAt:()=>0};
 const detail=await prepareTransportDetail(ctx,[],{isCurrent:()=>true});t.after(()=>detail.dispose());
 const live=new Set(),published=[];
 detail.attach(packet=>{assert.ok(!live.has(packet.key));live.add(packet.key);published.push(packet.key);},()=>{},key=>{assert.equal(live.delete(key),true);});
 const settle=async point=>{for(let i=0;i<20;i++){
  detail.step(point,0);await new Promise(r=>setImmediate(r));
  assert.ok(live.size<=MAX_MOVING_TRANSPORT_REGIONS);assert.ok(detail.stats.activeJobs<=1);
  if(detail.stats.status==='window-ready')return;
 }throw Error('Window did not become ready');};
 // High flight and water request no contact compilation. Reads have no request authority.
 for(const source of ['plane','boat'])for(let n=0;n<20;n++){
  detail.step({x:6000,z:200,y:700,source},0);detail.readyForActor({source,y:700},0);
 }
 assert.equal(requests.length,1);
 await settle({x:250,z:250,source:'drive'});const first=new Set(live);
 assert.ok(first.size>0);assert.equal(detail.readyAt({x:250,z:250}),true);
 for(const x of [2300,4500,6700,8900,4500,250]){
  await settle({x,z:250,source:'drive'});assert.equal(detail.readyAt({x,z:250}),true);
  assert.equal(detail.stats.completedRegions+detail.stats.pendingRegions,regions.length);
 }
 assert.ok(detail.stats.evictedRegions>0);
 for(const key of first)assert.ok(published.filter(value=>value===key).length>=2,'revisited regions must be rebuilt');
 const old=published.length;detail.dispose();assert.equal(live.size,0);assert.equal(worker.terminated,true);
 detail.step({x:5000,z:250});await new Promise(r=>setImmediate(r));assert.equal(published.length,old);
});

test('a moved observer cannot publish an obsolete worker response or an unfinished contact build',async t=>{
 const previous=globalThis.Worker;let worker;
 globalThis.Worker=class {
  constructor(){worker=this;this.messages=[];}
  postMessage(message){this.messages.push(message);if(message.type==='prepare')queueMicrotask(()=>this.onmessage({data:{type:'prepared',keys:[],masks:new Uint8Array(),regions:[],pending:[{key:'2:0'}]}}));}
  terminate(){}
 };
 t.after(()=>globalThis.Worker=previous);
 const {prepareTransportDetail}=await import('../app/js/terrain/transport-detail-runtime.js');
 const ctx={farTerrainClipmapState:{regionalRoadCoverage:{status:'ready'}},terrainGroup:{children:[]},renderer:{capabilities:{maxTextureSize:4096}},terrainMeshHeightAt:()=>0};
 const detail=await prepareTransportDetail(ctx,[],{isCurrent:()=>true});t.after(()=>detail.dispose());
 let calls=0;detail.attach(()=>calls++);
 detail.step({x:2500,z:250},0);detail.step({x:-8000,z:250},0);
 worker.onmessage({data:{type:'region',key:'2:0',keys:[],batches:[]}});await new Promise(r=>setImmediate(r));
 assert.equal(calls,0);assert.equal(detail.readyAt({x:2500,z:250},0),false);
 let release;
 detail.attach(async(packet,{isCurrent})=>{await new Promise(r=>release=r);if(!isCurrent())throw new DOMException('Moved','AbortError');calls++;});
 detail.step({x:2500,z:250},0);worker.onmessage({data:{type:'region',key:'2:0',keys:[],batches:[]}});await new Promise(r=>setImmediate(r));
 detail.step({x:2500,z:250,y:700,source:'plane'},0);release();await new Promise(r=>setImmediate(r));
 assert.equal(calls,0);assert.equal(detail.stats.cancelledRegions,2);assert.equal(detail.stats.error,null);
});

test('regional contact retirement removes only its own deck and permits a clean return',()=>{
 const batch=(x,y)=>({positions:Float32Array.from([x,y,0,x+10,y,0,x,y,10]),indices:Uint16Array.from([0,2,1])});
 const index=createRegionalRoadContact(createRoadContactIndex(meshes([batch(0,20)])));
 const remote=createRoadContactIndex(meshes([batch(2048,0)]));index.add('2:0',remote);
 assert.equal(index.sampleAt(2049,1),0);assert.equal(index.remove('2:0'),true);
 assert.equal(remote.stats().triangles,0);assert.equal(index.sampleAt(2049,1),null);assert.equal(index.sampleAt(1,1),20);
 assert.equal(index.remove('2:0'),false);index.add('2:0',createRoadContactIndex(meshes([batch(2048,3)])));
 assert.equal(index.sampleAt(2049,1),3);index.dispose();
});
