import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {makeStarterLayout,layoutRoomDescriptor} from '../functions/interior-layout.mjs';
import {manualRoomPatchGeometry} from '../functions/capture-room-geometry.mjs';
const require=createRequire(import.meta.url),{footprintSignature,normalizeHybridPreview,encodeHybridPreview,decodeHybridPreview}=require('../functions/reality-capture-hybrid');
const envelope={footprint:[{x:0,z:0},{x:10,z:0},{x:10,z:12},{x:0,z:12}],heightMeters:6};
const photo='a'.repeat(32),capture={captureId:'home-test',ownerUid:'owner',captureKind:'interior_room',room:{widthMeters:4,lengthMeters:6,heightMeters:2.7},consent:{propertyPermissionConfirmed:true},building:{sourceAuthority:'osm',sourceBuildingId:'test',spatialContext:{footprint:envelope.footprint,height:{meters:6}}},inputManifest:[{name:`reality-captures/owner/home-test/originals/${photo}.jpg`,generation:'1'}]};
test('home photos retain stable surfaces across rename, use validated originals and round-trip storage',()=>{
  const layout=makeStarterLayout(envelope),roomId=layout.floors[0].rooms[0].id,descriptor=layoutRoomDescriptor(layout,roomId);
  const input={layout,baseRevision:0,footprintSignature:footprintSignature(capture.building,capture.room),roomPhotos:[{roomId,patches:[{id:'patch1',photoId:photo,surfaceId:descriptor.surfaceIds[0],region:[0,0,1,1],quad:[[0,0],[1,0],[1,1],[0,1]]}]}]};
  const saved=normalizeHybridPreview(capture,input);assert.equal(saved.roomPhotos[0].patches[0].photoGeneration,'1');assert.deepEqual(decodeHybridPreview(encodeHybridPreview(saved)),saved);
  layout.floors[0].rooms[0].label='Renamed';const second=normalizeHybridPreview({...capture,hybridPreview:saved},{...input,baseRevision:1});assert.equal(second.roomPhotos[0].patches[0].surfaceId,descriptor.surfaceIds[0]);
  input.roomPhotos[0].patches[0].photoId='foreign';assert.throws(()=>normalizeHybridPreview(capture,input),/validated_hybrid_photo/);
});
test('projected wall photos contain actual doorway cutouts',()=>{
  const layout=makeStarterLayout(envelope),descriptor=layoutRoomDescriptor(layout,layout.floors[0].rooms[0].id),g=manualRoomPatchGeometry(descriptor,0,[0,0,1,1]);
  assert.ok(g.indices.length>6);
  const door=descriptor.openings.find(o=>o.wall===0),doorLeft=door.offset-door.width/2+descriptor.outline[0].x,doorRight=doorLeft+door.width;
  for(let i=0;i<g.indices.length;i+=3){const ids=g.indices.slice(i,i+3),x=ids.reduce((n,id)=>n+g.positions[id*3],0)/3,y=ids.reduce((n,id)=>n+g.positions[id*3+1],0)/3;assert.ok(!(x>doorLeft&&x<doorRight&&y<door.height),'triangle painted over doorway');}
});
test('irregular floor photo geometry follows outline rather than bounds',()=>{
  const room={widthMeters:4,lengthMeters:4,heightMeters:2.7,outline:[{x:0,z:0},{x:4,z:0},{x:4,z:2},{x:2,z:2},{x:2,z:4},{x:0,z:4}]};
  const g=manualRoomPatchGeometry(room,6,[0,0,1,1]);
  for(let i=0;i<g.indices.length;i+=3){const ids=g.indices.slice(i,i+3),x=ids.reduce((n,id)=>n+g.positions[id*3],0)/3,z=ids.reduce((n,id)=>n+g.positions[id*3+2],0)/3;assert.ok(!(x>2&&z>2));}
});
test('photos preserve stair openings, solid top ceilings and interior wall offset',()=>{
  const layout=makeStarterLayout(envelope,{bedrooms:0,bathrooms:0,floorCount:2});
  layout.stairs=[{id:'stair',from:'floor_0',to:'floor_1',width:1,path:[{x:2,z:3},{x:2,z:8}]}];
  const upper=layoutRoomDescriptor(layout,'room_1_0'),lower=layoutRoomDescriptor(layout,'room_0_0');
  for(const [room,surface] of [[upper,4],[lower,5]]){const geometry=manualRoomPatchGeometry(room,surface,[0,0,1,1]);for(let i=0;i<geometry.indices.length;i+=3){const ids=geometry.indices.slice(i,i+3),x=ids.reduce((n,id)=>n+geometry.positions[id*3],0)/3,z=ids.reduce((n,id)=>n+geometry.positions[id*3+2],0)/3;assert.ok(!(x>1.5&&x<2.5&&z>3&&z<8),'photo blocked stairwell');}}
  assert.equal(manualRoomPatchGeometry(upper,5,[0,0,1,1]).indices.length,6);
  const wall=manualRoomPatchGeometry(lower,0,[0,0,1,1]);assert.ok(wall.positions[2]>lower.outline[0].z+.05);
});

test('floor and ceiling photos sit physically inside the shell',()=>{
  const descriptor=layoutRoomDescriptor(makeStarterLayout(envelope),'room_0_0');
  for(const [surface,y] of [[4,.006],[5,descriptor.heightMeters-.006]]){
    const g=manualRoomPatchGeometry(descriptor,surface,[0,0,1,1]);
    for(let i=1;i<g.positions.length;i+=3)assert.ok(Math.abs(g.positions[i]-y)<1e-5);
  }
});
