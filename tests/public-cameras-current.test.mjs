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
