import test from 'node:test';
import assert from 'node:assert/strict';
import {ctx} from '../app/js/shared-context.js?v=55';
import {applyHeightsToTerrainMesh,applyHeightsToTerrainMeshCooperatively} from '../app/js/terrain/tiles.js';

// Scheduling/atomicity harness only; GPU normals are covered by the existing
// real-geometry lifecycle checks, not claimed by this lightweight attribute.
function fixture(t) {
  const saved={...ctx};t.after(()=>{for(const k of Object.keys(ctx))delete ctx[k];Object.assign(ctx,saved);});
  Object.assign(ctx,{WORLD_UNITS_PER_METER:1,TERRAIN_Y_EXAGGERATION:1,TERRAIN_SEGMENTS:16,terrainGroup:null});
  function makeMesh(){
    const array=new Float32Array(17*17*3),base=new Float32Array(17*17);
    for(let i=0;i<17*17;i++){array[i*3]=i%17;array[i*3+1]=7;array[i*3+2]=Math.floor(i/17);base[i]=2+array[i*3]*.1;}
    const position={array,count:289,getX:i=>array[i*3],getZ:i=>array[i*3+2],setY:(i,y)=>{array[i*3+1]=y;}};
    return {position:{x:0,y:0,z:0},visible:true,userData:{baseTerrainWorldY:base,terrainTile:{z:15,tx:0,ty:0,bounds:{latN:1,latS:0,lonE:1,lonW:0}}},
      geometry:{attributes:{position},computeVertexNormals(){}}};
  }
  const deps={usesAcceptedGround:true,sampleAcceptedGroundAtLatLon:()=>{throw new Error('cached base heights must be reused');},applyStructureTerrainCuts:(x,z,y)=>y+z*.2};
  return {makeMesh,deps,options:{reuseBaseElevations:true,refreshVisualProfile:false}};
}

test('cooperative grading yields without changing published positions and matches synchronous heights',async t=>{
  const {makeMesh,deps,options}=fixture(t),sync=makeMesh(),cooperative=makeMesh();
  const original=cooperative.geometry.attributes.position.array.slice();let yields=0;
  applyHeightsToTerrainMesh(sync,deps,options);
  assert.equal(await applyHeightsToTerrainMeshCooperatively(cooperative,deps,{...options,sliceBudgetMs:0,yieldControl:async()=>{
    yields++;assert.deepEqual(cooperative.geometry.attributes.position.array,original);assert.equal(cooperative.position.y,0);
  }}),true);
  assert.equal(yields,2);assert.deepEqual(cooperative.geometry.attributes.position.array,sync.geometry.attributes.position.array);
  assert.equal(cooperative.position.y,sync.position.y);
});

test('superseded grading cannot publish partially computed heights',async t=>{
  const {makeMesh,deps,options}=fixture(t),mesh=makeMesh(),original=mesh.geometry.attributes.position.array.slice();let current=true;
  const completed=await applyHeightsToTerrainMeshCooperatively(mesh,deps,{...options,sliceBudgetMs:0,isCurrent:()=>current,yieldControl:async()=>{current=false;}});
  assert.equal(completed,false);assert.deepEqual(mesh.geometry.attributes.position.array,original);assert.equal(mesh.position.y,0);
  assert.equal(mesh.geometry.attributes.position.needsUpdate,undefined);
});
