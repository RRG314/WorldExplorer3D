import { doc, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { getCurrentUser } from '../../../js/auth-ui.js?v=55';
import { initFirebase } from '../../../js/firebase-init.js?v=57';
import { saveExplorerPlayerCondition } from '../../../js/player-state-api.js?v=1';

function createConnectedPlayerState(options = {}) {
  const user = getCurrentUser();
  const services = initFirebase();
  const conditionAuthority = options.conditionAuthority;
  const vehicleUpgradeStore = options.vehicleUpgradeStore;
  if (!user?.uid || !services?.db || !conditionAuthority?.snapshot || !vehicleUpgradeStore?.snapshot) return null;
  let disposed = false;
  let conditionLoaded = false;
  let upgradesLoaded = false;
  let saveTimer = 0;
  let pendingCondition = null;
  let stopCondition = null;
  let stopUpgrades = null;

  const flushCondition = async () => {
    saveTimer = 0;
    if (disposed || !pendingCondition) return;
    const change = pendingCondition;
    pendingCondition = null;
    try {
      await saveExplorerPlayerCondition({ condition: change.after, reason: change.reason });
    } catch (error) {
      pendingCondition = change;
      options.onError?.(error);
    }
  };

  const queueCondition = (change) => {
    if (disposed) return;
    pendingCondition = change;
    clearTimeout(saveTimer);
    saveTimer = globalThis.setTimeout?.(flushCondition, 180) || 0;
  };

  const stopConditionChanges = conditionAuthority.subscribe(queueCondition);
  const api = Object.freeze({
    type: 'ConnectedExplorerPlayerState',
    uid: user.uid,
    snapshot: () => Object.freeze({
      authority: 'explorer-player-state-v1',
      uid: user.uid,
      pending: !conditionLoaded || !upgradesLoaded,
      condition: conditionAuthority.snapshot(),
      vehicles: vehicleUpgradeStore.exportState()
    }),
    dispose() {
      if (disposed) return;
      disposed = true;
      clearTimeout(saveTimer);
      stopConditionChanges?.();
      stopCondition?.();
      stopUpgrades?.();
    }
  });

  stopCondition = onSnapshot(doc(services.db, 'users', user.uid, 'gameplay', 'condition'), (snapshot) => {
    if (disposed) return;
    const data = snapshot.exists() ? snapshot.data() : null;
    conditionLoaded = true;
    if (Number.isFinite(Number(data?.condition))) {
      conditionAuthority.hydrate(Number(data.condition));
    } else {
      queueCondition({ after: conditionAuthority.snapshot().condition, reason: 'signed-in-initialization' });
    }
    options.onChange?.(api.snapshot());
  }, (error) => options.onError?.(error));

  stopUpgrades = onSnapshot(doc(services.db, 'users', user.uid, 'gameplay', 'vehicleUpgrades'), (snapshot) => {
    if (disposed) return;
    const data = snapshot.exists() ? snapshot.data() : null;
    upgradesLoaded = true;
    if (data?.vehicles && typeof data.vehicles === 'object') vehicleUpgradeStore.hydrate(data.vehicles);
    options.onChange?.(api.snapshot());
  }, (error) => options.onError?.(error));

  return api;
}

export { createConnectedPlayerState };
