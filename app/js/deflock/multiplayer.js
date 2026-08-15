import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { claimDeFlockVirtualDisable } from '../../../js/deflock-api.js?v=1';
import { initFirebase } from '../../../js/firebase-init.js';
import { normalizeCode } from '../multiplayer/rooms.js?v=67';

const DEFLOCK_STATE_COLLECTION = 'deflockStates';
const MAX_SHARED_DISABLES = 750;

function listenDeFlockRoomState(roomCode, callback, options = {}) {
  if (typeof callback !== 'function') return () => {};
  const normalizedRoomCode = normalizeCode(roomCode);
  const services = initFirebase();
  if (!normalizedRoomCode || !services?.db) {
    callback([]);
    return () => {};
  }
  const stateQuery = query(
    collection(services.db, 'rooms', normalizedRoomCode, DEFLOCK_STATE_COLLECTION),
    orderBy('createdAt', 'asc'),
    limit(MAX_SHARED_DISABLES)
  );
  return onSnapshot(stateQuery, (snapshot) => {
    const entries = [];
    snapshot.forEach((docSnapshot) => {
      const data = docSnapshot.data() || {};
      const sourceId = String(data.sourceId || '').slice(0, 120);
      if (!/^osm:node:\d{1,18}$/.test(sourceId)) return;
      entries.push({
        id: docSnapshot.id,
        sourceId,
        uid: String(data.uid || '').slice(0, 160),
        displayName: String(data.displayName || 'Explorer').slice(0, 48),
        action: 'virtually_disabled',
        createdAt: data.createdAt || null
      });
    });
    callback(entries);
  }, (error) => {
    console.warn('[deflock][multiplayer] room state listener failed.', error);
    options.onError?.(error);
  });
}

async function claimSharedVirtualDisable(roomCode, sourceId) {
  return claimDeFlockVirtualDisable({ roomCode, sourceId });
}

export {
  DEFLOCK_STATE_COLLECTION,
  MAX_SHARED_DISABLES,
  claimSharedVirtualDisable,
  listenDeFlockRoomState
};
