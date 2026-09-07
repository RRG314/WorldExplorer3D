const DB_NAME = 'world-explorer-reality-capture-v1';
const DB_VERSION = 1;
const DRAFTS = 'drafts';
const PHOTOS = 'photos';

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error('Local draft storage is unavailable in this browser.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error || new Error('Could not open local draft storage.'));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DRAFTS)) db.createObjectStore(DRAFTS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(PHOTOS)) {
        const store = db.createObjectStore(PHOTOS, { keyPath: 'id' });
        store.createIndex('draftId', 'draftId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function transact(storeNames, mode, callback) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeNames, mode);
    transaction.onerror = () => reject(transaction.error || new Error('Local draft operation failed.'));
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    callback(transaction);
  });
}

export async function saveLocalCaptureDraft(draft) {
  await transact([DRAFTS], 'readwrite', (transaction) => transaction.objectStore(DRAFTS).put({
    ...draft,
    updatedAtMs: Date.now()
  }));
}

export async function saveLocalCapturePhoto(draftId, photo, sector) {
  await transact([PHOTOS], 'readwrite', (transaction) => transaction.objectStore(PHOTOS).put({
    id: photo.id,
    draftId,
    sector,
    blob: photo.blob,
    width: photo.width,
    height: photo.height,
    contentType: photo.contentType,
    quality: photo.quality,
    sourceBytes: photo.sourceBytes,
    normalizedBytes: photo.normalizedBytes,
    createdAtMs: Date.now()
  }));
}

export async function loadLocalCaptureDraft(draftId) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([DRAFTS, PHOTOS], 'readonly');
    const draftRequest = transaction.objectStore(DRAFTS).get(draftId);
    const photoRequest = transaction.objectStore(PHOTOS).index('draftId').getAll(draftId);
    transaction.onerror = () => reject(transaction.error || new Error('Could not restore the local capture.'));
    transaction.oncomplete = () => {
      db.close();
      resolve({ draft: draftRequest.result || null, photos: photoRequest.result || [] });
    };
  });
}

export async function deleteLocalCaptureDraft(draftId) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([DRAFTS, PHOTOS], 'readwrite');
    transaction.objectStore(DRAFTS).delete(draftId);
    const index = transaction.objectStore(PHOTOS).index('draftId');
    const cursorRequest = index.openCursor(IDBKeyRange.only(draftId));
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) return;
      cursor.delete();
      cursor.continue();
    };
    transaction.onerror = () => reject(transaction.error || new Error('Could not clear the local capture.'));
    transaction.oncomplete = () => {
      db.close();
      resolve(true);
    };
  });
}
