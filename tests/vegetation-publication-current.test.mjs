import test from 'node:test';
import assert from 'node:assert/strict';
import {publishVegetationCooperatively} from '../app/js/world/vegetation-publication.js';
import {collectWorldVegetationPlacements,collectWorldVegetationPlacementsCooperatively,initWorldVegetation} from '../app/js/world/vegetation.js?v=10';
import {ctx} from '../app/js/shared-context.js?v=55';
import {retainTreeRowNodes} from '../app/js/world/vegetation-source-nodes.js';

test('compilation node retirement preserves exact seeded tree-row placements and later refreshes',()=>{
 const saved={...ctx};
 try {
  const nodes=Object.fromEntries(Array.from({length:3000},(_,i)=>[i,{id:i,lat:i,lon:30}]));
  const rows=[{id:42,nodes:[10,11,12,12,13,14,15]},{id:43,nodes:[900,910,920,9999]}];
  Object.assign(ctx,{worldSeed:3,osmTreeNodes:[],osmTreeRows:rows,_worldLoadNodes:nodes,landuses:[],waterAreas:[],waterways:[],
   geoToWorld:(lat,lon)=>({x:lat,z:lon}),rand01FromInt:n=>(n>>>0)%1000/1000,baseTerrainHeightAt:()=>0,
   streetPavement:{sampleAt:()=>NaN},terrainGroup:{children:[]}});
  initWorldVegetation({getNearbyBuildings:()=>[],findNearestRoad:()=>null,isRoadSurfaceReachable:()=>false});
  const expected=collectWorldVegetationPlacements();assert.ok(expected.length>0);
  ctx._worldLoadNodes=retainTreeRowNodes(nodes,rows);
  assert.equal(Object.keys(ctx._worldLoadNodes).length,9);assert.equal(ctx._worldLoadNodes[10],nodes[10]);
  assert.deepEqual(collectWorldVegetationPlacements(),expected);
  ctx.worldSeed=14;const refreshed=collectWorldVegetationPlacements();
  ctx._worldLoadNodes=nodes;assert.deepEqual(collectWorldVegetationPlacements(),refreshed);
  assert.deepEqual(Object.keys(retainTreeRowNodes(nodes,[])),[]);
  assert.equal(Object.keys(nodes).length,3000,'Compilation input remains intact');
 }finally{Object.assign(ctx,saved);}
});

test('scheduled vegetation preserves seeded placement order and exclusions',async()=>{
 Object.assign(ctx,{worldSeed:3,osmTreeNodes:Array.from({length:100},(_,id)=>({id,lat:100+id,lon:30})),osmTreeRows:[],landuses:[],geoToWorld:(lat,lon)=>({x:lat,z:lon}),rand01FromInt:n=>(n>>>0)%1000/1000,baseTerrainHeightAt:()=>0,streetPavement:{sampleAt:(x)=>x%7===0?0:NaN},terrainGroup:{children:[]}});
 initWorldVegetation({getNearbyBuildings:()=>[],findNearestRoad:()=>null,isRoadSurfaceReachable:()=>false});
 const expected=collectWorldVegetationPlacements();let yields=0;
 const actual=await collectWorldVegetationPlacementsCooperatively({budgetMs:0,yieldWork:async()=>{yields++;}});
 assert.deepEqual(actual,expected);assert.ok(actual.length>50);assert.ok(actual.every(p=>p.x%7!==0));assert.ok(yields>=100);
 let current=true;
 await assert.rejects(collectWorldVegetationPlacementsCooperatively({budgetMs:0,current:()=>current,yieldWork:async()=>{current=false;}}),/superseded/);
});

function fixture(){
 const removed=[],added=[],disposed=[];
 const old={id:'old',parent:{remove:mesh=>removed.push(mesh.id)}};
 const ctx={vegetationMeshes:[old],vegetationFeatures:['old'],addEarthWorldObject:m=>added.push(m.id),replaceWorldCollection(k,v){this[k]=v;}};
 return {ctx,removed,added,disposed,dispose:m=>disposed.push(m.id)};
}
test('vegetation keeps accepted visual and collision publication through preparation',async()=>{
 const f=fixture();let checked=false;
 const result=await publishVegetationCooperatively(f.ctx,{collect:async()=>['new'],render:async(stage,placements)=>{
  stage.vegetationMeshes.push({id:'new'});stage.replaceWorldCollection('vegetationFeatures',placements);
  await Promise.resolve();assert.deepEqual(f.ctx.vegetationFeatures,['old']);assert.deepEqual(f.added,[]);assert.deepEqual(f.removed,[]);checked=true;return 1;
 },dispose:f.dispose});
 assert.equal(result,1);assert.ok(checked);assert.deepEqual(f.ctx.vegetationFeatures,['new']);assert.deepEqual(f.added,['new']);assert.deepEqual(f.removed,['old']);assert.deepEqual(f.disposed,['old']);
});
test('cancelled and failed vegetation replacements dispose staged roots and retain old scene',async()=>{
 for(const fail of [false,true]){
  const f=fixture();let current=true;
  const operation=publishVegetationCooperatively(f.ctx,{current:()=>current,collect:async()=>[],render:async stage=>{stage.vegetationMeshes.push({id:'partial'});if(fail)throw new Error('render failed');current=false;return 0;},dispose:f.dispose});
  if(fail)await assert.rejects(operation,/render failed/);else assert.equal(await operation,null);
  assert.deepEqual(f.ctx.vegetationFeatures,['old']);assert.deepEqual(f.added,[]);assert.deepEqual(f.removed,[]);assert.deepEqual(f.disposed,['partial']);
 }
});
