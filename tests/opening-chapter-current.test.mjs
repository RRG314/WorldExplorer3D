import test from 'node:test';
import assert from 'node:assert/strict';
import { FIRST_BEARINGS, beginOpeningChapter, normalizeOpeningChapter, projectOpeningChapter, finishOpeningChapter, openingChapterBadge } from '../app/js/campaign/first-bearings.js';
import { createMemoryDiscoveryProfileStore } from '../app/js/discovery/profile-store.js';

const location = { regionId: 'baltimore', regionLabel: 'Baltimore', environment: 'EARTH' };
const observation = (id = 'one', changes = {}) => ({ claimId: `claim:${id}`, catalogId: `catalog:${id}`,
  regionId: location.regionId, regionLabel: location.regionLabel, environment: 'EARTH',
  activityId: 'nature-observe', family: 'wildlife-record', name: 'Harbor observation', collectedAt: 2000, ...changes });
const evidence = changes => ({ eventId: 'event:claim:one', sourceSystem: 'field', eventType: 'discovery-recorded',
  resolution: 'recorded', environment: 'EARTH', regionId: 'baltimore', occurredAt: 2000, name: 'Harbor observation', ...changes });

test('opening chapter requires explicit valid Earth acceptance and preserves an existing choice', () => {
  assert.equal(normalizeOpeningChapter().phase, 'available');
  assert.throws(() => beginOpeningChapter({}, { ...location, environment: 'SPACE' }, 1000), /Earth/);
  assert.throws(() => beginOpeningChapter({}, { ...location, regionId: '' }, 1000), /Earth/);
  const chapter = beginOpeningChapter({}, location, 1000);
  assert.equal(chapter.phase, 'active');
  assert.deepEqual(beginOpeningChapter(chapter, { ...location, regionId: 'other' }, 4000), chapter);
});

test('arrivals, prior discoveries, foreign regions and failed actions cannot complete fieldwork', () => {
  const chapter = beginOpeningChapter({}, location, 1000);
  for (const patch of [{sourceSystem:'travel'}, {eventType:'world-visited'}, {resolution:'failed'},
    {environment:'MOON'}, {regionId:'elsewhere'}, {occurredAt:999}, {eventId:''}]) {
    assert.deepEqual(projectOpeningChapter(chapter,evidence(patch)), chapter);
  }
  assert.equal(projectOpeningChapter({}, evidence()).phase, 'available');
});

test('first accepted evidence stays pinned; only review of that record finishes the chapter', () => {
  const active = beginOpeningChapter({},location,1000);
  const review = projectOpeningChapter(active,evidence());
  assert.equal(review.phase,'review');
  assert.deepEqual(projectOpeningChapter(review,evidence({eventId:'different'})), review);
  assert.throws(()=>finishOpeningChapter(review,evidence({eventId:'different'}),3000),/Review/);
  assert.throws(()=>finishOpeningChapter(review,null,3000),/Review/);
  const complete=finishOpeningChapter(review,evidence(),3000);
  assert.equal(complete.phase,'complete');
  assert.equal(openingChapterBadge(complete).id,'first-bearings');
  assert.equal(openingChapterBadge(review),null);
});

test('future campaign state survives unrelated profile saves and cannot be downgraded by gameplay', async () => {
  const future={schemaVersion:9,phase:'active',newMeaning:{preserve:true}};
  const store=createMemoryDiscoveryProfileStore({profile:{openingChapter:future}});
  await store.saveProfile(p=>({...p,tutorials:{newPreference:true}}));
  await store.recordObservation(observation());
  assert.deepEqual((await store.getProfile()).openingChapter,future);
  await assert.rejects(store.startOpeningChapter(location,1000),/newer version/);
  await assert.rejects(store.completeOpeningChapter('event:claim:one',3000),/newer version/);
});

test('a committed observation advances the chapter; repeated acceptance preserves progress and inventory', async () => {
  const store=createMemoryDiscoveryProfileStore();
  const before=await store.getProfile();
  await store.startOpeningChapter(location,1000);
  const recorded=await store.recordObservation(observation());
  assert.equal(recorded.profile.openingChapter.phase,'review');
  assert.equal(recorded.profile.openingChapter.eventId,recorded.event.eventId);
  assert.deepEqual((await store.startOpeningChapter(location,4000)).openingChapter,recorded.profile.openingChapter);
  assert.deepEqual(await store.listItems(),[]);
  assert.deepEqual(recorded.profile.favoriteToolIds,before.favoriteToolIds);
});

test('collection is a valid alternative and receipt restoration does not invent a new campaign action', async () => {
  const store=createMemoryDiscoveryProfileStore();
  await store.startOpeningChapter(location,1000);
  await store.recordObservation(observation('restore',{receiptRestore:true}));
  assert.equal((await store.getProfile()).openingChapter.phase,'active');
  const saved=await store.collect(observation('collected',{instanceId:'item:one'}));
  assert.equal(saved.profile.openingChapter.phase,'review');
  assert.equal((await store.listItems()).length,1);
});

test('chapter completion commits one badge and one memory without duplicating points or practice', async () => {
  const store=createMemoryDiscoveryProfileStore();
  await store.startOpeningChapter(location,1000);
  const record=await store.recordObservation(observation());
  const before=await store.getProfile();
  const outcomes=await Promise.all(Array.from({length:8},()=>store.completeOpeningChapter(record.event.eventId,3000)));
  assert.equal(outcomes.filter(row=>row.recorded).length,1);
  const after=await store.getProfile();
  assert.deepEqual(after.explorerProgress,before.explorerProgress);
  assert.deepEqual(after.characterState,before.characterState);
  assert.equal(openingChapterBadge(after.openingChapter).id,'first-bearings');
  const receipts=(await store.listEvents()).filter(event=>event.eventId===FIRST_BEARINGS.receiptId);
  assert.equal(receipts.length,1);
  assert.equal(receipts[0].metadata.evidenceEventId,record.event.eventId);
});

test('generic story events cannot substitute for the field recording owner', async () => {
  const store=createMemoryDiscoveryProfileStore();
  await store.startOpeningChapter(location,1000);
  await store.recordExplorerEvent({...evidence(), eventId:'story:lookalike'});
  assert.equal((await store.getProfile()).openingChapter.phase,'active');
  await assert.rejects(store.completeOpeningChapter('story:lookalike',3000),/Review/);
});

test('full backup restores active review beyond recent Journal history and preserves unrelated progress', async () => {
  const store=createMemoryDiscoveryProfileStore();
  await store.startOpeningChapter(location,1000);
  const record=await store.recordObservation(observation());
  for(let i=0;i<120;i++)await store.recordExplorerEvent({eventId:`travel:${i}`,eventType:'world-visited',sourceId:String(i),occurredAt:3000+i});
  assert.equal((await store.listEvents(100)).some(event=>event.eventId===record.event.eventId),false);
  const restored=createMemoryDiscoveryProfileStore();
  await restored.importData(await store.exportData());
  assert.equal((await restored.getEventsById([record.event.eventId])).length,1);
  await restored.completeOpeningChapter(record.event.eventId,4000);
  const backup=await restored.exportData();
  await store.importData(backup);
  assert.equal((await store.getProfile()).openingChapter.phase,'complete');
  assert.deepEqual((await store.getProfile()).explorerProgress,backup.profile.explorerProgress);
});

test('damaged campaign backup is rejected before replacing current records', async () => {
  const store=createMemoryDiscoveryProfileStore();
  await store.startOpeningChapter(location,1000);
  const record=await store.recordObservation(observation());
  await store.completeOpeningChapter(record.event.eventId,3000);
  const original=await store.exportData();
  for(const removeId of [record.event.eventId,FIRST_BEARINGS.receiptId]) {
    const damaged={...original,events:original.events.filter(event=>event.eventId!==removeId)};
    await assert.rejects(store.importData(damaged),/backup is incomplete/);
    assert.deepEqual((await store.exportData()).events,original.events);
  }
});

test('failed review does not alter chapter, Journal, inventory or rewards', async () => {
  const store=createMemoryDiscoveryProfileStore();
  await store.startOpeningChapter(location,1000);
  await store.recordObservation(observation());
  const before=await store.exportData();
  await assert.rejects(store.completeOpeningChapter('missing',3000),/Review/);
  const after=await store.exportData();
  for(const key of ['events','items','fieldGuide'])assert.deepEqual(after[key],before[key]);
  assert.deepEqual(after.profile.openingChapter,before.profile.openingChapter);
});
