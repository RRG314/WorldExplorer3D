import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {publishedPavementJoins} from '../app/js/terrain/published-pavement-joins.js';
import {createPavementTerrainPartition} from '../app/js/world/pavement-terrain-partition.js';
import {createPavementJoinPartition} from '../app/js/world/pavement-join-partition.js';
import {prepareCarriagewayTiles} from '../app/js/world/compiler/street-carriageway.js';
import {meshCarriagewayTile} from '../app/js/world/compiler/street-carriageway-mesh.js';
import {createRoadContactIndex} from '../app/js/terrain/road-contact-index.js';
import {createTransportDetailCompiler} from '../app/js/terrain/transport-detail-compiler.js';
import {reviewedRoadContinuations} from '../app/js/terrain/reviewed-road-continuations.js';

function fixture({halfWidth=4,delta=.0035}={}){
 const x=1750,z=-1400,ground=(px,pz)=>500+.02*(px-x)+.04*(pz-z),top=(px,pz)=>ground(px,pz)+.18,
  pts=[{x:x-10,z},{x,z}],road={sourceFeatureId:'track',pts,width:8,sourceNodeIds:[1,2],structureSemantics:{terrainMode:'at_grade'}},
  venue={id:'controlled',sourceSha256:'a'.repeat(64),sourceFeatureIds:['track','approach']};
 road.transportSurfaceModel={reviewedSurfacePhase:'accepted',surveyedSurface:{venueSource:venue}};road.surfaceSurveyEvidence={venueSource:venue};
 const approach={sourceFeatureId:'approach',pts:[{x,z},{x:x+20,z:z+.4}],width:halfWidth*2,sourceNodeIds:[2,3],structureSemantics:{terrainMode:'at_grade'},surfaceSurveyEvidence:{venueSource:venue},transportSurfaceModel:{reviewedSurfacePhase:'accepted',engineeredApproach:true,endpointPolicy:'reviewed_pavement_profile',surveyedSurface:{venueSource:venue,pavementProfile:{}}}},p=[];
 for(const [px,pz]of [[x+halfWidth*.02,z-halfWidth],[x-halfWidth*.02,z+halfWidth],[x+20+halfWidth*.02,z+.4-halfWidth],[x+20-halfWidth*.02,z+.4+halfWidth]])p.push(px,top(px,pz)+delta,pz);
 const positions=Float32Array.from(p),indices=Uint16Array.from([0,1,2,2,1,3]),joins=publishedPavementJoins(approach,positions,indices,[road,approach]),n=20,terrainVertices=[],terrainFaces=[];
 for(let row=0;row<=n;row++)for(let col=0;col<=n;col++){const px=x-20+col*2,pz=z-20+row*2;terrainVertices.push(px,ground(px,pz),pz);}
 for(let row=0;row<n;row++)for(let col=0;col<n;col++){const a=row*(n+1)+col,b=a+1,c=a+n+1;terrainFaces.push(a,c,b,b,c,c+1);}
 const terrainPositions=Float32Array.from(terrainVertices),terrainIndices=Uint16Array.from(terrainFaces),terrain={meshes:[{position:{x:0,y:0,z:0},positions:terrainPositions,indices:terrainIndices,segments:n,userData:{isTerrainMesh:true,terrainTile:{}}}],segments:n,portalMasks:[]},mesh={visible:true,position:{x:0,y:0,z:0},userData:{isTerrainMesh:true},geometry:{parameters:{widthSegments:n},attributes:{position:{array:terrainPositions}},getIndex:()=>({array:terrainIndices})}};
 return {x,z,top,road,approach,joins,positions,indices,terrain,mesh};
}
const surface=(positions,indices)=>({geometry:{attributes:{position:{array:positions}},getIndex:()=>({array:indices})},userData:{terrainMode:'at_grade'}});
function crossfall(index,x,z){let worst=0,prior;for(let offset=-.01;offset<=.01;offset+=.0005){const y=index.sampleAt(x,z+offset);assert.ok(Number.isFinite(y));if(prior)worst=Math.max(worst,Math.abs(y-prior.y)/(offset-prior.offset));prior={offset,y};}return worst;}
test('the common pavement partition sews a reviewed ribbon cap to the terrain-owned road at Float32 world coordinates',()=>{
 const f=fixture(),tile=prepareCarriagewayTiles([f.road]).find(t=>t.bounds.minX<=f.x&&t.bounds.maxX>=f.x&&t.bounds.minZ<=f.z&&t.bounds.maxZ>=f.z),meshes=[];
 for(const joins of [[],f.joins]){
  const partition=createPavementTerrainPartition([f.mesh],{includeFarTerrain:true,pavementJoins:joins});
  try{const mesh=meshCarriagewayTile(tile,f.top,partition);meshes.push(mesh);}finally{partition.dispose();}
 }
 const before=createRoadContactIndex([surface(meshes[0].positions,meshes[0].indices),surface(f.positions,f.indices)]),after=createRoadContactIndex([surface(meshes[1].positions,meshes[1].indices),surface(f.positions,f.indices)]);
 try{assert.ok(crossfall(before,f.x,f.z)>.7,'the old independent cap reproduces the discontinuity');assert.ok(crossfall(after,f.x,f.z)<.2,'the actual compiled boundary is continuous without relaxing the road guards');assert.ok(Math.abs(after.sampleAt(f.x-8,f.z)-f.top(f.x-8,f.z))<.0001,'ordinary terrain vertices away from the join are unchanged');}finally{before.dispose();after.dispose();}
});
test('a join requires the exact mapped endpoint, accepted venue binding and an eligible neighboring road',()=>{
 const f=fixture();assert.equal(f.joins.length,1);assert.deepEqual(f.joins[0].neighbors,['track']);
 for(const road of [{...f.road,sourceNodeIds:[1,9]},{...f.road,transportSurfaceModel:{...f.road.transportSurfaceModel,reviewedSurfacePhase:'provisional'}},{...f.road,structureSemantics:{terrainMode:'elevated'}},{...f.road,pts:[f.road.pts[0],{x:f.x+.01,z:f.z}]}])assert.deepEqual(publishedPavementJoins(f.approach,f.positions,f.indices,[road]),[]);
 const before=f.positions.slice(),join=createPavementJoinPartition(f.joins);try{assert.equal(join.select({bounds:{minX:f.x-100,maxX:f.x-90,minZ:f.z-2,maxZ:f.z+2},segments:[{road:f.road}]}).length,0);}finally{join.dispose();}assert.deepEqual(f.positions,before);
 assert.throws(()=>createPavementJoinPartition([{...f.joins[0],indices:Uint32Array.from([999999,0,1])}]),/invalid_pavement_join/);
 assert.throws(()=>createPavementJoinPartition(Array(107).fill(f.joins[0])),/capacity/);
});
test('a narrower reviewed pavement does not concentrate its height transition in a thin outside strip',()=>{
 const f=fixture({halfWidth:3.98,delta:-.022}),partition=createPavementTerrainPartition([f.mesh],{includeFarTerrain:true,pavementJoins:f.joins});
 try{const tile=prepareCarriagewayTiles([f.road])[0],mesh=meshCarriagewayTile(tile,f.top,partition),index=createRoadContactIndex([surface(mesh.positions,mesh.indices),surface(f.positions,f.indices)]);try{assert.ok(crossfall(index,f.x,f.z+3.98)<.2,'the existing cell support, rather than a centimetre strip, carries the join transition');}finally{index.dispose();}}finally{partition.dispose();}
});
test('the shared union height is independent of per-cell source attribution',()=>{
 const f=fixture(),partition=createPavementTerrainPartition([f.mesh],{includeFarTerrain:true,pavementJoins:f.joins});
 try{const a=meshCarriagewayTile(prepareCarriagewayTiles([f.road])[0],f.top,partition),b=meshCarriagewayTile(prepareCarriagewayTiles([{...f.road,sourceFeatureId:'adjoining-street'}])[0],f.top,partition);assert.deepEqual(a.positions,b.positions);assert.deepEqual(a.indices,b.indices);}finally{partition.dispose();}
});
test('an exact continuation fills the outer wedge between differently angled source-way caps',()=>{
 const f=fixture(),point={x:f.x+.02,z:f.z-2},compile=road=>{
  const partition=createPavementTerrainPartition([f.mesh],{includeFarTerrain:true,pavementJoins:f.joins});
  try{const mesh=meshCarriagewayTile(prepareCarriagewayTiles([road])[0],f.top,partition);return createRoadContactIndex([surface(mesh.positions,mesh.indices),surface(f.positions,f.indices)]);}finally{partition.dispose();}
 },before=compile(f.road),after=compile({...f.road,endpointContinuations:[{previous:f.road.pts[0],point:f.road.pts[1],next:f.approach.pts[1],halfWidth:4,offset:0,nextHalfWidth:4,nextOffset:0,minimumTurnRadians:0,pavementContinuation:true}]});
 try{assert.equal(before.sampleAt(point.x,point.z),null,'the separate butt caps reproduce the visible wedge');assert.ok(Number.isFinite(after.sampleAt(point.x,point.z)),'the same corner primitive must supply real rendered/contact triangles in the wedge');}finally{before.dispose();after.dispose();}
});
test('continuation admission keeps exact node, venue, layer and branch ownership',()=>{
 const f=fixture({halfWidth:3.8}),venue=f.road.surfaceSurveyEvidence.venueSource,before=structuredClone([f.road.pts,f.approach.pts]),get=roads=>reviewedRoadContinuations(roads,venue);
 const valid=get([f.road,f.approach]);assert.equal(valid.size,1);const join=valid.get(f.road)[0];assert.equal(join.point,f.road.pts[1]);assert.equal(join.halfWidth,4);assert.equal(join.nextHalfWidth,3.8);
 for(const b of [{...f.approach,sourceNodeIds:[9,3]},{...f.approach,structureSemantics:{terrainMode:'elevated'}},{...f.approach,transportSurfaceModel:{...f.approach.transportSurfaceModel,reviewedSurfacePhase:'provisional'}},{...f.approach,pts:[{x:f.x+.01,z:f.z},f.approach.pts[1]]}])assert.equal(get([f.road,b]).size,0);
 const branch={...f.road,sourceFeatureId:'branch',sourceNodeIds:[4,2]};venue.sourceFeatureIds.push('branch');assert.equal(get([f.road,f.approach,branch]).size,0,'a branch cannot be guessed to be a degree-two continuation');
 assert.deepEqual([f.road.pts,f.approach.pts],before,'source paths remain immutable');
});
test('the actual road worker retains the sewn boundary across transfer and region recompilation',{timeout:30000},async t=>{
 const f=fixture(),continuations=reviewedRoadContinuations([f.road,f.approach],f.road.surfaceSurveyEvidence.venueSource),input={roads:[{...f.road,endpointContinuations:continuations.get(f.road)}],terrain:f.terrain,pavementJoins:f.joins,includeOverview:false},direct=createTransportDetailCompiler(input),key=direct.initial.regions[0].key,expected=direct.compile(key),worker=new Worker(`const {parentPort}=require('node:worker_threads');globalThis.self={postMessage:(m,transfer)=>parentPort.postMessage(m,transfer)};import(${JSON.stringify(new URL('../app/js/terrain/transport-detail-worker.js',import.meta.url).href)}).then(()=>parentPort.on('message',data=>self.onmessage({data})));`,{eval:true});t.after(()=>worker.terminate());
 const request=data=>new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);worker.postMessage(data);}).finally(()=>worker.removeAllListeners('error'));
 try{const first=await request({type:'prepare',input});assert.equal(first.type,'prepared',first.message);for(let i=0;i<2;i++){const result=await request({type:'compile',key});assert.equal(result.type,'region',result.message);assert.deepEqual(result.batches,expected.batches);const contact=createRoadContactIndex([...result.batches.map(b=>surface(b.positions,b.indices)),surface(f.positions,f.indices)]);try{assert.ok(crossfall(contact,f.x,f.z)<.2);assert.ok(Number.isFinite(contact.sampleAt(f.x+.02,f.z-2)),'the actual worker retains the real corner triangles');}finally{contact.dispose();}}assert.deepEqual(f.joins[0].positions,fixture().joins[0].positions);}finally{direct.dispose();}
});
