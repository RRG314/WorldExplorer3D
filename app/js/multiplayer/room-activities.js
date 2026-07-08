import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { getCurrentUser } from '../../../js/auth-ui.js';
import { initFirebase } from '../../../js/firebase-init.js';
import { normalizeCode } from './rooms.js?v=66';

const ROOM_COLLECTION = 'rooms';
const ACTIVITIES_COLLECTION = 'activities';
const ACTIVITY_STATE_COLLECTION = 'activityState';
const ACTIVE_ACTIVITY_DOC = 'active';

function sanitizeText(value, max = 160) {
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
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function timestampToMs(value, fallback = 0) {
  if (!value) return fallback;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function services() {
  const next = initFirebase();
  if (!next?.db) {
    throw new Error('Room activities require Firebase configuration.');
  }
  return next;
}

function roomActivitiesCollection(db, roomCode) {
  return collection(db, ROOM_COLLECTION, normalizeCode(roomCode), ACTIVITIES_COLLECTION);
}

function roomActivityDoc(db, roomCode, activityId) {
  return doc(roomActivitiesCollection(db, roomCode), sanitizeText(activityId || '', 120).toLowerCase());
}

function roomActivityStateDoc(db, roomCode) {
  return doc(db, ROOM_COLLECTION, normalizeCode(roomCode), ACTIVITY_STATE_COLLECTION, ACTIVE_ACTIVITY_DOC);
}

function normalizeAnchor(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    id: sanitizeText(source.id || '', 80).toLowerCase(),
    typeId: sanitizeText(source.typeId || 'checkpoint', 48).toLowerCase(),
    label: sanitizeText(source.label || 'Anchor', 80),
    x: finiteNumber(source.x, 0),
    y: finiteNumber(source.y, 0),
    z: finiteNumber(source.z, 0),
    baseY: finiteNumber(source.baseY, source.y),
    heightOffset: finiteNumber(source.heightOffset, 0),
    yaw: finiteNumber(source.yaw, 0),
    radius: clamp(finiteNumber(source.radius, 8), 1, 600),
    sizeX: clamp(finiteNumber(source.sizeX, 12), 1, 600),
    sizeY: clamp(finiteNumber(source.sizeY, 6), 1, 600),
    sizeZ: clamp(finiteNumber(source.sizeZ, 12), 1, 600),
    environment: sanitizeText(source.environment || '', 48).toLowerCase(),
    valid: source.valid !== false
  };
}

function normalizePoint(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    x: finiteNumber(source.x, 0),
    y: finiteNumber(source.y, 0),
    z: finiteNumber(source.z, 0)
  };
}

function normalizeRoomActivity(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const anchors = Array.isArray(source.anchors) ? source.anchors.map(normalizeAnchor).slice(0, 80) : [];
  return {
    id: sanitizeText(source.id || '', 120).toLowerCase(),
    roomCode: normalizeCode(source.roomCode || ''),
    title: sanitizeText(source.title || 'Room Game', 120),
    description: sanitizeMultilineText(source.description || '', 220),
    templateId: sanitizeText(source.templateId || '', 80).toLowerCase(),
    traversalMode: sanitizeText(source.traversalMode || 'walk', 32).toLowerCase(),
    preferredSurface: sanitizeText(source.preferredSurface || '', 48).toLowerCase(),
    creatorId: sanitizeText(source.creatorId || '', 160),
    creatorName: sanitizeText(source.creatorName || 'Explorer', 80),
    creatorAvatar: sanitizeText(source.creatorAvatar || '👥', 12) || '👥',
    visibility: sanitizeText(source.visibility || 'room', 24).toLowerCase() === 'public' ? 'public' : 'room',
    status: sanitizeText(source.status || 'published', 24).toLowerCase(),
    playerMode: 'multiplayer',
    multiplayerEnabled: source.multiplayerEnabled !== false,
    estimatedMinutes: clamp(finiteNumber(source.estimatedMinutes, 6), 1, 60),
    difficulty: sanitizeText(source.difficulty || 'Moderate', 24),
    locationLabel: sanitizeText(source.locationLabel || '', 120),
    anchors,
    startPoint: normalizePoint(source.startPoint || anchors[0] || {}),
    center: normalizePoint(source.center || anchors[0] || {}),
    createdAtMs: finiteNumber(source.createdAtMs, timestampToMs(source.createdAt, Date.now())),
    updatedAtMs: finiteNumber(source.updatedAtMs, timestampToMs(source.updatedAt, Date.now()))
  };
}

function normalizeRoomActivityState(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    activityId: sanitizeText(source.activityId || '', 120).toLowerCase(),
    roomCode: normalizeCode(source.roomCode || ''),
    title: sanitizeText(source.title || '', 120),
    templateId: sanitizeText(source.templateId || '', 80).toLowerCase(),
    status: sanitizeText(source.status || 'idle', 24).toLowerCase(),
    startedByUid: sanitizeText(source.startedByUid || '', 160),
    startedByName: sanitizeText(source.startedByName || '', 80),
    replayCount: clamp(finiteNumber(source.replayCount, 0), 0, 10000),
    startedAtMs: finiteNumber(source.startedAtMs, timestampToMs(source.startedAt, 0)),
    updatedAtMs: finiteNumber(source.updatedAtMs, timestampToMs(source.updatedAt, 0))
  };
}

async function saveRoomActivity(roomCode, activity = {}) {
  const normalizedRoomCode = normalizeCode(roomCode);
  if (!normalizedRoomCode) throw new Error('Join a valid room first.');
  const user = getCurrentUser();
  if (!user?.uid) throw new Error('Sign in is required to save a room game.');
  const { db } = services();
  const normalized = normalizeRoomActivity({
    ...activity,
    roomCode: normalizedRoomCode,
    creatorId: activity.creatorId || user.uid
  });
  if (!normalized.id) throw new Error('Room game id is required.');
  const ref = roomActivityDoc(db, normalizedRoomCode, normalized.id);
  const existing = await getDoc(ref);
  const existingData = existing.exists() ? normalizeRoomActivity(existing.data() || {}) : null;
  const payload = {
    id: normalized.id,
    roomCode: normalizedRoomCode,
    title: normalized.title,
    description: normalized.description,
    templateId: normalized.templateId,
    traversalMode: normalized.traversalMode,
    preferredSurface: normalized.preferredSurface,
    creatorId: normalized.creatorId || user.uid,
    creatorName: normalized.creatorName,
    creatorAvatar: normalized.creatorAvatar,
    visibility: normalized.visibility,
    status: normalized.status || 'published',
    playerMode: 'multiplayer',
    multiplayerEnabled: true,
    estimatedMinutes: normalized.estimatedMinutes,
    difficulty: normalized.difficulty,
    locationLabel: normalized.locationLabel,
    anchors: normalized.anchors,
    startPoint: normalized.startPoint,
    center: normalized.center,
    createdAt: existing.exists() ? existing.data()?.createdAt || serverTimestamp() : serverTimestamp(),
    createdAtMs: existingData?.createdAtMs || Date.now(),
    updatedAt: serverTimestamp(),
    updatedAtMs: Date.now()
  };
  await setDoc(ref, payload, { merge: true });
  return normalizeRoomActivity(payload);
}

async function deleteRoomActivity(roomCode, activityId) {
  const normalizedRoomCode = normalizeCode(roomCode);
  const normalizedActivityId = sanitizeText(activityId || '', 120).toLowerCase();
  if (!normalizedRoomCode || !normalizedActivityId) throw new Error('Select a valid room game.');
  const { db } = services();
  await deleteDoc(roomActivityDoc(db, normalizedRoomCode, normalizedActivityId));
  return true;
}

function listenRoomActivities(roomCode, callback = () => {}) {
  const normalizedRoomCode = normalizeCode(roomCode);
  if (!normalizedRoomCode || typeof callback !== 'function') return () => {};
  const { db } = services();
  return onSnapshot(
    query(roomActivitiesCollection(db, normalizedRoomCode), orderBy('updatedAt', 'desc')),
    (snap) => {
      const rows = snap.docs.map((entry) => normalizeRoomActivity(entry.data() || {}));
      callback(rows);
    },
    (error) => {
      console.warn('[multiplayer][room-activities] listener failed:', error);
      callback([]);
    }
  );
}

async function startRoomActivitySession(roomCode, activity = {}, actor = {}) {
  const normalizedRoomCode = normalizeCode(roomCode);
  if (!normalizedRoomCode) throw new Error('Join a valid room first.');
  const normalizedActivity = normalizeRoomActivity({ ...activity, roomCode: normalizedRoomCode });
  if (!normalizedActivity.id) throw new Error('Select a valid room game first.');
  const { db } = services();
  const currentUser = getCurrentUser();
  const actorUid = sanitizeText(actor.uid || currentUser?.uid || '', 160);
  const actorName = sanitizeText(actor.displayName || actor.name || currentUser?.displayName || currentUser?.email || 'Explorer', 80);
  const existing = await getDoc(roomActivityStateDoc(db, normalizedRoomCode));
  const previous = existing.exists() ? normalizeRoomActivityState(existing.data() || {}) : null;
  const payload = {
    roomCode: normalizedRoomCode,
    activityId: normalizedActivity.id,
    title: normalizedActivity.title,
    templateId: normalizedActivity.templateId,
    status: 'running',
    startedByUid: actorUid,
    startedByName: actorName,
    replayCount: (previous?.activityId === normalizedActivity.id ? previous.replayCount : 0) + 1,
    startedAt: serverTimestamp(),
    startedAtMs: Date.now(),
    updatedAt: serverTimestamp(),
    updatedAtMs: Date.now()
  };
  await setDoc(roomActivityStateDoc(db, normalizedRoomCode), payload, { merge: true });
  return normalizeRoomActivityState(payload);
}

async function stopRoomActivitySession(roomCode, actor = {}) {
  const normalizedRoomCode = normalizeCode(roomCode);
  if (!normalizedRoomCode) throw new Error('Join a valid room first.');
  const { db } = services();
  const currentUser = getCurrentUser();
  const payload = {
    roomCode: normalizedRoomCode,
    activityId: '',
    title: '',
    templateId: '',
    status: 'idle',
    startedByUid: sanitizeText(actor.uid || currentUser?.uid || '', 160),
    startedByName: sanitizeText(actor.displayName || currentUser?.displayName || currentUser?.email || 'Explorer', 80),
    replayCount: 0,
    startedAt: serverTimestamp(),
    startedAtMs: 0,
    updatedAt: serverTimestamp(),
    updatedAtMs: Date.now()
  };
  await setDoc(roomActivityStateDoc(db, normalizedRoomCode), payload, { merge: true });
  return true;
}

function listenRoomActivityState(roomCode, callback = () => {}) {
  const normalizedRoomCode = normalizeCode(roomCode);
  if (!normalizedRoomCode || typeof callback !== 'function') return () => {};
  const { db } = services();
  return onSnapshot(
    roomActivityStateDoc(db, normalizedRoomCode),
    (snap) => {
      callback(snap.exists() ? normalizeRoomActivityState(snap.data() || {}) : null);
    },
    (error) => {
      console.warn('[multiplayer][room-activities] state listener failed:', error);
      callback(null);
    }
  );
}

export {
  deleteRoomActivity,
  listenRoomActivities,
  listenRoomActivityState,
  normalizeRoomActivity,
  normalizeRoomActivityState,
  saveRoomActivity,
  startRoomActivitySession,
  stopRoomActivitySession
};
