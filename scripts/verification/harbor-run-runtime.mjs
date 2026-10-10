import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {startStaticServer} from './static-server.mjs';
const out=process.env.WE3D_HARBOR_RUNTIME_OUTPUT||'output/verification/harbor-runtime';
await mkdir(out,{recursive:true});
const server=await startStaticServer({rootDir:process.cwd(),ports:[4478]});
let browser;const report={ok:false,evidence:'Real DOM, GLTF asset and model cache with injected storage failure; component, not world gameplay',errors:[]};
try{
 browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(String(e)));
 await page.route('**/harbor-fixture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><section id="discoveryHarborRun"></section><script src="/app/vendor/three/build/three.min.js"></script><script src="/app/vendor/three/examples/js/loaders/GLTFLoader.js"></script>'}));
 await page.goto(`http://127.0.0.1:${server.port}/harbor-fixture`);
 report.checks=await page.evaluate(async()=>{
  const {createHarborRunRuntime}=await import('/app/js/campaign/harbor-run-runtime.js');
  const {createMemoryDiscoveryProfileStore}=await import('/app/js/discovery/profile-store.js');
  const {modelAssetCacheSnapshot}=await import('/app/js/assets/model-asset-runtime.js?v=16');
  const {earthCoordinateFrame}=await import('/app/js/earth-core/coordinate-frame.js?v=1');
  const check=(v,m)=>{if(!v)throw Error(m);};
  const origin={lat:39,lon:-76},frame=earthCoordinateFrame(origin,111000),geo=(x,z=0)=>({...frame.toGeographic(x,z),y:10});
  const route={id:'fixture',regionId:'test',regionLabel:'Test',environment:'EARTH',distance:120,turns:0,pickup:geo(0),dropoff:geo(120),pickupCase:geo(0,4),dropoffCase:geo(120,4),points:[geo(0),geo(60),geo(120)],destinationLabel:'Test stop'};
  const store=createMemoryDiscoveryProfileStore();await store.updateHarborRun({type:'accept',revision:0,route});
  const acceptedBackup=await store.exportData();
  let fail=false,readFail=false,writes=0;
  const proxy={...store,async getProfile(){if(readFail)throw Error('Injected unreadable storage');return store.getProfile();},async updateHarborRun(...args){writes++;if(fail)throw Error('Injected full storage');return store.updateHarborRun(...args);}};
  const ctx={scene:new THREE.Scene(),LOC:origin,SCALE:111000,car:{x:0,z:0,y:11.1,speed:0},getEnv:()=> 'EARTH',getCurrentTravelMode:()=> 'drive',SurfaceQuery:{driveAt:()=>({kind:'road',position:{y:10}})},dynamicBuildingColliders:[],showToast:()=>{}};
  const state={appCtx:ctx,profileStore:proxy,worldIdentityId:'test',ui:{setOpen:()=>{},refreshData:async()=>{}}};
  const runtime=createHarborRunRuntime(state);await runtime.refresh();
  check(runtime.snapshot().caseVisible,'Pickup case did not load');check(ctx.dynamicBuildingColliders.length===1,'Case collider missing');
  for(let i=0;i<8;i++)runtime.update(.2);
  document.querySelector('[data-delivery-action="load"]').click();
  await new Promise(r=>setTimeout(r,20));
  check(runtime.snapshot().phase==='driving','Cargo load failed');check(ctx.dynamicBuildingColliders.length===0,'Loaded case collider remained');
  const current=await store.getProfile(),revision=runtime.snapshot().revision;
  await runtime.refresh({...current,harborRun:{schemaVersion:1,phase:'available',revision:0}});
  check(runtime.snapshot().revision===revision&&runtime.snapshot().phase==='driving','Late UI refresh reverted committed cargo');
  fail=true;readFail=true;runtime.update(.2);runtime.update(.2);await new Promise(r=>setTimeout(r,20));
  check(runtime.snapshot().saveError,'Quota failure was hidden');const failedWrites=writes;
  for(let i=0;i<40;i++)runtime.update(.2);await new Promise(r=>setTimeout(r,20));
  check(writes===failedWrites,'Failed progress write retried every frame');
  fail=false;readFail=false;document.querySelector('[data-delivery-action="retry"]').click();await new Promise(r=>setTimeout(r,20));runtime.update(.2);runtime.update(.2);await new Promise(r=>setTimeout(r,20));
  check(runtime.snapshot().nextPoint===1&&!runtime.snapshot().saveError,'Explicit retry did not recover progress');
  // A jump directly to the next gate must not become valid merely by waiting.
  Object.assign(ctx.car,{x:60});runtime.update(.2);for(let i=0;i<8;i++)runtime.update(.2);await new Promise(r=>setTimeout(r,20));
  check(runtime.snapshot().nextPoint===1&&runtime.snapshot().resumeNeeded,'Teleport counted as driving');
  await store.importData(acceptedBackup);await runtime.refresh(await store.getProfile());runtime.update(.2);
  check(runtime.snapshot().phase==='pickup'&&runtime.snapshot().revision===1,'An intentional backup restore was ignored as a stale UI update');
  check(runtime.snapshot().caseVisible&&ctx.dynamicBuildingColliders.length===1,'Restored pickup did not recover its case and collider');
  readFail=true;await runtime.refresh();check(runtime.snapshot().message.includes('could not refresh'),'Failed background read was not reported');
  readFail=false;await runtime.refresh();check(!runtime.snapshot().message,'Successful refresh did not clear its error');
  runtime.dispose();check(ctx.dynamicBuildingColliders.length===0,'Disposed job kept collider');check(ctx.scene.children.length===0,'Disposed job kept geometry');
  const cached=modelAssetCacheSnapshot().entries.find(e=>e.id==='solis-cargo-case');check(cached?.leases===0,'Disposed job kept an asset lease');
  return ['actual-cargo-asset-and-collider','late-refresh-cannot-revert-cargo','write-failure-pauses-automatic-retries','explicit-retry-recovers','teleport-requires-route-resume','intentional-backup-restore-recovers-cargo','failed-background-read-is-retryable','dispose-releases-scene-collider-and-model-lease'];
 });
 assert.deepEqual(report.errors,[]);report.ok=true;
} catch(error){report.error=String(error.stack||error);throw error;}
finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));await browser?.close();await server.close();}
console.log(JSON.stringify(report));
