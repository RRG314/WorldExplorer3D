import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeManualRoom,manualRoomFootprint,manualRoomSurfacePoint,manualRoomSurfaceSize} from '../functions/capture-room-geometry.mjs';
const room={widthMeters:4,lengthMeters:6,heightMeters:2.7};
test('room dimensions remain local and cover six surfaces',()=>{
  const before=structuredClone(room);
  assert.equal(manualRoomFootprint(room).length,4);
  assert.deepEqual(manualRoomSurfaceSize(room,0),[4,2.7]);
  assert.deepEqual(manualRoomSurfaceSize(room,1),[6,2.7]);
  assert.deepEqual(manualRoomSurfaceSize(room,4),[4,6]);
  assert.deepEqual(manualRoomSurfacePoint(room,4,.5,.5),[0,0,0]);
  assert.deepEqual(manualRoomSurfacePoint(room,5,.5,.5),[0,2.7,0]);
  assert.deepEqual(room,before);
});
test('invalid dimensions and surface coordinates are rejected',()=>{
  for(const widthMeters of [NaN,Infinity,0,81,'4']) assert.throws(()=>normalizeManualRoom({...room,widthMeters}));
  for(const surface of [-1,6,.5]) assert.throws(()=>manualRoomSurfaceSize(room,surface));
  for(const u of [-.1,1.1,NaN]) assert.throws(()=>manualRoomSurfacePoint(room,0,u,.5));
});
test('wall endpoints join without gaps',()=>{
  for(let wall=0;wall<4;wall++) for(const v of [0,1])
    assert.deepEqual(manualRoomSurfacePoint(room,wall,1,v),manualRoomSurfacePoint(room,(wall+1)%4,0,v));
});
