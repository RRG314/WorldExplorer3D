import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeThreeViews, transitionThreeViews, validateThreeViewsBackup, validateAlbumPhoto, THREE_VIEWS } from '../app/js/campaign/three-views.js';
import { createMemoryDiscoveryProfileStore } from '../app/js/discovery/profile-store.js';
const subject={id:'building-one',name:'City Hall',regionId:'test',regionLabel:'Test',position:{lat:39,lon:-76,y:10}};
const view=(kind,i)=>({kind,subjectId:subject.id,regionId:'test',environment:'EARTH',travelMode:'walk',liveGps:false,visible:true,coverage:.4,
  position:{lat:39+i*.0002,lon:-76,y:12},bearing:i*.4,range:[40,15,50][i]});
const apply=(r,type,extra={})=>transitionThreeViews(r?.state,r?.album,{type,revision:r?.state.revision||0,...extra},1000);
const start=()=>apply(apply(null,'accept',{mode:'observation',regionId:'test',regionLabel:'Test'}),'choose',{subject});
const complete=()=>{let r=start();for(const [i,k] of THREE_VIEWS.kinds.entries())r=apply(r,'keep',{view:view(k,i)});return apply(r,'finish');};
test('three views require an accepted subject, actual visible perspectives and explicit review',()=>{
  let r=start();assert.throws(()=>apply(r,'finish'),/three views/);
  for(const [i,kind] of THREE_VIEWS.kinds.entries())r=apply(r,'keep',{view:view(kind,i)});
  assert.equal(r.state.phase,'review');assert.equal(r.event,null);
  r=apply(r,'finish');assert.equal(r.state.phase,'complete');assert.equal(r.event.metadata.mode,'observation');assert.equal(r.event.points,0);
  validateThreeViewsBackup(r.state,r.album,[r.event]);assert.equal(apply(r,'finish').event,null);
});
test('near duplicate, wrong building, air/GPS and invisible views cannot advance',()=>{
  const r=apply(start(),'keep',{view:view('context',0)});
  for(const patch of [{position:view('context',0).position},{subjectId:'elsewhere'},{travelMode:'plane'},{liveGps:true},{visible:false},{coverage:2},{bearing:NaN}])
    assert.throws(()=>apply(r,'keep',{view:{...view('detail',1),...patch}}));
});
test('detail needs a closer position; setting needs space around the subject',()=>{
  let r=start();assert.throws(()=>apply(r,'keep',{view:view('detail',1)}),/closer/);
  r=apply(r,'keep',{view:view('context',0)});
  assert.throws(()=>apply(r,'keep',{view:{...view('detail',1),range:35}}),/closer/);
  assert.throws(()=>apply(r,'keep',{view:{...view('setting',2),coverage:1}}),/room/);
});
test('retaking context clears dependent views; stale commands cannot erase progress',()=>{
  let r=apply(start(),'keep',{view:view('context',0)});r=apply(r,'keep',{view:view('detail',1)});
  assert.throws(()=>transitionThreeViews(r.state,r.album,{type:'abandon',revision:0}),/another window/);
  const removed=apply(r,'remove',{kind:'context'});assert.deepEqual(removed.state.views,[]);assert.equal(r.state.views.length,2);
});
test('observations never pretend to contain photographs',()=>{
  assert.throws(()=>apply(start(),'keep',{view:view('context',0),photo:{}}),/invented/);
  const r=complete();assert.equal(r.album.photos.length,0);assert.match(r.event.name,/observations/);
});
test('malformed media and inconsistent backups fail before replacement',()=>{
  assert.throws(()=>validateAlbumPhoto({kind:'context',id:'three-views:context',width:64,height:64,dataUrl:'data:image/svg+xml;base64,YQ=='}));
  const r=complete();assert.throws(()=>validateThreeViewsBackup(r.state,r.album,[]),/receipt/);
  assert.throws(()=>validateThreeViewsBackup({...r.state,views:r.state.views.slice(0,2)},r.album,[r.event]));
  assert.throws(()=>validateThreeViewsBackup({...r.state,mediaDeleted:true,mediaDeletedAt:1},r.album,[r.event]));
  assert.throws(()=>validateThreeViewsBackup({...r.state,phase:'choose'},r.album,[r.event]));
});
test('future job metadata is preserved but not modified',()=>{
  const next={schemaVersion:2,phase:'future',revision:9,future:{x:1}};assert.deepEqual(normalizeThreeViews(next),next);
  assert.throws(()=>transitionThreeViews(next,null,{type:'abandon',revision:9}),/newer/);validateThreeViewsBackup(next,null,[]);
});
test('storage gates the branch on First Bearings and preserves old backups',async()=>{
  const store=createMemoryDiscoveryProfileStore();await assert.rejects(store.updateThreeViews({type:'accept',revision:0,mode:'observation',regionId:'test',regionLabel:'Test'}),/First Bearings/);
  const backup=await store.exportData();delete backup.albums;delete backup.profile.threeViews;await store.importData(backup);
  assert.equal((await store.getProfile()).threeViews.phase,'available');assert.equal((await store.getThreeViewsAlbum()).photos.length,0);
});
