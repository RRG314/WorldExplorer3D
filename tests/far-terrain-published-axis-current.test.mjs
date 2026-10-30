import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createFarFieldGeometryPlanner,sampleFarFieldGridWorldY} from '../app/js/terrain/far-field-geometry.js';

test('a refined far grid retains its rendered Float32 axes at a detailed boundary without a microscopic coarse-height strip',async t=>{
 const prior=globalThis.THREE;globalThis.THREE=THREE;t.after(()=>globalThis.THREE=prior);
 const edge=2251.4792547428133,published=Math.fround(edge),bounds={minX:2230,maxX:published,minZ:-10,maxZ:10},nearGeometry=new THREE.PlaneGeometry(1,1,2,2),p=nearGeometry.attributes.position;
 for(let row=0;row<3;row++)for(let col=0;col<3;col++)p.setXYZ(row*3+col,bounds.minX+(bounds.maxX-bounds.minX)*col/2,10,-10+row*10);
 const near=new THREE.Mesh(nearGeometry);near.userData.isTerrainMesh=true;
 const venue={id:'controlled',sourceSha256:'a'.repeat(64),sourceFeatureIds:['controlled']},road={sourceFeatureId:'controlled',width:8,pts:[{x:edge-4,z:-20},{x:edge+4,z:20}],structureSemantics:{terrainMode:'at_grade'},surfaceSurveyEvidence:{venueSource:venue},transportSurfaceModel:{surveyedSurface:{venueSource:venue},reviewedSurfacePhase:'accepted'}},ctx={_worldLoadSequence:1,worldLoadRuntimeState:{sequence:1,venuePack:{venueSource:venue}},roads:[road],terrainGroup:{children:[near]},WORLD_UNITS_PER_METER:1,TERRAIN_Y_EXAGGERATION:1},planner=createFarFieldGeometryPlanner({appCtx:ctx,farFieldGridIntervalMeters:20,farFieldGapFillIntervalMeters:20,worldToLatLon:(x,z)=>({lat:z,lon:x}),sampleAcceptedGroundAtLatLon:()=>({status:'available',groundElevationMeters:12}),latLonToTileXY:()=>({x:0,y:0}),terrainTileDeps:{applyStructureTerrainCuts:()=>10,resolveWaterTerrainY:(x,z,y)=>y}}),built=await planner.buildFarFieldGeometry({outer:{minX:2200,maxX:2300,minZ:-40,maxZ:40},inner:{...bounds,maxX:edge},detailedCoverage:[bounds]},new Map(),0,{contextZoom:0,waterAreas:[]}),mesh=new THREE.Mesh(built.geometry);
 try{await built.refineReviewedCorridors(mesh);
  for(const values of[built.surfaceGrid.xValues,built.surfaceGrid.zValues])assert.ok(values.every(v=>v===Math.fround(v)),'query axes must be the same values as published vertices');
  for(const dx of[1e-9,1e-7,.00001,.0001,.001])assert.ok(Math.abs(sampleFarFieldGridWorldY(published+dx,0,built.surfaceGrid)-10)<.0001,`a coarse strip remains at ${dx}`);
 }finally{mesh.geometry.dispose();mesh.material.dispose();near.geometry.dispose();near.material.dispose();}
});
