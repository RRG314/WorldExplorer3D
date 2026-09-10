import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeStarterLayout,normalizeLayout,roomRing,floorWalls,assertPlayableLayout} from '../functions/interior-layout.mjs';
import {drawRectangleRoom,nearestPlanWall,snapPlanPoint} from '../app/js/reality-capture/layout-drawing.js';
const envelope={footprint:[{x:0,z:0},{x:10,z:0},{x:10,z:12},{x:0,z:12}],heightMeters:6};
test('rectangle drawing partitions existing space with shared walls and reachable doorways',()=>{
  let layout=makeStarterLayout(envelope,{bedrooms:0,bathrooms:0});
  const id=drawRectangleRoom(layout.floors[0],layout.floors[0].rooms[0].id,{x:2,z:2},{x:6,z:7});
  layout=normalizeLayout(layout,envelope);assertPlayableLayout(layout);
  assert.equal(layout.floors[0].rooms.length,5);
  const ring=roomRing(layout.floors[0],layout.floors[0].rooms.find(r=>r.id===id));
  assert.equal(Math.min(...ring.map(p=>p.x)),2);assert.equal(Math.max(...ring.map(p=>p.z)),7);
});
test('drawing outside existing space is rejected before modifying it',()=>{
  const layout=makeStarterLayout(envelope,{bedrooms:0,bathrooms:0}),before=JSON.stringify(layout);
  assert.throws(()=>drawRectangleRoom(layout.floors[0],layout.floors[0].rooms[0].id,{x:-2,z:2},{x:6,z:7}),/within one/);
  assert.equal(JSON.stringify(layout),before);
});
test('pointer snapping and nearest-wall placement use metres in the canonical plan',()=>{
  assert.deepEqual(snapPlanPoint({x:2.13,z:3.08}),{x:2.1,z:3.1});
  const layout=makeStarterLayout(envelope,{bedrooms:0,bathrooms:0});
  const hit=nearestPlanWall(floorWalls(layout.floors[0]),{x:2,z:.25});
  assert.ok(hit.distance<.1);assert.ok(hit.offset>1);
});
