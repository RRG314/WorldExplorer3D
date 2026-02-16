import {
  Timestamp,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { initFirebase } from './firebase-init.js';

const USERS_COLLECTION = 'users';
const TRIAL_DURATION_MS = 48 * 60 * 60 * 1000;
const ACTIVE_SUB_STATUSES = new Set(['active', 'trialing', 'past_due']);

const FREE_ENTITLEMENTS = Object.freeze({
  fullAccess: true,
  cloudSync: false,
  proEarlyAccess: false,
  prioritySupport: false,
  featureConsideration: false,
  directContact: false
});

const TRIAL_ENTITLEMENTS = Object.freeze({
  fullAccess: true,
  cloudSync: true,
  proEarlyAccess: false,
  prioritySupport: false,
  featureConsideration: false,
  directContact: false
});

const SUPPORTER_ENTITLEMENTS = Object.freeze({
  fullAccess: true,
  cloudSync: true,
  proEarlyAccess: false,
  prioritySupport: false,
  featureConsideration: false,
  directContact: false
});

const PRO_ENTITLEMENTS = Object.freeze({
  fullAccess: true,
  cloudSync: true,
  proEarlyAccess: true,
  prioritySupport: true,
  featureConsideration: true,
  directContact: true
});

function cloneEntitlements(source) {
  return {
    fullAccess: !!source.fullAccess,
    cloudSync: !!source.cloudSync,
    proEarlyAccess: !!source.proEarlyAccess,
    prioritySupport: !!source.prioritySupport,
    featureConsideration: !!source.featureConsideration,
    directContact: !!source.directContact
  };
}

export function entitlementsForPlan(plan) {
  switch (String(plan || '').toLowerCase()) {
    case 'trial':
      return cloneEntitlements(TRIAL_ENTITLEMENTS);
    case 'supporter':
      return cloneEntitlements(SUPPORTER_ENTITLEMENTS);
    case 'pro':
      return cloneEntitlements(PRO_ENTITLEMENTS);
    default:
      return cloneEntitlements(FREE_ENTITLEMENTS);
  }
}

function normalizePlan(plan) {
  const lowered = String(plan || '').toLowerCase();
  if (lowered === 'trial' || lowered === 'supporter' || lowered === 'pro') return lowered;
  return 'free';
}

function planLabel(plan) {
  if (plan === 'trial') return 'Trial';
  if (plan === 'supporter') return 'Supporter';
  if (plan === 'pro') return 'Pro';
  return 'Free';
}

function timestampToMillis(value) {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function hasActiveSubscription(profile) {
  return ACTIVE_SUB_STATUSES.has(String(profile.subscriptionStatus || '').toLowerCase());
}

function isTrialExpired(profile, nowMs = Date.now()) {
  if (profile.plan !== 'trial') return false;
  const trialEndsAtMs = timestampToMillis(profile.trialEndsAt);
  if (!trialEndsAtMs) return false;
  return nowMs > trialEndsAtMs;
}

function normalizeProfile(uid, raw = {}) {
  const plan = normalizePlan(raw.plan);
  const entitlements = raw.entitlements && typeof raw.entitlements === 'object' ?
    cloneEntitlements({ ...entitlementsForPlan(plan), ...raw.entitlements }) :
    entitlementsForPlan(plan);

  return {
    uid,
    plan,
    planLabel: planLabel(plan),
    subscriptionStatus: String(raw.subscriptionStatus || 'none'),
    stripeCustomerId: raw.stripeCustomerId || null,
    stripeSubscriptionId: raw.stripeSubscriptionId || null,
    trialEndsAt: raw.trialEndsAt || null,
    trialEndsAtMs: timestampToMillis(raw.trialEndsAt),
    entitlements,
    updatedAt: raw.updatedAt || null
  };
}

function freeState() {
  return {
    uid: null,
    plan: 'free',
    planLabel: 'Free',
    subscriptionStatus: 'none',
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    trialEndsAt: null,
    trialEndsAtMs: null,
    entitlements: entitlementsForPlan('free'),
    updatedAt: null
  };
}

function broadcastEntitlements(state, user = null) {
  const payload = {
    isAuthenticated: !!user,
    uid: user ? user.uid : null,
    email: user && user.email ? user.email : null,
    displayName: user && user.displayName ? user.displayName : null,
    plan: state.plan,
    planLabel: state.planLabel,
    subscriptionStatus: state.subscriptionStatus,
    trialEndsAtMs: state.trialEndsAtMs,
    entitlements: { ...state.entitlements }
  };

  globalThis.__WE3D_ENTITLEMENTS__ = payload;
  globalThis.dispatchEvent(new CustomEvent('we3d-entitlements-changed', { detail: payload }));
  return payload;
}

async function ensureUserDoc(user) {
  const services = initFirebase();
  if (!services || !services.db || !user) return freeState();

  const ref = doc(services.db, USERS_COLLECTION, user.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    return normalizeProfile(user.uid, snap.data());
  }

  const trialEndsAt = Timestamp.fromMillis(Date.now() + TRIAL_DURATION_MS);
  const created = {
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || '',
    plan: 'trial',
    subscriptionStatus: 'none',
    trialEndsAt,
    entitlements: entitlementsForPlan('trial'),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  await setDoc(ref, created, { merge: true });
  return normalizeProfile(user.uid, created);
}

async function applyTrialDowngradeIfNeeded(profile) {
  const services = initFirebase();
  if (!services || !services.db || !profile || !profile.uid) return profile;

  if (!isTrialExpired(profile) || hasActiveSubscription(profile)) {
    return profile;
  }

  const patch = {
    plan: 'free',
    entitlements: entitlementsForPlan('free'),
    updatedAt: serverTimestamp()
  };

  await setDoc(doc(services.db, USERS_COLLECTION, profile.uid), patch, { merge: true });
  return {
    ...profile,
    plan: 'free',
    planLabel: 'Free',
    entitlements: entitlementsForPlan('free')
  };
}

export async function ensureEntitlements(user) {
  if (!user) {
    const state = freeState();
    broadcastEntitlements(state, null);
    return state;
  }

  let profile = await ensureUserDoc(user);
  profile = await applyTrialDowngradeIfNeeded(profile);

  const state = {
    ...profile,
    plan: normalizePlan(profile.plan),
    planLabel: planLabel(normalizePlan(profile.plan)),
    entitlements: cloneEntitlements(profile.entitlements)
  };

  broadcastEntitlements(state, user);
  return state;
}

export function subscribeEntitlements(user, callback) {
  if (!user) {
    const state = freeState();
    broadcastEntitlements(state, null);
    if (typeof callback === 'function') callback(state);
    return () => {};
  }

  const services = initFirebase();
  if (!services || !services.db) {
    const state = freeState();
    broadcastEntitlements(state, null);
    if (typeof callback === 'function') callback(state);
    return () => {};
  }

  const ref = doc(services.db, USERS_COLLECTION, user.uid);
  return onSnapshot(ref, async (snap) => {
    if (!snap.exists()) {
      const state = await ensureEntitlements(user);
      if (typeof callback === 'function') callback(state);
      return;
    }

    let profile = normalizeProfile(user.uid, snap.data());
    profile = await applyTrialDowngradeIfNeeded(profile);
    const state = {
      ...profile,
      plan: normalizePlan(profile.plan),
      planLabel: planLabel(normalizePlan(profile.plan)),
      entitlements: cloneEntitlements(profile.entitlements)
    };

    broadcastEntitlements(state, user);
    if (typeof callback === 'function') callback(state);
  }, async (err) => {
    console.warn('[entitlements] Snapshot failed:', err);
    const state = await ensureEntitlements(user);
    if (typeof callback === 'function') callback(state);
  });
}

export function getFreeEntitlementsState() {
  const state = freeState();
  broadcastEntitlements(state, null);
  return state;
}

export function isProPlan(state) {
  return !!state && state.plan === 'pro';
}

export function isSupporterOrTrial(state) {
  return !!state && (state.plan === 'supporter' || state.plan === 'trial' || state.plan === 'pro');
}

export function formatRemainingTrial(state) {
  if (!state || state.plan !== 'trial' || !state.trialEndsAtMs) return null;
  const remainingMs = state.trialEndsAtMs - Date.now();
  if (remainingMs <= 0) return 'expired';

  const hours = Math.floor(remainingMs / (60 * 60 * 1000));
  const mins = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
  return `${hours}h ${mins}m remaining`;
}
