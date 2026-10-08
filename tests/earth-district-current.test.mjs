import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {maritimeFacilitySupportsVessel,selectMaritimeAnchor} from '../app/js/transport/maritime-placement-policy.js';
import {MARITIME_CATALOG} from '../app/js/transport/maritime-catalog.js';
import {addMuseumSailingRig} from '../app/js/world/museum-sailing-rig.js';
import {buildHarborWalk,HARBOR_WALK} from '../app/js/activity-discovery/harbor-walk.js';
const role=name=>MARITIME_CATALOG.find(c=>c.role===name);
test('a visitor pier cannot authorize every vessel class',()=>{
 const pier={type:'pier',access:'yes'};
 assert.deepEqual(MARITIME_CATALOG.filter(c=>maritimeFacilitySupportsVessel(pier,c)).map(c=>c.role),['runabout','workboat']);
 assert.equal(selectMaritimeAnchor([pier],role('cargo')),null);
 assert.equal(maritimeFacilitySupportsVessel({type:'ferry_terminal'},role('ferry')),true);
 assert.equal(maritimeFacilitySupportsVessel({type:'marina'},role('sailboat')),true);
});
test('large cargo needs mapped port geometry and restricted facilities do not spawn activities',()=>{
 assert.equal(maritimeFacilitySupportsVessel({type:'port'},role('cargo')),false);
 assert.equal(maritimeFacilitySupportsVessel({type:'port',exactPhysicalGeometry:true},role('cargo')),true);
 for(const access of ['private','no','military'])assert.equal(maritimeFacilitySupportsVessel({type:'pier',access},role('workboat')),false);
});
test('museum rig follows a rotated mapped hull, stays bounded and batches rigid pieces',()=>{
 const points=[[-5,-25],[5,-25],[5,25],[-5,25],[-5,-25]].map(([x,z])=>({x:100+(x-z)/Math.sqrt(2),z:200+(x+z)/Math.sqrt(2)}));
 const root=new THREE.Group(),rig=addMuseumSailingRig(THREE,root,{points,centerX:100,centerZ:200,deckY:2});
 assert.equal(rig.userData.mastCount,3);assert.equal(rig.userData.sourceClaim,'original-interpretive-model');
 assert.ok(rig.children.length<=5);assert.ok(rig.userData.batches.savedDrawCalls>20);
 const box=new THREE.Box3().setFromObject(rig);assert.ok(box.max.y>28&&box.max.y<32);assert.ok(box.min.y>=1.9);
 let triangles=0;rig.traverse(o=>{if(o.isMesh)triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;});assert.ok(triangles<20000);
});
const context=()=>({LOC:{lat:39.2904,lon:-76.6122},SCALE:100000,ENV:{EARTH:'earth'},getEnv:()=> 'earth',initialEarthWorldReady:true,SurfaceQuery:{walkAt:()=>({position:{y:2}})},isPointInsideWaterFootprint:()=>false,checkBuildingCollision:()=>({collision:false})});
test('authored harbor walk uses stable IDs and existing Earth surface heights',()=>{
 const c=context(),walk=buildHarborWalk(c);assert.equal(walk.id,HARBOR_WALK.id);assert.equal(walk.anchors.length,3);assert.equal(walk.traversalMode,'walk');assert.equal(walk.anchors[0].y,2);assert.equal(walk.anchors[0].typeId,'start');assert.equal(walk.anchors[2].typeId,'finish');assert.ok(walk.anchors[1].z>walk.anchors[0].z);
});
test('harbor route is absent outside its loaded district and when any intermediate point is blocked',()=>{
 const c=context();c.LOC={lat:0,lon:0};assert.equal(buildHarborWalk(c),null);
 c.LOC=context().LOC;c.initialEarthWorldReady=false;assert.equal(buildHarborWalk(c),null);
 c.initialEarthWorldReady=true;c.checkBuildingCollision=(x,z)=>({collision:z>490&&z<500});assert.equal(buildHarborWalk(c),null);
 c.checkBuildingCollision=()=>({collision:false});c.isPointInsideWaterFootprint=(x,z)=>z>490&&z<500;assert.equal(buildHarborWalk(c),null);
 c.isPointInsideWaterFootprint=()=>false;c.SurfaceQuery.walkAt=()=>({position:{y:NaN}});assert.equal(buildHarborWalk(c),null);
});
