import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { initFirebase } from './firebase-init.js';
import { startTrial as requestTrialStart } from './billing.js';

const USERS_COLLECTION = 'users';
const ACTIVE_SUB_STATUSES = new Set(['active', 'trialing', 'past_due']);
const ROOM_CREATE_LIMITS = Object.freeze({
  free: 0,
  trial: 3,
  supporter: 10,
  pro: 25
});
const ADMIN_TEST_ROOM_CREATE_LIMIT = 10000;

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
  switch (normalizePlan(plan)) {
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
  if (lowered === 'support') return 'supporter';
  if (lowered === 'trial' || lowered === 'supporter' || lowered === 'pro') return lowered;
  return 'free';
}

function roomCreateLimitForPlan(plan) {
  const normalized = normalizePlan(plan);
  return ROOM_CREATE_LIMITS[normalized] || ROOM_CREATE_LIMITS.free;
}

function normalizeRoomCreateCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(10000, Math.floor(n)));
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
  const isAdmin = String(raw.subscriptionStatus || '').toLowerCase() === 'admin';
  const baseEntitlements = entitlementsForPlan(isAdmin ? 'pro' : plan);
  const entitlements = raw.entitlements && typeof raw.entitlements === 'object'
    ? cloneEntitlements({ ...baseEntitlements, ...raw.entitlements })
    : baseEntitlements;
  const roomCreateCount = normalizeRoomCreateCount(raw.roomCreateCount);
  const persistedRoomCreateLimit = Number.isFinite(Number(raw.roomCreateLimit))
    ? Math.max(0, Math.min(10000, Math.floor(Number(raw.roomCreateLimit))))
    : roomCreateLimitForPlan(plan);
  const roomCreateLimit = isAdmin
    ? Math.max(persistedRoomCreateLimit, ADMIN_TEST_ROOM_CREATE_LIMIT)
    : persistedRoomCreateLimit;

  return {
    uid,
    plan,
    planLabel: isAdmin ? 'Admin' : planLabel(plan),
    isAdmin,
    subscriptionStatus: String(raw.subscriptionStatus || 'none'),
    stripeCustomerId: raw.stripeCustomerId || null,
    stripeSubscriptionId: raw.stripeSubscriptionId || null,
    trialEndsAt: raw.trialEndsAt || null,
    trialEndsAtMs: timestampToMillis(raw.trialEndsAt),
    roomCreateCount,
    roomCreateLimit,
    entitlements,
    updatedAt: raw.updatedAt || null
  };
}

function freeState() {
  return {
    uid: null,
    plan: 'free',
    planLabel: 'Free',
    isAdmin: false,
    subscriptionStatus: 'none',
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    trialEndsAt: null,
    trialEndsAtMs: null,
    roomCreateCount: 0,
    roomCreateLimit: ROOM_CREATE_LIMITS.free,
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
    isAdmin: !!state.isAdmin,
    role: state.isAdmin ? 'admin' : 'member',
    plan: state.plan,
    planLabel: state.planLabel,
    subscriptionStatus: state.subscriptionStatus,
    trialEndsAtMs: state.trialEndsAtMs,
    roomCreateCount: state.roomCreateCount,
    roomCreateLimit: state.roomCreateLimit,
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
    const existing = snap.data() || {};
    const plan = normalizePlan(existing.plan);
    const nextEmail = user.email || existing.email || '';
    const nextDisplayName = user.displayName || existing.displayName || '';
    const existingRoomCreateCount = Number.isFinite(Number(existing.roomCreateCount))
      ? Math.floor(Number(existing.roomCreateCount))
      : null;
    const existingRoomCreateLimit = Number.isFinite(Number(existing.roomCreateLimit))
      ? Math.floor(Number(existing.roomCreateLimit))
      : null;
    const nextRoomCreateCount = existingRoomCreateCount == null
      ? 0
      : normalizeRoomCreateCount(existingRoomCreateCount);
    const nextRoomCreateLimit = existingRoomCreateLimit == null
      ? roomCreateLimitForPlan(plan)
      : Math.max(0, Math.min(10000, existingRoomCreateLimit));
    const needsPatch = (
      nextEmail !== (existing.email || '') ||
      nextDisplayName !== (existing.displayName || '') ||
      nextRoomCreateCount !== existingRoomCreateCount ||
      nextRoomCreateLimit !== existingRoomCreateLimit
    );

    if (needsPatch) {
      await setDoc(ref, {
        email: nextEmail,
        displayName: nextDisplayName,
        roomCreateCount: nextRoomCreateCount,
        roomCreateLimit: nextRoomCreateLimit,
        updatedAt: serverTimestamp()
      }, { merge: true });
    }

    return normalizeProfile(user.uid, {
      ...existing,
      email: nextEmail,
      displayName: nextDisplayName,
      roomCreateCount: nextRoomCreateCount,
      roomCreateLimit: nextRoomCreateLimit
    });
  }

  const created = {
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || '',
    roomCreateCount: 0,
    roomCreateLimit: roomCreateLimitForPlan('free'),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  await setDoc(ref, created, { merge: true });
  return normalizeProfile(user.uid, created);
}

export async function startTrialIfEligible(user) {
  if (!user) {
    throw new Error('Sign in to start your trial.');
  }

  const services = initFirebase();
  if (!services || !services.db) {
    throw new Error('Firebase config is missing. Trial cannot start yet.');
  }
  await requestTrialStart();
  return ensureEntitlements(user);
}

async function applyTrialDowngradeIfNeeded(profile) {
  if (!profile || !profile.uid) return profile;

  if (!isTrialExpired(profile) || hasActiveSubscription(profile)) {
    return profile;
  }
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
  return !!state && (state.plan === 'pro' || state.isAdmin === true);
}

export function isSupporterOrTrial(state) {
  return !!state && (state.plan === 'supporter' || state.plan === 'trial' || state.plan === 'pro' || state.isAdmin === true);
}

export function formatRemainingTrial(state) {
  if (!state || state.plan !== 'trial' || !state.trialEndsAtMs) return null;
  const remainingMs = state.trialEndsAtMs - Date.now();
  if (remainingMs <= 0) return 'expired';

  const hours = Math.floor(remainingMs / (60 * 60 * 1000));
  const mins = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
  return `${hours}h ${mins}m remaining`;
}
