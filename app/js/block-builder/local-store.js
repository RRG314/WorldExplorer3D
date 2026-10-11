export function createBlockLocalStore(options = {}) {
  const {
    backupKey,
    legacyKeys = [],
    maxPerLocation,
    maxTotal,
    migrationKey,
    normalizeEntry,
    storageKey,
    testKey
  } = options;

  let enabled = false;
  let detail = 'Not initialized.';
  let notice = 'none';
  let entries = [];
  let expectedPrimary = null, expectedBackup = null, backupAvailable = true;

  function protect(message) { enabled = false; notice = 'protected'; detail = message; }

  function normalizeRows(rows) {
    if (!Array.isArray(rows) || rows.length > maxTotal) return null;
    const normalized = [], identities = new Set();
    for (const raw of rows) {
      const next = normalizeEntry(raw);
      if (!next || Object.keys(raw).some(key => {
        if (key === 'schemaVersion' && raw[key] === 1 && next[key] === 2) return false;
        return !Object.hasOwn(next, key) || raw[key] !== next[key];
      })) return null;
      // Legacy Earth rows may have no integer grid address. Their geographic
      // position remains authoritative; null must not collapse them at (0, 0).
      const key = JSON.stringify(next.worldKind === 'earth'
        ? [next.locationKey, next.lat, next.gy, next.lon]
        : [next.locationKey, next.gx, next.gy, next.gz]);
      if (identities.has(key)) return null;
      identities.add(key); normalized.push(Object.freeze(next));
    }
    return normalized;
  }

  function detectStorage() {
    try {
      if (!globalThis.localStorage) return { enabled: false, detail: 'localStorage is unavailable in this environment.' };
      localStorage.setItem(testKey, 'ok');
      const probe = localStorage.getItem(testKey);
      localStorage.removeItem(testKey);
      if (probe !== 'ok') return { enabled: false, detail: 'Storage round-trip check failed.' };
      return { enabled: true, detail: 'Storage round-trip check passed.' };
    } catch (error) {
      return { enabled: false, detail: `Storage access blocked: ${error?.message || String(error)}` };
    }
  }

  function migrateLegacyStorage() {
    if (!enabled || !globalThis.localStorage) return;
    try {
      if (localStorage.getItem(migrationKey) === 'done') return;
      const currentStorageExists = localStorage.getItem(storageKey) !== null ||
        localStorage.getItem(backupKey) !== null;
      if (currentStorageExists) {
        localStorage.setItem(migrationKey, 'done');
        return;
      }
      for (const key of legacyKeys) {
        if (!key || key === storageKey || key === backupKey) continue;
        let parsed;
        try {
          parsed = JSON.parse(localStorage.getItem(key));
        } catch {
          continue;
        }
        if (!Array.isArray(parsed)) continue;
        const migrated = normalizeRows(parsed);
        if (!migrated) continue;
        const previous = entries;
        entries = migrated;
        if (!save()) {
          entries = previous;
          return;
        }
        localStorage.setItem(migrationKey, 'done');
        notice = 'migrated';
        detail = `Migrated ${migrated.length} saved block${migrated.length === 1 ? '' : 's'} without deleting the previous copy.`;
        return;
      }
      if (legacyKeys.some(key => localStorage.getItem(key) !== null)) {
        protect('The older saved blocks need recovery. Their original copies have been retained.');
        return;
      }
      localStorage.setItem(migrationKey, 'done');
    } catch (error) {
      console.warn('[blocks] Failed to migrate legacy build storage:', error);
    }
  }

  function load() {
    if (!enabled) return [];
    const parseRows = raw => {
      if (raw === null) return { state: 'missing', rows: null };
      try {
        const rows = raw.length <= 8_000_000 ? normalizeRows(JSON.parse(raw)) : null;
        return rows ? { state: 'valid', rows } : { state: 'invalid', rows: null };
      } catch { return { state: 'invalid', rows: null }; }
    };
    try {
      expectedPrimary = localStorage.getItem(storageKey);
      expectedBackup = localStorage.getItem(backupKey);
      const primary = parseRows(expectedPrimary), backup = parseRows(expectedBackup);
      if (primary.state === 'invalid' || backup.state === 'invalid') {
        protect('A saved block copy is unreadable or uses unsupported data. Original copies are preserved; download a recovery copy before changing browser data.');
      }
      if (primary.state === 'valid') return primary.rows;
      if (backup.state === 'valid') {
        if (enabled) { notice = 'recovered'; detail = 'Using your browser backup. The original copy is retained until your next saved edit.'; }
        return backup.rows;
      }
    } catch {
      protect('Saved blocks could not be read. Editing is paused and existing browser records are retained.');
    }
    return [];
  }

  function save() {
    if (!enabled) return false;
    let payload;
    try {
      if (localStorage.getItem(storageKey) !== expectedPrimary || localStorage.getItem(backupKey) !== expectedBackup) {
        protect('Another tab changed your saved blocks. Reload before editing; its changes have been kept.');
        notice = 'conflict'; return false;
      }
      payload = JSON.stringify(entries);
      // The primary is the only commit point. A failed redundant backup must
      // never undo or misreport an edit that already committed successfully.
      localStorage.setItem(storageKey, payload);
    } catch {
      enabled = false; notice = 'error'; detail = 'Blocks could not be saved. Your previous saved build is unchanged. Reload when storage is available to retry.';
      return false;
    }
    expectedPrimary = payload;
    try { localStorage.setItem(backupKey, payload); expectedBackup = payload; backupAvailable = true; notice = 'none'; detail = 'Blocks saved on this device.'; }
    catch { backupAvailable = false; notice = 'backup-warning'; detail = 'Blocks saved. The extra recovery copy could not be updated.'; }
    return true;
  }

  function initialize() {
    const storageState = detectStorage();
    enabled = storageState.enabled;
    detail = storageState.detail;
    notice = enabled ? 'none' : 'error';
    entries = load();
    migrateLegacyStorage();
  }

  function countForLocation(locationKey) {
    return entries.reduce((count, entry) => count + (entry.locationKey === locationKey ? 1 : 0), 0);
  }

  function listForLocation(locationKey) {
    return locationKey ? entries.filter((entry) => entry.locationKey === locationKey) : [];
  }

  function upsert(rawEntry) {
    if (!enabled) return false;
    const existingIndex = entries.findIndex((entry) =>
      entry.locationKey === rawEntry.locationKey &&
      entry.gx === rawEntry.gx && entry.gy === rawEntry.gy && entry.gz === rawEntry.gz
    );
    if (existingIndex < 0 && (countForLocation(rawEntry.locationKey) >= maxPerLocation || entries.length >= maxTotal)) {
      return false;
    }
    const previous = entries.slice();
    const existing = existingIndex >= 0 ? entries[existingIndex] : null;
    const next = normalizeEntry({
      ...rawEntry,
      id: existing?.id,
      createdAt: existing?.createdAt || new Date().toISOString()
    });
    if (!next) return false;
    if (existingIndex >= 0) entries[existingIndex] = Object.freeze(next);
    else entries.push(Object.freeze(next));
    if (save()) return true;
    entries = previous;
    return false;
  }

  function removeAt(locationKey, gx, gy, gz, options = {}) {
    if (!enabled) return false;
    const next = entries.filter((entry) =>
      !(entry.locationKey === locationKey && (options.id
        ? entry.id === options.id : entry.gx === gx && entry.gy === gy && entry.gz === gz))
    );
    if (next.length === entries.length) return !options.id;
    const previous = entries;
    entries = next;
    if (save()) return true;
    entries = previous;
    return false;
  }

  function clearLocation(locationKey) {
    if (!enabled) return false;
    const next = entries.filter((entry) => entry.locationKey !== locationKey);
    if (next.length === entries.length) return true;
    const previous = entries;
    entries = next;
    if (save()) return true;
    entries = previous;
    return false;
  }

  function getStatus() {
    return { enabled, detail, notice, backupAvailable, storageKey, totalCount: entries.length };
  }

  function exportRecovery() {
    return JSON.stringify({ format: 'world-explorer-blocks-recovery', version: 1, primary: localStorage.getItem(storageKey), backup: localStorage.getItem(backupKey), legacy: Object.fromEntries(legacyKeys.map(key => [key, localStorage.getItem(key)])) }, null, 2);
  }

  return { exportRecovery, clearLocation, countForLocation, getStatus, initialize, listForLocation, removeAt, upsert };
}
