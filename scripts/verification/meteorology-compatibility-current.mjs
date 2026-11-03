import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createMemoryDiscoveryProfileStore } from '../../app/js/discovery/profile-store.js?v=5';
import { normalizeMeteorologyCareer } from '../../app/js/campaign/meteorology-career.js';
import { canonicalFieldRecord } from '../../app/js/campaign/field-study-contract.js';
const source =
    'output/verification/hydrology-career-20261103/world-1793689368666/qa-fieldwork-backup.json',
  raw = await fs.readFile(source),
  data = JSON.parse(raw),
  store = createMemoryDiscoveryProfileStore();
assert.equal(data.profile.researchCareers.meteorology, undefined);
await store.importData(data);
const first = await store.exportData();
assert.deepEqual(first.profile.researchCareers.meteorology, normalizeMeteorologyCareer());
const normal = (v) => ({
    ...v,
    exportedAt: 0,
    profile: {
      ...v.profile,
      updatedAt: 0,
      researchCareers: { ...v.profile.researchCareers, meteorology: normalizeMeteorologyCareer() },
    },
  }),
  expected = canonicalFieldRecord(normal(data)),
  actual = canonicalFieldRecord(normal(first));
assert.equal(
  expected === actual,
  true,
  'Every existing payload field is retained; only new empty Meteorology and intentional import timestamps differ'
);
await store.importData(first);
const second = await store.exportData();
assert.equal(canonicalFieldRecord(normal(second)), actual);
const result = {
  scope:
    'Actual Hydro revision28 source seed (retained Ocean/Marine history/media) through real memory reader with new empty Meteorology, not a gameplay or IndexedDB sequence.',
  source,
  sourceSha256: crypto.createHash('sha256').update(raw).digest('hex'),
  sameRetainedPayload: true,
  sameReimport: true,
  newEmptyMeteorology: true,
};
await fs.writeFile(
  'output/verification/meteorology-career-20261103/compatibility.json',
  JSON.stringify(result, null, 2) + '\n'
);
console.log(JSON.stringify(result));
