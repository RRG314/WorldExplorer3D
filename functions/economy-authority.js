'use strict';

const STARTING_CREDITS = 1_000_000;
const MAX_CREDITS = 2_000_000_000;
const CURRENCY_VERSION = 2;
const LEGACY_CURRENCY_SCALE = 2000;
const STANDARD_DAILY_QUANTITY = 3;

const COMMERCE_CATALOG = Object.freeze({
  'trail-water': Object.freeze({ buy: 4, sell: 2 }),
  'route-snack': Object.freeze({ buy: 6, sell: 3 }),
  'battery-pack': Object.freeze({ buy: 14, sell: 7 }),
  'first-aid-pouch': Object.freeze({ buy: 18, sell: 9 }),
  'field-medicine': Object.freeze({ buy: 34, sell: 17 }),
  'city-postcard': Object.freeze({ buy: 10, sell: 5 }),
  'field-notebook': Object.freeze({ buy: 12, sell: 6 }),
  'reclaimed-aluminum-stock': Object.freeze({ buy: 42, sell: 21 }),
  'ceramic-repair-stock': Object.freeze({ buy: 38, sell: 19 }),
  'copper-wire-coil': Object.freeze({ buy: 28, sell: 14 }),
  'sealed-bearing-kit': Object.freeze({ buy: 55, sell: 27 }),
  'repair-sealant-case': Object.freeze({ buy: 34, sell: 17 }),
  'vehicle-full-repair': Object.freeze({ service: 3800 }),
  'companion-wellness': Object.freeze({ service: 180 }),
  'player-treatment': Object.freeze({ service: 450 }),
  'vessel-full-repair': Object.freeze({ service: 4200 }),
  'vehicle-upgrade:engine-tune:1': Object.freeze({ service: 4000 }),
  'vehicle-upgrade:engine-tune:2': Object.freeze({ service: 9000 }),
  'vehicle-upgrade:engine-tune:3': Object.freeze({ service: 18000 }),
  'vehicle-upgrade:street-brakes:1': Object.freeze({ service: 2500 }),
  'vehicle-upgrade:street-brakes:2': Object.freeze({ service: 5200 }),
  'vehicle-upgrade:street-brakes:3': Object.freeze({ service: 9500 }),
  'vehicle-upgrade:all-road-tires:1': Object.freeze({ service: 1200 }),
  'vehicle-upgrade:all-road-tires:2': Object.freeze({ service: 2400 }),
  'vehicle-upgrade:all-road-tires:3': Object.freeze({ service: 4500 }),
  'vehicle-upgrade:reinforced-suspension:1': Object.freeze({ service: 3000 }),
  'vehicle-upgrade:reinforced-suspension:2': Object.freeze({ service: 6500 }),
  'vehicle-upgrade:reinforced-suspension:3': Object.freeze({ service: 12000 })
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function integer(value, min, max, fallback = min) {
  return Math.max(min, Math.min(max, Math.round(finite(value, fallback))));
}

function clean(value, max = 180) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function snapshotData(snapshot) {
  if (!snapshot) return null;
  const exists = typeof snapshot.exists === 'function' ? snapshot.exists() : snapshot.exists === true;
  return exists ? (snapshot.data() || {}) : null;
}

function walletData(raw = {}) {
  const legacy = finite(raw.currencyVersion) < CURRENCY_VERSION;
  const scale = legacy && Object.keys(raw).length ? LEGACY_CURRENCY_SCALE : 1;
  return {
    authority: 'explorer-wallet-v2',
    credits: integer(finite(raw.credits, STARTING_CREDITS) * scale, 0, MAX_CREDITS, STARTING_CREDITS),
    lifetimeEarned: integer(finite(raw.lifetimeEarned, finite(raw.credits, STARTING_CREDITS)) * scale, 0, MAX_CREDITS, STARTING_CREDITS),
    lifetimeSpent: integer(finite(raw.lifetimeSpent) * scale, 0, MAX_CREDITS, 0),
    revision: integer(raw.revision, 0, MAX_CREDITS, 0),
    currencyVersion: CURRENCY_VERSION
  };
}

async function settleCommerceTransaction(options = {}) {
  const { runTransaction, walletRef, receiptRef, itemRef, stockRef, timestampFromMs, uid, nowMs = Date.now(), input = {} } = options;
  if (typeof runTransaction !== 'function' || !walletRef || !receiptRef || !itemRef || !stockRef || !uid || typeof timestampFromMs !== 'function') {
    throw new TypeError('commerce transaction dependencies are required');
  }
  const action = clean(input.action, 16).toLowerCase();
  const requestId = clean(input.requestId, 120);
  const storeId = clean(input.storeId, 420);
  const catalogId = clean(input.catalogId, 100);
  const targetId = clean(input.targetId, 180);
  const dayKey = clean(input.dayKey, 10);
  const definition = COMMERCE_CATALOG[catalogId];
  const expectedDayKey = new Date(nowMs).toISOString().slice(0, 10);
  if (!['buy', 'sell', 'service'].includes(action) || !requestId || !storeId || !definition || dayKey !== expectedDayKey || (action === 'service') !== Number.isFinite(definition.service)) {
    throw new Error('invalid_commerce_transaction');
  }
  return runTransaction(async (transaction) => {
    const [receiptSnapshot, walletSnapshot, itemSnapshot, stockSnapshot] = await Promise.all([
      transaction.get(receiptRef), transaction.get(walletRef), transaction.get(itemRef), transaction.get(stockRef)
    ]);
    const prior = snapshotData(receiptSnapshot);
    if (prior) return Object.freeze({ ...prior, duplicate: true });
    const wallet = walletData(snapshotData(walletSnapshot) || {});
    const item = snapshotData(itemSnapshot) || { catalogId, quantity: 0 };
    const quantity = integer(item.quantity, 0, 100000, 0);
    const stock = snapshotData(stockSnapshot) || { dayKey, storeId, catalogId, purchased: 0 };
    const purchased = integer(stock.purchased, 0, STANDARD_DAILY_QUANTITY, 0);
    const amount = action === 'buy' ? definition.buy : action === 'sell' ? definition.sell : definition.service;
    if (action !== 'sell' && wallet.credits < amount) return Object.freeze({ accepted: false, reason: 'not_enough_credits', credits: wallet.credits });
    if (action === 'buy' && purchased >= STANDARD_DAILY_QUANTITY) return Object.freeze({ accepted: false, reason: 'sold_out', credits: wallet.credits });
    if (action === 'sell' && quantity < 1) return Object.freeze({ accepted: false, reason: 'item_not_owned', credits: wallet.credits });
    const nextWallet = {
      ...wallet,
      credits: wallet.credits + (action === 'sell' ? amount : -amount),
      lifetimeEarned: wallet.lifetimeEarned + (action === 'sell' ? amount : 0),
      lifetimeSpent: wallet.lifetimeSpent + (action !== 'sell' ? amount : 0),
      revision: wallet.revision + 1,
      updatedAt: timestampFromMs(nowMs)
    };
    const nextItem = {
      authority: 'explorer-commerce-item-v1', catalogId,
      quantity: quantity + (action === 'buy' ? 1 : action === 'sell' ? -1 : 0),
      revision: integer(item.revision, 0, MAX_CREDITS, 0) + 1,
      updatedAt: timestampFromMs(nowMs)
    };
    const receipt = {
      accepted: true, authority: 'explorer-wallet-v2', requestId, action, storeId, catalogId, targetId, dayKey,
      amount, credits: nextWallet.credits, itemQuantity: action === 'service' ? null : nextItem.quantity,
      storePurchased: action === 'buy' ? purchased + 1 : purchased,
      settlementStatus: action === 'service' ? 'effect_pending' : 'complete',
      createdAt: timestampFromMs(nowMs)
    };
    transaction.set(walletRef, nextWallet, { merge: false });
    if (action !== 'service') transaction.set(itemRef, nextItem, { merge: false });
    if (action === 'buy') transaction.set(stockRef, {
      authority: 'explorer-commerce-stock-v1', dayKey, storeId, catalogId,
      purchased: purchased + 1, updatedAt: timestampFromMs(nowMs)
    }, { merge: false });
    transaction.set(receiptRef, receipt, { merge: false });
    return Object.freeze({ ...receipt, itemId: action === 'service' ? '' : itemRef.id || '' });
  });
}

async function settleCommerceOutcome(options = {}) {
  const { runTransaction, walletRef, receiptRef, playerProgressRef, timestampFromMs, nowMs = Date.now(), input = {} } = options;
  if (typeof runTransaction !== 'function' || !walletRef || !receiptRef || typeof timestampFromMs !== 'function') {
    throw new TypeError('commerce outcome dependencies are required');
  }
  const requestId = clean(input.requestId, 120);
  const outcome = clean(input.outcome, 24).toLowerCase();
  const reason = clean(input.reason, 120);
  if (!requestId || !['applied', 'failed'].includes(outcome)) throw new Error('invalid_commerce_outcome');
  return runTransaction(async (transaction) => {
    const [receiptSnapshot, walletSnapshot, progressSnapshot] = await Promise.all([
      transaction.get(receiptRef),
      transaction.get(walletRef),
      playerProgressRef ? transaction.get(playerProgressRef) : Promise.resolve(null)
    ]);
    const receipt = snapshotData(receiptSnapshot);
    if (!receipt || receipt.requestId !== requestId || receipt.action !== 'service' || receipt.accepted !== true) {
      throw new Error('commerce_receipt_not_found');
    }
    if (['complete', 'compensated'].includes(receipt.settlementStatus)) {
      return Object.freeze({ ...receipt, duplicate: true });
    }
    if (outcome === 'applied') {
      const settled = { ...receipt, settlementStatus: 'complete', effectAppliedAt: timestampFromMs(nowMs) };
      transaction.set(receiptRef, settled, { merge: false });
      const upgrade = /^vehicle-upgrade:([a-z0-9-]+):(\d+)$/.exec(String(receipt.catalogId || ''));
      if (playerProgressRef && upgrade && receipt.targetId) {
        const current = snapshotData(progressSnapshot) || {};
        const vehicles = current.vehicles && typeof current.vehicles === 'object' ? { ...current.vehicles } : {};
        const levels = vehicles[receipt.targetId] && typeof vehicles[receipt.targetId] === 'object'
          ? { ...vehicles[receipt.targetId] }
          : {};
        levels[upgrade[1]] = Math.max(Number(levels[upgrade[1]] || 0), Number(upgrade[2]));
        vehicles[receipt.targetId] = levels;
        transaction.set(playerProgressRef, {
          authority: 'explorer-player-state-v1',
          schemaVersion: 1,
          vehicles,
          revision: Math.max(0, Number(current.revision || 0)) + 1,
          updatedAt: timestampFromMs(nowMs)
        }, { merge: false });
      }
      return Object.freeze(settled);
    }
    const wallet = walletData(snapshotData(walletSnapshot) || {});
    const amount = integer(receipt.amount, 0, MAX_CREDITS, 0);
    const nextWallet = {
      ...wallet,
      credits: Math.min(MAX_CREDITS, wallet.credits + amount),
      lifetimeSpent: Math.max(0, wallet.lifetimeSpent - amount),
      revision: wallet.revision + 1,
      updatedAt: timestampFromMs(nowMs)
    };
    const compensated = {
      ...receipt,
      settlementStatus: 'compensated',
      compensationReason: reason || 'gameplay_effect_failed',
      credits: nextWallet.credits,
      compensatedAt: timestampFromMs(nowMs)
    };
    transaction.set(walletRef, nextWallet, { merge: false });
    transaction.set(receiptRef, compensated, { merge: false });
    return Object.freeze(compensated);
  });
}

module.exports = {
  COMMERCE_CATALOG,
  CURRENCY_VERSION,
  MAX_CREDITS,
  STARTING_CREDITS,
  STANDARD_DAILY_QUANTITY,
  settleCommerceOutcome,
  settleCommerceTransaction,
  walletData
};
