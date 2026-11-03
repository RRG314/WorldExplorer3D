import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const source = path.resolve(process.env.WE3D_ACCELERATOR_RECOVERY || '');
assert.match(
  source,
  /accelerator-career-20261103\/(?:world|review)-\d+\/qa-fieldwork-(?:failed-)?backup\.json$/
);
const data = JSON.parse(await fs.readFile(source));
assert.equal(Object.keys(data.profile.researchCareers.accelerator.completed).length, 3);
const output = 'output/verification/accelerator-career-20261103/review-' + Date.now(),
  qa = await createFieldworkQaSession({
    output,
    careerId: 'accelerator',
    maximumDurationMs: 420000,
    walkLegMaximumDurationMs: 35000,
  }),
  { page, report } = qa;
let datasetRequests = 0;
page.context().on('request', (r) => {
  if (r.url().includes('/app/assets/data/cms/dimuon-2010b.json')) datasetRequests++;
});
async function focus() {
  await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55');
    ctx.renderer.domElement.focus({ preventScroll: true });
  });
}
async function local(x, z) {
  await focus();
  const p = await page.evaluate(
    async (p) => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return ctx.activeInterior.cern.visit.plan.world(p);
    },
    { x, z }
  );
  await qa.walkTo(p, 0.32);
}
const sizes = [
  [1280, 800],
  [390, 844],
  [844, 390],
];
try {
  report.scope =
    'Actual source completed notebook revisit through Activities, normal Travel/entry/lift/walking, actual Journal/Profile/IndexedDB backup and current report layout. No accepted numerical method, clock, earlier venue or career procedure replay.';
  report.source = source;
  await page.goto(
    'http://127.0.0.1:4192/app/?lat=46.30964505736434&lon=6.0773132221366835&name=CMS%20Point%205&diagnostics=1'
  );
  await page.evaluate(async (data) => {
    const { createIndexedDbDiscoveryProfileStore } = await import(
      '/app/js/discovery/profile-store.js?v=5'
    );
    await createIndexedDbDiscoveryProfileStore().importData(data);
  }, data);
  if (!process.env.WE3D_ACCELERATOR_REVIEW_ONLY) {
    await page.getByRole('button', { name: '⌖ Activities', exact: true }).click();
    await page.locator('[data-experience-id="career:accelerator-scientist"]').click();
    await page.locator('[data-experience-variant]').selectOption('campaign');
    await page.locator('[data-experience-begin]').click();
    await qa.waitForCareer('campaign');
    assert.deepEqual(
      (await qa.careerState()).active.report,
      data.profile.researchCareers.accelerator.records.campaign.report
    );
    const p = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      const b = ctx.buildings.find(
          (b) => b.sourceBuildingId === 'overture:a50c684e-b954-470b-a365-71db93925c35'
        ),
        e = ctx.resolveBuildingEntrySupport(b, { allowSynthetic: false }).exteriorEntrance;
      return { x: e.approachX, z: e.approachZ };
    });
    await focus();
    await qa.walkTo(p, 0.4);
    assert.equal(
      await page.evaluate(async () => {
        const { ctx } = await import('/app/js/shared-context.js?v=55');
        return ctx.handleInteriorAction();
      }),
      true
    );
    await local(0, -21);
    assert.equal(
      await page.evaluate(async () => {
        const { ctx } = await import('/app/js/shared-context.js?v=55');
        return ctx.handleInteriorAction();
      }),
      true
    );
    await page.locator('[data-elevator-level="0"]').click();
    await local(-11, -21);
    await local(-11, 14);
    await local(-10, 14);
    await local(-10, 20.8);
    await local(7, 20.8);
    await page.locator('[data-research-station]').click();
    await page.locator('.accelerator-report[open]').waitFor();
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      assert.equal(
        await page.locator('.research-station').evaluate((d) => d.scrollWidth > d.clientWidth + 1),
        false
      );
      await page.screenshot({ path: output + '/completed-revisit-' + width + '.png' });
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.keyboard.press('Escape');
    const capstones = await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      return (await ctx.discoveryProfileStore.exportData()).events.filter(
        (e) => e.metadata?.acceleratorReport
      ).length;
    });
    assert.equal(capstones, 3);
    await qa.record(
      'Completed Activities retains original campaign notebook and adds no capstone or dataset fetch'
    );
    assert.equal(datasetRequests, 0);
    await page.locator('[data-research-pause]').click();
  } else {
    report.scope =
      'Only the failed actual Earth Journal report projection and new backup boundary, using the retained genuine completed-visit checkpoint. Accepted Activities revisit, facility traversal and all science methods stay closed.';
    await page.getByRole('button', { name: 'Explore', exact: true }).click();
    await page.evaluate(async () => {
      const { ctx } = await import('/app/js/shared-context.js?v=55');
      window.reviewWorldReady = () =>
        ctx.gameStarted && !ctx.worldLoading && !!ctx.worldPublication?.requestId;
    });
    await page.waitForFunction(() => reviewWorldReady(), undefined, { timeout: 180000 });
  }
  await page.locator('#exploreBtn').click();
  await page.locator('#fWorldDiscovery').click();
  await page.locator('[data-discovery-tab=journal]').click();
  await page.waitForFunction(
    () => document.querySelectorAll('#discoveryJournalList .accelerator-report').length === 3
  );
  report.reports = [];
  for (let i = 0; i < 3; i++) {
    const plate = page.locator('#discoveryJournalList .accelerator-report').nth(i);
    await plate.locator(':scope > summary').click();
    await plate.getByText('Original recorded four-vectors · GeV', { exact: true }).first().click();
    const text = await plate.innerText();
    assert.doesNotMatch(text, /undefined|NaN|Infinity/);
    assert.match(text, /recorded|Recorded/);
    assert.equal(await plate.locator('svg').count(), 3);
    report.reports.push(text);
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      const table = plate.locator('table').first();
      await table.scrollIntoViewIfNeeded();
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
        false
      );
      assert.ok(await table.evaluate((t) => t.getBoundingClientRect().right <= innerWidth + 1));
      await page.screenshot({ path: output + '/report-' + i + '-vectors-' + width + '.png' });
      await plate.locator('svg').last().scrollIntoViewIfNeeded();
      await page.screenshot({ path: output + '/report-' + i + '-population-' + width + '.png' });
    }
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.locator('#discoveryProfileBtn').click();
  const group = page.locator('[data-profile-group=badges]'),
    badge = page.locator('[data-explorer-badge=collision-lab]');
  await badge.waitFor({ state: 'attached' });
  if (!(await group.evaluate((el) => el.open))) await group.locator('summary').click();
  await badge.scrollIntoViewIfNeeded();
  assert.match(await badge.innerText(), /Collision Lab/);
  await page.screenshot({ path: output + '/collision-lab-badge.png' });
  report.storage = await page.evaluate(async () => {
    const { ctx } = await import('/app/js/shared-context.js?v=55'),
      { canonicalFieldRecord: c } = await import('/app/js/campaign/field-study-contract.js'),
      store = ctx.discoveryProfileStore,
      first = await store.exportData();
    await store.importData(first);
    const second = await store.exportData(),
      normal = (v) => ({ ...v, exportedAt: 0, profile: { ...v.profile, updatedAt: 0 } }),
      bad = structuredClone(second),
      event = bad.events.find(
        (e) =>
          e.metadata?.careerId === 'accelerator' &&
          e.metadata.action?.measurement?.experiment.method === 'mass'
      );
    event.metadata.action.measurement.experiment.readings.muons[0].px += 0.1;
    let rejected = false;
    try {
      await store.importData(bad);
    } catch {
      rejected = true;
    }
    const after = await store.exportData();
    return {
      same: c(normal(first)) === c(normal(second)),
      rejected,
      rollback: c({ ...second, exportedAt: 0 }) === c({ ...after, exportedAt: 0 }),
      reports: after.events.filter((e) => e.metadata?.acceleratorReport).length,
    };
  });
  assert.deepEqual(report.storage, { same: true, rejected: true, rollback: true, reports: 3 });
  await qa.record(
    'Three actual Journal reports, Profile badge, whole backup roundtrip and altered raw event rejection preserve the current data'
  );
  report.datasetRequests = datasetRequests;
  await qa.succeed();
} catch (error) {
  await qa.fail(error);
  throw error;
} finally {
  await qa.close();
}
