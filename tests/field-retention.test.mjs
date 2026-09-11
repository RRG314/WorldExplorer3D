import assert from 'node:assert/strict';
import test from 'node:test';
import { BALTIMORE_ECOLOGY_PACK } from '../app/js/discovery/ecology/baltimore-pack.js';
import { createFieldRetentionSnapshot, localDayKey, localWeekKey } from '../app/js/discovery/field-retention.js';
import { createMemoryDiscoveryProfileStore } from '../app/js/discovery/profile-store.js';

const REGION_ID = 'world:baltimore:retention';
const NOW = new Date(2026, 7, 25, 12, 0, 0).getTime();

function taxonRecord({ claimId, catalogId, name, group, activityId, evidenceContractId, occurredAt }) {
  return {
    claimId,
    catalogId,
    name,
    family: `${group}-taxon`,
    taxonGroup: group,
    stableTaxonId: `gbif-backbone-2023:${catalogId.replace('taxon-', '')}`,
    regionalPackId: BALTIMORE_ECOLOGY_PACK.id,
    regionalPackVersion: BALTIMORE_ECOLOGY_PACK.version,
    activityId,
    evidenceContractId,
    evidencePayload: { contractId: evidenceContractId, procedural: true, livePresenceClaim: false },
    discipline: 'nature',
    regionId: REGION_ID,
    regionLabel: 'Baltimore',
    worldIdentity: REGION_ID,
    evidenceClass: 'procedural-game-encounter',
    collectedAt: occurredAt
  };
}

test('typed regional records project into persistent life lists and evidence specialties', async () => {
  const store = createMemoryDiscoveryProfileStore();
  const records = [
    taxonRecord({ claimId: 'retention-1', catalogId: 'taxon-5218786', name: 'Raccoon', group: 'mammal', activityId: 'community-survey', evidenceContractId: 'community', occurredAt: NOW - 2_000 }),
    taxonRecord({ claimId: 'retention-2', catalogId: 'taxon-9761484', name: 'Mallard', group: 'bird', activityId: 'photograph', evidenceContractId: 'photography', occurredAt: NOW - 1_000 }),
    taxonRecord({ claimId: 'retention-3', catalogId: 'taxon-5133088', name: 'Monarch', group: 'insect-arachnid', activityId: 'insect-macro', evidenceContractId: 'insect-macro', occurredAt: NOW })
  ];
  for (const record of records) assert.equal((await store.recordObservation(record)).recorded, true);
  const guide = await store.listFieldGuide();
  const events = await store.listEvents();
  const snapshot = createFieldRetentionSnapshot({ now: NOW, guide, events, regionId: REGION_ID, regionalPack: BALTIMORE_ECOLOGY_PACK });
  assert.equal(snapshot.lifeList.identified, 3);
  assert.equal(snapshot.lifeList.target, 60);
  assert.equal(snapshot.lifeList.groups.find((entry) => entry.id === 'mammal').current, 1);
  assert.equal(snapshot.evidenceSpecialties.find((entry) => entry.id === 'community').records, 1);
  assert.equal(snapshot.evidenceSpecialties.find((entry) => entry.id === 'photography').records, 1);
  assert.equal(snapshot.daily.objectives.every((entry) => entry.complete), true);
  assert.equal(snapshot.weekly.objectives[0].current, 3);
  assert.equal(snapshot.seasonal.truthClass, 'catalog-season-compatible-not-live-presence');
  assert.equal(snapshot.returnFocus.noPenalty, true);
  assert.match(snapshot.returnFocus.detail, /no streak/i);
  assert.equal(events[0].regionalPackId, BALTIMORE_ECOLOGY_PACK.id);
  assert.equal(events[0].evidencePayload.livePresenceClaim, false);
  assert.equal(guide[0].evidenceContractIds.length, 1);
});

test('daily and weekly keys roll forward without reducing permanent progress', async () => {
  const store = createMemoryDiscoveryProfileStore();
  await store.recordObservation(taxonRecord({
    claimId: 'older-record', catalogId: 'taxon-5219243', name: 'Red fox', group: 'mammal',
    activityId: 'photograph', evidenceContractId: 'photography', occurredAt: NOW - 3 * 86_400_000
  }));
  const guide = await store.listFieldGuide();
  const events = await store.listEvents();
  const snapshot = createFieldRetentionSnapshot({ now: NOW, guide, events, regionId: REGION_ID, regionalPack: BALTIMORE_ECOLOGY_PACK });
  assert.equal(localDayKey(snapshot.generatedAt), localDayKey(NOW));
  assert.equal(snapshot.daily.objectives[0].current, 0);
  assert.equal(snapshot.lifeList.identified, 1, 'permanent life-list progress must survive a missed day');
  assert.equal(snapshot.returnFocus.daysAway, 3);
  assert.match(snapshot.returnFocus.detail, /Nothing was lost/);
  assert.notEqual(localWeekKey(events[0].occurredAt), localWeekKey(NOW));
  assert.equal(snapshot.weekly.objectives[0].current, 0);
});

test('seasonal surveys count only taxa compatible with the current catalog season', () => {
  const winterNow = new Date(2026, 0, 15, 12, 0, 0).getTime();
  const guide = [
    { catalogId: 'taxon-5218786', family: 'mammal-taxon', taxonGroup: 'mammal', regionalPackId: BALTIMORE_ECOLOGY_PACK.id, regions: [REGION_ID], firstObservedAt: winterNow },
    { catalogId: 'taxon-5792026', family: 'insect-arachnid-taxon', taxonGroup: 'insect-arachnid', regionalPackId: BALTIMORE_ECOLOGY_PACK.id, regions: [REGION_ID], firstObservedAt: winterNow }
  ];
  const winter = createFieldRetentionSnapshot({ now: winterNow, guide, events: [], regionId: REGION_ID, regionalPack: BALTIMORE_ECOLOGY_PACK });
  assert.equal(winter.seasonal.label, 'Winter Regional Survey');
  assert.equal(winter.seasonal.objective.current, 1, 'May/June periodical cicada must not count in winter');
  assert.ok(winter.seasonal.eligibleTaxa > 0);
});
