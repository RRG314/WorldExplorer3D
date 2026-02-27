import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { getCurrentUser } from '../../../js/auth-ui.js';
import { initFirebase } from '../../../js/firebase-init.js';
import { normalizeCode } from './rooms.js?v=65';

const USERS_COLLECTION = 'users';
const FRIENDS_COLLECTION = 'friends';
const RECENT_PLAYERS_COLLECTION = 'recentPlayers';
const INCOMING_INVITES_COLLECTION = 'incomingInvites';
const RECENT_PLAYER_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const INVITE_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const INVITE_RESEND_COOLDOWN_MS = 30 * 1000;
const MAX_SOCIAL_RESULTS = 30;
const RECENT_WRITE_COOLDOWN_MS = 60 * 1000;

const recentWriteGate = new Map();
const inviteWriteGate = new Map();

function getServices() {
  const services = initFirebase();
  if (!services || !services.db) {
    throw new Error('Missing Firebase config. Social graph is unavailable.');
  }
  return services;
}

function requireUser() {
  const user = getCurrentUser();
  if (!user || !user.uid) {
    throw new Error('Sign in is required.');
  }
  return user;
}

function sanitizeName(value, fallback = 'Explorer') {
  const cleaned = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 48);
  return cleaned || fallback;
}

function sanitizeText(value, max = 120) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function userCollectionPath(db, uid, subcollection) {
  return collection(db, USERS_COLLECTION, uid, subcollection);
}

function userDocPath(db, uid, subcollection, docId) {
  return doc(db, USERS_COLLECTION, uid, subcollection, docId);
}

function toMillis(value) {
  if (!value) return null;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  return null;
}

function normalizeBasePath(pathname = '/') {
  const path = String(pathname || '/');
  const anchors = ['/app/', '/account/', '/legal/'];
  for (const anchor of anchors) {
    const idx = path.indexOf(anchor);
    if (idx >= 0) return path.slice(0, idx);
  }

  if (path === '/' || path === '') return '';
  if (path.endsWith('/')) return path.slice(0, -1);

  const lastSlash = path.lastIndexOf('/');
  return lastSlash > 0 ? path.slice(0, lastSlash) : '';
}

function resolveAppUrlBase() {
  const origin = window.location?.origin || '';
  const basePath = normalizeBasePath(window.location?.pathname || '/');
  return `${origin}${basePath}/app/`;
}

function buildInviteLink(code) {
  const normalized = normalizeCode(code);
  if (!normalized) return '';
  const url = new URL(resolveAppUrlBase());
  url.searchParams.set('room', normalized);
  url.searchParams.set('tab', 'multiplayer');
  url.searchParams.set('invite', '1');
  url.searchParams.delete('startTrial');
  return url.toString();
}

function normalizeInvite(roomCode, roomName = '', message = '') {
  const code = normalizeCode(roomCode);
  if (!code) throw new Error('A valid room code is required to send invites.');
  return {
    roomCode: code,
    roomName: sanitizeText(roomName, 80),
    message: sanitizeText(message, 120),
    inviteLink: buildInviteLink(code)
  };
}

function listenSocialCollection(pathRef, mapper, callback) {
  if (typeof callback !== 'function') return () => {};
  const q = query(pathRef, orderBy('updatedAt', 'desc'), limit(MAX_SOCIAL_RESULTS));
  return onSnapshot(q, (snap) => {
    const rows = [];
    snap.forEach((docSnap) => {
      rows.push(mapper(docSnap.id, docSnap.data() || {}));
    });
    callback(rows);
  }, (err) => {
    console.warn('[multiplayer][social] listener failed:', err);
    callback([]);
  });
}

function listenFriends(callback) {
  const user = getCurrentUser();
  if (!user || !user.uid) {
    if (typeof callback === 'function') callback([]);
    return () => {};
  }
  const { db } = getServices();
  return listenSocialCollection(
    userCollectionPath(db, user.uid, FRIENDS_COLLECTION),
    (id, data) => ({
      uid: String(data.uid || id),
      displayName: sanitizeName(data.displayName || 'Explorer'),
      source: String(data.source || 'manual'),
      addedAt: data.addedAt || null,
      updatedAt: data.updatedAt || null
    }),
    callback
  );
}

function listenRecentPlayers(callback) {
  const user = getCurrentUser();
  if (!user || !user.uid) {
    if (typeof callback === 'function') callback([]);
    return () => {};
  }
  const { db } = getServices();
  const q = query(
    userCollectionPath(db, user.uid, RECENT_PLAYERS_COLLECTION),
    orderBy('lastPlayedAt', 'desc'),
    limit(MAX_SOCIAL_RESULTS)
  );
  return onSnapshot(q, (snap) => {
    const now = Date.now();
    const rows = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const expiresAtMs = toMillis(data.expiresAt);
      if (Number.isFinite(expiresAtMs) && expiresAtMs < now) return;
      rows.push({
        uid: String(data.uid || docSnap.id),
        displayName: sanitizeName(data.displayName || 'Explorer'),
        roomCode: normalizeCode(data.roomCode || ''),
        roomName: sanitizeText(data.roomName || '', 80),
        sharedSessions: Number.isFinite(Number(data.sharedSessions)) ? Math.max(1, Number(data.sharedSessions)) : 1,
        lastPlayedAt: data.lastPlayedAt || null
      });
    });
    callback(rows);
  }, (err) => {
    console.warn('[multiplayer][social] recent players listener failed:', err);
    callback([]);
  });
}

function listenIncomingInvites(callback) {
  const user = getCurrentUser();
  if (!user || !user.uid) {
    if (typeof callback === 'function') callback([]);
    return () => {};
  }
  const { db } = getServices();
  const q = query(
    userCollectionPath(db, user.uid, INCOMING_INVITES_COLLECTION),
    orderBy('createdAt', 'desc'),
    limit(20)
  );
  return onSnapshot(q, (snap) => {
    const now = Date.now();
    const rows = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const expiresAtMs = toMillis(data.expiresAt);
      if (Number.isFinite(expiresAtMs) && expiresAtMs < now) return;
      rows.push({
        id: docSnap.id,
        fromUid: String(data.fromUid || ''),
        fromDisplayName: sanitizeName(data.fromDisplayName || 'Explorer'),
        toUid: String(data.toUid || ''),
        roomCode: normalizeCode(data.roomCode || ''),
        roomName: sanitizeText(data.roomName || '', 80),
        inviteLink: String(data.inviteLink || ''),
        message: sanitizeText(data.message || '', 120),
        seen: !!data.seen,
        createdAt: data.createdAt || null
      });
    });
    callback(rows);
  }, (err) => {
    console.warn('[multiplayer][social] invite listener failed:', err);
    callback([]);
  });
}

async function addFriend(friendUid, displayName = 'Explorer', source = 'manual') {
  const user = requireUser();
  const cleanedUid = String(friendUid || '').trim();
  if (!cleanedUid) throw new Error('Friend uid is required.');
  if (cleanedUid === user.uid) throw new Error('You cannot add yourself.');

  const safeSource = source === 'recent' ? 'recent' : 'manual';
  const { db } = getServices();
  const ref = userDocPath(db, user.uid, FRIENDS_COLLECTION, cleanedUid);
  const existing = await getDoc(ref);
  await setDoc(ref, {
    uid: cleanedUid,
    displayName: sanitizeName(displayName),
    source: safeSource,
    addedAt: existing.exists() ? existing.data()?.addedAt || serverTimestamp() : serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });
}

async function removeFriend(friendUid) {
  const user = requireUser();
  const cleanedUid = String(friendUid || '').trim();
  if (!cleanedUid) throw new Error('Friend uid is required.');
  const { db } = getServices();
  await deleteDoc(userDocPath(db, user.uid, FRIENDS_COLLECTION, cleanedUid));
}

async function recordRecentPlayers(roomCode, roomName, players = []) {
  const user = getCurrentUser();
  if (!user || !user.uid) return;
  const normalizedRoomCode = normalizeCode(roomCode);
  if (!normalizedRoomCode) return;

  const safeRoomName = sanitizeText(roomName || '', 80);
  const { db } = getServices();

  for (const player of players) {
    const uid = String(player?.uid || '').trim();
    if (!uid || uid === user.uid) continue;

    const gateKey = `${normalizedRoomCode}:${uid}`;
    const now = Date.now();
    const lastWriteAt = recentWriteGate.get(gateKey) || 0;
    if (now - lastWriteAt < RECENT_WRITE_COOLDOWN_MS) continue;

    const ref = userDocPath(db, user.uid, RECENT_PLAYERS_COLLECTION, uid);
    const snap = await getDoc(ref);
    const nextSessions = snap.exists() && Number.isFinite(Number(snap.data()?.sharedSessions))
      ? Math.min(5000, Number(snap.data().sharedSessions) + 1)
      : 1;

    await setDoc(ref, {
      uid,
      displayName: sanitizeName(player.displayName || 'Explorer'),
      roomCode: normalizedRoomCode,
      roomName: safeRoomName,
      sharedSessions: nextSessions,
      lastPlayedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(now + RECENT_PLAYER_TTL_MS)
    }, { merge: true });

    recentWriteGate.set(gateKey, now);
  }
}

async function sendInviteToFriend(friendUid, roomCode, roomName = '', message = '') {
  const user = requireUser();
  const targetUid = String(friendUid || '').trim();
  if (!targetUid) throw new Error('Friend uid is required.');
  if (targetUid === user.uid) throw new Error('You cannot invite yourself.');

  const invite = normalizeInvite(roomCode, roomName, message);
  const { db } = getServices();
  const friendshipRef = userDocPath(db, user.uid, FRIENDS_COLLECTION, targetUid);
  const friendship = await getDoc(friendshipRef);
  if (!friendship.exists()) {
    throw new Error('Add this player as a friend before sending invites.');
  }

  const inviteId = `${user.uid}_${invite.roomCode}`;
  const gateKey = `${targetUid}:${inviteId}`;
  const now = Date.now();
  const gateLastAt = inviteWriteGate.get(gateKey) || 0;
  if (now - gateLastAt < INVITE_RESEND_COOLDOWN_MS) {
    throw new Error('Invite cooldown active. Please wait before sending another invite.');
  }

  const inviteRef = userDocPath(db, targetUid, INCOMING_INVITES_COLLECTION, inviteId);
  const existingInvite = await getDoc(inviteRef);
  if (existingInvite.exists()) {
    const existingUpdatedAt = toMillis(existingInvite.data()?.updatedAt);
    if (Number.isFinite(existingUpdatedAt) && now - existingUpdatedAt < INVITE_RESEND_COOLDOWN_MS) {
      throw new Error('Invite cooldown active. Please wait before sending another invite.');
    }
  }

  await setDoc(inviteRef, {
    fromUid: user.uid,
    fromDisplayName: sanitizeName(user.displayName || 'Explorer'),
    toUid: targetUid,
    roomCode: invite.roomCode,
    roomName: invite.roomName,
    inviteLink: invite.inviteLink,
    message: invite.message,
    seen: false,
    createdAt: existingInvite.exists() ? existingInvite.data()?.createdAt || serverTimestamp() : serverTimestamp(),
    updatedAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(now + INVITE_TTL_MS)
  });
  inviteWriteGate.set(gateKey, now);

  return invite.inviteLink;
}

async function markInviteSeen(inviteId, seen = true) {
  const user = requireUser();
  const id = String(inviteId || '').trim();
  if (!id) throw new Error('Invite id is required.');
  const { db } = getServices();
  await setDoc(userDocPath(db, user.uid, INCOMING_INVITES_COLLECTION, id), {
    seen: !!seen,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

async function dismissInvite(inviteId) {
  const user = requireUser();
  const id = String(inviteId || '').trim();
  if (!id) throw new Error('Invite id is required.');
  const { db } = getServices();
  await deleteDoc(userDocPath(db, user.uid, INCOMING_INVITES_COLLECTION, id));
}

export {
  addFriend,
  dismissInvite,
  listenFriends,
  listenIncomingInvites,
  listenRecentPlayers,
  markInviteSeen,
  recordRecentPlayers,
  removeFriend,
  sendInviteToFriend
};
