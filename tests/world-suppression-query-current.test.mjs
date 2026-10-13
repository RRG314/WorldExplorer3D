import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalWorldModificationStore,PRIMARY_KEY,BACKUP_KEY} from '../app/js/editable-world/local-store.js';

const suppress = id => ({action:'suppress_base_building',suppression:{sourceFeatureId:id}});
function fixture(){const values=new Map();let failKey='';const storage={getItem:k=>values.get(k)||null,removeItem:k=>values.delete(k),setItem(k,v){if(k===failKey)throw Error('controlled quota');values.set(k,v);}};return {values,storage,fail:k=>{failKey=k;},open(){const s=createLocalWorldModificationStore({storage});s.initialize();return s;}};}

test('persisted malformed, future, over-limit and clamped world entries are protected rather than normalized away',()=>{
 const f=fixture(),s=f.open();s.commit('city',suppress('osm:1'));
 s.commit('city',{action:'upsert_object',object:{id:'wall:1',type:'wall',transform:{position:{x:1,y:0,z:2}}}});
 const valid=f.values.get(PRIMARY_KEY);
 const changes=[
  d=>{d.worlds.city.schemaVersion=99;},d=>{d.worlds.city.futureTerrain=[{height:3}];},
  d=>{d.worlds.city.objects.push({id:'future',type:'future-crop'});},
  d=>{d.worlds.city.objects[0].transform.position.x=5000;},
  d=>{d.worlds.city.objects[0].transform.scale.y=21;},
  d=>{d.worlds.city.objects.push({...d.worlds.city.objects[0]});},
  d=>{d.worlds.city.suppressions=Array.from({length:161},(_,i)=>({...d.worlds.city.suppressions[0],id:`suppression:osm:${i}`,sourceFeatureId:`osm:${i}`}));},
  d=>{d.worlds.city.objects=null;},d=>{d.worlds.city.revision=Number.MAX_SAFE_INTEGER;}
 ];
 for(const change of changes){
  const d=JSON.parse(valid);change(d);const original=JSON.stringify(d);f.values.set(PRIMARY_KEY,original);f.values.set(BACKUP_KEY,valid);
  const read=f.open();assert.equal(read.status().enabled,false);assert.equal(read.commit('unrelated',suppress('osm:2')).committed,false);
  const recovery=JSON.parse(read.exportRecovery());assert.equal(recovery.primary,original);assert.equal(recovery.backup,valid);
  assert.equal(f.values.get(PRIMARY_KEY),original);assert.equal(f.values.get(BACKUP_KEY),valid);
 }
});
test('an unreadable backup stays protected even when primary is absent or valid',()=>{
 const f=fixture(),s=f.open();s.commit('city',suppress('osm:1'));const primary=f.values.get(PRIMARY_KEY),broken='{preserve-original-backup';
 for(const candidate of [null,primary]){
  if(candidate===null)f.values.delete(PRIMARY_KEY);else f.values.set(PRIMARY_KEY,candidate);
  f.values.set(BACKUP_KEY,broken);const read=f.open();assert.equal(read.status().recovery,'backup-protected');assert.equal(read.status().enabled,false);
  assert.equal(read.commit('city',suppress('osm:new')).committed,false);assert.equal(f.values.get(BACKUP_KEY),broken);
  assert.equal(JSON.parse(read.exportRecovery()).primary,candidate);
 }
});
test('valid creations reload losslessly regardless of object key order and recovery export reads latest external bytes',()=>{
 const f=fixture(),s=f.open();s.commit('city',suppress('osm:1'));s.commit('city',{action:'upsert_object',object:{id:'sign:1',type:'sign',transform:{position:{x:1,y:0,z:2}}}});
 const before=s.snapshot('city'),d=JSON.parse(f.values.get(PRIMARY_KEY));d.worlds.city=Object.fromEntries(Object.entries(d.worlds.city).reverse());f.values.set(PRIMARY_KEY,JSON.stringify(d));
 const restored=f.open();assert.equal(restored.status().enabled,true);assert.deepEqual(restored.snapshot('city'),before);
 f.values.set(PRIMARY_KEY,'{another-tab-new-data');assert.equal(JSON.parse(restored.exportRecovery()).primary,'{another-tab-new-data');
});

test('editing a 25th location cannot evict the first 24 saved creations',()=>{
 const f=fixture(),s=f.open();for(let i=0;i<24;i++)assert.equal(s.commit(`city:${i}`,suppress(`osm:${i}`)).committed,true);
 const before=f.values.get(PRIMARY_KEY);assert.equal(s.commit('city:24',suppress('osm:24')).reason,'world-limit');assert.equal(f.values.get(PRIMARY_KEY),before);
 const restored=f.open();for(let i=0;i<24;i++)assert.equal(restored.isBuildingSuppressed(`city:${i}`,`osm:${i}`),true);
 assert.equal(restored.commit('city:0',suppress('osm:extra')).committed,true);
});
test('a redundant backup failure does not misreport an already committed edit',()=>{
 const f=fixture(),s=f.open();f.fail(BACKUP_KEY);assert.equal(s.commit('city',suppress('osm:1')).committed,true);
 assert.equal(s.status().backupAvailable,false);assert.equal(f.open().isBuildingSuppressed('city','osm:1'),true);
 f.fail(PRIMARY_KEY);assert.equal(s.commit('city',suppress('osm:2')).committed,false);assert.equal(f.open().isBuildingSuppressed('city','osm:2'),false);
});
test('a stale store cannot overwrite another tab and future data stays read-only',()=>{
 const f=fixture(),first=f.open(),stale=f.open();first.commit('city',suppress('osm:1'));
 assert.equal(stale.commit('city',suppress('osm:2')).reason,'storage-conflict');assert.equal(f.open().isBuildingSuppressed('city','osm:1'),true);
 const future=JSON.stringify({schemaVersion:2,worlds:{future:{important:'retained'}}});f.values.set(PRIMARY_KEY,future);
 const blocked=f.open();assert.equal(blocked.status().enabled,false);assert.equal(blocked.commit('city',suppress('osm:3')).committed,false);assert.equal(f.values.get(PRIMARY_KEY),future);
});
test('loading a larger existing database never truncates its older locations',()=>{
 const f=fixture(),s=f.open();s.commit('city',suppress('osm:1'));const template=JSON.parse(f.values.get(PRIMARY_KEY)).worlds.city;
 f.values.set(PRIMARY_KEY,JSON.stringify({schemaVersion:1,worlds:Object.fromEntries(Array.from({length:30},(_,i)=>[`city:${i}`,{...template,worldId:`city:${i}`}]))}));
 const restored=f.open();assert.equal(restored.status().worldCount,30);assert.equal(restored.isBuildingSuppressed('city:0','osm:1'),true);
 restored.commit('city:0',suppress('osm:2'));assert.equal(f.open().status().worldCount,30);
});

test('collision membership follows committed edits, restore, reload and reset', () => {
  const values = new Map(); let fail = false;
  const storage = {
    getItem: key => values.get(key) || null,
    removeItem: key => values.delete(key),
    setItem(key, value) { if (fail) throw Error('quota'); values.set(key, value); }
  };
  const store = createLocalWorldModificationStore({storage}); store.initialize();
  const suppress = id => ({action:'suppress_base_building', suppression:{sourceFeatureId:id}});
  assert.equal(store.isBuildingSuppressed('city', 'osm:1'), false);
  assert.equal(store.commit('city', suppress('osm:1')).committed, true);
  assert.equal(store.isBuildingSuppressed('city', 'osm:1'), true);
  assert.equal(store.isBuildingSuppressed('other-city', 'osm:1'), false);
  fail = true;
  assert.equal(store.commit('city', {action:'restore_base_building',sourceFeatureId:'osm:1'}).committed, false);
  assert.equal(store.isBuildingSuppressed('city', 'osm:1'), true);
  fail = false;
  const reloaded = createLocalWorldModificationStore({storage}); reloaded.initialize();
  assert.equal(reloaded.isBuildingSuppressed('city', 'osm:1'), true);
  reloaded.commit('city', {action:'restore_base_building', sourceFeatureId:'osm:1'});
  assert.equal(reloaded.isBuildingSuppressed('city', 'osm:1'), false);
  reloaded.commit('city', suppress('osm:2'));
  reloaded.commit('city', {action:'reset_world'});
  assert.equal(reloaded.isBuildingSuppressed('city', 'osm:2'), false);
});
