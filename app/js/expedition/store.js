import { POD_PHASE, POD_ROUTE_KIND } from './pod-journey-authority.js?v=2';
import { validLunarFieldPower } from '../planetary/lunar-field-power.js';
import { EXPEDITION_SCHEMA_VERSION } from './model.js?v=12';
import { DEFAULT_CREW } from './catalog.js?v=2';
import { normalizeVoyageDirector, VOYAGE_SLOTS } from './voyage-director.js?v=2';
import { createLongDurationState, crewPopulationForShip } from './long-duration.js?v=1';
import { createExpeditionArchive } from './archive.js?v=1';
import { SPACE_CRAFT_IDENTITY } from '../space/craft-identity.js?v=1';

const EXPEDITION_STORAGE_KEY = 'world-explorer:interstellar-expedition:v1';
const EXPEDITION_BACKUP_KEY = 'world-explorer:interstellar-expedition:backup:v1';
const MAX_RECORD_CHARS = 2_000_000;
const EXPEDITION_STATES = new Set(['planned', 'traveling', 'paused', 'arrived', 'completed', 'failed']);

function parseRecord(value) {
  if (!value || value.length > MAX_RECORD_CHARS) return null;
  try {
    const record = JSON.parse(value);
    if (record?.type !== 'InterstellarExpedition') return null;
    if (record.schemaVersion !== EXPEDITION_SCHEMA_VERSION
      || typeof record.id !== 'string' || !record.id || typeof record.destinationId !== 'string'
      || !EXPEDITION_STATES.has(record.state) || !record.ship?.id || !record.ship?.profileId
      || !Array.isArray(record.crew) || !record.resources || !record.calculation || !record.readiness
      || !Number.isFinite(record.createdAtMs) || !Number.isFinite(record.updatedAtMs)) return null;
    if (record.podJourney != null) {
      const pod = record.podJourney;
      if (pod.type !== 'ExpeditionPodJourney' || ![1, 2].includes(pod.schemaVersion)
        || pod.expeditionId !== record.id || !Object.values(POD_PHASE).includes(pod.phase)
        || !['id', 'contactId', 'bodyId', 'returnFrameId'].every(key => typeof pod[key] === 'string' && pod[key])
        || !Number.isFinite(pod.startedAtMs) || !Number.isFinite(pod.updatedAtMs)
        || pod.schemaVersion === 2 && !Object.values(POD_ROUTE_KIND).includes(pod.routeKind)
        || pod.fieldPower != null && (pod.bodyId !== 'moon' || pod.contactId !== 'destination-mission:moon' || !validLunarFieldPower(pod.fieldPower))) return null;
    }
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
    // Preserve old local saves while keeping retired ship names out of the live runtime.
    if (record.ship?.profileId === 'long-range-research-vessel' && ['Surveyor', 'Asteria'].includes(record.ship.name)) {
      record.ship = { ...record.ship, name: SPACE_CRAFT_IDENTITY.starship.name };
    }
    record.voyagePhase ||= record.state === 'arrived' ? 'arrival' : 'departure';
    record.reserveMargin = Math.max(0, Math.min(0.4, Number.isFinite(Number(record.reserveMargin)) ? Number(record.reserveMargin) : 0.15));
    record.arrivalTransferState ||= record.state === 'completed' ? 'complete' : 'pending';
    record.campaignCompletedAtMs ||= null;
    record.campaignResult ||= null;
    record.eventFlags = { ...(record.eventFlags || {}) };
    record.activeEncounter ||= null;
    record.encounterHistory = Array.isArray(record.encounterHistory) ? record.encounterHistory : [];
    record.operationFlags = { ...(record.operationFlags || {}) };
    record.routeContacts = Array.isArray(record.routeContacts) ? record.routeContacts : [];
    record.activeLocalContactId ||= null;
    record.localOperation ||= null;
    record.podJourney ||= null;
    record.scienceSamples = Array.isArray(record.scienceSamples) ? record.scienceSamples : [];
    record.resources = { processingResidueKg: 0, ...(record.resources || {}) };
    record.materialLedger = { installedRepairKg: 0, ...(record.materialLedger || {}) };
    record.outposts = Array.isArray(record.outposts) ? record.outposts : [];
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
  const archive = createExpeditionArchive(storage);
  let expectedRaw = null, observed = false, protectedRecord = false, warning = null;
  function load() {
    observed = true;
    try {
      if (typeof storage?.getItem !== 'function') throw new Error('Storage unavailable');
      expectedRaw = storage.getItem(EXPEDITION_STORAGE_KEY);
      const record = parseRecord(expectedRaw);
      protectedRecord = expectedRaw !== null && !record;
      return record;
    } catch {
      protectedRecord = true;
      return null;
    }
  }
  function writable() {
    if (!observed) load();
    if (protectedRecord) throw new Error('Existing expedition progress cannot be read by this version and has been preserved.');
    if (typeof storage?.setItem !== 'function' || typeof storage?.getItem !== 'function') throw new Error('Expedition storage is unavailable.');
    if (storage.getItem(EXPEDITION_STORAGE_KEY) !== expectedRaw) throw new Error('Another tab changed the expedition. Reload to resume its saved state.');
    return expectedRaw;
  }
  function archiveCommitted(expedition) {
    try { archive.mergeExpedition(expedition); }
    catch { warning = 'Expedition saved. The separate discovery archive could not be updated.'; }
  }
  function save(expedition) {
    const raw = JSON.stringify(expedition);
    if (!parseRecord(raw)) throw new TypeError('Only a complete supported Expedition record can be saved.');
    const previous = writable();
    // The primary record is the commit point. A redundant-copy failure cannot
    // turn a successful commit into an apparent failure that a player retries.
    storage.setItem(EXPEDITION_STORAGE_KEY, raw);
    expectedRaw = raw;
    warning = null;
    if (previous) {
      try { storage.setItem(EXPEDITION_BACKUP_KEY, previous); }
      catch { warning = 'Expedition saved. The previous-state backup could not be refreshed.'; }
    }
    archiveCommitted(expedition);
    return expedition;
  }
  function restoreBackup() {
    writable();
    const backup = storage.getItem(EXPEDITION_BACKUP_KEY);
    const record = parseRecord(backup);
    if (!record) return null;
    storage.setItem(EXPEDITION_STORAGE_KEY, backup);
    expectedRaw = backup;
    warning = null;
    archiveCommitted(record);
    return record;
  }
  function clear() {
    const previous = writable();
    if (typeof storage?.removeItem !== 'function') throw new Error('Expedition storage is unavailable.');
    // Destructive clear requires a durable recovery copy before deletion.
    if (previous) storage.setItem(EXPEDITION_BACKUP_KEY, previous);
    storage.removeItem(EXPEDITION_STORAGE_KEY);
    expectedRaw = null;
  }
  return Object.freeze({
    backupKey: EXPEDITION_BACKUP_KEY, clear, load, restoreBackup, save,
    status: () => Object.freeze({ protectedRecord, warning }),
    storageKey: EXPEDITION_STORAGE_KEY
  });
}

export { createExpeditionStore, EXPEDITION_BACKUP_KEY, EXPEDITION_STORAGE_KEY };
