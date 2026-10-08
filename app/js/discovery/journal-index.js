// These rows are derived lookup metadata. Original Journal records and unknown
// fields remain untouched and are the only exported/rollback data authority.
export const JOURNAL_ORDER_STORE = 'journalOrder';
const KEYS = { items: 'instanceId', events: 'eventId', fieldGuide: 'catalogId', receiptOutbox: 'id' };
const TIMES = { items: 'collectedAt', events: 'occurredAt', fieldGuide: 'lastObservedAt' };

export function compareJournalRows(collection, left, right) {
  const time = row => { const n = Number(row[TIMES[collection]]); return Number.isFinite(n) ? n : 0; };
  const a = left[KEYS[collection]], b = right[KEYS[collection]];
  return time(right) - time(left) || (a < b ? -1 : a > b ? 1 : 0);
}

export function journalOrderRecord(collection, row, queued = false) {
  const id = row[KEYS[collection]];
  const numericTime = Number(row[TIMES[collection]]);
  const metadata = { collection, id, descendingTime: Number.isFinite(numericTime) ? -numericTime : 0 };
  if (collection === 'items') {
    metadata.disposition = row.serverItemId ? 'acknowledged' : queued ? 'queued' : 'device';
    metadata.receiptOwner = typeof row.receiptOwnerUid === 'string' ? row.receiptOwnerUid : '';
  }
  if (collection === 'receiptOutbox') {
    metadata.instanceId = row.instanceId;
    metadata.receiptOwner = row.ownerUid;
    metadata.receiptStatus = row.status;
    const readyAt = Number(row.nextAttemptAt);
    if (!Number.isNaN(readyAt)) metadata.readyAt = readyAt;
  }
  return metadata;
}

function scan(store, visit, completed = () => {}) {
  const request = store.openCursor();
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) { completed(); return; }
    visit(cursor.value); cursor.continue();
  };
}

export function installJournalOrder(db, transaction) {
  if (db.objectStoreNames.contains(JOURNAL_ORDER_STORE)) return;
  const metadata = db.createObjectStore(JOURNAL_ORDER_STORE, { keyPath: ['collection', 'id'] });
  metadata.createIndex('recent', ['collection', 'descendingTime', 'id']);
  metadata.createIndex('disposition', ['collection', 'disposition']);
  metadata.createIndex('ownedDisposition', ['collection', 'receiptOwner', 'disposition']);
  metadata.createIndex('receiptStatus', ['collection', 'receiptOwner', 'receiptStatus']);
  metadata.createIndex('receiptReady', ['collection', 'receiptOwner', 'receiptStatus', 'readyAt', 'id']);
  metadata.createIndex('receiptInstance', ['collection', 'instanceId']);
  const queued = new Set();
  scan(transaction.objectStore('receiptOutbox'), row => {
    queued.add(row.instanceId);
    metadata.put(journalOrderRecord('receiptOutbox', row));
  }, () => scan(transaction.objectStore('items'), row => metadata.put(journalOrderRecord('items', row, queued.has(row.instanceId)))));
  for (const collection of ['events', 'fieldGuide']) {
    scan(transaction.objectStore(collection), row => metadata.put(journalOrderRecord(collection, row)));
  }
}

export function rebuildJournalOrder(transaction, records) {
  const metadata = transaction.objectStore(JOURNAL_ORDER_STORE);
  metadata.clear();
  const queued = new Set((records.receiptOutbox || []).map(row => row.instanceId));
  for (const collection of Object.keys(KEYS)) {
    for (const row of records[collection] || []) metadata.put(journalOrderRecord(collection, row, queued.has(row.instanceId)));
  }
}

export function putJournalOrder(transaction, collection, row, queued = false) {
  transaction.objectStore(JOURNAL_ORDER_STORE).put(journalOrderRecord(collection, row, queued));
}

export function journalPageSize(value) {
  const count = Math.floor(Number(value));
  if (!Number.isFinite(count) || count < 0) throw new RangeError('Journal page size must be a finite nonnegative number.');
  return count;
}

function boundedRows(transaction, collection, index, range, limit) {
  const count = journalPageSize(limit);
  if (!count) return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    const reads = [], rows = transaction.objectStore(collection);
    const cursorRequest = transaction.objectStore(JOURNAL_ORDER_STORE).index(index).openCursor(range);
    cursorRequest.onerror = () => reject(cursorRequest.error);
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor || reads.length >= count) { Promise.all(reads).then(values => resolve(values.filter(Boolean)), reject); return; }
      reads.push(new Promise((yes, no) => {
        const request = rows.get(cursor.value.id);
        request.onsuccess = () => yes(request.result);
        request.onerror = () => no(request.error);
      }));
      if (reads.length >= count) Promise.all(reads).then(values => resolve(values.filter(Boolean)), reject);
      else cursor.continue();
    };
  });
}

export function recentJournalRows(transaction, collection, limit, ranges = globalThis.IDBKeyRange) {
  return boundedRows(transaction, collection, 'recent', ranges.bound([collection], [collection, []]), limit);
}

export function readyJournalReceipts(transaction, ownerUid, now, ranges = globalThis.IDBKeyRange) {
  return boundedRows(transaction, 'receiptOutbox', 'receiptReady',
    ranges.bound(['receiptOutbox', ownerUid, 'pending', -Infinity], ['receiptOutbox', ownerUid, 'pending', now, []]), 25);
}
