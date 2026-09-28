const test = require('node:test');
const assert = require('node:assert/strict');
const { commitUrbanImpacts } = require('../functions/urban-sandbox.js');

test('room impacts cannot borrow client clock tolerance from a server cooldown', async () => {
  const records = new Map();
  const options = {
    uid: 'member', actorRef: 'actor', entityRefs: new Map([['npc', 'npc']]),
    actorPose: {x: 0, y: 0, z: 0}, timestampFromMs: value => value,
    input: {equipmentId: 'pulse-sidearm', worldSeed: 'earth:1',
      impactPosition: {x: 0, y: 0, z: 2},
      targets: [{entityId: 'npc', kind: 'npc', pose: {x: 0, y: 0, z: 2}}]},
    runTransaction: operation => operation({
      get: async ref => ({exists: records.has(ref), data: () => records.get(ref)}),
      set: (ref, value, options) => records.set(ref, options?.merge ? {...records.get(ref), ...value} : value)
    })
  };
  assert.equal((await commitUrbanImpacts({...options, nowMs: 1000})).accepted, true);
  const afterFirst = records.get('npc');
  for (const nowMs of [999, 1060, 1309]) {
    assert.equal((await commitUrbanImpacts({...options, nowMs})).reason, 'cooldown');
    assert.equal(records.get('npc'), afterFirst);
  }
  assert.equal((await commitUrbanImpacts({...options, nowMs: 1310})).accepted, true);
  assert.equal(records.get('npc').revision, 2);
});
