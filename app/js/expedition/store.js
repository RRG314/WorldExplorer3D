import { EXPEDITION_SCHEMA_VERSION } from './model.js?v=2';
import { DEFAULT_CREW } from './catalog.js?v=2';

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
