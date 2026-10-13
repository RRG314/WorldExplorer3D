import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {compileTransportFacilityGraph,selectFacilitySourceElements} from '../app/js/transport/facility-compiler.js';
import {compileFacilityPerimeterPlan,groundPerimeterBay} from '../app/js/transport/facility-perimeter-plan.js';
import {createFacilityPerimeter} from '../app/js/transport/facility-perimeter-runtime.js';
import {createTransportFacilityVisuals} from '../app/js/transport/facility-visuals.js';

import {perimeterFixture} from './fixtures/facility-perimeter-data.js';
const graph=perimeterFixture();
test('mapped fence keeps site membership, gate, road and taxiway clearance without inventing a perimeter',()=>{
 const plan=compileFacilityPerimeterPlan(graph),bays=plan.near({x:0,z:0},256,512);
 assert.ok(bays.length>40);assert.equal(bays.length,plan.count);
 assert.ok(bays.every(b=>b.start.z===0));
 for(const [x,radius] of [[-45,4],[0,5.5],[50,8.5]])assert.ok(bays.every(b=>b.end.x<=x-radius||b.start.x>=x+radius));
 const noFence={...graph,records:graph.records.filter(r=>r.type!=='fence')};assert.equal(compileFacilityPerimeterPlan(noFence).count,0);
 for(const record of graph.records.filter(r=>r.type==='fence')) {
   const bad={...graph,records:graph.records.map(r=>r===record?{...r,exactPhysicalGeometry:false}:r)};
   if(record.geometry.points[0].z===0)assert.equal(compileFacilityPerimeterPlan(bad).count,0);
 }
 assert.equal(compileFacilityPerimeterPlan({...graph,records:graph.records.filter(r=>r.type!=='aerodrome')}).count,0);
});
test('intake keeps fence, access gate, and access geometry but no unrelated buildings',()=>{
 const source=[{type:'node',id:1},{type:'node',id:2,tags:{barrier:'gate'}},{type:'node',id:3},{type:'way',id:4,nodes:[1,2],tags:{barrier:'fence'}},{type:'way',id:5,nodes:[2,3],tags:{highway:'service'}},{type:'way',id:6,tags:{building:'yes'}}];
 assert.deepEqual(selectFacilitySourceElements(source).map(r=>r.id),[1,2,3,4,5]);
});
test('nearby detail is capped, and unknown/discontinuous ground cannot publish collision',()=>{
 const plan=compileFacilityPerimeterPlan(graph),bay=plan.near({x:0,z:0},256,1)[0];assert.ok(bay);
 assert.equal(plan.near({x:10000,z:10000}).length,0);
 assert.equal(groundPerimeterBay(bay,()=>null),null);
 assert.equal(groundPerimeterBay(bay,x=>x===bay.mid.x?100:0),null);
 assert.equal(groundPerimeterBay(bay,x=>x*2),null);
 assert.ok(groundPerimeterBay(bay,x=>x*.1));
});
function testAsset() {
 const root=new THREE.Group(),material=new THREE.MeshStandardMaterial();
 for(const name of ['Fence_panel','Fence_post']){const part=new THREE.Mesh(new THREE.BoxGeometry(1,2,.1),material);part.name=name;root.add(part);}
 let releases=0;return {root,dispose(){releases++;},get releases(){return releases;}};
}
test('visual and collider lifecycle is atomic across movement, scene disposal, and late loading',async()=>{
 let point={x:0,z:0},registered=null;const other={id:'other'},ctx={dynamicBuildingColliders:[other],registerRuntimeSystem:s=>registered=s,unregisterRuntimeSystem:()=>registered=null};
 const asset=testAsset(),runtime=createFacilityPerimeter(THREE,graph,{appCtx:ctx,focus:()=>point,sampleGround:()=>0,loadAsset:async()=>asset});
 assert.equal(ctx.dynamicBuildingColliders.length,1);assert.equal(await runtime.ready,true);
 assert.ok(runtime.snapshot().visibleBays>0);assert.equal(ctx.dynamicBuildingColliders.length,runtime.snapshot().visibleBays+1);
 assert.ok(runtime.group.children.every(m=>m.count>0));
 point={x:2000,z:2000};registered.update({dt:.3});assert.equal(runtime.snapshot().visibleBays,0);assert.deepEqual(ctx.dynamicBuildingColliders,[other]);
 point={x:0,z:0};registered.update({dt:.3});assert.ok(ctx.dynamicBuildingColliders.length>1);
 runtime.dispose();runtime.dispose();assert.equal(asset.releases,1);assert.deepEqual(ctx.dynamicBuildingColliders,[other]);assert.equal(registered,null);
 let finish;const late=testAsset(),pending=createFacilityPerimeter(THREE,graph,{appCtx:ctx,focus:()=>point,sampleGround:()=>0,loadAsset:()=>new Promise(resolve=>finish=resolve)});
 pending.dispose();finish(late);assert.equal(await pending.ready,false);assert.equal(late.releases,1);assert.deepEqual(ctx.dynamicBuildingColliders,[other]);
});
test('a failed asset cannot leave invisible walls or substitute box fences',async()=>{
 const ctx={dynamicBuildingColliders:[]};const runtime=createFacilityPerimeter(THREE,graph,{appCtx:ctx,focus:()=>({x:0,z:0}),sampleGround:()=>0,loadAsset:async()=>{throw new Error('offline');}});
 assert.equal(await runtime.ready,false);assert.equal(runtime.snapshot().status,'asset-unavailable');assert.equal(runtime.group.children.length,0);assert.equal(ctx.dynamicBuildingColliders.length,0);runtime.dispose();
});
test('area extents never render as concrete ribbons and runway authority stays intact',()=>{
 const visual=createTransportFacilityVisuals(THREE,{...graph,records:graph.records.filter(r=>r.type!=='fence')},{sampleGround:()=>0});
 assert.ok(!visual.group.children.some(o=>o.userData.transportFacilityType==='aerodrome'));
 assert.ok(visual.group.children.some(o=>o.userData.transportFacilityType==='taxiway'));assert.ok(Number.isFinite(visual.surfaceYAt(50,20)));visual.dispose();
});

test('bundled fence wire retains real opacity and meets its licensed asset budget',async()=>{
 const {NodeIO}=await import('@gltf-transform/core'),{ALL_EXTENSIONS}=await import('@gltf-transform/extensions'),{default:sharp}=await import('sharp');
 const {readFile,stat}=await import('node:fs/promises'),{createHash}=await import('node:crypto');
 const root=new URL('../app/assets/models/facilities/chainlink/',import.meta.url),bytes=await readFile(new URL('chainlink-kit.glb',root)),receipt=JSON.parse(await readFile(new URL('PROVENANCE.json',root)));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),receipt.sha256);assert.equal(receipt.license,'CC0-1.0');assert.ok(bytes.length<=2200000);assert.ok(receipt.triangles<=1500);
 const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).readBinary(bytes),wire=doc.getRoot().listMaterials().find(m=>m.getAlphaMode()==='MASK');assert.ok(wire);
 const tex=wire.getBaseColorTexture().getImage(),meta=await sharp(tex).metadata(),stats=await sharp(tex).stats();assert.equal(meta.hasAlpha,true);assert.equal(meta.width,1024);assert.ok(stats.channels[3].mean<100&&stats.channels[3].max===255);
});

test('relation boundaries retain member ways, join reversed parts and exclude inner holes',()=>{
 const nodes=[[-30,-20],[30,-20],[30,20],[-30,20],[-8,-8],[8,-8],[8,8],[-8,8],[-25,0],[25,0]].map(([x,z],i)=>({type:'node',id:i+1,lon:x/100000,lat:-z/100000}));
 const ways=[{type:'way',id:20,nodes:[1,2,3]},{type:'way',id:21,nodes:[1,4,3]},{type:'way',id:22,nodes:[5,6,7,8,5]},{type:'way',id:23,nodes:[9,10],tags:{barrier:'fence'}}];
 const relation={type:'relation',id:30,tags:{landuse:'port',type:'multipolygon'},members:[{type:'way',ref:20,role:'outer'},{type:'way',ref:21,role:'outer'},{type:'way',ref:22,role:'inner'}]};
 const elements=selectFacilitySourceElements([...nodes,...ways,relation]);assert.equal(elements.length,nodes.length+ways.length+1);
 const graph=compileTransportFacilityGraph({elements},{location:{lat:0,lon:0}}),site=graph.records.find(r=>r.type==='port');assert.equal(site.exactPhysicalGeometry,true);assert.equal(site.geometry.holes.length,1);
 const plan=compileFacilityPerimeterPlan(graph),bays=plan.near({x:0,z:0});assert.ok(bays.length>4);assert.ok(bays.every(b=>Math.abs(b.mid.x)>10));
 const missing=compileTransportFacilityGraph({elements:elements.filter(e=>e.id!==21)},{location:{lat:0,lon:0}});assert.equal(compileFacilityPerimeterPlan(missing).count,0);
});

test('complex site boundaries use a bounded membership index', () => {
  const points=Array.from({length:4001},(_,i)=>({x:Math.sin(i/4000*Math.PI*2)*2000,z:Math.cos(i/4000*Math.PI*2)*2000}));
  const site={id:'site',type:'aerodrome',exactPhysicalGeometry:true,geometry:{kind:'polygon',points}};
  const fence={id:'fence',type:'fence',exactPhysicalGeometry:true,geometry:{kind:'path',points:points.map(p=>({x:p.x*.995,z:p.z*.995}))}};
  const plan=compileFacilityPerimeterPlan({records:[site,fence]});
  assert.ok(plan.count>6000);assert.equal(plan.diagnostics.truncated,false);
  assert.ok(plan.diagnostics.membershipChecks<2000000, JSON.stringify(plan.diagnostics));
});

test('ground arriving after the model and exterior collision restoration remain connected', async () => {
  let ground=null,system;
  const ctx={dynamicBuildingColliders:[],activeEarthActorPosition:()=>({x:0,z:0}),registerRuntimeSystem:s=>system=s};
  const runtime=createFacilityPerimeter(THREE,graph,{appCtx:ctx,sampleGround:()=>ground,loadAsset:async()=>testAsset()});
  await runtime.ready;assert.equal(runtime.snapshot().visibleBays,0);
  ground=0;system.update({dt:.3});assert.ok(runtime.snapshot().visibleBays>0);
  ctx.activeInterior={};ctx.dynamicBuildingColliders=[];system.update({dt:.3});assert.equal(ctx.dynamicBuildingColliders.length,0);
  ctx.activeInterior=null;system.update({dt:.3});assert.equal(ctx.dynamicBuildingColliders.length,runtime.snapshot().visibleBays);
  runtime.dispose();assert.equal(ctx.dynamicBuildingColliders.length,0);
});
