import {supportRecorder} from '../runtime/support-receipt.js';
import { normalizeCameraFavorites } from '../live-earth/public-camera-directory.js';
import { validateJournalBackup } from './backup-validation.js?v=1';
import { summarizeReceiptState } from './save-status.js?v=1';
import { awardCompanionXp, normalizeCompanionProgression } from './companions.js?v=7';
import { pendingDiscoveryReceipt } from './receipt-outbox.js?v=1';
import { JOURNAL_ORDER_STORE, installJournalOrder, rebuildJournalOrder, putJournalOrder,
  recentJournalRows, readyJournalReceipts, compareJournalRows, journalPageSize } from './journal-index.js';
import {
  createExplorerEvent,
  createExplorerStoryEvent,
  defaultExplorerProgress,
  normalizeExplorerProgress,
  progressCreditForDiscovery,
  projectExplorerProgress,
  projectExplorerStoryProgress
} from './explorer-events.js?v=3';
import { createDefaultCharacterState, normalizeCharacterState } from '../character/model.js?v=1';
import { migrateLegacyCharacterState, projectCharacterProgress } from '../character/progression.js?v=1';

const DISCOVERY_DB_NAME = 'world-explorer-discovery';
const DISCOVERY_DB_VERSION = 5;
const PROFILE_ID = 'local-explorer';
const JOURNAL_IMPORT_BACKUP_ID = 'journal-before-import:local-explorer';
const JOURNAL_STORES = ['profiles', 'items', 'claims', 'fieldGuide', 'companions', 'events', 'migrationBackups', 'receiptOutbox'];
const JOURNAL_TRANSACTION_STORES = [...JOURNAL_STORES, JOURNAL_ORDER_STORE];
const CHARACTER_MIGRATION_BACKUP_ID = 'character-v1:local-explorer';

function normalizeCompanionOnboarding(source = {}) {
  return {
    schemaVersion: 1,
    starterDogGranted: source.starterDogGranted === true,
    starterDogInstanceId: String(source.starterDogInstanceId || '').slice(0, 180),
    starterDogGrantedAt: Math.max(0, Number(source.starterDogGrantedAt) || 0),
    starterDogFirstNamedAt: Math.max(0, Number(source.starterDogFirstNamedAt) || 0),
    primaryHomeId: String(source.primaryHomeId || '').slice(0, 420)
  };
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function projectFieldGuideEntry(existingGuide, record, now, regionId) {
  const existingRegions = Array.isArray(existingGuide?.regions) ? existingGuide.regions : [];
  const evidenceContractIds = [...new Set([
    ...(existingGuide?.evidenceContractIds || []),
    record.evidenceContractId
  ].filter(Boolean))];
  return {
    catalogId: record.catalogId,
    name: record.name || record.catalogId,
    family: record.family || 'discovery',
    firstObservedAt: Number(existingGuide?.firstObservedAt) || now,
    lastObservedAt: now,
    observations: Number(existingGuide?.observations || 0) + 1,
    evidenceClass: record.evidenceClass || 'virtual-field-record',
    evidenceContractIds,
    regionalPackId: record.regionalPackId || existingGuide?.regionalPackId || null,
    regionalPackVersion: record.regionalPackVersion || existingGuide?.regionalPackVersion || null,
    stableTaxonId: record.stableTaxonId || existingGuide?.stableTaxonId || null,
    taxonGroup: record.taxonGroup || existingGuide?.taxonGroup || null,
    fishingAuthorityVersion: record.evidencePayload?.fishingAuthorityVersion || existingGuide?.fishingAuthorityVersion || null,
    populationEvidence: record.evidencePayload?.populationEvidence || existingGuide?.populationEvidence || null,
    livePresenceClaim: typeof record.evidencePayload?.livePresenceClaim === 'boolean'
      ? record.evidencePayload.livePresenceClaim
      : existingGuide?.livePresenceClaim === true,
    sourceRefs: clone(record.sourceRefs || existingGuide?.sourceRefs || []),
    geologyEvidence: clone(record.evidencePayload?.geologyEvidence || existingGuide?.geologyEvidence || null),
    regions: [...new Set([...existingRegions, regionId])],
    regionLabels: [...new Set([...(existingGuide?.regionLabels || []), String(record.regionLabel || 'Current region')])]
  };
}

function createDefaultProfile() {
  return {
    id: PROFILE_ID,
    schemaVersion: DISCOVERY_DB_VERSION,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    equippedToolId: 'metal-detector',
    favoriteToolIds: ['metal-detector', 'field-lens', 'field-camera'],
    publicCameraFavorites: [],
    activeCompanionId: null,
    companionOnboarding: normalizeCompanionOnboarding(),
    tutorials: {},
    disciplineProgress: {
      exploration: { discoveries: 0, regions: [] },
      nature: { discoveries: 0, regions: [] },
      'earth-science': { discoveries: 0, regions: [] },
      'history-service': { discoveries: 0, regions: [] },
      creation: { discoveries: 0, regions: [] }
    },
    toolMastery: {},
    collectionCount: 0,
    fieldGuideCount: 0,
    explorerProgress: defaultExplorerProgress(),
    characterState: createDefaultCharacterState()
  };
}

function normalizeProfile(profile) {
  const base = createDefaultProfile();
  return {
    ...base,
    ...(profile || {}),
    favoriteToolIds: Array.isArray(profile?.favoriteToolIds) ? profile.favoriteToolIds.slice(0, 6) : base.favoriteToolIds,
    publicCameraFavorites: normalizeCameraFavorites(profile?.publicCameraFavorites),
    tutorials: { ...base.tutorials, ...(profile?.tutorials || {}) },
    disciplineProgress: { ...base.disciplineProgress, ...(profile?.disciplineProgress || {}) },
    toolMastery: { ...(profile?.toolMastery || {}) },
    companionOnboarding: normalizeCompanionOnboarding(profile?.companionOnboarding),
    explorerProgress: normalizeExplorerProgress(profile?.explorerProgress),
    characterState: normalizeCharacterState(profile?.characterState),
    schemaVersion: DISCOVERY_DB_VERSION,
    updatedAt: Date.now()
  };
}

// Updaters run synchronously inside the read/write transaction against its
// latest profile. UI preference changes must not overwrite intervening rewards.
function resolveProfileUpdate(current, update) {
  const next = typeof update === 'function' ? update(clone(current)) : update;
  if (!next || typeof next !== 'object' || typeof next.then === 'function') {
    throw new TypeError('Profile updates must return a synchronous profile object.');
  }
  return normalizeProfile({ ...next, characterState: next.characterState || current.characterState });
}

function fieldCompanionReward(companion, event, firstIdentification) {
  const first = awardCompanionXp(companion, { receiptId: `field:${event.eventId}`, reasonId: 'field-activity' });
  return clone(firstIdentification
    ? awardCompanionXp(first.companion, { receiptId: `species:${event.eventId}`, reasonId: 'new-species' }).companion
    : first.companion);
}

function validateReceipt(item, receipt) {
  if (!receipt?.itemId || !receipt.ownerUid || receipt.claimId !== item.claimId || receipt.catalogId !== item.catalogId
    || !['trusted-server', 'server-receipt'].includes(receipt.authority)) throw Object.assign(new TypeError('Receipt does not match the local discovery.'), {status:422});
}

function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
  });
}

function transactionPromise(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve(true);
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted.'));
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed.'));
  });
}

function openDiscoveryDatabase(indexedDB = globalThis.indexedDB) {
  if (!indexedDB?.open) return Promise.reject(new Error('IndexedDB is unavailable.'));
  return new Promise((resolve, reject) => {
    let blocked = false;
    const request = indexedDB.open(DISCOVERY_DB_NAME, DISCOVERY_DB_VERSION);
    request.onblocked = () => { blocked = true; reject(new Error('Close or reload other World Explorer tabs to update Journal storage.')); };
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('receiptOutbox')) {
        const outbox = db.createObjectStore('receiptOutbox', { keyPath: 'id' });
        outbox.createIndex('ownerUid', 'ownerUid', { unique: false });
      }
      if (!db.objectStoreNames.contains('profiles')) db.createObjectStore('profiles', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('items')) {
        const items = db.createObjectStore('items', { keyPath: 'instanceId' });
        items.createIndex('catalogId', 'catalogId', { unique: false });
        items.createIndex('collectedAt', 'collectedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains('claims')) db.createObjectStore('claims', { keyPath: 'claimId' });
      if (!db.objectStoreNames.contains('fieldGuide')) db.createObjectStore('fieldGuide', { keyPath: 'catalogId' });
      if (!db.objectStoreNames.contains('companions')) db.createObjectStore('companions', { keyPath: 'instanceId' });
      if (!db.objectStoreNames.contains('events')) {
        const events = db.createObjectStore('events', { keyPath: 'eventId' });
        events.createIndex('occurredAt', 'occurredAt', { unique: false });
        events.createIndex('regionId', 'regionId', { unique: false });
        events.createIndex('eventType', 'eventType', { unique: false });
      }
      if (!db.objectStoreNames.contains('migrationBackups')) db.createObjectStore('migrationBackups', { keyPath: 'id' });
      installJournalOrder(db, request.transaction);
    };
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) { db.close(); return; }
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error || new Error('Could not open discovery database.'));
  });
}

async function ensureIndexedDbCharacterMigration(db) {
  const transaction = db.transaction(['profiles', 'events', 'fieldGuide', 'companions', 'migrationBackups'], 'readwrite');
  const profiles = transaction.objectStore('profiles');
  const backups = transaction.objectStore('migrationBackups');
  const storedProfile = await requestPromise(profiles.get(PROFILE_ID));
  if (!storedProfile) {
    const profile = createDefaultProfile();
    profiles.put(profile);
    await transactionPromise(transaction);
    return profile;
  }
  if (storedProfile.characterState?.schemaVersion === 1) {
    await transactionPromise(transaction);
    return normalizeProfile(storedProfile);
  }
  const [events, fieldGuide, companions, existingBackup] = await Promise.all([
    requestPromise(transaction.objectStore('events').getAll()),
    requestPromise(transaction.objectStore('fieldGuide').getAll()),
    requestPromise(transaction.objectStore('companions').getAll()),
    requestPromise(backups.get(CHARACTER_MIGRATION_BACKUP_ID))
  ]);
  const backedUpAt = Number(existingBackup?.backedUpAt) || Date.now();
  if (!existingBackup) {
    backups.put({
      id: CHARACTER_MIGRATION_BACKUP_ID,
      backedUpAt,
      sourceProfileSchemaVersion: Number(storedProfile.schemaVersion) || 0,
      profile: clone(storedProfile)
    });
  }
  const characterState = migrateLegacyCharacterState({
    profile: storedProfile,
    events,
    fieldGuide,
    companions,
    backupAvailable: true,
    now: backedUpAt
  });
  const profile = normalizeProfile({ ...storedProfile, characterState });
  profiles.put(profile);
  await transactionPromise(transaction);
  return profile;
}

function createIndexedDbDiscoveryProfileStore(options = {}) {
  options = { ...options };
  const open = () => openDiscoveryDatabase(options.indexedDB);
  let characterMigrationReady = false;
  let characterMigrationPromise = null;

  async function ensureCharacterMigration(db) {
    if (characterMigrationReady) return true;
    if (!characterMigrationPromise) {
      characterMigrationPromise = ensureIndexedDbCharacterMigration(db).then(() => {
        characterMigrationReady = true;
        return true;
      }).finally(() => {
        characterMigrationPromise = null;
      });
    }
    return characterMigrationPromise;
  }

  async function loadRuntimeBootstrap() {
    const db = await open();
    try {
      await ensureCharacterMigration(db);
      const transaction = db.transaction(['profiles', 'items', 'fieldGuide', 'claims'], 'readonly');
      const [profile, items, observedCatalogIds, claimedIds] = await Promise.all([
        requestPromise(transaction.objectStore('profiles').get(PROFILE_ID)),
        requestPromise(transaction.objectStore('items').getAll()),
        requestPromise(transaction.objectStore('fieldGuide').getAllKeys()),
        requestPromise(transaction.objectStore('claims').getAllKeys())
      ]);
      await transactionPromise(transaction);
      return {
        profile: normalizeProfile(profile),
        items: items.sort((a, b) => compareJournalRows('items', a, b)),
        claimedIds,
        observedCatalogIds
      };
    } finally {
      db.close();
    }
  }

  async function getProfile() {
    const db = await open();
    try {
      await ensureCharacterMigration(db);
      const transaction = db.transaction(['profiles'], 'readonly');
      const profile = await requestPromise(transaction.objectStore('profiles').get(PROFILE_ID));
      await transactionPromise(transaction);
      return normalizeProfile(profile);
    } finally {
      db.close();
    }
  }

  async function saveProfile(nextProfile) {
    const db = await open();
    try {
      await ensureCharacterMigration(db);
      const transaction = db.transaction(['profiles'], 'readwrite');
      const store = transaction.objectStore('profiles');
      const current = normalizeProfile(await requestPromise(store.get(PROFILE_ID)));
      const profile = resolveProfileUpdate(current, nextProfile);
      store.put(profile);
      await transactionPromise(transaction);
      return clone(profile);
    } finally {
      db.close();
    }
  }

  async function hasClaim(claimId) {
    const db = await open();
    try {
      const transaction = db.transaction(['claims'], 'readonly');
      const claim = await requestPromise(transaction.objectStore('claims').get(String(claimId)));
      await transactionPromise(transaction);
      return !!claim;
    } finally {
      db.close();
    }
  }

  async function recordDiscovery(record, policy = {}) {
    if (!record?.claimId || !record?.catalogId) throw new TypeError('Discovery recording requires stable claim and catalog IDs.');
    const receiptOwnerUid = options.getReceiptOwnerUid?.() || null;
    const collection = policy.collection === true;
    if (collection && !record?.instanceId) throw new TypeError('Collected discoveries require a stable instance ID.');
    const db = await open();
    let transactionToAbort;
    try {
      await ensureCharacterMigration(db);
      const transaction = transactionToAbort = db.transaction(['profiles', 'items', 'claims', 'fieldGuide', 'events', 'receiptOutbox', 'companions', JOURNAL_ORDER_STORE], 'readwrite');
      const profiles = transaction.objectStore('profiles');
      const items = transaction.objectStore('items');
      const claims = transaction.objectStore('claims');
      const fieldGuide = transaction.objectStore('fieldGuide');
      const events = transaction.objectStore('events');
      const existingClaim = await requestPromise(claims.get(record.claimId));
      if (existingClaim) {
        await transactionPromise(transaction);
        return {
          recorded: false,
          collected: false,
          reason: 'already-claimed',
          item: clone(existingClaim.item || null),
          event: clone(existingClaim.event || null)
        };
      }
      const current = normalizeProfile(await requestPromise(profiles.get(PROFILE_ID)));
      const existingGuide = await requestPromise(fieldGuide.get(record.catalogId));
      const now = Number(record.collectedAt) || Date.now();
      const regionId = String(record.regionId || record.worldIdentity || 'local-region');
      const existingRegions = Array.isArray(existingGuide?.regions) ? existingGuide.regions : [];
      const credit = progressCreditForDiscovery({
        firstIdentification: !existingGuide,
        newRegion: !!existingGuide && !existingRegions.includes(regionId)
      });
      const projected = projectExplorerProgress(current.explorerProgress, record, credit);
      const item = collection ? { ...clone(record), collectedAt: now, authority: 'anonymous-local', tradeable: false } : null;
      const event = createExplorerEvent({ ...record, collectedAt: now }, {
        collection,
        resolution: collection ? 'collected' : 'recorded',
        progress: { points: projected.points, reason: projected.reason }
      });
      const characterProjection = projectCharacterProgress(current.characterState, event, {
        noveltyReason: projected.reason,
        meaningful: true,
        explorerPointsBefore: current.explorerProgress.points,
        explorerPointsAfter: projected.progress.points
      });
      const discipline = String(record.discipline || 'exploration');
      const disciplineProgress = { ...(current.disciplineProgress[discipline] || { discoveries: 0, regions: [] }) };
      disciplineProgress.discoveries = Number(disciplineProgress.discoveries || 0) + 1;
      disciplineProgress.regions = [...new Set([...(disciplineProgress.regions || []), regionId])];
      const profile = normalizeProfile({
        ...current,
        collectionCount: Number(current.collectionCount || 0) + (collection ? 1 : 0),
        fieldGuideCount: Number(current.fieldGuideCount || 0) + (existingGuide ? 0 : 1),
        disciplineProgress: { ...current.disciplineProgress, [discipline]: disciplineProgress },
        explorerProgress: projected.progress,
        characterState: characterProjection.character
      });
      if (item) {
        items.put(item);
        const pending = pendingDiscoveryReceipt(item, receiptOwnerUid, options.catalogVersion);
        if (pending) {
          transaction.objectStore('receiptOutbox').put(pending);
          putJournalOrder(transaction, 'receiptOutbox', pending);
        }
        const queued = await requestPromise(transaction.objectStore(JOURNAL_ORDER_STORE).index('receiptInstance').count(['receiptOutbox', item.instanceId]));
        putJournalOrder(transaction, 'items', item, queued > 0);
      }
      // Companion credit belongs to the same commit as the field record. A
      // reload after this transaction cannot lose or duplicate its reward.
      if (current.activeCompanionId && !record.receiptRestore) {
        const companionStore = transaction.objectStore('companions');
        const companion = await requestPromise(companionStore.get(current.activeCompanionId));
        if (companion) companionStore.put(fieldCompanionReward(companion, event, !existingGuide));
      }
      events.put(event);
      putJournalOrder(transaction, 'events', event);
      claims.put({ claimId: record.claimId, claimedAt: now, item, event });
      const guideEntry = projectFieldGuideEntry(existingGuide, record, now, regionId);
      fieldGuide.put(guideEntry);
      putJournalOrder(transaction, 'fieldGuide', guideEntry);
      profiles.put(profile);
      await transactionPromise(transaction);
      return {
        recorded: true,
        collected: collection,
        item: clone(item),
        event: clone(event),
        profile: clone(profile),
        progress: { points: projected.points, reason: projected.reason, specialtyId: projected.specialtyId },
        characterReward: clone(characterProjection.reward)
      };
    } catch (error) {
      supportRecorder.record({operation:'journal-save',error});
      try { transactionToAbort?.abort(); } catch { /* Already committed or aborted. */ }
      throw error;
    } finally {
      db.close();
    }
  }

  async function recordExplorerEvent(record) {
    const event = createExplorerStoryEvent(record);
    const db = await open();
    let transactionToAbort;
    try {
      await ensureCharacterMigration(db);
      const transaction = transactionToAbort = db.transaction(['profiles', 'events', JOURNAL_ORDER_STORE], 'readwrite');
      const profiles = transaction.objectStore('profiles');
      const events = transaction.objectStore('events');
      const existing = await requestPromise(events.get(event.eventId));
      if (existing) {
        await transactionPromise(transaction);
        return { recorded: false, reason: 'already-recorded', event: clone(existing) };
      }
      const current = normalizeProfile(await requestPromise(profiles.get(PROFILE_ID)));
      const nextExplorerProgress = event.projections.profile
        ? projectExplorerStoryProgress(current.explorerProgress, event)
        : current.explorerProgress;
      const characterProjection = event.projections.profile
        ? projectCharacterProgress(current.characterState, event, {
            meaningful: true,
            explorerPointsBefore: current.explorerProgress.points,
            explorerPointsAfter: nextExplorerProgress.points
          })
        : { character: current.characterState, reward: null };
      const profile = event.projections.profile
        ? normalizeProfile({ ...current, explorerProgress: nextExplorerProgress, characterState: characterProjection.character })
        : current;
      events.put(event);
      putJournalOrder(transaction, 'events', event);
      profiles.put(profile);
      await transactionPromise(transaction);
      return { recorded: true, event: clone(event), profile: clone(profile), characterReward: clone(characterProjection.reward) };
    } catch (error) {
      supportRecorder.record({operation:'journal-save',error});
      try { transactionToAbort?.abort(); } catch { /* Already committed or aborted. */ }
      throw error;
    } finally {
      db.close();
    }
  }

  async function collect(record) {
    return recordDiscovery(record, { collection: true });
  }

  async function recordObservation(record, policy = {}) {
    return recordDiscovery(record, { ...policy, collection: policy.collection === true });
  }

  async function listItems(limit = 200) {
    const db = await open();
    try {
      const transaction = db.transaction(['items', JOURNAL_ORDER_STORE], 'readonly');
      const records = await recentJournalRows(transaction, 'items', limit);
      await transactionPromise(transaction);
      return records;
    } finally {
      db.close();
    }
  }

  async function listFieldGuide(limit = 500) {
    const db = await open();
    try {
      const transaction = db.transaction(['fieldGuide', JOURNAL_ORDER_STORE], 'readonly');
      const records = await recentJournalRows(transaction, 'fieldGuide', limit);
      await transactionPromise(transaction);
      return records;
    } finally {
      db.close();
    }
  }

  async function getEventsById(ids = []) {
    if(!Array.isArray(ids)||ids.length>32||ids.some(id=>typeof id!=='string'||id.length>260))throw new TypeError('Expected at most 32 stable event IDs');
    const db=await open();try{
      const transaction=db.transaction(['events'],'readonly'),events=transaction.objectStore('events');
      const records=await Promise.all(ids.map(id=>requestPromise(events.get(id))));await transactionPromise(transaction);
      return records.filter(Boolean).map(clone);
    }finally{db.close();}
  }

  async function listEvents(limit = 500) {
    const db = await open();
    try {
      const transaction = db.transaction(['events', JOURNAL_ORDER_STORE], 'readonly');
      const records = await recentJournalRows(transaction, 'events', limit);
      await transactionPromise(transaction);
      return records;
    } finally {
      db.close();
    }
  }

  async function listCompanions() {
    const db = await open();
    try {
      const transaction = db.transaction(['companions'], 'readonly');
      const records = await requestPromise(transaction.objectStore('companions').getAll());
      await transactionPromise(transaction);
      return records.sort((a, b) => Number(a.adoptedAt) - Number(b.adoptedAt)).map(clone);
    } finally {
      db.close();
    }
  }

  async function applyTrustedReceipt(instanceId, receipt = {}) {
    const db = await open();
    let transactionToAbort;
    try {
      const transaction = transactionToAbort = db.transaction(['items', JOURNAL_ORDER_STORE], 'readwrite');
      const store = transaction.objectStore('items');
      const item = await requestPromise(store.get(String(instanceId)));
      if (!item) {
        await transactionPromise(transaction);
        return null;
      }
      validateReceipt(item, receipt);
      const updated = {
        ...item,
        receiptOwnerUid: receipt.ownerUid,
        authority: ['trusted-server', 'server-receipt'].includes(receipt.authority) ? receipt.authority : item.authority,
        serverItemId: String(receipt.itemId || item.serverItemId || ''),
        tradeable: receipt.authority === 'trusted-server' && receipt.tradeable === true,
        trustedReceiptAt: Date.now()
      };
      store.put(updated);
      putJournalOrder(transaction, 'items', updated);
      await transactionPromise(transaction);
      return clone(updated);
    } catch (error) {
      supportRecorder.record({operation:'journal-save',error});
      try { transactionToAbort?.abort(); } catch { /* Already committed or aborted. */ }
      throw error;
    } finally {
      db.close();
    }
  }

  async function getReceiptSyncStatus(ownerUid) {
    const db = await open();
    try {
      const tx = db.transaction([JOURNAL_ORDER_STORE], 'readonly');
      const metadata = tx.objectStore(JOURNAL_ORDER_STORE);
      const [pending, blocked, acknowledged, deviceOnly] = await Promise.all([
        ownerUid ? requestPromise(metadata.index('receiptStatus').count(['receiptOutbox', ownerUid, 'pending'])) : 0,
        ownerUid ? requestPromise(metadata.index('receiptStatus').count(['receiptOutbox', ownerUid, 'blocked'])) : 0,
        ownerUid ? requestPromise(metadata.index('ownedDisposition').count(['items', ownerUid, 'acknowledged'])) : 0,
        requestPromise(metadata.index('disposition').count(['items', 'device']))
      ]);
      await transactionPromise(tx);
      return Object.freeze({pending, blocked, acknowledged, deviceOnly});
    } finally { db.close(); }
  }

  async function listPendingReceipts(ownerUid, now = Date.now()) {
    const db = await open();
    try {
      const tx = db.transaction(['receiptOutbox', JOURNAL_ORDER_STORE], 'readonly');
      const rows = await readyJournalReceipts(tx, String(ownerUid), now);
      await transactionPromise(tx);
      return rows;
    } finally { db.close(); }
  }

  async function completePendingReceipt(id, receipt) {
    const db = await open();
    let transactionToAbort;
    try {
      const tx = transactionToAbort = db.transaction(['receiptOutbox','items', JOURNAL_ORDER_STORE], 'readwrite');
      const outbox = tx.objectStore('receiptOutbox');
      const row = await requestPromise(outbox.get(id));
      if (!row) { await transactionPromise(tx); return false; }
      const items = tx.objectStore('items');
      const item = await requestPromise(items.get(row.instanceId));
      if (!item || receipt.ownerUid !== row.ownerUid) throw Object.assign(new Error('Pending receipt owner/item mismatch.'), {status:422});
      validateReceipt(item, receipt);
      const updated = {...item, authority:receipt.authority, receiptOwnerUid:receipt.ownerUid,
        serverItemId:receipt.itemId, tradeable:receipt.authority === 'trusted-server' && receipt.tradeable === true, trustedReceiptAt:Date.now()};
      items.put(updated);
      putJournalOrder(tx, 'items', updated);
      outbox.delete(id);
      tx.objectStore(JOURNAL_ORDER_STORE).delete(['receiptOutbox', id]);
      await transactionPromise(tx);
      return true;
    } catch (error) {
      supportRecorder.record({operation:'journal-save',error});
      try { transactionToAbort?.abort(); } catch { /* Already committed or aborted. */ }
      throw error;
    } finally { db.close(); }
  }

  async function deferPendingReceipt(id, patch) {
    const db = await open();
    let transactionToAbort;
    try {
      const tx = transactionToAbort = db.transaction(['receiptOutbox', JOURNAL_ORDER_STORE], 'readwrite');
      const outbox = tx.objectStore('receiptOutbox');
      const row = await requestPromise(outbox.get(id));
      if (row) {
        const updated = {...row,...patch, id:row.id, instanceId:row.instanceId, ownerUid:row.ownerUid};
        outbox.put(updated);
        putJournalOrder(tx, 'receiptOutbox', updated);
      }
      await transactionPromise(tx);
    } catch (error) {
      supportRecorder.record({operation:'journal-save',error});
      try { transactionToAbort?.abort(); } catch { /* Already committed or aborted. */ }
      throw error;
    } finally { db.close(); }
  }

  async function saveCompanion(companion, update) {
    if (!companion?.instanceId || !companion?.catalogId) throw new TypeError('Companion persistence requires stable instance and catalog IDs.');
    const db = await open();
    try {
      const transaction = db.transaction(['companions'], 'readwrite');
      const store = transaction.objectStore('companions');
      const current = await requestPromise(store.get(companion.instanceId));
      const next = update ? update(clone(current || companion))
        : { ...clone(companion), ...(current?.progression ? { progression: normalizeCompanionProgression(current) } : {}) };
      if (!next || next.then || next.instanceId !== companion.instanceId || next.catalogId !== companion.catalogId) {
        transaction.abort();
        throw new TypeError('Companion updates must synchronously preserve identity.');
      }
      store.put(clone(next));
      await transactionPromise(transaction);
      return clone(next);
    } finally {
      db.close();
    }
  }

  async function setActiveCompanion(instanceId = null, options = {}) {
    const db = await open();
    try {
      await ensureCharacterMigration(db);
      const transaction = db.transaction(['companions', 'profiles'], 'readwrite');
      const companionsStore = transaction.objectStore('companions');
      const profilesStore = transaction.objectStore('profiles');
      const companions = await requestPromise(companionsStore.getAll());
      const target = instanceId == null ? null : String(instanceId);
      if (target && !companions.some((entry) => entry.instanceId === target)) {
        transaction.abort();
        throw new Error('Active companion must be owned.');
      }
      const now = Math.max(1, Number(options.now) || Date.now());
      const defaultHomeId = String(options.homeId || '').slice(0, 420);
      companions.forEach((entry) => {
        const becomesActive = entry.instanceId === target;
        const wasActive = entry.active === true;
        const assignedHomeId = String(entry.residence?.homeId || defaultHomeId).slice(0, 420);
        const residence = becomesActive
          ? { state: 'traveling', homeId: assignedHomeId, updatedAt: now }
          : wasActive
            ? { state: assignedHomeId ? 'at-home' : 'care-network', homeId: assignedHomeId, updatedAt: now }
            : entry.residence;
        companionsStore.put({ ...entry, active: becomesActive, residence });
      });
      const profile = normalizeProfile(await requestPromise(profilesStore.get(PROFILE_ID)));
      profile.activeCompanionId = target;
      profilesStore.put(profile);
      await transactionPromise(transaction);
      return companions.map((entry) => ({ ...entry, active: entry.instanceId === target }));
    } finally {
      db.close();
    }
  }

  async function getCharacterMigrationBackup() {
    const db = await open();
    try {
      const transaction = db.transaction(['migrationBackups'], 'readonly');
      const backup = await requestPromise(transaction.objectStore('migrationBackups').get(CHARACTER_MIGRATION_BACKUP_ID));
      await transactionPromise(transaction);
      return clone(backup || null);
    } finally {
      db.close();
    }
  }

  async function rollbackCharacterMigration() {
    const db = await open();
    try {
      const transaction = db.transaction(['profiles', 'migrationBackups'], 'readwrite');
      const backups = transaction.objectStore('migrationBackups');
      const backup = await requestPromise(backups.get(CHARACTER_MIGRATION_BACKUP_ID));
      if (!backup?.profile) {
        await transactionPromise(transaction);
        return false;
      }
      const rolledBackAt = Date.now();
      const characterState = normalizeCharacterState({
        ...createDefaultCharacterState({ now: rolledBackAt }),
        migration: { version: 1, rolledBackAt, backupAvailable: true }
      });
      transaction.objectStore('profiles').put(normalizeProfile({ ...backup.profile, characterState }));
      backups.put({ ...backup, rolledBackAt });
      await transactionPromise(transaction);
      characterMigrationReady = true;
      return true;
    } finally {
      db.close();
    }
  }

  async function exportData() {
    const db = await open();
    try {
      await ensureCharacterMigration(db);
      const names = ['profiles','items','fieldGuide','companions','events'];
      const tx = db.transaction(names, 'readonly');
      const rows = await Promise.all(names.map(name => requestPromise(tx.objectStore(name).getAll())));
      await transactionPromise(tx);
      return {schemaVersion:DISCOVERY_DB_VERSION, exportedAt:Date.now(), profile:rows[0].find(p=>p.id===PROFILE_ID), items:rows[1], fieldGuide:rows[2], companions:rows[3], events:rows[4]};
    } finally { db.close(); }
  }

  async function rollbackLastImport() {
    const db = await open();
    let transactionToAbort;
    try {
      const tx = transactionToAbort = db.transaction(JOURNAL_TRANSACTION_STORES, 'readwrite');
      const backup = await requestPromise(tx.objectStore('migrationBackups').get(JOURNAL_IMPORT_BACKUP_ID));
      if (!backup?.stores) { await transactionPromise(tx); return false; }
      for (const name of JOURNAL_STORES) {
        const store = tx.objectStore(name); store.clear();
        for (const row of backup.stores[name] || []) store.put(clone(row));
      }
      rebuildJournalOrder(tx, backup.stores);
      await transactionPromise(tx); characterMigrationReady = false;
      return true;
    } catch (error) {
      supportRecorder.record({operation:'journal-save',error});
      try { transactionToAbort?.abort(); } catch { /* Already committed or aborted. */ }
      throw error;
    } finally { db.close(); }
  }

  async function importData(data = {}) {
    data = validateJournalBackup(data);
    const db = await open();
    let transactionToAbort;
    try {
      const transaction = transactionToAbort = db.transaction(JOURNAL_TRANSACTION_STORES, 'readwrite');
      const previousRows = await Promise.all(JOURNAL_STORES.map(name => requestPromise(transaction.objectStore(name).getAll())));
      const previous = Object.fromEntries(JOURNAL_STORES.map((name,index)=>[name,previousRows[index]]));
      previous.migrationBackups = previous.migrationBackups.filter(row=>row.id!==JOURNAL_IMPORT_BACKUP_ID);
      transaction.objectStore('migrationBackups').put({id:JOURNAL_IMPORT_BACKUP_ID, backedUpAt:Date.now(), stores:previous});
      const pendingStore = transaction.objectStore('receiptOutbox');
      const importedByInstance = new Map(data.items.map(item=>[item.instanceId,item]));
      const importedByClaim = new Map(data.items.filter(item=>item.claimId).map(item=>[item.claimId,item]));
      const retainedReceipts = [];
      for (const row of previous.receiptOutbox) {
        const item = importedByInstance.get(row.instanceId);
        if (!item || item.claimId!==row.payload?.claimId || item.catalogId!==row.payload?.catalogId) pendingStore.delete(row.id);
        else retainedReceipts.push(row);
      }
      const profiles = transaction.objectStore('profiles');
      const itemsStore = transaction.objectStore('items');
      const claims = transaction.objectStore('claims');
      const guideStore = transaction.objectStore('fieldGuide');
      const companionsStore = transaction.objectStore('companions');
      const eventsStore = transaction.objectStore('events');
      const backupsStore = transaction.objectStore('migrationBackups');
      [profiles, itemsStore, claims, guideStore, companionsStore, eventsStore].forEach((store) => store.clear());
      backupsStore.delete(CHARACTER_MIGRATION_BACKUP_ID);
      const hasCharacterState = data.profile?.characterState?.schemaVersion === 1;
      const importedProfile = hasCharacterState
        ? normalizeProfile(data.profile)
        : {
            ...clone(data.profile || {}),
            id: PROFILE_ID,
            schemaVersion: DISCOVERY_DB_VERSION,
            updatedAt: Date.now()
          };
      profiles.put(importedProfile);
      const items = Array.isArray(data.items) ? data.items : [];
      const companions = Array.isArray(data.companions) ? data.companions : [];
      items.forEach((item) => {
        itemsStore.put(clone(item));
        if (item.claimId) claims.put({claimId:item.claimId, item:clone(item), event:null});
      });
      data.fieldGuide.filter((entry) => entry?.catalogId).forEach((entry) => guideStore.put(clone(entry)));
      companions.filter((entry) => entry?.instanceId && entry?.catalogId).forEach((entry) => companionsStore.put(clone(entry)));
      data.events.filter((event) => event?.eventId).forEach((event) => {
        eventsStore.put(clone(event));
        if (event.claimId) {
          const item = importedByClaim.get(event.claimId) || null;
          claims.put({ claimId: event.claimId, claimedAt: event.occurredAt || Date.now(), item, event });
        }
      });
      rebuildJournalOrder(transaction, {...data, receiptOutbox:retainedReceipts});
      await transactionPromise(transaction);
      characterMigrationReady = hasCharacterState;
      return { imported: true, events: data.events.length, guide: data.fieldGuide.length, items: items.length, companions: companions.length };
    } catch (error) {
      supportRecorder.record({operation:'journal-save',error});
      try { transactionToAbort?.abort(); } catch { /* Already committed or aborted. */ }
      throw error;
    } finally {
      db.close();
    }
  }

  return Object.freeze({
    type: 'IndexedDbDiscoveryProfileStore',
    setReceiptOwnerProvider(provider, catalogVersion) { options.getReceiptOwnerUid = provider; options.catalogVersion = catalogVersion; },
    getReceiptSyncStatus, listPendingReceipts, completePendingReceipt, deferPendingReceipt,
    applyTrustedReceipt,
    collect,
    exportData,
    getCharacterMigrationBackup,
    getProfile,
    hasClaim,
    listCompanions,
    listEvents,
    getEventsById,
    listFieldGuide,
    listItems,
    loadRuntimeBootstrap,
    importData,
    recordDiscovery,
    recordExplorerEvent,
    recordObservation,
    rollbackCharacterMigration,
    rollbackLastImport,
    saveCompanion,
    saveProfile,
    setActiveCompanion
  });
}

function createMemoryDiscoveryProfileStore(seed = {}) {
  let beforeImport = null;
  let legacyProfileBackup = seed.profile && !seed.profile.characterState ? clone(seed.profile) : null;
  let profile = normalizeProfile(seed.profile);
  if (legacyProfileBackup) {
    profile = normalizeProfile({
      ...legacyProfileBackup,
      characterState: migrateLegacyCharacterState({
        profile: legacyProfileBackup,
        events: seed.events,
        fieldGuide: seed.fieldGuide,
        companions: seed.companions,
        backupAvailable: true,
        now: Number(seed.migratedAt) || Date.now()
      })
    });
  }
  const outbox = new Map((seed.receiptOutbox || []).map(row => [row.id, clone(row)]));
  const items = new Map((seed.items || []).map((item) => [item.instanceId, clone(item)]));
  const claims = new Map((seed.claims || []).map((claim) => [claim.claimId, clone(claim)]));
  const guide = new Map((seed.fieldGuide || []).map((entry) => [entry.catalogId, clone(entry)]));
  const companions = new Map((seed.companions || []).map((entry) => [entry.instanceId, clone(entry)]));
  const events = new Map((seed.events || []).map((entry) => [entry.eventId, clone(entry)]));

  async function recordDiscovery(record, policy = {}) {
    if (!record?.claimId || !record?.catalogId) throw new TypeError('Discovery recording requires stable claim and catalog IDs.');
    if (policy.collection === true && !record?.instanceId) throw new TypeError('Collected discoveries require a stable instance ID.');
    const collection = policy.collection === true;
    if (claims.has(record.claimId)) {
      const claim = claims.get(record.claimId);
      return { recorded: false, collected: false, reason: 'already-claimed', item: clone(claim.item || null), event: clone(claim.event || null) };
    }
    const existingGuide = guide.get(record.catalogId);
    const regionId = String(record.regionId || record.worldIdentity || 'local-region');
    const regions = Array.isArray(existingGuide?.regions) ? existingGuide.regions : [];
    const credit = progressCreditForDiscovery({
      firstIdentification: !existingGuide,
      newRegion: !!existingGuide && !regions.includes(regionId)
    });
    const projected = projectExplorerProgress(profile.explorerProgress, record, credit);
    const item = collection ? { ...clone(record), authority: 'anonymous-local', tradeable: false } : null;
    const event = createExplorerEvent(record, {
      collection,
      resolution: collection ? 'collected' : 'recorded',
      progress: { points: projected.points, reason: projected.reason }
    });
    const characterProjection = projectCharacterProgress(profile.characterState, event, {
      noveltyReason: projected.reason,
      meaningful: true,
      explorerPointsBefore: profile.explorerProgress.points,
      explorerPointsAfter: projected.progress.points
    });
    if (item) {
      items.set(item.instanceId, item);
      const pending = pendingDiscoveryReceipt(item, seed.getReceiptOwnerUid?.(), seed.catalogVersion);
      if (pending) outbox.set(pending.id, pending);
    }
    if (profile.activeCompanionId && !record.receiptRestore) {
      const companion = companions.get(profile.activeCompanionId);
      if (companion) companions.set(companion.instanceId, fieldCompanionReward(companion, event, !existingGuide));
    }
    events.set(event.eventId, event);
    claims.set(record.claimId, { claimId: record.claimId, item, event });
    guide.set(record.catalogId, projectFieldGuideEntry(existingGuide, record, record.collectedAt || Date.now(), regionId));
    const discipline = String(record.discipline || 'exploration');
    const legacy = { ...(profile.disciplineProgress[discipline] || { discoveries: 0, regions: [] }) };
    legacy.discoveries = Number(legacy.discoveries || 0) + 1;
    legacy.regions = [...new Set([...(legacy.regions || []), regionId])];
    profile = normalizeProfile({
      ...profile,
      collectionCount: Number(profile.collectionCount || 0) + (collection ? 1 : 0),
      fieldGuideCount: Number(profile.fieldGuideCount || 0) + (existingGuide ? 0 : 1),
      disciplineProgress: { ...profile.disciplineProgress, [discipline]: legacy },
      explorerProgress: projected.progress,
      characterState: characterProjection.character
    });
    return {
      recorded: true,
      collected: collection,
      item: clone(item),
      event: clone(event),
      profile: clone(profile),
      progress: { points: projected.points, reason: projected.reason, specialtyId: projected.specialtyId },
      characterReward: clone(characterProjection.reward)
    };
  }


  async function recordExplorerEvent(record) {
    const event = createExplorerStoryEvent(record);
    if (events.has(event.eventId)) return { recorded: false, reason: 'already-recorded', event: clone(events.get(event.eventId)) };
    events.set(event.eventId, event);
    let characterReward = null;
    if (event.projections.profile) {
      const nextExplorerProgress = projectExplorerStoryProgress(profile.explorerProgress, event);
      const characterProjection = projectCharacterProgress(profile.characterState, event, {
        meaningful: true,
        explorerPointsBefore: profile.explorerProgress.points,
        explorerPointsAfter: nextExplorerProgress.points
      });
      characterReward = characterProjection.reward;
      profile = normalizeProfile({ ...profile, explorerProgress: nextExplorerProgress, characterState: characterProjection.character });
    }
    return { recorded: true, event: clone(event), profile: clone(profile), characterReward: clone(characterReward) };
  }

  return Object.freeze({
    type: 'MemoryDiscoveryProfileStore',
    async getReceiptSyncStatus(ownerUid) { return summarizeReceiptState([...items.values()], [...outbox.values()], ownerUid); },
    async listPendingReceipts(ownerUid, now = Date.now()) { return [...outbox.values()].filter(row => row.ownerUid === ownerUid && row.status === 'pending' && row.nextAttemptAt <= now)
      .sort((a,b)=>Number(a.nextAttemptAt)-Number(b.nextAttemptAt)||(a.id<b.id?-1:a.id>b.id?1:0)).slice(0,25).map(clone); },
    async deferPendingReceipt(id, patch) { const row=outbox.get(id);if(row)outbox.set(id,{...row,...patch,id:row.id,instanceId:row.instanceId,ownerUid:row.ownerUid}); },
    async completePendingReceipt(id, receipt) {
      const row = outbox.get(id); if (!row) return false;
      const item = items.get(row.instanceId);
      if (!item || receipt.ownerUid !== row.ownerUid) throw Object.assign(new Error('Pending receipt owner/item mismatch.'),{status:422});
      validateReceipt(item, receipt);
      items.set(row.instanceId,{...item,authority:receipt.authority,receiptOwnerUid:receipt.ownerUid,serverItemId:receipt.itemId,tradeable:receipt.authority === 'trusted-server' && receipt.tradeable === true});
      outbox.delete(id);return true;
    },
    async getProfile() { return clone(profile); },
    async saveProfile(next) {
      profile = resolveProfileUpdate(profile, next);
      return clone(profile);
    },
    async hasClaim(claimId) { return claims.has(String(claimId)); },
    async listItems(limit = 200) { return [...items.values()].sort((a,b)=>compareJournalRows('items',a,b)).slice(0, journalPageSize(limit)).map(clone); },
    async listFieldGuide(limit = 500) { return [...guide.values()].sort((a,b)=>compareJournalRows('fieldGuide',a,b)).slice(0, journalPageSize(limit)).map(clone); },
    async getEventsById(ids=[]) {if(!Array.isArray(ids)||ids.length>32||ids.some(id=>typeof id!=='string'||id.length>260))throw new TypeError('Expected at most 32 stable event IDs');return ids.map(id=>events.get(id)).filter(Boolean).map(clone);},
    async listEvents(limit = 500) { return [...events.values()].sort((a,b)=>compareJournalRows('events',a,b)).slice(0, journalPageSize(limit)).map(clone); },
    async loadRuntimeBootstrap() {
      return {
        profile: clone(profile),
        items: [...items.values()].sort((a,b)=>compareJournalRows('items',a,b)).map(clone),
        claimedIds: [...new Set([...claims.keys(), ...[...items.values(),...events.values()].map(row=>row.claimId).filter(Boolean)])],
        observedCatalogIds: [...guide.keys()]
      };
    },
    async listCompanions() { return [...companions.values()].map(clone); },
    async getCharacterMigrationBackup() {
      return legacyProfileBackup ? { id: CHARACTER_MIGRATION_BACKUP_ID, profile: clone(legacyProfileBackup) } : null;
    },
    async saveCompanion(companion, update) {
      const current = companions.get(companion.instanceId);
      const next = update ? update(clone(current || companion))
        : { ...clone(companion), ...(current?.progression ? { progression: normalizeCompanionProgression(current) } : {}) };
      if (!next || next.then || next.instanceId !== companion.instanceId || next.catalogId !== companion.catalogId) throw new TypeError('Companion updates must synchronously preserve identity.');
      companions.set(companion.instanceId, clone(next)); return clone(next);
    },
    async applyTrustedReceipt(instanceId, receipt = {}) {
      const item = items.get(String(instanceId));
      if (!item) return null;
      validateReceipt(item, receipt);
      const updated = { ...item, receiptOwnerUid: receipt.ownerUid, authority: ['trusted-server', 'server-receipt'].includes(receipt.authority) ? receipt.authority : item.authority, serverItemId: String(receipt.itemId || ''), tradeable: receipt.authority === 'trusted-server' && receipt.tradeable === true };
      items.set(String(instanceId), updated);
      return clone(updated);
    },
    async setActiveCompanion(instanceId = null, options = {}) {
      const target = instanceId == null ? null : String(instanceId);
      if (target && !companions.has(target)) throw new Error('Active companion must be owned.');
      const now = Math.max(1, Number(options.now) || Date.now());
      const defaultHomeId = String(options.homeId || '').slice(0, 420);
      for (const [id, entry] of companions) {
        const becomesActive = id === target;
        const assignedHomeId = String(entry.residence?.homeId || defaultHomeId).slice(0, 420);
        const residence = becomesActive
          ? { state: 'traveling', homeId: assignedHomeId, updatedAt: now }
          : entry.active === true
            ? { state: assignedHomeId ? 'at-home' : 'care-network', homeId: assignedHomeId, updatedAt: now }
            : entry.residence;
        companions.set(id, { ...entry, active: becomesActive, residence });
      }
      profile = normalizeProfile({ ...profile, activeCompanionId: target });
      return [...companions.values()].map(clone);
    },
    collect(record) { return recordDiscovery(record, { collection: true }); },
    recordDiscovery,
    recordExplorerEvent,
    recordObservation(record, policy = {}) { return recordDiscovery(record, { ...policy, collection: policy.collection === true }); },
    async rollbackCharacterMigration() {
      if (!legacyProfileBackup) return false;
      const rolledBackAt = Date.now();
      profile = normalizeProfile({
        ...legacyProfileBackup,
        characterState: {
          ...createDefaultCharacterState({ now: rolledBackAt }),
          migration: { version: 1, rolledBackAt, backupAvailable: true }
        }
      });
      return true;
    },
    async exportData() {
      return {
        schemaVersion: DISCOVERY_DB_VERSION,
        profile: clone(profile),
        items: [...items.values()].map(clone),
        fieldGuide: [...guide.values()].map(clone),
        companions: [...companions.values()].map(clone),
        events: [...events.values()].map(clone)
      };
    },
    async rollbackLastImport() {
      if (!beforeImport) return false;
      profile = clone(beforeImport.profile); legacyProfileBackup = clone(beforeImport.legacyProfileBackup);
      for (const [name,map] of Object.entries({items,guide,companions,events,claims,outbox})) {
        map.clear(); for (const [id,row] of beforeImport[name]) map.set(id,clone(row));
      }
      beforeImport = null; return true;
    },
    async importData(data = {}) {
      data = validateJournalBackup(data);
      beforeImport = clone({profile, legacyProfileBackup, items:[...items], guide:[...guide], companions:[...companions], events:[...events], claims:[...claims], outbox:[...outbox]});
      const importedByInstance = new Map(data.items.map(item=>[item.instanceId,item]));
      const importedByClaim = new Map(data.items.filter(item=>item.claimId).map(item=>[item.claimId,item]));
      for (const [id,row] of outbox) {
        const item=importedByInstance.get(row.instanceId);
        if (!item || item.claimId!==row.payload?.claimId || item.catalogId!==row.payload?.catalogId) outbox.delete(id);
      }
      const hasCharacterState = data.profile?.characterState?.schemaVersion === 1;
      legacyProfileBackup = hasCharacterState ? null : clone(data.profile || {});
      const importedCharacter = hasCharacterState
        ? data.profile.characterState
        : migrateLegacyCharacterState({
            profile: data.profile,
            events: data.events,
            fieldGuide: data.fieldGuide,
            companions: data.companions,
            backupAvailable: true
          });
      profile = normalizeProfile({ ...data.profile, characterState: importedCharacter });
      items.clear(); guide.clear(); companions.clear(); events.clear(); claims.clear();
      (data.items || []).filter((item) => item?.instanceId && item?.catalogId).forEach((item) => items.set(item.instanceId, clone(item)));
      for (const item of items.values()) if (item.claimId) claims.set(item.claimId,{claimId:item.claimId,item:clone(item),event:null});
      data.fieldGuide.filter((entry) => entry?.catalogId).forEach((entry) => guide.set(entry.catalogId, clone(entry)));
      (data.companions || []).filter((entry) => entry?.instanceId && entry?.catalogId).forEach((entry) => companions.set(entry.instanceId, clone(entry)));
      data.events.filter((event) => event?.eventId).forEach((event) => {
        events.set(event.eventId, clone(event));
        if (event.claimId) claims.set(event.claimId, { claimId: event.claimId, event: clone(event), item: importedByClaim.get(event.claimId) || null });
      });
      return { imported: true, events: events.size, guide: guide.size, items: items.size, companions: companions.size };
    }
  });
}

export {
  CHARACTER_MIGRATION_BACKUP_ID,
  DISCOVERY_DB_NAME,
  DISCOVERY_DB_VERSION,
  createDefaultProfile,
  createIndexedDbDiscoveryProfileStore,
  createMemoryDiscoveryProfileStore,
  normalizeProfile,
  openDiscoveryDatabase
};
