import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptPortalSync,applyPortalAction,createPortalTrailEntry,emptyPortalTrailState,
  normalizePortalAction,portalOwnerScope,portalTrailKey,portalTrailPrefix,portalTrailSummary,portalTrailView,queuePortalAction,
  validatePortalTrailEntry
} from '../app/js/portal/trail-model.js';
import {createMemoryDiscoveryProfileStore} from '../app/js/discovery/profile-store.js';

const owner=portalOwnerScope('explorer-a'),other=portalOwnerScope('explorer-b'),guest=portalOwnerScope();
const action=(kind='save',n=1,destinationId='baltimore')=>({operationId:`op:${n}`,destinationId,kind,
  createdAt:1000+n,...(kind==='investigate'?{contentVersion:'learning:1'}:{})});
function accepted(state,operationId,scope=owner){return {ownerScope:scope,state,operationId};}

test('Portal owner scope distinguishes guests and accounts and accepts valid existing Firebase identities',()=>{
  assert.notEqual(portalOwnerScope('device-guest'),guest);
  assert.equal(portalOwnerScope('custom+explorer@example.com'),'account:custom+explorer@example.com');
  assert.throws(()=>portalOwnerScope('bad\nidentity'));
});
test('Custom account identifiers cannot overlap another account’s IndexedDB key prefix',()=>{
  const simple=portalOwnerScope('explorer'),nested=portalOwnerScope('explorer|other');
  assert.equal(portalTrailKey(nested,'baltimore').startsWith(portalTrailPrefix(simple)),false);
  assert.notEqual(portalTrailKey(nested,'baltimore'),portalTrailKey(simple,'baltimore'));
});
test('Widget actions cannot create virtual visits, expeditions, rewards or another owner',()=>{
  for(const kind of ['visited','expedition-completed','reward','unknown'])assert.throws(()=>normalizePortalAction(action(kind)));
  const input={...action(),ownerUid:'intruder',visitedAt:5000,expeditionIds:['fake'],points:500};
  const normalized=normalizePortalAction(input);
  assert.equal(Object.hasOwn(normalized,'points'),false);
  const state=applyPortalAction(emptyPortalTrailState('baltimore'),input);
  assert.equal(state.visitedAt,0);assert.deepEqual(state.expeditionIds,[]);
});
test('Saved and investigated are independent and unsaving retains learning and encounter history',()=>{
  let entry=createPortalTrailEntry(guest,'baltimore');
  for(const a of [action('save',1),action('investigate',2),action('unsave',3)])entry=queuePortalAction(entry,a);
  const view=portalTrailView(entry);
  assert.equal(view.saved,false);assert.equal(view.investigatedAt,1002);
  assert.equal(view.firstOfferedAt,1001);assert.equal(view.lastOfferedAt,1003);
  assert.equal(view.visitedAt,0);assert.equal(view.pending,false);
});
test('Account choices persist as pending overlays and a duplicate operation remains idempotent',()=>{
  let entry=createPortalTrailEntry(owner,'baltimore');
  entry=queuePortalAction(entry,action());entry=queuePortalAction(entry,action());
  assert.equal(entry.state.saved,false);assert.equal(portalTrailView(entry).saved,true);
  assert.equal(Object.keys(entry.pending).length,1);
  assert.equal(portalTrailView(entry).pending,true);
});
test('A save response cannot clear a newer offline unsave or replace newer server state',()=>{
  let entry=queuePortalAction(createPortalTrailEntry(owner,'baltimore'),action());
  entry=queuePortalAction(entry,action('unsave',2));
  const saved={...applyPortalAction(emptyPortalTrailState('baltimore'),action()),revision:1};
  entry=acceptPortalSync(entry,accepted(saved,'op:1'),owner);
  assert.equal(portalTrailView(entry).saved,false);assert.equal(portalTrailView(entry).pending,true);
  const unsaved={...applyPortalAction(saved,action('unsave',2)),revision:2};
  entry=acceptPortalSync(entry,accepted(unsaved,'op:2'),owner);
  entry=acceptPortalSync(entry,accepted(saved,'op:1'),owner);
  assert.equal(portalTrailView(entry).saved,false);assert.equal(entry.state.revision,2);
  assert.equal(portalTrailView(entry).pending,false);
});
test('Trail synchronization refuses a different account or destination without changing queued work',()=>{
  const entry=queuePortalAction(createPortalTrailEntry(owner,'baltimore'),action()),before=JSON.stringify(entry);
  assert.throws(()=>acceptPortalSync(entry,accepted(emptyPortalTrailState('baltimore'),'op:1',other),owner));
  assert.throws(()=>acceptPortalSync(entry,accepted(emptyPortalTrailState('tokyo'),'op:1'),owner));
  assert.throws(()=>acceptPortalSync(entry,accepted(emptyPortalTrailState('baltimore'),'op:1'),other));
  assert.equal(JSON.stringify(entry),before);
});
test('Trail summaries count distinct places and preserve valid game-supplied history independently',()=>{
  const a=queuePortalAction(createPortalTrailEntry(guest,'baltimore'),action('investigate'));
  a.state.visitedAt=2000;a.state.expeditionIds=['survey:one'];
  const b=queuePortalAction(createPortalTrailEntry(guest,'tokyo'),action('save',2,'tokyo'));
  b.state.expeditionIds=['survey:one','survey:two'];
  assert.deepEqual(portalTrailSummary([a,b]),{offered:2,saved:1,investigated:1,visited:1,expeditions:2,pending:0});
});
test('Malformed Trail records and mismatched pending destinations are rejected before persistence',()=>{
  const entry=createPortalTrailEntry(owner,'baltimore');entry.pending.visited=action('save');
  assert.throws(()=>validatePortalTrailEntry(entry));
  assert.throws(()=>queuePortalAction(createPortalTrailEntry(owner,'baltimore'),action('save',1,'tokyo')));
  assert.throws(()=>normalizePortalAction({...action(),createdAt:NaN}));
});
test('Journal persistence isolates accounts, paginates stable destinations and retains pending state after reopen',async()=>{
  const store=createMemoryDiscoveryProfileStore();
  for(const [n,destination] of ['baltimore','tokyo','newyork'].entries())await store.recordPortalAction(owner,action('save',n+1,destination));
  await store.recordPortalAction(other,action('save',4,'monaco'));
  const first=await store.listPortalTrail(owner,{limit:2});
  assert.deepEqual(first.items.map(e=>e.destinationId),['baltimore','newyork']);assert.equal(first.nextCursor,'newyork');
  assert.deepEqual((await store.listPortalTrail(owner,{after:first.nextCursor})).items.map(e=>e.destinationId),['tokyo']);
  assert.deepEqual((await store.listPortalTrail(other)).items.map(e=>e.destinationId),['monaco']);
  const reopened=createMemoryDiscoveryProfileStore(await store.exportData());
  assert.equal(portalTrailView(await reopened.getPortalDestination(owner,'baltimore')).pending,true);
  await assert.rejects(store.listPortalTrail(owner,{after:0}));
});
test('Journal Trail actions do not alter character, field guide, inventory or Explorer points',async()=>{
  const store=createMemoryDiscoveryProfileStore(),before=await store.exportData();
  await store.recordPortalAction(guest,action());await store.recordPortalAction(guest,action('investigate',2));
  const after=await store.exportData();
  for(const field of ['profile','items','fieldGuide','companions','events'])assert.deepEqual(after[field],before[field]);
  assert.equal(after.portalTrail.length,1);
});
test('An older Journal backup preserves the new Trail and restore rollback recovers its complete state',async()=>{
  const store=createMemoryDiscoveryProfileStore();await store.recordPortalAction(owner,action());
  const backup=await store.exportData();delete backup.portalTrail;
  await store.importData(backup);
  assert.equal(portalTrailView(await store.getPortalDestination(owner,'baltimore')).saved,true);
  const empty=createMemoryDiscoveryProfileStore();await store.importData(await empty.exportData());
  assert.equal((await store.listPortalTrail(owner)).items.length,0);
  assert.equal(await store.rollbackLastImport(),true);
  assert.equal(portalTrailView(await store.getPortalDestination(owner,'baltimore')).saved,true);
});
test('Malformed imported Trail cannot erase existing Journal or pending choices',async()=>{
  const store=createMemoryDiscoveryProfileStore();await store.recordPortalAction(owner,action());
  const before=await store.exportData(),bad=structuredClone(before);
  bad.portalTrail[0].pending.saved.kind='visited';
  await assert.rejects(store.importData(bad),/backup/);
  assert.deepEqual(await store.exportData(),before);
});
