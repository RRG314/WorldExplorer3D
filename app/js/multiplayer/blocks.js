import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { getCurrentUser } from '../../../js/auth-ui.js';
import { initFirebase } from '../../../js/firebase-init.js';
import { normalizeCode } from './rooms.js?v=63';

const ROOM_COLLECTION = 'rooms';
const BLOCKS_COLLECTION = 'blocks';
const BLOCKS_RESULT_LIMIT = 400;
const BLOCK_COORD_MIN = -50000;
const BLOCK_COORD_MAX = 50000;
const BLOCK_MATERIAL_MIN = 0;
const BLOCK_MATERIAL_MAX = 64;

function getServices() {
  const { db } = initFirebase();
  if (!db) throw new Error('Firestore is not configured.');
  return { db };
}

function requireSignedInUser() {
  const user = getCurrentUser();
  if (!user || !user.uid) {
    throw new Error('Sign in is required.');
  }
  return user;
}

function toInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(n);
}

function clampInt(value, min, max, fallback = min) {
  const n = toInt(value, fallback);
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function blockDocIdFromCoords(gx, gy, gz) {
  return `${toInt(gx, 0)}_${toInt(gy, 0)}_${toInt(gz, 0)}`;
}

function normalizeSharedBlockInput(raw = {}) {
  const gx = clampInt(raw.gx, BLOCK_COORD_MIN, BLOCK_COORD_MAX, 0);
  const gy = clampInt(raw.gy, BLOCK_COORD_MIN, BLOCK_COORD_MAX, 0);
  const gz = clampInt(raw.gz, BLOCK_COORD_MIN, BLOCK_COORD_MAX, 0);
  const materialIndex = clampInt(raw.materialIndex, BLOCK_MATERIAL_MIN, BLOCK_MATERIAL_MAX, 0);
  const id = String(raw.id || blockDocIdFromCoords(gx, gy, gz));
  return { id, gx, gy, gz, materialIndex };
}

function toSharedBlockObject(blockSnap) {
  const data = blockSnap?.data?.();
  if (!data || typeof data !== 'object') return null;
  const gx = Number(data.gx);
  const gy = Number(data.gy);
  const gz = Number(data.gz);
  const materialIndex = Number(data.materialIndex);
  if (!Number.isFinite(gx) || !Number.isFinite(gy) || !Number.isFinite(gz)) return null;
  return {
    id: String(data.id || blockSnap.id || blockDocIdFromCoords(gx, gy, gz)),
    gx: Math.round(gx),
    gy: Math.round(gy),
    gz: Math.round(gz),
    materialIndex: Number.isFinite(materialIndex) ? Math.max(BLOCK_MATERIAL_MIN, Math.min(BLOCK_MATERIAL_MAX, Math.round(materialIndex))) : 0,
    createdBy: String(data.createdBy || ''),
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null
  };
}

async function upsertSharedBlock(roomId, block = {}) {
  const { db } = getServices();
  const user = requireSignedInUser();
  const normalizedRoomId = normalizeCode(roomId);
  if (!normalizedRoomId) throw new Error('Invalid room code.');

  const normalized = normalizeSharedBlockInput(block);
  const blockRef = doc(db, ROOM_COLLECTION, normalizedRoomId, BLOCKS_COLLECTION, normalized.id);
  await setDoc(blockRef, {
    id: normalized.id,
    gx: normalized.gx,
    gy: normalized.gy,
    gz: normalized.gz,
    materialIndex: normalized.materialIndex,
    createdBy: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }, { merge: true });
}

async function removeSharedBlock(roomId, block = {}) {
  const { db } = getServices();
  requireSignedInUser();
  const normalizedRoomId = normalizeCode(roomId);
  if (!normalizedRoomId) throw new Error('Invalid room code.');
  const normalized = normalizeSharedBlockInput(block);
  const blockRef = doc(db, ROOM_COLLECTION, normalizedRoomId, BLOCKS_COLLECTION, normalized.id);
  await deleteDoc(blockRef);
}

async function clearMySharedBlocks(roomId, options = {}) {
  const { db } = getServices();
  const user = requireSignedInUser();
  const normalizedRoomId = normalizeCode(roomId);
  if (!normalizedRoomId) throw new Error('Invalid room code.');

  const resultLimit = Math.max(1, Math.min(1000, Math.floor(Number(options.resultLimit || BLOCKS_RESULT_LIMIT))));
  const blocksQuery = query(
    collection(db, ROOM_COLLECTION, normalizedRoomId, BLOCKS_COLLECTION),
    where('createdBy', '==', user.uid),
    limit(resultLimit)
  );
  const snap = await getDocs(blocksQuery);
  if (snap.empty) return 0;

  const batch = writeBatch(db);
  let count = 0;
  snap.forEach((blockSnap) => {
    batch.delete(blockSnap.ref);
    count += 1;
  });
  await batch.commit();
  return count;
}

function listenSharedBlocks(roomId, callback, options = {}) {
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

  const resultLimit = Math.max(1, Math.min(1000, Math.floor(Number(options.resultLimit || BLOCKS_RESULT_LIMIT))));
  const blocksQuery = query(
    collection(db, ROOM_COLLECTION, normalizedRoomId, BLOCKS_COLLECTION),
    limit(resultLimit)
  );

  return onSnapshot(blocksQuery, (snap) => {
    const rows = [];
    snap.forEach((blockSnap) => {
      const block = toSharedBlockObject(blockSnap);
      if (!block) return;
      rows.push(block);
    });
    rows.sort((a, b) => {
      if (a.gx !== b.gx) return a.gx - b.gx;
      if (a.gz !== b.gz) return a.gz - b.gz;
      return a.gy - b.gy;
    });
    callback(rows);
  }, (err) => {
    console.warn('[multiplayer][blocks] listenSharedBlocks failed:', err);
    callback([]);
  });
}

export {
  clearMySharedBlocks,
  listenSharedBlocks,
  removeSharedBlock,
  upsertSharedBlock
};
