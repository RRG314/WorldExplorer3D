import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { getCurrentUser } from './auth-ui.js';
import { initFirebase } from './firebase-init.js';

const CREATOR_PROFILES_COLLECTION = 'creatorProfiles';
const OVERLAY_PUBLISHED_COLLECTION = 'overlayPublished';
const CREATOR_SYSTEM_USER_ID = 'system_worldexplorer';

function sanitizeText(value, max = 120) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function sanitizeMultilineText(value, max = 320) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .trim()
    .slice(0, max);
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function timestampToMs(value, fallback = 0) {
  if (!value) return fallback;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return finiteNumber(value, fallback);
}

function clampStat(value) {
  return Math.max(0, Math.min(1000000, Math.round(finiteNumber(value, 0))));
}

function defaultCreatorStats() {
  return {
    activitiesCreated: 0,
    activitiesPublished: 0,
    totalPlays: 0,
    contributionsCount: 0,
    publishedContributions: 0
  };
}

function normalizeCreatorStats(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const base = defaultCreatorStats();
  return {
    activitiesCreated: clampStat(source.activitiesCreated ?? base.activitiesCreated),
    activitiesPublished: clampStat(source.activitiesPublished ?? base.activitiesPublished),
    totalPlays: clampStat(source.totalPlays ?? base.totalPlays),
    contributionsCount: clampStat(source.contributionsCount ?? base.contributionsCount),
    publishedContributions: clampStat(source.publishedContributions ?? base.publishedContributions)
  };
}

function normalizeCreatorSpaces(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    primaryRoomCode: sanitizeText(source.primaryRoomCode || '', 16).toUpperCase(),
    hubActivityId: sanitizeText(source.hubActivityId || '', 120).toLowerCase(),
    hubLabel: sanitizeText(source.hubLabel || '', 80)
  };
}

function defaultSystemCreatorProfile() {
  const now = Date.now();
  return {
    userId: CREATOR_SYSTEM_USER_ID,
    username: 'World Explorer',
    bio: 'System-authored routes, featured world challenges, and curated activities.',
    avatar: '🌍',
    discoverable: true,
    createdAtMs: now,
    updatedAtMs: now,
    stats: defaultCreatorStats(),
    spaces: normalizeCreatorSpaces()
  };
}

function fallbackCreatorProfileFromUser(user) {
  const now = Date.now();
  const displayName = sanitizeText(user?.displayName || user?.email?.split('@')[0] || 'Explorer', 60) || 'Explorer';
  return {
    userId: sanitizeText(user?.uid || '', 160),
    username: displayName,
    bio: '',
    avatar: '🌍',
    discoverable: true,
    createdAtMs: now,
    updatedAtMs: now,
    stats: defaultCreatorStats(),
    spaces: normalizeCreatorSpaces()
  };
}

function normalizeCreatorProfile(raw = {}, fallback = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const base = fallback && typeof fallback === 'object' ? fallback : {};
  const userId = sanitizeText(source.userId || base.userId || '', 160);
  const createdAtMs = timestampToMs(source.createdAt, finiteNumber(source.createdAtMs, finiteNumber(base.createdAtMs, Date.now())));
  const updatedAtMs = timestampToMs(source.updatedAt, finiteNumber(source.updatedAtMs, finiteNumber(base.updatedAtMs, createdAtMs)));
  return {
    userId,
    username: sanitizeText(source.username || base.username || 'Explorer', 60) || 'Explorer',
    bio: sanitizeMultilineText(source.bio || base.bio || '', 320),
    avatar: sanitizeText(source.avatar || base.avatar || '🌍', 12) || '🌍',
    discoverable: source.discoverable !== false && base.discoverable !== false,
    createdAtMs,
    updatedAtMs,
    stats: normalizeCreatorStats(source.stats || base.stats || {}),
    spaces: normalizeCreatorSpaces(source.spaces || base.spaces || {})
  };
}

function requireServices() {
  const services = initFirebase();
  if (!services?.db) {
    throw new Error('Creator profiles require Firebase configuration.');
  }
  return services;
}

function creatorProfileRef(db, userId) {
  return doc(db, CREATOR_PROFILES_COLLECTION, sanitizeText(userId || '', 160));
}

async function getCreatorProfile(userId = '') {
  const cleanUserId = sanitizeText(userId || '', 160);
  if (!cleanUserId) return null;
  if (cleanUserId === CREATOR_SYSTEM_USER_ID) {
    return defaultSystemCreatorProfile();
  }
  const { db } = requireServices();
  const snap = await getDoc(creatorProfileRef(db, cleanUserId));
  if (!snap.exists()) return null;
  return normalizeCreatorProfile(snap.data() || {}, { userId: cleanUserId });
}

function listenCreatorProfile(userId = '', callback = () => {}) {
  const cleanUserId = sanitizeText(userId || '', 160);
  if (!cleanUserId || typeof callback !== 'function') return () => {};
  if (cleanUserId === CREATOR_SYSTEM_USER_ID) {
    callback(defaultSystemCreatorProfile());
    return () => {};
  }
  const { db } = requireServices();
  return onSnapshot(creatorProfileRef(db, cleanUserId), (snap) => {
    callback(snap.exists() ? normalizeCreatorProfile(snap.data() || {}, { userId: cleanUserId }) : null);
  });
}

async function ensureOwnCreatorProfile(options = {}) {
  const user = getCurrentUser();
  if (!user?.uid) {
    throw new Error('Sign in is required to create a creator profile.');
  }
  const { db } = requireServices();
  const ref = creatorProfileRef(db, user.uid);
  const snap = await getDoc(ref);
  const rawExisting = snap.exists() ? snap.data() || {} : {};
  const existing = snap.exists() ? normalizeCreatorProfile(rawExisting, fallbackCreatorProfileFromUser(user)) : fallbackCreatorProfileFromUser(user);
  const payload = {
    userId: user.uid,
    username: sanitizeText(options.username || options.displayName || existing.username || user.displayName || user.email?.split('@')[0] || 'Explorer', 60) || 'Explorer',
    bio: sanitizeMultilineText(options.bio ?? existing.bio ?? '', 320),
    avatar: sanitizeText(options.avatar || existing.avatar || '🌍', 12) || '🌍',
    discoverable: options.discoverable !== false,
    stats: normalizeCreatorStats(options.stats || existing.stats || {}),
    spaces: normalizeCreatorSpaces(options.spaces || existing.spaces || {}),
    createdAt: snap.exists() ? rawExisting.createdAt : serverTimestamp(),
    createdAtMs: existing.createdAtMs || Date.now(),
    updatedAt: serverTimestamp(),
    updatedAtMs: Date.now()
  };
  await setDoc(ref, payload, { merge: true });
  return normalizeCreatorProfile(payload, { userId: user.uid });
}

async function updateOwnCreatorProfile(patch = {}) {
  return ensureOwnCreatorProfile(patch);
}

function creatorStatsFromActivities(items = []) {
  const list = Array.isArray(items) ? items : [];
  return {
    activitiesCreated: list.length,
    activitiesPublished: list.filter((entry) => sanitizeText(entry?.visibility || '', 24).toLowerCase() === 'public').length,
    totalPlays: 0
  };
}

async function syncOwnCreatorActivityStats(items = []) {
  const user = getCurrentUser();
  if (!user?.uid) return null;
  const profile = await ensureOwnCreatorProfile();
  const activityStats = creatorStatsFromActivities(items);
  return updateOwnCreatorProfile({
    stats: {
      ...profile.stats,
      activitiesCreated: activityStats.activitiesCreated,
      activitiesPublished: activityStats.activitiesPublished,
      totalPlays: Math.max(profile.stats.totalPlays || 0, activityStats.totalPlays)
    }
  });
}

async function getCurrentCreatorIdentity(options = {}) {
  const user = getCurrentUser();
  if (!user?.uid) {
    return {
      creatorId: '',
      creatorName: sanitizeText(options.fallbackName || 'Guest Explorer', 60) || 'Guest Explorer',
      creatorAvatar: '🌍',
      creatorBio: ''
    };
  }
  const profile = await ensureOwnCreatorProfile({
    username: sanitizeText(options.fallbackName || user.displayName || user.email?.split('@')[0] || 'Explorer', 60)
  });
  return {
    creatorId: user.uid,
    creatorName: profile.username,
    creatorAvatar: profile.avatar,
    creatorBio: profile.bio
  };
}

async function listCreatorPublishedContributions(userId = '', options = {}) {
  const cleanUserId = sanitizeText(userId || '', 160);
  if (!cleanUserId) return [];
  const { db } = requireServices();
  const size = Math.max(1, Math.min(18, Math.round(finiteNumber(options.limit, 8))));
  const snap = await getDocs(query(
    collection(db, OVERLAY_PUBLISHED_COLLECTION),
    where('createdBy', '==', cleanUserId),
    limit(size)
  ));
  return snap.docs
    .map((entry) => {
      const data = entry.data() || {};
      return {
        id: entry.id,
        title: sanitizeText(data.summary || data.tags?.name || data.baseFeatureRef?.displayName || data.presetId || 'World Contribution', 120),
        featureClass: sanitizeText(data.featureClass || '', 40),
        presetId: sanitizeText(data.presetId || '', 80).toLowerCase(),
        reviewState: sanitizeText(data.reviewState || '', 24).toLowerCase(),
        publicationState: sanitizeText(data.publicationState || '', 24).toLowerCase(),
        createdBy: sanitizeText(data.createdBy || '', 160),
        createdByName: sanitizeText(data.createdByName || '', 80),
        publishedAtMs: finiteNumber(data.publishedAtMs, timestampToMs(data.publishedAt, 0)),
        updatedAtMs: finiteNumber(data.updatedAtMs, timestampToMs(data.updatedAt, 0)),
        geometryType: sanitizeText(data.geometryType || '', 24),
        locationLabel: sanitizeText(
          data.baseFeatureRef?.displayName ||
            data.tags?.name ||
            data.summary ||
            data.presetId ||
            'Published overlay',
          120
        )
      };
    })
    .sort((a, b) => b.publishedAtMs - a.publishedAtMs);
}

export {
  CREATOR_PROFILES_COLLECTION,
  CREATOR_SYSTEM_USER_ID,
  creatorStatsFromActivities,
  defaultSystemCreatorProfile,
  ensureOwnCreatorProfile,
  getCreatorProfile,
  getCurrentCreatorIdentity,
  listCreatorPublishedContributions,
  listenCreatorProfile,
  normalizeCreatorProfile,
  syncOwnCreatorActivityStats,
  updateOwnCreatorProfile
};
