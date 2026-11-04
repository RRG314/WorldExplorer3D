import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createMemoryDiscoveryProfileStore } from '../../app/js/discovery/profile-store.js?v=5';
import { canonicalFieldRecord } from '../../app/js/campaign/field-study-contract.js';
import { createLocalBackpackStore } from '../../app/js/player/backpack-store.js?v=2';
import { createHousingModel } from '../../app/js/real-estate/housing-model.js?v=2';
import { validateWorkspaceProjectReport } from '../../app/js/campaign/workspace-projects.js';
import { validateWorkspacePlacement } from '../../app/js/campaign/personal-workspace.js';
const original = JSON.parse(
    await fs.readFile(
      'output/verification/accelerator-career-20261103/review-1793732658263/qa-fieldwork-backup.json'
    )
  ),
  source = 'output/verification/engineering-career-20261103/entrance-1793735353782',
  raw = await fs.readFile(source + '/qa-fieldwork-backup.json'),
  data = JSON.parse(raw),
  possessions = JSON.parse(await fs.readFile(source + '/possessions.json'));
assert.deepEqual(data.profile.researchCareers, original.profile.researchCareers);
for (const event of original.events)
  assert.equal(
    canonicalFieldRecord(data.events.find((e) => e.eventId === event.eventId)),
    canonicalFieldRecord(event)
  );
const home = possessions.housing.homes.find((h) => h.id === possessions.housing.starterHomeId),
  reports = Object.values(home.workspace.projects.reports);
assert.equal(reports.length, 3);
for (const report of reports) {
  validateWorkspaceProjectReport(report, validateWorkspacePlacement);
  const event = data.events.find((e) => e.metadata?.workspaceDesignReport?.id === report.id);
  assert.deepEqual(event.metadata.workspaceDesignReport, report);
  assert.ok(data.events.some((e) => e.eventId === report.recordId));
}
const store = createMemoryDiscoveryProfileStore();
await store.importData(data);
const first = await store.exportData(),
  normal = (v) => ({ ...v, exportedAt: 0, profile: { ...v.profile, updatedAt: 0 } });
assert.equal(canonicalFieldRecord(normal(first)), canonicalFieldRecord(normal(data)));
await store.importData(first);
assert.equal(
  canonicalFieldRecord(normal(await store.exportData())),
  canonicalFieldRecord(normal(first))
);
const corrupt = structuredClone(first);
corrupt.events.find(
  (e) => e.metadata?.workspaceDesignReport
).metadata.workspaceDesignReport.use.position.x += 30;
await assert.rejects(store.importData(corrupt));
assert.equal(
  canonicalFieldRecord(normal(await store.exportData())),
  canonicalFieldRecord(normal(first))
);
const values = new Map([['world-explorer:character-backpack:v3', JSON.stringify(possessions)]]),
  storage = {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v),
    removeItem: (k) => values.delete(k),
  },
  backpack = createLocalBackpackStore(storage);
await backpack.ready;
const housing = createHousingModel({ backpackStore: backpack });
assert.deepEqual(housing.snapshot().homes.find((h) => h.id === home.id).workspace, home.workspace);
const result = {
  scope: 'Current readers applied to genuine three-project source checkpoint; no methods replayed.',
  source,
  sha256: createHash('sha256').update(raw).digest('hex'),
  priorCareers: Object.keys(original.profile.researchCareers).length,
  priorEvents: original.events.length,
  preservedHistory: true,
  reports: 3,
  sourceJournalMatchesPossessions: true,
  reimport: true,
  corruptRawUseRejected: true,
  rollback: true,
  housingReload: true,
};
await fs.writeFile(
  'output/verification/engineering-career-20261103/compatibility.json',
  JSON.stringify(result, null, 2) + '\n'
);
console.log(JSON.stringify(result));
