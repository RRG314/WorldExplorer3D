import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
import { bindOceanQaState, oceanQaState } from './oceanography-qa-driver.mjs';
const source = path.resolve(process.env.WE3D_OCEAN_BACKUP || '');
assert.ok(
  source.startsWith(path.resolve('output/verification/oceanography-career-20261102') + path.sep)
);
const bytes = await fs.readFile(source),
  data = JSON.parse(bytes);
assert.equal(Object.keys(data.profile.researchCareers.oceanography.completed).length, 3);
const output = `output/verification/oceanography-career-20261102/review-${Date.now()}`,
  qa = await createFieldworkQaSession({
    output,
    careerId: 'oceanography',
    maximumDurationMs: 240000,
  }),
  { page, report } = qa;
try {
  report.scope =
    'Affected Journal/Profile, actual source-history backup/restore and completed-vessel revisit only. All completed casts/navigation/inspection/report procedures are reused.';
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
    await store.importData(first);
    const second = await store.exportData();
    if (JSON.stringify(second.events) !== JSON.stringify(first.events))
      throw Error('Source history changed on restore');
    const corrupt = structuredClone(second),
      cast = corrupt.events.find((e) => e.metadata?.action?.type === 'cast');
    cast.metadata.action.cast.samples[0].temperatureC = 99;
    let rejected = false;
    try {
      await store.importData(corrupt);
    } catch {
      rejected = true;
    }
    if (!rejected) throw Error('Altered raw profile admitted');
    const after = await store.exportData();
    if (JSON.stringify(after.events) !== JSON.stringify(second.events))
      throw Error('Rejected import changed accepted history');
    const records = Object.values(after.profile.researchCareers.oceanography.records);
    return {
      completed: records.length,
      reports: after.events.filter((e) => e.metadata?.oceanographyReport).length,
      rawSamples: records.reduce(
        (n, r) => n + Object.values(r.casts).reduce((n, c) => n + c.samples.length, 0),
        0
      ),
      rejectedAlteredRaw: true,
      unchangedHistory: true,
    };
  }, data);
  assert.equal(report.storage.reports, 3);
  assert.equal(report.storage.rawSamples, 18);
  await page.locator('#globeSelectorStartBtn').click();
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    window.__qaOceanReviewReady = () =>
      ctx.gameStarted && !ctx.worldLoading && !!ctx.worldDiscoveryRuntime;
  });
  await page.waitForFunction(() => window.__qaOceanReviewReady(), {}, { timeout: 180000 });
  await bindOceanQaState(page);
  assert.equal(
    (await oceanQaState(page)).survey.visible,
    false,
    'Ordinary Explore does not activate a completed vessel survey'
  );
  await page.locator('#exploreBtn').click();
  await page.locator('#fWorldDiscovery').click();
  await page.locator('[data-discovery-tab=journal]').click();
  await page.waitForFunction(
    () => document.querySelectorAll('#discoveryJournalList .oceanography-report').length === 3
  );
  const plates = page.locator('#discoveryJournalList .oceanography-report');
  report.plates = [];
  for (let i = 0; i < 3; i++) {
    const plate = plates.nth(i);
    await plate.locator(':scope > summary').click();
    assert.equal(await plate.locator('tbody tr').count(), 6);
    assert.equal(await plate.locator('.ocean-profile-chart').count(), 2);
    assert.equal(await plate.locator('.ocean-transect-chart').count(), 1);
    await plate.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/transect-${i}.png` });
    report.plates.push(await plate.innerText());
  }
  await page.locator('#discoveryProfileBtn').click();
  const badge = page.locator('[data-explorer-badge=paired-ocean-survey]');
  await badge.waitFor({ state: 'attached' });
  const group = page.locator('[data-profile-group=badges]');
  if (!(await group.evaluate((el) => el.open))) await group.locator('summary').click();
  await badge.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/ocean-survey-badge.png` });
  await page.locator('#discoveryCloseBtn').click();
  await page.locator('#exploreBtn').click();
  await page.locator('#fWorldDiscovery').click();
  await page.locator('#sandboxNearbyActivities').click();
  await page.getByRole('tab', { name: 'Careers', exact: true }).click();
  await page.locator('[data-experience-id="career:oceanographer"]').click();
  await page.locator('[data-experience-variant]').selectOption('campaign');
  await page.getByRole('button', { name: 'Review saved transect', exact: true }).waitFor();
  await page.locator('[data-experience-begin]').click();
  await page.waitForFunction(
    () =>
      window.__qaOcean().survey.phase === 'complete' &&
      window.__qaOcean().survey.visible &&
      !window.__qaOcean().loading,
    {},
    { timeout: 120000 }
  );
  report.revisit = await oceanQaState(page);
  assert.equal(
    report.revisit.voyage.id,
    data.profile.researchCareers.oceanography.records.campaign.voyage.id
  );
  const after = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    return ctx.discoveryProfileStore.exportData();
  });
  assert.equal(after.events.filter((e) => e.metadata?.oceanographyReport).length, 3);
  await fs.writeFile(output + '/qa-fieldwork-backup.json', JSON.stringify(after), { mode: 0o600 });
  await page.screenshot({ path: output + '/completed-vessel-revisited.png' });
  // Only the late action emphasis needs this controlled rendering check.
  // The accepted three-size geometry and real CTD procedures are not repeated.
  await page.goto(
    (process.env.WE3D_PREVIEW_URL || 'http://127.0.0.1:4192') +
      '/tests/fixtures/oceanography-station.html'
  );
  await page.waitForFunction(() => window.oceanUi);
  await page.evaluate(async () => {
    const { createOceanographyControls } = await import('/app/js/campaign/oceanography-ui.js');
    const controls = createOceanographyControls({ api: () => ({}), prefix: 'colour-only' });
    document.querySelector('#deck').replaceChildren(controls.node);
    controls.render({
      visible: true,
      ready: true,
      phase: 'casts',
      study: { label: 'Recovered instrument' },
      active: { runId: 'colour-only', stationIndex: 1, pings: [], casts: {} },
      cast: { ready: true, activeSeconds: 10.2, depthMeters: -3.28, reason: 'Recovered' },
    });
  });
  const primary = page.getByRole('button', { name: 'File recovered cast', exact: true });
  await primary.scrollIntoViewIfNeeded();
  report.primaryAppearance = await primary.evaluate((el) => {
    const css = getComputedStyle(el);
    return {
      background: css.backgroundColor,
      text: css.color,
      primary: el.classList.contains('research-primary'),
    };
  });
  assert.equal(report.primaryAppearance.primary, true);
  assert.equal(report.primaryAppearance.background, 'rgb(239, 208, 121)');
  assert.equal(report.primaryAppearance.text, 'rgb(21, 37, 27)');
  await page.screenshot({ path: output + '/controlled-recovered-action-colour.png' });
  assert.deepEqual(report.errors, []);
  report.ok = true;
  await fs.writeFile(output + '/receipt.json', JSON.stringify(report, null, 2));
  console.log('PASS ' + output);
} catch (e) {
  await qa.fail(e);
  throw e;
} finally {
  await qa.close();
}
