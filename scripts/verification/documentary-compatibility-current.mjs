import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createMemoryDiscoveryProfileStore } from '../../app/js/discovery/profile-store.js?v=5';
import { canonicalFieldRecord as c } from '../../app/js/campaign/field-study-contract.js';
const source = process.env.WE3D_DOCUMENTARY_REVIEW;
if (!source) throw Error('Choose the genuine completed source checkpoint.');
const raw = await fs.readFile(source),
  data = JSON.parse(raw),
  prior = JSON.parse(
    await fs.readFile(
      'output/verification/pilot-career-20261103/review-1793741706007/qa-fieldwork-backup.json'
    )
  );
for (const key of ['researchCareers', 'harborRun', 'openingChapter', 'personalHome'])
  assert.deepEqual(data.profile[key], prior.profile[key]);
for (const event of prior.events)
  assert.equal(c(data.events.find((e) => e.eventId === event.eventId)), c(event));
assert.equal(data.events.filter((e) => e.metadata?.documentaryStoryReport).length, 1);
const store = createMemoryDiscoveryProfileStore(),
  normal = (v) => ({ ...v, exportedAt: 0, profile: { ...v.profile, updatedAt: 0 } });
await store.importData(data);
const first = await store.exportData();
assert.equal(c(normal(first)), c(normal(data)));
await store.importData(first);
assert.equal(c(normal(await store.exportData())), c(normal(first)));
const result = {
  scope: 'Current reader applied to genuine source; no accepted career procedure replay.',
  source,
  sha256: createHash('sha256').update(raw).digest('hex'),
  priorCareerStates: Object.keys(prior.profile.researchCareers).length,
  priorEvents: prior.events.length,
  preservedHistory: true,
  originalPilotAndHomeUnchanged: true,
  originalFirstBearingsUnchanged: true,
  originalThreeViewsReceipt: data.events.filter(
    (e) => e.eventId === 'event:campaign-completed:three-views:v1'
  ).length,
  stories: 1,
  reimport: true,
};
await fs.writeFile(
  'output/verification/documentary-career-20261103/compatibility.json',
  JSON.stringify(result, null, 2) + '\n'
);
console.log(JSON.stringify(result));
