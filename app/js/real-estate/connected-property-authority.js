import {
  collection,
  doc,
  limit,
  onSnapshot,
  query,
  where
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { getCurrentUser } from '../../../js/auth-ui.js?v=55';
import { initFirebase } from '../../../js/firebase-init.js?v=57';
import { commitWorldPropertyAction, commitWorldPropertyTradeAction } from '../../../js/property-api.js?v=3';

const LOCATION_PROPERTY_LIMIT = 320;
const STARTING_WALLET_DOLLARS = 1000000;
const CURRENCY_VERSION = 2;
const LEGACY_CURRENCY_SCALE = 2000;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function timeMs(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (Number.isFinite(Number(value?.seconds))) return Number(value.seconds) * 1000;
  return finite(value);
}

function normalizeRecord(snapshot) {
  const data = snapshot?.data?.() || {};
  if (!data.propertyId) return null;
  return Object.freeze({
    ...data,
    documentId: snapshot.id,
    propertyId: String(data.propertyId),
    ownerUid: String(data.ownerUid || ''),
    ownerName: String(data.ownerName || ''),
    tenantUid: String(data.tenantUid || ''),
    tenantName: String(data.tenantName || ''),
    status: String(data.status || 'available'),
    baseValue: Math.max(0, finite(data.baseValue)),
    salePrice: Math.max(0, finite(data.salePrice)),
    rentPrice: Math.max(0, finite(data.rentPrice)),
    rentTermDays: Math.max(0, finite(data.rentTermDays)),
    leaseEndsAtMs: timeMs(data.leaseEndsAt),
    revision: Math.max(0, finite(data.revision))
  });
}

function normalizeTrade(snapshot) {
  const data = snapshot?.data?.() || {};
  if (!data.offerId || !data.offeredPropertyId || !data.requestedPropertyId) return null;
  return Object.freeze({
    ...data,
    documentId: snapshot.id,
    offerId: String(data.offerId),
    status: String(data.status || 'pending'),
    proposerUid: String(data.proposerUid || ''),
    proposerName: String(data.proposerName || ''),
    recipientUid: String(data.recipientUid || ''),
    recipientName: String(data.recipientName || ''),
    offeredPropertyId: String(data.offeredPropertyId || ''),
    offeredPropertyLabel: String(data.offeredPropertyLabel || 'Property'),
    requestedPropertyId: String(data.requestedPropertyId || ''),
    requestedPropertyLabel: String(data.requestedPropertyLabel || 'Property'),
    creditOffer: Math.max(0, finite(data.creditOffer)),
    expiresAtMs: timeMs(data.expiresAt),
    createdAtMs: timeMs(data.createdAt)
  });
}

function createConnectedPropertyAuthority(options = {}) {
  const room = options.room || null;
  const roomCode = String(room?.code || room?.id || '').trim().toUpperCase();
  const worldSeed = String(room?.world?.seed || options.worldSeed || '').trim();
  const locationId = String(options.locationId || '').trim();
  const user = getCurrentUser();
  const services = initFirebase();
  if (!worldSeed || !locationId || !user?.uid || !services?.db) return null;
  let disposed = false;
  const walletAuthority = options.walletAuthority || null;
  const initialWallet = walletAuthority?.snapshot?.() || {};
  let wallet = Object.freeze({
    credits: Math.max(0, finite(initialWallet.credits, STARTING_WALLET_DOLLARS)),
    pending: initialWallet.pending !== false,
    revision: Math.max(0, finite(initialWallet.revision)),
    currencyVersion: CURRENCY_VERSION
  });
  let records = new Map();
  let portfolioRecords = new Map();
  let rentalRecords = new Map();
  let incomingTrades = new Map();
  let outgoingTrades = new Map();
  let starterAvailable = true;
  const emit = () => options.onChange?.();
  const propertyQuery = query(collection(services.db, 'worldProperties'), where('locationId', '==', locationId), limit(LOCATION_PROPERTY_LIMIT));
  const stopProperties = onSnapshot(propertyQuery, (snapshot) => {
    if (disposed) return;
    records = new Map(snapshot.docs.map(normalizeRecord).filter(Boolean).map((record) => [record.propertyId, record]));
    emit();
  }, (error) => options.onError?.(error));
  const stopPortfolio = onSnapshot(query(collection(services.db, 'worldProperties'), where('ownerUid', '==', user.uid), limit(160)), (snapshot) => {
    if (disposed) return;
    portfolioRecords = new Map(snapshot.docs.map(normalizeRecord).filter(Boolean).map((record) => [record.propertyId, record]));
    emit();
  }, (error) => options.onError?.(error));
  const stopRentals = onSnapshot(query(collection(services.db, 'worldProperties'), where('tenantUid', '==', user.uid), limit(80)), (snapshot) => {
    if (disposed) return;
    rentalRecords = new Map(snapshot.docs.map(normalizeRecord).filter((record) => record && record.leaseEndsAtMs > Date.now()).map((record) => [record.propertyId, record]));
    emit();
  }, (error) => options.onError?.(error));
  const stopWallet = walletAuthority?.subscribe
    ? walletAuthority.subscribe((next) => {
      if (disposed) return;
      wallet = Object.freeze({
        credits: Math.max(0, finite(next?.credits, STARTING_WALLET_DOLLARS)),
        pending: next?.pending === true,
        revision: Math.max(0, finite(next?.revision)),
        currencyVersion: CURRENCY_VERSION
      });
      emit();
    })
    : onSnapshot(doc(services.db, 'users', user.uid, 'economy', 'wallet'), (snapshot) => {
      if (disposed) return;
      const data = snapshot.exists() ? snapshot.data() : {};
      const scale = snapshot.exists() && finite(data.currencyVersion) < CURRENCY_VERSION ? LEGACY_CURRENCY_SCALE : 1;
      wallet = Object.freeze({
        credits: Math.max(0, finite(data.credits, STARTING_WALLET_DOLLARS) * scale),
        pending: false,
        revision: Math.max(0, finite(data.revision)),
        currencyVersion: CURRENCY_VERSION
      });
      emit();
    }, (error) => options.onError?.(error));
  const stopStarter = onSnapshot(doc(services.db, 'users', user.uid, 'propertyEntitlements', 'starter'), (snapshot) => {
    if (disposed) return;
    starterAvailable = !snapshot.exists() || snapshot.data()?.claimed !== true;
    emit();
  }, (error) => options.onError?.(error));
  const stopIncomingTrades = onSnapshot(query(collection(services.db, 'propertyTradeOffers'), where('recipientUid', '==', user.uid), limit(80)), (snapshot) => {
    if (disposed) return;
    incomingTrades = new Map(snapshot.docs.map(normalizeTrade).filter(Boolean).map((offer) => [offer.offerId, offer]));
    emit();
  }, (error) => options.onError?.(error));
  const stopOutgoingTrades = onSnapshot(query(collection(services.db, 'propertyTradeOffers'), where('proposerUid', '==', user.uid), limit(80)), (snapshot) => {
    if (disposed) return;
    outgoingTrades = new Map(snapshot.docs.map(normalizeTrade).filter(Boolean).map((offer) => [offer.offerId, offer]));
    emit();
  }, (error) => options.onError?.(error));

  function joinCandidates(candidates = []) {
    return candidates.map((candidate) => {
      const shared = records.get(candidate.worldPropertyId) ||
        (candidate.legacyWorldPropertyIds || []).map((id) => records.get(id)).find(Boolean);
      return Object.freeze({
        ...candidate,
        ...(shared || {}),
        id: candidate.id,
        canonicalWorldPropertyId: candidate.worldPropertyId,
        worldPropertyId: shared?.propertyId || candidate.worldPropertyId,
        price: shared?.status === 'listed_for_sale' ? shared.salePrice : shared?.baseValue || candidate.price,
        owned: shared?.ownerUid === user.uid,
        rentedByMe: shared?.tenantUid === user.uid && shared.leaseEndsAtMs > Date.now(),
        shared: true,
        sharedEligible: candidate.sharedEligible === true
      });
    });
  }

  function snapshot(candidates = []) {
    const joined = joinCandidates(candidates);
    const currentHomes = joined.filter((property) => property.owned || property.rentedByMe);
    const currentWorldIds = new Set(currentHomes.map((property) => property.worldPropertyId));
    const remoteHomes = [...portfolioRecords.values(), ...rentalRecords.values()]
      .filter((record) => !currentWorldIds.has(record.propertyId))
      .map((record) => Object.freeze({
        ...record,
        id: record.propertyId,
        worldPropertyId: record.propertyId,
        price: record.baseValue,
        owned: record.ownerUid === user.uid,
        rentedByMe: record.tenantUid === user.uid && record.leaseEndsAtMs > Date.now(),
        shared: true,
        storage: Object.freeze([]),
        storageCapacity: 0
      }));
    const homes = [...currentHomes, ...remoteHomes];
    return Object.freeze({
      type: 'ConnectedPropertyAuthority',
      roomCode,
      shared: true,
      credits: wallet.credits,
      walletPending: wallet.pending,
      starterAvailable,
      primaryHomeId: homes[0]?.id || '',
      primaryHome: homes[0] || null,
      homes: Object.freeze(homes),
      candidates: Object.freeze(joined),
      records: Object.freeze([...records.values()]),
      incomingTrades: Object.freeze([...incomingTrades.values()].sort((left, right) => right.createdAtMs - left.createdAtMs)),
      outgoingTrades: Object.freeze([...outgoingTrades.values()].sort((left, right) => right.createdAtMs - left.createdAtMs))
    });
  }

  async function act(action, property, fields = {}) {
    if (disposed) return Object.freeze({ accepted: false, reason: 'disposed' });
    const requestId = `${action}:${user.uid.slice(0, 18)}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
    const actor = options.getActorPosition?.() || null;
    const actorPose = actor ? { x: finite(actor.x), z: finite(actor.z) } : null;
    return commitWorldPropertyAction({ roomCode, worldSeed, action, requestId, property, actorPose, ...fields });
  }

  async function actTrade(action, fields = {}) {
    if (disposed) return Object.freeze({ accepted: false, reason: 'disposed' });
    const requestId = `${action}:${user.uid.slice(0, 18)}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
    return commitWorldPropertyTradeAction({ roomCode, worldSeed, action, requestId, ...fields });
  }

  return Object.freeze({
    snapshot,
    buy: (property) => act(property.status === 'listed_for_sale' ? 'buy_listing' : starterAvailable ? 'starter_claim' : 'buy', property),
    sellWorld: (property) => act('sell_world', property),
    listSale: (property, salePrice) => act('list_sale', property, { salePrice }),
    listRent: (property, rentPrice, rentTermDays) => act('list_rent', property, { rentPrice, rentTermDays }),
    rent: (property) => act('rent', property),
    cancelListing: (property) => act('cancel_listing', property),
    proposeTrade: (offeredProperty, requestedProperty, creditOffer = 0) => actTrade('trade_offer', { offeredProperty, requestedProperty, creditOffer }),
    acceptTrade: (offerId) => actTrade('trade_accept', { offerId }),
    declineTrade: (offerId) => actTrade('trade_decline', { offerId }),
    cancelTrade: (offerId) => actTrade('trade_cancel', { offerId }),
    dispose() {
      if (disposed) return;
      disposed = true;
      stopProperties(); stopPortfolio(); stopRentals(); stopWallet(); stopStarter(); stopIncomingTrades(); stopOutgoingTrades();
    }
  });
}

export { createConnectedPropertyAuthority };
