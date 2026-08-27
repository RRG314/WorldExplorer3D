import {
  createExplorerEvent,
  createExplorerStoryEvent,
  defaultExplorerProgress,
  normalizeExplorerProgress,
  progressCreditForDiscovery,
  projectExplorerProgress,
  projectExplorerStoryProgress
} from './explorer-events.js?v=2';

const DISCOVERY_DB_NAME = 'world-explorer-discovery';
const DISCOVERY_DB_VERSION = 2;
const PROFILE_ID = 'local-explorer';

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
    activeCompanionId: null,
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
    explorerProgress: defaultExplorerProgress()
  };
}

function normalizeProfile(profile) {
  const base = createDefaultProfile();
  return {
    ...base,
    ...(profile || {}),
    favoriteToolIds: Array.isArray(profile?.favoriteToolIds) ? profile.favoriteToolIds.slice(0, 6) : base.favoriteToolIds,
    tutorials: { ...base.tutorials, ...(profile?.tutorials || {}) },
    disciplineProgress: { ...base.disciplineProgress, ...(profile?.disciplineProgress || {}) },
    toolMastery: { ...(profile?.toolMastery || {}) },
    explorerProgress: normalizeExplorerProgress(profile?.explorerProgress),
    schemaVersion: DISCOVERY_DB_VERSION,
    updatedAt: Date.now()
  };
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
    const request = indexedDB.open(DISCOVERY_DB_NAME, DISCOVERY_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
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
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open discovery database.'));
  });
}

function createIndexedDbDiscoveryProfileStore(options = {}) {
  const open = () => openDiscoveryDatabase(options.indexedDB);

  async function getProfile() {
    const db = await open();
    try {
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
    const profile = normalizeProfile(nextProfile);
    try {
      const transaction = db.transaction(['profiles'], 'readwrite');
      transaction.objectStore('profiles').put(profile);
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
    const collection = policy.collection === true;
    if (collection && !record?.instanceId) throw new TypeError('Collected discoveries require a stable instance ID.');
    const db = await open();
    try {
      const transaction = db.transaction(['profiles', 'items', 'claims', 'fieldGuide', 'events'], 'readwrite');
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
      const discipline = String(record.discipline || 'exploration');
      const disciplineProgress = { ...(current.disciplineProgress[discipline] || { discoveries: 0, regions: [] }) };
      disciplineProgress.discoveries = Number(disciplineProgress.discoveries || 0) + 1;
      disciplineProgress.regions = [...new Set([...(disciplineProgress.regions || []), regionId])];
      const profile = normalizeProfile({
        ...current,
        collectionCount: Number(current.collectionCount || 0) + (collection ? 1 : 0),
        fieldGuideCount: Number(current.fieldGuideCount || 0) + (existingGuide ? 0 : 1),
        disciplineProgress: { ...current.disciplineProgress, [discipline]: disciplineProgress },
        explorerProgress: projected.progress
      });
      if (item) items.put(item);
      events.put(event);
      claims.put({ claimId: record.claimId, claimedAt: now, item, event });
      fieldGuide.put(projectFieldGuideEntry(existingGuide, record, now, regionId));
      profiles.put(profile);
      await transactionPromise(transaction);
      return {
        recorded: true,
        collected: collection,
        item: clone(item),
        event: clone(event),
        profile: clone(profile),
        progress: { points: projected.points, reason: projected.reason, specialtyId: projected.specialtyId }
      };
    } finally {
      db.close();
    }
  }

  async function recordExplorerEvent(record) {
    const event = createExplorerStoryEvent(record);
    const db = await open();
    try {
      const transaction = db.transaction(['profiles', 'events'], 'readwrite');
      const profiles = transaction.objectStore('profiles');
      const events = transaction.objectStore('events');
      const existing = await requestPromise(events.get(event.eventId));
      if (existing) {
        await transactionPromise(transaction);
        return { recorded: false, reason: 'already-recorded', event: clone(existing) };
      }
      const current = normalizeProfile(await requestPromise(profiles.get(PROFILE_ID)));
      const profile = event.projections.profile
        ? normalizeProfile({ ...current, explorerProgress: projectExplorerStoryProgress(current.explorerProgress, event) })
        : current;
      events.put(event);
      profiles.put(profile);
      await transactionPromise(transaction);
      return { recorded: true, event: clone(event), profile: clone(profile) };
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
      const transaction = db.transaction(['items'], 'readonly');
      const records = await requestPromise(transaction.objectStore('items').getAll());
      await transactionPromise(transaction);
      return records.sort((a, b) => Number(b.collectedAt) - Number(a.collectedAt)).slice(0, Math.max(1, limit)).map(clone);
    } finally {
      db.close();
    }
  }

  async function listFieldGuide(limit = 500) {
    const db = await open();
    try {
      const transaction = db.transaction(['fieldGuide'], 'readonly');
      const records = await requestPromise(transaction.objectStore('fieldGuide').getAll());
      await transactionPromise(transaction);
      return records.sort((a, b) => Number(b.lastObservedAt) - Number(a.lastObservedAt)).slice(0, Math.max(1, limit)).map(clone);
    } finally {
      db.close();
    }
  }

  async function listEvents(limit = 500) {
    const db = await open();
    try {
      const transaction = db.transaction(['events'], 'readonly');
      const records = await requestPromise(transaction.objectStore('events').getAll());
      await transactionPromise(transaction);
      return records
        .sort((a, b) => Number(b.occurredAt) - Number(a.occurredAt))
        .slice(0, Math.max(1, limit))
        .map(clone);
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
    try {
      const transaction = db.transaction(['items'], 'readwrite');
      const store = transaction.objectStore('items');
      const item = await requestPromise(store.get(String(instanceId)));
      if (!item) {
        await transactionPromise(transaction);
        return null;
      }
      const updated = {
        ...item,
        authority: ['trusted-server', 'server-receipt'].includes(receipt.authority) ? receipt.authority : item.authority,
        serverItemId: String(receipt.itemId || item.serverItemId || ''),
        tradeable: receipt.authority === 'trusted-server' && receipt.tradeable === true,
        trustedReceiptAt: Date.now()
      };
      store.put(updated);
      await transactionPromise(transaction);
      return clone(updated);
    } finally {
      db.close();
    }
  }

  async function saveCompanion(companion) {
    if (!companion?.instanceId || !companion?.catalogId) throw new TypeError('Companion persistence requires stable instance and catalog IDs.');
    const db = await open();
    try {
      const transaction = db.transaction(['companions'], 'readwrite');
      transaction.objectStore('companions').put(clone(companion));
      await transactionPromise(transaction);
      return clone(companion);
    } finally {
      db.close();
    }
  }

  async function setActiveCompanion(instanceId = null) {
    const db = await open();
    try {
      const transaction = db.transaction(['companions', 'profiles'], 'readwrite');
      const companionsStore = transaction.objectStore('companions');
      const profilesStore = transaction.objectStore('profiles');
      const companions = await requestPromise(companionsStore.getAll());
      const target = instanceId == null ? null : String(instanceId);
      if (target && !companions.some((entry) => entry.instanceId === target)) {
        transaction.abort();
        throw new Error('Active companion must be owned.');
      }
      companions.forEach((entry) => companionsStore.put({ ...entry, active: entry.instanceId === target }));
      const profile = normalizeProfile(await requestPromise(profilesStore.get(PROFILE_ID)));
      profile.activeCompanionId = target;
      profilesStore.put(profile);
      await transactionPromise(transaction);
      return companions.map((entry) => ({ ...entry, active: entry.instanceId === target }));
    } finally {
      db.close();
    }
  }

  async function exportData() {
    const [profile, items, fieldGuide, companions, events] = await Promise.all([
      getProfile(), listItems(10000), listFieldGuide(10000), listCompanions(), listEvents(10000)
    ]);
    return { schemaVersion: DISCOVERY_DB_VERSION, exportedAt: Date.now(), profile, items, fieldGuide, companions, events };
  }

  async function importData(data = {}) {
    if (!data || typeof data !== 'object' || !Array.isArray(data.events) || !Array.isArray(data.fieldGuide)) {
      throw new TypeError('This is not a World Explorer Journal backup.');
    }
    const db = await open();
    try {
      const transaction = db.transaction(['profiles', 'items', 'claims', 'fieldGuide', 'companions', 'events'], 'readwrite');
      const profiles = transaction.objectStore('profiles');
      const itemsStore = transaction.objectStore('items');
      const claims = transaction.objectStore('claims');
      const guideStore = transaction.objectStore('fieldGuide');
      const companionsStore = transaction.objectStore('companions');
      const eventsStore = transaction.objectStore('events');
      [profiles, itemsStore, claims, guideStore, companionsStore, eventsStore].forEach((store) => store.clear());
      profiles.put(normalizeProfile(data.profile));
      const items = Array.isArray(data.items) ? data.items : [];
      const companions = Array.isArray(data.companions) ? data.companions : [];
      items.filter((item) => item?.instanceId && item?.catalogId).forEach((item) => itemsStore.put(clone(item)));
      data.fieldGuide.filter((entry) => entry?.catalogId).forEach((entry) => guideStore.put(clone(entry)));
      companions.filter((entry) => entry?.instanceId && entry?.catalogId).forEach((entry) => companionsStore.put(clone(entry)));
      data.events.filter((event) => event?.eventId).forEach((event) => {
        eventsStore.put(clone(event));
        if (event.claimId) {
          const item = items.find((candidate) => candidate.claimId === event.claimId) || null;
          claims.put({ claimId: event.claimId, claimedAt: event.occurredAt || Date.now(), item, event });
        }
      });
      await transactionPromise(transaction);
      return { imported: true, events: data.events.length, guide: data.fieldGuide.length, items: items.length, companions: companions.length };
    } finally {
      db.close();
    }
  }

  return Object.freeze({
    type: 'IndexedDbDiscoveryProfileStore',
    applyTrustedReceipt,
    collect,
    exportData,
    getProfile,
    hasClaim,
    listCompanions,
    listEvents,
    listFieldGuide,
    listItems,
    importData,
    recordDiscovery,
    recordExplorerEvent,
    recordObservation,
    saveCompanion,
    saveProfile,
    setActiveCompanion
  });
}

function createMemoryDiscoveryProfileStore(seed = {}) {
  let profile = normalizeProfile(seed.profile);
  const items = new Map((seed.items || []).map((item) => [item.instanceId, clone(item)]));
  const claims = new Map((seed.claims || []).map((claim) => [claim.claimId, clone(claim)]));
  const guide = new Map((seed.fieldGuide || []).map((entry) => [entry.catalogId, clone(entry)]));
  const companions = new Map((seed.companions || []).map((entry) => [entry.instanceId, clone(entry)]));
  const events = new Map((seed.events || []).map((entry) => [entry.eventId, clone(entry)]));

  async function recordDiscovery(record, policy = {}) {
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
    if (item) items.set(item.instanceId, item);
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
      explorerProgress: projected.progress
    });
    return {
      recorded: true,
      collected: collection,
      item: clone(item),
      event: clone(event),
      profile: clone(profile),
      progress: { points: projected.points, reason: projected.reason, specialtyId: projected.specialtyId }
    };
  }


  async function recordExplorerEvent(record) {
    const event = createExplorerStoryEvent(record);
    if (events.has(event.eventId)) return { recorded: false, reason: 'already-recorded', event: clone(events.get(event.eventId)) };
    events.set(event.eventId, event);
    if (event.projections.profile) {
      profile = normalizeProfile({ ...profile, explorerProgress: projectExplorerStoryProgress(profile.explorerProgress, event) });
    }
    return { recorded: true, event: clone(event), profile: clone(profile) };
  }

  return Object.freeze({
    type: 'MemoryDiscoveryProfileStore',
    async getProfile() { return clone(profile); },
    async saveProfile(next) { profile = normalizeProfile(next); return clone(profile); },
    async hasClaim(claimId) { return claims.has(String(claimId)); },
    async listItems(limit = 200) { return [...items.values()].slice(0, limit).map(clone); },
    async listFieldGuide(limit = 500) { return [...guide.values()].slice(0, limit).map(clone); },
    async listEvents(limit = 500) { return [...events.values()].sort((a, b) => Number(b.occurredAt) - Number(a.occurredAt)).slice(0, limit).map(clone); },
    async listCompanions() { return [...companions.values()].map(clone); },
    async saveCompanion(companion) { companions.set(companion.instanceId, clone(companion)); return clone(companion); },
    async applyTrustedReceipt(instanceId, receipt = {}) {
      const item = items.get(String(instanceId));
      if (!item) return null;
      const updated = { ...item, authority: ['trusted-server', 'server-receipt'].includes(receipt.authority) ? receipt.authority : item.authority, serverItemId: String(receipt.itemId || ''), tradeable: receipt.authority === 'trusted-server' && receipt.tradeable === true };
      items.set(String(instanceId), updated);
      return clone(updated);
    },
    async setActiveCompanion(instanceId = null) {
      const target = instanceId == null ? null : String(instanceId);
      if (target && !companions.has(target)) throw new Error('Active companion must be owned.');
      for (const [id, entry] of companions) companions.set(id, { ...entry, active: id === target });
      profile = normalizeProfile({ ...profile, activeCompanionId: target });
      return [...companions.values()].map(clone);
    },
    collect(record) { return recordDiscovery(record, { collection: true }); },
    recordDiscovery,
    recordExplorerEvent,
    recordObservation(record, policy = {}) { return recordDiscovery(record, { ...policy, collection: policy.collection === true }); },
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
    async importData(data = {}) {
      if (!data || typeof data !== 'object' || !Array.isArray(data.events) || !Array.isArray(data.fieldGuide)) throw new TypeError('This is not a World Explorer Journal backup.');
      profile = normalizeProfile(data.profile);
      items.clear(); guide.clear(); companions.clear(); events.clear(); claims.clear();
      (data.items || []).filter((item) => item?.instanceId && item?.catalogId).forEach((item) => items.set(item.instanceId, clone(item)));
      data.fieldGuide.filter((entry) => entry?.catalogId).forEach((entry) => guide.set(entry.catalogId, clone(entry)));
      (data.companions || []).filter((entry) => entry?.instanceId && entry?.catalogId).forEach((entry) => companions.set(entry.instanceId, clone(entry)));
      data.events.filter((event) => event?.eventId).forEach((event) => {
        events.set(event.eventId, clone(event));
        if (event.claimId) claims.set(event.claimId, { claimId: event.claimId, event: clone(event), item: [...items.values()].find((item) => item.claimId === event.claimId) || null });
      });
      return { imported: true, events: events.size, guide: guide.size, items: items.size, companions: companions.size };
    }
  });
}

export {
  DISCOVERY_DB_NAME,
  DISCOVERY_DB_VERSION,
  createDefaultProfile,
  createIndexedDbDiscoveryProfileStore,
  createMemoryDiscoveryProfileStore,
  normalizeProfile,
  openDiscoveryDatabase
};
