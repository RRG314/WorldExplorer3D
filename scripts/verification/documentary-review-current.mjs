import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const source = process.env.WE3D_DOCUMENTARY_REVIEW;
if (!source) throw Error('Choose the genuine completed Documentary source checkpoint.');
const backup = JSON.parse(await fs.readFile(source)),
  base = backup.profile.threeViews,
  output = 'output/verification/documentary-career-20261103/review-' + Date.now(),
  qa = await createFieldworkQaSession({
    output,
    careerId: 'documentary',
    maximumDurationMs: 7 * 60 * 1000,
  }),
  { page, report } = qa;
assert.equal(base.story.phase, 'complete');
async function readStory(host, name) {
  await host.waitFor();
  if (!(await host.evaluate((e) => e.open))) await host.locator('summary').click();
  assert.equal(await host.locator('img').count(), 0, 'Journal does not eagerly load JPEGs');
  await host.locator('[data-documentary-photos]').click();
  await page.waitForFunction(
    (selector) => {
      const e = document.querySelector(selector);
      return (
        e?.querySelectorAll('img').length === 3 &&
        [...e.querySelectorAll('img')].every((i) => i.complete && i.naturalWidth > 100)
      );
    },
    name === 'title'
      ? '.journeyJournal .documentary-story-report'
      : '#discoveryJournalList .documentary-story-report'
  );
  assert.equal(await host.locator('img').count(), 3);
  await host.locator('img').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: output + '/' + name + '.png' });
}
try {
  report.scope =
    'Genuine completed Documentary source: both Journal readers and lazy original JPEGs, unchanged Activities revisit, three sizes, original badge, whole IndexedDB import and altered-photo rollback. No photography or accepted transaction matrix replay.';
  report.source = source;
  await page.goto('http://127.0.0.1:4192/app/?diagnostics=1');
  await page.evaluate(async (b) => {
    const { createIndexedDbDiscoveryProfileStore } = await import(
      '/app/js/discovery/profile-store.js?v=5'
    );
    await createIndexedDbDiscoveryProfileStore().importData(b);
  }, backup);
  if (!process.env.WE3D_DOCUMENTARY_REVIEW_ONLY_WORLD) {
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55'),
        { openJourneyJournal } = await import('/app/js/discovery/journey-journal.js');
      await openJourneyJournal(ctx);
    });
    const title = page.locator('.documentary-story-report');
    // The title Journal's DOM container is discovered from the actual mounted report.
    await title.waitFor();
    if (!(await title.evaluate((e) => e.open))) await title.locator('summary').click();
    assert.equal(await title.locator('img').count(), 0);
    await title.locator('[data-documentary-photos]').click();
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('.documentary-story-report img')].length === 3 &&
        [...document.querySelectorAll('.documentary-story-report img')].every(
          (i) => i.complete && i.naturalWidth > 100
        )
    );
    await title.locator('img').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: output + '/title-journal.png' });
    report.titleJournalOriginals = true;
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55'),
        { closeJourneyJournal } = await import('/app/js/discovery/journey-journal.js');
      closeJourneyJournal(ctx);
    });
  } else report.reusedTitleAndRevisit = 'review-1793745828138/failed.json';
  await page.getByRole('button', { name: '⌖ Activities', exact: true }).click();
  await page.locator('[data-experience-id="career:documentary-explorer"]').click();
  await page.locator('[data-experience-variant]').selectOption('field-story');
  await page.locator('[data-experience-begin]').click();
  await qa.waitForCareer('field-story');
  if (!process.env.WE3D_DOCUMENTARY_REVIEW_ONLY_WORLD) {
    assert.deepEqual(
      await page.evaluate(async () => {
        const { ctx } = await import('/app/js/shared-context.js?v=55');
        return (await ctx.discoveryProfileStore.getProfile()).threeViews;
      }),
      base
    );
    await qa.record(
      'Completed story opens original photographs, captions, receipt and revision unchanged'
    );
  }
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.openWorldDiscoverySection('journal');
  });
  const plate = page.locator('#discoveryJournalList .documentary-story-report');
  await plate.locator('[data-documentary-photos]:not([hidden])').waitFor({ state: 'attached' });
  await readStory(plate, 'world');
  for (const [width, height] of [
    [1280, 800],
    [390, 844],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await plate.locator('img').first().scrollIntoViewIfNeeded();
    assert.equal(await plate.evaluate((e) => e.scrollWidth > e.clientWidth + 1), false);
    await page.screenshot({ path: output + '/source-story-' + width + '.png' });
  }
  report.worldJournalOriginals = true;
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.locator('#discoveryProfileBtn').click();
  const group = page.locator('[data-profile-group=badges]');
  if (!(await group.evaluate((e) => e.open))) await group.locator('summary').click();
  const badge = page.locator('[data-explorer-badge="three-view-explorer"]');
  await badge.scrollIntoViewIfNeeded();
  await page.screenshot({ path: output + '/original-badge.png' });
  report.storage = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      { canonicalFieldRecord: c } = await import('/app/js/campaign/field-study-contract.js'),
      s = ctx.discoveryProfileStore,
      clean = (v) => ({ ...v, exportedAt: 0, profile: { ...v.profile, updatedAt: 0 } }),
      first = await s.exportData();
    await s.importData(first);
    const before = await s.exportData(),
      bad = structuredClone(before);
    const album = bad.albums.find((a) =>
      a.photos?.some((p) => p.id === before.profile.threeViews.story.source.photographs[0].id)
    );
    album.photos[0].dataUrl = album.photos[1].dataUrl;
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
      reports: after.events.filter((e) => e.metadata?.documentaryStoryReport).length,
    };
  });
  assert.deepEqual(report.storage, { same: true, rejected: true, rollback: true, reports: 1 });
  await qa.record(
    'Both original-photo Journal readers, original badge and whole backup/corrupt-image rollback'
  );
  await qa.succeed();
} catch (error) {
  await qa.fail(error);
  throw error;
} finally {
  await qa.close();
}
