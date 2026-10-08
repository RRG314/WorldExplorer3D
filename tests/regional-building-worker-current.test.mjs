import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegionalBuildingCompiler } from '../app/js/terrain/regional-building-compiler.js';
import { RegionalBuildingDescriptors, DESCRIPTOR_STRIDE } from '../app/js/terrain/regional-building-descriptors.js';
import { createRegionalBuildingWorker } from '../app/js/terrain/regional-building-runtime.js';
import { loadFarMappedContext } from '../app/js/terrain/far-field-mapped-context.js';
import { resolveFarBuildingMassing } from '../app/js/terrain/far-building-massing.js?v=2';
import { earthCoordinateFrame } from '../app/js/earth-core/coordinate-frame.js?v=1';

const box = (x,y,size=.0002) => [[x,y],[x+size,y],[x+size,y+size],[x,y+size],[x,y]];
const bounds = {latS:0,latN:.02,lonW:0,lonE:.02};
const features = Array.from({length:1600},(_,i)=>({id:i,toGeoJSON:()=>({
  properties:{kind:i%97===0?'tower':'residential',height:i%97===0?90:undefined},
  geometry:{type:'MultiPolygon',coordinates:[ [box((i%40)*.0004,Math.floor(i/40)*.0004)],
    ...(i%11===0?[[box((i%40)*.0004+.0001,Math.floor(i/40)*.0004+.0001)]]:[]) ]}
})}));
const record=(z,x,y)=>({z,x,y,tile:{layers:z===14?{buildings:{length:features.length,feature:i=>features[i]}}:{}}});

test('packed tile compilation preserves reference selection, every massing value, exact shapes and audit counters',async()=>{
  for(const maxInstances of [undefined,100]){
    const tiles=[];
    const reference=await loadFarMappedContext(bounds,null,bounds,{maxInstances,fetchTile:async(z,x,y)=>{
      const tile=record(z,x,y);if(z===14)tiles.push(tile);return tile;
    }});
    const compiler=createRegionalBuildingCompiler({bounds,tileCount:tiles.length,maxInstances,unitsPerMeter:100000/111000});
    for(const tile of tiles)compiler.addTile(tile);
    const packet=compiler.finish(), packed=new RegionalBuildingDescriptors(packet);
    try{
      for(const key of ['sourceBuildings','invalidBuildings','outsideBuildings','skippedNearBuildings','availableBuildings','selectedBuildingTarget','majorBuildingsAvailable','majorBuildingsSelected','buildingBudgetExceeded'])assert.equal(packet[key],reference[key],key);
      assert.equal(packed.length,reference.buildings.length);
      const scratch={massing:{color:[0,0,0]}};
      const units=100000/111000;
      for(let i=0;i<packed.length;i++){
        const got=packed.read(i,scratch),expected=reference.buildings[i];
        for(const key of ['centerLat','centerLon','widthMeters','depthMeters','areaMeters','rotationY','priority'])assert.equal(got[key],expected[key],`${i}:${key}`);
        assert.deepEqual(got.ring,expected.ring);
        const massing=resolveFarBuildingMassing(expected,null,expected.areaMeters*units*units,units);
        assert.equal(got.validMassing,Boolean(massing));
        if(massing){assert.equal(got.massing.heightMeters,massing.heightMeters);assert.deepEqual(got.massing.color,massing.color);assert.equal(got.massing.roofFraction,massing.roofFraction);
          assert.equal(['explicit_height','levels'].includes(got.massing.heightSource),['explicit_height','levels'].includes(massing.heightSource));}
      }
    }finally{packed.dispose();}
    assert.equal(packed.data.byteLength,0);assert.equal(packed.rings.size,0);assert.throws(()=>packed.read(0,{}));
    assert.throws(()=>compiler.finish(),/finished/);
  }
});

test('serialized geographic frame excludes exactly the same near circle as the scene',async()=>{
  const detailedFrame={origin:{lat:.003,lon:.003},scale:100000,radius:520};
  const frame=earthCoordinateFrame(detailedFrame.origin,detailedFrame.scale),tiles=[];
  const reference=await loadFarMappedContext(bounds,bounds,bounds,{fetchTile:async(z,x,y)=>{const tile=record(z,x,y);if(z===14)tiles.push(tile);return tile;},
    isWithinDetailedBuildingDomain:(lat,lon)=>{const p=frame.toWorld(lat,lon);return Math.hypot(p.x,p.z)<=detailedFrame.radius;}});
  const compiler=createRegionalBuildingCompiler({bounds,excludedBounds:bounds,detailedFrame,tileCount:tiles.length});
  tiles.forEach(t=>compiler.addTile(t));const packet=compiler.finish();
  assert.equal(packet.skippedNearBuildings,reference.skippedNearBuildings);assert.equal(packet.availableBuildings,reference.availableBuildings);
  assert.deepEqual([...packet.data].filter((_,i)=>i%DESCRIPTOR_STRIDE===0),reference.buildings.map(b=>b.centerLat));
});

function fakeWorker(handler){
  return {terminated:0,onmessage:null,onerror:null,onmessageerror:null,terminate(){this.terminated++;},
    postMessage(message,transfer){const data=structuredClone(message,{transfer});handler(data,this);}};
}
const answer=(worker,id,result={})=>queueMicrotask(()=>worker.onmessage?.({data:{id,result}}));

test('one admitted job transfers an owned copy, ignores wrong replies, and terminates on completion',async()=>{
  let gate,sourceCopy;
  const worker=fakeWorker((m,w)=>{
    if(m.type==='start')answer(w,m.id);
    if(m.type==='tile'){sourceCopy=m.tile.bytes;gate=()=>answer(w,m.id,{tileAvailableBuildings:1});answer(w,m.id+100,{wrong:true});}
    if(m.type==='finish')answer(w,m.id,{data:new Float64Array(DESCRIPTOR_STRIDE),rings:[],availableBuildings:1});
  });
  const runtime=await createRegionalBuildingWorker({}, {workerFactory:()=>worker});
  const original=new Uint8Array([1,2,3]), pending=runtime.addTile({bytes:original,z:14,x:1,y:1});
  await assert.rejects(runtime.addTile({bytes:original}),/busy/);
  assert.deepEqual([...original],[1,2,3]);assert.deepEqual([...sourceCopy],[1,2,3]);gate();
  assert.equal((await pending).tileAvailableBuildings,1);
  const result=await runtime.finish();assert.equal(result.buildings.length,1);assert.equal(worker.terminated,1);
  runtime.dispose();assert.equal(worker.terminated,1);result.buildings.dispose();
});

test('cancellation and deadline reject the active job and cannot publish late results',async()=>{
  for(const cancel of [true,false]){
    const controller=new AbortController();let id;
    const worker=fakeWorker((m,w)=>{if(m.type==='start')answer(w,m.id);else id=m.id;});
    const runtime=await createRegionalBuildingWorker({}, {signal:controller.signal,workerFactory:()=>worker,deadlineMs:15});
    const pending=runtime.addTile({bytes:new Uint8Array([1])});
    if(cancel)controller.abort();
    await assert.rejects(pending,cancel?/abort/i:/deadline/);
    answer(worker,id,{tileAvailableBuildings:1});await Promise.resolve();assert.equal(worker.terminated,1);
    await assert.rejects(runtime.finish(),/unavailable/);
  }
});

test('worker errors, malformed result packets and message failures close the owner',async()=>{
  for(const mode of ['error','packet','decode','post']){
    const worker=fakeWorker((m,w)=>{
      if(m.type==='start')answer(w,m.id);
      else if(mode==='error')queueMicrotask(()=>w.onerror({message:'compiler failed'}));
      else if(mode==='decode')queueMicrotask(()=>w.onmessageerror());
      else if(mode==='post')throw Error('post failed');
      else answer(w,m.id,{data:new Float64Array(DESCRIPTOR_STRIDE + 1)});
    });
    const runtime=await createRegionalBuildingWorker({}, {workerFactory:()=>worker});
    await assert.rejects(runtime.finish());assert.equal(worker.terminated,1);
  }
});


test('browsers without worker canvas keep surface roads on the existing main-thread owner',async()=>{
 const originalWorker=globalThis.Worker;
 let worker;
 globalThis.Worker=function(){worker=fakeWorker((m,w)=>{
  if(m.type==='start')answer(w,m.id,{roadWorkerEnabled:false});
  if(m.type==='tile')answer(w,m.id,{tileAvailableBuildings:0});
  if(m.type==='finish')answer(w,m.id,{data:new Float64Array(),rings:[],availableBuildings:0});
 });return worker;};
 try{
  const result=await loadFarMappedContext(bounds,null,bounds,{
   detailedBuildingFrame:{origin:{lat:0,lon:0},scale:111000,radius:520},
   roadCoverageFrame:{bounds:{minX:0,minZ:0,maxX:2500,maxZ:2500},geoToWorld:(lat,lon)=>({x:lon*111000,z:lat*111000}),unitsPerMeter:1},
   fetchTile:async(z,x,y)=>({z,x,y,bytes:new Uint8Array([1]),tile:{layers:z===14?{streets:{length:1,feature:()=>({toGeoJSON:()=>({properties:{kind:'residential'},geometry:{type:'LineString',coordinates:[[.001,.001],[.01,.001]]}})})}}:{}}})
  });
  assert.ok(result.roadCoveragePlan.cells.size>0);assert.ok(result.roadCoveragePlan.stats.surfaceLines>0);
  assert.equal(worker.terminated,1);result.roadCoveragePlan.dispose();result.buildings.dispose();
 }finally{if(originalWorker===undefined)delete globalThis.Worker;else globalThis.Worker=originalWorker;}
});
