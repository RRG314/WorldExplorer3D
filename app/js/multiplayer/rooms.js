import { ensureRoomUserProfile } from './rooms-profile.js';
import { postProtectedFunction } from '../../../js/function-api.js?v=3';
import {
  collection,
  Timestamp,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocFromServer,
  runTransaction,
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
import { ensureGuestSession, getCurrentUser } from '../../../js/auth-ui.js?v=56';
import { initFirebase } from '../../../js/firebase-init.js?v=58';
import {
  CITY_KEY_MAX_LEN,
  DEFAULT_MAX_PLAYERS,
  DEFAULT_PAINT_TOWN_RULES,
  ENTITLED_MULTIPLAYER_PLANS,
  HOME_BASE_DOC,
  MY_ROOMS_COLLECTION,
  MY_ROOMS_RESULT_LIMIT,
  OWNED_ROOM_RESULT_LIMIT,
  PAINT_TOWN_MAX_TIME_LIMIT_SEC,
  PAINT_TOWN_MIN_TIME_LIMIT_SEC,
  PLAYER_COLLECTION,
  PUBLIC_ROOM_RESULT_LIMIT,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  ROOM_COLLECTION,
  ROOM_CREATE_LIMITS_BY_PLAN,
  ROOM_CREATE_MAX_ATTEMPTS,
  ROOM_CREATE_RETRY_BASE_MS,
  ROOM_CREATE_RETRY_STEP_MS,
  ROOM_PRESENCE_LEAVE_TTL_MS,
  ROOM_STATE_COLLECTION,
  USERS_COLLECTION,
  VALID_PAINT_TOUCH_MODES,
  buildDefaultPose,
  cloneObject,
  deriveRoomDeterministicSeed,
  firestoreRuleIntOrNull,
  formatRoomCreateDeniedMessage,
  hashStringToUint32,
  modeForWorldKind,
  normalizeCityKey,
  normalizeCode,
  normalizeFeatured,
  normalizeLocationTag,
  normalizeMaxPlayers,
  normalizePaintTimeLimitSec,
  normalizePaintTouchMode,
  normalizePlanForLimits,
  normalizePlayerRole,
  normalizeRoomCreateCount,
  normalizeRoomRules,
  normalizeVisibility,
  normalizeWorld,
  randomCode,
  readStoredDisplayName,
  resolveDisplayName,
  resolveRoomCreatePolicy,
  roomCreateLimitForPlan,
  timestampToMs,
  toRoomObject,
  toSavedRoomObject,
  waitMs
} from './rooms-model.js?v=1';
import { createMultiplayerRoomsDirectoryApi } from './rooms-directory.js?v=2';

let currentRoom = null;
let roomRequestGeneration = 0;
function assertCurrentRoomRequest(generation, uid = null) {
  if (generation !== roomRequestGeneration || (uid && getCurrentUser()?.uid !== uid)) {
    throw new DOMException('Room request superseded by another session', 'AbortError');
  }
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

function myRoomsCollection(db, uid) {
  return collection(db, USERS_COLLECTION, uid, MY_ROOMS_COLLECTION);
}

const roomsDirectoryApi = createMultiplayerRoomsDirectoryApi({
  constants: {
    HOME_BASE_DOC,
    MY_ROOMS_COLLECTION,
    MY_ROOMS_RESULT_LIMIT,
    OWNED_ROOM_RESULT_LIMIT,
    PUBLIC_ROOM_RESULT_LIMIT,
    ROOM_COLLECTION,
    ROOM_STATE_COLLECTION,
    USERS_COLLECTION
  },
  getCurrentUser,
  getServices,
  normalizeCode,
  normalizeCityKey,
  requireSignedInUser,
  toRoomObject,
  toSavedRoomObject
});

const {
  findFeaturedPublicRooms,
  findPublicRoomsByCity,
  listenHomeBase,
  listenMyRooms,
  listenOwnedRooms,
  listOwnedRooms,
  setHomeBase
} = roomsDirectoryApi;

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
  const generation = ++roomRequestGeneration;
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

  const ensureUserProfile = () => ensureRoomUserProfile({
    db, userRef, runTransaction, serverTimestamp, getDocFromServer,
    profile: { uid: user.uid, email: String(user.email || '').trim().slice(0, 320), displayName: displayName.slice(0, 60) }
  });

  let profileSnap = await ensureUserProfile();
  let didServerProfileRefresh = false;

  async function refreshProfileFromServerOnce() {
    if (didServerProfileRefresh) return false;
    didServerProfileRefresh = true;
    try {
      const freshSnap = await getDocFromServer(userRef);
      if (freshSnap.exists()) {
        profileSnap = freshSnap;
        return true;
      }
    } catch (_) {
      // Keep prior profile snapshot when server refresh is unavailable.
    }
    return false;
  }

  let createdCode = null;
  let lastDeniedErr = null;
  let lastDeniedContext = null;

  for (let attempt = 0; attempt < ROOM_CREATE_MAX_ATTEMPTS; attempt++) {
    const code = normalizeCode(options.code || randomCode());
    if (code.length !== ROOM_CODE_LENGTH) {
      throw new Error('Room code generation failed. Try again.');
    }

    const roomRef = doc(db, ROOM_COLLECTION, code);
    const profile = profileSnap.exists() ? (profileSnap.data() || {}) : {};
    const {
      plan,
      roomCreateCount,
      roomCreateLimit,
      localRoomCreateLimit,
      hasEntitlement
    } = resolveRoomCreatePolicy(profile, hasAdminTokenClaim);
    const localQuotaReached = roomCreateCount >= localRoomCreateLimit;

    if (localRoomCreateLimit <= 0 || !hasEntitlement || localQuotaReached) {
      const refreshed = await refreshProfileFromServerOnce();
      if (refreshed) continue;
      if (localRoomCreateLimit <= 0 || !hasEntitlement) {
        throw new Error('Multiplayer room creation requires sign-in and a valid account profile.');
      }
      throw new Error('Room creation limit reached for this account. Rename or reuse existing rooms, or use Account to adjust your donation plan.');
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
            attemptedCode: code,
            attempt,
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
        // Firestore profile updates can arrive moments after auth state changes.
        // Backoff avoids immediate repeat-denials during that propagation window.
        await waitMs(ROOM_CREATE_RETRY_BASE_MS + attempt * ROOM_CREATE_RETRY_STEP_MS);
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

  assertCurrentRoomRequest(generation, user.uid);
  await postProtectedFunction('/joinRoom', { roomCode: createdCode, displayName }, { label: 'Room admission' });

  const roomSnap = await getDoc(doc(db, ROOM_COLLECTION, createdCode));
  const room = toRoomObject(roomSnap);
  if (!room) {
    throw new Error('Room creation succeeded but room could not be loaded.');
  }

  assertCurrentRoomRequest(generation, user.uid);
  setCurrentRoom(room);
  try {
    await upsertMyRoomRecord(room, 'owner');
  } catch (err) {
    console.warn('[multiplayer][rooms] Failed to persist room in myRooms after create:', err);
  }
  assertCurrentRoomRequest(generation, user.uid);
  return room;
}

async function joinRoomByCode(codeInput, options = {}) {
  const generation = ++roomRequestGeneration;
  const startingUid = getCurrentUser()?.uid;
  const { db } = getServices();
  const code = normalizeCode(codeInput);
  if (code.length !== ROOM_CODE_LENGTH) {
    throw new Error('Enter a valid 6-character room code.');
  }

  const roomRef = doc(db, ROOM_COLLECTION, code);
  const roomSnap = await getDoc(roomRef);
  if (!roomSnap.exists()) {
    throw new Error('Room not found. Check the invite code and try again.');
  }

  const room = toRoomObject(roomSnap);
  if (!room) {
    throw new Error('Could not read room details.');
  }

  assertCurrentRoomRequest(generation, startingUid);
  let user = getCurrentUser();
  if (!user || !user.uid) {
    if (room.visibility !== 'public') {
      throw new Error('Sign in is required to join private rooms.');
    }
    user = await ensureGuestSession();
  }
  if (!user || !user.uid) {
    throw new Error('Sign in is required before joining this room.');
  }

  const displayName = resolveDisplayName(user, options.displayName);
  assertCurrentRoomRequest(generation, user.uid);
  await postProtectedFunction('/joinRoom', { roomCode: code, displayName }, { label: 'Room admission' });
  assertCurrentRoomRequest(generation, user.uid);
  setCurrentRoom(room);
  try {
    const role = room && room.ownerUid === user.uid ? 'owner' : 'member';
    await upsertMyRoomRecord(room, role);
  } catch (err) {
    console.warn('[multiplayer][rooms] Failed to persist room in myRooms after join:', err);
  }
  assertCurrentRoomRequest(generation, user.uid);
  return room;
}

async function leaveRoom() {
  roomRequestGeneration += 1;
  const user = getCurrentUser();
  const room = currentRoom ? cloneObject(currentRoom) : null;

  setCurrentRoom(null);
  if (!room || !user || !user.uid) return;

  try {
    const { db } = getServices();
    const playerRef = doc(db, ROOM_COLLECTION, room.id, PLAYER_COLLECTION, user.uid);
    await deleteDoc(playerRef);
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

function listenRoom(roomId, callback, options = {}) {
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
    if (typeof options.onError === 'function') options.onError(err);
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

if (new URLSearchParams(globalThis.location?.search || '').get('diagnostics') === '1') {
  globalThis.__WE3D_ROOM_SUPPORT__ = Object.freeze({
    create: (options) => createRoom(options),
    join: (code) => joinRoomByCode(code),
    current: () => getCurrentRoom()
  });
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
