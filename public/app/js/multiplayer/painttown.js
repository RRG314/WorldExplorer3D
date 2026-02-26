import {
  Timestamp,
  collection,
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
const PAINT_CLAIMS_COLLECTION = 'paintClaims';
const MAX_PAINT_CLAIMS = 2500;
const PAINT_CLAIM_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const VALID_METHODS = new Set(['roof', 'touch-roof', 'touch-any', 'gun']);

function getServices() {
  const services = initFirebase();
  if (!services || !services.db) {
    throw new Error('Missing Firebase config. Paint sync is unavailable.');
  }
  return services;
}

function requireSignedInUser() {
  const user = getCurrentUser();
  if (!user || !user.uid) {
    throw new Error('Sign in is required.');
  }
  return user;
}

function sanitizeDisplayName(value) {
  const cleaned = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 48);
  return cleaned || 'Explorer';
}

function normalizePaintClaimId(rawKey) {
  return String(rawKey || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 120);
}

function normalizeColorHex(rawColor) {
  const text = String(rawColor || '').trim().toUpperCase();
  if (/^#[0-9A-F]{6}$/.test(text)) return text;
  return '#D61F2C';
}

function normalizeMethod(rawMethod) {
  const method = String(rawMethod || '').toLowerCase();
  return VALID_METHODS.has(method) ? method : 'touch-any';
}

function claimsCollection(db, roomId) {
  return collection(db, ROOM_COLLECTION, normalizeCode(roomId), PAINT_CLAIMS_COLLECTION);
}

function claimDoc(db, roomId, claimId) {
  return doc(db, ROOM_COLLECTION, normalizeCode(roomId), PAINT_CLAIMS_COLLECTION, claimId);
}

async function upsertPaintClaim(roomId, claim = {}) {
  const user = requireSignedInUser();
  const normalizedRoomId = normalizeCode(roomId);
  if (!normalizedRoomId) throw new Error('Join a valid room first.');

  const rawKey = String(claim.key || '').trim().slice(0, 120);
  if (!rawKey) throw new Error('Paint claim requires a building key.');
  const claimId = normalizePaintClaimId(rawKey);
  if (!claimId) throw new Error('Paint claim key is invalid.');

  const colorHex = normalizeColorHex(claim.colorHex);
  const colorName = String(claim.colorName || '').replace(/\s+/g, ' ').trim().slice(0, 24) || 'Red';
  const method = normalizeMethod(claim.method);
  const now = Date.now();

  const { db } = getServices();
  await setDoc(claimDoc(db, normalizedRoomId, claimId), {
    key: rawKey,
    colorHex,
    colorName,
    method,
    uid: user.uid,
    displayName: sanitizeDisplayName(claim.displayName || user.displayName || 'Explorer'),
    updatedAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(now + PAINT_CLAIM_TTL_MS)
  }, { merge: true });
}

function listenPaintClaims(roomId, callback) {
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
    claimsCollection(db, normalizedRoomId),
    orderBy('updatedAt', 'desc'),
    limit(MAX_PAINT_CLAIMS)
  );

  return onSnapshot(q, (snap) => {
    const now = Date.now();
    const rows = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const expiresAtMs = typeof data.expiresAt?.toMillis === 'function' ? data.expiresAt.toMillis() : null;
      if (Number.isFinite(expiresAtMs) && expiresAtMs < now) return;

      const key = String(data.key || '').trim().slice(0, 120);
      if (!key) return;
      rows.push({
        id: docSnap.id,
        key,
        uid: String(data.uid || ''),
        displayName: sanitizeDisplayName(data.displayName || 'Explorer'),
        colorHex: normalizeColorHex(data.colorHex),
        colorName: String(data.colorName || '').trim().slice(0, 24) || 'Red',
        method: normalizeMethod(data.method),
        updatedAt: data.updatedAt || null
      });
    });
    callback(rows);
  }, (err) => {
    console.warn('[multiplayer][painttown] listener failed:', err);
    callback([]);
  });
}

export {
  listenPaintClaims,
  normalizeColorHex,
  upsertPaintClaim
};
