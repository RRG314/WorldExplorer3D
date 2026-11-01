import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Worker} from 'node:worker_threads';
import {prepareReviewedDetailedTerrainMesh,refineReviewedDetailedTerrain} from '../app/js/terrain/reviewed-detailed-refinement.js';
import {createTerrainHeightSamplingApi} from '../app/js/terrain/height-sampling.js';
import {updateFeatureSurfaceProfile} from '../app/js/structure-semantics.js';
import {captureTransportTerrain,restoreTransportTerrain} from '../app/js/terrain/transport-terrain-snapshot.js';
import {semanticForestWeightAt,terrainVegetationBounds} from '../app/js/world/vegetation-spatial.js';
import {collectDetailBoundaryLines,detailPointsOnEdge,detailHeightAt} from '../app/js/terrain/detail-boundary.js';
import {createRoadContactIndex} from '../app/js/terrain/road-contact-index.js';
const plane=(x,z)=>10+.08*x+.08*z,dist=(x,z)=>Math.abs(x-z)/Math.SQRT2,ground=(x,z)=>plane(x,z)-(dist(x,z)>4?4:0);
const attribute=(array,itemSize)=>({array,itemSize,count:array.length/itemSize,getX:i=>array[i*itemSize],getY:i=>array[i*itemSize+1],getZ:i=>array[i*itemSize+2]});
function fixture(minX=-13){
 const r={sourceFeatureId:'controlled',pts:[{x:-100,z:-100},{x:100,z:100}],width:8,metersPerWorldUnit:1,surfaceBias:.18,type:'raceway',structureSemantics:{terrainMode:'at_grade'},surfaceSurveyEvidence:{version:1,sourceFeatureId:'controlled',groundArtifactId:'controlled',groundContentSha256:'a'.repeat(64),maximumCrossfall:.7,surfaceModel:'banked-road-v1'}};updateFeatureSurfaceProfile(r,plane);
 const grade=createTerrainHeightSamplingApi({appCtx:{structureTerrainCuts:[r]}}),p=[],uv=[],indices=[],n=4;
 for(let row=0;row<=n;row++)for(let col=0;col<=n;col++){const x=minX+col*6.5,z=-13+row*6.5;p.push(x,grade.applyStructureTerrainCuts(x,z,ground(x,z)),z);uv.push(col/n,row/n);}
 for(let row=0;row<n;row++)for(let col=0;col<n;col++){const a=row*(n+1)+col,b=a+1,c=a+n+1;indices.push(a,c,b,b,c,c+1);}
 const mesh={visible:true,position:{x:0,y:0,z:0},userData:{isTerrainMesh:true,terrainTile:{}},geometry:{parameters:{width:26,height:26,widthSegments:n,heightSegments:n},attributes:{position:attribute(Float32Array.from(p),3),uv:attribute(Float32Array.from(uv),2)},getIndex:()=>({array:Uint32Array.from(indices)})}},options={segments:[{a:r.pts[0],b:r.pts[1],innerRadius:12,outerRadius:44}],sampleGround:ground,gradeGround:grade.applyStructureTerrainCuts};
 return {mesh,options,road:r};
}
function adopt(mesh,staged){return {...mesh,userData:{...mesh.userData,reviewedTerrainCells:staged.cells},geometry:{parameters:mesh.geometry.parameters,attributes:{position:attribute(staged.positions,3),...Object.fromEntries([...staged.attributes].map(([k,a])=>[k,{...attribute(a.array,a.itemSize),normalized:a.normalized}]))},getIndex:()=>({array:staged.indices})}};}
test('a detailed terrain refinement preserves the complete banked pavement and samples the same published triangles',async()=>{
 const {mesh,options}=fixture(),before=mesh.geometry.attributes.position.array.slice(),old=createTerrainHeightSamplingApi({appCtx:{terrainGroup:{children:[mesh]},TERRAIN_SEGMENTS:4}}),staged=await prepareReviewedDetailedTerrainMesh(mesh,options),next=adopt(mesh,staged),api=createTerrainHeightSamplingApi({appCtx:{terrainGroup:{children:[next]},TERRAIN_SEGMENTS:4}}),contacts=createRoadContactIndex([next]);
 assert.deepEqual(mesh.geometry.attributes.position.array,before,'preparation is immutable');assert.ok(staged.addedVertices>0&&staged.addedVertices<2000);
 assert.equal(next.geometry.attributes.uv.count,next.geometry.attributes.position.count);
 let oldError=0;try{for(let x=-8;x<8;x+=.37)for(let z=-8;z<8;z+=.41){if(dist(x,z)>3.9)continue;oldError=Math.max(oldError,Math.abs(old.terrainMeshHeightAt(x,z)-plane(x,z)));const y=api.terrainMeshHeightAt(x,z);assert.ok(Math.abs(y-plane(x,z))<.00003,`${x},${z}: ${y-plane(x,z)}`);assert.ok(Math.abs(y-contacts.sampleAt(x,z))<.00001);}
 assert.ok(oldError>.1,'the original detailed cell reproduces verge bleed');
 const snapshot=structuredClone(captureTransportTerrain({terrainGroup:{children:[next]},TERRAIN_SEGMENTS:4})),restored=restoreTransportTerrain(snapshot);try{for(const [x,z]of[[0,0],[3,5],[-4,-1]])assert.ok(Math.abs(restored.sampleUncutTop(x,z)-api.terrainMeshHeightAt(x,z)-.18)<.00001);}finally{restored.dispose();}
 }finally{contacts.dispose();}
});
test('adjacent detailed tiles retain matching refined edge stations and heights',async()=>{
 const a=fixture(),b=fixture(13),left=await prepareReviewedDetailedTerrainMesh(a.mesh,a.options),right=await prepareReviewedDetailedTerrainMesh(b.mesh,b.options),edge=p=>{const out=[];for(let i=0;i<p.length;i+=3)if(p[i]===13)out.push([p[i+2],p[i+1]]);return out.sort((a,b)=>a[0]-b[0]);};
 assert.deepEqual(edge(left.positions),edge(right.positions));
 const mesh=adopt(a.mesh,left),lines=collectDetailBoundaryLines([mesh]),points=detailPointsOnEdge(lines,{x:13,z:-13},{x:13,z:13});assert.equal(points.length,edge(left.positions).length);for(const p of points)assert.ok(Math.abs(detailHeightAt(lines,'x',p.x,p.z)-p.y)<.000001,'far terrain reads every refined detailed boundary station');
});
test('cancellation, missing source ground and capacity failure do not alter a detailed mesh',async()=>{
 const f=fixture(),before=f.mesh.geometry.attributes.position.array.slice();for(const extra of[{current:()=>false},{sampleGround:()=>NaN},{maximumAddedVertices:1}])await assert.rejects(prepareReviewedDetailedTerrainMesh(f.mesh,{...f.options,...extra}));assert.deepEqual(f.mesh.geometry.attributes.position.array,before);
});
test('the actual transport worker retains refined detailed topology across transfer and cell return',{timeout:30000},async t=>{
 const f=fixture(),staged=await prepareReviewedDetailedTerrainMesh(f.mesh,f.options),next=adopt(f.mesh,staged),terrain=captureTransportTerrain({terrainGroup:{children:[next]},TERRAIN_SEGMENTS:4}),worker=new Worker(new URL('./fixtures/transport-detail-worker-node.mjs',import.meta.url));t.after(()=>worker.terminate());
 const request=data=>new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);worker.postMessage(data);}).finally(()=>worker.removeAllListeners('error'));
 assert.equal((await request({type:'plan',input:{roads:[{pts:[{x:-8,z:-8},{x:8,z:8}],width:8,metersPerWorldUnit:1,structureSemantics:{terrainMode:'at_grade'}}],includeOverview:false}})).type,'planned');
 const result=await request({type:'prepare',input:{terrain}});assert.equal(result.type,'prepared',result.message);const first=result.regions[0],again=await request({type:'compile',key:first.key});assert.deepEqual(again.batches,first.batches);
 const meshes=result.regions.flatMap(r=>r.batches).map(b=>({geometry:{attributes:{position:{array:b.positions}},getIndex:()=>({array:b.indices})},userData:{terrainMode:'at_grade'}})),contacts=createRoadContactIndex(meshes);try{for(const [x,z]of[[0,0],[3,5],[-4,-1]])assert.ok(Math.abs(contacts.sampleAt(x,z)-plane(x,z)-.18)<.00003);}finally{contacts.dispose();}
});

test('adoption retains the existing terrain mesh, retires its old geometry once and reuses a completed publication',async t=>{
 const prior=globalThis.THREE;globalThis.THREE=THREE;t.after(()=>globalThis.THREE=prior);
 const f=fixture(),geometry=new THREE.BufferGeometry();geometry.parameters={...f.mesh.geometry.parameters};for(const[name,a]of Object.entries(f.mesh.geometry.attributes))geometry.setAttribute(name,new THREE.BufferAttribute(a.array,a.itemSize));geometry.setIndex(new THREE.BufferAttribute(f.mesh.geometry.getIndex().array,1));
 const material=new THREE.MeshBasicMaterial(),mesh=new THREE.Mesh(geometry,material);mesh.userData={...f.mesh.userData,renderProvenance:{profile:'accepted-ground'}};const group=new THREE.Group();group.add(mesh);let disposed=0;geometry.addEventListener('dispose',()=>disposed++);
 const venue={id:'controlled',sourceSha256:'a'.repeat(64),sourceFeatureIds:['controlled']},r=f.road;r.surfaceSurveyEvidence.venueSource=venue;r.transportSurfaceModel={...r.transportSurfaceModel,surveyedSurface:{...r.transportSurfaceModel.surveyedSurface,venueSource:venue}};
 const ctx={terrainGroup:group,roads:[r],_worldLoadSequence:1,WORLD_UNITS_PER_METER:1,worldLoadRuntimeState:{sequence:1,venuePack:{venueSource:venue}},worldToGeo:(x,z)=>({lat:z,lon:x})},deps={sampleAcceptedGroundElevationAtLatLon:(lat,lon)=>ground(lon,lat),applyStructureTerrainCuts:f.options.gradeGround,resolveWaterTerrainY:(x,z,y)=>y};
 try{const result=await refineReviewedDetailedTerrain(ctx,deps);assert.equal(result.meshes,1);assert.equal(disposed,1);assert.equal(group.children[0],mesh);assert.notEqual(mesh.geometry,geometry);assert.equal(mesh.userData.renderProvenance.profile,'accepted-ground');assert.ok(mesh.userData.reviewedTerrainCells.size);assert.ok(ctx._groundSurfaceRevision>0);
 const adopted=mesh.geometry,again=await refineReviewedDetailedTerrain(ctx,deps);assert.equal(again.addedVertices,0);assert.equal(mesh.geometry,adopted);assert.equal(disposed,1);
 }finally{mesh.geometry.dispose();material.dispose();}
});

test('refined detailed terrain retains semantic forest coverage and reads its actual published attribute triangles',async()=>{
 const f=fixture(),mix=attribute(Uint8Array.from({length:25*4},(_,i)=>i%4===2?255:0),4);mix.normalized=true;f.mesh.geometry.attributes.terrainSurfaceMixA=mix;
 const staged=await prepareReviewedDetailedTerrainMesh(f.mesh,f.options),mesh=adopt(f.mesh,staged);assert.equal(mesh.geometry.attributes.terrainSurfaceMixA.normalized,true);
 assert.deepEqual(terrainVegetationBounds(mesh),{minX:-13,maxX:13,minZ:-13,maxZ:13});assert.equal(semanticForestWeightAt(mesh,0,0),1);
 const index=25,p=mesh.geometry.attributes.position,values=mesh.geometry.attributes.terrainSurfaceMixA;values.array[index*4+2]=0;
 assert.ok(Math.abs(semanticForestWeightAt(mesh,p.getX(index),p.getZ(index)))<.000001,'a refined clearing vertex cannot read the old regular-grid field');
});
