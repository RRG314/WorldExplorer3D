import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { canonicalFieldRecord as canonical } from '../../app/js/campaign/field-study-contract.js';
const root = 'output/verification/companion-handling-20261103',
  source = root + '/world-1793750589977/final-backup.json',
  prior = JSON.parse(
    await fs.readFile(
      'output/verification/explorer-career-20261103/review-1793748931923/qa-fieldwork-backup.json'
    )
  ),
  current = JSON.parse(await fs.readFile(source));
for (const key of [
  'researchCareers',
  'threeViews',
  'harborRun',
  'openingChapter',
  'homeAchievements',
])
  assert.equal(canonical(current.profile[key]), canonical(prior.profile[key]));
for (const event of prior.events)
  assert.equal(
    canonical(current.events.find((e) => e.eventId === event.eventId)),
    canonical(event)
  );
const old = prior.companions[0],
  c = current.companions.find((c) => c.instanceId === old.instanceId),
  memory = current.events.filter(
    (e) => e.eventId === `event:companion:training:${c.instanceId}:recall`
  );
assert.equal(c.name, old.name);
assert.equal(c.catalogId, old.catalogId);
assert.equal(c.progression.totalXp, old.progression.totalXp + 20);
assert.equal(memory.length, 1);
assert.equal(memory[0].metadata.companionRecall.completedAt, c.training.records.recall.completedAt);
const report = {
  source,
  scope:
    'Genuine resumed source profile and original history; no synthetic career completion or species/venue replay',
  priorCareers: Object.keys(prior.profile.researchCareers).length,
  priorEvents: prior.events.length,
  allPriorEventsUnchanged: true,
  originalCampaignsAndAlbumsUnchanged: true,
  companionIdentityPreserved: true,
  careXp: 5,
  recallXp: 15,
  recallMemories: 1,
};
await fs.writeFile(root + '/compatibility.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
