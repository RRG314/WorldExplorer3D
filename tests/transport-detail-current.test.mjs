import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {planTransportRegions,nearestTransportRegion,actorNeedsRoadDetail} from '../app/js/terrain/transport-detail-plan.js';
import {createTransportDetailCompiler} from '../app/js/terrain/transport-detail-compiler.js';
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
});
