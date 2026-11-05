import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { JOURNEY_LOCAL_KEYS } from '../../app/js/player/journey-format.js';
const require = createRequire(import.meta.url);
const { createJourneyAuthority } = require('../../functions/journey-authority.js');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
export function fixture() {
  const docs = new Map(),
    files = new Map();
  let time = 10000,
    tail = Promise.resolve();
  const ref = (key) => ({
    key,
    collection: (name) => ({ doc: (id) => ref(key + '/' + name + '/' + id) }),
    async get() {
      return { data: () => structuredClone(docs.get(key)) };
    },
  });
  const db = {
    collection: (name) => ({ doc: (id) => ref(name + '/' + id) }),
    runTransaction(fn) {
      const result = tail.then(() =>
        fn({ get: (r) => r.get(), set: (r, value) => docs.set(r.key, structuredClone(value)) })
      );
      tail = result.catch(() => {});
      return result;
    },
  };
  const bucket = {
    file: (path) => ({
      async save(bytes) {
        if (files.has(path)) throw Object.assign(Error(), { code: 412 });
        files.set(path, { bytes: Buffer.from(bytes), hash: hash(bytes) });
      },
      async getMetadata() {
        const value = files.get(path);
        return [{ size: String(value.bytes.length), metadata: { sha256: value.hash } }];
      },
      async download() {
        const value = files.get(path);
        if (!value) throw Object.assign(Error(), { code: 404 });
        return [Buffer.from(value.bytes)];
      },
    }),
    async deleteFiles({ prefix }) {
      for (const key of files.keys()) if (key.startsWith(prefix)) files.delete(key);
    },
  };
  return {
    api: createJourneyAuthority({ db, bucket, now: () => time }),
    files,
    docs,
    advance: (ms) => (time += ms),
  };
}
export function envelope(uid = 'account-a') {
  return {
    schemaVersion: 1,
    ownerUid: uid,
    journal: {
      profile: { id: 'local-explorer', journeyPreferences: { explorerName: 'River' } },
      events: [],
      items: [],
      fieldGuide: [],
      companions: [],
    },
    receiptOutbox: [],
    deviceState: {
      backpack: null,
      local: Object.fromEntries(JOURNEY_LOCAL_KEYS.map((key) => [key, null])),
    },
  };
}
