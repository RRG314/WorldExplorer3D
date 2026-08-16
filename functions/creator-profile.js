const admin = require('firebase-admin');

const CREATOR_PROFILES_COLLECTION = 'creatorProfiles';
const CREATOR_SYSTEM_USER_ID = 'system_worldexplorer';

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

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

function sanitizeAvatar(value) {
  const text = String(value || '').trim().slice(0, 12);
  return text || '🌍';
}

function sanitizeUsername(value, fallback = 'Explorer') {
  const text = sanitizeText(value, 60);
  return text || fallback;
}

function creatorStats(raw = {}, fallback = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const base = fallback && typeof fallback === 'object' ? fallback : {};
  return {
    activitiesCreated: Math.max(0, Math.min(1000000, Math.round(finiteNumber(source.activitiesCreated, base.activitiesCreated || 0)))),
    activitiesPublished: Math.max(0, Math.min(1000000, Math.round(finiteNumber(source.activitiesPublished, base.activitiesPublished || 0)))),
    totalPlays: Math.max(0, Math.min(1000000, Math.round(finiteNumber(source.totalPlays, base.totalPlays || 0)))),
    contributionsCount: Math.max(0, Math.min(1000000, Math.round(finiteNumber(source.contributionsCount, base.contributionsCount || 0)))),
    publishedContributions: Math.max(0, Math.min(1000000, Math.round(finiteNumber(source.publishedContributions, base.publishedContributions || 0))))
  };
}

function creatorSpaces(raw = {}, fallback = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const base = fallback && typeof fallback === 'object' ? fallback : {};
  return {
    primaryRoomCode: sanitizeText(source.primaryRoomCode || base.primaryRoomCode || '', 16).toUpperCase(),
    hubActivityId: sanitizeText(source.hubActivityId || base.hubActivityId || '', 120).toLowerCase(),
    hubLabel: sanitizeText(source.hubLabel || base.hubLabel || '', 80)
  };
}

function normalizeCreatorProfileInput(raw = {}, fallback = {}, userId = '') {
  const source = raw && typeof raw === 'object' ? raw : {};
  const base = fallback && typeof fallback === 'object' ? fallback : {};
  const nowMs = Date.now();
  const createdAtMs = Math.max(0, Math.round(finiteNumber(base.createdAtMs, source.createdAtMs || nowMs)));
  return {
    userId: sanitizeText(userId || source.userId || base.userId || '', 160),
    username: sanitizeUsername(source.username || source.displayName || base.username || base.displayName || 'Explorer'),
    bio: sanitizeMultilineText(source.bio || base.bio || '', 320),
    avatar: sanitizeAvatar(source.avatar || base.avatar || '🌍'),
    discoverable: source.discoverable !== false && base.discoverable !== false,
    createdAtMs,
    updatedAtMs: nowMs,
    stats: creatorStats(source.stats || {}, base.stats || {}),
    spaces: creatorSpaces(source.spaces || {}, base.spaces || {})
  };
}

async function mergeCreatorProfile(db, userId, patch = {}) {
  const cleanUserId = sanitizeText(userId || '', 160);
  if (!cleanUserId) return null;
  const ref = db.collection(CREATOR_PROFILES_COLLECTION).doc(cleanUserId);
  const snap = await ref.get();
  const existing = snap.exists ? snap.data() || {} : {};
  const normalized = normalizeCreatorProfileInput(patch, existing, cleanUserId);
  const now = admin.firestore.FieldValue.serverTimestamp();
  await ref.set(
    {
      userId: cleanUserId,
      username: normalized.username,
      bio: normalized.bio,
      avatar: normalized.avatar,
      discoverable: normalized.discoverable,
      stats: normalized.stats,
      spaces: normalized.spaces,
      createdAt: existing.createdAt || now,
      createdAtMs: normalized.createdAtMs,
      updatedAt: now,
      updatedAtMs: normalized.updatedAtMs
    },
    { merge: true }
  );
  return {
    ...existing,
    ...normalized
  };
}

async function ensureCreatorProfileDoc(db, userId, options = {}) {
  const cleanUserId = sanitizeText(userId || '', 160);
  if (!cleanUserId) return null;
  return mergeCreatorProfile(db, cleanUserId, {
    username: options.username || options.displayName || '',
    bio: options.bio || '',
    avatar: options.avatar || '',
    stats: options.stats || {},
    spaces: options.spaces || {}
  });
}

module.exports = {
  CREATOR_PROFILES_COLLECTION,
  CREATOR_SYSTEM_USER_ID,
  creatorSpaces,
  creatorStats,
  ensureCreatorProfileDoc,
  mergeCreatorProfile,
  normalizeCreatorProfileInput,
  sanitizeAvatar,
  sanitizeMultilineText,
  sanitizeText,
  sanitizeUsername
};
