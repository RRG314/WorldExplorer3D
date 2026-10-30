import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {prepareCarriagewayTiles} from '../app/js/world/compiler/street-carriageway.js';
import {meshCarriagewayTile} from '../app/js/world/compiler/street-carriageway-mesh.js';
import {createRoadContactIndex} from '../app/js/terrain/road-contact-index.js';
import {validateStreetEdgeRecipe} from '../app/js/world/compiler/street-edge-recipe.js';
const recipe={version:1,bands:[{side:1,startMeters:0,endMeters:40,widthMeters:.7,heightMeters:.06,rampMeters:.4,taperMeters:2,stripeMeters:1,phaseMeters:0}]};
const road={auditIndex:0,pts:[{x:0,z:-20},{x:0,z:0},{x:20,z:0}],width:8,metersPerWorldUnit:1,structureSemantics:{terrainMode:'at_grade'},edgeBandRecipe:recipe};
const partition=(v,sample)=>Float32Array.from(v.map((n,i)=>i%3===1?sample(v[i-1],v[i+1]):n));
const meshes=batches=>batches.map(b=>({geometry:{attributes:{position:{array:b.positions},...(b.baseY?{roadBaseY:{array:b.baseY}}:{})},getIndex:()=>({array:b.indices})},userData:{terrainMode:'at_grade'}}));
function build(input){const batches=[];for(const tile of prepareCarriagewayTiles(input)){const data=meshCarriagewayTile(tile,()=>10,partition);batches.push(data);if(data.edgeBands)batches.push(data.edgeBands);}return createRoadContactIndex(meshes(batches));}
test('an inside turn keeps both asphalt boundaries flush while the kerb roof stays continuous',()=>{
 const before=JSON.stringify(road),contact=build([road]);
 try{
  for(const x of[3.299,3.3,3.31,3.5,3.8])for(const z of[-3.299,-3.3,-3.31,-3.5,-3.8]){
   const lift=Math.max(0,Math.min(.06,(x-3.3)*.15,(-z-3.3)*.15));
   assert.ok(Math.abs(contact.sampleAt(x,z,10)-10-lift)<.0002,`${x},${z}`);
  }
  assert.equal(JSON.stringify(road),before);
 }finally{contact.dispose();}
});
test('an outside turn joins its radial ramp and leaves a crossing road open',()=>{
 const outside={...road,edgeBandRecipe:{version:1,bands:recipe.bands.map(b=>({...b,side:-1}))}},contact=build([outside]);
 try{
  for(const angle of [2,8,14,20,30,45,60,75,85].map(n=>n*Math.PI/180)){
   // The existing polygonal fan is the road boundary, not a new curved owner.
   const x=-Math.cos(angle)*3.65,z=Math.sin(angle)*3.65,y=contact.sampleAt(x,z,10);
   assert.ok(y>10.025&&y<10.061,`${angle}: ${y}`);
  }
 }finally{contact.dispose();}
 const crossing={auditIndex:1,pts:[{x:-10,z:-10},{x:10,z:-10}],width:6,metersPerWorldUnit:1,structureSemantics:{terrainMode:'at_grade'}},junction=build([outside,crossing]);
 try{assert.equal(junction.sampleAt(-3.8,-10,10),10,'unreviewed intersecting pavement subtracts the kerb from the junction');}
 finally{junction.dispose();}
});
test('a long source span compiles only local bands and agrees across a cell boundary',()=>{
 const long={...road,pts:[{x:10,z:0},{x:10,z:10000}],edgeBandRecipe:{version:1,bands:recipe.bands.map(b=>({...b,startMeters:0,endMeters:10000}))}};
 const tiles=prepareCarriagewayTiles([long]).filter(t=>t.bounds.minZ===0||t.bounds.minZ===128),batches=[];
 for(const t of tiles){const data=meshCarriagewayTile(t,()=>10,partition);assert.ok(data.edgeBands.positions.length/3<10000);batches.push(data,data.edgeBands);}
 const contact=createRoadContactIndex(meshes(batches));try{for(const z of[127.99,128,128.01])assert.ok(Math.abs(contact.sampleAt(13.9,z,10)-10.06)<.00001);}finally{contact.dispose();}
 for(const field of ['widthMeters','heightMeters','rampMeters','taperMeters','stripeMeters'])assert.throws(()=>validateStreetEdgeRecipe({version:1,bands:[{...recipe.bands[0],[field]:NaN}]}),/edge_recipe/);
 assert.throws(()=>validateStreetEdgeRecipe({version:1,bands:[...recipe.bands,...recipe.bands]}),/overlapping/);
});
test('actual transport worker transfers the authored physical bands and recompiles them after cell return',{timeout:30000},async t=>{
 const positions=Float32Array.from([-128,128].flatMap(z=>[-128,128].flatMap(x=>[x,0,z]))),terrain={segments:1,meshes:[{position:{x:0,y:0,z:0},positions,indices:Uint16Array.from([0,2,1,1,2,3]),userData:{isFarTerrainClipmap:true}}],far:{grid:{xValues:[-128,128],zValues:[-128,128],worldYs:[0,0,0,0]},portals:[]}};
 const url=new URL('../app/js/terrain/transport-detail-worker.js',import.meta.url).href;
 const code=`const {parentPort}=require('node:worker_threads');globalThis.self={postMessage:(m,transfer)=>parentPort.postMessage(m,transfer)};import(${JSON.stringify(url)}).then(()=>parentPort.on('message',data=>self.onmessage({data})));`;
 const worker=new Worker(code,{eval:true});t.after(()=>worker.terminate());
 const request=data=>new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);worker.postMessage(data);}).finally(()=>worker.removeAllListeners('error'));
 assert.equal((await request({type:'plan',input:{roads:[road],includeOverview:false}})).type,'planned');
 const response=await request({type:'prepare',input:{terrain}});assert.equal(response.type,'prepared',response.message);
 const batches=response.regions.flatMap(r=>r.batches),paint=batches.filter(b=>b.material==='edge-band');assert.ok(paint.length>0);
 assert.ok(paint.every(b=>b.colors instanceof Uint8Array&&b.colors.length===b.positions.length&&b.baseY instanceof Float32Array&&b.baseY.length===b.positions.length/3));
 const first=response.regions[0],again=await request({type:'compile',key:first.key});assert.deepEqual(again.batches,first.batches,'transferred buffers cannot detach the source recipe or its repeatable compiler');
 const contacts=createRoadContactIndex(meshes(batches));try{assert.ok(Math.abs(contacts.sampleAt(3.9,-10,0)-.24)<.00001);const p=contacts.sampleProfileAt(3.9,-10,0,'at_grade');assert.ok(Math.abs(p.baseY-.18)<.00001);}finally{contacts.dispose();}
});
