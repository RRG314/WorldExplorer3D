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
  let entries = [];

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

  function preserveLegacyStorage() {
    if (!enabled || !globalThis.localStorage) return;
    try {
      if (localStorage.getItem(migrationKey) === 'done') return;
      legacyKeys.forEach((key) => {
        if (!key || key === storageKey || key === backupKey) return;
      });
      localStorage.setItem(migrationKey, 'done');
      detail = 'Existing local build data is preserved for compatibility on this browser.';
    } catch (error) {
      console.warn('[blocks] Failed to preserve legacy build storage:', error);
    }
  }

  function normalizeRows(rows) {
    const normalized = rows.map(normalizeEntry).filter(Boolean);
    return normalized.length <= maxTotal ? normalized : normalized.slice(normalized.length - maxTotal);
  }

  function load() {
    if (!enabled) return [];
    const parseRows = (raw) => {
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : null;
      } catch {
        return null;
      }
    };
    try {
      const primary = parseRows(localStorage.getItem(storageKey));
      if (primary) return normalizeRows(primary);
      const backup = parseRows(localStorage.getItem(backupKey));
      if (backup) {
        try {
          localStorage.setItem(storageKey, JSON.stringify(backup));
        } catch {
          // Backup recovery remains best effort.
        }
        return normalizeRows(backup);
      }
    } catch (error) {
      console.warn('[blocks] Failed to read storage:', error);
    }
    return [];
  }

  function save() {
    if (!enabled) return false;
    const payload = JSON.stringify(entries);
    try {
      localStorage.setItem(storageKey, payload);
      localStorage.setItem(backupKey, payload);
      return true;
    } catch (error) {
      enabled = false;
      detail = `Storage write failed: ${error?.message || String(error)}`;
      console.warn('[blocks] Failed to save storage:', error);
      return false;
    }
  }

  function initialize() {
    const storageState = detectStorage();
    enabled = storageState.enabled;
    detail = storageState.detail;
    preserveLegacyStorage();
    entries = load();
  }

  function countForLocation(locationKey) {
    return entries.reduce((count, entry) => count + (entry.locationKey === locationKey ? 1 : 0), 0);
  }

  function listForLocation(locationKey) {
    return locationKey ? entries.filter((entry) => entry.locationKey === locationKey) : [];
  }

  function upsert(rawEntry) {
    if (!enabled) return true;
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
    if (existingIndex >= 0) entries[existingIndex] = next;
    else entries.push(next);
    if (entries.length > maxTotal) entries = entries.slice(entries.length - maxTotal);
    if (save()) return true;
    entries = previous;
    return false;
  }

  function removeAt(locationKey, gx, gy, gz) {
    if (!enabled) return true;
    const next = entries.filter((entry) =>
      !(entry.locationKey === locationKey && entry.gx === gx && entry.gy === gy && entry.gz === gz)
    );
    if (next.length === entries.length) return true;
    const previous = entries;
    entries = next;
    if (save()) return true;
    entries = previous;
    return false;
  }

  function clearLocation(locationKey) {
    if (!enabled) return true;
    const next = entries.filter((entry) => entry.locationKey !== locationKey);
    if (next.length === entries.length) return true;
    const previous = entries;
    entries = next;
    if (save()) return true;
    entries = previous;
    return false;
  }

  function getStatus() {
    return { enabled, detail, storageKey, totalCount: entries.length };
  }

  return { clearLocation, countForLocation, getStatus, initialize, listForLocation, removeAt, upsert };
}
