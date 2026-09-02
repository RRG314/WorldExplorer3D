'use strict';

const crypto = require('node:crypto');

const STARTING_CREDITS = 500;
const MAX_CREDITS = 1_000_000_000;
const VALID_ACTIONS = new Set(['starter_claim', 'buy', 'sell_world', 'list_sale', 'buy_listing', 'list_rent', 'rent', 'cancel_listing']);
const VALID_TRADE_ACTIONS = new Set(['trade_offer', 'trade_accept', 'trade_decline', 'trade_cancel']);
const PROPERTY_STATUS = Object.freeze({
  available: 'available',
  owned: 'owned',
  sale: 'listed_for_sale',
  rent: 'listed_for_rent',
  leased: 'leased'
});
const NON_OWNABLE_SOURCE = /^(fallback-|dynamic:|overlay:|inferred:|interior[-:]|generated:)|:guardrail:|structure-collider/i;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function integer(value, min, max, fallback = min) {
  return Math.max(min, Math.min(max, Math.round(finite(value, fallback))));
}

function text(value, max = 120) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function propertyDocumentId(propertyId) {
  const normalized = text(propertyId, 420);
  if (!normalized) return '';
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 40);
}

function snapshotData(snapshot) {
  if (!snapshot) return null;
  const exists = typeof snapshot.exists === 'function' ? snapshot.exists() : snapshot.exists === true;
  return exists ? (snapshot.data() || {}) : null;
}

function timestampMillis(value, fallback = 0) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (Number.isFinite(Number(value?.seconds))) return Number(value.seconds) * 1000;
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function categoryFor(type) {
  const value = text(type, 60).toLowerCase();
  if (/house|residential|apartments|terrace|townhouse|detached|bungalow|dormitory/.test(value)) return 'residential';
  if (/retail|commercial|supermarket|shop|kiosk/.test(value)) return 'retail';
  if (/office/.test(value)) return 'office';
  if (/industrial|warehouse|factory|hangar/.test(value)) return 'industrial';
  if (/farm|barn|stable|agricultural/.test(value)) return 'agricultural';
  if (/civic|school|hospital|church|government|public/.test(value)) return 'civic';
  return 'mixed';
}

function hashAdjustment(value) {
  let hash = 2166136261;
  for (const character of String(value || '')) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 17;
}

function propertyBaseValue(input = {}) {
  const area = Math.max(16, Math.min(250_000, finite(input.area, 16)));
  const levels = integer(input.levels, 1, 180, 1);
  const category = categoryFor(input.buildingType);
  const categoryAdjustment = { residential: -10, retail: 35, office: 45, industrial: 25, agricultural: 5, civic: 20, mixed: 12 }[category];
  const raw = 45 + Math.sqrt(area) * 2 + area * .02 + levels * 10 + hashAdjustment(input.propertyId) + categoryAdjustment;
  return integer(Math.round(raw / 5) * 5, 75, 250_000, 75);
}

function normalizeProperty(input = {}) {
  const propertyId = text(input.propertyId, 420);
  const sourceBuildingId = text(input.sourceBuildingId, 220);
  const locationId = text(input.locationId, 180);
  if (!propertyId || !sourceBuildingId || !locationId || !propertyId.includes(sourceBuildingId) || NON_OWNABLE_SOURCE.test(sourceBuildingId)) throw new Error('invalid_property');
  const buildingType = text(input.buildingType || 'building', 60).toLowerCase();
  const area = Math.max(16, Math.min(250_000, finite(input.area, 16)));
  const levels = integer(input.levels, 1, 180, 1);
  const property = Object.freeze({
    propertyId,
    sourceBuildingId,
    locationId,
    locationLabel: text(input.locationLabel || 'Saved location', 80),
    label: text(input.label || 'World property', 100),
    address: input.address && typeof input.address === 'object' ? Object.freeze({
      line1: text(input.address.line1, 120),
      locality: text(input.address.locality, 80),
      region: text(input.address.region, 80),
      postalCode: text(input.address.postalCode, 24),
      country: text(input.address.country, 48),
      formatted: text(input.address.formatted, 240),
      source: 'mapped-building-tags'
    }) : null,
    kind: text(input.kind || 'Property', 40),
    buildingType,
    category: categoryFor(buildingType),
    area,
    levels,
    x: Math.max(-25_000, Math.min(25_000, finite(input.x))),
    z: Math.max(-25_000, Math.min(25_000, finite(input.z)))
  });
  return Object.freeze({ ...property, baseValue: propertyBaseValue(property) });
}

function walletData(raw = {}) {
  return {
    credits: integer(raw.credits, 0, MAX_CREDITS, STARTING_CREDITS),
    lifetimeEarned: integer(raw.lifetimeEarned, 0, MAX_CREDITS, STARTING_CREDITS),
    lifetimeSpent: integer(raw.lifetimeSpent, 0, MAX_CREDITS, 0),
    revision: integer(raw.revision, 0, MAX_CREDITS, 0)
  };
}

function publicResult(property, wallet, receiptId) {
  return Object.freeze({
    accepted: true,
    receiptId,
    credits: wallet.credits,
    property: Object.freeze({
      propertyId: property.propertyId,
      ownerUid: text(property.ownerUid, 128),
      ownerName: text(property.ownerName, 80),
      tenantUid: text(property.tenantUid, 128),
      tenantName: text(property.tenantName, 80),
      status: property.status,
      baseValue: property.baseValue,
      salePrice: integer(property.salePrice, 0, 500_000, 0),
      rentPrice: integer(property.rentPrice, 0, 100_000, 0),
      rentTermDays: integer(property.rentTermDays, 0, 30, 0),
      leaseEndsAtMs: timestampMillis(property.leaseEndsAt, 0),
      revision: property.revision
    })
  });
}

function boardData(raw = {}, uid = '', displayName = '') {
  const data = {
    uid,
    displayName: text(displayName || raw.displayName || 'Explorer', 80),
    propertiesOwned: integer(raw.propertiesOwned, 0, 100000, 0),
    propertiesSold: integer(raw.propertiesSold, 0, 100000, 0),
    rentalsStarted: integer(raw.rentalsStarted, 0, 100000, 0),
    rentalsHosted: integer(raw.rentalsHosted, 0, 100000, 0),
    propertyValue: integer(raw.propertyValue, 0, MAX_CREDITS, 0)
  };
  return data;
}

function boardAchievements(board) {
  return [
    board.propertiesOwned + board.propertiesSold > 0 ? 'first-property' : '',
    board.propertiesOwned >= 3 ? 'three-properties' : '',
    board.propertiesOwned >= 5 ? 'five-properties' : '',
    board.propertiesSold >= 1 ? 'first-sale' : '',
    board.rentalsHosted >= 1 ? 'first-rental-hosted' : '',
    board.rentalsStarted >= 1 ? 'first-rental' : ''
  ].filter(Boolean);
}

function tradePublicResult(offer, receiptId) {
  return Object.freeze({
    accepted: true,
    receiptId,
    offer: Object.freeze({
      offerId: text(offer.offerId, 120),
      status: text(offer.status, 24),
      proposerUid: text(offer.proposerUid, 128),
      proposerName: text(offer.proposerName, 80),
      recipientUid: text(offer.recipientUid, 128),
      recipientName: text(offer.recipientName, 80),
      offeredPropertyId: text(offer.offeredPropertyId, 420),
      offeredPropertyLabel: text(offer.offeredPropertyLabel, 100),
      requestedPropertyId: text(offer.requestedPropertyId, 420),
      requestedPropertyLabel: text(offer.requestedPropertyLabel, 100),
      creditOffer: integer(offer.creditOffer, 0, 500_000, 0),
      expiresAtMs: timestampMillis(offer.expiresAt, 0)
    })
  });
}

async function settlePropertyTrade(options = {}) {
  const {
    runTransaction,
    offerRef,
    offeredPropertyRef,
    requestedPropertyRef,
    actorWalletRef,
    proposerWalletRef,
    recipientWalletRef,
    receiptRef,
    actorBoardRef,
    proposerBoardRef,
    recipientBoardRef,
    notificationRefForUid,
    activityRef,
    uid,
    displayName,
    roomCode,
    input,
    nowMs = Date.now(),
    timestampFromMs
  } = options;
  const action = text(input?.action, 32).toLowerCase();
  const requestId = text(input?.requestId, 120);
  if (!VALID_TRADE_ACTIONS.has(action) || !requestId || !uid || !offerRef || !receiptRef || typeof runTransaction !== 'function' || typeof timestampFromMs !== 'function') {
    throw new Error('invalid_action');
  }
  const submittedOffered = action === 'trade_offer' ? normalizeProperty(input?.offeredProperty) : null;
  const submittedRequested = action === 'trade_offer' ? normalizeProperty(input?.requestedProperty) : null;
  const actorName = text(displayName || 'Explorer', 80);
  return runTransaction(async (transaction) => {
    const references = [offerRef, receiptRef, offeredPropertyRef, requestedPropertyRef, actorWalletRef, proposerWalletRef, recipientWalletRef, actorBoardRef, proposerBoardRef, recipientBoardRef].filter(Boolean);
    const snapshots = await Promise.all(references.map((reference) => transaction.get(reference)));
    const dataFor = (reference) => reference ? snapshotData(snapshots[references.indexOf(reference)]) : null;
    const priorReceipt = dataFor(receiptRef);
    if (priorReceipt?.result) return Object.freeze({ ...priorReceipt.result, idempotent: true });
    const currentOffer = dataFor(offerRef);
    const offered = dataFor(offeredPropertyRef);
    const requested = dataFor(requestedPropertyRef);
    let nextOffer = currentOffer ? { ...currentOffer } : null;

    if (action === 'trade_offer') {
      if (currentOffer) throw new Error('trade_offer_exists');
      if (!offered || offered.propertyId !== submittedOffered.propertyId || offered.ownerUid !== uid) return Object.freeze({ accepted: false, reason: 'offered_property_unavailable' });
      if (!requested || requested.propertyId !== submittedRequested.propertyId || !requested.ownerUid || requested.ownerUid === uid) return Object.freeze({ accepted: false, reason: 'requested_property_unavailable' });
      if (offered.status !== PROPERTY_STATUS.owned || requested.status !== PROPERTY_STATUS.owned) return Object.freeze({ accepted: false, reason: 'property_not_tradeable' });
      const creditOffer = integer(input?.creditOffer, 0, 500_000, 0);
      const actorWallet = walletData(dataFor(actorWalletRef) || {});
      if (actorWallet.credits < creditOffer) return Object.freeze({ accepted: false, reason: 'not_enough_credits', credits: actorWallet.credits });
      nextOffer = {
        authority: 'world-property-transaction-v1',
        offerId: requestId,
        status: 'pending',
        proposerUid: uid,
        proposerName: actorName,
        recipientUid: requested.ownerUid,
        recipientName: requested.ownerName,
        offeredPropertyId: offered.propertyId,
        offeredPropertyLabel: offered.label,
        requestedPropertyId: requested.propertyId,
        requestedPropertyLabel: requested.label,
        creditOffer,
        roomCode,
        createdAt: timestampFromMs(nowMs),
        updatedAt: timestampFromMs(nowMs),
        expiresAt: timestampFromMs(nowMs + 7 * 86_400_000)
      };
      transaction.set(offerRef, nextOffer, { merge: false });
      if (typeof notificationRefForUid === 'function') {
        transaction.set(notificationRefForUid(requested.ownerUid, requestId), {
          type: 'property-trade-offer', title: 'New property trade offer',
          message: `${actorName} offered ${offered.label} for ${requested.label}.`,
          roomCode, propertyId: requested.propertyId, offerId: requestId,
          actorUid: uid, actorName, read: false,
          createdAt: timestampFromMs(nowMs), expiresAt: nextOffer.expiresAt
        }, { merge: false });
      }
    } else {
      if (!currentOffer) return Object.freeze({ accepted: false, reason: 'trade_offer_unavailable' });
      if (currentOffer.status !== 'pending') return Object.freeze({ accepted: false, reason: 'trade_offer_closed' });
      if (timestampMillis(currentOffer.expiresAt, 0) <= nowMs) return Object.freeze({ accepted: false, reason: 'trade_offer_expired' });
      if (action === 'trade_cancel' && currentOffer.proposerUid !== uid) return Object.freeze({ accepted: false, reason: 'not_offer_owner' });
      if (['trade_accept', 'trade_decline'].includes(action) && currentOffer.recipientUid !== uid) return Object.freeze({ accepted: false, reason: 'not_offer_recipient' });
      if (action === 'trade_decline' || action === 'trade_cancel') {
        nextOffer = { ...currentOffer, status: action === 'trade_decline' ? 'declined' : 'cancelled', updatedAt: timestampFromMs(nowMs), closedAt: timestampFromMs(nowMs) };
        transaction.set(offerRef, nextOffer, { merge: false });
      } else {
        if (!offered || !requested || offered.propertyId !== currentOffer.offeredPropertyId || requested.propertyId !== currentOffer.requestedPropertyId) throw new Error('trade_property_conflict');
        if (offered.ownerUid !== currentOffer.proposerUid || requested.ownerUid !== currentOffer.recipientUid) return Object.freeze({ accepted: false, reason: 'trade_ownership_changed' });
        if (offered.status !== PROPERTY_STATUS.owned || requested.status !== PROPERTY_STATUS.owned) return Object.freeze({ accepted: false, reason: 'property_not_tradeable' });
        const proposerWallet = walletData(dataFor(proposerWalletRef) || {});
        const recipientWallet = walletData(dataFor(recipientWalletRef) || {});
        const creditOffer = integer(currentOffer.creditOffer, 0, 500_000, 0);
        if (proposerWallet.credits < creditOffer) return Object.freeze({ accepted: false, reason: 'offer_funds_unavailable' });
        const nextOffered = { ...offered, ownerUid: currentOffer.recipientUid, ownerName: currentOffer.recipientName, revision: integer(offered.revision, 0, MAX_CREDITS, 0) + 1, updatedAt: timestampFromMs(nowMs) };
        const nextRequested = { ...requested, ownerUid: currentOffer.proposerUid, ownerName: currentOffer.proposerName, revision: integer(requested.revision, 0, MAX_CREDITS, 0) + 1, updatedAt: timestampFromMs(nowMs) };
        transaction.set(offeredPropertyRef, nextOffered, { merge: false });
        transaction.set(requestedPropertyRef, nextRequested, { merge: false });
        if (proposerWalletRef) transaction.set(proposerWalletRef, { ...proposerWallet, credits: proposerWallet.credits - creditOffer, lifetimeSpent: proposerWallet.lifetimeSpent + creditOffer, revision: proposerWallet.revision + (creditOffer ? 1 : 0), updatedAt: timestampFromMs(nowMs) }, { merge: false });
        if (recipientWalletRef) transaction.set(recipientWalletRef, { ...recipientWallet, credits: Math.min(MAX_CREDITS, recipientWallet.credits + creditOffer), lifetimeEarned: Math.min(MAX_CREDITS, recipientWallet.lifetimeEarned + creditOffer), revision: recipientWallet.revision + (creditOffer ? 1 : 0), updatedAt: timestampFromMs(nowMs) }, { merge: false });
        const proposerBoard = boardData(dataFor(proposerBoardRef) || {}, currentOffer.proposerUid, currentOffer.proposerName);
        const recipientBoard = boardData(dataFor(recipientBoardRef) || {}, currentOffer.recipientUid, currentOffer.recipientName);
        proposerBoard.propertyValue = Math.max(0, Math.min(MAX_CREDITS, proposerBoard.propertyValue - offered.baseValue + requested.baseValue));
        recipientBoard.propertyValue = Math.max(0, Math.min(MAX_CREDITS, recipientBoard.propertyValue - requested.baseValue + offered.baseValue));
        if (proposerBoardRef) transaction.set(proposerBoardRef, { ...proposerBoard, achievements: boardAchievements(proposerBoard), lastAction: 'property-trade', updatedAt: timestampFromMs(nowMs) }, { merge: false });
        if (recipientBoardRef) transaction.set(recipientBoardRef, { ...recipientBoard, achievements: boardAchievements(recipientBoard), lastAction: 'property-trade', updatedAt: timestampFromMs(nowMs) }, { merge: false });
        nextOffer = { ...currentOffer, status: 'accepted', updatedAt: timestampFromMs(nowMs), closedAt: timestampFromMs(nowMs) };
        transaction.set(offerRef, nextOffer, { merge: false });
        if (typeof notificationRefForUid === 'function') {
          transaction.set(notificationRefForUid(currentOffer.proposerUid, requestId), {
            type: 'property-trade-accepted', title: 'Property trade accepted',
            message: `${currentOffer.recipientName} accepted your trade for ${requested.label}.`,
            roomCode, propertyId: requested.propertyId, offerId: currentOffer.offerId,
            actorUid: uid, actorName, read: false,
            createdAt: timestampFromMs(nowMs), expiresAt: timestampFromMs(nowMs + 90 * 86_400_000)
          }, { merge: false });
        }
        if (activityRef) transaction.set(activityRef, {
          type: 'property-traded', uid, displayName: actorName, roomCode,
          propertyId: requested.propertyId,
          text: `Traded ${requested.label} for ${offered.label}`,
          createdAt: timestampFromMs(nowMs)
        }, { merge: false });
      }
    }
    const result = tradePublicResult(nextOffer, requestId);
    transaction.set(receiptRef, {
      authority: 'world-property-transaction-v1', receiptId: requestId, action,
      roomCode, propertyId: nextOffer.requestedPropertyId, offerId: nextOffer.offerId,
      debit: action === 'trade_accept' && nextOffer.recipientUid !== uid ? nextOffer.creditOffer : 0,
      credit: action === 'trade_accept' && nextOffer.recipientUid === uid ? nextOffer.creditOffer : 0,
      result, createdAt: timestampFromMs(nowMs)
    }, { merge: false });
    return result;
  });
}

async function settlePropertyAction(options = {}) {
  const {
    runTransaction,
    propertyRef,
    actorWalletRef,
    receiptRef,
    starterEntitlementRef,
    sellerWalletRefForUid,
    notificationRefForUid,
    actorBoardRef,
    sellerBoardRefForUid,
    activityRef,
    uid,
    displayName,
    roomCode,
    input,
    nowMs = Date.now(),
    timestampFromMs
  } = options;
  if (typeof runTransaction !== 'function' || !propertyRef || !actorWalletRef || !receiptRef || !uid || typeof timestampFromMs !== 'function') {
    throw new TypeError('Property transaction inputs are required.');
  }
  const action = text(input?.action, 32).toLowerCase();
  const receiptId = text(input?.requestId, 120);
  if (!VALID_ACTIONS.has(action) || !receiptId) throw new Error('invalid_action');
  const submitted = normalizeProperty(input?.property);
  const actorName = text(displayName || 'Explorer', 80);
  return runTransaction(async (transaction) => {
    const [receiptSnapshot, propertySnapshot, actorWalletSnapshot, starterSnapshot, actorBoardSnapshot] = await Promise.all([
      transaction.get(receiptRef),
      transaction.get(propertyRef),
      transaction.get(actorWalletRef),
      starterEntitlementRef ? transaction.get(starterEntitlementRef) : Promise.resolve(null),
      actorBoardRef ? transaction.get(actorBoardRef) : Promise.resolve(null)
    ]);
    const priorReceipt = snapshotData(receiptSnapshot);
    if (priorReceipt?.result) return Object.freeze({ ...priorReceipt.result, idempotent: true });
    const current = snapshotData(propertySnapshot);
    if (current && current.propertyId !== submitted.propertyId) throw new Error('property_identity_conflict');
    const actorWallet = walletData(snapshotData(actorWalletSnapshot) || {});
    const actorBoard = boardData(snapshotData(actorBoardSnapshot) || {}, uid, actorName);
    const starterEntitlement = snapshotData(starterSnapshot) || {};
    const leaseActive = current?.tenantUid && timestampMillis(current.leaseEndsAt, 0) > nowMs;
    const base = current || {
      authority: 'world-property-transaction-v1',
      ...submitted,
      ownerUid: '', ownerName: '', tenantUid: '', tenantName: '', status: PROPERTY_STATUS.available,
      salePrice: 0, rentPrice: 0, rentTermDays: 0, leaseStartsAt: null, leaseEndsAt: null,
      purchasePrice: 0, revision: 0, createdAt: timestampFromMs(nowMs)
    };
    let next = { ...base };
    let debit = 0;
    let credit = 0;
    let sellerUid = '';
    let sellerWalletRef = null;
    let sellerWallet = null;
    let sellerBoardRef = null;
    let sellerBoard = null;
    if (action === 'starter_claim') {
      if (starterEntitlement.claimed === true) return Object.freeze({ accepted: false, reason: 'starter_already_used' });
      if (base.ownerUid) return Object.freeze({ accepted: false, reason: 'already_owned' });
      if (!starterEntitlementRef) throw new Error('starter_entitlement_unavailable');
      next = { ...base, ownerUid: uid, ownerName: actorName, status: PROPERTY_STATUS.owned, purchasePrice: 0, acquisition: 'starter-deed' };
    } else if (action === 'buy') {
      if (base.ownerUid) return Object.freeze({ accepted: false, reason: 'already_owned' });
      debit = submitted.baseValue;
      if (actorWallet.credits < debit) return Object.freeze({ accepted: false, reason: 'not_enough_credits', credits: actorWallet.credits });
      next = { ...base, ownerUid: uid, ownerName: actorName, status: PROPERTY_STATUS.owned, purchasePrice: debit };
    } else if (action === 'sell_world') {
      if (base.ownerUid !== uid) return Object.freeze({ accepted: false, reason: 'not_owner' });
      if (leaseActive) return Object.freeze({ accepted: false, reason: 'lease_active' });
      credit = Math.floor(Math.min(finite(base.purchasePrice, base.baseValue), base.baseValue) * .85);
      next = { ...base, ownerUid: '', ownerName: '', status: PROPERTY_STATUS.available, salePrice: 0, rentPrice: 0, rentTermDays: 0, purchasePrice: 0 };
    } else if (action === 'list_sale') {
      if (base.ownerUid !== uid) return Object.freeze({ accepted: false, reason: 'not_owner' });
      if (leaseActive) return Object.freeze({ accepted: false, reason: 'lease_active' });
      const salePrice = integer(input?.salePrice, Math.ceil(base.baseValue * .5), Math.floor(base.baseValue * 2), base.baseValue);
      next = { ...base, status: PROPERTY_STATUS.sale, salePrice, rentPrice: 0, rentTermDays: 0 };
    } else if (action === 'buy_listing') {
      if (base.status !== PROPERTY_STATUS.sale || !base.ownerUid) return Object.freeze({ accepted: false, reason: 'not_for_sale' });
      if (base.ownerUid === uid) return Object.freeze({ accepted: false, reason: 'own_listing' });
      debit = integer(base.salePrice, 1, 500_000, base.baseValue);
      if (actorWallet.credits < debit) return Object.freeze({ accepted: false, reason: 'not_enough_credits', credits: actorWallet.credits });
      sellerUid = base.ownerUid;
      sellerWalletRef = sellerWalletRefForUid?.(sellerUid);
      if (!sellerWalletRef) throw new Error('seller_wallet_unavailable');
      sellerWallet = walletData(snapshotData(await transaction.get(sellerWalletRef)) || {});
      sellerBoardRef = sellerBoardRefForUid?.(sellerUid) || null;
      if (sellerBoardRef) sellerBoard = boardData(snapshotData(await transaction.get(sellerBoardRef)) || {}, sellerUid, base.ownerName);
      next = { ...base, ownerUid: uid, ownerName: actorName, status: PROPERTY_STATUS.owned, purchasePrice: debit, salePrice: 0 };
    } else if (action === 'list_rent') {
      if (base.ownerUid !== uid) return Object.freeze({ accepted: false, reason: 'not_owner' });
      if (leaseActive) return Object.freeze({ accepted: false, reason: 'lease_active' });
      const rentTermDays = integer(input?.rentTermDays, 1, 30, 7);
      const rentPrice = integer(input?.rentPrice, Math.max(1, Math.ceil(base.baseValue * .01)), Math.max(2, Math.floor(base.baseValue * .25)), Math.max(1, Math.ceil(base.baseValue * .05)));
      next = { ...base, status: PROPERTY_STATUS.rent, rentPrice, rentTermDays, salePrice: 0, tenantUid: '', tenantName: '', leaseStartsAt: null, leaseEndsAt: null };
    } else if (action === 'rent') {
      if (base.status !== PROPERTY_STATUS.rent || !base.ownerUid) return Object.freeze({ accepted: false, reason: 'not_for_rent' });
      if (base.ownerUid === uid) return Object.freeze({ accepted: false, reason: 'own_listing' });
      debit = integer(base.rentPrice, 1, 100_000, 1);
      if (actorWallet.credits < debit) return Object.freeze({ accepted: false, reason: 'not_enough_credits', credits: actorWallet.credits });
      sellerUid = base.ownerUid;
      sellerWalletRef = sellerWalletRefForUid?.(sellerUid);
      if (!sellerWalletRef) throw new Error('seller_wallet_unavailable');
      sellerWallet = walletData(snapshotData(await transaction.get(sellerWalletRef)) || {});
      sellerBoardRef = sellerBoardRefForUid?.(sellerUid) || null;
      if (sellerBoardRef) sellerBoard = boardData(snapshotData(await transaction.get(sellerBoardRef)) || {}, sellerUid, base.ownerName);
      const termMs = integer(base.rentTermDays, 1, 30, 7) * 86_400_000;
      next = { ...base, status: PROPERTY_STATUS.leased, tenantUid: uid, tenantName: actorName, leaseStartsAt: timestampFromMs(nowMs), leaseEndsAt: timestampFromMs(nowMs + termMs) };
    } else if (action === 'cancel_listing') {
      if (base.ownerUid !== uid) return Object.freeze({ accepted: false, reason: 'not_owner' });
      if (![PROPERTY_STATUS.sale, PROPERTY_STATUS.rent].includes(base.status)) return Object.freeze({ accepted: false, reason: 'not_listed' });
      next = { ...base, status: PROPERTY_STATUS.owned, salePrice: 0, rentPrice: 0, rentTermDays: 0 };
    }

    const nextActorWallet = {
      ...actorWallet,
      credits: actorWallet.credits - debit + credit,
      lifetimeEarned: actorWallet.lifetimeEarned + credit,
      lifetimeSpent: actorWallet.lifetimeSpent + debit,
      revision: actorWallet.revision + (debit || credit ? 1 : 0),
      updatedAt: timestampFromMs(nowMs)
    };
    next = { ...next, authority: 'world-property-transaction-v1', ...submitted, revision: integer(base.revision, 0, MAX_CREDITS, 0) + 1, updatedAt: timestampFromMs(nowMs) };
    const result = publicResult(next, nextActorWallet, receiptId);
    transaction.set(propertyRef, next, { merge: false });
    transaction.set(actorWalletRef, nextActorWallet, { merge: false });
    if (action === 'starter_claim') {
      transaction.set(starterEntitlementRef, {
        claimed: true,
        propertyId: submitted.propertyId,
        claimedAt: timestampFromMs(nowMs)
      }, { merge: false });
    }
    if (sellerWalletRef && sellerWallet) {
      transaction.set(sellerWalletRef, {
        ...sellerWallet,
        credits: Math.min(MAX_CREDITS, sellerWallet.credits + debit),
        lifetimeEarned: Math.min(MAX_CREDITS, sellerWallet.lifetimeEarned + debit),
        revision: sellerWallet.revision + 1,
        updatedAt: timestampFromMs(nowMs)
      }, { merge: false });
    }
    const receipt = {
      authority: 'world-property-transaction-v1', receiptId, action, roomCode, propertyId: submitted.propertyId,
      debit, credit, counterpartyUid: sellerUid, resultingOwnerUid: next.ownerUid, resultingTenantUid: next.tenantUid,
      result, createdAt: timestampFromMs(nowMs)
    };
    transaction.set(receiptRef, receipt, { merge: false });
    if (sellerUid && typeof notificationRefForUid === 'function') {
      const notificationRef = notificationRefForUid(sellerUid, receiptId);
      transaction.set(notificationRef, {
        type: action === 'rent' ? 'property-rented' : 'property-sold',
        title: action === 'rent' ? 'Your property was rented' : 'Your property was sold',
        message: `${actorName} completed a ${action === 'rent' ? 'rental' : 'purchase'} for ${submitted.label}.`,
        roomCode, propertyId: submitted.propertyId, actorUid: uid, actorName, read: false,
        createdAt: timestampFromMs(nowMs), expiresAt: timestampFromMs(nowMs + 90 * 86_400_000)
      }, { merge: false });
    }
    if (actorBoardRef) {
      const nextBoard = { ...actorBoard };
      if (['starter_claim', 'buy', 'buy_listing'].includes(action)) {
        nextBoard.propertiesOwned += 1;
        nextBoard.propertyValue = Math.min(MAX_CREDITS, nextBoard.propertyValue + submitted.baseValue);
      } else if (action === 'sell_world') {
        nextBoard.propertiesOwned = Math.max(0, nextBoard.propertiesOwned - 1);
        nextBoard.propertiesSold += 1;
        nextBoard.propertyValue = Math.max(0, nextBoard.propertyValue - submitted.baseValue);
      } else if (action === 'rent') nextBoard.rentalsStarted += 1;
      transaction.set(actorBoardRef, {
        ...nextBoard,
        achievements: boardAchievements(nextBoard),
        lastAction: action, lastRoomCode: roomCode,
        updatedAt: timestampFromMs(nowMs)
      }, { merge: false });
    }
    if (sellerBoardRef && sellerBoard) {
      const nextSellerBoard = { ...sellerBoard };
      if (action === 'buy_listing') {
        nextSellerBoard.propertiesOwned = Math.max(0, nextSellerBoard.propertiesOwned - 1);
        nextSellerBoard.propertiesSold += 1;
        nextSellerBoard.propertyValue = Math.max(0, nextSellerBoard.propertyValue - submitted.baseValue);
      } else if (action === 'rent') nextSellerBoard.rentalsHosted += 1;
      transaction.set(sellerBoardRef, {
        ...nextSellerBoard,
        achievements: boardAchievements(nextSellerBoard),
        lastAction: action === 'rent' ? 'rental-hosted' : 'property-sold',
        lastRoomCode: roomCode,
        updatedAt: timestampFromMs(nowMs)
      }, { merge: false });
    }
    if (activityRef && ['starter_claim', 'buy', 'sell_world', 'buy_listing', 'rent'].includes(action)) {
      transaction.set(activityRef, {
        type: action === 'rent' ? 'property-rented' : ['starter_claim', 'buy', 'buy_listing'].includes(action) ? 'home-base-updated' : 'property-sold',
        uid, displayName: actorName, roomCode, propertyId: submitted.propertyId,
        text: action === 'rent' ? `Rented ${submitted.label}` : action === 'starter_claim' ? `Chose ${submitted.label} as a first property` : action.includes('buy') ? `Bought ${submitted.label}` : `Sold ${submitted.label}`,
        createdAt: timestampFromMs(nowMs)
      }, { merge: false });
    }
    return result;
  });
}

module.exports = {
  PROPERTY_STATUS,
  STARTING_CREDITS,
  normalizeProperty,
  propertyBaseValue,
  propertyDocumentId,
  settlePropertyAction,
  settlePropertyTrade,
  walletData
};
