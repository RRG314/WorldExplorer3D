import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

function createMultiplayerRoomsDirectoryApi(context) {
  const {
    constants,
    getCurrentUser,
    getServices,
    normalizeCode,
    normalizeCityKey,
    requireSignedInUser,
    toRoomObject,
    toSavedRoomObject
  } = context;

  const {
    HOME_BASE_DOC,
    MY_ROOMS_COLLECTION,
    MY_ROOMS_RESULT_LIMIT,
    OWNED_ROOM_RESULT_LIMIT,
    PUBLIC_ROOM_RESULT_LIMIT,
    ROOM_COLLECTION,
    ROOM_STATE_COLLECTION,
    USERS_COLLECTION
  } = constants;

  function myRoomsCollection(db, uid) {
    return collection(db, USERS_COLLECTION, uid, MY_ROOMS_COLLECTION);
  }

  function sortRoomsByCreatedAtDesc(rooms = []) {
    return [...rooms].sort((a, b) => {
      const aMs = Number.isFinite(Number(a?.createdAtMs)) ? Number(a.createdAtMs) : 0;
      const bMs = Number.isFinite(Number(b?.createdAtMs)) ? Number(b.createdAtMs) : 0;
      return bMs - aMs;
    });
  }

  async function findPublicRoomsByCity(cityInput, options = {}) {
    const { db } = getServices();

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

  async function findFeaturedPublicRooms(options = {}) {
    const { db } = getServices();

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

  return {
    findFeaturedPublicRooms,
    findPublicRoomsByCity,
    listenHomeBase,
    listenMyRooms,
    listenOwnedRooms,
    listOwnedRooms,
    setHomeBase
  };
}

export { createMultiplayerRoomsDirectoryApi };
