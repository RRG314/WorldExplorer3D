import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { buildDiscoveryExports } = require('../functions/discovery.js');

function documentRef(path) {
  return {
    path,
    id: path.split('/').at(-1),
    collection(name) { return collectionRef(`${path}/${name}`); }
  };
}

function collectionRef(path) {
  return {
    path,
    doc(id = `auto-${path.length}`) { return documentRef(`${path}/${id}`); }
  };
}

function createEndpoint({ existing = false } = {}) {
  const writes = [];
  let transactionRuns = 0;
  const db = {
    collection(name) { return collectionRef(name); },
    async runTransaction(callback) {
      transactionRuns += 1;
      return callback({
        async get() {
          return existing
            ? { exists: true, data: () => ({ itemId: 'existing-item' }) }
            : { exists: false, data: () => null };
        },
        set(ref, value, options) { writes.push({ operation: 'set', path: ref.path, value, options }); },
        create(ref, value) { writes.push({ operation: 'create', path: ref.path, value }); }
      });
    }
  };
  const functions = {
    region() {
      return { https: { onRequest: (handler) => handler } };
    }
  };
  const { claimExplorerDiscovery } = buildDiscoveryExports({
    functions,
    setCors: () => false,
    verifyAuth: async () => ({ uid: 'explorer-1', admin: false }),
    db,
    admin: {}
  });
  return { claimExplorerDiscovery, writes, transactionRuns: () => transactionRuns };
}

function responseCapture() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

const baseClaim = {
  claimId: 'claim:release:field-lead-1',
  catalogId: 'taxon-1',
  worldIdentity: 'world:baltimore',
  activityId: 'photograph',
  name: 'Field record'
};

test('signed-in current evidence creates one non-tradeable server receipt', async () => {
  for (const evidenceClass of ['guided-field-lead', 'guided-exploration-lead', 'virtual-fishing-catch']) {
    const endpoint = createEndpoint();
    const res = responseCapture();
    await endpoint.claimExplorerDiscovery({ method: 'POST', body: { ...baseClaim, claimId: `${baseClaim.claimId}:${evidenceClass}`, evidenceClass } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.awarded, true);
    assert.equal(res.body.authority, 'server-receipt');
    assert.equal(res.body.tradeable, false);
    assert.equal(endpoint.transactionRuns(), 1);
    const itemWrite = endpoint.writes.find((entry) => entry.operation === 'create' && entry.path.includes('/items/'));
    assert.equal(itemWrite?.value?.evidenceClass, evidenceClass);
    assert.equal(itemWrite?.value?.ownerUid, 'explorer-1');
    assert.equal(itemWrite?.value?.tradeable, false);
  }
});

test('unknown evidence is rejected before any receipt transaction', async () => {
  const endpoint = createEndpoint();
  const res = responseCapture();
  await endpoint.claimExplorerDiscovery({ method: 'POST', body: { ...baseClaim, evidenceClass: 'anything-goes' } }, res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'Invalid discovery claim.' });
  assert.equal(endpoint.transactionRuns(), 0);
  assert.deepEqual(endpoint.writes, []);
});

test('repeated claim IDs return the existing receipt without duplicate writes', async () => {
  const endpoint = createEndpoint({ existing: true });
  const res = responseCapture();
  await endpoint.claimExplorerDiscovery({ method: 'POST', body: { ...baseClaim, evidenceClass: 'guided-field-lead' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.awarded, false);
  assert.equal(res.body.itemId, 'existing-item');
  assert.deepEqual(endpoint.writes, []);
});
