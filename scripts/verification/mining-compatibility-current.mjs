import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createMemoryDiscoveryProfileStore } from '../../app/js/discovery/profile-store.js?v=5';
import { normalizeMiningCareer } from '../../app/js/campaign/mining-career.js';
import { canonicalFieldRecord } from '../../app/js/campaign/field-study-contract.js';

const source =
    'output/verification/astronomy-career-20261103/world-1793705746302/qa-fieldwork-backup.json',
  raw = await fs.readFile(source),
  data = JSON.parse(raw),
  store = createMemoryDiscoveryProfileStore();
assert.equal(data.profile.researchCareers.mining, undefined);
await store.importData(data);
const first = await store.exportData();
assert.deepEqual(first.profile.researchCareers.mining, normalizeMiningCareer());
const normal = (v) => ({
    ...v,
    exportedAt: 0,
    profile: {
      ...v.profile,
      updatedAt: 0,
      researchCareers: { ...v.profile.researchCareers, mining: normalizeMiningCareer() },
    },
  }),
  expected = canonicalFieldRecord(normal(data)),
  actual = canonicalFieldRecord(normal(first));
assert.equal(
  actual,
  expected,
  'Every retained source field survives; only empty Mining and import timestamps differ'
);
await store.importData(first);
assert.equal(canonicalFieldRecord(normal(await store.exportData())), actual);
const result = {
  scope:
    'Actual preceding Astronomy source checkpoint, including all prior history/media, through the current memory import reader. No gameplay or IndexedDB sequence replay.',
  source,
  sourceSha256: crypto.createHash('sha256').update(raw).digest('hex'),
  sameRetainedPayload: true,
  sameReimport: true,
  newEmptyMining: true,
};
await fs.writeFile(
  'output/verification/mining-career-20261103/compatibility.json',
  JSON.stringify(result, null, 2) + '\n'
);
console.log(JSON.stringify(result));
