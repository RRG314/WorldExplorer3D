import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { createMemoryDiscoveryProfileStore } from '../../app/js/discovery/profile-store.js?v=5';
import { canonicalFieldRecord as c } from '../../app/js/campaign/field-study-contract.js';
const source = process.env.WE3D_ACCELERATOR_RECOVERY;
assert.match(source || '', /accelerator-career-20261103\/world-\d+\/qa-fieldwork-backup\.json$/);
const raw = await fs.readFile(source),
  data = JSON.parse(raw);
assert.equal(Object.keys(data.profile.researchCareers.accelerator.completed).length, 3);
const store = createMemoryDiscoveryProfileStore();
await store.importData(data);
const first = await store.exportData(),
  normal = (v) => ({ ...v, exportedAt: 0, profile: { ...v.profile, updatedAt: 0 } });
assert.equal(c(normal(first)), c(normal(data)));
await store.importData(first);
assert.equal(c(normal(await store.exportData())), c(normal(first)));
const before = JSON.parse(
  await fs.readFile(
    'output/verification/mining-career-20261103/world-1793712140345/qa-fieldwork-backup.json'
  )
);
for (const [id, state] of Object.entries(before.profile.researchCareers))
  assert.equal(c(data.profile.researchCareers[id]), c(state), id + ' original career records');
const events = new Map(data.events.map((e) => [e.eventId, e]));
for (const event of before.events)
  assert.equal(c(events.get(event.eventId)), c(event), 'Retained original event ' + event.eventId);
const result = {
  scope:
    'Actual three-study browser source checkpoint through the current Node import/history reader; complete retained payload, prior career records and old events unchanged. No scientific or gameplay procedure replay.',
  source,
  sourceSha256: crypto.createHash('sha256').update(raw).digest('hex'),
  samePayload: true,
  sameReimport: true,
  retainedPriorCareers: Object.keys(before.profile.researchCareers),
  retainedPriorEvents: before.events.length,
};
await fs.writeFile(
  'output/verification/accelerator-career-20261103/compatibility.json',
  JSON.stringify(result, null, 2) + '\n'
);
console.log(JSON.stringify(result));
