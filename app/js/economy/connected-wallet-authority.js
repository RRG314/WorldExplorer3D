import { doc, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { getCurrentUser } from '../../../js/auth-ui.js?v=55';
import { initFirebase } from '../../../js/firebase-init.js?v=57';
import { commitExplorerCommerceAction, settleExplorerCommerceOutcome } from '../../../js/economy-api.js?v=3';

const STARTING_CREDITS = 1_000_000;
const CURRENCY_VERSION = 2;
const LEGACY_CURRENCY_SCALE = 2000;

function createConnectedExplorerWallet(options = {}) {
  const user = getCurrentUser();
  const services = initFirebase();
  if (!user?.uid || !services?.db) return null;
  let disposed = false;
  const listeners = new Set();
  if (typeof options.onChange === 'function') listeners.add(options.onChange);
  let state = Object.freeze({ authority: 'explorer-wallet-v2', credits: STARTING_CREDITS, pending: true, revision: 0, currencyVersion: CURRENCY_VERSION });
  const stop = onSnapshot(doc(services.db, 'users', user.uid, 'economy', 'wallet'), (snapshot) => {
    if (disposed) return;
    const data = snapshot.exists() ? snapshot.data() : {};
    const scale = snapshot.exists() && Number(data.currencyVersion || 0) < CURRENCY_VERSION ? LEGACY_CURRENCY_SCALE : 1;
    state = Object.freeze({
      authority: 'explorer-wallet-v2',
      credits: Math.max(0, Number(data.credits ?? STARTING_CREDITS) * scale),
      pending: false,
      revision: Math.max(0, Number(data.revision || 0)),
      currencyVersion: CURRENCY_VERSION
    });
    listeners.forEach((listener) => listener(state));
  }, (error) => options.onError?.(error));

  return Object.freeze({
    type: 'ConnectedExplorerWallet',
    uid: user.uid,
    snapshot: () => state,
    subscribe(listener) {
      if (typeof listener !== 'function' || disposed) return () => {};
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
    async transact(action, store, catalogId, fields = {}) {
      if (disposed) return Object.freeze({ accepted: false, reason: 'wallet_unavailable', credits: state.credits });
      const requestId = `commerce:${user.uid.slice(0, 18)}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 9)}`;
      return commitExplorerCommerceAction({
        action, requestId, storeId: store.id, catalogId,
        targetId: String(fields.targetId || ''),
        dayKey: String(fields.dayKey || new Date().toISOString().slice(0, 10))
      });
    },
    async settle(receipt, outcome, reason = '') {
      if (disposed || !receipt?.requestId) {
        return Object.freeze({ settlementStatus: 'pending_recovery', credits: state.credits });
      }
      return settleExplorerCommerceOutcome({ requestId: receipt.requestId, outcome, reason });
    },
    dispose() { if (!disposed) { disposed = true; listeners.clear(); stop(); } }
  });
}

export { createConnectedExplorerWallet };
