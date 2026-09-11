const DB_NAME = 'worldexplorer3d-map-cache';
const DB_VERSION = 1;
const STORE_NAME = 'overpass';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 24;

let databasePromise = null;

function openDatabase() {
  if (databasePromise) return databasePromise;
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);

  databasePromise = new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        store.createIndex('savedAt', 'savedAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return databasePromise;
}

export async function readPersistentOverpassCache(key) {
  if (!key) return null;
  const db = await openDatabase();
  if (!db) return null;

  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => {
      const record = request.result || null;
      if (!record || Date.now() - Number(record.savedAt || 0) > CACHE_TTL_MS) {
        resolve(null);
        return;
      }
      resolve(record);
    };
    request.onerror = () => resolve(null);
  });
}

function recordMatchesLocation(record, meta) {
  if (!record || !meta) return false;
  const stored = record.meta;
  if (stored) {
    return Math.abs(Number(stored.lat) - Number(meta.lat)) <= 1e-7 &&
      Math.abs(Number(stored.lon) - Number(meta.lon)) <= 1e-7 &&
      (!stored.kind || !meta.kind || stored.kind === meta.kind) &&
      Number(stored.roadsRadius) + 1e-9 >= Number(meta.roadsRadius) &&
      Number(stored.featureRadius) + 1e-9 >= Number(meta.featureRadius);
  }
  const parts = String(record.key || '').split(':');
  return parts.length >= 5 &&
    Math.abs(Number(parts[0]) - Number(meta.lat)) <= 1e-6 &&
    Math.abs(Number(parts[1]) - Number(meta.lon)) <= 1e-6 &&
    Number(parts[2]) + 1e-9 >= Number(meta.roadsRadius) &&
    Number(parts[3]) + 1e-9 >= Number(meta.featureRadius);
}

export async function readPersistentOverpassFallback(meta) {
  if (!meta) return null;
  const db = await openDatabase();
  if (!db) return null;

  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).index('savedAt').openCursor(null, 'prev');
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(null);
        return;
      }
      const record = cursor.value;
      if (
        Date.now() - Number(record?.savedAt || 0) <= CACHE_TTL_MS &&
        recordMatchesLocation(record, meta)
      ) {
        resolve(record);
        return;
      }
      cursor.continue();
    };
    request.onerror = () => resolve(null);
  });
}

export async function writePersistentOverpassCache(key, data, endpoint = null, meta = null) {
  if (!key || !data || !Array.isArray(data.elements)) return false;
  const db = await openDatabase();
  if (!db) return false;

  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put({ key, data, endpoint, meta, savedAt: Date.now() });

    const countRequest = store.count();
    countRequest.onsuccess = () => {
      let removeCount = Math.max(0, Number(countRequest.result || 0) - CACHE_MAX_ENTRIES);
      if (removeCount <= 0) return;
      const cursorRequest = store.index('savedAt').openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor || removeCount <= 0) return;
        cursor.delete();
        removeCount -= 1;
        cursor.continue();
      };
    };
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
    tx.onabort = () => resolve(false);
  });
}

export async function clearPersistentOverpassCache(location = null, kinds = null) {
  const db = await openDatabase();
  if (!db) return false;

  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    if (!location || !Number.isFinite(Number(location.lat)) || !Number.isFinite(Number(location.lon))) {
      store.clear();
    } else {
      const kindSet = Array.isArray(kinds) && kinds.length > 0 ? new Set(kinds) : null;
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const meta = cursor.value?.meta;
        if (
          meta &&
          Math.abs(Number(meta.lat) - Number(location.lat)) <= 1e-6 &&
          Math.abs(Number(meta.lon) - Number(location.lon)) <= 1e-6 &&
          (!kindSet || kindSet.has(String(meta.kind || 'core')))
        ) {
          cursor.delete();
        }
        cursor.continue();
      };
    }
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
    tx.onabort = () => resolve(false);
  });
}
