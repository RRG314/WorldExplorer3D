'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  STARTING_CREDITS,
  normalizeProperty,
  propertyDocumentId,
  settlePropertyAction,
  settlePropertyTrade
} = require('../functions/property-authority.js');

function memoryRef(path, store) {
  return {
    path,
    async get() {
      const value = store.get(path);
      return { exists: value !== undefined, data: () => value };
    }
  };
}

function transactionStore() {
  const store = new Map();
  const refs = new Map();
  const ref = (path) => {
    if (!refs.has(path)) refs.set(path, memoryRef(path, store));
    return refs.get(path);
  };
  return {
    store,
    ref,
    runTransaction: async (callback) => callback({
      get: (target) => target.get(),
      set(target, value, options = {}) {
        const before = store.get(target.path) || {};
        store.set(target.path, options.merge ? { ...before, ...value } : value);
      }
    })
  };
}

function timestampFromMs(value) {
  return { millis: value, toMillis: () => value };
}

function property() {
  return {
    propertyId: 'home:baltimore:39.29:-76.61:osm-way:home-42',
    sourceBuildingId: 'osm-way:home-42',
    locationId: 'baltimore:39.29:-76.61',
    locationLabel: 'Baltimore',
    label: 'House in Baltimore',
    kind: 'House',
    buildingType: 'house',
    area: 64,
    levels: 2,
    x: 20,
    z: 28
  };
}

function actionOptions(state, uid, action, requestId, extra = {}) {
  const propertyId = propertyDocumentId(property().propertyId);
  return {
    runTransaction: state.runTransaction,
    propertyRef: state.ref(`worldProperties/${propertyId}`),
    actorWalletRef: state.ref(`users/${uid}/economy/wallet`),
    receiptRef: state.ref(`users/${uid}/propertyReceipts/${requestId}`),
    starterEntitlementRef: state.ref(`users/${uid}/propertyEntitlements/starter`),
    sellerWalletRefForUid: (sellerUid) => state.ref(`users/${sellerUid}/economy/wallet`),
    notificationRefForUid: (targetUid, id) => state.ref(`users/${targetUid}/notifications/${id}`),
    actorBoardRef: state.ref(`propertyLeaderboard/${uid}`),
    sellerBoardRefForUid: (targetUid) => state.ref(`propertyLeaderboard/${targetUid}`),
    activityRef: state.ref(`activityFeed/${requestId}`),
    uid,
    displayName: uid === 'one' ? 'Explorer One' : 'Explorer Two',
    roomCode: 'ABC123',
    nowMs: extra.nowMs || 1000,
    timestampFromMs,
    input: { action, requestId, property: property(), ...extra }
  };
}

test('the free first property is account-wide, single use, and creates no sell-back windfall', async () => {
  const state = transactionStore();
  const claimed = await settlePropertyAction(actionOptions(state, 'one', 'starter_claim', 'starter-one'));
  assert.equal(claimed.accepted, true);
  assert.equal(claimed.credits, STARTING_CREDITS);
  assert.equal(state.store.get('users/one/propertyEntitlements/starter').claimed, true);
  assert.equal(state.store.get('propertyLeaderboard/one').propertiesOwned, 1);
  assert.deepEqual(state.store.get('propertyLeaderboard/one').achievements, ['first-property']);

  const secondProperty = {
    ...property(),
    propertyId: 'world:osm-way:home-99',
    sourceBuildingId: 'osm-way:home-99',
    label: 'Another House'
  };
  const second = await settlePropertyAction({
    ...actionOptions(state, 'one', 'starter_claim', 'starter-two'),
    propertyRef: state.ref(`worldProperties/${propertyDocumentId(secondProperty.propertyId)}`),
    input: { action: 'starter_claim', requestId: 'starter-two', property: secondProperty }
  });
  assert.equal(second.accepted, false);
  assert.equal(second.reason, 'starter_already_used');

  const sold = await settlePropertyAction(actionOptions(state, 'one', 'sell_world', 'starter-sell'));
  assert.equal(sold.accepted, true);
  assert.equal(sold.credits, STARTING_CREDITS);
});

test('a world property can only be bought once and retries do not charge twice', async () => {
  const state = transactionStore();
  const first = await settlePropertyAction(actionOptions(state, 'one', 'buy', 'buy-one'));
  assert.equal(first.accepted, true);
  assert.equal(first.property.ownerUid, 'one');
  assert.ok(first.credits < STARTING_CREDITS);

  const retry = await settlePropertyAction(actionOptions(state, 'one', 'buy', 'buy-one'));
  assert.equal(retry.accepted, true);
  assert.equal(retry.idempotent, true);
  assert.equal(retry.credits, first.credits);

  const conflict = await settlePropertyAction(actionOptions(state, 'two', 'buy', 'buy-two'));
  assert.equal(conflict.accepted, false);
  assert.equal(conflict.reason, 'already_owned');
  assert.equal(state.store.get('users/two/economy/wallet'), undefined);
});

test('generated scene pieces are rejected by the world property authority', () => {
  for (const sourceBuildingId of ['fallback-1-20-30', 'dynamic:airport-ticket-hall', 'inferred:abcd', 'overlay:building-1', 'osm:way:42:guardrail:1:left']) {
    assert.throws(() => normalizeProperty({
      ...property(),
      propertyId: `world:${sourceBuildingId}`,
      sourceBuildingId
    }), /invalid_property/);
  }
});

test('a listed sale moves ownership and credits in one transaction', async () => {
  const state = transactionStore();
  const bought = await settlePropertyAction(actionOptions(state, 'one', 'buy', 'owner-buy'));
  const listed = await settlePropertyAction(actionOptions(state, 'one', 'list_sale', 'owner-list', { salePrice: 140 }));
  assert.equal(listed.property.status, 'listed_for_sale');
  assert.equal(listed.property.salePrice, 140);

  const purchased = await settlePropertyAction(actionOptions(state, 'two', 'buy_listing', 'buyer-purchase'));
  assert.equal(purchased.accepted, true);
  assert.equal(purchased.property.ownerUid, 'two');
  assert.equal(purchased.credits, STARTING_CREDITS - 140);
  const sellerWallet = state.store.get('users/one/economy/wallet');
  assert.equal(sellerWallet.credits, bought.credits + 140);
  assert.equal(state.store.get('propertyLeaderboard/one').propertiesOwned, 0);
  assert.equal(state.store.get('propertyLeaderboard/one').propertiesSold, 1);
  assert.equal(state.store.get('propertyLeaderboard/two').propertiesOwned, 1);
  assert.equal(state.store.get('users/one/notifications/buyer-purchase').read, false);
});

test('fixed-term rent preserves ownership and prevents a second rental', async () => {
  const state = transactionStore();
  await settlePropertyAction(actionOptions(state, 'one', 'buy', 'rent-owner-buy'));
  await settlePropertyAction(actionOptions(state, 'one', 'list_rent', 'rent-list', { rentPrice: 20, rentTermDays: 7 }));
  const rented = await settlePropertyAction(actionOptions(state, 'two', 'rent', 'rent-start', { nowMs: 10_000 }));
  assert.equal(rented.property.ownerUid, 'one');
  assert.equal(rented.property.tenantUid, 'two');
  assert.equal(rented.property.status, 'leased');
  assert.ok(rented.property.leaseEndsAtMs > 10_000);
  assert.equal(state.store.get('propertyLeaderboard/one').rentalsHosted, 1);
  assert.equal(state.store.get('propertyLeaderboard/two').rentalsStarted, 1);

  const blocked = await settlePropertyAction(actionOptions(state, 'three', 'rent', 'rent-second', { nowMs: 20_000 }));
  assert.equal(blocked.accepted, false);
  assert.equal(blocked.reason, 'not_for_rent');
});

test('a property trade offer swaps both owners atomically and cannot be replayed', async () => {
  const state = transactionStore();
  const firstProperty = property();
  const secondProperty = {
    ...property(),
    propertyId: 'world:osm-way:home-99',
    sourceBuildingId: 'osm-way:home-99',
    label: 'Second House',
    area: 144
  };
  const firstRef = state.ref(`worldProperties/${propertyDocumentId(firstProperty.propertyId)}`);
  const secondRef = state.ref(`worldProperties/${propertyDocumentId(secondProperty.propertyId)}`);
  await settlePropertyAction(actionOptions(state, 'one', 'buy', 'trade-first-buy'));
  await settlePropertyAction({
    ...actionOptions(state, 'two', 'buy', 'trade-second-buy'),
    propertyRef: secondRef,
    input: { action: 'buy', requestId: 'trade-second-buy', property: secondProperty }
  });
  const common = {
    runTransaction: state.runTransaction,
    offerRef: state.ref('propertyTradeOffers/trade-offer-one'),
    offeredPropertyRef: firstRef,
    requestedPropertyRef: secondRef,
    notificationRefForUid: (targetUid, id) => state.ref(`users/${targetUid}/notifications/${id}`),
    roomCode: 'WORLD',
    nowMs: 50_000,
    timestampFromMs
  };
  const offered = await settlePropertyTrade({
    ...common,
    actorWalletRef: state.ref('users/one/economy/wallet'),
    proposerWalletRef: state.ref('users/one/economy/wallet'),
    receiptRef: state.ref('users/one/propertyReceipts/trade-offer-one'),
    actorBoardRef: state.ref('propertyLeaderboard/one'),
    proposerBoardRef: state.ref('propertyLeaderboard/one'),
    uid: 'one',
    displayName: 'Explorer One',
    input: { action: 'trade_offer', requestId: 'trade-offer-one', offeredProperty: firstProperty, requestedProperty: secondProperty, creditOffer: 0 }
  });
  assert.equal(offered.accepted, true);
  assert.equal(offered.offer.status, 'pending');
  assert.equal(state.store.get('users/two/notifications/trade-offer-one').type, 'property-trade-offer');

  const acceptOptions = {
    ...common,
    actorWalletRef: state.ref('users/two/economy/wallet'),
    proposerWalletRef: state.ref('users/one/economy/wallet'),
    recipientWalletRef: state.ref('users/two/economy/wallet'),
    receiptRef: state.ref('users/two/propertyReceipts/trade-accept-one'),
    actorBoardRef: state.ref('propertyLeaderboard/two'),
    proposerBoardRef: state.ref('propertyLeaderboard/one'),
    recipientBoardRef: state.ref('propertyLeaderboard/two'),
    activityRef: state.ref('activityFeed/trade-accept-one'),
    uid: 'two',
    displayName: 'Explorer Two',
    input: { action: 'trade_accept', requestId: 'trade-accept-one', offerId: 'trade-offer-one' }
  };
  const accepted = await settlePropertyTrade(acceptOptions);
  assert.equal(accepted.offer.status, 'accepted');
  assert.equal(state.store.get(firstRef.path).ownerUid, 'two');
  assert.equal(state.store.get(secondRef.path).ownerUid, 'one');
  assert.equal(state.store.get('propertyTradeOffers/trade-offer-one').status, 'accepted');
  const replay = await settlePropertyTrade(acceptOptions);
  assert.equal(replay.idempotent, true);
  assert.equal(state.store.get(firstRef.path).ownerUid, 'two');
});
