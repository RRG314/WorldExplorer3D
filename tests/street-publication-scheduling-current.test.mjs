import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRoadContactIndex,createRoadContactIndexCooperatively} from '../app/js/terrain/road-contact-index.js';
import {indexPavementPositions,indexPavementPositionsCooperatively} from '../app/js/world/pavement-indexed-mesh.js';
import {publishLinearFeaturePresentation,publishLinearFeaturePresentationCooperatively} from '../app/js/world/linear-feature-presentation.js';
import * as THREE from 'three';
import {buildFeatureRibbonEdges} from '../app/js/structure-semantics.js?v=63';

test('one long mapped feature yields between clipped paths and preserves its full mesh',async t=>{
 const prior=globalThis.THREE;globalThis.THREE=THREE;t.after(()=>{globalThis.THREE=prior;});
 const context=()=>({scene:new THREE.Scene(),linearFeatureMeshes:[],addEarthWorldObject(mesh){this.scene.add(mesh);}});
 const feature={kind:'footway',subtype:'sidewalk',width:2,surfaceBias:.08,structureSemantics:{terrainMode:'at_grade'},
  pts:Array.from({length:4001},(_,i)=>({x:i*3,z:Math.sin(i/10)*2}))};
 const options={features:[feature],pavementBounds:{minX:10,maxX:30,minZ:-5,maxZ:5},worldBaseTerrainY:x=>x*.001,buildFeatureRibbonEdges};
 const sync=context(),scheduled=context();
 publishLinearFeaturePresentation({...options,appCtx:sync});
 let paths=0,slicePaths=0,maximumPaths=0;
 await publishLinearFeaturePresentationCooperatively({...options,appCtx:scheduled,buildFeatureRibbonEdges:(...args)=>{
  paths++;slicePaths++;return buildFeatureRibbonEdges(...args);
 }},{budgetMs:0,yieldWork:async()=>{maximumPaths=Math.max(maximumPaths,slicePaths);slicePaths=0;}});
 assert.ok(paths>3900,'the entire mapped feature stays present');
 assert.equal(maximumPaths,1,'a single feature cannot monopolize an entire construction slice');
 assert.equal(scheduled.linearFeatureMeshes.length,sync.linearFeatureMeshes.length);
 for(let i=0;i<sync.linearFeatureMeshes.length;i++){
  const a=sync.linearFeatureMeshes[i].geometry,b=scheduled.linearFeatureMeshes[i].geometry;
  assert.deepEqual(b.index.array,a.index.array);
  for(const key of ['position','normal','uv'])assert.deepEqual(b.attributes[key].array,a.attributes[key].array);
 }
 for(const ctx of [sync,scheduled])for(const mesh of ctx.linearFeatureMeshes){mesh.geometry.dispose();mesh.material.dispose();}
});

test('a superseded long mapped feature stops between paths without publishing partial geometry',async t=>{
 const prior=globalThis.THREE;globalThis.THREE=THREE;t.after(()=>{globalThis.THREE=prior;});
 const ctx={scene:new THREE.Scene(),linearFeatureMeshes:[],addEarthWorldObject(mesh){this.scene.add(mesh);}};
 let current=true,paths=0;
 await assert.rejects(publishLinearFeaturePresentationCooperatively({appCtx:ctx,
  features:[{kind:'footway',subtype:'sidewalk',width:2,pts:Array.from({length:1000},(_,i)=>({x:i,z:0}))}],
  pavementBounds:{minX:-20,maxX:-10,minZ:-1,maxZ:1},worldBaseTerrainY:()=>0,
  buildFeatureRibbonEdges:(...args)=>{paths++;return buildFeatureRibbonEdges(...args);}
 },{budgetMs:0,current:()=>current,yieldWork:async()=>{if(paths)current=false;}}),/superseded/);
 assert.equal(paths,1);assert.equal(ctx.linearFeatureMeshes.length,0);assert.equal(ctx.scene.children.length,0);
});

for(const city of ['monaco','sf'])test(`${city}: scheduled indexing preserves captured geometry and contact`,async()=>{
 const capture=JSON.parse(readFileSync(new URL(`../docs/streets/audit-2026-09-13/${city}-unioned-roads-surfaces.json`,import.meta.url)));
 const triangles=capture.surfaces.filter(s=>s.family==='road').flatMap(s=>s.triangles);
 const input=triangles.flatMap(t=>t.flatMap(p=>[p.x,p.y,p.z]));
 let yields=0;const schedule={budgetMs:0,yieldWork:async()=>{yields++;}};
 const indexed=await indexPavementPositionsCooperatively(input,schedule);
 assert.deepEqual(indexed,indexPavementPositions(input));
 const mesh={userData:{terrainMode:'at_grade'},geometry:{attributes:{position:{array:indexed.positions}},getIndex:()=>({array:indexed.indices})}};
 const before=createRoadContactIndex([mesh],4),after=await createRoadContactIndexCooperatively([mesh],4,schedule);
 assert.deepEqual(before.stats(),after.stats());assert.ok(yields>10);
 for(const [a,b,c] of triangles){
  const x=(a.x+b.x+c.x)/3,z=(a.z+b.z+c.z)/3,y=(a.y+b.y+c.y)/3;
  assert.equal(after.sampleAt(x,z,y),before.sampleAt(x,z,y));
 }
 before.dispose();after.dispose();assert.equal(after.stats().recordBytes,0);
});

test('cancelled contact construction cannot return a partial index',async()=>{
 const mesh={userData:{},geometry:{attributes:{position:{array:new Float32Array([0,0,0,100,0,0,0,0,100])}}}};
 let current=true;
 await assert.rejects(createRoadContactIndexCooperatively([mesh],1,{budgetMs:0,current:()=>current,yieldWork:async()=>{current=false;}}),/superseded/);
 assert.equal(mesh.geometry.attributes.position.array.length,9);
});

test('scheduled mapped paths preserve clipping, vertex order and material groups',async t=>{
 const prior=globalThis.THREE;t.after(()=>{globalThis.THREE=prior;});
 class Geometry{setAttribute(k,v){(this.attributes||={})[k]=v;}setIndex(v){this.index=v;}computeVertexNormals(){}computeBoundingSphere(){}}
 class Attribute{constructor(array){this.array=new Float32Array(array);}}
 globalThis.THREE={BufferGeometry:Geometry,Float32BufferAttribute:Attribute,BufferAttribute:Attribute,
  DataTexture:class{constructor(data,width,height){Object.assign(this,{data,width,height});}dispose(){}},
  MeshStandardMaterial:class{constructor(options){this.options=options;}addEventListener(){}},
  Mesh:class{constructor(geometry,material){Object.assign(this,{geometry,material,userData:{}});}},DoubleSide:2};
 const context=()=>({scene:{},linearFeatureMeshes:[],addEarthWorldObject(){}});
 const options={features:Array.from({length:100},(_,i)=>({kind:i%2?'footway':'cycleway',subtype:'sidewalk',width:2,pts:[{x:-20,z:i},{x:20,z:i}]})),pavementBounds:{minX:-2,maxX:2,minZ:0,maxZ:50},worldBaseTerrainY:()=>0,
 buildFeatureRibbonEdges:(feature,points,half)=>({leftEdge:points.map(p=>({x:p.x,y:0,z:p.z-half})),rightEdge:points.map(p=>({x:p.x,y:0,z:p.z+half}))})};
 const sync=context(),async=context();let yields=0;
 const count=publishLinearFeaturePresentation({...options,appCtx:sync});
 assert.equal(await publishLinearFeaturePresentationCooperatively({...options,appCtx:async},{budgetMs:0,yieldWork:async()=>{yields++;}}),count);
 assert.deepEqual(async.linearFeatureMeshes,sync.linearFeatureMeshes);assert.ok(yields>=100);
});

test('neighbouring cells reuse road profiles without repeating terrain queries',async()=>{
 const {createPavementBaseSampler,createPavementBaseSamplerCooperatively}=await import('../app/js/world/pavement-height-sampler.js');
 const segment={a:{x:0,z:0},b:{x:800,z:0},wa:4,wb:8,road:{surfaceBias:.18,metersPerWorldUnit:1.11}};
 let calls=0,yields=0;const ground=(x,z)=>{calls++;return x*.1+z*.05;};
 const contact={sampleAt:(x,z)=>x*.1+z*.05+.18},profileCache=new Map();
 const options={segments:[segment],ground,roadContactIndex:contact,profileCache,groundRevision:1};
 const first=await createPavementBaseSamplerCooperatively(options,{budgetMs:0,yieldWork:async()=>{yields++;}});
 const initial=calls;assert.ok(initial>1000);assert.ok(yields>10);
 const second=await createPavementBaseSamplerCooperatively({...options,segments:[structuredClone(segment)]});
 assert.equal(calls,initial,'same geometric profiles must not be sampled again for the next cell');
 const independent=createPavementBaseSampler({...options,profileCache:new Map()});
 for(let x=0;x<800;x+=17)for(const z of [-10,-2,2,10]){
  assert.equal(first(x,z),second(x,z));assert.equal(second(x,z),independent(x,z));
 }
 const before=calls;
 await createPavementBaseSamplerCooperatively({...options,groundRevision:2});
 assert.ok(calls-before>1000,'a new terrain revision must invalidate every profile');
});
