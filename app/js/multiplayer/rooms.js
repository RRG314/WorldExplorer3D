import {
  collection,
  Timestamp,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
  where
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { getCurrentUser } from '../../../js/auth-ui.js';
import { initFirebase } from '../../../js/firebase-init.js';

const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_COLLECTION = 'rooms';
const USERS_COLLECTION = 'users';
const PLAYER_COLLECTION = 'players';
const MY_ROOMS_COLLECTION = 'myRooms';
const ROOM_STATE_COLLECTION = 'state';
const HOME_BASE_DOC = 'homeBase';
const ROOM_PRESENCE_TTL_MS = 90 * 1000;
const DEFAULT_MAX_PLAYERS = 12;
const CITY_KEY_MAX_LEN = 48;
const PUBLIC_ROOM_RESULT_LIMIT = 20;
const OWNED_ROOM_RESULT_LIMIT = 40;
const MY_ROOMS_RESULT_LIMIT = 80;
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
  free: 0,
  trial: 3,
  support: 3,
  supporter: 3,
  pro: 10,
  admin: 10000
});

let currentRoom = null;

function cloneObject(value) {
  if (!value || typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value));
}

function getServices() {
  const services = initFirebase();
  if (!services || !services.db) {
    throw new Error('Missing Firebase config. Multiplayer is unavailable until Firebase is configured.');
  }
  return services;
}

function requireSignedInUser() {
  const user = getCurrentUser();
  if (!user || !user.uid) {
    throw new Error('Sign in is required to use multiplayer.');
  }
  return user;
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

function myRoomsCollection(db, uid) {
  return collection(db, USERS_COLLECTION, uid, MY_ROOMS_COLLECTION);
}

async function upsertMyRoomRecord(roomLike, role = 'member') {
  const { db } = getServices();
  const user = requireSignedInUser();
  const code = normalizeCode(roomLike?.code || roomLike?.id || '');
  if (!code) return;
  const roomRef = doc(myRoomsCollection(db, user.uid), code);

  const world = normalizeWorld(roomLike?.world || {});
  const locationTag = normalizeLocationTag(
    roomLike?.locationTag,
    world,
    String(roomLike?.name || '').trim()
  );
  let preservedCreatedAt = null;
  const roomCreatedAt = roomLike?.createdAt && typeof roomLike.createdAt.toMillis === 'function'
    ? roomLike.createdAt
    : null;

  try {
    const existingSnap = await getDoc(roomRef);
    if (existingSnap.exists()) {
      const existing = existingSnap.data() || {};
      if (existing.createdAt && typeof existing.createdAt.toMillis === 'function') {
        preservedCreatedAt = existing.createdAt;
      }
    }
  } catch (_) {
    // Best effort only. Falling back to room timestamp or server timestamp is safe.
  }

  const payload = {
    code,
    name: String(roomLike?.name || '').trim().slice(0, 80),
    ownerUid: String(roomLike?.ownerUid || ''),
    visibility: normalizeVisibility(roomLike?.visibility),
    role: normalizePlayerRole(role, 'member'),
    world,
    updatedAt: serverTimestamp(),
    lastJoinedAt: serverTimestamp(),
    createdAt: preservedCreatedAt || roomCreatedAt || serverTimestamp()
  };

  if (locationTag) payload.locationTag = locationTag;
  else payload.locationTag = deleteField();

  await setDoc(roomRef, payload, { merge: true });
}

function setCurrentRoom(nextRoom) {
  currentRoom = nextRoom ? cloneObject(nextRoom) : null;
  globalThis.dispatchEvent(new CustomEvent('we3d-room-changed', {
    detail: { room: currentRoom ? cloneObject(currentRoom) : null }
  }));
}

async function createRoom(options = {}) {
  const { db } = getServices();
  const user = requireSignedInUser();
  const displayName = resolveDisplayName(user, options.displayName);
  const world = normalizeWorld(options.world || {});
  const maxPlayers = normalizeMaxPlayers(options.maxPlayers);
  const visibility = normalizeVisibility(options.visibility);
  const featured = visibility === 'public' && normalizeFeatured(options.featured);
  const roomName = String(options.name || '').trim().slice(0, 80);
  const locationName = String(options.locationName || '').trim().slice(0, 80);
  const locationTag = normalizeLocationTag(options.locationTag, world, locationName || roomName || world.seed);
  const cityKey = locationTag ? locationTag.cityKey : '';
  const roomRules = normalizeRoomRules(options.rules || {});
  const userRef = doc(db, USERS_COLLECTION, user.uid);
  const entitlement = globalThis.__WE3D_ENTITLEMENTS__ || {};
  const entitlementAdminHint =
    entitlement.isAdmin === true || String(entitlement.role || '').toLowerCase() === 'admin';
  let hasAdminTokenClaim = false;

  if (typeof user.getIdTokenResult === 'function') {
    try {
      const tokenResult = await user.getIdTokenResult(entitlementAdminHint);
      const claims = tokenResult && tokenResult.claims ? tokenResult.claims : {};
      hasAdminTokenClaim = claims.admin === true || String(claims.role || '').toLowerCase() === 'admin';
    } catch (err) {
      console.warn('[multiplayer] Unable to refresh auth token claims for room create:', err);
    }
  }

  async function ensureUserProfile() {
    let snap = await getDoc(userRef);
    if (snap.exists()) return snap;

    await setDoc(userRef, {
      uid: user.uid,
      email: String(user.email || '').trim().slice(0, 320),
      displayName: displayName.slice(0, 60),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });
    snap = await getDoc(userRef);
    return snap;
  }

  let profileSnap = await ensureUserProfile();

  let createdCode = null;
  let lastDeniedErr = null;
  let lastDeniedContext = null;

  for (let attempt = 0; attempt < 16; attempt++) {
    const code = normalizeCode(options.code || randomCode());
    if (code.length !== ROOM_CODE_LENGTH) {
      throw new Error('Room code generation failed. Try again.');
    }

    const roomRef = doc(db, ROOM_COLLECTION, code);
    const profile = profileSnap.exists() ? (profileSnap.data() || {}) : {};
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
    const hasEntitlement = plan === 'trial' || plan === 'support' || plan === 'supporter' || plan === 'pro';

    if (localRoomCreateLimit <= 0 || roomCreateCount >= localRoomCreateLimit) {
      throw new Error('Room creation limit reached for your plan. Rename or reuse existing rooms, or upgrade for a higher limit.');
    }

    try {
      const roomPayload = {
        code,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
        name: roomName,
        visibility,
        featured,
        maxPlayers,
        ownerUid: user.uid,
        mods: { [user.uid]: true },
        cityKey,
        world,
        rules: roomRules
      };

      if (locationTag) roomPayload.locationTag = locationTag;

      const batch = writeBatch(db);
      batch.set(roomRef, roomPayload);
      batch.set(userRef, {
        uid: user.uid,
        email: String(user.email || profile.email || '').trim().slice(0, 320),
        displayName: displayName.slice(0, 60),
        roomCreateCount: roomCreateCount + 1,
        roomCreateLimit: hasAdminTokenClaim ? localRoomCreateLimit : roomCreateLimit,
        updatedAt: serverTimestamp()
      }, { merge: true });
      await batch.commit();

      createdCode = code;
      break;
    } catch (err) {
      const errCode = String(err?.code || '');
      if (!options.code && (errCode === 'permission-denied' || errCode === 'aborted' || errCode === 'failed-precondition')) {
        if (errCode === 'permission-denied') {
          lastDeniedErr = err;
          lastDeniedContext = {
            plan,
            subscriptionStatus: String(profile.subscriptionStatus || 'none'),
            hasAdminTokenClaim,
            roomCreateCount,
            localLimit: localRoomCreateLimit,
            rawCountType: typeof profile.roomCreateCount,
            rawLimitType: typeof profile.roomCreateLimit,
            hasEntitlement
          };
        }
        try {
          profileSnap = await getDoc(userRef);
        } catch (_) {
          // Keep prior snapshot and continue best effort retries.
        }
        // Firestore updates from trial/plan transitions can arrive moments after auth state changes.
        // Backoff avoids immediate repeat-denials during that propagation window.
        await waitMs(120 + attempt * 80);
        continue;
      }
      if (options.code && errCode === 'permission-denied') {
        throw new Error('That room code is unavailable. Try another code.');
      }
      throw err;
    }
  }

  if (!createdCode) {
    if (lastDeniedErr) {
      throw new Error(formatRoomCreateDeniedMessage(lastDeniedErr, lastDeniedContext || {}));
    }
    throw new Error('Unable to reserve a room code. Please retry.');
  }

  const ownerPlayerRef = doc(db, ROOM_COLLECTION, createdCode, PLAYER_COLLECTION, user.uid);
  let ownerJoinedAt = null;
  let ownerRole = 'owner';
  try {
    const existingOwnerSnap = await getDoc(ownerPlayerRef);
    if (existingOwnerSnap.exists()) {
      const existingOwner = existingOwnerSnap.data() || {};
      if (existingOwner.joinedAt && typeof existingOwner.joinedAt.toMillis === 'function') {
        ownerJoinedAt = existingOwner.joinedAt;
      }
      ownerRole = normalizePlayerRole(existingOwner.role, 'owner');
    }
  } catch (err) {
    if (String(err?.code || '') !== 'permission-denied') throw err;
  }

  try {
    await setDoc(ownerPlayerRef, {
      uid: user.uid,
      displayName,
      joinedAt: ownerJoinedAt || serverTimestamp(),
      lastSeenAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + ROOM_PRESENCE_TTL_MS),
      role: ownerRole,
      mode: world.kind === 'space' ? 'space' : world.kind === 'moon' ? 'moon' : 'walk',
      frame: {
        kind: world.kind,
        locLat: world.lat,
        locLon: world.lon
      },
      pose: {
        x: 0,
        y: 0,
        z: 0,
        yaw: 0,
        pitch: 0,
        vx: 0,
        vy: 0,
        vz: 0
      },
      joinCode: createdCode
    }, { merge: true });
  } catch (err) {
    if (String(err?.code || '') === 'permission-denied') {
      throw new Error('Room created, but owner presence could not be written. Check plan access and Firestore rules.');
    }
    throw err;
  }

  const roomSnap = await getDoc(doc(db, ROOM_COLLECTION, createdCode));
  const room = toRoomObject(roomSnap);
  if (!room) {
    throw new Error('Room creation succeeded but room could not be loaded.');
  }

  setCurrentRoom(room);
  try {
    await upsertMyRoomRecord(room, 'owner');
  } catch (err) {
    console.warn('[multiplayer][rooms] Failed to persist room in myRooms after create:', err);
  }
  return room;
}

async function joinRoomByCode(codeInput, options = {}) {
  const { db } = getServices();
  const user = requireSignedInUser();
  const code = normalizeCode(codeInput);
  if (code.length !== ROOM_CODE_LENGTH) {
    throw new Error('Enter a valid 6-character room code.');
  }

  const displayName = resolveDisplayName(user, options.displayName);
  const roomRef = doc(db, ROOM_COLLECTION, code);
  const playerRef = doc(db, ROOM_COLLECTION, code, PLAYER_COLLECTION, user.uid);
  let preservedJoinedAt = null;
  let preservedRole = 'member';

  try {
    const existingPlayerSnap = await getDoc(playerRef);
    if (existingPlayerSnap.exists()) {
      const existingPlayer = existingPlayerSnap.data() || {};
      if (existingPlayer.joinedAt && typeof existingPlayer.joinedAt.toMillis === 'function') {
        preservedJoinedAt = existingPlayer.joinedAt;
      }
      preservedRole = normalizePlayerRole(existingPlayer.role, 'member');
    }
  } catch (err) {
    // If we cannot read an existing player doc yet, proceed with a create-style payload.
    if (String(err?.code || '') !== 'permission-denied') throw err;
  }

  try {
    await setDoc(playerRef, {
      uid: user.uid,
      displayName,
      joinedAt: preservedJoinedAt || serverTimestamp(),
      lastSeenAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + ROOM_PRESENCE_TTL_MS),
      role: preservedRole,
      mode: 'walk',
      frame: {
        kind: 'earth',
        locLat: 0,
        locLon: 0
      },
      pose: {
        x: 0,
        y: 0,
        z: 0,
        yaw: 0,
        pitch: 0,
        vx: 0,
        vy: 0,
        vz: 0
      },
      joinCode: code
    }, { merge: true });
  } catch (err) {
    if (String(err?.code || '') === 'permission-denied') {
      throw new Error('Room join denied. Check room code and ensure your plan includes multiplayer.');
    }
    throw err;
  }

  const roomSnap = await getDoc(roomRef);
  if (!roomSnap.exists()) {
    throw new Error('Room not found. Check the invite code and try again.');
  }

  const room = toRoomObject(roomSnap);
  setCurrentRoom(room);
  try {
    const role = room && room.ownerUid === user.uid ? 'owner' : 'member';
    await upsertMyRoomRecord(room, role);
  } catch (err) {
    console.warn('[multiplayer][rooms] Failed to persist room in myRooms after join:', err);
  }
  return room;
}

async function leaveRoom() {
  const user = getCurrentUser();
  const room = currentRoom ? cloneObject(currentRoom) : null;

  setCurrentRoom(null);
  if (!room || !user || !user.uid) return;

  try {
    const { db } = getServices();
    const playerRef = doc(db, ROOM_COLLECTION, room.id, PLAYER_COLLECTION, user.uid);
    await setDoc(playerRef, {
      expiresAt: Timestamp.fromMillis(Date.now() + 1000)
    }, { merge: true });
  } catch (_) {
    // Keep local state clean even if network write fails.
  }
}

async function updateRoomSettings(roomId, updates = {}) {
  const { db } = getServices();
  const user = requireSignedInUser();
  const normalizedRoomId = normalizeCode(roomId);
  if (!normalizedRoomId) throw new Error('Invalid room code.');

  const roomRef = doc(db, ROOM_COLLECTION, normalizedRoomId);
  const roomSnap = await getDoc(roomRef);
  if (!roomSnap.exists()) throw new Error('Room not found.');

  const currentRoom = toRoomObject(roomSnap);
  if (!currentRoom) throw new Error('Unable to load room state.');
  if (currentRoom.ownerUid !== user.uid) {
    throw new Error('Only room owner can update room settings.');
  }

  const visibility = updates.visibility ? normalizeVisibility(updates.visibility) : currentRoom.visibility;
  const locationTag = normalizeLocationTag(
    updates.locationTag || currentRoom.locationTag,
    currentRoom.world,
    String(updates.name || currentRoom.name || '').trim().slice(0, 80)
  );
  const cityKey = locationTag ? locationTag.cityKey : '';
  const nextRules = normalizeRoomRules({
    ...(currentRoom.rules || {}),
    ...(updates.rules && typeof updates.rules === 'object' ? updates.rules : {})
  });

  const payload = {
    visibility,
    featured: visibility === 'public' && normalizeFeatured(updates.featured ?? currentRoom.featured)
  };

  if (typeof updates.name === 'string') {
    payload.name = String(updates.name || '').trim().slice(0, 80);
  }

  payload.rules = nextRules;
  payload.cityKey = cityKey;
  if (locationTag) {
    payload.locationTag = locationTag;
  } else if (visibility === 'public') {
    throw new Error('Public rooms require a location tag.');
  } else {
    payload.locationTag = deleteField();
  }

  await setDoc(roomRef, payload, { merge: true });
  const nextSnap = await getDoc(roomRef);
  const nextRoom = toRoomObject(nextSnap);
  if (nextRoom) {
    try {
      const role = nextRoom.ownerUid === user.uid ? 'owner' : 'member';
      await upsertMyRoomRecord(nextRoom, role);
    } catch (err) {
      console.warn('[multiplayer][rooms] Failed to sync myRooms after room update:', err);
    }
  }
  if (nextRoom && getCurrentRoom()?.id === normalizedRoomId) {
    setCurrentRoom(nextRoom);
  }
  return nextRoom;
}

function getCurrentRoom() {
  return currentRoom ? cloneObject(currentRoom) : null;
}

function listenRoom(roomId, callback) {
  if (typeof callback !== 'function') return () => {};

  const normalizedRoomId = normalizeCode(roomId);
  if (!normalizedRoomId) {
    callback(null);
    return () => {};
  }

  let db;
  try {
    ({ db } = getServices());
  } catch (_) {
    callback(null);
    return () => {};
  }

  const roomRef = doc(db, ROOM_COLLECTION, normalizedRoomId);
  return onSnapshot(roomRef, (snap) => {
    const room = snap.exists() ? toRoomObject(snap) : null;
    if (currentRoom && currentRoom.id === normalizedRoomId) {
      setCurrentRoom(room);
    }
    callback(room);
  }, (err) => {
    console.warn('[multiplayer][rooms] listenRoom failed:', err);
    callback(null);
  });
}

async function findPublicRoomsByCity(cityInput, options = {}) {
  const { db } = getServices();
  requireSignedInUser();

  const cityKey = normalizeCityKey(cityInput);
  if (!cityKey) return [];

  const resultLimit = Math.max(1, Math.min(50, Math.floor(Number(options.resultLimit || PUBLIC_ROOM_RESULT_LIMIT))));

  const roomsRef = collection(db, ROOM_COLLECTION);
  const q = query(
    roomsRef,
    where('cityKey', '==', cityKey),
    where('visibility', '==', 'public'),
    orderBy('createdAt', 'desc'),
    limit(resultLimit)
  );

  const snap = await getDocs(q);
  const matches = [];

  snap.forEach((roomSnap) => {
    const room = toRoomObject(roomSnap);
    if (!room || room.visibility !== 'public') return;
    matches.push(room);
  });

  return matches.slice(0, resultLimit);
}

function sortRoomsByCreatedAtDesc(rooms = []) {
  return [...rooms].sort((a, b) => {
    const aMs = Number.isFinite(Number(a?.createdAtMs)) ? Number(a.createdAtMs) : 0;
    const bMs = Number.isFinite(Number(b?.createdAtMs)) ? Number(b.createdAtMs) : 0;
    return bMs - aMs;
  });
}

async function listOwnedRooms(options = {}) {
  const { db } = getServices();
  const user = requireSignedInUser();

  const resultLimit = Math.max(1, Math.min(100, Math.floor(Number(options.resultLimit || OWNED_ROOM_RESULT_LIMIT))));
  const q = query(
    collection(db, ROOM_COLLECTION),
    where('ownerUid', '==', user.uid),
    limit(resultLimit)
  );

  const snap = await getDocs(q);
  const rows = [];
  snap.forEach((roomSnap) => {
    const room = toRoomObject(roomSnap);
    if (!room) return;
    rows.push(room);
  });
  return sortRoomsByCreatedAtDesc(rows);
}

function listenMyRooms(callback, options = {}) {
  if (typeof callback !== 'function') return () => {};
  const user = getCurrentUser();
  if (!user || !user.uid) {
    callback([]);
    return () => {};
  }

  let db;
  try {
    ({ db } = getServices());
  } catch (_) {
    callback([]);
    return () => {};
  }

  const resultLimit = Math.max(1, Math.min(150, Math.floor(Number(options.resultLimit || MY_ROOMS_RESULT_LIMIT))));
  const q = query(
    myRoomsCollection(db, user.uid),
    orderBy('lastJoinedAt', 'desc'),
    limit(resultLimit)
  );

  return onSnapshot(q, (snap) => {
    const rows = [];
    snap.forEach((savedSnap) => {
      const room = toSavedRoomObject(savedSnap);
      if (!room) return;
      rows.push(room);
    });
    callback(rows);
  }, (err) => {
    console.warn('[multiplayer][rooms] listenMyRooms failed:', err);
    callback([]);
  });
}

function listenOwnedRooms(callback, options = {}) {
  if (typeof callback !== 'function') return () => {};
  const user = getCurrentUser();
  if (!user || !user.uid) {
    callback([]);
    return () => {};
  }

  let db;
  try {
    ({ db } = getServices());
  } catch (_) {
    callback([]);
    return () => {};
  }

  const resultLimit = Math.max(1, Math.min(100, Math.floor(Number(options.resultLimit || OWNED_ROOM_RESULT_LIMIT))));
  const q = query(
    collection(db, ROOM_COLLECTION),
    where('ownerUid', '==', user.uid),
    limit(resultLimit)
  );

  return onSnapshot(q, (snap) => {
    const rows = [];
    snap.forEach((roomSnap) => {
      const room = toRoomObject(roomSnap);
      if (!room) return;
      rows.push(room);
    });
    callback(sortRoomsByCreatedAtDesc(rows));
  }, (err) => {
    console.warn('[multiplayer][rooms] listenOwnedRooms failed:', err);
    callback([]);
  });
}

async function deleteOwnedRoom(roomCode) {
  const { db } = getServices();
  const user = requireSignedInUser();
  const normalizedCode = normalizeCode(roomCode);
  if (!normalizedCode) throw new Error('Enter a valid 6-character room code.');

  const roomRef = doc(db, ROOM_COLLECTION, normalizedCode);
  const roomSnap = await getDoc(roomRef);
  if (!roomSnap.exists()) {
    throw new Error('Room not found.');
  }

  const room = toRoomObject(roomSnap);
  if (!room || room.ownerUid !== user.uid) {
    throw new Error('Only the room owner can delete this room.');
  }

  await deleteDoc(roomRef);
  try {
    await deleteDoc(doc(db, USERS_COLLECTION, user.uid, MY_ROOMS_COLLECTION, normalizedCode));
  } catch (err) {
    console.warn('[multiplayer][rooms] Failed to remove deleted room from myRooms:', err);
  }
  if (currentRoom && normalizeCode(currentRoom.code) === normalizedCode) {
    setCurrentRoom(null);
  }
}

async function findFeaturedPublicRooms(options = {}) {
  const { db } = getServices();
  requireSignedInUser();

  const resultLimit = Math.max(1, Math.min(30, Math.floor(Number(options.resultLimit || 8))));
  const roomsRef = collection(db, ROOM_COLLECTION);
  const q = query(
    roomsRef,
    where('visibility', '==', 'public'),
    where('featured', '==', true),
    orderBy('createdAt', 'desc'),
    limit(resultLimit)
  );

  const snap = await getDocs(q);
  const featured = [];
  snap.forEach((roomSnap) => {
    const room = toRoomObject(roomSnap);
    if (!room || room.visibility !== 'public' || !room.featured) return;
    featured.push(room);
  });
  return featured;
}

function homeBaseDocRef(db, roomId) {
  return doc(db, ROOM_COLLECTION, normalizeCode(roomId), ROOM_STATE_COLLECTION, HOME_BASE_DOC);
}

function listenHomeBase(roomId, callback) {
  if (typeof callback !== 'function') return () => {};
  const normalizedRoomId = normalizeCode(roomId);
  if (!normalizedRoomId) {
    callback(null);
    return () => {};
  }

  let db;
  try {
    ({ db } = getServices());
  } catch (_) {
    callback(null);
    return () => {};
  }

  return onSnapshot(homeBaseDocRef(db, normalizedRoomId), (snap) => {
    if (!snap.exists()) {
      callback(null);
      return;
    }
    const data = snap.data() || {};
    callback({
      name: String(data.name || ''),
      description: String(data.description || ''),
      anchor: {
        kind: String(data.anchor?.kind || 'earth'),
        lat: Number(data.anchor?.lat || 0),
        lon: Number(data.anchor?.lon || 0),
        x: Number(data.anchor?.x || 0),
        y: Number(data.anchor?.y || 0),
        z: Number(data.anchor?.z || 0)
      },
      createdAt: data.createdAt || null,
      updatedAt: data.updatedAt || null,
      updatedBy: String(data.updatedBy || '')
    });
  }, (err) => {
    console.warn('[multiplayer][rooms] listenHomeBase failed:', err);
    callback(null);
  });
}

async function setHomeBase(roomId, homeBase = {}) {
  const { db } = getServices();
  const user = requireSignedInUser();
  const normalizedRoomId = normalizeCode(roomId);
  if (!normalizedRoomId) throw new Error('Invalid room code.');

  const name = String(homeBase.name || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!name) throw new Error('Home base name is required.');
  const description = String(homeBase.description || '').replace(/\s+/g, ' ').trim().slice(0, 240);

  const kindRaw = String(homeBase.anchor?.kind || 'earth').toLowerCase();
  const kind = kindRaw === 'moon' || kindRaw === 'space' ? kindRaw : 'earth';
  const anchor = {
    kind,
    lat: Number(homeBase.anchor?.lat || 0),
    lon: Number(homeBase.anchor?.lon || 0),
    x: Number(homeBase.anchor?.x || 0),
    y: Number(homeBase.anchor?.y || 0),
    z: Number(homeBase.anchor?.z || 0)
  };

  const ref = homeBaseDocRef(db, normalizedRoomId);
  const existing = await getDoc(ref);
  const payload = {
    name,
    description,
    anchor,
    updatedBy: user.uid,
    updatedAt: serverTimestamp(),
    createdAt: existing.exists() ? existing.data()?.createdAt || serverTimestamp() : serverTimestamp()
  };

  await setDoc(ref, payload, { merge: true });
}

export {
  createRoom,
  deleteOwnedRoom,
  deriveRoomDeterministicSeed,
  findPublicRoomsByCity,
  findFeaturedPublicRooms,
  getCurrentRoom,
  joinRoomByCode,
  leaveRoom,
  listOwnedRooms,
  listenMyRooms,
  listenOwnedRooms,
  listenRoom,
  listenHomeBase,
  normalizeCityKey,
  normalizeCode,
  setHomeBase,
  updateRoomSettings
};
