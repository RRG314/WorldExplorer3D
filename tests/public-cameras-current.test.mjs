import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCameraCatalogue,normalizeCameraDetail,cameraFreshness,filterCameraCatalogue,cameraMapClusters,createPublicCameraService} from '../app/js/live-earth/public-camera-service.js';
import {createPublicCameraState,selectPublicCamera,stopPublicCamera} from '../app/js/live-earth/public-camera-ui.js';
const feature={geometry:{coordinates:[24,60]},properties:{id:'C01503',name:'Road_Inkoo',collectionStatus:'GATHERING',state:null,presets:[{id:'C0150301',inCollection:true,imageUrl:'https://weathercam.digitraffic.fi/C0150301.jpg'}]}};
const data={id:'C01503',presets:[{id:'C0150301',measuredTime:'2026-10-03T04:35:53Z'}]};
test('public camera catalogue excludes inactive, malformed and duplicate sites without inventing coverage',()=>{
 const result=normalizeCameraCatalogue({features:[feature,feature,{...feature,properties:{...feature.properties,collectionStatus:'REMOVED'}},{...feature,geometry:{coordinates:[NaN,60]}}]});
 assert.equal(result.items.length,1);assert.equal(result.items[0].mode,'still');assert.equal(result.items[0].country,'Finland');assert.equal(result.items[0].name,'Road Inkoo');
 assert.throws(()=>normalizeCameraCatalogue({error:'source failure'}));
});
test('camera detail admits only matching publisher image identities and capture metadata',()=>{
 const result=normalizeCameraDetail(feature,data,'C01503');assert.equal(result.presets[0].capturedAt,'2026-10-03T04:35:53.000Z');
 assert.throws(()=>normalizeCameraDetail(feature,data,'C00000'));
 const unsafe=structuredClone(feature);unsafe.properties.presets[0].imageUrl='https://example.com/private';assert.throws(()=>normalizeCameraDetail(unsafe,data,'C01503'));
});
test('stills distinguish recent, stale, missing and future capture times',()=>{
 const now=Date.parse('2026-10-03T05:00:00Z');assert.equal(cameraFreshness('2026-10-03T04:55:00Z',now),'Recent still image');
 assert.equal(cameraFreshness('2026-10-03T04:00:00Z',now),'Stale still image');assert.equal(cameraFreshness(null,now),'Capture time unavailable');assert.equal(cameraFreshness('2027-01-01',now),'Capture time unavailable');
});
test('camera search, bounded pagination and map clusters retain every admitted site',()=>{
 const items=Array.from({length:85},(_,i)=>({id:String(i),name:`Road ${i}`,country:'Finland',lat:60+i*.01,lon:24}));
 const page=filterCameraCatalogue(items,{page:100});assert.equal(page.items.length,5);assert.equal(page.page,4);assert.equal(filterCameraCatalogue(items,{query:'not here'}).total,0);
 const clusters=cameraMapClusters(items);assert.ok(clusters.length<items.length);assert.equal(clusters.reduce((n,v)=>n+v.ids.length,0),85);
 const near=filterCameraCatalogue([{id:'across',name:'Across',country:'',lat:0,lon:-179},{id:'far',name:'Far',country:'',lat:0,lon:150}],{lat:0,lon:179});assert.equal(near.items[0].id,'across');
});
test('camera metadata is cached and refresh bursts cannot refetch unchanged catalogue or views',async()=>{
 let calls=0,time=100000;const service=createPublicCameraService({now:()=>time,fetchImpl:async url=>{calls++;return {ok:true,headers:new Headers(),text:async()=>JSON.stringify(url.endsWith('/data')?data:url.endsWith('/C01503')?feature:{features:[feature]})};}});
 await service.catalogue();await service.catalogue({force:true});assert.equal(calls,1);
 await service.detail('C01503');await service.detail('C01503');assert.equal(calls,3);
 time+=61000;await service.detail('C01503');assert.equal(calls,5);
});
test('provider limits and errors fail without admitting a false empty catalogue',async()=>{
 const service=createPublicCameraService({fetchImpl:async()=>({ok:false,status:429})});await assert.rejects(()=>service.catalogue(),/busy/);
 const oversized=createPublicCameraService({fetchImpl:async()=>({ok:true,headers:new Headers({'content-length':'4000000'}),text:async()=>{throw Error('must not read');}})});await assert.rejects(()=>oversized.catalogue(),/limit/);
});
test('an older camera request cannot replace the next selection, and close cancels media ownership',async()=>{
 const previous=globalThis.document;globalThis.document={hidden:false};let removed=0,aborts=0;const resolvers=new Map();
 const state={publicCamera:createPublicCameraState(),panelMode:'live-earth',activeLayerId:'public-cameras',selector:{api:{isOpen:()=>true},ui:{details:{querySelector:()=>({removeAttribute:()=>removed++})}}}};
 state.publicCamera.items=[{id:'one'},{id:'two'}];const ctx={renderLiveEarthUi:()=>{}};
 const provider={detail:(id,{signal})=>new Promise(resolve=>{resolvers.set(id,resolve);signal.addEventListener('abort',()=>aborts++);})};
 try{const old=selectPublicCamera(ctx,state,'one',provider);const next=selectPublicCamera(ctx,state,'two',provider);resolvers.get('two')({id:'two',presets:[]});await next;resolvers.get('one')({id:'one',presets:[]});await old;assert.equal(state.publicCamera.detail.id,'two');
 state.publicCamera.timer=setTimeout(()=>{},1000);stopPublicCamera(state);assert.equal(state.publicCamera.timer,null);assert.equal(state.publicCamera.controller,null);assert.ok(aborts>=1);assert.ok(removed>=1);
 }finally{globalThis.document=previous;}
});

const {normalizeCaltransCatalogue,createCaltransCameraService}=await import('../app/js/live-earth/caltrans-camera-service.js');
const {normalizeCameraFavorites,cameraJournalReference}=await import('../app/js/live-earth/public-camera-directory.js');
const {createMemoryDiscoveryProfileStore}=await import('../app/js/discovery/profile-store.js');
const cal=(district=3)=>({data:[{cctv:{inService:'true',location:{district:String(district),latitude:'38.481128',longitude:'-121.510528',locationName:'Hwy 5 at Pocket'},recordTimestamp:{recordEpoch:'1789771342'},imageData:{static:{currentImageURL:`https://cwwp2.dot.ca.gov/data/d${district}/cctv/image/pocket/pocket.jpg`}}}}]});
test('Caltrans identifiers derive from approved stills, never reorderable ordinal indices or arbitrary media',()=>{
 const source=cal(),item=normalizeCaltransCatalogue(source,3).items[0];assert.equal(item.id,'caltrans:3:pocket:pocket');
 for(const url of ['https://example.com/private.jpg','https://cwwp2.dot.ca.gov/data/d4/cctv/image/pocket/pocket.jpg','https://cwwp2.dot.ca.gov/data/d3/cctv/image/../pocket.jpg','https://cwwp2.dot.ca.gov/data/d3/cctv/image/pocket/pocket.jpg?token=secret']){const bad=cal();bad.data[0].cctv.imageData.static.currentImageURL=url;assert.equal(normalizeCaltransCatalogue(bad,3).items.length,0);}
 source.data[0].cctv.inService='false';assert.equal(normalizeCaltransCatalogue(source,3).items.length,0);assert.throws(()=>normalizeCaltransCatalogue({error:true},3));
});
test('Caltrans regional catalogue caches atomically and metadata timestamps never become image capture times',async()=>{
 let time=100000,calls=0,fail=false;const service=createCaltransCameraService({now:()=>time,fetchImpl:async url=>{calls++;const d=url.includes('/d3/')?3:4;return {ok:!(fail&&d===4),headers:new Headers(),text:async()=>JSON.stringify(cal(d))}}});
 const initial=await service.catalogue();assert.equal(initial.items.length,2);await service.catalogue({force:true});assert.equal(calls,2);
 const detail=await service.detail(initial.items[0].id);assert.equal(detail.presets[0].capturedAt,null);assert.equal(calls,2);
 time+=3600001;fail=true;await assert.rejects(()=>service.catalogue(),/unavailable/);assert.equal(initial.items.length,2);
 await assert.rejects(()=>service.detail('https://evil.test'),/Unknown/);
});
test('camera favorites are bounded, survive local export, and remote references cannot award a visit',async()=>{
 assert.deepEqual(normalizeCameraFavorites(['C01503','C01503','https://evil','caltrans:3:pocket:pocket']),['C01503','caltrans:3:pocket:pocket']);
 assert.equal(normalizeCameraFavorites(Array.from({length:150},(_,i)=>'C'+String(i).padStart(5,'0'))).length,100);
 const store=createMemoryDiscoveryProfileStore(),before=await store.getProfile();await store.saveProfile(current=>({...current,publicCameraFavorites:['C01503']}));
 const item=normalizeCaltransCatalogue(cal(),3).items[0],reference=cameraJournalReference(item,{id:item.id,capturedAt:null},100000);assert.equal(reference.projections.profile,false);assert.equal(reference.projections.place,false);assert.equal(reference.progress.points,0);
 await store.recordExplorerEvent(reference);assert.equal((await store.recordExplorerEvent(reference)).reason,'already-recorded');
 const after=await store.getProfile();assert.deepEqual(after.explorerProgress,before.explorerProgress);assert.deepEqual(after.characterState,before.characterState);assert.deepEqual((await store.exportData()).profile.publicCameraFavorites,['C01503']);
});
test('closing a camera wall clears every image, timer, and in-flight metadata request',()=>{
 let removed=0,aborted=0;const controller={abort:()=>aborted++};const camera=createPublicCameraState();camera.controller=controller;camera.timer=setTimeout(()=>{},5000);
 stopPublicCamera({publicCamera:camera,selector:{ui:{details:{querySelectorAll:()=>Array.from({length:4},()=>({removeAttribute:()=>removed++}))}}}});assert.equal(removed,4);assert.equal(aborted,1);assert.equal(camera.timer,null);
});
