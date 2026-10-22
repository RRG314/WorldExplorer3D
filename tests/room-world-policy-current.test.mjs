import test from 'node:test';import assert from 'node:assert/strict';
import {leavesRoomForEarthLocation,roomPoseReady} from '../app/js/multiplayer/room-world-policy.js';
const room={world:{kind:'earth',lat:39.29,lon:-76.61}},pose={frame:{kind:'earth',locLat:39.29,locLon:-76.61},pose:{x:2,z:3}};
test('nearby residency within the same origin keeps the room; another Earth location leaves',()=>{
 assert.equal(leavesRoomForEarthLocation(room,{lat:39.29,lon:-76.61}),false);assert.equal(leavesRoomForEarthLocation(room,{lat:48.85,lon:2.35}),true);assert.equal(leavesRoomForEarthLocation(null,{lat:0,lon:0}),false);
 assert.equal(leavesRoomForEarthLocation({world:{kind:'moon'}},{lat:39.29,lon:-76.61}),true);
});
test('unfinished or wrong Earth frames withhold poses; ready matching origins publish',()=>{
 assert.equal(roomPoseReady(room,pose,{playing:true,loading:false}),true);
 assert.equal(roomPoseReady(room,pose,{playing:false}),false);assert.equal(roomPoseReady(room,pose,{playing:true,loading:true}),false);
 assert.equal(roomPoseReady(room,{...pose,frame:{...pose.frame,locLat:48.85}},{playing:true}),false);
});
test('interior metadata and established marine/space activity frames retain their own contracts',()=>{
 for(const frame of [{...pose.frame,interiorKey:'building-1',interiorFloorId:'floor2'},{kind:'ocean',locLat:39.29,locLon:-76.61},{kind:'space',locLat:0,locLon:0}])assert.equal(roomPoseReady(room,{...pose,frame},{playing:true}),true);
});
