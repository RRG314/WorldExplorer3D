import { doc, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { getCurrentUser } from '../../../js/auth-ui.js?v=56';
import { initFirebase } from '../../../js/firebase-init.js?v=58';
import { saveExplorerPlayerCondition } from '../../../js/player-state-api.js?v=1';
import {createConditionSync} from './condition-sync.js';

function createConnectedPlayerState(options = {}) {
  const user = getCurrentUser();
  const services = initFirebase();
  const conditionAuthority = options.conditionAuthority;
  const vehicleUpgradeStore = options.vehicleUpgradeStore;
  if (!user?.uid || !services?.db || !conditionAuthority?.snapshot || !vehicleUpgradeStore?.snapshot) return null;
  let disposed = false;
  let conditionLoaded = false;
  let upgradesLoaded = false;
  let stopCondition = null;
  let stopUpgrades = null;
  const isCurrent=()=>!disposed&&getCurrentUser()?.uid===user.uid;
  const sync=createConditionSync({uid:user.uid,isCurrent,
    send:command=>saveExplorerPlayerCondition({...command,expectedUserId:user.uid}),
    onConfirmed:state=>{
      if (!isCurrent()) return;
      conditionAuthority.hydrate(state.condition, 'confirmed-account-save');
      options.onChange?.(api.snapshot());
    },
    onState:()=>options.onChange?.(api.snapshot()),onError:options.onError});
  const stopConditionChanges = conditionAuthority.subscribe(sync.queue);
  const api = Object.freeze({
    type: 'ConnectedExplorerPlayerState',
    uid: user.uid,
    snapshot: () => Object.freeze({
      authority: 'explorer-player-state-v1',
      uid: user.uid,
      pending: !conditionLoaded || !upgradesLoaded || sync.snapshot().pending,
      sync: sync.snapshot(),
      condition: conditionAuthority.snapshot(),
      vehicles: vehicleUpgradeStore.exportState()
    }),
    retry: sync.retry,
    dispose() {
      if (disposed) return;
      disposed = true;
      sync.dispose();
      stopConditionChanges?.();
      stopCondition?.();
      stopUpgrades?.();
    }
  });

  stopCondition = onSnapshot(doc(services.db, 'users', user.uid, 'gameplay', 'condition'), async (snapshot) => {
    await sync.whenInitialized();
    if (!isCurrent()) return;
    const data = snapshot.exists() ? snapshot.data() : null;
    conditionLoaded = true;
    const mayHydrate=sync.accept(data);
    if (!mayHydrate) {
      const retained=sync.snapshot().latestCondition;
      if(Number.isFinite(retained))conditionAuthority.hydrate(retained,'pending-account-save');
    } else if (Number.isFinite(Number(data?.condition))) {
      conditionAuthority.hydrate(Number(data.condition));
    } else {
      sync.queue({ after: conditionAuthority.snapshot().condition, reason: 'signed-in-initialization' });
    }
    options.onChange?.(api.snapshot());
  }, (error) => { if (isCurrent()) options.onError?.(error); });

  stopUpgrades = onSnapshot(doc(services.db, 'users', user.uid, 'gameplay', 'vehicleUpgrades'), (snapshot) => {
    if (!isCurrent()) return;
    const data = snapshot.exists() ? snapshot.data() : null;
    upgradesLoaded = true;
    if (data?.vehicles && typeof data.vehicles === 'object') vehicleUpgradeStore.hydrate(data.vehicles);
    options.onChange?.(api.snapshot());
  }, (error) => { if (isCurrent()) options.onError?.(error); });

  return api;
}

export { createConnectedPlayerState };
