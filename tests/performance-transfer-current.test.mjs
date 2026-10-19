import test from 'node:test';
import assert from 'node:assert/strict';
import { transferDifference, transferPhases, transferWithinBudget, TRANSFER_FIELDS } from '../scripts/verification/performance-transfer.mjs';

const sample = (bytes, requests = 2) => ({ localTransferBytes: bytes * 2, externalRequests: requests, externalTransferBytes: bytes });
const limit = { maximumLocalTransferBytes: 128, maximumExternalRequests: 10, maximumExternalTransferBytes: 64 };

test('all bytes remain accounted across startup, travel, reloads and trailing responses', () => {
  const phases = transferPhases({ startup: sample(40), beforeReloads: sample(55, 5), reloads: [sample(20), sample(20)], total: sample(100, 10) });
  assert.deepEqual(phases.map(p => [p.id, p.externalTransferBytes]), [['cold-world',40],['bounded-travel',15],['reload-1',20],['reload-2',20],['finalization',5]]);
  assert.ok(phases.every(p => transferWithinBudget(p, limit)));
  for (const key of TRANSFER_FIELDS) assert.equal(phases.reduce((sum, p) => sum + p[key], 0), sample(100,10)[key]);
  assert.equal(transferWithinBudget(sample(100,10), limit), false, 'A cumulative multi-load session is a different measurement');
});

test('each cold load, travel, reload and trailing burst must independently fit the unchanged cap', () => {
  for (const row of [sample(65), { ...sample(64), externalRequests:11 }, { ...sample(64), localTransferBytes:129 }]) assert.equal(transferWithinBudget(row,limit),false);
  assert.equal(transferWithinBudget(sample(64,10),limit),true);
});

test('reset, omitted and malformed network counters cannot silently pass', () => {
  assert.throws(() => transferDifference(sample(2),sample(3)));
  for (const row of [{},sample(NaN),sample(-1),sample(1.5)]) assert.throws(() => transferWithinBudget(row,limit));
});

test('overlapping accounting and missing reload samples are rejected', () => {
  assert.throws(() => transferPhases({startup:sample(10),beforeReloads:sample(20,3),reloads:[sample(10)],total:sample(25,5)}));
  assert.throws(() => transferPhases({startup:sample(10),beforeReloads:sample(20),reloads:undefined,total:sample(20)}));
});

test('diagnostics without reloads still account for every byte', () => {
  const phases=transferPhases({startup:sample(10,1),beforeReloads:sample(15,2),reloads:[],total:sample(18,3)});
  assert.deepEqual(phases.map(p=>p.externalTransferBytes),[10,5,3]);
});
