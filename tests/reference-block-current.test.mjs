import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { referenceBlockPlan, publishReferenceBlockDressing } from '../app/js/world/reference-block-dressing.js';
import { collectWorldVegetationPlacements, initWorldVegetation } from '../app/js/world/vegetation.js';
import { ctx } from '../app/js/shared-context.js?v=55';

function context() {
  return {
    LOC: { lat: 39.28945, lon: -76.61225 }, SCALE: 100000,
    roads: [{ type: 'residential', width: 8, pts: [{x:-95,z:30},{x:95,z:30}] }],
    streetPavement: { sampleAt: (x,z) => Math.abs(z-30)>4 && Math.abs(z-30)<8.5 ? 2+x*.001 : NaN },
    roadContactIndex: { sampleAt: (_x,z) => Math.abs(z-30)<=4 ? 2 : NaN },
    isPointInsideWaterFootprint: () => false,
    checkBuildingCollision: () => ({ collision: false }),
    streetFurnitureMeshes: [], dynamicBuildingColliders: [],
    buildingEntranceByBuilding: new Map(), scene: new THREE.Scene(),
    addEarthWorldObject(object) { this.scene.add(object); },
    scheduleWorldCoverVegetationRefresh() { this.refreshes=(this.refreshes||0)+1; }
  };
}

test('reference dressing fits actual paving, reserves walk space and remains bounded', () => {
  const c=context(), plan=referenceBlockPlan(c);
  assert.ok(plan.length>=5 && plan.length<=10);
  assert.deepEqual(referenceBlockPlan(c),plan);
  for (const p of plan) {
    assert.equal(p.y,c.streetPavement.sampleAt(p.x,p.z));
    assert.ok(Math.hypot(p.x,p.z)<=105);
    // The bench back points away from the road on either side.
    assert.ok(Math.cos(p.yaw)*(p.z-30)>0);
    for (const q of plan) if(q!==p) assert.ok(Math.hypot(p.x-q.x,p.z-q.z)>=16);
  }
  const selected=plan[0];
  c.buildingEntranceByBuilding.set('door',{x:selected.x,z:selected.z});
  assert.ok(referenceBlockPlan(c).every(p=>Math.hypot(p.x-selected.x,p.z-selected.z)>=4));
});

test('unsupported, obstructed, steep, remote and grade-separated sites produce no furniture', () => {
  const variants=[
    {LOC:{lat:0,lon:0}}, {streetPavement:{sampleAt:()=>NaN}},
    {streetPavement:{sampleAt:x=>x}}, {isPointInsideWaterFootprint:()=>true},
    {roadContactIndex:{sampleAt:()=>0}}, {checkBuildingCollision:()=>({collision:true})},
    {roads:[{...context().roads[0],bridge:true}]},
    // Centers alone fit, but their full footprints have no support.
    {streetPavement:{sampleAt:(_x,z)=>Math.abs(Math.abs(z-30)-7.1)<.1?2:NaN}}
  ];
  for(const change of variants) assert.deepEqual(referenceBlockPlan({...context(),...change}),[]);
});

test('publication adds one owned root, four batches and one collider per fixture, only once', () => {
  const previous=globalThis.THREE;globalThis.THREE=THREE;
  try {
    const c=context(), result=publishReferenceBlockDressing(c,{THREE});
    assert.equal(result.drawCalls,4);assert.ok(result.fixtures<=10);
    assert.equal(c.streetFurnitureMeshes.length,1);
    assert.equal(c.dynamicBuildingColliders.length,result.fixtures);
    assert.equal(c.refreshes,1);
    const root=c.streetFurnitureMeshes[0];
    assert.equal(root.parent,c.scene);assert.equal(root.userData.sourceClaim,'authored-game-dressing');
    for(const mesh of root.children) {
      assert.ok(mesh.isInstancedMesh);assert.ok(mesh.count>0);
      assert.ok([...mesh.instanceMatrix.array].every(Number.isFinite));
    }
    assert.equal(publishReferenceBlockDressing(c,{THREE}),null);
    assert.equal(c.dynamicBuildingColliders.length,result.fixtures);
    const geometries=new Set(root.children.map(m=>m.geometry));
    assert.equal(geometries.size,1);
    for(const g of geometries)g.dispose();
    for(const mesh of root.children){mesh.dispose?.();mesh.material.dispose();}
    c.scene.remove(root);
    assert.equal(c.scene.children.length,0);
  } finally {globalThis.THREE=previous;}
});

test('planter trees accept their own support but still reject other buildings and traffic', () => {
  const saved={...ctx};
  try {
    const fixture={x:40,y:2,z:30,kind:'planter',yaw:0};
    const collider={minX:39,maxX:41,minZ:29,maxZ:31,sourceBuildingId:'authored-calvert-street-fixture'};
    Object.assign(ctx,{worldSeed:3,osmTreeNodes:[],osmTreeRows:[],landuses:[],waterAreas:[],waterways:[],
      streetFurnitureMeshes:[{userData:{referenceBlock:true,plan:[fixture]}}],harborDistrictPlanting:[],
      baseTerrainHeightAt:()=>2,terrainGroup:{children:[]},streetPavement:{sampleAt:()=>2}});
    initWorldVegetation({getNearbyBuildings:()=>[collider],findNearestRoad:()=>null,isRoadSurfaceReachable:()=>false});
    const placed=()=>collectWorldVegetationPlacements().filter(p=>p.source==='authored-reference-block');
    assert.equal(placed().length,1,'A planter must not reject its own tree');
    collider.sourceBuildingId='ordinary-building';assert.equal(placed().length,0);
    collider.sourceBuildingId='authored-calvert-street-fixture';
    initWorldVegetation({isRoadSurfaceReachable:()=>true});assert.equal(placed().length,0);
  } finally {Object.assign(ctx,saved);}
});

test('seating lamps use the existing registry, retain walk clearance and do not duplicate', () => {
  const previous=globalThis.THREE;globalThis.THREE=THREE;
  try {
    const c=context(), registered=[];
    c.streetLampHeadMaterial=new THREE.MeshStandardMaterial();
    const registerLamp=(group,head)=>registered.push({group,head});
    const result=publishReferenceBlockDressing(c,{THREE,registerLamp});
    assert.equal(result.lamps,3);assert.equal(result.drawCalls,7);
    assert.equal(registered.length,3);
    assert.equal(c.dynamicBuildingColliders.length,result.fixtures+3);
    for(const {group,head} of registered){
      assert.equal(group.parent,c.scene);assert.equal(head.material,c.streetLampHeadMaterial);
      assert.ok(Number.isFinite(c.streetPavement.sampleAt(group.position.x,group.position.z)));
      assert.equal(group.userData.furnitureKind,'street_lamp');
    }
    publishReferenceBlockDressing(c,{THREE,registerLamp});assert.equal(registered.length,3);
    const resources=new Set();c.scene.traverse(o=>{if(o.geometry)resources.add(o.geometry);if(o.material)resources.add(o.material);});
    for(const resource of resources)resource.dispose();c.scene.clear();
  } finally {globalThis.THREE=previous;}
});
