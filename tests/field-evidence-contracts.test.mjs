import assert from 'node:assert/strict';
import test from 'node:test';
import { FIELD_EVIDENCE_CONTRACTS, buildFieldEvidencePayload } from '../app/js/discovery/evidence-contracts.js';
import { compileFieldActivityPlan, createFieldActivitySession } from '../app/js/discovery/field-activities.js';

const ACTIVITY_IDS = [
  'nature-observe', 'photograph', 'wildlife-track', 'insect-macro',
  'habitat-survey', 'geology-inspect', 'community-survey', 'sonar-survey'
];

function publications() {
  const location = Object.freeze({ lat: 39.2904, lon: -76.6122 });
  const worldIdentity = Object.freeze({ type: 'WorldIdentity', id: 'world:baltimore:evidence', location });
  const cell = Object.freeze({
    cellId: 'cell:0:0',
    contexts: Object.freeze(['urban', 'park', 'forest', 'field', 'wetland', 'riverbank', 'coast', 'outcrop']),
    bounds: Object.freeze({ minX: -80, maxX: 80, minZ: -80, maxZ: 80 })
  });
  const environment = Object.freeze({
    type: 'EnvironmentContextPublication', requestId: 'request:evidence', sequence: 1,
    worldIdentity, temporal: Object.freeze({ month: 8, localTimeBand: 'day' }),
    cells: Object.freeze([cell])
  });
  const eligibility = Object.freeze({
    type: 'GeographicEligibilityPublication', requestId: environment.requestId, sequence: 1,
    worldIdentity, catalogBundleVersion: 'evidence-test',
    eligible: Object.freeze(ACTIVITY_IDS.map((catalogId) => Object.freeze({ catalogId, cellIds: Object.freeze([cell.cellId]) })))
  });
  return { environment, eligibility };
}

test('released field evidence contracts have distinct record kinds and bounded requirements', () => {
  assert.deepEqual(Object.keys(FIELD_EVIDENCE_CONTRACTS).sort(), [
    'community', 'geology', 'habitat', 'insect-macro', 'observation', 'photography', 'track-sign', 'water-scan'
  ]);
  const contracts = Object.values(FIELD_EVIDENCE_CONTRACTS);
  assert.equal(new Set(contracts.map((entry) => entry.recordKind)).size, contracts.length);
  contracts.forEach((contract) => {
    assert.ok(contract.holdSeconds >= 1.8 && contract.holdSeconds <= 4);
    assert.equal(contract.requiredFields.length, 3);
    const payload = buildFieldEvidencePayload(contract, {
      slot: { contextBands: ['park', 'urban'] }, elapsed: contract.holdSeconds, distanceMeters: 9, timeBand: 'day'
    });
    assert.equal(payload.contractId, contract.id);
    assert.equal(payload.schemaVersion, 2);
    assert.equal(payload.generatedGameRecord, true);
    assert.equal(Object.hasOwn(payload, 'procedural'), false);
    assert.equal(payload.livePresenceClaim, false);
    assert.equal(payload.approachEvidence.accessClaim, false);
    assert.equal(payload.rewardEligibility.competitive, false);
    assert.equal(payload.rewardEligibility.locationReward, false);
    contract.requiredFields.forEach((field) => assert.ok(Object.hasOwn(payload, field), `${contract.id} requires ${field}`));
  });
});

test('the shared Baltimore field plan publishes every released mechanic contract', () => {
  const { environment, eligibility } = publications();
  const plan = compileFieldActivityPlan(environment, eligibility, { slotsPerCell: 3 });
  const contracts = new Map(plan.slots.map((slot) => [slot.activityId, slot.evidenceContract?.id]));
  assert.deepEqual(Object.fromEntries(ACTIVITY_IDS.map((id) => [id, contracts.get(id)])), {
    'nature-observe': 'observation',
    photograph: 'photography',
    'wildlife-track': 'track-sign',
    'insect-macro': 'insect-macro',
    'habitat-survey': 'habitat',
    'geology-inspect': 'geology',
    'community-survey': 'community',
    'sonar-survey': 'water-scan'
  });
  assert.equal(plan.slots.every((slot) => slot.evidenceClass === 'guided-field-lead'), true);
  assert.equal(plan.slots.every((slot) => slot.approachEvidence.accessEvidence === 'unknown' && slot.approachEvidence.accessClaim === false), true);
});

test('recording a field mechanic persists its typed evidence payload', async () => {
  const { environment, eligibility } = publications();
  const plan = compileFieldActivityPlan(environment, eligibility, { slotsPerCell: 3 });
  const recorded = [];
  const profileStore = {
    async recordObservation(record) {
      recorded.push(record);
      return { recorded: true, collected: false, event: { eventId: `event:${record.claimId}`, ...record }, profile: { collectionCount: recorded.length } };
    }
  };
  for (const activityId of ACTIVITY_IDS) {
    const slot = plan.slots.find((entry) => entry.activityId === activityId);
    assert.ok(slot, `${activityId} slot is required`);
    const session = createFieldActivitySession({ plan });
    assert.equal(session.beginSlot(slot.id, slot.position), true);
    const revealed = session.update(slot.evidenceContract.holdSeconds + 0.1, slot.position);
    assert.equal(revealed.phase, 'revealed');
    assert.equal(await session.record(profileStore, { localPosition: slot.position }), true);
    const record = recorded.at(-1);
    assert.equal(record.evidenceContractId, slot.evidenceContract.id);
    assert.equal(record.evidencePayload.recordKind, slot.evidenceContract.recordKind);
    assert.equal(record.evidencePayload.livePresenceClaim, false);
    assert.equal(record.evidencePayload.rewardEligibility.locationReward, false);
    slot.evidenceContract.requiredFields.forEach((field) => assert.ok(Object.hasOwn(record.evidencePayload, field)));
  }
});
