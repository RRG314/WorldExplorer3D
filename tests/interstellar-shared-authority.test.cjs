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

function configuration() {
  return {
    destinationId: 'proxima-centauri',
    shipId: 'long-range-research-vessel',
    propulsionId: 'radiant-plasma-field-drive',
    realism: 'science-inspired',
    survival: 'forgiving'
  };
}

function create(roomCode, uid = 'one', nowMs = 10) {
  return createSharedExpedition({
    roomCode,
    actor: { uid, displayName: uid === 'one' ? 'One' : uid, role: 'command' },
    configuration: configuration(),
    nowMs
  });
}

test('the server creates the plan from bounded choices rather than a browser snapshot', () => {
  const shared = create('SPACE0');
  assert.equal(shared.expedition.state, 'planned');
  assert.equal(shared.expedition.destinationId, 'proxima-centauri');
  assert.equal(shared.expedition.crew.length, 8);
  assert.ok(shared.expedition.resources.foodKg > 100);
  assert.throws(() => createSharedExpedition({
    roomCode: 'BADPLAN', actor: { uid: 'one' },
    configuration: { ...configuration(), shipId: 'browser-invented-ship' }
  }), /invalid_expedition_configuration/);
});

test('two human crew share roles, readiness, one revision, and server-calculated time', () => {
  let shared = create('SPACE1');
  shared = joinSharedExpedition(shared, {
    actor: { uid: 'two', displayName: 'Two' }, requestedRole: 'engineering', nowMs: 20
  });
  assert.equal(shared.participants.one.role, 'command');
  assert.equal(shared.participants.two.role, 'engineering');

  shared = commitSharedExpedition(shared, {
    uid: 'one', expectedRevision: 1, command: { type: 'start' }, activeUids: ['one', 'two'], nowMs: 25
  });
  assert.equal(shared.expedition.state, 'traveling');
  assert.throws(() => commitSharedExpedition(shared, {
    uid: 'one', expectedRevision: shared.revision, command: { type: 'advance' }, activeUids: ['one', 'two']
  }), /connected_crew_not_ready/);

  shared = setParticipantReady(shared, { uid: 'one', nowMs: 30 });
  shared = setParticipantReady(shared, { uid: 'two', nowMs: 31 });
  const beforeFood = shared.expedition.resources.foodKg;
  shared = commitSharedExpedition(shared, {
    uid: 'one', expectedRevision: 2, command: { type: 'advance' },
    activeUids: ['one', 'two'], nowMs: 40
  });
  assert.equal(shared.revision, 3);
  assert.ok(shared.expedition.strategicElapsedS > 0);
  assert.ok(shared.expedition.resources.foodKg < beforeFood);
  assert.equal(shared.participants.one.readyForRevision, 0);
  assert.equal(shared.participants.two.readyForRevision, 0);
  assert.throws(() => commitSharedExpedition(shared, {
    uid: 'two', expectedRevision: 2, command: { type: 'ship-operation', operationId: 'verify-course' }
  }), /stale_expedition_revision/);
});

test('disconnect and reconnect retain identity while active crew gates time', () => {
  let shared = create('SPACE2');
  shared = joinSharedExpedition(shared, { actor: { uid: 'two' }, requestedRole: 'science' });
  shared = setParticipantConnection(shared, { uid: 'two', connected: false });
  assert.equal(shared.participants.two.connected, false);
  shared = joinSharedExpedition(shared, { actor: { uid: 'two', displayName: 'Returned' } });
  assert.equal(shared.participants.two.connected, true);
  assert.equal(shared.participants.two.role, 'science');
  assert.equal(shared.participants.two.displayName, 'Returned');
});

test('a browser-supplied expedition snapshot cannot create supplies or rewrite crew', () => {
  let shared = create('SPACE3');
  const originalFood = shared.expedition.resources.foodKg;
  const originalCrew = shared.expedition.crew;
  shared = commitSharedExpedition(shared, {
    uid: 'one', expectedRevision: 1, command: { type: 'start' },
    nextExpedition: {
      ...shared.expedition,
      resources: { ...shared.expedition.resources, foodKg: 1e12 },
      crew: [{ id: 'invented', roles: ['everything'] }]
    }
  });
  assert.equal(shared.expedition.resources.foodKg, originalFood);
  assert.deepEqual(shared.expedition.crew, originalCrew);
});

test('rescue transfers each recorded crew member and supply once without duplication', () => {
  let shared = create('SPACE4');
  shared = {
    ...shared,
    expedition: {
      ...shared.expedition,
      rescueManifests: [{
        id: 'stranded-survey-team',
        crew: [{ id: 'rescued-engineer', name: 'Rescued Engineer', roles: ['engineering'] }],
        resources: { foodKg: 7, waterKg: 5, maintenanceKg: 3 }
      }]
    }
  };
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

test('the shared authority advances one existing field-station record through the same engine', () => {
  let shared = create('SPACE5');
  shared = {
    ...shared,
    expedition: {
      ...shared.expedition,
      state: 'traveling',
      outposts: [{
        id: 'station-one', contactId: 'contact-one', state: 'operational',
        operationsStatus: 'operational', revision: 2, condition: 1,
        lastAdvancedMissionS: 0, stores: { foodKg: 30, waterKg: 20 },
        power: { storedMWh: 4, capacityMWh: 12, generationMW: 0.18, condition: 1 },
        lifeSupport: { occupied: 2, condition: 1 }, assignedCrewIds: ['crew-nav', 'crew-eng']
      }]
    }
  };
  shared = joinSharedExpedition(shared, { actor: { uid: 'two' } });
  shared = setParticipantReady(shared, { uid: 'one' });
  shared = setParticipantReady(shared, { uid: 'two' });
  shared = commitSharedExpedition(shared, {
    uid: 'one', expectedRevision: 1, command: { type: 'advance' },
    activeUids: ['one', 'two']
  });
  assert.equal(shared.expedition.outposts.length, 1);
  assert.equal(shared.expedition.outposts[0].revision, 3);
  assert.ok(shared.expedition.outposts[0].lastAdvancedMissionS > 0);
});
