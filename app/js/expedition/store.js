import { EXPEDITION_SCHEMA_VERSION } from './model.js?v=1';

const EXPEDITION_STORAGE_KEY = 'world-explorer:interstellar-expedition:v1';
const EXPEDITION_BACKUP_KEY = 'world-explorer:interstellar-expedition:backup:v1';

function parseRecord(value) {
  if (!value) return null;
  try {
    const record = JSON.parse(value);
    if (record?.type !== 'InterstellarExpedition') return null;
    if (Number(record.schemaVersion) !== EXPEDITION_SCHEMA_VERSION) return null;
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

