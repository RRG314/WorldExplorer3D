import {
  collection,
  Timestamp,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { getCurrentUser } from '../../../js/auth-ui.js';
import { initFirebase } from '../../../js/firebase-init.js';

const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_COLLECTION = 'rooms';
const USERS_COLLECTION = 'users';
const PLAYER_COLLECTION = 'players';
const ROOM_STATE_COLLECTION = 'state';
const HOME_BASE_DOC = 'homeBase';
const ROOM_PRESENCE_TTL_MS = 90 * 1000;
const DEFAULT_MAX_PLAYERS = 12;
const CITY_KEY_MAX_LEN = 48;
const PUBLIC_ROOM_RESULT_LIMIT = 20;
const ROOM_CREATE_LIMITS_BY_PLAN = Object.freeze({
  free: 0,
  trial: 3,
  support: 10,
  supporter: 10,
  pro: 25
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
  if (plan === 'trial' || plan === 'supporter' || plan === 'pro') return plan;
  return 'free';
}

function roomCreateLimitForPlan(plan) {
  const normalized = normalizePlanForLimits(plan);
  return ROOM_CREATE_LIMITS_BY_PLAN[normalized] || ROOM_CREATE_LIMITS_BY_PLAN.free;
}

function normalizeRoomCreateCount(raw) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(10000, Math.floor(parsed)));
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
    rules: {
      allowChat: data.rules?.allowChat !== false,
      allowGhosts: data.rules?.allowGhosts !== false
    }
  };
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
  const userRef = doc(db, USERS_COLLECTION, user.uid);

  // Ensure the user profile exists so quota consumption can be validated by rules.
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) {
    await setDoc(userRef, {
      uid: user.uid,
      email: String(user.email || '').trim().slice(0, 320),
      displayName: displayName.slice(0, 60),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });
  }

  let createdCode = null;

  for (let attempt = 0; attempt < 16; attempt++) {
    const code = normalizeCode(options.code || randomCode());
    if (code.length !== ROOM_CODE_LENGTH) {
      throw new Error('Room code generation failed. Try again.');
    }

    const roomRef = doc(db, ROOM_COLLECTION, code);

    try {
      await runTransaction(db, async (tx) => {
        const existing = await tx.get(roomRef);
        if (existing.exists()) {
          throw new Error('ROOM_CODE_COLLISION');
        }
        const profileSnap = await tx.get(userRef);
        const profile = profileSnap.exists() ? (profileSnap.data() || {}) : {};
        const roomCreateCount = normalizeRoomCreateCount(profile.roomCreateCount);
        const roomCreateLimit = roomCreateLimitForPlan(profile.plan || 'free');

        if (roomCreateLimit <= 0 || roomCreateCount >= roomCreateLimit) {
          throw new Error('ROOM_CREATE_LIMIT_REACHED');
        }

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
          rules: {
            allowChat: true,
            allowGhosts: true
          }
        };

        if (locationTag) roomPayload.locationTag = locationTag;
        tx.set(roomRef, roomPayload);
        tx.set(userRef, {
          uid: user.uid,
          email: String(user.email || profile.email || '').trim().slice(0, 320),
          displayName: displayName.slice(0, 60),
          roomCreateCount: roomCreateCount + 1,
          roomCreateLimit,
          updatedAt: serverTimestamp()
        }, { merge: true });
      });

      createdCode = code;
      break;
    } catch (err) {
      if (String(err?.message || '') === 'ROOM_CODE_COLLISION') {
        continue;
      }
      if (String(err?.message || '') === 'ROOM_CREATE_LIMIT_REACHED') {
        throw new Error('Room creation limit reached for your plan. Rename or reuse existing rooms, or upgrade for a higher limit.');
      }
      throw err;
    }
  }

  if (!createdCode) {
    throw new Error('Unable to reserve a room code. Please retry.');
  }

  const ownerPlayerRef = doc(db, ROOM_COLLECTION, createdCode, PLAYER_COLLECTION, user.uid);
  try {
    await setDoc(ownerPlayerRef, {
      uid: user.uid,
      displayName,
      joinedAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + ROOM_PRESENCE_TTL_MS),
      role: 'owner',
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

  try {
    await setDoc(playerRef, {
      uid: user.uid,
      displayName,
      joinedAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + ROOM_PRESENCE_TTL_MS),
      role: 'member',
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

  const payload = {
    visibility,
    featured: visibility === 'public' && normalizeFeatured(updates.featured ?? currentRoom.featured)
  };

  if (typeof updates.name === 'string') {
    payload.name = String(updates.name || '').trim().slice(0, 80);
  }

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
  findPublicRoomsByCity,
  findFeaturedPublicRooms,
  getCurrentRoom,
  joinRoomByCode,
  leaveRoom,
  listenRoom,
  listenHomeBase,
  normalizeCityKey,
  normalizeCode,
  setHomeBase,
  updateRoomSettings
};
