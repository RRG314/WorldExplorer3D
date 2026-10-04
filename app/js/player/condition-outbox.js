// IndexedDB transactions, rather than per-tab snapshots, own pending intent.
const DATABASE = 'world-explorer-condition';
const STORE = 'accounts';

function empty(uid) {
  return { uid, revision: 0, pending: null, operation: null, confirmed: null };
}

function legacyState(uid, storage, key) {
  try {
    const raw = storage?.getItem?.(key);
    const saved = JSON.parse(raw || 'null');
    const valid = value => value && Number.isFinite(value.condition) && value.condition >= 0 && value.condition <= 1;
    if (saved?.uid !== uid) return { row: empty(uid), raw };
    const pending = valid(saved.pending) ? saved.pending : null;
    const operation = valid(saved.operation) && typeof saved.operation.mutationId === 'string' &&
      Number.isInteger(saved.operation.expectedRevision) && saved.operation.expectedRevision >= 0 ? saved.operation : null;
    return { row: { ...empty(uid), pending, operation }, raw };
  } catch {
    // Keep the old key untouched if access or parsing fails.
    return { row: empty(uid), raw: null };
  }
}

function availableLocalStorage() {
  try { return globalThis.localStorage; } catch { return null; }
}

export function createConditionOutbox({ uid, indexedDB = globalThis.indexedDB, storage = availableLocalStorage() } = {}) {
  if (!uid || typeof uid !== 'string') throw new TypeError('Condition storage requires an account identity.');
  const legacyKey = `world-explorer:condition-outbox:v1:${uid}`;
  const legacy = legacyState(uid, storage, legacyKey);
  let fallback = structuredClone(legacy.row), durable = true, serial = Promise.resolve();

  function open() {
    return new Promise((resolve, reject) => {
      if (!indexedDB?.open) { reject(new Error('Condition storage is unavailable.')); return; }
      let abandoned = false;
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'uid' });
      };
      request.onblocked = () => { abandoned = true; reject(new Error('Condition storage is blocked by another tab.')); };
      request.onerror = () => reject(request.error || new Error('Could not open condition storage.'));
      request.onsuccess = () => {
        if (abandoned) { request.result.close(); return; }
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
    });
  }

  async function transact(change) {
    if (!durable) {
      const next = structuredClone(fallback);
      change?.(next);
      fallback = next;
      return structuredClone(next);
    }
    let db, attempted, mutationError;
    try {
      db = await open();
      const result = await new Promise((resolve, reject) => {
        // A first read may import legacy work. Keep migration and the account
        // marker in the same transaction so another tab cannot import twice.
        const tx = db.transaction(STORE, 'readwrite');
        const objectStore = tx.objectStore(STORE);
        const request = objectStore.get(uid);
        let row;
        tx.oncomplete = () => resolve(row);
        tx.onerror = tx.onabort = () => reject(tx.error || new Error('Condition transaction did not commit.'));
        request.onsuccess = () => {
          row = request.result || structuredClone(legacy.row);
          try {
            change?.(row);
          } catch (error) {
            mutationError = error;
            tx.abort();
            reject(error);
            return;
          }
          attempted = row;
          try { if (change || !request.result) objectStore.put(row); }
          catch (error) { tx.abort(); reject(error); }
        };
      });
      fallback = structuredClone(result);
      // Leave an independently modified legacy key alone. Existing accounts
      // never reimport it over the transactional authority.
      try {
        if (legacy.raw && storage?.getItem?.(legacyKey) === legacy.raw) storage.removeItem?.(legacyKey);
      } catch { /* Durable import already committed. */ }
      return result;
    } catch (error) {
      if (mutationError) throw error;
      durable = false;
      // A quota failure after reading another tab's row preserves that latest
      // attempted state in memory. It is explicitly not a durable save.
      if (attempted) fallback = structuredClone(attempted);
      else {
        const next = structuredClone(fallback);
        change?.(next);
        fallback = next;
      }
      return structuredClone(fallback);
    } finally {
      db?.close();
    }
  }

  function run(change) {
    const task = serial.then(() => transact(change));
    serial = task.catch(() => {});
    return task;
  }
  return Object.freeze({ read: () => run(), update: change => run(change), durable: () => durable });
}
