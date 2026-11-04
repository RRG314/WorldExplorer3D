import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createMemoryDiscoveryProfileStore } from '../../app/js/discovery/profile-store.js?v=5';
import { canonicalFieldRecord as c } from '../../app/js/campaign/field-study-contract.js';
const source = process.env.WE3D_PILOT_REVIEW;
if (!source) throw Error('Choose the genuine completed source checkpoint.');
const raw = await fs.readFile(source),
  data = JSON.parse(raw),
  prior = JSON.parse(
    await fs.readFile(
      'output/verification/engineering-career-20261103/review-1793736943140/qa-fieldwork-backup.json'
    )
  );
assert.deepEqual(data.profile.researchCareers, prior.profile.researchCareers);
assert.deepEqual(data.profile.threeViews, prior.profile.threeViews);
assert.deepEqual(data.profile.openingChapter, prior.profile.openingChapter);
for (const event of prior.events)
  assert.equal(c(data.events.find((e) => e.eventId === event.eventId)), c(event));
const base = data.profile.harborRun,
  job = base.continuations.jobs['return-case'];
assert.equal(base.phase, 'complete');
assert.equal(job.phase, 'complete');
assert.equal(job.route.caseId, 'field-case:' + base.route.id);
assert.equal(data.events.filter((e) => e.metadata?.pilotDeliveryReport).length, 1);
const beforeReturn = JSON.parse(
  await fs.readFile(
    'output/verification/pilot-career-20261103/world-1793741063022/qa-fieldwork-failed-backup.json'
  )
).profile.harborRun;
for (const key of Object.keys(beforeReturn).filter(
  (k) => !['continuations', 'revision'].includes(k)
))
  assert.deepEqual(base[key], beforeReturn[key]);
const store = createMemoryDiscoveryProfileStore(),
  normal = (v) => ({ ...v, exportedAt: 0, profile: { ...v.profile, updatedAt: 0 } });
await store.importData(data);
const first = await store.exportData();
assert.equal(c(normal(first)), c(normal(data)));
await store.importData(first);
assert.equal(c(normal(await store.exportData())), c(normal(first)));
const bad = structuredClone(first);
bad.profile.harborRun.continuations.jobs['return-case'].route.pickup.y += 8;
await assert.rejects(store.importData(bad));
assert.equal(c(normal(await store.exportData())), c(normal(first)));
const result = {
  scope: 'Current reader applied to genuine source states. No accepted driving or cargo replay.',
  source,
  sha256: createHash('sha256').update(raw).digest('hex'),
  priorCareerStates: Object.keys(prior.profile.researchCareers).length,
  priorEvents: prior.events.length,
  preservedHistory: true,
  originalDeliveryAndFinishUnchanged: true,
  reports: 1,
  sameCase: true,
  reimport: true,
  alteredDeckRejected: true,
  rollback: true,
};
await fs.writeFile(
  'output/verification/pilot-career-20261103/compatibility.json',
  JSON.stringify(result, null, 2) + '\n'
);
console.log(JSON.stringify(result));
