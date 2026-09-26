import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeStarterLayout,makeEmptyLayout,normalizeLayout,roomRing,floorWalls,assertPlayableLayout} from '../functions/interior-layout.mjs';
import {drawRectangleRoom,nearestPlanWall,snapPlanPoint} from '../app/js/reality-capture/layout-drawing.js';
const envelope={footprint:[{x:0,z:0},{x:10,z:0},{x:10,z:12},{x:0,z:12}],heightMeters:6};
test('drawing one known room leaves unknown space empty and never invents doors',()=>{
  let layout=makeEmptyLayout(envelope);const floor=layout.floors[0];
  const id=drawRectangleRoom(floor,null,{x:2,z:2},{x:6,z:7});
  layout=normalizeLayout(layout,envelope);
  assert.equal(layout.floors[0].rooms.length,1);assert.equal(layout.floors[0].doors.length,0);
  assert.throws(()=>assertPlayableLayout(layout),/entrance/);
  assert.equal(roomRing(layout.floors[0],layout.floors[0].rooms[0])[0].x,2);
  assert.equal(layout.floors[0].rooms[0].id,id);
});
test('irregular and courtyard envelopes open empty drafts without fabricating a starter',()=>{
  for(const target of [{...envelope,footprint:[{x:0,z:0},{x:10,z:0},{x:10,z:4},{x:4,z:4},{x:4,z:12},{x:0,z:12}]},{...envelope,holes:[[{x:4,z:4},{x:6,z:4},{x:6,z:8},{x:4,z:8}]]}]){
    const layout=makeEmptyLayout(target);assert.equal(layout.floors[0].rooms.length,0);
    drawRectangleRoom(layout.floors[0],null,{x:1,z:1},{x:3,z:3});assert.doesNotThrow(()=>normalizeLayout(layout,target));
    drawRectangleRoom(layout.floors[0],null,{x:2,z:2},{x:8,z:10});assert.throws(()=>normalizeLayout(layout,target));
  }
});
test('adding a neighboring room keeps existing room identity and creates a shared wall',()=>{
  const layout=makeEmptyLayout(envelope),f=layout.floors[0];
  const a=drawRectangleRoom(f,null,{x:1,z:1},{x:4,z:5});
  drawRectangleRoom(f,null,{x:4,z:1},{x:8,z:5});
  normalizeLayout(layout,envelope);assert.equal(f.rooms[0].id,a);assert.equal(f.rooms.length,2);
  assert.equal(floorWalls(f).filter(w=>w.rooms.length===2).length,1);assert.equal(f.doors.length,0);
});
test('pointer snapping and nearest-wall placement use metres in the canonical plan',()=>{
  assert.deepEqual(snapPlanPoint({x:2.13,z:3.08}),{x:2.1,z:3.1});
  const layout=makeStarterLayout(envelope,{bedrooms:0,bathrooms:0});
  const hit=nearestPlanWall(floorWalls(layout.floors[0]),{x:2,z:.25});
  assert.ok(hit.distance<.1);assert.ok(hit.offset>1);
});

test('adding an adjacent room preserves an existing doorway across split wall segments',()=>{
 const envelope={footprint:[{x:0,z:0},{x:12,z:0},{x:12,z:12},{x:0,z:12}],heightMeters:6};const layout=makeEmptyLayout(envelope),f=layout.floors[0];
 drawRectangleRoom(f,null,{x:1,z:1},{x:6,z:10});const wall=floorWalls(f).find(w=>w.a.x===6&&w.b.x===6);f.doors.push({id:'entry',wall:wall.id,offset:2,width:.9,height:2,entry:true});
 drawRectangleRoom(f,null,{x:6,z:6},{x:10,z:10});const valid=normalizeLayout(layout,envelope);assert.equal(valid.floors[0].doors.length,1);assert.equal(valid.floors[0].doors[0].id,'entry');assert.equal(valid.floors[0].doors[0].entry,true);
});

test('inside preview faces along a long room and keeps eye height below low ceilings',async()=>{
 const {interiorPreviewPose}=await import('../app/js/reality-capture/interior-preview-pose.js');
 for(const angle of [0,.71]){
  const c=Math.cos(angle),s=Math.sin(angle);
  const ring=[[0,0],[20,0],[20,3],[0,3]].map(([x,z])=>({x:c*x-s*z,z:s*x+c*z}));
  const pose=interiorPreviewPose(ring,8,1.9);
  assert.ok(Math.abs(pose.direction.x*c+pose.direction.z*s)>.95,'Initial view follows the long axis rather than the close wall');
  assert.ok(pose.position.y>8&&pose.position.y<9.9);
 }
});
test('inside preview stays in concave room space and rejects unwalkably narrow rooms',async()=>{
 const {interiorPreviewPose}=await import('../app/js/reality-capture/interior-preview-pose.js');
 const {pointInRoom}=await import('../functions/interior-layout.mjs');
 const ring=[[0,0],[10,0],[10,2],[2,2],[2,10],[0,10]].map(([x,z])=>({x,z}));
 const pose=interiorPreviewPose(ring);
 for(let d=0;d<5;d+=.1)assert.ok(pointInRoom({x:pose.position.x+pose.direction.x*d,z:pose.position.z+pose.direction.z*d},ring));
 assert.equal(interiorPreviewPose([{x:0,z:0},{x:10,z:0},{x:10,z:.4},{x:0,z:.4}]),null);
});
