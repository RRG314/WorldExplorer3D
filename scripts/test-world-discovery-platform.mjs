import assert from 'node:assert/strict';
import { BUILTIN_DISCOVERY_CATALOGS, validateDiscoveryCatalogs } from '../app/js/discovery/catalog.js?v=1';
import { createEnvironmentFixture } from '../app/js/discovery/environment-context.js?v=1';
import { createDetectorSession } from '../app/js/discovery/detector-session.js?v=1';
import { createCompanionInstance, feedCompanion, resolveCompanionTravelPolicy, setActiveCompanion, trainCompanion } from '../app/js/discovery/companions.js?v=1';
import { compileFieldActivityPlan, createFieldActivitySession } from '../app/js/discovery/field-activities.js?v=1';
import {
  compileEncounterPlan,
  compileGeographicEligibility,
  compileWorldInteractionPublication,
  resolveContextActions
} from '../app/js/discovery/model.js?v=1';
import { createMemoryDiscoveryProfileStore } from '../app/js/discovery/profile-store.js?v=1';
import { FIELD_RANKS, fieldProgress, slotAvailableAtProgress } from '../app/js/discovery/pacing.js?v=1';
import { createDiscoveryTelemetryEvent } from '../app/js/discovery/telemetry.js?v=1';
import { explorerProgressSnapshot } from '../app/js/discovery/explorer-events.js?v=1';
import { RELEASED_EXPLORER_TOOLS, explorerGoalSnapshot, explorerToolProgress, regionalProgressSnapshot } from '../app/js/discovery/explorer-goals.js?v=1';
import { createExplorationEntitlementService, resolveExcavationTool } from '../app/js/discovery/tools.js?v=1';
import { tutorialForActivity } from '../app/js/discovery/tutorials.js?v=1';
import { compileAmbientWildlifePlan } from '../app/js/discovery/wildlife-runtime.js?v=1';
import { resolveCompanionFollowTarget } from '../app/js/discovery/companion-runtime.js?v=1';

const validation = validateDiscoveryCatalogs(BUILTIN_DISCOVERY_CATALOGS);
assert.equal(validation.ok, true, validation.errors.join('\n'));

const fixtureNames = ['downtown', 'suburb', 'field', 'forest', 'river', 'beach', 'mountain', 'desert', 'outcrop', 'fossil-formation', 'open-ocean'];
const results = new Map();
for (const name of fixtureNames) {
  const environment = createEnvironmentFixture(name);
  const eligibility = compileGeographicEligibility(environment);
  const interaction = compileWorldInteractionPublication(environment, eligibility);
  const actions = resolveContextActions({ environment, interaction, position: { x: 0, z: 0 }, limit: 20 });
  const encounters = compileEncounterPlan(environment, eligibility);
  const fieldActivities = compileFieldActivityPlan(environment, eligibility);
  const wildlife = compileAmbientWildlifePlan(environment);
  results.set(name, { environment, eligibility, interaction, actions, encounters, fieldActivities, wildlife });
  assert.equal(actions.some((action) => action.id === 'inspect'), true, `${name} must preserve a universal Inspect action`);
  assert.equal(environment.diagnostics.generatedWithAdditionalProviderQueries, false);
}

assert.equal(results.get('downtown').actions.some((action) => action.id === 'geology-inspect'), false, 'generic downtown must not claim geology');
assert.equal(results.get('downtown').actions.some((action) => action.id === 'beachcomb'), false, 'downtown must not offer beachcombing');
assert.equal(results.get('river').actions.some((action) => action.id === 'pan-sediment'), true, 'river must offer virtual panning');
assert.equal(results.get('river').actions.some((action) => action.id === 'fish'), true, 'river must offer fishing');
assert.equal(results.get('beach').actions.some((action) => action.id === 'beachcomb'), true, 'beach must offer beachcombing');
assert.equal(results.get('mountain').actions.some((action) => action.id === 'geology-inspect'), true, 'mountain must offer geology inspection');
assert.equal(results.get('open-ocean').actions.some((action) => action.id === 'metal-detect'), false, 'open ocean must not offer metal detecting');
assert.equal(results.get('open-ocean').encounters.slots.length, 0, 'open ocean must not generate detector targets');
assert.equal(results.get('fossil-formation').fieldActivities.slots.some((slot) => slot.activityId === 'fossil-document'), true, 'fossil formation must yield a documented fossil activity');
assert.equal(results.get('downtown').fieldActivities.slots.some((slot) => slot.activityId === 'fossil-document'), false, 'downtown must not yield fossil records');
assert.equal(results.get('river').fieldActivities.slots.some((slot) => slot.activityId === 'pan-sediment'), true, 'river must produce a panning record');
assert.equal(results.get('forest').fieldActivities.slots.some((slot) => slot.activityId === 'wildlife-track'), true, 'forest must produce a wildlife clue');
assert.ok(results.get('forest').wildlife.actors.length <= 8, 'ambient wildlife must remain bounded');
assert.equal(results.get('forest').wildlife.diagnostics.generatedWithAdditionalProviderQueries, false);
assert.deepEqual(compileAmbientWildlifePlan(results.get('forest').environment).actors, results.get('forest').wildlife.actors, 'ambient wildlife must remain deterministic');
const filteredWildlife = compileAmbientWildlifePlan(results.get('downtown').environment, {
  isPositionEligible: (position) => position.x > 0
});
assert.equal(filteredWildlife.actors.every((actor) => actor.home.x > 0), true, 'ambient wildlife must search deterministic alternatives outside obstructed geometry');
assert.equal(compileAmbientWildlifePlan(results.get('downtown').environment, {
  isPositionEligible: () => false
}).actors.length, 0, 'fully obstructed cells must not publish unreachable wildlife encounters');

const firstPlan = results.get('field').encounters;
const repeatedPlan = compileEncounterPlan(results.get('field').environment, results.get('field').eligibility);
assert.deepEqual(repeatedPlan.slots, firstPlan.slots, 'encounter identity must remain deterministic');
assert.ok(firstPlan.slots.length > 0, 'field fixture should generate detector targets');
assert.equal(firstPlan.slots.length % 3, 0, 'compatible detector cells should publish three finite opportunities');
const obstructionFilteredPlan = compileEncounterPlan(
  results.get('field').environment,
  results.get('field').eligibility,
  BUILTIN_DISCOVERY_CATALOGS,
  { isPositionEligible: (position) => position.x > 0 }
);
assert.equal(obstructionFilteredPlan.slots.length, firstPlan.slots.length, 'detector planning should search deterministic alternatives around blocked geometry');
assert.equal(obstructionFilteredPlan.slots.every((entry) => entry.position.x > 0), true, 'detector targets must honor the runtime surface/building predicate');
const fullyBlockedPlan = compileEncounterPlan(
  results.get('field').environment,
  results.get('field').eligibility,
  BUILTIN_DISCOVERY_CATALOGS,
  { isPositionEligible: () => false }
);
assert.equal(fullyBlockedPlan.slots.length, 0, 'a fully obstructed cell must not publish unreachable detector targets');
const fieldActivityPlan = results.get('field').fieldActivities;
assert.ok(fieldActivityPlan.slots.some((slot) => slot.slotIndex === 1), 'field activity cells should have a follow-up opportunity');
const obstructionFilteredFieldActivities = compileFieldActivityPlan(
  results.get('field').environment,
  results.get('field').eligibility,
  { isPositionEligible: (position) => position.z < 0 }
);
assert.ok(obstructionFilteredFieldActivities.slots.length > 0, 'field activity planning should retain reachable alternatives');
assert.equal(obstructionFilteredFieldActivities.slots.every((entry) => entry.position.z < 0), true, 'field activity targets must honor the runtime surface/building predicate');
assert.equal(FIELD_RANKS.length, 4);
assert.equal(fieldProgress({ collectionCount: 0 }).rankId, 'trailhead');
assert.equal(fieldProgress({ collectionCount: 3 }).rankId, 'surveyor');
assert.equal(slotAvailableAtProgress({ rarityBand: 'rare' }, fieldProgress({ collectionCount: 0 })), false);
assert.equal(slotAvailableAtProgress({ rarityBand: 'rare' }, fieldProgress({ collectionCount: 10 })), true);

const entitlement = createExplorationEntitlementService();
assert.equal(entitlement.snapshot().mode, 'free-testing');
assert.equal(entitlement.snapshot().purchaseUiVisible, false);
assert.equal(entitlement.canUseTool('metal-detector').allowed, true);
assert.equal(resolveExcavationTool('moderate', ['hand-trowel']).allowed, false);
assert.equal(resolveExcavationTool('moderate', ['field-shovel']).allowed, true);
const startingTools = explorerToolProgress({ explorerProgress: { points: 0 } });
const pathfinderTools = explorerToolProgress({ explorerProgress: { points: 8 } });
const fieldExplorerTools = explorerToolProgress({ explorerProgress: { points: 20 } });
assert.deepEqual(startingTools.unlockedToolIds, ['field-lens', 'field-camera', 'metal-detector', 'hand-trowel', 'fishing-rod']);
assert.equal(pathfinderTools.unlockedToolIds.includes('rock-hammer'), true, 'Pathfinder must unlock meaningful geology capability');
assert.equal(pathfinderTools.unlockedToolIds.includes('field-binoculars'), true, 'Pathfinder must unlock wildlife capability');
assert.equal(fieldExplorerTools.unlockedToolIds.length, RELEASED_EXPLORER_TOOLS.length, 'Field Explorer must unlock the released field kit');
const starterEntitlement = createExplorationEntitlementService({ unlockedToolIds: startingTools.unlockedToolIds, visibleToolIds: RELEASED_EXPLORER_TOOLS });
assert.equal(starterEntitlement.canUseTool('rock-hammer').reason, 'progression-locked');
assert.equal(starterEntitlement.listLockedTools().some((tool) => tool.id === 'field-shovel'), true);
assert.deepEqual(tutorialForActivity('metal-detect', BUILTIN_DISCOVERY_CATALOGS).steps, [
  'Move slowly across the virtual area.',
  'The signal grows stronger as you approach a deterministic buried target.',
  'Refine the signal, then excavate with the tool that matches its depth.'
]);

const profileStore = createMemoryDiscoveryProfileStore();
const slot = firstPlan.slots[0];
const record = {
  instanceId: `item:${slot.id}`,
  claimId: slot.claimId,
  catalogId: slot.catalogId,
  discipline: 'history-service',
  regionId: firstPlan.worldIdentity.id,
  evidenceClass: slot.evidenceClass,
  collectedAt: 1
};
const collected = await profileStore.collect(record);
assert.equal(collected.collected, true);
assert.equal((await profileStore.collect(record)).reason, 'already-claimed');
assert.equal((await profileStore.getProfile()).collectionCount, 1);
assert.equal((await profileStore.listItems()).length, 1);

const sessionStore = createMemoryDiscoveryProfileStore();
const detector = createDetectorSession({
  plan: firstPlan,
  claimedIds: [],
  availableToolIds: ['metal-detector', 'hand-trowel', 'field-shovel']
});
const detectorTarget = firstPlan.slots.find((entry) => entry.rarityBand === 'common');
assert.ok(detectorTarget, 'field fixture should keep a common starter target available');
assert.equal(detector.sweep(detectorTarget.position), true);
detector.update(detectorTarget.position, 0.1);
assert.equal(detector.snapshot(detectorTarget.position).phase, 'signal');
assert.equal(detector.refine(detectorTarget.position), true);
assert.equal(detector.snapshot(detectorTarget.position).phase, 'classified');
assert.equal(detector.excavate(), true);
detector.update(detectorTarget.position, 1.3);
assert.equal(detector.snapshot(detectorTarget.position).phase, 'revealed');
assert.equal(await detector.collect(sessionStore), true);
assert.equal(detector.snapshot(detectorTarget.position).phase, 'collected');
assert.equal((await sessionStore.listItems()).length, 1);

const fieldStore = createMemoryDiscoveryProfileStore();
const forest = results.get('forest');
const fieldSession = createFieldActivitySession({ plan: forest.fieldActivities });
const fieldTarget = forest.fieldActivities.slots.find((entry) => entry.activityId === 'wildlife-track' && entry.slotIndex === 0);
assert.equal(fieldSession.begin('wildlife-track', forest.environment, { x: 0, z: 0 }), true);
fieldSession.update(.1, fieldTarget.position);
fieldSession.update(1.9, fieldTarget.position);
assert.equal(fieldSession.snapshot().phase, 'revealed');
assert.equal(await fieldSession.record(fieldStore), true);
assert.equal(fieldSession.snapshot().phase, 'recorded');
assert.equal((await fieldStore.listItems()).length, 0, 'wildlife observations must not become owned Collection items');
assert.equal((await fieldStore.listEvents())[0].evidenceClass, 'procedural-game-encounter');
assert.equal((await fieldStore.listFieldGuide()).length, 1);
assert.equal((await fieldStore.getProfile()).explorerProgress.points, 3);

const repeatStore = createMemoryDiscoveryProfileStore();
const observationBase = {
  catalogId: 'woodland-track-clue', name: 'White-tailed Deer Sign', family: 'wildlife-clue',
  discipline: 'nature', activityId: 'wildlife-track', evidenceClass: 'procedural-game-encounter'
};
const firstObservation = await repeatStore.recordObservation({ ...observationBase, claimId: 'claim:forest:a', regionId: 'forest-a', regionLabel: 'North Woods' });
const repeatedObservation = await repeatStore.recordObservation({ ...observationBase, claimId: 'claim:forest:b', regionId: 'forest-a', regionLabel: 'North Woods' });
const regionalObservation = await repeatStore.recordObservation({ ...observationBase, claimId: 'claim:forest:c', regionId: 'forest-b', regionLabel: 'South Woods' });
assert.equal(firstObservation.progress.points, 3, 'a new identification should earn Explorer credit');
assert.equal(repeatedObservation.progress.points, 0, 'a repeat in the same region should document without farming rank');
assert.equal(regionalObservation.progress.points, 2, 'new-region evidence should earn regional Explorer credit');
assert.equal((await repeatStore.listEvents()).length, 3, 'every completed action should remain in the Journal');
assert.equal((await repeatStore.listItems()).length, 0, 'observations should never leak into Collection');
assert.deepEqual((await repeatStore.listFieldGuide())[0].regionLabels.sort(), ['North Woods', 'South Woods']);
assert.equal((await repeatStore.listFieldGuide())[0].observations, 3);
assert.equal((await repeatStore.getProfile()).explorerProgress.points, 5);
const repeatProfile = await repeatStore.getProfile();
const currentGoal = explorerGoalSnapshot({ profile: repeatProfile, guide: await repeatStore.listFieldGuide(), events: await repeatStore.listEvents(), regionId: 'forest-a', regionLabel: 'North Woods' });
assert.equal(currentGoal.id, 'first-collection', 'goals should teach the difference between records and acquired specimens');
const regional = regionalProgressSnapshot({ guide: await repeatStore.listFieldGuide(), events: await repeatStore.listEvents(), regionId: 'forest-a', regionLabel: 'North Woods' });
assert.equal(regional.journalEvents, 2);
assert.equal(regional.categories.find((entry) => entry.id === 'nature').current, 1);

const hound = createCompanionInstance('trail-hound', { worldIdentity: 'fixture:forest', discoveryId: 'adoption-1', adoptedAt: 1 });
const fox = createCompanionInstance('woodland-fox', { worldIdentity: 'fixture:forest', discoveryId: 'unlock-1', adoptedAt: 1 });
const pigeon = createCompanionInstance('city-pigeon', { worldIdentity: 'fixture:downtown', discoveryId: 'bird-unlock-1', adoptedAt: 1 });
assert.equal(pigeon.behaviorArchetype, 'air-follower', 'bird companions must preserve airborne behavior in their durable instance');
assert.deepEqual(resolveCompanionFollowTarget({ x: 10, z: 20, yaw: 0 }), { x: 11.8, z: 19.15 }, 'a north-facing ground companion must follow beside and behind the player');
const eastFollower = resolveCompanionFollowTarget({ x: 10, z: 20, yaw: Math.PI / 2 });
assert.ok(Math.abs(eastFollower.x - 9.15) < 1e-9 && Math.abs(eastFollower.z - 18.2) < 1e-9, 'an east-facing ground companion must preserve the same local side/back formation');
const active = setActiveCompanion([hound, fox], fox.instanceId);
assert.equal(active.filter((entry) => entry.active).length, 1, 'only one companion may be active');
assert.equal(feedCompanion(hound).care.fullness > hound.care.fullness, true);
assert.equal(trainCompanion(hound, 'find').training.find, 1);
assert.deepEqual(resolveCompanionTravelPolicy(fox, 'plane', 'EARTH'), { visible: false, state: 'safe-with-vehicle' });
await fieldStore.saveCompanion(hound);
await fieldStore.saveCompanion(fox);
const persistedActive = await fieldStore.setActiveCompanion(fox.instanceId);
assert.equal(persistedActive.filter((entry) => entry.active).length, 1);
assert.equal((await fieldStore.getProfile()).activeCompanionId, fox.instanceId);

const fieldProfile = await fieldStore.getProfile();
assert.equal(explorerProgressSnapshot(fieldProfile.explorerProgress).rankLabel, 'Trailhead');

const telemetry = createDiscoveryTelemetryEvent('discovery_recorded', {
  activityId: 'metal-detect', catalogFamily: 'history-service', discipline: 'history-service',
  contextBands: ['urban', 'secret-sensitive-site', 'park'], latitude: 39.2904, longitude: -76.6122,
  claimId: 'claim:must-not-leak', freeText: 'must not leave the device', result: 'collected'
});
assert.deepEqual(telemetry.contextBands, ['urban', 'park']);
assert.equal('latitude' in telemetry, false);
assert.equal('longitude' in telemetry, false);
assert.equal('claimId' in telemetry, false);
assert.equal('freeText' in telemetry, false);

console.log(JSON.stringify({
  ok: true,
  fixtures: fixtureNames.length,
  tools: BUILTIN_DISCOVERY_CATALOGS.tools.length,
  activities: BUILTIN_DISCOVERY_CATALOGS.activities.length,
  finds: BUILTIN_DISCOVERY_CATALOGS.finds.length,
  deterministicFieldSlots: firstPlan.slots.length
}, null, 2));
