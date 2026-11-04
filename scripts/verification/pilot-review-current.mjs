import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const source = process.env.WE3D_PILOT_REVIEW;
if (!source) throw Error('Choose the genuine completed Pilot source checkpoint.');
const backup = JSON.parse(await fs.readFile(source)),
  base = backup.profile.harborRun,
  output = 'output/verification/pilot-career-20261103/review-' + Date.now(),
  qa = await createFieldworkQaSession({
    output,
    careerId: 'pilot',
    maximumDurationMs: 7 * 60 * 1000,
  }),
  { page, report } = qa;
assert.equal(base.phase, 'complete');
assert.equal(base.continuations.jobs['return-case'].phase, 'complete');
try {
  report.scope =
    'Completed actual-source Activities revisit, shared Journal/Profile and whole IndexedDB backup roundtrip/corrupt custody rollback. No accepted driving/cargo/quota matrix replay.';
  report.source = source;
  await page.goto('http://127.0.0.1:4192/app/?diagnostics=1');
  await page.evaluate(async (b) => {
    const { createIndexedDbDiscoveryProfileStore } = await import(
      '/app/js/discovery/profile-store.js?v=5'
    );
    await createIndexedDbDiscoveryProfileStore().importData(b);
  }, backup);
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      { openJourneyJournal } = await import('/app/js/discovery/journey-journal.js');
    await openJourneyJournal(ctx);
  });
  assert.equal(await page.locator('.pilot-delivery-report').count(), 1);
  assert.equal(await page.locator('.workspace-design-report').count(), 3);
  await page.locator('.pilot-delivery-report > summary').click();
  await page.locator('.pilot-delivery-report svg').scrollIntoViewIfNeeded();
  await page.screenshot({ path: output + '/title-journal.png' });
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      { closeJourneyJournal } = await import('/app/js/discovery/journey-journal.js');
    closeJourneyJournal(ctx);
  });
  await page.getByRole('button', { name: '⌖ Activities', exact: true }).click();
  await page.locator('[data-experience-id="career:expedition-pilot"]').click();
  await page.locator('[data-experience-variant]').selectOption('return-case');
  await page.locator('[data-experience-begin]').click();
  await qa.waitForCareer('return-case');
  const restored = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return (await ctx.discoveryProfileStore.getProfile()).harborRun;
  });
  assert.deepEqual(restored, base);
  await qa.record(
    'Completed assignment opens original custody, route, handling, finish and revision unchanged'
  );
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.openWorldDiscoverySection('journal');
  });
  const plate = page.locator('#discoveryJournalList .pilot-delivery-report');
  await plate.waitFor();
  assert.equal(await plate.count(), 1);
  await plate.locator('summary').click();
  assert.doesNotMatch(await plate.innerText(), /undefined|NaN|Infinity/);
  for (const [width, height] of [
    [1280, 800],
    [390, 844],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await plate.locator('svg').scrollIntoViewIfNeeded();
    assert.equal(await plate.evaluate((e) => e.scrollWidth > e.clientWidth + 1), false);
    await page.screenshot({ path: output + '/source-report-' + width + '.png' });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.locator('#discoveryProfileBtn').click();
  const group = page.locator('[data-profile-group=badges]');
  if (!(await group.evaluate((e) => e.open))) await group.locator('summary').click();
  const badge = page.locator('[data-explorer-badge="harbor-driver"]');
  await badge.scrollIntoViewIfNeeded();
  assert.match(await badge.innerText(), /Harbor Driver/);
  await page.screenshot({ path: output + '/harbor-driver.png' });
  report.storage = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      { canonicalFieldRecord: c } = await import('/app/js/campaign/field-study-contract.js'),
      s = ctx.discoveryProfileStore,
      clean = (v) => ({ ...v, exportedAt: 0, profile: { ...v.profile, updatedAt: 0 } }),
      first = await s.exportData();
    await s.importData(first);
    const before = await s.exportData(),
      bad = structuredClone(before);
    bad.profile.harborRun.continuations.jobs['return-case'].route.caseId = 'another-case';
    let rejected = false;
    try {
      await s.importData(bad);
    } catch {
      rejected = true;
    }
    const after = await s.exportData();
    return {
      same: c(clean(first)) === c(clean(before)),
      rejected,
      rollback: c(clean(before)) === c(clean(after)),
      reports: after.events.filter((e) => e.metadata?.pilotDeliveryReport).length,
    };
  });
  assert.deepEqual(report.storage, { same: true, rejected: true, rollback: true, reports: 1 });
  await qa.record(
    'Actual source Journal, named Harbor Driver badge and whole backup/corrupt custody rollback'
  );
  await qa.succeed();
} catch (error) {
  await qa.fail(error);
  throw error;
} finally {
  await qa.close();
}
