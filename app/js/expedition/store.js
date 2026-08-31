import { EXPEDITION_SCHEMA_VERSION } from './model.js?v=6';
import { DEFAULT_CREW } from './catalog.js?v=2';
import { normalizeVoyageDirector, VOYAGE_SLOTS } from './voyage-director.js?v=1';
import { createLongDurationState, crewPopulationForShip } from './long-duration.js?v=1';

const EXPEDITION_STORAGE_KEY = 'world-explorer:interstellar-expedition:v1';
const EXPEDITION_BACKUP_KEY = 'world-explorer:interstellar-expedition:backup:v1';

function parseRecord(value) {
  if (!value) return null;
  try {
    const record = JSON.parse(value);
    if (record?.type !== 'InterstellarExpedition') return null;
    if (Number(record.schemaVersion) !== EXPEDITION_SCHEMA_VERSION) return null;
    const defaultsById = new Map(DEFAULT_CREW.map((member) => [member.id, member]));
    record.crew = (record.crew || []).map((member) => {
      const defaults = defaultsById.get(member?.id) || {};
      return {
        ...defaults,
        ...member,
        roles: Array.isArray(member?.roles) ? member.roles : [...(defaults.roles || [])],
        health: Number.isFinite(Number(member?.health)) ? Number(member.health) : Number(defaults.health ?? 1),
        fatigue: Number.isFinite(Number(member?.fatigue)) ? Number(member.fatigue) : Number(defaults.fatigue ?? 0),
        experienceYears: Number.isFinite(Number(member?.experienceYears)) ? Number(member.experienceYears) : Number(defaults.experienceYears ?? 0),
        assignment: member?.assignment || defaults.assignment || 'general-watch'
      };
    });
    record.voyagePhase ||= record.state === 'arrived' ? 'arrival' : 'departure';
    record.eventFlags = { ...(record.eventFlags || {}) };
    record.operationFlags = { ...(record.operationFlags || {}) };
    record.routeContacts = Array.isArray(record.routeContacts) ? record.routeContacts : [];
    record.activeLocalContactId ||= null;
    record.localOperation ||= null;
    record.scienceSamples = Array.isArray(record.scienceSamples) ? record.scienceSamples : [];
    record.resources = { processingResidueKg: 0, ...(record.resources || {}) };
    record.materialLedger = { installedRepairKg: 0, ...(record.materialLedger || {}) };
    record.failureChain = Array.isArray(record.failureChain) ? record.failureChain : [];
    record.failureReport ||= null;
    record.crewPopulation = Number(record.crewPopulation) || crewPopulationForShip(record.ship?.profileId, record.crew.length);
    record.longDuration ||= createLongDurationState(record.ship?.profileId);
    const hadVoyageDirector = record.voyageDirector?.version === 1;
    record.voyageDirector = normalizeVoyageDirector(record);
    if (!hadVoyageDirector) {
      const reachedSlots = VOYAGE_SLOTS.filter((slot) => Number(record.progress || 0) + 1e-9 >= slot.progress).length;
      record.voyageDirector = Object.freeze({
        ...record.voyageDirector,
        step: reachedSlots,
        nextSlotIndex: reachedSlots,
        tags: Object.freeze({ migratedFromRepresentativeVoyage: true })
      });
      if (record.pendingEvent && !record.pendingEvent.familyId) record.pendingEvent = null;
    }
    return record;
  } catch {
    return null;
  }
}

function createExpeditionStore(storage = globalThis.localStorage) {
  function load() {
    return parseRecord(storage?.getItem?.(EXPEDITION_STORAGE_KEY));
  }

  function save(expedition) {
    if (!expedition || expedition.type !== 'InterstellarExpedition' || expedition.schemaVersion !== EXPEDITION_SCHEMA_VERSION) {
      throw new TypeError('Only a supported Expedition record can be saved.');
    }
    const existing = storage?.getItem?.(EXPEDITION_STORAGE_KEY);
    if (existing) storage.setItem(EXPEDITION_BACKUP_KEY, existing);
    storage.setItem(EXPEDITION_STORAGE_KEY, JSON.stringify(expedition));
    return expedition;
  }

  function restoreBackup() {
    const backup = storage?.getItem?.(EXPEDITION_BACKUP_KEY);
    const record = parseRecord(backup);
    if (!record) return null;
    storage.setItem(EXPEDITION_STORAGE_KEY, backup);
    return record;
  }

  function clear() {
    const existing = storage?.getItem?.(EXPEDITION_STORAGE_KEY);
    if (existing) storage.setItem(EXPEDITION_BACKUP_KEY, existing);
    storage.removeItem(EXPEDITION_STORAGE_KEY);
  }

  return Object.freeze({
    backupKey: EXPEDITION_BACKUP_KEY,
    clear,
    load,
    restoreBackup,
    save,
    storageKey: EXPEDITION_STORAGE_KEY
  });
}

export { createExpeditionStore, EXPEDITION_BACKUP_KEY, EXPEDITION_STORAGE_KEY };
