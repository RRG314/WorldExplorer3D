import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const source = path.resolve(process.env.WE3D_MARINE_BACKUP || '');
assert.ok(
  source.startsWith(path.resolve('output/verification/marine-biology-career-20261102') + path.sep)
);
const bytes = await fs.readFile(source),
  data = JSON.parse(bytes);
assert.equal(Object.keys(data.profile.researchCareers['marine-biology'].completed).length, 3);
const output = `output/verification/marine-biology-career-20261102/review-${Date.now()}`,
  qa = await createFieldworkQaSession({
    output,
    careerId: 'marine-biology',
    maximumDurationMs: 240000,
  }),
  { page, report } = qa;
try {
  report.scope =
    'Affected actual-source Marine Journal/Profile, three-case backup/rollback/reload and exact completed station/vessel revisit only. All accepted observation procedures reused.';
  report.source = { path: source, sha256: createHash('sha256').update(bytes).digest('hex') };
  await page.goto(
    (process.env.WE3D_PREVIEW_URL || 'http://127.0.0.1:4192') +
      '/app/?lat=39.3173&lon=-76.64044&name=Druid%20Hill%20Park&diagnostics=1'
  );
  if (process.env.WE3D_MARINE_STORAGE_RECEIPT) {
    const evidence = JSON.parse(await fs.readFile(process.env.WE3D_MARINE_STORAGE_RECEIPT));
    assert.equal(evidence.source.sha256, report.source.sha256);
    assert.deepEqual(
      [
        evidence.storage.same,
        evidence.storage.rejected,
        evidence.storage.rollback,
        evidence.storage.reports,
      ],
      [true, true, true, 3]
    );
    report.storage = evidence.storage;
    report.storageReusedFrom = process.env.WE3D_MARINE_STORAGE_RECEIPT;
    await page.evaluate(async (data) => {
      const { createIndexedDbDiscoveryProfileStore } = await import(
        '/app/js/discovery/profile-store.js?v=5'
      );
      await createIndexedDbDiscoveryProfileStore().importData(data);
    }, data);
  } else {
    report.storage = await page.evaluate(async (data) => {
      const { createIndexedDbDiscoveryProfileStore } = await import(
          '/app/js/discovery/profile-store.js?v=5'
        ),
        store = createIndexedDbDiscoveryProfileStore();
      await store.importData(data);
      const first = await store.exportData();
      await store.importData(first);
      const second = await store.exportData(),
        bad = structuredClone(second);
      bad.events.find(
        (e) =>
          e.sourceSystem === 'research-careers' &&
          e.metadata?.careerId === 'marine-biology' &&
          e.metadata?.action?.window
      ).metadata.action.window.activeSeconds += 1;
      let rejected = false;
      try {
        await store.importData(bad);
      } catch {
        rejected = true;
      }
      const after = await store.exportData();
      const payload = (value, { profileTime = false } = {}) => ({
        ...value,
        exportedAt: 0,
        ...(profileTime ? { profile: { ...value.profile, updatedAt: 0 } } : {}),
      });
      return {
        same:
          JSON.stringify(payload(first, { profileTime: true })) ===
          JSON.stringify(payload(second, { profileTime: true })),
        rejected,
        rollback: JSON.stringify(payload(second)) === JSON.stringify(payload(after)),
        state: second.profile.researchCareers['marine-biology'],
        reports: second.events.filter((e) => e.metadata?.marineBiologyReport).length,
      };
    }, data);
    assert.equal(report.storage.same, true);
    assert.equal(report.storage.rejected, true);
    assert.equal(report.storage.rollback, true);
    assert.equal(report.storage.reports, 3);
  }
  await page.locator('[data-globe-destination="journal"]').click();
  await page.waitForFunction(
    () => document.querySelectorAll('#discoveryJournalList .marine-biology-report').length === 3
  );
  report.journeyOceanPlates = await page
    .locator('#discoveryJournalList .oceanography-report')
    .count();
  assert.equal(report.journeyOceanPlates, 3);
  const plates = page.locator('#discoveryJournalList .marine-biology-report');
  report.plates = [];
  for (let i = 0; i < 3; i++) {
    const p = plates.nth(i);
    await p.locator(':scope > summary').click();
    assert.equal(await p.locator('svg.marine-observation-chart').count(), 2);
    report.plates.push(await p.innerText());
    for (const [width, height] of [
      [1280, 800],
      [390, 844],
      [844, 390],
    ]) {
      await page.setViewportSize({ width, height });
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false
      );
      for (let chart = 0; chart < 2; chart++) {
        await p.locator('svg').nth(chart).scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${output}/plate-${i}-${width}-${chart}.png` });
      }
    }
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.locator('#discoveryCloseBtn').click();
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    window.__qaMarineReview = () => ({
      ready:
        ctx.gameStarted &&
        !ctx.worldLoading &&
        !!ctx.worldDiscoveryRuntime &&
        !!ctx.worldPublication?.requestId &&
        !document.querySelector('#loading')?.classList.contains('show'),
      loading: ctx.worldLoading,
      study: ctx.marineResearch?.marineBiology.snapshot(),
      voyage: ctx.oceanVoyage?.current,
    });
  });
  await page.waitForFunction(() => window.__qaMarineReview().ready, {}, { timeout: 180000 });
  assert.equal(
    await page.evaluate(() => window.__qaMarineReview().study.visible),
    false,
    'Ordinary Explore never activates a saved marine study'
  );
  await page.locator('#exploreBtn').click();
  await page.locator('#fWorldDiscovery').click();
  await page.locator('[data-discovery-tab=journal]').click();
  await page.waitForFunction(
    () => document.querySelectorAll('#discoveryJournalList .marine-biology-report').length === 3
  );
  await page.locator('#discoveryProfileBtn').click();
  const badge = page.locator('[data-explorer-badge=marine-observer]');
  await badge.waitFor({ state: 'attached' });
  const group = page.locator('[data-profile-group=badges]');
  if (!(await group.evaluate((el) => el.open))) await group.locator('summary').click();
  await badge.scrollIntoViewIfNeeded();
  await page.screenshot({ path: output + '/marine-observer-badge.png' });
  await page.locator('#discoveryCloseBtn').click();
  await page.locator('#exploreBtn').click();
  await page.locator('#fWorldDiscovery').click();
  await page.locator('#discoveryCloseBtn').click();
  await page.locator('#exploreBtn').click();
  await page.locator('#fActivities').click();
  await page.getByRole('tab', { name: 'Careers', exact: true }).click();
  await page.locator('[data-experience-id="career:marine-biologist"]').click();
  await page.locator('[data-experience-variant]').selectOption('campaign');
  await page.locator('[data-experience-begin]').click();
  await page.waitForFunction(
    () =>
      window.__qaMarineReview().study.phase === 'complete' &&
      window.__qaMarineReview().study.visible &&
      !window.__qaMarineReview().loading,
    {},
    { timeout: 120000 }
  );
  report.revisit = await page.evaluate(() => window.__qaMarineReview());
  assert.equal(
    report.revisit.voyage.id,
    data.profile.researchCareers['marine-biology'].records.campaign.voyage.id
  );
  const after = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.discoveryProfileStore.exportData();
  });
  assert.equal(after.events.filter((e) => e.metadata?.marineBiologyReport).length, 3);
  assert.deepEqual(
    after.profile.researchCareers['marine-biology'].active.habitats,
    data.profile.researchCareers['marine-biology'].records.campaign.habitats
  );
  await fs.writeFile(output + '/qa-fieldwork-backup.json', JSON.stringify(after), { mode: 0o600 });
  await page.screenshot({ path: output + '/original-stations-revisited.png' });
  // Changed follow graph/form only; reuse the real source sequence without replaying it.
  await page.goto(
    (process.env.WE3D_PREVIEW_URL || 'http://127.0.0.1:4192') +
      '/tests/fixtures/marine-biology-station.html'
  );
  await page.waitForFunction(() => window.ready);
  await page.evaluate(async (raw) => {
    const { createMarineBiologyControls } = await import('/app/js/campaign/marine-biology-ui.js'),
      { MARINE_BIOLOGY_STUDIES } = await import('/app/js/campaign/marine-biology-career.js');
    const controls = createMarineBiologyControls({
      prefix: 'source-follow-display',
      api: () => ({}),
    });
    document.querySelector('#deck').replaceChildren(controls.node);
    controls.render({
      visible: true,
      ready: true,
      underwater: true,
      instrumentAvailable: true,
      phase: 'follow',
      study: MARINE_BIOLOGY_STUDIES.campaign,
      active: raw,
      window: raw.follow,
      busy: false,
    });
  }, data.profile.researchCareers['marine-biology'].records.campaign);
  report.changedFollowDisplay = [];
  for (const [width, height] of [
    [1280, 800],
    [390, 844],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    const b = page.getByRole('button', { name: 'File behavior sequence', exact: true });
    await b.scrollIntoViewIfNeeded();
    const box = await b.boundingBox(),
      footer = await page.locator('.hudUtilityActions').boundingBox();
    assert.ok(box.height >= 44 && box.y >= 0 && box.y + box.height <= footer.y + 0.5);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false
    );
    report.changedFollowDisplay.push({ width, height, primary: box });
    await page.screenshot({ path: `${output}/source-follow-form-${width}.png` });
  }
  await qa.succeed();
} catch (e) {
  await qa.fail(e);
  throw e;
} finally {
  await qa.close();
}
