'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  commitSharedExpedition,
  createSharedExpedition,
  joinSharedExpedition,
  rescueIntoSharedExpedition,
  setParticipantConnection,
  setParticipantReady
} = require('../functions/expedition-authority');

function plan() {
  return {
    type: 'InterstellarExpedition', schemaVersion: 1, id: 'expedition-shared-test',
    destinationId: 'proxima-centauri', state: 'traveling', strategicElapsedS: 0, progress: 0,
    ship: { id: 'expedition-shared-test-ship', profileId: 'long-range-research-vessel' },
    propulsionId: 'radiant-plasma-field-drive',
    resources: {
      foodKg: 100, waterKg: 100, powerMWh: 100, propellantKg: 100,
      medicalUnits: 10, maintenanceKg: 50, feedstockKg: 25,
      scienceCargoKg: 0, processingResidueKg: 0
    },
    crew: [{ id: 'crew-one', name: 'Crew One', roles: ['command'] }],
    rescueManifests: [{
      id: 'stranded-survey-team',
      crew: [{ id: 'rescued-engineer', name: 'Rescued Engineer', roles: ['engineering'] }],
      resources: { foodKg: 7, waterKg: 5, maintenanceKg: 3 }
    }],
    log: []
  };
}

test('two human crew share roles, readiness, one revision, and coordinated time', () => {
  let shared = createSharedExpedition({
    roomCode: 'SPACE1', actor: { uid: 'one', displayName: 'One', role: 'command' }, plan: plan(), nowMs: 10
  });
  shared = joinSharedExpedition(shared, {
    actor: { uid: 'two', displayName: 'Two' }, requestedRole: 'engineering', nowMs: 20
  });
  assert.equal(shared.participants.one.role, 'command');
  assert.equal(shared.participants.two.role, 'engineering');

  const advanced = { ...shared.expedition, strategicElapsedS: 50, progress: 0.1,
    resources: { ...shared.expedition.resources, foodKg: 95, waterKg: 96, powerMWh: 98 } };
  assert.throws(() => commitSharedExpedition(shared, {
    uid: 'one', expectedRevision: shared.revision, mutationKind: 'advance', nextExpedition: advanced
  }), /connected_crew_not_ready/);

  shared = setParticipantReady(shared, { uid: 'one', nowMs: 30 });
  shared = setParticipantReady(shared, { uid: 'two', nowMs: 31 });
  shared = commitSharedExpedition(shared, {
    uid: 'one', expectedRevision: 1, mutationKind: 'advance', nextExpedition: advanced,
    activeUids: ['one', 'two'], nowMs: 40
  });
  assert.equal(shared.revision, 2);
  assert.equal(shared.expedition.strategicElapsedS, 50);
  assert.equal(shared.participants.one.readyForRevision, 0);
  assert.equal(shared.participants.two.readyForRevision, 0);
  assert.throws(() => commitSharedExpedition(shared, {
    uid: 'two', expectedRevision: 1, mutationKind: 'operation', nextExpedition: shared.expedition
  }), /stale_expedition_revision/);
});

test('disconnect and reconnect retain identity while active crew gates time', () => {
  let shared = createSharedExpedition({ roomCode: 'SPACE2', actor: { uid: 'one' }, plan: plan() });
  shared = joinSharedExpedition(shared, { actor: { uid: 'two' }, requestedRole: 'science' });
  shared = setParticipantConnection(shared, { uid: 'two', connected: false });
  assert.equal(shared.participants.two.connected, false);
  shared = joinSharedExpedition(shared, { actor: { uid: 'two', displayName: 'Returned' } });
  assert.equal(shared.participants.two.connected, true);
  assert.equal(shared.participants.two.role, 'science');
  assert.equal(shared.participants.two.displayName, 'Returned');
});

test('rescue transfers each crew member and supply once without duplication', () => {
  let shared = createSharedExpedition({ roomCode: 'SPACE3', actor: { uid: 'one' }, plan: plan() });
  const beforeFood = shared.expedition.resources.foodKg;
  shared = rescueIntoSharedExpedition(shared, { uid: 'one', manifestId: 'stranded-survey-team', nowMs: 99 });
  assert.equal(shared.expedition.resources.foodKg, beforeFood + 7);
  assert.equal(shared.expedition.crew.filter((member) => member.id === 'rescued-engineer').length, 1);
  assert.equal(shared.rescueLedger[0].resources.maintenanceKg, 3);
  assert.equal(shared.expedition.rescueManifests.length, 0);
  assert.throws(() => rescueIntoSharedExpedition(shared, {
    uid: 'one', manifestId: 'stranded-survey-team'
  }), /rescue_manifest_not_found|rescue_already_completed/);
});

test('an advance cannot create supplies', () => {
  let shared = createSharedExpedition({ roomCode: 'SPACE4', actor: { uid: 'one' }, plan: plan() });
  shared = joinSharedExpedition(shared, { actor: { uid: 'two' } });
  shared = setParticipantReady(shared, { uid: 'one' });
  shared = setParticipantReady(shared, { uid: 'two' });
  const invalid = { ...shared.expedition, strategicElapsedS: 1, progress: 0.01,
    resources: { ...shared.expedition.resources, waterKg: shared.expedition.resources.waterKg + 1 } };
  assert.throws(() => commitSharedExpedition(shared, {
    uid: 'one', expectedRevision: 1, mutationKind: 'advance', nextExpedition: invalid
  }), /advance_cannot_create_resource:waterKg/);
});

test('the shared authority retains one advancing field-station record', () => {
  const initial = plan();
  initial.outposts = [{
    id: 'station-one', contactId: 'contact-one', state: 'operational',
    operationsStatus: 'operational', revision: 2, condition: 1,
    lastAdvancedMissionS: 0, stores: { foodKg: 30, waterKg: 20 },
    power: { storedMWh: 4, capacityMWh: 12, generationMW: 0.18, condition: 1 },
    lifeSupport: { occupied: 2, condition: 1 }, assignedCrewIds: ['crew-one', 'crew-two']
  }];
  let shared = createSharedExpedition({ roomCode: 'SPACE5', actor: { uid: 'one' }, plan: initial });
  shared = joinSharedExpedition(shared, { actor: { uid: 'two' } });
  shared = setParticipantReady(shared, { uid: 'one' });
  shared = setParticipantReady(shared, { uid: 'two' });
  const station = shared.expedition.outposts[0];
  const advanced = {
    ...shared.expedition,
    strategicElapsedS: 86_400,
    progress: 0.01,
    resources: { ...shared.expedition.resources, foodKg: 99, waterKg: 99, powerMWh: 99 },
    outposts: [{
      ...station,
      revision: 3,
      condition: 0.999,
      lastAdvancedMissionS: 86_400,
      stores: { foodKg: 29.96, waterKg: 19.988 }
    }]
  };
  shared = commitSharedExpedition(shared, {
    uid: 'one', expectedRevision: 1, mutationKind: 'advance', nextExpedition: advanced,
    activeUids: ['one', 'two']
  });
  assert.equal(shared.expedition.outposts.length, 1);
  assert.equal(shared.expedition.outposts[0].revision, 3);
  assert.equal(shared.expedition.outposts[0].lastAdvancedMissionS, 86_400);
});
