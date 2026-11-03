import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const output = `output/verification/oceanography-career-20261102/station-${Date.now()}`,
  qa = await createFieldworkQaSession({
    output,
    careerId: 'oceanography',
    maximumDurationMs: 120000
  }),
  { page, report } = qa;
async function click(name) {
  await page.getByRole('button', { name, exact: true }).click();
}
async function layout(label, name) {
  for (const [width, height] of [
    [1280, 800],
    [390, 844],
    [844, 390]
  ]) {
    await page.setViewportSize({ width, height });
    const b = page.getByRole('button', { name, exact: true });
    await b.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    const box = await b.boundingBox(),
      footer = await page.locator('.hudUtilityActions').boundingBox();
    assert.ok(box.height >= 44 && box.y >= 0 && box.y + box.height <= height);
    assert.ok(box.y + box.height <= footer.y + 0.5, `${label} above sticky controls at${width}`);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false
    );
    await page.screenshot({ path: `${output}/${label}-${width}.png` });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}
try {
  report.scope =
    'Native forms in actual HUD lane with hidden underwater twin, controlled measurements/presence and actual IndexedDB. Complete one fixture case to verify selectors, save/failure/reload, charts and three-size primary access; not a source voyage or repeated physical navigation.';
  await page.goto(
    (process.env.WE3D_PREVIEW_URL || 'http://127.0.0.1:4192') +
      '/tests/fixtures/oceanography-station.html'
  );
  await page.waitForFunction(() => window.oceanUi);
  await click('Review both station charts');
  const protocol = page.getByRole('combobox', { name: 'Matched downcast protocol', exact: true });
  assert.equal(await protocol.count(), 1);
  await protocol.selectOption('virtual-ctd-three-depths-v1');
  await layout('plan', 'Accept two-station survey');
  await click('Accept two-station survey');
  await page.waitForFunction(() => oceanUi.state.revision === 1);
  await click('Begin downcast');
  await page.evaluate(() => {
    oceanUi.failNextSave = true;
  });
  await click('File recovered cast');
  await page.getByRole('status').filter({ hasText: 'could not save' }).waitFor();
  assert.equal(await page.evaluate(() => oceanUi.state.revision), 1);
  assert.equal(await page.evaluate(() => oceanUi.cast.ready), true);
  await click('File recovered cast');
  await page.waitForFunction(() => oceanUi.state.revision === 2);
  await page.reload();
  await page.waitForFunction(() => window.oceanUi);
  assert.equal(await page.evaluate(() => oceanUi.state.active.stationIndex), 1);
  await click('Begin downcast');
  await click('File recovered cast');
  await page.waitForFunction(() => oceanUi.state.active.phase === 'mapping');
  for (let i = 0; i < 3; i++) {
    await click('Record geometry return');
    await page.waitForFunction((i) => oceanUi.state.active.pings.length === i + 1, i);
  }
  await page
    .getByRole('combobox', { name: 'Mapped dive target', exact: true })
    .selectOption('habitat');
  await page
    .getByRole('combobox', { name: 'What does the return establish?', exact: true })
    .selectOption('return-shape-not-identification');
  await click('Choose inspection target');
  await page
    .getByRole('combobox', { name: 'Visible structure', exact: true })
    .selectOption('branching-colonies-on-rock');
  await click('Record direct submersible view');
  await click('Record approach to this vessel');
  await page
    .getByRole('combobox', { name: 'Supported water-column result', exact: true })
    .waitFor();
  await layout('report', 'Save annotated transect');
  for (const [label, value] of [
    ['Supported water-column result', 'temperature-contrast-with-depth'],
    ['Limit on this comparison', 'two-simulated-profiles-not-a-regional-water-mass'],
    ['Relationship to the inspected feature', 'virtual-feature-not-a-regional-cause'],
    ['Useful follow-up', 'repeat-matched-profiles-other-time']
  ])
    await page.getByRole('combobox', { name: label, exact: true }).selectOption(value);
  await click('Save annotated transect');
  await page.waitForFunction(() => oceanUi.state.active.phase === 'complete');
  await page.reload();
  await page.waitForFunction(() => oceanUi?.state.active?.phase === 'complete');
  report.data = await page.evaluate(async () => {
    const d = await oceanUi.store.exportData();
    return {
      reports: d.events.filter((e) => e.metadata?.oceanographyReport).length,
      phase: d.profile.researchCareers.oceanography.active.phase
    };
  });
  assert.equal(report.data.reports, 1);
  await page.screenshot({ path: output + '/saved-profiles.png' });
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
