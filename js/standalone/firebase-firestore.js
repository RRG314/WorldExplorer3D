function unavailable() {
  const error = new Error('Cloud data is unavailable in the standalone local edition.');
  error.code = 'standalone/unavailable';
  return error;
}

function reference(kind, segments) {
  const path = segments.filter(Boolean).map(String).join('/');
  return Object.freeze({ kind, path, id: path.split('/').pop() || '' });
}

function documentSnapshot(ref) {
  return Object.freeze({
    id: ref?.id || '',
    ref,
    exists: () => false,
    data: () => undefined,
    get: () => undefined
  });
}

function querySnapshot() {
  return Object.freeze({
    empty: true,
    size: 0,
    docs: Object.freeze([]),
    forEach: () => {},
    docChanges: () => []
  });
}

export class Timestamp {
  constructor(seconds, nanoseconds = 0) {
    this.seconds = Number(seconds) || 0;
    this.nanoseconds = Number(nanoseconds) || 0;
  }

  static now() { return Timestamp.fromMillis(Date.now()); }
  static fromDate(date) { return Timestamp.fromMillis(date.getTime()); }
  static fromMillis(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    return new Timestamp(seconds, Math.floor((milliseconds - seconds * 1000) * 1e6));
  }

  toDate() { return new Date(this.toMillis()); }
  toMillis() { return this.seconds * 1000 + this.nanoseconds / 1e6; }
}

export function getFirestore() { return Object.freeze({ type: 'standalone-firestore' }); }
export function connectFirestoreEmulator() {}
export function collection(_parent, ...segments) { return reference('collection', segments); }
export function doc(_parent, ...segments) { return reference('document', segments); }
export function query(base, ...constraints) { return Object.freeze({ ...base, constraints }); }
export function where(...args) { return Object.freeze({ type: 'where', args }); }
export function orderBy(...args) { return Object.freeze({ type: 'orderBy', args }); }
export function limit(value) { return Object.freeze({ type: 'limit', value }); }
export async function getDoc(ref) { return documentSnapshot(ref); }
export async function getDocFromServer(ref) { return documentSnapshot(ref); }
export async function getDocs() { return querySnapshot(); }
export async function getDocsFromServer() { return querySnapshot(); }
export function onSnapshot(target, next, error) {
  queueMicrotask(() => {
    try {
      next?.(target?.kind === 'document' ? documentSnapshot(target) : querySnapshot());
    } catch (snapshotError) {
      error?.(snapshotError);
    }
  });
  return () => {};
}
export function serverTimestamp() { return Timestamp.now(); }
export function deleteField() { return Object.freeze({ type: 'deleteField' }); }
export function arrayUnion(...values) { return Object.freeze({ type: 'arrayUnion', values }); }
export function increment(value) { return Object.freeze({ type: 'increment', value }); }
export async function setDoc() { throw unavailable(); }
export async function deleteDoc() { throw unavailable(); }
export async function runTransaction() { throw unavailable(); }
export function writeBatch() {
  return Object.freeze({
    set() { return this; },
    update() { return this; },
    delete() { return this; },
    async commit() { throw unavailable(); }
  });
}
