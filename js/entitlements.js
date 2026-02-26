import {
  doc,
  getDoc,
  getDocFromServer,
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
  supporter: 3,
  pro: 10
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
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  const n = Math.floor(value);
  if (n !== value) return 0;
  return Math.max(0, Math.min(10000, n));
}

function normalizeRoomCreateLimitOrNull(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const n = Math.floor(value);
  if (n !== value) return null;
  return Math.max(0, Math.min(10000, n));
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

async function readUserSnapshot(ref, preferServer = false) {
  if (preferServer) {
    try {
      return await getDocFromServer(ref);
    } catch (err) {
      const code = String(err && err.code ? err.code : '');
      if (code !== 'unavailable' && code !== 'deadline-exceeded') {
        throw err;
      }
    }
  }
  return getDoc(ref);
}

function hasActiveTrialWindowData(raw = {}, nowMs = Date.now()) {
  const plan = normalizePlan(raw.plan);
  if (plan !== 'trial') return false;
  const trialEndsAtMs = timestampToMillis(raw.trialEndsAt) || timestampToMillis(raw.trialEndsAtMs);
  if (!trialEndsAtMs) return false;
  return trialEndsAtMs > nowMs;
}

function isTrialExpired(profile, nowMs = Date.now()) {
  if (profile.plan !== 'trial') return false;
  const trialEndsAtMs = timestampToMillis(profile.trialEndsAt);
  if (!trialEndsAtMs) return false;
  return nowMs > trialEndsAtMs;
}

async function hasAdminTokenClaim(user, forceRefresh = false) {
  if (!user || typeof user.getIdTokenResult !== 'function') return false;
  try {
    const tokenResult = await user.getIdTokenResult(forceRefresh);
    const claims = tokenResult && tokenResult.claims ? tokenResult.claims : {};
    return claims.admin === true || String(claims.role || '').toLowerCase() === 'admin';
  } catch (err) {
    console.warn('[entitlements] Unable to read auth token claims:', err);
    return false;
  }
}

function normalizeProfile(uid, raw = {}, options = {}) {
  const basePlan = normalizePlan(raw.plan);
  const hasAdminStatus = String(raw.subscriptionStatus || '').toLowerCase() === 'admin';
  const hasAdminClaim = options && options.adminClaim === true;
  const isAdmin = hasAdminStatus || hasAdminClaim;
  const hasActiveTrialWindow = hasActiveTrialWindowData(raw);
  const plan = isAdmin
    ? 'pro'
    : (
        hasActiveTrialWindow
          ? 'trial'
          : (basePlan === 'supporter' || basePlan === 'pro' ? basePlan : 'free')
      );
  const baseEntitlements = entitlementsForPlan(plan);
  const entitlements = raw.entitlements && typeof raw.entitlements === 'object'
    ? cloneEntitlements({ ...baseEntitlements, ...raw.entitlements })
    : baseEntitlements;
  const roomCreateCount = normalizeRoomCreateCount(raw.roomCreateCount);
  const persistedRoomCreateLimit = normalizeRoomCreateLimitOrNull(raw.roomCreateLimit);
  const planRoomCreateLimit = roomCreateLimitForPlan(plan);
  const roomCreateLimit = Math.max(
    planRoomCreateLimit,
    persistedRoomCreateLimit == null ? planRoomCreateLimit : persistedRoomCreateLimit
  );

  return {
    uid,
    plan,
    planLabel: isAdmin ? 'Admin' : planLabel(plan),
    isAdmin,
    subscriptionStatus: String(raw.subscriptionStatus || 'none'),
    stripeCustomerId: raw.stripeCustomerId || null,
    stripeSubscriptionId: raw.stripeSubscriptionId || null,
    trialEndsAt: raw.trialEndsAt || null,
    trialEndsAtMs: timestampToMillis(raw.trialEndsAt) || timestampToMillis(raw.trialEndsAtMs),
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

async function ensureUserDoc(user, options = {}) {
  const services = initFirebase();
  if (!services || !services.db || !user) return freeState();

  const ref = doc(services.db, USERS_COLLECTION, user.uid);
  const preferServer = options && options.preferServer === true;
  const snap = await readUserSnapshot(ref, preferServer);
  const initialAdminClaim = await hasAdminTokenClaim(user, false);

  if (snap.exists()) {
    const existing = snap.data() || {};
    const plan = normalizePlan(existing.plan);
    const nextEmail = user.email || existing.email || '';
    const nextDisplayName = user.displayName || existing.displayName || '';
    const existingRoomCreateCount = normalizeRoomCreateCount(existing.roomCreateCount);
    const existingRoomCreateLimitRaw = normalizeRoomCreateLimitOrNull(existing.roomCreateLimit);
    const isAdminStatus = String(existing.subscriptionStatus || '').toLowerCase() === 'admin';
    const isAdminClaim = isAdminStatus ? true : initialAdminClaim;
    const rulesPlan = isAdminStatus || isAdminClaim ? 'pro' : plan;
    const planRoomCreateLimit = roomCreateLimitForPlan(rulesPlan);
    const nextRoomCreateCount = existingRoomCreateCount;
    const normalizedStoredLimit = existingRoomCreateLimitRaw;
    const nextRoomCreateLimit = isAdminClaim
      ? Math.max(
          ADMIN_TEST_ROOM_CREATE_LIMIT,
          normalizedStoredLimit == null ? ADMIN_TEST_ROOM_CREATE_LIMIT : normalizedStoredLimit
        )
      : Math.max(
          planRoomCreateLimit,
          normalizedStoredLimit == null ? planRoomCreateLimit : normalizedStoredLimit
        );
    const needsPatch = (
      nextEmail !== (existing.email || '') ||
      nextDisplayName !== (existing.displayName || '') ||
      nextRoomCreateCount !== existingRoomCreateCount ||
      nextRoomCreateLimit !== existingRoomCreateLimitRaw
    );

    if (needsPatch) {
      try {
        await setDoc(ref, {
          email: nextEmail,
          displayName: nextDisplayName,
          roomCreateCount: nextRoomCreateCount,
          roomCreateLimit: nextRoomCreateLimit,
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (err) {
        const code = String(err && err.code ? err.code : '');
        if (code !== 'permission-denied') throw err;

        // Concurrent entitlement hydration can race on first sign-in. If another write
        // won the create/update, re-read and continue with canonical data.
        const retrySnap = await readUserSnapshot(ref, preferServer);
        if (!retrySnap.exists()) throw err;
        const retryData = retrySnap.data() || {};
        return normalizeProfile(user.uid, retryData, { adminClaim: isAdminClaim });
      }
    }

    return normalizeProfile(user.uid, {
      ...existing,
      email: nextEmail,
      displayName: nextDisplayName,
      roomCreateCount: nextRoomCreateCount,
      roomCreateLimit: nextRoomCreateLimit
    }, { adminClaim: isAdminClaim });
  }

  const created = {
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || '',
    roomCreateCount: 0,
    roomCreateLimit: initialAdminClaim ? ADMIN_TEST_ROOM_CREATE_LIMIT : roomCreateLimitForPlan('free'),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  try {
    await setDoc(ref, created, { merge: true });
    return normalizeProfile(user.uid, created, { adminClaim: initialAdminClaim });
  } catch (err) {
    const code = String(err && err.code ? err.code : '');
    if (code !== 'permission-denied') throw err;

    // If another concurrent call already created the doc, read and continue.
    const retrySnap = await readUserSnapshot(ref, preferServer);
    if (!retrySnap.exists()) throw err;
    return normalizeProfile(user.uid, retrySnap.data() || {}, { adminClaim: initialAdminClaim });
  }
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
  for (let attempt = 0; attempt < 6; attempt++) {
    const state = await ensureEntitlements(user, { preferServer: true });
    const plan = String(state && state.plan ? state.plan : 'free').toLowerCase();
    if (state && (state.isAdmin === true || plan === 'trial' || plan === 'supporter' || plan === 'pro')) {
      return state;
    }
    await new Promise((resolve) => setTimeout(resolve, 200 + (attempt * 120)));
  }
  return ensureEntitlements(user, { preferServer: true });
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

export async function ensureEntitlements(user, options = {}) {
  if (!user) {
    const state = freeState();
    broadcastEntitlements(state, null);
    return state;
  }

  let profile = await ensureUserDoc(user, options);
  profile = await applyTrialDowngradeIfNeeded(profile);
  const adminClaim = profile.isAdmin === true ? true : await hasAdminTokenClaim(user, false);

  const state = normalizeProfile(user.uid, profile, { adminClaim });

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
    const adminClaim = profile.isAdmin === true ? true : await hasAdminTokenClaim(user, false);
    const state = normalizeProfile(user.uid, profile, { adminClaim });

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
