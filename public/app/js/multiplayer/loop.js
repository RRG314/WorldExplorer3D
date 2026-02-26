import {
  Timestamp,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { getCurrentUser } from '../../../js/auth-ui.js';
import { initFirebase } from '../../../js/firebase-init.js';
import { normalizeCityKey, normalizeCode } from './rooms.js?v=63';

const ACTIVITY_FEED_COLLECTION = 'activityFeed';
const LEADERBOARD_COLLECTION = 'explorerLeaderboard';
const ACTIVITY_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const ACTIVITY_POST_COOLDOWN_MS = 10 * 1000;
const cityCycle = [
  { city: 'Tokyo', kind: 'earth' },
  { city: 'Paris', kind: 'earth' },
  { city: 'Moon Base', kind: 'moon' },
  { city: 'Mars Gateway', kind: 'space' },
  { city: 'Baltimore', kind: 'earth' },
  { city: 'Monaco', kind: 'earth' }
];

const postGate = new Map();

function getServices() {
  const services = initFirebase();
  if (!services || !services.db) {
    throw new Error('Missing Firebase config. Return-loop features are unavailable.');
  }
  return services;
}

function sanitizeText(value, max = 120) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function isoWeekNumber(date = new Date()) {
  const value = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  return Math.ceil((((value - yearStart) / 86400000) + 1) / 7);
}

function getWeeklyFeaturedCity(date = new Date()) {
  const week = isoWeekNumber(date);
  const selected = cityCycle[week % cityCycle.length];
  return {
    week,
    city: selected.city,
    kind: selected.kind,
    cityKey: normalizeCityKey(selected.city)
  };
}

function getWeeklyEventMessage(date = new Date()) {
  const featured = getWeeklyFeaturedCity(date);
  const day = date.getDay();
  const fridayPush = day === 5
    ? `Explore ${featured.city} with others today.`
    : `Explore ${featured.city} with others this Friday.`;
  return {
    featured,
    message: fridayPush
  };
}

function canPostActivity(type) {
  const key = String(type || '').trim().toLowerCase();
  if (!key) return false;
  const now = Date.now();
  const last = postGate.get(key) || 0;
  if (now - last < ACTIVITY_POST_COOLDOWN_MS) return false;
  postGate.set(key, now);
  return true;
}

async function postActivity(type, payload = {}) {
  const user = getCurrentUser();
  if (!user || !user.uid) return;
  const activityType = String(type || '').trim().toLowerCase();
  if (!activityType) return;
  if (!canPostActivity(activityType)) return;

  const { db } = getServices();
  const ref = doc(collection(db, ACTIVITY_FEED_COLLECTION));
  await setDoc(ref, {
    uid: user.uid,
    displayName: sanitizeText(user.displayName || payload.displayName || 'Explorer', 48),
    type: activityType,
    roomCode: normalizeCode(payload.roomCode || ''),
    roomName: sanitizeText(payload.roomName || '', 80),
    cityKey: normalizeCityKey(payload.cityKey || payload.city || ''),
    text: sanitizeText(payload.text || '', 140),
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + ACTIVITY_TTL_MS)
  });
}

function listenActivityFeed(callback) {
  if (typeof callback !== 'function') return () => {};
  let db;
  try {
    ({ db } = getServices());
  } catch (_) {
    callback([]);
    return () => {};
  }

  const q = query(
    collection(db, ACTIVITY_FEED_COLLECTION),
    orderBy('createdAt', 'desc'),
    limit(30)
  );

  return onSnapshot(q, (snap) => {
    const now = Date.now();
    const rows = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const expiresAt = data.expiresAt;
      const expiresAtMs = typeof expiresAt?.toMillis === 'function' ? expiresAt.toMillis() : null;
      if (Number.isFinite(expiresAtMs) && expiresAtMs < now) return;
      rows.push({
        id: docSnap.id,
        uid: String(data.uid || ''),
        displayName: sanitizeText(data.displayName || 'Explorer', 48),
        type: sanitizeText(data.type || '', 32),
        roomCode: normalizeCode(data.roomCode || ''),
        roomName: sanitizeText(data.roomName || '', 80),
        cityKey: sanitizeText(data.cityKey || '', 48),
        text: sanitizeText(data.text || '', 140),
        createdAt: data.createdAt || null
      });
    });
    callback(rows);
  }, (err) => {
    console.warn('[multiplayer][loop] activity feed listener failed:', err);
    callback([]);
  });
}

async function bumpExplorerLeaderboard(delta = {}) {
  const user = getCurrentUser();
  if (!user || !user.uid) return;
  const roomsJoinedInc = Math.max(0, Math.min(1, Math.floor(Number(delta.roomsJoined || 0))));
  const artifactsSharedInc = Math.max(0, Math.min(2, Math.floor(Number(delta.artifactsShared || 0))));
  const friendsAddedInc = Math.max(0, Math.min(1, Math.floor(Number(delta.friendsAdded || 0))));
  if (!roomsJoinedInc && !artifactsSharedInc && !friendsAddedInc) return;

  const scoreInc = Math.min(20, roomsJoinedInc * 4 + artifactsSharedInc * 6 + friendsAddedInc * 3);
  const { db } = getServices();
  const ref = doc(db, LEADERBOARD_COLLECTION, user.uid);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists() ? snap.data() || {} : {};

    const roomsJoined = Math.max(0, Number(data.roomsJoined || 0)) + roomsJoinedInc;
    const artifactsShared = Math.max(0, Number(data.artifactsShared || 0)) + artifactsSharedInc;
    const friendsAdded = Math.max(0, Number(data.friendsAdded || 0)) + friendsAddedInc;
    const score = Math.max(0, Number(data.score || 0)) + scoreInc;

    tx.set(ref, {
      uid: user.uid,
      displayName: sanitizeText(user.displayName || data.displayName || 'Explorer', 48),
      roomsJoined,
      artifactsShared,
      friendsAdded,
      score,
      lastActiveAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true });
  });
}

function listenExplorerLeaderboard(callback) {
  if (typeof callback !== 'function') return () => {};
  let db;
  try {
    ({ db } = getServices());
  } catch (_) {
    callback([]);
    return () => {};
  }

  const q = query(
    collection(db, LEADERBOARD_COLLECTION),
    orderBy('score', 'desc'),
    limit(20)
  );

  return onSnapshot(q, (snap) => {
    const rows = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      rows.push({
        uid: String(data.uid || docSnap.id),
        displayName: sanitizeText(data.displayName || 'Explorer', 48),
        roomsJoined: Math.max(0, Number(data.roomsJoined || 0)),
        artifactsShared: Math.max(0, Number(data.artifactsShared || 0)),
        friendsAdded: Math.max(0, Number(data.friendsAdded || 0)),
        score: Math.max(0, Number(data.score || 0)),
        lastActiveAt: data.lastActiveAt || null
      });
    });
    callback(rows);
  }, (err) => {
    console.warn('[multiplayer][loop] leaderboard listener failed:', err);
    callback([]);
  });
}

export {
  bumpExplorerLeaderboard,
  getWeeklyEventMessage,
  getWeeklyFeaturedCity,
  listenActivityFeed,
  listenExplorerLeaderboard,
  postActivity
};
