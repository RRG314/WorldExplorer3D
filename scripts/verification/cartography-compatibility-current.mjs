import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createMemoryDiscoveryProfileStore } from '../../app/js/discovery/profile-store.js?v=5';
import { normalizeCartographyCareer } from '../../app/js/campaign/cartography-career.js';
import { canonicalFieldRecord } from '../../app/js/campaign/field-study-contract.js';
const source =
    'output/verification/meteorology-career-20261103/world-1793692262543/qa-fieldwork-backup.json',
  raw = await fs.readFile(source),
  data = JSON.parse(raw),
  store = createMemoryDiscoveryProfileStore();
assert.equal(data.profile.researchCareers.cartography, undefined);
await store.importData(data);
const first = await store.exportData();
assert.deepEqual(first.profile.researchCareers.cartography, normalizeCartographyCareer());
const normal = (v) => ({
    ...v,
    exportedAt: 0,
    profile: {
      ...v.profile,
      updatedAt: 0,
      researchCareers: { ...v.profile.researchCareers, cartography: normalizeCartographyCareer() },
    },
  }),
  expected = canonicalFieldRecord(normal(data)),
  actual = canonicalFieldRecord(normal(first));
assert.equal(
  actual,
  expected,
  'All retained payload fields survive; only new empty Cartography and intentional import timestamps differ'
);
await store.importData(first);
assert.equal(canonicalFieldRecord(normal(await store.exportData())), actual);
const result = {
  scope:
    'Actual completed Meteorology/source revision25 and all prior history/media through the real memory reader, new empty Cartography. No source-play or IndexedDB claim.',
  source,
  sourceSha256: crypto.createHash('sha256').update(raw).digest('hex'),
  sameRetainedPayload: true,
  sameReimport: true,
  newEmptyCartography: true,
};
await fs.writeFile(
  'output/verification/cartography-career-20261103/compatibility.json',
  JSON.stringify(result, null, 2) + '\n'
);
console.log(JSON.stringify(result));
