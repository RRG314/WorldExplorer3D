import { Timestamp, serverTimestamp } from '../platform/firebase/firestore.js';

const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_COLLECTION = 'rooms';
const USERS_COLLECTION = 'users';
const PLAYER_COLLECTION = 'players';
const MY_ROOMS_COLLECTION = 'myRooms';
const ROOM_STATE_COLLECTION = 'state';
const HOME_BASE_DOC = 'homeBase';
const ROOM_PRESENCE_TTL_MS = 90 * 1000;
const ROOM_PRESENCE_LEAVE_TTL_MS = 1000;
const DEFAULT_MAX_PLAYERS = 10;
const CITY_KEY_MAX_LEN = 48;
const PUBLIC_ROOM_RESULT_LIMIT = 20;
const OWNED_ROOM_RESULT_LIMIT = 40;
const MY_ROOMS_RESULT_LIMIT = 80;
const ROOM_CREATE_MAX_ATTEMPTS = 16;
const ROOM_CREATE_RETRY_BASE_MS = 120;
const ROOM_CREATE_RETRY_STEP_MS = 80;
const PAINT_TOWN_MIN_TIME_LIMIT_SEC = 30;
const PAINT_TOWN_MAX_TIME_LIMIT_SEC = 1800;
const DEFAULT_PAINT_TOWN_RULES = Object.freeze({
  allowChat: true,
  allowGhosts: true,
  paintTimeLimitSec: 120,
  paintTouchMode: 'any',
  allowPaintballGun: true,
  allowRoofAutoPaint: true
});
const VALID_PAINT_TOUCH_MODES = new Set(['off', 'roof', 'any']);
const ROOM_CREATE_LIMITS_BY_PLAN = Object.freeze({
  free: 3,
  trial: 3,
  support: 3,
  supporter: 3,
  pro: 10,
  admin: 10000
});
const ENTITLED_MULTIPLAYER_PLANS = new Set(['free', 'trial', 'support', 'supporter', 'pro']);

function cloneObject(value) {
  if (!value || typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value));
}

function timestampToMs(value, fallback = 0) {
  if (!value) return fallback;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isPlayerPresenceActive(data, nowMs = Date.now()) {
  if (!data || typeof data !== 'object') return false;
  const expiresAtMs = timestampToMs(data.expiresAt, 0);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= 0) return true;
  return expiresAtMs > nowMs - ROOM_PRESENCE_LEAVE_TTL_MS;
}

function normalizeCode(input) {
  const raw = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!raw) return '';
  return raw.slice(0, ROOM_CODE_LENGTH);
}

function normalizePlanForLimits(raw) {
  const plan = String(raw || '').toLowerCase();
  if (plan === 'support') return 'supporter';
  if (plan === 'trial' || plan === 'supporter' || plan === 'pro' || plan === 'admin') return plan;
  return 'free';
}

function roomCreateLimitForPlan(plan) {
  const normalized = normalizePlanForLimits(plan);
  return ROOM_CREATE_LIMITS_BY_PLAN[normalized] || ROOM_CREATE_LIMITS_BY_PLAN.free;
}

function firestoreRuleIntOrNull(raw) {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  const floored = Math.floor(raw);
  if (floored !== raw) return null;
  return Math.max(0, Math.min(10000, floored));
}

function normalizeRoomCreateCount(raw) {
  const parsed = firestoreRuleIntOrNull(raw);
  return parsed == null ? 0 : parsed;
}

function waitMs(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, Math.max(0, Number(ms) || 0));
  });
}

function formatRoomCreateDeniedMessage(err, context = {}) {
  const code = String(err?.code || 'unknown');
  const rawMessage = String(err?.message || '').trim();
  const messageLower = rawMessage.toLowerCase();
  const entitlementHint = context.hasEntitlement
    ? 'entitled'
    : 'not-entitled';

  let cause = 'Firestore rules or project config denied the create-room write.';
  if (messageLower.includes('app check')) {
    cause = 'Firestore App Check enforcement appears active for this app.';
  } else if (!context.hasEntitlement) {
    cause = 'Account is currently not multiplayer-entitled in Firestore user data.';
  } else if (context.localLimit <= 0) {
    cause = 'Room create limit is zero for this account state.';
  } else if (context.roomCreateCount >= context.localLimit) {
    cause = 'Room create limit has been reached for this account.';
  }

  const ctx = [
    `code=${code}`,
    `attemptedCode=${String(context.attemptedCode || '')}`,
    `attempt=${Number.isFinite(context.attempt) ? context.attempt : -1}`,
    `plan=${String(context.plan || 'free')}`,
    `subStatus=${String(context.subscriptionStatus || 'none')}`,
    `adminClaim=${context.hasAdminTokenClaim ? 'yes' : 'no'}`,
    `count=${Number.isFinite(context.roomCreateCount) ? context.roomCreateCount : 0}`,
    `limit=${Number.isFinite(context.localLimit) ? context.localLimit : 0}`,
    `rawCountType=${String(context.rawCountType || 'unknown')}`,
    `rawLimitType=${String(context.rawLimitType || 'unknown')}`,
    `entitlement=${entitlementHint}`
  ].join(', ');

  return `Room creation denied by Firestore. ${cause} (${ctx})${rawMessage ? ` Raw: ${rawMessage}` : ''}`;
}

function normalizePlayerRole(raw, fallback = 'member') {
  const role = String(raw || '').toLowerCase();
  if (role === 'owner' || role === 'mod' || role === 'member') return role;
  return fallback;
}

function modeForWorldKind(kind) {
  if (kind === 'space') return 'space';
  if (kind === 'moon') return 'moon';
  return 'walk';
}

function buildDefaultPose() {
  return {
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    pitch: 0,
    vx: 0,
    vy: 0,
    vz: 0
  };
}

function buildPlayerPresencePayload(options = {}) {
  const world = normalizeWorld(options.world || {});
  return {
    uid: String(options.uid || ''),
    displayName: String(options.displayName || '').slice(0, 60),
    joinedAt: options.joinedAt || serverTimestamp(),
    lastSeenAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + ROOM_PRESENCE_TTL_MS),
    role: normalizePlayerRole(options.role, 'member'),
    mode: modeForWorldKind(world.kind),
    frame: {
      kind: world.kind,
      locLat: world.lat,
      locLon: world.lon
    },
    pose: buildDefaultPose(),
    joinCode: normalizeCode(options.joinCode || '')
  };
}

function resolveRoomCreatePolicy(profile, hasAdminTokenClaim) {
  const profileIndicatesAdmin = String(profile.subscriptionStatus || '').toLowerCase() === 'admin';
  const plan = profileIndicatesAdmin || hasAdminTokenClaim
    ? 'pro'
    : normalizePlanForLimits(profile.plan || 'free');
  const roomCreateCount = normalizeRoomCreateCount(profile.roomCreateCount);
  const persistedLimit = firestoreRuleIntOrNull(profile.roomCreateLimit);
  const planLimit = roomCreateLimitForPlan(plan);
  const roomCreateLimit = Math.max(
    planLimit,
    persistedLimit == null ? planLimit : persistedLimit
  );
  const localRoomCreateLimit = hasAdminTokenClaim
    ? Math.max(roomCreateLimit, ROOM_CREATE_LIMITS_BY_PLAN.admin)
    : roomCreateLimit;
  const hasEntitlement = ENTITLED_MULTIPLAYER_PLANS.has(plan);

  return {
    plan,
    roomCreateCount,
    roomCreateLimit,
    localRoomCreateLimit,
    hasEntitlement
  };
}

function randomCode() {
  let out = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    const idx = Math.floor(Math.random() * ROOM_CODE_ALPHABET.length);
    out += ROOM_CODE_ALPHABET[idx];
  }
  return out;
}

function readStoredDisplayName() {
  try {
    const fallback = localStorage.getItem('worldExplorer3D.flowerChallenge.playerName');
    if (fallback && fallback.trim()) return fallback.trim().slice(0, 48);
  } catch (_) {
    // Ignore storage access failures.
  }

  const input = document.getElementById('flowerPlayerName');
  if (input && String(input.value || '').trim()) {
    return String(input.value || '').trim().slice(0, 48);
  }

  return 'Explorer';
}

function resolveDisplayName(user, explicit = '') {
  const value = String(explicit || user.displayName || '').trim();
  if (value) return value.slice(0, 48);
  return readStoredDisplayName();
}

function normalizeWorld(world = {}) {
  const lat = Number(world.lat);
  const lon = Number(world.lon);
  const kindRaw = String(world.kind || '').toLowerCase();
  const kind = kindRaw === 'moon' || kindRaw === 'space' ? kindRaw : 'earth';

  const normalized = {
    kind,
    seed: String(world.seed || '').trim() ||
      (Number.isFinite(lat) && Number.isFinite(lon) ? `latlon:${lat.toFixed(5)},${lon.toFixed(5)}` : 'latlon:0.00000,0.00000'),
    lat: Number.isFinite(lat) ? lat : 0,
    lon: Number.isFinite(lon) ? lon : 0
  };

  return normalized;
}

function normalizePaintTimeLimitSec(raw) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_PAINT_TOWN_RULES.paintTimeLimitSec;
  return Math.max(
    PAINT_TOWN_MIN_TIME_LIMIT_SEC,
    Math.min(PAINT_TOWN_MAX_TIME_LIMIT_SEC, Math.floor(parsed))
  );
}

function normalizePaintTouchMode(raw) {
  const mode = String(raw || '').toLowerCase();
  return VALID_PAINT_TOUCH_MODES.has(mode) ? mode : DEFAULT_PAINT_TOWN_RULES.paintTouchMode;
}

function normalizeRoomRules(rawRules = {}) {
  const source = rawRules && typeof rawRules === 'object' ? rawRules : {};
  return {
    allowChat: source.allowChat !== false,
    allowGhosts: source.allowGhosts !== false,
    paintTimeLimitSec: normalizePaintTimeLimitSec(source.paintTimeLimitSec),
    paintTouchMode: normalizePaintTouchMode(source.paintTouchMode),
    allowPaintballGun: source.allowPaintballGun !== false,
    allowRoofAutoPaint: source.allowRoofAutoPaint !== false
  };
}

function hashStringToUint32(input) {
  const text = String(input || '');
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function deriveRoomDeterministicSeed(roomLike = {}) {
  const roomId = normalizeCode(roomLike.code || roomLike.id || '');
  const world = normalizeWorld(roomLike.world || {});
  const rawSeed = String(world.seed || '').trim();
  const numericSeed = Number(rawSeed);
  if (Number.isFinite(numericSeed)) {
    return (Math.floor(numericSeed) | 0) >>> 0;
  }

  const baseSeed = rawSeed || `${world.kind}:${world.lat.toFixed(6)},${world.lon.toFixed(6)}`;
  const mixed = `${baseSeed}|${world.kind}|${world.lat.toFixed(6)}|${world.lon.toFixed(6)}|${roomId}`;
  return hashStringToUint32(mixed) >>> 0;
}

function normalizeVisibility(raw) {
  const visibility = String(raw || '').toLowerCase();
  return visibility === 'public' ? 'public' : 'private';
}

function normalizeMaxPlayers(raw) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_MAX_PLAYERS;
  return Math.max(2, Math.min(32, Math.floor(parsed)));
}

function normalizeFeatured(raw) {
  return raw === true;
}

function normalizeCityKey(input) {
  const lowered = String(input || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return lowered
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, CITY_KEY_MAX_LEN);
}

function normalizeLocationTag(rawTag, world = {}, fallbackLabel = '') {
  const source = rawTag && typeof rawTag === 'object' ? rawTag : { label: rawTag };
  const label = String(source.label || source.city || fallbackLabel || '').trim().slice(0, 80);
  if (!label) return null;

  const city = String(source.city || label).trim().slice(0, CITY_KEY_MAX_LEN);
  const cityKey = normalizeCityKey(source.cityKey || city || label);
  if (!cityKey) return null;

  const kindRaw = String(source.kind || world.kind || 'earth').toLowerCase();
  const kind = kindRaw === 'moon' || kindRaw === 'space' ? kindRaw : 'earth';
  return { label, city, cityKey, kind };
}

function toRoomObject(roomSnap) {
  const data = roomSnap && roomSnap.data ? roomSnap.data() : null;
  if (!data) return null;

  const world = normalizeWorld(data.world || {});
  const createdAtMs = typeof data.createdAt?.toMillis === 'function' ? data.createdAt.toMillis() : null;
  const cityKey = normalizeCityKey(data.cityKey || data.locationTag?.cityKey || data.locationTag?.city || '');
  const locationTag = normalizeLocationTag(data.locationTag, world, String(data.name || '').trim());

  return {
    id: roomSnap.id,
    code: String(data.code || roomSnap.id || ''),
    name: String(data.name || ''),
    visibility: normalizeVisibility(data.visibility),
    featured: normalizeFeatured(data.featured),
    maxPlayers: normalizeMaxPlayers(data.maxPlayers),
    ownerUid: String(data.ownerUid || ''),
    createdBy: String(data.createdBy || ''),
    createdAtMs,
    cityKey,
    locationTag,
    world,
    rules: normalizeRoomRules(data.rules || {})
  };
}

function toSavedRoomObject(savedSnap) {
  const data = savedSnap && savedSnap.data ? savedSnap.data() : null;
  if (!data) return null;

  const world = normalizeWorld(data.world || {});
  const locationTag = normalizeLocationTag(data.locationTag, world, String(data.name || '').trim());
  const createdAtMs = typeof data.createdAt?.toMillis === 'function' ? data.createdAt.toMillis() : null;
  const lastJoinedAtMs = typeof data.lastJoinedAt?.toMillis === 'function'
    ? data.lastJoinedAt.toMillis()
    : null;

  return {
    id: savedSnap.id,
    code: normalizeCode(data.code || savedSnap.id || ''),
    name: String(data.name || ''),
    visibility: normalizeVisibility(data.visibility),
    ownerUid: String(data.ownerUid || ''),
    role: normalizePlayerRole(data.role || 'member'),
    world,
    locationTag,
    createdAtMs,
    lastJoinedAtMs
  };
}


export {
  ROOM_CODE_LENGTH,
  ROOM_CODE_ALPHABET,
  ROOM_COLLECTION,
  USERS_COLLECTION,
  PLAYER_COLLECTION,
  MY_ROOMS_COLLECTION,
  ROOM_STATE_COLLECTION,
  HOME_BASE_DOC,
  ROOM_PRESENCE_TTL_MS,
  ROOM_PRESENCE_LEAVE_TTL_MS,
  DEFAULT_MAX_PLAYERS,
  CITY_KEY_MAX_LEN,
  PUBLIC_ROOM_RESULT_LIMIT,
  OWNED_ROOM_RESULT_LIMIT,
  MY_ROOMS_RESULT_LIMIT,
  ROOM_CREATE_MAX_ATTEMPTS,
  ROOM_CREATE_RETRY_BASE_MS,
  ROOM_CREATE_RETRY_STEP_MS,
  PAINT_TOWN_MIN_TIME_LIMIT_SEC,
  PAINT_TOWN_MAX_TIME_LIMIT_SEC,
  DEFAULT_PAINT_TOWN_RULES,
  VALID_PAINT_TOUCH_MODES,
  ROOM_CREATE_LIMITS_BY_PLAN,
  ENTITLED_MULTIPLAYER_PLANS,
  cloneObject,
  timestampToMs,
  isPlayerPresenceActive,
  normalizeCode,
  normalizePlanForLimits,
  roomCreateLimitForPlan,
  firestoreRuleIntOrNull,
  normalizeRoomCreateCount,
  waitMs,
  formatRoomCreateDeniedMessage,
  normalizePlayerRole,
  modeForWorldKind,
  buildDefaultPose,
  buildPlayerPresencePayload,
  resolveRoomCreatePolicy,
  randomCode,
  readStoredDisplayName,
  resolveDisplayName,
  normalizeWorld,
  normalizePaintTimeLimitSec,
  normalizePaintTouchMode,
  normalizeRoomRules,
  hashStringToUint32,
  deriveRoomDeterministicSeed,
  normalizeVisibility,
  normalizeMaxPlayers,
  normalizeFeatured,
  normalizeCityKey,
  normalizeLocationTag,
  toRoomObject,
  toSavedRoomObject
};
