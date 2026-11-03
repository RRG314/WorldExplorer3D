import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createFieldworkQaSession } from './fieldwork-qa-session.mjs';
const output = `output/verification/marine-biology-career-20261102/station-${Date.now()}`,
  qa = await createFieldworkQaSession({
    output,
    careerId: 'marine-biology',
    maximumDurationMs: 120000,
  }),
  { page, report } = qa;
const click = (name) => page.getByRole('button', { name, exact: true }).click();
async function layout(name, label) {
  for (const [width, height] of [
    [1280, 800],
    [390, 844],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    const b = page.getByRole('button', { name, exact: true });
    await b.scrollIntoViewIfNeeded();
    const box = await b.boundingBox(),
      footer = await page.locator('.hudUtilityActions').boundingBox();
    assert.ok(box.height >= 44 && box.y >= 0 && box.y + box.height <= footer.y + 0.5);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false
    );
    await page.screenshot({ path: `${output}/${label}-${width}.png` });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
}
async function window() {
  await click('Begin observation window');
  await page.evaluate(() => advanceTime(8500));
  assert.equal(await page.evaluate(() => marineUi.state.window.ready), true);
}
try {
  report.scope =
    'One real Marine biologist runtime/domain sequence in native HUD/actual IndexedDB with controlled clock/observer/animal measurements; hidden duplicate owner, save failure/retry/reload, focus and three-size primary access. No actual field procedure or wildlife appearance claim.';
  await page.goto(
    (process.env.WE3D_PREVIEW_URL || 'http://127.0.0.1:4192') +
      '/tests/fixtures/marine-biology-station.html'
  );
  await page.waitForFunction(() => window.ready);
  await layout('Begin marine study', 'briefing');
  await click('Begin marine study');
  await page.waitForFunction(() => marineUi.state.phase === 'surface');
  await window();
  await page.evaluate(() => (marineUi.failNextSave = true));
  await click('File observed individuals');
  await page.getByRole('status').filter({ hasText: 'Controlled save failure' }).waitFor();
  assert.equal(await page.evaluate(() => marineUi.state.window.ready), true);
  assert.equal(await page.evaluate(() => marineUi.state.phase), 'surface');
  await click('File observed individuals');
  await page.waitForFunction(() => marineUi.state.phase === 'habitat');
  await page.reload();
  await page.waitForFunction(() => window.ready);
  assert.equal(await page.evaluate(() => marineUi.state.active.surface.observations.length), 1);
  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => marineUi.target());
    await window();
    await click('File observed individuals');
    await page.waitForFunction((i) => marineUi.state.active.habitats.length === i + 1, i);
  }
  await page.evaluate(() => marineUi.target());
  await click('Refresh visible individuals');
  const individual = page.getByRole('combobox', { name: 'Visible individual', exact: true });
  const id = await individual.locator('option').nth(1).getAttribute('value');
  await individual.selectOption(id);
  await page.waitForFunction(() => !!marineUi.state.selectedIndividualId);
  assert.equal(await individual.evaluate((el) => el === document.activeElement), true);
  await window();
  await page
    .getByRole('combobox', { name: 'Visible movement', exact: true })
    .selectOption('swam-through-view');
  await page
    .getByRole('combobox', { name: 'What does the sequence establish?', exact: true })
    .selectOption('observed-motion-not-feeding-or-intent');
  await click('File behavior sequence');
  await page.waitForFunction(() => marineUi.state.phase === 'comparison');
  await page.evaluate(() => marineUi.boardLab());
  await layout('Save habitat comparison', 'comparison');
  const result = await page.evaluate(() => marineUi.state.comparison.result);
  await page
    .getByRole('combobox', { name: 'What do these records show?', exact: true })
    .selectOption(result);
  await page
    .getByRole('combobox', { name: 'Limit on the habitat comparison', exact: true })
    .selectOption('individual-records-not-population-or-cause');
  await page
    .getByRole('combobox', { name: 'Current context', exact: true })
    .selectOption('no-local-current-measurement');
  await click('Save habitat comparison');
  await page.waitForFunction(() => marineUi.state.phase === 'report');
  await layout('Save marine habitat plate', 'report');
  await page
    .getByRole('combobox', { name: 'Follow-up habitat', exact: true })
    .selectOption('upper-pelagic');
  await page
    .getByRole('combobox', { name: 'Follow-up method', exact: true })
    .selectOption('repeat-matched-effort-other-time');
  await click('Save marine habitat plate');
  await page.waitForFunction(() => marineUi.state.phase === 'complete');
  await page.reload();
  await page.waitForFunction(() => window.ready);
  assert.equal(await page.evaluate(() => marineUi.state.phase), 'complete');
  report.storage = await page.evaluate(async () => {
    const data = await marineUi.store.exportData();
    return {
      revision: data.profile.researchCareers['marine-biology'].revision,
      reports: data.events.filter((e) => e.metadata?.marineBiologyReport).length,
      phase: marineUi.state.phase,
    };
  });
  assert.equal(report.storage.reports, 1);
  assert.equal(report.storage.revision, 7);
  await page.screenshot({ path: output + '/saved-plate.png' });
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
