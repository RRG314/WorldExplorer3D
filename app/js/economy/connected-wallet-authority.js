import { doc, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { getCurrentUser } from '../../../js/auth-ui.js?v=56';
import { initFirebase } from '../../../js/firebase-init.js?v=58';
import { commitExplorerCommerceAction, settleExplorerCommerceOutcome } from '../../../js/economy-api.js?v=3';

import { projectExplorerWallet } from './wallet-snapshot.js';

function createConnectedExplorerWallet(options = {}) {
  const user = getCurrentUser();
  const services = initFirebase();
  if (!user?.uid || !services?.db) return null;
  let disposed = false;
  const isCurrent = () => !disposed && getCurrentUser()?.uid === user.uid;
  const listeners = new Set();
  if (typeof options.onChange === 'function') listeners.add(options.onChange);
  let state = projectExplorerWallet({}, { pending: true });
  const stop = onSnapshot(doc(services.db, 'users', user.uid, 'economy', 'wallet'), (snapshot) => {
    if (!isCurrent()) return;
    state = projectExplorerWallet(snapshot.exists() ? snapshot.data() : {}, { exists: snapshot.exists() });
    listeners.forEach((listener) => listener(state));
  }, (error) => { if (isCurrent()) options.onError?.(error); });

  return Object.freeze({
    type: 'ConnectedExplorerWallet',
    uid: user.uid,
    snapshot: () => state,
    subscribe(listener) {
      if (typeof listener !== 'function' || !isCurrent()) return () => {};
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
    async transact(action, store, catalogId, fields = {}) {
      if (!isCurrent()) return Object.freeze({ accepted: false, reason: 'wallet_unavailable', credits: state.credits });
      const requestId = `commerce:${user.uid.slice(0, 18)}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 9)}`;
      return commitExplorerCommerceAction({
        action, requestId, storeId: store.id, catalogId, expectedUserId: user.uid,
        targetId: String(fields.targetId || ''),
        dayKey: String(fields.dayKey || new Date().toISOString().slice(0, 10))
      });
    },
    async settle(receipt, outcome, reason = '') {
      if (!isCurrent() || !receipt?.requestId) {
        return Object.freeze({ settlementStatus: 'pending_recovery', credits: state.credits });
      }
      return settleExplorerCommerceOutcome({ requestId: receipt.requestId, outcome, reason, expectedUserId: user.uid });
    },
    dispose() { if (!disposed) { disposed = true; listeners.clear(); stop(); } }
  });
}

export { createConnectedExplorerWallet };
