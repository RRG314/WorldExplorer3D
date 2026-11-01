import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const sandbox=vm.createContext({console});
vm.runInContext(readFileSync('app/vendor/three/build/three.min.js','utf8'),sandbox);
globalThis.THREE=sandbox.THREE;
const {createFarFieldTerrainApi}=await import('../app/js/terrain/far-field.js');

function harness() {
  const requests=[];
  const ctx={LOC:{lat:0,lon:0},SCALE:100000,WORLD_UNITS_PER_METER:1,camera:{far:10000},
    geoToWorld:(lat,lon)=>({x:lon*100000,z:-lat*100000}),
    gameStarted:true,worldLoading:false,activeEarthActorPosition:()=>({x:0,z:0})};
  const api=createFarFieldTerrainApi({appCtx:ctx,
    worldToLatLon:(x,z)=>({lat:-z/100000,lon:x/100000}),
    tileXYToLatLonBounds:()=>({latN:.01,latS:-.01,lonW:-.01,lonE:.01}),
    latLonToTileXY:()=>({x:0,y:0}),
    sampleAcceptedGroundAtLatLon:()=>({status:'available',groundElevationMeters:0}),
    loadWorldCover:async()=>null,
    // Stop before geometry. Exercise the real request owner and dependency
    // boundary without inventing a second implementation of its planner.
    loadMappedContext:async(bounds,detail,horizon,options)=>{
      requests.push({bounds,horizon,frame:options.roadCoverageFrame,key:ctx.farTerrainClipmapState.key});
      throw Error('controlled dependency stop');
    }});
  return {api,ctx,requests};
}

test('admitted mobile and desktop regions keep their complete boundary and terrain horizon',async()=>{
  const {api,requests}=harness();
  for(const radius of [6000,14000]) {
    await assert.rejects(api.updateFarTerrainClipmap({z:15,centerX:1,centerY:1,ring:3,
      regionalContextRadiusMeters:radius}),/controlled dependency stop/);
  }
  assert.deepEqual(requests.map(r=>r.frame.bounds),[6000,14000].map(r=>({minX:-r,maxX:r,minZ:-r,maxZ:r})));
  assert.deepEqual(requests.map(r=>r.horizon),Array(2).fill({latN:.22,latS:-.22,lonW:-.22,lonE:.22}));
  assert.notEqual(requests[0].key,requests[1].key);
  await api.resetFarTerrainClipmap();
});

test('optional scenery retains the captured plan and adopts only the replacement request',async()=>{
  const {api,ctx,requests}=harness();
  const request={z:15,centerX:1,centerY:1,ring:3,regionalContextRadiusMeters:6000};
  await assert.rejects(api.updateFarTerrainClipmap(request),/controlled dependency stop/);
  request.regionalContextRadiusMeters=14000;
  ctx.worldLoadRuntimeState={loadProfile:{regionalContextRadiusMeters:14000}};
  api.setRegionalSceneryEnabled(true);
  while(api.getRegionalSceneryState().pending)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(requests[1].frame.bounds.maxX,6000);
  await api.resetFarTerrainClipmap();
  await assert.rejects(api.updateFarTerrainClipmap(request),/controlled dependency stop/);
  api.updateRegionalSceneryFocus();
  while(api.getRegionalSceneryState().pending)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(requests.at(-1).frame.bounds.maxX,14000);
  await api.resetFarTerrainClipmap();
});
