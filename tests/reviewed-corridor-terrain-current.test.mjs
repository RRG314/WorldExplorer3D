import test from 'node:test';
import assert from 'node:assert/strict';
import {refineReviewedCorridorCells,corridorSegmentDistance} from '../app/js/terrain/reviewed-corridor-refinement.js';
import {sampleFarFieldGridWorldY} from '../app/js/terrain/far-field-geometry.js?v=18';
const xValues=[-320,0,320],zValues=[-320,0,320],basePositions=new Float32Array(zValues.flatMap(z=>xValues.flatMap(x=>[x,50,z]))),
 segment={a:{x:-15,z:-310},b:{x:15,z:310},innerRadius:7,outerRadius:28};
const heightAt=(x,z,candidates)=>{
 if(!candidates.length)return 50;
 const distance=corridorSegmentDistance(x,z,segment),blend=Math.max(0,Math.min(1,(distance-segment.innerRadius)/(segment.outerRadius-segment.innerRadius))),
  native=10+x*.05+z*.1;return native+(50-native)*blend*blend*(3-2*blend);
};
function grid(result){return {xValues,zValues,worldYs:new Float32Array(9).fill(50),detailedCoverage:[],boundaryTriangles:new Map([...result.trianglesByCell].map(([id,triangles])=>[id,triangles.map(ids=>ids.map(i=>({x:result.positions[i*3],y:result.positions[i*3+1],z:result.positions[i*3+2]})))]))};}

test('local refinement restores a valley road plane in rendered triangles and the existing far-terrain query without a global dense grid',async()=>{
 const result=await refineReviewedCorridorCells({xValues,zValues,basePositions,segments:[segment],heightAt}),surface=grid(result);
 for(let z=-300;z<=300;z+=3.7)for(const side of[-1.2,0,1.2]){
  const x=z*30/620+side,actual=sampleFarFieldGridWorldY(x,z,surface),expected=10+x*.05+z*.1;
  assert.ok(Math.abs(actual-expected)<.00001,`${x},${z}: ${actual} vs ${expected}`);
 }
 assert.ok(result.stats.vertices<50000);assert.ok(result.stats.triangles<100000);
 assert.equal(sampleFarFieldGridWorldY(300,300,surface),50);
 assert.deepEqual(basePositions,new Float32Array(zValues.flatMap(z=>xValues.flatMap(x=>[x,50,z]))),'preparation cannot mutate the previously published buffer');
});

test('all adaptive interior edges have two incident triangles, including root-cell boundaries and existing detailed seam points',async()=>{
 const positions=new Float32Array([...basePositions,-320,50,100]);
 const result=await refineReviewedCorridorCells({xValues,zValues,basePositions:positions,segments:[segment],heightAt}),edges=new Map();
 for(let i=0;i<result.indices.length;i+=3){const ids=[...result.indices.slice(i,i+3)];
  const [a,b,c]=ids.map(id=>({x:result.positions[id*3],z:result.positions[id*3+2]}));assert.ok((b.z-a.z)*(c.x-a.x)-(b.x-a.x)*(c.z-a.z)>0,'consistent upward faces');
  for(let j=0;j<3;j++){const x=ids[j],y=ids[(j+1)%3],key=x<y?x+':'+y:y+':'+x;edges.set(key,(edges.get(key)||0)+1);}
 }
 for(const [key,count] of edges){assert.ok(count<=2);if(count===2)continue;
  const [a,b]=key.split(':').map(Number),ax=result.positions[a*3],az=result.positions[a*3+2],bx=result.positions[b*3],bz=result.positions[b*3+2];
  assert.ok(ax===bx&&Math.abs(ax)===320||az===bz&&Math.abs(az)===320,'no unmatched internal edge');
 }
});

test('capacity, missing native ground and world cancellation reject off-scene preparation',async()=>{
 const options={xValues,zValues,basePositions,segments:[segment],heightAt};
 await assert.rejects(refineReviewedCorridorCells({...options,maximumLeaves:10}),/capacity/);
 await assert.rejects(refineReviewedCorridorCells({...options,heightAt:()=>NaN}),/ground_unavailable/);
 await assert.rejects(refineReviewedCorridorCells({...options,current:()=>false}),/superseded/);
});

import fs from 'node:fs';
import vm from 'node:vm';
import {createFarFieldGeometryPlanner} from '../app/js/terrain/far-field-geometry.js?v=18';
const sandbox=vm.createContext({console});vm.runInContext(fs.readFileSync(new URL('../app/vendor/three/build/three.min.js',import.meta.url),'utf8'),sandbox);
async function owner(t,{noninteger=false,detailed=false}={}){
 const prior=globalThis.THREE,T=sandbox.THREE;globalThis.THREE=T;t.after(()=>{globalThis.THREE=prior;});
 const venue={id:'controlled-refinement',sourceSha256:'a'.repeat(64),sourceFeatureIds:['osm:way:one']},
  survey={venueSource:venue},road={sourceFeatureId:'osm:way:one',width:8,pts:[{x:-300,z:17},{x:300,z:17}],surfaceSurveyEvidence:survey,
   structureSemantics:{terrainMode:'at_grade'},transportSurfaceModel:{reviewedSurfacePhase:'accepted',surveyedSurface:survey}},
  appCtx={_worldLoadSequence:1,worldLoadRuntimeState:{sequence:1,venuePack:{venueSource:venue}},roads:[road],terrainGroup:{children:[]},WORLD_UNITS_PER_METER:1,TERRAIN_Y_EXAGGERATION:1};
 let available=true,near=null;
 if(detailed){const positions=[];for(let z=0;z<=20;z+=10)for(let x=0;x<=20;x+=10)positions.push(x,10+.03*x+.1*(z-17),z);
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));near=new T.Mesh(geometry);near.userData.isTerrainMesh=true;appCtx.terrainGroup.children.push(near);t.after(()=>{near.geometry.dispose();near.material.dispose();});}
 const planner=createFarFieldGeometryPlanner({appCtx,farFieldGridIntervalMeters:320,farFieldGapFillIntervalMeters:40,worldToLatLon:(x,z)=>({lat:z,lon:x}),
  sampleAcceptedGroundElevationAtLatLon:(z,x)=>available?50-40*Math.exp(-(((z-17)/10)**2))+.03*x:NaN,latLonToTileXY:()=>({x:0,y:0}),
  terrainTileDeps:{applyStructureTerrainCuts:(x,z,y)=>Math.abs(z-17)<=4?10+.03*x+.1*(z-17):y,resolveWaterTerrainY:(x,z,y)=>y}}),
  built=await planner.buildFarFieldGeometry({outer:noninteger?{minX:-320.1,maxX:320.1,minZ:-320.1,maxZ:320.1}:{minX:-320,maxX:320,minZ:-320,maxZ:320},inner:{minX:-5,maxX:5,minZ:-5,maxZ:5},detailedCoverage:detailed?[{minX:0,maxX:20,minZ:0,maxZ:20}]:[]},new Map(),0,{contextZoom:0,waterAreas:[]}),
  mesh=new T.Mesh(built.geometry,new T.MeshBasicMaterial());
 mesh.userData.mappedSurfaceTints=built.mappedSurfaceTints;mesh.userData.mappedSurfaceModes=built.mappedSurfaceModes;
 t.after(()=>{mesh.geometry.dispose();mesh.material.dispose();});
 return {built,mesh,appCtx,near,unavailable:()=>{available=false;}};
}

test('the existing geometry owner adopts refined buffers and the same height query atomically, retaining material attribute shapes',async t=>{
 const h=await owner(t),before=sampleFarFieldGridWorldY(70,17,h.built.surfaceGrid),geometry=h.mesh.geometry;
 assert.ok(before>40,'the coarse native mesh really misses the narrow valley');
 const result=await h.built.refineReviewedCorridors(h.mesh);
 assert.equal(h.mesh.geometry,geometry);assert.equal(result.venueId,'controlled-refinement');
 for(const x of[-290,-100,0,70,200,290])for(const side of[-1.2,0,1.2]){
  const expected=10+.03*x+.1*side,actual=sampleFarFieldGridWorldY(x,17+side,h.built.surfaceGrid);assert.ok(Math.abs(actual-expected)<.0001,`${x},${side}: ${actual} vs ${expected}`);
 }
 const count=geometry.attributes.position.count;for(const attribute of Object.values(geometry.attributes))assert.equal(attribute.count,count);
 assert.equal(h.mesh.userData.mappedSurfaceTints.length,count*3);assert.equal(h.mesh.userData.mappedSurfaceModes.length,count);
 assert.equal(await h.built.refineReviewedCorridors(h.mesh),result,'the immutable reviewed group is adopted once by this mesh owner');
 assert.ok(geometry.index.count>0);assert.ok(geometry.boundingSphere.radius>0);
});

test('an unavailable native source or superseded owner leaves the previous far geometry and query intact',async t=>{
 const h=await owner(t),position=h.mesh.geometry.attributes.position,before=sampleFarFieldGridWorldY(70,17,h.built.surfaceGrid),triangles=h.built.surfaceGrid.boundaryTriangles.size;
 h.unavailable();await assert.rejects(h.built.refineReviewedCorridors(h.mesh),/ground_unavailable/);
 assert.equal(h.mesh.geometry.attributes.position,position);assert.equal(sampleFarFieldGridWorldY(70,17,h.built.surfaceGrid),before);assert.equal(h.built.surfaceGrid.boundaryTriangles.size,triangles);
 await assert.rejects(h.built.refineReviewedCorridors(h.mesh,{current:()=>false}),/superseded/);
 assert.equal(h.mesh.geometry.attributes.position,position);
});

test('narrow detailed-seam cells refine only their long axis within the same geometry budget',async()=>{
 const xValues=[-320,-.01,0,.01,320],zValues=[-320,320],basePositions=new Float32Array(zValues.flatMap(z=>xValues.flatMap(x=>[x,0,z]))),
  segment={a:{x:0,z:-310},b:{x:0,z:310},innerRadius:7,outerRadius:28};
 const result=await refineReviewedCorridorCells({xValues,zValues,basePositions,segments:[segment],heightAt:(x,z)=>x*.1+z*.03,innerSpacing:3,maximumLeaves:10000});
 assert.ok(result.stats.leaves<10000);assert.ok(result.stats.vertices<30000);
 for(let i=0;i<result.indices.length;i+=3){const[a,b,c]=[...result.indices.slice(i,i+3)].map(id=>({x:result.positions[id*3],z:result.positions[id*3+2]}));
  assert.ok((b.z-a.z)*(c.x-a.x)-(b.x-a.x)*(c.z-a.z)>0,'no collapsed narrow leaves');
 }
});


test('float32 geospatial mesh bounds can refine without querying beyond the original far-grid extent',async t=>{
 const h=await owner(t,{noninteger:true});
 const result=await h.built.refineReviewedCorridors(h.mesh);assert.ok(result.vertices>0);
 assert.ok(Math.abs(sampleFarFieldGridWorldY(70,17,h.built.surfaceGrid)-12.1)<.0001);
});


test('refined far cells preserve detailed-tile holes and continue following their published seam heights',async t=>{
 const h=await owner(t,{detailed:true,noninteger:true});
 await h.built.refineReviewedCorridors(h.mesh);
 assert.equal(sampleFarFieldGridWorldY(10,17,h.built.surfaceGrid),null,'detailed terrain retains the hole');
 const before=sampleFarFieldGridWorldY(-.1,17,h.built.surfaceGrid);assert.ok(Number.isFinite(before));
 const p=h.near.geometry.attributes.position;for(let i=0;i<p.count;i++)p.setY(i,p.getY(i)+1);
 assert.ok(h.built.refreshBoundaryHeights([h.near])>0);
 assert.ok(sampleFarFieldGridWorldY(-.1,17,h.built.surfaceGrid)>before+.5,'query and same geometry retain live seam ownership after refinement');
});
