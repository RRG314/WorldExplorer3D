import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const output = `output/verification/hydrology-career-20261103/station-${Date.now()}`,
  qa = await createFieldworkQaSession({ output, careerId: 'hydrology', maximumDurationMs: 120000 }),
  { page, report } = qa;
const click = (name) => page.getByRole('button', { name, exact: true }).click();
async function layout(label, primary) {
  for (const [width, height] of [
    [1280, 800],
    [390, 844],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    const b = page.getByRole('button', { name: primary, exact: true });
    await b.scrollIntoViewIfNeeded();
    const r = await b.boundingBox();
    assert.ok(r.height >= 44 && r.y >= 0 && r.y + r.height <= height + 0.5);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false
    );
    await page.screenshot({ path: `${output}/${label}-${width}.png` });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}
async function release() {
  await click('Release floats and observe');
  await page.evaluate(() => hydroUi.open());
}
try {
  report.scope =
    'Actual native Hydrologist UI/domain/profile transaction/IndexedDB with controlled measurement/presence. Save failure keeps ready result, retry, A reload, form fields and three sizes; no source gameplay or physical instrument claim.';
  if (process.env.WE3D_HYDRO_NATIVE_RECOVERY) {
    const data = JSON.parse(await fs.readFile(process.env.WE3D_HYDRO_NATIVE_RECOVERY));
    await page.goto(
      (process.env.WE3D_PREVIEW_URL || 'http://127.0.0.1:4192') +
        '/tests/fixtures/discovery-save.html'
    );
    await page.waitForFunction(() => window.store);
    await page.evaluate((data) => store.importData(data), data);
    report.sourceNativePrefix = process.env.WE3D_HYDRO_NATIVE_RECOVERY;
  }
  await page.goto(
    (process.env.WE3D_PREVIEW_URL || 'http://127.0.0.1:4192') +
      '/tests/fixtures/hydrology-station.html'
  );
  await page.waitForFunction(() => window.ready);
  if (!process.env.WE3D_HYDRO_NATIVE_RECOVERY && !process.env.WE3D_HYDRO_NATIVE_SKIP_INITIAL_LAYOUT)
    await layout('trace', 'Release floats and observe');
  await release();
  await page
    .getByRole('combobox', { name: 'Observed float direction', exact: true })
    .selectOption('upstream-to-downstream');
  await page
    .getByRole('combobox', { name: 'Sampling positions', exact: true })
    .selectOption('dry-bank-a-and-b');
  await page.evaluate(() => (hydroUi.failNext = true));
  await click('Save reach and bank plan');
  await page.getByRole('status').filter({ hasText: 'Controlled native save failure' }).waitFor();
  assert.equal(await page.evaluate(() => hydroUi.window.ready), true);
  assert.equal(await page.evaluate(() => hydroUi.state.revision), 1);
  await click('Save reach and bank plan');
  await page.waitForFunction(() => hydroUi.state.active.phase === 'measure');
  async function measure() {
    await page.evaluate(() => hydroUi.open());
    await release();
    await page
      .getByRole('combobox', { name: 'Volume flow unit', exact: true })
      .selectOption('m3/s');
    await page
      .getByRole('combobox', { name: 'What does the optical reading measure?', exact: true })
      .selectOption('virtual-obstruction-not-calibrated-ntu');
    await click('Save matched station reading');
  }
  await measure();
  await page.waitForFunction(() => hydroUi.state.active.readingIndex === 1);
  await page.reload();
  await page.waitForFunction(() => window.ready);
  assert.ok(await page.evaluate(() => hydroUi.state.active.readings.baseline.a));
  await measure();
  await page.waitForFunction(() => hydroUi.state.active.phase === 'context');
  await page.evaluate(() => hydroUi.open());
  await page
    .getByRole('combobox', { name: 'What does the catchment model establish?', exact: true })
    .selectOption('authored-margins-not-a-source-test');
  await page
    .getByRole('combobox', { name: 'How do the archived gauge records apply?', exact: true })
    .selectOption('different-river-and-dates');
  await layout('context', 'Save catchment and dated context');
  await click('Save catchment and dated context');
  await page.waitForFunction(() => hydroUi.state.active.phase === 'declare');
  await page
    .getByRole('combobox', { name: 'Declared return condition', exact: true })
    .selectOption('higher-flow-return');
  await click('Declare virtual return');
  await page.waitForFunction(() => hydroUi.state.active.phase === 'revisit');
  await measure();
  await page.waitForFunction(() => hydroUi.state.active.readingIndex === 1);
  await measure();
  await page.waitForFunction(() => hydroUi.state.active.phase === 'report');
  await page.evaluate(() => hydroUi.open());
  await page
    .getByRole('combobox', { name: 'Paired flow evidence', exact: true })
    .selectOption('increased-at-both-stations');
  await page
    .getByRole('combobox', { name: 'What does this establish about the source?', exact: true })
    .selectOption('change-observed-source-unestablished');
  await page
    .getByRole('combobox', { name: 'Next investigation', exact: true })
    .selectOption('repeat-matched-stations-and-source-measurements');
  await layout('report', 'Save watershed plate');
  await click('Save watershed plate');
  await page.waitForFunction(() => hydroUi.state.active.phase === 'complete');
  await page.reload();
  await page.waitForFunction(() => window.ready);
  assert.equal(await page.evaluate(() => hydroUi.state.revision), 9);
  await page.locator('.hydrology-report > summary').click();
  await page.screenshot({ path: output + '/saved-watershed-plate.png' });
  report.storage = await page.evaluate(async () => {
    const data = await hydroUi.store.exportData();
    return {
      revision: data.profile.researchCareers.hydrology.revision,
      reports: data.events.filter((e) => e.metadata?.hydrologyReport).length,
    };
  });
  assert.equal(report.storage.reports, 1);
  await qa.succeed();
} catch (e) {
  try {
    report.nativeFailure = await page.evaluate(() => hydroUi.snapshot());
    const data = await page.evaluate(() => hydroUi.store.exportData());
    await fs.writeFile(output + '/qa-native-failed-backup.json', JSON.stringify(data), {
      mode: 0o600,
    });
  } catch {}
  await qa.fail(e);
  throw e;
} finally {
  await qa.close();
}
