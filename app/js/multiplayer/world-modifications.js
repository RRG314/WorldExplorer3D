import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { getCurrentUser } from '../../../js/auth-ui.js?v=55';
import { initFirebase } from '../../../js/firebase-init.js?v=56';
import {
  createRoomModificationRecord,
  editableRoomPermissions,
  resolveEditableRoomRole,
  reviseRoomModificationRecord,
  ROOM_MODIFICATION_RESULT_LIMIT,
  roomWorldModificationIdentity
} from '../editable-world/room-model.js?v=1';

const ROOM_COLLECTION = 'rooms';
const MODIFICATION_COLLECTION = 'worldModifications';

function services() {
  const { db } = initFirebase();
  if (!db) throw new Error('Firestore is not configured.');
  const user = getCurrentUser();
  if (!user?.uid) throw new Error('Sign in is required for shared world editing.');
  return { db, user };
}

function recordFromSnapshot(snapshot) {
  const data = snapshot?.data?.();
  if (!data || typeof data !== 'object') return null;
  return {
    id: String(data.id || snapshot.id),
    worldId: String(data.worldId || ''),
    worldSeed: String(data.worldSeed || ''),
    kind: data.kind === 'object' ? 'object' : 'suppression',
    sourceFeatureId: String(data.sourceFeatureId || ''),
    objectId: String(data.objectId || ''),
    objectType: String(data.objectType || 'none'),
    catalogId: String(data.catalogId || 'none'),
    materialId: String(data.materialId || 'none'),
    transform: data.transform || null,
    active: data.active === true,
    createdBy: String(data.createdBy || ''),
    updatedBy: String(data.updatedBy || ''),
    revision: Number(data.revision || 0),
    history: Array.isArray(data.history) ? data.history.slice(-20) : []
  };
}

async function commitRoomModification(room, options = {}) {
  const { db, user } = services();
  const role = resolveEditableRoomRole(room, user.uid);
  const permissions = editableRoomPermissions(role);
  if (options.kind === 'suppression' && !permissions.suppressBaseStructures) {
    throw new Error('Only the room owner or a room moderator can virtually remove mapped structures.');
  }
  if (options.kind === 'object' && !permissions.placeObjects) {
    throw new Error('Builder permission is required.');
  }
  const worldId = roomWorldModificationIdentity(room);
  const initial = createRoomModificationRecord({
    ...options,
    worldId,
    worldSeed: room.world?.seed,
    actorId: user.uid,
    revision: 1
  });
  const reference = doc(db, ROOM_COLLECTION, room.id, MODIFICATION_COLLECTION, initial.id);
  return runTransaction(db, async (transaction) => {
    const currentSnapshot = await transaction.get(reference);
    const current = currentSnapshot.exists() ? recordFromSnapshot(currentSnapshot) : null;
    let next = initial;
    if (current) {
      if (options.kind === 'object' && current.createdBy !== user.uid && !permissions.editOtherObjects) {
        throw new Error('Only the object creator or room managers can edit this structure.');
      }
      const revised = reviseRoomModificationRecord(current, {
        active: options.active,
        action: options.active === false ? 'restore' : options.action || 'update',
        actorId: user.uid,
        expectedRevision: Number(options.expectedRevision ?? current.revision),
        transform: options.transform
      });
      if (!revised.committed) throw new Error('This object changed in another session. Refresh and try again.');
      next = revised.current;
    }
    transaction.set(reference, {
      ...next,
      createdAt: currentSnapshot.exists() ? currentSnapshot.data().createdAt : serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return next;
  });
}

async function suppressRoomBuilding(room, sourceFeatureId, options = {}) {
  return commitRoomModification(room, {
    kind: 'suppression',
    sourceFeatureId,
    active: true,
    action: 'suppress',
    expectedRevision: options.expectedRevision
  });
}

async function restoreRoomBuilding(room, sourceFeatureId, options = {}) {
  return commitRoomModification(room, {
    kind: 'suppression',
    sourceFeatureId,
    active: false,
    action: 'restore',
    expectedRevision: options.expectedRevision
  });
}

async function resetRoomWorldModifications(room) {
  const { db, user } = services();
  const permissions = editableRoomPermissions(resolveEditableRoomRole(room, user.uid));
  if (!permissions.resetWorld) throw new Error('Only the room owner or a room moderator can restore the room base world.');
  const snapshots = await getDocs(query(
    collection(db, ROOM_COLLECTION, room.id, MODIFICATION_COLLECTION),
    limit(ROOM_MODIFICATION_RESULT_LIMIT)
  ));
  const active = snapshots.docs.filter((snapshot) => snapshot.data()?.active === true);
  if (active.length === 0) return 0;
  await runTransaction(db, async (transaction) => {
    const freshSnapshots = [];
    for (const snapshot of active) {
      freshSnapshots.push(await transaction.get(snapshot.ref));
    }
    for (const fresh of freshSnapshots) {
      if (!fresh.exists() || fresh.data().active !== true) continue;
      const current = recordFromSnapshot(fresh);
      const revised = reviseRoomModificationRecord(current, {
        active: false,
        action: 'reset',
        actorId: user.uid,
        expectedRevision: current.revision
      });
      transaction.update(fresh.ref, {
        active: false,
        updatedBy: user.uid,
        revision: revised.current.revision,
        history: revised.current.history,
        updatedAt: serverTimestamp()
      });
    }
  });
  return active.length;
}

function listenRoomWorldModifications(room, callback, options = {}) {
  if (typeof callback !== 'function' || !room?.id) return () => {};
  let db;
  try {
    ({ db } = services());
  } catch (error) {
    options.onError?.(error);
    callback([]);
    return () => {};
  }
  const worldId = roomWorldModificationIdentity(room);
  const result = query(
    collection(db, ROOM_COLLECTION, room.id, MODIFICATION_COLLECTION),
    limit(ROOM_MODIFICATION_RESULT_LIMIT)
  );
  return onSnapshot(result, (snapshot) => {
    const rows = snapshot.docs.map(recordFromSnapshot).filter((record) => record?.worldId === worldId);
    rows.sort((a, b) => a.id.localeCompare(b.id));
    callback(rows);
  }, (error) => options.onError?.(error));
}

export {
  listenRoomWorldModifications,
  resetRoomWorldModifications,
  restoreRoomBuilding,
  suppressRoomBuilding
};
