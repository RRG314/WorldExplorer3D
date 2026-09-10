const DB_NAME = 'world-explorer-reality-capture-v1';
const DB_VERSION = 1;
const DRAFTS = 'drafts';
const PHOTOS = 'photos';

function openDatabase(legacy=false) {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error('Local draft storage is unavailable in this browser.'));
      return;
    }
    const request = indexedDB.open(legacy?DB_NAME:`${DB_NAME}:${globalThis.WORLD_EXPLORER_FIREBASE?.projectId||'device-only'}`, DB_VERSION);
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

export async function loadLocalCaptureRecord(storeName, id) {
  if(![DRAFTS,PHOTOS].includes(storeName))throw Error('Invalid local capture record');
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{const transaction=db.transaction([storeName],'readonly'),request=transaction.objectStore(storeName).get(id);transaction.oncomplete=()=>{db.close();resolve(request.result||null);};transaction.onerror=()=>{db.close();reject(transaction.error);};});
}

export async function saveLocalCaptureDraftIfVersion(draft, expectedVersion=0) {
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{const tx=db.transaction([DRAFTS],'readwrite'),store=tx.objectStore(DRAFTS),get=store.get(draft.id);let conflict=false;
    get.onsuccess=()=>{if((get.result?.draftVersion||0)!==expectedVersion){conflict=true;tx.abort();return;}store.put({...draft,draftVersion:expectedVersion+1,updatedAtMs:Date.now()});};
    tx.oncomplete=()=>{db.close();resolve(expectedVersion+1);};tx.onabort=tx.onerror=()=>{db.close();reject(new Error(conflict?'This survey changed in another tab. Close and reopen it before editing.':'Local save failed. Your existing survey has been retained.'));};
  });
}

export async function saveLocalCapturePhoto(draftId, photo, sector) {
  await transact([PHOTOS], 'readwrite', (transaction) => transaction.objectStore(PHOTOS).put({
    id: photo.id,
    draftId,
    sector,
    blob: photo.blob,
    thumbnail: photo.thumbnail || null,
    width: photo.width,
    height: photo.height,
    contentType: photo.contentType,
    quality: photo.quality,
    sourceBytes: photo.sourceBytes,
    normalizedBytes: photo.normalizedBytes,
    inputOrigin: photo.inputOrigin?.kind === 'video-frame' && Number.isFinite(photo.inputOrigin.timestampSeconds)
      ? {kind:'video-frame',timestampSeconds:photo.inputOrigin.timestampSeconds} : null,
    createdAtMs: Date.now()
  }));
}

export async function deleteLocalCapturePhoto(draftId, photoId) {
  await transact([PHOTOS], 'readwrite', transaction => {
    const store = transaction.objectStore(PHOTOS);
    const request = store.get(photoId);
    request.onsuccess = () => { if (request.result?.draftId === draftId) store.delete(photoId); };
  });
}

export async function loadLocalCaptureDraft(draftId, {legacy=false}={}) {
  const db = await openDatabase(legacy);
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

// Legacy recovery is explicit: callers display the source and ask which photos
// to copy. No old capture id or account save is silently restored across projects.
export async function listLocalCaptureDrafts({legacy=false}={}) {
 const db=await openDatabase(legacy);
 return new Promise((resolve,reject)=>{const tx=db.transaction([DRAFTS],'readonly'),request=tx.objectStore(DRAFTS).getAll();tx.oncomplete=()=>{db.close();resolve(request.result||[]);};tx.onerror=()=>{db.close();reject(tx.error);};});
}
