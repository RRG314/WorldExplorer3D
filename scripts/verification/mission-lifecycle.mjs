import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BALTIMORE_ECOLOGY_PACK } from '../../app/js/discovery/ecology/baltimore-pack.js';
import { createFieldRetentionSnapshot } from '../../app/js/discovery/field-retention.js';
import {
  MINIMUM_5_0_MISSION_SCOPE,
  MISSION_LIFECYCLE_SCHEMA_VERSION,
  createMissionProgramSnapshot,
  dedupeMissionProgressEvents
} from '../../app/js/discovery/mission-lifecycle.js';

const now = new Date(2026, 7, 26, 12, 0, 0).getTime();
const regionId = 'world:baltimore:cp6';
const event = (id, catalogId, contract, offset = 0, overrides = {}) => ({
  type: 'ExplorerEvent',
  schemaVersion: 1,
  eventId: `event:${id}`,
  eventType: 'discovery-recorded',
  claimId: id,
  occurredAt: now + offset,
  activityId: contract === 'photography' ? 'photograph' : contract === 'insect-macro' ? 'insect-macro' : 'community-survey',
  evidenceContractId: contract,
  catalogId,
  regionId,
  worldIdentity: regionId,
  evidencePayload: { movementSource: 'manual_direct', livePresenceClaim: false },
  progress: { points: 3, reason: 'new-identification' },
  ...overrides
});

const events = [
  event('raccoon', 'taxon-5218786', 'community', -3_000),
  event('mallard', 'taxon-9761484', 'photography', -2_000),
  event('monarch', 'taxon-5133088', 'insect-macro', -1_000),
  event('raccoon', 'taxon-5218786', 'community', -3_000),
  event('other-region', 'taxon-5219243', 'observation', -500, { regionId: 'world:other' })
];
const guide = [
  ['taxon-5218786', 'mammal'],
  ['taxon-9761484', 'bird'],
  ['taxon-5133088', 'insect-arachnid']
].map(([catalogId, taxonGroup], index) => ({
  catalogId,
  family: `${taxonGroup}-taxon`,
  taxonGroup,
  regionalPackId: BALTIMORE_ECOLOGY_PACK.id,
  regions: [regionId],
  firstObservedAt: now - (3 - index) * 1_000
}));

const deduped = dedupeMissionProgressEvents(events);
assert.equal(deduped.acceptedCount, 4);
assert.equal(deduped.duplicateCount, 1);
assert.equal(new Set(deduped.accepted.map((entry) => entry.eventId)).size, 4);

const retention = createFieldRetentionSnapshot({
  now,
  events,
  guide,
  regionId,
  regionalPack: BALTIMORE_ECOLOGY_PACK
});
assert.equal(retention.schemaVersion, 2);
assert.equal(retention.missionAuthority.authority, 'field-mission-lifecycle-v1');
assert.deepEqual(retention.missionAuthority.excludedSystems, ['crafting', 'currency', 'reward-grade-economy']);
assert.equal(retention.missionAuthority.duplicateEventCount, 1);
assert.equal(retention.daily.type, 'MissionProgramSnapshot');
assert.equal(retention.daily.programType, 'field-today');
assert.equal(retention.daily.phase, 'completed');
assert.equal(retention.weekly.programType, 'weekly-expedition');
assert.equal(retention.weekly.phase, 'in-progress');
assert.equal(retention.seasonal.programType, 'seasonal-regional-survey');
assert.equal(retention.seasonal.truthClass, 'catalog-season-compatible-not-live-presence');
assert.equal(retention.daily.progressEvents.acceptedCount, 3, 'other-region and duplicate events must not count');
assert.equal(retention.daily.reward.available, true);
assert.equal(retention.daily.reward.currency, false);
assert.equal(retention.daily.reward.craftingIngredient, false);
assert.equal(retention.daily.reward.competitive, false);
assert.equal(retention.daily.reward.pointsGranted, 0);
assert.equal(retention.daily.cancellation.losesPermanentProgress, false);
assert.equal(retention.daily.replayPolicy.missedPeriodPenalty, false);
assert.equal(retention.daily.multiplayer.sharedCompletion, false);
assert.equal(retention.daily.multiplayer.contributionRequiresOwnEvidence, true);
assert.equal(retention.daily.versioning.destructiveMigration, false);
assert.match(retention.daily.versioning.migration, /reproject/);
assert.match(retention.daily.versioning.rollback, /restore-previous/);

const noPack = createFieldRetentionSnapshot({ now, events, guide, regionId, regionalPack: null });
assert.equal(noPack.seasonal.phase, 'ineligible');
assert.deepEqual(noPack.seasonal.eligibility.reasons, ['reviewed-regional-ecology-pack-unavailable']);

const cancelled = createMissionProgramSnapshot({
  id: 'daily:cancelled-example',
  programType: 'field-today',
  label: 'Cancelled field session',
  objectives: [{ id: 'record', label: 'Save one record', current: 0, target: 1 }],
  cancellation: { reason: 'player-ended-session', resumable: true },
  progressEvents: []
});
assert.equal(cancelled.phase, 'cancelled');
assert.equal(cancelled.cancellation.resumable, true);
assert.equal(cancelled.cancellation.losesPermanentProgress, false);

const [claims, explorerEvents] = await Promise.all([
  readFile('config/public-feature-claims-5.0.json', 'utf8').then(JSON.parse),
  readFile('app/js/discovery/explorer-events.js', 'utf8')
]);
assert.equal(MISSION_LIFECYCLE_SCHEMA_VERSION, 1);
assert.equal(MINIMUM_5_0_MISSION_SCOPE.competitiveRewards, false);
assert.match(explorerEvents, /missionProgress:\s*true/);
const forbiddenClaimRules = claims.forbiddenPublicPatterns.map((rule) => new RegExp(rule.pattern, 'i'));
for (const forbiddenClaim of ['unified economy', 'crafting system', 'earn currency', 'spend currency']) {
  assert.ok(
    forbiddenClaimRules.some((rule) => rule.test(forbiddenClaim)),
    `Public claim rules must reject: ${forbiddenClaim}`
  );
}
assert.deepEqual(MINIMUM_5_0_MISSION_SCOPE.excludedSystems, ['crafting', 'currency', 'reward-grade-economy']);
assert.equal(retention.daily.reward.competitive, false);
assert.equal(retention.daily.versioning.destructiveMigration, false);
assert.match(retention.daily.versioning.rollback, /restore-previous/);

console.log(JSON.stringify({
  ok: true,
  contract: 'field-mission-lifecycle-v1',
  schemaVersion: MISSION_LIFECYCLE_SCHEMA_VERSION,
  retainedPrograms: MINIMUM_5_0_MISSION_SCOPE.retainedPrograms,
  excludedSystems: MINIMUM_5_0_MISSION_SCOPE.excludedSystems,
  acceptedEvents: deduped.acceptedCount,
  duplicateEventsRejected: deduped.duplicateCount,
  phases: {
    daily: retention.daily.phase,
    weekly: retention.weekly.phase,
    seasonal: retention.seasonal.phase,
    noPackSeasonal: noPack.seasonal.phase,
    cancelled: cancelled.phase
  },
  reward: retention.daily.reward,
  versioning: retention.daily.versioning
}, null, 2));
