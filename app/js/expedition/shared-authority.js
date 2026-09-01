import { doc, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { getCurrentUser } from '../../../js/auth-ui.js?v=55';
import { initFirebase } from '../../../js/firebase-init.js?v=56';
import { mutateSharedExpedition } from '../../../js/expedition-api.js?v=1';

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function createSharedExpeditionAuthority(options = {}) {
  const roomCode = String(options.room?.code || options.room?.id || '').trim().toUpperCase();
  const user = getCurrentUser();
  const services = initFirebase();
  if (!roomCode || !user?.uid || !services?.db) return null;
  let disposed = false;
  let latest = null;
  let writeChain = Promise.resolve();
  const expeditionRef = doc(services.db, 'rooms', roomCode, 'expeditions', 'active');
  const unsubscribe = onSnapshot(expeditionRef, (snapshot) => {
    if (disposed) return;
    latest = snapshot.exists() ? clone(snapshot.data() || null) : null;
    options.onState?.(clone(latest));
  }, (error) => options.onError?.(error));

  function enqueue(input) {
    if (disposed) return Promise.reject(new Error('Shared Expedition is closed.'));
    writeChain = writeChain.catch(() => {}).then(() => mutateSharedExpedition({ roomCode, ...input }));
    return writeChain;
  }

  return Object.freeze({
    roomCode,
    userUid: user.uid,
    snapshot: () => clone(latest),
    create: (expedition, role = 'command') => enqueue({ action: 'create', expedition, role }),
    join: (role = '') => enqueue({ action: 'join', role }),
    setReady: (ready = true) => enqueue({ action: 'ready', ready, forceRefreshToken: false }),
    commit: (expedition, mutationKind) => enqueue({
      action: 'commit',
      expedition,
      mutationKind,
      expectedRevision: latest?.revision,
      forceRefreshToken: false
    }),
    rescue: (manifestId) => enqueue({ action: 'rescue', manifestId, forceRefreshToken: false }),
    dispose() {
      if (disposed) return;
      void mutateSharedExpedition({ roomCode, action: 'connection', connected: false, forceRefreshToken: false }).catch(() => {});
      disposed = true;
      unsubscribe();
      latest = null;
    }
  });
}

export { createSharedExpeditionAuthority };
