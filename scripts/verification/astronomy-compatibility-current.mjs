import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createMemoryDiscoveryProfileStore } from '../../app/js/discovery/profile-store.js?v=5';
import { normalizeAstronomyCareer } from '../../app/js/campaign/astronomy-career.js';
import { canonicalFieldRecord } from '../../app/js/campaign/field-study-contract.js';
const source =
    'output/verification/planetary-career-20261103/world-1793702370055/qa-lunar-checkpoint.json',
  raw = await fs.readFile(source),
  data = JSON.parse(raw).discovery,
  store = createMemoryDiscoveryProfileStore();
assert.equal(data.profile.researchCareers.astronomy, undefined);
await store.importData(data);
const first = await store.exportData();
assert.deepEqual(first.profile.researchCareers.astronomy, normalizeAstronomyCareer());
const normal = (v) => ({
    ...v,
    exportedAt: 0,
    profile: {
      ...v.profile,
      updatedAt: 0,
      researchCareers: { ...v.profile.researchCareers, astronomy: normalizeAstronomyCareer() },
    },
  }),
  expected = canonicalFieldRecord(normal(data)),
  actual = canonicalFieldRecord(normal(first));
assert.equal(
  expected === actual,
  true,
  'Every existing payload field is retained; only new empty Astronomy and intentional import timestamps differ'
);
await store.importData(first);
const second = await store.exportData();
assert.equal(canonicalFieldRecord(normal(second)), actual);
const result = {
  scope:
    'Actual final Planetary source checkpoint (retained complete prior career history/media) through real memory reader with new empty Astronomy, not a gameplay or IndexedDB sequence.',
  source,
  sourceSha256: crypto.createHash('sha256').update(raw).digest('hex'),
  sameRetainedPayload: true,
  sameReimport: true,
  newEmptyAstronomy: true,
};
await fs.writeFile(
  'output/verification/astronomy-career-20261103/compatibility.json',
  JSON.stringify(result, null, 2) + '\n'
);
console.log(JSON.stringify(result));
