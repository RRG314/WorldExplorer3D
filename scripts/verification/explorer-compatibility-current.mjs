import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createMemoryDiscoveryProfileStore } from '../../app/js/discovery/profile-store.js?v=5';
import { explorerCareerView } from '../../app/js/campaign/explorer-career.js';
import { canonicalFieldRecord as c } from '../../app/js/campaign/field-study-contract.js';
const source = process.env.WE3D_EXPLORER_RECOVERY,
  possessions = process.env.WE3D_EXPLORER_POSSESSIONS;
if (!source || !possessions)
  throw Error('Choose genuine completed Explorer and possessions checkpoints.');
const raw = await fs.readFile(source),
  data = JSON.parse(raw),
  prior = JSON.parse(
    await fs.readFile(
      'output/verification/documentary-career-20261103/review-1793746059326/qa-fieldwork-backup.json'
    )
  );
for (const key of ['researchCareers', 'threeViews', 'harborRun'])
  assert.deepEqual(data.profile[key], prior.profile[key]);
assert.deepEqual(data.profile.homeAchievements.maker, prior.profile.homeAchievements.maker);
for (const event of prior.events)
  assert.equal(c(data.events.find((e) => e.eventId === event.eventId)), c(event));
assert.equal(explorerCareerView(data.profile, data.events).phase, 'complete');
assert.equal(data.profile.openingChapter.phase, 'complete');
assert.equal(
  data.events.filter((e) => e.eventId === 'event:campaign:from-the-harbor:v1').length,
  1
);
const currentItems = JSON.parse(await fs.readFile(possessions)),
  priorItems = JSON.parse(
    await fs.readFile(
      'output/verification/documentary-career-20261103/world-1793745622639/possessions.json'
    )
  ),
  homes = (v) => v.housing.homes,
  home = homes(currentItems).find((h) => h.id === currentItems.housing.starterHomeId),
  oldHome = homes(priorItems).find((h) => h.id === home.id);
assert.deepEqual(home.workspace.projects.reports, oldHome.workspace.projects.reports);
assert.equal(home.workspace.recordId, 'event:destination-mission:moon');
assert.ok(home.journey.returned > 0);
const store = createMemoryDiscoveryProfileStore(),
  normal = (v) => ({ ...v, exportedAt: 0, profile: { ...v.profile, updatedAt: 0 } });
await store.importData(data);
const first = await store.exportData();
assert.equal(c(normal(first)), c(normal(data)));
await store.importData(first);
assert.equal(c(normal(await store.exportData())), c(normal(first)));
const report = {
  scope:
    'Current reader applied to the genuine resumed source chain, with accepted original lunar/control evidence preserved. No uninterrupted H01–H12 playthrough or old chapter replay claim.',
  source,
  sha256: createHash('sha256').update(raw).digest('hex'),
  priorCareerStates: Object.keys(prior.profile.researchCareers).length,
  priorEvents: prior.events.length,
  preservedHistory: true,
  originalDocumentaryAndPilotUnchanged: true,
  originalMakerReportsUnchanged: true,
  firstBearingsComplete: true,
  actualCityLunarDisplay: true,
  fullCampaignReceipts: 1,
  memoryReimport: true,
};
await fs.writeFile(
  'output/verification/explorer-career-20261103/compatibility.json',
  JSON.stringify(report, null, 2) + '\n'
);
console.log(JSON.stringify(report));
