'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { STARTING_CREDITS, settleCommerceOutcome, settleCommerceTransaction } = require('../functions/economy-authority.js');

function stateStore() {
  const store = new Map();
  const ref = (path) => ({
    path,
    id: path.split('/').at(-1),
    async get() {
      const value = store.get(path);
      return { exists: value !== undefined, data: () => value };
    }
  });
  return {
    store, ref,
    runTransaction: async (callback) => callback({
      get: (target) => target.get(),
      set: (target, value, options = {}) => store.set(target.path, options.merge ? { ...(store.get(target.path) || {}), ...value } : value)
    })
  };
}

function options(state, action, requestId) {
  return {
    runTransaction: state.runTransaction,
    walletRef: state.ref('users/u/economy/wallet'),
    receiptRef: state.ref(`users/u/commerceReceipts/${requestId}`),
    itemRef: state.ref('users/u/commerceItems/trail-water'),
    stockRef: state.ref('users/u/commerceStock/1970-01-01:osm:node:20:trail-water'),
    timestampFromMs: (millis) => ({ millis }),
    uid: 'u', nowMs: 1000,
    input: { action, requestId, storeId: 'osm:node:20', catalogId: 'trail-water', dayKey: '1970-01-01' }
  };
}

test('store purchases and property use the same canonical wallet document', async () => {
  const state = stateStore();
  const result = await settleCommerceTransaction(options(state, 'buy', 'buy-1'));
  assert.equal(result.accepted, true);
  assert.equal(result.credits, STARTING_CREDITS - 4);
  assert.equal(state.store.get('users/u/economy/wallet').credits, STARTING_CREDITS - 4);
  assert.equal(state.store.get('users/u/commerceItems/trail-water').quantity, 1);
  assert.equal(state.store.get('users/u/commerceStock/1970-01-01:osm:node:20:trail-water').purchased, 1);
});

test('connected daily store stock cannot be reset by refreshing the client', async () => {
  const state = stateStore();
  await settleCommerceTransaction(options(state, 'buy', 'buy-1'));
  await settleCommerceTransaction(options(state, 'buy', 'buy-2'));
  await settleCommerceTransaction(options(state, 'buy', 'buy-3'));
  const rejected = await settleCommerceTransaction(options(state, 'buy', 'buy-4'));
  assert.equal(rejected.reason, 'sold_out');
  assert.equal(state.store.get('users/u/economy/wallet').credits, STARTING_CREDITS - 12);
  assert.equal(state.store.get('users/u/commerceItems/trail-water').quantity, 3);
});

test('mapped services debit the same wallet without creating inventory', async () => {
  const state = stateStore();
  const serviceOptions = options(state, 'service', 'service-1');
  serviceOptions.itemRef = state.ref('users/u/commerceItems/player-treatment');
  serviceOptions.input.catalogId = 'player-treatment';
  const result = await settleCommerceTransaction(serviceOptions);
  assert.equal(result.accepted, true);
  assert.equal(result.credits, STARTING_CREDITS - 450);
  assert.equal(result.itemQuantity, null);
  assert.equal(result.settlementStatus, 'effect_pending');
  assert.equal(state.store.has('users/u/commerceItems/player-treatment'), false);
});

test('failed gameplay services are compensated once and successful effects settle once', async () => {
  const state = stateStore();
  const serviceOptions = options(state, 'service', 'service-refund');
  serviceOptions.itemRef = state.ref('users/u/commerceItems/player-treatment');
  serviceOptions.input.catalogId = 'player-treatment';
  const charged = await settleCommerceTransaction(serviceOptions);
  assert.equal(charged.credits, STARTING_CREDITS - 450);
  const outcomeOptions = {
    runTransaction: state.runTransaction,
    walletRef: serviceOptions.walletRef,
    receiptRef: serviceOptions.receiptRef,
    timestampFromMs: (millis) => ({ millis }),
    nowMs: 1200,
    input: { requestId: charged.requestId, outcome: 'failed', reason: 'target_disappeared' }
  };
  const refunded = await settleCommerceOutcome(outcomeOptions);
  assert.equal(refunded.settlementStatus, 'compensated');
  assert.equal(refunded.credits, STARTING_CREDITS);
  const duplicate = await settleCommerceOutcome(outcomeOptions);
  assert.equal(duplicate.duplicate, true);
  assert.equal(state.store.get('users/u/economy/wallet').credits, STARTING_CREDITS);

  const nextOptions = options(state, 'service', 'service-applied');
  nextOptions.itemRef = state.ref('users/u/commerceItems/player-treatment');
  nextOptions.input.catalogId = 'vehicle-upgrade:engine-tune:1';
  nextOptions.input.targetId = 'player-default:sedan';
  const next = await settleCommerceTransaction(nextOptions);
  const progressRef = state.ref('users/u/gameplay/vehicleUpgrades');
  const applied = await settleCommerceOutcome({
    ...outcomeOptions,
    receiptRef: nextOptions.receiptRef,
    playerProgressRef: progressRef,
    input: { requestId: next.requestId, outcome: 'applied' }
  });
  assert.equal(applied.settlementStatus, 'complete');
  assert.equal(state.store.get('users/u/economy/wallet').credits, STARTING_CREDITS - 4000);
  assert.equal(state.store.get('users/u/gameplay/vehicleUpgrades').vehicles['player-default:sedan']['engine-tune'], 1);
});

test('commerce receipts are idempotent and a sale requires wallet-recorded inventory', async () => {
  const state = stateStore();
  await settleCommerceTransaction(options(state, 'buy', 'buy-1'));
  const duplicate = await settleCommerceTransaction(options(state, 'buy', 'buy-1'));
  assert.equal(duplicate.duplicate, true);
  assert.equal(state.store.get('users/u/commerceItems/trail-water').quantity, 1);
  const sold = await settleCommerceTransaction(options(state, 'sell', 'sell-1'));
  assert.equal(sold.credits, STARTING_CREDITS - 2);
  assert.equal(state.store.get('users/u/commerceItems/trail-water').quantity, 0);
  const rejected = await settleCommerceTransaction(options(state, 'sell', 'sell-2'));
  assert.equal(rejected.reason, 'item_not_owned');
  assert.equal(state.store.get('users/u/economy/wallet').credits, STARTING_CREDITS - 2);
});
