import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {VAB_ID,VAB_NORTH,prepareKennedyBuildingWays,vabFrame} from '../app/js/world/kennedy-facility.js';
import {resolveKennedyInterior} from '../app/js/interiors/kennedy-content.js';
import {buildKennedyInterior} from '../app/js/interiors/kennedy-scene.js';
import {disposeLandmarkModel} from '../app/js/world/landmark-lifetime.js';
import {publishLaunchPad} from '../app/js/world/launch-pad-visual.js';
import {sampleFacilitySurface,facilitySurfaceFor} from '../app/js/world/facility-surface-owner.js';
import {createBuildingRoadFootprintGuards} from '../app/js/world/building-road-footprint.js?v=8';
const ctx={METERS_PER_WORLD_UNIT:1,geoToWorld:(lat,lon)=>({x:(lon-VAB_NORTH.lon)*97800,z:(VAB_NORTH.lat-lat)*111300})};
test('reviewed VAB footprint is bounded to its district and cannot claim other buildings',()=>{
 const ways=[{id:'neighbor',nodes:[1,2,3],tags:{building:'yes'}}],nodes={1:{lat:28.59,lon:-80.65},2:{lat:28.5901,lon:-80.65},3:{lat:28.59,lon:-80.651}};
 const near=prepareKennedyBuildingWays(ctx,ways,nodes,3200);assert.equal(near.ways.length,2);assert.equal(near.ways[0],ways[0]);assert.equal(near.ways[1].tags._sourceFeatureId,VAB_ID);assert.equal(Object.keys(nodes).length,3);
 const far=prepareKennedyBuildingWays({...ctx,geoToWorld:()=>({x:10000,z:10000})},ways,nodes,3200);assert.equal(far.ways,ways);
 const def={support:{building:{sourceBuildingId:VAB_ID}}};assert.ok(resolveKennedyInterior(def.support,def).facilityContent);assert.equal(resolveKennedyInterior({building:{name:'Vehicle Assembly Building'}},def),def);assert.equal(resolveKennedyInterior(def.support,{...def,accessDenied:true}).facilityContent,undefined);
});
test('indoor service aisle preserves a reviewed facility without weakening ordinary road conflicts',async()=>{
 const road={pts:[{x:0,z:-20},{x:0,z:20}],width:6,type:'service',driveable:true};
 const g=await createBuildingRoadFootprintGuards({roads:[road],yieldToMainThread:async()=>{}}),pts=[{x:-10,z:-10},{x:10,z:-10},{x:10,z:10},{x:-10,z:10}];
 assert.equal(g.resolveFootprintTransportAuthority(pts).action,'suppress_building');assert.equal(g.resolveFootprintTransportAuthority(pts,{enclosedFacilityAccess:true}).action,'enclosed_access_preserved');assert.equal(road.driveable,true);
});
test('launch pad ramp, plateau and trench share rendered triangle support and retire with the site',()=>{
 const scene=new THREE.Scene(),c={METERS_PER_WORLD_UNIT:1,_worldLoadSequence:1,geoToWorld:(lat,lon)=>({x:(lon+80.62085)*97800,z:(28.62725-lat)*111300}),terrainMeshHeightAt:()=>2,worldLoadRuntimeState:{buildingVisibleRadiusWorld:2700},buildingMeshes:[],dynamicBuildingColliders:[],addEarthWorldObject:o=>scene.add(o)};
 const root=publishLaunchPad(c,THREE),sample=(lat,lon=-80.62085)=>{const p=c.geoToWorld(lat,lon);return sampleFacilitySurface(c,p.x,p.z)?.y;};
 assert.ok(sample(28.62374)<2.2);assert.ok(sample(28.626)>10);assert.ok(Math.abs(sample(28.6273)-15.015)<.001);assert.ok(Math.abs(sample(28.6282)-2.2)<.001);
 assert.equal(root.userData.modelCount,3);assert.equal(facilitySurfaceFor(c).cuts.length,1);
 assert.equal(publishLaunchPad(c,THREE),null);assert.equal(sampleFacilitySurface(c,5000,5000),null);
 disposeLandmarkModel(root);assert.equal(facilitySurfaceFor(c),null);assert.equal(sample(28.6273),undefined);
});
test('VAB ground tour uses one contained floor, clear entrance, reachable stations and bounded geometry',()=>{
 globalThis.document={createElement:()=>({getContext:()=>({fillRect(){},fillText(){}})})};
 const state=buildKennedyInterior(THREE,ctx,{support:{building:{baseY:2}}}),f=vabFrame(ctx);
 assert.equal(state.floorPlan.floorCount,1);assert.equal(state.floorPlan.floors[0].height,160);assert.equal(state.interactions.length,5);
 const p=f.local(state.entryPoint);assert.ok(Math.abs(p.x)<.001);assert.ok(Math.abs(p.z+64)<.001);
 for(const c of state.dynamicColliders)assert.ok(Number.isFinite(c.height)&&c.pts.length>=4);
 let meshes=0;state.group.traverse(o=>{if(o.isMesh){meshes++;assert.ok(Array.from(o.geometry.attributes.position.array).every(Number.isFinite));}});assert.ok(meshes<20,`Draw count ${meshes}`);
 assert.equal(state.walkSurfaces[0].y,2.06);assert.ok(state.dynamicColliders.some(c=>Math.abs(c.height-7.75)<.01));
 disposeLandmarkModel(state.group);delete globalThis.document;
});

test('launch-pad lattice towers replace only the three inspected generic building identities',async()=>{
 const {prepareLaunchPadBuildingWays}=await import('../app/js/world/launch-pad-facility.js');
 const tower={id:1,tags:{_sourceFeatureId:'overture:ec1d3c52-2eb0-4682-a86d-db17a4cde72d'}},neighbor={id:'utility-building',tags:{building:'yes'}};
 const ways=[tower,neighbor],local={geoToWorld:()=>({x:0,z:0})};
 assert.deepEqual(prepareLaunchPadBuildingWays(local,ways,{},2700),[neighbor]);
 assert.equal(prepareLaunchPadBuildingWays({geoToWorld:()=>({x:5000,z:0})},ways,{},2700),ways,'No off-site coverage removal');
});
