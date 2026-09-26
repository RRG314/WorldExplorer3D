import test from 'node:test';
import assert from 'node:assert/strict';
import {makeStarterLayout,normalizeLayout,compileLayout,containsRegion,validateRing,floorWalls,assertPlayableLayout,splitRoom,layoutEntrance,pointInRoom,roomRing} from '../functions/interior-layout.mjs';
const envelope={revision:'mapped-v1',footprint:[{x:0,z:0},{x:10,z:0},{x:10,z:12},{x:0,z:12}],heightMeters:6};
test('starter produces connected rooms and shared walls, not duplicate boxes',()=>{
  const layout=makeStarterLayout(envelope),floor=layout.floors[0],compiled=compileLayout(layout);
  assert.equal(floor.rooms.length,3);assert.equal(floorWalls(floor).filter(w=>w.rooms.length===2).length,2);
  assert.equal(compiled.floors.length,3);assert.equal(layout.envelopeRevision,'mapped-v1');
  const door=floor.doors[1],wall=floorWalls(floor).find(w=>w.id===door.wall);
  const x=wall.a.x+(wall.b.x-wall.a.x)*door.offset/Math.hypot(wall.b.x-wall.a.x,wall.b.z-wall.a.z);
  assert.ok(!compiled.solids.some(s=>s.wallId===door.wall&&s.bottom<1&&x>Math.min(s.a.x,s.b.x)&&x<Math.max(s.a.x,s.b.x)));
});
test('complete polygon containment rejects courtyard and concavity crossings',()=>{
  const inner=[{x:1,z:1},{x:9,z:1},{x:9,z:11},{x:1,z:11}];
  assert.equal(containsRegion(envelope.footprint,inner,[[{x:4,z:4},{x:6,z:4},{x:6,z:6},{x:4,z:6}]]),false);
  const concave=[{x:0,z:0},{x:10,z:0},{x:10,z:10},{x:6,z:10},{x:6,z:3},{x:4,z:3},{x:4,z:10},{x:0,z:10}];
  assert.equal(containsRegion(concave,[{x:1,z:1},{x:9,z:1},{x:9,z:9},{x:1,z:9}]),false);
});
test('crossed walls, overlapping rooms, stale door hosts and vertical overflow reject',()=>{
  assert.throws(()=>validateRing([{x:0,z:0},{x:4,z:4},{x:4,z:0},{x:0,z:3}]),/cross/);
  const layout=makeStarterLayout(envelope);layout.floors[0].height=6;assert.throws(()=>normalizeLayout(layout,envelope),/height/);
  const missing=makeStarterLayout(envelope);missing.floors[0].doors[0].wall='missing';assert.throws(()=>normalizeLayout(missing,envelope),/lost its wall/);
  const overlap=makeStarterLayout(envelope);overlap.floors[0].rooms[1].vertices=[...overlap.floors[0].rooms[0].vertices];assert.throws(()=>normalizeLayout(overlap,envelope),/overlaps/);
});
test('renaming does not change geometry or photo surface identity',()=>{
  const layout=makeStarterLayout(envelope),before=compileLayout(layout).surfaces.map(s=>s.id);layout.floors[0].rooms[0].label='Kitchen';
  assert.deepEqual(compileLayout(normalizeLayout(layout,envelope)).surfaces.map(s=>s.id),before);
});
test('straight stair removes upper floor and lower ceiling and has matching rise',()=>{
  const layout=makeStarterLayout(envelope,{bedrooms:0,bathrooms:0,floorCount:2});
  layout.stairs=[{id:'stairs_1',from:'floor_0',to:'floor_1',width:1,path:[{x:2,z:3},{x:2,z:8}]}];
  const compiled=compileLayout(normalizeLayout(layout,envelope));
  assert.equal(compiled.ramps.length,1);assert.equal(compiled.ramps[0].y1,layout.floors[1].elevation);
  assert.equal(compiled.floors.find(f=>f.floorId==='floor_1').polygons[0].length,2);
  assert.equal(compiled.surfaces.find(s=>s.id==='room_0_0:ceiling').polygons[0].length,2);
});
test('two-storey starter has a connected hall, stairs and room routes',()=>{
  const layout=makeStarterLayout(envelope,{floorCount:2});assert.equal(assertPlayableLayout(layout),true);assert.equal(layout.stairs.length,1);
  const hall=layout.floors[1].rooms.find(r=>r.type==='hall');assert.ok(hall);
  const right=layout.floors[1].vertices.l0.x,stair=layout.stairs[0];assert.ok(right-stair.path[0].x-stair.width/2>=1,'upper hall needs a walkable route beside stairs');
});
test('L and U stairs have flat full-width landings and reject shallow turns',()=>{
  for(const path of [[{x:2,z:2},{x:2,z:7},{x:7,z:7}],[{x:2,z:2},{x:2,z:7},{x:4,z:7},{x:4,z:2}]]){
    const layout=makeStarterLayout(envelope,{bedrooms:0,bathrooms:0,floorCount:2});layout.stairs=[{id:'turn',from:'floor_0',to:'floor_1',width:1,path}];const compiled=compileLayout(normalizeLayout(layout,envelope));assert.equal(compiled.surfaces.filter(s=>s.id.includes('landing')).length,path.length-2);assert.equal(assertPlayableLayout(layout),true);
  }
});
test('a declared unit stays within the building without changing canonical footprint',()=>{
  const unitOutline=[{x:.1,z:.1},{x:5,z:.1},{x:5,z:11.9},{x:.1,z:11.9}],layout=makeStarterLayout(envelope,{unitOutline});assert.deepEqual(layout.unitOutline,unitOutline);
  layout.unitOutline[0].x=-1;assert.throws(()=>normalizeLayout(layout,envelope),/boundary/);
});
test('dividing a room joins adjacent wall vertices and preserves existing door routes',()=>{
  const layout=makeStarterLayout(envelope),floor=layout.floors[0],oldDoors=floor.doors.map(d=>d.id);splitRoom(floor,floor.rooms[0].id,'x',3);
  assert.equal(assertPlayableLayout(normalizeLayout(layout,envelope)),true);assert.equal(floor.rooms.length,4);assert.ok(oldDoors.every(id=>floor.doors.some(d=>d.id===id)));
  assert.throws(()=>splitRoom(floor,floor.rooms[0].id,'x',-1),/divide/);
});
test('starter follows a rotated mapped building instead of imposing a north-aligned rectangle',()=>{
  const angle=.63,footprint=envelope.footprint.map(p=>({x:p.x*Math.cos(angle)-p.z*Math.sin(angle),z:p.x*Math.sin(angle)+p.z*Math.cos(angle)}));
  const layout=makeStarterLayout({...envelope,footprint},{floorCount:2});assert.equal(assertPlayableLayout(layout),true);assert.equal(layout.floors.length,2);
});

test('entrance resolves the marked wall and faces inward regardless of room order or winding',()=>{
  for(const reverse of [false,true]){
    const layout=makeStarterLayout(envelope),floor=layout.floors[0],room=floor.rooms[1];
    floor.doors.forEach(d=>d.entry=false);
    const wall=floorWalls(floor).find(w=>w.rooms.length===1&&w.rooms.includes(room.id));
    floor.doors.push({id:'chosen_entry',wall:wall.id,offset:Math.hypot(wall.b.x-wall.a.x,wall.b.z-wall.a.z)/2,width:.9,height:2.05,entry:true});
    if(reverse)room.vertices.reverse();
    const e=layoutEntrance(layout);assert.equal(e.room.id,room.id);assert.equal(e.door.id,'chosen_entry');
    assert.ok(pointInRoom({x:e.point.x+e.inward.x*.65,z:e.point.z+e.inward.z*.65},roomRing(floor,room)));
  }
});
