import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { getCurrentUser } from '../../../js/auth-ui.js';
import { initFirebase } from '../../../js/firebase-init.js';
import { normalizeCode } from './rooms.js?v=63';

const ROOM_COLLECTION = 'rooms';
const ARTIFACTS_COLLECTION = 'artifacts';
const MAX_ARTIFACT_RESULTS = 80;

function getServices() {
  const services = initFirebase();
  if (!services || !services.db) {
    throw new Error('Missing Firebase config. Persistent artifacts are unavailable.');
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

function sanitizeText(value, max = 120) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function sanitizeType(value) {
  const normalized = String(value || '').toLowerCase().trim();
  if (normalized === 'build-area' || normalized === 'landmark' || normalized === 'memory-board') {
    return normalized;
  }
  return 'pin';
}

function normalizeAnchor(anchor = {}) {
  const kindRaw = String(anchor.kind || 'earth').toLowerCase();
  return {
    kind: kindRaw === 'moon' || kindRaw === 'space' ? kindRaw : 'earth',
    lat: Number(anchor.lat || 0),
    lon: Number(anchor.lon || 0),
    x: Number(anchor.x || 0),
    y: Number(anchor.y || 0),
    z: Number(anchor.z || 0)
  };
}

function artifactsCollection(db, roomId) {
  return collection(db, ROOM_COLLECTION, normalizeCode(roomId), ARTIFACTS_COLLECTION);
}

function artifactDoc(db, roomId, artifactId) {
  return doc(db, ROOM_COLLECTION, normalizeCode(roomId), ARTIFACTS_COLLECTION, artifactId);
}

async function createArtifact(roomId, artifact = {}) {
  const user = requireUser();
  const { db } = getServices();
  const normalizedRoomId = normalizeCode(roomId);
  if (!normalizedRoomId) throw new Error('Join a valid room first.');

  const type = sanitizeType(artifact.type);
  const title = sanitizeText(artifact.title || '', 80);
  if (!title) throw new Error('Artifact title is required.');

  const text = sanitizeText(artifact.text || '', 280);
  const visibility = artifact.visibility === 'public' ? 'public' : 'room';
  const anchor = normalizeAnchor(artifact.anchor || {});
  const expiresInDays = Number.isFinite(Number(artifact.expiresInDays)) ? Math.max(0, Math.floor(Number(artifact.expiresInDays))) : 0;

  const ref = doc(artifactsCollection(db, normalizedRoomId));
  const payload = {
    ownerUid: user.uid,
    ownerDisplayName: sanitizeText(user.displayName || 'Explorer', 48),
    type,
    title,
    text,
    visibility,
    anchor,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  if (expiresInDays > 0) {
    payload.expiresAt = Timestamp.fromMillis(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
  }
  await setDoc(ref, payload);

  return { id: ref.id };
}

function listenArtifacts(roomId, callback) {
  if (typeof callback !== 'function') return () => {};
  const normalizedRoomId = normalizeCode(roomId);
  if (!normalizedRoomId) {
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

  const q = query(
    artifactsCollection(db, normalizedRoomId),
    orderBy('updatedAt', 'desc'),
    limit(MAX_ARTIFACT_RESULTS)
  );

  return onSnapshot(q, (snap) => {
    const rows = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      rows.push({
        id: docSnap.id,
        ownerUid: String(data.ownerUid || ''),
        ownerDisplayName: sanitizeText(data.ownerDisplayName || 'Explorer', 48),
        type: sanitizeType(data.type),
        title: sanitizeText(data.title || '', 80),
        text: sanitizeText(data.text || '', 280),
        visibility: data.visibility === 'public' ? 'public' : 'room',
        anchor: normalizeAnchor(data.anchor || {}),
        createdAt: data.createdAt || null,
        updatedAt: data.updatedAt || null,
        expiresAt: data.expiresAt || null
      });
    });
    callback(rows);
  }, (err) => {
    console.warn('[multiplayer][artifacts] listener failed:', err);
    callback([]);
  });
}

async function removeArtifact(roomId, artifactId) {
  requireUser();
  const { db } = getServices();
  const normalizedRoomId = normalizeCode(roomId);
  if (!normalizedRoomId) throw new Error('Join a valid room first.');
  const cleanedArtifactId = String(artifactId || '').trim();
  if (!cleanedArtifactId) throw new Error('Artifact id is required.');
  await deleteDoc(artifactDoc(db, normalizedRoomId, cleanedArtifactId));
}

export {
  createArtifact,
  listenArtifacts,
  normalizeAnchor,
  removeArtifact
};
