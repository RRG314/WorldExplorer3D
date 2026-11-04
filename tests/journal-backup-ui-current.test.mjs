import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bindJournalBackupExport,
  journalBackupSummary,
} from '../app/js/discovery/journal-backup-ui.js';
const node = () => ({ disabled: false, textContent: '' });
const setup = (store, overrides = {}) => {
  const status = node(),
    button = node(),
    storage = node(),
    timers = new Map(),
    downloads = [],
    host = {
      Blob,
      URL: {
        createObjectURL: (b) => {
          downloads.push(b);
          return 'blob:controlled';
        },
        revokeObjectURL() {},
      },
      document: { body: { append() {} }, createElement: () => ({ click() {}, remove() {} }) },
      setTimeout: (fn) => {
        timers.set(1, fn);
        return 1;
      },
      clearTimeout: (id) => timers.delete(id),
      navigator: { storage: { estimate: async () => ({ usage: 1024, quota: 2048 }) } },
    };
  const binding = bindJournalBackupExport({
    store,
    status,
    exportButton: button,
    storageButton: storage,
    listen() {},
    host,
    ...overrides,
  });
  return { binding, status, button, storage, downloads, timers, host };
};
test('backup summary counts original album pixels separately from field-photo records without copying their bytes', () => {
  const photo = { dataUrl: 'data:image/jpeg;base64,/9j/2Q==' },
    data = {
      events: [{ eventId: 'original' }],
      albums: [{ photos: [photo] }],
      researchMedia: [{ photo }],
    };
  const before = structuredClone(data);
  assert.deepEqual(journalBackupSummary(data), { memories: 1, photographs: 2, photoBytes: 8 });
  assert.deepEqual(data, before);
});
test('one pending read disables competing actions; a duplicate click cannot export a second snapshot', async () => {
  let resolve,
    calls = 0;
  const x = setup({
      exportData: () => {
        calls++;
        return new Promise((r) => (resolve = r));
      },
    }),
    first = x.binding.exportBackup();
  assert.equal(x.button.disabled, true);
  assert.equal(await x.binding.exportBackup(), false);
  resolve({ events: [], albums: [], researchMedia: [] });
  assert.equal(await first, true);
  assert.equal(calls, 1);
  assert.equal(x.downloads.length, 1);
  assert.equal(x.button.disabled, false);
  assert.match(x.status.textContent, /0 photographs/);
  x.binding.dispose();
  assert.equal(x.timers.size, 0);
});
test('failed export keeps records and friendly retry copy; disposal ignores a late read', async () => {
  const x = setup({
    exportData: async () => {
      throw Error('PRIVATE error implementation detail');
    },
  });
  assert.equal(await x.binding.exportBackup(), false);
  assert.match(x.status.textContent, /Saved records and photographs are kept/);
  assert.doesNotMatch(x.status.textContent, /PRIVATE/);
  let resolve;
  const y = setup({ exportData: () => new Promise((r) => (resolve = r)) }),
    pending = y.binding.exportBackup();
  y.binding.dispose();
  const text = y.status.textContent;
  resolve({ events: [] });
  assert.equal(await pending, false);
  assert.equal(y.downloads.length, 0);
  assert.equal(y.status.textContent, text);
  assert.equal(y.button.disabled, false);
});
test('storage estimation is explicit, optional and never writes or prunes Journal records', async () => {
  let reads = 0;
  const x = setup({
    exportData: async () => {
      reads++;
      return {};
    },
  });
  await x.binding.checkStorage();
  assert.match(x.status.textContent, /including downloaded world data/);
  assert.equal(reads, 0);
  x.host.navigator.storage.estimate = async () => {
    throw Error('Unavailable');
  };
  await x.binding.checkStorage();
  assert.match(x.status.textContent, /unavailable in this browser/);
  x.binding.dispose();
});
