import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {harborDistrictPlan,publishHarborDistrict} from '../app/js/world/harbor-district.js';
const context=()=>({LOC:{lat:39.2904,lon:-76.6122},SCALE:100000,terrainMeshHeightAt:(x,z)=>2+x*.001+z*.0001,isPointInsideWaterFootprint:()=>false,checkBuildingCollision:()=>({collision:false}),findNearestRoad:()=>null});
test('district plan is bounded, follows numeric ground and keeps props outside its walk lane',()=>{
 const c=context(),p=harborDistrictPlan(c);assert.ok(p.tiles.length>500&&p.tiles.length<=600);assert.equal(p.benches.length,6);assert.equal(p.lamps.length,6);assert.equal(p.trees.length,6);
 for(const corners of p.tiles)for(const point of corners)assert.equal(point.y,c.terrainMeshHeightAt(point.x,point.z));
 for(const point of p.benches)assert.ok(Math.hypot(point.x-point.target.x,point.z-point.target.z)>5);
 assert.equal(p.sourceClaim,'authored-game-dressing');
});
test('unknown ground, water, buildings, traffic lanes and other regions cannot receive district paving',()=>{
 for(const change of [{LOC:{lat:0,lon:0}},{terrainMeshHeightAt:()=>NaN},{isPointInsideWaterFootprint:()=>true},{checkBuildingCollision:()=>({collision:true})},{findNearestRoad:()=>({road:{width:8},dist:1})}])assert.equal(harborDistrictPlan({...context(),...change}),null);
});
test('publication owns its resources and colliders once per world and uses the existing lamp registry',()=>{
 const old=globalThis.document;globalThis.document={createElement:()=>({getContext:()=>({fillRect(){}})})};
 try{
 const c={...context(),_worldLoadSequence:7,streetFurnitureMeshes:[],dynamicBuildingColliders:[],streetLampHeadMaterial:new THREE.MeshStandardMaterial(),scene:new THREE.Scene(),addEarthWorldObject(o){this.scene.add(o)},scheduleWorldCoverVegetationRefresh(){this.refreshes=(this.refreshes||0)+1}};
 const lamps=[];publishHarborDistrict(c,{THREE,registerLamp:(g,h,t)=>lamps.push({g,h,t})});
 assert.equal(c.streetFurnitureMeshes.length,7);assert.equal(c.dynamicBuildingColliders.length,6);assert.equal(lamps.length,6);assert.equal(c.harborDistrictPlanting.length,6);assert.equal(c.refreshes,1);
 const pavement=c.streetFurnitureMeshes[0].children[0].geometry;
 for(let i=0;i<pavement.attributes.normal.count;i++)assert.ok(pavement.attributes.normal.getY(i)>.99);
 assert.equal(c.streetFurnitureMeshes[0].children.length,3);
 publishHarborDistrict(c,{THREE,registerLamp:()=>assert.fail('duplicate lamps')});assert.equal(c.streetFurnitureMeshes.length,7);assert.equal(c.dynamicBuildingColliders.length,6);
 const materials=new Set(),geometries=new Set();c.scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material)});for(const g of geometries)g.dispose();for(const m of materials){m.map?.dispose();m.dispose()}
 }finally{globalThis.document=old;}
});

test('district entrance focus shares the existing catalogue budget without admitting distant buildings',async()=>{
 const {compileEntranceCatalog}=await import('../app/js/living-world/entrance-catalog.js');
 const building=(id,x,z)=>({sourceBuildingId:id,buildingType:'retail',height:10,baseY:0,pts:[{x:x-10,z:z-10},{x:x+10,z:z-10},{x:x+10,z:z+10},{x:x-10,z:z+10}]});
 const buildings=[building('origin',0,0),building('harbor',0,650),building('remote',0,2500)];
 const ordinary=compileEntranceCatalog({buildings,sampleGround:()=>0});assert.deepEqual(ordinary.entrances.map(p=>p.buildingSourceId),['origin']);
 const focused=compileEntranceCatalog({buildings,focus:{x:0,z:650},limit:2,sampleGround:()=>0});assert.equal(focused.entrances.length,2);assert.ok(focused.entrances.some(p=>p.buildingSourceId==='harbor'));
 assert.equal(compileEntranceCatalog({buildings,focus:{x:0,z:650},limit:1,sampleGround:()=>0}).entrances.length,1);
});
