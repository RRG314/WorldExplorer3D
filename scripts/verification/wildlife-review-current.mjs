import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const source = path.resolve(process.env.WE3D_WILDLIFE_BACKUP || '');
assert.ok(
  source.startsWith(path.resolve('output/verification/wildlife-career-20261102') + path.sep) &&
    path.basename(source) === 'qa-fieldwork-backup.json'
);
const bytes = await fs.readFile(source),
  data = JSON.parse(bytes);
assert.equal(Object.keys(data.profile.researchCareers.wildlife.completed).length, 3);
const output = `output/verification/wildlife-career-20261102/review-${Date.now()}`,
  qa = await createFieldworkQaSession({ output, careerId: 'wildlife', maximumDurationMs: 240000 }),
  { page, report } = qa;
try {
  report.scope =
    'Affected Journal/Profile, source-evidence export/restore and lifecycle boundaries only. All completed physical studies are reused; no field procedure replay or new course.';
  report.source = { path: source, sha256: createHash('sha256').update(bytes).digest('hex') };
  await page.goto(
    (process.env.WE3D_PREVIEW_URL || 'http://127.0.0.1:4192') +
      '/app/?lat=39.3173&lon=-76.64044&name=Druid%20Hill%20Park&diagnostics=1'
  );
  report.storage = await page.evaluate(async (data) => {
    const { createIndexedDbDiscoveryProfileStore } = await import(
        '/app/js/discovery/profile-store.js?v=5'
      ),
      store = createIndexedDbDiscoveryProfileStore();
    await store.importData(data);
    const first = await store.exportData();
    if (first.schemaVersion !== 6 || first.researchMedia.length !== 2)
      throw Error('Expected actual two-photo v6 checkpoint');
    await store.importData(first);
    const second = await store.exportData();
    for (const photo of data.researchMedia) {
      const restored = await store.getResearchPhoto(photo.id);
      if (restored.photo.dataUrl !== photo.photo.dataUrl)
        throw Error('Actual photo pixels changed');
    }
    const missing = structuredClone(second);
    missing.researchMedia.pop();
    let rejected = false;
    try {
      await store.importData(missing);
    } catch {
      rejected = true;
    }
    if (!rejected) throw Error('Missing historical image admitted');
    const after = await store.exportData();
    if (JSON.stringify(after.events) !== JSON.stringify(second.events))
      throw Error('Rejected import altered history');
    return {
      version: second.schemaVersion,
      photos: second.researchMedia.length,
      completed: Object.keys(second.profile.researchCareers.wildlife.completed),
      missingRejected: true
    };
  }, data);
  await page.locator('#globeSelectorStartBtn').click();
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    window.__qaResearchWorldReady = () =>
      ctx.gameStarted && !ctx.worldLoading && !!ctx.worldDiscoveryRuntime;
  });
  await page.waitForFunction(() => window.__qaResearchWorldReady(), {}, { timeout: 180000 });
  await page.locator('#exploreBtn').click();
  await page.locator('#fWorldDiscovery').click();
  await page.locator('[data-discovery-tab=journal]').click();
  await page.waitForFunction(
    () => document.querySelectorAll('#discoveryJournalList .wildlife-report').length === 3,
    {},
    { timeout: 10000 }
  );
  const tracking = page
    .locator('#discoveryJournalList .wildlife-report')
    .filter({ has: page.locator('[data-research-photo]') });
  await tracking.locator('summary').click();
  await tracking.locator('[data-research-photo]').first().click();
  await tracking.locator('img').waitFor();
  assert.equal(
    await tracking.locator('img').evaluate((img) => img.complete && img.naturalWidth >= 64),
    true
  );
  await tracking.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/journal-restored-sign.png` });
  await page.locator('#discoveryProfileBtn').click();
  const badge = page.locator('[data-explorer-badge=paired-habitat-survey]');
  await badge.waitFor({ state: 'attached' });
  const group = page.locator('[data-profile-group=badges]');
  if (!(await group.evaluate((el) => el.open))) await group.locator('summary').click();
  await badge.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/profile-badge.png` });
  const state = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return {
      phase: (await ctx.discoveryProfileStore.getProfile()).researchCareers.wildlife.active.phase,
      courseRoots: ctx.scene.children.filter((row) => row.name === 'Field course · wildlife')
        .length,
      proxies: ctx.dynamicBuildingColliders.filter((row) =>
        row.sourceBuildingId?.startsWith('research-wildlife:')
      ).length
    };
  });
  assert.deepEqual(state, { phase: 'complete', courseRoots: 0, proxies: 0 });
  report.checks.push(
    'All three actual saved reports render in Journal; the diagnostic JPEG restores with its original pixels',
    'Habitat Observer badge is visibly present in existing Profile',
    'Backup v6 restores all actual evidence; missing historical image is rejected before replacing data',
    'Normal world entry does not instantiate a completed course or retain any course proxy'
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
