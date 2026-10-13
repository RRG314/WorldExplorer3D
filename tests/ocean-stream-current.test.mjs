import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {oceanTileAt,oceanTileCoordinate,oceanTileWindow,oceanNodeKey,interpolateOceanTile,OCEAN_TILE_SEGMENTS} from '../app/js/ocean/stream-grid.js';
import {createOceanDepthStream} from '../app/js/ocean/stream-depth.js';
import {createOceanStreamRuntime,reprojectOceanPose,oceanRenderFrame,oceanParentPosition} from '../app/js/ocean/stream-runtime.js';
import {fetchGebcoDepthEvidence} from '../app/js/geospatial/bathymetry-evidence.js';
import {OCEAN_VOYAGE_KEY,OCEAN_NATIVE_VOYAGE_KEY,OCEAN_STREAM_VOYAGE_KEY,createOceanVoyageStore,validateOceanVoyage} from '../app/js/ocean/voyage-store.js';
import {createMarineHabitatPlan,createStreamedMarineHabitatPlan} from '../app/js/ocean/habitat-plan.js';
import {prepareSurfaceVoyage} from '../app/js/ocean/voyage.js';
const flush=()=>new Promise(r=>setImmediate(r));
async function settle(stream){for(let i=0;i<50;i++){await flush();if(stream.snapshot().inFlight===0)return;}throw Error('Queue did not settle');}
const depth=async()=>({elevationMeters:-80});

test('cube ocean tiles cover every face, both poles and the date line with stable IDs and bounded neighbors',()=>{
 for(let lat=-90;lat<=90;lat+=5)for(let lon=-180;lon<=180;lon+=5){
  const tile=oceanTileAt(lat,lon),p=oceanTileCoordinate(tile,tile.s,tile.t);
  assert.ok(Math.abs(p.lat-lat)<1e-6);if(Math.abs(lat)<90)assert.ok(Math.abs(Math.atan2(Math.sin((p.lon-lon)*Math.PI/180),Math.cos((p.lon-lon)*Math.PI/180)))<1e-8);
  const window=oceanTileWindow(lat,lon);assert.ok(window.length<=9&&window.some(t=>t.key===tile.key));
 }
 assert.equal(oceanNodeKey({lat:0,lon:180}),oceanNodeKey({lat:0,lon:-180}));
});
test('stream queue caps network and residency through 150 distant moves and retires meshes exactly once',async()=>{
 let published=0,retired=0,inflight=0,peak=0;
 const stream=createOceanDepthStream({onTile:()=>published++,onRetire:()=>retired++,fetchDepth:async()=>{inflight++;peak=Math.max(peak,inflight);await flush();inflight--;return {elevationMeters:-100};}});
 for(let i=0;i<150;i++){
  stream.update(35+Math.sin(i)*45,((i*11+180)%360)-180);await settle(stream);
  const s=stream.snapshot();assert.ok(s.resident<=9);assert.ok(s.nodes<=64);assert.ok(s.inFlight<=2);assert.equal(published-retired,s.ready);
 }
 assert.ok(published>500);assert.equal(peak,2);stream.dispose();assert.equal(published,retired);assert.equal(stream.snapshot().resident,0);
});
test('failed depth remains unknown, retries on a bounded clock, and obsolete loads cannot publish',async()=>{
 let now=0,fail=true;
 const stream=createOceanDepthStream({now:()=>now,fetchDepth:async()=>{if(fail)throw Error('offline');return {elevationMeters:-50};}});
 stream.update(10,20);await settle(stream);const first=stream.snapshot().requested;
 assert.equal(stream.sample(10,20).truthType,'unknown');for(let i=0;i<20;i++)stream.update(10,20);await settle(stream);assert.equal(stream.snapshot().requested,first);
 now=31000;fail=false;stream.update(10,20);await settle(stream);assert.equal(stream.sample(10,20).depthMeters,50);stream.dispose();
 let releases=[],published=0;
 const late=createOceanDepthStream({onTile:()=>published++,fetchDepth:()=>new Promise(resolve=>releases.push(resolve))});late.update(0,0);await flush();late.dispose();for(const r of releases)r({elevationMeters:-90});await flush();assert.equal(published,0);assert.equal(late.snapshot().nodes,0);
});
test('rendered tile triangle height matches collision interpolation and all GPU resources retire',async()=>{
 const mode={scene:new THREE.Scene(),launchSite:{lat:25,lon:-60},frameOrigin:{lat:25,lon:-60},continuous:true};
 const runtime=createOceanStreamRuntime(THREE,{mode,scale:100000,metersPerUnit:1.11,textures:{},fetchDepth:async(lat,lon)=>({elevationMeters:-80+(lat-25)*100+(lon+60)*150})});
 runtime.update({x:0,z:0});await settle(runtime.depth);assert.equal(runtime.canNavigate(0,0),true);
 let disposals=0;for(const mesh of runtime.group.children){mesh.geometry.addEventListener('dispose',()=>disposals++);mesh.material.addEventListener('dispose',()=>disposals++);
  const tile=runtime.depth.tiles.find(t=>`Seabed ${t.key}`===mesh.name),a=mesh.geometry.attributes.position,n=OCEAN_TILE_SEGMENTS;
  for(let j=0;j<=n;j+=4)for(let i=0;i<=n;i+=4)assert.ok(Math.abs(a.getY(j*(n+1)+i)*1.11-interpolateOceanTile(tile.values,i/n,j/n))<.0001);
 }
 const count=runtime.group.children.length;const old=oceanRenderFrame(mode,100000),geo=old.toGeographic(1200,700);mode.frameOrigin=geo;const frame=oceanRenderFrame(mode,100000);
 const moved=reprojectOceanPose({x:1200,y:-20,z:700,yaw:.7},old,frame);assert.ok(Math.hypot(moved.x,moved.z)<1e-6);assert.equal(moved.y,-20);
 const back=frame.toGeographic(moved.x,moved.z);assert.deepEqual(back,geo);const parent=oceanParentPosition(mode,100000);assert.ok(Math.hypot(parent.x,parent.z)>1300);
 runtime.reproject();assert.equal(runtime.group.children.length,count);runtime.dispose();runtime.dispose();assert.equal(disposals,count*2);assert.equal(mode.scene.children.length,0);
});
test('streaming saves use a separate key, survive local reload and retain rollback-compatible local voyages',()=>{
 const m=new Map(),storage={getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v)};
 const local=prepareSurfaceVoyage({lat:25,lon:-60},{x:0,z:0},{model:'geographic-metres-v1',entryDepthMeters:80});
 const store=createOceanVoyageStore({storage,now:()=>100});store.read();assert.equal(store.write(local).saved,true);const original=m.get(OCEAN_NATIVE_VOYAGE_KEY);
 const current={...local,version:3,stage:'underwater',frameWaveOffset:{x:400,z:200},frameOrigin:{lat:25.02,lon:-60.04},sub:{...local.sub,x:20,z:30}};
 assert.equal(store.write(current).saved,true);assert.equal(m.get(OCEAN_NATIVE_VOYAGE_KEY),original);assert.ok(m.has(OCEAN_STREAM_VOYAGE_KEY));
 const loaded=createOceanVoyageStore({storage}).read();assert.equal(loaded.version,3);assert.deepEqual(loaded.frameOrigin,current.frameOrigin);assert.deepEqual(loaded.ship,local.ship);
 assert.equal(validateOceanVoyage({...current,frameOrigin:{lat:91,lon:0}}),null);assert.equal(validateOceanVoyage({...current,sub:{...current.sub,x:6000}}),null);
 const other=createOceanVoyageStore({storage,now:()=>200});other.read();assert.equal(other.write(local).saved,true);assert.equal(store.write(current).reason,'conflict');assert.equal(createOceanVoyageStore({storage}).read().version,2);
});
test('a supplied cancellation signal does not disable provider timeout',async()=>{
 const controller=new AbortController();let aborted=false;
 await assert.rejects(fetchGebcoDepthEvidence(0,0,{signal:controller.signal,timeoutMs:15,fetchImpl:async(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(Error('aborted'));},{once:true}))}));
 assert.equal(aborted,true);assert.equal(controller.signal.aborted,false);
});

test('a parent on the far side of the globe cannot fold into the polar local frame',()=>{
 const mode={continuous:true,launchSite:{lat:-89.99,lon:180},frameOrigin:{lat:89.99,lon:0}};
 const parent=oceanParentPosition(mode,100000);assert.ok(Math.hypot(parent.x,parent.z)>15000000);assert.ok(parent.distanceMeters>19000000);
});

 test('late streamed depth cannot anchor scenery to fallback terrain or reshuffle known outcrops',()=>{
  const site={lat:25,lon:-60},height=(x,z)=>-80+x*.03+z*.02;
  const plan=sampleSeabedHeight=>createMarineHabitatPlan({site,includeAuthoredStudy:false,sampleSeabedHeight});
  assert.equal(plan(()=>NaN).rocks.length,0);
  const partial=plan((x,z)=>x<0?height(x,z):NaN),full=plan(height);
  assert.ok(partial.rocks.length>20);assert.equal(full.rocks.length,95);
  for(const rock of partial.rocks)assert.deepEqual(full.rocks.find(r=>r.id===rock.id),rock);
  for(const rock of full.rocks)assert.ok(Math.abs(rock.y-(height(rock.x,rock.z)-.3))<1e-9);
 });

test('native-depth checkpoints preserve released v1 saves and can read earlier preview v2 records without rewriting them',()=>{
 const values=new Map(),storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
 const modern=prepareSurfaceVoyage({lat:25,lon:-60},{x:0,z:0},{model:'geographic-metres-v1',entryDepthMeters:80});
 const old=validateOceanVoyage({...modern,version:1,savedAt:1}),raw=JSON.stringify(old);values.set(OCEAN_VOYAGE_KEY,raw);
 const store=createOceanVoyageStore({storage,now:()=>100});assert.equal(store.read().version,1);
 assert.equal(store.write(modern).saved,true);assert.equal(values.get(OCEAN_VOYAGE_KEY),raw);assert.ok(values.has(OCEAN_NATIVE_VOYAGE_KEY));
 assert.equal(createOceanVoyageStore({storage}).read().version,2);
 values.set(OCEAN_VOYAGE_KEY,JSON.stringify({...modern,savedAt:200}));const previewRaw=values.get(OCEAN_VOYAGE_KEY);
 const preview=createOceanVoyageStore({storage,now:()=>300}),loaded=preview.read();assert.equal(loaded.savedAt,200);
 assert.equal(preview.write(loaded).saved,true);assert.equal(values.get(OCEAN_VOYAGE_KEY),previewRaw);
 values.set(OCEAN_VOYAGE_KEY,JSON.stringify({...old,savedAt:400}));assert.equal(createOceanVoyageStore({storage}).read().version,1);
});

test('streamed outcrop identities survive frame rebases and follow the player within a fixed instance budget',()=>{
 const mode={frameOrigin:{lat:36,lon:-70}},frame=oceanRenderFrame(mode,100000),tiles=oceanTileWindow(36,-70);
 const plan=(f,focus,sample=()=>-100)=>createStreamedMarineHabitatPlan({tiles,frame:f,focus,sampleSeabedHeight:sample});
 const first=plan(frame,{x:0,z:0});assert.ok(first.rocks.length>10&&first.rocks.length<=128);assert.equal(plan(frame,{x:0,z:0},()=>NaN).rocks.length,0);
 const moved=plan(frame,{x:0,z:800});assert.ok(moved.rocks.length>10&&moved.rocks.every(r=>Math.hypot(r.x,r.z-800)<=650));
 mode.frameOrigin=frame.toGeographic(0,800);const nextFrame=oceanRenderFrame(mode,100000),rebased=plan(nextFrame,{x:0,z:0});
 let retained=0;for(const r of moved.rocks){const same=rebased.rocks.find(p=>p.id===r.id);if(!same)continue;retained++;const a=frame.toGeographic(r.x,r.z),b=nextFrame.toGeographic(same.x,same.z);assert.ok(Math.abs(a.lat-b.lat)<1e-6&&Math.abs(a.lon-b.lon)<1e-6);}
 assert.ok(retained>10);assert.deepEqual(rebased.corals,[]);assert.deepEqual(rebased.contacts,[]);
});
