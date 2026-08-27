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
      if (raw === null) return { state: 'missing', rows: null };
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed)
          ? { state: 'valid', rows: parsed }
          : { state: 'invalid', rows: null };
      } catch {
        return { state: 'invalid', rows: null };
      }
    };
    try {
      const primary = parseRows(localStorage.getItem(storageKey));
      const backup = parseRows(localStorage.getItem(backupKey));

      if (primary.state === 'valid') return normalizeRows(primary.rows);

      if (backup.state === 'valid') {
        const recovered = normalizeRows(backup.rows);
        try {
          localStorage.setItem(storageKey, JSON.stringify(recovered));
        } catch {
          // Backup recovery remains best effort.
        }
        notice = 'recovered';
        detail = primary.state === 'invalid'
          ? 'Recovered your blocks from the browser backup because the main saved copy was damaged.'
          : 'Recovered your blocks from the browser backup because the main saved copy was missing.';
        return recovered;
      }

      if (primary.state === 'invalid' || backup.state === 'invalid') {
        notice = 'warning';
        detail = primary.state === 'invalid' && backup.state === 'invalid'
          ? 'Both saved block copies were damaged. Blocks started empty so corrupted data could not enter the world.'
          : 'Saved block data was damaged and no usable backup was available. Blocks started empty.';
      }
    } catch (error) {
      notice = 'warning';
      detail = `Could not read saved blocks. Blocks started empty: ${error?.message || String(error)}`;
      console.warn('[blocks] Failed to read storage:', error);
    }
    return [];
  }

  function save() {
    if (!enabled) return false;
    const payload = JSON.stringify(entries);
    const previousPrimary = localStorage.getItem(storageKey);
    const previousBackup = localStorage.getItem(backupKey);
    try {
      // Write the recovery copy first and the authoritative key last. If the
      // authoritative write fails, load() still sees the previous committed
      // primary value. The catch block restores the recovery copy when the
      // storage provider still permits it.
      localStorage.setItem(backupKey, payload);
      localStorage.setItem(storageKey, payload);
      return true;
    } catch (error) {
      try {
        if (previousBackup === null) localStorage.removeItem(backupKey);
        else localStorage.setItem(backupKey, previousBackup);
        if (previousPrimary === null) localStorage.removeItem(storageKey);
        else localStorage.setItem(storageKey, previousPrimary);
      } catch {
        // The authoritative key was written last, so a total write failure
        // still leaves the previous primary as the next-load authority.
      }
      enabled = false;
      notice = 'error';
      detail = `Storage write failed: ${error?.message || String(error)}`;
      console.warn('[blocks] Failed to save storage:', error);
      return false;
    }
  }

  function initialize() {
    const storageState = detectStorage();
    enabled = storageState.enabled;
    detail = storageState.detail;
    notice = enabled ? 'none' : 'error';
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
    if (existingIndex >= 0) entries[existingIndex] = next;
    else entries.push(next);
    if (entries.length > maxTotal) entries = entries.slice(entries.length - maxTotal);
    if (save()) return true;
    entries = previous;
    return false;
  }

  function removeAt(locationKey, gx, gy, gz) {
    if (!enabled) return false;
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
    return { enabled, detail, notice, storageKey, totalCount: entries.length };
  }

  return { clearLocation, countForLocation, getStatus, initialize, listForLocation, removeAt, upsert };
}
