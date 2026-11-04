import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const source = path.resolve(process.env.WE3D_FOSSIL_BACKUP || '');
assert.ok(
  source.startsWith(path.resolve('output/verification/palaeontology-career-20261102') + path.sep) &&
    path.basename(source) === 'qa-fieldwork-backup.json'
);
const data = JSON.parse(await fs.readFile(source)),
  output = `output/verification/palaeontology-career-20261102/envelope-${Date.now()}`,
  qa = await createFieldworkQaSession({
    output,
    careerId: 'palaeontology',
    maximumDurationMs: 90000
  }),
  { page, report } = qa;
try {
  report.scope =
    'Only the new backup-file version boundary, using the actual completed source checkpoint. No case commands or gameplay are replayed; the storage database remains v5.';
  report.source = source;
  await page.goto(
    (process.env.WE3D_PREVIEW_URL || 'http://127.0.0.1:4192') + '/tests/fixtures/field-store.html'
  );
  report.result = await page.evaluate(async (data) => {
    const { createIndexedDbDiscoveryProfileStore, createMemoryDiscoveryProfileStore } =
        await import('/app/js/discovery/profile-store.js'),
      store = createIndexedDbDiscoveryProfileStore();
    await store.importData(data);
    const exported = await store.exportData();
    await store.importData(exported);
    const roundTrip = await store.exportData();
    await store.importData(await createMemoryDiscoveryProfileStore().exportData());
    await store.rollbackLastImport();
    const restored = await store.exportData();
    return {
      fileVersion: exported.schemaVersion,
      profileVersion: exported.profile.schemaVersion,
      photos: exported.researchMedia.length,
      unchanged:
        JSON.stringify(exported.researchMedia) === JSON.stringify(data.researchMedia) &&
        JSON.stringify(roundTrip.researchMedia) === JSON.stringify(data.researchMedia) &&
        JSON.stringify(restored.researchMedia) === JSON.stringify(data.researchMedia),
      completed: Object.keys(restored.profile.researchCareers.palaeontology.completed).length
    };
  }, data);
  assert.deepEqual(report.result, {
    fileVersion: 6,
    profileVersion: 5,
    photos: 6,
    unchanged: true,
    completed: 3
  });
  report.checks.push(
    'Actual v5 development checkpoint imports; new export uses v6, all original JPEGs survive v6 import and rollback, and profile/database version stays v5.'
  );
  report.ok = true;
  await fs.writeFile(`${output}/receipt.json`, JSON.stringify(report, null, 2) + '\n');
  console.log('PASS ' + output);
} catch (error) {
  await qa.fail(error);
  throw error;
} finally {
  await qa.close();
}
