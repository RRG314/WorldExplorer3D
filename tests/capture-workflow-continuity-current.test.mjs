import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateLegacyRoom} from '../app/js/reality-capture/legacy-room.js';
import {captureWorkflow,groupCaptureBuildings} from '../app/js/reality-capture/workflow-presentation.js';
const envelope={footprint:[{x:0,z:0},{x:12,z:0},{x:12,z:12},{x:0,z:12}],heightMeters:6};
test('legacy room wall and floor photos retain identity when opening a home layout',()=>{
  const room={widthMeters:4,lengthMeters:6,heightMeters:2.7};
  const patches=[0,4].map(wall=>({id:`patch${wall}`,photoId:'a'.repeat(32),wall,region:[0,0,1,1],quad:[[0,0],[1,0],[1,1],[0,1]]}));
  const capture={room,hybridPreview:{room,patches}},original=structuredClone(capture),result=migrateLegacyRoom(capture,envelope);
  assert.equal(result.layout.floors[0].rooms.length,1);assert.equal(result.roomPhotos[0].patches.length,2);
  for(const [i,p] of result.roomPhotos[0].patches.entries()){assert.equal(p.photoId,patches[i].photoId);assert.deepEqual(p.quad,patches[i].quad);assert.ok(p.surfaceId);}
  assert.deepEqual(capture,original);
  assert.throws(()=>migrateLegacyRoom(capture,{...envelope,heightMeters:2}),/height|envelope|outside|floor/i);
});
test('review state is not confused with an older approved version and sharing remains explicit',()=>{
  const capture={captureKind:'interior_room',status:'approved',hybridPreview:{revision:3},hybridSubmission:{revision:2,status:'approved'}};
  assert.equal(captureWorkflow(capture).title,'Draft changes');assert.equal(captureWorkflow(capture).privacy,'Private interior');
  const rejected=captureWorkflow({...capture,hybridPreview:{revision:2},hybridSubmission:{revision:2,status:'rejected'},review:{note:'Correct the front wall'}});
  assert.equal(rejected.title,'Changes requested');assert.equal(rejected.note,'Correct the front wall');
});
test('building grouping never groups by label alone or merges different worlds',()=>{
  const b={worldId:'earth',sourceBuildingId:'osm:way:1',label:'Home'};
  const groups=groupCaptureBuildings([{building:b,captureKind:'exterior'},{building:b,captureKind:'interior_room'},{building:{...b,worldId:'other'}}]);
  assert.equal(groups.length,2);assert.equal(groups[0].captures.length,2);
});
