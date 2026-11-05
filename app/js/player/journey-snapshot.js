import {
  JOURNEY_FORMAT_VERSION,
  JOURNEY_LOCAL_KEYS,
  validateJourneyEnvelope,
  canonicalJourneyText,
} from './journey-format.js';
import { journeyDigest } from './journey-codec.js';

export async function captureJourneySnapshot({
  store,
  backpackStore,
  storage = localStorage,
  ownerUid,
}) {
  const profile = await store.getProfile(),
    exported = await store.exportData({ ownerUid });
  const { receiptOutbox = [], ...journal } = exported;
  journal.profile ||= profile;
  delete journal.exportedAt;
  const backpack = backpackStore.load();
  if (backpackStore.saveStatus?.() === 'unreadable-save')
    throw Error(
      'Your personal belongings need recovery before account sync. Your saved data is kept.'
    );
  const local = Object.fromEntries(JOURNEY_LOCAL_KEYS.map((key) => [key, storage.getItem(key)]));
  return validateJourneyEnvelope(
    {
      schemaVersion: JOURNEY_FORMAT_VERSION,
      ownerUid,
      journal,
      receiptOutbox,
      deviceState: { backpack, local },
    },
    ownerUid
  );
}

export async function journeyLogicalDigest(envelope) {
  // Device compare-and-swap generations and migration backups are not player
  // outcomes. A restored device receives its own generation from the owner.
  return journeyDigest(new TextEncoder().encode(canonicalJourneyText(envelope)));
}
export function hasPersonalJourney(envelope) {
  const p = envelope.journal.profile,
    b = envelope.deviceState.backpack;
  return !!(
    envelope.journal.events.length ||
    envelope.journal.items.length ||
    envelope.journal.albums?.length ||
    p.journeyPreferences?.introCompletedAt ||
    p.characterState?.creationComplete ||
    b?.housing?.homes?.length ||
    Object.keys(envelope.deviceState.local).some(
      (key) =>
        !['we3d.player-character-gender.v1', 'worldExplorer3D.keyboardBindings.v1'].includes(key) &&
        envelope.deviceState.local[key] !== null
    )
  );
}
function memoryStorage(local) {
  const values = new Map(Object.entries(local).filter(([, value]) => value !== null));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}
function validatePersonalItems(backpack) {
  if (!backpack) return;
  const identities = new Map();
  for (const container of [
    backpack.items,
    ...(backpack.housing?.homes || []).map((home) => home.storage || []),
  ]) {
    const seen = new Set();
    for (const item of container) {
      if (
        !item ||
        typeof item.instanceId !== 'string' ||
        !item.instanceId ||
        seen.has(item.instanceId) ||
        typeof item.catalogId !== 'string' ||
        (identities.has(item.instanceId) && identities.get(item.instanceId) !== item.catalogId)
      )
        throw Error(
          'This personal inventory has inconsistent item identities. Your current save is kept.'
        );
      seen.add(item.instanceId);
      identities.set(item.instanceId, item.catalogId);
    }
  }
  const homes = backpack.housing?.homes || [],
    ids = new Set();
  for (const home of homes) {
    if (
      !home ||
      typeof home.id !== 'string' ||
      !home.id ||
      ids.has(home.id) ||
      !['x', 'y', 'z'].every((key) => Number.isFinite(home[key])) ||
      !Array.isArray(home.storage) ||
      (home.workspace && home.workspace.schemaVersion !== 1) ||
      (home.workspace?.projects && home.workspace.projects.schemaVersion !== 1)
    )
      throw Error(
        'This home save needs recovery or a newer World Explorer. Your current homes are kept.'
      );
    ids.add(home.id);
  }
}
export async function validateJourneyRestore(envelope, { store, ownerUid }) {
  validateJourneyEnvelope(envelope, ownerUid);
  await store.prepareJourneyImport(envelope.journal);
  validatePersonalItems(envelope.deviceState.backpack);
  const local = envelope.deviceState.local,
    storage = memoryStorage(local);
  for (const [key, raw] of Object.entries(local)) {
    if (
      raw === null ||
      key === 'we3d.player-character-gender.v1' ||
      key === 'we3d.ocean.continuous.v1'
    )
      continue;
    try {
      JSON.parse(raw);
    } catch {
      throw Error('A saved journey setting cannot be read. Your current save is kept.');
    }
  }
  if (local['world-explorer:destination-missions:v1'] !== null) {
    const { createDestinationMissionStore } = await import('../universe/mission-authority.js?v=3');
    if (createDestinationMissionStore(storage).status !== 'ready')
      throw Error('Your saved planetary missions need a newer World Explorer.');
  }
  if (local['world-explorer:interstellar-expedition:v1'] !== null) {
    const { createExpeditionStore } = await import('../expedition/store.js?v=12'),
      owner = createExpeditionStore(storage);
    owner.load();
    if (owner.status().protectedRecord)
      throw Error('Your saved expedition needs a newer World Explorer.');
  }
  if (local['worldExplorer3D.worldModifications.v1'] !== null) {
    const { createLocalWorldModificationStore } = await import(
      '../editable-world/local-store.js?v=1'
    );
    if (!createLocalWorldModificationStore({ storage }).initialize().enabled)
      throw Error('Your saved world edits need recovery or a newer World Explorer.');
  }
  for (const key of ['we3d.ocean.voyage.v1', 'we3d.ocean.voyage.v2', 'we3d.ocean.voyage.v3'])
    if (local[key] !== null) {
      const { validateOceanVoyage } = await import('../ocean/voyage-store.js');
      if (!validateOceanVoyage(JSON.parse(local[key])))
        throw Error('Your saved Ocean voyage cannot be resumed by this version.');
    }
  return envelope;
}

export function createJourneyRestoreOwner({
  store,
  backpackStore,
  storage = localStorage,
  isCurrent = () => true,
  readBinding = () => null,
  writeBinding,
  reload = () => location.reload(),
}) {
  const current = () => {
    if (!isCurrent()) throw Error('Your account changed. Your recovery copy is kept.');
  };
  async function writeOwners(envelope, binding, previousOwnerUid = readBinding()?.ownerUid || '') {
    current();
    await validateJourneyRestore(envelope, { store, ownerUid: envelope.ownerUid });
    current();
    await backpackStore.ready;
    current();
    if (!backpackStore.writable())
      throw Error(
        'Close the other World Explorer tab before restoring this journey. Your saves are kept.'
      );
    const backpack = envelope.deviceState.backpack || {
      schemaVersion: 3,
      items: [],
      housing: null,
      commerce: null,
      commerceDeliveries: {},
    };
    if (!backpackStore.restoreJourneySnapshot(backpack))
      throw Error('Your personal belongings could not restore. The recovery copy is kept.');
    await store.importData(envelope.journal, { previousOwnerUid });
    current();
    await store.restoreJourneyReceipts(envelope.receiptOutbox, envelope.ownerUid);
    current();
    for (const key of JOURNEY_LOCAL_KEYS) {
      const raw = envelope.deviceState.local[key] ?? null;
      if (raw === null) storage.removeItem(key);
      else storage.setItem(key, raw);
    }
    writeBinding(binding);
    current();
    await store.writeJourneyRecovery('restore-pending', { phase: 'complete' });
    current();
    reload();
  }
  return Object.freeze({
    async restore(envelope, binding, { archiveKey = 'before-restore' } = {}) {
      current();
      await validateJourneyRestore(envelope, { store, ownerUid: envelope.ownerUid });
      current();
      const source = await captureJourneySnapshot({
        store,
        backpackStore,
        storage,
        ownerUid: readBinding()?.ownerUid || '',
      });
      current();
      await store.writeJourneyRecovery(archiveKey, { envelope: source, binding: readBinding() });
      current();
      await store.writeJourneyRecovery('restore-pending', {
        phase: 'prepared',
        target: envelope,
        binding,
        sourceKey: archiveKey,
        previousOwnerUid: source.ownerUid,
      });
      current();
      return writeOwners(envelope, binding, source.ownerUid);
    },
    pending: () => store.readJourneyRecovery('restore-pending'),
    async finish(marker) {
      return writeOwners(marker.target, marker.binding, marker.previousOwnerUid);
    },
    async rollback(marker, { ownerUid } = {}) {
      const previous = await store.readJourneyRecovery(marker.sourceKey);
      if (!previous?.envelope)
        throw Error(
          'The previous device recovery copy could not be read. Keep this browser data and try again.'
        );
      if (ownerUid && previous.envelope.ownerUid !== ownerUid)
        throw Error(
          'Sign into the account that owns the previous device save before restoring it.'
        );
      return writeOwners(previous.envelope, previous.binding, marker.target.ownerUid);
    },
  });
}
