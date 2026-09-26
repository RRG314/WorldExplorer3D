import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocationTerrainApi} from '../app/js/terrain/location-world.js';

function harness(t,{fail=false,sourceTile=null,unavailable=false}={}) {
  const previous=globalThis.requestIdleCallback,queue=[];
  globalThis.requestIdleCallback=task=>queue.push(task);
  t.after(()=>{if(previous===undefined)delete globalThis.requestIdleCallback;else globalThis.requestIdleCallback=previous;});
  const key=(z,x,y)=>`${z}/${x}/${y}`;
  const ctx={terrainEnabled:true,TERRAIN_ZOOM:15,TERRAIN_RING:2,LOC:{lat:0,lon:0},terrainGroup:{children:[],add(mesh){this.children.push(mesh);}}};
  const api=createLocationTerrainApi({appCtx:ctx,ensureTerrainGroup(){},worldToLatLon:()=>({lat:0,lon:0}),latLonToTileXY:()=>({x:10,y:20}),
    getOrLoadTerrainTile:()=>sourceTile,
    terrainTileDeps:{usesAcceptedGround:!sourceTile,sampleAcceptedGroundAtLatLon:()=>({status:'available'})},
    buildTerrainTileMesh:(z,x,y)=>{if(fail)throw new Error('ground tile rejected');return unavailable ? {visible:false,userData:{pendingTerrainTile:true,groundUnavailableReason:'outside-artifact',terrainTileKey:key(z,x,y)},geometry:{dispose(){}}} : {userData:{terrainTileKey:key(z,x,y)}};},
    getTerrainMeshKey:m=>m.userData.terrainTileKey,terrainTileMeshKey:key,clearTerrainHeightCache(){}});
  return {api,ctx,queue};
}
test('far coverage waits for every queued near tile instead of recording a partial hole',async t=>{
  const {api,ctx,queue}=harness(t);api.publishLocationTerrain();
  let farCoverage=null;const ready=api.waitForLocationTerrainPublication().then(()=>{farCoverage=ctx.terrainGroup.children.length;});
  for(let i=0;i<25;i++)queue.shift()();
  await Promise.resolve();assert.equal(farCoverage,null);
  while(queue.length)queue.shift()();
  await ready;assert.equal(farCoverage,49);
});
test('superseding a location releases readiness waiters',async t=>{
  const {api}=harness(t);api.publishLocationTerrain();const ready=api.waitForLocationTerrainPublication();
  api.resetLocationTerrainPublication();assert.equal((await ready).status,'superseded');
});
test('tile construction failure rejects readiness instead of leaving the far build waiting forever',async t=>{
  const {api,queue}=harness(t,{fail:true});api.publishLocationTerrain();const ready=api.waitForLocationTerrainPublication();
  queue.shift()();await assert.rejects(ready,/ground tile rejected/);
  await assert.rejects(api.waitForLocationTerrainPublication(),/ground tile rejected/);
});

test('fallback image readiness is part of publication, not a late overlapping tile',async t=>{
 let ready;const sourceTile={loaded:false,ready:new Promise(resolve=>{ready=resolve;})};
 const {api,ctx,queue}=harness(t,{sourceTile});api.publishLocationTerrain();
 const published=api.waitForLocationTerrainPublication();let settled=false;published.then(()=>{settled=true;});
 const first=queue.shift()();await Promise.resolve();
 assert.equal(ctx.terrainGroup.children.length,0);assert.equal(settled,false);
 sourceTile.loaded=true;ready(true);await first;
 while(queue.length)await queue.shift()();await published;
 assert.equal(ctx.terrainGroup.children.length,49);
});
test('failed fallback source rejects the publication instead of reserving an invisible tile',async t=>{
 let ready;const sourceTile={loaded:false,ready:new Promise(resolve=>{ready=resolve;})};
 const {api,ctx,queue}=harness(t,{sourceTile});api.publishLocationTerrain();
 const rejected=assert.rejects(api.waitForLocationTerrainPublication(),/did not become ready/);
 const first=queue.shift()();ready(false);await first;await rejected;
 assert.equal(ctx.terrainGroup.children.length,0);
});
test('a late fallback source cannot publish into a superseding world',async t=>{
 let ready;const sourceTile={loaded:false,ready:new Promise(resolve=>{ready=resolve;})};
 const {api,ctx,queue}=harness(t,{sourceTile});api.publishLocationTerrain();
 const pending=api.waitForLocationTerrainPublication(),first=queue.shift()();
 api.resetLocationTerrainPublication();assert.equal((await pending).status,'superseded');
 sourceTile.loaded=true;ready(true);await first;assert.equal(ctx.terrainGroup.children.length,0);
});

test('unavailable accepted tiles are excluded with reasons and cannot appear under far ownership',async t=>{
 const {api,ctx,queue}=harness(t,{unavailable:true});api.publishLocationTerrain();
 const ready=api.waitForLocationTerrainPublication();
 while(queue.length)await queue.shift()();await ready;
 assert.equal(ctx.terrainGroup.children.length,0);
 assert.equal(ctx.locationTerrainPublication.status,'settled');
 assert.equal(ctx.locationTerrainPublication.excludedTiles.length,49);
 assert.ok(ctx.locationTerrainPublication.excludedTiles.every(tile=>tile.reason==='outside-artifact'));
});
